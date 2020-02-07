/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tile
 */

import {
  assert,
  BeDuration,
  BeTimePoint,
  dispose,
  Id64,
  Id64String,
  IDisposable,
  JsonUtils,
} from "@bentley/bentleyjs-core";
import {
  ClipUtilities,
  ClipVector,
  ConvexClipPlaneSet,
  Matrix4d,
  Point3d,
  Point4d,
  Range3d,
  Transform,
} from "@bentley/geometry-core";
import {
  bisectTileRange2d,
  bisectTileRange3d,
  ColorDef,
  ElementAlignedBox3d,
  Frustum,
  FrustumPlanes,
  ViewFlag,
} from "@bentley/imodeljs-common";
import { IModelApp } from "../IModelApp";
import { IModelConnection } from "../IModelConnection";
import { GraphicBranch } from "../render/GraphicBranch";
import { RenderClipVolume } from "../render/RenderClipVolume";
import { RenderMemory } from "../render/RenderSystem";
import { CoordSystem } from "../Viewport";
import { ViewingSpace } from "../ViewingSpace";
import {
  Tile,
  TileDrawArgs,
  TileLoadPriority,
  TileLoader,
  TileTreeParams,
  tileParamsFromJSON,
} from "./internal";

function pointIsContained(point: Point3d, range: Range3d): boolean {
  const tol = 1.0e-6;
  return point.x >= range.low.x - tol
    && point.y >= range.low.y - tol
    && point.z >= range.low.z - tol
    && point.x <= range.high.x + tol
    && point.y <= range.high.y + tol
    && point.z <= range.high.z + tol;
}

function pointsAreContained(points: Point3d[], range: Range3d): boolean {
  for (const point of points)
    if (!pointIsContained(point, range))
      return false;

  return true;
}

/** Sub-divide tile range until we find range of smallest tile containing all the points. */
function computeTileRangeContainingPoints(parentRange: Range3d, points: Point3d[], is2d: boolean): Range3d {
  const bisect = is2d ? bisectTileRange2d : bisectTileRange3d;
  const maxK = is2d ? 1 : 2;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < maxK; k++) {
        const range = parentRange.clone();
        bisect(range, 0 === i);
        bisect(range, 0 === j);
        if (!is2d)
          bisect(range, 0 === k);

        if (pointsAreContained(points, range))
          return computeTileRangeContainingPoints(range, points, is2d);
      }
    }
  }

  return parentRange;
}

/** Divide range in half until we find smallest sub-range containing all the points. */
function computeSubRangeContainingPoints(parentRange: Range3d, points: Point3d[], is2d: boolean): Range3d {
  const bisect = is2d ? bisectTileRange2d : bisectTileRange3d;
  const range = parentRange.clone();
  bisect(range, false);
  if (pointsAreContained(points, range))
    return computeSubRangeContainingPoints(range, points, is2d);

  parentRange.clone(range);
  bisect(range, true);
  if (pointsAreContained(points, range))
    return computeSubRangeContainingPoints(range, points, is2d);

  return parentRange;
}

/** @internal */
export enum TileTreeLoadStatus {
  NotLoaded,
  Loading,
  Loaded,
  NotFound,
}

/** @internal */
export class TraversalDetails {
  public queuedChildren = new Array<Tile>();
  public childrenLoading = false;

  public initialize() {
    this.queuedChildren.length = 0;
    this.childrenLoading = false;
  }
}

/** @internal */
export class TraversalChildrenDetails {
  private _childDetails: TraversalDetails[] = [];

  public initialize() {
    for (const child of this._childDetails)
      child.initialize();
  }
  public getChildDetail(index: number) {
    while (this._childDetails.length <= index)
      this._childDetails.push(new TraversalDetails());

    return this._childDetails[index];
  }

  public combine(parentDetails: TraversalDetails) {
    parentDetails.queuedChildren.length = 0;
    parentDetails.childrenLoading = false;
    for (const child of this._childDetails) {
      parentDetails.childrenLoading = parentDetails.childrenLoading || child.childrenLoading;
      for (const queuedChild of child.queuedChildren)
        parentDetails.queuedChildren.push(queuedChild);
    }
  }
}

/** @internal */
export class TraversalSelectionContext {
  public preloaded = new Set<Tile>();
  public missing = new Array<Tile>();
  constructor(public selected: Tile[], public displayedDescendants: Tile[][]) { }

  public selectOrQueue(tile: Tile, traversalDetails: TraversalDetails) {
    if (tile.isReady) {
      this.selected.push(tile);
      this.displayedDescendants.push(traversalDetails.queuedChildren.slice());
      traversalDetails.queuedChildren.length = 0;
      traversalDetails.childrenLoading = false;
    } else if (!tile.isNotFound) {
      traversalDetails.queuedChildren.push(tile);
      this.missing.push(tile);
    }
  }
  public preload(tile: Tile): void {
    this.preloaded.add(tile);
    if (!tile.isReady)
      this.missing.push(tile);
  }
  public select(tiles: Tile[]): void {
    for (const tile of tiles) {
      this.selected.push(tile);
      this.displayedDescendants.push([]);
    }
  }
}

/** A hierarchical level-of-detail tree of 3d [[Tile]]s to be rendered in a [[Viewport]].
 * @internal
 */
export class TileTree implements IDisposable, RenderMemory.Consumer {
  private _lastSelected = BeTimePoint.now();
  public readonly iModel: IModelConnection;
  public readonly is3d: boolean;
  /** Transforms from the tile tree's coordinate space to the iModel's coordinate space.
   * @note Individual [[TileTreeReference]]s may opt to relocate the TileTree using their own transforms.
   */
  public readonly iModelTransform: Transform;
  public readonly id: string;
  public readonly modelId: Id64String;
  public readonly contentIdQualifier?: string;
  public readonly viewFlagOverrides: ViewFlag.Overrides;
  public readonly maxTilesToSkip: number;
  public readonly maxInitialTilesToSkip: number;
  public expirationTime: BeDuration;
  public clipVolume?: RenderClipVolume;
  protected _rootTile: Tile;
  public readonly loader: TileLoader;
  public readonly yAxisUp: boolean;
  public traversalChildrenByDepth: TraversalChildrenDetails[] = [];
  public static debugSelectedTiles = false;           // tslint:disable-line: prefer-const
  public static debugMissingTiles = false;            // tslint:disable-line: prefer-const
  public static debugSelectedRanges = false;         // tslint:disable-line: prefer-const
  // If defined, tight range around the contents of the entire tile tree. This is always no more than the root tile's range, and often much smaller.
  public readonly contentRange?: ElementAlignedBox3d;

  public constructor(props: TileTreeParams) {
    this.iModel = props.iModel;
    this.is3d = props.is3d;
    this.id = props.id;
    this.modelId = Id64.fromJSON(props.modelId);
    this.contentIdQualifier = props.contentIdQualifier;
    this.iModelTransform = props.location;

    if (undefined !== props.clipVector)
      this.clipVolume = IModelApp.renderSystem.createClipVolume(props.clipVector);

    this.maxTilesToSkip = JsonUtils.asInt(props.maxTilesToSkip, 100);
    this.maxInitialTilesToSkip = JsonUtils.asInt(props.maxInitialTilesToSkip, 0);
    this.loader = props.loader;
    this._rootTile = new Tile(tileParamsFromJSON(props.rootTile, this)); // causes TileTree to no longer be disposed (assuming the Tile loaded a graphic and/or its children)
    this.viewFlagOverrides = this.loader.viewFlagOverrides;
    this.yAxisUp = props.yAxisUp ? props.yAxisUp : false;
    this.contentRange = props.contentRange;

    if (!this.loader.isContentUnbounded && !this.rootTile.contentRange.isNull) {
      const worldContentRange = this.iModelTransform.multiplyRange(this.rootTile.contentRange);
      this.iModel.displayedExtents.extendRange(worldContentRange);
    }

    const admin = IModelApp.tileAdmin;
    this.expirationTime = TileLoadPriority.Context === this.loader.priority ? admin.realityTileExpirationTime : admin.tileExpirationTime;
  }

  public get rootTile(): Tile { return this._rootTile; }
  public get clipVector(): ClipVector | undefined { return undefined !== this.clipVolume ? this.clipVolume.clipVector : undefined; }

  public dispose() {
    dispose(this._rootTile);
    this.clipVolume = dispose(this.clipVolume);
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    this._rootTile.collectStatistics(stats);
    if (undefined !== this.clipVolume)
      this.clipVolume.collectStatistics(stats);
  }

  public get is2d(): boolean { return !this.is3d; }
  public get range(): ElementAlignedBox3d { return this._rootTile !== undefined ? this._rootTile.range : new Range3d(); }

  /** The most recent time when tiles were selected for drawing. Used for purging least-recently-used tile trees to free up memory. */
  public get lastSelectedTime(): BeTimePoint { return this._lastSelected; }

  public selectTilesForScene(args: TileDrawArgs): Tile[] {
    if (this.loader.drawAsRealityTiles)
      return this.selectRealityTiles(args, []);
    else
      return this.selectTiles(args);
  }

  public selectTiles(args: TileDrawArgs): Tile[] {
    this._lastSelected = BeTimePoint.now();
    const selected: Tile[] = [];
    if (undefined !== this._rootTile)
      this._rootTile.selectTiles(selected, args);

    return this.loader.processSelectedTiles(selected, args);
  }

  public drawRealityTiles(args: TileDrawArgs): void {
    const displayedTileDescendants = new Array<Tile[]>();
    const selectedTiles = this.selectRealityTiles(args, displayedTileDescendants);
    if (!this.loader.parentsAndChildrenExclusive)
      selectedTiles.sort((a, b) => a.depth - b.depth);                    // If parent and child are not exclusive then display parents (low resolution) first.
    assert(selectedTiles.length === displayedTileDescendants.length);
    for (let i = 0; i < selectedTiles.length; i++) {
      const selectedTile = selectedTiles[i];
      if (undefined !== selectedTile.graphics) {
        const builder = TileTree.debugSelectedRanges ? args.context.createSceneGraphicBuilder() : undefined;
        const displayedDescendants = displayedTileDescendants[i];
        const graphics = selectedTile.graphics;
        if (0 === displayedDescendants.length || !this.loader.parentsAndChildrenExclusive || selectedTile.allChildrenIncluded(displayedDescendants)) {
          args.graphics.add(graphics);
          if (builder) selectedTile.addBoundingRectangle(builder, ColorDef.green);
        } else {
          if (builder) selectedTile.addBoundingRectangle(builder, ColorDef.red);
          for (const displayedDescendant of displayedDescendants) {
            const clipVector = displayedDescendant.getContentClip();
            if (undefined === clipVector) {
              args.graphics.add(graphics);
            } else {
              clipVector.transformInPlace(args.location);
              if (builder) displayedDescendant.addBoundingRectangle(builder, ColorDef.blue);
              const branch = new GraphicBranch();
              const doClipOverride = new ViewFlag.Overrides();
              doClipOverride.setShowClipVolume(true);
              branch.add(graphics);
              branch.setViewFlagOverrides(doClipOverride);
              const clipVolume = args.context.target.renderSystem.createClipVolume(clipVector);

              args.graphics.add(args.context.createGraphicBranch(branch, Transform.createIdentity(), { clipVolume }));
            }
          }
        }
        if (builder) args.graphics.add(builder.finish());
        const rangeGraphic = selectedTile.getRangeGraphic(args.context);
        if (undefined !== rangeGraphic)
          args.graphics.add(rangeGraphic);
      }
    }
    args.drawGraphics();
    args.context.viewport.numSelectedTiles += selectedTiles.length;
  }
  public getTraversalChildren(depth: number) {
    while (this.traversalChildrenByDepth.length <= depth)
      this.traversalChildrenByDepth.push(new TraversalChildrenDetails());

    return this.traversalChildrenByDepth[depth];
  }

  public selectRealityTiles(args: TileDrawArgs, displayedDescendants: Tile[][]): Tile[] {
    this._lastSelected = BeTimePoint.now();
    const selected: Tile[] = [];
    const context = new TraversalSelectionContext(selected, displayedDescendants);

    this._rootTile.selectRealityTiles(context, args, new TraversalDetails());

    for (const tile of context.missing)
      args.insertMissing(tile);

    if (TileTree.debugSelectedTiles) {
      this.logTiles("Selected: ", selected);
      const preloaded = [];
      for (const tile of context.preloaded)
        preloaded.push(tile);
      this.logTiles("Preloaded: ", preloaded);
    }

    if (TileTree.debugMissingTiles && context.missing.length)
      this.logTiles("Missing: ", context.missing);

    return selected;
  }
  private logTiles(label: string, tiles: Tile[]) {
    let depthString = "";
    let min = 10000, max = -10000;
    const depthMap = new Map<number, number>();
    for (const tile of tiles) {
      const depth = tile.depth;
      min = Math.min(min, tile.depth);
      max = Math.max(max, tile.depth);
      const found = depthMap.get(depth);
      depthMap.set(depth, found === undefined ? 1 : found + 1);
    }

    depthMap.forEach((key, value) => depthString += key + "-" + value + ", ");
    console.log(label + ": " + tiles.length + " Min: " + min + " Max: " + max + " Depths: " + depthString);    // tslint:disable-line
  }

  public computeTileRangeForFrustum(location: Transform, viewingSpace: ViewingSpace): Range3d | undefined {
    if (this.range.isNull)
      return undefined;

    const range = location.multiplyRange(this.range);
    const frustum = viewingSpace.getFrustum(CoordSystem.World, true);
    const frustumPlanes = new FrustumPlanes(frustum);
    const planes = ConvexClipPlaneSet.createPlanes(frustumPlanes.planes!);
    const points: Point3d[] = [];
    ClipUtilities.announceLoopsOfConvexClipPlaneSetIntersectRange(planes, range, (array) => {
      for (const point of array.points)
        points.push(point);
    }, true, true, false);

    if (0 === points.length)
      return undefined;

    assert(pointsAreContained(points, range));
    const useTileRange = false;
    return useTileRange ? computeTileRangeContainingPoints(range, points, this.is2d) : computeSubRangeContainingPoints(range, points, this.is2d);
  }

  public draw(args: TileDrawArgs): void {
    if (this.loader.drawAsRealityTiles)
      return this.drawRealityTiles(args);

    const selectedTiles = this.selectTiles(args);
    for (const selectedTile of selectedTiles)
      selectedTile.drawGraphics(args);

    args.drawGraphics();
    args.context.viewport.numSelectedTiles += selectedTiles.length;
  }

  public debugForcedDepth?: number; // For debugging purposes - force selection of tiles of specified depth.
  private static _scratchFrustum = new Frustum();
  private static _scratchPoint4d = Point4d.createZero();
  private extendRangeForTileContent(range: Range3d, tile: Tile, matrix: Matrix4d, treeTransform: Transform, frustumPlanes?: FrustumPlanes) {
    if (tile.isEmpty || tile.contentRange.isNull)
      return;

    const box = Frustum.fromRange(tile.contentRange, TileTree._scratchFrustum);
    box.transformBy(treeTransform, box);
    if (frustumPlanes !== undefined && FrustumPlanes.Containment.Outside === frustumPlanes.computeFrustumContainment(box))
      return;

    if (tile.children === undefined) {
      for (const boxPoint of box.points) {
        matrix.multiplyPoint3d(boxPoint, 1, TileTree._scratchPoint4d);
        if (TileTree._scratchPoint4d.w > .0001)
          range.extendXYZW(TileTree._scratchPoint4d.x, TileTree._scratchPoint4d.y, TileTree._scratchPoint4d.z, TileTree._scratchPoint4d.w);
        else
          range.high.z = Math.max(1.0, range.high.z);   // behind eye plane...
      }
    } else {
      for (const child of tile.children)
        this.extendRangeForTileContent(range, child, matrix, treeTransform, frustumPlanes);
    }
  }

  /* extend range to include transformed range of this tile tree */
  public accumulateTransformedRange(range: Range3d, matrix: Matrix4d, location: Transform, frustumPlanes?: FrustumPlanes) {
    this.extendRangeForTileContent(range, this.rootTile, matrix, location, frustumPlanes);
  }

  public countTiles(): number {
    return 1 + this.rootTile.countDescendants();
  }
}

/** @internal */
export interface TileTreeDiscloser {
  discloseTileTrees: (trees: TileTreeSet) => void;
}

/** A set of TileTrees, populated by a call to a `discloseTileTrees` function on an object like a [[Viewport]], [[ViewState]], or [[TileTreeReference]].
 * @internal
 */
export class TileTreeSet {
  private readonly _processed = new Set<TileTreeDiscloser>();
  public readonly trees = new Set<TileTree>();

  public add(tree: TileTree): void {
    this.trees.add(tree);
  }

  public disclose(discloser: TileTreeDiscloser): void {
    if (!this._processed.has(discloser)) {
      this._processed.add(discloser);
      discloser.discloseTileTrees(this);
    }
  }

  public get size(): number { return this.trees.size; }
}
