/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Views */

import { assert, BeDuration, BeEvent, BeTimePoint, dispose, Id64, Id64Arg, IDisposable, StopWatch, Id64Set } from "@bentley/bentleyjs-core";
import {
  Angle, AngleSweep, Arc3d, AxisOrder, Constant, Geometry, LowAndHighXY, LowAndHighXYZ, Map4d, Matrix3d,
  Plane3dByOriginAndUnitNormal, Point2d, Point3d, Point4d, Range3d, Ray3d, Transform, Vector3d, XAndY, XYAndZ, XYZ, SmoothTransformBetweenFrusta,
} from "@bentley/geometry-core";
import {
  AnalysisStyle, AntiAliasPref, Camera, ColorDef, ElementProps, Frustum, Hilite, ImageBuffer, Npc, NpcCenter,
  NpcCorners, Placement2d, Placement2dProps, Placement3d, PlacementProps, ViewFlags,
} from "@bentley/imodeljs-common";
import { AuxCoordSystemState } from "./AuxCoordSys";
import { ElementPicker, LocateOptions } from "./ElementLocateManager";
import { HitDetail, SnapDetail } from "./HitDetail";
import { IModelApp } from "./IModelApp";
import { IModelConnection } from "./IModelConnection";
import { ToolTipOptions } from "./NotificationManager";
import { FeatureSymbology } from "./render/FeatureSymbology";
import { GraphicType } from "./render/GraphicBuilder";
import { Decorations, GraphicList, Pixel, RenderPlan, RenderTarget } from "./render/System";
import { StandardView, StandardViewId } from "./StandardView";
import { Tile } from "./tile/TileTree";
import { EventController } from "./tools/EventController";
import { ToolSettings } from "./tools/ToolAdmin";
import { DecorateContext, SceneContext } from "./ViewContext";
import { GridOrientationType, MarginPercent, ViewState, ViewStatus } from "./ViewState";

/** An object which customizes the appearance of Features within a [[Viewport]].
 * Only one FeatureOverrideProvider may be associated with a viewport at a time. Setting a new FeatureOverrideProvider replaces any existing provider.
 * @see [[Viewport.featureOverrideProvider]]
 */
export interface FeatureOverrideProvider {
  addFeatureOverrides(overrides: FeatureSymbology.Overrides, viewport: Viewport): void;
}

/** Viewport synchronization flags. Synchronization is handled internally - do not use directly.
 * @hidden
 */
export class SyncFlags {
  private _decorations = false;
  private _scene = false;
  private _renderPlan = false;
  private _controller = false;
  private _rotatePoint = false;
  private _animationFraction = false;
  private _redrawPending = false;
  public get isValidDecorations(): boolean { return this._decorations; }
  public get isValidScene(): boolean { return this._scene; }
  public get isValidController(): boolean { return this._controller; }
  public get isValidRenderPlan(): boolean { return this._renderPlan; }
  public get isValidRotatePoint(): boolean { return this._rotatePoint; }
  public get isValidAnimationFraction(): boolean { return this._animationFraction; }
  public get isRedrawPending(): boolean { return this._redrawPending; }
  public invalidateDecorations(): void { this._decorations = false; }
  public invalidateScene(): void { this._scene = false; this.invalidateDecorations(); this.invalidateAnimationFraction(); }
  public invalidateRenderPlan(): void { this._renderPlan = false; this.invalidateScene(); }
  public invalidateController(): void { this._controller = false; this.invalidateRenderPlan(); }
  public invalidateRotatePoint(): void { this._rotatePoint = false; }
  public invalidateAnimationFraction(): void { this._animationFraction = false; }
  public invalidateRedrawPending(): void { this._redrawPending = false; }
  public setValidDecorations(): void { this._decorations = true; }
  public setValidScene(): void { this._scene = true; }
  public setValidController(): void { this._controller = true; }
  public setValidRenderPlan(): void { this._renderPlan = true; }
  public setValidRotatePoint(): void { this._rotatePoint = true; }
  public setValidAnimationFraction(): void { this._animationFraction = true; }
  public setRedrawPending(): void { this._redrawPending = true; }
  public initFrom(other: SyncFlags): void { this._decorations = other._decorations; this._scene = other._scene; this._renderPlan = other._renderPlan; this._controller = other._controller; this._rotatePoint = other._rotatePoint; this._animationFraction = other._animationFraction; this._redrawPending = other._redrawPending; }
}

/** A rectangle in integer view coordinates with (0,0) corresponding to the top-left corner of the view.
 *
 * Increasing **x** moves from left to right, and increasing **y** moves from top to bottom.
 * @public
 */
export class ViewRect {
  private _left!: number;
  private _top!: number;
  private _right!: number;
  private _bottom!: number;

  /** Construct a new ViewRect. */
  public constructor(left = 0, top = 0, right = 0, bottom = 0) { this.init(left, top, right, bottom); }
  /** The leftmost side of this ViewRect.  */
  public get left(): number { return this._left; }
  public set left(val: number) { this._left = Math.floor(val); }
  /** The topmost side of this ViewRect. */
  public get top(): number { return this._top; }
  public set top(val: number) { this._top = Math.floor(val); }
  /** The rightmost side of this ViewRect. */
  public get right(): number { return this._right; }
  public set right(val: number) { this._right = Math.floor(val); }
  /** The bottommost side of this ViewRect. */
  public get bottom(): number { return this._bottom; }
  public set bottom(val: number) { this._bottom = Math.floor(val); }
  /** True if this ViewRect has an area > 0. */
  public get isNull(): boolean { return this.right <= this.left || this.bottom <= this.top; }
  /** True if `!isNull` */
  public get isValid(): boolean { return !this.isNull; }
  /** The width (right-left) of this ViewRect. */
  public get width() { return this.right - this.left; }
  public set width(width: number) { this.right = this.left + width; }
  /** The height (bottom-top) of this ViewRect. */
  public get height() { return this.bottom - this.top; }
  public set height(height: number) { this.bottom = this.top + height; }
  /** The aspect ratio (width/height) of this ViewRect. */
  public get aspect() { return this.isNull ? 1.0 : this.width / this.height; }
  /** The area (width*height) of this ViewRect. */
  public get area() { return this.isNull ? 0 : this.width * this.height; }
  /** Initialize this ViewRect from its left/top/right/bottom parameters. */
  public init(left: number, top: number, right: number, bottom: number) { this.left = left; this.bottom = bottom, this.right = right; this.top = top; }
  /** Initialize this ViewRect from two points.
   * @param topLeft The top-left corner.
   * @param bottomRight The bottom-right corner.
   */
  public initFromPoints(topLeft: XAndY, bottomRight: XAndY): void { this.init(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y); }
  /** Initialize this ViewRect from a range.
   * @param input The Range to use. `input.low` defines the top-left and `input.high` defines the bottom-right.
   */
  public initFromRange(input: LowAndHighXY): void { this.initFromPoints(input.low, input.high); }
  /** Return true is this ViewRect is exactly equal to another ViewRect.
   * @param other The other ViewRect to compare
   */
  public equals(other: ViewRect): boolean { return this.left === other.left && this.right === other.right && this.bottom === other.bottom && this.top === other.top; }
  /** Initialize this ViewRect from another ViewRect. */
  public setFrom(other: ViewRect): void { this.init(other.left, other.top, other.right, other.bottom); }
  /** Duplicate this ViewRect.
   * @param result Optional ViewRect for result. If undefined, a new ViewRect is created.
   */
  public clone(result?: ViewRect): ViewRect {
    if (undefined !== result) {
      result.setFrom(this);
      return result;
    }
    return new ViewRect(this.left, this.top, this.right, this.bottom);
  }
  public extend(other: ViewRect) {
    if (this.left > other.left) this.left = other.left;
    if (this.top > other.top) this.top = other.top;
    if (this.right < other.right) this.right = other.right;
    if (this.bottom < other.bottom) this.bottom = other.bottom;
  }

  /** Inset this ViewRect by values in the x and y directions. Positive values make the ViewRect smaller, and negative values will make it larger.
   * @param deltaX The distance to inset the ViewRect in the x direction.
   * @param deltaY The distance to inset the ViewRect in the y direction.
   */
  public inset(deltaX: number, deltaY: number): void {
    if (this.width - 2 * deltaX <= 0 || this.height - 2 * deltaY <= 0) {
      this.init(0, 0, 0, 0);
      return;
    }
    this._left += deltaX;
    this._right -= deltaX;
    this._top += deltaY;
    this._bottom -= deltaY;
  }

  /** Inset this ViewRect by the same value in all directions.
   * @param offset The distance to inset this ViewRect. Positive values will make this ViewRect smaller and negative values will make it larger.
   * @note The inset operation can cause a previously valid ViewRect to become invalid.
   */
  public insetUniform(offset: number): void { this.inset(offset, offset); }

  /** Scale this ViewRect about its center by the supplied scale factors. */
  public scaleAboutCenter(xScale: number, yScale: number): void {
    const w = this.width;
    const h = this.height;
    const xDelta = (w - (w * xScale)) * 0.5;
    const yDelta = (h - (h * yScale)) * 0.5;
    this.inset(xDelta, yDelta);
  }

  /** Inset this ViewRect by a percentage of its current width.
   * @param percent The percentage of this ViewRect's width to inset in all directions.
   * @note The ViewRect will become smaller (or larger, if percent is negative) by `percent * width * 2` in each direction, since each side is moved by that distance.
   * @see [[inset]]
   */
  public insetByPercent(percent: number): void { this.insetUniform(this.width * percent); }

  /** Determine if this ViewRect is entirely contained within the bounds of another ViewRect. */
  public isContained(other: ViewRect): boolean { return this.left >= other.left && this.right <= other.right && this.bottom <= other.bottom && this.top >= other.top; }

  /** Return true if the supplied point is contained in this ViewRect.
   * @param point The point to test.
   * @note if the point is exactly on the left or top edges, this method returns true. If the point is exactly on the right or bottom edge, it returns false.
   */
  public containsPoint(point: XAndY): boolean { return point.x >= this.left && point.x < this.right && point.y >= this.top && point.y < this.bottom; }

  /** Determine whether this ViewRect overlaps another. */
  public overlaps(other: ViewRect): boolean { return this.left <= other.right && this.top <= other.bottom && this.right >= other.left && this.bottom >= other.top; }

  /** Return a ViewRect that is the overlap (intersection) of this ViewRect and another ViewRect.
   * If the two ViewRects are equal, their value is the result. Otherwise, the result will always be smaller than either of them.
   */
  public computeOverlap(other: ViewRect, out?: ViewRect): ViewRect | undefined {
    const maxOrgX = Math.max(this.left, other.left);
    const maxOrgY = Math.max(this.top, other.top);
    const minCrnX = Math.min(this.right, other.right);
    const minCrnY = Math.min(this.bottom, other.bottom);

    if (maxOrgX > minCrnX || maxOrgY > minCrnY)
      return undefined;

    const result = undefined !== out ? out : new ViewRect();
    result.left = maxOrgX;
    result.right = minCrnX;
    result.top = maxOrgY;
    result.bottom = minCrnY;
    return result;
  }
}

/** The minimum and maximum values for the z-depth of a rectangle of screen space.
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

/** Coordinate system types
 * @public
 */
export const enum CoordSystem {
  /** Coordinates are relative to the origin of the viewing rectangle.
   * x and y values correspond to pixels within that rectangle, with (x=0,y=0) corresponding to the top-left corner.
   */
  View,

  /** Coordinates are in [Normalized Plane Coordinates]($docs/learning/glossary.md#npc). NPC is a coordinate system
   * for frustums in which each dimension [x,y,z] is normalized to hold values between 0.0 and 1.0.
   * [0,0,0] corresponds to the left-bottom-rear and [1,1,1] to the right-top-front of the frustum.
   */
  Npc,

  /** Coordinates are in the coordinate system of the models in the view. For SpatialViews, this is the iModel's spatial coordinate system.
   * For 2d views, it is the coordinate system of the GeometricModel2d that the view shows.
   */
  World,
}

/** Object to animate a Frustum transition of a viewport. The [[Viewport]] will show as many frames as necessary during the supplied duration.
 * @see [[Viewport.animateFrustumChange]]
 */
class Animator {
  private readonly _currFrustum = new Frustum();
  private _startTime?: BeTimePoint;
  private _interpolator?: SmoothTransformBetweenFrusta;
  private moveToTime(time: number) { this.interpolateFrustum(time / this.totalTime.milliseconds); }

  /** Construct a new Animator.
   * @param totalTime The duration of the animation.
   * @param viewport The Viewport to animate.
   * @param startFrustum The Viewport's starting Frustum at the beginning of the animation.
   * @param endFrustum The Viewport's ending Frustum after the animation.
   */
  public constructor(public totalTime: BeDuration, public viewport: Viewport, public startFrustum: Frustum, public endFrustum: Frustum) {
    this._interpolator = SmoothTransformBetweenFrusta.create(startFrustum.points, endFrustum.points);
  }

  private interpolateFrustum(fraction: number): void {
    this._interpolator!.fractionToWorldCorners(fraction, this._currFrustum.points);
    this.viewport.setupViewFromFrustum(this._currFrustum);
  }

  /**
   * Move to the appropriate frame, based on the current time, for the current animation.
   * @return true when finished to terminate the animation.
   */
  public animate(): boolean {
    if (!this._interpolator) {
      this.viewport.setupViewFromFrustum(this.endFrustum);
      return true;
    }

    const currTime = BeTimePoint.now();
    if (!this._startTime)
      this._startTime = currTime;

    const totalTimeMillis = this.totalTime.milliseconds;
    const endTime = this._startTime.milliseconds + totalTimeMillis;

    if (endTime <= currTime.milliseconds) {
      this.moveToTime(totalTimeMillis);
      return true;
    }

    let done = false;
    let index = currTime.milliseconds - this._startTime.milliseconds;
    if (index > totalTimeMillis) {
      done = true;
      index = totalTimeMillis;
    }

    this.moveToTime(index);
    return done;
  }

  /** Abort this animation, moving immediately to the final frame. */
  public interrupt(): void {
    if (this._startTime)
      this.moveToTime(this.totalTime.milliseconds); // We've been interrupted after animation began. Skip to the final animation state
  }
}

/** Status for [[ViewportAnimator.animate]]. */
export const enum RemoveMe { No = 0, Yes = 1 }

/** An object to animate a transition of a [[Viewport]].
 * Only one animator may be associated with a viewport at a time. Registering a new
 * animator replaces any existing animator.
 * The animator's animate() function will be invoked just prior to the rendering of each frame.
 * The return value of animate() indicates whether to keep the animator active or to remove it.
 * The animator may also be removed in response to certain changes to the viewport - e.g., when
 * the viewport is closed, or its view controller changed, etc.
 */
export interface ViewportAnimator {
  /** Apply animation to the viewport. Return `RemoveMe.Yes` when animation is completed, causing the animator to be removed from the viewport. */
  animate(viewport: Viewport): RemoveMe;

  /** Invoked when this ViewportAnimator is removed from the viewport, e.g. because it was replaced by a new animator, the viewport was closed -
   * that is, for any reason other than returning RemoveMe.Yes from animate()
   */
  onInterrupted(viewport: Viewport): void;
}

/** A ViewportAnimator that animates decorations. While the animator is
 * active, decorations will be invalidated on each frame. The animator's
 * animateDecorations() function will be invoked to update any animation state; then
 * decorations will be re-requested and rendered.
 */
export class DecorationAnimator implements ViewportAnimator {
  private _start: BeTimePoint;
  private _stop: BeTimePoint;

  constructor(duration: BeDuration) {
    this._start = BeTimePoint.now();
    this._stop = this._start.plus(duration);
  }

  /** Override to update animation state, which can then be used on the next call to produce decorations.
   * @param viewport The viewport being animated
   * @param durationPercent The ratio of duration elapsed, in [0.0,1.0]
   * @returns RemoveMe.Yes to immediately remove this animator, RemoveMe::No to continue animating until duration elapsed or animator interrupted.
   * If this animator is interrupted, this function will be immediately invoked with durationPercent=1.0.
   */
  public animateDecorations(_viewport: Viewport, _durationPercent: number): RemoveMe { return RemoveMe.No; }

  public animate(vp: Viewport): RemoveMe {
    vp.invalidateDecorations();
    const total = this._stop.milliseconds - this._start.milliseconds;
    const elapsed = BeTimePoint.now().milliseconds - this._start.milliseconds;
    const ratio = Math.min(elapsed / total, 1.0);
    const removeMe = this.animateDecorations(vp, ratio);
    return (RemoveMe.Yes === removeMe || ratio === 1.0) ? RemoveMe.Yes : RemoveMe.No;
  }

  public onInterrupted(vp: Viewport): void {
    vp.invalidateDecorations();
    this.animateDecorations(vp, 1.0);
  }
}

/** Options that control how operations that change a view work. */
export interface ViewChangeOptions {
  /** Whether to save the result of this change into the view undo stack. Default is yes. */
  saveInUndo?: boolean;
  /** Whether the change should be animated or not. Default is yes. */
  animateFrustumChange?: boolean;
  /** Amount of time for animation. Default = `ToolSettings.animationTime` */
  animationTime?: BeDuration;
  /** The percentage of the view to leave blank around the edges. */
  marginPercent?: MarginPercent;
}

/** Options to allow changing the view rotation with zoomTo methods. */
export interface ZoomToOptions {
  /** Set view rotation from standard view identifier. */
  standardViewId?: StandardViewId;
  /** Set view rotation relative to placement of first element or props entry. */
  placementRelativeId?: StandardViewId;
  /** Set view rotation from Matrix3d. */
  viewRotation?: Matrix3d;
}

/** Supplies facilities for interacting with a [[Viewport]]'s frustum.
 * @hidden
 */
export class ViewFrustum {
  private static get2dFrustumDepth() { return Constant.oneMeter; }

  private readonly _viewCorners: Range3d = new Range3d();
  private readonly _aspectRatioLocked: boolean;
  /** @hidden */
  public frustFraction: number = 1.0;
  /** Maximum ratio of frontplane to backplane distance for 24 bit zbuffer */
  public static nearScale24 = 0.0003;

  /** View origin, potentially expanded */
  public readonly viewOrigin = new Point3d();
  /** View delta, potentially expanded */
  public readonly viewDelta = new Vector3d();
  /** View origin (from ViewState, unexpanded) */
  public readonly viewOriginUnexpanded = new Point3d();
  /** View delta (from ViewState, unexpanded) */
  public readonly viewDeltaUnexpanded = new Vector3d();
  /** View rotation matrix (copied from ViewState) */
  public readonly rotation = new Matrix3d();
  /** @hidden */
  public readonly worldToViewMap = Map4d.createIdentity();
  /** @hidden */
  public readonly worldToNpcMap = Map4d.createIdentity();

  /** @hidden */
  public readonly zClipAdjusted: boolean = false;    // were the view z clip planes adjusted due to front/back clipping off?
  /** @hidden */
  public readonly invalidFrustum: boolean = false;

  private _view: ViewState;

  /** The ViewState for this Viewport */
  public get view(): ViewState { return this._view; }
  public set view(view: ViewState) { this._view = view; }

  private readonly _viewRange: ViewRect = new ViewRect();

  private readonly _clientWidth: number;
  private readonly _clientHeight: number;

  private readonly _displayedPlane: Plane3dByOriginAndUnitNormal | undefined;

  /** Get the rectangle of this Viewport in ViewCoordinates. */
  private get _viewRect(): ViewRect { this._viewRange.init(0, 0, this._clientWidth, this._clientHeight); return this._viewRange; }

  private static _copyOutput(from: XYZ, to?: XYZ) { let pt = from; if (to) { to.setFrom(from); pt = to; } return pt; }

  /** @hidden */
  public toView(from: XYZ, to?: XYZ) { this.rotation.multiplyVectorInPlace(ViewFrustum._copyOutput(from, to)); }
  /** @hidden */
  public fromView(from: XYZ, to?: XYZ) { this.rotation.multiplyTransposeVectorInPlace(ViewFrustum._copyOutput(from, to)); }

  /** adjust the aspect ratio of the view volume to match the aspect ratio of the window of this Viewport.
   *  modifies the point and vector given
   *  @hidden
   */
  protected adjustAspectRatio(origin: Point3d, delta: Vector3d) {
    if (this._aspectRatioLocked)
      return;

    const windowAspect = this._viewRect.aspect * this.view.getAspectRatioSkew();
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
    if (zUp.isAlmostEqual(this.rotation.rowZ()))
      return;
    const r = this.rotation.transpose();
    r.setColumn(2, zUp);
    Matrix3d.createRigidFromMatrix3d(r, AxisOrder.ZXY, r);
    r.transpose(this.rotation);
    this.view.setRotation(this.rotation); // Don't let viewState and viewport rotation be different.
  }

  private validateCamera() {
    const view = this.view;
    if (!view.is3d())
      return;

    const camera = view.camera;
    camera.validateLens();
    if (camera.isFocusValid)
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

  /** Adjust the front and back planes to encompass the entire viewed volume */
  private adjustZPlanes(origin: Point3d, delta: Vector3d): void {
    const view = this.view;
    if (!view.is3d()) // only necessary for 3d views
      return;

    let extents = view.getViewedExtents() as Range3d;

    this.extendRangeForDisplayedPlane(extents);

    if (extents.isNull)
      return;

    // convert viewed extents in world coordinates to min/max in view aligned coordinates
    const viewTransform = Transform.createOriginAndMatrix(Point3d.createZero(), this.rotation);
    const extFrust = Frustum.fromRange(extents);
    extFrust.multiply(viewTransform);
    extents = extFrust.toRange();

    this.rotation.multiplyVectorInPlace(origin);       // put origin in view coordinates
    origin.z = extents.low.z;           // set origin to back of viewed extents
    delta.z = extents.high.z - origin.z; // and delta to front of viewed extents
    this.rotation.multiplyTransposeVectorInPlace(origin);

    if (!view.isCameraOn)
      return;

    // if the camera is on, we need to make sure that the viewed volume is not behind the eye
    const eyeOrg = view.camera.getEyePoint().minus(origin);
    this.rotation.multiplyVectorInPlace(eyeOrg);

    // if the distance from the eye to origin in less than 1 meter, move the origin away from the eye. Usually, this means
    // that the camera is outside the viewed extents and pointed away from it. There's nothing to see anyway.
    if (eyeOrg.z < 1.0) {
      this.rotation.multiplyVectorInPlace(origin);
      origin.z -= (2.0 - eyeOrg.z);
      this.rotation.multiplyTransposeVectorInPlace(origin);
      delta.z = 1.0;
      return;
    }

    // if part of the viewed extents are behind the eye, don't include that.
    if (delta.z > eyeOrg.z)
      delta.z = eyeOrg.z;
  }

  private extendRangeForDisplayedPlane(extents: Range3d) {
    const view = this.view;
    if (!view.is3d()) // only necessary for 3d views
      return;

    if (this._displayedPlane === undefined)
      return;

    const planeNormal = this._displayedPlane.getNormalRef();
    const viewZ = this.rotation.getRow(2);
    const onPlane = viewZ.crossProduct(planeNormal);   // vector on display plane.
    if (onPlane.magnitude() > 1.0E-8) {
      const intersect = new Point3d();
      const frustum = new Frustum();
      let includeHorizon = false;
      const worldToNpc = this.view.computeWorldToNpc(this.rotation, this.viewOrigin, this.viewDelta).map as Map4d;
      const minimumEyeDistance = 10.0;
      const horizonDistance = 10000;
      worldToNpc.transform1.multiplyPoint3dArrayQuietNormalize(frustum.points);

      for (let i = 0; i < 4; i++) {
        const frustumRay = Ray3d.createStartEnd(frustum.points[i + 4], frustum.points[i]);
        const intersectDistance = frustumRay.intersectionWithPlane(this._displayedPlane, intersect);
        if (intersectDistance !== undefined && (!view.isCameraOn || intersectDistance > 0.0))
          extents.extend(intersect);
        else includeHorizon = true;
      }
      if (includeHorizon) {
        const rangeCenter = extents.fractionToPoint(.5, .5, .5);
        const normal = onPlane.unitCrossProduct(planeNormal) as Vector3d; // on plane and parallel to view Z.
        extents.extend(rangeCenter.plusScaled(normal, horizonDistance));
      }
      if (view.isCameraOn) {
        extents.extend(view.getEyePoint().plusScaled(viewZ, -minimumEyeDistance));
      }

    } else {
      // display plane parallel to view....
      extents.extend(this._displayedPlane.getOriginRef().plusScaled(planeNormal, -1.0));
      extents.extend(this._displayedPlane.getOriginRef().plusScaled(planeNormal, 1.0));
    }
  }
  private calcNpcToView(): Map4d {
    const corners = this.getViewCorners();
    const map = Map4d.createBoxMap(NpcCorners[Npc._000], NpcCorners[Npc._111], corners.low, corners.high);
    assert(undefined !== map, "undefined npcToViewMap");
    return undefined === map ? Map4d.createIdentity() : map;
  }

  /* Get the extents of this view, in ViewCoordinates, as a Range3d */
  public getViewCorners(): Range3d {
    const corners = this._viewCorners;
    const viewRect = this._viewRect;
    corners.high.x = viewRect.right;
    corners.low.y = viewRect.bottom;    // y's are swapped on the screen!
    corners.low.x = 0;
    corners.high.y = 0;
    corners.low.z = -32767;
    corners.high.z = 32767;
    return corners;
  }

  private constructor(view: ViewState, clientWidth: number, clientHeight: number, aspectRatioLocked: boolean, displayedPlane?: Plane3dByOriginAndUnitNormal) {
    this._view = view;
    this._clientWidth = clientWidth;
    this._clientHeight = clientHeight;
    this._displayedPlane = displayedPlane;
    this._aspectRatioLocked = aspectRatioLocked;

    const origin = this.view.getOrigin().clone();
    const delta = this.view.getExtents().clone();
    this.rotation.setFrom(this.view.getRotation());

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

    if (this.view.is3d()) {  // 3d viewport
      if (!this.view.allow3dManipulations()) {
        // we're in a "2d" view of a physical model. That means that we must have our orientation with z out of the screen with z=0 at the center.
        this.alignWithRootZ(); // make sure we're in a z Up view

        const extents = this.view.getViewedExtents();
        if (extents.isNull) {
          extents.low.z = -ViewFrustum.get2dFrustumDepth();
          extents.high.z = ViewFrustum.get2dFrustumDepth();
        }

        let zMax = Math.max(Math.abs(extents.low.z), Math.abs(extents.high.z));
        zMax = Math.max(zMax, 1.0); // make sure we have at least +-1m. Data may be purely planar
        delta.z = 2.0 * zMax;
        origin.z = -zMax;
      } else {
        if (this.view.isCameraOn)
          this.validateCamera();

        this.adjustZPlanes(origin, delta); // make sure view volume includes entire volume of view

        // if the camera is on, don't allow front plane behind camera
        if (this.view.isCameraOn) {
          const eyeOrg = this.view.camera.getEyePoint().minus(origin); // vector from eye to origin
          this.toView(eyeOrg);

          const frontDist = eyeOrg.z - delta.z; // front distance is backDist - delta.z

          // allow ViewState to specify a minimum front dist, but in no case less than 6 inches
          const minFrontDist = Math.max(15.2 * Constant.oneCentimeter, this.view.forceMinFrontDist);
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
      delta.z = 2 * ViewFrustum.get2dFrustumDepth();
      origin.z = -ViewFrustum.get2dFrustumDepth();
    }

    this.viewOrigin.setFrom(origin);
    this.viewDelta.setFrom(delta);

    const newRootToNpc = this.view.computeWorldToNpc(this.rotation, origin, delta);
    if (newRootToNpc.map === undefined) { // invalid frustum
      this.invalidFrustum = true;
      return;
    }

    this.worldToNpcMap.setFrom(newRootToNpc.map);
    this.frustFraction = newRootToNpc.frustFraction;
    this.worldToViewMap.setFrom(this.calcNpcToView().multiplyMapMap(this.worldToNpcMap));
  }

  /** @hidden */
  public static createFromViewport(vp: Viewport, view?: ViewState): ViewFrustum | undefined {
    return new ViewFrustum(view !== undefined ? view : vp.view, vp.viewRect.width, vp.viewRect.height, vp.isAspectRatioLocked);
  }

  /** @hidden */
  public static createFromViewportAndPlane(vp: Viewport, plane: Plane3dByOriginAndUnitNormal): ViewFrustum | undefined {
    const vf = new ViewFrustum(vp.view, vp.viewRect.width, vp.viewRect.height, vp.isAspectRatioLocked, plane);
    return vf.invalidFrustum ? undefined : vf;
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
  /** Convert a point from CoordSystem.View to CoordSystem.Npc
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public viewToNpc(pt: Point3d, out?: Point3d): Point3d {
    const corners = this.getViewCorners();
    const scrToNpcTran = Transform.createIdentity();
    Transform.initFromRange(corners.low, corners.high, undefined, scrToNpcTran);
    return scrToNpcTran.multiplyPoint3d(pt, out);
  }
  /** Convert a point from CoordSystem.Npc to CoordSystem.View
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public npcToView(pt: Point3d, out?: Point3d): Point3d {
    const corners = this.getViewCorners();
    return corners.fractionToPoint(pt.x, pt.y, pt.z, out);
  }
  /** Convert an array of points from CoordSystem.World to CoordSystem.Npc */
  public worldToNpcArray(pts: Point3d[]): void { this.worldToNpcMap.transform0.multiplyPoint3dArrayQuietNormalize(pts); }
  /** Convert an array of points from CoordSystem.Npc to CoordSystem.World */
  public npcToWorldArray(pts: Point3d[]): void { this.worldToNpcMap.transform1.multiplyPoint3dArrayQuietNormalize(pts); }
  /** Convert an array of points from CoordSystem.World to CoordSystem.View */
  public worldToViewArray(pts: Point3d[]): void { this.worldToViewMap.transform0.multiplyPoint3dArrayQuietNormalize(pts); }
  /** Convert an array of points from CoordSystem.World to CoordSystem.View, as Point4ds */
  public worldToView4dArray(worldPts: Point3d[], viewPts: Point4d[]): void { this.worldToViewMap.transform0.multiplyPoint3dArray(worldPts, viewPts); }
  /** Convert an array of points from CoordSystem.View to CoordSystem.World */
  public viewToWorldArray(pts: Point3d[]) { this.worldToViewMap.transform1.multiplyPoint3dArrayQuietNormalize(pts); }
  /** Convert an array of points from CoordSystem.View as Point4ds to CoordSystem.World */
  public view4dToWorldArray(viewPts: Point4d[], worldPts: Point3d[]): void { this.worldToViewMap.transform1.multiplyPoint4dArrayQuietRenormalize(viewPts, worldPts); }
  /**
   * Convert a point from CoordSystem.World to CoordSystem.Npc
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public worldToNpc(pt: XYAndZ, out?: Point3d): Point3d { return this.worldToNpcMap.transform0.multiplyPoint3dQuietNormalize(pt, out); }
  /**
   * Convert a point from CoordSystem.Npc to CoordSystem.World
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public npcToWorld(pt: XYAndZ, out?: Point3d): Point3d { return this.worldToNpcMap.transform1.multiplyPoint3dQuietNormalize(pt, out); }
  /**
   * Convert a point from CoordSystem.World to CoordSystem.View
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public worldToView(input: XYAndZ, out?: Point3d): Point3d { return this.worldToViewMap.transform0.multiplyPoint3dQuietNormalize(input, out); }
  /**
   * Convert a point from CoordSystem.World to CoordSystem.View as Point4d
   * @param input the point to convert
   * @param out optional location for result. If undefined, a new Point4d is created.
   */
  public worldToView4d(input: XYAndZ, out?: Point4d): Point4d { return this.worldToViewMap.transform0.multiplyPoint3d(input, 1.0, out); }
  /**
   * Convert a point from CoordSystem.View to CoordSystem.World
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public viewToWorld(input: XYAndZ, out?: Point3d): Point3d { return this.worldToViewMap.transform1.multiplyPoint3dQuietNormalize(input, out); }
  /**
   * Convert a point from CoordSystem.View as a Point4d to CoordSystem.View
   * @param input the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public view4dToWorld(input: Point4d, out?: Point3d): Point3d { return this.worldToViewMap.transform1.multiplyXYZWQuietRenormalize(input.x, input.y, input.z, input.w, out); }

  /** Get an 8-point Frustum corresponding to the 8 corners of the Viewport in the specified coordinate system.
   *
   * There are two sets of corners that may be of interest.
   * The "adjusted" box is the one that is computed by examining the "viewed extents" and moving
   * the front and back planes to enclose everything in the view.
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
      const ueRootToNpc = this.view.computeWorldToNpc(this.rotation, this.viewOriginUnexpanded, this.viewDeltaUnexpanded);
      if (undefined === ueRootToNpc.map)
        return box; // invalid frustum

      // get the root corners of the unexpanded box
      const ueRootBox = new Frustum();
      ueRootToNpc.map.transform1.multiplyPoint3dArrayQuietNormalize(ueRootBox.points);

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
    }
    return box;
  }

  public getPixelSizeAtPoint(inPoint?: Point3d) {
    const viewPt = !!inPoint ? this.worldToView(inPoint) : this.npcToView(new Point3d(0.5, 0.5, 0.5));
    const viewPt2 = new Point3d(viewPt.x + 1.0, viewPt.y, viewPt.z);
    return this.viewToWorld(viewPt).distance(this.viewToWorld(viewPt2));
  }
}

/** A Viewport renders the contents of one or more Models onto an `HTMLCanvasElement`.
 *
 * It holds a [[ViewState]] object that defines its viewing parameters. [[ViewTool]]s may
 * modify the ViewState object. Changes to the ViewState are only reflected in a Viewport after the
 * [[synchWithView]] method is called.
 *
 * As changes to ViewState are made, Viewports also hold a stack of *previous copies* of it, to allow
 * for undo/redo (i.e. *View Previous* and *View Next*) of viewing tools.
 *
 * @see [[ViewManager]]
 * @public
 */
export abstract class Viewport implements IDisposable {
  /** Event called whenever this viewport is synchronized with its ViewState. */
  public readonly onViewChanged = new BeEvent<(vp: Viewport) => void>();
  /** Event called whenever this viewport's set of always-drawn elements changes. */
  public readonly onAlwaysDrawnChanged = new BeEvent<(vp: Viewport) => void>();
  /** Event called whenever this viewport's set of never-drawn elements changes. */
  public readonly onNeverDrawnChanged = new BeEvent<(vp: Viewport) => void>();

  private readonly _viewportId: number;
  private _animationFraction = 0.0;
  private _doContinuousRendering = false;
  private _animator?: Animator;
  /** Time the current flash started.
   * @hidden
   */
  public flashUpdateTime?: BeTimePoint;
  /** Current flash intensity from [0..1]
   * @hidden
   */
  public flashIntensity = 0;
  /** The length of time that the flash intensity will increase (in seconds)
   * @hidden
   */
  public flashDuration = 0;
  private _flashedElem?: string;         // id of currently flashed element
  /** Id of last flashed element.
   * @hidden
   */
  public lastFlashedElem?: string;
  /** Maximum ratio of frontplane to backplane distance for 24 bit zbuffer.
   * @hidden
   */
  public static nearScale24 = 0.0003;

  /** The number of tiles selected for display in the view as of the most recently-drawn frame.
   * The tiles selected may not meet the desired level-of-detail for the view, instead being temporarily drawn while
   * tiles of more appropriate level-of-detail are loaded asynchronously.
   * @note This member should be treated as read-only - it should only be modified internally.
   * @see Viewport.numRequestedTiles
   * @see Viewport.numReadyTiles
   */
  public numSelectedTiles = 0;

  /** The number of tiles which were ready and met the desired level-of-detail for display in the view as of the most recently-drawn frame.
   * These tiles may *not* have been selected because some other (probably sibling) tiles were *not* ready for display.
   * This is a useful metric for determining how "complete" the view is - e.g., one indicator of progress toward view completion can be expressed as:
   * `  (numReadyTiles) / (numReadyTiles + numRequestedTiles)`
   * @note This member should be treated as read-only - it should only be modified internally.
   * @see Viewport.numSelectedTiles
   * @see Viewport.numRequestedTiles
   */
  public numReadyTiles = 0;

  /** Don't allow entries in the view undo buffer unless they're separated by more than this amount of time. */
  public static undoDelay = BeDuration.fromSeconds(.5);
  private static _nextViewportId = 1;

  private _debugBoundingBoxes: Tile.DebugBoundingBoxes = Tile.DebugBoundingBoxes.None;
  private _freezeScene = false;
  private _viewFrustum!: ViewFrustum;
  private _target?: RenderTarget;
  private _fadeOutActive = false;
  private _neverDrawn?: Id64Set;
  private _alwaysDrawn?: Id64Set;
  private _alwaysDrawnExclusive: boolean = false;
  private _featureOverrideProvider?: FeatureOverrideProvider;

  /** @hidden */
  public get viewFrustum(): ViewFrustum { return this._viewFrustum; }

  /** This viewport's rotation matrix. */
  public get rotation(): Matrix3d { return this._viewFrustum.rotation; }
  /** The vector between the opposite corners of this viewport's extents. */
  public get viewDelta(): Vector3d { return this._viewFrustum.viewDelta; }
  /** Provides conversions between world and view coordinates. */
  public get worldToViewMap(): Map4d { return this._viewFrustum.worldToViewMap; }
  /** @hidden */
  public get frustFraction(): number { return this._viewFrustum.frustFraction; }

  /** @hidden */
  public get animationFraction(): number { return this._animationFraction; }
  /** @hidden */
  public set animationFraction(fraction: number) { this._animationFraction = fraction; this.sync.invalidateAnimationFraction(); }

  /** @hidden */
  protected readonly _viewRange: ViewRect = new ViewRect();

  /** Get the rectangle of this Viewport in [[CoordSystem.View]] coordinates. */
  public abstract get viewRect(): ViewRect;
  /** @hidden */
  public get isAspectRatioLocked(): boolean { return false; }

  /** @hidden */
  public get target(): RenderTarget {
    assert(undefined !== this._target, "Accessing RenderTarget of a disposed Viewport");
    return this._target!;
  }

  /** @hidden */
  public readonly sync = new SyncFlags();
  /** The settings that control how elements are hilited in this Viewport. */
  public hilite = new Hilite.Settings();

  /** Determine whether the Grid display is currently enabled in this Viewport.
   * @return true if the grid display is on.
   */
  public get isGridOn(): boolean { return this.viewFlags.grid; }
  /** The [ViewFlags]($common) that determine how the contents of this Viewport are rendered.  */
  public get viewFlags(): ViewFlags { return this.view.viewFlags; }
  /** @hidden */
  public get wantAntiAliasLines(): AntiAliasPref { return AntiAliasPref.Off; }
  /** @hidden */
  public get wantAntiAliasText(): AntiAliasPref { return AntiAliasPref.Detect; }

  /** Determines what type (if any) of debug graphics will be displayed to visualize [[Tile]] volumes.
   * @see [[Tile.DebugBoundingBoxes]]
   */
  public get debugBoundingBoxes(): Tile.DebugBoundingBoxes { return this._debugBoundingBoxes; }
  public set debugBoundingBoxes(boxes: Tile.DebugBoundingBoxes) {
    if (boxes !== this.debugBoundingBoxes) {
      this._debugBoundingBoxes = boxes;
      this.invalidateScene();
    }
  }
  /** When true, the scene will never be recreated. Chiefly for debugging purposes.
   * @hidden
   */
  public set freezeScene(freeze: boolean) {
    if (freeze !== this._freezeScene) {
      this._freezeScene = freeze;
      if (!freeze)
        this.invalidateScene();
    }
  }

  /** @hidden */
  public get analysisStyle(): AnalysisStyle | undefined { return this.view.analysisStyle; }
  /** The iModel of this Viewport */
  public get iModel(): IModelConnection { return this.view.iModel; }
  /** @hidden */
  public get isPointAdjustmentRequired(): boolean { return this.view.is3d(); }
  /** @hidden */
  public get isSnapAdjustmentRequired(): boolean { return IModelApp.toolAdmin.acsPlaneSnapLock && this.view.is3d(); }
  /** @hidden */
  public get isContextRotationRequired(): boolean { return IModelApp.toolAdmin.acsContextLock; }

  /** Enables or disables "fade-out" mode. When this mode is enabled, transparent graphics are rendered with a flat alpha weight,
   * causing them to appear de-emphasized. This is typically used in contexts in which a handful of elements are to be emphasized in the view,
   * while the rest of the graphics are drawn transparently.
   */
  public get isFadeOutActive(): boolean { return this._fadeOutActive; }
  public set isFadeOutActive(active: boolean) {
    if (active !== this._fadeOutActive) {
      this._fadeOutActive = active;
      this.invalidateRenderPlan();
    }
  }

  /** @hidden */
  protected constructor(target: RenderTarget) {
    this._target = target;
    this._viewportId = Viewport._nextViewportId++;
  }

  public dispose(): void {
    assert(undefined !== this._target, "Double disposal of Viewport");
    this._target = dispose(this._target);
    IModelApp.tileAdmin.forgetViewport(this);
  }

  /** @hidden */
  public get continuousRendering(): boolean { return this._doContinuousRendering; }
  /** @hidden */
  public set continuousRendering(contRend: boolean) { this._doContinuousRendering = contRend; }
  /** This gives each Viewport a unique ID, which can be used for comparing and sorting Viewport objects inside collections.
   * @hidden
   */
  public get viewportId(): number { return this._viewportId; }

  /** The ViewState for this Viewport */
  public get view(): ViewState { return this._viewFrustum.view; }
  /** @hidden */
  public get pixelsPerInch() { /* ###TODO: This is apparently unobtainable information in a browser... */ return 96; }
  /** @hidden */
  public get backgroundMapPlane() { return this.view.displayStyle.backgroundMapPlane; }

  /** IDs of a set of elements which should not be rendered within this view.
   * @note Do not modify this set directly - use [[setNeverDrawn]] or [[clearNeverDrawn]] instead.
   * @note This set takes precedence over the [[alwaysDrawn]] set - if an element is present in both sets, it is never drawn.
   */
  public get neverDrawn(): Id64Set | undefined { return this._neverDrawn; }

  /** IDs of a set of elements which should always be rendered within this view, regardless of category and subcategory visibility.
   * If the [[isAlwaysDrawnExclusive]] flag is also set, *only* those elements in this set will be drawn.
   * @note Do not modify this set directly - use [[setAlwaysDrawn]] or [[clearAlwaysDrawn]] instead.
   * @note The [[neverDrawn]] set takes precedence - if an element is present in both sets, it is never drawn.
   */
  public get alwaysDrawn(): Id64Set | undefined { return this._alwaysDrawn; }

  /** Clear the set of always-drawn elements.
   * @see [[alwaysDrawn]]
   */
  public clearAlwaysDrawn(): void {
    if ((undefined !== this.alwaysDrawn && 0 < this.alwaysDrawn.size) || this._alwaysDrawnExclusive) {
      if (undefined !== this.alwaysDrawn)
        this.alwaysDrawn.clear();

      this._alwaysDrawnExclusive = false;
      this.view.setFeatureOverridesDirty();
      this.onAlwaysDrawnChanged.raiseEvent(this);
    }
  }

  /** Clear the set of never-drawn elements.
   * @see [[neverDrawn]]
   */
  public clearNeverDrawn(): void {
    if (undefined !== this.neverDrawn && 0 < this.neverDrawn.size) {
      this.neverDrawn.clear();
      this.view.setFeatureOverridesDirty();
      this.onNeverDrawnChanged.raiseEvent(this);
    }
  }

  /** Specify the IDs of a set of elements which should never be rendered within this view.
   * @see [[neverDrawn]].
   */
  public setNeverDrawn(ids: Id64Set): void {
    this._neverDrawn = ids;
    this.view.setFeatureOverridesDirty();
    this.onNeverDrawnChanged.raiseEvent(this);
  }

  /** Specify the IDs of a set of elements which should always be rendered within this view, regardless of category and subcategory visibility.
   * @param ids The IDs of the elements to always draw.
   * @param exclusive If true, *only* the specified elements will be drawn.
   * @see [[alwaysDrawn]]
   * @see [[isAlwaysDrawnExclusive]]
   */
  public setAlwaysDrawn(ids: Id64Set, exclusive: boolean = false): void {
    this._alwaysDrawn = ids;
    this._alwaysDrawnExclusive = exclusive;
    this.view.setFeatureOverridesDirty();
    this.onAlwaysDrawnChanged.raiseEvent(this);
  }

  /** Returns true if the set of elements in the [[alwaysDrawn]] set are the *only* elements rendered within this view. */
  public get isAlwaysDrawnExclusive(): boolean { return this._alwaysDrawnExclusive; }

  /** Sets an object which can customize the appearance of [[Feature]]s within a viewport.
   * If defined, the provider will be invoked whenever the overrides are determined to need updating.
   * The overrides can be explicitly marked as needing a refresh by calling [[ViewState.setFeatureOverridesDirty]].
   * @see [[FeatureSymbology.Overrides]]
   */
  public set featureOverrideProvider(provider: FeatureOverrideProvider | undefined) {
    if (provider !== this._featureOverrideProvider) {
      this._featureOverrideProvider = provider;
      this.view.setFeatureOverridesDirty(true);
    }
  }

  /** Get the current FeatureOverrideProvider for this viewport if defined. */
  public get featureOverrideProvider(): FeatureOverrideProvider | undefined {
    return this._featureOverrideProvider;
  }

  /** True if this is a 3d view with the camera turned on. */
  public get isCameraOn(): boolean { return this.view.is3d() && this.view.isCameraOn; }
  /** @hidden */
  public invalidateDecorations() { this.sync.invalidateDecorations(); }
  /** @hidden */
  public invalidateRenderPlan() { this.sync.invalidateRenderPlan(); }
  /** @hidden */
  public changeDynamics(dynamics: GraphicList | undefined): void {
    this.target.changeDynamics(dynamics);
    this.invalidateDecorations();
  }

  /** Set or clear the currently *flashed* element.
   * @param id The Id of the element to flash. If undefined, remove (un-flash) the currently flashed element
   * @param duration The amount of time, in seconds, the flash intensity will increase (see [[flashDuration]])
   * @hidden
   */
  public setFlashed(id: string | undefined, duration: number): void {
    if (id !== this._flashedElem) {
      this.lastFlashedElem = this._flashedElem;
      this._flashedElem = id;
    }
    this.flashDuration = duration;
  }

  public get auxCoordSystem(): AuxCoordSystemState { return this.view.auxiliaryCoordinateSystem; }
  public getAuxCoordRotation(result?: Matrix3d) { return this.auxCoordSystem.getRotation(result); }
  public getAuxCoordOrigin(result?: Point3d) { return this.auxCoordSystem.getOrigin(result); }

  /** The number of outstanding requests for tiles to be displayed in this viewport.
   * @see Viewport.numSelectedTiles
   */
  public get numRequestedTiles(): number { return IModelApp.tileAdmin.getNumRequestsForViewport(this); }

  /** @hidden */
  public toView(from: XYZ, to?: XYZ) { this._viewFrustum.toView(from, to); }
  /** @hidden */
  public fromView(from: XYZ, to?: XYZ) { this._viewFrustum.fromView(from, to); }

  /** Change the ViewState of this Viewport
   * @param view a fully loaded (see discussion at [[ViewState.load]] ) ViewState
   */
  public changeView(view: ViewState) {
    this.doSetupFromView(view);
    this.invalidateScene();
    this.sync.invalidateController();
    this.target.reset();
  }

  /** @hidden */
  public invalidateScene(): void { this.sync.invalidateScene(); }

  /** Computes the range of npc depth values for a region of the screen
   * @param rect the rectangle to test. If undefined, test entire view
   * @param result optional DepthRangeNpc to store the result
   * @returns the minimum and maximum depth values within the region, or undefined.
   */
  public determineVisibleDepthRange(rect?: ViewRect, result?: DepthRangeNpc): DepthRangeNpc | undefined {
    if (result) { // Null result if given
      result.minimum = 1;
      result.maximum = 0;
    }

    // Default to a (0, 0, 0) to (1, 1, 1) range if no range was provided
    rect = (rect && rect.isValid) ? rect : this.viewRect;

    // Determine the screen rectangle in which to query visible depth min + max
    const readRect = rect.computeOverlap(this.viewRect);
    if (undefined === readRect)
      return undefined;

    let retVal: DepthRangeNpc | undefined;
    this.readPixels(readRect, Pixel.Selector.GeometryAndDistance, (pixels) => {
      if (!pixels)
        return;

      let maximum = 0;
      let minimum = 1;
      const frac = this._viewFrustum.frustFraction;
      for (let x = readRect.left; x < readRect.right; ++x) {
        for (let y = readRect.top; y < readRect.bottom; ++y) {
          let npcZ = pixels.getPixel(x, y).distanceFraction;
          if (npcZ <= 0.0)
            continue;

          if (frac < 1.0)
            npcZ *= frac / (1.0 + npcZ * (frac - 1.0));

          minimum = Math.min(minimum, npcZ);
          maximum = Math.max(maximum, npcZ);
        }
      }

      if (maximum <= 0)
        return;

      if (undefined === result) {
        result = new DepthRangeNpc(minimum, maximum);
      } else {
        result.minimum = minimum;
        result.maximum = maximum;
      }

      retVal = result;
    });

    return retVal;
  }

  /** Turn the camera on if it is currently off. If the camera is already on, adjust it to use the supplied lens angle.
   * @param lensAngle The lens angle for the camera. If undefined, use view.camera.lens.
   * @note This method will fail if the ViewState is not 3d.
   */
  public turnCameraOn(lensAngle?: Angle): ViewStatus {
    const view = this.view;
    if (!view.is3d())
      return ViewStatus.InvalidViewport;

    if (!lensAngle)
      lensAngle = view.camera.lens;

    Camera.validateLensAngle(lensAngle);

    if (view.isCameraOn)
      return view.lookAtUsingLensAngle(view.getEyePoint(), view.getTargetPoint(), view.getYVector(), lensAngle);

    // We need to figure out a new camera target. To do that, we need to know where the geometry is in the view.
    // We use the depth of the center of the view for that.
    let depthRange = this.determineVisibleDepthRange();
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

  /** Orient this viewport to one of the [[StandardView]] rotations. */
  public setStandardRotation(id: StandardViewId): void {
    this.view.setStandardRotation(id);
    this.setupFromView();
  }

  private doSetupFromView(view: ViewState) {
    const vf = ViewFrustum.createFromViewport(this, view);
    if (undefined === vf)
      return ViewStatus.InvalidViewport;

    this._viewFrustum = vf;

    this.sync.invalidateRenderPlan();
    this.sync.setValidController();

    this.onViewChanged.raiseEvent(this);
    return ViewStatus.Success;
  }

  /** Establish the parameters of this Viewport from the current information in its ViewState */
  public setupFromView(): ViewStatus {
    return this.doSetupFromView(this.view);
  }

  /** Call [[setupFromView]] on this Viewport and optionally save previous state in view undo stack */
  public synchWithView(_saveInUndo: boolean): void { this.setupFromView(); }

  /** Convert an array of points from CoordSystem.View to CoordSystem.Npc */
  public viewToNpcArray(pts: Point3d[]): void { this._viewFrustum.viewToNpcArray(pts); }
  /** Convert an array of points from CoordSystem.Npc to CoordSystem.View */
  public npcToViewArray(pts: Point3d[]): void { this._viewFrustum.npcToViewArray(pts); }
  /** Convert a point from CoordSystem.View to CoordSystem.Npc
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public viewToNpc(pt: Point3d, out?: Point3d): Point3d { return this._viewFrustum.viewToNpc(pt, out); }
  /** Convert a point from CoordSystem.Npc to CoordSystem.View
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public npcToView(pt: Point3d, out?: Point3d): Point3d { return this._viewFrustum.npcToView(pt, out); }
  /** Convert an array of points from CoordSystem.World to CoordSystem.Npc */
  public worldToNpcArray(pts: Point3d[]): void { this._viewFrustum.worldToNpcArray(pts); }
  /** Convert an array of points from CoordSystem.Npc to CoordSystem.World */
  public npcToWorldArray(pts: Point3d[]): void { this._viewFrustum.npcToWorldArray(pts); }
  /** Convert an array of points from CoordSystem.World to CoordSystem.View */
  public worldToViewArray(pts: Point3d[]): void { this._viewFrustum.worldToViewArray(pts); }
  /** Convert an array of points from CoordSystem.World to CoordSystem.View, as Point4ds */
  public worldToView4dArray(worldPts: Point3d[], viewPts: Point4d[]): void { this._viewFrustum.worldToView4dArray(worldPts, viewPts); }
  /** Convert an array of points from CoordSystem.View to CoordSystem.World */
  public viewToWorldArray(pts: Point3d[]) { this._viewFrustum.viewToWorldArray(pts); }
  /** Convert an array of points from CoordSystem.View as Point4ds to CoordSystem.World */
  public view4dToWorldArray(viewPts: Point4d[], worldPts: Point3d[]): void { this._viewFrustum.view4dToWorldArray(viewPts, worldPts); }
  /** Convert a point from CoordSystem.World to CoordSystem.Npc
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public worldToNpc(pt: XYAndZ, out?: Point3d): Point3d { return this._viewFrustum.worldToNpc(pt, out); }
  /** Convert a point from CoordSystem.Npc to CoordSystem.World
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public npcToWorld(pt: XYAndZ, out?: Point3d): Point3d { return this._viewFrustum.npcToWorld(pt, out); }
  /** Convert a point from CoordSystem.World to CoordSystem.View
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public worldToView(input: XYAndZ, out?: Point3d): Point3d { return this._viewFrustum.worldToView(input, out); }
  /** Convert a point from CoordSystem.World to CoordSystem.View as Point4d
   * @param input the point to convert
   * @param out optional location for result. If undefined, a new Point4d is created.
   */
  public worldToView4d(input: XYAndZ, out?: Point4d): Point4d { return this._viewFrustum.worldToView4d(input, out); }
  /** Convert a point from CoordSystem.View to CoordSystem.World
   * @param pt the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public viewToWorld(input: XYAndZ, out?: Point3d): Point3d { return this._viewFrustum.viewToWorld(input, out); }
  /** Convert a point from CoordSystem.View as a Point4d to CoordSystem.View
   * @param input the point to convert
   * @param out optional location for result. If undefined, a new Point3d is created.
   */
  public view4dToWorld(input: Point4d, out?: Point3d): Point3d { return this._viewFrustum.view4dToWorld(input, out); }

  /** Converts inches to pixels based on screen DPI.
   * @Note this information may not be accurate in some browsers.
   * @param inches the number of inches to convert
   * @returns the corresponding number of pixels
   */
  public pixelsFromInches(inches: number): number { return inches * this.pixelsPerInch; }

  /** Get an 8-point Frustum corresponding to the 8 corners of the Viewport in the specified coordinate system.
   *
   * There are two sets of corners that may be of interest.
   * The "adjusted" box is the one that is computed by examining the "viewed extents" and moving
   * the front and back planes to enclose everything in the view.
   * The "unadjusted" box is the one that is stored in the ViewState.
   * @param sys Coordinate system for points
   * @param adjustedBox If true, retrieve the adjusted box. Otherwise retrieve the box that came from the view definition.
   * @param box optional Frustum for return value
   * @return the view frustum
   * @note The "adjusted" box may be either larger or smaller than the "unadjusted" box.
   */
  public getFrustum(sys: CoordSystem = CoordSystem.World, adjustedBox: boolean = true, box?: Frustum): Frustum { return this._viewFrustum.getFrustum(sys, adjustedBox, box); }

  /** Get a copy of the current (adjusted) frustum of this viewport, in world coordinates. */
  public getWorldFrustum(box?: Frustum): Frustum { return this.getFrustum(CoordSystem.World, true, box); }

  private finishViewChange(startFrust: Frustum, options?: ViewChangeOptions) {
    options = options === undefined ? {} : options;
    this.synchWithView(options.saveInUndo === undefined || options.saveInUndo);
    if (options.animateFrustumChange === undefined || options.animateFrustumChange)
      this.animateFrustumChange(startFrust, this.getFrustum(), options.animationTime);
  }

  /** Scroll the view by a given number of pixels.
   * @param screenDist distance to scroll, in pixels
   */
  public scroll(screenDist: Point2d, options?: ViewChangeOptions) {
    const view = this.view;
    if (!view)
      return;

    const startFrust = this.getFrustum().clone();
    if (view.is3d() && view.isCameraOn) {
      const offset = new Vector3d(screenDist.x, screenDist.y, 0.0);
      const frust = this.getFrustum(CoordSystem.View, false)!;
      frust.translate(offset);
      this.viewToWorldArray(frust.points);
      view.setupFromFrustum(frust);
      view.centerEyePoint();
    } else {
      const pts = [new Point3d(), new Point3d(screenDist.x, screenDist.y, 0)];
      this.viewToWorldArray(pts);
      const dist = pts[1].minus(pts[0]);
      const newOrg = view.getOrigin().plus(dist);
      view.setOrigin(newOrg);
    }

    this.finishViewChange(startFrust, options);
  }

  /** Zoom the view by a scale factor, placing the new center at the projection of the given point (world coordinates)
   * on the focal plane.
   * Updates ViewState and re-synchs Viewport. Does not save in view undo buffer.
   */
  public zoom(newCenter: Point3d | undefined, factor: number, options?: ViewChangeOptions): void {
    const view = this.view;
    if (!view)
      return;

    const startFrust = this.getFrustum().clone();
    if (view.is3d() && view.isCameraOn) {
      const centerNpc = newCenter ? this.worldToNpc(newCenter) : NpcCenter.clone();
      const scaleTransform = Transform.createFixedPointAndMatrix(centerNpc, Matrix3d.createScale(factor, factor, 1.0));

      const offset = centerNpc.minus(NpcCenter); // offset by difference of old/new center
      offset.z = 0.0;     // z center stays the same.

      const offsetTransform = Transform.createTranslationXYZ(offset.x, offset.y, offset.z);
      const product = offsetTransform.multiplyTransformTransform(scaleTransform);

      const frust = new Frustum();
      product.multiplyPoint3dArrayInPlace(frust.points);

      this.npcToWorldArray(frust.points);
      view.setupFromFrustum(frust);
      view.centerEyePoint();
    } else {
      // for non-camera views, do the zooming by adjusting the origin and delta directly so there can be no
      // chance of the rotation changing due to numerical precision errors calculating it from the frustum corners.
      const delta = view.getExtents().clone();
      delta.x *= factor;
      delta.y *= factor;

      // first check to see whether the zoom operation results in an invalid view. If so, make sure we don't change anything
      view.validateViewDelta(delta, true);

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
    }

    this.finishViewChange(startFrust, options);
  }

  /** Zoom the view to a show the tightest box around a given set of PlacementProps. Optionally, change view rotation.
   * @param props array of PlacementProps. Will zoom to the union of the placements.
   * @param options options that control how the view change works and whether to change view rotation.
   */
  public zoomToPlacementProps(placementProps: PlacementProps[], options?: ViewChangeOptions & ZoomToOptions) {
    if (placementProps.length === 0)
      return;

    const hasAngle = (arg: any): arg is Placement2dProps => arg.angle !== undefined;
    if (undefined !== options) {
      if (undefined !== options.standardViewId) {
        this.view.setStandardRotation(options.standardViewId);
      } else if (undefined !== options.placementRelativeId) {
        const firstProps = placementProps[0];
        const firstPlacement = hasAngle(firstProps) ? Placement2d.fromJSON(firstProps) : Placement3d.fromJSON(firstProps);
        const viewRotation = StandardView.getStandardRotation(options.placementRelativeId).clone();
        viewRotation.multiplyMatrixMatrixTranspose(firstPlacement.transform.matrix, viewRotation);
        this.view.setRotation(viewRotation);
      } else if (undefined !== options.viewRotation) {
        this.view.setRotation(options.viewRotation);
      }
    }

    const viewTransform = Transform.createOriginAndMatrix(undefined, this.view.getRotation());
    const frust = new Frustum();
    const viewRange = new Range3d();
    for (const props of placementProps) {
      const placement = hasAngle(props) ? Placement2d.fromJSON(props) : Placement3d.fromJSON(props);
      viewRange.extendArray(placement.getWorldCorners(frust).points, viewTransform);
    }

    this.view.lookAtViewAlignedVolume(viewRange, this.viewRect.aspect, options ? options.marginPercent : undefined);
    this.finishViewChange(this.getFrustum().clone(), options);
  }

  /** Zoom the view to a show the tightest box around a given set of ElementProps. Optionally, change view rotation.
   * @param props element props. Will zoom to the union of the placements.
   * @param options options that control how the view change works and whether to change view rotation.
   */
  public zoomToElementProps(elementProps: ElementProps[], options?: ViewChangeOptions & ZoomToOptions) {
    if (elementProps.length === 0)
      return;
    const placementProps: PlacementProps[] = [];
    for (const props of elementProps) {
      if (props.placement !== undefined && this.view.viewsModel(props.model))
        placementProps.push(props.placement);
    }
    this.zoomToPlacementProps(placementProps, options);
  }

  /** Zoom the view to a show the tightest box around a given set of elements. Optionally, change view rotation.
   * @param ids the element id(s) to include. Will zoom to the union of the placements.
   * @param options options that control how the view change works and whether to change view rotation.
   */
  public async zoomToElements(ids: Id64Arg, options?: ViewChangeOptions & ZoomToOptions): Promise<void> {
    this.zoomToElementProps(await this.iModel.elements.getProps(ids), options);
  }

  /** Zoom the view to a volume of space in world coordinates.
   * @param volume The low and high corners, in world coordinates.
   * @param options options that control how the view change works
   */
  public zoomToVolume(volume: LowAndHighXYZ | LowAndHighXY, options?: ViewChangeOptions) {
    this.view.lookAtVolume(volume, this.viewRect.aspect, options ? options.marginPercent : undefined);
    this.finishViewChange(this.getFrustum().clone(), options);
  }

  /** Shortcut to call view.setupFromFrustum and then [[setupFromView]]
   * @param inFrustum the new viewing frustum
   * @returns true if both steps were successful
   */
  public setupViewFromFrustum(inFrustum: Frustum): boolean {
    const validSize = this.view.setupFromFrustum(inFrustum);
    // note: always call setupFromView, even if setupFromFrustum failed
    return (ViewStatus.Success === this.setupFromView() && ViewStatus.Success === validSize);
  }

  /** @hidden */
  public computeViewRange(): Range3d {
    this.setupFromView(); // can't proceed if viewport isn't valid (not active)
    return this.view.computeFitRange();
  }

  /** @hidden */
  public animate() {
    if (this._animator && this._animator.animate())
      this._animator = undefined;
  }

  /** @hidden */
  public removeAnimator() { this.setAnimator(undefined); }
  private setAnimator(animator: Animator | undefined) {
    if (this._animator)
      this._animator.interrupt(); // will be destroyed
    this._animator = animator;
  }

  /** @hidden */
  public animateFrustumChange(start: Frustum, end: Frustum, animationTime?: BeDuration) {
    if (!animationTime || 0.0 >= animationTime.milliseconds)
      animationTime = ToolSettings.animationTime;

    this.setAnimator(new Animator(animationTime, this, start, end));
  }

  /** @hidden */
  public applyViewState(val: ViewState, animationTime?: BeDuration) {
    const startFrust = this.getFrustum();
    this._viewFrustum.view = val.clone(this.view.iModel); // preserve our iModel in case val is coming from a different connection
    this.synchWithView(false);
    if (animationTime)
      this.animateFrustumChange(startFrust, this.getFrustum(), animationTime);
  }

  private static roundGrid(num: number, units: number): number {
    const sign = ((num * units) < 0.0) ? -1.0 : 1.0;
    num = (num * sign) / units + 0.5;
    return units * sign * Math.floor(num);
  }

  private getGridOrientation(origin: Point3d, rMatrix: Matrix3d) {
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
        Matrix3d.createRows(rMatrix.getRow(1), rMatrix.getRow(2), rMatrix.getRow(0), rMatrix);
        break;
      }

      case GridOrientationType.WorldXZ: {
        Matrix3d.createRows(rMatrix.getRow(0), rMatrix.getRow(2), rMatrix.getRow(1), rMatrix);
        break;
      }
    }
  }

  private pointToStandardGrid(point: Point3d, rMatrix: Matrix3d, origin: Point3d): void {
    const planeNormal = rMatrix.getRow(2);

    let eyeVec: Vector3d;
    if (this.view.is3d() && this.isCameraOn)
      eyeVec = this.view.camera.eye.vectorTo(point);
    else
      eyeVec = this._viewFrustum.rotation.getRow(2).clone();

    eyeVec.normalizeInPlace();
    linePlaneIntersect(point, point, eyeVec, origin, planeNormal, false);

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
    const rMatrix = Matrix3d.createIdentity();
    this.getGridOrientation(origin, rMatrix);
    this.pointToStandardGrid(point, rMatrix, origin);
  }

  /** Get the width of a pixel (a unit vector in the x direction in view coordinates) at a given point in world coordinates, returning the result in meters (world units).
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

  private get _wantInvertBlackAndWhite(): boolean {
    const bgColor = this.view.backgroundColor.colors;
    return ((bgColor.r + bgColor.g + bgColor.b) > (255 * 3) / 2);
  }

  /** Get a color that will contrast to the current background color of this Viewport. Either Black or White depending on which will have the most contrast. */
  public getContrastToBackgroundColor(): ColorDef {
    return this._wantInvertBlackAndWhite ? ColorDef.black : ColorDef.white; // should we use black or white?
  }

  private processFlash(): boolean {
    let needsFlashUpdate = false;

    if (this._flashedElem !== this.lastFlashedElem) {
      this.flashIntensity = 0.0;
      this.flashUpdateTime = BeTimePoint.now();
      this.lastFlashedElem = this._flashedElem; // flashing has begun; this is now the previous flash
      needsFlashUpdate = this._flashedElem === undefined; // notify render thread that flash has been turned off (signified by undefined elem)
    }

    if (this._flashedElem !== undefined && this.flashIntensity < 1.0) {
      const flashDuration = BeDuration.fromSeconds(this.flashDuration);
      const flashElapsed = BeTimePoint.now().milliseconds - this.flashUpdateTime!.milliseconds;
      this.flashIntensity = Math.min(flashElapsed, flashDuration.milliseconds) / flashDuration.milliseconds; // how intense do we want the flash effect to be from [0..1]?
      needsFlashUpdate = true;
    }

    return needsFlashUpdate;
  }

  /** @hidden */
  public createSceneContext(): SceneContext { return new SceneContext(this); }

  /** Called when the visible contents of the viewport are redrawn.
   * @note Due to the frequency of this event, avoid performing expensive work inside event listeners.
   */
  public readonly onRender = new BeEvent<(vp: Viewport) => void>();

  /** @hidden */
  public renderFrame(): boolean {
    const sync = this.sync;
    const view = this.view;
    const target = this.target;

    // Start timer for tile loading time
    const timer = new StopWatch(undefined, true);

    this.animate();

    // Allow ViewState instance to change any state which might affect logic below...
    view.onRenderFrame(this);

    let isRedrawNeeded = sync.isRedrawPending || this._doContinuousRendering;
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
      const ovr = new FeatureSymbology.Overrides(view);
      if (undefined !== this._neverDrawn)
        ovr.setNeverDrawnSet(this._neverDrawn);
      if (undefined !== this._alwaysDrawn)
        ovr.setAlwaysDrawnSet(this._alwaysDrawn, this._alwaysDrawnExclusive);
      if (undefined !== this._featureOverrideProvider)
        this._featureOverrideProvider.addFeatureOverrides(ovr, this);

      target.overrideFeatureSymbology(ovr);
      view.setFeatureOverridesDirty(false);
      isRedrawNeeded = true;
    }

    if (!sync.isValidController)
      this.setupFromView();

    if (!sync.isValidScene) {
      if (!this._freezeScene) {
        this.numSelectedTiles = this.numReadyTiles = 0;
        const context = this.createSceneContext();
        view.createScene(context);
        view.createClassification(context);
        view.createTerrain(context);
        context.requestMissingTiles();
        target.changeScene(context.graphics);
        target.changeTerrain(context.backgroundGraphics);

        isRedrawNeeded = true;
      }

      sync.setValidScene();
    }

    if (!sync.isValidRenderPlan) {
      target.changeRenderPlan(RenderPlan.createFromViewport(this));
      sync.setValidRenderPlan();
      isRedrawNeeded = true;
    }

    if (!sync.isValidDecorations) {
      const decorations = new Decorations();
      this.addDecorations(decorations);
      target.changeDecorations(decorations);
      isRedrawNeeded = true;
    }

    if (!sync.isValidAnimationFraction) {
      target.animationFraction = this.animationFraction;
      isRedrawNeeded = true;
      sync.setValidAnimationFraction();
      const scheduleScript = view.displayStyle.scheduleScript;
      if (scheduleScript) {
        view.scheduleTime = scheduleScript.duration.fractionToPoint(target.animationFraction);
        target.animationBranches = scheduleScript.getAnimationBranches(view.scheduleTime);
      }
    }

    if (this.processFlash()) {
      target.setFlashed(undefined !== this._flashedElem ? this._flashedElem : Id64.invalid, this.flashIntensity);
      isRedrawNeeded = true;
    }

    timer.stop();
    if (isRedrawNeeded) {
      target.drawFrame(timer.elapsed.milliseconds);
      this.onRender.raiseEvent(this);
    }

    return true;
  }

  /** @hidden */
  public addDecorations(_decorations: Decorations): void { }

  /** Read selected data about each pixel within a rectangular region of this Viewport.
   * @param rect The area of the viewport's contents to read. The origin specifies the upper-left corner. Must lie entirely within the viewport's dimensions.
   * @param selector Specifies which aspect(s) of data to read.
   * @param receiver A function accepting a [[Pixel.Buffer]] object from which the selected data can be retrieved, or receiving undefined if the viewport is not active, the rect is out of bounds, or some other error.
   * @param excludeNonLocatable If true, geometry with the "non-locatable" flag set will not be drawn.
   * @note The [[Pixel.Buffer]] supplied to the `receiver` function becomes invalid once that function exits. Do not store a reference to it.
   */
  public readPixels(rect: ViewRect, selector: Pixel.Selector, receiver: Pixel.Receiver, excludeNonLocatable = false): void {
    const viewRect = this.viewRect;
    if (!rect.isContained(viewRect))
      receiver(undefined);
    else
      this.target.readPixels(rect, selector, receiver, excludeNonLocatable);
  }

  /** Read the current image from this viewport from the rendering system. If a view rectangle outside the actual view is specified, the entire view is captured.
   * @param rect The area of the view to read. The origin of a viewRect must specify the upper left corner.
   * @param targetSize The size of the image to be returned. The size can be larger or smaller than the original view.
   * @param flipVertically If true, the image is flipped along the x-axis.
   * @returns The contents of the viewport within the specified rectangle as a bitmap image, or undefined if the image could not be read.
   * @note By default the image is returned upside-down. Pass `true` for `flipVertically` to flip it along the x-axis.
   */
  public readImage(rect: ViewRect = new ViewRect(0, 0, -1, -1), targetSize: Point2d = Point2d.createZero(), flipVertically: boolean = false): ImageBuffer | undefined {
    return this.target.readImage(rect, targetSize, flipVertically);
  }

  /** Get the point at the specified x and y location in the pixel buffer in npc coordinates */
  public getPixelDataNpcPoint(pixels: Pixel.Buffer, x: number, y: number, out?: Point3d): Point3d | undefined {
    const z = pixels.getPixel(x, y).distanceFraction;
    if (z <= 0.0)
      return undefined;

    const vf = this._viewFrustum;

    const result = undefined !== out ? out : new Point3d();
    const viewRect = this.viewRect;
    result.x = (x + 0.5 - viewRect.left) / viewRect.width;
    result.y = 1.0 - (y + 0.5 - viewRect.top) / viewRect.height;
    if (vf.frustFraction < 1.0)
      result.z = z * vf.frustFraction / (1.0 + z * (vf.frustFraction - 1.0)); // correct to npc if camera on.
    else
      result.z = z;

    return result;
  }

  /** Get the point at the specified x and y location in the pixel buffer in world coordinates */
  public getPixelDataWorldPoint(pixels: Pixel.Buffer, x: number, y: number, out?: Point3d): Point3d | undefined {
    const npc = this.getPixelDataNpcPoint(pixels, x, y, out);
    if (undefined !== npc)
      this.npcToWorld(npc, npc);

    return npc;
  }
}

/** An interactive Viewport that exists within an HTMLDivElement. ScreenViewports can receive HTML events.
 * To render the contents of a ScreenViewport, it must be added to the [[ViewManager]] via ViewManager.addViewport().
 * Every frame, the ViewManager will update the Viewport's state and re-render its contents if anything has changed.
 * To halt this loop, use ViewManager.dropViewport() to remove the viewport from the ViewManager.
 *
 * A ScreenViewport internally owns significant WebGL resources which must be explicitly disposed of when the viewport is no longer needed.
 * This is achieved by invoking the viewport's dispose() method. ViewManager.dropViewport() invokes dispose() on the viewport by default.
 *
 * The lifetime of a ScreenViewport typically follows a pattern:
 * ```
 *  1. Application creates the viewport via ScreenViewport.create()
 *  2. The viewport is added to the render loop via ViewManager.addViewport()
 *  3. When the application is finished with the viewport, it removes it from the render loop and disposes of it via ViewManager.dropViewport().
 * ```
 *
 * In some cases it may be useful to temporarily suspend a viewport's render loop. In this case the lifetime of the viewport proceeds as follows:
 * ```
 *  1. Application creates the viewport via ScreenViewport.create()
 *  2. The viewport is added to the render loop via ViewManager.addViewport()
 *  3. At some point the render loop is suspended via ViewManager.dropViewport(viewport, false), indicating the viewport should not be disposed.
 *  4. Optionally, resume rendering by returning to step 2.
 *  5. When the application is finished with the viewport:
 *    5a. If it is currently registered with the ViewManager, it is dropped and disposed of via ViewManager.dropViewport()
 *    5b. Otherwise, it is disposed of by invoking its dispose() method directly.
 * ```
 * @public
 */
export class ScreenViewport extends Viewport {
  private _evController?: EventController;
  private _viewCmdTargetCenter?: Point3d;
  /** The number of entries in the view undo/redo buffer. */
  public maxUndoSteps = 20;
  private readonly _forwardStack: ViewState[] = [];
  private readonly _backStack: ViewState[] = [];
  private _currentBaseline?: ViewState;

  /** The parent HTMLDivElement of the canvas. */
  public readonly parentDiv: HTMLDivElement;
  /** The canvas to display the view contents. */
  public readonly canvas: HTMLCanvasElement;
  /** The HTMLDivElement used for HTML decorations. May be referenced from the DOM by class "overlay-decorators". */
  public readonly decorationDiv: HTMLDivElement;
  /** The HTMLDivElement used for toolTips. May be referenced from the DOM by class "overlay-tooltip". */
  public readonly toolTipDiv: HTMLDivElement;

  /** Create a new ScreenViewport that shows a View of an iModel into an HTMLDivElement. This method will create a new HTMLCanvasElement as a child of the supplied parentDiv.
   * It also creates two new child HTMLDivElements: one of class "overlay-decorators" for HTML overlay decorators, and one of class
   * "overlay-tooltip" for ToolTips. All the new child HTMLElements are the same size as the parentDiv.
   * @param parentDiv The HTMLDivElement to contain the ScreenViewport.
   * @param view The ViewState for the ScreenViewport.
   * @note After creating a new ScreenViewport, you must call [[ViewManager.addViewport]] for it to become "live". You must also ensure you dispose of it properly.
   */
  public static create(parentDiv: HTMLDivElement, view: ViewState): ScreenViewport {
    const canvas = document.createElement("canvas");
    const vp = new this(canvas, parentDiv, IModelApp.renderSystem.createTarget(canvas));
    vp.changeView(view);
    return vp;
  }

  /** Remove all of the children of an HTMLDivElement.
   * @hidden
   */
  public static removeAllChildren(el: HTMLDivElement) {
    while (el.lastChild)
      el.removeChild(el.lastChild);
  }
  /**  add a child element to this.parentDiv and set its size and position the same as the parent.
   * @hidden
   */
  public addChildDiv(element: HTMLElement, zIndex: number) {
    // get the (computed) z-index value of the parent, as an integer.
    const parentZ = parseInt(window.getComputedStyle(this.parentDiv).zIndex || "0", 10);
    const style = element.style;
    style.position = "absolute";
    style.top = "0";
    style.left = "0";
    style.height = "100%";
    style.width = "100%";
    style.zIndex = (parentZ + zIndex).toString();
    this.parentDiv.appendChild(element);
  }

  /** @hidden */
  public addNewDiv(className: string, overflowHidden: boolean, z: number): HTMLDivElement {
    const div = document.createElement("div");
    div.className = className;
    div.style.pointerEvents = "none";
    div.style.overflow = overflowHidden ? "hidden" : "visible";
    this.addChildDiv(div, z);
    return div;
  }

  /** @hidden */
  constructor(canvas: HTMLCanvasElement, parentDiv: HTMLDivElement, target: RenderTarget) {
    super(target);
    this.canvas = canvas;
    this.parentDiv = parentDiv;

    // first remove all children of the parent Div
    ScreenViewport.removeAllChildren(parentDiv);

    this.addChildDiv(canvas, 10);
    this.target.updateViewRect();

    this.decorationDiv = this.addNewDiv("overlay-decorators", true, 30);
    this.toolTipDiv = this.addNewDiv("overlay-tooltip", false, 40);
    this.setCursor();
  }

  /** Open the toolTip window in this ScreenViewport with the supplied message and location. The tooltip will be a child of [[ScreenViewport.toolTipDiv]].
   * @param message The message to display
   * @param location The position of the toolTip, in view coordinates. If undefined, use center of view.
   * @param options the ToolTip options
   * @note There is only one ToolTip window, so calling this method more than once will move the toolTip and show the second message.
   */
  public openToolTip(message: HTMLElement | string, location?: XAndY, options?: ToolTipOptions) {
    IModelApp.notifications.openToolTip(this.toolTipDiv, message, location, options);
  }

  /** Set the event controller for this Viewport. Destroys previous controller, if one was defined. */
  public setEventController(controller: EventController | undefined) { if (this._evController) { this._evController.destroy(); } this._evController = controller; }

  /** Find a point on geometry visible in this Viewport, within a radius of supplied pick point.
   * @param pickPoint Point to search about, in world coordinates
   * @param radius Radius, in pixels, of the circular area to search.
   * @param allowNonLocatable If true, include geometry with non-locatable flag set.
   * @param out Optional Point3d to hold the result. If undefined, a new Point3d is returned.
   * @returns The point, in world coordinates, on the element closest to `pickPoint`, or undefined if no elements within `radius`.
   */
  public pickNearestVisibleGeometry(pickPoint: Point3d, radius: number, allowNonLocatable = true, out?: Point3d): Point3d | undefined {
    const picker = new ElementPicker();
    const options = new LocateOptions();
    options.allowNonLocatable = allowNonLocatable;
    if (0 !== picker.doPick(this, pickPoint, radius, options)) {
      const result = undefined !== out ? out : new Point3d();
      result.setFrom(picker.getHit(0)!.getPoint());
      return result;
    }
    if (undefined === this.backgroundMapPlane)
      return undefined;

    const eyePoint = this.worldToViewMap.transform1.columnZ();
    const direction = Vector3d.createFrom(eyePoint);
    const aa = Geometry.conditionalDivideFraction(1, eyePoint.w);
    if (aa !== undefined) {
      const xyzEye = direction.scale(aa);
      direction.setFrom(pickPoint.vectorTo(xyzEye));
    }
    direction.scaleToLength(-1.0, direction);
    const rayToEye = Ray3d.create(pickPoint, direction);
    const projectedPt = Point3d.createZero();
    if (undefined === rayToEye.intersectionWithPlane(this.backgroundMapPlane, projectedPt))
      return undefined;

    const mapResult = undefined !== out ? out : new Point3d();
    mapResult.setFrom(projectedPt);
    return mapResult;
  }

  /** @hidden */
  public pickCanvasDecoration(pt: XAndY) { return this.target.pickOverlayDecoration(pt); }

  /** Get the ClientRect of the canvas for this Viewport. */
  public getClientRect(): ClientRect { return this.canvas.getBoundingClientRect(); }

  /** The ViewRect for this ScreenViewport. Left and top will be 0, right will be the width, and bottom will be the height. */
  public get viewRect(): ViewRect { this._viewRange.init(0, 0, this.canvas.clientWidth, this.canvas.clientHeight); return this._viewRange; }

  /** @hidden */
  public addDecorations(decorations: Decorations): void {
    ScreenViewport.removeAllChildren(this.decorationDiv);
    const context = new DecorateContext(this, decorations);
    this.view.decorate(context);

    for (const decorator of IModelApp.viewManager.decorators)
      decorator.decorate(context);

    this.sync.setValidDecorations();
  }

  /** Change the cursor for this Viewport */
  public setCursor(cursor: string = "default"): void { this.canvas.style.cursor = cursor; }

  /** @hidden */
  public synchWithView(saveInUndo: boolean): void {
    super.setupFromView();
    if (saveInUndo)
      this.saveViewUndo();
  }

  /** Change the ViewState of this Viewport
   * @param view a fully loaded (see discussion at [[ViewState.load]] ) ViewState
   */
  public changeView(view: ViewState) {
    this.clearViewUndo();
    super.changeView(view);
    this.saveViewUndo();
  }

  /** @hidden */
  public get viewCmdTargetCenter(): Point3d | undefined { return this._viewCmdTargetCenter; }
  /** @hidden */
  public set viewCmdTargetCenter(center: Point3d | undefined) { this._viewCmdTargetCenter = center ? center.clone() : undefined; }
  /** True if an undoable viewing operation exists on the stack */
  public get isUndoPossible(): boolean { return 0 < this._backStack.length; }

  /** True if a redoable viewing operation exists on the stack */
  public get isRedoPossible(): boolean { return 0 < this._forwardStack.length; }

  /** Clear the undo buffers of this Viewport. This resets the undo stack. */
  public clearViewUndo(): void {
    this._currentBaseline = undefined;
    this._forwardStack.length = 0;
    this._backStack.length = 0;
  }

  /** Saves the current state of this viewport's [[ViewState]] in the undo stack, such that it can be restored by a call to [[ScreenViewport.doUndo]]. */
  public saveViewUndo(): void {
    if (!this.view)
      return;

    // the first time we're called we need to establish the baseline
    if (!this._currentBaseline)
      this._currentBaseline = this.view.clone();

    if (this.view.equalState(this._currentBaseline!)) // this does a deep compare of the ViewState plus DisplayStyle, CategorySelector, and ModelSelector
      return; // nothing changed, we're done

    const backStack = this._backStack;
    if (backStack.length >= this.maxUndoSteps) // don't save more than max
      backStack.shift(); // remove the oldest entry

    /** Sometimes we get requests to save undo entries from rapid viewing operations (e.g. mouse wheel rolls). To avoid lots of
     * little useless intermediate view undo steps that mean nothing, if we get a call to this within a minimum time (1/2 second by default)
     * we don't add a new entry to the view undo buffer.
     */
    const now = BeTimePoint.now();
    if (backStack.length < 1 || backStack[backStack.length - 1].undoTime!.plus(Viewport.undoDelay).before(now)) {
      this._currentBaseline!.undoTime = now; // save time we put this entry in undo buffer
      this._backStack.push(this._currentBaseline); // save previous state
      this._forwardStack.length = 0; // not possible to do redo after this
    }

    this._currentBaseline = this.view.clone();
  }
  /** Reverses the most recent change to the Viewport from the undo stack. */
  public doUndo(animationTime?: BeDuration) {
    if (0 === this._backStack.length)
      return;

    this._forwardStack.push(this._currentBaseline!);
    this._currentBaseline = this._backStack.pop()!;
    this.applyViewState(this._currentBaseline, animationTime);
  }

  /** Re-applies the most recently un-done change to the Viewport from the redo stack. */
  public doRedo(animationTime?: BeDuration) {
    if (0 === this._forwardStack.length)
      return;

    this._backStack.push(this._currentBaseline!);
    this._currentBaseline = this._forwardStack.pop()!;
    this.applyViewState(this._currentBaseline, animationTime);
  }

  /** Clear the view undo buffer and establish the current ViewState as the new baseline. */
  public resetUndo() {
    this.clearViewUndo();
    this.saveViewUndo();  // Set up new baseline state
  }

  /** Show the surface normal for geometry under the cursor when snapping. */
  private static drawLocateHitDetail(context: DecorateContext, aperture: number, hit: HitDetail): void {
    if (!context.viewport.view.is3d())
      return; // Not valuable feedback in 2d...

    if (!(hit instanceof SnapDetail) || !hit.normal || hit.isPointAdjusted)
      return; // AccuSnap will flash edge/segment geometry if not a surface hit or snap location has been adjusted...

    const builder = context.createGraphicBuilder(GraphicType.WorldOverlay);
    const color = context.viewport.hilite.color.invert(); // Invert hilite color for good contrast
    const colorFill = color.clone();

    color.setTransparency(100);
    colorFill.setTransparency(200);
    builder.setSymbology(color, colorFill, 1);

    const radius = (2.5 * aperture) * context.viewport.getPixelSizeAtPoint(hit.snapPoint);
    const rMatrix = Matrix3d.createRigidHeadsUp(hit.normal);
    const ellipse = Arc3d.createScaledXYColumns(hit.snapPoint, rMatrix, radius, radius, AngleSweep.create360());

    builder.addArc(ellipse, true, true);
    builder.addArc(ellipse, false, false);

    const length = (0.6 * radius);
    const normal = Vector3d.create();

    ellipse.vector0.normalize(normal);
    const pt1 = hit.snapPoint.plusScaled(normal, length);
    const pt2 = hit.snapPoint.plusScaled(normal, -length);
    builder.addLineString([pt1, pt2]);

    ellipse.vector90.normalize(normal);
    const pt3 = hit.snapPoint.plusScaled(normal, length);
    const pt4 = hit.snapPoint.plusScaled(normal, -length);
    builder.addLineString([pt3, pt4]);

    context.addDecorationFromBuilder(builder);
  }

  /** @hidden */
  public drawLocateCursor(context: DecorateContext, pt: Point3d, aperture: number, isLocateCircleOn: boolean, hit?: HitDetail): void {
    if (hit)
      ScreenViewport.drawLocateHitDetail(context, aperture, hit);

    if (isLocateCircleOn) {
      // draw a filled and outlined circle to represent the size of the location aperture in the current view.
      const radius = Math.floor(aperture * 0.5) + 0.5;
      const position = this.worldToView(pt); position.x = Math.floor(position.x) + 0.5; position.y = Math.floor(position.y) + 0.5;
      const drawDecoration = (ctx: CanvasRenderingContext2D) => {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,.4)";
        ctx.fillStyle = "rgba(255,255,255,.2)";
        ctx.arc(0, 0, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = "rgba(0,0,0,.8)";
        ctx.lineWidth = 1;
        ctx.arc(0, 0, radius + 1, 0, 2 * Math.PI);
        ctx.stroke();
      };
      context.addCanvasDecoration({ position, drawDecoration }, true);
    }
  }
}

/** Forms a 2-way connection between 2 Viewports of the same iModel, such that any change of the parameters in one will be reflected in the other.
 * For example, Navigator uses this class to synchronize two views for revision comparison.
 * @note It is possible to synchronize two Viewports from two different [[IModelConnection]]s of the same iModel.
 */
export class TwoWayViewportSync {
  private _removals: VoidFunction[] = [];
  private _isEcho = false;
  private syncView(source: Viewport, target: Viewport) {
    if (this._isEcho) return;
    this._isEcho = true; // so we don't react to the echo of this sync
    target.applyViewState(source.view);
    this._isEcho = false;
  }

  /** Establish the connection between two Viewports. When this method is called, view2 is initialized with the state of view1. */
  public connect(view1: Viewport, view2: Viewport) {
    this.disconnect();

    view2.applyViewState(view1.view); // use view1 as the starting point

    // listen to the onViewChanged events from both views
    this._removals.push(view1.onViewChanged.addListener(() => this.syncView(view1, view2)));
    this._removals.push(view2.onViewChanged.addListener(() => this.syncView(view2, view1)));
  }

  /** Remove the connection between the two views. */
  public disconnect() { this._removals.forEach((removal) => removal()); }
}

/** @hidden */
export class OffScreenViewport extends Viewport {
  public static create(view: ViewState, viewRect?: ViewRect) {
    const rect = new ViewRect(0, 0, 1, 1);
    if (undefined !== viewRect)
      rect.setFrom(viewRect);

    const vp = new this(IModelApp.renderSystem.createOffscreenTarget(rect));
    vp.changeView(view);
    vp.sync.setValidDecorations();  // decorations are not used offscreen
    return vp;
  }

  public get viewRect(): ViewRect { return this.target.viewRect; }

  public setRect(rect: ViewRect, temporary: boolean = false) {
    this.target.setViewRect(rect, temporary);
    this.changeView(this.view);
  }
}

/** @hidden */
export function linePlaneIntersect(outP: Point3d, linePt: Point3d, lineNormal: Vector3d | undefined, planePt: Point3d, planeNormal: Vector3d, perpendicular: boolean): void {
  let dot = 0;
  if (lineNormal)
    dot = lineNormal.dotProduct(planeNormal);
  else
    perpendicular = true;

  let temp: Vector3d;
  if (perpendicular || Math.abs(dot) < .001) {
    const t = linePt.vectorTo(planePt).dotProduct(planeNormal);
    temp = planeNormal.scale(t);
  } else {
    const t = (planeNormal.dotProduct(planePt) - planeNormal.dotProduct(linePt)) / dot;
    temp = lineNormal!.scale(t);
  }

  outP.setFrom(temp.plus(linePt));
}
