/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */

// import { Geometry, Angle, AngleSweep } from "../Geometry";

import { AxisOrder, Geometry } from "../Geometry";
import { AngleSweep } from "../geometry3d/AngleSweep";
import { Ellipsoid, GeodesicPathPoint } from "../geometry3d/Ellipsoid";
import { IndexedXYZCollection } from "../geometry3d/IndexedXYZCollection";
import { Matrix3d } from "../geometry3d/Matrix3d";
import { Point3dArrayCarrier } from "../geometry3d/Point3dArrayCarrier";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { PolyfaceBuilder } from "../polyface/PolyfaceBuilder";
import { Cone } from "../solid/Cone";
import { TorusPipe } from "../solid/TorusPipe";
import { Arc3d, ArcBlendData } from "./Arc3d";
import { CurveChain } from "./CurveCollection";
import { CurvePrimitive } from "./CurvePrimitive";
import { GeometryQuery } from "./GeometryQuery";
import { LineSegment3d } from "./LineSegment3d";
import { LineString3d } from "./LineString3d";
import { Loop } from "./Loop";
import { Path } from "./Path";

/**
 * The `CurveFactory` class contains methods for specialized curve constructions.
 * @public
 */
export class CurveFactory {
  /** (cautiously) construct and save a line segment between fractional positions. */
  private static addPartialSegment(path: Path, allowBackup: boolean, pointA: Point3d | undefined, pointB: Point3d | undefined, fraction0: number, fraction1: number) {
    if (allowBackup || (fraction1 > fraction0)) {
      if (pointA !== undefined && pointB !== undefined && !Geometry.isAlmostEqualNumber(fraction0, fraction1))
        path.tryAddChild(LineSegment3d.create(pointA.interpolate(fraction0, pointB), pointA.interpolate(fraction1, pointB)));
    }
  }
  /**
   * Create a circular arc from start point, tangent at start, and another point (endpoint) on the arc.
   * @param pointA
   * @param tangentA
   * @param pointB
   */
  public static createArcPointTangentPoint(pointA: Point3d, tangentA: Vector3d, pointB: Point3d): Arc3d | undefined {
    const vectorV = Vector3d.createStartEnd(pointA, pointB);
    const frame = Matrix3d.createRigidFromColumns(tangentA, vectorV, AxisOrder.XYZ);
    if (frame !== undefined) {
      const vv = vectorV.dotProduct(vectorV);
      const vw = frame.dotColumnY(vectorV);
      const alpha = Geometry.conditionalDivideCoordinate(vv, 2 * vw);
      if (alpha !== undefined) {
        const vector0 = frame.columnY();
        vector0.scaleInPlace(-alpha);
        const vector90 = frame.columnX();
        vector90.scaleInPlace(alpha);
        const centerToEnd = vector0.plus(vectorV);
        const sweepAngle = vector0.angleTo(centerToEnd);
        let sweepRadians = sweepAngle.radians;  // That's always positive and less than PI.
        if (tangentA.dotProduct(centerToEnd) < 0.0) // ah, sweepRadians is the wrong way
          sweepRadians = 2.0 * Math.PI - sweepRadians;
        const center = pointA.plusScaled(vector0, -1.0);
        return Arc3d.create(center, vector0, vector90, AngleSweep.createStartEndRadians(0.0, sweepRadians));
      }
    }
    return undefined;
  }
  /**
   * Construct a sequence of alternating lines and arcs with the arcs creating tangent transition between consecutive edges.
   *  * If the radius parameter is a number, that radius is used throughout.
   *  * If the radius parameter is an array of numbers, `radius[i]` is applied at `point[i]`.
   *    * Note that since no fillet is constructed at the initial or final point, those entries in `radius[]` are never referenced.
   *    * A zero radius for any point indicates to leave the as a simple corner.
   * @param points point source
   * @param radius fillet radius or array of radii indexed to correspond to the points.
   * @param allowBackupAlongEdge true to allow edges to be created going "backwards" along edges if needed to create the blend.
   */
  public static createFilletsInLineString(points: LineString3d | IndexedXYZCollection | Point3d[], radius: number | number[], allowBackupAlongEdge: boolean = true): Path | undefined {
    if (Array.isArray(points))
      return this.createFilletsInLineString(new Point3dArrayCarrier(points), radius, allowBackupAlongEdge);
    if (points instanceof LineString3d)
      return this.createFilletsInLineString(points.packedPoints, radius, allowBackupAlongEdge);

    const n = points.length;
    if (n <= 1)
      return undefined;
    const pointA = points.getPoint3dAtCheckedPointIndex(0)!;
    const pointB = points.getPoint3dAtCheckedPointIndex(1)!;
    // remark: n=2 and n=3 cases should fall out from loop logic
    const blendArray: ArcBlendData[] = [];
    // build one-sided blends at each end . .
    blendArray.push({ fraction10: 0.0, fraction12: 0.0, point: pointA.clone() });

    for (let i = 1; i + 1 < n; i++) {
      const pointC = points.getPoint3dAtCheckedPointIndex(i + 1)!;
      let thisRadius = 0;
      if (Array.isArray(radius)) {
        if (i < radius.length)
          thisRadius = radius[i];
      } else if (Number.isFinite(radius))
        thisRadius = radius;

      if (thisRadius !== 0.0)
        blendArray.push(Arc3d.createFilletArc(pointA, pointB, pointC, thisRadius));
      else
        blendArray.push({ fraction10: 0.0, fraction12: 0.0, point: pointB.clone() });
      pointA.setFromPoint3d(pointB);
      pointB.setFromPoint3d(pointC);
    }
    blendArray.push({ fraction10: 0.0, fraction12: 0.0, point: pointB.clone() });
    if (!allowBackupAlongEdge) {
      // suppress arcs that have overlap with both neighbors or flood either neighbor ..
      for (let i = 1; i + 1 < n; i++) {
        const b = blendArray[i];
        if (b.fraction10 > 1.0
          || b.fraction12 > 1.0
          || 1.0 - b.fraction10 < blendArray[i - 1].fraction12
          || b.fraction12 > 1.0 - blendArray[i + 1].fraction10) {
          b.fraction10 = 0.0;
          b.fraction12 = 0.0;
          blendArray[i].arc = undefined;
        }
      }
      /*  The "1-b" logic above prevents this loop from ever doing anything.
      // on edge with conflict, suppress the arc with larger fraction
      for (let i = 1; i < n; i++) {
        const b0 = blendArray[i - 1];
        const b1 = blendArray[i];
        if (b0.fraction12 > 1 - b1.fraction10) {
          const b = b0.fraction12 > b1.fraction12 ? b1 : b0;
          b.fraction10 = 0.0;
          b.fraction12 = 0.0;
          blendArray[i].arc = undefined;
        }
      }*/
    }
    const path = Path.create();
    this.addPartialSegment(path, allowBackupAlongEdge, blendArray[0].point, blendArray[1].point, blendArray[0].fraction12, 1.0 - blendArray[1].fraction10);
    // add each path and successor edge ...
    for (let i = 1; i + 1 < points.length; i++) {
      const b0 = blendArray[i];
      const b1 = blendArray[i + 1];
      path.tryAddChild(b0.arc);
      this.addPartialSegment(path, allowBackupAlongEdge, b0.point, b1.point, b0.fraction12, 1.0 - b1.fraction10);
    }
    return path;
  }
  /** Create a `Loop` with given xy corners and fixed z. */
  public static createRectangleXY(x0: number, y0: number, x1: number, y1: number, z: number = 0, filletRadius?: number): Loop {
    if (filletRadius === undefined)
      return Loop.createPolygon([Point3d.create(x0, y0, z), Point3d.create(x1, y0, z), Point3d.create(x1, y1, z), Point3d.create(x0, y1, z), Point3d.create(x0, y0, z)]);
    else {
      const vectorU = Vector3d.create(filletRadius, 0, 0);
      const vectorV = Vector3d.create(0, filletRadius, 0);
      const x0A = x0 + filletRadius;
      const y0A = y0 + filletRadius;
      const x1A = x1 - filletRadius;
      const y1A = y1 - filletRadius;
      const centers = [Point3d.create(x1A, y1A, z), Point3d.create(x0A, y1A, z), Point3d.create(x0A, y0A, z), Point3d.create(x1A, y0A, z)];
      const loop = Loop.create();
      for (let i = 0; i < 4; i++) {
        const center = centers[i];
        const nextCenter = centers[(i + 1) % 4];
        const edgeVector = Vector3d.createStartEnd(center, nextCenter);
        const arc = Arc3d.create(center, vectorU, vectorV, AngleSweep.createStartEndDegrees(0, 90));
        loop.tryAddChild(arc);
        const arcEnd = arc.endPoint();
        loop.tryAddChild(LineSegment3d.create(arcEnd, arcEnd.plus(edgeVector)));
        vectorU.rotate90CCWXY(vectorU);
        vectorV.rotate90CCWXY(vectorV);
      }
      return loop;
    }
  }
  /**
   * If `arcB` is a continuation of `arcA`, extend `arcA` (in place) to include the range of `arcB`
   * * This only succeeds if the two arcs are part of identical complete arcs and end of `arcA` matches the beginning of `arcB`.
   * * "Reversed"
   * @param arcA
   * @param arcB
   */
  public static appendToArcInPlace(arcA: Arc3d, arcB: Arc3d, allowReverse: boolean = false): boolean {
    if (arcA.center.isAlmostEqual(arcB.center)) {
      const sweepSign = Geometry.split3WaySign(arcA.sweep.sweepRadians * arcB.sweep.sweepRadians, -1, 0, 1);
      // evaluate derivatives wrt radians (not fraction!), but adjust direction for sweep signs
      const endA = arcA.angleToPointAndDerivative(arcA.sweep.fractionToAngle(1.0));
      if (arcA.sweep.sweepRadians < 0)
        endA.direction.scaleInPlace(-1.0);
      const startB = arcB.angleToPointAndDerivative(arcB.sweep.fractionToAngle(0.0));
      if (arcB.sweep.sweepRadians < 0)
        startB.direction.scaleInPlace(-1.0);

      if (endA.isAlmostEqual(startB)) {
        arcA.sweep.setStartEndRadians(arcA.sweep.startRadians, arcA.sweep.startRadians + arcA.sweep.sweepRadians + sweepSign * arcB.sweep.sweepRadians);
        return true;
      }
      // Also ok if negated tangent . ..
      if (allowReverse) {
        startB.direction.scaleInPlace(-1.0);
        if (endA.isAlmostEqual(startB)) {
          arcA.sweep.setStartEndRadians(arcA.sweep.startRadians, arcA.sweep.startRadians + arcA.sweep.sweepRadians - sweepSign * arcB.sweep.sweepRadians);
          return true;
        }
      }

    }
    return false;
  }
  /**
   * Return a `Path` containing arcs are on the surface of an ellipsoid and pass through a sequence of points.
   * * Each arc passes through the two given endpoints and in the plane containing the true surface normal at given `fractionForIntermediateNormal`
   * @param ellipsoid
   * @param pathPoints
   * @param fractionForIntermediateNormal fractional position for surface normal used to create the section plane.
   */
  public static assembleArcChainOnEllipsoid(ellipsoid: Ellipsoid, pathPoints: GeodesicPathPoint[], fractionForIntermediateNormal: number = 0.5): Path {
    const arcPath = Path.create();
    for (let i = 0; i + 1 < pathPoints.length; i++) {
      const arc = ellipsoid.sectionArcWithIntermediateNormal(
        pathPoints[i].toAngles(),
        fractionForIntermediateNormal,
        pathPoints[i + 1].toAngles());
      arcPath.tryAddChild(arc);
    }
    return arcPath;
  }
  private static appendGeometryQueryArray(candidate: GeometryQuery | GeometryQuery[] | undefined, result: GeometryQuery[]) {
    if (candidate instanceof GeometryQuery)
      result.push(candidate);
    else if (Array.isArray(candidate)) {
      for (const p of candidate)
        this.appendGeometryQueryArray(p, result);
    }

  }
  /**
   * Create solid primitives for pipe segments (e.g. Cone or TorusPipe) around line and arc primitives.
   * @param centerline centerline geometry/
   * @param pipeRadius radius of pipe.
   */
  public static createPipeSegments(centerline: CurvePrimitive | CurveChain, pipeRadius: number): GeometryQuery | GeometryQuery[] | undefined {
    if (centerline instanceof LineSegment3d) {
      return Cone.createAxisPoints(centerline.startPoint(), centerline.endPoint(), pipeRadius, pipeRadius, false);
    } else if (centerline instanceof Arc3d) {
      return TorusPipe.createAlongArc(centerline, pipeRadius, false);
    } else if (centerline instanceof CurvePrimitive) {
      const builder = PolyfaceBuilder.create();
      builder.addMiteredPipes(centerline, pipeRadius);
      return builder.claimPolyface();
    } else if (centerline instanceof CurveChain) {
      const result: GeometryQuery[] = [];
      for (const p of centerline.children) {
        const pipe = this.createPipeSegments(p, pipeRadius);
        this.appendGeometryQueryArray(pipe, result);
      }
      return result;
    }
    return undefined;
  }
  /**
   * * Create section arcs for mitered pipe.
   * * At each end of each pipe, the pipe is cut by the plane that bisects the angle between successive pipe centerlines.
   * * The arc definitions are constructed so that lines between corresponding fractional positions on the arcs are
   *     axial lines on the pipes.
   *   * This means that each arc definition axes (aka vector0 and vector90) are _not_ perpendicular to each other.
   * @param centerline centerline of pipe
   * @param radius radius of arcs
   */
  public static createMiteredPipeSections(centerline: IndexedXYZCollection, radius: number): Arc3d[] {
    const arcs: Arc3d[] = [];
    if (centerline.length < 2)
      return [];
    const vectorAB = Vector3d.create();
    const vectorBC = Vector3d.create();
    const bisector = Vector3d.create();
    const vector0 = Vector3d.create();
    const vector90 = Vector3d.create();
    const currentCenter = centerline.getPoint3dAtUncheckedPointIndex(0);
    centerline.vectorIndexIndex(0, 1, vectorBC)!;
    const baseFrame = Matrix3d.createRigidHeadsUp(vectorBC, AxisOrder.ZXY);
    baseFrame.columnX(vector0);
    baseFrame.columnY(vector90);
    vector0.scaleInPlace(radius);
    vector90.scaleInPlace(radius);
    // circular section on base plane ....
    const ellipseA = Arc3d.create(currentCenter, vector0, vector90, AngleSweep.create360());
    arcs.push(ellipseA);
    for (let i = 1; i < centerline.length; i++) {
      vectorAB.setFromVector3d(vectorBC);
      centerline.getPoint3dAtUncheckedPointIndex(i, currentCenter);
      if (i + 1 < centerline.length) {
        centerline.vectorIndexIndex(i, i + 1, vectorBC)!;
      } else {
        vectorBC.setFromVector3d(vectorAB);
      }
      if (vectorAB.normalizeInPlace() && vectorBC.normalizeInPlace()) {
        vectorAB.interpolate(0.5, vectorBC, bisector);
        // On the end ellipse for this pipe section. ..
        // center comes directly from centerline[i]
        // vector0 and vector90 are obtained by sweeping the corresponding vectors of the start ellipse to the split plane.
        moveVectorToPlane(vector0, vectorAB, bisector, vector0);
        moveVectorToPlane(vector90, vectorAB, bisector, vector90);
        arcs.push(Arc3d.create(currentCenter, vector0, vector90, AngleSweep.create360()));
      }
    }
    return arcs;
  }
}
/**
 * Starting at vectorR, move parallel to vectorV until perpendicular to planeNormal
 */
function moveVectorToPlane(vectorR: Vector3d, vectorV: Vector3d, planeNormal: Vector3d, result?: Vector3d): Vector3d {
  // find s such that (vectorR + s * vectorV) DOT planeNormal = 0.
  const dotRN = vectorR.dotProduct(planeNormal);
  const dotVN = vectorV.dotProduct(planeNormal);
  const s = Geometry.safeDivideFraction(dotRN, dotVN, 0.0);
  return vectorR.plusScaled(vectorV, -s, result);
}
