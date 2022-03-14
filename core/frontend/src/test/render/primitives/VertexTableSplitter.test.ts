/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import {
  ColorDef, ColorIndex, Feature, FeatureIndex, FeatureTable, LinePixels, PackedFeatureTable, PolylineData, PolylineFlags, QParams3d, QPoint3d, QPoint3dList,
} from "@itwin/core-common";
import {
  IModelApp,
} from "../../../core-frontend";
import {
  PointStringParams, PolylineArgs, VertexIndices, VertexTable, splitPointStringParams,
} from "../../../render-primitives";

interface Point {
  x: number; // quantized x coordinate - y will be x+1 and z will be x+5.
  color: number; // color index
  feature: number; // feature index
}

function makePointStringParams(points: Point[], colors: ColorDef | ColorDef[]): PointStringParams {
  const colorIndex = new ColorIndex();
  if (colors instanceof ColorDef) {
    colorIndex.initUniform(colors);
  } else {
    const tbgr = new Uint32Array(colors.map((x) => x.tbgr));
    colorIndex.initNonUniform(tbgr, points.map((x) => x.color), false);
  }

  const featureIds = new Set<number>(points.map((x) => x.feature));
  const featureIndex = new FeatureIndex();
  expect(featureIds.size).least(1);
  switch (featureIds.size) {
    case 1:
      featureIndex.featureID = points[0].feature;
      break;
    default:
      featureIndex.featureIDs = new Uint32Array(points.map((x) => x.feature));
      break;
  }

  const qpoints = new QPoint3dList();
  for (const point of points)
    qpoints.push(QPoint3d.fromScalars(point.x, point.x + 1, point.x + 5));

  const args: PolylineArgs = {
    colors: colorIndex,
    features: featureIndex,
    width: 1,
    linePixels: LinePixels.Solid,
    flags: new PolylineFlags(false, true, true),
    points: qpoints,
    polylines: [ new PolylineData([...new Array<number>(points.length).keys()], points.length) ],
  };

  const params = PointStringParams.create(args)!;
  expect(params).not.to.be.undefined;
  return params;
}

function setMaxTextureSize(max: number): void {
  Object.defineProperty(IModelApp.renderSystem, "maxTextureSize", {
    value: max,
    writable: false,
  });
}

function expectPointStrings(params: PointStringParams, expectedColors: ColorDef | ColorDef[], expectedPts: Point[]): void {
  const vertexTable = params.vertices;
  expect(vertexTable.numRgbaPerVertex).to.equal(3);
  expect(vertexTable.numVertices).to.equal(expectedPts.length);
  if (expectedColors instanceof ColorDef) {
    expect(vertexTable.uniformColor).not.to.be.undefined;
    expect(vertexTable.uniformColor!.equals(expectedColors)).to.be.true;
  } else {
    expect(vertexTable.uniformColor).to.be.undefined;
  }

  let curIndex = 0;
  for (const index of params.indices)
    expect(index).to.equal(curIndex++);

  const numColors = expectedColors instanceof ColorDef ? 0 : expectedColors.length;
  const data = new Uint32Array(vertexTable.data.buffer, vertexTable.data.byteOffset, vertexTable.numVertices * vertexTable.numRgbaPerVertex + numColors);
  if (Array.isArray(expectedColors)) {
    for (let i = 0; i < expectedColors.length; i++) {
      const color = ColorDef.fromJSON(data[vertexTable.numVertices + i]);
      expect(color.equals(expectedColors[i])).to.be.true;
    }
  }

  for (let i = 0; i < vertexTable.numVertices; i++) {
    const x = data[0] & 0xffff;
    const y = (data[0] & 0xffff0000) >>> 16;
    const z = data[1] & 0xffff;
    const colorIndex = (data[1] & 0xffff0000) >>> 16;
    const featureIndex = data[2] & 0x00ffffff;

    const pt = expectedPts[i];
    expect(x).to.equal(pt.x);
    expect(y).to.equal(pt.x + 1);
    expect(z).to.equal(pt.x + 5);
    expect(colorIndex).to.equal(pt.color);
    expect(featureIndex).to.equal(pt.feature);
  }
}

describe.only("VertexTableSplitter", () => {
  before(() => IModelApp.startup());
  after(() => IModelApp.shutdown());
  beforeEach(() => setMaxTextureSize(2048));

  it("splits point string params based on node Id", () => {
    const featureTable = new FeatureTable(100);
    featureTable.insert(new Feature("0x1"));
    featureTable.insert(new Feature("0x2"));
    featureTable.insert(new Feature("0x10000000002"));

    const points: Point[] = [
      { x: 1, color: 0, feature: 0 },
      { x: 0, color: 0, feature: 1 },
      { x: 5, color: 0, feature: 2 },
      { x: 4, color: 0, feature: 1 },
      { x: 2, color: 0, feature: 2 },
    ];

    const params = makePointStringParams(points, ColorDef.red);
    const split = splitPointStringParams(params, PackedFeatureTable.pack(featureTable), IModelApp.renderSystem.maxTextureSize, (id) => id.upper > 0 ? 1 : 0);
    expect(split.size).to.equal(2);

    expectPointStrings(split.get(0)!, ColorDef.red, [
      { x: 1, color: 0, feature: 0 },
      { x: 0, color: 0, feature: 1 },
      { x: 4, color: 0, feature: 1 },
    ]);

    expectPointStrings(split.get(1)!, ColorDef.red, [
      { x: 5, color: 0, feature: 2 },
      { x: 2, color: 0, feature: 2 },
    ]);
  });

  it("produces uniform color for nodes containing only a single color and sets color indices to zero", () => {
  });

  it("produces color tables containing only colors used by each node and remaps color indices", () => {
  });

  it("produces rectangular vertex tables", () => {
  });
});
