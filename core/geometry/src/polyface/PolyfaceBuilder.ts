/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/

/** @module Polyface */

// import { Geometry, AxisOrder, Angle, AngleSweep, BSIJSONValues } from "./Geometry";
import { IndexedPolyface } from "./Polyface";
import { GrowableFloat64Array } from "../GrowableArray";
import { Point3d, Vector3d, Point2d, Vector2d } from "../PointVector";
import { Transform, RotMatrix } from "../Transform";
import { BoxTopology } from "./BoxTopology";
import { StrokeOptions } from "../curve/StrokeOptions";
import { GeometryQuery } from "../curve/CurvePrimitive";
import { Cone } from "../solid/Cone";
import { CurveChain } from "../curve/CurveChain";
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
import { NullGeometryHandler, UVSurface } from "../GeometryHandler";

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
  private polyface: IndexedPolyface;
  private options: StrokeOptions;
  // State data that affects the current construction.
  private reversed: boolean;
  /** extract the polyface. */
  public claimPolyface(compress: boolean = true): IndexedPolyface {
    if (compress)
      this.polyface.data.compress();
    return this.polyface;
  }
  public toggleReversedFacetFlag() { this.reversed = !this.reversed; }

  private constructor(options?: StrokeOptions) {
    super();
    this.options = options ? options : StrokeOptions.createForFacets();
    this.polyface = IndexedPolyface.create(this.options.needNormals,
      this.options.needParams, this.options.needColors);
    this.reversed = false;
  }

  public static create(options?: StrokeOptions): PolyfaceBuilder {
    return new PolyfaceBuilder(options);
  }
  /** add facets for a transformed unit box. */
  public addTransformedUnitBox(transform: Transform) {
    const pointIndex0 = this.polyface.data.pointCount;
    // these will have sequential indices starting at pointIndex0 . . .
    for (const p of BoxTopology.points)
      this.polyface.addPoint(transform.multiplyPoint3d(p));

    for (const facet of BoxTopology.cornerIndexCCW) {
      for (const pointIndex of facet)
        this.polyface.addPointIndex(pointIndex0 + pointIndex);
      this.polyface.terminateFacet();
    }
  }

  /** Add triangles from points[0] to each far edge.
   * @param ls linestring with point coordinates
   * @param reverse if true, wrap the triangle creation in toggleReversedFacetFlag.
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

  /** Add triangles from points[0] to each far edge.
   * @param ls linestring with point coordinates
   * @param reverse if true, wrap the triangle creation in toggleReversedFacetFlag.
   */
  public addTrianglesInUncheckedPolygon(ls: LineString3d, toggle: boolean): void {
    const n = ls.numPoints();
    if (n > 2) {
      if (toggle)
        this.toggleReversedFacetFlag();
      const index0 = this.findOrAddPointInLineString(ls, 0)!;
      let index1 = this.findOrAddPointInLineString(ls, 1)!;
      let index2 = 0;
      for (let i = 2; i < n; i++) {
        index2 = this.findOrAddPointInLineString(ls, i)!;
        this.addIndexedTrianglePointIndexes(index0, index1, index2);
        index1 = index2;
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
   * Announce point coordinates.  The implemetation is free to either create a new point or (if knonw) return indxex of a prior point with the same coordinates.
   */
  public findOrAddPoint(xyz: Point3d): number {
    return this.polyface.addPoint(xyz);
  }

  private static workPointFindOrAdd = Point3d.create();

  /**
   * Announce point coordinates.  The implemetation is free to either create a new point or (if knonw) return indxex of a prior point with the same coordinates.
   * @returns Returns the point index in the Polyface.
   * @param index Index of the point in the linestring.
   */
  public findOrAddPointInLineString(ls: LineString3d, index: number, transform?: Transform): number | undefined {
    const q = ls.pointAt(index, PolyfaceBuilder.workPointFindOrAdd);
    if (q) {
      if (transform)
        transform.multiplyPoint3d(q, q);
      return this.polyface.addPoint(q);
    }
    return undefined;
  }

  /**
   * Announce point coordinates.  The implemetation is free to either create a new point or (if known) return index of a prior point with the same coordinates.
   */
  public findOrAddPointXYZ(x: number, y: number, z: number): number {
    return this.polyface.addPointXYZ(x, y, z);
  }

  // ###: Consider case where normals will be reversed and point through the other end of the facet
  // ###: We should be able to only append one normal for this entire quad
  // ###: May want to use Growable iterable due to the way we pass onto addTriangle()...
  /**
   * Add a quad to the polyface given its points in order around the edges.
   * Optionally provide params and normals, otherwise they will be calculated without reference data.
   * Optionally mark this quad as the last piece of a face in this polyface.
   */
  public addQuad(points: Point3d[], params?: Point2d[], normals?: Vector3d[], endFace: boolean = false) {
    if (this.options.maxEdgeLength !== undefined && this.options.maxEdgeLength < 4) {
      // Add as two triangles, with a diagonal along the shortest distance
      const vectorAC = points[0].vectorTo(points[2]);
      const vectorBD = points[1].vectorTo(points[3]);

      if (vectorAC.magnitude() >= vectorBD.magnitude()) {
        this.addTriangle([points[0], points[1], points[2]], params ? [params[0], params[1], params[2]] : undefined, normals ? [normals[0], normals[1], normals[2]] : undefined);
        this.addTriangle([points[0], points[2], points[3]], params ? [params[0], params[2], params[3]] : undefined, normals ? [normals[0], normals[2], normals[3]] : undefined);
      } else {
        this.addTriangle([points[0], points[1], points[3]], params ? [params[0], params[1], params[3]] : undefined, normals ? [normals[0], normals[1], normals[3]] : undefined);
        this.addTriangle([points[1], points[2], points[3]], params ? [params[1], params[2], params[3]] : undefined, normals ? [normals[1], normals[2], normals[3]] : undefined);
      }
      if (endFace)
        this.endFace();
      return;
    }

    let idx0 = this.findOrAddPoint(points[0]);
    let idx1 = this.findOrAddPoint(points[1]);
    let idx2 = this.findOrAddPoint(points[2]);
    let idx3 = this.findOrAddPoint(points[3]);
    this.addIndexedQuadPointIndexes(idx0, idx1, idx2, idx3);

    // Add params if needed
    if (this.polyface.data.param !== undefined) {
      if (params && params.length >= 4) { // Params were given
        idx0 = this.polyface.addParam(params[0]);
        idx1 = this.polyface.addParam(params[1]);
        idx2 = this.polyface.addParam(params[2]);
        idx3 = this.polyface.addParam(params[3]);
      } else {  // Compute params
        const vectorAB = points[0].vectorTo(points[1]);
        const vectorAC = points[0].vectorTo(points[2]);
        const unitAxes = RotMatrix.createRigidFromColumns(vectorAB, vectorAC, AxisOrder.XYZ);
        const localToWorld = Transform.createOriginAndMatrix(points[0], unitAxes);
        idx0 = this.polyface.addParam(Point2d.createFrom(localToWorld.multiplyInversePoint3d(points[0])));
        idx1 = this.polyface.addParam(Point2d.createFrom(localToWorld.multiplyInversePoint3d(points[1])));
        idx2 = this.polyface.addParam(Point2d.createFrom(localToWorld.multiplyInversePoint3d(points[2])));
        idx3 = this.polyface.addParam(Point2d.createFrom(localToWorld.multiplyInversePoint3d(points[3])));
      }
      this.addIndexedQuadParamIndexes(idx0, idx1, idx2, idx3);
    }

    // Add normals if needed
    if (this.polyface.data.normal !== undefined) {
      if (normals && normals.length >= 4) { // Normals were given
        idx0 = this.polyface.addNormal(normals[0]);
        idx1 = this.polyface.addNormal(normals[1]);
        idx2 = this.polyface.addNormal(normals[2]);
        idx3 = this.polyface.addNormal(normals[3]);
      } else {  // Compute normals
        const vectorAB = points[0].vectorTo(points[1]);
        const vectorAC = points[0].vectorTo(points[2]);
        const normal = vectorAB.crossProduct(vectorAC);
        idx0 = this.polyface.addNormal(normal);
        idx1 = this.polyface.addNormal(normal);
        idx2 = this.polyface.addNormal(normal);
        idx3 = this.polyface.addNormal(normal);
      }
      this.addIndexedQuadNormalIndexes(idx0, idx1, idx2, idx3);
    }

    if (endFace)
      this.endFace();
  }

  /** Announce a single quad facet's point indexes.
   *
   * * The actual quad may be reversed or trianglulated based on builder setup.
   * *  indexA0 and indexA1 are in the forward order at the "A" end of the quad
   * *  indexB0 and indexB1 are in the forward order at the "B" end of the quad.
   */
  private addIndexedQuadPointIndexes(indexA0: number, indexA1: number, indexB0: number, indexB1: number) {
    if (this.reversed) {
      this.polyface.addPointIndex(indexA0);
      this.polyface.addPointIndex(indexB0);
      this.polyface.addPointIndex(indexB1);
      this.polyface.addPointIndex(indexA1);
      this.polyface.terminateFacet();
    } else {
      this.polyface.addPointIndex(indexA0);
      this.polyface.addPointIndex(indexA1);
      this.polyface.addPointIndex(indexB1);
      this.polyface.addPointIndex(indexB0);
      this.polyface.terminateFacet();
    }
  }

  /** For a single quad facet, add the indexes of the corresponding param points. */
  private addIndexedQuadParamIndexes(indexA0: number, indexA1: number, indexB0: number, indexB1: number) {
    if (this.reversed) {
      this.polyface.addParamIndex(indexA0);
      this.polyface.addParamIndex(indexB0);
      this.polyface.addParamIndex(indexB1);
      this.polyface.addParamIndex(indexA1);
    } else {
      this.polyface.addParamIndex(indexA0);
      this.polyface.addParamIndex(indexA1);
      this.polyface.addParamIndex(indexB1);
      this.polyface.addParamIndex(indexB0);
    }
  }

  /** For a single quad facet, add the indexes of the corresponding normal vectors. */
  private addIndexedQuadNormalIndexes(indexA0: number, indexA1: number, indexB0: number, indexB1: number) {
    if (this.reversed) {
      this.polyface.addNormalIndex(indexA0);
      this.polyface.addNormalIndex(indexB0);
      this.polyface.addNormalIndex(indexB1);
      this.polyface.addNormalIndex(indexA1);
    } else {
      this.polyface.addNormalIndex(indexA0);
      this.polyface.addNormalIndex(indexA1);
      this.polyface.addNormalIndex(indexB1);
      this.polyface.addNormalIndex(indexB0);
    }
  }

  // ### TODO: Consider case where normals will be reversed and point through the other end of the facet
  // ### TODO: We should be able to only append one normal for this entire quad
  /**
   * Add a triangle to the polyface given its points in order around the edges.
   * Optionally provide params and normals, otherwise they will be calculated without reference data.
   * Optionally mark this triangle as the last piece of a face in this polyface.
   */
  public addTriangle(points: Point3d[], params?: Point2d[], normals?: Vector3d[], endFace: boolean = false) {
    let idx0 = this.findOrAddPoint(points[0]);
    let idx1 = this.findOrAddPoint(points[1]);
    let idx2 = this.findOrAddPoint(points[2]);
    this.addIndexedTrianglePointIndexes(idx0, idx1, idx2);

    // Add params if needed
    if (this.polyface.data.param !== undefined) {
      if (params && params.length >= 3) { // Params were given
        idx0 = this.polyface.addParam(params[0]);
        idx1 = this.polyface.addParam(params[1]);
        idx2 = this.polyface.addParam(params[2]);
      } else {  // Compute params
        const vectorAB = points[0].vectorTo(points[1]);
        const vectorAC = points[0].vectorTo(points[2]);
        const unitAxes = RotMatrix.createRigidFromColumns(vectorAB, vectorAC, AxisOrder.XYZ);
        const localToWorld = Transform.createOriginAndMatrix(points[0], unitAxes);
        idx0 = this.polyface.addParam(Point2d.createFrom(localToWorld.multiplyInversePoint3d(points[0])));
        idx1 = this.polyface.addParam(Point2d.createFrom(localToWorld.multiplyInversePoint3d(points[1])));
        idx2 = this.polyface.addParam(Point2d.createFrom(localToWorld.multiplyInversePoint3d(points[2])));
      }
      this.addIndexedTriangleParamIndexes(idx0, idx1, idx2);
    }

    // Add normals if needed
    if (this.polyface.data.normal !== undefined) {
      if (normals && normals.length >= 3) { // Normals were given
        idx0 = this.polyface.addNormal(normals[0]);
        idx1 = this.polyface.addNormal(normals[1]);
        idx2 = this.polyface.addNormal(normals[2]);
      } else {  // Compute normals
        const vectorAB = points[0].vectorTo(points[1]);
        const vectorAC = points[0].vectorTo(points[2]);
        const normal = vectorAB.crossProduct(vectorAC);
        idx0 = this.polyface.addNormal(normal);
        idx1 = this.polyface.addNormal(normal);
        idx2 = this.polyface.addNormal(normal);
      }
      this.addIndexedTriangleNormalIndexes(idx0, idx1, idx2);
    }

    if (endFace)
      this.endFace();
  }

  /** Announce a single triangle facet's point indexes.
   *
   * * The actual quad may be reversed or trianglulated based on builder setup.
   * *  indexA0 and indexA1 are in the forward order at the "A" end of the quad
   * *  indexB0 and indexB1 are in the forward order at the "B" end of hte quad.
   */
  private addIndexedTrianglePointIndexes(indexA: number, indexB: number, indexC: number) {
    if (indexA === indexB || indexB === indexC || indexC === indexA) return;
    if (!this.reversed) {
      this.polyface.addPointIndex(indexA);
      this.polyface.addPointIndex(indexB);
      this.polyface.addPointIndex(indexC);
      this.polyface.terminateFacet();
    } else {
      this.polyface.addPointIndex(indexA);
      this.polyface.addPointIndex(indexC);
      this.polyface.addPointIndex(indexB);
      this.polyface.terminateFacet();
    }
  }

  /** For a single triangle facet, add the indexes of the corresponding params. */
  private addIndexedTriangleParamIndexes(indexA: number, indexB: number, indexC: number) {
    if (indexA === indexB || indexB === indexC || indexC === indexA) return;
    if (!this.reversed) {
      this.polyface.addParamIndex(indexA);
      this.polyface.addParamIndex(indexB);
      this.polyface.addParamIndex(indexC);
    } else {
      this.polyface.addParamIndex(indexA);
      this.polyface.addParamIndex(indexC);
      this.polyface.addParamIndex(indexB);
    }
  }

  /** For a single triangle facet, add the indexes of the corresponding params. */
  private addIndexedTriangleNormalIndexes(indexA: number, indexB: number, indexC: number) {
    if (indexA === indexB || indexB === indexC || indexC === indexA) return;
    if (!this.reversed) {
      this.polyface.addNormalIndex(indexA);
      this.polyface.addNormalIndex(indexB);
      this.polyface.addNormalIndex(indexC);
    } else {
      this.polyface.addNormalIndex(indexA);
      this.polyface.addNormalIndex(indexC);
      this.polyface.addNormalIndex(indexB);
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
    let indexA0 = this.findOrAddPoint(pointA[0]);
    let indexB0 = this.findOrAddPoint(pointB[0]);
    const indexA00 = indexA0;
    const indexB00 = indexB0;
    let indexA1 = 0;
    let indexB1 = 0;
    for (let i = 1; i < numPoints; i++) {
      indexA1 = this.findOrAddPoint(pointA[i]);
      indexB1 = this.findOrAddPoint(pointB[i]);
      this.addIndexedQuadPointIndexes(indexA0, indexA1, indexB0, indexB1);
      indexA0 = indexA1;
      indexB0 = indexB1;
    }
    if (addClosure)
      this.addIndexedQuadPointIndexes(indexA0, indexA00, indexB0, indexB00);
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
   * @param strokeCount number of strokes around the cone.  If omitted, use the strokeOptions previously supplied to the builder.
   */
  public addCone(cone: Cone, strokeCount?: number) {
    // assume cone strokes consistently at both ends ....
    const lineStringA = cone.strokeConstantVSection(0.0, strokeCount ? strokeCount : this.options);
    const lineStringB = cone.strokeConstantVSection(1.0, strokeCount ? strokeCount : this.options);
    this.addBetweenLineStrings(lineStringA, lineStringB, false);
    if (cone.capped) {
      this.addTrianglesInUncheckedPolygon(lineStringA, true);  // lower triangles flip
      this.addTrianglesInUncheckedPolygon(lineStringB, false); // upper triangles to not flip.
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
    const numStep = StrokeOptions.applyAngleTol(this.options, 1, surface.getSweep().radians, undefined);
    const transformA = Transform.createIdentity();
    const transformB = Transform.createIdentity();
    for (let i = 1; i <= numStep; i++) {
      surface.getFractionalRotationTransform(i / numStep, transformB);
      this.addBetweenTransformedLineStrings(strokes, transformA, transformB);
      transformA.setFrom(transformB);
    }
    if (surface.capped) {
      const contour = surface.getSweepContourRef();
      contour.emitFacets(this, this.options, true, undefined);
      contour.emitFacets(this, this.options, false, transformB);
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
      contour.emitFacets(this, this.options, true, undefined);
      contour.emitFacets(this, this.options, false, Transform.createTranslation(surface.cloneSweepVector()));
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
    contours[0].emitFacets(this, this.options, true, undefined);
    contours[contours.length - 1].emitFacets(this, this.options, false, undefined);
  }

  public addSphere(sphere: Sphere, strokeCount?: number) {
    const numLongitudeStroke = strokeCount ? strokeCount : this.options.defaultCircleStrokes;
    const numLatitudeStroke = Geometry.clampToStartEnd(numLongitudeStroke * 0.5, 4, 32);
    let lineStringA = sphere.strokeConstantVSection(0.0, numLongitudeStroke);
    if (sphere.capped && !Geometry.isSmallMetricDistance(lineStringA.quickLength()))
      this.addTrianglesInUncheckedPolygon(lineStringA, true);  // lower triangles flip
    for (let i = 1; i <= numLatitudeStroke; i++) {
      const lineStringB = sphere.strokeConstantVSection(i / numLatitudeStroke, numLongitudeStroke);
      this.addBetweenLineStrings(lineStringA, lineStringB);
      lineStringA = lineStringB;
    }

    if (sphere.capped && !Geometry.isSmallMetricDistance(lineStringA.quickLength()))
      this.addTrianglesInUncheckedPolygon(lineStringA, true);  // upper triangles do not flip

  }

  public addBox(box: Box) {
    const lineStringA = box.strokeConstantVSection(0.0);
    const lineStringB = box.strokeConstantVSection(1.0);
    this.addBetweenLineStrings(lineStringA, lineStringB);
    if (box.capped) {
      this.addTrianglesInUncheckedPolygon(lineStringA, true);  // lower triangles flip
      this.addTrianglesInUncheckedPolygon(lineStringB, false); // upper triangles to not flip.
    }
  }

  /** Add a polygon to the evolving facets.
   *
   * * Add points to the polyface
   * * indices are added (in reverse order if indicated by the builder state)
   * @param points array of points.  This may contain extra points not to be used in the polygon
   * @param numPointsToUse number of points to use.
   */
  public addPolygon(points: Point3d[], numPointsToUse: number) {
    // don't use trailing points that match start point.
    while (numPointsToUse > 1 && points[numPointsToUse - 1].isAlmostEqual(points[0]))
      numPointsToUse--;
    let index = 0;
    if (this.reversed) {
      for (let i = 0; i < numPointsToUse; i++) {
        index = this.findOrAddPoint(points[i]);
        this.polyface.addPointIndex(index);
      }
    } else {
      for (let i = numPointsToUse; --i >= 0;) {
        index = this.findOrAddPoint(points[i]);
        this.polyface.addPointIndex(index);
      }
    }
    this.polyface.terminateFacet();
  }

  /** Add a polyface, with optional reverse and transform. */
  public addIndexedPolyface(source: IndexedPolyface, reversed: boolean, transform?: Transform) {
    this.polyface.addIndexedPolyface(source, reversed, transform);
  }

  /**
   * Produce a new FacetFaceData for all terminated facets since construction of the previous face.
   * Each facet number/index is mapped to the FacetFaceData through the faceToFaceData array.
   * Returns true if successful, and false otherwise.
   */
  public endFace(): boolean {
    return this.polyface.setNewFaceData();
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
  public addGraph(graph: HalfEdgeGraph, acceptFaceFunction: HalfEdgeToBooleanFunction = HalfEdge.testNodeMaskNotExterior) {
    let index = 0;
    graph.announceFaceLoops(
      (_graph: HalfEdgeGraph, seed: HalfEdge) => {
        if (acceptFaceFunction(seed)) {
          let node = seed;
          do {
            index = this.findOrAddPointXYZ(node.x, node.y, node.z);
            this.polyface.addPointIndex(index);
            node = node.faceSuccessor;
          } while (node !== seed);
          this.polyface.terminateFacet();
        }
        return true;
      });
  }
  public static graphToPolyface(graph: HalfEdgeGraph, acceptFaceFunction: HalfEdgeToBooleanFunction = HalfEdge.testNodeMaskNotExterior): IndexedPolyface {
    const builder = PolyfaceBuilder.create();
    builder.addGraph(graph, acceptFaceFunction);
    return builder.claimPolyface();
  }
  private static index0 = new GrowableFloat64Array();
  private static index1 = new GrowableFloat64Array();

  /**
   * Given a 2-dimensional grid of points and optional corresponding params and normals, add the grid to the polyface as a series of quads.
   * Each facet in the grid should either be made up of 3 or 4 edges. Optionally specify that this quad is the last piece of a face.
   */
  public addGrid(pointArray: Point3d[][], paramArray?: Point2d[][], normalArray?: Vector3d[][], endFace: boolean = false) {
    for (let i = 0; i < pointArray.length; i++) {
      const params = paramArray ? paramArray[i] : undefined;
      const normals = normalArray ? normalArray[i] : undefined;

      if (pointArray[i].length === 3)
        this.addTriangle(pointArray[i], params, normals);
      else if (pointArray[i].length === 4)
        this.addQuad(pointArray[i], params, normals);
    }

    if (endFace)
      this.endFace();
  }

  public addUVGrid(surface: UVSurface, numU: number, numV: number, createFanInCaps: boolean) {
    let index0 = PolyfaceBuilder.index0;
    let index1 = PolyfaceBuilder.index1;
    let indexSwap;
    index0.ensureCapacity(numU);
    index1.ensureCapacity(numU);
    const xyz = Point3d.create();
    const du = 1.0 / numU;
    const dv = 1.0 / numV;
    const needParams = this.polyface.data.param !== undefined;
    const needNormals = this.polyface.data.normal !== undefined;
    for (let v = 0; v <= numV; v++) {
      // evaluate new points ....
      index1.clear();
      for (let u = 0; u <= numU; u++) {
        const uFrac = u * du;
        const vFrac = v * dv;
        if (needNormals) {
          const plane = surface.UVFractionToPointAndTangents(uFrac, vFrac);
          this.polyface.addNormal(plane.vectorU.crossProduct(plane.vectorV));
          index1.push(this.findOrAddPoint(plane.origin.clone()));
        } else {
          surface.UVFractionToPoint(uFrac, vFrac, xyz);
          index1.push(this.findOrAddPoint(xyz));
        }
        if (needParams) {
          this.polyface.addParam(new Point2d(uFrac, vFrac));
        }
      }
      if (createFanInCaps && (v === 0 || v === numV)) {
        this.addTriangleFanFromIndex0(index1, v === 0, true, true);
      }
      if (v > 0) {
        for (let u = 0; u < numU; u++) {
          this.addIndexedQuadPointIndexes(
            index0.at(u), index0.at(u + 1),
            index1.at(u), index1.at(u + 1));
          if (needNormals)
            this.addIndexedQuadNormalIndexes(
              index0.at(u), index0.at(u + 1),
              index1.at(u), index1.at(u + 1));
          if (needParams)
            this.addIndexedQuadParamIndexes(
              index0.at(u), index0.at(u + 1),
              index1.at(u), index1.at(u + 1));
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
