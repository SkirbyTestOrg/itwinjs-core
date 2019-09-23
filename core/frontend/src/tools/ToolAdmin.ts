/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Tools */

import { BeDuration, BeEvent, BeTimePoint, AbandonedError, Logger } from "@bentley/bentleyjs-core";
import { Matrix3d, Point2d, Point3d, Transform, Vector3d, XAndY } from "@bentley/geometry-core";
import { GeometryStreamProps, NpcCenter } from "@bentley/imodeljs-common";
import { AccuSnap, TentativeOrAccuSnap } from "../AccuSnap";
import { LocateOptions } from "../ElementLocateManager";
import { HitDetail } from "../HitDetail";
import { IModelApp } from "../IModelApp";
import { ToolSettingsPropertySyncItem, ToolSettingsPropertyItem, ToolSettingsValue } from "../properties/ToolSettingsValue";
import { CanvasDecoration } from "../render/System";
import { IconSprites } from "../Sprites";
import { DecorateContext, DynamicsContext } from "../ViewContext";
import { linePlaneIntersect, ScreenViewport, Viewport } from "../Viewport";
import { ViewState3d, ViewStatus } from "../ViewState";
import { IdleTool } from "./IdleTool";
import { PrimitiveTool } from "./PrimitiveTool";
import {
  BeButton, BeButtonEvent, BeButtonState, BeModifierKeys, BeTouchEvent, BeWheelEvent, CoordSource, EventHandled,
  InputCollector, InputSource, InteractiveTool, Tool, CoordinateLockOverrides, ToolSettings,
} from "./Tool";
import { ViewTool } from "./ViewTool";
import { MessageBoxType, MessageBoxIconType } from "../NotificationManager";
import { FrontendLoggerCategory } from "../FrontendLoggerCategory";

/** @public */
export enum StartOrResume { Start = 1, Resume = 2 }

/** @alpha */
export enum ManipulatorToolEvent { Start = 1, Stop = 2, Suspend = 3, Unsuspend = 4 }

const enum MouseButton { Left = 0, Middle = 1, Right = 2 }

/** Class that maintains the state of tool settings properties for the current session
 * @internal
 */
export class ToolSettingsState {
  /** Initialize single tool settings value */
  public initializeToolSettingProperty(toolId: string, item: ToolSettingsPropertyItem): void {
    const key = `${toolId}:${item.propertyName}`;
    const savedValue = window.sessionStorage.getItem(key);
    if (null !== savedValue) {
      const readValue = JSON.parse(savedValue) as ToolSettingsValue;
      // set the primitive value to the saved value - note: tool settings only support primitive values.
      item.value.value = readValue.value;
      if (readValue.hasDisplayValue)
        item.value.displayValue = readValue.displayValue;
    }
  }

  /** Initialize an array of tool settings values */
  public initializeToolSettingProperties(toolId: string, tsProps: ToolSettingsPropertyItem[]): void {
    tsProps.forEach((item: ToolSettingsPropertyItem) => this.initializeToolSettingProperty(toolId, item));
  }

  /** Save single tool settings value */
  public saveToolSettingProperty(toolId: string, item: ToolSettingsPropertyItem): void {
    const key = `${toolId}:${item.propertyName}`;
    const objectAsString = JSON.stringify(item.value);
    window.sessionStorage.setItem(key, objectAsString);
  }

  /** Save an array of tool settings values */
  public saveToolSettingProperties(toolId: string, tsProps: ToolSettingsPropertyItem[]): void {
    tsProps.forEach((item: ToolSettingsPropertyItem) => this.saveToolSettingProperty(toolId, item));
  }
}

/** @internal */
export class ToolState {
  public coordLockOvr = CoordinateLockOverrides.None;
  public locateCircleOn = false;
  public setFrom(other: ToolState) { this.coordLockOvr = other.coordLockOvr; this.locateCircleOn = other.locateCircleOn; }
  public clone(): ToolState { const val = new ToolState(); val.setFrom(this); return val; }
}

/** @internal */
export class SuspendedToolState {
  private readonly _toolState: ToolState;
  private readonly _accuSnapState: AccuSnap.ToolState;
  private readonly _locateOptions: LocateOptions;
  private readonly _viewCursor?: string;
  private _inDynamics: boolean;
  private _shuttingDown = false;

  constructor() {
    const { toolAdmin, viewManager, accuSnap, locateManager } = IModelApp;
    toolAdmin.setIncompatibleViewportCursor(true); // Don't save this
    this._toolState = toolAdmin.toolState.clone();
    this._accuSnapState = accuSnap.toolState.clone();
    this._locateOptions = locateManager.options.clone();
    this._viewCursor = viewManager.cursor;
    this._inDynamics = viewManager.inDynamicsMode;
    if (this._inDynamics)
      viewManager.endDynamicsMode();
  }

  public stop() {
    if (this._shuttingDown)
      return;

    const { toolAdmin, viewManager, accuSnap, locateManager } = IModelApp;
    toolAdmin.setIncompatibleViewportCursor(true); // Don't restore this
    toolAdmin.toolState.setFrom(this._toolState);
    accuSnap.toolState.setFrom(this._accuSnapState);
    locateManager.options.setFrom(this._locateOptions);
    viewManager.setViewCursor(this._viewCursor);
    if (this._inDynamics)
      viewManager.beginDynamicsMode();
    else
      viewManager.endDynamicsMode();
  }
}

/** @internal */
export class CurrentInputState {
  private readonly _rawPoint: Point3d = new Point3d();
  private readonly _point: Point3d = new Point3d();
  private readonly _viewPoint: Point3d = new Point3d();
  public qualifiers = BeModifierKeys.None;
  public motionTime = 0;
  public viewport?: ScreenViewport;
  public button: BeButtonState[] = [new BeButtonState(), new BeButtonState(), new BeButtonState()];
  public lastButton: BeButton = BeButton.Data;
  public inputSource: InputSource = InputSource.Unknown;
  public lastMotion = new Point2d();
  public lastWheelEvent?: BeWheelEvent;
  public lastTouchStart?: BeTouchEvent;
  public touchTapTimer?: number;
  public touchTapCount?: number;

  public get rawPoint() { return this._rawPoint; }
  public set rawPoint(pt: Point3d) { this._rawPoint.setFrom(pt); }
  public get point() { return this._point; }
  public set point(pt: Point3d) { this._point.setFrom(pt); }
  public get viewPoint() { return this._viewPoint; }
  public set viewPoint(pt: Point3d) { this._viewPoint.setFrom(pt); }
  public get wasMotion() { return 0 !== this.motionTime; }
  public get isShiftDown() { return 0 !== (this.qualifiers & BeModifierKeys.Shift); }
  public get isControlDown() { return 0 !== (this.qualifiers & BeModifierKeys.Control); }
  public get isAltDown() { return 0 !== (this.qualifiers & BeModifierKeys.Alt); }

  public isDragging(button: BeButton) { return this.button[button].isDragging; }
  public onStartDrag(button: BeButton) { this.button[button].isDragging = true; }
  public onInstallTool() { this.clearKeyQualifiers(); if (undefined !== this.lastWheelEvent) this.lastWheelEvent.invalidate(); this.lastTouchStart = this.touchTapTimer = this.touchTapCount = undefined; }
  public clearKeyQualifiers() { this.qualifiers = BeModifierKeys.None; }
  public clearViewport(vp: Viewport) { if (vp === this.viewport) this.viewport = undefined; }
  private isAnyDragging() { return this.button.some((button) => button.isDragging); }
  private setKeyQualifier(qual: BeModifierKeys, down: boolean) { this.qualifiers = down ? (this.qualifiers | qual) : (this.qualifiers & (~qual)); }

  public setKeyQualifiers(ev: MouseEvent | KeyboardEvent | TouchEvent): void {
    this.setKeyQualifier(BeModifierKeys.Shift, ev.shiftKey);
    this.setKeyQualifier(BeModifierKeys.Control, ev.ctrlKey);
    this.setKeyQualifier(BeModifierKeys.Alt, ev.altKey);
  }

  public onMotion(pt2d: XAndY) {
    this.motionTime = Date.now();
    this.lastMotion.x = pt2d.x;
    this.lastMotion.y = pt2d.y;
  }

  public get hasMotionStopped(): boolean {
    const result = this.hasEventInputStopped(this.motionTime, ToolSettings.noMotionTimeout);
    if (result.stopped)
      this.motionTime = result.eventTimer;
    return result.stopped;
  }

  private hasEventInputStopped(timer: number, eventTimeout: BeDuration) {
    let isStopped = false;
    if (0 !== timer && ((Date.now() - timer) >= eventTimeout.milliseconds)) {
      isStopped = true;
      timer = 0;
    }
    return { eventTimer: timer, stopped: isStopped };
  }

  public changeButtonToDownPoint(ev: BeButtonEvent) {
    ev.point = this.button[ev.button].downUorPt;
    ev.rawPoint = this.button[ev.button].downRawPt;

    if (ev.viewport)
      ev.viewPoint = ev.viewport.worldToView(ev.rawPoint);
  }

  public updateDownPoint(ev: BeButtonEvent) { this.button[ev.button].downUorPt = ev.point; }

  public onButtonDown(button: BeButton) {
    const viewPt = this.viewport!.worldToView(this.button[button].downRawPt);
    const center = this.viewport!.npcToView(NpcCenter);
    viewPt.z = center.z;

    const now = Date.now();
    const isDoubleClick = ((now - this.button[button].downTime) < ToolSettings.doubleClickTimeout.milliseconds) && (viewPt.distance(this.viewPoint) < this.viewport!.pixelsFromInches(ToolSettings.doubleClickToleranceInches));

    this.button[button].init(this.point, this.rawPoint, now, true, isDoubleClick, false, this.inputSource);
    this.lastButton = button;
  }

  public onButtonUp(button: BeButton) {
    this.button[button].isDown = false;
    this.button[button].isDragging = false;
    this.lastButton = button;
  }

  public toEvent(ev: BeButtonEvent, useSnap: boolean) {
    let coordsFrom = CoordSource.User;
    const point = this.point.clone();
    let viewport = this.viewport;

    if (useSnap) {
      const snap = TentativeOrAccuSnap.getCurrentSnap(false);
      if (snap) {
        coordsFrom = snap.isHot ? CoordSource.ElemSnap : CoordSource.User;
        point.setFrom(snap.isPointAdjusted ? snap.adjustedPoint : snap.getPoint()); // NOTE: adjustedPoint can be set by adjustSnapPoint even when not hot...
        viewport = snap.viewport;
      } else if (IModelApp.tentativePoint.isActive) {
        coordsFrom = CoordSource.TentativePoint;
        point.setFrom(IModelApp.tentativePoint.getPoint());
        viewport = IModelApp.tentativePoint.viewport;
      }
    }

    const buttonState = this.button[this.lastButton];
    ev.init({
      point, rawPoint: this.rawPoint, viewPoint: this.viewPoint, viewport, coordsFrom,
      keyModifiers: this.qualifiers, button: this.lastButton, isDown: buttonState.isDown,
      isDoubleClick: buttonState.isDoubleClick, isDragging: buttonState.isDragging,
      inputSource: this.inputSource,
    });
  }

  public adjustLastDataPoint(ev: BeButtonEvent) {
    const state = this.button[BeButton.Data];
    state.downUorPt = ev.point;
    state.downRawPt = ev.point;
    this.viewport = ev.viewport;
  }

  public toEventFromLastDataPoint(ev: BeButtonEvent) {
    const state = this.button[BeButton.Data];
    const point = state.downUorPt;
    const rawPoint = state.downRawPt;
    const viewPoint = this.viewport ? this.viewport.worldToView(rawPoint) : Point3d.create(); // BeButtonEvent is invalid when viewport is undefined
    ev.init({
      point, rawPoint, viewPoint, viewport: this.viewport!, coordsFrom: CoordSource.User,
      keyModifiers: this.qualifiers, button: BeButton.Data, isDown: state.isDown,
      isDoubleClick: state.isDoubleClick, isDragging: state.isDragging, inputSource: state.inputSource,
    });
  }

  public fromPoint(vp: ScreenViewport, pt: XAndY, source: InputSource) {
    this.viewport = vp;
    this._viewPoint.x = pt.x;
    this._viewPoint.y = pt.y;
    this._viewPoint.z = vp.npcToView(NpcCenter).z;
    vp.viewToWorld(this._viewPoint, this._rawPoint);
    this.point = this._rawPoint;
    this.inputSource = source;
  }

  public fromButton(vp: ScreenViewport, pt: XAndY, source: InputSource, applyLocks: boolean) {
    this.fromPoint(vp, pt, source);

    // NOTE: Using the hit point on the element is preferable to ignoring a snap that is not "hot" completely
    if (TentativeOrAccuSnap.getCurrentSnap(false)) {
      if (applyLocks)
        IModelApp.toolAdmin.adjustSnapPoint();
      return;
    }
    IModelApp.toolAdmin.adjustPoint(this._point, vp, true, applyLocks);
  }

  public isStartDrag(button: BeButton): boolean {
    // First make sure we aren't already dragging any button
    if (this.isAnyDragging())
      return false;

    const state = this.button[button];
    if (!state.isDown)
      return false;

    if ((Date.now() - state.downTime) <= ToolSettings.startDragDelay.milliseconds)
      return false;

    const viewPt = this.viewport!.worldToView(state.downRawPt);
    const deltaX = Math.abs(this._viewPoint.x - viewPt.x);
    const deltaY = Math.abs(this._viewPoint.y - viewPt.y);

    return ((deltaX + deltaY) > this.viewport!.pixelsFromInches(ToolSettings.startDragDistanceInches));
  }
}

/** A ToolEvent combines an HTML Event and a Viewport. It is stored in a queue for processing by the ToolAdmin.eventLoop. */
interface ToolEvent {
  ev: Event;
  vp?: ScreenViewport; // Viewport is optional - keyboard events aren't associated with a Viewport.
}

/** Controls operation of Tools. Administers the current view, primitive, and idle tools. Forwards events to the appropriate tool.
 * @public
 */
export class ToolAdmin {
  public markupView?: ScreenViewport;
  /** @internal */
  public readonly currentInputState = new CurrentInputState();
  /** @internal */
  public readonly toolState = new ToolState();
  /** @internal */
  public readonly toolSettingsState = new ToolSettingsState();
  private _canvasDecoration?: CanvasDecoration;
  private _suspendedByViewTool?: SuspendedToolState;
  private _suspendedByInputCollector?: SuspendedToolState;
  private _viewTool?: ViewTool;
  private _primitiveTool?: PrimitiveTool;
  private _idleTool?: IdleTool;
  private _inputCollector?: InputCollector;
  private _saveCursor?: string;
  private _saveLocateCircle = false;
  private _modifierKeyWentDown = false;
  private _defaultToolId = "Select";
  private _defaultToolArgs?: any[];
  private _modifierKey = BeModifierKeys.None;
  private static _tileTreePurgeTime?: BeTimePoint;
  private static _tileTreePurgeInterval?: BeDuration;
  /** Return the name of the [[PrimitiveTool]] to use as the default tool, if any.
   * @see [[startDefaultTool]]
   * @internal
   */
  public get defaultToolId(): string { return this._defaultToolId; }
  /** Set the name of the [[PrimitiveTool]] to use as the default tool, if any.
   * @see [[startDefaultTool]]
   * @internal
   */
  public set defaultToolId(toolId: string) { this._defaultToolId = toolId; }
  /** Return the default arguments to pass in when starting the default tool, if any.
   * @see [[startDefaultTool]]
   * @internal
   */
  public get defaultToolArgs(): any[] | undefined { return this._defaultToolArgs; }

  /** Set the default arguments to pass in when starting the default tool, if any.
   * @see [[startDefaultTool]]
   * @internal
   */
  public set defaultToolArgs(args: any[] | undefined) { this._defaultToolArgs = args; }
  /** Apply operations such as transform, copy or delete to all members of an assembly. */
  public assemblyLock = false;
  /** If Grid Lock is on, project data points to grid. */
  public gridLock = false;
  /** If ACS Snap Lock is on, project snap points to the ACS plane. */
  public acsPlaneSnapLock = false;
  /** If ACS Plane Lock is on, standard view rotations are relative to the ACS instead of global. */
  public acsContextLock = false;

  /** Options for how uncaught exceptions should be handled.
   * @beta
   */
  public static exceptionOptions = {
    /** log exception to Logger */
    log: true,
    /** Show an alert box explaining that a problem happened */
    alertBox: true,
    /** include the "gory details" (e.g. stack trace) */
    details: true,
    /** break into debugger (only works if debugger is already opened) */
    launchDebugger: true,
  };

  /** A function that catches exceptions occurring inside ToolAdmin.eventLoop.
   * @note If you wish to entirely replace this method, you can just assign to your own function, e.g.:
   * ```ts
   * ToolAdmin.exceptionHandler = (exception: any): Promise<any> => {
   *  ... your implementation here
   * }
   * ```
   * @beta
   */
  public static async exceptionHandler(exception: any): Promise<any> {
    const opts = ToolAdmin.exceptionOptions;
    const msg: string = undefined !== exception.stack ? exception.stack : exception.toString();
    if (opts.log)
      Logger.logError(FrontendLoggerCategory.Package + ".unhandledException", msg);

    if (opts.launchDebugger) // this does nothing if the debugger window is not already opened
      debugger; // tslint:disable-line:no-debugger

    if (!opts.alertBox)
      return;

    let out = "<h2>" + IModelApp.i18n.translate("iModelJs:Errors.ReloadPage") + "</h2>";
    if (opts.details) {
      out += "<h3>" + IModelApp.i18n.translate("iModelJs:Errors.Details") + "</h3><h4>";
      msg.split("\n").forEach((line) => out += line + "<br>");
      out += "</h4>";
    }

    const div = document.createElement("div");
    div.innerHTML = out;
    return IModelApp.notifications.openMessageBox(MessageBoxType.MediumAlert, div, MessageBoxIconType.Critical);
  }

  private static _wantEventLoop = false;
  private static readonly _removals: VoidFunction[] = [];

  /** Handler that wants to process synching latest tool setting properties with UI.
   *  @internal
   */
  private _toolSettingsChangeHandler: ((toolId: string, syncProperties: ToolSettingsPropertySyncItem[]) => void) | undefined = undefined;

  /** @internal */
  /** Set by object that will be provide UI for tool settings properties. */
  public set toolSettingsChangeHandler(handler: ((toolId: string, syncProperties: ToolSettingsPropertySyncItem[]) => void) | undefined) {
    this._toolSettingsChangeHandler = handler;
  }

  /** @internal */
  public get toolSettingsChangeHandler() { return this._toolSettingsChangeHandler; }

  /** Handler for keyboard events. */
  private static _keyEventHandler = (ev: KeyboardEvent) => {
    if (!ev.repeat) // we don't want repeated keyboard events. If we keep them they interfere with replacing mouse motion events, since they come as a stream.
      IModelApp.toolAdmin.addEvent(ev);
  }

  /** @internal */
  public onInitialized() {
    if (typeof document === "undefined")
      return;    // if document isn't defined, we're probably running in a test environment. At any rate, we can't have interactive tools.

    this._idleTool = IModelApp.tools.create("Idle") as IdleTool;

    ["keydown", "keyup"].forEach((type) => {
      document.addEventListener(type, ToolAdmin._keyEventHandler as EventListener, false);
      ToolAdmin._removals.push(() => { document.removeEventListener(type, ToolAdmin._keyEventHandler as EventListener, false); });
    });

    ToolAdmin._removals.push(() => { window.onfocus = null; });
  }

  /** @internal */
  public startEventLoop() {
    if (!ToolAdmin._wantEventLoop) {
      ToolAdmin._wantEventLoop = true;
      const treeExpirationTime = IModelApp.tileAdmin.tileTreeExpirationTime;
      if (undefined !== treeExpirationTime) {
        ToolAdmin._tileTreePurgeInterval = treeExpirationTime;
        ToolAdmin._tileTreePurgeTime = BeTimePoint.now().plus(treeExpirationTime);
      }

      requestAnimationFrame(ToolAdmin.eventLoop);
    }
  }

  /** @internal */
  public onShutDown() {
    this._idleTool = undefined;
    IconSprites.emptyAll(); // clear cache of icon sprites
    ToolAdmin._wantEventLoop = false;
    ToolAdmin._removals.forEach((remove) => remove());
    ToolAdmin._removals.length = 0;
  }

  /** Get the ScreenViewport where the cursor is currently, if any. */
  public get cursorView(): ScreenViewport | undefined { return this.currentInputState.viewport; }

  /** A first-in-first-out queue of ToolEvents. */
  private _toolEvents: ToolEvent[] = [];
  private tryReplace(event: ToolEvent): boolean {
    if (this._toolEvents.length < 1)
      return false;
    const last = this._toolEvents[this._toolEvents.length - 1];
    if ((last.ev.type !== "mousemove" && last.ev.type !== "touchmove") || last.ev.type !== event.ev.type)
      return false; // only mousemove and touchmove can replace previous
    last.ev = event.ev; // sequential moves are not important. Replace the previous one with this one.
    last.vp = event.vp;
    return true;
  }

  /** Called from HTML event listeners. Events are processed in the order they're received in ToolAdmin.eventLoop
   * @internal
   */
  public addEvent(ev: Event, vp?: ScreenViewport): void {
    const event = { ev, vp };
    if (!this.tryReplace(event)) // see if this event replaces the last event in the queue
      this._toolEvents.push(event); // otherwise put it at the end of the queue.
  }

  /** Called from ViewManager.dropViewport to prevent tools from continuing to operate on the dropped viewport.
   * @internal
   */
  public forgetViewport(vp: ScreenViewport): void {
    // make sure tools don't think the cursor is still in this viewport.
    this.onMouseLeave(vp);

    // Remove any events associated with this viewport.
    this._toolEvents = this._toolEvents.filter((ev) => ev.vp !== vp);
  }

  private getMousePosition(event: ToolEvent): XAndY {
    const ev = event.ev as MouseEvent;
    const rect = event.vp!.getClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  private getMouseButton(button: number) {
    switch (button) {
      case MouseButton.Middle: return BeButton.Middle;
      case MouseButton.Right: return BeButton.Reset;
      default: return BeButton.Data;
    }
  }

  private async onMouseButton(event: ToolEvent, isDown: boolean): Promise<any> {
    const ev = event.ev as MouseEvent;
    const vp = event.vp!;
    const pos = this.getMousePosition(event);
    const button = this.getMouseButton(ev.button);

    this.currentInputState.setKeyQualifiers(ev);
    return isDown ? this.onButtonDown(vp, pos, button, InputSource.Mouse) : this.onButtonUp(vp, pos, button, InputSource.Mouse);
  }

  private async onWheel(event: ToolEvent): Promise<EventHandled> {
    const ev = event.ev as WheelEvent;
    const vp = event.vp!;
    if (this.filterViewport(vp))
      return EventHandled.Yes;
    const current = this.currentInputState;
    current.setKeyQualifiers(ev);

    if (ev.deltaY === 0)
      return EventHandled.No;

    let delta: number;
    switch (ev.deltaMode) {
      case ev.DOM_DELTA_LINE:
        delta = -ev.deltaY * ToolSettings.wheelLineFactor; // 40
        break;
      case ev.DOM_DELTA_PAGE:
        delta = -ev.deltaY * ToolSettings.wheelPageFactor; // 120;
        break;
      default: // DOM_DELTA_PIXEL:
        delta = -ev.deltaY;
        break;
    }

    const pt2d = this.getMousePosition(event);

    vp.setAnimator();
    current.fromButton(vp, pt2d, InputSource.Mouse, true);
    const wheelEvent = new BeWheelEvent();
    wheelEvent.wheelDelta = delta;
    current.toEvent(wheelEvent, true);

    const overlayHit = this.pickCanvasDecoration(wheelEvent);
    if (undefined !== overlayHit && undefined !== overlayHit.onWheel && overlayHit.onWheel(wheelEvent))
      return EventHandled.Yes;

    const tool = this.activeTool;
    if (undefined === tool || EventHandled.Yes !== await tool.onMouseWheel(wheelEvent) && vp !== this.markupView)
      return this.idleTool.onMouseWheel(wheelEvent);
    return EventHandled.Yes;
  }

  private async onTouch(event: ToolEvent): Promise<void> {
    const touchEvent = event.ev as TouchEvent;
    const vp = event.vp!;
    if (this.filterViewport(vp))
      return;

    vp.setAnimator();
    const ev = new BeTouchEvent({ touchEvent });
    const current = this.currentInputState;
    const pos = BeTouchEvent.getTouchListCentroid(0 !== touchEvent.targetTouches.length ? touchEvent.targetTouches : touchEvent.changedTouches, vp);

    switch (touchEvent.type) {
      case "touchstart":
      case "touchend":
        current.setKeyQualifiers(touchEvent);
        break;
    }

    current.fromButton(vp, undefined !== pos ? pos : Point2d.createZero(), InputSource.Touch, true);
    current.toEvent(ev, false);
    const tool = this.activeTool;

    switch (touchEvent.type) {
      case "touchstart": {
        current.lastTouchStart = ev;
        IModelApp.accuSnap.onTouchStart(ev);
        if (undefined !== tool)
          tool.onTouchStart(ev); // tslint:disable-line:no-floating-promises
        return;
      }

      case "touchend": {
        IModelApp.accuSnap.onTouchEnd(ev);
        if (undefined !== tool) {
          await tool.onTouchEnd(ev);
          if (0 === ev.touchCount)
            await tool.onTouchComplete(ev);
        }

        if (undefined === current.lastTouchStart)
          return;

        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < ev.touchEvent.changedTouches.length; i++) {
          const currTouch = ev.touchEvent.changedTouches[i];
          const startTouch = BeTouchEvent.findTouchById(current.lastTouchStart.touchEvent.targetTouches, currTouch.identifier);

          if (undefined !== startTouch) {
            const currPt = BeTouchEvent.getTouchPosition(currTouch, vp);
            const startPt = BeTouchEvent.getTouchPosition(startTouch, vp);

            if (currPt.distance(startPt) < vp.pixelsFromInches(ToolSettings.touchMoveDistanceInches))
              continue; // Hasn't moved appreciably....
          }

          current.lastTouchStart = undefined; // Not a tap...
          return;
        }

        if (0 !== ev.touchCount || undefined === current.lastTouchStart)
          return;

        // All fingers off, defer processing tap until we've waited long enough to detect double tap...
        if (undefined === current.touchTapTimer) {
          current.touchTapTimer = Date.now();
          current.touchTapCount = 1;
        } else if (undefined !== current.touchTapCount) {
          current.touchTapCount++;
        }
        return;
      }

      case "touchcancel": {
        current.lastTouchStart = undefined;
        IModelApp.accuSnap.onTouchCancel(ev);
        if (undefined !== tool)
          tool.onTouchCancel(ev); // tslint:disable-line:no-floating-promises
        return;
      }

      case "touchmove": {
        if (!IModelApp.accuSnap.onTouchMove(ev) && undefined !== tool)
          tool.onTouchMove(ev); // tslint:disable-line:no-floating-promises

        if (undefined === current.lastTouchStart)
          return;

        if (ev.touchEvent.timeStamp - current.lastTouchStart.touchEvent.timeStamp < ToolSettings.touchMoveDelay.milliseconds)
          return;

        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < ev.touchEvent.changedTouches.length; i++) {
          const currTouch = ev.touchEvent.changedTouches[i];
          const startTouch = BeTouchEvent.findTouchById(current.lastTouchStart.touchEvent.targetTouches, currTouch.identifier);

          if (undefined === startTouch)
            continue;

          const currPt = BeTouchEvent.getTouchPosition(currTouch, vp);
          const startPt = BeTouchEvent.getTouchPosition(startTouch, vp);

          if (currPt.distance(startPt) < vp.pixelsFromInches(ToolSettings.touchMoveDistanceInches))
            continue; // Hasn't moved appreciably....

          const touchStart = current.lastTouchStart;
          current.lastTouchStart = undefined;

          if (IModelApp.accuSnap.onTouchMoveStart(ev, touchStart))
            return;

          if (undefined === tool || EventHandled.Yes !== await tool.onTouchMoveStart(ev, touchStart))
            this.idleTool.onTouchMoveStart(ev, touchStart); // tslint:disable-line:no-floating-promises
          return;
        }
        return;
      }
    }
  }

  /** Process the next event in the event queue, if any. */
  private async processNextEvent(): Promise<any> {
    const event = this._toolEvents.shift(); // pull first event from the queue
    if (undefined === event)
      return; // nothing in queue

    switch (event.ev.type) {
      case "mousedown": return this.onMouseButton(event, true);
      case "mouseup": return this.onMouseButton(event, false);
      case "mousemove": return this.onMouseMove(event);
      case "mouseover": {
        // handle the mouseover (which is similar to mouseenter) only if the target is our canvas.
        if (event.ev.target === event.vp!.canvas) {
          return this.onMouseEnter(event.vp!);
        }
        return;
      }
      case "mouseout": {
        // handle the mouseout (which is similar to mouseleave) only if the target is our canvas.
        if (event.ev.target === event.vp!.canvas) {
          return this.onMouseLeave(event.vp!);
        }
        return;
      }
      case "wheel": return this.onWheel(event);
      case "keydown": return this.onKeyTransition(event, true);
      case "keyup": return this.onKeyTransition(event, false);
      case "touchstart": return this.onTouch(event);
      case "touchend": return this.onTouch(event);
      case "touchcancel": return this.onTouch(event);
      case "touchmove": return this.onTouch(event);
    }
  }

  private _processingEvent = false;
  /**
   * Process a single event, plus timer events. Don't start work on new events if the previous one has not finished.
   */
  private async processEvent(): Promise<void> {
    if (this._processingEvent)
      return; // we're still working on the previous event.

    try {
      this._processingEvent = true;  // we can't allow any further event processing until the current event completes.
      await this.onTimerEvent();     // timer events are also suspended by asynchronous tool events. That's necessary since they can be asynchronous too.
      await this.processNextEvent();
    } catch (exception) {
      await ToolAdmin.exceptionHandler(exception); // we don't attempt to exit here
    } finally {
      this._processingEvent = false; // this event is now finished. Allow processing next time through.
    }
  }

  /** The main event processing loop for Tools (and rendering). */
  private static eventLoop() {
    if (!ToolAdmin._wantEventLoop) // flag turned on at startup
      return;

    try {
      IModelApp.toolAdmin.processEvent(); // tslint:disable-line:no-floating-promises
      IModelApp.viewManager.renderLoop();
      IModelApp.tileAdmin.process();

      if (undefined !== ToolAdmin._tileTreePurgeTime && ToolAdmin._tileTreePurgeTime.milliseconds < Date.now()) {
        const now = BeTimePoint.now();
        ToolAdmin._tileTreePurgeTime = now.plus(ToolAdmin._tileTreePurgeInterval!);
        IModelApp.viewManager.purgeTileTrees(now.minus(ToolAdmin._tileTreePurgeInterval!));
      }
    } catch (exception) {
      ToolAdmin.exceptionHandler(exception).then(() => { // tslint:disable-line:no-floating-promises
        close(); // this does nothing in a web browser, closes electron.
      });
      return; // unrecoverable after exception, don't request any further frames.
    }

    requestAnimationFrame(ToolAdmin.eventLoop);
  }

  /** The idleTool handles events that are not otherwise processed. */
  public get idleTool(): IdleTool { return this._idleTool!; }

  /** Return true to filter (ignore) events to the given viewport */
  protected filterViewport(vp: Viewport) {
    if (undefined === vp || vp.isDisposed)
      return true;

    const tool = this.activeTool;
    return (undefined !== tool ? !tool.isCompatibleViewport(vp, false) : false);
  }

  /** @internal */
  public onInstallTool(tool: InteractiveTool) { this.currentInputState.onInstallTool(); return tool.onInstall(); }
  /** @internal */
  public onPostInstallTool(tool: InteractiveTool) { tool.onPostInstall(); }

  public get viewTool(): ViewTool | undefined { return this._viewTool; }
  public get primitiveTool(): PrimitiveTool | undefined { return this._primitiveTool; }

  /** The currently active InteractiveTool. May be ViewTool, InputCollector, PrimitiveTool, undefined - in that priority order. */
  public get activeTool(): InteractiveTool | undefined {
    return this._viewTool ? this._viewTool : (this._inputCollector ? this._inputCollector : this._primitiveTool); // NOTE: Viewing tools suspend input collectors as well as primitives
  }

  /** The current tool. May be ViewTool, InputCollector, PrimitiveTool, or IdleTool - in that priority order. */
  public get currentTool(): InteractiveTool { return this.activeTool ? this.activeTool : this.idleTool; }

  /** Ask the current tool to provide tooltip contents for the supplied HitDetail. */
  public async getToolTip(hit: HitDetail): Promise<HTMLElement | string> { return this.currentTool.getToolTip(hit); }

  /**
   * Event raised whenever the active tool changes. This includes PrimitiveTool, ViewTool, and InputCollector.
   * @param newTool The newly activated tool
   */
  public readonly activeToolChanged = new BeEvent<(tool: Tool, start: StartOrResume) => void>();

  /**
   * Event raised by tools that support edit manipulators like the SelectTool.
   * @param tool The current tool
   * @alpha
   */
  public readonly manipulatorToolEvent = new BeEvent<(tool: Tool, event: ManipulatorToolEvent) => void>();

  private async onMouseEnter(vp: ScreenViewport): Promise<void> { this.currentInputState.viewport = vp; }

  /** @internal */
  public onMouseLeave(vp: ScreenViewport): void {
    IModelApp.accuSnap.clear();
    this.currentInputState.clearViewport(vp);
    this.setCanvasDecoration(vp);
    vp.invalidateDecorations(); // stop drawing locate circle...
  }

  /** @internal */
  public updateDynamics(ev?: BeButtonEvent, useLastData?: boolean, adjustPoint?: boolean): void {
    if (!IModelApp.viewManager.inDynamicsMode || undefined === this.activeTool)
      return;

    if (undefined === ev) {
      ev = new BeButtonEvent();

      if (useLastData)
        this.fillEventFromLastDataButton(ev);
      else
        this.fillEventFromCursorLocation(ev);

      if (adjustPoint && undefined !== ev.viewport)
        this.adjustPoint(ev.point, ev.viewport);
    }

    if (undefined === ev.viewport)
      return;

    const context = new DynamicsContext(ev.viewport);
    this.activeTool.onDynamicFrame(ev, context);
    context.changeDynamics();
  }

  /** This is invoked on a timer to update  input state and forward events to tools.
   * @internal
   */
  private async onTimerEvent(): Promise<void> {
    const tool = this.activeTool;
    const current = this.currentInputState;

    if (undefined !== current.touchTapTimer) {
      const now = Date.now();
      if ((now - current.touchTapTimer) >= ToolSettings.doubleTapTimeout.milliseconds) {
        const touchEv = current.lastTouchStart;
        const numTouches = (undefined !== current.lastTouchStart ? current.lastTouchStart.touchCount : 0);
        const numTaps = (undefined !== current.touchTapCount ? current.touchTapCount : 0);

        current.touchTapTimer = current.touchTapCount = current.lastTouchStart = undefined;

        if (undefined !== touchEv && numTouches > 0 && numTaps > 0) {
          touchEv.tapCount = numTaps;
          const overlayHit = this.pickCanvasDecoration(touchEv);
          if (undefined !== overlayHit && undefined !== overlayHit.onMouseButton && overlayHit.onMouseButton(touchEv))
            return;
          if (await IModelApp.accuSnap.onTouchTap(touchEv))
            return;
          if ((undefined !== tool && EventHandled.Yes === await tool.onTouchTap(touchEv)) || EventHandled.Yes === await this.idleTool.onTouchTap(touchEv))
            return;
        }
      }
    }

    const ev = new BeButtonEvent();
    current.toEvent(ev, true);

    const wasMotion = current.wasMotion;
    if (!wasMotion) {
      if (tool)
        await tool.onMouseNoMotion(ev);

      if (InputSource.Mouse === current.inputSource && this.currentInputState.viewport) {
        await IModelApp.accuSnap.onNoMotion(ev);
      }
    }

    if (current.hasMotionStopped) {
      if (tool)
        await tool.onMouseMotionStopped(ev);
      if (InputSource.Mouse === current.inputSource) {
        IModelApp.accuSnap.onMotionStopped(ev);
      }
    }
  }

  public async sendEndDragEvent(ev: BeButtonEvent): Promise<any> {
    let tool = this.activeTool;

    if (undefined !== tool) {
      if (!tool.isValidLocation(ev, true))
        tool = undefined;
      else if (tool.receivedDownEvent)
        tool.receivedDownEvent = false;
      else
        tool = undefined;
    }

    // Don't send tool end drag event if it didn't get the start drag event
    if (undefined === tool || EventHandled.Yes !== await tool.onMouseEndDrag(ev))
      return this.idleTool.onMouseEndDrag(ev);
  }

  private setCanvasDecoration(vp: ScreenViewport, dec?: CanvasDecoration, ev?: BeButtonEvent) {
    if (dec === this._canvasDecoration)
      return;

    if (this._canvasDecoration && this._canvasDecoration.onMouseLeave)
      this._canvasDecoration.onMouseLeave();
    this._canvasDecoration = dec;
    if (ev && dec && dec.onMouseEnter) dec.onMouseEnter(ev);

    vp.canvas.style.cursor = dec ? (dec.decorationCursor ? dec.decorationCursor : "pointer") : IModelApp.viewManager.cursor;
    vp.invalidateDecorations();
  }

  private pickCanvasDecoration(ev: BeButtonEvent) {
    const vp = ev.viewport!;
    const decoration = (undefined === this.viewTool) ? vp.pickCanvasDecoration(ev.viewPoint) : undefined;
    this.setCanvasDecoration(vp, decoration, ev);
    return decoration;
  }

  private async onMotion(vp: ScreenViewport, pt2d: XAndY, inputSource: InputSource, forceStartDrag: boolean = false): Promise<any> {
    const current = this.currentInputState;
    current.onMotion(pt2d);

    if (this.filterViewport(vp)) {
      this.setIncompatibleViewportCursor(false);
      return;
    }

    const ev = new BeButtonEvent();
    current.fromPoint(vp, pt2d, inputSource);
    current.toEvent(ev, false);

    const overlayHit = this.pickCanvasDecoration(ev);
    if (undefined !== overlayHit) {
      if (overlayHit.onMouseMove)
        overlayHit.onMouseMove(ev);
      return;   // we're inside a pickable decoration, don't send event to tool
    }

    try {
      await IModelApp.accuSnap.onMotion(ev); // wait for AccuSnap before calling fromButton
    } catch (error) {
      if (error instanceof AbandonedError) return; // expected, not a problem. Just ignore this motion and return.
      throw error; // unknown error
    }

    current.fromButton(vp, pt2d, inputSource, true);
    current.toEvent(ev, true);

    IModelApp.accuDraw.onMotion(ev);

    const tool = this.activeTool;
    const isValidLocation = (undefined !== tool ? tool.isValidLocation(ev, false) : true);
    this.setIncompatibleViewportCursor(isValidLocation);

    if (forceStartDrag || current.isStartDrag(ev.button)) {
      current.onStartDrag(ev.button);
      current.changeButtonToDownPoint(ev);
      ev.isDragging = true;

      if (undefined !== tool && isValidLocation)
        tool.receivedDownEvent = true;

      // Pass start drag event to idle tool if active tool doesn't explicitly handle it
      if (undefined === tool || !isValidLocation || EventHandled.Yes !== await tool.onMouseStartDrag(ev))
        return this.idleTool.onMouseStartDrag(ev);
      return;
    }

    if (tool) {
      tool.onMouseMotion(ev); // tslint:disable-line:no-floating-promises
      this.updateDynamics(ev);
    }

    if (this.isLocateCircleOn)
      vp.invalidateDecorations();
  }

  private async onMouseMove(event: ToolEvent): Promise<any> {
    const vp = event.vp!;
    const pos = this.getMousePosition(event);

    // Sometimes the mouse goes down in a view, but we lose focus while its down so we never receive the up event.
    // That makes it look like the motion is a drag. Fix that by clearing the "isDown" based on the buttons member of the MouseEvent.
    const buttonMask = (event.ev as MouseEvent).buttons;
    if (!(buttonMask & 1))
      this.currentInputState.button[BeButton.Data].isDown = false;

    return this.onMotion(vp, pos, InputSource.Mouse);
  }

  public adjustPointToACS(pointActive: Point3d, vp: Viewport, perpendicular: boolean): void {
    // The "I don't want ACS lock" flag can be set by tools to override the default behavior
    if (0 !== (this.toolState.coordLockOvr & CoordinateLockOverrides.ACS))
      return;

    let viewZRoot: Vector3d;

    // Lock to the construction plane
    if (vp.view.is3d() && vp.view.isCameraOn)
      viewZRoot = vp.view.camera.eye.vectorTo(pointActive);
    else
      viewZRoot = vp.rotation.getRow(2);

    const auxOriginRoot = vp.getAuxCoordOrigin();
    const auxRMatrixRoot = vp.getAuxCoordRotation();
    let auxNormalRoot = auxRMatrixRoot.getRow(2);

    // If ACS xy plane is perpendicular to view and not snapping, project to closest xz or yz plane instead
    if (auxNormalRoot.isPerpendicularTo(viewZRoot) && !TentativeOrAccuSnap.isHot) {
      const auxXRoot = auxRMatrixRoot.getRow(0);
      const auxYRoot = auxRMatrixRoot.getRow(1);
      auxNormalRoot = (Math.abs(auxXRoot.dotProduct(viewZRoot)) > Math.abs(auxYRoot.dotProduct(viewZRoot))) ? auxXRoot : auxYRoot;
    }
    linePlaneIntersect(pointActive, pointActive, viewZRoot, auxOriginRoot, auxNormalRoot, perpendicular);
  }

  public adjustPointToGrid(pointActive: Point3d, vp: Viewport) {
    // The "I don't want grid lock" flag can be set by tools to override the default behavior
    if (!this.gridLock || 0 !== (this.toolState.coordLockOvr & CoordinateLockOverrides.Grid))
      return;
    vp.pointToGrid(pointActive);
  }

  public adjustPoint(pointActive: Point3d, vp: ScreenViewport, projectToACS: boolean = true, applyLocks: boolean = true): void {
    if (Math.abs(pointActive.z) < 1.0e-7)
      pointActive.z = 0.0; // remove Z fuzz introduced by active depth when near 0

    let handled = false;

    if (applyLocks && !(IModelApp.tentativePoint.isActive || IModelApp.accuSnap.isHot))
      handled = IModelApp.accuDraw.adjustPoint(pointActive, vp, false);

    // NOTE: We don't need to support axis lock, it is worthless if you have AccuDraw
    if (!handled && vp.isPointAdjustmentRequired) {
      if (applyLocks)
        this.adjustPointToGrid(pointActive, vp);

      if (projectToACS)
        this.adjustPointToACS(pointActive, vp, false);
    } else if (applyLocks) {
      const savePoint = pointActive.clone();

      this.adjustPointToGrid(pointActive, vp);

      // if grid lock changes point, resend point to accudraw
      if (handled && !pointActive.isExactEqual(savePoint))
        IModelApp.accuDraw.adjustPoint(pointActive, vp, false);
    }

    if (Math.abs(pointActive.z) < 1.0e-7)
      pointActive.z = 0.0;
  }

  public adjustSnapPoint(perpendicular: boolean = true): void {
    const snap = TentativeOrAccuSnap.getCurrentSnap(false);
    if (!snap)
      return;

    const vp = snap.viewport;
    const isHot = snap.isHot;
    const point = snap.getPoint().clone();
    const savePt = point.clone();

    if (!isHot) // Want point adjusted to grid for a hit that isn't hot
      this.adjustPointToGrid(point, vp);

    if (!IModelApp.accuDraw.adjustPoint(point, vp, isHot)) {
      if (vp.isSnapAdjustmentRequired)
        this.adjustPointToACS(point, vp, perpendicular || IModelApp.accuDraw.isActive);
    }

    if (!point.isExactEqual(savePt))
      snap.adjustedPoint.setFrom(point);
  }

  /** @internal */
  public async sendButtonEvent(ev: BeButtonEvent): Promise<any> {
    const overlayHit = this.pickCanvasDecoration(ev);
    if (undefined !== overlayHit && undefined !== overlayHit.onMouseButton && overlayHit.onMouseButton(ev))
      return;
    if (IModelApp.accuSnap.onPreButtonEvent(ev))
      return;

    const activeTool = this.activeTool;
    let tool = activeTool;

    if (undefined !== tool) {
      if (!tool.isValidLocation(ev, true))
        tool = undefined;
      else if (ev.isDown)
        tool.receivedDownEvent = true;
      else if (tool.receivedDownEvent)
        tool.receivedDownEvent = false;
      else
        tool = undefined;
    }

    if (IModelApp.accuDraw.onPreButtonEvent(ev))
      return;

    switch (ev.button) {
      case BeButton.Data: {
        if (undefined === tool) {
          if (undefined !== activeTool)
            break;
          tool = this.idleTool; // Pass data button event to idle tool when no active tool present
        }

        if (ev.isDown) {
          await tool.onDataButtonDown(ev);
        } else {
          await tool.onDataButtonUp(ev);
          break;
        }

        // Lock tool to target model of this view on first data button
        if (tool instanceof PrimitiveTool)
          tool.autoLockTarget();

        // Update tool dynamics. Use last data button location which was potentially adjusted by onDataButtonDown and not current event
        this.updateDynamics(undefined, true);
        break;
      }

      case BeButton.Reset: {
        if (undefined === tool) {
          if (undefined !== activeTool)
            break;
          tool = this.idleTool; // Pass reset button event to idle tool when no active tool present
        }

        if (ev.isDown)
          await tool.onResetButtonDown(ev);
        else
          await tool.onResetButtonUp(ev);
        break;
      }

      case BeButton.Middle: {
        // Pass middle button event to idle tool when active tool doesn't explicitly handle it
        if (ev.isDown) {
          if (undefined === tool || EventHandled.Yes !== await tool.onMiddleButtonDown(ev))
            await this.idleTool.onMiddleButtonDown(ev);
        } else {
          if (undefined === tool || EventHandled.Yes !== await tool.onMiddleButtonUp(ev))
            await this.idleTool.onMiddleButtonUp(ev);
        }
        break;
      }
    }

    IModelApp.tentativePoint.onButtonEvent(ev);
    IModelApp.accuDraw.onPostButtonEvent(ev);
  }

  private async onButtonDown(vp: ScreenViewport, pt2d: XAndY, button: BeButton, inputSource: InputSource): Promise<any> {
    const filtered = this.filterViewport(vp);
    if (undefined === this._viewTool && button === BeButton.Data)
      IModelApp.viewManager.setSelectedView(vp);
    if (filtered)
      return;

    vp.setAnimator();
    const ev = new BeButtonEvent();
    const current = this.currentInputState;
    current.fromButton(vp, pt2d, inputSource, true);
    current.onButtonDown(button);
    current.toEvent(ev, true);
    current.updateDownPoint(ev);

    return this.sendButtonEvent(ev);
  }

  private async onButtonUp(vp: ScreenViewport, pt2d: XAndY, button: BeButton, inputSource: InputSource): Promise<any> {
    if (this.filterViewport(vp))
      return;

    const ev = new BeButtonEvent();
    const current = this.currentInputState;
    const wasDragging = current.isDragging(button);
    current.fromButton(vp, pt2d, inputSource, true);
    current.onButtonUp(button);
    current.toEvent(ev, true);

    if (wasDragging)
      return this.sendEndDragEvent(ev);

    current.changeButtonToDownPoint(ev);
    return this.sendButtonEvent(ev);
  }

  /** Called when any *modifier* (Shift, Alt, or Control) key is pressed or released. */
  private async onModifierKeyTransition(wentDown: boolean, modifier: BeModifierKeys, event: KeyboardEvent): Promise<void> {
    if (wentDown === this._modifierKeyWentDown && modifier === this._modifierKey)
      return;

    const activeTool = this.activeTool;
    const changed = activeTool ? await activeTool.onModifierKeyTransition(wentDown, modifier, event) : EventHandled.No;

    this._modifierKey = modifier;
    this._modifierKeyWentDown = wentDown;

    if (changed === EventHandled.Yes) {
      IModelApp.viewManager.invalidateDecorationsAllViews();
      this.updateDynamics();
    }
  }

  private static getModifierKey(event: KeyboardEvent): BeModifierKeys {
    switch (event.key) {
      case "Alt": return BeModifierKeys.Alt;
      case "Shift": return BeModifierKeys.Shift;
      case "Control": return BeModifierKeys.Control;
    }
    return BeModifierKeys.None;
  }

  /** Event for every key down and up transition. */
  private async onKeyTransition(event: ToolEvent, wentDown: boolean): Promise<any> {
    const activeTool = this.activeTool;
    if (!activeTool)
      return;

    const keyEvent = event.ev as KeyboardEvent;
    this.currentInputState.setKeyQualifiers(keyEvent);

    const modifierKey = ToolAdmin.getModifierKey(keyEvent);

    if (BeModifierKeys.None !== modifierKey)
      return this.onModifierKeyTransition(wentDown, modifierKey, keyEvent);

    if (wentDown && keyEvent.ctrlKey) {
      switch (keyEvent.key) {
        case "z":
        case "Z":
          return this.doUndoOperation();
        case "y":
        case "Y":
          return this.doRedoOperation();
      }
    }

    return activeTool.onKeyTransition(wentDown, keyEvent);
  }

  /** Called to undo previous data button for primitive tools or undo last write operation. */
  public async doUndoOperation(): Promise<boolean> {
    const activeTool = this.activeTool;
    if (activeTool instanceof PrimitiveTool) {
      // ### TODO Add method so UI can be showing string to inform user that undo of last data point is available...
      if (await activeTool.undoPreviousStep())
        return true;
    }
    // ### TODO Request TxnManager undo and restart this.primitiveTool...
    return false;
  }

  /** Called to redo previous data button for primitive tools or undo last write operation. */
  public async doRedoOperation(): Promise<boolean> {
    const activeTool = this.activeTool;
    if (activeTool instanceof PrimitiveTool) {
      // ### TODO Add method so UI can be showing string to inform user that undo of last data point is available...
      if (await activeTool.redoPreviousStep())
        return true;
    }
    // ### TODO Request TxnManager undo and restart this.primitiveTool...
    return false;
  }

  private onUnsuspendTool() {
    const tool = this.activeTool;
    if (tool === undefined)
      return;
    tool.onUnsuspend();
    this.activeToolChanged.raiseEvent(tool, StartOrResume.Resume);
  }

  /** @internal */
  public setInputCollector(newTool?: InputCollector) {
    if (undefined !== this._inputCollector) {
      this._inputCollector.onCleanup();
      this._inputCollector = undefined;
    }
    this._inputCollector = newTool;
  }

  /** @internal */
  public exitInputCollector() {
    if (undefined === this._inputCollector)
      return;
    let unsuspend = false;
    if (this._suspendedByInputCollector) {
      this._suspendedByInputCollector.stop();
      this._suspendedByInputCollector = undefined;
      unsuspend = true;
    }

    IModelApp.viewManager.invalidateDecorationsAllViews();
    this.setInputCollector(undefined);
    if (unsuspend)
      this.onUnsuspendTool();

    IModelApp.accuDraw.onInputCollectorExit();
    this.updateDynamics();
  }

  /** @internal */
  public startInputCollector(newTool: InputCollector): void {
    IModelApp.notifications.outputPrompt("");
    IModelApp.accuDraw.onInputCollectorInstall();

    if (undefined !== this._inputCollector) {
      this.setInputCollector(undefined);
    } else {
      const tool = this.activeTool;
      if (tool)
        tool.onSuspend();
      this._suspendedByInputCollector = new SuspendedToolState();
    }

    IModelApp.viewManager.endDynamicsMode();
    IModelApp.viewManager.invalidateDecorationsAllViews();

    this.setInputCollector(newTool);
    // it is important to raise event after setInputCollector is called
    this.activeToolChanged.raiseEvent(newTool, StartOrResume.Start);
  }

  /** @internal */
  public setViewTool(newTool?: ViewTool) {
    if (undefined !== this._viewTool) {
      this._viewTool.onCleanup();
      this._viewTool = undefined;
    }
    this._viewTool = newTool;
  }

  /** @internal */
  public exitViewTool() {
    if (undefined === this._viewTool)
      return;
    let unsuspend = false;
    if (undefined !== this._suspendedByViewTool) {
      this._suspendedByViewTool.stop(); // Restore state of suspended tool
      this._suspendedByViewTool = undefined;
      unsuspend = true;
    }

    IModelApp.viewManager.invalidateDecorationsAllViews();
    this.setViewTool(undefined);
    if (unsuspend)
      this.onUnsuspendTool();

    IModelApp.accuDraw.onViewToolExit();
    this.updateDynamics();
  }

  /** @internal */
  public startViewTool(newTool: ViewTool) {

    IModelApp.notifications.outputPrompt("");
    IModelApp.accuDraw.onViewToolInstall();

    if (undefined !== this._viewTool) {
      this.setViewTool(undefined);
    } else {
      const tool = this.activeTool;
      if (tool)
        tool.onSuspend();
      this._suspendedByViewTool = new SuspendedToolState();
    }

    IModelApp.viewManager.endDynamicsMode();
    IModelApp.viewManager.invalidateDecorationsAllViews();

    this.toolState.coordLockOvr = CoordinateLockOverrides.All;
    this.toolState.locateCircleOn = false;

    IModelApp.accuSnap.onStartTool();

    this.setCursor(IModelApp.viewManager.crossHairCursor);
    this.setViewTool(newTool);
    // it is important to raise event after setViewTool is called
    this.activeToolChanged.raiseEvent(newTool, StartOrResume.Start);
  }

  /** @internal */
  public setPrimitiveTool(newTool?: PrimitiveTool) {
    if (undefined !== this._primitiveTool) {
      this._primitiveTool.onCleanup();
      this._primitiveTool = undefined;
    }
    this._primitiveTool = newTool;
  }

  /** @internal */
  public startPrimitiveTool(newTool?: PrimitiveTool) {
    IModelApp.notifications.outputPrompt("");
    this.exitViewTool();

    if (undefined !== this._primitiveTool)
      this.setPrimitiveTool(undefined);

    // clear the primitive tool first so following call does not trigger the refreshing of the ToolSetting for the previous primitive tool
    this.exitInputCollector();

    IModelApp.viewManager.endDynamicsMode();
    this.setIncompatibleViewportCursor(true); // Don't restore this
    IModelApp.viewManager.invalidateDecorationsAllViews();

    this.toolState.coordLockOvr = CoordinateLockOverrides.None;
    this.toolState.locateCircleOn = false;

    IModelApp.accuDraw.onPrimitiveToolInstall();
    IModelApp.accuSnap.onStartTool();

    if (undefined !== newTool) {
      this.setCursor(IModelApp.viewManager.crossHairCursor);
      this.setPrimitiveTool(newTool);
    }
    // it is important to raise event after setPrimitiveTool is called
    this.activeToolChanged.raiseEvent(undefined !== newTool ? newTool : this.idleTool, StartOrResume.Start);
  }

  /** Method used by interactive tools to send updated values to UI components, typically showing tool settings.
   * @beta
   */
  public syncToolSettingsProperties(toolId: string, syncProperties: ToolSettingsPropertySyncItem[]): void {
    if (this.toolSettingsChangeHandler)
      this.toolSettingsChangeHandler(toolId, syncProperties);
  }

  /**
   * Starts the default tool, if any. Generally invoked automatically when other tools exit, so shouldn't be called directly.
   * @note The default tool is expected to be a subclass of [[PrimitiveTool]]. A call to startDefaultTool is required to terminate
   * an active [[ViewTool]] or [[InputCollector]] and replace or clear the current [[PrimitiveTool]].
   * @internal
   */
  public startDefaultTool() {
    if (!IModelApp.tools.run(this.defaultToolId, this.defaultToolArgs))
      this.startPrimitiveTool(undefined);
  }

  public setCursor(cursor: string | undefined): void {
    if (undefined === this._saveCursor)
      IModelApp.viewManager.setViewCursor(cursor);
    else
      this._saveCursor = cursor;
  }

  /** @internal */
  public testDecorationHit(id: string): boolean { return this.currentTool.testDecorationHit(id); }

  /** @internal */
  public getDecorationGeometry(hit: HitDetail): GeometryStreamProps | undefined { return this.currentTool.getDecorationGeometry(hit); }

  /** @internal */
  public decorate(context: DecorateContext): void {
    const tool = this.activeTool;
    if (undefined !== tool) {
      tool.decorate(context);

      if (undefined !== this._inputCollector && tool !== this._inputCollector)
        this._inputCollector.decorateSuspended(context);

      if (undefined !== this._primitiveTool && tool !== this._primitiveTool)
        this._primitiveTool.decorateSuspended(context);
    }

    const viewport = this.currentInputState.viewport;
    if (viewport !== context.viewport)
      return;

    const ev = new BeButtonEvent();
    this.fillEventFromCursorLocation(ev);

    const hit = IModelApp.accuDraw.isActive ? undefined : IModelApp.accuSnap.currHit; // NOTE: Show surface normal until AccuDraw becomes active
    viewport.drawLocateCursor(context, ev.viewPoint, viewport.pixelsFromInches(IModelApp.locateManager.apertureInches), this.isLocateCircleOn, hit);
  }

  public get isLocateCircleOn(): boolean { return this.toolState.locateCircleOn && this.currentInputState.inputSource === InputSource.Mouse && this._canvasDecoration === undefined; }

  /** @internal */
  public beginDynamics(): void {
    IModelApp.accuDraw.onBeginDynamics();
    IModelApp.viewManager.beginDynamicsMode();
    this.setCursor(IModelApp.viewManager.dynamicsCursor);
  }

  /** @internal */
  public endDynamics(): void {
    IModelApp.accuDraw.onEndDynamics();
    IModelApp.viewManager.endDynamicsMode();
    this.setCursor(IModelApp.viewManager.crossHairCursor);
  }

  /** @internal */
  public fillEventFromCursorLocation(ev: BeButtonEvent) { this.currentInputState.toEvent(ev, true); }
  /** @internal */
  public fillEventFromLastDataButton(ev: BeButtonEvent) { this.currentInputState.toEventFromLastDataPoint(ev); }
  /** @internal */
  public setAdjustedDataPoint(ev: BeButtonEvent) { this.currentInputState.adjustLastDataPoint(ev); }

  /** Can be called by tools that wish to emulate mouse button down/up events for onTouchTap. */
  public async convertTouchTapToButtonDownAndUp(ev: BeTouchEvent, button: BeButton = BeButton.Data): Promise<void> {
    const pt2d = ev.viewPoint;
    await this.onButtonDown(ev.viewport!, pt2d, button, InputSource.Touch);
    return this.onButtonUp(ev.viewport!, pt2d, button, InputSource.Touch);
  }

  /** Can be called by tools that wish to emulate moving the mouse with a button depressed for onTouchMoveStart.
   * @note Calls the tool's onMouseStartDrag method from onMotion.
   */
  public async convertTouchMoveStartToButtonDownAndMotion(startEv: BeTouchEvent, ev: BeTouchEvent, button: BeButton = BeButton.Data): Promise<void> {
    await this.onButtonDown(startEv.viewport!, startEv.viewPoint, button, InputSource.Touch);
    return this.onMotion(ev.viewport!, ev.viewPoint, InputSource.Touch, true);
  }

  /** Can be called by tools that wish to emulate pressing the mouse button for onTouchStart or onTouchMoveStart. */
  public async convertTouchStartToButtonDown(ev: BeTouchEvent, button: BeButton = BeButton.Data): Promise<void> {
    return this.onButtonDown(ev.viewport!, ev.viewPoint, button, InputSource.Touch);
  }

  /** Can be called by tools that wish to emulate releasing the mouse button for onTouchEnd or onTouchComplete.
   * @note Calls the tool's onMouseEndDrag method if convertTouchMoveStartToButtonDownAndMotion was called for onTouchMoveStart.
   */
  public async convertTouchEndToButtonUp(ev: BeTouchEvent, button: BeButton = BeButton.Data): Promise<void> {
    return this.onButtonUp(ev.viewport!, ev.viewPoint, button, InputSource.Touch);
  }

  /** Can be called by tools that wish to emulate a mouse motion event for onTouchMove. */
  public async convertTouchMoveToMotion(ev: BeTouchEvent): Promise<void> {
    return this.onMotion(ev.viewport!, ev.viewPoint, InputSource.Touch);
  }

  /** @internal */
  public setIncompatibleViewportCursor(restore: boolean) {
    if (restore) {
      if (undefined === this._saveCursor)
        return;

      this.toolState.locateCircleOn = this._saveLocateCircle;
      IModelApp.viewManager.setViewCursor(this._saveCursor);
      this._saveCursor = undefined;
      return;
    }

    if (undefined !== this._saveCursor)
      return;

    this._saveLocateCircle = this.toolState.locateCircleOn;
    this._saveCursor = IModelApp.viewManager.cursor;
    this.toolState.locateCircleOn = false;
    IModelApp.viewManager.setViewCursor("not-allowed");
  }

  /** Performs default handling of mouse wheel event (zoom in/out) */
  public async processWheelEvent(ev: BeWheelEvent, doUpdate: boolean): Promise<EventHandled> {
    await WheelEventProcessor.process(ev, doUpdate);
    this.updateDynamics(ev);
    IModelApp.viewManager.invalidateDecorationsAllViews();
    return EventHandled.Yes;
  }

  /** @internal */
  public onSelectedViewportChanged(previous: ScreenViewport | undefined, current: ScreenViewport | undefined): void {
    IModelApp.accuDraw.onSelectedViewportChanged(previous, current);

    if (undefined === current) {
      this.callOnCleanup();
      return;
    }

    if (undefined !== this._viewTool)
      this._viewTool.onSelectedViewportChanged(previous, current);

    if (undefined !== this._inputCollector)
      this._inputCollector.onSelectedViewportChanged(previous, current);

    if (undefined !== this._primitiveTool)
      this._primitiveTool.onSelectedViewportChanged(previous, current);
  }

  public setLocateCircleOn(locateOn: boolean): void {
    if (undefined === this._saveCursor)
      this.toolState.locateCircleOn = locateOn;
    else
      this._saveLocateCircle = locateOn;
  }

  public setLocateCursor(enableLocate: boolean): void {
    const { viewManager } = IModelApp;
    this.setCursor(viewManager.inDynamicsMode ? IModelApp.viewManager.dynamicsCursor : IModelApp.viewManager.crossHairCursor);
    this.setLocateCircleOn(enableLocate);
    viewManager.invalidateDecorationsAllViews();
  }

  /** @internal */
  public callOnCleanup(): void {
    this.exitViewTool();
    this.exitInputCollector();
    if (undefined !== this._primitiveTool)
      this._primitiveTool.onCleanup();
  }
}

/**
 * Default processor to handle wheel events.
 * @internal
 */
export class WheelEventProcessor {
  public static async process(ev: BeWheelEvent, doUpdate: boolean): Promise<void> {
    const vp = ev.viewport;
    if (undefined === vp)
      return;

    await this.doZoom(ev);

    if (doUpdate) {
      vp.synchWithView(true);

      // AccuSnap hit won't be invalidated without cursor motion (closes info window, etc.).
      IModelApp.accuSnap.clear();
    }
  }

  private static async doZoom(ev: BeWheelEvent): Promise<ViewStatus> {
    const vp = ev.viewport;
    if (undefined === vp)
      return ViewStatus.InvalidViewport;

    let zoomRatio = ToolSettings.wheelZoomRatio;
    if (zoomRatio < 1)
      zoomRatio = 1;
    if (ev.wheelDelta > 0)
      zoomRatio = 1 / zoomRatio;

    let isSnapOrPrecision = false;
    const target = Point3d.create();
    if (IModelApp.tentativePoint.isActive) {
      // Always use Tentative location, adjusted point, not cross
      isSnapOrPrecision = true;
      target.setFrom(IModelApp.tentativePoint.getPoint());
    } else {
      // Never use AccuSnap location as initial zoom clears snap causing zoom center to "jump"
      isSnapOrPrecision = CoordSource.Precision === ev.coordsFrom;
      target.setFrom(isSnapOrPrecision ? ev.point : ev.rawPoint);
    }

    let status: ViewStatus;
    if (vp.view.is3d() && vp.isCameraOn) {
      let lastEventWasValid: boolean = false;
      if (!isSnapOrPrecision) {
        const targetNpc = vp.worldToNpc(target);
        const newTarget = new Point3d();
        const lastEvent = IModelApp.toolAdmin.currentInputState.lastWheelEvent;
        if (lastEvent && lastEvent.viewport && lastEvent.viewport.view.equals(vp.view) && lastEvent.viewPoint.distanceSquaredXY(ev.viewPoint) < 10) {
          vp.worldToNpc(lastEvent.point, newTarget);
          targetNpc.z = newTarget.z;
          lastEventWasValid = true;
        } else if (undefined !== vp.pickNearestVisibleGeometry(target, vp.pixelsFromInches(ToolSettings.viewToolPickRadiusInches), true, newTarget)) {
          vp.worldToNpc(newTarget, newTarget);
          targetNpc.z = newTarget.z;
        } else {
          vp.view.getTargetPoint(newTarget);
          vp.worldToNpc(newTarget, newTarget);
          targetNpc.z = newTarget.z;
        }
        vp.npcToWorld(targetNpc, target);
      }

      const cameraView: ViewState3d = vp.view;
      const transform = Transform.createFixedPointAndMatrix(target, Matrix3d.createScale(zoomRatio, zoomRatio, zoomRatio));
      const oldCameraPos = cameraView.getEyePoint();
      const newCameraPos = transform.multiplyPoint3d(oldCameraPos);
      const offset = Vector3d.createStartEnd(oldCameraPos, newCameraPos);

      // when you're too close to an object, the wheel zoom operation will stop. We set a "bump distance" so you can blast through obstacles.
      if (!isSnapOrPrecision && offset.magnitude() < ToolSettings.wheelZoomBumpDistance) {
        offset.scaleToLength(ToolSettings.wheelZoomBumpDistance / 3.0, offset); // move 1/3 of the bump distance, just to get to the other side.
        lastEventWasValid = false;
        target.addInPlace(offset);
      }

      const viewTarget = cameraView.getTargetPoint().clone();
      viewTarget.addInPlace(offset);
      newCameraPos.setFrom(oldCameraPos.plus(offset));

      if (!lastEventWasValid) {
        const thisEvent = ev.clone();
        thisEvent.point.setFrom(target);
        IModelApp.toolAdmin.currentInputState.lastWheelEvent = thisEvent;
      }

      status = cameraView.lookAt(newCameraPos, viewTarget, cameraView.getYVector());
      vp.synchWithView(false);
    } else {
      const targetNpc = vp.worldToNpc(target);
      const trans = Transform.createFixedPointAndMatrix(targetNpc, Matrix3d.createScale(zoomRatio, zoomRatio, 1));
      const viewCenter = Point3d.create(.5, .5, .5);

      trans.multiplyPoint3d(viewCenter, viewCenter);
      vp.npcToWorld(viewCenter, viewCenter);
      vp.zoom(viewCenter, zoomRatio, { saveInUndo: false, animateFrustumChange: false });
      status = ViewStatus.Success;
    }

    // if we scrolled out, we may have invalidated the current AccuSnap path
    await IModelApp.accuSnap.reEvaluate();
    return status;
  }
}
