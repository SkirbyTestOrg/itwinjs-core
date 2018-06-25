/*---------------------------------------------------------------------------------------------
| $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Views */

import {
  Vector3d, XYZ, Point3d, Point2d, XAndY, LowAndHighXY, LowAndHighXYZ, Arc3d, Range3d, AxisOrder, Angle, AngleSweep,
  RotMatrix, Transform, Map4d, Point4d, Constant,
} from "@bentley/geometry-core";
import { ViewState, StandardViewId, ViewStatus, MarginPercent, GridOrientationType } from "./ViewState";
import { BeEvent, BeDuration, BeTimePoint, Id64, StopWatch } from "@bentley/bentleyjs-core";
import { BeCursor } from "./tools/Tool";
import { EventController } from "./tools/EventController";
import { AuxCoordSystemState, ACSDisplayOptions } from "./AuxCoordSys";
import { IModelConnection } from "./IModelConnection";
import { HitDetail, SnapDetail, SnapMode } from "./HitDetail";
import { DecorateContext, SceneContext } from "./ViewContext";
import { TileRequests } from "./tile/TileTree";
import { LegacyMath } from "@bentley/imodeljs-common/lib/LegacyMath";
import { Hilite, Camera, ColorDef, Frustum, Npc, NpcCorners, NpcCenter, Placement3dProps, Placement2dProps, Placement2d, Placement3d, AntiAliasPref } from "@bentley/imodeljs-common";
import { IModelApp } from "./IModelApp";
import { Decorations, DecorationList, RenderTarget, RenderPlan, Pixel } from "./render/System";
import { UpdatePlan } from "./render/UpdatePlan";
import { ViewFlags } from "@bentley/imodeljs-common";
import { FeatureSymbology } from "./render/FeatureSymbology";

/** Viewport synchronization flags */
export class SyncFlags {
  private decorations = false;
  private scene = false;
  private renderPlan = false;
  private controller = false;
  private rotatePoint = false;
  private redrawPending = false;
  public get isValidDecorations(): boolean { return this.decorations; }
  public get isValidScene(): boolean { return this.scene; }
  public get isValidController(): boolean { return this.controller; }
  public get isValidRenderPlan(): boolean { return this.renderPlan; }
  public get isValidRotatePoint(): boolean { return this.rotatePoint; }
  public get isRedrawPending(): boolean { return this.redrawPending; }
  public invalidateDecorations(): void { this.decorations = false; }
  public invalidateScene(): void { this.scene = false; this.invalidateDecorations(); }
  public invalidateRenderPlan(): void { this.renderPlan = false; this.invalidateScene(); }
  public invalidateController(): void { this.controller = false; this.invalidateRenderPlan(); }
  public invalidateRotatePoint(): void { this.rotatePoint = false; }
  public invalidateRedrawPending(): void { this.redrawPending = false; }
  public setValidDecorations(): void { this.decorations = true; }
  public setValidScene(): void { this.scene = true; }
  public setValidController(): void { this.controller = true; }
  public setValidRenderPlan(): void { this.renderPlan = true; }
  public setValidRotatePoint(): void { this.rotatePoint = true; }
  public setRedrawPending(): void { this.redrawPending = true; }
  public initFrom(other: SyncFlags): void { this.decorations = other.decorations; this.scene = other.scene; this.renderPlan = other.renderPlan; this.controller = other.controller; this.rotatePoint = other.rotatePoint; this.redrawPending = other.redrawPending; }
}

/** A rectangle in integer view coordinates with (0,0) corresponding to the top-left corner of the view. */
export class ViewRect {
  private _left!: number;
  private _top!: number;
  private _right!: number;
  private _bottom!: number;

  public constructor(left = 0, top = 0, right = 0, bottom = 0) { this.init(left, top, right, bottom); }

  public get left(): number { return this._left; }
  public set left(val: number) { this._left = Math.floor(val); }
  public get top(): number { return this._top; }
  public set top(val: number) { this._top = Math.floor(val); }
  public get right(): number { return this._right; }
  public set right(val: number) { this._right = Math.floor(val); }
  public get bottom(): number { return this._bottom; }
  public set bottom(val: number) { this._bottom = Math.floor(val); }

  public get isNull(): boolean { return this.right <= this.left || this.bottom <= this.top; }
  public get isValid(): boolean { return !this.isNull; }

  public get width() { return this.right - this.left; }
  public set width(width: number) { this.right = this.left + width; }
  public get height() { return this.bottom - this.top; }
  public set height(height: number) { this.bottom = this.top + height; }
  public get aspect() { return this.isNull ? 1.0 : this.width / this.height; }
  public get area() { return this.isNull ? 0 : this.width * this.height; }

  public init(left: number, top: number, right: number, bottom: number) { this.left = left; this.bottom = bottom, this.right = right; this.top = top; }
  public initFromPoint(low: XAndY, high: XAndY): void { this.init(low.x, low.y, high.x, high.y); }
  public initFromRange(input: LowAndHighXY): void { this.initFromPoint(input.low, input.high); }

  public equals(rhs: ViewRect): boolean { return this.left === rhs.left && this.right === rhs.right && this.bottom === rhs.bottom && this.top === rhs.top; }
  public copyFrom(other: ViewRect): void { this.init(other.left, other.top, other.right, other.bottom); }
  public clone(out?: ViewRect): ViewRect {
    if (undefined !== out) {
      out.copyFrom(this);
      return out;
    }
    return new ViewRect(this.left, this.top, this.right, this.bottom);
  }

  /** Determine if this ViewRect is contained entirely within the bounds of another ViewRect. */
  public isContained(other: ViewRect): boolean {
    return this.left >= other.left && this.right <= other.right && this.bottom <= other.bottom && this.top >= other.top;
  }

  public containsPoint(point: XAndY): boolean {
    return point.x >= this.left && point.x < this.right && point.y >= this.top && point.y < this.bottom;
  }

  public overlaps(other: ViewRect, overlap?: ViewRect): boolean {
    const maxOrgX = Math.max(this.left, other.left);
    const maxOrgY = Math.max(this.top, other.top);
    const minCrnX = Math.min(this.right, other.right);
    const minCrnY = Math.min(this.bottom, other.bottom);

    if (maxOrgX > minCrnX || maxOrgY > minCrnY)
      return false;

    if (undefined !== overlap) {
      overlap.left = maxOrgX;
      overlap.right = minCrnX;
      overlap.top = maxOrgY;
      overlap.bottom = minCrnY;
    }

    return true;
  }

  public computeOverlap(other: ViewRect, out?: ViewRect): ViewRect | undefined {
    const result = undefined !== out ? out : new ViewRect();
    return this.overlaps(other, result) ? result : undefined;
  }
}

/**
 * The minimum and maximum values for the z-depth of a rectangle of screen space.
 *
 * Values are in [[CoordSystem.Npc]] so they will be between 0 and 1.0.
 */
export class DepthRangeNpc {
  /**
   * @param minimum The lowest (closest to back) value.
   * @param maximum The highest (closest to the front) value.
   */
  constructor(public minimum = 0, public maximum = 1.0) { }

  /** The value at the middle (halfway between the minimum and maximum) of this depth */
  public middle(): number { return this.minimum + ((this.maximum - this.minimum) / 2.0); }
}

/** Coordinate system types */
export const enum CoordSystem {
  /** Coordinates are relative to the origin of the screen. */
  Screen,

  /**
   * Coordinates are relative to the origin of the viewing rectangle.
   * x and y values correspond to pixels within that rectangle, with (x=0,y=0) corresponding to the top-left corner.
   */
  View,

  /**
   * Coordinates are in [Normalized Plane Coordinates]($docs/learning/glossary.md#npc). NPC is a coordinate system
   * for frustums in which each dimension [x,y,z] is normalized to hold values between 0.0 and 1.0.
   * [0,0,0] corresponds to the left-bottom-rear and [1,1,1] to the right-top-front of the frustum.
   */
  Npc,

  /**
   * Coordinates are in the coordinate system of the models in the view. For SpatialViews, this is the iModel's spatial coordinate system.
   * For 2d views, it is the coordinate system of the GeometricModel2d] that the view shows.
   */
  World,
}

/** Object to animate frustum transition of a viewport */
class Animator {
  private currFrustum = new Frustum();
  private startTime?: BeTimePoint;

  public constructor(public totalTime: BeDuration, public viewport: Viewport, public startFrustum: Frustum, public endFrustum: Frustum) { }

  public interpolateFrustum(fraction: number): void {
    for (let i = 0; i < Npc.CORNER_COUNT; ++i) {
      this.startFrustum.points[i].interpolate(fraction, this.endFrustum.points[i], this.currFrustum.points[i]);
    }
    this.viewport.setupViewFromFrustum(this.currFrustum);
  }

  private moveToTime(time: number) {
    const fraction = time / this.totalTime.milliseconds;
    this.interpolateFrustum(fraction);
  }

  /**
   * Move to the appropriate frame, based on the current time, for the current animation.
   * @return true when finished
   */
  public animate(): boolean {
    const currTime = BeTimePoint.now();
    if (!this.startTime)
      this.startTime = currTime;

    const totalTime = this.totalTime;
    const endTime = this.startTime.milliseconds + totalTime.milliseconds;

    if (endTime <= currTime.milliseconds) {
      this.moveToTime(totalTime.milliseconds);
      return true;
    }

    let done = false;
    let index = currTime.milliseconds - this.startTime.milliseconds;
    if (index > totalTime.milliseconds) {
      done = true;
      index = totalTime.milliseconds;
    }

    this.moveToTime(index);
    return done;
  }

  /** Abort this animation, moving to the final frame. */
  public interrupt(): void {
    if (this.startTime) {
      // We've been interrupted after animation began. Skip to the final animation state
      this.moveToTime(this.totalTime.milliseconds);
    }
  }
}

export const enum RemoveMe { No = 0, Yes = 1 }

/**
 * An object to animate a transition of viewport.
 * Only one animator may be associated with a viewport at a time. Registering a new
 * animator replaces any existing animator.
 * The animator's animate() function will be invoked just prior to the rendering of each frame.
 * The return value of animate() indicates whether to keep the animator active or to remove it.
 * The animator may also be removed in response to certain changes to the viewport - e.g., when
 * the viewport is closed, or its view controller changed, etc.
 */
export interface ViewportAnimator {
  /** Apply animation to the viewport. Return RemoveMe.Yes when animation is completed, causing the animator to be removed from the viewport. */
  animate(viewport: Viewport): RemoveMe;

  /**
   * Invoked when this ViewportAnimator is removed from the viewport, e.g. because it was replaced by a new animator, the viewport was closed -
   * that is, for any reason other than returning RemoveMe.Yes from animate()
   */
  onInterrupted(viewport: Viewport): void;
}

/**
 * A ViewportAnimator that animated decorations. While the animator is
 * active, decorations will be invalidated on each frame. The animator's
 * animateDecorations() function will be invoked to update any animation state; then
 * decorations will be re-requested and rendered.
 */
export class DecorationAnimator implements ViewportAnimator {
  private start: BeTimePoint;
  private stop: BeTimePoint;

  constructor(duration: BeDuration) {
    this.start = BeTimePoint.now();
    this.stop = this.start.plus(duration);
  }

  /**
   * Override to update animation state, which can then be used on the next call to produce decorations.
   * @param viewport The viewport being animated
   * @param durationPercent The ratio of duration elapsed, in [0.0,1.0]
   * @returns RemoveMe.Yes to immediately remove this animator, RemoveMe::No to continue animating until duration elapsed or animator interrupted.
   * If this animator is interrupted, this function will be immediately invoked with durationPercent=1.0.
   */
  public animateDecorations(_viewport: Viewport, _durationPercent: number): RemoveMe { return RemoveMe.No; }

  public animate(vp: Viewport): RemoveMe {
    vp.invalidateDecorations();
    const total = this.stop.milliseconds - this.start.milliseconds;
    const elapsed = BeTimePoint.now().milliseconds - this.start.milliseconds;
    const ratio = Math.min(elapsed / total, 1.0);
    const removeMe = this.animateDecorations(vp, ratio);
    return (RemoveMe.Yes === removeMe || ratio === 1.0) ? RemoveMe.Yes : RemoveMe.No;
  }

  public onInterrupted(vp: Viewport): void {
    vp.invalidateDecorations();
    this.animateDecorations(vp, 1.0);
  }
}

/**
 * A Viewport renders one or more Models onto an `HTMLCanvasElement`.
 *
 * It holds a [[ViewState]] object that defines its viewing parameters. [[ViewTool]]s may
 * modify the ViewState object. Changes to the ViewState are only reflected in a Viewport after the
 * [[synchWithView]] method is called.
 *
 * As changes to ViewState are made, Viewports also hold a stack of *previous copies* of it, to allow
 * for undo/redo (i.e. *View Previous* and *View Next*) of viewing tools.
 */
export class Viewport {
  private zClipAdjusted = false;    // were the view z clip planes adjusted due to front/back clipping off?
  private readonly viewCorners: Range3d = new Range3d();
  private animator?: Animator;
  /** Time the current flash started */
  public flashUpdateTime?: BeTimePoint;
  /** Current flash intensity from [0..1] */
  public flashIntensity = 0;
  /** The length of time that the flash intensity will increase (in seconds) */
  public flashDuration = 0;
  private flashedElem?: string;         // id of currently flashed element
  /** Id of last flashed element */
  public lastFlashedElem?: string;
  private _viewCmdTargetCenter?: Point3d;
  /** @hidden */
  public frustFraction: number = 1.0;
  /** The number of entries in the view undo/redo buffer. */
  public maxUndoSteps = 20;
  private readonly forwardStack: ViewState[] = [];
  private readonly backStack: ViewState[] = [];
  private currentBaseline?: ViewState;
  private static nearScale24 = 0.0003; // max ratio of frontplane to backplane distance for 24 bit zbuffer
  private _evController?: EventController;
  private _view!: ViewState;
  /** @hidden */
  public readonly target: RenderTarget;
  private static get2dFrustumDepth() { return Constant.oneMeter; }
  /** @hidden */
  public readonly sync: SyncFlags = new SyncFlags();
  /** View origin, potentially expanded */
  public readonly viewOrigin = new Point3d();
  /** View delta, potentially expanded */
  public readonly viewDelta = new Vector3d();
  /** View origin (from ViewState, unexpanded) */
  public readonly viewOriginUnexpanded = new Point3d();
  /** View delta (from ViewState, unexpanded) */
  public readonly viewDeltaUnexpanded = new Vector3d();
  /** View rotation matrix (copied from ViewState) */
  public readonly rotMatrix = new RotMatrix();
  /** @hidden */
  public readonly rootToView = Map4d.createIdentity();
  /** @hidden */
  public readonly rootToNpc = Map4d.createIdentity();

  /** Event called whenever this viewport is synchronized with its ViewState. */
  public readonly onViewChanged = new BeEvent<(vp: Viewport) => void>();

  /** The settings that control how elements are hilited in this Viewport. */
  public readonly hilite = new Hilite.Settings();

  /**
   * Determine whether the Grid display is currently enabled in this Viewport.
   * @return true if the grid display is on.
   */
  public get isGridOn(): boolean { return this.viewFlags.showGrid(); }
  /** The [ViewFlags]($common) that determine how this Viewport is rendered.  */
  public get viewFlags(): ViewFlags { return this.view.viewFlags; }
  /** @hidden */
  public get wantAntiAliasLines(): AntiAliasPref { return AntiAliasPref.Off; }
  /** @hidden */
  public get wantAntiAliasText(): AntiAliasPref { return AntiAliasPref.Detect; }

  /** The iModel of this Viewport */
  public get iModel(): IModelConnection { return this.view.iModel; }

  /** @hidden */
  public isPointAdjustmentRequired(): boolean { return this.view.is3d(); }
  /** @hidden */
  public isSnapAdjustmentRequired(): boolean { return IModelApp.toolAdmin.acsPlaneSnapLock && this.view.is3d(); }
  /** @hidden */
  public isContextRotationRequired(): boolean { return IModelApp.toolAdmin.acsContextLock; }

  /** Construct a new Viewport
   * @param canvas The HTMLCanvasElement for the new Viewport
   * @param view a fully loaded (see discussion at [[ViewState.load]]) ViewState
   */
  constructor(public canvas: HTMLCanvasElement, viewState: ViewState) {
    this.target = IModelApp.renderSystem.createTarget(canvas);
    this.changeView(viewState);
    this.setCursor();
    this.saveViewUndo();
  }

  /** Get the ClientRect of the canvas for this Viewport. */
  public getClientRect(): ClientRect { return this.canvas.getBoundingClientRect(); }

  /** Set the event controller for this Viewport. Destroys previous controller, if one was defined. */
  public setEventController(controller: EventController | undefined) { if (this._evController) { this._evController.destroy(); } this._evController = controller; }

  /** The ViewState for this Viewport */
  public get view(): ViewState { return this._view; }
  /** @hidden */
  public get pixelsPerInch() { /* ###TODO: This is apparently unobtainable information in a browser... */ return 96; }
  public get viewCmdTargetCenter(): Point3d | undefined { return this._viewCmdTargetCenter; }
  public set viewCmdTargetCenter(center: Point3d | undefined) { this._viewCmdTargetCenter = center ? center.clone() : undefined; }
  /** True if this is a 3d view with the camera turned on. */
  public isCameraOn(): boolean { return this.view.is3d() && this.view.isCameraOn(); }
  /** @hidden */
  public invalidateDecorations() { this.sync.invalidateDecorations(); }
  /** @hidden */
  public changeDynamics(dynamics: DecorationList | undefined): void {
    this.target.changeDynamics(dynamics);
    this.invalidateDecorations();
  }

  /** Change the cursor for this Viewport */
  public setCursor(cursor: BeCursor = BeCursor.Default): void {
    if (cursor === BeCursor.OpenHand)
      this.canvas.style.cursor = "-webkit-grab";
    else if (cursor === BeCursor.ClosedHand)
      this.canvas.style.cursor = "-webkit-grabbing";
    else
      this.canvas.style.cursor = cursor;
  }

  /** Set or clear the currently *flashed* element.
   * @param id The Id of the element to flash. If undefined, remove (un-flash) the currently flashed element
   * @param duration The amount of time, in seconds, the flash intensity will increase (see [[flashDuration]])
   */
  public setFlashed(id: string | undefined, duration: number): void {
    if (id !== this.flashedElem) {
      this.lastFlashedElem = this.flashedElem;
      this.flashedElem = id;
    }
    this.flashDuration = duration;
  }

  public get auxCoordSystem(): AuxCoordSystemState { return this.view.auxiliaryCoordinateSystem; }
  public getAuxCoordRotation(result?: RotMatrix) { return this.auxCoordSystem.getRotation(result); }
  public getAuxCoordOrigin(result?: Point3d) { return this.auxCoordSystem.getOrigin(result); }

  private static copyOutput = (from: XYZ, to?: XYZ) => { let pt = from; if (to) { to.setFrom(from); pt = to; } return pt; };
  /** @hidden */
  public toView(from: XYZ, to?: XYZ) { this.rotMatrix.multiplyVectorInPlace(Viewport.copyOutput(from, to)); }
  /** @hidden */
  public fromView(from: XYZ, to?: XYZ) { this.rotMatrix.multiplyTransposeVectorInPlace(Viewport.copyOutput(from, to)); }

  /** Adjust the front and back planes to encompass the entire viewed volume */
  private adjustZPlanes(origin: Point3d, delta: Vector3d): void {
    const view = this.view;
    if (!view.is3d()) // only necessary for 3d views
      return;

    let extents = view.getViewedExtents() as Range3d;
    if (extents.isNull())
      return;

    // convert viewed extents in world coordinates to min/max in view aligned coordinates
    const viewTransform = Transform.createOriginAndMatrix(Point3d.createZero(), this.rotMatrix);
    const extFrust = Frustum.fromRange(extents);
    extFrust.multiply(viewTransform);
    extents = extFrust.toRange();

    this.rotMatrix.multiplyVectorInPlace(origin);       // put origin in view coordinates
    origin.z = extents.low.z;           // set origin to back of viewed extents
    delta.z = extents.high.z - origin.z; // and delta to front of viewed extents
    this.rotMatrix.multiplyTransposeVectorInPlace(origin);

    if (!view.isCameraOn())
      return;

    // if the camera is on, we need to make sure that the viewed volume is not behind the eye
    const eyeOrg = view.camera.getEyePoint().minus(origin);
    this.rotMatrix.multiplyVectorInPlace(eyeOrg);

    // if the distance from the eye to origin in less than 1 meter, move the origin away from the eye. Usually, this means
    // that the camera is outside the viewed extents and pointed away from it. There's nothing to see anyway.
    if (eyeOrg.z < 1.0) {
      this.rotMatrix.multiplyVectorInPlace(origin);
      origin.z -= (2.0 - eyeOrg.z);
      this.rotMatrix.multiplyTransposeVectorInPlace(origin);
      delta.z = 1.0;
      return;
    }

    // if part of the viewed extents are behind the eye, don't include that.
    if (delta.z > eyeOrg.z)
      delta.z = eyeOrg.z;
  }

  private validateCamera() {
    const view = this.view;
    if (!view.is3d())
      return;

    const camera = view.camera;
    camera.validateLens();
    if (camera.isFocusValid())
      return;

    const vDelta = view.getExtents();
    const maxDelta = vDelta.x > vDelta.y ? vDelta.x : vDelta.y;
    let focusDistance = maxDelta / (2.0 * Math.tan(camera.getLensAngle().radians / 2.0));

    if (focusDistance < vDelta.z / 2.0)
      focusDistance = vDelta.z / 2.0;

    const eyePoint = new Point3d(vDelta.x / 2.0, vDelta.y / 2.0, (vDelta.z / 2.0) + focusDistance);

    this.fromView(eyePoint);
    eyePoint.plus(view.getOrigin(), eyePoint);
    camera.setEyePoint(eyePoint);
    camera.setFocusDistance(focusDistance);
  }

  /**
   * Change the ViewState of this Viewport
   * @param view a fully loaded (see discussion at [[ViewState.load]] ) ViewState
   */
  public changeView(view: ViewState) {
    this.clearUndo();
    this._view = view;
    this.setupFromView();
    this.saveViewUndo();

    this.invalidateScene();
    this.sync.invalidateController();
    this.target.queueReset();
  }

  private invalidateScene(): void { this.sync.invalidateScene(); }

  private static readonly fullRangeNpc = new Range3d(0, 0, 0, 1, 1, 1); // full range of view (used in determineVisibleDepthNpcRange to avoid reinitializing)
  private static readonly depthRect = new ViewRect(); // used in determineVisibleDepthNpcRange to avoid reinitializing
  /**
   * Computes the range of depth values for a region of the screen
   * @param subRectView the subrange in view coordinates we wish to view
   * @param result optional DepthRangeNpc to store the result
   * @returns the minimum and maximum depth values within the region, or undefined.
   */
  public determineVisibleDepthNpcRange(subRectView?: Range3d, result?: DepthRangeNpc): DepthRangeNpc | undefined {
    if (result) { // Null result if given
      result.minimum = 1;
      result.maximum = 0;
    }

    // Default to a (0, 0, 0) to (1, 1, 1) range if no range was provided
    subRectView = subRectView ? subRectView : Viewport.fullRangeNpc;

    // Determine the screen rectangle in which to query visible depth min + max
    const newViewRect = Viewport.depthRect;
    newViewRect.initFromPoint(subRectView.low, subRectView.high);
    const readRect = newViewRect.computeOverlap(this.viewRect);
    if (undefined === readRect)
      return undefined;

    const pixels = this.readPixels(readRect, Pixel.Selector.Distance);
    if (!pixels)
      return undefined;

    let maximum = 0;
    let minimum = 1;
    const npc = Point3d.create();
    const testPoint = Point2d.create();
    for (testPoint.x = readRect.left; testPoint.x < readRect.right; testPoint.x++) {
      for (testPoint.y = readRect.top; testPoint.y < readRect.bottom; testPoint.y++) {
        if (this.getPixelDataNpcPoint(pixels, testPoint.x, testPoint.y, npc) !== undefined) {
          minimum = Math.min(minimum, npc.z);
          maximum = Math.max(maximum, npc.z);
        }
      }
    }

    if (maximum > 0) {
      if (undefined === result) {
        result = new DepthRangeNpc(minimum, maximum);
      } else {
        result.minimum = minimum;
        result.maximum = maximum;
      }

      return result;
    } else {
      return undefined;
    }
  }

  private static readonly scratchDefaultRotatePointLow = new Point3d(.5, .5, .5);
  private static readonly scratchDefaultRotatePointHigh = new Point3d(.5, .5, .5);
  public determineDefaultRotatePoint(out?: Point3d): Point3d {
    if (this.isCameraOn())
      return this.view.getTargetPoint(out);

    const scratch = Viewport.scratchDefaultRotatePointLow;
    scratch.x = scratch.y = scratch.z = 0.5;
    return this.npcToWorld(scratch, out);
  }

  public getFocusPlaneNpc(): number {
    const cameraTarget = this.view.getTargetPoint();
    let npcZ = this.worldToNpc(cameraTarget, cameraTarget).z;
    if (npcZ < 0.0 || npcZ > 1.0) {
      Viewport.scratchDefaultRotatePointHigh.z = 1.0;
      Viewport.scratchDefaultRotatePointLow.z = 0.0;
      const npcLow = this.npcToWorld(Viewport.scratchDefaultRotatePointLow);
      const npcHigh = this.npcToWorld(Viewport.scratchDefaultRotatePointHigh);
      const center = npcLow.interpolate(0.5, npcHigh);
      npcZ = this.worldToNpc(center, center).z;
    }

    return npcZ;
  }

  public turnCameraOn(lensAngle?: Angle): ViewStatus {
    const view = this.view;
    if (!view.is3d())
      return ViewStatus.InvalidViewport;

    if (!lensAngle)
      lensAngle = view.camera.lens;

    Camera.validateLensAngle(lensAngle);

    if (view.isCameraOn())
      return view.lookAtUsingLensAngle(view.getEyePoint(), view.getTargetPoint(), view.getYVector(), lensAngle);

    // We need to figure out a new camera target. To do that, we need to know where the geometry is in the view.
    // We use the depth of the center of the view for that.
    let depthRange = this.determineVisibleDepthNpcRange();
    if (!depthRange)
      depthRange = new DepthRangeNpc();
    const middle = depthRange.middle();
    const corners = [
      new Point3d(0.0, 0.0, middle), // lower left, at target depth
      new Point3d(1.0, 1.0, middle), // upper right at target depth
      new Point3d(0.0, 0.0, depthRange.maximum), // lower left, at closest npc
      new Point3d(1.0, 1.0, depthRange.maximum), // upper right at closest
    ];

    this.npcToWorldArray(corners);

    const eye = corners[2].interpolate(0.5, corners[3]); // middle of closest plane
    const target = corners[0].interpolate(0.5, corners[1]); // middle of halfway plane
    const backDist = eye.distance(target) * 2.0;
    const frontDist = view.minimumFrontDistance();
    return view.lookAtUsingLensAngle(eye, target, view.getYVector(), lensAngle, frontDist, backDist);
  }

  /* Get the extents of this view, in ViewCoordinates, as a Range3d */
  private getViewCorners(): Range3d {
    const corners = this.viewCorners;
    const viewRect = this.viewRect;
    corners.high.x = viewRect.right;
    corners.low.y = viewRect.bottom;    // y's are swapped on the screen!
    corners.low.x = 0;
    corners.high.y = 0;
    corners.low.z = -32767;
    corners.high.z = 32767;
    return corners;
  }

  private calcNpcToView(): Map4d {
    const corners = this.getViewCorners();
    return Map4d.createBoxMap(NpcCorners[Npc._000], NpcCorners[Npc._111], corners.low, corners.high)!;
  }

  /** adjust the aspect ratio of the view volume to match the aspect ratio of the window of this Viewport.
   *  modifies the point and vector given
   */
  private adjustAspectRatio(origin: Point3d, delta: Vector3d) {
    const windowAspect = this.viewRect.aspect * this.view.getAspectRatioSkew();
    const viewAspect = delta.x / delta.y;

    if (Math.abs(1.0 - (viewAspect / windowAspect)) < 1.0e-9)
      return;

    const oldDelta = delta.clone();
    if (viewAspect > windowAspect)
      delta.y = delta.x / windowAspect;
    else
      delta.x = delta.y * windowAspect;

    const newOrigin = origin.clone();
    this.toView(newOrigin);
    newOrigin.x += ((oldDelta.x - delta.x) / 2.0);
    newOrigin.y += ((oldDelta.y - delta.y) / 2.0);
    this.fromView(newOrigin, origin);
  }

  /** Ensure the rotation matrix for this view is aligns the root z with the view out (i.e. a "2d view"). */
  private alignWithRootZ() {
    const zUp = Vector3d.unitZ();
    if (zUp.isAlmostEqual(this.rotMatrix.rowZ()))
      return;
    const r = this.rotMatrix.transpose();
    r.setColumn(2, zUp);
    RotMatrix.createRigidFromRotMatrix(r, AxisOrder.ZXY, r);
    r.transpose(this.rotMatrix);
  }

  private readonly _viewRange: ViewRect = new ViewRect();

  /** Get the rectangle of this Viewport in ViewCoordinates. */
  public get viewRect(): ViewRect { this._viewRange.init(0, 0, this.canvas.clientWidth, this.canvas.clientHeight); return this._viewRange; }

  /** True if an undoable viewing operation exists on the stack */
  public get isUndoPossible(): boolean { return 0 < this.backStack.length; }

  /** True if an redoable viewing operation exists on the stack */
  public get isRedoPossible(): boolean { return 0 < this.forwardStack.length; }

  /** Clear the view undo buffers of this Viewport. */
  public clearUndo(): void {
    this.currentBaseline = undefined;
    this.forwardStack.length = 0;
    this.backStack.length = 0;
  }

  /**
   * Set the rotation of this Viewport to the supplied rotation, by rotating its ViewState about a point.
   * @param rotation The new rotation matrix for this Viewport's ViewState.
   * @param point The point to rotate about. If undefined, use the [[ViewState.getTargetPoint]].
   * @note This method calls [[setupFromView]] before it returns.
   */
  public setRotationAboutPoint(rotation: RotMatrix, point?: Point3d): void {
    if (undefined === point)
      point = this.view.getTargetPoint();

    const inverse = rotation.clone().inverse();
    if (undefined === inverse)
      return;

    const targetMatrix = inverse.multiplyMatrixMatrix(this.view.getRotation());
    const worldTransform = Transform.createFixedPointAndMatrix(point, targetMatrix);
    const frustum = this.getWorldFrustum();
    frustum.multiply(worldTransform);
    this.setupViewFromFrustum(frustum);
  }

  public setStandardRotation(id: StandardViewId): void {
    this.view.setStandardRotation(id);
    this.setupFromView();
  }

  /** Establish the parameters of this Viewport from the current information in its ViewState */
  public setupFromView(): ViewStatus {
    const view = this.view;
    if (!view)
      return ViewStatus.InvalidViewport;

    const origin = view.getOrigin().clone();
    const delta = view.getExtents().clone();
    this.rotMatrix.setFrom(view.getRotation());

    // first, make sure none of the deltas are negative
    delta.x = Math.abs(delta.x);
    delta.y = Math.abs(delta.y);
    delta.z = Math.abs(delta.z);

    const limits = this.view.getExtentLimits();
    const clampRange = (val: number) => Math.min(Math.max(limits.min, val), limits.max);
    delta.x = clampRange(delta.x);
    delta.y = clampRange(delta.y);

    this.adjustAspectRatio(origin, delta);

    this.viewOriginUnexpanded.setFrom(origin);
    this.viewDeltaUnexpanded.setFrom(delta);
    this.viewOrigin.setFrom(origin);
    this.viewDelta.setFrom(delta);
    this.zClipAdjusted = false;

    if (view.is3d()) {  // 3d viewport
      if (!view.allow3dManipulations()) {
        // we're in a "2d" view of a physical model. That means that we must have our orientation with z out of the screen with z=0 at the center.
        this.alignWithRootZ(); // make sure we're in a z Up view

        const extents = view.getViewedExtents();
        if (extents.isNull()) {
          extents.low.z = -Viewport.get2dFrustumDepth();
          extents.high.z = Viewport.get2dFrustumDepth();
        }

        let zMax = Math.max(Math.abs(extents.low.z), Math.abs(extents.high.z));
        zMax = Math.max(zMax, 1.0); // make sure we have at least +-1m. Data may be purely planar
        delta.z = 2.0 * zMax;
        origin.z = -zMax;
      } else {
        if (view.isCameraOn())
          this.validateCamera();

        this.adjustZPlanes(origin, delta); // make sure view volume includes entire volume of view

        // if the camera is on, don't allow front plane behind camera
        if (view.isCameraOn()) {
          const eyeOrg = view.camera.getEyePoint().minus(origin); // vector from eye to origin
          this.toView(eyeOrg);

          const frontDist = eyeOrg.z - delta.z; // front distance is backDist - delta.z

          // allow ViewState to specify a minimum front dist, but in no case less than 6 inches
          const minFrontDist = Math.max(15.2 * Constant.oneCentimeter, view.forceMinFrontDist);
          if (frontDist < minFrontDist) {
            // camera is too close to front plane, move origin away from eye to maintain a minimum front distance.
            this.toView(origin);
            origin.z -= (minFrontDist - frontDist);
            this.fromView(origin);
          }
        }

        // if we moved the z planes, set the "zClipAdjusted" flag.
        if (!origin.isExactEqual(this.viewOriginUnexpanded) || !delta.isExactEqual(this.viewDeltaUnexpanded))
          this.zClipAdjusted = true;
      }
    } else { // 2d viewport
      this.alignWithRootZ();
      delta.z = 2 * Viewport.get2dFrustumDepth();
      origin.z = -Viewport.get2dFrustumDepth();
    }

    this.viewOrigin.setFrom(origin);
    this.viewDelta.setFrom(delta);

    const frustFraction = this.computeRootToNpc(this.rootToNpc, origin, delta);
    if (frustFraction === undefined)
      return ViewStatus.InvalidViewport;

    this.frustFraction = frustFraction;
    this.rootToView.setFrom(this.calcNpcToView().multiplyMapMap(this.rootToNpc));

    this.sync.invalidateRenderPlan();
    this.sync.setValidController();

    this.onViewChanged.raiseEvent(this);
    return ViewStatus.Success;
  }

  /** Compute the root-to-npc map given an origin and delta. View orientation and camera comes from member variables. */
  private computeRootToNpc(rootToNpc: Map4d, inOrigin: Point3d, delta: Vector3d): number | undefined {
    const view = this.view;
    const viewRot = this.rotMatrix;
    const xVector = viewRot.rowX();
    const yVector = viewRot.rowY();
    const zVector = viewRot.rowZ();

    let frustFraction = 1.0;
    let xExtent: Vector3d;
    let yExtent: Vector3d;
    let zExtent: Vector3d;
    let origin: Point3d;

    // Compute root vectors along edges of view frustum.
    if (view.is3d() && view.isCameraOn()) {
      const camera = view.camera;
      const eyeToOrigin = Vector3d.createStartEnd(camera.eye, inOrigin); // vector from origin on backplane to eye
      this.toView(eyeToOrigin);                            // align with view coordinates.

      const focusDistance = camera.focusDist;
      let zDelta = delta.z;
      let zBack = eyeToOrigin.z;              // Distance from eye to backplane.
      let zFront = zBack + zDelta;            // Distance from eye to frontplane.

      if (zFront / zBack < Viewport.nearScale24) {
        const maximumBackClip = 10000 * Constant.oneKilometer;
        if (-zBack > maximumBackClip) {
          zBack = -maximumBackClip;
          eyeToOrigin.z = zBack;
        }

        zFront = zBack * Viewport.nearScale24;
        zDelta = zFront - eyeToOrigin.z;
      }

      // z out back of eye ====> origin z coordinates are negative.  (Back plane more negative than front plane)
      const backFraction = -zBack / focusDistance;    // Perspective fraction at back clip plane.
      const frontFraction = -zFront / focusDistance;  // Perspective fraction at front clip plane.
      frustFraction = frontFraction / backFraction;

      // delta.x,delta.y are view rectangle sizes at focus distance.  Scale to back plane:
      xExtent = xVector.scale(delta.x * backFraction);   // xExtent at back == delta.x * backFraction.
      yExtent = yVector.scale(delta.y * backFraction);   // yExtent at back == delta.y * backFraction.

      // Calculate the zExtent in the View coordinate system.
      zExtent = new Vector3d(
        eyeToOrigin.x * (frontFraction - backFraction), // eyeToOrigin.x * frontFraction - eyeToOrigin.x * backFraction
        eyeToOrigin.y * (frontFraction - backFraction), // eyeToOrigin.y * frontFraction - eyeToOrigin.y * backFraction
        zDelta);
      this.fromView(zExtent);   // rotate back to root coordinates.

      origin = new Point3d(
        eyeToOrigin.x * backFraction,   // Calculate origin in eye coordinates
        eyeToOrigin.y * backFraction,
        eyeToOrigin.z);

      this.fromView(origin);  // Rotate back to root coordinates
      origin.plus(camera.eye, origin); // Add the eye point.
    } else {
      origin = inOrigin.clone();
      xExtent = xVector.scale(delta.x);
      yExtent = yVector.scale(delta.y);
      zExtent = zVector.scale(delta.z);
    }

    // calculate the root-to-npc mapping (using expanded frustum)
    const newRootToNpc = Map4d.createVectorFrustum(origin, xExtent, yExtent, zExtent, frustFraction);
    if (!newRootToNpc)
      return undefined;

    rootToNpc.setFrom(newRootToNpc);  // Don't screw this up if we are returning ERROR (TR# 251771).
    this.frustFraction = frustFraction;
    return frustFraction;
  }

  /**
   * Check whether the ViewState of this Viewport has changed since the last call to this function.
   * If so, save a *clone* of the previous state in the view undo stack to permit View Undo.
   */
  private saveViewUndo(): void {
    if (!this._view)
      return;

    // the first time we're called we need to establish the "baseline"
    if (!this.currentBaseline) { this.currentBaseline = this.view.clone<ViewState>(); return; }

    if (this.view.equalState(this.currentBaseline)) // this does a deep compare of the ViewState plus DisplayStyle, CategorySelector, and ModelSelector
      return; // nothing changed, we're done

    if (this.backStack.length >= this.maxUndoSteps) // don't save more than max
      this.backStack.shift(); // remove the oldest entry

    this.backStack.push(this.currentBaseline); // save previous state
    this.forwardStack.length = 0; // not possible to do redo now

    this.currentBaseline = this.view.clone<ViewState>(); // now update our baseline to match the current state
  }

  /** Call [[setupFromView]] on this Viewport and save previous state in view undo stack */
  public synchWithView(saveInUndo: boolean): void {
    this.setupFromView();
    if (saveInUndo)
      this.saveViewUndo();
  }

  /** Convert an array of points from CoordSystem.View to CoordSystem.Npc */
  public viewToNpcArray(pts: Point3d[]): void {
    const corners = this.getViewCorners();
    const scrToNpcTran = Transform.createIdentity();
    Transform.initFromRange(corners.low, corners.high, undefined, scrToNpcTran);
    scrToNpcTran.multiplyPoint3dArrayInPlace(pts);
  }
  /** Convert an array of points from CoordSystem.Npc to CoordSystem.View */
  public npcToViewArray(pts: Point3d[]): void {
    const corners = this.getViewCorners();
    for (const p of pts)
      corners.fractionToPoint(p.x, p.y, p.z, p);
  }
  /**
   * Convert a point from CoordSystem.View to CoordSystem.Npc
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public viewToNpc(pt: Point3d, out?: Point3d): Point3d {
    const corners = this.getViewCorners();
    const scrToNpcTran = Transform.createIdentity();
    Transform.initFromRange(corners.low, corners.high, undefined, scrToNpcTran);
    return scrToNpcTran.multiplyPoint3d(pt, out);
  }
  /**
   * Convert a point from CoordSystem.Npc to CoordSystem.View
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public npcToView(pt: Point3d, out?: Point3d): Point3d {
    const corners = this.getViewCorners();
    return corners.fractionToPoint(pt.x, pt.y, pt.z, out);
  }
  /** Convert an array of points from CoordSystem.World to CoordSystem.Npc */
  public worldToNpcArray(pts: Point3d[]): void { this.rootToNpc.transform0.multiplyPoint3dArrayQuietNormalize(pts); }
  /** Convert an array of points from CoordSystem.Npc to CoordSystem.World */
  public npcToWorldArray(pts: Point3d[]): void { this.rootToNpc.transform1.multiplyPoint3dArrayQuietNormalize(pts); }
  /** Convert an array of points from CoordSystem.World to CoordSystem.View */
  public worldToViewArray(pts: Point3d[]): void { this.rootToView.transform0.multiplyPoint3dArrayQuietNormalize(pts); }
  /** Convert an array of points from CoordSystem.World to CoordSystem.View, as Point4ds */
  public worldToView4dArray(worldPts: Point3d[], viewPts: Point4d[]): void { this.rootToView.transform0.multiplyPoint3dArray(worldPts, viewPts); }
  /** Convert an array of points from CoordSystem.View to CoordSystem.World */
  public viewToWorldArray(pts: Point3d[]) { this.rootToView.transform1.multiplyPoint3dArrayQuietNormalize(pts); }
  /** Convert an array of points from CoordSystem.View as Point4ds to CoordSystem.World */
  public view4dToWorldArray(viewPts: Point4d[], worldPts: Point3d[]): void { this.rootToView.transform1.multiplyPoint4dArrayQuietRenormalize(viewPts, worldPts); }
  /**
   * Convert a point from CoordSystem.World to CoordSystem.Npc
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public worldToNpc(pt: Point3d, out?: Point3d): Point3d { return this.rootToNpc.transform0.multiplyPoint3dQuietNormalize(pt, out); }
  /**
   * Convert a point from CoordSystem.Npc to CoordSystem.World
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public npcToWorld(pt: Point3d, out?: Point3d): Point3d { return this.rootToNpc.transform1.multiplyPoint3dQuietNormalize(pt, out); }
  /**
   * Convert a point from CoordSystem.World to CoordSystem.View
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public worldToView(input: Point3d, out?: Point3d): Point3d { return this.rootToView.transform0.multiplyPoint3dQuietNormalize(input, out); }
  /**
   * Convert a point from CoordSystem.World to CoordSystem.View as Point4d
   * @param input the point to convert
   * @param out optional location for result. If undefined, a new Point4d is created.
   */
  public worldToView4d(input: Point3d, out?: Point4d): Point4d { return this.rootToView.transform0.multiplyPoint3d(input, 1.0, out); }
  /**
   * Convert a point from CoordSystem.View to CoordSystem.World
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public viewToWorld(input: Point3d, out?: Point3d): Point3d { return this.rootToView.transform1.multiplyPoint3dQuietNormalize(input, out); }
  /**
   * Convert a point from CoordSystem.View as a Point4d to CoordSystem.View
   * @param input the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public view4dToWorld(input: Point4d, out?: Point3d): Point3d { return this.rootToView.transform1.multiplyXYZWQuietRenormalize(input.x, input.y, input.z, input.w, out); }

  /** Converts inches to pixels based on screen DPI.
   * @Note this information may not be accurate in some browsers.
   * @param inches the number of inches to convert
   * @returns the corresponding number of pixels
   */
  public pixelsFromInches(inches: number): number { return inches * this.pixelsPerInch; }

  /**
   * Get an 8-point frustum corresponding to the 8 corners of the Viewport in the specified coordinate system.
   * There are two sets of corners that may be of interest.
   * The "adjusted" box is the one that is computed by examining the "viewed extents" and moving
   * the front and back planes to enclose everything in the view [N.B. this is the way that views implement
   * the concept of "no front/back clipping", since there always must be a view frustum].
   * The "unadjusted" box is the one that is stored in the ViewState.
   * @param sys Coordinate system for points
   * @param adjustedBox If true, retrieve the adjusted box. Otherwise retrieve the box that came from the view definition.
   * @param box optional Frustum for return value
   * @return the view frustum
   * @note The "adjusted" box may be either larger or smaller than the "unadjusted" box.
   */
  public getFrustum(sys: CoordSystem = CoordSystem.World, adjustedBox: boolean = true, box?: Frustum): Frustum {
    box = box ? box.initNpc() : new Frustum();

    // if they are looking for the "unexpanded" (that is before f/b clipping expansion) box, we need to get the npc
    // coordinates that correspond to the unexpanded box in the npc space of the Expanded view (that's the basis for all
    // of the root-based maps.)
    if (!adjustedBox && this.zClipAdjusted) {
      // to get unexpanded box, we have to go recompute rootToNpc from original View.
      const ueRootToNpc = Map4d.createIdentity();
      if (undefined === this.computeRootToNpc(ueRootToNpc, this.viewOriginUnexpanded, this.viewDeltaUnexpanded))
        return box; // invalid frustum

      // get the root corners of the unexpanded box
      const ueRootBox = new Frustum();
      ueRootToNpc.transform1.multiplyPoint3dArrayQuietNormalize(ueRootBox.points);

      // and convert them to npc coordinates of the expanded view
      this.worldToNpcArray(ueRootBox.points);
      box.setFrom(ueRootBox);
    }

    // now convert from NPC space to the specified coordinate system.
    switch (sys) {
      case CoordSystem.View:
        this.npcToViewArray(box.points);
        break;

      case CoordSystem.World:
        this.npcToWorldArray(box.points);
        break;

      // case CoordSystem.Screen:
    }
    return box;
  }

  /** get a copy of the current (adjusted) frustum of this viewport, in world coordinates. */
  public getWorldFrustum(box?: Frustum): Frustum { return this.getFrustum(CoordSystem.World, true, box); }

  /**
   * Scroll the view by a given number of pixels.
   * @param screenDist distance to scroll, in pixels
   */
  public scroll(screenDist: Point2d): ViewStatus {
    const view = this.view;
    if (!view)
      return ViewStatus.InvalidViewport;

    if (view.is3d() && view.isCameraOn()) {
      const offset = new Vector3d(screenDist.x, screenDist.y, 0.0);
      const frust = this.getFrustum(CoordSystem.View, false)!;
      frust.translate(offset);
      this.viewToWorldArray(frust.points);

      view.setupFromFrustum(frust);
      view.centerEyePoint();
      return this.setupFromView();
    }

    const pts = [new Point3d(), new Point3d(screenDist.x, screenDist.y, 0)];
    this.viewToWorldArray(pts);
    const dist = pts[1].minus(pts[0]);
    const newOrg = view.getOrigin().plus(dist);
    view.setOrigin(newOrg);

    return this.setupFromView();
  }

  /**
   * Zoom the view by a scale factor, placing the new center at the projection of the given point (world coordinates)
   * on the focal plane.
   * Updates ViewState and re-synchs Viewport. Does not save in view undo buffer.
   */
  public zoom(newCenter: Point3d | undefined, factor: number): ViewStatus {
    const view = this.view;
    if (!view)
      return ViewStatus.InvalidViewport;

    if (view.is3d() && view.isCameraOn()) {
      const centerNpc = newCenter ? this.worldToNpc(newCenter) : NpcCenter.clone();
      const scaleTransform = Transform.createFixedPointAndMatrix(centerNpc, RotMatrix.createScale(factor, factor, 1.0));

      const offset = centerNpc.minus(NpcCenter); // offset by difference of old/new center
      offset.z = 0.0;     // z center stays the same.

      const offsetTransform = Transform.createTranslationXYZ(offset.x, offset.y, offset.z);
      const product = offsetTransform.multiplyTransformTransform(scaleTransform);

      const frust = new Frustum();
      product.multiplyPoint3dArrayInPlace(frust.points);

      this.npcToWorldArray(frust.points);
      view.setupFromFrustum(frust);
      view.centerEyePoint();
      return this.setupFromView();
    }

    // for non-camera views, do the zooming by adjusting the origin and delta directly so there can be no
    // chance of the rotation changing due to numerical precision errors calculating it from the frustum corners.
    const delta = view.getExtents().clone();
    delta.x *= factor;
    delta.y *= factor;

    // first check to see whether the zoom operation results in an invalid view. If so, make sure we don't change anything
    const validSize = view.validateViewDelta(delta, false);
    if (ViewStatus.Success !== validSize)
      return validSize;

    const center = newCenter ? newCenter.clone() : view.getCenter().clone();

    if (!view.allow3dManipulations())
      center.z = 0.0;

    const newOrg = view.getOrigin().clone();
    this.toView(newOrg);
    this.toView(center);

    view.setExtents(delta);

    newOrg.x = center.x - delta.x / 2.0;
    newOrg.y = center.y - delta.y / 2.0;
    this.fromView(newOrg);
    view.setOrigin(newOrg);
    return this.setupFromView();
  }

  /**
   * Zoom the view to a show the tightest box around a given set of elements. Does not change view rotation.
   * @param placements element placement(s). Will zoom to the union of the placements.
   * @param margin the amount of white space to leave around elements
   * @note Updates ViewState and re-synchs Viewport. Does not save in view undo buffer.
   */
  public zoomToElements(placements: Placement3dProps[] | Placement2dProps[] | Placement2dProps | Placement3dProps, margin?: MarginPercent) {
    const viewTransform = Transform.createOriginAndMatrix(Point3d.createZero(), this.rotMatrix);
    const elemRange = Array.isArray(placements) ? placements : [placements];
    const hasAngle = (arg: any): arg is Placement2dProps => arg.angle !== undefined;

    const viewRange = new Range3d();
    for (const elRange of elemRange) {
      const placement = hasAngle(elRange) ? Placement2d.fromJSON(elRange) : Placement3d.fromJSON(elRange);
      const frust = Frustum.fromRange(placement.bbox);
      viewRange.extendArray(frust.points, viewTransform);
    }

    this.view.lookAtViewAlignedVolume(viewRange, this.viewRect.aspect, margin);
    this.setupFromView();
  }

  /**
   * Zoom the view to a volume of space, in world coordinates.
   * @param volume The low and high corners, in world coordinates.
   * @param margin the amount of white space to leave around elements
   * @note Updates ViewState and re-synchs Viewport. Does not save in view undo buffer.
   */
  public zoomToVolume(volume: LowAndHighXYZ | LowAndHighXY, margin?: MarginPercent) {
    const range = Range3d.fromJSON(volume);
    this.view.lookAtVolume(range, this.viewRect.aspect, margin);
    this.setupFromView();
  }

  /**
   * Shortcut to call view.setupFromFrustum and then [[setupFromView]]
   * @param inFrustum the new viewing frustum
   * @returns true if both steps were successful
   */
  public setupViewFromFrustum(inFrustum: Frustum): boolean {
    const validSize = this.view.setupFromFrustum(inFrustum);
    // note: always call setupFromView, even if setupFromFrustum failed
    return this.setupFromView() ? validSize === ViewStatus.Success : false;
  }

  /** Clear the view undo buffer and establish the current ViewState as the new baseline. */
  public resetUndo() {
    this.clearUndo();
    this.saveViewUndo();  // Set up new baseline state
  }

  /** @hidden */
  public computeViewRange(): Range3d {
    this.setupFromView(); // can't proceed if viewport isn't valid (not active)
    const viewRange = this.view.computeFitRange();

    return viewRange;
  }

  /**
   * Reverses the most recent change to the Viewport from the undo stack.
   */
  public doUndo(animationTime?: BeDuration) {
    if (0 === this.backStack.length)
      return;

    this.forwardStack.push(this.currentBaseline!);
    this.currentBaseline = this.backStack.pop()!;
    this.applyViewState(this.currentBaseline, animationTime);
  }

  /**
   * Re-applies the most recently un-done change to the Viewport from the redo stack
   */
  public doRedo(animationTime?: BeDuration) {
    if (0 === this.forwardStack.length)
      return;

    this.backStack.push(this.currentBaseline!);
    this.currentBaseline = this.forwardStack.pop()!;
    this.applyViewState(this.currentBaseline, animationTime);
  }

  /** @hidden */
  public animate() {
    if (this.animator && this.animator.animate()) {
      this.animator = undefined;
    }
  }

  /** @hidden */
  public removeAnimator() {
    if (this.animator) {
      this.animator.interrupt(); // will be destroyed
      this.animator = undefined;
    }
  }

  private setAnimator(animator: Animator) {
    this.removeAnimator();
    this.animator = animator;
  }

  /** @hidden */
  public animateFrustumChange(start: Frustum, end: Frustum, animationTime?: BeDuration) {
    if (!animationTime || 0.0 >= animationTime.milliseconds) {
      this.setupViewFromFrustum(end);
      return;
    }

    this.setAnimator(new Animator(animationTime, this, start, end));
  }

  /** @hidden */
  public applyViewState(val: ViewState, animationTime?: BeDuration) {
    const startFrust = this.getFrustum();
    this._view = val.clone<ViewState>();
    this.synchWithView(false);
    this.animateFrustumChange(startFrust, this.getFrustum(), animationTime);
  }

  private static roundGrid(num: number, units: number): number {
    const sign = ((num * units) < 0.0) ? -1.0 : 1.0;
    num = (num * sign) / units + 0.5;
    num = units * sign * Math.floor(num);
    return num;
  }

  private getGridOrientation(origin: Point3d, rMatrix: RotMatrix) {
    if (this.view.isSpatialView())
      origin.setFrom(this.iModel!.globalOrigin);

    switch (this.view.getGridOrientation()) {
      case GridOrientationType.View: {
        const center = this.view.getCenter();
        this.toView(center);
        this.toView(origin);
        origin.z = center.z;
        this.fromView(origin);
        break;
      }

      case GridOrientationType.WorldXY:
        break;

      case GridOrientationType.WorldYZ: {
        RotMatrix.createRows(rMatrix.getRow(1), rMatrix.getRow(2), rMatrix.getRow(0), rMatrix);
        break;
      }

      case GridOrientationType.WorldXZ: {
        RotMatrix.createRows(rMatrix.getRow(0), rMatrix.getRow(2), rMatrix.getRow(1), rMatrix);
        break;
      }
    }
  }

  private pointToStandardGrid(point: Point3d, rMatrix: RotMatrix, origin: Point3d): void {
    const planeNormal = rMatrix.getRow(2);

    let eyeVec: Vector3d;
    if (this.view.is3d() && this.isCameraOn())
      eyeVec = this.view.camera.eye.vectorTo(point);
    else
      eyeVec = this.rotMatrix.getRow(2).clone();

    eyeVec.normalizeInPlace();
    LegacyMath.linePlaneIntersect(point, point, eyeVec, origin, planeNormal, false);

    // // get origin and point in view coordinate system
    const pointView = point.clone();
    const originView = origin.clone();
    this.toView(pointView);
    this.toView(originView);

    // subtract off the origin
    pointView.y -= originView.y;
    pointView.x -= originView.x;

    // round off the remainder to the grid distances
    const gridSpacing = this.view.getGridSpacing();
    pointView.x = Viewport.roundGrid(pointView.x, gridSpacing.x);
    pointView.y = Viewport.roundGrid(pointView.y, gridSpacing.y);

    // add the origin back in
    pointView.x += originView.x;
    pointView.y += originView.y;

    // go back to root coordinate system
    this.fromView(pointView);
    point.setFrom(pointView);
  }

  /** @hidden */
  public pointToGrid(point: Point3d): void {
    if (GridOrientationType.AuxCoord === this.view.getGridOrientation()) {
      this.pointToStandardGrid(point, this.getAuxCoordRotation(), this.getAuxCoordOrigin());
      return;
    }

    const origin = new Point3d();
    const rMatrix = RotMatrix.createIdentity();
    this.getGridOrientation(origin, rMatrix);
    this.pointToStandardGrid(point, rMatrix, origin);
  }

  /**
   * Get the width of a pixel (a unit vector in the x direction in view coordinates) at a given point in world coordinates, returning the result in meters (world units).
   *
   * This is most useful to determine how large something is in a view. In particular, in a perspective view
   * the result of this method will be a larger number for points closer to the back of the view Frustum (that is,
   * one pixel of the view represents more spatial area at the back of the Frustum than the front.)
   * @param point The point to test, in World coordinates. If undefined, the center of the view in NPC space is used.
   * @returns The width of a view pixel at the supplied world point, in meters.
   */
  public getPixelSizeAtPoint(point?: Point3d): number {
    if (point === undefined)
      point = this.npcToWorld(NpcCenter); // if undefined, use center of view

    const worldPts: Point3d[] = [];
    const viewPts: Point4d[] = [];
    viewPts[0] = this.worldToView4d(point);
    viewPts[1] = viewPts[0].clone();
    viewPts[1].x += viewPts[1].w; // form a vector one pixel wide in x direction.
    this.view4dToWorldArray(viewPts, worldPts);

    return worldPts[0].distance(worldPts[1]);
  }

  /** Show the surface normal for geometry under the cursor when snapping. */
  private static drawLocateHitDetail(context: DecorateContext, aperture: number, hit: HitDetail): void {
    // NEEDS_WORK: Need to decide the fate of this...when/if to show it, etc.
    const vp = context.viewport!;
    if (!vp.view.is3d())
      return; // Not valuable in 2d...

    if (!(hit instanceof SnapDetail))
      return; // Don't display unless snapped...

    if (!hit.normal)
      return; // AccuSnap will flash edge/segment geometry...

    if (SnapMode.Nearest !== hit.snapMode && hit.isHot)
      return; // Only display if snap is nearest or NOT hot...surface normal is for hit location, not snap location...

    const color = new ColorDef(~vp.hilite.color.getRgb); // Invert hilite color for good contrast...
    const colorFill = color.clone();
    const pt = hit.getPoint();
    const radius = (2.5 * aperture) * vp.getPixelSizeAtPoint(pt);
    const normal = hit.normal;
    const rMatrix = RotMatrix.createRigidHeadsUp(normal);
    color.setTransparency(100);
    colorFill.setTransparency(200);

    const ellipse = Arc3d.createScaledXYColumns(pt, rMatrix, radius, radius, AngleSweep.create360())!;
    const graphic = context.createWorldOverlay();
    graphic.setSymbology(color, colorFill, 1);
    graphic.addArc(ellipse, true, true);
    graphic.addArc(ellipse, false, false);

    const length = (0.6 * radius);
    ellipse.vector0.normalize(normal);
    const pt1 = pt.plusScaled(normal, length);
    const pt2 = pt.plusScaled(normal, -length);
    graphic.addLineString([pt1, pt2]);
    ellipse.vector90.normalize(normal);
    pt.plusScaled(normal, length, pt1);
    pt.plusScaled(normal, -length, pt2);
    graphic.addLineString([pt1, pt2]);
    context.addWorldOverlay(graphic.finish()!);
  }

  /** draw a filled and outlined circle to represent the size of the location tolerance in the current view. */
  private static drawLocateCircle(context: DecorateContext, aperture: number, pt: Point3d): void {
    const radius = (aperture / 2.0) + .5;
    const center = context.viewport!.worldToView(pt);
    const ellipse = Arc3d.createXYEllipse(center, radius, radius);
    const ellipse2 = Arc3d.createXYEllipse(center, radius + 1, radius + 1);
    const graphic = context.createViewOverlay();
    const white = ColorDef.white.clone();
    const black = ColorDef.black.clone();
    white.setTransparency(165);
    graphic.setSymbology(white, white, 1);
    graphic.addArc2d(ellipse, true, true, 0.0);
    black.setTransparency(100);
    graphic.setSymbology(black, black, 1);
    graphic.addArc2d(ellipse2, false, false, 0.0);
    white.setTransparency(20);
    graphic.setSymbology(white, white, 1);
    graphic.addArc2d(ellipse, false, false, 0.0);
    context.addViewOverlay(graphic.finish()!);
  }

  /** @hidden */
  public drawLocateCursor(context: DecorateContext, pt: Point3d, aperture: number, isLocateCircleOn: boolean, hit?: HitDetail): void {
    if (hit)
      Viewport.drawLocateHitDetail(context, aperture, hit);

    if (isLocateCircleOn)
      Viewport.drawLocateCircle(context, aperture, pt);
  }

  /** Get a color that will contrast to the current background color of this Viewport. Either Black or White depending on which will have the most contrast. */
  public getContrastToBackgroundColor(): ColorDef {
    const bgColor = this.view.backgroundColor.colors;
    const invert = ((bgColor.r + bgColor.g + bgColor.b) > (255 * 3) / 2);
    return invert ? ColorDef.black : ColorDef.white; // should we use black or white?
  }

  private processFlash(): boolean {
    let needsFlashUpdate = false;

    if (this.flashedElem !== this.lastFlashedElem) {
      this.flashIntensity = 0.0;
      this.flashUpdateTime = BeTimePoint.now();
      this.lastFlashedElem = this.flashedElem; // flashing has begun; this is now the previous flash
      needsFlashUpdate = this.flashedElem === undefined; // notify render thread that flash has been turned off (signified by undefined elem)
    }

    if (this.flashedElem !== undefined && this.flashIntensity < 1.0) {
      const flashDuration = BeDuration.fromSeconds(this.flashDuration);
      const flashElapsed = BeTimePoint.now().milliseconds - this.flashUpdateTime!.milliseconds;
      this.flashIntensity = Math.min(flashElapsed, flashDuration.milliseconds) / flashDuration.milliseconds; // how intense do we want the flash effect to be from [0..1]?
      needsFlashUpdate = true;
    }

    return needsFlashUpdate;
  }

  /** @hidden */
  public renderFrame(plan: UpdatePlan): boolean {
    const sync = this.sync;
    const view = this.view;
    const target = this.target;

    // Start timer for tile loading time
    const timer = new StopWatch(undefined, true);

    this.animate();

    // Allow ViewState instance to change any state which might affect logic below...
    view.onRenderFrame();

    let isRedrawNeeded = sync.isRedrawPending;
    sync.invalidateRedrawPending();

    if (target.updateViewRect()) {
      target.onResized();
      sync.invalidateController();
    }

    if (view.isSelectionSetDirty) {
      if ((0 === view.iModel.hilited.size && 0 === view.iModel.selectionSet.size) || (view.iModel.hilited.size > 0 && 0 === view.iModel.selectionSet.size)) {
        target.setHiliteSet(view.iModel.hilited.elements); // only hilited has elements to send (or empty)
      } else if (0 === view.iModel.hilited.size && view.iModel.selectionSet.size > 0) {
        target.setHiliteSet(view.iModel.selectionSet.elements); // only selectionSet has elements to send
      } else { // combine both sets (they both have elements to send)
        const allHilites = new Set<string>();
        view.iModel.hilited.elements.forEach((val) => allHilites.add(val));
        view.iModel.selectionSet.elements.forEach((val) => allHilites.add(val));
        target.setHiliteSet(allHilites);
      }
      view.setSelectionSetDirty(false);
      isRedrawNeeded = true;
    }

    if (view.areFeatureOverridesDirty) {
      target.overrideFeatureSymbology(new FeatureSymbology.Overrides(view));
      view.setFeatureOverridesDirty(false);
      isRedrawNeeded = true;
    }

    if (!sync.isValidController)
      this.setupFromView();

    if (!sync.isValidScene) {
      const context = new SceneContext(this, new TileRequests());
      view.createScene(context);
      // ###TODO: request missing tiles
      target.changeScene(context.graphics);

      isRedrawNeeded = true;
      sync.setValidScene();
      // ###TODO? IModelApp.viewManager.notifyRenderSceneQueued(this);
    }

    if (!sync.isValidRenderPlan) {
      target.changeRenderPlan(new RenderPlan(this));
      sync.setValidRenderPlan();
      isRedrawNeeded = true;
    }

    if (!sync.isValidDecorations) {
      const decorations = new Decorations();
      this.prepareDecorations(plan, decorations);
      target.changeDecorations(decorations);
      isRedrawNeeded = true;
    }

    if (this.processFlash()) {
      target.setFlashed(new Id64(this.flashedElem!), this.flashIntensity);
      isRedrawNeeded = true;
    }

    timer.stop();
    if (isRedrawNeeded)
      target.drawFrame(timer.elapsedSeconds);

    return true;
  }

  /** @hidden */
  public prepareDecorations(plan: UpdatePlan, decorations: Decorations): void {
    this.sync.setValidDecorations();
    if (plan.wantDecorators) {
      const context = new DecorateContext(this, decorations);
      IModelApp.viewManager.callDecorators(context);
    }
  }

  /** @hidden */
  public decorate(context: DecorateContext): void {
    this.view.decorate(context);
    this.view.drawGrid(context);
    if (context.viewFlags.showAcsTriad())
      this.view.auxiliaryCoordinateSystem.display(context, (ACSDisplayOptions.CheckVisible | ACSDisplayOptions.Active));
  }

  /** @hidden */
  public requestScene(_plan: UpdatePlan): void { }

  /**
   * Read selected data about each pixel within a rectangular region of the viewport.
   * @param rect The area of the viewport's contents to read. The origin specifies the upper-left corner. Must lie entirely within the viewport's dimensions.
   * @param selector Specifies which aspect(s) of data to read.
   * @returns a Pixel.Buffer object from which the selected data can be retrieved, or undefined in the viewport is not active, the rect is out of bounds, or some other error.
   */
  public readPixels(rect: ViewRect, selector: Pixel.Selector): Pixel.Buffer | undefined {
    const viewRect = this.viewRect;
    if (!rect.isContained(viewRect))
      return undefined;

    return this.target.readPixels(rect, selector);
  }

  /**
   * Attempt to determine the nearest visible geometry point within radius of supplied pick point.
   * @param pickPoint Center point in world coordinates
   * @param radius Integer radius of the circular area to include, in pixels
   * @param out Optional Point3d pre-allocated to hold the result
   * @returns the coordinates of the point within the circular area which is closest to the camera.
   */
  public determineNearestVisibleGeometryPoint(pickPoint: Point3d, radius: number, out?: Point3d): Point3d | undefined {
    radius = Math.floor(radius + 0.5);
    const inView = this.worldToView(pickPoint);
    const viewCenter = new Point2d(Math.floor(inView.x + 0.5), Math.floor(inView.y + 0.5));
    const viewRect = this.viewRect;
    const pickRect = new ViewRect(viewCenter.x - radius, viewCenter.y - radius, viewCenter.x + radius + 1, viewCenter.y + radius + 1);

    const overlapRect = pickRect.computeOverlap(viewRect);
    if (undefined === overlapRect)
      return undefined;

    const pixels = this.readPixels(overlapRect, Pixel.Selector.Distance);
    if (undefined === pixels)
      return undefined;

    const testPoint = new Point2d();
    const result = undefined !== out ? out : new Point3d();
    for (testPoint.x = viewCenter.x - radius; testPoint.x <= viewCenter.x + radius; testPoint.x++) {
      for (testPoint.y = viewCenter.y - radius; testPoint.y <= viewCenter.y + radius; testPoint.y++) {
        if (overlapRect.containsPoint(testPoint) && this.getPixelDataWorldPoint(pixels, testPoint.x, testPoint.y, result))
          return result;
      }
    }

    return undefined;
  }

  public getPixelDataWorldPoint(pixels: Pixel.Buffer, x: number, y: number, out?: Point3d): Point3d | undefined {
    const npc = this.getPixelDataNpcPoint(pixels, x, y, out);
    if (undefined !== npc)
      this.npcToWorld(npc, npc);

    return npc;
  }

  public getPixelDataNpcPoint(pixels: Pixel.Buffer, x: number, y: number, out?: Point3d): Point3d | undefined {
    const z = pixels.getPixel(x, y).distanceFraction;
    if (z <= 0.0)
      return undefined;

    const result = undefined !== out ? out : new Point3d();
    const viewRect = this.viewRect;
    result.x = (x + 0.5 - viewRect.left) / viewRect.width;
    result.y = 1.0 - (y + 0.5 - viewRect.top) / viewRect.height;
    if (this.frustFraction < 1.0)
      result.z = z * this.frustFraction / (1.0 + z * (this.frustFraction - 1.0)); // correct to npc if camera on.
    else
      result.z = z;

    return result;
  }
}
