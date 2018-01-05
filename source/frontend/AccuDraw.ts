/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { Point3d, Vector3d, RotMatrix, Point2d, Transform } from "@bentley/geometry-core/lib/PointVector";
import { Viewport } from "./Viewport";
import { BentleyStatus } from "@bentley/bentleyjs-core/lib/Bentley";
import { Geometry } from "@bentley/geometry-core/lib/Geometry";
import { StandardViewId, standardViewMatrices } from "../common/ViewState";
import { ViewManager } from "./ViewManager";
import { ToolAdmin, CoordinateLockOverrides } from "./tools/ToolAdmin";
import { ColorDef, ColorRgb } from "../common/ColorDef";
import { BeButtonEvent, CoordSource, BeModifierKey } from "./tools/Tool";
import { SnapMode } from "./HitDetail";
import { TentativeOrAccuSnap, AccuSnap } from "./AccuSnap";
import { AuxCoordSystemState } from "../common/AuxCoordSys";
import { TentativePoint } from "./TentativePoint";
import { LinePixels, GraphicBuilder } from "../common/Render";
import { DecorateContext, SnapContext } from "./ViewContext";
import { Arc3d } from "@bentley/geometry-core/lib/curve/Arc3d";
import { LegacyMath } from "../common/LegacyMath";
import { ViewTool } from "./tools/ViewTool";
import { PrimitiveTool } from "./tools/PrimitiveTool";

// tslint:disable:one-variable-per-declaration
// tslint:disable:no-conditional-assignment

export const enum AccuDrawFlags {
  SetModePolar = 1,
  SetModeRect = 1 << 1,
  SetOrigin = (1 << 2),
  FixedOrigin = (1 << 3),
  SetRMatrix = (1 << 4),
  SetXAxis = (1 << 5),
  SetNormal = (1 << 6),
  SetDistance = (1 << 7),
  LockDistance = (1 << 8),
  Lock_X = (1 << 9),
  Lock_Y = (1 << 10),
  Lock_Z = (1 << 11),
  Disable = (1 << 12),
  OrientDefault = (1 << 14),
  SetFocus = (1 << 15),
  OrientACS = (1 << 17),
  SetXAxis2 = (1 << 18),
  LockAngle = (1 << 19),
  AlwaysSetOrigin = SetOrigin | (1 << 21),
  RedrawCompass = (1 << 22),
  UpdateRotation = (1 << 23),
  SmartRotation = (1 << 24),
}

export const enum CompassMode {
  Polar = 0,
  Rectangular = 1,
}

export const enum RotationMode {
  Top = 1,
  Front = 2,
  Side = 3,
  View = 4,
  ACS = 5,
  Context = 6,
  Restore = 7,
}

const enum LockedStates {
  NONE_LOCKED = 0,
  X_BM = (1),
  Y_BM = (1 << 1),
  VEC_BM = (1 << 2),
  DIST_BM = (1 << 3),
  XY_BM = (X_BM | Y_BM),
  ANGLE_BM = (XY_BM | VEC_BM),
}

const enum CurrentState {
  NotEnabled = 0, // Compass disabled/unwanted for this session.
  Deactivated = 1, // Compass deactivated but CAN be activated by user.
  Inactive = 2, // Compass not displayed awaiting automatic activation (default tool state).
  Active = 3, // Compass displayed and adjusting points.
}

const enum ContextMode {
  Locked = 0,
  XAxis = 1,
  YAxis = 2,
  ZAxis = 3,
  XAxis2 = 4,
  None = 15,
}

export const enum ItemField {
  DIST_Item = 0,
  ANGLE_Item = 1,
  X_Item = 2,
  Y_Item = 3,
  Z_Item = 4,
}

export enum KeyinStatus {
  Dynamic = 0,
  Partial = 1,
  DontUpdate = 2,
}

enum Constants {
  MAX_SAVED_VALUES = 20,
  SMALL_ANGLE = 1.0e-12,
  SMALL_DELTA = 0.00001,
}

class AccudrawData {
  public flags = 0;      // AccuDrawFlags
  public readonly origin = new Point3d();     // used if ACCUDRAW_SetOrigin
  public readonly delta = new Point3d();      // if ACCUDRAW_Lock_X, etc.
  public readonly rMatrix = new RotMatrix();    // if ACCUDRAW_SetRMatrix/ACCUDRAW_Set3dMatrix
  public readonly vector = new Vector3d();     // if ACCUDRAW_SetXAxis, etc.
  public distance = 0;   // if ACCUDRAW_SetDistance
  public angle = 0;      // if ACCUDRAW_SetAngle
  public zero() { this.flags = this.distance = this.angle = 0; this.origin.setZero(); this.delta.setZero(); this.vector.setZero(); this.rMatrix.setIdentity(); }
}

class Flags {
  public redrawCompass = false;
  public dialogNeedsUpdate = false;
  public rotationNeedsUpdate = true;
  public lockedRotation = false;
  public indexLocked = false;
  public haveValidOrigin = false;
  public fixedOrg = false;
  public auxRotationPlane = RotationMode.Top;
  public contextRotMode = 0;
  public baseRotation = RotationMode.View;
  public baseMode = 0;
  public pointIsOnPlane = false;         // whether rawPointOnPlane is on compass plane
  public softAngleLock = false;          // don't remember what this was about...
  public bearingFixToPlane2D = false;
  public inDataPoint = false;
  public ignoreDataButton = false;
  public animateRotation = false;
}

class RoundOff {
  public active = false;
  public units = 0;
}

class SavedState {
  public state = CurrentState.NotEnabled;
  public view?: Viewport;
  public mode = CompassMode.Polar;
  public rotationMode = RotationMode.View;
  public readonly axes = new ThreeAxes();
  public readonly origin = new Point3d();
  public auxRotationPlane = 0;
  public contextRotMode = 0;
  public fixedOrg = false;
  public ignoreDataButton = false; // Allow data point that terminates an input collector to be ignored...
  public init(): void { this.state = CurrentState.NotEnabled; this.view = undefined; this.mode = CompassMode.Polar; this.rotationMode = RotationMode.View; }
  public setFrom(other: SavedState) {
    this.state = other.state;
    this.view = other.view;
    this.mode = other.mode;
    this.rotationMode = other.rotationMode;
    this.axes.setFrom(other.axes);
    this.origin.setFrom(other.origin);
    this.auxRotationPlane = other.auxRotationPlane;
    this.contextRotMode = other.contextRotMode;
    this.fixedOrg = other.fixedOrg;
    this.ignoreDataButton = other.ignoreDataButton;
  }
}

class SavedCoords {
  public nSaveValues = 0;
  public readonly savedValues: number[] = [];
  public readonly savedValIsAngle: boolean[] = [];
}

class ThreeAxes {
  public readonly x = Vector3d.unitX();
  public readonly y = Vector3d.unitY();
  public readonly z = Vector3d.unitZ();
  public setFrom(other: ThreeAxes) {
    this.x.setFrom(other.x);
    this.y.setFrom(other.y);
    this.z.setFrom(other.z);
  }
  public fromRotMatrix(rMatrix: RotMatrix): void {
    rMatrix.getRow(0, this.x);
    rMatrix.getRow(1, this.y);
    rMatrix.getRow(2, this.z);
  }
  public static createFromRotMatrix(rMatrix: RotMatrix, result?: ThreeAxes): ThreeAxes {
    result = result ? result : new ThreeAxes();
    result.fromRotMatrix(rMatrix);
    return result;
  }
  public toRotMatrix(out?: RotMatrix) { return RotMatrix.createRows(this.x, this.y, this.z, out); }
  public clone(): ThreeAxes { const out = new ThreeAxes(); out.setFrom(this); return out; }
  public equals(other: ThreeAxes): boolean { return this.x.isExactEqual(other.x) && this.y.isExactEqual(other.y) && this.z.isExactEqual(other.z); }
}

/**
 * Accudraw is an aide for entering coordinate data
 */
export class AccuDraw {
  public static readonly instance = new AccuDraw();
  private currentState = CurrentState.NotEnabled;     // Compass state
  private currentMode = CompassMode.Rectangular;      // Compass mode
  private rotationMode = RotationMode.View;     // Compass rotation
  private currentView?: Viewport;      // will be nullptr if view not yet defined
  private readonly published = new AccudrawData();        // Staging area for hints
  public readonly origin = new Point3d();    // origin point...not on compass plane when z != 0.0
  private readonly axes = new ThreeAxes();    // X, Y and Z vectors (3d rotation matrix)
  private readonly delta = Vector3d.unitZ();         // dialog items (x, y & z)
  private distance = 0;         // current distance
  private angle = 0;            // current angle
  private locked = LockedStates.NONE_LOCKED;           // axis/distance locked bit mask
  private indexed = LockedStates.NONE_LOCKED;          // axis/distance indexed bit mask
  private readonly distanceRoundOff = new RoundOff();       // distance round off enabled and unit
  private readonly angleRoundOff = new RoundOff();       // angle round off enabled and unit
  private readonly flags = new Flags();            // current state flags
  private readonly fieldLocked: boolean[] = [];   // locked state of fields
  private readonly keyinStatus: KeyinStatus[] = [];   // state of input field
  private readonly savedState = new SavedState();       // Restore point for shortcuts/tools...
  private readonly savedCoords = new SavedCoords();      // History of previous angles/distances...
  private readonly baseAxes = new ThreeAxes();     // Used for "context" base rotation to hold arbitrary rotation w/o needing to change ACS...
  private readonly lastAxes = new ThreeAxes();      // Last result from UpdateRotation, replaces cM.rMatrix...
  private lastDistance = 0;     // previous saved distance or distance indexing tick
  private tolerance = 0;        // computed view based indexing tolerance
  private percentChanged = 0;   // Compass animation state
  private threshold = 0;        // Threshold for automatic x/y field focus change.
  private readonly planePt = new Point3d();          // same as origin unless non-zero locked z value
  private readonly rawDelta = new Point2d();         // used by rect fix point
  private readonly rawPoint = new Point3d();         // raw uor point passed to fix point
  private readonly rawPointOnPlane = new Point3d();  // adjusted rawPoint by applying hard/soft construction plane
  private readonly point = new Point3d();            // current cursor point
  private readonly vector = Vector3d.unitZ();           // current/last good locked direction
  private xIsNegative = false;      // Last delta.x was negative
  private yIsNegative = false;      // Last delta.y was negative
  private xIsExplicit = false;      // Sign of delta.x established from user input input, don't allow +/- side flip.
  private yIsExplicit = false;      // Sign of delta.y established from user input input, don't allow +/- side flip.
  public dontMoveFocus = false;    // Disable automatic focus change when user is entering input.
  public newFocus = ItemField.X_Item;         // Item to move focus to (X_Item or Y_Item) for automatic focus change.
  private rMatrix = new RotMatrix();

  // Compass Display Preferences...
  protected compassSizeInches = 0.44;
  protected animationFrames = 12;
  protected indexToleranceInches = 0.11;
  protected frameColor = new ColorDef(ColorRgb.lightGrey);
  protected fillColor = new ColorDef(ColorRgb.blue);
  protected xColor = new ColorDef(ColorRgb.red);
  protected yColor = new ColorDef(ColorRgb.green);
  protected indexColor = new ColorDef(ColorRgb.white);

  // User Preference Settings...
  protected smartKeyin = true;
  protected floatingOrigin = true;
  protected stickyZLock = false;
  protected alwaysShowCompass = false;
  protected contextSensitive = true;
  protected axisIndexing = true;
  protected distanceIndexing = true;
  protected autoFocusFields = true;
  protected autoPointPlacement = false;

  private static tempRot = new RotMatrix();
  public getRotation(rMatrix?: RotMatrix): RotMatrix { if (!rMatrix) rMatrix = this.rMatrix; RotMatrix.createRows(this.axes.x, this.axes.y, this.axes.z, rMatrix); return rMatrix; }

  public getCompassMode() { return this.currentMode; }
  public isActive(): boolean { return CurrentState.Active === this.currentState; }
  public isEnabled(): boolean { return (this.currentState > CurrentState.NotEnabled); }
  public isInactive(): boolean { return (CurrentState.Inactive === this.currentState); }
  public isDeactivated(): boolean { return (CurrentState.Deactivated === this.currentState); }
  public animateCompassChanges() { return true; }
  protected setNewFocus(index: ItemField) { this.newFocus = index; }
  protected grabInputFocus() { }

  public activate(): void {
    // Upgrade state to inactive so OnBeginDynamics knows it's ok to move to active...
    if (CurrentState.Deactivated === this.currentState)
      this.currentState = CurrentState.Inactive;

    this.onBeginDynamics();
  }

  public deactivate() {
    this.onEndDynamics();
    // Don't allow compass to come back until user re-enables it...
    if (CurrentState.Inactive === this.currentState)
      this.currentState = CurrentState.Deactivated;
  }

  public setCompassMode(mode: CompassMode): void {
    if (mode === this.currentMode)
      return;

    this.currentMode = mode;
    this.onCompassModeChange();
  }

  public setRotationMode(mode: RotationMode): void {
    if (mode === this.rotationMode)
      return;

    this.rotationMode = mode;
    this.onRotationModeChange();
  }

  public setFieldLock(index: ItemField, locked: boolean): void {
    if (locked === this.fieldLocked[index])
      return;

    this.fieldLocked[index] = locked;
    this.onFieldLockChange(index);
  }

  public setKeyinStatus(index: ItemField, status: KeyinStatus): void {
    this.keyinStatus[index] = status;

    if (KeyinStatus.Dynamic !== status)
      this.dontMoveFocus = true;

    if (KeyinStatus.Partial === status)
      this.threshold = Math.abs(ItemField.X_Item === index ? this.rawDelta.y : this.rawDelta.x) + this.tolerance;
  }

  private needsRefresh(vp: Viewport): boolean {
    if (!this.isEnabled() || this.isDeactivated())
      return false;

    // Get snap point from AccuSnap/Tentative or use raw point...
    let distance = 0.0;
    let snapPt = this.rawPoint;
    const ptP = this.point;
    const snap = TentativeOrAccuSnap.getCurrentSnap();

    if (snap) {
      snapPt = snap.m_snapPoint;
      distance = ptP.distance(snapPt);
    }

    const isRectMode = (CompassMode.Rectangular === this.getCompassMode());
    const offsetSnap = ((TentativeOrAccuSnap.isHot() || TentativePoint.instance.isActive) && ((this.locked) || (distance > 0.0)));

    // XY Offset:
    if (offsetSnap) {
      if (isRectMode) {
        let xIsOffset = false, yIsOffset = false;
        let xOffset = 0.0, yOffset = 0.0;

        const vec = ptP.vectorTo(this.rawPointOnPlane);

        xIsOffset = (Math.abs(xOffset = vec.dotProduct(this.axes.x)) > 1.0);
        yIsOffset = (Math.abs(yOffset = vec.dotProduct(this.axes.y)) > 1.0);

        if (xIsOffset || yIsOffset)
          return true;
      }
    }

    const isOnCompassPlane = (!vp.view.is3d() || this.flags.pointIsOnPlane || this.isZLocked(vp));

    // Z Offset:
    if (offsetSnap) {
      if (isOnCompassPlane) {
        const zOffset = snapPt.distance(this.rawPointOnPlane);
        if (zOffset > Constants.SMALL_ANGLE || zOffset < -Constants.SMALL_ANGLE)
          return true;
      }
    }

    // Fat Point:
    if (offsetSnap)
      return true;

    let axisIsIndexed = false;

    // Axis Indexing:
    if (isRectMode) {
      if ((this.indexed & LockedStates.XY_BM) && (this.flags.pointIsOnPlane || this.fieldLocked[ItemField.Z_Item]))
        axisIsIndexed = true;
    } else {
      if ((this.indexed & LockedStates.ANGLE_BM || this.locked & LockedStates.ANGLE_BM) && (this.flags.pointIsOnPlane || this.fieldLocked[ItemField.Z_Item]))
        axisIsIndexed = true;
    }

    if (axisIsIndexed)
      return true;

    // Distance Indexing:
    if (this.indexed & LockedStates.DIST_BM)
      return true;

    // XY Lock:
    if (isRectMode && !axisIsIndexed) {
      const locked = this.locked & LockedStates.XY_BM;

      if ((0 !== locked) && isOnCompassPlane) {
        switch (locked) {
          case LockedStates.X_BM:
          case LockedStates.Y_BM:
          case LockedStates.XY_BM:
            return true;
        }
      }
    }

    return false;
  }

  public adjustPoint(pointActive: Point3d, vp: Viewport, fromSnap: boolean): boolean {
    if (!this.isEnabled())
      return false;

    const lastWasIndexed = (0 !== this.indexed);
    let pointChanged = false, handled = false;

    if (0.0 !== pointActive.z && !vp.isPointAdjustmentRequired())
      pointActive.z = 0.0;

    if (this.isInactive()) {
      this.point.setFrom(pointActive);
      this.currentView = vp;

      this.fixPoint(pointActive, vp);

      if (!fromSnap && AccuSnap.instance.currHit)
        this.flags.redrawCompass = true;
    } else if (this.isActive()) {
      const lastPt = this.point.clone();
      this.fixPoint(pointActive, vp);
      pointChanged = !lastPt.isExactEqual(this.point);
      if (this.published.flags)
        this.processHints();
      handled = true;
    } else {
      this.currentView = vp; // Keep view up to date...
    }

    // If redraw of compass isn't required (yet!) check if needed...
    if (!this.flags.redrawCompass && this.isActive()) {
      // Redraw required to erase/draw old/new indexing geometry...
      if (pointChanged && (lastWasIndexed || this.needsRefresh(vp)))
        this.flags.redrawCompass = true;
    }
    // Redraw is necessary, force decorators to be called...
    if (this.flags.redrawCompass)
      vp.invalidateDecorations();

    return handled;
  }

  private setDefaultOrigin(vp?: Viewport): void {
    if (!vp || this.locked || this.fieldLocked[ItemField.Z_Item])
      return;

    const view = vp.view;
    const rMatrix = view.getRotation();
    const acsOrigin = vp.getAuxCoordOrigin();
    rMatrix.multiply3dInPlace(acsOrigin);

    const origin = view.getCenter();
    view.getRotation().multiply3dInPlace(origin);
    origin.z = acsOrigin.z;
    view.getRotation().multiplyTranspose3dInPlace(origin);

    this.origin.setFrom(origin); // View center at acs z...
    this.planePt.setFrom(origin);
  }

  public isZLocked(vp: Viewport): boolean {
    if (this.fieldLocked[ItemField.Z_Item])
      return true;
    if (vp.isSnapAdjustmentRequired()) //  && TentativeOrAccuSnap.isHot())
      return true;

    return false;
  }

  private accountForAuxRotationPlane(rot: ThreeAxes, plane: RotationMode): void {
    // ACS mode now can have "front" and "side" variations...
    switch (plane) {
      case RotationMode.Top:
        return;

      case RotationMode.Front:
        const temp = rot.y.clone();
        rot.y.setFrom(rot.z);
        temp.scale(-1.0, rot.z);
        return;

      case RotationMode.Side:
        const temp0 = rot.x.clone();
        rot.x.setFrom(rot.y);
        rot.y.setFrom(rot.z);
        rot.z.setFrom(temp0);
    }
  }

  private accountForACSContextLock(vec: Vector3d): void {
    // Base rotation is relative to ACS when ACS context lock is enabled...
    if (!this.currentView || !this.currentView.isContextRotationRequired())
      return;

    const rMatrix = AccuDraw.getStandardRotation(StandardViewId.Top, this.currentView, true);
    rMatrix!.multiplyTranspose3dInPlace(vec);
  }

  private static useACSContextRotation(vp: Viewport, isSnap: boolean): boolean {
    if (isSnap) {
      if (!vp.isSnapAdjustmentRequired())
        return false;
    } else {
      if (!vp.isContextRotationRequired())
        return false;
    }
    return true;
  }

  /** Gets X, Y or Z vector from top, front, (right) side, ACS, or View. */
  private getStandardVector(whichVec: number): Vector3d {
    const vp = this.currentView;
    let rMatrix: RotMatrix;
    let myAxes: ThreeAxes;
    const vecP = Vector3d.createZero();
    switch (this.flags.baseRotation) {
      case RotationMode.Top:
        switch (whichVec) {
          case 0: vecP.x = 1.0; break;
          case 1: vecP.y = 1.0; break;
          case 2: vecP.z = 1.0; break;
        }
        this.accountForACSContextLock(vecP);
        break;

      case RotationMode.Front:
        switch (whichVec) {
          case 0: vecP.x = 1.0; break;
          case 1: vecP.z = 1.0; break;
          case 2: vecP.y = -1.0; break;
        }
        this.accountForACSContextLock(vecP);
        break;

      case RotationMode.Side:
        switch (whichVec) {
          case 0: vecP.y = 1.0; break;
          case 1: vecP.z = 1.0; break;
          case 2: vecP.x = 1.0; break;
        }
        this.accountForACSContextLock(vecP);
        break;

      case RotationMode.ACS:
        rMatrix = vp ? vp.getAuxCoordRotation() : RotMatrix.createIdentity();
        myAxes = ThreeAxes.createFromRotMatrix(rMatrix);
        this.accountForAuxRotationPlane(myAxes, this.flags.auxRotationPlane);
        switch (whichVec) {
          case 0: vecP.setFrom(myAxes.x); break;
          case 1: vecP.setFrom(myAxes.y); break;
          case 2: vecP.setFrom(myAxes.z); break;
        }
        break;

      case RotationMode.View:
        rMatrix = vp ? vp.rotMatrix : RotMatrix.createIdentity();
        rMatrix.getRow(whichVec, vecP);
        break;

      case RotationMode.Context:
        myAxes = this.baseAxes.clone();
        this.accountForAuxRotationPlane(myAxes, this.flags.auxRotationPlane);
        switch (whichVec) {
          case 0: vecP.setFrom(myAxes.x); break;
          case 1: vecP.setFrom(myAxes.y); break;
          case 2: vecP.setFrom(myAxes.z); break;
        }
        break;
    }
    return vecP;
  }

  private getBestViewedRotationFromXVector(rotation: ThreeAxes, vp: Viewport): void {
    const viewZ = vp.rotMatrix.getRow(2);
    const vec1 = this.getStandardVector(2);
    const vec2 = this.getStandardVector(1);
    const vec3 = this.getStandardVector(0);
    const rot1 = vec1.crossProduct(rotation.x);
    const rot2 = vec2.crossProduct(rotation.x);
    const rot3 = vec3.crossProduct(rotation.x);
    const useRot1 = (rot1.normalizeWithLength(rot1).mag > 0.00001);
    const useRot2 = (rot2.normalizeWithLength(rot2).mag > 0.00001);
    const useRot3 = (rot3.normalizeWithLength(rot3).mag > 0.00001);
    const dot1 = (useRot1 ? Math.abs(rotation.x.crossProduct(rot1).dotProduct(viewZ)) : -1.0);
    const dot2 = (useRot2 ? Math.abs(rotation.x.crossProduct(rot2).dotProduct(viewZ)) : -1.0);
    const dot3 = (useRot3 ? Math.abs(rotation.x.crossProduct(rot3).dotProduct(viewZ)) : -1.0);
    const max = Math.max(dot1, dot2, dot3);

    if (Geometry.isDistanceWithinTol(dot1 - dot2, 0.1) && (max !== dot3))
      rotation.y.setFrom(rot1);
    else if (max === dot1)
      rotation.y.setFrom(rot1);
    else if (max === dot2)
      rotation.y.setFrom(rot2);
    else
      rotation.y.setFrom(rot3);

    rotation.z.setFrom(rotation.x.crossProduct(rotation.y));
  }

  private getRotationFromVector(rotation: ThreeAxes, whichVec: number): void {
    let vec: Vector3d;
    switch (whichVec) {
      case 0:
        vec = this.getStandardVector(2);
        vec.crossProduct(rotation.x, rotation.y);

        if (rotation.y.normalizeWithLength(rotation.y).mag < .00001) {
          vec = this.getStandardVector(1);
          vec.crossProduct(rotation.x, rotation.y);
          rotation.y.normalizeInPlace();
        }

        rotation.x.crossProduct(rotation.y, rotation.z);
        break;

      case 1:
        vec = this.getStandardVector(2);
        vec.crossProduct(rotation.y, rotation.x);

        if (rotation.x.normalizeWithLength(rotation.x).mag < .00001) {
          vec = this.getStandardVector(0);
          vec.crossProduct(rotation.y, rotation.x);
          rotation.x.normalizeInPlace();
        }

        rotation.x.crossProduct(rotation.y, rotation.z);
        break;

      case 2:
        vec = this.getStandardVector(0);
        rotation.z.crossProduct(vec, rotation.y);

        if (rotation.y.normalizeWithLength(rotation.y).mag < .00001) {
          vec = this.getStandardVector(1);
          vec.crossProduct(rotation.z, rotation.x);
          rotation.x.normalizeInPlace();
          rotation.z.crossProduct(rotation.x, rotation.y);
        } else {
          rotation.y.crossProduct(rotation.z, rotation.x);
        }
        break;
    }
  }

  private updateRotation(animate: boolean = false, newRotationIn?: RotMatrix): void {
    let clearLocks = true;
    const oldRotation = this.axes.clone();
    let rMatrix: RotMatrix;
    let newRotation: ThreeAxes;

    if (!newRotationIn)
      newRotation = this.axes.clone(); // for axis based
    else
      newRotation = ThreeAxes.createFromRotMatrix(newRotationIn); // for animating context rotation change...

    const vp = this.currentView;
    const useACS = vp ? vp.isContextRotationRequired() : false;

    if (this.rotationMode === RotationMode.Restore) {
      newRotation = this.savedState.axes.clone();
      this.flags.contextRotMode = this.savedState.contextRotMode;
      this.rotationMode = RotationMode.Context;
    }

    switch (this.rotationMode) {
      case RotationMode.Top:
        // Get standard rotation relative to ACS when ACS context lock is enabled...
        newRotation.fromRotMatrix(AccuDraw.getStandardRotation(StandardViewId.Top, vp, useACS));
        this.flags.lockedRotation = true;
        break;

      case RotationMode.Front:
        // Get standard rotation relative to ACS when ACS context lock is enabled...
        newRotation.fromRotMatrix(AccuDraw.getStandardRotation(StandardViewId.Front, vp, useACS));
        this.flags.lockedRotation = true;
        break;

      case RotationMode.Side:
        // Get standard rotation relative to ACS when ACS context lock is enabled...
        newRotation.fromRotMatrix(AccuDraw.getStandardRotation(StandardViewId.Right, vp, useACS));
        this.flags.lockedRotation = true;
        break;

      case RotationMode.ACS:
        rMatrix = vp ? vp.getAuxCoordRotation() : RotMatrix.createIdentity();
        newRotation.fromRotMatrix(rMatrix);
        this.accountForAuxRotationPlane(newRotation, this.flags.auxRotationPlane);
        this.flags.lockedRotation = true;
        break;

      case RotationMode.View:
        rMatrix = vp ? vp.rotMatrix : RotMatrix.createIdentity();
        newRotation.fromRotMatrix(rMatrix);
        this.flags.lockedRotation = false;
        break;

      case RotationMode.Context:
        switch (this.flags.contextRotMode) {
          case ContextMode.XAxis:
            this.getRotationFromVector(newRotation, 0);
            clearLocks = (LockedStates.Y_BM !== this.locked || !oldRotation.x.isExactEqual(newRotation.x)); // Try to keep locked axis when tool being unsuspended...
            break;

          case ContextMode.XAxis2:
            if (vp)
              this.getBestViewedRotationFromXVector(newRotation, vp); // Use base rotation axis that results in compass being most closely aligned to view direction....
            else
              this.getRotationFromVector(newRotation, 0);
            clearLocks = (LockedStates.Y_BM !== this.locked || !oldRotation.x.isExactEqual(newRotation.x)); // Try to keep locked axis when tool being unsuspended...
            break;

          case ContextMode.YAxis:
            this.getRotationFromVector(newRotation, 1);
            clearLocks = (LockedStates.X_BM !== this.locked || !oldRotation.y.isExactEqual(newRotation.y)); // Try to keep locked axis when tool being unsuspended...
            break;

          case ContextMode.ZAxis:
            this.getRotationFromVector(newRotation, 2);
            break;

          case ContextMode.Locked:
            break;
        }
        break;
    }

    const isChanged = !oldRotation.equals(newRotation);

    // unlock stuff if rotation has changed
    if (isChanged && clearLocks && (CompassMode.Rectangular === this.getCompassMode() || !this.fieldLocked[ItemField.DIST_Item] || animate)) {
      this.locked = this.indexed = LockedStates.NONE_LOCKED;
      this.unlockAllFields();
    }

    this.axes.setFrom(newRotation);
    this.lastAxes.setFrom(newRotation);
    this.flags.redrawCompass = true;

    // If animate frame preference is set...
    if (!animate || !this.animateCompassChanges || !vp)
      return;

    // AccuDrawAnimatorPtr animator = AccuDrawAnimator:: Create();
    // viewport -> SetAnimator(* animator);
    // animator -> ChangeOfRotation(RotMatrix:: FromColumnVectors(oldRotation[0], oldRotation[1], oldRotation[2]));
  }

  public enableForSession(): void { if (CurrentState.NotEnabled === this.currentState) this.currentState = CurrentState.Inactive; }
  public disableForSession(): void {
    this.currentState = CurrentState.NotEnabled;
    this.flags.redrawCompass = true; // Make sure decorators are called so we don't draw (i.e. erase AccuDraw compass)
  }

  public setLastPoint(pt: Point3d): void {
    const vp = this.currentView;
    if (!vp)
      return;

    const ev = new BeButtonEvent();
    ev.initEvent(pt, pt, vp.worldToView(pt), vp, CoordSource.User, BeModifierKey.None);
    ToolAdmin.instance.setAdjustedDataPoint(ev);
  }

  public sendDataPoint(pt: Point3d, vp: Viewport): void {
    const ev = new BeButtonEvent();
    ev.initEvent(pt, pt, vp.worldToView(pt), vp, CoordSource.User, BeModifierKey.None);

    // Send both down and up events...
    ToolAdmin.instance.sendDataPoint(ev);
    ev.isDown = false;
    ToolAdmin.instance.sendDataPoint(ev);
  }

  public clearTentative(): boolean {
    if (!TentativePoint.instance.isActive)
      return false;

    const wasSnapped = TentativePoint.instance.isSnapped();
    TentativePoint.instance.clear(true);
    return wasSnapped;
  }

  public doAutoPoint(index: ItemField, mode: CompassMode): void {
    const vp = this.currentView;
    if (!vp)
      return;

    if (CompassMode.Polar === mode) {
      if (!this.autoPointPlacement)
        return;

      if (this.fieldLocked[ItemField.DIST_Item] && (this.fieldLocked[ItemField.ANGLE_Item] || this.indexed & LockedStates.ANGLE_BM) && KeyinStatus.Dynamic === this.keyinStatus[index]) {
        this.fixPointPolar(vp);
        this.sendDataPoint(this.point, vp);
      }

      return;
    }

    if (this.fieldLocked[ItemField.X_Item] && this.fieldLocked[ItemField.Y_Item]) {
      if (!this.isActive()) {
        if (!vp.view.is3d() || this.fieldLocked[ItemField.Z_Item]) {
          const globalOrigin = new Point3d();

          if (vp.view.isSpatialView())
            globalOrigin.setFrom(vp.view.iModel.globalOrigin);

          this.sendDataPoint(globalOrigin.plus(this.delta), vp);
        }

        return;
      }

      if (!this.autoPointPlacement || KeyinStatus.Dynamic !== this.keyinStatus[index])
        return;

      this.origin.plus3Scaled(this.axes.x, this.delta.x, this.axes.y, this.delta.y, this.axes.z, this.delta.z, this.point);
      this.sendDataPoint(this.point, vp);
      return;
    }

    if (!this.autoPointPlacement || KeyinStatus.Dynamic !== this.keyinStatus[index])
      return;

    if ((ItemField.X_Item === index && this.fieldLocked[ItemField.X_Item] && (this.indexed & LockedStates.Y_BM)) || (ItemField.Y_Item === index && this.fieldLocked[ItemField.Y_Item] && (this.indexed & LockedStates.X_BM))) {
      this.origin.plus3Scaled(this.axes.x, this.delta.x, this.axes.y, this.delta.y, this.axes.z, this.delta.z, this.point);
      this.sendDataPoint(this.point, vp);
    }
  }

  public getValueByIndex(index: ItemField): number {
    switch (index) {
      case ItemField.X_Item: return this.delta.x;
      case ItemField.Y_Item: return this.delta.y;
      case ItemField.Z_Item: return this.delta.z;
      case ItemField.DIST_Item: return this.distance;
      case ItemField.ANGLE_Item: return this.angle;
      default:
        return 0.0;
    }
  }

  public setValueByIndex(index: ItemField, value: number): void {
    switch (index) {
      case ItemField.X_Item:
        this.delta.x = value;
        break;
      case ItemField.Y_Item:
        this.delta.y = value;
        break;
      case ItemField.Z_Item:
        this.delta.z = value;
        break;
      case ItemField.DIST_Item:
        this.distance = value;
        break;
      case ItemField.ANGLE_Item:
        this.angle = value;
        break;
    }
  }

  private updateVector(angle: number): void {
    this.vector.set(Math.cos(angle), Math.sin(angle), 0.0);
    const rMatrix = this.getRotation();
    rMatrix.multiplyTransposeVector(this.vector);
  }

  private stringToUORs(_uors: number[], _str: string): BentleyStatus {
    // DistanceParserPtr parser = DistanceParser:: Create();
    // DgnViewportP   vp = GetCompassViewport();

    // if (NULL == vp)
    //   parser = DistanceParser:: Create();
    //   else
    // parser = DistanceParser:: Create(* vp);

    // if (SUCCESS != parser.ToValue(uors, str))
    //   return ERROR;

    return BentleyStatus.SUCCESS;
  }

  private stringToAngle(_angle: number[], _out: { isBearing: boolean }, _inString: string, _restrict: boolean): BentleyStatus {
    // WString     buffer(inString, BentleyCharEncoding:: Utf8);
    // WChar * p1, * p2, * string;
    // int         north = 0, east = 0;
    // bool        bearing = false;

    // if (isBearing)
    //       * isBearing = false;

    // string = buffer.begin();

    // if ((p1 = wcspbrk(string, L"NnSs")) != NULL) {
    //   string = p1 + 1;

    //   if ((p2 = wcspbrk(string, L"EeWw")) == NULL)
    //     return ERROR;

    //   north = (towupper(* p1) == L'N');
    //   east = (towupper(* p2) == L'E');
    //       * p2 = 0; // terminate string
    //   bearing = true;
    // }
    // else if (string[1] == L' ')
    // {
    //   bearing = true;

    //   switch (string[0]) {
    //     case L'1':
    //       north = true;
    //       east = true;
    //       break;
    //     case L'2':
    //       north = false;
    //       east = true;
    //       break;
    //     case L'3':
    //       north = false;
    //       east = false;
    //       break;
    //     case L'4':
    //       north = true;
    //       east = false;
    //       break;
    //     default:
    //       bearing = false;
    //       break;
    //   }

    //   if (bearing)
    //     string += 2;
    // }
    //   else
    // {
    //   bearing = false;
    // }

    // while (* string == L' ')
    // string++;

    // AngleParserPtr parser = AngleParser:: Create();

    // _SetupAngleParser(* parser);

    // if (SUCCESS != parser -> ToValue(angle, Utf8String(string).c_str()))
    //   return ERROR;

    // if (bearing) {
    //   if (north) {
    //     if (east)
    //       angle = 90.0 - angle;
    //     else
    //       angle = 90.0 + angle;
    //   }
    //   else {
    //     if (east)
    //       angle = 270.0 + angle;
    //     else
    //       angle = 270.0 - angle;
    //   }
    // }
    // else {
    //   DirectionFormatterPtr  formatter;

    //   DgnViewportP vp = GetCompassViewport();
    //   if (vp)
    //     formatter = DirectionFormatter:: Create(* vp -> GetViewController().GetTargetModel());
    //       else
    //   formatter = DirectionFormatter:: Create();

    //   if (DirectionMode:: Azimuth == formatter -> GetDirectionMode())
    //   {
    //     if (formatter -> GetClockwise())
    //       angle = formatter -> GetBaseDirection() - angle;
    //     else
    //       angle = angle - formatter -> GetBaseDirection();
    //   }
    // }

    // if (restrict == true) {
    //   while (angle >= 360.0)
    //     angle -= 360.0;

    //   while (angle < 0.0)
    //     angle += 360.0;
    // }

    // angle *= (msGeomConst_pi / 180.0);

    // if (isBearing)
    //       * isBearing = bearing;

    return BentleyStatus.SUCCESS;
  }

  private updateFieldValue(index: ItemField, input: string, out: { isBearing: boolean }): BentleyStatus {
    if (input.length === 0)
      return BentleyStatus.ERROR;

    if (input.length === 1)
      switch (input) {
        case ":":
        case "-":
        case "+":
        case ".":
          return BentleyStatus.ERROR;
      }

    switch (index) {
      case ItemField.DIST_Item:
        if (BentleyStatus.SUCCESS !== this.stringToUORs([this.distance], input))
          return BentleyStatus.ERROR;
        break;

      case ItemField.ANGLE_Item:
        if (BentleyStatus.SUCCESS !== this.stringToAngle([this.angle], out, input, true))
          return BentleyStatus.ERROR;
        break;

      case ItemField.X_Item:
        if (BentleyStatus.SUCCESS !== this.stringToUORs([this.delta.x], input))
          return BentleyStatus.ERROR;

        this.xIsExplicit = (input[0] === "+" || input[0] === "-");
        if (!this.xIsExplicit) {
          if (this.smartKeyin && this.isActive() && this.xIsNegative === (this.delta.x >= 0.0))
            this.delta.x = -this.delta.x;
        }
        break;

      case ItemField.Y_Item:
        if (BentleyStatus.SUCCESS !== this.stringToUORs([this.delta.y], input))
          return BentleyStatus.ERROR;

        this.yIsExplicit = (input[0] === "+" || input[0] === "-");
        if (!this.yIsExplicit) {
          if (this.smartKeyin && this.isActive() && this.yIsNegative === (this.delta.y >= 0.0))
            this.delta.y = -this.delta.y;
        }
        break;

      case ItemField.Z_Item:
        if (BentleyStatus.SUCCESS !== this.stringToUORs([this.delta.z], input))
          return BentleyStatus.ERROR;
        break;
    }

    return BentleyStatus.SUCCESS;
  }

  private unlockAllFields(): void {
    this.locked = 0;

    if (CompassMode.Polar === this.getCompassMode()) {
      if (this.fieldLocked[ItemField.DIST_Item])
        this.setFieldLock(ItemField.DIST_Item, false);

      if (this.fieldLocked[ItemField.ANGLE_Item])
        this.setFieldLock(ItemField.ANGLE_Item, false);
    } else {
      if (this.fieldLocked[ItemField.X_Item])
        this.setFieldLock(ItemField.X_Item, false);

      if (this.fieldLocked[ItemField.Y_Item])
        this.setFieldLock(ItemField.Y_Item, false);
    }

    if (this.fieldLocked[ItemField.Z_Item]) {
      if (this.stickyZLock)
        this.delta.z = 0.0;
      else
        this.setFieldLock(ItemField.Z_Item, false);
    }

    this.setKeyinStatus(ItemField.DIST_Item, KeyinStatus.Dynamic);
    this.setKeyinStatus(ItemField.ANGLE_Item, KeyinStatus.Dynamic);
    this.setKeyinStatus(ItemField.X_Item, KeyinStatus.Dynamic);
    this.setKeyinStatus(ItemField.Y_Item, KeyinStatus.Dynamic);
    this.setKeyinStatus(ItemField.Z_Item, KeyinStatus.Dynamic);

    if (!this.smartKeyin)
      this.setFocusItem(CompassMode.Polar === this.getCompassMode() ? ItemField.DIST_Item : ItemField.X_Item);

    this.dontMoveFocus = false;
  }

  /** produces the normal vector of the closest plane to the view which
   * contains inVec (uses true view rotation, never auxiliary)
   */
  private planeByVectorAndView(normalVec: Vector3d, inVec: Vector3d, vp: Viewport): boolean {
    if (!vp.view.is3d()) {
      normalVec.setFrom(Vector3d.unitZ());
      return true;
    }

    const viewNormal = vp.rotMatrix.getRow(2);
    const yVec = viewNormal.crossProduct(inVec);

    if (!yVec.normalizeInPlace()) {
      normalVec = viewNormal;
      return false;
    }

    inVec.crossProduct(yVec, normalVec);
    return true;
  }

  private handleDegeneratePolarCase(): void {
    if (!(this.locked & LockedStates.DIST_BM))
      this.distance = 0.0;

    if (this.locked & LockedStates.VEC_BM) {
      this.angle = Math.acos(this.vector.dotProduct(this.axes.x));
    } else if (this.locked & LockedStates.Y_BM) {
      this.vector.setFrom(this.axes.y);
      this.angle = Math.PI / 2.0;
      this.indexed = this.locked;
    } else if (this.locked & LockedStates.X_BM) {
      this.vector.setFrom(this.axes.x);
      this.angle = 0.0;
      this.indexed = this.locked;
    } else {
      // use last good vector
      this.angle = Math.acos(this.vector.dotProduct(this.axes.x));
    }
    this.origin.plusScaled(this.vector, this.distance, this.point);
  }

  private rawDeltaIsValid(rawDelta: number): boolean {
    /* Cursor Distance (*(+/-)) sense testing is not valid when raw delta is
       meaningless (0.0)...to make this change safer only reject the
       raw delta if unit or grid lock is also on. */
    if (0.0 !== rawDelta)
      return true;

    // The "I don't want grid lock" flag can be set by tools to override the default behavior...
    if (0 === (ToolAdmin.instance.toolState.coordLockOvr & CoordinateLockOverrides.OVERRIDE_COORDINATE_LOCK_Grid))
      return true;

    return (!ToolAdmin.instance.gridLock);
  }

  public processFieldInput(index: ItemField, input: string, synchText: boolean): void {
    const isBearing = false;

    if (BentleyStatus.SUCCESS !== this.updateFieldValue(index, input, { isBearing })) {
      const saveKeyinStatus = this.keyinStatus[index]; // Don't want this to change when entering '.', etc.
      this.updateFieldLock(index, false);
      this.keyinStatus[index] = saveKeyinStatus;
      return;
    }

    switch (index) {
      case ItemField.DIST_Item:
        this.distanceLock(synchText, true);
        this.doAutoPoint(index, CompassMode.Polar);
        break;

      case ItemField.ANGLE_Item:
        this.setFieldLock(index, true);

        if (synchText) {
          this.onFieldValueChange(index);
          this.setKeyinStatus(index, KeyinStatus.Dynamic);
        }

        if (!isBearing || !this.flags.bearingFixToPlane2D)
          this.updateVector(this.angle);
        else
          this.vector.set(Math.cos(this.angle), Math.sin(this.angle), 0.0);

        this.locked |= LockedStates.VEC_BM;
        this.doAutoPoint(index, CompassMode.Polar);
        break;

      case ItemField.X_Item:
      case ItemField.Y_Item:
        this.locked |= (ItemField.X_Item === index) ? LockedStates.X_BM : LockedStates.Y_BM;
      // Fall through...

      case ItemField.Z_Item:
        this.setFieldLock(index, true);
        if (synchText) {
          this.onFieldValueChange(index);
          this.setKeyinStatus(index, KeyinStatus.Dynamic);
        }

        this.doAutoPoint(index, this.getCompassMode());
        break;
    }

    this.refreshDecorationsAndDynamics();
  }

  public updateFieldLock(index: ItemField, locked: boolean): void {
    if (locked) {
      if (!this.fieldLocked[index]) {
        this.setFieldLock(index, true);

        switch (index) {
          case ItemField.DIST_Item:
            this.distanceLock(true, false);
            break;

          case ItemField.ANGLE_Item:
            this.angleLock();
            break;

          case ItemField.X_Item:
            this.locked |= LockedStates.X_BM;
            break;

          case ItemField.Y_Item:
            this.locked |= LockedStates.Y_BM;
            break;

          case ItemField.Z_Item:
            break;
        }
      }
      return;
    }

    switch (index) {
      case ItemField.DIST_Item:
        this.locked &= ~LockedStates.DIST_BM;
        break;

      case ItemField.ANGLE_Item:
        this.locked &= ~LockedStates.VEC_BM;
        break;

      case ItemField.X_Item:
        this.locked &= ~LockedStates.X_BM;
        break;

      case ItemField.Y_Item:
        this.locked &= ~LockedStates.Y_BM;
        break;
    }

    if (index !== ItemField.Z_Item || !this.stickyZLock)
      this.setFieldLock(index, false);

    this.setKeyinStatus(index, KeyinStatus.Dynamic);
  }

  private static getStandardRotation(nStandard: StandardViewId, vp: Viewport | undefined, useACS: boolean): RotMatrix {
    if (nStandard < StandardViewId.Top || nStandard > StandardViewId.RightIso)
      nStandard = StandardViewId.Top;

    const rMatrix = standardViewMatrices[nStandard].clone();
    const useVp = vp ? vp : ViewManager.instance.selectedView;
    if (!useACS || !useVp)
      return rMatrix;

    rMatrix.multiplyMatrixMatrix(useVp.getAuxCoordRotation(AccuDraw.tempRot), rMatrix);
    return rMatrix;
  }

  public static getCurrentOrientation(vp: Viewport, checkAccuDraw: boolean, checkACS: boolean, rMatrix?: RotMatrix): RotMatrix | undefined {
    if (checkAccuDraw && AccuDraw.instance.isActive())
      return AccuDraw.instance.getRotation(rMatrix);

    const useVp = vp ? vp : ViewManager.instance.selectedView;
    if (!useVp)
      return RotMatrix.createIdentity(rMatrix);

    if (checkACS && useVp.isContextRotationRequired())
      return useVp.getAuxCoordRotation(rMatrix);

    return useVp.rotMatrix;
  }

  public static updateAuxCoordinateSystem(acs: AuxCoordSystemState, vp: Viewport, allViews: boolean): void {
    // When modeling with multiple spatial views open, you'd typically want the same ACS in all views...
    if (allViews && vp.view.isSpatialView()) {
      for (const otherVp of ViewManager.instance.viewports) {
        if (otherVp !== vp && otherVp.view.isSpatialView())
          otherVp.auxCoordSystem = acs;
      }
    }

    vp.auxCoordSystem = acs;

    // NOTE: Change AccuDraw's base rotation to ACS.
    AccuDraw.instance.setContext(AccuDrawFlags.OrientACS);
  }

  private distanceLock(synchText: boolean, saveInHistory: boolean): void {
    this.locked |= LockedStates.DIST_BM;

    if (!this.fieldLocked[ItemField.DIST_Item])
      this.setFieldLock(ItemField.DIST_Item, true);

    if (saveInHistory)
      this.saveCoordinate(ItemField.DIST_Item, this.distance);

    if (synchText) {
      this.onFieldValueChange(ItemField.DIST_Item);
      this.setKeyinStatus(ItemField.DIST_Item, KeyinStatus.Dynamic);
    }
  }

  private angleLock(): void {
    if (this.indexed & LockedStates.Y_BM)
      this.locked |= LockedStates.Y_BM;
    else if (this.indexed & LockedStates.X_BM)
      this.locked |= LockedStates.X_BM;
    else
      this.locked |= LockedStates.VEC_BM;

    this.clearTentative();

    if (!this.fieldLocked[ItemField.ANGLE_Item]) {
      this.setFieldLock(ItemField.ANGLE_Item, true);
      this.setKeyinStatus(ItemField.ANGLE_Item, KeyinStatus.Dynamic);
    }

    this.flags.lockedRotation = true;
    this.flags.softAngleLock = false;
  }

  public doLockAngle(isSnapped: boolean): void {
    if (CompassMode.Polar !== this.getCompassMode()) {
      this.locked = LockedStates.NONE_LOCKED;
      this.rawPoint.setFrom(this.point);

      const vp = this.currentView;
      if (vp)
        this.fixPointPolar(vp);

      this.changeCompassMode(true);
    }

    this.setFieldLock(ItemField.ANGLE_Item, !this.fieldLocked[ItemField.ANGLE_Item]);

    if (this.fieldLocked[ItemField.ANGLE_Item]) {
      // Move focus to angle field...
      if (!isSnapped && this.autoFocusFields)
        this.setFocusItem(ItemField.ANGLE_Item);

      this.angleLock();

      if (!isSnapped)
        this.flags.softAngleLock = true;
    } else {
      this.locked &= ~LockedStates.ANGLE_BM;
      this.saveCoordinate(ItemField.ANGLE_Item, this.angle);
    }
  }

  private saveCoordinate(index: ItemField, value: number): void {
    const isAngle = (ItemField.ANGLE_Item === index);
    let currIndex = this.savedCoords.nSaveValues + 1;

    if (currIndex >= Constants.MAX_SAVED_VALUES)
      currIndex = 0;

    if (this.savedCoords.savedValues[this.savedCoords.nSaveValues] === value && this.savedCoords.savedValIsAngle[this.savedCoords.nSaveValues] === isAngle)
      return;

    if (isAngle) {
      // don't accept 0, 90, -90, and 180 degrees
      if (value === 0.0 || value === Math.PI || value === (Math.PI / 2.0) || value === -Math.PI)
        return;
    } else {
      // don't accept zero
      value = Math.abs(value);
      if (value < Constants.SMALL_ANGLE)
        return;
    }

    this.savedCoords.savedValues[currIndex] = value;
    this.savedCoords.savedValIsAngle[currIndex] = isAngle;
    this.savedCoords.nSaveValues = currIndex;

    if (!isAngle)
      this.lastDistance = value;
  }

  private changeCompassMode(animate: boolean = false): void {
    this.setCompassMode(CompassMode.Polar === this.getCompassMode() ? CompassMode.Rectangular : CompassMode.Polar);

    const viewport = this.currentView;
    if (!animate || !this.animateCompassChanges() || !viewport)
      return;

    // AccuDrawAnimatorPtr animator = AccuDrawAnimator:: Create();
    // viewport.setAnimator(* animator);
    // animator -> ChangeOfMode();
  }

  public changeBaseRotationMode(mode: RotationMode): void {
    if (mode > RotationMode.Context)
      return;

    if (RotationMode.Context === mode) {
      // See if it's better to stay with the current base rotation (only care about z)...
      if (RotationMode.Context !== this.flags.baseRotation) {
        const baseRMatrix = this.getBaseRotation();
        const baseZ = baseRMatrix.getRow(2);

        if (baseZ.isParallelTo(this.axes.z))
          return;
      }

      this.baseAxes.setFrom(this.axes);
      this.flags.auxRotationPlane = RotationMode.Top;
    }

    this.flags.baseRotation = mode;
  }

  private getBaseRotation(): RotMatrix {
    const vp = this.currentView;
    let baseRMatrix: RotMatrix;
    const useAcs = vp ? vp.isContextRotationRequired() : false;
    switch (this.flags.baseRotation) {
      case RotationMode.Top: {
        baseRMatrix = AccuDraw.getStandardRotation(StandardViewId.Top, vp, useAcs)!;
        break;
      }

      case RotationMode.Front: {
        baseRMatrix = AccuDraw.getStandardRotation(StandardViewId.Front, vp, useAcs)!;
        break;
      }

      case RotationMode.Side: {
        baseRMatrix = AccuDraw.getStandardRotation(StandardViewId.Right, vp, useAcs)!;
        break;
      }

      case RotationMode.ACS: {
        baseRMatrix = vp ? vp.getAuxCoordRotation() : RotMatrix.createIdentity();
        const axes = ThreeAxes.createFromRotMatrix(baseRMatrix);
        this.accountForAuxRotationPlane(axes, this.flags.auxRotationPlane);
        axes.toRotMatrix(baseRMatrix);
        break;
      }

      case RotationMode.View: {
        baseRMatrix = vp ? vp.rotMatrix : RotMatrix.createIdentity();
        break;
      }

      case RotationMode.Context: {
        const axes = new ThreeAxes();
        axes.setFrom(this.baseAxes);
        this.accountForAuxRotationPlane(axes, this.flags.auxRotationPlane);
        baseRMatrix = axes.toRotMatrix();
        break;
      }

      default: {
        baseRMatrix = RotMatrix.createIdentity();
        break;
      }
    }
    return baseRMatrix;
  }

  public setContextRotation(rMatrix: RotMatrix, locked: boolean, animate: boolean): void {
    this.flags.lockedRotation = locked;
    this.flags.contextRotMode = locked ? ContextMode.Locked : ContextMode.None;
    this.setRotationMode(RotationMode.Context);
    this.updateRotation(animate, rMatrix);
  }

  private clearContext(): void {
    this.published.flags = 0;
    this.flags.rotationNeedsUpdate = true;
    this.flags.fixedOrg = false;

    this.setNewFocus(ItemField.X_Item);
    this.unlockAllFields();

    if (this.rotationMode !== this.flags.baseRotation)
      this.setRotationMode(this.flags.baseRotation);

    if (this.getCompassMode() !== this.flags.baseMode)
      this.setCompassMode(this.flags.baseMode);
  }

  public setContext(flags: AccuDrawFlags, originP?: Point3d, orientationP?: RotMatrix, deltaP?: Vector3d, distanceP?: number, angleP?: number, transP?: Transform): BentleyStatus {
    this.published.flags |= flags;

    if (flags & AccuDrawFlags.SetOrigin && originP) {
      this.published.origin.setFrom(originP);

      if (transP)
        transP.multiplyPoint(this.published.origin, this.published.origin);
    }

    if (deltaP) {
      this.published.delta.setFrom(deltaP);

      if (transP)
        this.published.delta.scaleInPlace(transP.matrixRef().columnX().magnitude());
    }

    if (typeof distanceP === "number") {
      this.published.distance = distanceP;

      if (transP)
        this.published.distance *= transP.matrixRef().columnX().magnitude();
    }

    if (typeof angleP === "number")
      this.published.angle = angleP;

    if (orientationP) {
      if (flags & AccuDrawFlags.SetXAxis || flags & AccuDrawFlags.SetNormal || flags & AccuDrawFlags.SetXAxis2) {
        this.published.vector.setFrom(orientationP.columnX());

        if (transP)
          transP.matrixRef().multiply3dInPlace(this.published.vector);

        this.published.vector.normalizeInPlace();
      } else if (flags & AccuDrawFlags.SetRMatrix) {
        this.published.rMatrix.setFrom(orientationP);

        if (transP) {
          this.published.rMatrix.multiplyMatrixMatrix(transP.matrixRef(), this.published.rMatrix);
          this.published.rMatrix.normalizeColumnsInPlace();
        }
      }
    }

    if (flags) {
      this.onEventCommon();
      if (!this.flags.haveValidOrigin)
        this.setDefaultOrigin(this.currentView);
    }

    return this.isEnabled() ? BentleyStatus.SUCCESS : BentleyStatus.ERROR;
  }

  private onEventCommon(): void {
    if (this.published.flags & AccuDrawFlags.RedrawCompass) {
      this.flags.indexLocked = true;
      this.flags.redrawCompass = true;
    }

    if (this.published.flags & AccuDrawFlags.UpdateRotation) {
      this.flags.indexLocked = true;
      this.flags.contextRotMode = ContextMode.XAxis;
      this.setRotationMode(RotationMode.Context);
      this.updateRotation();
      this.flags.indexLocked = true;
    }
  }

  public onPrimitiveToolInstall(): boolean {
    if (!this.isEnabled)
      return false;

    this.onEventCommon();
    this.saveLockedCoords();
    // Setup default starting tool state...
    this.currentState = CurrentState.Inactive;
    this.clearContext();
    if (this.alwaysShowCompass)
      this.activate();

    return false;
  }

  public onViewToolInstall(): boolean {
    if (!this.isEnabled)
      return false;

    this.onEventCommon();

    // Save current primitive command AccuDraw state...
    const tool = ToolAdmin.instance.activeTool;
    if (tool && !(tool instanceof ViewTool))
      this.saveState(false);

    // Setup viewing tool defaults, disabled, etc.
    this.currentState = CurrentState.Deactivated;
    return false;
  }

  public onViewToolExit(): boolean {
    if (!this.isEnabled)
      return false;

    this.onEventCommon();
    // NOTE: If a data button terminates a view command...exit is called between pre-data and data point event and needs to be ignored...
    this.savedState.ignoreDataButton = true;
    this.saveState(true); // Restore previous AccuDraw state...
    return false;
  }

  private saveState(restore: boolean, stateBuffer?: SavedState): void {
    if (!stateBuffer)
      stateBuffer = this.savedState;

    if (restore) {
      this.currentState = stateBuffer.state;
      this.currentView = stateBuffer.view;

      this.flags.auxRotationPlane = stateBuffer.auxRotationPlane;
      this.flags.contextRotMode = stateBuffer.contextRotMode;
      this.flags.fixedOrg = stateBuffer.fixedOrg;

      this.axes.setFrom(stateBuffer.axes);
      this.origin.setFrom(stateBuffer.origin);
      this.planePt.setFrom(stateBuffer.origin);

      this.setCompassMode(stateBuffer.mode);
      this.setRotationMode(stateBuffer.rotationMode);
      this.updateRotation();

      if (stateBuffer.ignoreDataButton)
        this.flags.ignoreDataButton = (this.flags.inDataPoint ? true : false);
      return;
    }

    stateBuffer.state = this.currentState;
    stateBuffer.view = this.currentView;
    stateBuffer.auxRotationPlane = this.flags.auxRotationPlane;
    stateBuffer.contextRotMode = this.flags.contextRotMode;
    stateBuffer.fixedOrg = this.flags.fixedOrg;
    stateBuffer.ignoreDataButton = false;
    stateBuffer.axes.setFrom(this.axes);
    stateBuffer.origin.setFrom(this.origin);
    stateBuffer.mode = this.getCompassMode();
    stateBuffer.rotationMode = this.rotationMode;
  }

  private getCompassPlanePoint(point: Point3d, vp: Viewport): boolean {
    point.setFrom(this.origin); // Isn't this just m_planePt?!? Maybe at display time it's not setup yet?!?
    if (this.fieldLocked[ItemField.Z_Item] && vp.view.is3d()) {
      if (0.0 !== this.delta.z && !(this.delta.z < Constants.SMALL_ANGLE && this.delta.z > -Constants.SMALL_ANGLE)) {
        point.addScaledInPlace(this.axes.z, this.delta.z);
        return true;
      }
    }
    return false;
  }

  private getDisplayTransform(vp: Viewport): Transform {
    const rMatrix = (!this.flags.animateRotation || 0.0 === this.percentChanged) ? this.axes.toRotMatrix() : this.lastAxes.toRotMatrix();
    const origin = new Point3d(); // Compass origin is adjusted by active z-lock...
    this.getCompassPlanePoint(origin, vp);
    const scale = vp.pixelsFromInches(this.compassSizeInches) * vp.getPixelSizeAtPoint(origin);
    rMatrix.scaleColumns(scale, scale, scale, rMatrix);
    return Transform.createRefs(origin, rMatrix);
  }

  private setIndexingTolerance(vp: Viewport) {
    const origin = new Point3d(); // Compass origin is adjusted by active z-lock...
    this.getCompassPlanePoint(origin, vp);
    this.tolerance = vp.pixelsFromInches(this.indexToleranceInches) * vp.getPixelSizeAtPoint(origin);
    if (Constants.SMALL_ANGLE > this.tolerance)
      this.tolerance = Constants.SMALL_ANGLE;
  }

  private displayAlignments(graphic: GraphicBuilder, vp: Viewport): void {
    const bgColor = vp.view.backgroundColor;
    const colorIndex = this.indexColor.adjustForContrast(bgColor, 125);
    const pts: Point3d[] = [];

    pts[0] = new Point3d();
    // For non-zero Z value draw indicator line from plane point to compass origin...
    if (this.getCompassPlanePoint(pts[0], vp)) {
      const colorZ = this.frameColor.adjustForContrast(bgColor, 100);
      pts[1] = this.origin;
      graphic.setSymbology(colorZ, colorZ, 2);
      graphic.addLineString(2, pts);
      pts[0] = pts[1];
      graphic.setSymbology(colorZ, colorZ, 4);
      graphic.addLineString(2, pts);
    }

    // Get snap point from AccuSnap/Tentative or use raw point...
    let distance = 0.0;
    let snapPt = this.rawPoint;
    const ptP = this.point;

    const snap = TentativeOrAccuSnap.getCurrentSnap();
    if (snap) {
      snapPt = snap.m_snapPoint;
      distance = ptP.distance(snapPt);
    }

    const isRectMode = (CompassMode.Rectangular === this.getCompassMode());
    const offsetSnap = ((TentativeOrAccuSnap.isHot() || TentativePoint.instance.isActive) && ((this.locked) || (distance > 0.0)));

    // XY Offset:
    if (offsetSnap) {
      pts[0] = ptP;
      if (isRectMode) {
        pts[1] = this.rawPointOnPlane;
        const vec = pts[0].vectorTo(pts[1]);

        const xOffset = vec.dotProduct(this.axes.x);
        const yOffset = vec.dotProduct(this.axes.y);
        const xIsOffset = (Math.abs(xOffset) > 1.0);
        const yIsOffset = (Math.abs(yOffset) > 1.0);

        if (xIsOffset) {
          if (yIsOffset) {  /* both */
            pts[2] = pts[1];
            pts[1] = pts[0].plusScaled(this.axes.y, yOffset);
            pts[3] = pts[0].plusScaled(this.axes.x, xOffset);
            pts[4] = pts[0];
            graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
            graphic.addLineString(5, pts);

            pts[1] = pts[2];  /* used by z offset */
          } else {  /* just X */
            graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
            graphic.addLineString(2, pts);
          }
        } else if (yIsOffset) {  /* just Y */
          graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
          graphic.addLineString(2, pts);
        }
      }
    }

    const isOnCompassPlane = (!vp.view.is3d() || this.flags.pointIsOnPlane || this.isZLocked(vp));

    // Z Offset:
    if (offsetSnap) {
      if (isOnCompassPlane) {
        if (isRectMode) {
          const zOffset = snapPt.distance(this.rawPointOnPlane);

          if (zOffset > Constants.SMALL_ANGLE || zOffset < -Constants.SMALL_ANGLE) {
            pts[2] = this.rawPoint;
            graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
            graphic.addLineString(2, [pts[1], pts[2]]);
          }
        } else {
          pts[1] = this.rawPoint;
          graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
          graphic.addLineString(2, pts);
        }
      }
    }

    // Fat Point:
    if (offsetSnap) {
      pts[0] = ptP;
      pts[1] = ptP;
      graphic.setSymbology(colorIndex, colorIndex, 8);
      graphic.addPointString(2, pts);
    }

    let axisIsIndexed = false;

    // Axis Indexing:
    if (isRectMode) {
      if ((this.indexed & LockedStates.XY_BM) && (this.flags.pointIsOnPlane || this.fieldLocked[ItemField.Z_Item])) {
        pts[1] = this.planePt;
        axisIsIndexed = true;
      }
    } else {
      if ((this.indexed & LockedStates.ANGLE_BM || this.locked & LockedStates.ANGLE_BM) && (this.flags.pointIsOnPlane || this.fieldLocked[ItemField.Z_Item])) {
        pts[1] = this.planePt;
        axisIsIndexed = true;
      }
    }

    if (axisIsIndexed) {
      pts[0] = ptP;
      graphic.setSymbology(colorIndex, colorIndex, 4);
      graphic.addLineString(2, pts);
    }

    // Distance Indexing:
    if (this.indexed & LockedStates.DIST_BM) {
      const len = this.tolerance; // Show tick mark based on _GetIndexToleranceInches for length...
      let vec: Vector3d;

      if (isRectMode) {
        let index = this.indexed & LockedStates.XY_BM;

        if (!index)
          index = this.locked & LockedStates.XY_BM;

        vec = (index === LockedStates.X_BM) ? this.axes.x : this.axes.y;
      } else {
        const deltaVec = this.origin.vectorTo(ptP);
        vec = this.axes.z.crossProduct(deltaVec);
        vec.normalizeInPlace();
      }

      pts[0] = ptP.plusScaled(vec, len);
      pts[1] = ptP.plusScaled(vec, -len);
      graphic.setSymbology(colorIndex, colorIndex, 3);
      graphic.addLineString(2, pts);
    }

    // XY Lock:
    if (isRectMode && !axisIsIndexed) {
      const locked = this.locked & LockedStates.XY_BM;

      if ((0 !== locked) && isOnCompassPlane) {
        if (locked & LockedStates.X_BM)
          pts[2] = this.planePt.plusScaled(this.axes.x, this.delta.x);

        if (locked & LockedStates.Y_BM)
          pts[0] = this.planePt.plusScaled(this.axes.y, this.delta.y);

        pts[1] = ptP;

        switch (locked) {
          case LockedStates.X_BM:
            graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
            graphic.addLineString(2, [pts[1], pts[2]]);
            break;

          case LockedStates.Y_BM:
            graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
            graphic.addLineString(2, pts);
            break;

          case LockedStates.XY_BM:
            graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
            graphic.addLineString(3, pts);
            break;
        }
      }
    }
  }

  public display(context: DecorateContext) {
    // Make sure this is cleared even if we do nothing...redraw might have been to make compass go away...
    this.flags.redrawCompass = false;

    // Check that AccuDraw is enabled...
    if (!this.isActive)
      return;

    const vp = context.viewport;
    if (this.currentView !== vp) // Do nothing if AccuDraw is not enabled for this view...
      return;

    this.setIndexingTolerance(vp);

    // Display indexing lines, distance locks, etc. without compass transform...
    let graphic = context.createWorldOverlay();
    this.displayAlignments(graphic, vp);
    context.addWorldOverlay(graphic.finish()!);

    const transform = this.getDisplayTransform(vp);

    // Create a new graphics with the compass transform and scale so that compass size is 1.0...
    graphic = context.createWorldOverlay(transform);

    const hasFocus = this.hasInputFocus;
    const bgColor = vp.view.backgroundColor;
    const darkGrey = new ColorDef(ColorRgb.darkGrey);
    const lightGrey = new ColorDef(ColorRgb.lightGrey);
    const frameColor = (hasFocus ? this.frameColor : darkGrey).adjustForContrast(bgColor, 100);
    const fillColor = (hasFocus ? this.fillColor : lightGrey).adjustForContrast(bgColor, 180);
    const xColor = (hasFocus ? this.xColor : darkGrey).adjustForContrast(bgColor, 100);
    const yColor = (hasFocus ? this.yColor : darkGrey).adjustForContrast(bgColor, 100);
    const shadowColor = frameColor;

    // Display compass frame...
    graphic.setSymbology(shadowColor, fillColor, 1);

    const center = Point3d.createZero();

    if (this.flags.animateRotation || 0.0 === this.percentChanged) {
      if (CompassMode.Polar === this.getCompassMode()) {
        const ellipse = Arc3d.createXYEllipse(center, 1, 1);
        graphic.addArc(ellipse, true, true);
        graphic.addArc(ellipse, false, false);
      } else {
        const shapePts: Point3d[] = [
          new Point3d(-1.0, 1.0, 0.0),
          new Point3d(1.0, 1.0, 0.0),
          new Point3d(1.0, -1.0, 0.0),
          new Point3d(-1.0, -1.0, 0.0)];
        shapePts[4] = shapePts[0];
        graphic.addShape(5, shapePts, true);
        graphic.addLineString(5, shapePts);
      }
    } else {
      let nSides, radius;
      const minSides = 7, maxSides = 24, factor = 1.0 / 5.0;

      // if currently animating change to polar need to get larger radius...go between 1.0 && 1.0 * sqrt (2.0)
      if (CompassMode.Polar === this.getCompassMode()) {
        nSides = minSides + Math.floor(maxSides * this.percentChanged);
        radius = 1.0 + factor - (factor * this.percentChanged);
      } else {
        nSides = (maxSides - Math.floor(maxSides * this.percentChanged)) + minSides;
        radius = 1.0 + (factor * this.percentChanged);
      }

      let angle = 0.0; const delta = (Math.PI * 2) / nSides;
      const shapePtsP: Point3d[] = [];

      for (let iSide = 0; iSide < nSides; iSide++ , angle += delta)
        shapePtsP[iSide] = new Point3d(radius * Math.cos(angle), radius * Math.sin(angle), 0.0);

      shapePtsP[nSides] = shapePtsP[0];

      graphic.addShape(nSides + 1, shapePtsP, true);
      graphic.addLineString(nSides + 1, shapePtsP);
    }

    // Display sticky z-lock indicator as frame inset...
    if (this.fieldLocked[ItemField.Z_Item] && this.stickyZLock && vp.view.is3d()) {
      graphic.setSymbology(frameColor, fillColor, 1);

      if (CompassMode.Polar === this.getCompassMode()) {
        const ellipse = Arc3d.createXYEllipse(center, .5, .5);
        graphic.addArc(ellipse, false, false);
      } else {
        const shapePts: Point3d[] = [
          new Point3d(-0.5, 0.5, 0.0),
          new Point3d(0.5, 0.5, 0.0),
          new Point3d(0.5, -0.5, 0.0),
          new Point3d(-0.5, -0.5, 0.0)];
        shapePts[4] = shapePts[0];
        graphic.addLineString(5, shapePts);
      }
    }

    // Display compass center mark...
    graphic.setSymbology(frameColor, frameColor, 8);
    graphic.addPointString(1, [center]);

    // Display positive "X" tick...
    graphic.setSymbology(xColor, xColor, 4);

    const linePts: Point3d[] = [];
    linePts[0] = new Point3d(1.2, 0.0, 0.0);
    linePts[1] = new Point3d(0.8, 0.0, 0.0);
    graphic.addLineString(2, linePts);

    // Display negative "X" tick...
    graphic.setSymbology(frameColor, frameColor, 1);

    linePts[0].set(-1.2, 0.0, 0.0);
    linePts[1].set(-0.8, 0.0, 0.0);
    graphic.addLineString(2, linePts);

    // Display positive "Y" tick...
    graphic.setSymbology(yColor, yColor, 4);

    linePts[0].set(0.0, 1.2, 0.0);
    linePts[1].set(0.0, 0.8, 0.0);
    graphic.addLineString(2, linePts);

    // Display negative "Y" tick...
    graphic.setSymbology(frameColor, frameColor, 1);

    linePts[0].set(0.0, -1.2, 0.0);
    linePts[1].set(0.0, -0.8, 0.0);
    graphic.addLineString(2, linePts);

    context.addWorldOverlay(graphic.finish()!); // add compass as world overlay decorator
  }

  private checkRotation(): void {
    this.updateRotation();

    if (RotationMode.View === this.rotationMode || !this.flags.lockedRotation)
      return;

    const vp = this.currentView;
    if (!vp || vp.isCameraOn())
      return;

    const viewZRoot = vp.rotMatrix.getRow(2);
    if (!this.axes.z.isPerpendicularTo(viewZRoot))
      return;

    const preferY = (Math.abs(this.axes.x.dotProduct(viewZRoot)) < Math.abs(this.axes.y.dotProduct(viewZRoot)));

    // NOTE: Cycle rotation to get one that isn't edge-on...
    switch (this.rotationMode) {
      case RotationMode.Top:
        this.setRotationMode(preferY ? RotationMode.Front : RotationMode.Side);
        break;
      case RotationMode.Front:
        this.setRotationMode(preferY ? RotationMode.Top : RotationMode.Side);
        break;
      case RotationMode.Side:
        this.setRotationMode(preferY ? RotationMode.Top : RotationMode.Front);
        break;
      case RotationMode.ACS:
        switch (this.flags.auxRotationPlane) {
          case RotationMode.Top:
            this.flags.auxRotationPlane = preferY ? RotationMode.Front : RotationMode.Side;
            break;
          case RotationMode.Front:
            this.flags.auxRotationPlane = preferY ? RotationMode.Top : RotationMode.Side;
            break;
          case RotationMode.Side:
            this.flags.auxRotationPlane = preferY ? RotationMode.Top : RotationMode.Front;
            break;
          default:
            return;
        }
        break;
      default:
        return;
    }

    this.updateRotation();
    this.flags.baseRotation = this.rotationMode;
  }

  private saveLockedCoords(): void {
    if (CompassMode.Polar === this.currentMode) {
      if (this.fieldLocked[ItemField.DIST_Item])
        this.saveCoordinate(ItemField.DIST_Item, this.distance);
      if (this.fieldLocked[ItemField.ANGLE_Item])
        this.saveCoordinate(ItemField.ANGLE_Item, this.angle);
    } else {
      if (this.fieldLocked[ItemField.X_Item])
        this.saveCoordinate(ItemField.X_Item, this.delta.x);
      if (this.fieldLocked[ItemField.Y_Item])
        this.saveCoordinate(ItemField.Y_Item, this.delta.y);
    }

    const vp = this.currentView;
    if (vp && vp.view.is3d()) {
      if (this.fieldLocked[ItemField.Z_Item])
        this.saveCoordinate(ItemField.Z_Item, this.delta.z);
    }
  }

  protected onCompassModeChange(): void { }
  protected onRotationModeChange(): void { }
  protected onFieldLockChange(_index: ItemField) { }
  protected onFieldValueChange(_index: ItemField) { }
  protected hasInputFocus() { return true; }
  protected setFocusItem(_index: ItemField) { }

  private static getMinPolarMag(origin: Point3d): number {
    return (1.0e-12 * (1.0 + origin.magnitude()));
  }

  /** projects cursor onto plane in view, or returns an error */
  private constructionPlane(outPtP: Point3d, inPtP: Point3d, pointOnPlaneP: Point3d, normalVectorP: Vector3d, vp: Viewport, perpendicular: boolean): BentleyStatus {
    let fromPtP: Point3d;
    let dotProduct: number;
    let distance: number;
    let projectionVector = new Vector3d();

    if (perpendicular) {
      if (AccuDraw.useACSContextRotation(vp, true)) { // Project along ACS axis to AccuDraw plane...
        const rMatrix = vp.getAuxCoordRotation(AccuDraw.tempRot);
        const axes = ThreeAxes.createFromRotMatrix(rMatrix);
        this.accountForAuxRotationPlane(axes, this.flags.auxRotationPlane);
        LegacyMath.linePlaneIntersect(outPtP, inPtP, axes.z, pointOnPlaneP, normalVectorP, false);
      } else {
        projectionVector = inPtP.vectorTo(pointOnPlaneP);
        distance = projectionVector.dotProduct(normalVectorP);
        inPtP.plusScaled(normalVectorP, distance, outPtP);
      }
    } else {
      const isCamera = vp.isCameraOn();
      if (vp.view.is3d() && isCamera) {
        const cameraPos = vp.view.getEyePoint();
        fromPtP = cameraPos;
        fromPtP.vectorTo(inPtP, projectionVector).normalizeInPlace();
      } else {
        const rMatrix = vp.rotMatrix;
        fromPtP = inPtP;
        rMatrix.getRow(2, projectionVector);
      }

      dotProduct = projectionVector.dotProduct(normalVectorP);

      if (Math.abs(dotProduct) < Constants.SMALL_DELTA)
        return BentleyStatus.ERROR; // PARALLEL;

      distance = (normalVectorP.dotProduct(pointOnPlaneP) - normalVectorP.dotProduct(fromPtP)) / dotProduct;

      if (isCamera && distance < Constants.SMALL_DELTA)
        return BentleyStatus.ERROR; // BEHIND_EYE_POINT;

      fromPtP.plusScaled(projectionVector, distance, outPtP);
    }

    return BentleyStatus.SUCCESS;
  }

  private softConstructionPlane(outPtP: Point3d, inPtP: Point3d, pointOnPlaneP: Point3d, normalVectorP: Vector3d, vp: Viewport, isSnap: boolean): boolean {
    if (!vp.isPointAdjustmentRequired()) {
      outPtP.setFrom(inPtP);
      return true;
    }

    if (isSnap) {
      outPtP.setFrom(inPtP);
      const delta = pointOnPlaneP.vectorTo(outPtP);
      return (Math.abs(normalVectorP.dotProduct(delta)) < Constants.SMALL_DELTA);
    }
    if (BentleyStatus.SUCCESS !== this.constructionPlane(outPtP, inPtP, pointOnPlaneP, normalVectorP, vp, false)) {
      const viewNormal = vp.rotMatrix.getRow(2);
      this.constructionPlane(outPtP, inPtP, pointOnPlaneP, viewNormal, vp, false);
      this.constructionPlane(outPtP, outPtP, pointOnPlaneP, normalVectorP, vp, true);
      return false;
    }
    return true;
  }

  /** snap projects normal, always produces point */
  private hardConstructionPlane(outPtP: Point3d, inPtP: Point3d, pointOnPlaneP: Point3d, normalVectorP: Vector3d, vp: Viewport, isSnap: boolean): boolean {
    if (!vp.isPointAdjustmentRequired()) {
      outPtP.setFrom(inPtP);
      return true;
    }

    if (BentleyStatus.SUCCESS !== this.constructionPlane(outPtP, inPtP, pointOnPlaneP, normalVectorP, vp, isSnap)) {
      const viewNormal = vp.rotMatrix.getRow(2);
      this.constructionPlane(outPtP, inPtP, pointOnPlaneP, viewNormal, vp, false);
      this.constructionPlane(outPtP, outPtP, pointOnPlaneP, normalVectorP, vp, true);
    }

    return true;
  }

  private static allowAxisIndexing(pointIsOnPlane: boolean): boolean {
    // NOTE: Normally we don't want indexing overriding a hot snap location. The
    //       exception to this is nearest snap. If the nearest snap is in the plane
    //       of the AccuDraw compass, it's confusing not having axis indexing.
    if (!TentativeOrAccuSnap.isHot())
      return true;

    if (!pointIsOnPlane)
      return false;

    const snapDetail = AccuSnap.instance.getCurrSnapDetail();
    return (!!snapDetail && (SnapMode.Nearest === snapDetail.m_snapMode));
  }

  public fixPointPolar(vp: Viewport): void {
    let angleChanged = false;
    let distChanged = false;
    const zLocked = this.isZLocked(vp);
    const xyCorrection = new Point3d();

    this.planePt.setFrom(this.origin);

    if (zLocked && !(this.delta.z < Constants.SMALL_ANGLE && this.delta.z > -Constants.SMALL_ANGLE))
      this.planePt.addScaledInPlace(this.axes.z, this.delta.z);

    if (this.locked & LockedStates.VEC_BM) {
      if (!TentativeOrAccuSnap.isHot()) {
        const normVec = new Vector3d();
        this.planeByVectorAndView(normVec, this.vector, vp);
        this.softConstructionPlane(this.rawPointOnPlane, this.rawPoint, this.planePt, normVec, vp, false);
      } else {
        this.rawPointOnPlane.setFrom(this.rawPoint);
        this.flags.pointIsOnPlane = false;
      }
    } else {
      if (zLocked) {
        this.hardConstructionPlane(this.rawPointOnPlane, this.rawPoint, this.planePt, this.axes.z, vp, TentativeOrAccuSnap.isHot());
        this.flags.pointIsOnPlane = true;
      } else {
        this.flags.pointIsOnPlane = (this.softConstructionPlane(this.rawPointOnPlane, this.rawPoint, this.planePt, this.axes.z, vp, TentativeOrAccuSnap.isHot()) || !!(this.locked & LockedStates.XY_BM));
      }
    }

    let delta: Vector3d;
    if (zLocked)
      delta = this.planePt.vectorTo(this.rawPointOnPlane);
    else
      delta = this.origin.vectorTo(this.rawPointOnPlane);

    const minPolarMag = AccuDraw.getMinPolarMag(this.origin);

    let mag: number;
    if (this.locked & LockedStates.VEC_BM) {
      mag = delta.dotProduct(this.vector);
      xyCorrection.x -= delta.x - mag * this.vector.x;
      xyCorrection.y -= delta.y - mag * this.vector.y;
      xyCorrection.z -= delta.z - mag * this.vector.z;
      this.vector.scale(mag, delta);
      if (mag < 0.0)
        mag = -mag;
      if (mag < minPolarMag) {
        this.handleDegeneratePolarCase();
        return;
      }

      this.flags.pointIsOnPlane = (Math.abs(this.axes.z.dotProduct(delta)) < Constants.SMALL_DELTA);
    } else {
      mag = delta.magnitude();
      if (mag < minPolarMag) {
        this.handleDegeneratePolarCase();
        return;
      }
    }

    const newPt = this.rawPointOnPlane.plus(xyCorrection);
    xyCorrection.setZero();

    // measure angle
    const rotVec = new Point3d();
    rotVec.x = this.axes.x.dotProduct(delta);

    // NOTE: Always return angle relative to compass plane...used to return "angle out of plane" for points off plane.
    rotVec.y = this.axes.y.dotProduct(delta);
    this.angle = Math.atan2(rotVec.y, rotVec.x);

    // constrain angle
    if (this.flags.pointIsOnPlane && !(this.locked & LockedStates.VEC_BM)) {
      if (!TentativeOrAccuSnap.isHot() && this.angleRoundOff.active) {
        this.angle = this.angleRoundOff.units * Math.floor((this.angle / this.angleRoundOff.units) + 0.5);

        xyCorrection.x += Math.cos(this.angle) * mag - rotVec.x;
        xyCorrection.y += Math.sin(this.angle) * mag - rotVec.y;

        rotVec.x = Math.cos(this.angle) * mag;
        rotVec.y = Math.sin(this.angle) * mag;

        angleChanged = true;
      }

      if (this.locked & LockedStates.X_BM || (AccuDraw.allowAxisIndexing(this.flags.pointIsOnPlane) && (rotVec.x < this.tolerance && rotVec.x > - this.tolerance) && !this.flags.indexLocked && this.axisIndexing)) {
        this.indexed |= LockedStates.X_BM; // indexed in X

        xyCorrection.x -= rotVec.x;
        rotVec.x = 0.0;

        if (TentativeOrAccuSnap.isHot())
          xyCorrection.z -= delta.dotProduct(this.axes.z);

        this.angle = (rotVec.y < 0.0) ? -Math.PI / 2.0 : Math.PI / 2.0;
        angleChanged = true;
      }

      if (this.locked & LockedStates.Y_BM || (AccuDraw.allowAxisIndexing(this.flags.pointIsOnPlane) && (rotVec.y < this.tolerance && rotVec.y > -this.tolerance) && !this.flags.indexLocked && this.axisIndexing)) {
        if (this.indexed & LockedStates.X_BM) { // both indexed
          this.handleDegeneratePolarCase();
          return;
        }

        this.indexed |= LockedStates.Y_BM; // indexed in Y
        xyCorrection.y -= rotVec.y;

        if (TentativeOrAccuSnap.isHot())
          xyCorrection.z -= delta.dotProduct(this.axes.z);

        rotVec.y = 0.0;
        this.angle = (rotVec.x < 0.0) ? Math.PI : 0.0;
        angleChanged = true;
      }

      if (angleChanged) {
        delta.addScaledInPlace(this.axes.x, rotVec.x);
        delta.addScaledInPlace(this.axes.y, rotVec.y);
        mag = delta.magnitude();
        if (mag < minPolarMag) {
          this.handleDegeneratePolarCase();
          return;
        }
      }
    }

    // constrain distance
    const oldMag = mag;

    if (this.locked & LockedStates.DIST_BM) { // distance locked
      mag = this.distance;
      distChanged = true;
      this.indexed &= ~LockedStates.DIST_BM;
    } else if (!TentativeOrAccuSnap.isHot()) { // if non-snap, try rounding and aligning
      if (this.distanceRoundOff.active) {
        mag = this.distanceRoundOff.units * Math.floor((mag / this.distanceRoundOff.units) + 0.5);
        distChanged = true;
      }

      if (Geometry.isDistanceWithinTol(mag - this.lastDistance, this.tolerance) && !this.flags.indexLocked && this.distanceIndexing) {
        this.indexed |= LockedStates.DIST_BM; // distance indexed
        mag = this.lastDistance;
        distChanged = true;
      }
    }

    // project to corrected point
    newPt.plus3Scaled(this.axes.x, xyCorrection.x, this.axes.y, xyCorrection.y, this.axes.z, xyCorrection.z, newPt);

    // display index highlight even if snapped
    if (TentativeOrAccuSnap.isHot() && this.flags.pointIsOnPlane) {
      if (Math.abs(rotVec.x) < Constants.SMALL_ANGLE)
        this.indexed |= LockedStates.X_BM;
      else if (Math.abs(rotVec.y) < Constants.SMALL_ANGLE)
        this.indexed |= LockedStates.Y_BM;
    }

    if (distChanged) {
      if (mag < minPolarMag && mag > -minPolarMag) {
        this.handleDegeneratePolarCase();
        return;
      }

      // adjust corrected point for distance indexing
      newPt.addScaledInPlace(delta, mag / oldMag - 1.0);
      delta.scaleInPlace(mag / oldMag);
    }

    // save corrected point
    this.point.setFrom(newPt);

    // finish up
    this.distance = mag;

    if (!(this.locked & LockedStates.VEC_BM))
      delta.scale(1.0 / mag, this.vector);

    if (this.locked & LockedStates.XY_BM)
      this.indexed |= this.locked;

    if (!zLocked)
      this.delta.z = (this.flags.pointIsOnPlane) ? 0.0 : delta.dotProduct(this.axes.z);
  }

  private fixPointRectangular(vp: Viewport): void {
    const zLocked = this.isZLocked(vp);
    const xyCorrection = new Vector3d();

    this.planePt.setFrom(this.origin);
    this.indexed = 0;

    if (zLocked) {
      this.flags.pointIsOnPlane = (this.delta.z < Constants.SMALL_ANGLE && this.delta.z > -Constants.SMALL_ANGLE);
      if (!this.flags.pointIsOnPlane)
        this.planePt.addScaledInPlace(this.axes.z, this.delta.z);
      this.hardConstructionPlane(this.rawPointOnPlane, this.rawPoint, this.planePt, this.axes.z, vp, TentativeOrAccuSnap.isHot());
    } else {
      this.flags.pointIsOnPlane = this.softConstructionPlane(this.rawPointOnPlane, this.rawPoint, this.origin, this.axes.z, vp, TentativeOrAccuSnap.isHot());
    }

    const trueDelta = this.origin.vectorTo(this.rawPointOnPlane);
    this.rawDelta.x = trueDelta.dotProduct(this.axes.x);
    this.xIsNegative = (this.rawDelta.x < -Constants.SMALL_ANGLE);

    this.rawDelta.y = trueDelta.dotProduct(this.axes.y);
    this.yIsNegative = (this.rawDelta.y < -Constants.SMALL_ANGLE);

    if (!zLocked)
      this.delta.z = (this.flags.pointIsOnPlane) ? 0.0 : trueDelta.dotProduct(this.axes.z);

    if (AccuDraw.allowAxisIndexing(this.flags.pointIsOnPlane)) {
      if (!(this.locked & LockedStates.X_BM)) { // not locked in x
        if (this.distanceRoundOff.active) { // round x
          xyCorrection.x = this.distanceRoundOff.units * Math.floor((this.rawDelta.x / this.distanceRoundOff.units) + 0.5) - this.rawDelta.x;
          this.rawDelta.x = this.distanceRoundOff.units * Math.floor((this.rawDelta.x / this.distanceRoundOff.units) + 0.5);
        }

        if (this.rawDelta.x < this.tolerance && this.rawDelta.x > -this.tolerance &&
          !this.flags.indexLocked && this.axisIndexing) { // index x
          this.indexed |= LockedStates.X_BM; // indexed in X
          xyCorrection.x -= this.rawDelta.x;
          this.rawDelta.x = 0.0;
        }
      }
      if (!(this.locked & LockedStates.Y_BM)) {
        if (this.distanceRoundOff.active) { // round y
          xyCorrection.y = this.distanceRoundOff.units * Math.floor((this.rawDelta.y / this.distanceRoundOff.units) + 0.5) - this.rawDelta.y;
          this.rawDelta.y = this.distanceRoundOff.units * Math.floor((this.rawDelta.y / this.distanceRoundOff.units) + 0.5);
        }

        if (this.rawDelta.y < this.tolerance && this.rawDelta.y > -this.tolerance &&
          !this.flags.indexLocked && this.axisIndexing) { // index y
          this.indexed |= LockedStates.Y_BM; // indexed in Y
          xyCorrection.y -= this.rawDelta.y;
          this.rawDelta.y = 0.0;
        }
      }
    }

    if (this.locked & LockedStates.X_BM) {
      if (this.rawDeltaIsValid(this.rawDelta.x)) {
        // cursor changed sides, reverse value
        if ((this.delta.x < -Constants.SMALL_ANGLE) !== this.xIsNegative &&
          this.smartKeyin && this.keyinStatus[ItemField.X_Item] === KeyinStatus.Partial &&
          !this.xIsExplicit)
          this.delta.x = -this.delta.x;
      }

      xyCorrection.x = this.delta.x - this.rawDelta.x;
    } else {
      const lastDist = (this.rawDelta.x < 0.0) ? (-this.lastDistance) : this.lastDistance;

      if (!TentativeOrAccuSnap.isHot() && ((this.locked & LockedStates.Y_BM) || (this.indexed & LockedStates.Y_BM)) && !(this.indexed & LockedStates.X_BM) &&
        Geometry.isDistanceWithinTol(this.rawDelta.x - lastDist, this.tolerance) &&
        !this.flags.indexLocked && this.distanceIndexing) {
        xyCorrection.x += lastDist - this.rawDelta.x;
        this.delta.x = lastDist;
        this.indexed |= LockedStates.DIST_BM;
      } else {
        this.delta.x = this.rawDelta.x;
      }
    }

    if (this.locked & LockedStates.Y_BM) {
      if (this.rawDeltaIsValid(this.rawDelta.y)) {
        // cursor changed sides, reverse value
        if ((this.delta.y < -Constants.SMALL_ANGLE) !== this.yIsNegative &&
          this.smartKeyin && this.keyinStatus[ItemField.Y_Item] === KeyinStatus.Partial &&
          !this.yIsExplicit)
          this.delta.y = -this.delta.y;
      }

      xyCorrection.y = this.delta.y - this.rawDelta.y;
    } else {
      const lastDist = (this.rawDelta.y < Constants.SMALL_ANGLE) ? - this.lastDistance : this.lastDistance;

      if (!TentativeOrAccuSnap.isHot() && ((this.locked & LockedStates.X_BM) || (this.indexed & LockedStates.X_BM)) && !(this.indexed & LockedStates.Y_BM) &&
        Geometry.isDistanceWithinTol(this.rawDelta.y - lastDist, this.tolerance) &&
        !this.flags.indexLocked && this.distanceIndexing) {
        xyCorrection.y += lastDist - this.rawDelta.y;
        this.delta.y = lastDist;
        this.indexed |= LockedStates.DIST_BM;
      } else {
        this.delta.y = this.rawDelta.y;
      }
    }

    this.rawPointOnPlane.plus2Scaled(this.axes.x, xyCorrection.x, this.axes.y, xyCorrection.y, this.point);

    if (zLocked && !this.flags.pointIsOnPlane)
      this.hardConstructionPlane(this.point, this.point, this.planePt, this.axes.z, vp, TentativeOrAccuSnap.isHot());

    if ((this.locked & LockedStates.X_BM && this.delta.x === 0.0) || (this.locked & LockedStates.Y_BM && this.delta.y === 0.0)) {
      this.indexed |= this.locked; // to display index highlight
    } else if (TentativeOrAccuSnap.isHot()) {
      if (Math.abs(this.delta.x) < Constants.SMALL_ANGLE)
        this.indexed |= LockedStates.X_BM;
      else if (Math.abs(this.delta.y) < Constants.SMALL_ANGLE)
        this.indexed |= LockedStates.Y_BM;
    }

    const lock = this.locked & LockedStates.XY_BM;
    const index = this.indexed & LockedStates.XY_BM;

    if (lock === LockedStates.Y_BM && index !== LockedStates.X_BM) {
      if (this.keyinStatus[ItemField.Y_Item] !== KeyinStatus.Dynamic) {
        if (Math.abs(this.rawDelta.x) < this.threshold)
          return;
      }

      this.newFocus = ItemField.X_Item;
      this.dontMoveFocus = false;
    } else if (lock === LockedStates.X_BM && index !== LockedStates.Y_BM) {
      if (this.keyinStatus[ItemField.X_Item] !== KeyinStatus.Dynamic) {
        if (Math.abs(this.rawDelta.y) < this.threshold)
          return;
      }

      this.newFocus = ItemField.Y_Item;
      this.dontMoveFocus = false;
    } else {
      this.newFocus = ((Math.abs(this.rawDelta.x) > Math.abs(this.rawDelta.y)) ? ItemField.X_Item : ItemField.Y_Item);
    }
  }

  private fixPoint(pointActive: Point3d, vp: Viewport): void {
    if (this.isActive() && ((vp !== this.currentView) || this.flags.rotationNeedsUpdate)) {
      this.currentView = vp;

      if (!(this.locked & LockedStates.ANGLE_BM || this.fieldLocked[ItemField.Z_Item])) {
        // origin not locked down...may change when vie changes...
        if (!this.flags.haveValidOrigin)
          this.setDefaultOrigin(vp);

        // in a view based rotation, and the view has changed, so update the rotation...
        if (!this.flags.lockedRotation) {
          this.updateRotation();
          this.flags.rotationNeedsUpdate = false;
        }
      }
    }
    if (this.isInactive() || this.isDeactivated()) {
      this.point.setFrom(pointActive);
      this.currentView = vp;

      if (this.published.flags)
        this.processHints();

      return;
    }
    if (this.isActive()) {
      this.rawPoint.setFrom(pointActive);
      this.currentView = vp;
      this.flags.dialogNeedsUpdate = true;

      if (TentativeOrAccuSnap.isHot() && CompassMode.Polar === this.getCompassMode())
        this.indexed = this.locked;
      else
        this.indexed = LockedStates.NONE_LOCKED;

      if (CompassMode.Polar === this.getCompassMode())
        this.fixPointPolar(vp);
      else
        this.fixPointRectangular(vp);

      pointActive.setFrom(this.point);
    } else if (CompassMode.Rectangular === this.getCompassMode()) {
      if (this.fieldLocked[ItemField.X_Item])
        pointActive.x = this.delta.x;

      if (this.fieldLocked[ItemField.Y_Item])
        pointActive.y = this.delta.y;

      if (this.fieldLocked[ItemField.Z_Item])
        pointActive.z = this.delta.z;
    }
  }

  private refreshDecorationsAndDynamics(): void {
    // Make sure AccuDraw updates it's decorations...
    const vp = this.currentView;
    if (!vp)
      return;

    vp.invalidateDecorations();

    // Make sure active tool updates it's dynamics. NOTE: Can't just call UpdateDynamics, need point adjusted for new locks, etc.
    const tool = ToolAdmin.instance.activeTool;
    if (!tool || !(tool instanceof PrimitiveTool))
      return;

    const ev = new BeButtonEvent();
    ToolAdmin.instance.fillEventFromCursorLocation(ev);

    // NOTE: Can't call DgnTool::OnMouseMotion since it can cause AccuDraw to move focus...
    const uorPoint = ev.point;
    ToolAdmin.instance.adjustPoint(uorPoint, ev.viewport!);
    ev.point = uorPoint;
    tool.updateDynamics(ev);
  }

  public onBeginDynamics(): boolean {
    if (!this.isEnabled())
      return false;

    this.onEventCommon();

    if (!this.isInactive())
      return false;

    const vp = this.currentView;
    if (!vp)
      return false;

    // NOTE: If ACS Plane lock setup initial and base rotation to ACS...
    if (vp && AccuDraw.useACSContextRotation(vp, false)) {
      this.setRotationMode(RotationMode.ACS);
      this.flags.baseRotation = RotationMode.ACS;
      this.flags.auxRotationPlane = RotationMode.Top;
    }

    if (this.published.flags & AccuDrawFlags.SmartRotation) {
      // const hitDetail = TentativeOrAccuSnap.getCurrentSnap(false);
      // NEEDS_WORK
      //   if (!hitDetail)
      //     hitDetail = ElementLocateManager:: GetManager().GetCurrHit();

      //   if (hitDetail) {
      //     DPoint3d                origin;
      //     RotMatrix               rMatrix;
      //     RotateToElemToolHelper  rotateHelper;

      //     // NOTE: Surface normal stored in HitDetail is for hit point, not snap/adjusted point...get normal at correct location...
      //     if (rotateHelper.GetOrientation(* hitDetail, origin, rMatrix)) {
      //       this.setContextRotation(rMatrix);
      //       this.changeBaseRotationMode(RotationMode.Context);
      //     }
      //   }
    }

    this.checkRotation();

    // Compass will jump to correct location when fixPoint is called...but we don't want to see the jump...
    if (!this.flags.haveValidOrigin)
      this.setDefaultOrigin(vp);

    // Initialize rawPoint data...invalid for alignments until next fixPoint...
    this.rawPoint.setFrom(this.point);
    this.rawPointOnPlane.setFrom(this.point);

    // Upgrade state to enabled...want compass to display...
    this.currentState = CurrentState.Active;

    return false;
  }

  public onEndDynamics(): boolean {
    if (!this.isEnabled())
      return false;
    this.onEventCommon();
    if (!this.isActive())
      return false;
    // Downgrade state back to inactive...
    this.currentState = CurrentState.Inactive;
    return false;
  }

  public onPreDataButton(ev: BeButtonEvent): boolean {
    if (!this.isEnabled())
      return false;

    this.onEventCommon();
    this.flags.inDataPoint = true;
    if (this.currentState < CurrentState.Inactive)
      return false;
    if (!this.currentView)
      this.currentView = ev.viewport;
    this.updateRotation();
    return false;
  }

  public onPostDataButton(ev: BeButtonEvent): boolean {
    if (!this.isEnabled())
      return false;

    this.onEventCommon();

    if (this.flags.ignoreDataButton) {
      // NOTE: Ignore this data point, was used to terminate a viewing command or input collector...
      this.flags.ignoreDataButton = false;
    } else if (!this.flags.fixedOrg && this.currentState >= CurrentState.Inactive) {
      /* set origin to last point placed unless its being set elsewhere */
      if (((!this.contextSensitive &&
        !(this.published.flags & (AccuDrawFlags.AlwaysSetOrigin ^ AccuDrawFlags.SetOrigin))) ||
        !(this.published.flags & AccuDrawFlags.SetOrigin))) {
        this.published.flags |= AccuDrawFlags.SetOrigin;

        if (this.currentState >= CurrentState.Inactive)
          this.published.origin.setFrom(ev.point);
        else
          this.published.origin.setFrom(this.point);
      }

      this.saveLockedCoords();

      if (this.published.flags)
        this.processHints();

      if (this.currentState >= CurrentState.Inactive)
        this.updateRotation();
    }

    this.flags.inDataPoint = false;
    this.flags.indexLocked = false;
    return false;
  }

  public oResetButtonUp(_ev: BeButtonEvent): boolean {
    if (TentativePoint.instance.isActive && this.isActive()) {
      TentativePoint.instance.clear(true);
      return true;
    }

    if (!this.isEnabled())
      return false;

    this.onEventCommon();
    return false;
  }

  public onTentative(): boolean {
    if (this.isActive() || this.isInactive())
      this.grabInputFocus(); // AccuDraw gets input focus on a tentative

    return false;
  }
  public onSnap(context: SnapContext): boolean {
    const snap = context.snapDetail;

    // If accudraw is locked, adjust near snap point to be the nearest point on this element, CONSTRAINED by the accudraw lock.
    if (!this.isActive || !this.locked || !snap)
      return false;

    if (SnapMode.Nearest !== snap.m_snapMode)
      return false;

    if (!snap.m_geomDetail.m_primitive)
      return false;

    // const refPt: Point3d;
    switch (this.locked) {
      // case LockedStates.VEC_BM:
      //   this.intersectLine(context, this.origin, this.vector);
      //   break;

      // case LockedStates.X_BM:
      //   refPt = (CompassMode.Rectangular === this.getCompassMode()) ? this.planePt.plusScaled(this.axes.x, this.delta.x) : this.origin;
      //   this.intersectLine(context, refPt, this.axes.y);
      //   break;

      // case LockedStates.Y_BM:
      //   refPt = (CompassMode.Rectangular === this.getCompassMode()) ? this.planePt.plusScaled(this.axes.y, this.delta.y) : this.origin;
      //   this.intersectLine(context, refPt, this.axes.x);
      //   break;

      // case LockedStates.DIST_BM:
      //   this.intersectCircle(context, this.origin, this.axes.z, this.distance);
      //   break;
    }

    return false;
  }

  public onSelectedViewportChanged(previous: Viewport, current: Viewport): void {
    // In case previous is closing, always update AccuDraw to current view...
    if (this.currentView && this.currentView === previous)
      this.currentView = current;

    // Reset AccuDraw when iModel or view type changes...
    if (current && previous && (current.view.classFullName === previous.view.classFullName) && (current.view.iModel === previous.view.iModel))
      return;

    this.currentView = undefined;
    this.flags.redrawCompass = false;
    this.flags.baseRotation = RotationMode.View;
    this.flags.auxRotationPlane = RotationMode.Top;
    this.flags.rotationNeedsUpdate = true;
    this.flags.haveValidOrigin = false;
    this.flags.indexLocked = false;
    this.flags.bearingFixToPlane2D = false;
    this.savedState.init();
    this.setRotationMode(RotationMode.View);
    this.updateRotation();
  }

  private doProcessHints(): void {

    if (!this.floatingOrigin) {
      if (this.published.flags & AccuDrawFlags.SetOrigin)
        this.unlockAllFields();
      return;
    }

    // Set Context Origin
    if (this.published.flags & AccuDrawFlags.SetOrigin) {
      if (this.floatingOrigin) {
        this.origin.setFrom(this.published.origin);
        this.point.setFrom(this.origin);
        this.planePt.setFrom(this.origin);
      }
      this.flags.haveValidOrigin = true;
      this.setLastPoint(this.origin);
      this.unlockAllFields();
      this.updateRotation();
    }

    if (!this.contextSensitive)
      return;

    // Mode -- Polar or Rectangular
    if (this.published.flags & (AccuDrawFlags.SetModePolar | AccuDrawFlags.SetModeRect)) {
      if (this.getCompassMode() !== ((this.published.flags & AccuDrawFlags.SetModePolar) ? CompassMode.Polar : CompassMode.Rectangular))
        this.changeCompassMode();
    }

    // Fixed Origin
    if (this.published.flags & AccuDrawFlags.FixedOrigin)
      this.flags.fixedOrg = true;

    // Save Distance
    if (this.published.flags & (AccuDrawFlags.SetDistance | AccuDrawFlags.LockDistance))
      this.saveCoordinate(ItemField.DIST_Item, this.published.distance);

    const vp = this.currentView;
    // Do Context Rotation
    if (this.published.flags & AccuDrawFlags.SetRMatrix) {
      this.axes.fromRotMatrix(this.published.rMatrix);
      this.flags.lockedRotation = true;
      this.flags.contextRotMode = ContextMode.Locked;
      this.setRotationMode(RotationMode.Context);
      this.updateRotation();
    } else if (this.published.flags & AccuDrawFlags.SetXAxis) {
      this.axes.x.setFrom(this.published.vector);
      this.flags.contextRotMode = ContextMode.XAxis;
      this.setRotationMode(RotationMode.Context);
      this.updateRotation();
    } else if (this.published.flags & AccuDrawFlags.SetXAxis2) {
      this.axes.x.setFrom(this.published.vector);
      this.flags.contextRotMode = ContextMode.XAxis2;
      this.setRotationMode(RotationMode.Context);
      this.updateRotation();
    } else if (this.published.flags & AccuDrawFlags.SetNormal) {
      if (vp && vp.view.is3d()) {
        this.axes.z.setFrom(this.published.vector);
        this.flags.contextRotMode = ContextMode.ZAxis;
        this.setRotationMode(RotationMode.Context);
        this.updateRotation();
      }
    } else if (this.published.flags & AccuDrawFlags.OrientACS) {
      this.flags.lockedRotation = true;
      this.flags.baseRotation = RotationMode.ACS;
      this.setRotationMode(RotationMode.ACS);
      this.updateRotation();
    } else if (this.isInactive() || (this.published.flags & AccuDrawFlags.OrientDefault)) {
      this.setRotationMode(this.flags.baseRotation);
      this.updateRotation();
    }

    if (this.published.flags & (AccuDrawFlags.SetRMatrix | AccuDrawFlags.SetXAxis | AccuDrawFlags.SetXAxis2 | AccuDrawFlags.SetNormal | AccuDrawFlags.OrientACS)) {
      this.savedState.axes.setFrom(this.axes);
      this.savedState.contextRotMode = this.flags.contextRotMode;
    }

    // Lock Items
    switch (this.getCompassMode()) {
      case CompassMode.Polar:
        if (this.published.flags & AccuDrawFlags.LockDistance) {
          this.distance = this.published.distance;
          this.distanceLock(true, true);
        }

        if (this.published.flags & AccuDrawFlags.LockAngle) {
          this.updateVector(this.published.angle);
          this.indexed = LockedStates.NONE_LOCKED;
          this.angleLock();
          this.saveCoordinate(ItemField.ANGLE_Item, this.published.angle);
        }
        break;

      case CompassMode.Rectangular:
        if ((this.published.flags & AccuDrawFlags.Lock_X)) {
          this.locked |= LockedStates.X_BM;
          this.delta.x = this.published.delta.x;
          this.setFieldLock(ItemField.X_Item, true);
          this.saveCoordinate(ItemField.X_Item, this.published.delta.x);
        }

        if ((this.published.flags & AccuDrawFlags.Lock_Y)) {
          this.locked |= LockedStates.Y_BM;
          this.delta.y = this.published.delta.y;
          this.setFieldLock(ItemField.Y_Item, true);
          this.saveCoordinate(ItemField.Y_Item, this.published.delta.y);
        }

        if ((this.published.flags & AccuDrawFlags.Lock_Z)) {
          if (vp && vp.view.is3d()) {
            this.delta.z = this.published.delta.z;
            this.setFieldLock(ItemField.Z_Item, true);
            this.saveCoordinate(ItemField.Z_Item, this.published.delta.z);
          }
        }
        break;
    }
  }

  private processHints(): void {
    if (!this.published.flags || !this.isEnabled())
      return;

    if (this.published.flags & AccuDrawFlags.Disable) {
      this.published.flags = 0;
      this.currentState = CurrentState.Deactivated;
      return;
    }
    const setFocus: boolean = !!(this.published.flags & AccuDrawFlags.SetFocus);
    this.doProcessHints();
    this.published.zero();
    if (this.isEnabled() || setFocus)
      this.grabInputFocus();
  }
}
