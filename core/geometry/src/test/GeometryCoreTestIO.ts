/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { GeometryQuery } from "../curve/GeometryQuery";
import { prettyPrint } from "./testFunctions";
import { Geometry } from "../Geometry";
import * as fs from "fs";
import { IModelJson } from "../serialization/IModelJsonSchema";
import { Arc3d } from "../curve/Arc3d";
import { Point3d } from "../geometry3d/Point3dVector3d";
import { Range3d } from "../geometry3d/Range";
import { LineString3d } from "../curve/LineString3d";
import { MomentData } from "../geometry4d/MomentData";
import { AngleSweep } from "../geometry3d/AngleSweep";
/* tslint:disable:no-console */

// Methods (called from other files in the test suite) for doing I/O of tests files.
export class GeometryCoreTestIO {
  public static outputRootDirectory = "./src/test/output";
  public static saveGeometry(geometry: any, directoryName: string | undefined, fileName: string) {
    let path = GeometryCoreTestIO.outputRootDirectory;
    if (directoryName !== undefined) {
      path += "/" + directoryName;
      if (!fs.existsSync(path))
        fs.mkdirSync(path);
    }
    const fullPath = path + "/" + fileName + ".imjs";
    // console.log("saveGeometry::    " + fullPath);

    const imjs = IModelJson.Writer.toIModelJson(geometry);
    fs.writeFileSync(fullPath, prettyPrint(imjs));
  }
  public static captureGeometry(collection: GeometryQuery[], newGeometry: GeometryQuery | GeometryQuery[], dx: number = 0, dy: number = 0, dz: number = 0) {
    if (newGeometry instanceof GeometryQuery) {
      if (Geometry.hypotenuseSquaredXYZ(dx, dy, dz) !== 0)
        newGeometry.tryTranslateInPlace(dx, dy, dz);
      collection.push(newGeometry);
      return;
    }
    if (Array.isArray(newGeometry)) {
      for (const g of newGeometry)
        this.captureGeometry(collection, g, dx, dy, dz);
    }
  }
  public static captureCloneGeometry(collection: GeometryQuery[], newGeometry: GeometryQuery | GeometryQuery[], dx: number = 0, dy: number = 0, dz: number = 0) {
    if (newGeometry instanceof GeometryQuery) {
      const g1 = newGeometry.clone();
      if (g1)
        GeometryCoreTestIO.captureGeometry(collection, g1, dx, dy, dz);
      return;
    }
    if (Array.isArray(newGeometry)) {
      for (const g of newGeometry)
        this.captureCloneGeometry(collection, g, dx, dy, dz);
    }
  }
  /**
   * Create a circle (or many circles) given center and radius.  Save the arcs in collection, shifted by [dx,dy,dz]
   * @param collection growing array of geometry
   * @param center single or multiple center point data
   * @param radius radius of circles
   * @param dx x shift
   * @param dy y shift
   * @param dz z shift
   */
  public static createAndCaptureXYCircle(collection: GeometryQuery[], center: Point3d | Point3d[], radius: number, dx: number = 0, dy: number = 0, dz: number = 0) {
    if (Array.isArray(center)) {
      for (const c of center)
        this.createAndCaptureXYCircle(collection, c, radius, dx, dy, dz);
      return;
    }
    if (!Geometry.isSameCoordinate(0, radius)) {
      const newGeometry = Arc3d.createXY(center, radius);
      newGeometry.tryTranslateInPlace(dx, dy, dz);
      collection.push(newGeometry);
    }
  }
  /**
   * Create edges of a range.
   * @param collection growing array of geometry
   * @param range Range
   * @param dx x shift
   * @param dy y shift
   * @param dz z shift
   */
  public static captureRangeEdges(collection: GeometryQuery[], range: Range3d, dx: number = 0, dy: number = 0, dz: number = 0) {
    if (!range.isNull) {
      const corners = range.corners();
      this.captureGeometry(collection, LineString3d.createIndexedPoints(corners, [0, 1, 3, 2, 0]), dx, dy, dz);
      this.captureGeometry(collection, LineString3d.createIndexedPoints(corners, [4, 5, 7, 6, 4]), dx, dy, dz);
      this.captureGeometry(collection, LineString3d.createIndexedPoints(corners, [0, 4, 6, 2]), dx, dy, dz);
      this.captureGeometry(collection, LineString3d.createIndexedPoints(corners, [1, 5, 7, 3]), dx, dy, dz);
    }
  }
  public static showMomentData(collection: GeometryQuery[], momentData?: MomentData, xyOnly: boolean = false, dx: number = 0, dy: number = 0, dz: number = 0) {
    if (momentData) {
      const momentData1 = MomentData.inertiaProductsToPrincipalAxes(momentData.origin, momentData.sums);
      if (momentData1) {
        const unitX = momentData1.localToWorldMap.matrix.columnX();
        const unitY = momentData1.localToWorldMap.matrix.columnY();
        const unitZ = momentData1.localToWorldMap.matrix.columnZ();
        const rx = momentData1.radiusOfGyration.x;
        const ry = momentData1.radiusOfGyration.y;
        const rz = momentData1.radiusOfGyration.z;
        this.captureGeometry(collection,
          LineString3d.create([
            momentData1.origin.plusScaled(unitX, 2.0 * rz),
            momentData1.origin,
            momentData1.origin.plusScaled(unitY, rz)]), dx, dy, dz);
        this.captureGeometry(collection, Arc3d.create(momentData1.origin, unitX.scale(rz), unitY.scale(rz), AngleSweep.createStartEndDegrees (0, 355)), dx, dy, dz);
        if (!xyOnly) {
          this.captureGeometry(collection, Arc3d.create(momentData1.origin, unitY.scale(rx), unitZ.scale(rx)), dx, dy, dz);
          this.captureGeometry(collection, Arc3d.create(momentData1.origin, unitZ.scale(ry), unitX.scale(ry)), dx, dy, dz);
        }
      }
    }
  }
}
