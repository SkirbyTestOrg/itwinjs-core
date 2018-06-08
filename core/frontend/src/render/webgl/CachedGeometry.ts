/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module WebGL */

import { QPoint3dList, QParams3d, ColorDef } from "@bentley/imodeljs-common";
import { assert } from "@bentley/bentleyjs-core";
import { Point3d } from "@bentley/geometry-core";
import { AttributeHandle, BufferHandle, QBufferHandle3d } from "./Handle";
import { Target } from "./Target";
import { ShaderProgramParams } from "./DrawCommand";
import { TechniqueId } from "./TechniqueId";
import { RenderPass, RenderOrder, CompositeFlags } from "./RenderFlags";
import { LineCode } from "./EdgeOverrides";
import { GL } from "./GL";
import { System } from "./System";
import { ColorInfo } from "./ColorInfo";
import { FeaturesInfo } from "./FeaturesInfo";
import { VertexLUT } from "./VertexLUT";
import { TextureHandle } from "./Texture";
import { Material } from "./Material";
import { FloatRgb } from "./FloatRGBA";

/** Represents a geometric primitive ready to be submitted to the GPU for rendering. */
export abstract class CachedGeometry {
  // Returns true if white portions of this geometry should render as black on white background
  protected _wantWoWReversal(_target: Target): boolean { return false; }
  // Returns the edge/line weight used to render this geometry
  protected _getLineWeight(_params: ShaderProgramParams): number { return 0; }
  // Returns the edge/line pattern used to render this geometry
  protected _getLineCode(_params: ShaderProgramParams): number { return LineCode.solid; }

  // Returns the Id of the Technique used to render this geometry
  public abstract getTechniqueId(target: Target): TechniqueId;
  // Returns the pass in which to render this geometry. RenderPass.None indicates it should not be rendered.
  public abstract getRenderPass(target: Target): RenderPass;
  // Returns the 'order' of this geometry, which determines how z-fighting is resolved.
  public abstract get renderOrder(): RenderOrder;
  // Returns true if this is a lit surface
  public get isLitSurface(): boolean { return false; }

  /** Returns the origin of this geometry's quantization parameters. */
  public abstract get qOrigin(): Float32Array;
  /** Returns the scale of this geometry's quantization parameters. */
  public abstract get qScale(): Float32Array;
  /** Binds this geometry's vertex data to the vertex attribute. */
  public abstract bindVertexArray(handle: AttributeHandle): void;
  // Draws this geometry
  public abstract draw(): void;

  // Intended to be overridden by specific subclasses
  public get material(): MaterialData | undefined { return undefined; }
  public get polylineBuffers(): PolylineBuffers | undefined { return undefined; }
  public set uniformFeatureIndices(value: number) { assert(undefined !== value); } // silence 'unused variable' warning...
  public get featuresInfo(): FeaturesInfo | undefined { return undefined; }
  public get debugString(): string { return ""; }

  public get isEdge(): boolean {
    switch (this.renderOrder) {
      case RenderOrder.Edge:
      case RenderOrder.Silhouette:
      case RenderOrder.PlanarEdge:
      case RenderOrder.PlanarSilhouette:
        return true;
      default:
        return false;
    }
  }
  public wantWoWReversal(params: ShaderProgramParams): boolean {
    return !params.isOverlayPass && this._wantWoWReversal(params.target);
  }
  public getLineCode(params: ShaderProgramParams): number {
    return params.target.currentViewFlags.showStyles ? this._getLineCode(params) : LineCode.solid;
  }
  public getLineWeight(params: ShaderProgramParams): number {
    if (!params.target.currentViewFlags.showWeights) {
      return 1.0;
    }

    const minWeight = 1; // ###TODO: reset back to 1 once 1-px-wide lines are rendering correctly
    let weight = this._getLineWeight(params);
    weight = Math.max(weight, minWeight);
    weight = Math.min(weight, 31.0);
    assert(Math.floor(weight) === weight);
    return weight;
  }
}

// Geometry which is drawn using indices into a look-up texture of vertex data, via gl.drawArrays()
export abstract class LUTGeometry extends CachedGeometry {
  // The texture containing the vertex data.
  public abstract get lut(): VertexLUT.Data;

  // Override this if your color varies based on the target
  public getColor(_target: Target): ColorInfo { return this.lut.colorInfo; }

  public get qOrigin(): Float32Array { return this.lut.qOrigin; }
  public get qScale(): Float32Array { return this.lut.qScale; }

  protected constructor() { super(); }
}

// Parameters used to construct an IndexedGeometry
export class IndexedGeometryParams {
  public readonly positions: QBufferHandle3d;
  public readonly indices: BufferHandle;
  public readonly numIndices: number;

  protected constructor(positions: QBufferHandle3d, indices: BufferHandle, numIndices: number) {
    this.positions = positions;
    this.indices = indices;
    this.numIndices = numIndices;
  }

  public static create(positions: Uint16Array, qparams: QParams3d, indices: Uint32Array) {
    const posBuf = QBufferHandle3d.create(qparams, positions);
    const indBuf = BufferHandle.createBuffer(GL.Buffer.Target.ElementArrayBuffer, indices);
    if (undefined === posBuf || undefined === indBuf) {
      assert(false);
      return undefined;
    }

    assert(posBuf.isValid && indBuf.isValid);
    return new IndexedGeometryParams(posBuf, indBuf, indices.length);
  }
  public static createFromList(positions: QPoint3dList, indices: Uint32Array) {
    return IndexedGeometryParams.create(positions.toTypedArray(), positions.params, indices);
  }
}

// A geometric primitive which is rendered using gl.drawElements() with one or more vertex buffers indexed by an index buffer.
export abstract class IndexedGeometry extends CachedGeometry {
  protected readonly _params: IndexedGeometryParams;

  protected constructor(params: IndexedGeometryParams) {
    super();
    this._params = params;
  }

  public bindVertexArray(attr: AttributeHandle): void {
    attr.enableArray(this._params.positions, 3, GL.DataType.UnsignedShort, false, 0, 0);
  }
  public draw(): void {
    this._params.indices.bind(GL.Buffer.Target.ElementArrayBuffer);
    System.instance.context.drawElements(GL.PrimitiveType.Triangles, this._params.numIndices, GL.DataType.UnsignedInt, 0);
  }

  public get qOrigin() { return this._params.positions.origin; }
  public get qScale() { return this._params.positions.scale; }
}

// A quad with its corners mapped to the dimensions as the viewport, used for special rendering techniques.
class ViewportQuad {
  public readonly vertices: Uint16Array;
  public readonly vertexParams: QParams3d;
  public readonly indices = new Uint32Array(6);

  public constructor() {
    const pt = new Point3d(-1, -1, 0);
    const vertices = new QPoint3dList(QParams3d.fromNormalizedRange());
    vertices.add(pt);
    pt.x = 1;
    vertices.add(pt);
    pt.y = 1;
    vertices.add(pt);
    pt.x = -1;
    vertices.add(pt);

    this.vertices = vertices.toTypedArray();
    this.vertexParams = vertices.params;

    this.indices[0] = 0;
    this.indices[1] = 1;
    this.indices[2] = 2;
    this.indices[3] = 0;
    this.indices[4] = 2;
    this.indices[5] = 3;
  }

  public createParams() {
    return IndexedGeometryParams.create(this.vertices, this.vertexParams, this.indices);
  }
}

namespace ViewportQuad {
  let _viewportQuad: ViewportQuad | undefined;

  export function getInstance(): ViewportQuad {
    if (undefined === _viewportQuad)
      _viewportQuad = new ViewportQuad();

    return _viewportQuad;
  }
}

// Geometry used for view-space rendering techniques.
export class ViewportQuadGeometry extends IndexedGeometry {
  protected _techniqueId: TechniqueId;

  protected constructor(params: IndexedGeometryParams, techniqueId: TechniqueId) {
    super(params);
    this._techniqueId = techniqueId;
  }
  public static create(techniqueId: TechniqueId) {
    const params = ViewportQuad.getInstance().createParams();
    return undefined !== params ? new ViewportQuadGeometry(params, techniqueId) : undefined;
  }

  public getTechniqueId(_target: Target) { return this._techniqueId; }
  public getRenderPass(_target: Target) { return RenderPass.OpaqueGeneral; }
  public get renderOrder() { return RenderOrder.Surface; }
}

// Geometry used for view-space rendering techniques which involve sampling one or more textures.
export class TexturedViewportQuadGeometry extends ViewportQuadGeometry {
  protected readonly _textures: WebGLTexture[];

  protected constructor(params: IndexedGeometryParams, techniqueId: TechniqueId, textures: WebGLTexture[]) {
    super(params, techniqueId);
    this._textures = textures;

    // TypeScript compiler will happily accept TextureHandle (or any other type) in place of WebGLTexture.
    // There is no such 'type' as WebGLTexture at run-time.
    for (const texture of this._textures) {
      assert(!(texture instanceof TextureHandle));
    }
  }
}

// Geometry used during the 'composite' pass to apply transparency and/or hilite effects.
export class CompositeGeometry extends TexturedViewportQuadGeometry {
  public static createGeometry(opaque: WebGLTexture, accum: WebGLTexture, reveal: WebGLTexture, hilite: WebGLTexture) {
    const params = ViewportQuad.getInstance().createParams();
    if (undefined === params) {
      return undefined;
    }

    return new CompositeGeometry(params, [opaque, accum, reveal, hilite]);
  }

  public get opaque() { return this._textures[0]; }
  public get accum() { return this._textures[1]; }
  public get reveal() { return this._textures[2]; }
  public get hilite() { return this._textures[3]; }

  // Invoked each frame to determine the appropriate Technique to use.
  public update(flags: CompositeFlags): void { this._techniqueId = this.determineTechnique(flags); }
  private determineTechnique(flags: CompositeFlags): TechniqueId {
    switch (flags) {
      case CompositeFlags.Hilite: return TechniqueId.CompositeHilite;
      case CompositeFlags.Translucent: return TechniqueId.CompositeTranslucent;
      default: return TechniqueId.CompositeHiliteAndTranslucent;
    }
  }

  private constructor(params: IndexedGeometryParams, textures: WebGLTexture[]) {
    super(params, TechniqueId.CompositeHilite, textures);
    assert(4 === this._textures.length);
  }
}

// Geometry used to ping-pong the pick buffer data in between opaque passes.
export class CopyPickBufferGeometry extends TexturedViewportQuadGeometry {
  public static createGeometry(idLow: WebGLTexture, idHigh: WebGLTexture, depthAndOrder: WebGLTexture) {
    const params = ViewportQuad.getInstance().createParams();
    if (undefined !== params) {
      return new CopyPickBufferGeometry(params, [idLow, idHigh, depthAndOrder]);
    } else {
      return undefined;
    }
  }

  public get elemIdLow() { return this._textures[0]; }
  public get elemIdHigh() { return this._textures[1]; }
  public get depthAndOrder() { return this._textures[2]; }

  private constructor(params: IndexedGeometryParams, textures: WebGLTexture[]) {
    super(params, TechniqueId.CopyPickBuffers, textures);
  }
}

export class SingleTexturedViewportQuadGeometry extends TexturedViewportQuadGeometry {
  public static createGeometry(texture: WebGLTexture, techId: TechniqueId) {
    const params = ViewportQuad.getInstance().createParams();
    if (undefined === params) {
      return undefined;
    }

    return new SingleTexturedViewportQuadGeometry(params, texture, techId);
  }

  public get texture(): WebGLTexture { return this._textures[0]; }
  public set texture(texture: WebGLTexture) { this._textures[0] = texture; }

  protected constructor(params: IndexedGeometryParams, texture: WebGLTexture, techId: TechniqueId) {
    super(params, techId, [texture]);
  }
}

export abstract class SilhouetteGeometry { /* ###TODO */ }
export class MaterialData {
  public rgb: FloatRgb;
  public specularColor: ColorDef;
  public reflectColor: ColorDef;
  public alpha?: number;
  public textureWeight: number;
  public specularExponent: number;
  // Legacy...
  public reflect: number = 0;
  public diffuseWeight: number = 0.6;
  public specularWeight: number = 0.4;

  public constructor(material?: Material) {
    if (!material) {
      this.rgb = new FloatRgb(1, 1, 1);
      this.specularColor = ColorDef.from(1, 1, 1);
      this.reflectColor = ColorDef.from(1, 1, 1);
      this.specularExponent = Material.Params.defaults.specularExponent;
      this.textureWeight = 1;
      this.reflect = 0;
    } else {
      if (material.alpha !== undefined)
        this.alpha = material.alpha;

      this.rgb = material.diffuseColor ? FloatRgb.fromColorDef(material.diffuseColor) : new FloatRgb(1, 1, 1);
      this.specularColor = material.specularColor ? material.specularColor.clone() : ColorDef.from(1, 1, 1);
      this.specularExponent = material.specularExponent;
      this.textureWeight = material.textureWeight;
      this.diffuseWeight = material.weights[0];
      this.specularWeight = material.weights[1];

      // Force 100% efficiency to avoid dark display (PirtyBike materials with low diffuse.)
      const totalWeight = this.diffuseWeight + this.specularWeight;
      this.diffuseWeight /= totalWeight;
      this.specularWeight /= totalWeight;

      this.reflect = material.weights[2];
      this.reflectColor = material.reflectColor ? material.reflectColor.clone() : ColorDef.from(1, 1, 1);
    }
  }
}

export class PolylineBuffers {
  public indices: BufferHandle;
  public prevIndices: BufferHandle;
  public nextIndicesAndParams: BufferHandle;
  public distances: BufferHandle;
  public constructor(indices: BufferHandle, prevIndices: BufferHandle, nextIndicesAndParams: BufferHandle, distances: BufferHandle) {
    this.indices = indices;
    this.prevIndices = prevIndices;
    this.nextIndicesAndParams = nextIndicesAndParams;
    this.distances = distances;
  }
}
