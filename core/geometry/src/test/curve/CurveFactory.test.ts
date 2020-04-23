/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Point3d } from "../../geometry3d/Point3dVector3d";
import { Checker } from "../Checker";
import { expect } from "chai";
import { LineString3d } from "../../curve/LineString3d";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { CurveFactory } from "../../curve/CurveFactory";
import { AngleSweep } from "../../geometry3d/AngleSweep";
import { Angle } from "../../geometry3d/Angle";
import { Segment1d } from "../../geometry3d/Segment1d";
import { Arc3d } from "../../curve/Arc3d";
import { LineSegment3d } from "../../curve/LineSegment3d";
import * as fs from "fs";
import { IModelJson } from "../../serialization/IModelJsonSchema";
/* tslint:disable:no-console */

describe("CurveFactory", () => {
  it("CreateFilletsOnLineString", () => {
    const allGeometry: GeometryQuery[] = [];
    const ck = new Checker();

    const points0 = [
      Point3d.create(1, 1),
      Point3d.create(5, 1),
      Point3d.create(3, 7),
    ];

    const points1 = [
      Point3d.create(1, 1),
      Point3d.create(5, 1),
      Point3d.create(8, 3),
      Point3d.create(13, 5),
      Point3d.create(12, 8),
      Point3d.create(5, 8)];

    const points2 = [
      Point3d.create(1, 1),
      Point3d.create(5, 1),
      Point3d.create(14, 3),
      Point3d.create(14, 11),
      Point3d.create(5, 11),
      Point3d.create(-1, 1),
      Point3d.create(-1, 8),
      Point3d.create(4, 12),
      Point3d.create(8, 14)];
    let x0 = 0.0;
    const xStep = 30;
    const yStep = 20;
    for (const points of [points0, points1, points2]) {
      for (const allowBackup of [true, false]) {
        let y0 = 0.0;
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, LineString3d.create(points), x0, y0);
        for (const radius of [0.5, 1.0, 2.0, 4.0, 6.0]) {
          y0 += yStep;
          const path = CurveFactory.createFilletsInLineString(points, radius, allowBackup);
          GeometryCoreTestIO.captureCloneGeometry(allGeometry, path, x0, y0);
        }
        x0 += xStep;
      }
      x0 += xStep;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "CurveFactory", "FilletsOnLineString");

    expect(ck.getNumErrors()).equals(0);
  });
  it("FilletArcDegenerate", () => {
    const ck = new Checker();

    const point0 = Point3d.create(1, 2, 3);
    const point2 = Point3d.create(4, 2, -1);
    const radius = 2.0;
    for (const lambda of [0.0, -0.52, 0.45, 1.2, 1.0]) {
      const point1 = point0.interpolate(lambda, point2);
      const data = Arc3d.createFilletArc(point0, point1, point2, radius);
      ck.testDefined(data, "Degenerated arc data");
      ck.testUndefined(data.arc, "Degenerate arc -- expect no arc in data");
    }
    expect(ck.getNumErrors()).equals(0);
  });
  it("appendToArcInPlace", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    let x0 = 0.0;
    const xStep = 3.0;
    const yStep = 3.0;
    for (const arcA0 of [
      Arc3d.createXYZXYZXYZ(0, 0, 0, 2, 0, 0, 0, 2, 0, AngleSweep.createStartEndDegrees(0, 90)),
      Arc3d.createCircularStartMiddleEnd(Point3d.create(1, 0, 0), Point3d.create(1.5, 1, 0), Point3d.create(1, 2, 0)) as Arc3d,
      Arc3d.createXYZXYZXYZ(0, 0, 0, 2, 0, 0, 0.5, 1, 0, AngleSweep.createStartEndDegrees(-10, 50))]) {
      for (const reverse of [false, true]) {
        const arcA = arcA0.clone();
        if (reverse)
          arcA.sweep.reverseInPlace();
        for (const segment of [Segment1d.create(1, 1.5), Segment1d.create(1.1, 1.5), Segment1d.create(1, 0.5)]) {
          let y0 = 0.0;
          for (const rotationAngleB of [0.0, 25.0]) {
            const arcA1 = arcA.clone();
            const arcA2 = arcA.clone();
            const arcB1 = arcA.cloneInRotatedBasis(Angle.createDegrees(rotationAngleB));
            arcB1.sweep = AngleSweep.createStartEnd(arcB1.sweep.fractionToAngle(segment.x0), arcB1.sweep.fractionToAngle(segment.x1));
            GeometryCoreTestIO.captureCloneGeometry(allGeometry, [arcA1, arcB1], x0, y0);
            markArcData(allGeometry, arcA1, 0.9, 0.05, x0, y0);
            markArcData(allGeometry, arcB1, 0.9, 0.05, x0, y0);
            const append1 = CurveFactory.appendToArcInPlace(arcA1, arcB1, true);
            if (append1) {
              markArcData(allGeometry, arcA1, 1.1, 0.05, x0, y0 + yStep);
              GeometryCoreTestIO.captureCloneGeometry(allGeometry, arcA1, x0, y0 + yStep);
            }
            const append2 = CurveFactory.appendToArcInPlace(arcA2, arcB1, false);
            if (append2) {
              markArcData(allGeometry, arcA2, 1.1, 0.05, x0, y0 + 2 * yStep);
              GeometryCoreTestIO.captureCloneGeometry(allGeometry, arcA1, x0, y0 + 2 * yStep);
            }
            y0 += 4 * yStep;
          }
          x0 += xStep;
        }
        x0 += 2.0 * xStep;
      }
      x0 += 3.0 * xStep;
    }

    GeometryCoreTestIO.saveGeometry(allGeometry, "CurveFactory", "appendToArcInPlace");
    expect(ck.getNumErrors()).equals(0);
  });
  it("FilletsInLinestring", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    let x0 = 0.0;
    const points = [Point3d.create(0, 0, 0), Point3d.create(2, 0, 0), Point3d.create(2, 5, 1), Point3d.create(4, 5, 1), Point3d.create(6, 2, 1), Point3d.create(6, 5, 1)];
    const lineString0 = LineString3d.create(points);
    points.reverse();
    const lineString1 = LineString3d.create(points);
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, lineString0, x0, 0);
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, lineString1, x0, 28);
    x0 += 20.0;
    for (const filletRadius of [0.2, 0.4, 0.6, 0.8, 1.2, 2.0, 4.0, 6.0]) {
      let y0 = 0.0;
      for (const lineString of [lineString0, lineString1]) {
        const chain0 = CurveFactory.createFilletsInLineString(lineString, filletRadius, false)!;
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, chain0, x0, y0);
        y0 += 8.0;
        const chain1 = CurveFactory.createFilletsInLineString(lineString, filletRadius, true)!;
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, chain1, x0, y0);
        y0 += 20.0;
      }
      x0 += 20.0;
    }

    const radii = [0, 2, 1, 0.8, 0.6, 0.4];
    const chain2 = CurveFactory.createFilletsInLineString(lineString0, radii, true)!;
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, chain2, x0, 0.0);
    GeometryCoreTestIO.saveGeometry(allGeometry, "CurveFactory", "FilletsInLineString");
    expect(ck.getNumErrors()).equals(0);
  });
});
/**
 *
 * @param allGeometry
 * @param arc
 * @param radialFraction draw arc at this fraction of radius
 * @param tickFraction draw start tic delta this radial fraction
 * @param x0
 * @param y0
 */
function markArcData(allGeometry: GeometryQuery[], arc: Arc3d, radialFraction: number, tickFraction: number, x0: number, y0: number) {
  const arc1 = arc.clone();
  const center = arc.center;
  const start = arc.startPoint();
  const point0 = arc.angleToPointAndDerivative(Angle.createDegrees(0));
  const point90 = arc.angleToPointAndDerivative(Angle.createDegrees(90));
  arc1.matrixRef.scaleColumnsInPlace(radialFraction, radialFraction, 1.0);
  GeometryCoreTestIO.captureGeometry(allGeometry, [arc1,
    LineSegment3d.create(center.interpolate(radialFraction, start), center.interpolate(radialFraction + tickFraction, start)),
    LineString3d.create(point0.origin, center, point90.origin)], x0, y0);
}
const ppePathInputDirector = "./src/test/testInputs/pipeConnections/";
describe("PipeConnections", () => {
  it("ChainCollector", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    let refPoint: Point3d | undefined;
    let x0 = 0;
    let y0 = 0;
    let z0 = 0;
    const dx = 400.0;
    const dy = 600.0;
    const pipeRadius = 0.20;
    const bendRadius = 0.50;
    for (const filename of ["pipeLinesApril2020"]) {
      const stringData = fs.readFileSync(ppePathInputDirector + filename + ".imjs", "utf8");
      if (stringData) {
        const jsonData = JSON.parse(stringData);
        const fragments = IModelJson.Reader.parse(jsonData);
        if (Array.isArray(fragments)) {
          for (const g of fragments) {
            if (g instanceof LineString3d) {
              if (refPoint === undefined) {
                refPoint = g.packedPoints.getPoint3dAtCheckedPointIndex(0);
                if (refPoint) {
                  x0 = -refPoint.x;
                  y0 = -refPoint.y;
                  z0 = -refPoint.z;
                }
              }
              const chain0 = CurveFactory.createFilletsInLineString(g, bendRadius, false)!;
              const pipe0 = CurveFactory.createPipeSegments(chain0, pipeRadius);
              GeometryCoreTestIO.captureCloneGeometry(allGeometry, chain0, x0 + dx, y0 + dy, z0);
              GeometryCoreTestIO.captureCloneGeometry(allGeometry, pipe0, x0, y0, z0);
            }
          }
        }
      }
      GeometryCoreTestIO.saveGeometry(allGeometry, "PipeConnections", filename);
    }
    expect(ck.getNumErrors()).equals(0);
  });
});
