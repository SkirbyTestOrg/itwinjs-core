/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

/** @module CartesianGeometry */
import { Point3d, Vector3d } from "./Point3dVector3d";
import { BeJSONFunctions, Geometry } from "../Geometry";
import { Transform } from "./Transform";
/**
 * A Point3dVector3dVector3d is an origin and a pair of vectors.
 * This defines a plane with a (possibly skewed) uv coordinate grid
 * * The grid directions (`vectorU` and `vectorV`)
 *   * are NOT required to be unit vectors.
 *   * are NOT required to be perpendicular vectors.
 * @public
 */
export class Plane3dByOriginAndVectors implements BeJSONFunctions {
  /** origin of plane grid */
  public origin: Point3d;
  /** u direction in plane grid */
  public vectorU: Vector3d;
  /** v direction in plane gride */
  public vectorV: Vector3d;
  private constructor(origin: Point3d, vectorU: Vector3d, vectorV: Vector3d) {
    this.origin = origin;
    this.vectorU = vectorU;
    this.vectorV = vectorV;
  }
  /** create a new plane from origin and vectors. */
  public static createOriginAndVectors(origin: Point3d, vectorU: Vector3d, vectorV: Vector3d, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors {
    if (result) {
      result.origin.setFrom(origin);
      result.vectorU.setFrom(vectorU);
      result.vectorV.setFrom(vectorV);
      return result;
    }
    return new Plane3dByOriginAndVectors(origin.clone(), vectorU.clone(), vectorV.clone());
  }
  /**
   * Return a Plane3dByOriginAndVectors, with
   * * irigin is the translation (aka origin) from the Transform
   * * vectorU is the X column of the transform
   * * vectorV is the Y column of the transform.
   * @param transform source trnasform
   * @param xLength optional length to impose on vectorU.
   * @param yLength optional length to impose on vectorV.
   * @param result optional preexisting result
   */
  public static createFromTransformColumnsXYAndLengths(transform: Transform,
    xLength: number | undefined, yLength: number | undefined,
    result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors {
    if (result) {
      result.origin.setFrom(transform.getOrigin());
      transform.matrix.columnX(result.vectorU);
      transform.matrix.columnY(result.vectorV);
    } else {
      result = new Plane3dByOriginAndVectors(
        transform.getOrigin(),
        transform.matrix.columnX(),
        transform.matrix.columnY());
    }
    if (xLength !== undefined)
      result.vectorU.scaleToLength(xLength, result.vectorU);
    if (yLength !== undefined)
      result.vectorV.scaleToLength(yLength, result.vectorV);
    return result;
  }
  /** Capture origin and directions in a new planed. */
  public static createCapture(origin: Point3d, vectorU: Vector3d, vectorV: Vector3d, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors {
    if (!result)
      return new Plane3dByOriginAndVectors(origin, vectorU, vectorV);
    result.origin = origin;
    result.vectorU = vectorU;
    result.vectorV = vectorV;
    return result;
  }
  /** Set all origin and both vectors from direct numeric parameters */
  public setOriginAndVectorsXYZ(x0: number, y0: number, z0: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): Plane3dByOriginAndVectors {
    this.origin.set(x0, y0, z0);
    this.vectorU.set(ux, uy, uz);
    this.vectorV.set(vx, vy, vz);
    return this;
  }
  /** Set all origin and both vectors from coordinates in given origin and vectors.
   * * Note that coordinates are copied out of the parameters -- the given parameters are NOT retained by reference.
   */
  public setOriginAndVectors(origin: Point3d, vectorU: Vector3d, vectorV: Vector3d): Plane3dByOriginAndVectors {
    this.origin.setFrom(origin);
    this.vectorU.setFrom(vectorU);
    this.vectorV.setFrom(vectorV);
    return this;
  }
    /** Create a new plane from direct numeric parameters */
  public static createOriginAndVectorsXYZ(x0: number, y0: number, z0: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors {
    if (result)
      return result.setOriginAndVectorsXYZ(x0, y0, z0, ux, uy, uz, vx, vy, vz);
    return new Plane3dByOriginAndVectors(Point3d.create(x0, y0, z0), Vector3d.create(ux, uy, uz), Vector3d.create(vx, vy, vz));
  }
  /** Define a plane by three points in the plane.
   * @param origin origin for the parameterization.
   * @param targetU target point for the vectorU starting at the origin.
   * @param targetV target point for the vectorV originating at the origin.
   * @param result optional result.
   */
  public static createOriginAndTargets(origin: Point3d, targetU: Point3d, targetV: Point3d, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors {
    return Plane3dByOriginAndVectors.createOriginAndVectorsXYZ(origin.x, origin.y, origin.z, targetU.x - origin.x, targetU.y - origin.y, targetU.z - origin.z, targetV.x - origin.x, targetV.y - origin.y, targetV.z - origin.z, result);
  }
  /** Create a plane with origin at 000, unit vectorU in x direction, and unit vectorV in the y direction. */
  public static createXYPlane(result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors {
    return Plane3dByOriginAndVectors.createOriginAndVectorsXYZ(0, 0, 0, 1, 0, 0, 0, 1, 0, result);
  }
  /** create a plane from data presented as Float64Arrays.
   * @param origin x,y,z of origin.
   * @param vectorU x,y,z of vectorU
   * @param vectorV x,y,z of vectorV
   */
  public static createOriginAndVectorsArrays(origin: Float64Array, vectorU: Float64Array, vectorV: Float64Array, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors {
    return Plane3dByOriginAndVectors.createOriginAndVectorsXYZ(origin[0], origin[1], origin[2], vectorU[0], vectorU[1], vectorU[2], vectorV[0], vectorV[1], vectorV[2], result);
  }
  /** create a plane from data presented as Float64Array with weights
   * @param origin x,y,z,w of origin.
   * @param vectorU x,y,z,w of vectorU
   * @param vectorV x,y,z,w of vectorV
   */
  public static createOriginAndVectorsWeightedArrays(originw: Float64Array, vectorUw: Float64Array, vectorVw: Float64Array, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors {
    const w = originw[3];
    result = Plane3dByOriginAndVectors.createXYPlane(result);
    if (Geometry.isSmallMetricDistance(w))
      return result;
    const dw = 1.0 / w;
    const au = vectorUw[3] * dw * dw;
    const av = vectorVw[3] * dw * dw;
    // for homogeneous function X, with w its weight:
    // (X/w) is the cartesian point.
    // (X/w)' = (X' w - X w')/(w*w)
    //        = X'/w  - (X/w)(w'/w)
    //        = X'/w  - X w'/w^2)
    // The w parts of the formal xyzw sums are identically 0.
    // Here the X' and its w' are taken from each vectorUw and vectorVw
    result.origin.set(originw[0] * dw, originw[1] * dw, originw[2] * dw);
    Vector3d.createAdd2ScaledXYZ(vectorUw[0], vectorUw[1], vectorUw[2], dw, originw[0], originw[1], originw[2], -au, result.vectorU);
    Vector3d.createAdd2ScaledXYZ(vectorVw[0], vectorVw[1], vectorVw[2], dw, originw[0], originw[1], originw[2], -av, result.vectorV);
    return result;
  }
  /**
   * Evaluate a point a grid coordinates on the plane.
   * * The computed point is `origin + vectorU * u + vectorV * v`
   * @param u coordinate along vectorU
   * @param v coordinate along vectorV
   * @param result optional result destination.
   * @returns Return the computed coordinate.
   */
  public fractionToPoint(u: number, v: number, result?: Point3d): Point3d {
    return this.origin.plus2Scaled(this.vectorU, u, this.vectorV, v, result);
  }
  /** Return the vector from the plane origin to parametric coordinate (u.v) */
  public fractionToVector(u: number, v: number, result?: Vector3d): Vector3d {
    return Vector3d.createAdd2Scaled(this.vectorU, u, this.vectorV, v, result);
  }
  /** Set coordinates from a json object such as `{origin: [1,2,3], vectorU:[4,5,6], vectorV[3,2,1]}` */
  public setFromJSON(json?: any) {
    if (!json || !json.origin || !json.vectorV) {
      this.origin.set(0, 0, 0);
      this.vectorU.set(1, 0, 0);
      this.vectorV.set(0, 1, 0);
    } else {
      this.origin.setFromJSON(json.origin);
      this.vectorU.setFromJSON(json.vectorU);
      this.vectorV.setFromJSON(json.vectorV);
    }
  }
  /**
   * Convert an Angle to a JSON object.
   * @return {*} [origin,normal]
   */
  public toJSON(): any {
    return {
      origin: this.origin.toJSON(),
      vectorU: this.vectorU.toJSON(),
      vectorV: this.vectorV.toJSON(),
    };
  }
  /** create a new plane.   See `setFromJSON` for layout example. */
  public static fromJSON(json?: any): Plane3dByOriginAndVectors {
    const result = Plane3dByOriginAndVectors.createXYPlane();
    result.setFromJSON(json);
    return result;
  }
  /** Test origin and vectors for isAlmostEqual with `other` */
  public isAlmostEqual(other: Plane3dByOriginAndVectors): boolean {
    return this.origin.isAlmostEqual(other.origin)
      && this.vectorU.isAlmostEqual(other.vectorU)
      && this.vectorV.isAlmostEqual(other.vectorV);
  }
}
