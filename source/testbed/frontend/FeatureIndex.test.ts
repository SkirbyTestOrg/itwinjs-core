/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import { ColorIndex } from "@bentley/imodeljs-frontend/lib/render/webgl/FeatureIndex";
import { ColorDef } from "@bentley/imodeljs-common/lib/ColorDef";

describe("ColorIndex", () => {
  it("should create, store and retrieve from ColorIndex", () => {
    const ci: ColorIndex = new ColorIndex();

    assert.isTrue(ci.isValid(), "newly created ColorIndex should be valid");
    assert.isTrue(ci.isUniform(), "newly created ColorIndex should be Uniform");
    assert.isTrue(1 === ci.numColors, "newly created ColorIndex should have numColors of 1");
    assert.isTrue(0x00ffffff === ci.uniform, "newly created ColorIndex should have uniform color of 0x00ffffff");
    assert.isTrue(undefined === ci.nonUniform, "newly created ColorIndex should have undefined nonUniform");
    assert.isFalse(ci.hasAlpha(), "newly created ColorIndex should not have alpha");

    ci.setUniform(0xff000000);
    assert.isTrue(ci.isValid(), "Uniform ColorIndex set to 0xff000000 should be valid");
    assert.isTrue(ci.isUniform(), "Uniform ColorIndex set to 0xff000000 should be Uniform");
    assert.isTrue(1 === ci.numColors, "Uniform ColorIndex set to 0xff000000 should have numColors of 1");
    assert.isTrue(0xff000000 === ci.uniform, "Uniform ColorIndex set to 0xff000000 should have uniform color of 0xff000000");
    assert.isTrue(undefined === ci.nonUniform, "Uniform ColorIndex set to 0xff000000 should have undefined nonUniform");
    assert.isTrue(ci.hasAlpha(), "Uniform ColorIndex set to 0xff000000 should have alpha");

    ci.setUniform(ColorDef.from(255, 127, 63, 31));
    assert.isTrue(ci.isValid(), "Uniform ColorIndex set to ColorDef.from(255, 127, 63, 31) should be valid");
    assert.isTrue(ci.isUniform(), "Uniform ColorIndex set to ColorDef.from(255, 127, 63, 31) should be Uniform");
    assert.isTrue(1 === ci.numColors, "Uniform ColorIndex set to ColorDef.from(255, 127, 63, 31) should have numColors of 1");
    assert.isTrue(0x1f3f7fff === ci.uniform, "Uniform ColorIndex set to ColorDef.from(255, 127, 63, 31) should have uniform color of 0x1f3f7fff");
    assert.isTrue(undefined === ci.nonUniform, "Uniform ColorIndex set to ColorDef.from(255, 127, 63, 31) should have undefined nonUniform");
    assert.isTrue(ci.hasAlpha(), "Uniform ColorIndex set to ColorDef.from(255, 127, 63, 31) should have alpha");

    ci.reset();
    assert.isTrue(ci.isValid(), "Uniform ColorIndex which has been reset should be valid");
    assert.isTrue(ci.isUniform(), "Uniform ColorIndex which has been reset should be Uniform");
    assert.isTrue(1 === ci.numColors, "Uniform ColorIndex which has been reset should have numColors of 1");
    assert.isTrue(0x00ffffff === ci.uniform, "Uniform ColorIndex which has been reset should have uniform color of 0x00ffffff");
    assert.isTrue(undefined === ci.nonUniform, "Uniform ColorIndex which has been reset should have undefined nonUniform");
    assert.isFalse(ci.hasAlpha(), "Uniform ColorIndex which has been reset should not have alpha");

    const numColors: number = 10;
    const colors: Uint32Array = new Uint32Array(numColors);
    const indices: Uint16Array = new Uint16Array(numColors);
    for (let i = 0; i < numColors; ++i) {
      colors[i] = ColorDef.from(i, i * 2, i * 4, 63).tbgr;
      indices[i] = i;
    }
    ci.setNonUniform(numColors, colors, indices, true);
    assert.isTrue(ci.isValid(), "NonUniform ColorIndex should be valid");
    assert.isFalse(ci.isUniform(), "NonUniform ColorIndex should not be Uniform");
    assert.isTrue(numColors === ci.numColors, "NonUniform ColorIndex with " + numColors + "should have numColors of " + numColors + " but has " + ci.numColors);
    assert.isTrue(ci.hasAlpha(), "NonUniform ColorIndex which has alpha in its colors should return true from hasAlpha()");
    assert.isTrue(undefined !== ci.nonUniform, "NonUniform ColorIndex should not have an undefined nonUniform");
    if (undefined !== ci.nonUniform) {
      for (let i = 0; i < numColors; ++i) {
        assert.isTrue(ci.nonUniform.colors[i] === colors[i],
          "NonUniform ColorIndex has colors[" + i + "] of " + ci.nonUniform.colors[i].toString(16) + "but should be " + colors[i].toString(16));
        assert.isTrue(ci.nonUniform.indices[i] === indices[i],
          "NonUniform ColorIndex has indices[" + i + "] of " + ci.nonUniform.indices[i] + "but should be " + indices[i]);
        }
    }

    ci.reset();
    assert.isTrue(ci.isValid(), "NonUniform ColorIndex which has been reset should be valid");
    assert.isTrue(ci.isUniform(), "NonUniform ColorIndex which has been reset should be Uniform");
    assert.isTrue(1 === ci.numColors, "NonUniform ColorIndex which has been reset should have numColors of 1");
    assert.isTrue(0x00ffffff === ci.uniform, "NonUniform ColorIndex which has been reset should have uniform color of 0x00ffffff");
    assert.isTrue(undefined === ci.nonUniform, "NonUniform ColorIndex which has been reset should have undefined nonUniform");
    assert.isFalse(ci.hasAlpha(), "NonUniform ColorIndex which has been reset should not have alpha");
  });
});
