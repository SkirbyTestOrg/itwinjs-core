/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { AngleSweep } from "../geometry3d/AngleSweep";
import { Angle } from "../geometry3d/Angle";
import { Point2d } from "../geometry3d/Point2dVector2d";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { Segment1d } from "../geometry3d/Segment1d";
import { Range3d } from "../geometry3d/Range";
import { Transform } from "../geometry3d/Transform";
import { StrokeOptions } from "../curve/StrokeOptions";
import { CurvePrimitive } from "../curve/CurvePrimitive";
import { NewtonEvaluatorRtoR, Newton1dUnboundedApproximateDerivative } from "../numerics/Newton";
import { BSplineCurve3d } from "../bspline/BSplineCurve";
import { BSplineCurve3dH } from "../bspline/BSplineCurve3dH";
import { Sample } from "../serialization/GeometrySamples";
import { Geometry } from "../Geometry";
import { Ray3d } from "../geometry3d/Ray3d";
import { TransitionSpiral3d } from "../curve/TransitionSpiral";
import { LineString3d } from "../curve/LineString3d";
import { Arc3d } from "../curve/Arc3d";
import { LineSegment3d } from "../curve/LineSegment3d";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/Plane3dByOriginAndUnitNormal";
import { Checker } from "./Checker";
import { expect } from "chai";
import { prettyPrint } from "./testFunctions";
import { IModelJson } from "../serialization/IModelJsonSchema";
import { GeometryCoreTestIO } from "./GeometryCoreTestIO";
import { BezierCurve3dH } from "../bspline/BezierCurve3dH";
import { BezierCurve3d } from "../bspline/BezierCurve3d";
import { Point4d } from "../geometry4d/Point4d";
import { CurveLocationDetail, CurveIntervalRole } from "../curve/CurveLocationDetail";
import { CoordinateXYZ } from "../curve/CoordinateXYZ";
import { Path } from "../curve/Path";
import { CurveChainWithDistanceIndex } from "../curve/PathWithDistanceIndex";
/* tslint:disable:no-console */

class ExerciseCurve {

  public static exerciseCloneAndTransform(ck: Checker, curveA: CurvePrimitive) {
    const u0 = 0.25;
    const u1 = 0.5;
    const scaleFactor = 2.0;
    const pointA0 = curveA.fractionToPoint(u0);
    const pointA1 = curveA.fractionToPoint(u1);
    const transform = Transform.createScaleAboutPoint(pointA0, scaleFactor);
    const curveB = curveA.cloneTransformed(transform);
    if (ck.testPointer(curveB) && curveB instanceof CurvePrimitive) {
      ck.testFalse(curveA.isAlmostEqual(curveB), "scale changes surface");
      ck.testTrue(curveB.isSameGeometryClass(curveA));
      const pointB0 = curveB.fractionToPoint(u0);
      ck.testPoint3d(pointA0, pointB0, "fixed point preserved");
      const pointB1 = curveB.fractionToPoint(u1);
      ck.testCoordinate(scaleFactor * pointA0.distance(pointA1), pointB0.distance(pointB1));
      const frameA0 = curveA.fractionToFrenetFrame(u0);
      const frameB0 = curveB.fractionToFrenetFrame(u0);
      if (ck.testPointer(frameA0)
        && ck.testPointer(frameB0)
        && frameA0
        && frameB0) {
        ck.testTransform(frameA0, frameB0);
        const frameA0Inverse = frameA0.inverse();
        if (ck.testPointer(frameA0Inverse) && frameA0Inverse) {
          const rangeA2 = Range3d.create();
          curveA.extendRange(rangeA2, frameA0Inverse);
          const planeA2 = Plane3dByOriginAndUnitNormal.create(
            Point3d.createFrom(frameA0.origin),
            frameA0.matrix.columnZ());
          ck.testBoolean(curveA.isInPlane(planeA2!),
            Geometry.isSmallMetricDistance(rangeA2.zLength()),
            "Surface planarity test versus range in frame");
        }
      }
    }
  }

  public static exerciseReverseInPlace(ck: Checker, curve: CurvePrimitive) {
    const curveA = curve.clone() as CurvePrimitive;
    curveA.reverseInPlace();
    for (const f of [0, 0.2, 0.6, 0.92, 1]) {
      let point = curve.fractionToPoint(f);
      let pointA = curveA.fractionToPoint(1.0 - f);
      if (!ck.testPoint3d(point, pointA, "Reverse Curve", curve, f)) {
        point = curve.fractionToPoint(f);
        pointA = curveA.fractionToPoint(1.0 - f);
      }
    }
  }
  public static exerciseCurvePlaneIntersections(ck: Checker, curve: CurvePrimitive) {
    if (curve instanceof BSplineCurve3d) return;  // TODO
    // if (curve instanceof TransitionSpiral3d) return;  // TODO
    for (const fractionA of [0.421, 0.421, 0.45, 0.45]) {
      const frameA = curve.fractionToFrenetFrame(fractionA)!; // just point and tangent needed, but exercise this . .
      if (ck.testPointer(frameA) && frameA) {
        const plane = Plane3dByOriginAndUnitNormal.create(frameA.getOrigin(), frameA.matrix.columnX())!;
        const intersections: CurveLocationDetail[] = [];
        curve.appendPlaneIntersectionPoints(plane!, intersections);
        const foundAt = intersections.filter(
          (detail: CurveLocationDetail, _index: number, _data: CurveLocationDetail[]) => {
            if (detail.curve === curve)
              return Geometry.isAlmostEqualNumber(detail.fraction, fractionA);
            // Different curve -- maybe a constituent?  accept based on points
            return plane.getOriginRef().isAlmostEqual(detail.point);
          });
        ck.testTrue(foundAt.length >= 1, "planeCurveIntersections", curve, plane, fractionA);
      }
    }
  }
  public static exerciseFractionToPoint(ck: Checker, curve: CurvePrimitive | undefined, expectProportionalDistance: boolean, expectEqualChordLength: boolean) {
    if (!curve) {
      ck.announceError("Null CurvePrimitive provided to exerciseFractionAndPoint");
      return;
    }

    const derivativeIncrement = 1.0e-4;
    const derivativeTolerance = 1.0e-6;
    const derivative2Tolerance = 1.0e-5;
    const point0 = curve.fractionToPoint(0.0);
    const previousPoint = curve.fractionToPoint(0);
    let newPoint = point0.clone();
    const length01 = curve.curveLength();
    let previousDistance = 0;
    const fractions = [0, 1 / 7.0, 2 / 7.0, 3 / 7.0, 4 / 7.0];
    let length0F;
    for (const fraction of fractions) {
      // equal steps but stay away from possible interior vertices of linestrings !!!
      newPoint = curve.fractionToPoint(fraction, newPoint);
      const distance = previousPoint.distance(newPoint);

      if (expectProportionalDistance) {
        length0F = curve.curveLengthBetweenFractions(0.0, fraction);
        ck.testCoordinate(fraction * length01, length0F, "interpolated points at expected distance");
      }
      if (expectEqualChordLength && previousDistance !== 0.0)
        ck.testCoordinate(distance, previousDistance, "equalChordLength in fractional Steps");
      previousPoint.setFrom(newPoint);
      previousDistance = distance;
      // if it is an interior point confirm rudimentary derivative properties
      if (Math.abs(fraction - 0.5) < 0.49) {
        const pointA0 = curve.fractionToPoint(fraction - derivativeIncrement);
        const pointA1 = curve.fractionToPoint(fraction);
        const pointA2 = curve.fractionToPoint(fraction + derivativeIncrement);
        const delta01 = Vector3d.createStartEnd(pointA0, pointA1);
        const delta12 = Vector3d.createStartEnd(pointA1, pointA2);
        const delta012 = Vector3d.createStartEnd(delta01, delta12);
        const delta02 = Vector3d.createStartEnd(pointA0, pointA2);
        const ray1 = curve.fractionToPointAndDerivative(fraction);
        const plane1 = curve.fractionToPointAnd2Derivatives(fraction);
        ck.testPoint3d(pointA1, ray1.origin);
        const aproximateDerivative = delta02.scale(0.5 / derivativeIncrement);
        const approximateDerivative2 = delta012.scale(1.0 / (derivativeIncrement * derivativeIncrement));
        ck.testTrue(aproximateDerivative.distance(ray1.direction) < derivativeTolerance * (1 + ray1.direction.magnitude()),
          "approximate derivative", ray1.direction, aproximateDerivative, curve, fraction);
        if (plane1 && !(curve instanceof BSplineCurve3d)) { //  curve instanceof TransitionSpiral3d
          ck.testPoint3d(ray1.origin, plane1.origin, "points with derivatives");
          if (!(curve instanceof TransitionSpiral3d)) {
            // TransitionSpiral has wierd derivative behavior?
            ck.testTrue(approximateDerivative2.distance(plane1.vectorV) < derivative2Tolerance * (1 + plane1.vectorV.magnitude()),
              "approximate 2nd derivative", plane1.vectorV, approximateDerivative2, curve, fraction);
            ck.testTrue(approximateDerivative2.distance(plane1.vectorV) < derivative2Tolerance * (1 + plane1.vectorV.magnitude()),
              "approximate 2nd derivative", plane1.vectorV, approximateDerivative2, curve, fraction);
          }
        }
      }
    }
    ExerciseCurve.exerciseCurvePlaneIntersections(ck, curve);
    ExerciseCurve.exerciseReverseInPlace(ck, curve);
    ExerciseCurve.exerciseCloneAndTransform(ck, curve);
    ExerciseCurve.exerciseCloneAndTransform(ck, curve);
    // evaluate near endpoints to trigger end conditions
    const point0A = curve.startPoint();
    const point1A = curve.endPoint();
    ck.testLE(point0A.distance(point1A), curve.quickLength(), "start end distance LE curve quick length");

    for (const f of [0.01, 0.48343, 0.992]) {
      const xyzA = Point3d.create();
      const xyzB = curve.fractionToPoint(f);
      curve.fractionToPoint(f, xyzA);
      ck.testPoint3d(xyzA, xyzB);

      const rayA = Ray3d.createZero();
      const rayB = curve.fractionToPointAndDerivative(f);
      curve.fractionToPointAndDerivative(f, rayA);
      ck.testTrue(rayA.isAlmostEqual(rayB), "default result for fractionToPointAndDerivative");
    }
  }

  public static exerciseClosestPoint(ck: Checker, curve: CurvePrimitive, fractionA: number): boolean {
    const pointA = curve.fractionToPoint(fractionA);
    let detail = curve.closestPoint(pointA, false);
    if (ck.testPointer(detail) && detail) {
      if (detail.curve === curve) {
        if (!ck.testCoordinate(fractionA, detail.fraction, "fraction round trip")
          || !ck.testPoint3d(pointA, detail.point, "round trip point")) {
          detail = curve.closestPoint(pointA, false);
        } else {
          // The search tunneled into a contained curve.   Only verify the point.
          if (!ck.testPoint3d(pointA, detail.point, "round trip point")
            || !ck.testPoint3d(pointA, detail.curve.fractionToPoint(detail.fraction))) {
            detail = curve.closestPoint(pointA, false);
          }
        }
      }
    }
    return true;
  }

  public static exerciseStroke(ck: Checker, curve: CurvePrimitive): void {
    const strokes = LineString3d.create();
    const options = StrokeOptions.createForCurves();
    const theta = Angle.createDegrees(10);

    const directRange = curve.range();
    const extendRange = Range3d.create();
    curve.extendRange(extendRange);
    options.minStrokesPerPrimitive = 2;
    options.angleTol = theta;
    const chordFraction = Math.cos(theta.radians);
    curve.emitStrokes(strokes, options);
    ck.testCoordinateOrder(2, strokes.points.length, "Non-trivial strokes");
    const curveLength = curve.curveLength();
    const strokeLength = strokes.curveLength();
    const strokeRange = strokes.range();
    ck.testTrue(directRange.containsRange(strokeRange), "range from curve contains range of strokes");
    ck.testTrue(extendRange.containsRange(strokeRange), "range from curve by extend contains range of strokes");

    ck.testLE(strokeLength, curveLength, "strokeLength cannot exceed curveLength");
    if (!ck.testLE(chordFraction * curveLength, strokeLength, "strokes appear accurate")
      || Checker.noisy.stroke) {
      console.log(" CURVE", curve);
      const curveLength1 = curve.curveLength();
      console.log("computed length", curveLength1);
      console.log("STROKES", strokes);
    }
  }
  public static RunTest(ck: Checker) {

    const segment = LineSegment3d.create(Point3d.create(1, 2, 3), Point3d.create(4, 5, 10));
    ExerciseCurve.exerciseFractionToPoint(ck, segment, true, true);
    ExerciseCurve.exerciseStroke(ck, segment);
    ExerciseCurve.exerciseClosestPoint(ck, segment, 0.1);
    ExerciseCurve.exerciseCloneAndTransform(ck, segment);

    const arc = Arc3d.create(Point3d.create(1, 2, 3),
      Vector3d.create(2, 0, 0),
      Vector3d.create(0, 2, 0),
      AngleSweep.createStartEndDegrees(0, 180));
    if (arc) {
      ExerciseCurve.exerciseFractionToPoint(ck, arc, false, true);
      ExerciseCurve.exerciseClosestPoint(ck, arc, 0.1);
      ExerciseCurve.exerciseStroke(ck, arc);
      ExerciseCurve.exerciseCloneAndTransform(ck, arc);
    }
    let linestring = LineString3d.createPoints([
      Point3d.create(0, 0, 0),
      Point3d.create(1, 0, 0),
      Point3d.create(1, 1, 0)]);
    ExerciseCurve.exerciseFractionToPoint(ck, linestring, false, false);
    ExerciseCurve.exerciseStroke(ck, linestring);
    ExerciseCurve.exerciseCloneAndTransform(ck, linestring);

    linestring = LineString3d.create(
      Point3d.create(0, 0, 0),
      Point3d.create(1, 0, 0),
      Point3d.create(1, 1, 0));
    ExerciseCurve.exerciseFractionToPoint(ck, linestring, false, false);
    ExerciseCurve.exerciseCloneAndTransform(ck, linestring);

    linestring = LineString3d.create();

    const bcurve = BSplineCurve3d.createUniformKnots(
      [Point3d.create(0, 0, 0), Point3d.create(5, 0, 0), Point3d.create(10, 4, 0)],
      3);
    if (ck.testPointer(bcurve) && bcurve) {
      ExerciseCurve.exerciseFractionToPoint(ck, bcurve, false, false);
      ExerciseCurve.exerciseStroke(ck, bcurve);
      ExerciseCurve.exerciseClosestPoint(ck, bcurve, 0.1);
    }
    // with weights, but all weights 1.0
    const bcurveH1 = BSplineCurve3dH.createUniformKnots(
      [Point4d.create(0, 0, 0, 1), Point4d.create(5, 0, 0, 1), Point4d.create(10, 4, 0, 1)],
      3);
    if (ck.testPointer(bcurveH1) && bcurveH1) {
      ExerciseCurve.exerciseFractionToPoint(ck, bcurveH1, false, false);
      ExerciseCurve.exerciseStroke(ck, bcurveH1);
      ExerciseCurve.exerciseClosestPoint(ck, bcurveH1, 0.1);
    }

    const poles4d = [
      Point4d.create(0, 0, 0, 1),
      Point4d.create(5, 0, 0, 0.8),
      Point4d.create(10, 4, 0, 1),
      Point4d.create(15, 4, 0, 1),
      Point4d.create(20, 0, 0, 1)];

    for (let order = 3; order <= poles4d.length; order++) {
      const bcurveH = BSplineCurve3dH.createUniformKnots(poles4d, order);
      if (ck.testPointer(bcurveH) && bcurveH) {
        ExerciseCurve.exerciseFractionToPoint(ck, bcurveH, false, false);
        ExerciseCurve.exerciseStroke(ck, bcurveH);
        ExerciseCurve.exerciseClosestPoint(ck, bcurveH, 0.1);
        ExerciseCurve.exerciseClosestPoint(ck, bcurveH, 0.48);
        ExerciseCurve.exerciseClosestPoint(ck, bcurveH, 0.82);
      }
    }

    const bezierCurve0 = BezierCurve3d.create([
      Point2d.create(0, 0), Point2d.create(0.5, 0.0), Point2d.create(1, 1)])!;
    ExerciseCurve.exerciseFractionToPoint(ck, bezierCurve0, false, false);
    ExerciseCurve.exerciseStroke(ck, bezierCurve0);
    ExerciseCurve.exerciseClosestPoint(ck, bezierCurve0, 0.1);

    const bezierCurve = BezierCurve3dH.create([
      Point2d.create(0, 0), Point2d.create(0.5, 0.0), Point2d.create(1, 1)])!;
    ExerciseCurve.exerciseFractionToPoint(ck, bezierCurve, false, false);
    ExerciseCurve.exerciseStroke(ck, bezierCurve);
    ExerciseCurve.exerciseClosestPoint(ck, bezierCurve, 0.1);

    const bezierCurve3d = BezierCurve3dH.create([
      Point3d.create(0, 0), Point3d.create(0.5, 0.0), Point3d.create(1, 1), Point3d.create(2, 1, 1)])!;
    ExerciseCurve.exerciseFractionToPoint(ck, bezierCurve, false, false);
    ExerciseCurve.exerciseStroke(ck, bezierCurve3d);
    ExerciseCurve.exerciseClosestPoint(ck, bezierCurve3d, 0.1);

    if (Checker.noisy.testTransitionSpiral) {
      const spiral = TransitionSpiral3d.createRadiusRadiusBearingBearing(
        Segment1d.create(0, 1000),
        AngleSweep.createStartEndDegrees(0, 10),
        Segment1d.create(0, 1),
        Transform.createIdentity());
      if (ck.testPointer(spiral) && spiral) {
        ExerciseCurve.exerciseFractionToPoint(ck, spiral, true, false);
        ExerciseCurve.exerciseStroke(ck, spiral);
        ExerciseCurve.exerciseClosestPoint(ck, spiral, 0.3);
      }
    }
    ck.testExactNumber(0, linestring.points.length);

  }
}

describe("CurvePrimitive.Evaluations", () => {
  it("Create and exercise curves", () => {
    const ck = new Checker();
    ExerciseCurve.RunTest(ck);
    ck.checkpoint("End CurvePrimitive.Evaluations");
    expect(ck.getNumErrors()).equals(0);
  });
  it("Create and exercise distanceIndex", () => {
    const ck = new Checker();
    const paths = Sample.createCurveChainWithDistanceIndex();
    const dx = 10.0;
    const allGeoemtry = [];
    for (const p of paths) {
      const q = p.clone()!;
      q.tryTranslateInPlace(dx, 0, 0);
      allGeoemtry.push(p.clone());
      ExerciseCurve.exerciseFractionToPoint(ck, p, true, false);
      ExerciseCurve.exerciseStroke(ck, p);
      ExerciseCurve.exerciseClosestPoint(ck, p, 0.1);
      ExerciseCurve.exerciseCloneAndTransform(ck, p);
    }

    ck.checkpoint("CurvePrimitive.Create and exercise distanceIndex");
    GeometryCoreTestIO.saveGeometry(allGeoemtry, undefined, "CurvePrimitive.CurveChainWithDistanceIndex");

    expect(ck.getNumErrors()).equals(0);
  });

});

class NewtonEvaluatorClosestPointOnCurve extends NewtonEvaluatorRtoR {
  private _curve: CurvePrimitive;
  private _spacePoint: Point3d;
  public lastFraction: number;
  public lastEvaluationA: Ray3d;
  public constructor(curve: CurvePrimitive, spacePoint: Point3d) {
    super();
    this._spacePoint = spacePoint;
    this._curve = curve;
    this.lastFraction = 0;
    this.lastEvaluationA = Ray3d.createZero();
    // console.log("\n**\n");
    // console.log("ClosestPoint", spacePoint, curve);
  }
  public evaluate(f: number): boolean {
    this.lastFraction = f;
    this.lastEvaluationA = this._curve.fractionToPointAndDerivative(f, this.lastEvaluationA);
    this.currentF = this.lastEvaluationA.direction.dotProductStartEnd(this._spacePoint, this.lastEvaluationA.origin);
    // console.log("evaluate ", this.lastFraction, this.lastEvaluationA, this.currentF);
    return true;
  }

}
describe("CurvePrimitive.Newton", () => {
  it("CurvePrimitive.Newton", () => {
    const initialShift = 0.05;
    const ck = new Checker();
    for (const c of Sample.createSmoothCurvePrimitives()) {
      // console.log(prettyPrint(c));
      for (const f of [0.25, 0.6]) {
        const xyz = c.fractionToPoint(f);
        const evaluator = new NewtonEvaluatorClosestPointOnCurve(c, xyz);
        const searcher = new Newton1dUnboundedApproximateDerivative(evaluator);
        searcher.setX(f + initialShift);  // start searching from a fraction close to the known result.
        // the step cannot be too big for nasty curves !!!
        // console.log("search at fraction " + f);
        if (ck.testBoolean(true, searcher.runIterations(), "Newton finish")) {
          ck.testCoordinate(f, searcher.getX());
        }
      }
    }
    ck.checkpoint("CurvePrimitive.Newton");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("CurvePrimitive.TransitionSpiral", () => {
  it("CurvePrimitive.TransitionSpiral", () => {
    const ck = new Checker();
    const c = TransitionSpiral3d.createRadiusRadiusBearingBearing(
      Segment1d.create(0, 100),
      AngleSweep.createStartEndDegrees(0, 5),
      Segment1d.create(0, 1),
      Transform.createIdentity());
    const point0 = c.fractionToPointAndDerivative(0);
    const point1 = Ray3d.createZero();
    const numStroke = 20;
    let chordSum = 0.0;
    let trapezoidSum = 0.0;
    for (let i = 1; i <= numStroke; i++) {
      const fraction = i / numStroke;
      c.fractionToPointAndDerivative(fraction, point1);
      chordSum += point0.origin.distance(point1.origin);
      trapezoidSum += 0.5 * (point0.direction.magnitude() + point1.direction.magnitude()) / numStroke;
      if (Checker.noisy.spirals)
        console.log("f", fraction, "  point", point1);
      point0.setFrom(point1);
    }
    if (Checker.noisy.spirals) {
      console.log("arcLength", c.curveLength());
      console.log("  chordSum ", chordSum, " deltaC", chordSum - c.curveLength());
      console.log("  trapdSum ", trapezoidSum, " deltaT", trapezoidSum - c.curveLength());
    }
    ck.testCoordinate(c.curveLength(), chordSum, "spiral length versus chord sum");
    ck.testCoordinate(c.curveLength(), trapezoidSum, "spiral length versus trapezoid sum");

    ck.checkpoint("CurvePrimitive.TransitionSpiral");
    expect(ck.getNumErrors()).equals(0);
  });
});

function testSamples(_ck: Checker, samples: any[], maxEcho: number = 0) {
  let s0 = "UNDEFINED";
  let n0 = 0;
  // whatever is in samples:
  // 1) If it has toJSON method, write that to console
  // 2) Otherwiswe try IModelJson . .
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (i < maxEcho) {
      if (s.toJSON)
        console.log("from toJSON(): " + JSON.stringify(s.toJSON()));
      else {
        const json = IModelJson.Writer.toIModelJson(s);
        if (json)
          console.log("IModelJson.Writer.toIModelJson:", prettyPrint(json));
      }
    }

    const s1 = s.constructor.name;
    // s.consecutive;
    if (s1 !== s0) {
      if (n0 > 0) {
        console.log([s0, n0]);
        n0 = 0;
      }
    }
    n0++;
    s0 = s1;
  }
  if (n0 !== 0)
    console.log([s0, n0]);
}
describe.skip("Samples", () => {
  it("Counts", () => {
    const ck = new Checker();
    testSamples(ck, Sample.point2d);
    testSamples(ck, Sample.point3d);
    testSamples(ck, Sample.createMatrix4ds());
    testSamples(ck, Sample.createRange3ds());
    testSamples(ck, Sample.createSmoothCurvePrimitives());
    testSamples(ck, Sample.createSimplePaths(false));
    testSamples(ck, Sample.createSimpleLoops());

    // testSamples(ck, Sample.createSimpleXYPointLoops());
    testSamples(ck, Sample.createSimpleParityRegions());
    testSamples(ck, Sample.createSimpleUnions());
    testSamples(ck, Sample.createSimpleLinearSweeps());
    testSamples(ck, Sample.createSimpleRotationalSweeps());
    testSamples(ck, Sample.createSpheres());
    testSamples(ck, Sample.createCones());
    testSamples(ck, Sample.createTorusPipes());
    testSamples(ck, Sample.createBoxes());
    testSamples(ck, Sample.createRuledSweeps());
    testSamples(ck, Sample.createSimpleIndexedPolyfaces(1));
    testSamples(ck, Sample.createClipPlanes(), 100);
    ck.checkpoint("Samples");
    expect(ck.getNumErrors()).equals(0);
  });
});

/** starting at startIndex, look for index of a CurveLocationDetail with matching point.
 * @returns Return index where found, or data.length if not found.
 */
function findPointInCLDArray(point: Point3d, data: CurveLocationDetail[], startIndex: number): number {
  for (let i = startIndex; i < data.length; i++) {
    if (point.isAlmostEqual(data[i].point)) return i;
  }
  return data.length;
}

/** test curve interval role against allowable values */
function testCurveIntervalRole(
  ck: Checker,
  cld: CurveLocationDetail,
  values: CurveIntervalRole[]): boolean {
  const value = cld.intervalRole;
  for (const v of values)
    if (v === value) return true;
  ck.announceError("Expect CurveIntervalRole value", cld, values);
  return false;
}
describe("Linestring3dSpecials", () => {
  it("frenetFrame", () => {
    const ck = new Checker();
    const a = 0.02;
    const ax = 2 * a;
    const ay = a;
    const az = a;
    const geometry = [];
    for (const linestring of [
      LineString3d.create(
        Point3d.create(0, 0, 0),
        Point3d.create(1, 0, 0),  // pure X
        Point3d.create(1, 1, 0),  // pure Y
        Point3d.create(4, 2, 1),  // evertything tilts
        Point3d.create(8, 1, 0)), // dive down
      LineString3d.createRegularPolygonXY(Point3d.create(0, 10, 0), 7, 3.0, true)]) {
      geometry.push(linestring);
      const df = 0.125 / (linestring.numPoints() - 1);
      for (let fraction = 0; fraction <= 1.0000001; fraction += df) {
        const frame0 = linestring.fractionToFrenetFrame(fraction)!;
        geometry.push(LineString3d.create(frame0.origin,
          frame0.multiplyXYZ(ax, 0, 0),
          frame0.multiplyXYZ(0, ay, 0),
          frame0.multiplyXYZ(0, -ay, 0),
          frame0.multiplyXYZ(ax, 0, 0),
          frame0.multiplyXYZ(0, 0, az),
          frame0.origin));
        const tangent = linestring.fractionToPointAndUnitTangent(fraction);
        ck.testPerpendicular(tangent.direction, frame0.matrix.columnZ());
      }
    }
    GeometryCoreTestIO.saveGeometry(geometry, undefined, "Linestring3d.fractionToFrenentFrame");
    ck.checkpoint("Linestring3dSpecials.FrenetFrame");
    expect(ck.getNumErrors()).equals(0);
  });

  it("appendPlaneIntersections", () => {
    const ck = new Checker();
    const linestring = LineString3d.create();
    Sample.appendPhases(linestring, 3, Vector3d.create(2, 0, 0), Vector3d.create(3, 1, 0), Vector3d.create(2, 0.4, 0.1));

    // this linestring proceeds "forward" so that planes perpendicular to segment interior points will have only one intersection !!!
    const numSegment = linestring.numPoints() - 1;
    const segmentFraction = 0.25;
    for (let i = 0; i < numSegment; i++) {
      const globalFraction = (i + segmentFraction) / numSegment;
      const pointOnSegment = linestring.fractionToPointAndUnitTangent((i + segmentFraction) / numSegment);
      const plane = Plane3dByOriginAndUnitNormal.create(pointOnSegment.origin, pointOnSegment.direction);
      const intersections = new Array<CurveLocationDetail>();
      linestring.appendPlaneIntersectionPoints(plane!, intersections);
      if (ck.testExactNumber(1, intersections.length, "Expect single intersection " + i)
        && ck.testCoordinate(globalFraction, intersections[0].fraction, "intersection fraction on segment " + i)
        && ck.testPoint3d(plane!.getOriginRef(), intersections[0].point, "intersection point on segment " + i)) {
        // all ok!!
      } else {
        intersections.length = 0;
        linestring.appendPlaneIntersectionPoints(plane!, intersections);
      }
    }
    // inspect each set of 3 successive points.
    // make a plane through the three points.
    // expect to find each of the 3 points in the intersection list.
    for (let i = 0; i + 2 < numSegment; i++) {
      const point0 = linestring.pointAt(i)!;
      const point1 = linestring.pointAt(i + 1)!;
      const point2 = linestring.pointAt(i + 2)!;
      const plane3 = Plane3dByOriginAndUnitNormal.create(point0, point0.crossProductToPoints(point1, point2));
      if (plane3) {
        const intersections = new Array<CurveLocationDetail>();
        linestring.appendPlaneIntersectionPoints(plane3, intersections);
        if (ck.testLE(3, intersections.length, "Expect 3 intersection points")) {
          const index0 = findPointInCLDArray(point0, intersections, 0);
          const index1 = findPointInCLDArray(point1, intersections, index0);
          const index2 = findPointInCLDArray(point2, intersections, index1);
          if (ck.testExactNumber(index0 + 1, index1, "consecutive points in intersection list.")
            && ck.testExactNumber(index1 + 1, index2, "consecutive points in intersection list.")) {
            // when inspecting the invervalRole, allow for ends to be subsumed by larger intervals.
            testCurveIntervalRole(ck, intersections[index0], [CurveIntervalRole.intervalStart, CurveIntervalRole.intervalInterior]);
            testCurveIntervalRole(ck, intersections[index1], [CurveIntervalRole.intervalInterior]);
            testCurveIntervalRole(ck, intersections[index2], [CurveIntervalRole.intervalEnd, CurveIntervalRole.intervalInterior]);
          }
        }
      }
    }

    ck.checkpoint("Linestring3d.appendPlaneIntersections");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("CoordinateXYZ", () => {
  it("Hello", () => {
    const ck = new Checker();
    const pointS = Point3d.create(10, 0, 0);
    const scale = 2.0;
    const transform = Transform.createScaleAboutPoint(pointS, scale);
    const coordinateA = CoordinateXYZ.create(Point3d.create(1, 2, 3));
    const coordinateB = coordinateA.clone();
    if (ck.testPointer(coordinateB) && coordinateB instanceof CoordinateXYZ) {
      const coordinateC = coordinateA.cloneTransformed(transform) as CoordinateXYZ;
      ck.testPoint3d(coordinateA.point, coordinateB.point);
      const distanceAC = pointS.distance(coordinateC.point);
      ck.testCoordinate(scale * pointS.distance(coordinateA.point), distanceAC);
      const range = coordinateA.range();
      coordinateC.extendRange(range);
      // with only 2 points, the range diagonal must join the points . . .
      ck.testTrue(coordinateA.isSameGeometryClass(coordinateC));
      ck.testFalse(coordinateA.isAlmostEqual(coordinateC));
      ck.testTrue(coordinateA.isAlmostEqual(coordinateB));
    }

    ck.checkpoint("CoordinateXYZ.Hello");
    expect(ck.getNumErrors()).equals(0);
  });
});

// compare fractionToPoint and curveLengthBetweenFractions for curves that are supposed to have identical parameterizations.
// EXAMPLE:   (a) LineString3d with equal length segments (b) CurveChainWithDistanceIndex with each of those segments as an independent LineSegment3d.
function compareIsomorphicCurves(ck: Checker, curveA: CurvePrimitive, curveB: CurvePrimitive) {
  const fractions = [0.0, 0.125, 0.55, 0.882, 1.0];
  for (const fraction of fractions) {
    const pointA = curveA.fractionToPoint(fraction);
    const pointB = curveB.fractionToPoint(fraction);
    if (!ck.testPoint3d(pointA, pointB, " compare at fraction " + fraction))
      curveB.fractionToPoint(fraction);
  }
  const intervalFractions = [0.0, 0.4, 0.2, 0.9, 1.0, 0.3];
  for (let i = 0; i + 1 < intervalFractions.length; i++) {
    const f0 = intervalFractions[i];
    const f1 = intervalFractions[i + 1];
    const lengthA = curveA.curveLengthBetweenFractions(f0, f1);
    const lengthB = curveB.curveLengthBetweenFractions(f0, f1);
    if (!ck.testCoordinate(lengthA, lengthB, "curveLengthBetweenFractions (" + f0 + ", " + f1)) {
      curveA.curveLengthBetweenFractions(f0, f1);
      curveB.curveLengthBetweenFractions(f0, f1);
    }
  }
}
describe("IsomorphicCurves", () => {
  it("Hello", () => {
    const ck = new Checker();
    const options1 = StrokeOptions.createForCurves();
    options1.maxEdgeLength = 0.5;
    for (const options of [undefined, options1]) {
      const allPoints = [
        Point3d.create(0, 0, 0),
        Point3d.create(1, 0, 0),
        Point3d.create(2, 0, 0),
        Point3d.create(2, 1, 0)];
      for (let numPoints = 2; numPoints <= allPoints.length; numPoints++) {
        // console.log("Isomorphic LineString (" + numPoints + ")");
        // assemble leading numPoints part of allPoints ...
        const currentPoints = [allPoints[0]];
        for (let i = 1; i < numPoints; i++)
          currentPoints.push(allPoints[i]);
        const linestring = LineString3d.create(currentPoints);
        const path = Path.create();
        // console.log(prettyPrint(currentPoints));
        for (let i = 0; i + 1 < currentPoints.length; i++) {
          path.tryAddChild(LineSegment3d.create(currentPoints[i], currentPoints[i + 1]));
        }
        const chain = CurveChainWithDistanceIndex.createCapture(path, options);
        compareIsomorphicCurves(ck, linestring, chain);
      }
    }
    ck.checkpoint("IsomorphicCurves.Hello");
    expect(ck.getNumErrors()).equals(0);

  });
});
