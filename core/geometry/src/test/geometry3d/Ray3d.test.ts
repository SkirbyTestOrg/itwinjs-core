/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Transform } from "../../geometry3d/Transform";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Ray3d } from "../../geometry3d/Ray3d";
import { Checker } from "../Checker";
import { expect } from "chai";
import { CurveCurveApproachType } from "../../curve/CurveLocationDetail";
import { AxisOrder } from "../../Geometry";

/** create rays, using optional result (which may be undefined)
 */
function createRays(ck: Checker, target?: Ray3d) {
  const pointA = Point3d.create(1, 2, 3);
  const directionA = Vector3d.create(4, 5, 6);
  const pointB = pointA.plus(directionA);
  const ray = Ray3d.create(pointA, directionA, target);

  ck.testFalse(pointA === ray.origin, "confirm inputs cloned");
  ck.testFalse(directionA === ray.direction, "confirm inputs cloned");
  const ray1 = Ray3d.createXYZUVW(pointA.x, pointA.y, pointA.z, directionA.x, directionA.y, directionA.z, target);
  ck.testPoint3d(pointA, ray1.origin);
  ck.testVector3d(directionA, ray1.direction);

  const transform = Transform.createOriginAndMatrix(Point3d.create(4, 2, -1), Matrix3d.createScale(-3, -2, 5));
  const ray3 = ray.clone();
  const ray3A = ray.clone(Ray3d.createZero());
  const ray4 = ray.cloneTransformed(transform);
  ck.testTrue(ray3.isAlmostEqual(ray), "clone");
  ck.testTrue(ray3A.isAlmostEqual(ray), "clone");
  ck.testFalse(ray4.isAlmostEqual(ray), "clone Transformed");

  for (const f of [0.5, 1, -1]) {
    const pointF = ray1.fractionToPoint(f);
    const fractionOut = ray1.pointToFraction(pointF);
    ck.testCoordinate(f, fractionOut);
    const pointF4 = ray4.fractionToPoint(f);
    ck.testPoint3d(pointF4, transform.multiplyPoint3d(pointF), "transform*ray");

    const pointF1 = ray1.projectPointToRay(pointF);
    ck.testPoint3d(pointF, pointF1, "fraction to point reprojects to same point");
    const frame = ray.toRigidZFrame();
    if (ck.testPointer(frame) && frame) {
      const localPoint = Point3d.create(0.3, 0.8, 5.7);
      const globalPoint = frame.multiplyPoint3d(localPoint);
      const distanceToRay = ray.distance(globalPoint);
      ck.testCoordinate(distanceToRay, localPoint.magnitudeXY(), " projection distance is inplane part");
    }

    const ray5 = Ray3d.createPointVectorNumber(pointA, directionA, 4.0, target);
    ck.testPoint3d(ray5.origin, pointA);
    ck.testVector3d(ray5.direction, directionA);
  }

  const ray2 = Ray3d.createStartEnd(pointA, pointB);
  const ray2A = Ray3d.createStartEnd(pointA, pointB, Ray3d.createZero());
  ck.testTrue(ray2.isAlmostEqual(ray));
  ck.testTrue(ray2A.isAlmostEqual(ray));

  const json2 = ray2.toJSON();
  const ray2B = Ray3d.fromJSON(json2);
  const ray2C = Ray3d.fromJSON();
  ck.testTrue(ray2.isAlmostEqual(ray2B), "json round trip");
  ck.testPointer(ray2C, "expect some default fromJSON");

}

describe("Ray3d", () => {
  it("HelloWorld", () => {
    const ck = new Checker();
    const rayX = Ray3d.createXAxis();
    const rayY = Ray3d.createYAxis();
    const rayZ = Ray3d.createZAxis();
    ck.testPerpendicular(rayX.direction, rayY.direction);
    ck.testPerpendicular(rayX.direction, rayZ.direction);
    ck.testPerpendicular(rayY.direction, rayZ.direction);
    const ray0 = Ray3d.createZero();
    const rayQ = Ray3d.createXYZUVW(1, 2, 3, 4, 5, 6);
    const rayQ0 = Ray3d.createZero(rayQ);
    ck.testTrue(ray0.isAlmostEqual(rayQ0));
    ck.testTrue(ray0.isAlmostEqual(rayQ));

    const rayU = Ray3d.createXYZUVW(1, 2, 3, 4, 5, 6);
    ck.testTrue(rayU.trySetDirectionMagnitudeInPlace(2.0));
    ck.testCoordinate(2.0, rayU.direction.magnitude(), "ray direction with imposed magnitude");
    createRays(ck, undefined);
    createRays(ck, rayQ0);

    const nullray = Ray3d.createXYZUVW(1, 2, 3, 0, 0, 0);  // general origin, zero vector to trigger else branches ..
    nullray.toRigidZFrame();
    nullray.tryNormalizeInPlaceWithAreaWeight(0.0);
    nullray.tryNormalizeInPlaceWithAreaWeight(1.0);
    const spacePoint = Point3d.create(8, 10, 1);
    ck.testCoordinate(spacePoint.distance(nullray.origin), nullray.distance(spacePoint), "distance to null ray");

    ck.testFalse(nullray.trySetDirectionMagnitudeInPlace(), "trySetMagnnitude of nullray");

    ck.testUndefined(
      Ray3d.createWeightedDerivative(
        new Float64Array([1, 2, 3, 0]),
        new Float64Array([2, 1, 4, 0])));
    expect(ck.getNumErrors()).equals(0);
  });
  it("ClosestApproach", () => {
    const ck = new Checker();
    // we expect that there are no parallel pairs or intersecting pairs here . . .
    const raySample = [
      Ray3d.createXYZUVW(0, 1, 0, 1, 0, 0),
      Ray3d.createXYZUVW(0, 0, 1, 0, 1, 0),
      Ray3d.createXYZUVW(1, 0, 0, 0, 0, 1),
      Ray3d.createXYZUVW(1, 2, 3, 5, 2, -1),
      Ray3d.createXYZUVW(-3, 2, 4, -1, 3, 4),
    ];
    /* fractions for contrived intersections  */
    const f1 = 0.13123;
    const f2 = -0.1232;
    for (let i = 0; i < raySample.length; i++) {
      const frame = Matrix3d.createRigidHeadsUp(raySample[i].direction, AxisOrder.ZXY);
      for (let j = 0; j < raySample.length; j++) {
        const approach = Ray3d.closestApproachRay3dRay3d(raySample[i], raySample[j])!;
        if (i === j) {
          ck.testExactNumber(approach.approachType!, CurveCurveApproachType.CoincidentGeometry, i);
          const rayC = raySample[i].clone();
          const shiftDistance = 34.2 + i;
          rayC.origin.addScaledInPlace(frame.columnY(), shiftDistance);
          const approachC = Ray3d.closestApproachRay3dRay3d(raySample[i], rayC)!;
          ck.testExactNumber(approachC.approachType!, CurveCurveApproachType.ParallelGeometry, i);
          ck.testCoordinate(shiftDistance, approachC.detailA.point.distance(approachC.detailB.point));

        } else {
          ck.testExactNumber(approach.approachType!, CurveCurveApproachType.PerpendicularChord, [i, j]);
          const vector = Vector3d.createStartEnd(approach.detailA.point, approach.detailB.point);
          ck.testPerpendicular(vector, raySample[i].direction);
          ck.testPerpendicular(vector, raySample[j].direction);
          const rayE1 = raySample[i].clone();
          const rayE2 = raySample[j].clone();
          const point1 = rayE1.fractionToPoint (f1);
          const point2 = rayE2.fractionToPoint (f2);
          const vector12 = Vector3d.createStartEnd (point1, point2);
          rayE1.origin.addInPlace (vector12);
          // rayE2 at fraction f2 has been moved to rayE1 at fraction f1.  Confirm intersection there . .
          const approachE = Ray3d.closestApproachRay3dRay3d (rayE1, rayE2);
          ck.testExactNumber(approachE.approachType!, CurveCurveApproachType.Intersection, "forced intersection", [i, j]);
          ck.testCoordinate (f1, approachE.detailA.fraction);
          ck.testCoordinate (f2, approachE.detailB.fraction);
        }
      }
    }

    expect(ck.getNumErrors()).equals(0);
  });

});
