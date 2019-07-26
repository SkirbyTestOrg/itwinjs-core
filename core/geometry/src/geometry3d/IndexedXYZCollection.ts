/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

/** @module ArraysAndInterfaces */

// import { Point2d } from "./Geometry2d";
/* tslint:disable:variable-name jsdoc-format no-empty */
import { XYAndZ } from "./XYZProps";
import { Point3d, Vector3d } from "./Point3dVector3d";

/**
 * abstract base class for read-only access to XYZ data with indexed reference.
 * * This allows algorithms to work with Point3d[] or GrowableXYZ.
 * ** GrowableXYZArray implements these for its data.
 * ** Point3dArrayCarrier carries a (reference to) a Point3d[] and implements the methods with calls on that array reference.
 * * In addition to "point by point" accessors, there abstract members compute commonly useful vector data "between points".
 * * Methods that create vectors among multiple indices allow callers to avoid creating temporaries.
 * @public
 */
export abstract class IndexedXYZCollection {
  /**
   * Return the point at `index` as a strongly typed Point3d.
   * @param index index of point within the array
   * @param result caller-allocated destination
   * @returns undefined if the index is out of bounds
   */
  public abstract getPoint3dAtCheckedPointIndex(index: number, result?: Point3d): Point3d | undefined;
  /**
   * Get from `index` as a strongly typed Vector3d.
   * @param index index of point within the array
   * @param result caller-allocated destination
   * @returns undefined if the index is out of bounds
   */
  public abstract getVector3dAtCheckedVectorIndex(index: number, result?: Vector3d): Vector3d | undefined;
  /**
   * Return a vector from the point at `indexA` to the point at `indexB`
   * @param indexA index of point within the array
   * @param indexB index of point within the array
   * @param result caller-allocated vector.
   * @returns undefined if either index is out of bounds
   */
  public abstract vectorIndexIndex(indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
  /**
   * Return a vector from `origin` to the point at `indexB`
   * @param origin origin for vector
   * @param indexB index of point within the array
   * @param result caller-allocated vector.
   * @returns undefined if index is out of bounds
   */
  public abstract vectorXYAndZIndex(origin: XYAndZ, indexB: number, result?: Vector3d): Vector3d | undefined;

  /**
   * Return the cross product of the vectors from `origin` to points at `indexA` and `indexB`
   * @param origin origin for vector
   * @param indexA index of first target within the array
   * @param indexB index of second target within the array
   * @param result caller-allocated vector.
   * @returns undefined if either index is out of bounds
   */
  public abstract crossProductXYAndZIndexIndex(origin: XYAndZ, indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
  /**
   * Return the cross product of vectors from `origin` to points at `indexA` and `indexB`
   * @param origin origin for vector
   * @param indexA index of first target within the array
   * @param indexB index of second target within the array
   * @param result optional caller-allocated vector.
   * @returns undefined if either index is out of bounds
   */
  public abstract crossProductIndexIndexIndex(origin: number, indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
  /**
   * Return the cross product of vectors from origin point at `indexA` to target points at `indexB` and `indexC`
   * @param origin index of origin
   * @param indexA index of first target within the array
   * @param indexB index of second target within the array
   * @param result caller-allocated vector.
   * @returns return true if indexA, indexB both valid
   */
  public abstract accumulateCrossProductIndexIndexIndex(origin: number, indexA: number, indexB: number, result: Vector3d): void;

  /**
   * read-only property for number of XYZ in the collection.
   */
  public abstract get length(): number;
  /**
   * Return distance squared between indicated points.
   * @param index0 first point index
   * @param index1 second point index
   */
  public abstract distanceSquaredIndexIndex(index0: number, index1: number): number | undefined;
  /**
   * Return distance between indicated points.
   * @param index0 first point index
   * @param index1 second point index
   */
  public abstract distanceIndexIndex(index0: number, index1: number): number | undefined;

  /** Adjust index into range by modulo with the length. */
  public cyclicIndex(i: number): number {
    return (i % this.length);
  }
}
/**
 * abstract base class extends IndexedXYZCollection, adding methods to push, peek, and pop, and rewrite.
 * @public
 */
export abstract class IndexedReadWriteXYZCollection extends IndexedXYZCollection {
  /** push a (clone of) point onto the collection
   * * point itself is not pushed -- xyz data is extracted into the native form of the collection.
   */
  public abstract push(data: XYAndZ): void;
  /**
   * push a new point (given by coordinates) onto the collection
   * @param x x coordinate
   * @param y y coordinate
   * @param z z coordinate
   */
  public abstract pushXYZ(x?: number, y?: number, z?: number): void;
  /** extract the final point */
  public abstract back(result?: Point3d): Point3d | undefined;
  /** extract the first point */
  public abstract front(result?: Point3d): Point3d | undefined;
  /** remove the final point. */
  public abstract pop(): void;
  /**  clear all entries */
  public abstract clear(): void;

}
