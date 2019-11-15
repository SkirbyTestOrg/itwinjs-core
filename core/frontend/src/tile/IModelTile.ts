/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Tile */

import {
  assert,
  compareNumbers,
  compareStringsOrUndefined,
  Id64String,
} from "@bentley/bentleyjs-core";
import {
  BatchType,
  TileProps,
  ViewFlag,
} from "@bentley/imodeljs-common";
import {
  Tile,
  bisectRange2d,
  bisectRange3d,
} from "./Tile";
import { TileLoader } from "./TileTree";
import {
  TileRequest,
} from "./TileRequest";
import {
  IModelApp,
} from "../IModelApp";
import {
  IModelConnection,
} from "../IModelConnection";

/** Contains facilities for deserializing tiles in iMdl format - Bentley's internal format for representing 3d tiles
 * generated by the backend from the contents of geometric models. iMdl shares some similarities with glTF, but a quite
 * different representation of geometry and materials.
 * @internal
 */
export namespace IModelTile {
  /** Flags controlling how tile content is produced. The flags are part of the ContentId.
   * @internal
   */
  const enum ContentFlags {
    None = 0,
    AllowInstancing = 1 << 0,
    NoMeshDecimation = 1 << 1,
  }

  /** Describes the components of a tile's content Id.
   *
   * The depth specifies how many subdivisions from the root tile are to be performed to reach the sub-volume of interest.
   *
   * The i, j, and k parameters specify how to subdivide the tile's volume. Each sub-division is performed along the longest axis of the
   * volume. The volume is first sub-divided based on `i`, then the result sub-divided based on `j`, and finally that result sub-divided
   * based on `k`.
   *
   * The multiplier is an integer - generally a power of two - multiplied by the screen size of a tile (512 pixels) used to
   * produce a higher-resolution tile for the same volume.
   * @internal
   */
  interface ContentIdSpec {
    depth: number;
    i: number;
    j: number;
    k: number;
    multiplier: number;
  }

  /** Contains logic for working with tile content Ids according to a specific content Id scheme. Which scheme is used depends on
   * the major version of the tile format.
   * @internal
   */
  abstract class ContentIdProvider {
    public get rootContentId(): string {
      return this.computeId(0, 0, 0, 0, 1);
    }

    public idFromParentAndMultiplier(parentId: string, multiplier: number): string {
      const lastSepPos = parentId.lastIndexOf(this._separator);
      assert(-1 !== lastSepPos);
      return parentId.substring(0, lastSepPos + 1) + multiplier.toString(16);
    }

    public specFromId(id: string): ContentIdSpec {
      const parts = id.split(this._separator);
      const len = parts.length;
      assert(len >= 5);
      return {
        depth: parseInt(parts[len - 5], 16),
        i: parseInt(parts[len - 4], 16),
        j: parseInt(parts[len - 3], 16),
        k: parseInt(parts[len - 2], 16),
        multiplier: parseInt(parts[len - 1], 16),
      };
    }

    public idFromSpec(spec: ContentIdSpec): string {
      return this.computeId(spec.depth, spec.i, spec.j, spec.k, spec.multiplier);
    }

    protected join(depth: number, i: number, j: number, k: number, mult: number): string {
      const sep = this._separator;
      return depth.toString(16) + sep + i.toString(16) + sep + j.toString(16) + sep + k.toString(16) + sep + mult.toString(16);
    }

    protected abstract get _separator(): string;
    protected abstract computeId(depth: number, i: number, j: number, k: number, mult: number): string;

    /** formatVersion is the maximum major version supported by the back-end supplying the tile tree.
     * Must ensure front-end does not request tiles of a format the back-end cannot supply, and back-end does
     * not supply tiles of a format the front-end doesn't recognize.
     */
    public static create(allowInstancing: boolean, formatVersion?: number): ContentIdProvider {
      const majorVersion = IModelApp.tileAdmin.getMaximumMajorTileFormatVersion(formatVersion);
      assert(majorVersion > 0);
      assert(Math.floor(majorVersion) === majorVersion);
      switch (majorVersion) {
        case 0:
        case 1:
          return new ContentIdV1Provider();
        case 2:
        case 3:
          return new ContentIdV2Provider(majorVersion, allowInstancing);
        default:
          return new ContentIdV4Provider(allowInstancing);
      }
    }
  }

  /** The original (major version 1) tile format used a content Id scheme of the format
   * `depth/i/j/k/multiplier`.
   * @internal
   */
  class ContentIdV1Provider extends ContentIdProvider {
    protected get _separator() { return "/"; }
    protected computeId(depth: number, i: number, j: number, k: number, mult: number): string {
      return this.join(depth, i, j, k, mult);
    }
  }

  /** Tile formats 2 and 3 use a content Id scheme encoding styling flags and the major format version
   * into the content Id, of the format `_majorVersion_flags_depth_i_j_k_multiplier`.
   * @internal
   */
  class ContentIdV2Provider extends ContentIdProvider {
    private readonly _prefix: string;

    public constructor(majorVersion: number, allowInstancing: boolean) {
      super();
      const flags = (allowInstancing && IModelApp.tileAdmin.enableInstancing) ? ContentFlags.AllowInstancing : ContentFlags.None;
      this._prefix = this._separator + majorVersion.toString(16) + this._separator + flags.toString(16) + this._separator;
    }

    protected get _separator() { return "_"; }
    protected computeId(depth: number, i: number, j: number, k: number, mult: number): string {
      return this._prefix + this.join(depth, i, j, k, mult);
    }
  }

  /** Tile formats 4+ encode styling flags but not major format version. (The version is specified by the tile tree's Id).
   * Format: `-flags-depth-i-j-k-multiplier`.
   * @internal
   */
  class ContentIdV4Provider extends ContentIdProvider {
    private readonly _prefix: string;

    public constructor(allowInstancing: boolean) {
      super();
      let flags = (allowInstancing && IModelApp.tileAdmin.enableInstancing) ? ContentFlags.AllowInstancing : ContentFlags.None;
      if (!IModelApp.tileAdmin.enableMeshDecimation)
        flags |= ContentFlags.NoMeshDecimation;

      this._prefix = this._separator + flags.toString(16) + this._separator;
    }

    protected get _separator() { return "-"; }
    protected computeId(depth: number, i: number, j: number, k: number, mult: number): string {
      return this._prefix + this.join(depth, i, j, k, mult);
    }
  }

  /** @internal */
  export interface PrimaryTreeId {
    type: BatchType.Primary;
    edgesRequired: boolean;
    animationId?: Id64String;
  }

  /** @internal */
  export interface ClassifierTreeId {
    type: BatchType.VolumeClassifier | BatchType.PlanarClassifier;
    expansion: number;
    animationId?: Id64String;
  }

  /** Describes the Id of an iModel TileTree.
   * @internal
   */
  export type TreeId = PrimaryTreeId | ClassifierTreeId;

  /** @internal */
  export function treeIdToString(modelId: Id64String, treeId: TreeId): string {
    let idStr = "";
    const admin = IModelApp.tileAdmin;
    const version = admin.getMaximumMajorTileFormatVersion();
    if (version >= 4) {
      const useProjectExtents = admin.useProjectExtents || BatchType.VolumeClassifier === treeId.type;
      const flags = useProjectExtents ? "_1-" : "_0-";
      idStr = version.toString() + flags;
    }

    if (BatchType.Primary === treeId.type) {
      if (undefined !== treeId.animationId)
        idStr = idStr + "A:" + treeId.animationId + "_";

      if (!treeId.edgesRequired) {
        // Tell backend not to bother generating+returning edges - we would just discard them anyway
        idStr = idStr + "E:0_";
      }
    } else {
      const typeStr = BatchType.PlanarClassifier === treeId.type ? "CP" : "C";
      idStr = idStr + typeStr + ":" + treeId.expansion.toFixed(6) + "_";

      if (undefined !== treeId.animationId) {
        idStr = idStr + "A:" + treeId.animationId + "_";
      }
    }

    return idStr + modelId;
  }

  /** @internal */
  export function compareTreeIds(lhs: TreeId, rhs: TreeId): number {
    // Sadly this comparison does not suffice for type inference to realize both lhs and rhs have same type.
    if (lhs.type !== rhs.type)
      return compareNumbers(lhs.type, rhs.type);

    if (BatchType.Primary === lhs.type) {
      const r = rhs as PrimaryTreeId;
      if (lhs.edgesRequired !== r.edgesRequired)
        return lhs.edgesRequired ? -1 : 1;

      return compareStringsOrUndefined(lhs.animationId, r.animationId);
    }

    return compareNumbers(lhs.expansion, (rhs as ClassifierTreeId).expansion);
  }

  /** @internal */
  export class Loader extends TileLoader {
    private _iModel: IModelConnection;
    private _type: BatchType;
    private _edgesRequired: boolean;
    private readonly _guid: string | undefined;
    private readonly _contentIdProvider: ContentIdProvider;
    protected get _batchType() { return this._type; }
    protected get _loadEdges(): boolean { return this._edgesRequired; }

    public constructor(iModel: IModelConnection, formatVersion: number | undefined, batchType: BatchType, edgesRequired: boolean, allowInstancing: boolean, guid: string | undefined) {
      super();
      this._iModel = iModel;
      this._type = batchType;
      this._edgesRequired = edgesRequired;
      this._contentIdProvider = ContentIdProvider.create(allowInstancing, formatVersion);
      this._guid = guid;
    }

    public get maxDepth(): number { return 32; }  // Can be removed when element tile selector is working.
    public get priority(): Tile.LoadPriority { return (BatchType.VolumeClassifier === this._batchType || BatchType.PlanarClassifier === this._batchType) ? Tile.LoadPriority.Classifier : Tile.LoadPriority.Primary; }
    public tileRequiresLoading(params: Tile.Params): boolean { return 0 !== params.maximumSize; }
    public get rootContentId(): string { return this._contentIdProvider.rootContentId; }

    protected static _viewFlagOverrides = new ViewFlag.Overrides();
    public get viewFlagOverrides() { return Loader._viewFlagOverrides; }

    public async getChildrenProps(parent: Tile): Promise<TileProps[]> {
      const kids: TileProps[] = [];

      // Leaf nodes have no children.
      if (parent.isLeaf)
        return kids;

      // One child, same range as parent, higher-resolution.
      if (parent.hasSizeMultiplier) {
        const sizeMultiplier = parent.sizeMultiplier * 2;
        const contentId = this._contentIdProvider.idFromParentAndMultiplier(parent.contentId, sizeMultiplier);
        kids.push({
          contentId,
          range: parent.range,
          contentRange: parent.contentRange,
          sizeMultiplier,
          isLeaf: false,
          maximumSize: 512,
        });

        return kids;
      }

      // Sub-divide parent's range into 4 (for 2d trees) or 8 (for 3d trees) child tiles.
      const parentSpec = this._contentIdProvider.specFromId(parent.contentId);
      assert(parent.depth === parentSpec.depth);

      const childSpec: ContentIdSpec = { ...parentSpec };
      childSpec.depth = parent.depth + 1;

      // This mask is a bitfield in which an 'on' bit indicates sub-volume containing no geometry.
      // Don't bother creating children or requesting content for such empty volumes.
      const admin = IModelApp.tileAdmin;
      const emptyMask = parent.emptySubRangeMask;

      // Spatial tree range == project extents; content range == model range.
      // Trivially reject children whose ranges are entirely outside model range.
      let treeContentRange = parent.root.contentRange;
      if (undefined !== treeContentRange && treeContentRange.containsRange(parent.range)) {
        // Parent is wholly within model range - don't bother testing child ranges against it.
        treeContentRange = undefined;
      }

      const is2d = parent.root.is2d;
      const bisectRange = is2d ? bisectRange2d : bisectRange3d;
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          for (let k = 0; k < (is2d ? 1 : 2); k++) {
            const emptyBit = 1 << (i + j * 2 + k * 4);
            if (0 !== (emptyMask & emptyBit)) {
              // volume is known to contain no geometry.
              admin.onTileElided();
              continue;
            }

            const range = parent.range.clone();
            bisectRange(range, 0 === i);
            bisectRange(range, 0 === j);
            if (!is2d)
              bisectRange(range, 0 === k);

            if (undefined !== treeContentRange && !range.intersectsRange(treeContentRange)) {
              // volume is within project extents but entirely outside model range
              admin.onTileElided();
              continue;
            }

            childSpec.i = parentSpec.i * 2 + i;
            childSpec.j = parentSpec.j * 2 + j;
            childSpec.k = parentSpec.k * 2 + k;

            const childId = this._contentIdProvider.idFromSpec(childSpec);
            kids.push({ contentId: childId, range, maximumSize: 512 });
          }
        }
      }

      return kids;
    }

    public async requestTileContent(tile: Tile, isCanceled: () => boolean): Promise<TileRequest.Response> {
      const handleCacheMiss = () => {
        const cancelMe = isCanceled();
        if (!cancelMe)
          IModelApp.tileAdmin.onCacheMiss();

        return cancelMe;
      };

      return this._iModel.tiles.getTileContent(tile.root.id, tile.contentId, handleCacheMiss, this._guid);
    }

    public adjustContentIdSizeMultiplier(contentId: string, sizeMultiplier: number): string {
      return this._contentIdProvider.idFromParentAndMultiplier(contentId, sizeMultiplier);
    }
  }
}
