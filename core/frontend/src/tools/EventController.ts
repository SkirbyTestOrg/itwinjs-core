/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Tools */

import { ScreenViewport } from "../Viewport";
import { IModelApp } from "../IModelApp";

/**
 * An EventController maps user input events from the canvas of a Viewport to the ToolAdmin so that tools can process them.
 * Viewports are assigned an EventController when they are registered with ViewManager.addViewport and they are destroyed with ViewManager.dropViewport.
 * @public
 */
export class EventController {
  private readonly _removals: VoidFunction[] = [];

  constructor(public vp: ScreenViewport) {
    const element = vp.parentDiv;
    if (element === undefined)
      return;

    // Note: we are using mouseover instead of mouseenter, and mouseout instead of mouseleave.
    // Put events  on the parentDiv to allows us to stopPropagation of events to the view canvas when they are meant for a sibling of view canvas (markup canvas, for example).
    this.addDomListeners(["mousedown", "mouseup", "mousemove", "mouseover", "mouseout", "wheel", "touchstart", "touchend", "touchcancel", "touchmove"], element);

    element.oncontextmenu = element.onselectstart = () => false;
  }

  public destroy() {
    this._removals.forEach((remove) => remove());
    this._removals.length = 0;
  }

  /**
   * Call element.addEventListener for each type of DOM event supplied. Creates a listener that will forward the HTML event to ToolAdmin.addEvent.
   * Records the listener in the [[removals]] member so they are removed when this EventController is destroyed.
   * @param domType An array of DOM event types to pass to element.addEventListener
   * @param element The HTML element to which the listeners are added
   */
  private addDomListeners(domType: string[], element: HTMLElement) {
    const vp = this.vp;
    const { toolAdmin } = IModelApp;
    const listener = (ev: Event) => { ev.preventDefault(); toolAdmin.addEvent(ev, vp); };
    domType.forEach((type) => {
      element.addEventListener(type, listener, false);
      this._removals.push(() => { element.removeEventListener(type, listener, false); });
    });
  }
}
