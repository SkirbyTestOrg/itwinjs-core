/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { Point3d } from "../geometry3d/Point3dVector3d";
import { Geometry } from "../Geometry";
import { AngleSweep } from "../geometry3d/AngleSweep";
import { Angle } from "../geometry3d/Angle";
import { Checker } from "./Checker";
import { expect } from "chai";
import { KnotVector } from "../bspline/KnotVector";
import { BSplineCurve3d } from "../bspline/BSplineCurve";
import { BezierCurveBase } from "../bspline/BezierCurveBase";
import { BezierCurve3d } from "../bspline/BezierCurve3d";
import { GeometryQuery } from "../curve/GeometryQuery";
import { GeometryCoreTestIO } from "./GeometryCoreTestIO";
import { LineString3d } from "../curve/LineString3d";
import { Transform } from "../geometry3d/Transform";
import { StrokeOptions } from "../curve/StrokeOptions";
import { BSplineCurve3dH } from "../bspline/BSplineCurve3dH";
import { Sample } from "../serialization/GeometrySamples";
import { CurvePrimitive } from "../curve/CurvePrimitive";
import { Path } from "../curve/Path";
import { prettyPrint } from "./testFunctions";
import { CurveLocationDetail } from "../curve/CurveLocationDetail";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/Plane3dByOriginAndUnitNormal";
import { Matrix3d } from "../geometry3d/Matrix3d";
import { LineSegment3d } from "../curve/LineSegment3d";

function translateAndPush(allGeometry: GeometryQuery[], g: GeometryQuery | undefined, dx: number, dy: number) {
  if (g) {
    g.tryTranslateInPlace(dx, dy, 0);
    allGeometry.push(g);
  }
}
function showPlane(allGeometry: GeometryQuery[], plane: Plane3dByOriginAndUnitNormal, a: number, dx: number, dy: number) {
  const origin = plane.getOriginRef();
  const normal = plane.getNormalRef();
  const frame = Transform.createOriginAndMatrix(origin,
    Matrix3d.createRigidViewAxesZTowardsEye(normal.x, normal.y, normal.z));
  const g = LineString3d.create(
    frame.multiplyXYZ(-0.5 * a, 0, 0),
    frame.multiplyXYZ(a, 0, 0),
    frame.multiplyXYZ(a, a, 0),
    frame.multiplyXYZ(0, a, 0),
    origin,
    frame.multiplyXYZ(0, 0, 2 * a));
  if (g) {
    g.tryTranslateInPlace(dx, dy, 0);
    allGeometry.push(g);
  }
}

function showPoint(allGeometry: GeometryQuery[], point: Point3d, a: number, dx: number, dy: number) {
  const g = LineString3d.create(
    point,
    Point3d.create(point.x - a, point.y, point.z),
    Point3d.create(point.x + a, point.y, point.z),
    Point3d.create(point.x, point.y + a, point.z),
    Point3d.create(point.x, point.y, point.z));
  if (g) {
    g.tryTranslateInPlace(dx, dy, 0);
    allGeometry.push(g);
  }
}

function ellipsePoints(a: number, b: number, sweep: AngleSweep, numStep: number): Point3d[] {
  const points = [];
  for (let f = 0.0; f <= 1.00001; f += 1.0 / numStep) {
    const radians = sweep.fractionToRadians(f);
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    points.push(Point3d.create(a * c, b * s, 0.0));
  }
  return points;
}
/** Check if the linestring edgelengths and angle meet stroke options demands
 * @param edgeLengthFactor factor to apply to edgeLength conditions
 * @param angleFactor factor to apply to angle conditions
 */
function checkStrokeProperties(ck: Checker, curve: CurvePrimitive, linestring: LineString3d, options: StrokeOptions,
  angleFactor: number = 1.1, edgeLengthFactor: number = 1.1): boolean {
  const numPoints = linestring.numPoints();
  let ok = true;
  if (ck.testLE(3, numPoints, "Expect 3 or more strokes")) {
    let maxRadians = 0;
    const vector0 = linestring.vectorBetween(0, 1)!;
    let vector1;
    let maxEdgeLength = vector0.magnitude();
    for (let i = 1; i + 1 < numPoints; i++) {
      vector1 = linestring.vectorBetween(i, i + 1)!;
      maxEdgeLength = Geometry.maxXY(maxEdgeLength, vector1.magnitude());
      maxRadians = Geometry.maxXY(maxRadians, vector0.angleTo(vector1).radians);
      vector0.setFromVector3d(vector1);
    }
    if (options.maxEdgeLength)
      if (!ck.testLE(maxRadians, edgeLengthFactor * options.maxEdgeLength, "strokeProperties edge length", curve))
        ok = false;
    if (options.angleTol)
      if (!ck.testLE(maxRadians, angleFactor * options.angleTol.radians, "stroke properties angle", curve))
        ok = false;
  }
  return ok;
}
/* tslint:disable:no-console */
describe("BsplineCurve", () => {

  it("HelloWorld", () => {
    const ck = new Checker();
    for (const rational of [false, true]) {
      for (const order of [2, 3, 4, 5]) {
        if (Checker.noisy.bsplineEvaluation) console.log("\n\n ************* order ", order);
        // const a = 1.0;
        const b = 2.0;
        const points = [];
        const degree = order - 1;
        const numPoles = 5;
        const knots = KnotVector.createUniformClamped(numPoles, degree, 0.0, 1.0);
        // x should exactly match the knot value (even for high order)
        for (let i = 0; i < numPoles; i++) {
          const x = knots.grevilleKnot(i);
          points.push(Point3d.create(x, b, 0));
        }
        let curve: BSplineCurve3d | BSplineCurve3dH;
        if (rational)
          curve = BSplineCurve3dH.createUniformKnots(points, order) as BSplineCurve3dH;
        else
          curve = BSplineCurve3d.createUniformKnots(points, order) as BSplineCurve3d;
        const arcLength = curve.curveLength();
        ck.testLE(arcLength, curve.quickLength() + Geometry.smallMetricDistance, "order", order);
        if (Checker.noisy.bsplineEvaluation) {
          console.log("BsplineCurve", curve);
          console.log({ numPoles: curve.numPoles, numSpan: curve.numSpan });
          console.log("length", arcLength);
        }
        for (let span = 0; span < curve.numSpan; span++) {
          const p0 = curve.evaluatePointInSpan(span, 0.0);
          const p1 = curve.evaluatePointInSpan(span, 0.5);
          const p2 = curve.evaluatePointInSpan(span, 1.0);

          for (const spanFraction of [0.2, 0.3, 0.9]) {
            const knot = curve.spanFractionToKnot(span, spanFraction);
            const spanPoint = curve.evaluatePointInSpan(span, spanFraction);
            const spanTangent = curve.evaluatePointAndTangentInSpan(span, spanFraction);
            const spanTangent2 = curve.knotToPointAnd2Derivatives(knot);
            ck.testPoint3d(spanPoint, spanTangent2.origin, "evaluate == 2 derivative origin");
            ck.testVector3d(spanTangent.direction, spanTangent2.vectorU, "evaluate == 2 derivative origin");
            ck.testPoint3d(spanPoint, spanTangent.origin, "point and tangent evaluate");
            const knotPoint = curve.knotToPoint(knot);
            ck.testCoordinate(knot, knotPoint.x, "x == knot");
            ck.testPoint3d(spanPoint, knotPoint, "spanPoint, knotPoint", order, span, spanFraction);

          }
          ck.testCoordinate(b, p1.y, "constant bspline y");
          if (Checker.noisy.bsplineEvaluation) console.log("span", span, p0, p1, p2);
          if (span + 1 < curve.numSpan) {
            const q2 = curve.evaluatePointInSpan(span + 1, 0.0);
            ck.testPoint3d(p2, q2, "span match");
          }
        }
      }
    }
    ck.checkpoint("End BsplineCurve.HelloWorld");
    expect(ck.getNumErrors()).equals(0);
  });

  it("strokes", () => {
    const ck = new Checker();
    const bcurves = Sample.createMixedBsplineCurves();
    const defaultOption = StrokeOptions.createForCurves();
    const angleOptions = StrokeOptions.createForCurves();
    angleOptions.angleTol = Angle.createDegrees(5.0);
    const edgeLengthOptions = StrokeOptions.createForCurves();
    edgeLengthOptions.maxEdgeLength = 0.5;
    const allOptions = [defaultOption, angleOptions, edgeLengthOptions];
    const allGeometry: GeometryQuery[] = [];
    let xShift = 0.0;
    const dxShift = 10.0;
    const dyShift = 10.0;
    for (const curve of bcurves) {
      translateAndPush(allGeometry, curve.clone(), xShift, 0.0);
      let yShift = dyShift;
      for (const options of allOptions) {
        const linestring = LineString3d.create();
        curve.emitStrokes(linestring, options);
        const angleFactor = curve.order <= 2 ? 1000 : 1.6;  // suppress angle test on linear case.  Be fluffy on others.
        translateAndPush(allGeometry, linestring, xShift, yShift);
        if (!checkStrokeProperties(ck, curve, linestring, options, angleFactor, 1.1)) {
          linestring.clear();
          curve.emitStrokes(linestring, options);
        }
        yShift += dyShift;
      }
      xShift += dxShift;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "BSplineCurve", "strokes");

    ck.checkpoint("End BsplineCurve.strokes");
    expect(ck.getNumErrors()).equals(0);
  });

  it("KnotVector", () => {
    const ck = new Checker();
    const numPoles = 10;
    const degree = 3;
    const a0 = 1;
    const a1 = 22;
    const knots = KnotVector.createUniformClamped(numPoles, degree, a0, a1);
    const basisValues = knots.createBasisArray();
    ck.testExactNumber(basisValues.length, degree + 1);
    ck.testExactNumber(knots.knotLength01, a1 - a0, "knot range");
    for (let spanIndex = 0; spanIndex < knots.numSpans; spanIndex++) {
      const leftKnotFromSpan = knots.spanFractionToKnot(spanIndex, 0);
      const rightKnotFromSpan = knots.spanFractionToKnot(spanIndex, 1);
      const leftKnotFromArray = knots.knots[spanIndex + knots.leftKnotIndex];
      ck.testCoordinate(leftKnotFromArray, leftKnotFromSpan, "left of span reproduces knots");
      ck.testCoordinate(knots.spanIndexToSpanLength(spanIndex), rightKnotFromSpan - leftKnotFromSpan, "span length");

    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("DoubleKnots", () => {
    const ck = new Checker();
    const bcurve = BSplineCurve3d.create(
      [Point3d.create(0, 0),
      Point3d.create(1, 0, 0),
      Point3d.create(1, 1, 0),
      Point3d.create(2, 1, 0),
      Point3d.create(3, 0, 0),
      Point3d.create(4, 1, 0)],
      [0, 0, 0.5, 0.5, 0.75, 1, 1], 3)!;
    const path = Path.create(bcurve);
    const strokes = path.getPackedStrokes()!;
    console.log(prettyPrint(strokes));
    expect(ck.getNumErrors()).equals(0);
  });
  it("SaturateBspline", () => {
    const ck = new Checker();
    const xStep = 120;
    let xShift = 0;
    const yShift = 60.0;
    const allGeometry: GeometryQuery[] = [];
    for (const factor of [0.5, 1, 3]) {
      const transform = Transform.createScaleAboutPoint(Point3d.create(0, 0, 0), factor);
      for (const allPoints of [
        [Point3d.create(0, 0, 0),
        Point3d.create(0, 10, 0),
        Point3d.create(10, 10, 0),
        Point3d.create(10, 0, 0),
        Point3d.create(20, 0, 0),
        Point3d.create(20, 10, 0),
        Point3d.create(25, 5, 0),
        Point3d.create(30, 5, 0),
        Point3d.create(35, 10, 0)],
        ellipsePoints(35, 20, AngleSweep.createStartEndDegrees(-45, 110), 9)]) {
        transform.multiplyPoint3dArrayInPlace(allPoints);
        for (let degree = 1; degree < 6; degree++) {
          const bcurve = BSplineCurve3d.createUniformKnots(allPoints, degree + 1)!;
          let cp: BezierCurveBase | undefined;
          for (let spanIndex = 0; ; spanIndex++) {
            cp = bcurve.getSaturatedBezierSpan3d(spanIndex, cp);
            if (!cp) break;
            const bezier = cp as BezierCurve3d;
            const poles = bezier.copyPointsAsLineString();
            translateAndPush(allGeometry, poles, xShift, yShift);
            let shiftCount = 2;
            for (const degrees of [24, 12, 6]) {
              const options = StrokeOptions.createForCurves();
              options.angleTol = Angle.createDegrees(degrees);
              const strokes = LineString3d.create();
              bezier.emitStrokes(strokes, options);
              translateAndPush(allGeometry, strokes, xShift, (shiftCount++) * yShift);
            }
            translateAndPush(allGeometry, bezier.clone(), xShift, (shiftCount++) * yShift);
          }
          translateAndPush(allGeometry, bcurve, xShift, 0);
          xShift += xStep;
        }
      }
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "BezierCurve3d", "BsplineSaturation");
    expect(ck.getNumErrors()).equals(0);
  });
  it("IntersectPlane", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const bcurves = Sample.createMixedBsplineCurves();
    const markerSize = 0.1;
    const planeSize = 0.5;
    let xShift = 0.0;
    const yShift = 0.0;
    for (const curve of bcurves) {
      translateAndPush(allGeometry, curve.clone(), xShift, yShift);
      for (const fraction of [0.2, 0.5, 0.73]) {
        const tangentRay = curve.fractionToPointAndDerivative(fraction);
        // Alter the ray z so it is not perpendicular ..
        // tangentRay.direction.z += 0.02;
        const intersections: CurveLocationDetail[] = [];
        const plane = Plane3dByOriginAndUnitNormal.create(tangentRay.origin, tangentRay.direction)!;  // This renormalizes.
        curve.appendPlaneIntersectionPoints(plane, intersections);
        if (intersections.length > 1)
          curve.appendPlaneIntersectionPoints(plane, intersections);
        showPlane(allGeometry, plane, planeSize, xShift, yShift);
        for (const detail of intersections) {
          if (detail.point.isAlmostEqual(tangentRay.origin))
            showPoint(allGeometry, detail.point, markerSize, xShift, yShift);
          else
            translateAndPush(allGeometry, LineSegment3d.create(tangentRay.origin, detail.point), xShift, yShift);
        }
      }
      xShift += 10.0;
    }

    GeometryCoreTestIO.saveGeometry(allGeometry, "BSplineCurve", "IntersectPlane");
    expect(ck.getNumErrors()).equals(0);
  });

});
