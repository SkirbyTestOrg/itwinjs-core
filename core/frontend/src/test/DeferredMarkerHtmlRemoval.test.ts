/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { ScreenViewport } from "../Viewport";
import { Decorator } from "../ViewManager";
import { DecorateContext } from "../ViewContext";
import { IModelApp } from "../IModelApp";
import { openBlankViewport } from "./openBlankViewport";
import { Marker } from "../Marker";

describe("ScreenViewport", () => {
  beforeEach(async () => {
    await IModelApp.startup();
  });
  afterEach(async () => {
    if (IModelApp.initialized)
      await IModelApp.shutdown();
  });

  function makeMarker(vp: ScreenViewport) {
    const marker = new Marker(vp.viewToWorld({ x: 0, y: 0, z: 0 }), {
      x: 10,
      y: 10,
    });
    marker.htmlElement = document.createElement("div");
    return marker;
  }

  class AddMarkersAlwaysDecorator implements Decorator {
    public markers: Marker[];
    public constructor(vp: ScreenViewport) {
      this.markers = new Array(3).fill(undefined).map(() => makeMarker(vp));
    }
    public decorate(ctx: DecorateContext) {
      this.markers.forEach((m) => {
        m.addDecoration(ctx);
      });
    }
  }

  class AddMarkersOnceDecorator implements Decorator {
    public markers: Marker[];
    private _didOnce = false;
    public constructor(vp: ScreenViewport) {
      this.markers = new Array(3).fill(undefined).map(() => makeMarker(vp));
    }
    public decorate(ctx: DecorateContext) {
      if (!this._didOnce) {
        this.markers.forEach((m) => {
          m.addDecoration(ctx);
        });
        this._didOnce = true;
      }
    }
  }

  it("should not delete markers that are readded by registered decorators", () => {
    const vp = openBlankViewport();
    const decorator = new AddMarkersAlwaysDecorator(vp);
    IModelApp.viewManager.addDecorator(decorator);
    IModelApp.viewManager.addViewport(vp);
    vp.setAllValid();
    vp.invalidateDecorations();

    vp.renderFrame();
    for (const marker of decorator.markers) {
      // eslint-disable-next-line deprecation/deprecation
      expect(vp.decorationDiv.contains(marker.htmlElement!)).to.be.true;
    }

    vp.invalidateDecorations();

    vp.renderFrame();
    for (const marker of decorator.markers) {
      // eslint-disable-next-line deprecation/deprecation
      expect(vp.decorationDiv.contains(marker.htmlElement!)).to.be.true;
    }

    IModelApp.viewManager.dropDecorator(decorator);
  }).timeout(20000);

  it("should delete markers that aren't readded by registered decorators", () => {
    const vp = openBlankViewport();
    const decorator = new AddMarkersOnceDecorator(vp);
    IModelApp.viewManager.addDecorator(decorator);
    IModelApp.viewManager.addViewport(vp);
    vp.setAllValid();
    vp.invalidateDecorations();

    vp.renderFrame();
    for (const marker of decorator.markers) {
      // eslint-disable-next-line deprecation/deprecation
      expect(vp.decorationDiv.contains(marker.htmlElement!)).to.be.true;
    }

    vp.invalidateDecorations();

    vp.renderFrame();
    for (const marker of decorator.markers) {
      // eslint-disable-next-line deprecation/deprecation
      expect(vp.decorationDiv.contains(marker.htmlElement!)).to.be.false;
    }

    IModelApp.viewManager.dropDecorator(decorator);
  });
});
