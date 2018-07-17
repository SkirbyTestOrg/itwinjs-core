/*---------------------------------------------------------------------------------------------
| $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Views */

import { Point2d, Point3d } from "@bentley/geometry-core/lib/PointVector";
import { Gradient, GraphicParams } from "@bentley/imodeljs-common/lib/Render";
import { ViewContext, SceneContext } from "./ViewContext";
import { Angle } from "@bentley/geometry-core/lib/Geometry";
import { ColorDef, Placement2d, ElementAlignedBox2d, ViewAttachmentProps, ElementAlignedBox3d } from "@bentley/imodeljs-common/lib/common";
import { Range2d } from "@bentley/geometry-core/lib/Range";
import { GraphicBuilder, GraphicType } from "./render/GraphicBuilder";
import { Target } from "./render/webgl/Target";
import { ViewState, ViewState2d, SheetViewState } from "./ViewState";
import { ClipVector, Transform, RotMatrix } from "@bentley/geometry-core/lib/geometry-core";
import { Id64 } from "@bentley/bentleyjs-core/lib/Id";
import { JsonUtils } from "@bentley/bentleyjs-core/lib/JsonUtils";
import { TileTree, Tile } from "./tile/TileTree";
import { FeatureSymbology } from "./render/FeatureSymbology";
import { GeometricModel2dState } from "./ModelState";
import { BeDuration } from "@bentley/bentleyjs-core/lib/Time";
import { RenderTarget } from "./render/System";
import { assert } from "@bentley/bentleyjs-core/lib/Assert";

/** Contains functionality specific to Sheet views. */
export namespace Sheet {
  /** Describes the geometry and styling of a sheet border decoration. */
  export class Border {
    private rect: Point2d[];
    private shadow: Point2d[];
    private gradient: Gradient.Symb;

    private constructor(rect: Point2d[], shadow: Point2d[], gradient: Gradient.Symb) {
      this.rect = rect;
      this.shadow = shadow;
      this.gradient = gradient;
    }

    /** Create a new sheet border. If a context is supplied, points are transformed to view coordinates. */
    public static create(width: number, height: number, context?: ViewContext) {
      // Rect
      const rect: Point3d[] = [
        Point3d.create(0, height),
        Point3d.create(0, 0),
        Point3d.create(width, 0),
        Point3d.create(width, height),
        Point3d.create(0, height)];
      if (context) {
        context.viewport.worldToViewArray(rect);
      }

      // Shadow
      const shadowWidth = .01 * Math.sqrt(width * width + height * height);
      const shadow: Point3d[] = [
        Point3d.create(shadowWidth, 0),
        Point3d.create(shadowWidth, -shadowWidth),
        Point3d.create(width + shadowWidth, -shadowWidth),
        Point3d.create(width + shadowWidth, height - shadowWidth),
        Point3d.create(width, height - shadowWidth),
        Point3d.create(width, 0),
        Point3d.create(shadowWidth, 0),
      ];
      if (context) {
        context.viewport.worldToViewArray(shadow);
      }

      // Gradient
      const gradient = new Gradient.Symb();
      gradient.mode = Gradient.Mode.Linear;
      gradient.angle = Angle.createDegrees(-45);
      gradient.keys = [{ value: 0, color: ColorDef.from(25, 25, 25) }, { value: 0.5, color: ColorDef.from(150, 150, 150) }];

      // Copy over points
      // ### TODO: Allow for conversion of 2d points array to view coordinates from world coordinates to avoid these copies?..
      const rect2d: Point2d[] = [];
      for (const point of rect)
        rect2d.push(Point2d.createFrom(point));
      const shadow2d: Point2d[] = [];
      for (const point of shadow)
        shadow2d.push(Point2d.createFrom(point));

      return new Border(rect2d, shadow2d, gradient);
    }

    public getRange(): Range2d {
      const range = Range2d.createArray(this.rect);
      const shadowRange = Range2d.createArray(this.shadow);
      range.extendRange(shadowRange);
      return range;
    }

    private static _wantGradient: boolean = false; // ###TODO not working properly yet...

    /** Add this border to the given GraphicBuilder. */
    public addToBuilder(builder: GraphicBuilder) {
      builder.setSymbology(ColorDef.black, ColorDef.black, 2);
      builder.addLineString2d(this.rect, 0);

      const params = new GraphicParams();
      params.setFillColor(ColorDef.black);
      if (Border._wantGradient)
        params.gradient = this.gradient;

      builder.activateGraphicParams(params);

      builder.addShape2d(this.shadow, Target.frustumDepth2d);
    }
  }

  /** An extension of Tile specific to rendering 2d attachments. */
  export class Tile2d extends Tile {
    public constructor(root: Tree2d, range: ElementAlignedBox2d) {
      super(new Tile.Params(
        root,
        "",
        new ElementAlignedBox3d(),
        512,  // does not matter... have no children
        [],
      ));
      this.range.low.set(0, 0, -RenderTarget.frustumDepth2d);
      this.range.high.set(range.high.x, range.high.y, RenderTarget.frustumDepth2d);
    }

    // override
    public get hasChildren(): boolean { return false; }
    // override
    public get hasGraphics(): boolean { return true; }

    // override
    public drawGraphics(args: Tile.DrawArgs) {
      const myRoot = this.root as Tree2d;
      const viewRoot = myRoot.viewRoot;

      const drawArgs = viewRoot.createDrawArgs(args.context);
      drawArgs.location.setFrom(myRoot.drawingToAttachment);
      // drawArgs.viewFlagOverrides = new ViewFlag.Overrides(myRoot.view.viewFlags);
      drawArgs.clip = myRoot.graphicsClip;
      drawArgs.graphics.symbologyOverrides = myRoot.symbologyOverrides;

      myRoot.view.createScene(drawArgs.context);

      // DEBUG - Currently being drawn in SheetViewState.decorate()
      /*
      if (false)
        myRoot.drawClipPolys(args);
      if (true)
        return;

      const params = new GraphicParams();
      params.linePixels = 2;
      params.setLineColor(myRoot.boundingBoxColor);
      params.setFillColor(myRoot.boundingBoxColor);

      const gf = args.context.createGraphic(Transform.createIdentity(), GraphicType.WorldDecoration);
      gf.activateGraphicParams(params);
      gf.addRangeBox(this.range);

      // Put in a branch so it doesn't get clipped...
      const branch = new GraphicBranch();
      branch.add(gf.finish());
      args.graphics.add(drawArgs.context.createBranch(branch, Transform.createIdentity()));
      */
    }
  }

  /** An extension of TileTree specific to rendering attachments. */
  export abstract class Tree extends TileTree {
    protected _clip: ClipVector;
    public readonly biasDistance: number = 0;
    public readonly boundingBoxColor: ColorDef = ColorDef.black;   // ***DEBUG

    public constructor(model: GeometricModel2dState) {
      super(new TileTree.Params(
        new Id64(),
        undefined,    // we will build and set root tile manually in child constructors
        model,
        undefined,
        Transform.createIdentity(),
        undefined,
        undefined,
        undefined,
      ));
      this._clip = ClipVector.createEmpty();
    }

    public get clip(): ClipVector { return this._clip; }

    public drawInView(context: SceneContext) {
      const args = this.createDrawArgs(context);
      assert(this._rootTile !== undefined);

      const selectedTiles = this.selectTiles(args);
      for (const selectedTile of selectedTiles)
        selectedTile.drawGraphics(args);

      args.drawGraphics();
    }
  }

  /** An extension of TileTree specific to rendering 2d attachments. */
  export class Tree2d extends Tree {
    public readonly view: ViewState2d;
    public readonly viewRoot: TileTree;
    public readonly drawingToAttachment: Transform;
    public readonly graphicsClip: ClipVector;
    public readonly symbologyOverrides: FeatureSymbology.Overrides;

    private constructor(model: GeometricModel2dState, attachment: Attachment2d, view: ViewState2d, viewRoot: TileTree) {
      super(model);

      this.view = view;
      this.viewRoot = viewRoot;

      // Ensure elements inside the view attachment are not affected to changes to category display for the sheet view
      this.symbologyOverrides = new FeatureSymbology.Overrides(view);

      const attachRange = attachment.placement.calculateRange();
      const attachWidth = attachRange.high.x - attachRange.low.x;
      const attachHeight = attachRange.high.y - attachRange.low.y;

      const viewExtents = view.getExtents();
      const scale = Point2d.create(attachWidth / viewExtents.x, attachHeight / viewExtents.y);

      const worldToAttachment = Point3d.createFrom(attachment.placement.origin);
      worldToAttachment.z = RenderTarget.depthFromDisplayPriority(attachment.displayPriority);

      const location = Transform.createOriginAndMatrix(worldToAttachment, RotMatrix.createIdentity());
      this.location.setFrom(location);

      const aspectRatioSkew = view.getAspectRatioSkew();
      this.drawingToAttachment = Transform.createOriginAndMatrix(Point3d.create(), view.getRotation());
      this.drawingToAttachment.matrix.scaleColumns(scale.x, aspectRatioSkew * scale.y, 1);
      const translation = viewRoot.location.origin.cloneAsPoint3d();
      const viewOrg = view.getOrigin().minus(translation);
      this.drawingToAttachment.multiplyPoint3d(viewOrg, viewOrg);
      translation.plus(viewOrg, viewOrg);
      viewOrg.z = 0;
      const viewOrgToAttachment = worldToAttachment.minus(viewOrg);
      translation.plus(viewOrgToAttachment, translation);
      this.drawingToAttachment.origin.setFrom(translation);

      this.expirationTime = BeDuration.fromSeconds(15);

      // The renderer needs the unclipped range of the attachment in order to produce polys to be rendered as clip mask...
      // (Containment tests can also be more efficiently performed if boundary range is specified)
      const clipTf = location.inverse();
      if (clipTf !== undefined) {
        this._clip = attachment.getOrCreateClip(clipTf);
        clipTf.multiplyRange(attachRange, this._clip.boundingRange);
      }

      const sheetToDrawing = this.drawingToAttachment.inverse();
      if (sheetToDrawing !== undefined) {
        this.graphicsClip = attachment.getOrCreateClip(sheetToDrawing);
        sheetToDrawing.multiplyRange(attachRange, this.graphicsClip.boundingRange);
      } else {
        this.graphicsClip = ClipVector.createEmpty();
      }

      this._rootTile = new Tile2d(this, attachment.placement.bbox);
    }

    /** Create a Tree2d tile tree for a 2d attachment. Returns a Tree2d if the model tile tree is ready. Otherwise, returns the status of the tiles. */
    public static create(attachment: Attachment2d): TileTree.LoadStatus {
      const viewedModel = attachment.view.getViewedModel();
      if (!viewedModel)
        return TileTree.LoadStatus.NotFound;
      const tileTree = viewedModel.getOrLoadTileTree();
      if (tileTree !== undefined)
        attachment.tree = new Tree2d(viewedModel, attachment, attachment.view, tileTree);
      return viewedModel.loadStatus;
    }
  }

  /** Describes the state of an attachment or attachment list. */
  export enum State {
    /** Haven't tried to create the scene for this level of the tree */
    NotLoaded,
    /** This level of the tree has an empty scene */
    Empty,
    /** All of the roots for this level of the tree have been created and we are loading their tiles */
    Loading,
    /** All of the tiles required for this level of the tree are ready for rendering */
    Ready,
  }

  /** An attachment is a reference to a View, placed on a sheet. THe attachment specifies the id of the view and its position on the sheet. */
  export abstract class Attachment {
    public id: Id64;
    public readonly view: ViewState2d;
    public scale: number;
    public placement: Placement2d;
    public clip: ClipVector;
    public displayPriority: number;
    protected _tree?: Tree;
    protected _loadStatus: TileTree.LoadStatus = TileTree.LoadStatus.NotLoaded;

    protected constructor(props: ViewAttachmentProps, view: ViewState2d) {
      this.id = new Id64(props.id);
      this.view = view;
      this.displayPriority = 0;
      let scale: number | undefined;
      let placement: Placement2d | undefined;
      const jsonProps = props.jsonProperties;

      if (props.placement)
        placement = Placement2d.fromJSON(props.placement);

      if (jsonProps !== undefined) {
        scale = jsonProps.scale !== undefined ? JsonUtils.asDouble(jsonProps.scale) : undefined;
        this.clip = jsonProps.clip !== undefined ? ClipVector.fromJSON(jsonProps.clip) : ClipVector.createEmpty();
        this.displayPriority = JsonUtils.asInt(props.jsonProperties.displayPriority);
      } else {
        this.clip = ClipVector.createEmpty();
      }

      // Compute placement from scale, or scale from placement if necessary
      if (scale === undefined && placement === undefined) {
        scale = 1;
        placement = Attachment.computePlacement(view, Point2d.create(), scale);
      } else if (scale === undefined) {
        scale = Attachment.computeScale(view, placement!);
      } else if (placement === undefined) {
        placement = Attachment.computePlacement(view, Point2d.create(), scale);
      }

      this.scale = scale;
      this.placement = placement!;
    }

    /** Returns the tile tree corresponding to this attachment, which may be 2d or 3d. Returns undefined if the tree has not been loaded. */
    public get tree(): Tree | undefined { return this._tree; }
    /** Sets the reference to the tile tree corresponding to this attachment view's model. */
    public set tree(tree: Tree | undefined) { this._tree = tree; }
    /** Returns the load status of this attachment view's tile tree. */
    public get loadStatus(): TileTree.LoadStatus { return this._loadStatus; }

    /** Given a view and placement, compute a scale for an attachment. */
    protected static computeScale(view: ViewState, placement: Placement2d): number {
      return view.getExtents().x / placement.bbox.width;
    }

    /** Given a view and an origin point, compute a placement for an attachment. */
    protected static computePlacement(view: ViewState, origin: Point2d, scale: number): Placement2d {
      const viewExtents = view.getExtents();
      const box = new ElementAlignedBox2d();
      box.low.setZero();
      box.high.x = viewExtents.x / scale;
      box.high.y = viewExtents.y / scale;

      return new Placement2d(origin, Angle.createDegrees(0), box);
    }

    /** Load the tile tree for this attachment. Returns true if successful. */
    public abstract load(sheetView: ViewState): void;

    /** Remove the clip vector from this view attachment. */
    public clearClipping() { this.clip.clear(); }

    /** Create a boundary clip vector around this attachment. */
    public createBoundaryClip(): ClipVector {
      const range = this.placement.calculateRange();
      const box: Point3d[] = [
        Point3d.create(range.low.x, range.low.y),
        Point3d.create(range.high.x, range.low.y),
        Point3d.create(range.high.x, range.high.y),
        Point3d.create(range.low.x, range.high.y),
        Point3d.create(range.low.x, range.low.y),
      ];
      const clip = ClipVector.createEmpty();
      clip.appendShape(box);
      return clip;
    }

    /** Returns the current clipping if it is defined and not null. Otherwise, attempt to create a new stored boundary clipping. */
    public getOrCreateClip(transform?: Transform): ClipVector {
      if (!this.clip.isValid())
        this.clip = this.createBoundaryClip();
      if (transform !== undefined)
        this.clip.transformInPlace(transform);
      return this.clip;
    }

    // DEBUG ONLY
    public drawDebugBorder(context: SceneContext) {
      const origin = this.placement.origin;
      const bbox = this.placement.bbox;
      const rect: Point2d[] = [
        Point2d.create(origin.x, origin.y),
        Point2d.create(origin.x + bbox.high.x, origin.y),
        Point2d.create(origin.x + bbox.high.x, origin.y + bbox.high.y),
        Point2d.create(origin.x, origin.y + bbox.high.y),
        Point2d.create(origin.x, origin.y)];

      const builder = context.createGraphic(Transform.createIdentity(), GraphicType.WorldDecoration);
      builder.setSymbology(ColorDef.black, ColorDef.black, 2);
      builder.addLineString2d(rect, 0);
      const attachmentBorder = builder.finish();
      context.outputGraphic(attachmentBorder);
    }
  }

  /** A 2d sheet view attachment. */
  export class Attachment2d extends Attachment {
    public constructor(props: ViewAttachmentProps, view: ViewState2d) {
      super(props, view);
    }

    public load(_sheetView: ViewState) {
      if (this._loadStatus === TileTree.LoadStatus.Loaded)
        return;
      this._loadStatus = Tree2d.create(this);
    }
  }

  /** A list of view attachments for a sheet. */
  export class Attachments {
    public readonly list: Attachment[] = [];
    private _allLoaded: boolean = true;

    public constructor() { }

    /** The number of attachments in this list. */
    public get length(): number { return this.list.length; }
    /** Returns true if all of the attachments in the list have loaded tile trees. */
    public get allLoaded(): boolean { return this._allLoaded; }

    /** Given a view id, return an attachment containing that view from the list. If no attachment in the list stores that view, returns undefined. */
    public findByViewId(viewId: Id64): Attachment | undefined {
      for (const attachment of this.list)
        if (attachment.view.id.equals(viewId))
          return attachment;
      return undefined;
    }

    /** Clear this list of attachments. */
    public clear() {
      this.list.length = 0;
    }

    /** Add an attachment to this list of attachments. */
    public add(attachment: Attachment) {
      this._allLoaded = this._allLoaded && (attachment.loadStatus === TileTree.LoadStatus.Loaded);
      this.list.push(attachment);
    }

    /** Drop an attachment from this list by reference. */
    public drop(attachment: Attachment) {
      const idx = this.list.indexOf(attachment);
      if (idx !== -1)
        this.list.splice(idx, 1);
      this.updateAllLoaded();
    }

    /** Update the flag on this attachments list recording whether or not all attachments have loaded tile trees. */
    public updateAllLoaded() {
      this._allLoaded = true;
      for (const attachment of this.list) {
        if (attachment.loadStatus !== TileTree.LoadStatus.Loaded) {
          this._allLoaded = false;
          break;
        }
      }
    }

    /** Load the tile tree for the attachment at the given index. Returns the load status of that attachment. */
    public load(idx: number, sheetView: SheetViewState): TileTree.LoadStatus {
      assert(idx < this.length);

      const attachment = this.list[idx];
      if (attachment.tree !== undefined)
        return TileTree.LoadStatus.Loaded;

      attachment.load(sheetView);
      if (attachment.loadStatus === TileTree.LoadStatus.NotFound || attachment.loadStatus === TileTree.LoadStatus.NotLoaded)
        this.list.splice(idx, 1);

      this.updateAllLoaded();
      return attachment.loadStatus;
    }
  }
}
