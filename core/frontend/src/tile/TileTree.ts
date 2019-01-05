/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Tile */

import {
  assert,
  Id64,
  Id64String,
  BeTimePoint,
  BeDuration,
  JsonUtils,
  dispose,
  IDisposable,
  base64StringToUint8Array,
} from "@bentley/bentleyjs-core";
import {
  ElementAlignedBox3d,
  ViewFlag,
  ViewFlags,
  RenderMode,
  Frustum,
  FrustumPlanes,
  TileProps,
  TileTreeProps,
  ColorDef,
  BatchType,
} from "@bentley/imodeljs-common";
import { Range3d, Point3d, Transform, ClipVector, ClipPlaneContainment } from "@bentley/geometry-core";
import { SceneContext } from "../ViewContext";
import { RenderGraphic, GraphicBranch, RenderMemory } from "../render/System";
import { IModelConnection } from "../IModelConnection";
import { IModelApp } from "../IModelApp";
import { TileIO } from "./TileIO";
import { TileRequest } from "./TileRequest";
import { GltfTileIO } from "./GltfTileIO";
import { B3dmTileIO } from "./B3dmTileIO";
import { PntsTileIO } from "./PntsTileIO";
import { DgnTileIO } from "./DgnTileIO";
import { IModelTileIO } from "./IModelTileIO";
import { ViewFrustum } from "../Viewport";

/** @hidden */
export class Tile implements IDisposable, RenderMemory.Consumer {
  public readonly root: TileTree;
  public readonly range: ElementAlignedBox3d;
  public readonly parent: Tile | undefined;
  public readonly depth: number;
  public contentId: string;
  public readonly center: Point3d;
  public readonly radius: number;
  protected _maximumSize: number;
  protected _isLeaf: boolean;
  protected _childrenLastUsed: BeTimePoint;
  protected _childrenLoadStatus: TileTree.LoadStatus;
  protected _children?: Tile[];
  protected _contentRange?: ElementAlignedBox3d;
  protected _graphic?: RenderGraphic;
  protected _rangeGraphic?: RenderGraphic;
  protected _rangeGraphicType: Tile.DebugBoundingBoxes = Tile.DebugBoundingBoxes.None;
  protected _sizeMultiplier?: number;
  protected _request?: TileRequest;
  private _state: TileState;

  public constructor(props: Tile.Params) {
    this.root = props.root;
    this.range = props.range;
    this.parent = props.parent;
    this.depth = undefined !== this.parent ? this.parent.depth + 1 : 0;
    this._state = TileState.NotReady;
    this.contentId = props.contentId;
    this._maximumSize = props.maximumSize;
    this._isLeaf = (true === props.isLeaf);
    this._childrenLastUsed = BeTimePoint.now();
    this._contentRange = props.contentRange;
    this._sizeMultiplier = props.sizeMultiplier;

    if (!this.root.loader.tileRequiresLoading(props)) {
      this.setIsReady();    // If no contents, this node is for structure only and no content loading is required.
    }

    this.center = this.range.low.interpolate(0.5, this.range.high);
    this.radius = 0.5 * this.range.low.distance(this.range.high);

    this._childrenLoadStatus = this.hasChildren && this.depth < this.root.loader.maxDepth ? TileTree.LoadStatus.NotLoaded : TileTree.LoadStatus.Loaded;
  }

  public dispose() {
    this._graphic = dispose(this._graphic);
    this._rangeGraphic = dispose(this._rangeGraphic);
    this._rangeGraphicType = Tile.DebugBoundingBoxes.None;

    if (this._children)
      for (const child of this._children)
        dispose(child);

    this._children = undefined;
    this._state = TileState.Abandoned;
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    if (undefined !== this._graphic)
      this._graphic.collectStatistics(stats);

    if (undefined !== this._children)
      for (const child of this._children)
        child.collectStatistics(stats);
  }

  /* ###TODO
  public cancelAllLoads(): void {
    if (this.isLoading) {
      this.loadStatus = Tile.LoadStatus.NotLoaded;
      if (this._children !== undefined) {
        for (const child of this._children)
          child.cancelAllLoads();
      }
    }
  }
  */

  public get loadStatus(): Tile.LoadStatus {
    switch (this._state) {
      case TileState.NotReady: {
        if (undefined === this.request)
          return Tile.LoadStatus.NotLoaded;
        else if (TileRequest.State.Loading === this.request.state)
            return Tile.LoadStatus.Loading;

        assert(TileRequest.State.Completed !== this.request.state && TileRequest.State.Failed !== this.request.state); // this.request should be undefined in these cases...
        return Tile.LoadStatus.Queued;
        }
      case TileState.Ready: {
        assert(undefined === this.request);
        return Tile.LoadStatus.Ready;
      }
      case TileState.NotFound: {
        assert(undefined === this.request);
        return Tile.LoadStatus.NotFound;
      }
      default: {
        assert(TileState.Abandoned === this._state);
        return Tile.LoadStatus.Abandoned;
      }
    }
  }

  public get isQueued(): boolean { return Tile.LoadStatus.Queued === this.loadStatus; }
  public get isAbandoned(): boolean { return Tile.LoadStatus.Abandoned === this.loadStatus; }
  public get isNotLoaded(): boolean { return Tile.LoadStatus.NotLoaded === this.loadStatus; }
  public get isLoading(): boolean { return Tile.LoadStatus.Loading === this.loadStatus; }
  public get isNotFound(): boolean { return Tile.LoadStatus.NotFound === this.loadStatus; }
  public get isReady(): boolean { return Tile.LoadStatus.Ready === this.loadStatus; }

  public setGraphic(graphic: RenderGraphic | undefined, isLeaf?: boolean, contentRange?: ElementAlignedBox3d, sizeMultiplier?: number): void {
    this._graphic = graphic;
    if (undefined === graphic)
      this._maximumSize = 0;
    else if (0 === this._maximumSize)
      this._maximumSize = 512;

    if (undefined !== isLeaf && isLeaf !== this._isLeaf) {
      this._isLeaf = isLeaf;
      this.unloadChildren();
    }

    if (undefined !== sizeMultiplier && (undefined === this._sizeMultiplier || sizeMultiplier > this._sizeMultiplier)) {
      this._sizeMultiplier = sizeMultiplier;
      this.contentId = this.contentId.substring(0, this.contentId.lastIndexOf("/") + 1) + sizeMultiplier;
      if (undefined !== this._children && this._children.length > 1)
        this.unloadChildren();
    }

    if (undefined !== contentRange)
      this._contentRange = contentRange;

    this.setIsReady();
  }

  public setIsReady(): void { this._state = TileState.Ready; IModelApp.viewManager.onNewTilesReady(); }
  public setNotFound(): void { this._state = TileState.NotFound; }
  public setAbandoned(): void {
    const children = this.children;
    if (undefined !== children)
      for (const child of children)
        child.setAbandoned();

    this._state = TileState.Abandoned;
  }

  public get maximumSize(): number { return this._maximumSize * this.sizeMultiplier; }
  public get isEmpty(): boolean { return this.isReady && !this.hasGraphics && !this.hasChildren; }
  public get hasChildren(): boolean { return !this.isLeaf; }
  public get contentRange(): ElementAlignedBox3d { return undefined !== this._contentRange ? this._contentRange : this.range; }
  public get isLeaf(): boolean { return this._isLeaf; }
  public get isDisplayable(): boolean { return this.maximumSize > 0; }
  public get isParentDisplayable(): boolean { return undefined !== this.parent && this.parent.isDisplayable; }

  public get graphics(): RenderGraphic | undefined { return this._graphic; }
  public get hasGraphics(): boolean { return undefined !== this.graphics; }
  public get sizeMultiplier(): number { return undefined !== this._sizeMultiplier ? this._sizeMultiplier : 1.0; }
  public get hasSizeMultiplier(): boolean { return undefined !== this._sizeMultiplier; }
  public get children(): Tile[] | undefined { return this._children; }
  public get iModel(): IModelConnection { return this.root.iModel; }
  public get yAxisUp(): boolean { return this.root.yAxisUp; }
  public get loader(): TileLoader { return this.root.loader; }

  public get hasContentRange(): boolean { return undefined !== this._contentRange; }
  public isRegionCulled(args: Tile.DrawArgs): boolean { return this.isCulled(this.range, args); }
  public isContentCulled(args: Tile.DrawArgs): boolean { return this.isCulled(this.contentRange, args); }

  private getRangeGraphic(context: SceneContext): RenderGraphic | undefined {
    const type = context.viewport.debugBoundingBoxes;
    if (type === this._rangeGraphicType)
      return this._rangeGraphic;

    this._rangeGraphicType = type;
    this._rangeGraphic = dispose(this._rangeGraphic);
    if (Tile.DebugBoundingBoxes.None !== type) {
      const builder = context.createSceneGraphicBuilder();
      const color = this.hasSizeMultiplier ? ColorDef.red : (this.isLeaf ? ColorDef.blue : ColorDef.green);
      builder.setSymbology(color, color, 1);
      const range = Tile.DebugBoundingBoxes.Content === type ? this.contentRange : this.range;
      builder.addRangeBox(range);
      this._rangeGraphic = builder.finish();
    }

    return this._rangeGraphic;
  }

  /** Returns the range of this tile's contents in world coordinates. */
  public computeWorldContentRange(): ElementAlignedBox3d {
    const range = new ElementAlignedBox3d();
    if (!this.contentRange.isNull)
      this.root.location.multiplyRange(this.contentRange, range);

    return range;
  }

  public computeVisibility(args: Tile.DrawArgs): Tile.Visibility {
    const forcedDepth = this.root.debugForcedDepth;
    if (undefined !== forcedDepth) {
      if (this.depth === forcedDepth)
        return Tile.Visibility.Visible;
      else
        return Tile.Visibility.TooCoarse;
    }

    // NB: We test for region culling before isDisplayable - otherwise we will never unload children of undisplayed tiles when
    // they are outside frustum
    if (this.isEmpty || this.isRegionCulled(args))
      return Tile.Visibility.OutsideFrustum;

    // some nodes are merely for structure and don't have any geometry
    if (!this.isDisplayable)
      return Tile.Visibility.TooCoarse;

    const hasContentRange = this.hasContentRange;
    if (!this.hasChildren) {
      if (hasContentRange && this.isContentCulled(args))
        return Tile.Visibility.OutsideFrustum;
      else
        return Tile.Visibility.Visible; // it's a leaf node
    }

    const radius = args.getTileRadius(this); // use a sphere to test pixel size. We don't know the orientation of the image within the bounding box.
    const center = args.getTileCenter(this);

    const pixelSizeAtPt = args.getPixelSizeAtPoint(center);
    const pixelSize = 0 !== pixelSizeAtPt ? radius / pixelSizeAtPt : 1.0e-3;

    if (pixelSize > this.maximumSize * args.tileSizeModifier)
      return Tile.Visibility.TooCoarse;
    else if (hasContentRange && this.isContentCulled(args))
      return Tile.Visibility.OutsideFrustum;
    else
      return Tile.Visibility.Visible;
  }

  public selectTiles(selected: Tile[], args: Tile.DrawArgs, numSkipped: number = 0): Tile.SelectParent {
    const vis = this.computeVisibility(args);
    if (Tile.Visibility.OutsideFrustum === vis) {
      this.unloadChildren(args.purgeOlderThan);
      return Tile.SelectParent.No;
    }
    if (Tile.Visibility.Visible === vis) {
      // This tile is of appropriate resolution to draw. If need loading or refinement, enqueue.
      if (!this.isReady) {
        args.insertMissing(this);
      }

      if (this.hasGraphics) {
        // It can be drawn - select it
        ++args.context.viewport.numReadyTiles;
        selected.push(this);
        this.unloadChildren(args.purgeOlderThan);
      } else {
        // It can't be drawn. If direct children are drawable, draw them in this tile's place; otherwise draw the parent.
        // Do not load/request the children for this purpose.
        const initialSize = selected.length;
        const kids = this.children;
        if (undefined === kids)
          return Tile.SelectParent.Yes;

        for (const kid of kids) {
          if (Tile.Visibility.OutsideFrustum !== kid.computeVisibility(args)) {
            if (!kid.hasGraphics) {
              selected.length = initialSize;
              return Tile.SelectParent.Yes;
            } else {
              selected.push(kid);
            }
          }
        }

        this._childrenLastUsed = args.now;
      }

      // We're drawing either this tile, or its direct children.
      return Tile.SelectParent.No;
    }

    // This tile is too coarse to draw. Try to draw something more appropriate.
    // If it is not ready to draw, we may want to skip loading in favor of loading its descendants.
    let canSkipThisTile = this.isReady || this.isParentDisplayable;
    if (canSkipThisTile && this.isDisplayable) { // skipping an undisplayable tile doesn't count toward the maximum
      // Some tiles do not sub-divide - they only facet the same geometry to a higher resolution. We can skip directly to the correct resolution.
      const isNotReady = !this.hasGraphics && !this.hasSizeMultiplier;
      if (isNotReady) {
        if (numSkipped >= this.root.maxTilesToSkip)
          canSkipThisTile = false;
        else
          numSkipped += 1;
      }
    }

    const childrenLoadStatus = this.loadChildren(); // NB: asynchronous
    const children = canSkipThisTile ? this.children : undefined;
    if (canSkipThisTile && TileTree.LoadStatus.Loading === childrenLoadStatus)
      args.markChildrenLoading();

    if (undefined !== children) {
      this._childrenLastUsed = args.now;
      let allChildrenDrawable = true;
      const initialSize = selected.length;
      for (const child of children) {
        if (Tile.SelectParent.Yes === child.selectTiles(selected, args, numSkipped))
          allChildrenDrawable = false; // NB: We must continue iterating children so that they can be requested if missing.
      }

      if (allChildrenDrawable)
        return Tile.SelectParent.No;

      // Some types of tiles (like maps) allow the ready children to be drawn on top of the parent while other children are not yet loaded.
      if (this.root.loader.parentsAndChildrenExclusive)
        selected.length = initialSize;
    }

    if (this.hasGraphics) {
      if (!canSkipThisTile) {
        // This tile is too coarse, but we require loading it before we can start loading higher-res children.
        ++args.context.viewport.numReadyTiles;
      }

      selected.push(this);
      return Tile.SelectParent.No;
    }

    // This tile is not ready to be drawn. Request it *only* if we cannot skip it.
    if (!this.isReady && !canSkipThisTile)
      args.insertMissing(this);

    return this.isParentDisplayable ? Tile.SelectParent.Yes : Tile.SelectParent.No;
  }

  public drawGraphics(args: Tile.DrawArgs): void {
    if (undefined !== this.graphics) {
      args.graphics.add(this.graphics);
      const rangeGraphics = this.getRangeGraphic(args.context);
      if (undefined !== rangeGraphics)
        args.graphics.add(rangeGraphics);
    }
  }

  protected unloadChildren(olderThan?: BeTimePoint): void {
    const children = this.children;
    if (undefined === children) {
      return;
    }

    if (undefined !== olderThan && this._childrenLastUsed.milliseconds > olderThan.milliseconds) {
      // this node has been used recently. Keep it, but potentially unload its grandchildren.
      for (const child of children)
        child.unloadChildren(olderThan);
    } else {
      for (const child of children) {
        child.setAbandoned();
        child.dispose();
      }

      this._children = undefined;
      this._childrenLoadStatus = TileTree.LoadStatus.NotLoaded;
    }
  }

  private static _scratchWorldFrustum = new Frustum();
  private static _scratchRootFrustum = new Frustum();
  private isCulled(range: ElementAlignedBox3d, args: Tile.DrawArgs) {
    const box = Frustum.fromRange(range, Tile._scratchRootFrustum);
    const worldBox = box.transformBy(args.location, Tile._scratchWorldFrustum);
    const isOutside = FrustumPlanes.Containment.Outside === args.frustumPlanes.computeFrustumContainment(worldBox);
    const isClipped = !isOutside && undefined !== args.clip && ClipPlaneContainment.StronglyOutside === args.clip.classifyPointContainment(box.points);
    const isCulled = isOutside || isClipped;
    return isCulled;
  }

  private loadChildren(): TileTree.LoadStatus {
    if (TileTree.LoadStatus.NotLoaded === this._childrenLoadStatus) {
      this._childrenLoadStatus = TileTree.LoadStatus.Loading;
      this.root.loader.getChildrenProps(this).then((props: TileProps[]) => {
        this._children = [];
        this._childrenLoadStatus = TileTree.LoadStatus.Loaded;
        if (undefined !== props) {
          // If this tile is undisplayable, update its content range based on children's content ranges.
          const parentRange = this.hasContentRange ? undefined : new ElementAlignedBox3d();
          for (const prop of props) {
            // ###TODO if child is empty don't bother adding it to list...
            const child = new Tile(Tile.Params.fromJSON(prop, this.root, this));

            // stick the corners on the Tile (used only by WebMercator Tiles)
            if ((prop as any).corners)
              (child as any).corners = (prop as any).corners;

            this._children.push(child);
            if (undefined !== parentRange && !child.isEmpty)
              parentRange.extendRange(child.contentRange);
          }

          if (undefined !== parentRange)
            this._contentRange = parentRange;
        }

        if (0 === this._children.length) {
          this._children = undefined;
          this._isLeaf = true;
        } else {
          IModelApp.viewManager.onNewTilesReady();
        }
      }).catch((_err) => {
        this._childrenLoadStatus = TileTree.LoadStatus.NotFound;
        this._children = undefined;
        this._isLeaf = true;
      });
    }

    return this._childrenLoadStatus;
  }

  public debugDump(): string {
    let str = "  ".repeat(this.depth);
    str += this.contentId;
    if (undefined !== this._children) {
      str += " " + this._children.length + "\n";
      for (const child of this._children)
        str += child.debugDump();
    } else {
      str += "\n";
    }

    return str;
  }

  public get request(): TileRequest | undefined { return this._request; }
  public set request(request: TileRequest | undefined) {
    assert(undefined === request || undefined === this.request);
    this._request = request;
  }
}

/** @hidden */
export namespace Tile {
  /**
   * Describes the current status of a Tile. Tiles are loaded by making asynchronous requests to the backend.
   * @hidden
   */
  export const enum LoadStatus {
    NotLoaded = 0, // No attempt to load the tile has been made, or the tile has since been unloaded. It currently has no graphics.
    Queued = 1, // A request has been made to load the tile from the backend, and a response is pending.
    Loading = 2, // A response has been received and the tile's graphics and other data are being loaded on the frontend.
    Ready = 3, // The tile has been loaded, and if the tile is displayable it has graphics.
    NotFound = 4, // The tile was requested, and the response from the backend indicated the tile could not be found.
    Abandoned = 5, // A request was made to the backend, then later cancelled as it was determined that the tile is no longer needed on the frontend.
  }

  /**
   * Describes the visibility of a tile based on its size and a view frustum.
   * @hidden
   */
  export const enum Visibility {
    OutsideFrustum, // this tile is entirely outside of the viewing frustum
    TooCoarse, // this tile is too coarse to be drawn
    Visible, // this tile is of the correct size to be drawn
  }

  /**
   * Returned by Tile.selectTiles() to indicate whether a parent tile should be drawn in place of a child tile.
   * @hidden
   */
  export const enum SelectParent {
    No,
    Yes,
  }

  /**
   * Loosely describes the "importance" of a tile. Requests for tiles of more "importance" are prioritized for loading.
   * @note A lower LoadPriority value indicates higher importance.
   * @hidden
   */
  export const enum LoadPriority {
    Primary = 0,
    Context = 1,
    Classifier = 2,
    Background = 3,
  }

  /**
   * Options for displaying tile bounding boxes for debugging purposes.
   *
   * Bounding boxes are color-coded based on refinement strategy:
   *  - Blue: A leaf tile (has no child tiles).
   *  - Green: An ordinary tile (sub-divides into 4 or 8 child tiles).
   *  - Red: A tile which refines to a single higher-resolution child occupying the same volume.
   * @see [[Viewport.debugBoundingBoxes]]
   */
  export const enum DebugBoundingBoxes {
    /** Display no bounding boxes */
    None = 0,
    /** Display boxes representing the tile's full volume. */
    Volume,
    /** Display boxes representing the range of the tile's contents, which may be tighter than (but never larger than) the tile's full volume. */
    Content,
  }

  /**
   * Arguments used when selecting and drawing tiles
   * @hidden
   */
  export class DrawArgs {
    public readonly location: Transform;
    public readonly root: TileTree;
    public clip?: ClipVector;
    public readonly context: SceneContext;
    public viewFrustum?: ViewFrustum;
    public readonly graphics: GraphicBranch = new GraphicBranch();
    public readonly now: BeTimePoint;
    public readonly purgeOlderThan: BeTimePoint;
    private readonly _frustumPlanes?: FrustumPlanes;

    public getPixelSizeAtPoint(inPoint?: Point3d): number {
      return this.viewFrustum !== undefined ? this.viewFrustum.getPixelSizeAtPoint(inPoint) : this.context.getPixelSizeAtPoint();
    }

    public get frustumPlanes(): FrustumPlanes {
      return this._frustumPlanes !== undefined ? this._frustumPlanes : this.context.frustumPlanes;
    }

    public constructor(context: SceneContext, location: Transform, root: TileTree, now: BeTimePoint, purgeOlderThan: BeTimePoint, clip?: ClipVector) {
      this.location = location;
      this.root = root;
      this.clip = clip;
      this.context = context;
      this.now = now;
      this.purgeOlderThan = purgeOlderThan;
      this.graphics.setViewFlagOverrides(root.viewFlagOverrides);
      this.viewFrustum = (undefined !== context.backgroundMap) ? ViewFrustum.createFromViewportAndPlane(context.viewport, context.backgroundMap.getPlane()) : context.viewport.viewFrustum;
      if (this.viewFrustum !== undefined)
        this._frustumPlanes = new FrustumPlanes(this.viewFrustum.getFrustum());
    }

    public get tileSizeModifier(): number { return 1.0; } // ###TODO? may adjust for performance, or device pixel density, etc
    public getTileCenter(tile: Tile): Point3d { return this.location.multiplyPoint3d(tile.center); }

    private static _scratchRange = new Range3d();
    public getTileRadius(tile: Tile): number {
      let range = tile.range.clone(DrawArgs._scratchRange);
      range = this.location.multiplyRange(range, range);
      return 0.5 * (tile.root.is3d ? range.low.distance(range.high) : range.low.distanceXY(range.high));
    }

    public drawGraphics(): void {
      if (this.graphics.isEmpty)
        return;

      const clipVolume = this.clip !== undefined ? IModelApp.renderSystem.getClipVolume(this.clip, this.root.iModel) : undefined;
      const branch = this.context.createBranch(this.graphics, this.location, clipVolume);
      this.context.outputGraphic(branch);
    }

    public insertMissing(tile: Tile): void {
      this.context.insertMissingTile(tile);
    }

    public markChildrenLoading(): void { this.context.hasMissingTiles = true; }
  }

  /**
   * Parameters used to construct a Tile.
   * @hidden
   */
  export class Params {
    public constructor(
      public readonly root: TileTree,
      public readonly contentId: string,
      public readonly range: ElementAlignedBox3d,
      public readonly maximumSize: number,
      public readonly isLeaf?: boolean,
      public readonly parent?: Tile,
      public readonly contentRange?: ElementAlignedBox3d,
      public readonly sizeMultiplier?: number) { }

    public static fromJSON(props: TileProps, root: TileTree, parent?: Tile) {
      const contentRange = undefined !== props.contentRange ? ElementAlignedBox3d.fromJSON(props.contentRange) : undefined;
      return new Params(root, props.contentId, ElementAlignedBox3d.fromJSON(props.range), props.maximumSize, props.isLeaf, parent, contentRange, props.sizeMultiplier);
    }
  }
}

// Tile.LoadStatus is computed from the combination of Tile._state and, if Tile.request is defined, Tile.request.state.
const enum TileState {
  NotReady = Tile.LoadStatus.NotLoaded, // Tile requires loading, but no request has yet completed.
  Ready = Tile.LoadStatus.Ready, // request completed successfully, or no loading was required.
  NotFound = Tile.LoadStatus.NotFound, // request failed.
  Abandoned = Tile.LoadStatus.Abandoned, // tile was abandoned.
}

/** @hidden */
export class TileTree implements IDisposable, RenderMemory.Consumer {
  public readonly iModel: IModelConnection;
  public readonly is3d: boolean;
  public readonly location: Transform;
  public readonly id: string;
  public readonly modelId: Id64String;
  public readonly viewFlagOverrides: ViewFlag.Overrides;
  public readonly maxTilesToSkip: number;
  public expirationTime: BeDuration;
  public clipVector?: ClipVector;
  protected _rootTile: Tile;
  public readonly loader: TileLoader;
  public readonly yAxisUp: boolean;

  public constructor(props: TileTree.Params) {
    this.iModel = props.iModel;
    this.is3d = props.is3d;
    this.id = props.id;
    this.modelId = Id64.fromJSON(props.modelId);
    this.location = props.location;
    this.expirationTime = BeDuration.fromSeconds(5); // ###TODO tile purging strategy
    this.clipVector = props.clipVector;
    this.maxTilesToSkip = JsonUtils.asInt(props.maxTilesToSkip, 100);
    this.loader = props.loader;
    this._rootTile = new Tile(Tile.Params.fromJSON(props.rootTile, this)); // causes TileTree to no longer be disposed (assuming the Tile loaded a graphic and/or its children)
    this.viewFlagOverrides = this.loader.viewFlagOverrides;
    this.yAxisUp = props.yAxisUp ? props.yAxisUp : false;
  }

  public get rootTile(): Tile { return this._rootTile; }

  public dispose() {
    dispose(this._rootTile);
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    this._rootTile.collectStatistics(stats);
  }

  public get is2d(): boolean { return !this.is3d; }
  public get range(): ElementAlignedBox3d { return this._rootTile !== undefined ? this._rootTile.range : new ElementAlignedBox3d(); }

  public selectTilesForScene(context: SceneContext): Tile[] { return this.selectTiles(this.createDrawArgs(context)); }
  public selectTiles(args: Tile.DrawArgs): Tile[] {
    const selected: Tile[] = [];
    if (undefined !== this._rootTile)
      this._rootTile.selectTiles(selected, args);

    return this.loader.processSelectedTiles(selected, args);
  }

  public drawScene(context: SceneContext): void { this.draw(this.createDrawArgs(context)); }
  public draw(args: Tile.DrawArgs): void {
    const selectedTiles = this.selectTiles(args);
    for (const selectedTile of selectedTiles)
      selectedTile.drawGraphics(args);

    args.drawGraphics();

    args.context.viewport.numSelectedTiles += selectedTiles.length;
  }

  public createDrawArgs(context: SceneContext): Tile.DrawArgs {
    const now = BeTimePoint.now();
    const purgeOlderThan = now.minus(this.expirationTime);
    return new Tile.DrawArgs(context, this.location.clone(), this, now, purgeOlderThan, this.clipVector);
  }

  public debugForcedDepth?: number; // For debugging purposes - force selection of tiles of specified depth.
}

const defaultViewFlagOverrides = new ViewFlag.Overrides(ViewFlags.fromJSON({
  renderMode: RenderMode.SmoothShade,
  noCameraLights: true,
  noSourceLights: true,
  noSolarLight: true,
}));

/** @hidden */
export abstract class TileLoader {
  public abstract async getChildrenProps(parent: Tile): Promise<TileProps[]>;
  public abstract async requestTileContent(tile: Tile): Promise<TileRequest.Response>;
  public abstract get maxDepth(): number;
  public abstract get priority(): Tile.LoadPriority;
  protected get _batchType(): BatchType { return BatchType.Primary; }
  public abstract tileRequiresLoading(params: Tile.Params): boolean;
  /** Given two tiles of the same [[Tile.LoadPriority]], determine which should be prioritized.
   * A negative value indicates lhs should load first, positive indicates rhs should load first, and zero indicates no distinction in priority.
   * @hidden
   */
  public compareTilePriorities(lhs: Tile, rhs: Tile): number { return lhs.depth - rhs.depth; }
  public get parentsAndChildrenExclusive(): boolean { return true; }

  public processSelectedTiles(selected: Tile[], _args: Tile.DrawArgs): Tile[] { return selected; }

  // NB: The isCanceled arg is chiefly for tests...in usual case it just returns false if the tile is no longer in 'loading' state.
  public async loadTileGraphic(tile: Tile, data: TileRequest.ResponseData, isCanceled?: () => boolean): Promise<TileRequest.Graphic> {
    assert(data instanceof Uint8Array);
    const blob = data as Uint8Array;

    const streamBuffer: TileIO.StreamBuffer = new TileIO.StreamBuffer(blob.buffer);
    const format = streamBuffer.nextUint32;
    streamBuffer.rewind(4);

    if (undefined === isCanceled)
      isCanceled = () => !tile.isLoading;

    let reader: GltfTileIO.Reader | undefined;
    switch (format) {
      case TileIO.Format.Pnts:
        return { renderGraphic: PntsTileIO.readPointCloud(streamBuffer, tile.root.iModel, tile.root.modelId, tile.root.is3d, tile.range, IModelApp.renderSystem, tile.yAxisUp) };

      case TileIO.Format.B3dm:
        reader = B3dmTileIO.Reader.create(streamBuffer, tile.root.iModel, tile.root.modelId, tile.root.is3d, tile.range, IModelApp.renderSystem, tile.yAxisUp, tile.isLeaf, isCanceled);
        break;

      case TileIO.Format.Dgn:
        reader = DgnTileIO.Reader.create(streamBuffer, tile.root.iModel, tile.root.modelId, tile.root.is3d, IModelApp.renderSystem, this._batchType, isCanceled);
        break;

      case TileIO.Format.IModel:
        reader = IModelTileIO.Reader.create(streamBuffer, tile.root.iModel, tile.root.modelId, tile.root.is3d, IModelApp.renderSystem, this._batchType, isCanceled, tile.hasSizeMultiplier ? tile.sizeMultiplier : undefined);
        break;

      default:
        assert(false, "unknown tile format " + format);
        break;
    }

    let graphic: TileRequest.Graphic = {};
    if (undefined !== reader) {
      try {
        graphic = await reader.read();
      } catch (_err) {
        //
      }
    }

    return graphic;
  }
  public loadGraphics(tile: Tile, geometry: any): void {
    let blob: Uint8Array | undefined;
    if (typeof geometry === "string") {
      blob = base64StringToUint8Array(geometry as string);
    } else if (geometry instanceof Uint8Array) {
      blob = geometry;
    } else if (geometry instanceof ArrayBuffer) {
      blob = new Uint8Array(geometry as ArrayBuffer);
    } else {
      tile.setIsReady();
      return;
    }

    const streamBuffer: TileIO.StreamBuffer = new TileIO.StreamBuffer(blob.buffer);
    const format = streamBuffer.nextUint32;
    const isCanceled = () => !tile.isLoading;
    let reader: GltfTileIO.Reader | undefined;
    streamBuffer.rewind(4);
    switch (format) {
      case TileIO.Format.B3dm:
        reader = B3dmTileIO.Reader.create(streamBuffer, tile.root.iModel, tile.root.modelId, tile.root.is3d, tile.range, IModelApp.renderSystem, tile.yAxisUp, tile.isLeaf, isCanceled);
        break;

      case TileIO.Format.Dgn:
        reader = DgnTileIO.Reader.create(streamBuffer, tile.root.iModel, tile.root.modelId, tile.root.is3d, IModelApp.renderSystem, this._batchType, isCanceled);
        break;

      case TileIO.Format.IModel:
        reader = IModelTileIO.Reader.create(streamBuffer, tile.root.iModel, tile.root.modelId, tile.root.is3d, IModelApp.renderSystem, this._batchType, isCanceled, tile.hasSizeMultiplier ? tile.sizeMultiplier : undefined);
        break;

      case TileIO.Format.Pnts:
        tile.setGraphic(PntsTileIO.readPointCloud(streamBuffer, tile.root.iModel, tile.root.modelId, tile.root.is3d, tile.range, IModelApp.renderSystem, tile.yAxisUp));
        return;

      default:
        assert(false, "unknown tile format " + format);
        break;
    }

    if (undefined === reader) {
      tile.setNotFound();
      return;
    }

    const read = reader.read();
    read.catch((_err) => tile.setNotFound());
    read.then((result) => { // tslint:disable-line:no-floating-promises
      // Make sure we still want this tile - may been unloaded, imodel may have been closed, IModelApp may have shut down taking render system with it, etc.
      if (tile.isLoading) {
        tile.setGraphic(result.renderGraphic, result.isLeaf, result.contentRange, result.sizeMultiplier);
        IModelApp.viewManager.onNewTilesReady();
      }
    });
  }

  public get viewFlagOverrides(): ViewFlag.Overrides { return defaultViewFlagOverrides; }
}

function bisectRange3d(range: Range3d, takeUpper: boolean): void {
  const diag = range.diagonal();
  const pt = takeUpper ? range.high : range.low;
  if (diag.x > diag.y && diag.x > diag.z)
    pt.x = (range.low.x + range.high.x) / 2.0;
  else if (diag.y > diag.z)
    pt.y = (range.low.y + range.high.y) / 2.0;
  else
    pt.z = (range.low.z + range.high.z) / 2.0;
}

function bisectRange2d(range: Range3d, takeUpper: boolean): void {
  const diag = range.diagonal();
  const pt = takeUpper ? range.high : range.low;
  if (diag.x > diag.y)
    pt.x = (range.low.x + range.high.x) / 2.0;
  else
    pt.y = (range.low.y + range.high.y) / 2.0;
}

/** @hidden */
export class IModelTileLoader extends TileLoader {
  private _iModel: IModelConnection;
  private _type: BatchType;
  protected get _batchType() { return this._type; }

  public constructor(iModel: IModelConnection, batchType: BatchType) {
    super();
    this._iModel = iModel;
    this._type = batchType;
  }

  public get maxDepth(): number { return 32; }  // Can be removed when element tile selector is working.
  public get priority(): Tile.LoadPriority { return BatchType.Classifier === this._batchType ? Tile.LoadPriority.Classifier : Tile.LoadPriority.Primary; }
  public tileRequiresLoading(params: Tile.Params): boolean { return 0 !== params.maximumSize; }

  protected static _viewFlagOverrides = new ViewFlag.Overrides();
  public get viewFlagOverrides() { return IModelTileLoader._viewFlagOverrides; }

  public async getChildrenProps(parent: Tile): Promise<TileProps[]> {
    const kids: TileProps[] = [];

    // Leaf nodes have no children.
    if (parent.isLeaf)
      return kids;

    // One child, same range as parent, higher-resolution.
    if (parent.hasSizeMultiplier) {
      const sizeMultiplier = 2 * parent.sizeMultiplier;
      let contentId = parent.contentId;
      const lastSlashPos = contentId.lastIndexOf("/");
      assert(-1 !== lastSlashPos);
      contentId = contentId.substring(0, lastSlashPos + 1) + sizeMultiplier.toString(16);
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
    const parentIdParts = parent.contentId.split("/");
    assert(5 === parentIdParts.length);

    const pDepth = parseInt(parentIdParts[0], 16);
    assert(parent.depth === pDepth);
    const pI = parseInt(parentIdParts[1], 16);
    const pJ = parseInt(parentIdParts[2], 16);
    const pK = parseInt(parentIdParts[3], 16);

    const is2d = parent.root.is2d;
    const bisectRange = is2d ? bisectRange2d : bisectRange3d;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        for (let k = 0; k < (is2d ? 1 : 2); k++) {
          const range = parent.range.clone();
          bisectRange(range, 0 === i);
          bisectRange(range, 0 === j);
          if (!is2d)
            bisectRange(range, 0 === k);

          const cI = pI * 2 + i;
          const cJ = pJ * 2 + j;
          const cK = pK * 2 + k;
          const childId = (parent.depth + 1).toString(16) + "/" + cI.toString(16) + "/" + cJ.toString(16) + "/" + cK.toString(16) + "/1";

          kids.push({ contentId: childId, range, maximumSize: 512 });
        }
      }
    }

    return kids;
  }

  public async requestTileContent(tile: Tile): Promise<TileRequest.Response> {
    return this._iModel.tiles.getTileContent(tile.root.id, tile.contentId);
  }
}

/** @hidden */
export namespace TileTree {
  /**
   * Parameters used to construct a TileTree
   * @hidden
   */
  export class Params {
    public constructor(
      public readonly id: string,
      public readonly rootTile: TileProps,
      public readonly iModel: IModelConnection,
      public readonly is3d: boolean,
      public readonly loader: TileLoader,
      public readonly location: Transform,
      public readonly modelId: Id64String,
      public readonly maxTilesToSkip?: number,
      public readonly yAxisUp?: boolean,
      public readonly isTerrain?: boolean,
      public readonly clipVector?: ClipVector) { }

    public static fromJSON(props: TileTreeProps, iModel: IModelConnection, is3d: boolean, loader: TileLoader, modelId: Id64String) {
      return new Params(props.id, props.rootTile, iModel, is3d, loader, Transform.fromJSON(props.location), modelId, props.maxTilesToSkip, props.yAxisUp, props.isTerrain);
    }
  }

  /** @hidden */
  export enum LoadStatus {
    NotLoaded,
    Loading,
    Loaded,
    NotFound,
  }
}

/** @hidden */
export class TileTreeState {
  public tileTree?: TileTree;
  public loadStatus: TileTree.LoadStatus = TileTree.LoadStatus.NotLoaded;
  public get iModel() { return this._iModel; }

  constructor(private _iModel: IModelConnection, private _is3d: boolean, private _modelId: Id64String) { }
  public setTileTree(props: TileTreeProps, loader: TileLoader) {
    this.tileTree = new TileTree(TileTree.Params.fromJSON(props, this._iModel, this._is3d, loader, this._modelId));
    this.loadStatus = TileTree.LoadStatus.Loaded;
  }
}
