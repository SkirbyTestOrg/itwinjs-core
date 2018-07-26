
/*---------------------------------------------------------------------------------------------
| $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Tools */

import { Point3d, Point2d, XAndY } from "@bentley/geometry-core";
import { Viewport } from "../Viewport";
import { DecorateContext, DynamicsContext } from "../ViewContext";
import { HitDetail } from "../HitDetail";
import { I18NNamespace } from "@bentley/imodeljs-i18n";
import { IModelApp } from "../IModelApp";
import { IModelError } from "@bentley/imodeljs-common";
import { FuzzySearch, FuzzySearchResults } from "../FuzzySearch";

export type ToolType = typeof Tool;
export type ToolList = ToolType[];

export const enum BeButton {
  Data = 0,
  Reset = 1,
  Middle = 2,
}

export enum BeCursor {
  Default = "default",
  CrossHair = "crosshair",
  OpenHand = "grab",
  ClosedHand = "grabbing",
  Rotate = "move",
  Arrow = "default",
  NotAllowed = "not-allowed",
  Text = "text",
  Busy = "wait",
  Dynamics = "move",
}

/** The *type* of a gesture. */
export const enum GestureId {
  None = 0,
  /** Two or more fingers dragging */
  MultiFingerMove = 1,
  /** A single finger dragging */
  SingleFingerMove = 2,
  /** tap with two fingers */
  TwoFingerTap = 3,
  /** long press followed by a tap */
  PressAndTap = 4,
  /** One finger down and up; implies no LongPress active */
  SingleTap = 5,
  /** One finger down and up, twice; implies no LongPress active */
  DoubleTap = 6,
  /** One finger held down for more than some threshold */
  LongPress = 7,
}

/** The *source* that generated an event. */
export const enum InputSource {
  /** Source not defined */
  Unknown = 0,
  /** From a mouse or other pointing device */
  Mouse = 1,
  /** From a touch screen */
  Touch = 2,
}

/** The *source* that generated a point. */
export const enum CoordSource {
  /** Event was created by an action from the user */
  User = 0,
  /** Event was created by a program or by a precision keyin */
  Precision = 1,
  /** Event was created by a tentative point */
  TentativePoint = 2,
  /** Event was created by snapping to an element */
  ElemSnap = 3,
}

/** Numeric mask for a set of modifier keys (control, shift, and alt). */
export const enum BeModifierKeys { None = 0, Control = 1 << 0, Shift = 1 << 1, Alt = 1 << 2 }

export class BeButtonState {
  private readonly _downUorPt: Point3d = new Point3d();
  private readonly _downRawPt: Point3d = new Point3d();
  public downTime: number = 0;
  public isDown: boolean = false;
  public isDoubleClick: boolean = false;
  public isDragging: boolean = false;
  public inputSource: InputSource = InputSource.Unknown;

  public get downRawPt() { return this._downRawPt; }
  public set downRawPt(pt: Point3d) { this._downRawPt.setFrom(pt); }
  public get downUorPt() { return this._downUorPt; }
  public set downUorPt(pt: Point3d) { this._downUorPt.setFrom(pt); }

  public init(downUorPt: Point3d, downRawPt: Point3d, downTime: number, isDown: boolean, isDoubleClick: boolean, isDragging: boolean, source: InputSource) {
    this.downUorPt = downUorPt;
    this.downRawPt = downRawPt;
    this.downTime = downTime;
    this.isDown = isDown;
    this.isDoubleClick = isDoubleClick;
    this.isDragging = isDragging;
    this.inputSource = source;
  }
}

export class BeButtonEvent {
  private readonly _point: Point3d = new Point3d();
  private readonly _rawPoint: Point3d = new Point3d();
  private readonly _viewPoint: Point3d = new Point3d();
  public viewport?: Viewport;
  public coordsFrom = CoordSource.User;   // how were the coordinate values in point generated?
  public keyModifiers = BeModifierKeys.None;
  public isDoubleClick = false;
  public isDown = false;
  public button = BeButton.Data;
  public inputSource = InputSource.Unknown;
  public actualInputSource = InputSource.Unknown;

  public get isValid(): boolean { return this.viewport !== undefined; }
  public get point() { return this._point; }
  public set point(pt: Point3d) { this._point.setFrom(pt); }
  public get rawPoint() { return this._rawPoint; }
  public set rawPoint(pt: Point3d) { this._rawPoint.setFrom(pt); }
  public get viewPoint() { return this._viewPoint; }
  public set viewPoint(pt: Point3d) { this._viewPoint.setFrom(pt); }

  public invalidate() { this.viewport = undefined; }
  public initEvent(point: Point3d, rawPoint: Point3d, viewPt: Point3d, vp: Viewport, from: CoordSource, keyModifiers: BeModifierKeys = BeModifierKeys.None, button = BeButton.Data, isDown = true, doubleClick = false, source = InputSource.Unknown) {
    this.point = point;
    this.rawPoint = rawPoint;
    this.viewPoint = viewPt;
    this.viewport = vp;
    this.coordsFrom = from;
    this.keyModifiers = keyModifiers;
    this.isDoubleClick = doubleClick;
    this.isDown = isDown;
    this.button = button;
    this.inputSource = source;
    this.actualInputSource = source;
  }

  public getDisplayPoint(): Point2d { return new Point2d(this._viewPoint.x, this._viewPoint.y); }
  public get isControlKey() { return 0 !== (this.keyModifiers & BeModifierKeys.Control); }
  public get isShiftKey() { return 0 !== (this.keyModifiers & BeModifierKeys.Shift); }
  public get isAltKey() { return 0 !== (this.keyModifiers & BeModifierKeys.Alt); }

  public setFrom(src: BeButtonEvent) {
    this.point = src.point;
    this.rawPoint = src.rawPoint;
    this.viewPoint = src.viewPoint;
    this.viewport = src.viewport;
    this.coordsFrom = src.coordsFrom;
    this.keyModifiers = src.keyModifiers;
    this.isDoubleClick = src.isDoubleClick;
    this.isDown = src.isDown;
    this.button = src.button;
    this.inputSource = src.inputSource;
    this.actualInputSource = src.actualInputSource;
  }
  public clone(result?: BeButtonEvent): BeButtonEvent {
    result = result ? result : new BeButtonEvent();
    result.setFrom(this);
    return result;
  }
}

/** Describes a "gesture" input originating from a touch-input device. */
export class GestureInfo {
  public gestureId = GestureId.None;
  public numberTouches = 0;
  public previousNumberTouches = 0;    // Only meaningful for GestureId::SingleFingerMove and GestureId::MultiFingerMove
  public touches: Point2d[] = [new Point2d(), new Point2d(), new Point2d()];
  public ptsLocation: Point2d = new Point2d();    // Location of centroid
  public distance = 0;                 // Only meaningful on motion with multiple touches
  public isEndGesture = false;
  public isFromMouse = false;

  public getViewPoint(vp: Viewport) {
    const screenRect = vp.viewRect;
    return new Point3d(this.ptsLocation.x - screenRect.left, this.ptsLocation.y - screenRect.top, 0.0);
  }

  public init(gestureId: GestureId, centerX: number, centerY: number, distance: number, touchPoints: XAndY[], isEnding: boolean, isFromMouse: boolean, prevNumTouches: number) {
    this.gestureId = gestureId;
    this.numberTouches = Math.min(touchPoints.length, 3);
    this.previousNumberTouches = prevNumTouches;
    this.isEndGesture = isEnding;
    this.isFromMouse = isFromMouse;

    this.ptsLocation.x = Math.floor(centerX);
    this.ptsLocation.y = Math.floor(centerY);
    this.distance = distance;

    for (let i = 0; i < this.numberTouches; ++i) {
      this.touches[i].x = Math.floor(touchPoints[i].x);
      this.touches[i].y = Math.floor(touchPoints[i].y);
    }
  }

  public copyFrom(src: GestureInfo) {
    this.gestureId = src.gestureId;
    this.numberTouches = src.numberTouches;
    this.previousNumberTouches = src.previousNumberTouches;
    this.isEndGesture = src.isEndGesture;

    this.ptsLocation.x = src.ptsLocation.x;
    this.ptsLocation.y = src.ptsLocation.y;
    this.distance = src.distance;

    for (let i = 0; i < this.numberTouches; ++i) {
      this.touches[i].x = src.touches[i].x;
      this.touches[i].y = src.touches[i].y;
    }

    this.isFromMouse = src.isFromMouse;
  }
  public clone(result?: GestureInfo) {
    result = result ? result : new GestureInfo();
    result.copyFrom(this);
    return result;
  }
}

/** Specialization of ButtonEvent describing a gesture event originating from touch input. */
export class BeGestureEvent extends BeButtonEvent {
  public gestureInfo?: GestureInfo;
  public setFrom(src: BeGestureEvent) {
    super.setFrom(src);
    this.gestureInfo = src.gestureInfo;
  }
  public clone(result?: BeGestureEvent): BeGestureEvent {
    result = result ? result : new BeGestureEvent();
    result.setFrom(this);
    return result;
  }
}

/** Information about movement of the mouse wheel. */
export class BeWheelEvent extends BeButtonEvent {
  public constructor(public wheelDelta: number = 0) { super(); }
  public setFrom(src: BeWheelEvent): void {
    super.setFrom(src);
    this.wheelDelta = src.wheelDelta;
  }
  public clone(result?: BeWheelEvent): BeWheelEvent {
    result = result ? result : new BeWheelEvent();
    result.setFrom(this);
    return result;
  }
}

/**
 * Base Tool class for handling user input events from Viewports.
 * @see [Tools]($docs/learning/frontend/tools.md)
 */
export class Tool {
  /** If true, this Tool will not appear in the list from [[ToolRegistry.getToolList]]. This should be overridden in subclasses to hide them. */
  public static hidden = false;
  /** The unique string that identifies this tool. This must be overridden in every subclass. */
  public static toolId = "";
  /** The [I18NNamespace]($i18n) that provides localized strings for this Tool */
  public static namespace: I18NNamespace;
  protected static _keyin?: string; // localized (fetched only once, first time needed. If not found, toolId is returned).
  protected static _flyover?: string; // localized (fetched first time needed. If not found, keyin is returned.)
  protected static _description?: string; // localized (fetched first time needed. If not found, flyover is returned.)
  public constructor(..._args: any[]) { }

  private static getLocalizeBase() { return this.namespace.name + ":tools." + this.toolId; }
  private static getKeyinKey() { return this.getLocalizeBase() + ".keyin"; }
  private static getFlyoverKey() { return this.getLocalizeBase() + ".flyover"; }
  private static getDescriptionKey() { return this.getLocalizeBase() + ".description"; }

  /**
   * Register this Tool class with the ToolRegistry.
   * @param namespace optional namespace to supply to ToolRegistry.register. If undefined, use namespace from superclass.
   */
  public static register(namespace?: I18NNamespace) { IModelApp.tools.register(this, namespace); }

  /**
   * Get the localized keyin string for this Tool class. This returns the value of "tools." + this.toolId + ".keyin" from the
   * .json file for the current locale of its registered Namespace (e.g. "en/MyApp.json")
   */
  public static get keyin(): string { return this._keyin ? this._keyin : (this._keyin = IModelApp.i18n.translate(this.getKeyinKey())); }

  /**
   * Get the localized flyover for this Tool class. This returns the value of "tools." + this.toolId + ".flyover" from the
   * .json file for the current locale of its registered Namespace (e.g. "en/MyApp.json"). If that key is not in the localization namespace,
   * the keyin property is returned.
   */
  public static get flyover(): string { return this._flyover ? this._flyover : (this._flyover = IModelApp.i18n.translate([this.getFlyoverKey(), this.getKeyinKey()])); }

  /**
   * Get the localized description for this Tool class. This returns the value of "tools." + this.toolId + ".description" from the
   * .json file for the current locale of its registered Namespace (e.g. "en/MyApp.json"). If that key is not in the localization namespace,
   * the flyover property is returned.
   */
  public static get description(): string { return this._description ? this._description : (this._description = IModelApp.i18n.translate([this.getDescriptionKey(), this.getFlyoverKey(), this.getKeyinKey()])); }

  /**
   * Get the toolId string for this Tool class. This string is used to identify the Tool in the ToolRegistry and is used to localize
   * the keyin, description, etc. from the current locale.
   */
  public get toolId(): string { return (this.constructor as ToolType).toolId; }

  /** Get the localized keyin string from this Tool's class */
  public get keyin(): string { return (this.constructor as ToolType).keyin; }

  /** Get the localized flyover string from this Tool's class */
  public get flyover(): string { return (this.constructor as ToolType).flyover; }

  /** Get the localized description string from this Tool's class */
  public get description(): string { return (this.constructor as ToolType).description; }

  /**
   * Run this instance of a Tool. Subclasses should override to perform some action.
   * @returns `true` if the tool executed successfully.
   */
  public run(..._arg: any[]): boolean { return true; }
}

export enum EventHandled {
  No = 0,
  Yes = 1,
}

/**
 * A Tool that may be installed, via [[ToolAdmin]], to handle user input. The ToolAdmin manages the currently installed ViewingTool, PrimitiveTool,
 * InputCollector, and IdleTool. Each must derive from this class and there may only be one of each type installed at a time.
 */
export abstract class InteractiveTool extends Tool {

  /** Used to avoid sending tools up events for which they did not receive the down event. */
  public receivedDownEvent = false;

  /** Override to execute additional logic when tool is installed. Return false to prevent this tool from becoming active */
  public onInstall(): boolean { return true; }

  /** Override to execute additional logic after tool becomes active */
  public onPostInstall(): void { }

  public abstract exitTool(): void;

  /** Override Call to reset tool to initial state */
  public onReinitialize(): void { }

  /** Invoked when the tool becomes no longer active, to perform additional cleanup logic */
  public onCleanup(): void { }

  /** Notification of a ViewTool or InputCollector starting and this tool is being suspended.
   * @note Applies only to PrimitiveTool and InputCollector, a ViewTool can't be suspended.
   */
  public onSuspend(): void { }

  /** Notification of a vViewTool or InputCollector exiting and this tool is being unsuspended.
   *  @note Applies only to PrimitiveTool and InputCollector, a ViewTool can't be suspended.
   */
  public onUnsuspend(): void { }

  /**
   * Called to allow an active tool to display non-element decorations in overlay mode.
   * This method is NOT called while the tool is suspended by a viewing tool or input collector.
   */
  public decorate(_context: DecorateContext): void { }

  /**
   * Called to allow a suspended tool to display non-element decorations in overlay mode.
   * This method is ONLY called when the tool is suspended by a viewing tool or input collector.
   * @note Applies only to PrimitiveTool and InputCollector, a ViewTool can't be suspended.
   */
  public decorateSuspended(_context: DecorateContext): void { }

  /** Invoked when the reset button is pressed.
   * @return false by default. Sub-classes may ascribe special meaning to this status.
   * @note To support right-press menus, a tool should put its reset event processing in onResetButtonUp instead of onResetButtonDown.
   */
  public async onResetButtonDown(_ev: BeButtonEvent): Promise<EventHandled> { return EventHandled.No; }
  /** Invoked when the reset button is released.
   * @return false by default. Sub-classes may ascribe special meaning to this status.
   */
  public async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> { return EventHandled.No; }

  /** Invoked when the data button is pressed.
   * @return false by default. Sub-classes may ascribe special meaning to this status.
   */
  public async onDataButtonDown(_ev: BeButtonEvent): Promise<EventHandled> { return EventHandled.No; }
  /** Invoked when the data button is released.
   * @return false by default. Sub-classes may ascribe special meaning to this status.
   */
  public async onDataButtonUp(_ev: BeButtonEvent): Promise<EventHandled> { return EventHandled.No; }

  /** Invoked when the middle mouse button is pressed.
   * @return true if event completely handled by tool and event should not be passed on to the IdleTool.
   */
  public async onMiddleButtonDown(_ev: BeButtonEvent): Promise<EventHandled> { return EventHandled.No; }

  /** Invoked when the middle mouse button is released.
   * @return true if event completely handled by tool and event should not be passed on to the IdleTool.
   */
  public async onMiddleButtonUp(_ev: BeButtonEvent): Promise<EventHandled> { return EventHandled.No; }

  /** Invoked when the cursor is moving */
  public async onModelMotion(_ev: BeButtonEvent): Promise<void> { }
  /** Invoked when the cursor is not moving */
  public async onModelNoMotion(_ev: BeButtonEvent): Promise<void> { }
  /** Invoked when the cursor was previously moving, and has stopped moving. */
  public async onModelMotionStopped(_ev: BeButtonEvent): Promise<void> { }

  /** Invoked when the cursor begins moving while a button is depressed.
   * @return false by default. Sub-classes may ascribe special meaning to this status.
   */
  public async onModelStartDrag(_ev: BeButtonEvent): Promise<EventHandled> { return EventHandled.No; }
  /** Invoked when the button is released after onModelStartDrag.
   * @note default placement tool behavior is to treat press, drag, and release of data button the same as click, click by calling onDataButtonDown.
   */
  public async onModelEndDrag(ev: BeButtonEvent): Promise<EventHandled> { if (BeButton.Data !== ev.button) return EventHandled.No; if (ev.isDown) return this.onDataButtonDown(ev); const downEv = ev.clone(); downEv.isDown = true; return this.onDataButtonDown(downEv); }

  /** Invoked when the mouse wheel moves.
   * @return true if event completely handled by tool and event should not be passed on to the IdleTool.
   */
  public async onMouseWheel(_ev: BeWheelEvent): Promise<EventHandled> { return EventHandled.No; }

  /** Called when Control, Shift, or Alt qualifier keys are pressed or released.
   * @param _wentDown up or down key event
   * @param _modifier The modifier key mask
   * @param _event The event that caused this call
   * @return true to refresh view decorations or update dynamics.
   */
  public async onModifierKeyTransition(_wentDown: boolean, _modifier: BeModifierKeys, _event: KeyboardEvent): Promise<boolean> { return false; }

  /** Called when keys are pressed or released.
   * @param _wentDown up or down key event
   * @param _keyEvent The KeyboardEvent
   * @return Yes to prevent further processing of this event
   * @note In case of Shift, Control and Alt key, onModifierKeyTransition is used.
   */
  public async onKeyTransition(_wentDown: boolean, _keyEvent: KeyboardEvent): Promise<EventHandled> { return EventHandled.No; }

  public onEndGesture(_ev: BeGestureEvent): boolean { return false; }
  public onSingleFingerMove(_ev: BeGestureEvent): boolean { return false; }
  public onMultiFingerMove(_ev: BeGestureEvent): boolean { return false; }
  public onTwoFingerTap(_ev: BeGestureEvent): boolean { return false; }
  public onPressAndTap(_ev: BeGestureEvent): boolean { return false; }
  public onSingleTap(_ev: BeGestureEvent): boolean { return false; }
  public onDoubleTap(_ev: BeGestureEvent): boolean { return false; }
  public onLongPress(_ev: BeGestureEvent): boolean { return false; }
  public onTouchMotionPaused(): boolean { return false; }

  public isCompatibleViewport(vp: Viewport, _isSelectedViewChange: boolean): boolean { return !!vp; }
  public isValidLocation(_ev: BeButtonEvent, _isButtonEvent: boolean): boolean { return true; }

  /**
   * Called when active view changes. Tool may choose to restart or exit based on current view type.
   * @param previous The previously active view.
   * @param current The new active view.
   */
  public onSelectedViewportChanged(_previous: Viewport | undefined, _current: Viewport | undefined): void { }

  /**
   * Invoked just before the locate tooltip is displayed to retrieve the info text. Allows the tool to override the default description.
   * @param hit The HitDetail whose info is needed.
   * @param _delimiter Use this string to break lines of the description.
   * @return A Promise for the string to describe the hit.
   * @note If you override this method, you may decide whether to call your superclass' implementation or not (it is not required).
   * The default implementation shows hit description
   */
  public async getToolTip(_hit: HitDetail): Promise<string> { return _hit.getToolTip(); }

  /** Fill the supplied button event from the current cursor location.   */
  public getCurrentButtonEvent(ev: BeButtonEvent): void { IModelApp.toolAdmin.fillEventFromCursorLocation(ev); }

  /** Call to find out if dynamics are currently active. */
  public isDynamicsStarted(): boolean { return IModelApp.viewManager.inDynamicsMode; }

  /** Call to initialize dynamics mode. While dynamics are active onDynamicFrame will be called. Dynamics are typically only used by a PrimitiveTool that creates or modifies geometric elements. */
  public beginDynamics(): void { IModelApp.toolAdmin.beginDynamics(); }

  /** Call to terminate dynamics mode. */
  public endDynamics(): void { IModelApp.toolAdmin.endDynamics(); }

  /** Called to allow Tool to display dynamic elements. */
  public onDynamicFrame(_ev: BeButtonEvent, _context: DynamicsContext): void { }
}

/** @hidden */
export abstract class InputCollector extends InteractiveTool {
  public run(): boolean {
    const toolAdmin = IModelApp.toolAdmin;
    // An input collector can only suspend a primitive tool, don't install if a viewing tool is active...
    if (undefined !== toolAdmin.activeViewTool || !toolAdmin.onInstallTool(this))
      return false;

    toolAdmin.startInputCollector(this);
    toolAdmin.setInputCollector(this);
    toolAdmin.onPostInstallTool(this);
    return true;
  }

  public exitTool(): void { IModelApp.toolAdmin.exitInputCollector(); }
  public async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> { this.exitTool(); return EventHandled.Yes; }
}

/**
 * The ToolRegistry holds a mapping between toolIds and the corresponding Tool class. This provides the mechanism to
 * find Tools by their toolId, and also a way to iterate over the collection of Tools available.
 */
export class ToolRegistry {
  public readonly tools = new Map<string, ToolType>();
  private _keyinList?: ToolList;

  /**
   * Un-register a previously registered Tool class.
   * @param toolId the toolId of a previously registered tool to unRegister.
   */
  public unRegister(toolId: string) { this.tools.delete(toolId); this._keyinList = undefined; }

  /**
   * Register a Tool class. This establishes a connection between the toolId of the class and the class itself.
   * @param toolClass the subclass of Tool to register.
   * @param namespace the namespace for the localized strings for this tool. If undefined, use namespace from superclass.
   */
  public register(toolClass: ToolType, namespace?: I18NNamespace) {
    if (namespace) // namespace is optional because it can come from superclass
      toolClass.namespace = namespace;

    if (toolClass.toolId.length === 0)
      return; // must be an abstract class, ignore it

    if (!toolClass.namespace)
      throw new IModelError(-1, "Tools must have a namespace");

    this.tools.set(toolClass.toolId, toolClass);
    this._keyinList = undefined;  // throw away the current keyinList so we'll produce a new one next time we're asked.
  }

  /**
   * register all the Tool classes found in a module.
   * @param modelObj the module to search for subclasses of Tool.
   */
  public registerModule(moduleObj: any, namespace?: I18NNamespace) {
    for (const thisMember in moduleObj) {
      if (!thisMember)
        continue;

      const thisTool = moduleObj[thisMember];
      if (thisTool.prototype instanceof Tool) {
        this.register(thisTool, namespace);
      }
    }
  }

  /** Look up a tool by toolId */
  public find(toolId: string): ToolType | undefined { return this.tools.get(toolId); }

  /**
   * Look up a tool by toolId and, if found, create an instance with the supplied arguments.
   * @param toolId the toolId of the tool
   * @param args arguments to pass to the constructor.
   * @returns an instance of the registered Tool class, or undefined if toolId is not registered.
   */
  public create(toolId: string, ...args: any[]): Tool | undefined {
    const toolClass = this.find(toolId);
    return toolClass ? new toolClass(...args) : undefined;
  }

  /**
   * Look up a tool by toolId and, if found, create an instance with the supplied arguments and run it.
   * @param toolId toolId of the immediate tool
   * @param args arguments to pass to the constructor, and to run.
   * @return true if the tool was found and successfully run.
   */
  public run(toolId: string, ...args: any[]): boolean {
    const tool = this.create(toolId, ...args);
    return tool !== undefined && tool.run(...args);
  }

  /** Get a list of Tools currently registered, excluding hidden tools */
  public getToolList(): ToolList {
    if (this._keyinList === undefined) {
      this._keyinList = [];
      this.tools.forEach((thisTool) => { if (!thisTool.hidden) this._keyinList!.push(thisTool); });
    }
    return this._keyinList;
  }

  /**
   * Find a tool by its localized keyin using a FuzzySearch
   * @param keyin the localized keyin string of the Tool.
   * @note Make sure the i18n resources are all loaded (e.g. `await IModelApp.i81n.waitForAllRead()`) before calling this method.
   */
  public findPartialMatches(keyin: string): FuzzySearchResults<ToolType> {
    return new FuzzySearch<ToolType>().search(this.getToolList(), ["keyin"], keyin);
  }

  /**
   * Find a tool by its localized keyin. If found (via exact match), execute the tool with the supplied arguments.
   * @param keyin the localized keyin string of the Tool to run.
   * @param args the arguments for the tool. Note: these argument are passed to both the constructor and the tools' run method.
   * @note Make sure the i18n resources are all loaded (e.g. `await IModelApp.i81n.waitForAllRead()`) before calling this method.
   */
  public executeExactMatch(keyin: string, ...args: any[]): boolean {
    const foundClass = this.findExactMatch(keyin);
    return foundClass ? new foundClass(...args).run(...args) : false;
  }

  /**
   * Find a tool by its localized keyin.
   * @param keyin the localized keyin string of the Tool.
   * @returns the Tool class, if an exact match is found, otherwise returns undefined.
   * @note Make sure the i18n resources are all loaded (e.g. `await IModelApp.i81n.waitForAllRead()`) before calling this method.
   */
  public findExactMatch(keyin: string): ToolType | undefined {
    return this.getToolList().find((thisTool) => thisTool.keyin === keyin);
  }
}
