/*---------------------------------------------------------------------------------------------
/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module SelectionSet */

import { Point3d, Point2d, Range2d } from "@bentley/geometry-core";
import { PrimitiveTool } from "./PrimitiveTool";
import { IModelApp } from "../IModelApp";
import { CoordinateLockOverrides, ManipulatorToolEvent } from "./ToolAdmin";
import { DecorateContext } from "../ViewContext";
import { BeButtonEvent, BeButton, BeModifierKeys, EventHandled, BeTouchEvent, InputSource } from "./Tool";
import { LocateResponse, LocateFilterStatus } from "../ElementLocateManager";
import { HitDetail } from "../HitDetail";
import { Id64Arg, Id64 } from "@bentley/bentleyjs-core";
import { ViewRect } from "../Viewport";
import { Pixel } from "../rendering";
import { ColorDef } from "@bentley/imodeljs-common";

/** The method for choosing elements with the [[SelectionTool]] */
export const enum SelectionMethod {
  /** Identify element(s) by picking for drag selection (inside/overlap for drag box selection determined by point direction and shift key) */
  Pick,
  /** Identify elements by overlap with crossing line */
  Line,
  /** Identify elements by box selection (inside/overlap for box selection determined by point direction and shift ke) */
  Box,
}

/** The mode for choosing elements with the [[SelectionTool]] */
export const enum SelectionMode {
  /** Identified elements replace the current selection set (use control key to add or remove) */
  Replace,
  /** Identified elements are added to the current selection set */
  Add,
  /** Identified elements are removed from the current selection set */
  Remove,
}

/** The processing method to use to update the current selection. */
export const enum SelectionProcessing {
  /** Add element to selection. */
  AddElementToSelection,
  /** Remove element from selection. */
  RemoveElementFromSelection,
  /** If element is in selection remove it, else add it. */
  InvertElementInSelection,
  /** Replace current selection with element. */
  ReplaceSelectionWithElement,
}

/** Tool for picking a set of elements of interest, selected by the user. */
export class SelectionTool extends PrimitiveTool {
  public static hidden = false;
  public static toolId = "Select";
  public isSelectByPoints = false;
  public isSuspended = false;
  public readonly points: Point3d[] = [];

  public requireWriteableTarget(): boolean { return false; }
  public autoLockTarget(): void { } // NOTE: For selecting elements we only care about iModel, so don't lock target model automatically.

  protected wantSelectionClearOnMiss(_ev: BeButtonEvent): boolean { return SelectionMode.Replace === this.getSelectionMode(); }
  protected wantEditManipulators(): boolean { return SelectionMethod.Pick === this.getSelectionMethod(); } // NEEDSWORK: Settings...send ManipulatorToolEvent.Stop/Start as appropriate when value changes...
  protected wantPickableDecorations(): boolean { return this.wantEditManipulators(); } // Allow pickable decorations selection to be independent of manipulators...

  protected getSelectionMethod(): SelectionMethod { return SelectionMethod.Pick; } // NEEDSWORK: Setting...
  protected getSelectionMode(): SelectionMode { return SelectionMode.Replace; } // NEEDSWORK: Settings...
  protected wantToolSettings(): boolean { return true; } // NEEDSWORK: Settings...

  protected initSelectTool(): void {
    const method = this.getSelectionMethod();
    const mode = this.getSelectionMode();
    const enableLocate = SelectionMethod.Pick === method;

    this.isSelectByPoints = false;
    this.points.length = 0;

    this.initLocateElements(enableLocate, false, enableLocate ? "default" : "crosshair", CoordinateLockOverrides.All);
    IModelApp.locateManager.options.allowDecorations = true; // Always locate to display tool tip even if we reject for adding to selection set...

    switch (mode) {
      case SelectionMode.Replace:
        switch (method) {
          case SelectionMethod.Pick:
            IModelApp.notifications.outputPromptByKey("CoreTools:tools.ElementSet.Prompt.IdentifyElement");
            break;
          case SelectionMethod.Line:
            IModelApp.notifications.outputPromptByKey("CoreTools:tools.ElementSet.Prompt.IdentifyLine");
            break;
          case SelectionMethod.Box:
            IModelApp.notifications.outputPromptByKey("CoreTools:tools.ElementSet.Prompt.IdentifyBox");
            break;
        }
        break;
      case SelectionMode.Add:
        switch (method) {
          case SelectionMethod.Pick:
            IModelApp.notifications.outputPromptByKey("CoreTools:tools.ElementSet.Prompt.IdentifyElementAdd");
            break;
          case SelectionMethod.Line:
            IModelApp.notifications.outputPromptByKey("CoreTools:tools.ElementSet.Prompt.IdentifyLineAdd");
            break;
          case SelectionMethod.Box:
            IModelApp.notifications.outputPromptByKey("CoreTools:tools.ElementSet.Prompt.IdentifyBoxAdd");
            break;
        }
        break;
      case SelectionMode.Remove:
        switch (method) {
          case SelectionMethod.Pick:
            IModelApp.notifications.outputPromptByKey("CoreTools:tools.ElementSet.Prompt.IdentifyElementRemove");
            break;
          case SelectionMethod.Line:
            IModelApp.notifications.outputPromptByKey("CoreTools:tools.ElementSet.Prompt.IdentifyLineRemove");
            break;
          case SelectionMethod.Box:
            IModelApp.notifications.outputPromptByKey("CoreTools:tools.ElementSet.Prompt.IdentifyBoxRemove");
            break;
        }
        break;
    }
  }

  public processSelection(elementId: Id64Arg, process: SelectionProcessing): boolean {
    switch (process) {
      case SelectionProcessing.AddElementToSelection:
        return this.iModel.selectionSet.add(elementId);
      case SelectionProcessing.RemoveElementFromSelection:
        return this.iModel.selectionSet.remove(elementId);
      case SelectionProcessing.InvertElementInSelection: // (if element is in selection remove it else add it.)
        return this.iModel.selectionSet.invert(elementId);
      case SelectionProcessing.ReplaceSelectionWithElement:
        this.iModel.selectionSet.replace(elementId);
        return true;
      default:
        return false;
    }
  }

  protected useOverlapSelection(ev: BeButtonEvent): boolean {
    let overlapMode = false;
    const vp = ev.viewport!;
    const pt1 = vp.worldToView(this.points[0]);
    const pt2 = vp.worldToView(ev.point);
    overlapMode = (pt1.x > pt2.x);
    return (ev.isShiftKey ? !overlapMode : overlapMode); // Shift inverts inside/overlap selection...
  }

  private selectByPointsDecorate(context: DecorateContext): void {
    if (!this.isSelectByPoints)
      return;

    const ev = new BeButtonEvent();
    IModelApp.toolAdmin.fillEventFromCursorLocation(ev);

    const vp = context.viewport!;
    const bestContrastIsBlack = (ColorDef.black === vp.getContrastToBackgroundColor());
    const crossingLine = (SelectionMethod.Line === this.getSelectionMethod() || (SelectionMethod.Pick === this.getSelectionMethod() && BeButton.Reset === ev.button));
    const overlapSelection = (crossingLine || this.useOverlapSelection(ev));

    const position = vp.worldToView(this.points[0]); position.x = Math.floor(position.x) + 0.5; position.y = Math.floor(position.y) + 0.5;
    const position2 = vp.worldToView(ev.point); position2.x = Math.floor(position2.x) + 0.5; position2.y = Math.floor(position2.y) + 0.5;
    const offset = position2.minus(position);

    const drawDecoration = (ctx: CanvasRenderingContext2D) => {
      ctx.strokeStyle = bestContrastIsBlack ? "black" : "white";
      ctx.lineWidth = 1;
      if (overlapSelection) ctx.setLineDash([5, 5]);
      if (crossingLine) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(offset.x, offset.y);
        ctx.stroke();
      } else {
        ctx.strokeRect(0, 0, offset.x, offset.y);
        ctx.fillStyle = bestContrastIsBlack ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.06)";
        ctx.fillRect(0, 0, offset.x, offset.y);
      }
    };
    context.addCanvasDecoration({ position, drawDecoration });
  }

  protected selectByPointsProcess(origin: Point3d, corner: Point3d, ev: BeButtonEvent, method: SelectionMethod, overlap: boolean) {
    const vp = ev.viewport;
    if (!vp)
      return;
    const pts: Point2d[] = [];
    pts[0] = new Point2d(Math.floor(origin.x + 0.5), Math.floor(origin.y + 0.5));
    pts[1] = new Point2d(Math.floor(corner.x + 0.5), Math.floor(corner.y + 0.5));
    const range = Range2d.createArray(pts);

    const rect = new ViewRect();
    rect.initFromRange(range);
    const pixels = vp.readPixels(rect, Pixel.Selector.ElementId);
    if (undefined === pixels)
      return;

    let contents = new Set<string>();
    const testPoint = Point2d.createZero();

    if (SelectionMethod.Box === method) {
      const outline = overlap ? undefined : new Set<string>();
      const offset = range.clone();
      offset.expandInPlace(-2);
      for (testPoint.x = range.low.x; testPoint.x <= range.high.x; ++testPoint.x) {
        for (testPoint.y = range.low.y; testPoint.y <= range.high.y; ++testPoint.y) {
          const pixel = pixels.getPixel(testPoint.x, testPoint.y);
          if (undefined === pixel || undefined === pixel.elementId || Id64.isInvalid(pixel.elementId))
            continue; // no geometry at this location...
          if (undefined !== outline && !offset.containsPoint(testPoint))
            outline.add(pixel.elementId.toString());
          else
            contents.add(pixel.elementId.toString());
        }
      }
      if (undefined !== outline && 0 !== outline.size) {
        const inside = new Set<string>();
        contents.forEach((id) => { if (!outline.has(id)) inside.add(id); });
        contents = inside;
      }
    } else {
      const closePoint = Point2d.createZero();
      for (testPoint.x = range.low.x; testPoint.x <= range.high.x; ++testPoint.x) {
        for (testPoint.y = range.low.y; testPoint.y <= range.high.y; ++testPoint.y) {
          const pixel = pixels.getPixel(testPoint.x, testPoint.y);
          if (undefined === pixel || undefined === pixel.elementId || Id64.isInvalid(pixel.elementId))
            continue; // no geometry at this location...
          const fraction = testPoint.fractionOfProjectionToLine(pts[0], pts[1], 0.0);
          pts[0].interpolate(fraction, pts[1], closePoint);
          if (closePoint.distance(testPoint) < 1.5)
            contents.add(pixel.elementId.toString());
        }
      }
    }

    if (!this.wantPickableDecorations())
      contents.forEach((id) => { if (Id64.isTransient(id)) contents.delete(id); });

    if (0 === contents.size) {
      if (!ev.isControlKey && this.wantSelectionClearOnMiss(ev))
        this.iModel.selectionSet.emptyAll();
      return;
    }

    switch (this.getSelectionMode()) {
      case SelectionMode.Replace:
        if (!ev.isControlKey)
          this.processSelection(contents, SelectionProcessing.ReplaceSelectionWithElement);
        else
          this.processSelection(contents, SelectionProcessing.InvertElementInSelection);
        break;
      case SelectionMode.Add:
        this.processSelection(contents, SelectionProcessing.AddElementToSelection);
        break;
      case SelectionMode.Remove:
        this.processSelection(contents, SelectionProcessing.RemoveElementFromSelection);
        break;
    }
  }

  protected selectByPointsStart(ev: BeButtonEvent): boolean {
    if (BeButton.Data !== ev.button && BeButton.Reset !== ev.button)
      return false;
    this.points.length = 0;
    this.points.push(ev.point.clone());
    this.isSelectByPoints = true;
    IModelApp.accuSnap.enableLocate(false);
    IModelApp.toolAdmin.setLocateCircleOn(false);
    return true;
  }

  protected selectByPointsEnd(ev: BeButtonEvent): boolean {
    if (!this.isSelectByPoints)
      return false;

    const vp = ev.viewport;
    if (vp === undefined) {
      this.initSelectTool();
      return false;
    }

    const origin = vp.worldToView(this.points[0]);
    const corner = vp.worldToView(ev.point);
    if (SelectionMethod.Line === this.getSelectionMethod() || (SelectionMethod.Pick === this.getSelectionMethod() && BeButton.Reset === ev.button))
      this.selectByPointsProcess(origin, corner, ev, SelectionMethod.Line, true);
    else
      this.selectByPointsProcess(origin, corner, ev, SelectionMethod.Box, this.useOverlapSelection(ev));

    this.initSelectTool();
    vp.invalidateDecorations();
    return true;
  }

  public async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    if (undefined !== ev.viewport && this.isSelectByPoints)
      ev.viewport.invalidateDecorations();
  }

  public async selectDecoration(ev: BeButtonEvent, currHit?: HitDetail): Promise<EventHandled> {
    if (undefined === currHit)
      currHit = IModelApp.locateManager.doLocate(new LocateResponse(), true, ev.point, ev.viewport, ev.inputSource);

    if (undefined !== currHit && !currHit.isElementHit)
      return IModelApp.viewManager.onDecorationButtonEvent(currHit, ev);

    return EventHandled.No;
  }

  public async onMouseStartDrag(ev: BeButtonEvent): Promise<EventHandled> {
    if (EventHandled.Yes === await this.selectDecoration(ev, IModelApp.accuSnap.currHit))
      return EventHandled.Yes;
    if (InputSource.Touch === ev.inputSource && SelectionMethod.Pick === this.getSelectionMethod())
      return EventHandled.No; // Require method change for line/box selection...allow IdleTool to handle touch move...
    return this.selectByPointsStart(ev) ? EventHandled.Yes : EventHandled.No;
  }

  public async onMouseEndDrag(ev: BeButtonEvent): Promise<EventHandled> {
    return this.selectByPointsEnd(ev) ? EventHandled.Yes : EventHandled.No;
  }

  public async onDataButtonUp(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === ev.viewport)
      return EventHandled.No;

    if (this.selectByPointsEnd(ev))
      return EventHandled.Yes;

    if (SelectionMethod.Pick !== this.getSelectionMethod()) {
      if (!ev.isControlKey && this.wantSelectionClearOnMiss(ev))
        this.iModel.selectionSet.emptyAll();
      if (InputSource.Touch !== ev.inputSource)
        this.selectByPointsStart(ev); // Require touch move and not tap to start crossing line/box selection...
      return EventHandled.Yes;
    }

    const hit = IModelApp.locateManager.doLocate(new LocateResponse(), true, ev.point, ev.viewport, ev.inputSource);
    if (hit !== undefined) {
      if (EventHandled.Yes === await this.selectDecoration(ev, hit))
        return EventHandled.Yes;

      switch (this.getSelectionMode()) {
        case SelectionMode.Replace:
          this.processSelection(hit.sourceId, ev.isControlKey ? SelectionProcessing.InvertElementInSelection : SelectionProcessing.ReplaceSelectionWithElement);
          break;

        case SelectionMode.Add:
          this.processSelection(hit.sourceId, SelectionProcessing.AddElementToSelection);
          break;

        case SelectionMode.Remove:
          this.processSelection(hit.sourceId, SelectionProcessing.RemoveElementFromSelection);
          break;
      }
      return EventHandled.Yes;
    }

    if (!ev.isControlKey && 0 !== this.iModel.selectionSet.size && this.wantSelectionClearOnMiss(ev))
      this.iModel.selectionSet.emptyAll();

    return EventHandled.Yes;
  }

  public async onResetButtonUp(ev: BeButtonEvent): Promise<EventHandled> {
    if (this.isSelectByPoints) {
      if (undefined !== ev.viewport)
        ev.viewport.invalidateDecorations();
      this.initSelectTool();
      return EventHandled.Yes;
    }

    // Check for overlapping hits...
    const lastHit = SelectionMode.Remove === this.getSelectionMode() ? undefined : IModelApp.locateManager.currHit;
    if (lastHit && this.iModel.selectionSet.has(lastHit.sourceId)) {
      const autoHit = IModelApp.accuSnap.currHit;

      // Play nice w/auto-locate, only remove previous hit if not currently auto-locating or over previous hit
      if (undefined === autoHit || autoHit.isSameHit(lastHit)) {
        const response = new LocateResponse();
        const nextHit = IModelApp.locateManager.doLocate(response, false, ev.point, ev.viewport, ev.inputSource);

        // remove element(s) previously selected if in replace mode, or if we have a next element in add mode
        if (SelectionMode.Replace === this.getSelectionMode() || undefined !== nextHit)
          this.processSelection(lastHit.sourceId, SelectionProcessing.RemoveElementFromSelection);

        // add element(s) located via reset button
        if (undefined !== nextHit)
          this.processSelection(nextHit.sourceId, SelectionProcessing.AddElementToSelection);
        return EventHandled.Yes;
      }
    }

    if (EventHandled.Yes === await this.selectDecoration(ev, IModelApp.accuSnap.currHit))
      return EventHandled.Yes;

    IModelApp.accuSnap.resetButton();
    return EventHandled.Yes;
  }

  public onSuspend(): void { this.isSuspended = true; if (this.wantEditManipulators()) IModelApp.toolAdmin.manipulatorToolEvent.raiseEvent(this, ManipulatorToolEvent.Suspend); }
  public onUnsuspend(): void { this.isSuspended = false; if (this.wantEditManipulators()) IModelApp.toolAdmin.manipulatorToolEvent.raiseEvent(this, ManipulatorToolEvent.Unsuspend); }

  public async onTouchMoveStart(ev: BeTouchEvent, startEv: BeTouchEvent): Promise<EventHandled> {
    if (startEv.isSingleTouch && !this.isSelectByPoints)
      await IModelApp.toolAdmin.convertTouchMoveStartToButtonDownAndMotion(startEv, ev);
    return (this.isSuspended || this.isSelectByPoints) ? EventHandled.Yes : EventHandled.No;
  }

  public async onTouchMove(ev: BeTouchEvent): Promise<void> { if (this.isSelectByPoints) IModelApp.toolAdmin.convertTouchMoveToMotion(ev); }
  public async onTouchComplete(ev: BeTouchEvent): Promise<void> { if (this.isSelectByPoints) IModelApp.toolAdmin.convertTouchEndToButtonUp(ev); }
  public async onTouchCancel(ev: BeTouchEvent): Promise<void> { if (this.isSelectByPoints) IModelApp.toolAdmin.convertTouchEndToButtonUp(ev, BeButton.Reset); }

  public decorate(context: DecorateContext): void { this.selectByPointsDecorate(context); }

  public async onModifierKeyTransition(_wentDown: boolean, modifier: BeModifierKeys, _event: KeyboardEvent): Promise<EventHandled> {
    return (modifier === BeModifierKeys.Shift && this.isSelectByPoints) ? EventHandled.Yes : EventHandled.No;
  }

  public filterHit(hit: HitDetail, _out?: LocateResponse): LocateFilterStatus {
    if (!this.wantPickableDecorations() && !hit.isElementHit)
      return LocateFilterStatus.Reject;

    const mode = this.getSelectionMode();
    if (SelectionMode.Replace === mode)
      return LocateFilterStatus.Accept;

    const isSelected = this.iModel.selectionSet.has(hit.sourceId);
    return ((SelectionMode.Add === mode ? !isSelected : isSelected) ? LocateFilterStatus.Accept : LocateFilterStatus.Reject);
  }

  public onRestartTool(): void { this.exitTool(); }

  public onCleanup(): void {
    if (this.wantEditManipulators())
      IModelApp.toolAdmin.manipulatorToolEvent.raiseEvent(this, ManipulatorToolEvent.Stop);
  }

  public onPostInstall(): void {
    super.onPostInstall();
    if (!this.targetView)
      return;
    if (this.wantEditManipulators())
      IModelApp.toolAdmin.manipulatorToolEvent.raiseEvent(this, ManipulatorToolEvent.Start);
    this.initSelectTool();
  }

  public static startTool(): boolean { return new SelectionTool().run(); }
}
