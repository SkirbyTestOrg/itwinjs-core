/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { assert, Constructor, Id64 } from "@itwin/core-bentley";
import { ColorDef, PackedFeatureTable } from "@itwin/core-common";
import {
  computeDimensions, MeshParams, VertexIndices, VertexTable, VertexTableProps, VertexTableWithIndices,
} from "./VertexTable";
import { PointStringParams } from "./PointStringParams";
import { PolylineParams, TesselatedPolyline } from "./PolylineParams";
import { calculateEdgeTableParams, EdgeParams, EdgeTable, IndexedEdgeParams } from "./EdgeParams";
import { createSurfaceMaterial, SurfaceMaterial } from "./SurfaceParams";
import { IModelApp } from "../../IModelApp";
import { CreateRenderMaterialArgs } from "../RenderMaterial";

export type ComputeNodeId = (elementId: Id64.Uint32Pair) => number;

interface TypedArrayBuilderOptions {
  growthFactor?: number;
  initialCapacity?: number;
}

/** Incrementally builds an array of unsigned 8-, 16-, or 32-bit integers. */
class TypedArrayBuilder<T extends Uint8Array | Uint16Array | Uint32Array> {
  protected readonly _constructor: Constructor<T>;
  protected _data: T;
  protected _length: number;
  protected readonly _growthFactor: number;

  protected constructor(constructor: Constructor<T>, options?: TypedArrayBuilderOptions) {
    this._constructor = constructor;
    this._data = new constructor(options?.initialCapacity ?? 0);
    this._growthFactor = options?.growthFactor ?? 1.5;
    this._length = 0;
  }

  /** The number of integer values currently in the array. */
  public get length(): number {
    return this._length;
  }

  /** The number of integers that can fit in the memory currently allocated for the array. */
  public get capacity(): number {
    return this._data.length;
  }

  /** Ensure that [[capacity]] is at least equal to `newCapacity`. */
  public ensureCapacity(newCapacity: number): number {
    if (this.capacity >= newCapacity)
      return this.capacity;

    newCapacity *= this._growthFactor;
    const prevData = this._data;
    this._data = new this._constructor(newCapacity);
    this._data.set(prevData, 0);

    assert(this.capacity === newCapacity);
    return this.capacity;
  }

  /** Append an integer, resizing if necessary. */
  public push(value: number): void {
    this.ensureCapacity(this.length + 1);
    this._data[this.length] = value;
    ++this._length;
  }

  /** Append an array of values, resizing (at most once) if necessary. */
  public append(values: T): void {
    const newLength = this.length + values.length;
    this.ensureCapacity(newLength);
    this._data.set(values, this.length);
    this._length = newLength;
  }

  /** Obtain the finished array. Note: this may return a direct reference to the underlying typed array, or a copy.
   * If `includeUnusedCapacity` is true then additional memory that was allocated but not used will be included.
   */
  public toTypedArray(includeUnusedCapacity = false): T {
    if (includeUnusedCapacity)
      return this._data;

    const subarray = this._data.subarray(0, this.length);
    assert(subarray instanceof this._constructor);
    assert(subarray.buffer === this._data.buffer);
    return subarray;
  }
}

class Uint8ArrayBuilder extends TypedArrayBuilder<Uint8Array> {
  public constructor(options?: TypedArrayBuilderOptions) {
    super(Uint8Array, options);
  }
}

class Uint16ArrayBuilder extends TypedArrayBuilder<Uint16Array> {
  public constructor(options?: TypedArrayBuilderOptions) {
    super(Uint16Array, options);
  }
}

class Uint32ArrayBuilder extends TypedArrayBuilder<Uint32Array> {
  public constructor(options?: TypedArrayBuilderOptions) {
    super(Uint32Array, options);
  }

  public toUint8Array(includeUnusedCapacity = false): Uint8Array {
    if (includeUnusedCapacity)
      return new Uint8Array(this._data.buffer);

    return new Uint8Array(this._data.buffer, 0, this.length * 4);
  }
}

/** Builds up a [[VertexIndices]].
 * Exported strictly for tests.
 */
export class IndexBuffer {
  private readonly _builder: Uint8ArrayBuilder;
  private readonly _index32 = new Uint32Array(1);
  private readonly _index8 = new Uint8Array(this._index32.buffer, 0, 3);

  public constructor(initialCapacity = 3) {
    this._builder = new Uint8ArrayBuilder({ initialCapacity: initialCapacity * 3 });
  }

  public get numIndices(): number {
    assert((this._builder.length % 3) === 0);
    return this._builder.length / 3;
  }

  public push(index: number): void {
    this._index32[0] = index;
    this._builder.append(this._index8);
  }

  public toVertexIndices(): VertexIndices {
    return new VertexIndices(this._builder.toTypedArray());
  }
}

/** Builds up a [[VertexTable]]. */
class VertexBuffer {
  private readonly _builder: Uint32ArrayBuilder;
  private readonly _source: VertexTable;

  /** `source` is the original table containing the vertex data from which individual vertices will be obtained. */
  public constructor(source: VertexTable) {
    this._source = source;
    this._builder = new Uint32ArrayBuilder({ initialCapacity: 3 * source.numRgbaPerVertex });
  }

  /** The number of vertices currently in the table. */
  public get length(): number {
    assert((this._builder.length % this.vertexSize) === 0);
    return this._builder.length / this.vertexSize;
  }

  /** The number of 32-bit unsigned integers (RGBA values) per vertex. */
  public get vertexSize(): number {
    return this._source.numRgbaPerVertex;
  }

  /** Append a vertex. `vertex` must be of size [[vertexSize]]. */
  public push(vertex: Uint32Array): void {
    assert(vertex.length === this.vertexSize);
    this._builder.append(vertex);
  }

  /** Construct the finished vertex table. */
  public buildVertexTable(maxDimension: number, colorTable: ColorTable | undefined, materialAtlasTable: MaterialAtlasTable): VertexTable {
    const source = this._source;
    colorTable = colorTable ?? source.uniformColor;
    assert(undefined !== colorTable);

    const colorTableLength = colorTable instanceof Uint32Array ? colorTable.length : 0;
    const materialAtlasTableLength = materialAtlasTable instanceof Uint32Array ? materialAtlasTable.length : 0;
    const dimensions = computeDimensions(this.length, this.vertexSize, colorTableLength + materialAtlasTableLength, maxDimension);

    let rgbaData = this._builder.toTypedArray();
    if (dimensions.width * dimensions.height > rgbaData.length) {
      const prevData = rgbaData;
      rgbaData = new Uint32Array(dimensions.width * dimensions.height);
      rgbaData.set(prevData, 0);
    }

    let tableSize = this.vertexSize * this.length;
    if (colorTable instanceof Uint32Array) {
      rgbaData.set(colorTable, tableSize);
      tableSize += colorTable.length;
    }

    if (materialAtlasTable instanceof Uint32Array)
      rgbaData.set(materialAtlasTable, tableSize);

    const tableProps: VertexTableProps = {
      data: new Uint8Array(rgbaData.buffer, rgbaData.byteOffset, rgbaData.byteLength),
      usesUnquantizedPositions: source.usesUnquantizedPositions,
      qparams: source.qparams,
      width: dimensions.width,
      height: dimensions.height,
      hasTranslucency: source.hasTranslucency,
      uniformColor: colorTable instanceof ColorDef ? colorTable : undefined,
      featureIndexType: source.featureIndexType,
      uniformFeatureID: source.uniformFeatureID,
      numVertices: this.length,
      numRgbaPerVertex: source.numRgbaPerVertex,
      uvParams: source.uvParams,
    };

    return new VertexTable(tableProps);
  }
}

type ColorTable = Uint32Array | ColorDef;

/** Remaps portions of a source color table into a filtered target color table. */
class ColorTableRemapper {
  private readonly _remappedIndices = new Map<number, number>();
  private readonly _colorTable: Uint32Array;
  public readonly colors: number[] = [];
  private readonly _32 = new Uint32Array(1);
  private readonly _16 = new Uint16Array(this._32.buffer);

  public constructor(colorTable: Uint32Array) {
    this._colorTable = colorTable;
  }

  /** Extract the color index stored in `vertex`, ensure it is present in the remapped color table, and return its index in that table. */
  public remap(vertex: Uint32Array, usesUnquantizedPositions: boolean | undefined): void {
    const vertIndex = usesUnquantizedPositions ? 4 : 1;
    const shortIndex = usesUnquantizedPositions ? 0 : 1;
    this._32[0] = vertex[vertIndex];
    const oldIndex = this._16[shortIndex];
    let newIndex = this._remappedIndices.get(oldIndex);
    if (undefined === newIndex) {
      newIndex = this.colors.length;
      this._remappedIndices.set(oldIndex, newIndex);
      const color = this._colorTable[oldIndex];
      this.colors.push(color);
    }

    this._16[shortIndex] = newIndex;
    vertex[vertIndex] = this._32[0];
  }

  /** Construct the finished color table. */
  public buildColorTable(): ColorTable {
    assert(this.colors.length > 0);
    return this.colors.length > 1 ? new Uint32Array(this.colors) : ColorDef.fromAbgr(this.colors[0]);
  }
}

type MaterialAtlasTable = Uint32Array | SurfaceMaterial | undefined;

class MaterialAtlasRemapper {
  private readonly _remappedIndices = new Map<number, number>();
  private readonly _atlasTable: Uint32Array;
  public readonly materials: number[] = [];
  private readonly _32 = new Uint32Array(1);
  private readonly _8 = new Uint8Array(this._32.buffer);

  public constructor(_atlasTable: Uint32Array) {
    this._atlasTable = _atlasTable;
  }

  /** Extract the mat index stored in `vertex`, ensure it is present in the remapped atlas table, and return its index in that table. */
  public remap(vertex: Uint32Array, usesUnquantizedPositions: boolean | undefined): void {
    const vertIndex = usesUnquantizedPositions ? 3 : 2;
    this._32[0] = vertex[vertIndex];
    const oldIndex = this._8[3];
    let newIndex = this._remappedIndices.get(oldIndex);
    if (undefined === newIndex) {
      newIndex = this.materials.length / 4;
      this._remappedIndices.set(oldIndex, newIndex);
      let index = oldIndex * 4;
      this.materials.push(this._atlasTable[index++]);
      this.materials.push(this._atlasTable[index++]);
      this.materials.push(this._atlasTable[index++]);
      this.materials.push(this._atlasTable[index]);
    }

    this._8[3] = newIndex;
    vertex[vertIndex] = this._32[0];
  }

  private unpackFloat(value: number): number {
    const valUint32 = new Uint32Array(value);
    const bias = 38.0;
    const temp = (valUint32[0] >>> 24) / 2.0;
    let exponent = Math.floor(temp);
    let sign = (temp - exponent) * 2.0;
    sign = -(sign * 2.0 - 1.0);
    const base = sign * (valUint32[0] & 0xffffff) / 16777216.0;
    exponent = exponent - bias;
    return base * Math.pow (10.0, exponent);
  }

  private materialFromAtlasEntry(entry: Uint32Array): SurfaceMaterial | undefined {
    const rgbOverridden = (entry[1] & 1) !== 0;
    const alphaOverridden = (entry[1] & 2) !== 0;
    const args: CreateRenderMaterialArgs = {
      alpha: alphaOverridden ? (entry[0] >>> 24) / 255.0 : undefined,
      diffuse: {
        color: rgbOverridden ? ColorDef.fromTbgr(entry[0] & 0xffffff) : undefined,
        weight: (entry[1] >>> 24) / 255.0,
      },
      specular: {
        color: ColorDef.fromTbgr(entry[2]),
        weight: ((entry[1] >>> 16) & 0xff) / 255.0,
        exponent: this.unpackFloat (entry[3]),
      },
    };
    const material = IModelApp.renderSystem.createRenderMaterial(args);
    return createSurfaceMaterial (material);
  }

  /** Construct the finished color table. */
  public buildAtlasTable(): MaterialAtlasTable {
    assert(this.materials.length > 0);
    const m = new Uint32Array(this.materials);
    return this.materials.length > 4 ? m : this.materialFromAtlasEntry (m);
  }
}

/** A node in a split vertex table. Each node corresponds to one or more elements. */
class Node {
  public readonly vertices: VertexBuffer;
  public readonly remappedIndices = new Map<number, number>();
  public readonly indices = new IndexBuffer();
  public readonly colors?: ColorTableRemapper;
  public readonly atlas?: MaterialAtlasRemapper;
  public readonly usesUnquantizedPositions?: boolean;

  /** `vertexTable` is the source table containing vertex data for all nodes, from which this node will extract the vertices belong to it. */
  public constructor(vertexTable: VertexTable, atlasOffset: number | undefined) {
    this.vertices = new VertexBuffer(vertexTable);
    if (undefined === vertexTable.uniformColor)
      this.colors = new ColorTableRemapper(new Uint32Array(vertexTable.data.buffer, vertexTable.data.byteOffset + 4 * vertexTable.numVertices * vertexTable.numRgbaPerVertex));
    if (undefined !== atlasOffset)
      this.atlas = new MaterialAtlasRemapper(new Uint32Array(vertexTable.data.buffer, atlasOffset));
    this.usesUnquantizedPositions = vertexTable.usesUnquantizedPositions;
  }

  public addVertex(originalIndex: number, vertex: Uint32Array): void {
    let newIndex = this.remappedIndices.get(originalIndex);
    if (undefined === newIndex) {
      newIndex = this.vertices.length;
      this.remappedIndices.set(originalIndex, newIndex);

      this.colors?.remap(vertex, this.usesUnquantizedPositions);
      this.atlas?.remap(vertex, this.usesUnquantizedPositions);
      this.vertices.push(vertex);
    }

    this.indices.push(newIndex);
  }

  public buildOutput(maxDimension: number): VertexTableWithIndices {
    const materialAtlas = this.atlas?.buildAtlasTable();
    const material: SurfaceMaterial | undefined = (materialAtlas instanceof Uint32Array) ? undefined : materialAtlas;
    return {
      indices: this.indices.toVertexIndices(),
      vertices: this.vertices.buildVertexTable(maxDimension, this.colors?.buildColorTable(), materialAtlas),
      material,
    };
  }
}

interface VertexTableSplitArgs extends VertexTableWithIndices {
  featureTable: PackedFeatureTable;
  atlasOffset?: number;
}

class VertexTableSplitter {
  private readonly _input: VertexTableSplitArgs;
  private readonly _computeNodeId: ComputeNodeId;
  private readonly _nodes = new Map<number, Node>();

  private constructor(input: VertexTableSplitArgs, computeNodeId: ComputeNodeId) {
    this._input = input;
    this._computeNodeId = computeNodeId;
  }

  /** Split the source into one or more output nodes, returning a mapping of integer node Id to node. */
  public static split(source: VertexTableSplitArgs, computeNodeId: ComputeNodeId): Map<number, Node> {
    const splitter = new VertexTableSplitter(source, computeNodeId);
    splitter.split();
    return splitter._nodes;
  }

  private split(): void {
    // Track the most recent feature and corresponding node to avoid repeated lookups - vertices for
    // individual features are largely contiguous.
    const curState = {
      featureIndex: -1,
      node: undefined as unknown as Node,
    };

    const vertSize = this._input.vertices.numRgbaPerVertex;
    const vertex = new Uint32Array(vertSize);
    const vertexTable = new Uint32Array(this._input.vertices.data.buffer, this._input.vertices.data.byteOffset, this._input.vertices.numVertices * vertSize);

    for (const index of this._input.indices) {
      // Extract the data for this vertex without allocating new typed arrays.
      const vertexOffset = index * vertSize;
      for (let i = 0; i < vertex.length; i++)
        vertex[i] = vertexTable[vertexOffset + i];

      // Determine to which element the vertex belongs and find the corresponding Node.
      const featureIndex = vertex[2] & 0x00ffffff;
      if (curState.featureIndex !== featureIndex) {
        curState.featureIndex = featureIndex;
        const elemId = this._input.featureTable.getElementIdPair(featureIndex);
        const nodeId = this._computeNodeId(elemId);
        let node = this._nodes.get(nodeId);
        if (undefined === node)
          this._nodes.set(nodeId, node = new Node(this._input.vertices, this._input.atlasOffset));

        curState.node = node;
      }

      // Add the vertex to the appropriate node.
      curState.node.addVertex(index, vertex);
    }
  }
}

export interface SplitVertexTableArgs {
  featureTable: PackedFeatureTable;
  maxDimension: number;
  computeNodeId: ComputeNodeId;
}

export interface SplitPointStringArgs extends SplitVertexTableArgs {
  params: PointStringParams;
}

/** Given a PointStringParams and a function that can associate a node Id with an element Id, produce a mapping of nodes to PointStringParams, splitting up
 * the input params as needed.
 * @internal
 */
export function splitPointStringParams(args: SplitPointStringArgs): Map<number, PointStringParams> {
  const nodes = VertexTableSplitter.split({
    indices: args.params.indices,
    vertices: args.params.vertices,
    featureTable: args.featureTable,
  }, args.computeNodeId);

  const result = new Map<number, PointStringParams>();
  for (const [id, node] of nodes) {
    const { vertices, indices } = node.buildOutput(args.maxDimension);
    result.set(id, new PointStringParams(vertices, indices, args.params.weight));
  }

  return result;
}

interface RemappedSegmentEdges {
  indices: IndexBuffer;
  endPointAndQuadIndices: Uint32ArrayBuilder;
}

interface RemappedSilhouetteEdges extends RemappedSegmentEdges {
  normalPairs: Uint32ArrayBuilder;
}

class RemappedPolylineEdges {
  public readonly indices = new IndexBuffer();
  public readonly prevIndices = new IndexBuffer();
  public readonly nextIndicesAndParams = new Uint32ArrayBuilder();
}

interface RemappedIndexEdges {
  indices: IndexBuffer;
  edges: Uint8ArrayBuilder;
  silhouettes: Uint8ArrayBuilder;
}

interface RemappedEdges {
  segments?: RemappedSegmentEdges;
  silhouettes?: RemappedSilhouetteEdges;
  polylines?: RemappedPolylineEdges;
  indexed?: RemappedIndexEdges;
}

interface RemappedIndex {
  node: Node;
  id: number;
  index: number;
}

function remapIndex(out: RemappedIndex, srcIndex: number, nodes: Map<number, Node>): boolean {
  for (const [id, node] of nodes) {
    const index = node.remappedIndices.get(srcIndex);
    if (undefined !== index) {
      out.index = index;
      out.node = node;
      out.id = id;
      return true;
    }
  }

  assert(false);
  return false;
}

function remapSegmentEdges(type: "segments" | "silhouettes", source: EdgeParams, nodes: Map<number, Node>, edges: Map<number, RemappedEdges>): void {
  const src = source[type];
  if (!src)
    return;

  const srcEndPts = new Uint32Array(src.endPointAndQuadIndices.buffer, src.endPointAndQuadIndices.byteOffset, src.endPointAndQuadIndices.length / 4);
  let srcNormalPairs;
  if (type === "silhouettes") {
    assert(undefined !== source.silhouettes);
    srcNormalPairs = new Uint32Array(source.silhouettes.normalPairs.buffer, source.silhouettes.normalPairs.byteOffset, source.silhouettes.normalPairs.length / 4);
  }

  let curIndexIndex = 0;
  const remappedIndex = { } as unknown as RemappedIndex;
  for (const srcIndex of src.indices) {
    if (remapIndex(remappedIndex, srcIndex, nodes)) {
      let endPointAndQuad = srcEndPts[curIndexIndex];
      const otherIndex = (endPointAndQuad & 0x00ffffff) >>> 0;
      const newOtherIndex = remappedIndex.node.remappedIndices.get(otherIndex);
      assert(undefined !== newOtherIndex);
      endPointAndQuad = (endPointAndQuad & 0xff000000) | newOtherIndex;

      let entry = edges.get(remappedIndex.id);
      if (!entry)
        edges.set(remappedIndex.id, entry = { });

      if (srcNormalPairs) {
        if (!entry.silhouettes)
          entry.silhouettes = { indices: new IndexBuffer(), endPointAndQuadIndices: new Uint32ArrayBuilder(), normalPairs: new Uint32ArrayBuilder() };

        entry.silhouettes.normalPairs.push(srcNormalPairs[curIndexIndex]);
      } else if (!entry.segments) {
        entry.segments = { indices: new IndexBuffer(), endPointAndQuadIndices: new Uint32ArrayBuilder() };
      }

      const segments = entry[type];
      assert(undefined !== segments);

      segments.indices.push(remappedIndex.index);
      segments.endPointAndQuadIndices.push(endPointAndQuad);
    }

    ++curIndexIndex;
  }
}

function remapPolylineEdges(src: TesselatedPolyline, nodes: Map<number, Node>, edges: Map<number, RemappedEdges>): void {
  const srcNextAndParam = new Uint32Array(src.nextIndicesAndParams.buffer, src.nextIndicesAndParams.byteOffset, src.nextIndicesAndParams.length / 4);
  const prevIter = src.prevIndices[Symbol.iterator]();
  let curIndexIndex = 0;
  const remappedIndex = { } as unknown as RemappedIndex;
  for (const srcIndex of src.indices) {
    if (remapIndex(remappedIndex, srcIndex, nodes)) {
      const prevIndex = prevIter.next().value;
      assert(undefined !== prevIndex);
      const newPrevIndex = remappedIndex.node.remappedIndices.get(prevIndex);
      assert(undefined !== newPrevIndex);

      let nextAndParam = srcNextAndParam[curIndexIndex];
      const nextIndex = (nextAndParam & 0x00ffffff) >>> 0;
      const newNextIndex = remappedIndex.node.remappedIndices.get(nextIndex);
      assert(undefined !== newNextIndex);
      nextAndParam = (nextAndParam & 0xff000000) | newNextIndex;

      let entry = edges.get(remappedIndex.id);
      if (!entry)
        edges.set(remappedIndex.id, entry = { });

      if (!entry.polylines)
        entry.polylines = new RemappedPolylineEdges();

      entry.polylines.indices.push(remappedIndex.index);
      entry.polylines.prevIndices.push(newPrevIndex);
      entry.polylines.nextIndicesAndParams.push(nextAndParam);
    }

    ++curIndexIndex;
  }
}

function remapIndexedEdges(src: IndexedEdgeParams, nodes: Map<number, Node>, edges: Map<number, RemappedEdges>): void {
  const srcEdgeData = src.edges.data;
  const numSegments = src.edges.numSegments;
  const silhouettePadding = src.edges.silhouettePadding;

  function getUint24EdgePair(byteIndex: number): [number, number] {
    return [srcEdgeData[byteIndex + 0] | (srcEdgeData[byteIndex + 1] << 8) | srcEdgeData[byteIndex + 2] << 16,
      srcEdgeData[byteIndex + 3] | (srcEdgeData[byteIndex + 4] << 8) | srcEdgeData[byteIndex + 5] << 16];
  }
  function setUint24EdgePair(indEdges: RemappedIndexEdges, value1: number, value2: number): void {
    indEdges.edges.push(value1 & 0x0000ff);
    indEdges.edges.push((value1 & 0x00ff00) >>> 8);
    indEdges.edges.push((value1 & 0xff0000) >>> 16);
    indEdges.edges.push(value2 & 0x0000ff);
    indEdges.edges.push((value2 & 0x00ff00) >>> 8);
    indEdges.edges.push((value2 & 0xff0000) >>> 16);
  }
  function getUint24SilPair(byteIndex: number): [number, number, number, number] {
    return [srcEdgeData[byteIndex + 0] | (srcEdgeData[byteIndex + 1] << 8) | srcEdgeData[byteIndex + 2] << 16,
      srcEdgeData[byteIndex + 3] | (srcEdgeData[byteIndex + 4] << 8) | srcEdgeData[byteIndex + 5] << 16,
      srcEdgeData[byteIndex + 6] | (srcEdgeData[byteIndex + 7] << 8), srcEdgeData[byteIndex + 8] | (srcEdgeData[byteIndex + 9] << 8)];
  }
  function setUint24SilPair(indSil: RemappedIndexEdges, value1: number, value2: number, norm1: number, norm2: number): void {
    indSil.edges.push(value1 & 0x0000ff);
    indSil.edges.push((value1 & 0x00ff00) >>> 8);
    indSil.edges.push((value1 & 0xff0000) >>> 16);
    indSil.edges.push(value2 & 0x0000ff);
    indSil.edges.push((value2 & 0x00ff00) >>> 8);
    indSil.edges.push((value2 & 0xff0000) >>> 16);
    indSil.edges.push(norm1 & 0x0000ff);
    indSil.edges.push((norm1 & 0x00ff00) >>> 8);
    indSil.edges.push(norm2 & 0x0000ff);
    indSil.edges.push((norm2 & 0x00ff00) >>> 8);
  }

  let curIndexIndex = 0;
  const remappedIndex = { } as unknown as RemappedIndex;
  for (const srcIndex of src.indices) {
    if (remapIndex(remappedIndex, srcIndex, nodes)) {
      let entry = edges.get(remappedIndex.id);
      if (!entry) {
        edges.set(remappedIndex.id, entry = { });
      }
      if (!entry.indexed)
        entry.indexed = { indices: new IndexBuffer(), edges: new Uint8ArrayBuilder(), silhouettes: new Uint8ArrayBuilder() };
      entry.indexed.indices.push(remappedIndex.index);

      let byteIndex;
      if (curIndexIndex < numSegments) {  // edges
        byteIndex = curIndexIndex * 6;
        const [e1Index, e2Index] = getUint24EdgePair(byteIndex);
        const newE1Index = remappedIndex.node.remappedIndices.get(e1Index);
        assert(undefined !== newE1Index);
        const newE2Index = remappedIndex.node.remappedIndices.get(e2Index);
        assert(undefined !== newE2Index);
        setUint24EdgePair (entry.indexed, newE1Index, newE2Index);
      } else {  // silhouettes
        const silhouetteStartByteIndex = numSegments * 6;
        byteIndex = silhouetteStartByteIndex + silhouettePadding + curIndexIndex * 10;
        const [s1Index, s2Index, n1, n2] = getUint24SilPair(byteIndex);
        const newS1Index = remappedIndex.node.remappedIndices.get(s1Index);
        assert(undefined !== newS1Index);
        const newS2Index = remappedIndex.node.remappedIndices.get(s2Index);
        assert(undefined !== newS2Index);
        setUint24SilPair (entry.indexed, newS1Index, newS2Index, n1, n2);
      }
    }
    ++curIndexIndex;
  }
}

function splitEdges(source: EdgeParams, nodes: Map<number, Node>): Map<number, EdgeParams> {
  const edges = new Map<number, RemappedEdges>();
  remapSegmentEdges("segments", source, nodes, edges);
  remapSegmentEdges("silhouettes", source, nodes, edges);

  if (source.polylines)
    remapPolylineEdges(source.polylines, nodes, edges);

  if (source.indexed)
    remapIndexedEdges(source.indexed, nodes, edges);

  const result = new Map<number, EdgeParams>();
  for (const [id, remappedEdges] of edges) {
    if (!remappedEdges.segments && !remappedEdges.silhouettes && !remappedEdges.indexed)
      continue;
    let edgeTable = { } as unknown as EdgeTable;
    if (remappedEdges.indexed) {
      const numSegmentEdges = remappedEdges.indexed.edges.length;
      const numSilhouettes = remappedEdges.indexed.silhouettes.length;
      const {width, height, silhouettePadding, silhouetteStartByteIndex } = calculateEdgeTableParams (numSegmentEdges, numSilhouettes, IModelApp.renderSystem.maxTextureSize);
      const data = new Uint8Array(remappedEdges.indexed.edges.toTypedArray(), 0, width * height * 4);
      data.set (remappedEdges.indexed.silhouettes.toTypedArray(), silhouetteStartByteIndex);

      edgeTable = {
        data,
        width,
        height,
        numSegments: numSegmentEdges,
        silhouettePadding,
      };
    }

    result.set(id, {
      weight: source.weight,
      linePixels: source.linePixels,
      segments: remappedEdges.segments ? {
        indices: remappedEdges.segments.indices.toVertexIndices(),
        endPointAndQuadIndices: remappedEdges.segments.endPointAndQuadIndices.toUint8Array(),
      } : undefined,
      silhouettes: remappedEdges.silhouettes ? {
        indices: remappedEdges.silhouettes.indices.toVertexIndices(),
        endPointAndQuadIndices: remappedEdges.silhouettes.endPointAndQuadIndices.toUint8Array(),
        normalPairs: remappedEdges.silhouettes.normalPairs.toUint8Array(),
      } : undefined,
      polylines: remappedEdges.polylines ? {
        indices: remappedEdges.polylines.indices.toVertexIndices(),
        prevIndices: remappedEdges.polylines.prevIndices.toVertexIndices(),
        nextIndicesAndParams: remappedEdges.polylines.nextIndicesAndParams.toUint8Array(),
      } : undefined,
      indexed: remappedEdges.indexed ? {
        indices: remappedEdges.indexed.indices.toVertexIndices(),
        edges: edgeTable,
      } : undefined,
    });
  }

  return result;
}

export interface SplitMeshArgs extends SplitVertexTableArgs {
  params: MeshParams;
}

export function splitMeshParams(args: SplitMeshArgs): Map<number, MeshParams> {
  const result = new Map<number, MeshParams>();

  const mat = args.params.surface.material;
  const atlasOffset = undefined !== mat && mat.isAtlas ? mat.vertexTableOffset : undefined;

  const nodes = VertexTableSplitter.split({
    indices: args.params.surface.indices,
    vertices: args.params.vertices,
    featureTable: args.featureTable,
    atlasOffset,
  }, args.computeNodeId);

  const edges = args.params.edges ? splitEdges(args.params.edges, nodes) : undefined;

  for (const [id, node] of nodes) {
    const { vertices, indices, material } = node.buildOutput(args.maxDimension);
    const params = new MeshParams(
      vertices, {
        type: args.params.surface.type,
        indices,
        fillFlags: args.params.surface.fillFlags,
        hasBakedLighting: args.params.surface.hasBakedLighting,
        hasFixedNormals: args.params.surface.hasFixedNormals,
        textureMapping: args.params.surface.textureMapping,
        material: material !== undefined ? material : args.params.surface.material,
      },
      edges?.get(id),
      args.params.isPlanar,
      // ###TODO handle aux channels.......
      args.params.auxChannels,
    );

    result.set(id, params);
  }

  return result;
}

export interface SplitPolylineArgs extends SplitVertexTableArgs {
  params: PolylineParams;
}

interface PolylineNode extends Node {
  prevIndices?: IndexBuffer;
  nextIndicesAndParams?: Uint32ArrayBuilder;
}

export function splitPolylineParams(args: SplitPolylineArgs): Map<number, PolylineParams> {
  const nodes = VertexTableSplitter.split({
    indices: args.params.polyline.indices,
    vertices: args.params.vertices,
    featureTable: args.featureTable,
  }, args.computeNodeId) as Map<number, PolylineNode>;

  const src = args.params.polyline;
  const srcNextAndParam = new Uint32Array(src.nextIndicesAndParams.buffer, src.nextIndicesAndParams.byteOffset, src.nextIndicesAndParams.length / 4);
  let curIndexIndex = 0;
  const remappedIndex = { } as unknown as RemappedIndex;
  for (const prevIndex of src.prevIndices) {
    if (remapIndex(remappedIndex, prevIndex, nodes)) {
      const node = remappedIndex.node as PolylineNode;
      if (!node.prevIndices) {
        assert(undefined === node.nextIndicesAndParams);
        node.prevIndices = new IndexBuffer(node.indices.numIndices);
        node.nextIndicesAndParams = new Uint32ArrayBuilder({ initialCapacity: node.indices.numIndices });
      } else {
        assert(undefined !== node.nextIndicesAndParams);
      }

      node.prevIndices.push(remappedIndex.index);

      let nextAndParam = srcNextAndParam[curIndexIndex];
      const nextIndex = (nextAndParam & 0x00ffffff) >>> 0;
      const newNextIndex = remappedIndex.node.remappedIndices.get(nextIndex);
      assert(undefined !== newNextIndex);
      nextAndParam = (nextAndParam & 0xff000000) | newNextIndex;
      node.nextIndicesAndParams.push(nextAndParam);
    }

    ++curIndexIndex;
  }

  const result = new Map<number, PolylineParams>();
  for (const [id, node] of nodes) {
    assert(undefined !== node.prevIndices && undefined !== node.nextIndicesAndParams);
    const { vertices, indices } = node.buildOutput(args.maxDimension);
    const params = new PolylineParams(
      vertices, {
        indices,
        prevIndices: node.prevIndices.toVertexIndices(),
        nextIndicesAndParams: node.nextIndicesAndParams.toUint8Array(),
      },
      args.params.weight,
      args.params.linePixels,
      args.params.isPlanar,
      args.params.type);

    result.set(id, params);
  }

  return result;
}
