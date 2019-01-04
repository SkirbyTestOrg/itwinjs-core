/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

/** @module Polyface */

// import { Geometry, AxisOrder, Angle, AngleSweep, BSIJSONValues } from "./Geometry";
import { IndexedPolyface } from "./Polyface";
import { GrowableFloat64Array } from "../geometry3d/GrowableFloat64Array";
import { Point2d } from "../geometry3d/Point2dVector2d";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { Transform } from "../geometry3d/Transform";
import { Matrix3d } from "../geometry3d/Matrix3d";
import { BoxTopology } from "./BoxTopology";
import { StrokeOptions } from "../curve/StrokeOptions";
import { GeometryQuery } from "../curve/GeometryQuery";
import { Cone } from "../solid/Cone";
import { CurveChain } from "../curve/CurveCollection";

import { Sphere } from "../solid/Sphere";
import { TorusPipe } from "../solid/TorusPipe";
import { LinearSweep } from "../solid/LinearSweep";
import { RotationalSweep } from "../solid/RotationalSweep";
import { Box } from "../solid/Box";
import { RuledSweep } from "../solid/RuledSweep";
import { AnyCurve } from "../curve/CurveChain";
import { Geometry, AxisOrder } from "../Geometry";
import { LineString3d } from "../curve/LineString3d";
import { HalfEdgeGraph, HalfEdge, HalfEdgeToBooleanFunction } from "../topology/Graph";
import { NullGeometryHandler, UVSurface } from "../geometry3d/GeometryHandler";
import { GrowableXYArray } from "../geometry3d/GrowableXYArray";

class Edgelet {
  public indexAlong: number;
  public pointIndex0?: number;
  public pointIndex1?: number;
  public paramIndex0?: number;
  public paramIndex1?: number;
  public normalIndex0?: number;
  public normalIndex1?: number;
  public needNormals: boolean;
  public needParams: boolean;
  public linestringA: LineString3d;
  public linestringB: LineString3d;
  public builder: PolyfaceBuilder;

  public constructor(builder: PolyfaceBuilder, linestringA: LineString3d, linestringB: LineString3d, needNormals: boolean, needParams: boolean) {
    this.linestringA = linestringA;
    this.linestringB = linestringB;
    this.builder = builder;
    this.indexAlong = -1;
    this.needNormals = needNormals;
    this.needParams = needParams;
  }

  public loadAtIndex(index: number, vParamA: number, vParamB: number) {
    this.indexAlong = index;
    this.pointIndex0 = this.builder.findOrAddPointInLineString(this.linestringA, index);
    this.pointIndex1 = this.builder.findOrAddPointInLineString(this.linestringB, index);
    if (this.needParams) {
      this.paramIndex0 = this.builder.findOrAddParamInLineString(this.linestringA, index, vParamA);
      this.paramIndex1 = this.builder.findOrAddParamInLineString(this.linestringB, index, vParamB);
    }
    if (this.needNormals) {
      this.normalIndex0 = this.builder.findOrAddNormalInLineStringPair(this.linestringA, this.linestringB, index, true);
      this.normalIndex1 = this.builder.findOrAddNormalInLineStringPair(this.linestringB, this.linestringB, index, false);
    }
  }

}
/**
 *
 * * Simple construction for strongly typed GeometryQuery objects:
 *
 * ** Create a builder with `builder = PolyfaceBuilder.create()`
 * ** Add GeemotryQuery objects:
 *
 * *** `builder.addGeometryQuery(g: GeometryQuery)`
 * *** `builder.addCone(cone: Cone)`
 * *** `builder.addTorusPipe(surface: TorusPipe)`
 * *** `builder.addLinearSweepLineStrings(surface: LinearSweep)`
 * *** `builder.addRotationalSweep(surface: RotatationalSweep)`
 * *** `builder.addLinearSweep(surface: LinearSweep)`
 * *** `builder.addRuledSweep(surface: RuledSweep)`
 * *** `builder.addSphere(sphere: Sphere)`
 * *** `builder.addBox(box: Box)`
 * *** `buidler.addIndexedPolyface(polyface)`
 * **  Extract with `builder.claimPolyface (true)`
 *
 * * Simple construction for ephemeral constructive data:
 *
 * ** Create a builder with `builder = PolyfaceBuilder.create()`
 * ** Add from fragmentary data:
 *
 * *** `builder.addBetweenLineStrings (linestringA, linestringB, addClosure)`
 * *** `builder.addBetweenTransformedLineStrings (curves, transformA, transformB, addClosure)`
 * *** `builder.addBetweenStroked (curveA, curveB)`
 * *** `builder.addLinearSweepLineStrigns (contour, vector)`
 * *** `builder.addPolygon (points, numPointsToUse)`
 * *** `builder.addTransformedUnitBox (transform)`
 * *** `builder.addTriangleFan (conePoint, linestring, toggleOrientation)`
 * *** `builder.addTrianglesInUnchedkedPolygon (linestring, toggle)`
 * *** `builder.addUVGrid(surface,numU, numV, createFanInCaps)`
 * *** `builder.addGraph(Graph, acceptFaceFunction)`
 * **  Extract with `builder.claimPolyface(true)`
 *
 * * Low-level detail construction -- direct use of indices
 *
 * ** Create a builder with `builder = PolyfaceBuilder.create()`
 * ** Add GeometryQuery objects
 *
 * *** `builder.findOrAddPoint(point)`
 * *** `builder.findOrAddPointInLineString (linestring, index)`
 * *** `builder.findorAddTransformedPointInLineString(linestring, index, transform)`
 * *** `builder.findOrAddPointXYZ(x,y,z)`
 * *** `builder.addTriangleFanFromIndex0(indexArray, toggle)`
 * *** `builder.addTriangle (point0, point1, point2)`
 * *** `builder.addQuad (point0, point1, point2, point3)`
 * *** `builder.addOneBasedPointIndex (index)`
 */
export class PolyfaceBuilder extends NullGeometryHandler {
  private _polyface: IndexedPolyface;
  private _options: StrokeOptions;
  public get options(): StrokeOptions { return this._options; }
  // State data that affects the current construction.
  private _reversed: boolean;
  /** extract the polyface. */
  public claimPolyface(compress: boolean = true): IndexedPolyface {
    if (compress)
      this._polyface.data.compress();
    return this._polyface;
  }
  public toggleReversedFacetFlag() { this._reversed = !this._reversed; }

  private constructor(options?: StrokeOptions) {
    super();
    this._options = options ? options : StrokeOptions.createForFacets();
    this._polyface = IndexedPolyface.create(this._options.needNormals,
      this._options.needParams, this._options.needColors);
    this._reversed = false;
  }

  public static create(options?: StrokeOptions): PolyfaceBuilder {
    return new PolyfaceBuilder(options);
  }
  /** add facets for a transformed unit box. */
  public addTransformedUnitBox(transform: Transform) {
    const pointIndex0 = this._polyface.data.pointCount;
    // these will have sequential indices starting at pointIndex0 . . .
    for (const p of BoxTopology.points)
      this._polyface.addPoint(transform.multiplyPoint3d(p));

    for (const facet of BoxTopology.cornerIndexCCW) {
      for (const pointIndex of facet)
        this._polyface.addPointIndex(pointIndex0 + pointIndex);
      this._polyface.terminateFacet();
    }
  }

  /** Add triangles from points[0] to each far edge.
   * @param ls linestring with point coordinates
   * @param toggle if true, wrap the triangle creation in toggleReversedFacetFlag.
   */
  public addTriangleFan(conePoint: Point3d, ls: LineString3d, toggle: boolean): void {
    const n = ls.numPoints();
    if (n > 2) {
      if (toggle)
        this.toggleReversedFacetFlag();
      const index0 = this.findOrAddPoint(conePoint);
      let index1 = this.findOrAddPointInLineString(ls, 0)!;
      let index2 = 0;
      for (let i = 1; i < n; i++) {
        index2 = this.findOrAddPointInLineString(ls, i)!;
        this.addIndexedTrianglePointIndexes(index0, index1, index2);
        index1 = index2;
      }
      if (toggle)
        this.toggleReversedFacetFlag();
    }
  }

  /** Add triangles from points[0] to each far edge
   * * Assume the polygon is convex.
   * * i.e. simple triangulation from point0
   * * i.e. simple cross products give a good normal.
   * @param ls linestring with point coordinates
   * @param reverse if true, wrap the triangle creation in toggleReversedFacetFlag.
   */
  public addTrianglesInUncheckedConvexPolygon(ls: LineString3d, toggle: boolean): void {
    const n = ls.numPoints();
    if (n > 2) {
      if (toggle)
        this.toggleReversedFacetFlag();
      let normal;
      let normalIndex;
      if (this._options.needNormals) {
        normal = ls.quickUnitNormal(PolyfaceBuilder._workVectorFindOrAdd)!;
        if (toggle)
          normal.scaleInPlace(-1.0);
        normalIndex = this._polyface.addNormal(normal);
      }
      const packedUV = ls.packedUVParams;
      let paramIndex0 = -1;
      let paramIndex1 = -1;
      let paramIndex2 = -1;
      if (packedUV) {
        paramIndex0 = this.findOrAddParamInGrowableXYArray(packedUV, 0)!;
        paramIndex1 = this.findOrAddParamInGrowableXYArray(packedUV, 1)!;
      }
      const pointIndex0 = this.findOrAddPointInLineString(ls, 0)!;
      let pointIndex1 = this.findOrAddPointInLineString(ls, 1)!;
      let pointIndex2 = 0;
      for (let i = 2; i < n; i++ , pointIndex1 = pointIndex2, paramIndex1 = paramIndex2) {
        pointIndex2 = this.findOrAddPointInLineString(ls, i)!;
        this.addIndexedTrianglePointIndexes(pointIndex0, pointIndex1, pointIndex2, false);
        if (normalIndex !== undefined)
          this.addIndexedTriangleNormalIndexes(normalIndex, normalIndex, normalIndex);
        if (packedUV) {
          paramIndex2 = this.findOrAddParamInGrowableXYArray(packedUV, 1)!;
          this.addIndexedTriangleParamIndexes(paramIndex0, paramIndex1, paramIndex2);
        }
        this._polyface.terminateFacet();
      }
      if (toggle)
        this.toggleReversedFacetFlag();
    }
  }
  /** Add triangles from points[0] to each far edge.
   * @param ls linestring with point coordinates
   * @param reverse if true, wrap the triangle creation in toggleReversedFacetFlag.
   */
  public addTriangleFanFromIndex0(index: GrowableFloat64Array, toggle: boolean, needNormals: boolean = false, needParams: boolean = false): void {
    const n = index.length;
    if (n > 2) {
      if (toggle)
        this.toggleReversedFacetFlag();
      const index0 = index.at(0);
      let index1 = index.at(1);
      let index2 = 0;
      for (let i = 2; i < n; i++) {
        index2 = index.at(i);
        this.addIndexedTrianglePointIndexes(index0, index1, index2);
        if (needNormals)
          this.addIndexedTriangleNormalIndexes(index0, index1, index2);
        if (needParams)
          this.addIndexedTriangleParamIndexes(index0, index1, index2);
        index1 = index2;
      }
      if (toggle)
        this.toggleReversedFacetFlag();
    }
  }

  /**
   * Announce point coordinates.  The implemetation is free to either create a new point or (if known) return indxex of a prior point with the same coordinates.
   */
  public findOrAddPoint(xyz: Point3d): number {
    return this._polyface.addPoint(xyz);
  }

  /**
   * Announce point coordinates.  The implemetation is free to either create a new param or (if known) return indxex of a prior param with the same coordinates.
   */
  public findOrAddParamXY(x: number, y: number): number {
    return this._polyface.addParamXY(x, y);
  }
  private static _workPointFindOrAddA = Point3d.create();
  private static _workPointFindOrAddB = Point3d.create();
  private static _workVectorFindOrAdd = Vector3d.create();
  private static _workUVFindOrAdd = Point2d.create();
  /**
   * Announce point coordinates.  The implemetation is free to either create a new point or (if knonw) return indxex of a prior point with the same coordinates.
   * @returns Returns the point index in the Polyface.
   * @param index Index of the point in the linestring.
   */
  public findOrAddPointInLineString(ls: LineString3d, index: number, transform?: Transform): number | undefined {
    const q = ls.pointAt(index, PolyfaceBuilder._workPointFindOrAddA);
    if (q) {
      if (transform)
        transform.multiplyPoint3d(q, q);
      return this._polyface.addPoint(q);
    }
    return undefined;
  }

  /**
   * Announce param coordinates.  The implemetation is free to either create a new param or (if knonw) return indxex of a prior point with the same coordinates.
   * @returns Returns the point index in the Polyface.
   * @param index Index of the param in the linestring.
   */
  public findOrAddParamInGrowableXYArray(data: GrowableXYArray, index: number): number | undefined {
    if (!data)
      return undefined;
    const q = data.getPoint2dAt(index, PolyfaceBuilder._workUVFindOrAdd);
    if (q) {
      return this._polyface.addParam(q);
    }
    return undefined;
  }
  /**
   * Announce param coordinates, taking u from linestring and v from parameter.  The implemetation is free to either create a new param or (if knonw) return indxex of a prior point with the same coordinates.
   * @returns Returns the point index in the Polyface.
   * @param index Index of the point in the linestring.
   */
  public findOrAddParamInLineString(ls: LineString3d, index: number, v: number): number | undefined {
    const u = (ls.fractions && index < ls.fractions.length) ? ls.fractions.at(index) : index / ls.points.length;
    return this._polyface.addParamUV(u, v);
  }
  /**
   * Return a normal index, with the normal computed as crossproduct of (a) vector between linestrings and (b) vector along linestring
   * @returns Returns the point index in the Polyface.
   * @param index Index of the point in the linestring.
   * @param atLsA true if the normal is being formed along lsA, false if along lsB
   */
  public findOrAddNormalInLineStringPair(lsA: LineString3d, lsB: LineString3d, index: number, atLsA: boolean): number | undefined {
    if (!lsA.packedDerivatives || !lsB.packedDerivatives)
      return undefined;
    const pointA = lsA.pointAt(index, PolyfaceBuilder._workPointFindOrAddA);
    const pointB = lsB.pointAt(index, PolyfaceBuilder._workPointFindOrAddB);
    const vectorAlong = (atLsA ? lsA : lsB).derivativeAt(index);
    if (vectorAlong && pointA && pointB) {
      const normalVector = vectorAlong.crossProductStartEnd(pointA, pointB).normalize(PolyfaceBuilder._workVectorFindOrAdd);
      if (normalVector)
        return this._polyface.addNormal(normalVector);
    }
    return undefined;
  }

  /**
   * Announce point coordinates.  The implemetation is free to either create a new point or (if known) return index of a prior point with the same coordinates.
   */
  public findOrAddPointXYZ(x: number, y: number, z: number): number {
    return this._polyface.addPointXYZ(x, y, z);
  }

  /** Returns a transform who can be applied to points on a triangular facet in order to obtain UV parameters. */
  private getUVTransformForTriangleFacet(pointA: Point3d, pointB: Point3d, pointC: Point3d): Transform | undefined {
    const vectorAB = pointA.vectorTo(pointB);
    const vectorAC = pointA.vectorTo(pointC);
    const unitAxes = Matrix3d.createRigidFromColumns(vectorAB, vectorAC, AxisOrder.XYZ);
    const localToWorld = Transform.createOriginAndMatrix(pointA, unitAxes);
    return localToWorld.inverse();
  }

  /** Returns the normal to a triangular facet. */
  private getNormalForTriangularFacet(pointA: Point3d, pointB: Point3d, pointC: Point3d): Vector3d {
    const vectorAB = pointA.vectorTo(pointB);
    const vectorAC = pointA.vectorTo(pointC);
    let normal = vectorAB.crossProduct(vectorAC).normalize();
    normal = normal ? normal : Vector3d.create();
    return normal;
  }

  // ###: Consider case where normals will be reversed and point through the other end of the facet
  /**
   * Add a quad to the polyface given its points in order around the edges.
   * Optionally provide params and the plane normal, otherwise they will be calculated without reference data.
   * Optionally mark this quad as the last piece of a face in this polyface.
   */
  public addQuadFacet(points: Point3d[], params?: Point2d[], normals?: Vector3d[]) {
    // If params and/or normals are needed, calculate them first
    const needParams = this.options.needParams;
    const needNormals = this.options.needNormals;
    let param0: Point2d, param1: Point2d, param2: Point2d, param3: Point2d;
    let normal0: Vector3d, normal1: Vector3d, normal2: Vector3d, normal3: Vector3d;
    if (needParams) {
      if (params !== undefined && params.length > 3) {
        param0 = params[0];
        param1 = params[1];
        param2 = params[2];
        param3 = params[3];
      } else {
        const paramTransform = this.getUVTransformForTriangleFacet(points[0], points[1], points[2]);
        if (paramTransform === undefined) {
          param0 = param1 = param2 = param3 = Point2d.createZero();
        } else {
          param0 = Point2d.createFrom(paramTransform.multiplyPoint3d(points[0]));
          param1 = Point2d.createFrom(paramTransform.multiplyPoint3d(points[1]));
          param2 = Point2d.createFrom(paramTransform.multiplyPoint3d(points[2]));
          param3 = Point2d.createFrom(paramTransform.multiplyPoint3d(points[3]));
        }
      }
    }
    if (needNormals) {
      if (normals !== undefined && normals.length > 3) {
        normal0 = normals[0];
        normal1 = normals[1];
        normal2 = normals[2];
        normal3 = normals[3];
      } else {
        normal0 = this.getNormalForTriangularFacet(points[0], points[1], points[2]);
        normal1 = this.getNormalForTriangularFacet(points[0], points[1], points[2]);
        normal2 = this.getNormalForTriangularFacet(points[0], points[1], points[2]);
        normal3 = this.getNormalForTriangularFacet(points[0], points[1], points[2]);
      }
    }

    if (this._options.shouldTriangulate) {
      // Add as two triangles, with a diagonal along the shortest distance
      const vectorAC = points[0].vectorTo(points[2]);
      const vectorBD = points[1].vectorTo(points[3]);

      // Note: We pass along any values for normals or params that we calculated
      if (vectorAC.magnitude() >= vectorBD.magnitude()) {
        this.addTriangleFacet([points[0], points[1], points[2]], needParams ? [param0!, param1!, param2!] : undefined, needNormals ? [normal0!, normal1!, normal2!] : undefined);
        this.addTriangleFacet([points[0], points[2], points[3]], needParams ? [param0!, param2!, param3!] : undefined, needNormals ? [normal0!, normal2!, normal3!] : undefined);
      } else {
        this.addTriangleFacet([points[0], points[1], points[3]], needParams ? [param0!, param1!, param3!] : undefined, needNormals ? [normal0!, normal1!, normal3!] : undefined);
        this.addTriangleFacet([points[1], points[2], points[3]], needParams ? [param1!, param2!, param3!] : undefined, needNormals ? [normal1!, normal2!, normal3!] : undefined);
      }
      return;
    }

    let idx0, idx1, idx2, idx3;

    // Add params if needed
    if (needParams) {
      idx0 = this._polyface.addParam(param0!);
      idx1 = this._polyface.addParam(param1!);
      idx2 = this._polyface.addParam(param2!);
      idx3 = this._polyface.addParam(param3!);
      this.addIndexedQuadParamIndexes(idx0, idx1, idx3, idx2);
    }

    // Add normals if needed
    if (needNormals) {
      idx0 = this._polyface.addNormal(normal0!);
      idx1 = this._polyface.addNormal(normal1!);
      idx2 = this._polyface.addNormal(normal2!);
      idx3 = this._polyface.addNormal(normal3!);
      this.addIndexedQuadNormalIndexes(idx0, idx1, idx3, idx2);
    }

    // Add point and point indexes last (terminates the facet)
    idx0 = this.findOrAddPoint(points[0]);
    idx1 = this.findOrAddPoint(points[1]);
    idx2 = this.findOrAddPoint(points[2]);
    idx3 = this.findOrAddPoint(points[3]);
    this.addIndexedQuadPointIndexes(idx0, idx1, idx3, idx2);
  }

  /** Announce a single quad facet's point indexes.
   *
   * * The actual quad may be reversed or trianglulated based on builder setup.
   * *  indexA0 and indexA1 are in the forward order at the "A" end of the quad
   * *  indexB0 and indexB1 are in the forward order at the "B" end of the quad.
   */
  private addIndexedQuadPointIndexes(indexA0: number, indexA1: number, indexB0: number, indexB1: number, terminate: boolean = true) {
    if (this._reversed) {
      this._polyface.addPointIndex(indexA0);
      this._polyface.addPointIndex(indexB0);
      this._polyface.addPointIndex(indexB1);
      this._polyface.addPointIndex(indexA1);
    } else {
      this._polyface.addPointIndex(indexA0);
      this._polyface.addPointIndex(indexA1);
      this._polyface.addPointIndex(indexB1);
      this._polyface.addPointIndex(indexB0);
    }
    if (terminate)
      this._polyface.terminateFacet();
  }

  /** For a single quad facet, add the indexes of the corresponding param points. */
  private addIndexedQuadParamIndexes(indexA0: number, indexA1: number, indexB0: number, indexB1: number) {
    if (this._reversed) {
      this._polyface.addParamIndex(indexA0);
      this._polyface.addParamIndex(indexB0);
      this._polyface.addParamIndex(indexB1);
      this._polyface.addParamIndex(indexA1);
    } else {
      this._polyface.addParamIndex(indexA0);
      this._polyface.addParamIndex(indexA1);
      this._polyface.addParamIndex(indexB1);
      this._polyface.addParamIndex(indexB0);
    }
  }

  /** For a single quad facet, add the indexes of the corresponding normal vectors. */
  private addIndexedQuadNormalIndexes(indexA0: number, indexA1: number, indexB0: number, indexB1: number) {
    if (this._reversed) {
      this._polyface.addNormalIndex(indexA0);
      this._polyface.addNormalIndex(indexB0);
      this._polyface.addNormalIndex(indexB1);
      this._polyface.addNormalIndex(indexA1);
    } else {
      this._polyface.addNormalIndex(indexA0);
      this._polyface.addNormalIndex(indexA1);
      this._polyface.addNormalIndex(indexB1);
      this._polyface.addNormalIndex(indexB0);
    }
  }

  // ### TODO: Consider case where normals will be reversed and point through the other end of the facet
  /**
   * Add a triangle to the polyface given its points in order around the edges.
   * * Optionally provide params and triangle normals, otherwise they will be calculated without reference data.
   */
  public addTriangleFacet(points: Point3d[], params?: Point2d[], normals?: Vector3d[]) {
    let idx0: number;
    let idx1: number;
    let idx2: number;

    // Add params if needed
    if (this._options.needParams) {
      if (params && params.length >= 3) { // Params were given
        idx0 = this._polyface.addParam(params[0]);
        idx1 = this._polyface.addParam(params[1]);
        idx2 = this._polyface.addParam(params[2]);
      } else {  // Compute params
        const paramTransform = this.getUVTransformForTriangleFacet(points[0], points[1], points[2]);
        idx0 = this._polyface.addParam(Point2d.createFrom(paramTransform ? paramTransform.multiplyPoint3d(points[0]) : undefined));
        idx1 = this._polyface.addParam(Point2d.createFrom(paramTransform ? paramTransform.multiplyPoint3d(points[1]) : undefined));
        idx2 = this._polyface.addParam(Point2d.createFrom(paramTransform ? paramTransform.multiplyPoint3d(points[2]) : undefined));
      }
      this.addIndexedTriangleParamIndexes(idx0, idx1, idx2);
    }

    // Add normals if needed
    if (this._options.needNormals) {
      if (normals !== undefined && normals.length > 2) { // Normals were given
        idx0 = this._polyface.addNormal(normals[0]);
        idx1 = this._polyface.addNormal(normals[1]);
        idx2 = this._polyface.addNormal(normals[2]);
      } else {  // Compute normals
        const normal = this.getNormalForTriangularFacet(points[0], points[1], points[2]);
        idx0 = this._polyface.addNormal(normal);
        idx1 = this._polyface.addNormal(normal);
        idx2 = this._polyface.addNormal(normal);
      }
      this.addIndexedTriangleNormalIndexes(idx0, idx1, idx2);
    }

    // Add point and point indexes last (terminates the facet)
    idx0 = this.findOrAddPoint(points[0]);
    idx1 = this.findOrAddPoint(points[1]);
    idx2 = this.findOrAddPoint(points[2]);
    this.addIndexedTrianglePointIndexes(idx0, idx1, idx2);
  }

  /** Announce a single triangle facet's point indexes.
   *
   * * The actual quad may be reversed or trianglulated based on builder setup.
   * *  indexA0 and indexA1 are in the forward order at the "A" end of the quad
   * *  indexB0 and indexB1 are in the forward order at the "B" end of hte quad.
   */
  private addIndexedTrianglePointIndexes(indexA: number, indexB: number, indexC: number, terminateFacet: boolean = true) {
    if (!this._reversed) {
      this._polyface.addPointIndex(indexA);
      this._polyface.addPointIndex(indexB);
      this._polyface.addPointIndex(indexC);
    } else {
      this._polyface.addPointIndex(indexA);
      this._polyface.addPointIndex(indexC);
      this._polyface.addPointIndex(indexB);
    }
    if (terminateFacet)
      this._polyface.terminateFacet();
  }

  /** For a single triangle facet, add the indexes of the corresponding params. */
  private addIndexedTriangleParamIndexes(indexA: number, indexB: number, indexC: number) {
    if (!this._reversed) {
      this._polyface.addParamIndex(indexA);
      this._polyface.addParamIndex(indexB);
      this._polyface.addParamIndex(indexC);
    } else {
      this._polyface.addParamIndex(indexA);
      this._polyface.addParamIndex(indexC);
      this._polyface.addParamIndex(indexB);
    }
  }

  /** For a single triangle facet, add the indexes of the corresponding params. */
  private addIndexedTriangleNormalIndexes(indexA: number, indexB: number, indexC: number) {
    if (!this._reversed) {
      this._polyface.addNormalIndex(indexA);
      this._polyface.addNormalIndex(indexB);
      this._polyface.addNormalIndex(indexC);
    } else {
      this._polyface.addNormalIndex(indexA);
      this._polyface.addNormalIndex(indexC);
      this._polyface.addNormalIndex(indexB);
    }
  }

  /** Add facets betwee lineStrings with matched point counts.
   *
   * * Facets are announced to addIndexedQuad.
   * * addIndexedQuad is free to apply reversal or triangulation options.
   */
  public addBetweenLineStrings(lineStringA: LineString3d, lineStringB: LineString3d, addClosure: boolean = false) {
    const pointA = lineStringA.points;
    const pointB = lineStringB.points;
    const numPoints = pointA.length;
    if (numPoints < 2 || numPoints !== pointB.length) return;
    let pointIndexA0 = this.findOrAddPoint(pointA[0]);
    let pointIndexB0 = this.findOrAddPoint(pointB[0]);
    const pointIndexA00 = pointIndexA0;
    const pointIndexB00 = pointIndexB0;
    let pointIndexA1 = 0;
    let pointIndexB1 = 0;
    for (let i = 1; i < numPoints; i++) {
      pointIndexA1 = this.findOrAddPoint(pointA[i]);
      pointIndexB1 = this.findOrAddPoint(pointB[i]);
      this.addIndexedQuadPointIndexes(pointIndexA0, pointIndexA1, pointIndexB0, pointIndexB1);
      pointIndexA0 = pointIndexA1;
      pointIndexB0 = pointIndexB1;
    }
    if (addClosure)
      this.addIndexedQuadPointIndexes(pointIndexA0, pointIndexA00, pointIndexB0, pointIndexB00);
  }

  public addQuadBetweenEdgelets(edgeA: Edgelet, edgeB: Edgelet) {
    if (this._options.needNormals)
      this.addIndexedQuadNormalIndexes(edgeA.normalIndex0!, edgeB.normalIndex0!, edgeB.normalIndex1!, edgeA.normalIndex1!);
    if (this._options.needParams)
      this.addIndexedQuadParamIndexes(edgeA.paramIndex0!, edgeB.paramIndex0!, edgeB.paramIndex1!, edgeA.paramIndex1!);
    this.addIndexedQuadPointIndexes(edgeA.pointIndex0!, edgeB.pointIndex0!, edgeB.pointIndex1!, edgeA.pointIndex1!, false);
    this._polyface.terminateFacet();
  }

  /** Add facets betwee lineStrings with matched point counts.
   *
   * * Facets are announced to addIndexedQuad.
   * * addIndexedQuad is free to apply reversal or triangulation options.
   */
  public addBetweenLineStringsExt(lineStringA: LineString3d, lineStringB: LineString3d,
    vA: number,
    vB: number,
    addClosure: boolean = false) {
    const numPoints = lineStringA.numPoints();
    if (lineStringA.numPoints() < 2 || lineStringB.numPoints() !== lineStringA.numPoints())
      return;
    let edgeA = new Edgelet(this, lineStringA, lineStringB, this._options.needNormals, this._options.needParams);
    let edgeB = new Edgelet(this, lineStringA, lineStringB, this._options.needNormals, this._options.needParams);
    edgeA.loadAtIndex(0, vA, vB);
    let edgeQ;
    for (let i = 1; i < numPoints; i++) {
      edgeB.loadAtIndex(i, vA, vB);
      // SWAP references to struts ...
      edgeQ = edgeA;
      edgeA = edgeB;
      edgeB = edgeQ;
      this.addQuadBetweenEdgelets(edgeA, edgeB);
    }
    if (addClosure) {
      edgeB.loadAtIndex(0, vA, vB);
      this.addQuadBetweenEdgelets(edgeA, edgeB);
    }
  }

  /** Add facets betwee lineStrings with matched point counts.
   *
   * * Facets are announced to addIndexedQuad.
   * * addIndexedQuad is free to apply reversal or triangulation options.
   */
  public addBetweenTransformedLineStrings(curves: AnyCurve, transformA: Transform, transformB: Transform, addClosure: boolean = false) {
    if (curves instanceof LineString3d) {
      const pointA = curves.points;
      const numPoints = pointA.length;
      let indexA0 = this.findOrAddPointInLineString(curves, 0, transformA)!;
      let indexB0 = this.findOrAddPointInLineString(curves, 0, transformB)!;
      const indexA00 = indexA0;
      const indexB00 = indexB0;
      let indexA1 = 0;
      let indexB1 = 0;
      for (let i = 1; i < numPoints; i++) {
        indexA1 = this.findOrAddPointInLineString(curves, i, transformA)!;
        indexB1 = this.findOrAddPointInLineString(curves, i, transformB)!;
        this.addIndexedQuadPointIndexes(indexA0, indexA1, indexB0, indexB1);
        indexA0 = indexA1;
        indexB0 = indexB1;
      }
      if (addClosure)
        this.addIndexedQuadPointIndexes(indexA0, indexA00, indexB0, indexB00);
    } else {
      const children = curves.children;
      // just send the children individually -- final compres will fix things??
      if (children)
        for (const c of children) {
          this.addBetweenTransformedLineStrings(c as AnyCurve, transformA, transformB);
        }
    }
  }

  public addBetweenStroked(dataA: AnyCurve, dataB: AnyCurve) {
    if (dataA instanceof LineString3d && dataB instanceof LineString3d) {
      this.addBetweenLineStrings(dataA, dataB, false);
    } else if (dataA instanceof CurveChain && dataB instanceof CurveChain) {
      const chainA = dataA.children;
      const chainB = dataB.children;
      if (chainA.length === chainB.length) {
        for (let i = 0; i < chainA.length; i++) {
          const cpA = chainA[i];
          const cpB = chainB[i];
          if (cpA instanceof LineString3d && cpB instanceof LineString3d) {
            this.addBetweenLineStrings(cpA, cpB);
          }
        }
      }
    }
  }
  /**
   *
   * @param cone cone to facet
   * @param strokeCount number of strokes around the cone.  If present, it overrides size-based stroking.
   */
  public addCone(cone: Cone) {
    // ensure identical stroke counts at each end . . .
    let strokeCount = 16;
    if (this._options) {
      strokeCount = this._options.applyTolerancesToArc(cone.getMaxRadius());
    }
    const lineStringA = cone.strokeConstantVSection(0.0, strokeCount, this._options);
    const lineStringB = cone.strokeConstantVSection(1.0, strokeCount, this._options);
    this.addBetweenLineStringsExt(lineStringA, lineStringB, 0.0, 1.0, false);
    this.endFace();
    if (cone.capped) {
      this.addTrianglesInUncheckedConvexPolygon(lineStringA, true);  // lower triangles flip
      this.endFace();
      this.addTrianglesInUncheckedConvexPolygon(lineStringB, false); // upper triangles to not flip.
      this.endFace();
    }
  }

  /**
   *
   * @param surface TorusPipe to facet
   * @param strokeCount number of strokes around the cone.  If omitted, use the strokeOptions previously supplied to the builder.
   */
  public addTorusPipe(surface: TorusPipe, phiStrokeCount?: number, thetaStrokeCount?: number) {
    this.toggleReversedFacetFlag();
    this.addUVGrid(surface,
      phiStrokeCount ? phiStrokeCount : 8,
      thetaStrokeCount ? thetaStrokeCount : Math.ceil(16 * surface.getThetaFraction()),
      surface.capped);
    this.toggleReversedFacetFlag();
  }

  /**
   *
   * @param vector sweep vector
   * @param contour contour which contains only linestrings
   */
  public addLinearSweepLineStrings(contour: AnyCurve, vector: Vector3d) {
    if (contour instanceof LineString3d) {
      const ls = contour as LineString3d;
      let pointA = Point3d.create();
      let pointB = Point3d.create();
      let indexA0 = 0;
      let indexA1 = 0;
      let indexB0 = 0;
      let indexB1 = 0;
      const n = ls.numPoints();
      for (let i = 0; i < n; i++) {
        pointA = ls.pointAt(i, pointA)!;
        pointB = pointA.plus(vector, pointB);
        indexA1 = this.findOrAddPoint(pointA);
        indexB1 = this.findOrAddPoint(pointB);
        if (i > 0) {
          this.addIndexedQuadPointIndexes(indexA0, indexA1, indexB0, indexB1);
        }
        indexA0 = indexA1;
        indexB0 = indexB1;
      }
    } else if (contour instanceof CurveChain) {
      for (const ls of contour.children) {
        this.addLinearSweepLineStrings(ls, vector);
      }
    }
  }

  public addRotationalSweep(surface: RotationalSweep) {
    const strokes = surface.getCurves().cloneStroked();
    const numStep = StrokeOptions.applyAngleTol(this._options, 1, surface.getSweep().radians, undefined);
    const transformA = Transform.createIdentity();
    const transformB = Transform.createIdentity();
    for (let i = 1; i <= numStep; i++) {
      surface.getFractionalRotationTransform(i / numStep, transformB);
      this.addBetweenTransformedLineStrings(strokes, transformA, transformB);
      transformA.setFrom(transformB);
    }
    if (surface.capped) {
      const contour = surface.getSweepContourRef();
      contour.emitFacets(this, true, undefined);
      contour.emitFacets(this, false, transformB);
    }

  }

  /**
   *
   * @param cone cone to facet
   */
  public addLinearSweep(surface: LinearSweep) {
    const baseStrokes = surface.getCurvesRef().cloneStroked();
    this.addLinearSweepLineStrings(baseStrokes, surface.cloneSweepVector());
    if (surface.capped) {
      const contour = surface.getSweepContourRef();
      contour.emitFacets(this, true, undefined);
      contour.emitFacets(this, false, Transform.createTranslation(surface.cloneSweepVector()));
    }
  }

  /**
   *
   * @param cone cone to facet
   */
  public addRuledSweep(surface: RuledSweep) {
    const contours = surface.sweepContoursRef();
    let stroke0;
    let stroke1;
    for (let i = 0; i < contours.length; i++) {
      stroke1 = contours[i].curves.cloneStroked();
      if (i > 0 && stroke0 && stroke1)
        this.addBetweenStroked(stroke0, stroke1);
      stroke0 = stroke1;
    }
    contours[0].emitFacets(this, true, undefined);
    contours[contours.length - 1].emitFacets(this, false, undefined);
  }

  public addSphere(sphere: Sphere, strokeCount?: number) {
    const numLongitudeStroke = strokeCount ? strokeCount : this._options.defaultCircleStrokes;
    const numLatitudeStroke = Geometry.clampToStartEnd(numLongitudeStroke * 0.5, 4, 32);
    let lineStringA = sphere.strokeConstantVSection(0.0, numLongitudeStroke);
    if (sphere.capped && !Geometry.isSmallMetricDistance(lineStringA.quickLength()))
      this.addTrianglesInUncheckedConvexPolygon(lineStringA, true);  // lower triangles flip
    for (let i = 1; i <= numLatitudeStroke; i++) {
      const lineStringB = sphere.strokeConstantVSection(i / numLatitudeStroke, numLongitudeStroke);
      this.addBetweenLineStrings(lineStringA, lineStringB);
      lineStringA = lineStringB;
    }

    if (sphere.capped && !Geometry.isSmallMetricDistance(lineStringA.quickLength()))
      this.addTrianglesInUncheckedConvexPolygon(lineStringA, true);  // upper triangles do not flip

  }

  public addBox(box: Box) {
    const lineStringA = box.strokeConstantVSection(0.0);
    const lineStringB = box.strokeConstantVSection(1.0);
    this.addBetweenLineStrings(lineStringA, lineStringB);
    if (box.capped) {
      this.addTrianglesInUncheckedConvexPolygon(lineStringA, true);  // lower triangles flip
      this.addTrianglesInUncheckedConvexPolygon(lineStringB, false); // upper triangles to not flip.
    }
  }

  /** Add a polygon to the evolving facets.
   *
   * * Add points to the polyface
   * * indices are added (in reverse order if indicated by the builder state)
   * @param points array of points.  This may contain extra points not to be used in the polygon
   * @param numPointsToUse number of points to use.
   */
  public addPolygon(points: Point3d[], numPointsToUse?: number) {
    // don't use trailing points that match start point.
    if (numPointsToUse === undefined)
      numPointsToUse = points.length;
    while (numPointsToUse > 1 && points[numPointsToUse - 1].isAlmostEqual(points[0]))
      numPointsToUse--;
    let index = 0;
    if (!this._reversed) {
      for (let i = 0; i < numPointsToUse; i++) {
        index = this.findOrAddPoint(points[i]);
        this._polyface.addPointIndex(index);
      }
    } else {
      for (let i = numPointsToUse; --i >= 0;) {
        index = this.findOrAddPoint(points[i]);
        this._polyface.addPointIndex(index);
      }
    }
    this._polyface.terminateFacet();
  }

  /** Add a polyface, with optional reverse and transform. */
  public addIndexedPolyface(source: IndexedPolyface, reversed: boolean, transform?: Transform) {
    this._polyface.addIndexedPolyface(source, reversed, transform);
  }

  /**
   * Produce a new FacetFaceData for all terminated facets since construction of the previous face.
   * Each facet number/index is mapped to the FacetFaceData through the faceToFaceData array.
   * Returns true if successful, and false otherwise.
   */
  public endFace(): boolean {
    return this._polyface.setNewFaceData();
  }

  // -------------------- double dispatch methods ---------------------------
  public handleCone(g: Cone): any { return this.addCone(g); }
  public handleTorusPipe(g: TorusPipe): any { return this.addTorusPipe(g); }
  public handleSphere(g: Sphere): any { return this.addSphere(g); }
  public handleBox(g: Box): any { return this.addBox(g); }
  public handleLinearSweep(g: LinearSweep): any { return this.addLinearSweep(g); }
  public handleRotationalSweep(g: RotationalSweep): any { return this.addRotationalSweep(g); }
  public handleRuledSweep(g: RuledSweep): any { return this.addRuledSweep(g); }
  public addGeometryQuery(g: GeometryQuery) { g.dispatchToGeometryHandler(this); }

  /**
   *
   * * Visit all faces
   * * Test each face with f(node) for any node on the face.
   * * For each face that passes, pass its coordinates to the builder.
   * * Rely on the builder's compress step to find common vertex coordinates
   */
  public addGraph(graph: HalfEdgeGraph, needParams: boolean, acceptFaceFunction: HalfEdgeToBooleanFunction = HalfEdge.testNodeMaskNotExterior) {
    let index = 0;
    graph.announceFaceLoops(
      (_graph: HalfEdgeGraph, seed: HalfEdge) => {
        if (acceptFaceFunction(seed)) {
          let node = seed;
          do {
            index = this.findOrAddPointXYZ(node.x, node.y, node.z);
            this._polyface.addPointIndex(index);
            if (needParams) {
              index = this.findOrAddParamXY(node.x, node.y);
              this._polyface.addParamIndex(index);
            }
            node = node.faceSuccessor;
          } while (node !== seed);
          this._polyface.terminateFacet();
        }
        return true;
      });
  }
  public static graphToPolyface(graph: HalfEdgeGraph, options?: StrokeOptions, acceptFaceFunction: HalfEdgeToBooleanFunction = HalfEdge.testNodeMaskNotExterior): IndexedPolyface {
    const builder = PolyfaceBuilder.create(options);
    builder.addGraph(graph, builder.options.needParams, acceptFaceFunction);
    builder.endFace();
    return builder.claimPolyface();
  }
  private static _index0 = new GrowableFloat64Array();
  private static _index1 = new GrowableFloat64Array();

  /**
   * Given arrays of coordinates for multiple facets.
   * * pointArray[i] is an array of 3 or 4 points
   * * paramArray[i] is an array of matching number of params
   * * normalArray[i] is an array of matching number of normals.
   * @param pointArray array of arrays of point coordinates
   * @param paramArray array of arrays of uv parameters
   * @param normalArray array of arrays of normals
   * @param endFace if true, call this.endFace after adding all the facets.
   */
  public addCoordinateFacets(pointArray: Point3d[][], paramArray?: Point2d[][], normalArray?: Vector3d[][], endFace: boolean = false) {
    for (let i = 0; i < pointArray.length; i++) {
      const params = paramArray ? paramArray[i] : undefined;
      const normals = normalArray ? normalArray[i] : undefined;

      if (pointArray[i].length === 3)
        this.addTriangleFacet(pointArray[i], params, normals);
      else if (pointArray[i].length === 4)
        this.addQuadFacet(pointArray[i], params, normals);
    }

    if (endFace)
      this.endFace();
  }

  public addUVGrid(surface: UVSurface, numU: number, numV: number, createFanInCaps: boolean) {
    let index0 = PolyfaceBuilder._index0;
    let index1 = PolyfaceBuilder._index1;
    const reverse = this._reversed;
    const needNormals = this.options.needNormals;
    const needParams = this.options.needParams;
    let indexSwap;
    index0.ensureCapacity(numU);
    index1.ensureCapacity(numU);
    const uv = Point2d.create();
    const normal = Vector3d.create();
    const du = 1.0 / numU;
    const dv = 1.0 / numV;
    // BIG ASSUMPTION: addPoint, addParam, addNormal all add points in simple order (to be compressed later) and can share indices.
    for (let v = 0; v <= numV; v++) {
      // evaluate new points ....
      index1.clear();
      for (let u = 0; u <= numU; u++) {
        const uFrac = u * du;
        const vFrac = v * dv;
        const plane = surface.UVFractionToPointAndTangents(uFrac, vFrac);
        if (needNormals) {
          plane.vectorU.crossProduct(plane.vectorV, normal);
          normal.normalizeInPlace();
          if (reverse)
            normal.scaleInPlace(-1.0);
          this._polyface.addNormal(normal);
        }
        if (needParams)
          this._polyface.addParam(Point2d.create(u, v, uv));
        index1.push(this._polyface.addPoint(plane.origin));
      }

      if (createFanInCaps && (v === 0 || v === numV)) {
        this.addTriangleFanFromIndex0(index1, v === 0, true, true);
      }
      if (v > 0) {
        for (let u = 0; u < numU; u++) {
          this.addIndexedQuadPointIndexes(
            index0.at(u), index0.at(u + 1),
            index1.at(u), index1.at(u + 1), false);
          if (this._options.needParams)
            this.addIndexedQuadNormalIndexes(
              index0.at(u), index0.at(u + 1),
              index1.at(u), index1.at(u + 1));
          if (this._options.needParams)
            this.addIndexedQuadParamIndexes(
              index0.at(u), index0.at(u + 1),
              index1.at(u), index1.at(u + 1));
          this._polyface.terminateFacet();
        }

      }
      indexSwap = index1;
      index1 = index0;
      index0 = indexSwap;
    }
    index0.clear();
    index1.clear();
  }

}
