/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/

/** @module Curve */

import { Geometry, BeJSONFunctions } from "../Geometry";
import { Point3d } from "../PointVector";
import { Range3d } from "../Range";
import { Transform } from "../Transform";
import { Plane3dByOriginAndUnitNormal } from "../AnalyticGeometry";
import { Point3dArray } from "../PointHelpers";
import { GeometryHandler } from "../GeometryHandler";
import { GeometryQuery } from "./CurvePrimitive";
/* tslint:disable:variable-name no-empty*/

export class PointString3d extends GeometryQuery implements BeJSONFunctions {

  public isSameGeometryClass(other: GeometryQuery): boolean { return other instanceof PointString3d; }
  private _points: Point3d[];
  /** return the points array (cloned). */
  public get points(): Point3d[] { return this._points; }
  private constructor() {
    super();
    this._points = [];
  }
  public cloneTransformed(transform: Transform): PointString3d {  // we know tryTransformInPlace succeeds.
    const c = this.clone();
    c.tryTransformInPlace(transform);
    return c;
  }

  private static flattenArray(arr: any): any {
    return arr.reduce((flat: any, toFlatten: any) => {
      return flat.concat(Array.isArray(toFlatten) ? PointString3d.flattenArray(toFlatten) : toFlatten);
    }, []);
  }

  public static create(...points: any[]): PointString3d {
    const result = new PointString3d();
    result.addPoints(points);
    return result;
  }

  public addPoints(...points: any[]) {
    const toAdd: any[] = PointString3d.flattenArray(points);
    for (const p of toAdd) {
      if (p instanceof Point3d)
        this._points.push(p);
    }
  }

  public addPoint(point: Point3d) {
    this._points.push(point);
  }

  public popPoint() {
    this._points.pop();
  }

  public setFrom(other: PointString3d) {
    this._points = Point3dArray.clonePoint3dArray(other._points);
  }

  public static createPoints(points: Point3d[]): PointString3d {
    const ps = new PointString3d();
    ps._points = Point3dArray.clonePoint3dArray(points);
    return ps;
  }
  /** Create a PointString3d from xyz coordinates packed in a Float64Array */
  public static createFloat64Array(xyzData: Float64Array): PointString3d {
    const ps = new PointString3d();
    for (let i = 0; i + 3 <= xyzData.length; i += 3)
      ps._points.push(Point3d.create(xyzData[i], xyzData[i + 1], xyzData[i + 2]));
    return ps;
  }

  public clone(): PointString3d {
    const retVal = new PointString3d();
    retVal.setFrom(this);
    return retVal;
  }

  public setFromJSON(json?: any) {
    this._points.length = 0;
    if (Array.isArray(json)) {
      let xyz;
      for (xyz of json)
        this._points.push(Point3d.fromJSON(xyz));
    }
  }
  /**
   * Convert an PointString3d to a JSON object.
   * @return {*} [[x,y,z],...[x,y,z]]
   */
  public toJSON(): any {
    const value = [];
    for (const p of this._points) value.push(p.toJSON());
    return value;
  }
  public static fromJSON(json?: any): PointString3d {
    const ps = new PointString3d(); ps.setFromJSON(json); return ps;
  }

  public pointAt(i: number, result?: Point3d): Point3d | undefined {
    if (i >= 0 && i < this._points.length) {
      if (result) { result.setFrom(this._points[i]); return result; }
      return this._points[i].clone();
    }
    return undefined;
  }
  public numPoints(): number { return this._points.length; }

  public reverseInPlace(): void {
    if (this._points.length >= 2) {
      let i0 = 0;
      let i1 = this._points.length - 1;
      while (i0 < i1) {
        const a = this._points[i0];
        this._points[i1] = this._points[i0];
        this._points[i0] = a;
        i0++;
        i1--;
      }
    }
  }
  public tryTransformInPlace(transform: Transform): boolean {
    transform.multiplyPoint3dArrayInPlace(this._points);
    return true;
  }

  public closestPoint(spacePoint: Point3d): { index: number, xyz: Point3d } {
    const result = { index: -1, xyz: Point3d.create() };
    const index = Point3dArray.closestPointIndex(this._points, spacePoint);
    if (index >= 0) {
      result.index = index;
      result.xyz.setFrom(this._points[index]);
    }
    return result;
  }

  public isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean {
    return Point3dArray.isCloseToPlane(this._points, plane, Geometry.smallMetricDistance);
  }

  public extendRange(rangeToExtend: Range3d, transform?: Transform): void {
    rangeToExtend.extendArray(this._points, transform);
  }

  public isAlmostEqual(other: GeometryQuery): boolean {
    if (!(other instanceof PointString3d))
      return false;
    return Point3dArray.isAlmostEqual(this._points, other._points);
  }

  public clear() { this._points.length = 0; }

  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handlePointString3d(this);
  }

}
