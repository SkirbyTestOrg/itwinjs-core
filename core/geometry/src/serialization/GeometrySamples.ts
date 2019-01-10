/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

/** @module Serialization */

import { Geometry } from "../Geometry";
import { AngleSweep } from "../geometry3d/AngleSweep";
import { Angle } from "../geometry3d/Angle";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/Plane3dByOriginAndUnitNormal";
import { Ray3d } from "../geometry3d/Ray3d";
import { Point2d, Vector2d } from "../geometry3d/Point2dVector2d";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { Segment1d } from "../geometry3d/Segment1d";
import { Transform } from "../geometry3d/Transform";
import { Matrix3d } from "../geometry3d/Matrix3d";

import { Range1d, Range2d, Range3d } from "../geometry3d/Range";
import { CurvePrimitive } from "../curve/CurvePrimitive";
import { GeometryQuery } from "../curve/GeometryQuery";
import { Map4d } from "../geometry4d/Map4d";
import { Matrix4d } from "../geometry4d/Matrix4d";
import { Point4d } from "../geometry4d/Point4d";
import { UnionRegion } from "../curve/UnionRegion";
import { BagOfCurves } from "../curve/CurveCollection";
import { ParityRegion } from "../curve/ParityRegion";
import { Loop } from "../curve/Loop";
import { Path } from "../curve/Path";
import { IndexedPolyface } from "../polyface/Polyface";
import { BSplineCurve3d, BSplineCurve3dBase } from "../bspline/BSplineCurve";
import { BSplineSurface3d, BSplineSurface3dH } from "../bspline/BSplineSurface";
import { Sphere } from "../solid/Sphere";
import { Cone } from "../solid/Cone";
import { Box } from "../solid/Box";
import { TorusPipe } from "../solid/TorusPipe";
import { LinearSweep } from "../solid/LinearSweep";
import { RotationalSweep } from "../solid/RotationalSweep";
import { RuledSweep } from "../solid/RuledSweep";

import { LineSegment3d } from "../curve/LineSegment3d";
import { Arc3d } from "../curve/Arc3d";
import { TransitionSpiral3d } from "../curve/TransitionSpiral";
import { LineString3d } from "../curve/LineString3d";
import { PointString3d } from "../curve/PointString3d";
import { ClipPlane } from "../clipping/ClipPlane";
import { ConvexClipPlaneSet } from "../clipping/ConvexClipPlaneSet";
import { GrowableFloat64Array } from "../geometry3d/GrowableFloat64Array";
import { GrowableXYZArray } from "../geometry3d/GrowableXYZArray";
import { UnionOfConvexClipPlaneSets } from "../clipping/UnionOfConvexClipPlaneSets";
import { BSplineCurve3dH } from "../bspline/BSplineCurve3dH";
import { BezierCurve3d } from "../bspline/BezierCurve3d";
import { BezierCurve3dH } from "../bspline/BezierCurve3dH";
import { CurveChainWithDistanceIndex } from "../curve/CurveChainWithDistanceIndex";
import { KnotVector, BSplineWrapMode } from "../bspline/KnotVector";

/* tslint:disable:no-console */

/** Access the last point in the array. push another shifted by dx,dy,dz */
function pushMove(data: Point3d[], dx: number, dy: number, dz: number = 0.0) {
  if (data.length > 0) {
    const back = data[data.length - 1];
    data.push(Point3d.create(back.x + dx, back.y + dy, back.z + dz));
  }
}

export class Sample {
  public static readonly point2d: Point2d[] = [
    Point2d.create(0, 0),
    Point2d.create(1, 0),
    Point2d.create(0, 1),
    Point2d.create(2, 3)];

  public static readonly point3d: Point3d[] = [
    Point3d.create(0, 0, 0),
    Point3d.create(1, 0, 0),
    Point3d.create(0, 1, 0),
    Point3d.create(0, 1, 0),
    Point3d.create(0, 0, 1),
    Point3d.create(2, 3, 0),
    Point3d.create(0, 2, 5),
    Point3d.create(-3, 0, 5),
    Point3d.create(4, 3, -2)];

  /** Return an array of Point3d, with x,y,z all stepping through a range of values.
   * x varies fastest, then y then z
   */
  public static createPoint3dLattice(low: number, step: number, high: number): Point3d[] {
    const points = [];
    for (let z = low; z <= high; z += step)
      for (let y = low; y <= high; y += step)
        for (let x = low; x <= high; x += step)
          points.push(Point3d.create(x, y, z));
    return points;
  }

  /** Return an array of Point2d, with x,y all stepping through a range of values.
   * x varies fastest, then y
   */
  public static createPoint2dLattice(low: number, step: number, high: number): Point2d[] {
    const points = [];
    for (let y = low; y <= high; y += step)
      for (let x = low; x <= high; x += step)
        points.push(Point2d.create(x, y));
    return points;
  }
  public static readonly point4d: Point4d[] = [
    Point4d.create(0, 0, 0, 1),
    Point4d.create(1, 0, 0, 1),
    Point4d.create(0, 1, 0, 1),
    Point4d.create(0, 1, 0, 1),
    Point4d.create(0, 0, 1, 1),
    Point4d.create(2, 3, 0, 1),
    Point4d.create(0, 2, 5, 1),
    Point4d.create(-3, 0, 5, 1),
    Point4d.create(-3, 0, 5, 0.3),
    Point4d.create(-3, 0, 5, -0.2),
    Point4d.create(4, 3, -2, 1)];
  public static createNonZeroVectors(): Vector3d[] {
    return [
      Vector3d.create(1, 0, 0),
      Vector3d.create(0, 1, 0),
      Vector3d.create(0, 0, 1),
      Vector3d.create(-1, 0, 0),
      Vector3d.create(0, -1, 0),
      Vector3d.create(0, 0, -1),
      Vector3d.createPolar(1.0, Angle.createDegrees(20)),
      Vector3d.createSpherical(1.0, Angle.createDegrees(20), Angle.createDegrees(10)),
      Vector3d.createPolar(2.0, Angle.createDegrees(20)),
      Vector3d.createSpherical(2.0, Angle.createDegrees(20), Angle.createDegrees(10)),
      Vector3d.create(2, 3, 0)];
  }
  public static readonly vector2d: Vector2d[] = [
    Vector2d.create(1, 0),
    Vector2d.create(0, 1),
    Vector2d.create(0, 0),
    Vector2d.create(-1, 0),
    Vector2d.create(0, -1),
    Vector2d.create(0, 0),
    Vector2d.createPolar(1.0, Angle.createDegrees(20)),
    Vector2d.createPolar(2.0, Angle.createDegrees(20)),
    Vector2d.create(2, 3)];

  public static createRange3ds(): Range3d[] {
    return [
      Range3d.createXYZXYZ(0, 0, 0, 1, 1, 1),
      Range3d.createXYZ(1, 2, 3),
      Range3d.createXYZXYZ(-2, -3, 1, 200, 301, 8)];
  }
  public static createRectangleXY(x0: number, y0: number, ax: number, ay: number, z: number = 0): Point3d[] {
    return [
      Point3d.create(x0, y0, z),
      Point3d.create(x0 + ax, y0, z),
      Point3d.create(x0 + ax, y0 + ay, z),
      Point3d.create(x0, y0 + ay, z),
      Point3d.create(x0, y0, z),
    ];
  }
  public static createUnitCircle(numPoints: number): Point3d[] {
    const points: Point3d[] = [];
    const dTheta = Geometry.safeDivideFraction(Math.PI * 2, numPoints - 1, 0.0);
    for (let i = 0; i < numPoints; i++) {
      const theta = i * dTheta;
      points.push(Point3d.create(Math.cos(theta), Math.sin(theta), 0.0));
    }
    return points;
  }
  // Get an "L" shape with lower left at x0,y0.   ax,ay are larger side lengths (outer rectangle, bx,by are smaller box to corner
  public static createLShapedPolygon(x0: number, y0: number, ax: number, ay: number, bx: number, by: number, z: number = 0): Point3d[] {
    return [
      Point3d.create(x0, y0, z),
      Point3d.create(x0 + ax, y0, z),
      Point3d.create(x0 + ax, y0 + by),
      Point3d.create(x0 + bx, y0 + by),
      Point3d.create(x0 + bx, y0 + ay, z),
      Point3d.create(x0, y0 + ay, z),
      Point3d.create(x0, y0, z),
    ];
  }
  public static createClipPlanes(): ClipPlane[] {
    const plane0 = ClipPlane.createNormalAndDistance(Vector3d.create(1, 0, 0), 2.0)!;
    const plane1 = plane0.cloneNegated();
    const plane2 = plane1.clone();
    plane2.setFlags(true, true);
    return [
      plane0, plane1, plane2,
      ClipPlane.createNormalAndDistance(Vector3d.create(3, 4, 0), 2.0)!,
      ClipPlane.createEdgeXY(Point3d.create(1, 0, 0), Point3d.create(24, 32, 0))!];
  }

  /**
   * * A first-quadrant unit square
   * * Two squares -- first and fourth quadrant unit squares
   * * Three squares -- first, second and fourtn quarant unit squares
   */
  public static createClipPlaneSets(): UnionOfConvexClipPlaneSets[] {
    const result = [];
    const quadrant1 = ConvexClipPlaneSet.createXYBox(0, 0, 1, 1);
    result.push(UnionOfConvexClipPlaneSets.createConvexSets([quadrant1.clone()]));
    const quadrant2 = ConvexClipPlaneSet.createXYBox(-1, 0, 0, 1);
    const quadrant4 = ConvexClipPlaneSet.createXYBox(0, -1, 1, 0);

    result.push(UnionOfConvexClipPlaneSets.createConvexSets([
      quadrant1.clone(),
      quadrant4.clone()]));
    result.push(UnionOfConvexClipPlaneSets.createConvexSets([
      quadrant1.clone(),
      quadrant2.clone(),
      quadrant4.clone()]));
    return result;
  }
  /** Create (unweighted) bspline curves.
   * order varies from 2 to 5
   */
  public static createBsplineCurves(includeMultipleKnots: boolean = false): BSplineCurve3d[] {
    const result: BSplineCurve3d[] = [];
    const yScale = 0.1;
    for (const order of [2, 3, 4, 5]) {
      const points = [];
      for (const x of [0, 1, 2, 3, 4, 5, 7]) {
        points.push(Point3d.create(x, yScale * (1 + x * x), 0.0));
      }
      const curve = BSplineCurve3d.createUniformKnots(points, order) as BSplineCurve3d;
      result.push(curve);
    }
    if (includeMultipleKnots) {
      const interiorKnotCandidates = [1, 2, 2, 3, 4, 5, 5, 6, 7, 7, 8];
      for (const order of [3, 4]) {
        const numPoints = 8;
        const points = [];
        for (let i = 0; i < numPoints; i++)
          points.push(Point3d.create(i, i * i, 0));
        const knots = [];
        for (let i = 0; i < order - 1; i++) knots.push(0);
        const numInteriorNeeded = numPoints - order;
        for (let i = 0; i < numInteriorNeeded; i++)knots.push(interiorKnotCandidates[i]);
        const lastKnot = knots[knots.length - 1] + 1;
        for (let i = 0; i < order - 1; i++) knots.push(lastKnot);
        const curve = BSplineCurve3d.create(points, knots, order);
        if (curve)
          result.push(curve);
      }
    }
    return result;
  }
  /** Create weighted bspline curves.
   * order varies from 2 to 5
   */
  public static createBspline3dHCurves(): BSplineCurve3dH[] {
    const result: BSplineCurve3dH[] = [];
    const yScale = 0.1;
    for (const weightVariation of [0, 0.125]) {
      for (const order of [2, 3, 4, 5]) {
        const points = [];
        for (const x of [0, 1, 2, 3, 4, 5, 7]) {
          points.push(Point4d.create(x, yScale * (1 + x * x), 0.0, 1.0 + weightVariation * Math.sin(x * Math.PI * 0.25)));
        }
        const curve = BSplineCurve3dH.createUniformKnots(points, order) as BSplineCurve3dH;
        result.push(curve);
      }
    }
    return result;
  }

  /** Create weighted bsplines for circular arcs.
   */
  public static createBspline3dHArcs(): BSplineCurve3dH[] {
    const result: BSplineCurve3dH[] = [];
    const halfRadians = Angle.degreesToRadians(60.0);
    const c = Math.cos(halfRadians);
    const s = Math.sin(halfRadians);
    // const sec = 1.0 / c;
    // const t = s / c;
    const points = [
      Point4d.create(1, 0, 0, 1),
      Point4d.create(c, s, 0, c),
      Point4d.create(-c, s, 0, 1),
      Point4d.create(-1, 0, 0, c),
      Point4d.create(-c, -s, 0, 1),
      Point4d.create(c, -s, 0, c),
      Point4d.create(1, 0, 0, 1)];
    const knots = [0, 0, 1, 1, 2, 2, 3, 3];

    const curve = BSplineCurve3dH.create(points, knots, 3) as BSplineCurve3dH;
    result.push(curve);
    return result;
  }

  /**
   * Create both unweigthed and weighted bspline curves.
   * (This is the combined results from createBsplineCurves and createBspline3dHCurves)
   */
  public static createMixedBsplineCurves(): BSplineCurve3dBase[] {
    const arrayA = Sample.createBsplineCurves();
    const arrayB = Sample.createBspline3dHCurves();
    const result = [];
    for (const a of arrayA) result.push(a);
    for (const b of arrayB) result.push(b);
    return result;
  }

  // create a plane from origin and normal coordinates -- default to 001 normal if needed.
  public static createPlane(x: number, y: number, z: number, u: number, v: number, w: number): Plane3dByOriginAndUnitNormal {
    const point = Point3d.create(x, y, z);
    const vector = Vector3d.create(u, v, w).normalize();
    if (vector) {
      const plane = Plane3dByOriginAndUnitNormal.create(point, vector);
      if (plane)
        return plane;
    }
    return Sample.createPlane(x, y, z, u, v, 1);
  }

  // create a ray with unit direction vector --- no test for 000 vector
  public static createRay(x: number, y: number, z: number, u: number, v: number, w: number): Ray3d {
    return Ray3d.create(
      Point3d.create(x, y, z),
      Vector3d.create(u, v, w).normalize() as Vector3d);
  }
  public static readonly plane3dByOriginAndUnitNormal: Plane3dByOriginAndUnitNormal[] = [
    Plane3dByOriginAndUnitNormal.createXYPlane(),
    Plane3dByOriginAndUnitNormal.createYZPlane(),
    Plane3dByOriginAndUnitNormal.createZXPlane(),
    Sample.createPlane(0, 0, 0, 3, 0, 1),
    Sample.createPlane(1, 2, 3, 2, 4, -1)];

  public static readonly ray3d: Ray3d[] = [
    Sample.createRay(0, 0, 0, 1, 0, 0),
    Sample.createRay(0, 0, 0, 0, 1, 0),
    Sample.createRay(0, 0, 0, 0, 0, 1),
    Sample.createRay(0, 0, 0, 1, 2, 0),
    Sample.createRay(1, 2, 3, 4, 2, -1)];

  public static readonly angle: Angle[] = [
    Angle.createDegrees(0),
    Angle.createDegrees(90),
    Angle.createDegrees(180),
    Angle.createDegrees(-90),
    Angle.createDegrees(30),
    Angle.createDegrees(-105)];

  public static readonly angleSweep: AngleSweep[] = [
    AngleSweep.createStartEndDegrees(0, 90),
    AngleSweep.createStartEndDegrees(0, 180),
    AngleSweep.createStartEndDegrees(-90, 0),
    AngleSweep.createStartEndDegrees(0, -90),
    AngleSweep.createStartEndDegrees(0, 30),
    AngleSweep.createStartEndDegrees(45, 110)];

  public static readonly lineSegment3d: LineSegment3d[] = [
    LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(1, 0, 0)),
    LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(0, 1, 0)),
    LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(0, 0, 1)),
    LineSegment3d.create(Point3d.create(1, 2, 3), Point3d.create(-2, -3, 0.5))];

  public static createLineStrings(): LineString3d[] {
    return [
      LineString3d.createPoints(
        [
          Point3d.create(0, 0, 0),
          Point3d.create(1, 0, 0)]),
      LineString3d.createPoints(
        [
          Point3d.create(0, 0, 0),
          Point3d.create(1, 0, 0),
          Point3d.create(1, 1, 0)]),
      LineString3d.createPoints(
        [
          Point3d.create(0, 0, 0),
          Point3d.create(1, 0, 0),
          Point3d.create(1, 1, 0),
          Point3d.create(2, 2, 0)])];
  }

  public static readonly range1d: Range1d[] = [
    Range1d.createX(1),
    Range1d.createNull(),
    Range1d.createXX(1, 2),
    Range1d.createXX(2, 1)];
  public static readonly range2d: Range2d[] = [
    Range2d.createXY(1, 2),
    Range2d.createNull(),
    Range2d.createXYXY(1, 2, 0, 3),
    Range2d.createXYXY(1, 2, 3, 4)];
  public static readonly range3d: Range3d[] = [
    Range3d.createXYZ(1, 2, 3),
    Range3d.createNull(),
    Range3d.createXYZXYZ(1, 2, 0, 3, 4, 7),
    Range3d.createXYZXYZ(1, 2, 3, -2, -4, -1)];
  public static createMatrix3dArray(): Matrix3d[] {
    return [
      Matrix3d.createIdentity(),
      Matrix3d.createRotationAroundVector(
        Vector3d.create(1, 0, 0), Angle.createDegrees(10)) as Matrix3d,
      Matrix3d.createRotationAroundVector(
        Vector3d.create(1, -2, 5), Angle.createDegrees(-6.0)) as Matrix3d,

      Matrix3d.createUniformScale(2.0),
      Matrix3d.createRotationAroundVector(
        Vector3d.create(1, 2, 3), Angle.createDegrees(49.0)) as Matrix3d,
      Matrix3d.createScale(1, 1, -1),
      Matrix3d.createScale(2, 3, 4)];
  }
  public static createInvertibleTransforms(): Transform[] {
    return [
      Transform.createIdentity(),
      Transform.createTranslationXYZ(1, 2, 0),
      Transform.createTranslationXYZ(1, 2, 3),
      Transform.createFixedPointAndMatrix(
        Point3d.create(4, 1, -2),
        Matrix3d.createUniformScale(2.0)),
      Transform.createFixedPointAndMatrix(
        Point3d.create(4, 1, -2),
        Matrix3d.createRotationAroundVector(
          Vector3d.create(1, 2, 3), Angle.createRadians(10)) as Matrix3d)];
  }

  /** Return an array of Matrix3d with various skew and scale.  This includes at least:
   * * identity
   * * 3 disinct diagonals.
   * * The distinct diagonal base with smaller value added to
   *    other 6 spots in succession.
   * * the distinct diagonals with all others also smaller nonzeros.
   */
  public static createScaleSkewMatrix3d(): Matrix3d[] {
    return [
      Matrix3d.createRowValues(
        1, 0, 0,
        0, 1, 0,
        0, 0, 1),
      Matrix3d.createRowValues(
        5, 0, 0,
        0, 6, 0,
        0, 0, 7),
      Matrix3d.createRowValues(
        5, 2, 0,
        0, 6, 0,
        0, 0, 7),
      Matrix3d.createRowValues(
        5, 0, 2,
        0, 6, 0,
        0, 0, 7),
      Matrix3d.createRowValues(
        5, 0, 0,
        1, 6, 0,
        0, 0, 7),
      Matrix3d.createRowValues(
        5, 0, 0,
        0, 6, 1,
        0, 0, 7),
      Matrix3d.createRowValues(
        5, 0, 0,
        0, 6, 0,
        1, 0, 7),
      Matrix3d.createRowValues(
        5, 0, 0,
        0, 6, 0,
        0, 1, 7),
      Matrix3d.createRowValues(
        5, 2, 3,
        2, 6, 1,
        -1, 2, 7)];
  }

  /** Return an array of singular Matrix3d.  This includes at least:
   * * all zeros
   * * one nonzero column
   * * two independent columns, third is zero
   * * two independent columns, third is sum of those
   * * two independent columns, third is copy of one
   */
  public static createSingularMatrix3d(): Matrix3d[] {
    const vectorU = Vector3d.create(2, 3, 6);
    const vectorV = Vector3d.create(-1, 5, 2);
    const vectorUplusV = vectorU.plus(vectorV);
    const vector0 = Vector3d.createZero();
    return [
      Matrix3d.createZero(),
      // one nonzero column
      Matrix3d.createColumns(vectorU, vector0, vector0),
      Matrix3d.createColumns(vector0, vectorU, vector0),
      Matrix3d.createColumns(vector0, vector0, vector0),
      // two independent nonzero columns with zero
      Matrix3d.createColumns(vectorU, vectorV, vector0),
      Matrix3d.createColumns(vector0, vectorU, vectorV),
      Matrix3d.createColumns(vectorV, vector0, vector0),
      // third column dependent
      Matrix3d.createColumns(vectorU, vectorV, vectorUplusV),
      Matrix3d.createColumns(vectorU, vectorUplusV, vectorV),
      Matrix3d.createColumns(vectorUplusV, vectorV, vectorU),
      // two independent with duplicate
      Matrix3d.createColumns(vectorU, vectorV, vectorU),
      Matrix3d.createColumns(vectorU, vectorU, vectorV),
      Matrix3d.createColumns(vectorV, vectorV, vectorU)];
  }

  /**
   * Return an array of rigid transforms.  This includes (at least)
   * * Identity
   * * translation with identity matrix
   * * rotation around origin and arbitrary vector
   * * rotation around space point and arbitrary vector
   */
  public static createRigidTransforms(): Transform[] {
    return [
      Transform.createIdentity(),
      Transform.createTranslationXYZ(1, 2, 3),
      Transform.createFixedPointAndMatrix(
        Point3d.create(0, 0, 0),
        Matrix3d.createRotationAroundVector(
          Vector3d.unitY(), Angle.createDegrees(10)) as Matrix3d),
      Transform.createFixedPointAndMatrix(
        Point3d.create(4, 1, -2),
        Matrix3d.createRotationAroundVector(
          Vector3d.create(1, 2, 3), Angle.createDegrees(10)) as Matrix3d)];
  }
  /**
   * Return a single rigid transform with all terms nonzero.
   */
  public static createMessyRigidTransform(fixedPoint?: Point3d): Transform {
    return Transform.createFixedPointAndMatrix(
      fixedPoint ? fixedPoint : Point3d.create(1, 2, 3),
      Matrix3d.createRotationAroundVector(Vector3d.create(0.3, -0.2, 1.2), Angle.createDegrees(15.7))!);
  }
  public static createRigidAxes(): Matrix3d[] {
    return [
      Matrix3d.createIdentity(),
      Matrix3d.createRotationAroundVector(
        Vector3d.unitY(), Angle.createDegrees(10)) as Matrix3d,
      Matrix3d.createRotationAroundVector(
        Vector3d.create(1, 2, 3), Angle.createDegrees(10)) as Matrix3d,
    ];
  }

  // promote each transform[] to a Matrix4d.
  public static createMatrix4ds(includeIrregular: boolean = false): Matrix4d[] {
    const result = [];
    let transform;
    for (transform of Sample.createInvertibleTransforms())
      result.push(Matrix4d.createTransform(transform));
    if (includeIrregular) {
      result.push(Matrix4d.createRowValues(
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16));
    }
    return result;
  }
  public static createMap4ds(): Map4d[] {
    const result = [];
    let transform;
    for (transform of Sample.createInvertibleTransforms()) {
      const inverse = transform.inverse();
      if (inverse) {
        const map = Map4d.createTransform(transform, inverse);
        if (map)
          result.push(map);
      }
    }
    return result;
  }
  public static createSimplePaths(withGaps: boolean = false): Path[] {
    const p1 = [[Point3d.create(0, 10, 0)], [Point3d.create(6, 10, 0)], [Point3d.create(6, 10, 1), [Point3d.create(0, 10, 0)]]];
    const point0 = Point3d.create(0, 0, 0);
    const point1 = Point3d.create(10, 0, 0);
    const segment1 = LineSegment3d.create(point0, point1);
    const vectorU = Vector3d.unitX(3);
    const vectorV = Vector3d.unitY(3);
    const arc2 = Arc3d.create(point1.minus(vectorU), vectorU, vectorV, AngleSweep.createStartEndDegrees(0, 90));
    const simplePaths = [
      Path.create(segment1),
      Path.create(segment1, arc2),
      Path.create(
        LineSegment3d.create(point0, point1),
        LineString3d.create(
          Point3d.create(10, 0, 0),
          Point3d.create(10, 5, 0)),
        LineString3d.create(p1)),
      Sample.createCappedArcPath(4, 0, 180),
    ];
    if (withGaps)
      simplePaths.push(
        Path.create(
          LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(10, 0, 0)),
          LineSegment3d.create(Point3d.create(10, 10, 0), Point3d.create(5, 0, 0))));

    return simplePaths;
  }

  public static createSimplePointStrings(): PointString3d[] {
    const p1 = [[Point3d.create(0, 10, 0)], [Point3d.create(6, 10, 0)], [Point3d.create(6, 10, 0), [Point3d.create(6, 10, 0)]]];
    const simplePaths = [
      PointString3d.create(Point3d.create(1, 2, 0)),
      PointString3d.create(Point3d.create(0, 0, 0), Point3d.create(10, 0, 0)),
      PointString3d.create(
        Point3d.create(10, 0, 0),
        Point3d.create(10, 5, 0)),
      PointString3d.create(p1)];

    return simplePaths;
  }

  public static createSimpleLoops(): Loop[] {
    const point0 = Point3d.create(0, 0, 0);
    const point1 = Point3d.create(10, 0, 0);
    const point2 = Point3d.create(10, 5, 0);
    const point3 = Point3d.create(0, 5, 0);
    const result = [
      // rectangle with single linestring
      Loop.create(LineString3d.create(point0, point1, point2, point3, point0)),
      // unit circle
      Loop.create(Arc3d.createUnitCircle()),
      // rectangle, but with individual line segments
      Loop.create(
        LineSegment3d.create(point0, point1),
        LineSegment3d.create(point1, point2),
        LineSegment3d.create(point2, point3),
        LineSegment3d.create(point3, point0),
      ),
      // Semicircle
      Sample.createCappedArcLoop(4, -90, 90),
    ];
    return result;
  }
  /**
   *
   * @param dx0 distance along x axis at y=0
   * @param dy vertical rise
   * @param dx1 distance along x axis at y=dy
   * @param numPhase number of phases of the jump.
   * @param dyReturn y value for return to origin.  If 0, the wave ends at y=0 after then final "down" with one extra horizontal dx0
   *     If nonzero, rise to that y value, return to x=0, and return down to origin.
   *
   */
  public static createSquareWave(origin: Point3d, dx0: number, dy: number, dx1: number, numPhase: number, dyReturn: number): Point3d[] {
    const result = [origin.clone()];
    for (let i = 0; i < numPhase; i++) {
      pushMove(result, dx0, 0);
      pushMove(result, 0, dy);
      pushMove(result, dx1, 0);
      pushMove(result, 0, -dy);
    }
    pushMove(result, dx0, 0);
    if (dyReturn !== 0.0) {
      pushMove(result, 0, dyReturn);
      result.push(Point3d.create(0, dyReturn));
      result.push(result[0].clone());
    }
    return result;
  }
  /** append to a linestring, taking steps along given vector directions
   * If the linestring is empty, a 000 point is added.
   * @param linestring LineString3d to receive points.
   * @param numPhase number of phases of the sawtooth
   * @param vectors any number of vector steps.
   */
  public static appendPhases(linestring: LineString3d, numPhase: number, ...vectors: Vector3d[]): void {
    const tailPoint = linestring.endPoint(); // and this defaults to 000 . ..
    if (linestring.numPoints() === 0)
      linestring.addPoint(tailPoint);

    for (let i = 0; i < numPhase; i++) {
      for (const v of vectors) {
        tailPoint.addInPlace(v);
        linestring.addPoint(tailPoint);
      }
    }
  }

  public static createSimpleXYPointLoops(): Point3d[][] {
    const result = [];
    result.push(Sample.createRectangleXY(0, 0, 1, 1));
    result.push(Sample.createRectangleXY(0, 0, 4, 3));
    result.push(Sample.createLShapedPolygon(0, 0, 5, 4, 1, 2));
    return result;
  }
  public static createSimpleParityRegions(): ParityRegion[] {
    const pointC = Point3d.create(-5, 0, 0);
    const point0 = Point3d.create(0, 0, 0);
    const point1 = Point3d.create(1, 2, 0);
    const point2 = Point3d.create(6, 4, 0);
    const ax = 10.0;
    const ay = 8.0;
    const bx = 3.0;
    const by = 2.0;
    const r2 = 0.5;
    const result = [
      ParityRegion.create(
        Loop.create(
          Arc3d.createXY(pointC, 2.0)),
        Loop.create(Arc3d.createXY(pointC, 1.0))),
      ParityRegion.create(
        Loop.create(LineString3d.createRectangleXY(point0, ax, ay)),
        Loop.create(LineString3d.createRectangleXY(point1, bx, by))),
      ParityRegion.create(
        Loop.create(LineString3d.createRectangleXY(point0, ax, ay)),
        Loop.create(LineString3d.createRectangleXY(point1, bx, by)),
        Loop.create(Arc3d.createXY(point2, r2))),
    ];
    return result;
  }

  public static createSimpleUnions(): UnionRegion[] {
    const parityRegions = Sample.createSimpleParityRegions();
    const loops = Sample.createSimpleLoops();
    const result = [
      UnionRegion.create(loops[0], parityRegions[0]),
    ];
    return result;
  }
  public static createBagOfCurves(): BagOfCurves[] {
    const parityRegions = Sample.createSimpleParityRegions();
    const loops = Sample.createSimpleLoops();
    const result = [
      BagOfCurves.create(loops[0], parityRegions[0], LineSegment3d.createXYXY(0, 1, 4, 2, 1)),
      // a bag with just an arc
      BagOfCurves.create(Arc3d.createUnitCircle()),
      // a bag with just a line segment
      BagOfCurves.create(LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(1, 1, 0))),
      // a bag with just a linestring
      BagOfCurves.create(LineString3d.create(Point3d.create(0, 0, 0), Point3d.create(1, 1, 0), Point3d.create(2, 1, 0))),
    ];
    return result;
  }

  public static createSmoothCurvePrimitives(size: number = 1.0): CurvePrimitive[] {
    const alpha = 0.1;
    const beta = 0.3;
    return [
      LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(size, 0, 0)),
      LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(size, size, 0)),
      Arc3d.create(
        Point3d.create(0, 0, 0),
        Vector3d.create(size, 0, 0),
        Vector3d.create(0, size, 0),
        AngleSweep.createStartEndDegrees(0, 90)) as Arc3d,
      Arc3d.create(
        Point3d.create(0, 0, 0),
        Vector3d.create(size, 0, 0),
        Vector3d.create(0, size, 0),
        AngleSweep.createStartEndDegrees(-40, 270)) as Arc3d,
      Arc3d.create(
        Point3d.create(0, 0, 0),
        Vector3d.create(size, alpha * size, 0),
        Vector3d.create(-alpha * beta * size, beta * size, 0),
        AngleSweep.createStartEndDegrees(-40, 270)) as Arc3d,
    ];
  }
  public static createSimpleIndexedPolyfaces(gridMultiplier: number): IndexedPolyface[] {
    return [
      Sample.createTriangularUnitGridPolyface(
        Point3d.create(),
        Vector3d.unitX(),
        Vector3d.unitY(),
        gridMultiplier * 3, 2 * gridMultiplier, false, false, false),
      Sample.createTriangularUnitGridPolyface(
        Point3d.create(),
        Vector3d.unitX(),
        Vector3d.unitY(),
        3 * gridMultiplier, 2 * gridMultiplier, true, false, false),
      Sample.createTriangularUnitGridPolyface(
        Point3d.create(),
        Vector3d.unitX(),
        Vector3d.unitY(),
        3 * gridMultiplier, 2 * gridMultiplier, false, true, false),
      Sample.createTriangularUnitGridPolyface(
        Point3d.create(),
        Vector3d.unitX(),
        Vector3d.unitY(),
        3 * gridMultiplier, 2 * gridMultiplier, false, false, true),
      Sample.createTriangularUnitGridPolyface(
        Point3d.create(),
        Vector3d.unitX(),
        Vector3d.unitY(),
        3 * gridMultiplier, 2 * gridMultiplier, true, true, true),
    ];
  }
  /**
   * Build a mesh that is a (possibly skewed) grid in a plane.
   * @param origin "lower left" coordinate
   * @param vectorX step in "X" direction
   * @param vectorY step in "Y" direction
   * @param numXVertices number of vertices in X direction
   * @param numYVertices number of vertices in y direction
   * @param createParams true to create parameters, with paramter value `(i,j)` for point at (0 based) vertex in x,y directions
   * @param createNormals true to create a (single) normal indexed from all facets
   * @param createColors true to create a single color on each quad.  (shared between its triangles)
   * @note edgeVisible is false only on the diagonals
   */
  public static createTriangularUnitGridPolyface(origin: Point3d, vectorX: Vector3d, vectorY: Vector3d,
    numXVertices: number, numYVertices: number, createParams: boolean = false, createNormals: boolean = false, createColors: boolean = false): IndexedPolyface {
    const mesh = IndexedPolyface.create(createNormals, createParams, createColors);
    const normal = vectorX.crossProduct(vectorY);
    if (createNormals) {
      normal.normalizeInPlace();
      mesh.addNormalXYZ(normal.x, normal.y, normal.z);  // use XYZ to help coverage count!!
    }

    // Push to point array
    for (let j = 0; j < numYVertices; j++) {
      for (let i = 0; i < numXVertices; i++) {
        mesh.addPoint(origin.plus2Scaled(vectorX, i, vectorY, j));
        if (createParams)
          mesh.addParamXY(i, j);
      }
    }
    let color = 10; // arbitrrily start at color 10 so colorIndex is different from color.
    // Push elements to index array (vertices are calculated using i and j positioning for each point)
    let thisColorIndex = 0;
    for (let j = 0; j + 1 < numYVertices; j++) {
      for (let i = 0; i + 1 < numXVertices; i++) {
        const vertex00 = numXVertices * j + i;
        const vertex10 = vertex00 + 1;
        const vertex01 = vertex00 + numXVertices;
        const vertex11 = vertex01 + 1;
        // Push lower triangle
        mesh.addPointIndex(vertex00, true);
        mesh.addPointIndex(vertex10, true);
        mesh.addPointIndex(vertex11, false);
        // make color === faceIndex
        if (createColors) {
          thisColorIndex = mesh.addColor(color++);
          mesh.addColorIndex(thisColorIndex);
          mesh.addColorIndex(thisColorIndex);
          mesh.addColorIndex(thisColorIndex);
        }
        // param indexing matches points .  .
        if (createParams) {
          mesh.addParamIndex(vertex00);
          mesh.addParamIndex(vertex10);
          mesh.addParamIndex(vertex11);
        }

        if (createNormals) {
          mesh.addNormalIndex(0);
          mesh.addNormalIndex(0);
          mesh.addNormalIndex(0);
        }
        mesh.terminateFacet(false);

        // upper triangle
        mesh.addPointIndex(vertex11, true);
        mesh.addPointIndex(vertex01, true);
        mesh.addPointIndex(vertex00, false);
        // make color === faceIndex
        if (createColors) {
          mesh.addColorIndex(thisColorIndex);
          mesh.addColorIndex(thisColorIndex);
          mesh.addColorIndex(thisColorIndex);
        }
        // param indexing matches points.
        if (createParams) {
          mesh.addParamIndex(vertex11);
          mesh.addParamIndex(vertex01);
          mesh.addParamIndex(vertex00);
        }
        if (createNormals) {
          mesh.addNormalIndex(0);
          mesh.addNormalIndex(0);
          mesh.addNormalIndex(0);
        }
        mesh.terminateFacet(false);
      }
    }
    return mesh;
  }
  public static createXYGrid(numU: number, numV: number, dX: number = 1.0, dY: number = 1.0): Point3d[] {
    const points = [];
    for (let j = 0; j < numV; j++) {
      for (let i = 0; i < numU; i++) {
        points.push(Point3d.create(i * dX, j * dY, 0));
      }
    }
    return points;
  }
  public static createXYGridBsplineSurface(numU: number, numV: number, orderU: number, orderV: number): BSplineSurface3d | undefined {
    return BSplineSurface3d.create(
      Sample.createXYGrid(numU, numV, 1.0, 1.0), numU, orderU, undefined, numV, orderV, undefined);
  }
  /**
   * @param radiusU major radius
   * @param radiusV minor radius
   * @param numU number of facets around major hoop
   * @param numV number of facets around minor hoop
   * @param orderU major hoop order
   * @param orderV minor hoop order
   */
  public static createPseudoTorusBsplineSurface(radiusU: number, radiusV: number, numU: number, numV: number, orderU: number, orderV: number): BSplineSurface3d | undefined {
    const points = [];
    const numUPole = numU + orderU - 1;
    const numVPole = numV + orderV - 1;
    const uKnots = KnotVector.createUniformWrapped(numU, orderU - 1, 0, 1);
    const vKnots = KnotVector.createUniformWrapped(numV, orderV - 1, 0, 1);
    const dURadians = 2.0 * Math.PI / numU;
    const dVRadians = 2.0 * Math.PI / numV;
    for (let iV = 0; iV < numVPole; iV++) {
      const vRadians = iV * dVRadians;
      const cV = Math.cos(vRadians);
      const sV = Math.sin(vRadians);
      for (let iU = 0; iU < numUPole; iU++) {
        const uRadians = iU * dURadians;
        const cU = Math.cos(uRadians);
        const sU = Math.sin(uRadians);
        const rho = radiusU + cV * radiusV;
        points.push(Point3d.create(rho * cU, rho * sU, sV * radiusV));

      }
    }
    const result = BSplineSurface3d.create(points, numUPole, orderU, uKnots.knots, numVPole, orderV, vKnots.knots);
    if (result) {
      result.setWrappable(0, BSplineWrapMode.OpenByAddingControlPoints);
      result.setWrappable(1, BSplineWrapMode.OpenByAddingControlPoints);
    }
    return result;
  }

  public static createWeightedXYGridBsplineSurface(
    numU: number, numV: number, orderU: number, orderV: number,
    weight00: number = 1.0,
    weight10: number = 1.0,
    weight01: number = 1.0,
    weight11: number = 1.0): BSplineSurface3dH | undefined {
    const xyzPoles = Sample.createXYGrid(numU, numV, 1.0, 1.0);
    const weights = [];
    for (let i = 0; i < numU; i++)
      for (let j = 0; j < numV; j++) {
        const wu0 = Geometry.interpolate(weight00, i / (numU - 1), weight10);
        const wu1 = Geometry.interpolate(weight01, i / (numU - 1), weight11);
        weights.push(Geometry.interpolate(wu0, j / (numV - 1), wu1));
      }

    return BSplineSurface3dH.create(xyzPoles,
      weights,
      numU, orderU, undefined,
      numV, orderV, undefined);
  }

  public static createSimpleLinearSweeps(): LinearSweep[] {
    const result: LinearSweep[] = [];
    const base = Loop.create(LineString3d.createRectangleXY(Point3d.create(), 2, 3));
    const vectorZ = Vector3d.create(0, 0, 1.234);
    const vectorQ = Vector3d.create(0.1, 0.21, 1.234);
    result.push(LinearSweep.create(base, vectorZ, false) as LinearSweep);
    result.push(LinearSweep.create(base, vectorZ, true) as LinearSweep);
    result.push(LinearSweep.create(base, vectorQ, false) as LinearSweep);
    result.push(LinearSweep.create(base, vectorQ, true) as LinearSweep);
    result.push(LinearSweep.create(Sample.createCappedArcLoop(5, -45, 90), vectorQ, true) as LinearSweep);
    for (const curve of Sample.createSmoothCurvePrimitives()) {
      const path = Path.create(curve);
      result.push(LinearSweep.create(path, vectorZ, false)!);
    }
    // coordinates for a clearly unclosed linestring ....
    const xyPoints = [
      Point2d.create(0, 0),
      Point2d.create(1, 0),
      Point2d.create(1, 1)];

    result.push(LinearSweep.createZSweep(xyPoints, 1, 3, false)!);
    // this forces artificial closure point . . .
    result.push(LinearSweep.createZSweep(xyPoints, 1, 3, true)!);

    // add a not-quite-exact closure point ...
    const e = 1.0e-11;
    xyPoints.push(Point2d.create(e, e));
    result.push(LinearSweep.createZSweep(xyPoints, 1, 3, false)!);
    result.push(LinearSweep.createZSweep(xyPoints, 1, 3, true)!);
    // make it a better closure
    xyPoints.pop();
    xyPoints.push(xyPoints[0]);
    result.push(LinearSweep.createZSweep(xyPoints, 1, 3, false)!);
    result.push(LinearSweep.createZSweep(xyPoints, 1, 3, true)!);
    // negative sweep ...
    result.push(LinearSweep.createZSweep(xyPoints, 1, -3, true)!);
    return result;
  }
  /**
   * Create an array of primitives with an arc centerd at origin and a line segment closing back to the arc start.
   * This can be bundled into Path or Loop by caller.
   */
  public static createCappedArcPrimitives(radius: number, startDegrees: number, endDegrees: number): CurvePrimitive[] {
    const arc = Arc3d.create(
      Point3d.create(0, 0, 0),
      Vector3d.unitX(radius),
      Vector3d.unitY(radius),
      AngleSweep.createStartEndDegrees(startDegrees, endDegrees));
    return [arc, LineSegment3d.create(arc.fractionToPoint(0.0), arc.fractionToPoint(1.0))];
  }
  /** Return a Path structure for a segment of arc, with closure segment */
  public static createCappedArcPath(radius: number, startDegrees: number, endDegrees: number): Path {
    return Path.createArray(Sample.createCappedArcPrimitives(radius, startDegrees, endDegrees));
  }
  /** Return a Loop structure for a segment of arc, with closure segment */
  public static createCappedArcLoop(radius: number, startDegrees: number, endDegrees: number): Loop {
    return Loop.createArray(Sample.createCappedArcPrimitives(radius, startDegrees, endDegrees));
  }

  public static createSimpleRotationalSweeps(): RotationalSweep[] {
    const result: RotationalSweep[] = [];
    // rectangle in xy plane
    const base = Loop.create(LineString3d.createRectangleXY(Point3d.create(1, 0, 0), 2, 3));
    // rotate around the y axis
    for (const axis of [
      Ray3d.createXYZUVW(0, 0, 0, 0, 1, 0),
      Ray3d.createXYZUVW(5, 0, 0, 0, 1, 0),
      Ray3d.createXYZUVW(-1, 0, 0, -1, 1, 0)]) {
      result.push(RotationalSweep.create(base, axis, Angle.createDegrees(120.0), false) as RotationalSweep);
      result.push(RotationalSweep.create(base, axis, Angle.createDegrees(150.0), true) as RotationalSweep);
    }

    return result;
  }

  public static createSpheres(includeEllipsoidal: boolean = false): Sphere[] {
    const result: Sphere[] = [];
    result.push(Sphere.createCenterRadius(Point3d.create(0, 0, 0), 1.0));
    result.push(Sphere.createCenterRadius(Point3d.create(1, 2, 3), 3.0));
    const s1 = Sphere.createCenterRadius(Point3d.create(1, 2, 3), 2.0,
      AngleSweep.createStartEndDegrees(-45, 80));
    s1.capped = true;
    result.push(s1);
    // still a sphere, but with axes KIJ . .
    const s2 = Sphere.createFromAxesAndScales(
      Point3d.create(1, 2, 3),
      Matrix3d.createRowValues(
        0, 1, 0,
        0, 0, 1,
        1, 0, 0),
      4, 4, 4,
      AngleSweep.createStartEndDegrees(-45, 45), true)!;
    result.push(s2);
    if (includeEllipsoidal)
      result.push(Sphere.createDgnSphere(
        Point3d.create(1, 2, 3),
        Vector3d.unitX(),
        Vector3d.unitZ(), 3, 2, AngleSweep.createFullLatitude(), false)!);
    return result;
  }
  // These are promised to be non-spherical than DGN sphere accepts . . .
  public static createEllipsoids(): Sphere[] {
    return [
      Sphere.createEllipsoid(
        Transform.createOriginAndMatrix(
          Point3d.create(0, 0, 0),
          Matrix3d.createRowValues(
            4, 1, 1,
            1, 4, 1,
            0.5, 0.2, 5)),
        AngleSweep.createFullLatitude(),
        true)!];
  }

  public static createCones(): Cone[] {
    const result: Cone[] = [];
    const origin = Point3d.create(0, 0, 0);
    const topZ = Point3d.create(0, 0, 5);
    const centerA = Point3d.create(1, 2, 1);
    const centerB = Point3d.create(2, 3, 8);
    result.push(Cone.createAxisPoints(centerA, centerB, 0.5, 0.5, false) as Cone);
    result.push(Cone.createAxisPoints(origin, topZ, 1.0, 0.2, true) as Cone);
    result.push(Cone.createAxisPoints(centerA, centerB, 0.2, 0.5, false) as Cone);
    result.push(Cone.createAxisPoints(origin, centerB, 1.0, 0.0, false) as Cone);
    result.push(Cone.createAxisPoints(topZ, origin, 0.0, 1.0, true) as Cone);
    return result;
  }

  public static createTorusPipes(): TorusPipe[] {
    const result: TorusPipe[] = [];
    const center = Point3d.create(1, 50, 3);

    const frame = Matrix3d.createRotationAroundVector(
      Vector3d.create(1, 2, 3), Angle.createRadians(10)) as Matrix3d;
    const vectorX = frame.columnX();
    const vectorY = frame.columnY();
    const vectorZ = frame.columnZ();
    result.push(TorusPipe.createInFrame(Transform.createIdentity(), 5.0, 0.8, Angle.create360(), false)!);
    result.push(TorusPipe.createDgnTorusPipe(center, vectorX, vectorY, 10, 1, Angle.createDegrees(180), true)!);

    result.push(TorusPipe.createDgnTorusPipe(center, vectorY, vectorZ, 10, 1, Angle.createDegrees(45), true) as TorusPipe);

    return result;
  }

  public static createBoxes(): Box[] {
    const result: Box[] = [];
    const cornerA = Point3d.create(1, 2, 3);
    const aX = 3.0;
    const aY = 2.0;
    const bX = 1.5;
    const bY = 1.0;
    const h = 5.0;
    const frame = Matrix3d.createRotationAroundVector(
      Vector3d.create(0, 0, 1), Angle.createDegrees(10)) as Matrix3d;
    const vectorX = frame.columnX();
    const vectorY = frame.columnY();
    const cornerB = Matrix3d.XYZPlusMatrixTimesCoordinates(cornerA, frame, 0, 0, h);
    result.push(Box.createDgnBox(cornerA, Vector3d.unitX(), Vector3d.unitY(),
      cornerB, aX, aY, aX, aY, true) as Box);

    result.push(Box.createDgnBox(cornerA, Vector3d.unitX(), Vector3d.unitY(),
      cornerB, aX, aY, bX, bY, true) as Box);
    result.push(Box.createDgnBox(cornerA, vectorX, vectorY, cornerB, aX, aY, bX, bY, true) as Box);

    const frameY = Matrix3d.createRotationAroundVector(
      Vector3d.create(0, 1, 0), Angle.createDegrees(10)) as Matrix3d;
    result.push(Box.createDgnBox(cornerA, frameY.columnX(), frameY.columnY(),
      cornerA.plusScaled(frameY.columnZ(), h), aX, aY, bX, bY, true) as Box);
    return result;
  }
  /** create an array of points for a rectangle with corners (x0,y0,z) and (x1,y1,z)
   */
  public static createRectangle(x0: number, y0: number, x1: number, y1: number, z: number = 0.0, closed: boolean = false): Point3d[] {
    const points = [
      Point3d.create(x0, y0, z),
      Point3d.create(x1, y0, z),
      Point3d.create(x1, y1, z),
      Point3d.create(x0, y1, z),
    ];
    if (closed)
      points.push(Point3d.create(x0, y0, z));
    return points;
  }
  public static createRuledSweeps(includeParityRegion: boolean = false, includeBagOfCurves: boolean = false): RuledSweep[] {
    const allSweeps = [];
    const contour0 = Loop.create(LineString3d.create(this.createRectangleXY(0, 0, 3, 2, 0)));
    const contour1 = Loop.create(LineString3d.create(this.createRectangleXY(0, 0, 3, 2.5, 2)));
    const contour2 = Loop.create(LineString3d.create(this.createRectangleXY(0, 0, 4, 3.5, 4)));
    const contour3 = Loop.create(LineString3d.create(this.createRectangleXY(0, 0, 2, 1, 7)));
    const allContours = [contour0, contour1, contour2];
    allSweeps.push(RuledSweep.create([contour0, contour1], true) as RuledSweep);
    allSweeps.push(RuledSweep.create([contour0, contour1, contour2], true) as RuledSweep);
    allSweeps.push(RuledSweep.create([contour0, contour1, contour2, contour3], true) as RuledSweep);
    allSweeps.push(RuledSweep.create(allContours, false) as RuledSweep);

    const curves = Sample.createSmoothCurvePrimitives();
    for (const c of curves) {
      const frame = c.fractionToFrenetFrame(0.0);
      if (frame) {
        const perpVector = frame.matrix.columnZ();
        perpVector.scaleInPlace(10.0);
        const c1 = c.cloneTransformed(Transform.createTranslation(perpVector)) as CurvePrimitive;
        allSweeps.push(RuledSweep.create([Path.create(c), Path.create(c1)], false)!);
      }
    }
    if (includeParityRegion) {
      const outer = Loop.create(LineString3d.create(this.createRectangleXY(0, 0, 5, 6, 0)));
      const inner = Loop.create(LineString3d.create(this.createRectangleXY(1, 1, 2, 3, 0)));
      const contourA = ParityRegion.create(outer, inner);
      const contourB = contourA.clone();
      contourB.tryTranslateInPlace(0, 0, 2);
      allSweeps.push(RuledSweep.create([contourA, contourB], false)!);
    }
    if (includeBagOfCurves) {
      const contourA = BagOfCurves.create(LineSegment3d.createXYZXYZ(1, 1, 0, 3, 1, 0));
      const contourB = BagOfCurves.create(LineSegment3d.createXYZXYZ(1, 1, 1, 3, 1, 1));
      allSweeps.push(RuledSweep.create([contourA, contourB], false)!);
    }

    return allSweeps;
  }
  /**
   *
   * @param a0 first entry
   * @param delta step between entries
   * @param n number of entries
   */
  public static createGrowableArrayCountedSteps(a0: number, delta: number, n: number): GrowableFloat64Array {
    const data = new GrowableFloat64Array(n);
    for (let i = 0; i < n; i++)
      data.push(a0 + i * delta);
    return data;
  }
  /**
   *
   * @param radius first entry
   * @param numEdge number of edges of chorded circle.  Angle step is 2PI/numEdge (whether or not closed)
   * @param closed true to include final point (i.e. return numEdge+1 points)
   */
  public static createGrowableArrayCirclePoints(radius: number, numEdge: number, closed: boolean = false,
    centerX: number = 0, centerY: number = 0, data?: GrowableXYZArray): GrowableXYZArray {
    if (!data) data = new GrowableXYZArray();
    data.ensureCapacity(numEdge + (closed ? 1 : 0));
    const delta = 2.0 * Math.PI / numEdge;
    for (let i = 0; i < numEdge; i++) {
      const radians = i * delta;
      data.push(Point3d.create(centerX + radius * Math.cos(radians), centerY + radius * Math.sin(radians)));
    }
    return data;
  }

  private static pushIfDistinct(points: Point3d[], xyz: Point3d, tol: number = 1.0e-12) {
    if (points.length === 0 || points[points.length - 1].distanceXY(xyz) > tol)
      points.push(xyz);
  }

  private static appendToFractalEval(points: Point3d[], pointA: Point3d, pointB: Point3d, pattern: Point2d[], numRecursion: number, perpendicularFactor: number) {
    const point0 = pointA.clone();
    Sample.pushIfDistinct(points, pointA);

    for (const uv of pattern) {
      const point1 = pointA.interpolatePerpendicularXY(uv.x, pointB, perpendicularFactor * uv.y);
      if (numRecursion > 0)
        Sample.appendToFractalEval(points, point0, point1, pattern, numRecursion - 1, perpendicularFactor);
      Sample.pushIfDistinct(points, point1);
      point0.setFrom(point1);
    }

    Sample.pushIfDistinct(points, pointB);
  }

  /**
   * For each edge of points, construct a transform (with scale, rotate, and translate) that spreads the patter out along the edge.
   * Repeat recursively for each edge
   * @returns Returns an array of recusively generated fractal points
   * @param poles level-0 (coarse) polygon whose edges are to be replaced by recursive fractals
   * @param pattern pattern to map to each edge of poles (and to edges of the recursion)
   * @param numRecursion  number of recursions
   * @param perpendicularFactor factor to apply to perpendicular sizing.
   */
  public static createRecursvieFractalPolygon(poles: Point3d[], pattern: Point2d[], numRecursion: number, perpendicularFactor: number): Point3d[] {
    const points: Point3d[] = [];
    Sample.pushIfDistinct(points, poles[0]);
    for (let i = 0; i + 1 < poles.length; i++) {
      if (numRecursion > 0)
        Sample.appendToFractalEval(points, poles[i], poles[i + 1], pattern, numRecursion - 1, perpendicularFactor);
      Sample.pushIfDistinct(points, poles[i + 1]);
    }
    return points;
  }

  /** Primary shape is a "triangle" with lower edge pushed in so it becomes a mild nonconvex quad.
   *  Fractal effects are gentle.
   */
  public static nonConvexQuadSimpleFractal(numRecursion: number, perpendicularFactor: number): Point3d[] {
    const pattern: Point2d[] = [
      Point2d.create(),
      Point2d.create(0.5, 0.1),
      Point2d.create(1.0, 0.0),
    ];
    const poles: Point3d[] = [
      Point3d.create(0, 0, 0),
      Point3d.create(0.6, 0.1, 0),
      Point3d.create(1, 0.1, 0),
      Point3d.create(0.6, 1, 0),
      Point3d.create(),
    ];
    return Sample.createRecursvieFractalPolygon(poles, pattern, numRecursion, perpendicularFactor);
  }

  /** Diamond with simple wave fractal */
  public static createFractalDiamonConvexPattern(numRecursion: number, perpendicularFactor: number): Point3d[] {
    const pattern: Point2d[] = [
      Point2d.create(),
      Point2d.create(0.3, 0.1),
      Point2d.create(0.5, 0.15),
      Point2d.create(0.7, 0.1),
      Point2d.create(1.0, 0.0),
    ];
    const poles: Point3d[] = [
      Point3d.create(0, -1, 0),
      Point3d.create(1, 0, 0),
      Point3d.create(0, 1, 0),
      Point3d.create(-1, 0, 0),
      Point3d.create(0, -1, 0),
    ];
    return Sample.createRecursvieFractalPolygon(poles, pattern, numRecursion, perpendicularFactor);
  }

  public static createFractalSquareReversingPattern(numRecursion: number, perpendicularFactor: number): Point3d[] {
    const pattern: Point2d[] = [
      Point2d.create(),
      Point2d.create(0.25, 0),
      Point2d.create(0.5, 0.2),
      Point2d.create(0.75, -0.1),
      Point2d.create(1.0, 0.0),
    ];
    const poles: Point3d[] = [
      Point3d.create(),
      Point3d.create(1, 0, 0),
      Point3d.create(1, 1, 0),
      Point3d.create(0, 1, 0),
      Point3d.create(0, 0, 0),
    ];
    return Sample.createRecursvieFractalPolygon(poles, pattern, numRecursion, perpendicularFactor);
  }

  public static createFractalLReversingPatterh(numRecursion: number, perpendicularFactor: number): Point3d[] {
    const pattern: Point2d[] = [
      Point2d.create(),
      Point2d.create(0.25, 0),
      Point2d.create(0.5, 0.2),
      Point2d.create(0.75, -0.1),
      Point2d.create(1.0, 0.0),
    ];
    const poles: Point3d[] = [
      Point3d.create(),
      Point3d.create(1, 0, 0),
      Point3d.create(1, 1, 0),
      Point3d.create(2, 2, 0),
      Point3d.create(2, 3, 0),
      Point3d.create(0, 3, 0),
      Point3d.create(),
    ];
    return Sample.createRecursvieFractalPolygon(poles, pattern, numRecursion, perpendicularFactor);
  }

  /** Fractal with fewer concavity changes.... */
  public static createFractalLMildConcavePatter(numRecursion: number, perpendicularFactor: number): Point3d[] {
    const pattern: Point2d[] = [
      Point2d.create(),
      Point2d.create(0.25, 0.1),
      Point2d.create(0.5, 0.15),
      Point2d.create(0.75, 0.1),
      Point2d.create(1.0, 0.0),
    ];
    const poles: Point3d[] = [
      Point3d.create(),
      Point3d.create(1, 0, 0),
      Point3d.create(1, 1, 0),
      Point3d.create(2, 2, 0),
      Point3d.create(2, 3, 0),
      Point3d.create(0, 3, 0),
      Point3d.create(),
    ];
    return Sample.createRecursvieFractalPolygon(poles, pattern, numRecursion, perpendicularFactor);
  }
  /** append interpolated points from the array tail to the target. */
  public static appendSplits(points: Point3d[], target: Point3d, numSplit: number, includeTarget: boolean) {
    const pointA = points[points.length - 1];
    for (let i = 0; i < numSplit; i++)
      points.push(pointA.interpolate(i / numSplit, target));
    if (includeTarget)
      points.push(target);
  }
  /**
   *
   * @param numSplitAB number of extra points on edge AB
   * @param numSplitBC number of extra points on edge BC
   * @param numSplitCA number of extra points on edge CA
   * @param wrap true to replicate vertexA at end
   * @param xyzA vertexA
   * @param xyzB vertexB
   * @param xyzC vertexC
   */
  public static createTriangleWithSplitEdges(
    numSplitAB: number,
    numSplitBC: number,
    numSplitCA: number,
    wrap: boolean = true,
    xyzA: Point3d = Point3d.create(0, 0, 0),
    xyzB: Point3d = Point3d.create(1, 0, 0),
    xyzC: Point3d = Point3d.create(0, 1, 0)): Point3d[] {
    const result = [xyzA.clone()];
    Sample.appendSplits(result, xyzB, numSplitAB, true);
    Sample.appendSplits(result, xyzC, numSplitBC, true);
    Sample.appendSplits(result, xyzA, numSplitCA, wrap);
    return result;
  }

  public static createCenteredBoxEdges(ax: number = 1, ay: number = 1, az: number = 0, cx: number = 0, cy: number = 0, cz: number = 0,
    geometry?: GeometryQuery[]): GeometryQuery[] {
    if (!geometry)
      geometry = [];
    const x0 = cx - ax;
    const y0 = cy - ay;
    const z0 = cz - az;

    const x1 = cx + ax;
    const y1 = cy + ay;
    const z1 = cz + az;

    for (const z of [z0, z1]) {
      geometry.push(
        LineString3d.create(
          Point3d.create(x0, y0, z),
          Point3d.create(x1, y0, z),
          Point3d.create(x1, y1, z),
          Point3d.create(x0, y1, z),
          Point3d.create(x0, y0, z)));
    }
    geometry.push(LineSegment3d.createXYZXYZ(x0, y0, z0, x0, y0, z1));
    geometry.push(LineSegment3d.createXYZXYZ(x1, y0, z0, x1, y0, z1));
    geometry.push(LineSegment3d.createXYZXYZ(x1, y1, z0, x1, y1, z1));
    geometry.push(LineSegment3d.createXYZXYZ(x0, y1, z0, x0, y1, z1));
    return geometry;
  }

  public static createSimpleTransitionSpirals(): TransitionSpiral3d[] {
    // 5 spirals exercise the intricate "4 out of 5" input ruls for spirals . ..
    const r1 = 1000.0;
    const r0 = 0.0;
    const averageCurvature = TransitionSpiral3d.averageCurvatureR0R1(r0, r1);
    const arcLength = 100.0;
    const dThetaRadians = arcLength * averageCurvature;

    return [
      TransitionSpiral3d.create("clothoid", r0, r1,
        Angle.createDegrees(0), Angle.createRadians(dThetaRadians),
        undefined,
        undefined, Transform.createIdentity())!,
      TransitionSpiral3d.create("clothoid", r0, r1,
        Angle.createDegrees(0), undefined,
        arcLength,
        undefined, Transform.createIdentity())!,
      TransitionSpiral3d.create("clothoid", r0, r1,
        undefined, Angle.createRadians(dThetaRadians),
        arcLength,
        undefined, Transform.createIdentity())!,
      TransitionSpiral3d.create("clothoid", r0, undefined,
        Angle.createDegrees(0), Angle.createRadians(dThetaRadians),
        arcLength,
        undefined, Transform.createIdentity())!,
      TransitionSpiral3d.create("clothoid", undefined, r1,
        Angle.createDegrees(0), Angle.createRadians(dThetaRadians),
        arcLength,
        undefined, Transform.createIdentity())!,
      TransitionSpiral3d.create("clothoid", r0, r1,
        Angle.createDegrees(0), Angle.createRadians(dThetaRadians), undefined,
        Segment1d.create(0, 0.5),
        Transform.createOriginAndMatrix(Point3d.create(1, 2, 0),
          Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createDegrees(15))!))!,
    ];
  }
  public static createTwistingBezier(order: number,
    x0: number,
    y0: number,
    r: number,
    thetaStepper: AngleSweep,
    phiStepper: AngleSweep,
    weightInterval?: Segment1d,
  ): CurvePrimitive | undefined {

    if (weightInterval !== undefined) {
      const points = [];
      for (let i = 0; i < order; i++) {
        const theta = thetaStepper.fractionToRadians(i);
        const phi = phiStepper.fractionToRadians(i);
        const weight = weightInterval.fractionToPoint(i / (order - 1));
        points.push(Point4d.create(
          weight * (x0 + r * Math.cos(theta)),
          weight * (y0 + r * Math.sin(theta)),
          weight * Math.sin(phi), weight));
      }
      return BezierCurve3dH.create(points)!;
    } else {
      const points = [];
      for (let i = 0; i < order; i++) {
        const theta = thetaStepper.fractionToRadians(i);
        const phi = phiStepper.fractionToRadians(i);
        points.push(Point3d.create(x0 + r * Math.cos(theta), y0 + r * Math.sin(theta), Math.sin(phi)));
      }
      return BezierCurve3d.create(points);
    }
    return undefined;
  }
  /**
   * Create various curve chains with distance indexing.
   * * LineSegment
   * * CircularArc
   * * LineString
   * * order 3 bspline
   * * order 4 bspline
   * * alternating lines and arcs
   */
  public static createCurveChainWithDistanceIndex(): CurveChainWithDistanceIndex[] {
    const pointsA = [Point3d.create(0, 0, 0), Point3d.create(1, 3, 0), Point3d.create(2, 4, 0), Point3d.create(3, 3, 0), Point3d.create(4, 0, 0)];
    const result = [];
    // one singleton per basic curve type ...
    result.push(CurveChainWithDistanceIndex.createCapture(
      Path.create(LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(5, 0, 0)))));
    result.push(CurveChainWithDistanceIndex.createCapture(
      Path.create(Arc3d.createCircularStartMiddleEnd(
        Point3d.create(0, 0, 0), Point3d.create(3, 3, 0), Point3d.create(6, 0, 0))!)));
    result.push(CurveChainWithDistanceIndex.createCapture(
      Path.create(LineString3d.create(pointsA))));
    result.push(CurveChainWithDistanceIndex.createCapture(
      Path.create(BSplineCurve3d.createUniformKnots(pointsA, 3)!)));
    result.push(CurveChainWithDistanceIndex.createCapture(
      Path.create(BSplineCurve3d.createUniformKnots(pointsA, 4)!)));
    result.push(CurveChainWithDistanceIndex.createCapture(
      Path.create(
        LineSegment3d.create(pointsA[0], pointsA[1]),
        Arc3d.createCircularStartMiddleEnd(pointsA[1], pointsA[2], pointsA[3])!,
        LineSegment3d.create(pointsA[3], pointsA[4]))));
    return result;
  }
  /**
   * Create a square wave path.
   * @param numTooth number of teeth.
   * @param dxA x size of "A" part
   * @param dxB x size of "B" part
   * @param yA y for A part
   * @param yB y for B part
   * @param structure 1 for line segments, 2 for one linestring per tooth, 0 for single linestring
   */
  public static createSquareWavePath(numTooth: number, dxA: number, dxB: number, yA: number, yB: number, structure: number): Path {
    const dxAB = dxA + dxB;
    const path = Path.create();
    // build the whole linestring ...
    const allPoints = new GrowableXYZArray(4 * numTooth);
    let x2 = 0.0;
    for (let i = 0; i < numTooth; i++) {
      const x0 = i * dxAB;
      const x1 = x0 + dxA;
      x2 = (i + 1) * dxAB;
      allPoints.pushXYZ(x0, yA, 0);
      allPoints.pushXYZ(x1, yA, 0.0);
      allPoints.pushXYZ(x1, yB, 0.0);
      allPoints.pushXYZ(x2, yB, 0.0);
    }
    allPoints.pushXYZ(x2, yA, 0.0);

    const numPoints = allPoints.length;

    if (structure === 1) {
      const pointA = Point3d.create();
      const pointB = Point3d.create();
      allPoints.getPoint3dAt(0, pointA);
      for (let i1 = 0; i1 + 1 < numPoints; i1++) {
        allPoints.getPoint3dAt(i1, pointB);
        path.tryAddChild(LineSegment3d.create(pointA, pointB));
        pointA.setFromPoint3d(pointB);
      }
    } else if (structure === 2) {
      for (let i0 = 0; i0 + 4 < numPoints; i0 += 4) {
        const ls = LineString3d.create();
        ls.addSteppedPoints(allPoints, i0, 1, 5);
        path.tryAddChild(ls);
      }

    } else {
      const ls = LineString3d.create();
      ls.addSteppedPoints(allPoints, 0, 1, numPoints);
      path.tryAddChild(ls);

    }
    return path;
  }

  /**
   * Create various elliptic arcs
   * * circle with vector0, vector90 aligned with x,y
   * * circle with axes rotated
   * *
   * @param radiusRatio = vector90.magnitude / vector0.magnitude
   */
  public static createArcs(radiusRatio: number = 1.0, sweep: AngleSweep = AngleSweep.create360()): Arc3d[] {
    const arcs = [];
    const center0 = Point3d.create(0, 0, 0);
    const a = 1.0;
    const b = radiusRatio;
    const direction0 = Vector3d.createPolar(a, Angle.createDegrees(35.0));
    const direction90 = direction0.rotate90CCWXY();
    direction90.scaleInPlace(radiusRatio);
    arcs.push(Arc3d.create(center0, Vector3d.create(a, 0, 0), Vector3d.create(0, b, 0), sweep));
    arcs.push(Arc3d.create(center0, direction0, direction90, sweep));
    return arcs;
  }
  /**
   * Create many arcs, optionally including skews
   * * @param skewFactor array of skew factors.  for each skew factor, all base arcs are replicated with vector90 shifted by the factor times vector0
   */
  public static createManyArcs(skewFactors: number[] = []): Arc3d[] {
    const result: Arc3d[] = [];
    const sweep1 = AngleSweep.createStartEndDegrees(-10, 75);
    const sweep2 = AngleSweep.createStartEndDegrees(160.0, 380.0);
    for (const arcs of [
      Sample.createArcs(1.0), Sample.createArcs(0.5),
      Sample.createArcs(1.0, sweep1), Sample.createArcs(0.3, sweep2)]) {
      for (const arc of arcs)
        result.push(arc);
    }
    const numBase = result.length;
    for (const skewFactor of skewFactors) {
      for (let i = 0; i < numBase; i++) {
        const originalArc = result[i];
        result.push(Arc3d.create(originalArc.center, originalArc.vector0, originalArc.vector90.plusScaled(originalArc.vector0, skewFactor), originalArc.sweep));
      }
    }
    return result;
  }

  /**
   * Create edges of a range box.
   * * Linestrings on low and high z
   * * single lines on each low z to high z edge.
   * * @param range (possibly null) range
   */
  public static createRangeEdges(range: Range3d): BagOfCurves | undefined {
    if (range.isNull)
      return undefined;
    const corners = range.corners();

    return BagOfCurves.create(
      LineString3d.create(corners[0], corners[1], corners[3], corners[2], corners[0]),
      LineString3d.create(corners[4], corners[5], corners[7], corners[6], corners[4]),
      LineSegment3d.create(corners[0], corners[4]),
      LineSegment3d.create(corners[1], corners[5]),
      LineSegment3d.create(corners[2], corners[6]),
      LineSegment3d.create(corners[3], corners[7]));
  }
}
