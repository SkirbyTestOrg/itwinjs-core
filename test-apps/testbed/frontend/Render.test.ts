/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as path from "path";
import { WebGLTestContext } from "./WebGLTestContext";
import { testViewports, comparePixelData, Color } from "./TestViewport";
import { CONSTANTS } from "../common/Testbed";
import { RenderMode, ColorDef, RgbColor } from "@bentley/imodeljs-common";
import { Pixel } from "@bentley/imodeljs-frontend/lib/rendering";
import {
  IModelConnection,
  SpatialViewState,
  ViewRect,
  FeatureSymbology,
} from "@bentley/imodeljs-frontend";

// Mirukuru contains a single view, looking at a single design model containing a single white rectangle (element ID 41 (0x29), subcategory ID = 24 (0x18)).
// (It also is supposed to contain a reality model but the URL is presumably wrong).
// The initial view is in top orientation, centered on the top of the rectangle, but not fitted to its extents (empty space on all sides of rectangle).
// Background color is black; ACS triad on; render mode smooth with lighting enabled and visible edges enabled.
describe("Render mirukuru", () => {
  let imodel: IModelConnection;

  before(async () => {
    const imodelLocation = path.join(CONSTANTS.IMODELJS_CORE_DIRNAME, "core/backend/lib/test/assets/mirukuru.ibim");
    imodel = await IModelConnection.openStandalone(imodelLocation);
    WebGLTestContext.startup();
  });

  after(async () => {
    if (imodel) await imodel.closeStandalone();
    WebGLTestContext.shutdown();
  });

  it("should have expected view definition", async () => {
    const viewState = await imodel.views.load("0x24");
    expect(viewState).instanceof(SpatialViewState);
  });

  it("should render empty initial view", async () => {
    const rect = new ViewRect(0, 0, 100, 100);
    await testViewports("0x24", imodel, rect.width, rect.height, async (vp) => {
      await vp.drawFrame();

      // Should have all black background pixels
      let colors = vp.readUniqueColors();
      expect(colors.length).to.equal(1);
      expect(colors.contains(Color.fromRgba(0, 0, 0, 0xff))).to.be.true;

      // Change background color - expect pixel colors to match
      vp.view.displayStyle.backgroundColor = ColorDef.green;
      vp.invalidateRenderPlan();
      await vp.drawFrame();
      colors = vp.readUniqueColors();
      expect(colors.length).to.equal(1);
      expect(colors.contains(Color.fromRgba(0, 0x80, 0, 0xff))).to.be.true;

      // Should have no features, depth, or geometry - only background pixels
      const pixels = vp.readUniquePixelData();
      expect(pixels.length).to.equal(1);

      // Background pixels have distanceFraction = 0 indicating far plane.
      const backgroundPixel = new Pixel.Data(undefined, 0, Pixel.GeometryType.None, Pixel.Planarity.None);
      expect(comparePixelData(backgroundPixel, pixels.array[0])).to.equal(0);

      // Can read a single pixel
      const pixel = vp.readPixel(rect.width / 2, rect.height / 2);
      expect(comparePixelData(backgroundPixel, pixel)).to.equal(0);

      // Out-of-bounds pixels are in "unknown" state
      const unknownPixel = new Pixel.Data();
      const coords = [ [ -1, -1 ], [0, -1], [rect.width, 0], [rect.width - 1, rect.height * 2] ];
      for (const coord of coords) {
        const oob = vp.readPixel(coord[0], coord[1]);
        expect(comparePixelData(unknownPixel, oob)).to.equal(0);
      }
    });
  });

  it("should render the model", async () => {
    const rect = new ViewRect(0, 0, 100, 100);
    await testViewports("0x24", imodel, rect.width, rect.height, async (vp) => {
      await vp.waitForAllTilesToRender();
      expect(vp.numRequestedTiles).to.equal(0);
      expect(vp.numSelectedTiles).to.equal(1);

      // White rectangle is centered in view with black background surrounding. Lighting is on so rectangle will not be pure white.
      let colors = vp.readUniqueColors();
      const bgColor = Color.fromRgba(0, 0, 0, 0xff);
      expect(colors.length).least(2);
      expect(colors.contains(bgColor)).to.be.true; // black background

      const expectWhitish = (c: Color) => {
        expect(c.r).least(0x7f);
        expect(c.g).least(0x7f);
        expect(c.b).least(0x7f);
        expect(c.a).to.equal(0xff);
      };

      for (const c of colors.array) {
        if (0 !== c.compare(bgColor))
          expectWhitish(c);
      }

      let color = vp.readColor(rect.left, rect.top);
      expect(color.compare(bgColor)).to.equal(0);
      color = vp.readColor(rect.right - 1, rect.top);
      expect(color.compare(bgColor)).to.equal(0);
      color = vp.readColor(rect.right - 1, rect.bottom - 1);
      expect(color.compare(bgColor)).to.equal(0);
      color = vp.readColor(rect.left, rect.bottom - 1);
      expect(color.compare(bgColor)).to.equal(0);

      color = vp.readColor(rect.width / 2, rect.height / 2);
      expectWhitish(color);

      // Confirm we drew the rectangular element as a planar surface and its edges.
      const elemId = "0x29";
      const subcatId = "0x18";
      let pixels = vp.readUniquePixelData();
      expect(pixels.length).to.equal(3);
      expect(pixels.containsFeature(elemId, subcatId));
      expect(pixels.containsGeometry(Pixel.GeometryType.Surface, Pixel.Planarity.Planar));
      expect(pixels.containsGeometry(Pixel.GeometryType.Edge, Pixel.Planarity.Planar));

      // With lighting off, pixels should be either pure black (background) or pure white (rectangle)
      // NB: Shouldn't really modify view flags in place but meh.
      const vf = vp.view.viewFlags;
      vf.sourceLights = vf.cameraLights = vf.solarLight = false;
      vp.invalidateRenderPlan();
      await vp.drawFrame();

      const white = Color.from(0xffffffff);
      colors = vp.readUniqueColors();
      expect(colors.length).to.equal(2);
      expect(colors.contains(bgColor)).to.be.true;
      expect(colors.contains(white)).to.be.true;

      // In wireframe, same colors, but center pixel will be background color - only edges draw.
      vf.renderMode = RenderMode.Wireframe;
      vp.invalidateRenderPlan();
      await vp.drawFrame();

      colors = vp.readUniqueColors();
      expect(colors.length).to.equal(2);
      expect(colors.contains(bgColor)).to.be.true;
      expect(colors.contains(white)).to.be.true;

      color = vp.readColor(rect.width / 2, rect.height / 2);
      expect(color.compare(bgColor)).to.equal(0);

      pixels = vp.readUniquePixelData();
      expect(pixels.length).to.equal(2);
      expect(pixels.containsFeature(elemId, subcatId));
      expect(pixels.containsGeometry(Pixel.GeometryType.Edge, Pixel.Planarity.Planar));
    });
  });

  it("should override symbology", async () => {
    const rect = new ViewRect(0, 0, 200, 150);
    await testViewports("0x24", imodel, rect.width, rect.height, async (vp) => {
      const elemId = "0x29";
      const subcatId = "0x18";
      const vf = vp.view.viewFlags;
      vf.visibleEdges = vf.hiddenEdges = vf.sourceLights = vf.cameraLights = vf.solarLight = false;

      // Specify element is never drawn.
      vp.addFeatureOverrides = (ovrs, _) => ovrs.neverDrawn.add(elemId);
      await vp.waitForAllTilesToRender();

      const bgColor = Color.fromRgba(0, 0, 0, 0xff);
      let colors = vp.readUniqueColors();
      expect(colors.length).to.equal(1);
      expect(colors.contains(bgColor)).to.be.true;

      let pixels = vp.readUniquePixelData();
      expect(pixels.length).to.equal(1);

      // Specify element is drawn blue
      vp.addFeatureOverrides = (ovrs, _) => ovrs.overrideElement(elemId, FeatureSymbology.Appearance.fromRgb(ColorDef.blue));
      await vp.drawFrame();
      colors = vp.readUniqueColors();
      expect(colors.length).to.equal(2);
      expect(colors.contains(Color.fromRgba(0, 0, 0xff, 0xff))).to.be.true;

      // Specify default overrides
      vp.addFeatureOverrides = (ovrs, _) => ovrs.setDefaultOverrides(FeatureSymbology.Appearance.fromRgb(ColorDef.red));
      await vp.drawFrame();
      colors = vp.readUniqueColors();
      expect(colors.length).to.equal(2);
      expect(colors.contains(Color.fromRgba(0xff, 0, 0, 0xff))).to.be.true;

      // Specify default overrides, but also override element color
      vp.addFeatureOverrides = (ovrs, _) => {
        ovrs.setDefaultOverrides(FeatureSymbology.Appearance.fromRgb(ColorDef.green));
        ovrs.overrideElement(elemId, FeatureSymbology.Appearance.fromRgb(new ColorDef(0x7f0000))); // blue = 0x7f...
      };
      await vp.drawFrame();
      colors = vp.readUniqueColors();
      expect(colors.length).to.equal(2);
      expect(colors.contains(Color.fromRgba(0, 0, 0x7f, 0xff))).to.be.true;
      expect(colors.contains(Color.fromRgba(0xff, 0, 0, 0xff))).to.be.false;

      // Override by subcategory
      vp.addFeatureOverrides = (ovrs, _) => ovrs.overrideSubCategory(subcatId, FeatureSymbology.Appearance.fromRgb(ColorDef.red));
      await vp.drawFrame();
      colors = vp.readUniqueColors();
      expect(colors.contains(Color.fromRgba(0xff, 0, 0, 0xff))).to.be.true;

      // Override color for element and subcategory - element wins
      vp.addFeatureOverrides = (ovrs, _) => {
        ovrs.overrideSubCategory(subcatId, FeatureSymbology.Appearance.fromRgb(ColorDef.blue));
        ovrs.overrideElement(elemId, FeatureSymbology.Appearance.fromRgb(ColorDef.red));
      };
      await vp.drawFrame();
      colors = vp.readUniqueColors();
      expect(colors.contains(Color.fromRgba(0xff, 0, 0, 0xff))).to.be.true;

      // Override to be fully transparent - element should not draw at all
      vp.addFeatureOverrides = (ovrs, _) => ovrs.overrideElement(elemId, FeatureSymbology.Appearance.fromTransparency(1.0));
      await vp.drawFrame();
      colors = vp.readUniqueColors();
      expect(colors.length).to.equal(1);
      expect(colors.contains(bgColor)).to.be.true;

      pixels = vp.readUniquePixelData();
      expect(pixels.length).to.equal(1);
      expect(pixels.containsElement(elemId)).to.be.false;

      // Set bg color to red, elem color to 50% transparent blue => expect blending
      vp.view.displayStyle.backgroundColor = ColorDef.red;
      vp.invalidateRenderPlan();
      vp.addFeatureOverrides = (ovrs, _) => ovrs.overrideElement(elemId, FeatureSymbology.Appearance.fromJSON({ rgb: new RgbColor(0, 0, 1), transparency: 0.5 }));
      await vp.drawFrame();
      colors = vp.readUniqueColors();
      expect(colors.length).to.equal(2);
      const red = Color.fromRgba(0xff, 0, 0, 0xff);
      expect(colors.contains(red)).to.be.true;
      for (const c of colors.array) {
        if (0 !== c.compare(red)) {
          expect(c.r).least(0x70);
          expect(c.r).most(0x90);
          expect(c.g).to.equal(0);
          /* ###TODO determine why blue is zero? No repro in display-test-app...
        expect(c.b).least(0x70);
        expect(c.b).most(0x90);
           */
          expect(c.a).to.equal(0xff); // The alpha is intentionally not preserved by Viewport.readImage()
        }
      }
    });
  });
});
