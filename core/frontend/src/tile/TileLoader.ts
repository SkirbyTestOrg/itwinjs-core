/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tile
 */

import {
  assert,
  ByteStream,
} from "@bentley/bentleyjs-core";
import {
  Point3d,
  Transform,
} from "@bentley/geometry-core";
import {
  BatchType,
  CompositeTileHeader,
  RenderMode,
  TileFormat,
  TileProps,
  ViewFlag,
  ViewFlags,
} from "@bentley/imodeljs-common";
import { Viewport } from "../Viewport";
import { TileRequest, TileContent, TileDrawArgs, TileParams, BatchedTileIdMap, readPointCloudTileContent, GltfReader, B3dmReader, I3dmReader, ImdlReader, Tile, TileLoadPriority } from "./internal";
import { GraphicBranch } from "../render/GraphicBranch";
import { RenderSystem } from "../render/RenderSystem";

const defaultViewFlagOverrides = new ViewFlag.Overrides(ViewFlags.fromJSON({
  renderMode: RenderMode.SmoothShade,
  noCameraLights: true,
  noSourceLights: true,
  noSolarLight: true,
}));

const scratchTileCenterWorld = new Point3d();
const scratchTileCenterView = new Point3d();

/** Serves as a "handler" for a specific type of [[TileTree]]. Its primary responsibilities involve loading tile content.
 * @internal
 */
export abstract class TileLoader {
  private _containsPointClouds = false;

  public abstract async getChildrenProps(parent: Tile): Promise<TileProps[]>;
  public abstract async requestTileContent(tile: Tile, isCanceled: () => boolean): Promise<TileRequest.Response>;
  public abstract get maxDepth(): number;
  public abstract get priority(): TileLoadPriority;
  protected get _batchType(): BatchType { return BatchType.Primary; }
  protected get _loadEdges(): boolean { return true; }
  public abstract tileRequiresLoading(params: TileParams): boolean;
  public getBatchIdMap(): BatchedTileIdMap | undefined { return undefined; }
  public get isContentUnbounded(): boolean { return false; }
  public get containsPointClouds(): boolean { return this._containsPointClouds; }
  public get preloadRealityParentDepth(): number { return 0; }
  public get preloadRealityParentSkip(): number { return 0; }
  public get drawAsRealityTiles(): boolean { return false; }
  public get parentsAndChildrenExclusive(): boolean { return true; }
  public forceTileLoad(_tile: Tile): boolean { return false; }
  public onActiveRequestCanceled(_tile: Tile): void { }

  public computeTilePriority(tile: Tile, _viewports: Iterable<Viewport>): number {
    return tile.depth;
  }

  public processSelectedTiles(selected: Tile[], _args: TileDrawArgs): Tile[] { return selected; }

  // NB: The isCanceled arg is chiefly for tests...in usual case it just returns false if the tile is no longer in 'loading' state.
  public async loadTileContent(tile: Tile, data: TileRequest.ResponseData, system: RenderSystem, isCanceled?: () => boolean): Promise<TileContent> {
    assert(data instanceof Uint8Array);
    const blob = data as Uint8Array;
    const streamBuffer = new ByteStream(blob.buffer);
    return this.loadTileContentFromStream(tile, streamBuffer, system, isCanceled);
  }

  public async loadTileContentFromStream(tile: Tile, streamBuffer: ByteStream, system: RenderSystem, isCanceled?: () => boolean): Promise<TileContent> {
    const position = streamBuffer.curPos;
    const format = streamBuffer.nextUint32;
    streamBuffer.curPos = position;

    if (undefined === isCanceled)
      isCanceled = () => !tile.isLoading;

    let reader: GltfReader | undefined;
    switch (format) {
      case TileFormat.Pnts:
        this._containsPointClouds = true;
        return { graphic: readPointCloudTileContent(streamBuffer, tile.root.iModel, tile.root.modelId, tile.root.is3d, tile.contentRange, system, tile.yAxisUp) };

      case TileFormat.B3dm:
        reader = B3dmReader.create(streamBuffer, tile.root.iModel, tile.root.modelId, tile.root.is3d, tile.contentRange, system, tile.yAxisUp, tile.isLeaf, tile.center, tile.transformToRoot, isCanceled, this.getBatchIdMap());
        break;
      case TileFormat.IModel:
        reader = ImdlReader.create(streamBuffer, tile.root.iModel, tile.root.modelId, tile.root.is3d, system, this._batchType, this._loadEdges, isCanceled, tile.hasSizeMultiplier ? tile.sizeMultiplier : undefined, tile.contentId);
        break;
      case TileFormat.I3dm:
        reader = I3dmReader.create(streamBuffer, tile.root.iModel, tile.root.modelId, tile.root.is3d, tile.contentRange, system, tile.yAxisUp, tile.isLeaf, isCanceled);
        break;
      case TileFormat.Cmpt:
        const header = new CompositeTileHeader(streamBuffer);
        if (!header.isValid) return {};
        const branch = new GraphicBranch();
        for (let i = 0; i < header.tileCount; i++) {
          const tilePosition = streamBuffer.curPos;
          streamBuffer.advance(8);    // Skip magic and version.
          const tileBytes = streamBuffer.nextUint32;
          streamBuffer.curPos = tilePosition;
          const result = await this.loadTileContentFromStream(tile, streamBuffer, system, isCanceled);
          if (result.graphic)
            branch.add(result.graphic);
          streamBuffer.curPos = tilePosition + tileBytes;
        }
        return { graphic: branch.isEmpty ? undefined : system.createBranch(branch, Transform.createIdentity()), isLeaf: tile.isLeaf, sizeMultiplier: tile.sizeMultiplier };

      default:
        assert(false, "unknown tile format " + format);
        break;
    }

    let content: TileContent = {};
    if (undefined !== reader) {
      try {
        content = await reader.read();
      } catch (_err) {
        // Failure to load should prevent us from trying to load children
        content.isLeaf = true;
      }
    }

    return content;
  }

  public get viewFlagOverrides(): ViewFlag.Overrides { return defaultViewFlagOverrides; }
  public adjustContentIdSizeMultiplier(contentId: string, _sizeMultiplier: number): string { return contentId; }

  public static computeTileClosestToEyePriority(tile: Tile, viewports: Iterable<Viewport>, location: Transform): number {
    // Prioritize tiles closer to eye.
    // NB: In NPC coords, 0 = far plane, 1 = near plane.
    const center = location.multiplyPoint3d(tile.center, scratchTileCenterWorld);
    let minDistance = 1.0;
    for (const viewport of viewports) {
      const npc = viewport.worldToNpc(center, scratchTileCenterView);
      const distance = 1.0 - npc.z;
      minDistance = Math.min(distance, minDistance);
    }

    return minDistance;
  }
}
