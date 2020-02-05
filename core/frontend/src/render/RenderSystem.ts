/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { base64StringToUint8Array, Id64String, IDisposable } from "@bentley/bentleyjs-core";
import { ClipVector, IndexedPolyface, Point2d, Point3d, Range3d, Transform } from "@bentley/geometry-core";
import {
  ColorDef,
  ElementAlignedBox3d,
  FeatureIndexType,
  Gradient,
  ImageBuffer,
  ImageSource,
  ImageSourceFormat,
  isValidImageSourceFormat,
  PackedFeatureTable,
  QParams3d,
  QPoint3dList,
  RenderMaterial,
  RenderTexture,
  TextureProps,
} from "@bentley/imodeljs-common";
import { SkyBox } from "../DisplayStyleState";
import { imageElementFromImageSource } from "../ImageUtil";
import { IModelApp } from "../IModelApp";
import { IModelConnection } from "../IModelConnection";
import { Viewport } from "../Viewport";
import { ViewRect } from "../ViewRect";
import { GraphicBuilder, GraphicType } from "./GraphicBuilder";
import { MeshArgs, PolylineArgs } from "./primitives/mesh/MeshPrimitives";
import { PointCloudArgs } from "./primitives/PointCloudPrimitive";
import { MeshParams, PointStringParams, PolylineParams } from "./primitives/VertexTable";
import { BackgroundMapTileTreeReference, TileTreeReference } from "../tile/internal";
import { SceneContext } from "../ViewContext";
import { RenderTarget } from "./RenderTarget";
import { InstancedGraphicParams } from "./InstancedGraphicParams";
import {
  GraphicList,
  RenderGraphic,
  RenderGraphicOwner,
} from "./RenderGraphic";
import { RenderClipVolume } from "./RenderClipVolume";
import {
  GraphicBranch,
  GraphicBranchOptions,
} from "./GraphicBranch";

// tslint:disable:no-const-enum
// cSpell:ignore deserializing subcat uninstanced wiremesh qorigin trimesh

/** Contains metadata about memory consumed by the render system or aspect thereof.
 * @internal
 */
export namespace RenderMemory {
  /** Describes memory consumed by a particular type of resource.
   * @internal
   */
  export class Consumers {
    public totalBytes = 0; // total number of bytes consumed by all consumers
    public maxBytes = 0; // largest number of bytes consumed by a single consumer
    public count = 0; // total number of consumers of this type

    public addConsumer(numBytes: number): void {
      this.totalBytes += numBytes;
      this.maxBytes = Math.max(this.maxBytes, numBytes);
      ++this.count;
    }

    public clear(): void {
      this.totalBytes = this.maxBytes = this.count = 0;
    }
  }

  /** @internal */
  export const enum BufferType {
    Surfaces = 0,
    VisibleEdges,
    SilhouetteEdges,
    PolylineEdges,
    Polylines,
    PointStrings,
    PointClouds,
    Instances,

    COUNT,
  }

  /** Describes memory consumed by GPU-allocated buffers.
   * @internal
   */
  export class Buffers extends Consumers {
    public readonly consumers: Consumers[];

    public constructor() {
      super();
      this.consumers = [];
      for (let i = 0; i < BufferType.COUNT; i++)
        this.consumers[i] = new Consumers();
    }

    public get surfaces() { return this.consumers[BufferType.Surfaces]; }
    public get visibleEdges() { return this.consumers[BufferType.VisibleEdges]; }
    public get silhouetteEdges() { return this.consumers[BufferType.SilhouetteEdges]; }
    public get polylineEdges() { return this.consumers[BufferType.PolylineEdges]; }
    public get polylines() { return this.consumers[BufferType.Polylines]; }
    public get pointStrings() { return this.consumers[BufferType.PointStrings]; }
    public get pointClouds() { return this.consumers[BufferType.PointClouds]; }
    public get instances() { return this.consumers[BufferType.Instances]; }

    public clear(): void {
      for (const consumer of this.consumers)
        consumer.clear();

      super.clear();
    }

    public addBuffer(type: BufferType, numBytes: number): void {
      this.addConsumer(numBytes);
      this.consumers[type].addConsumer(numBytes);
    }
  }

  /** @internal */
  export const enum ConsumerType {
    Textures = 0,
    VertexTables,
    FeatureTables,
    FeatureOverrides,
    ClipVolumes,
    PlanarClassifiers,
    ShadowMaps,
    TextureAttachments,
    COUNT,
  }

  /** @internal */
  export class Statistics {
    private _totalBytes = 0;
    public readonly consumers: Consumers[];
    public readonly buffers = new Buffers();

    public constructor() {
      this.consumers = [];
      for (let i = 0; i < ConsumerType.COUNT; i++)
        this.consumers[i] = new Consumers();
    }

    public get totalBytes(): number { return this._totalBytes; }
    public get textures() { return this.consumers[ConsumerType.Textures]; }
    public get vertexTables() { return this.consumers[ConsumerType.VertexTables]; }
    public get featureTables() { return this.consumers[ConsumerType.FeatureTables]; }
    public get featureOverrides() { return this.consumers[ConsumerType.FeatureOverrides]; }
    public get clipVolumes() { return this.consumers[ConsumerType.ClipVolumes]; }
    public get planarClassifiers() { return this.consumers[ConsumerType.PlanarClassifiers]; }
    public get shadowMaps() { return this.consumers[ConsumerType.ShadowMaps]; }
    public get textureAttachments() { return this.consumers[ConsumerType.TextureAttachments]; }

    public addBuffer(type: BufferType, numBytes: number): void {
      this._totalBytes += numBytes;
      this.buffers.addBuffer(type, numBytes);
    }

    public addConsumer(type: ConsumerType, numBytes: number): void {
      this._totalBytes += numBytes;
      this.consumers[type].addConsumer(numBytes);
    }

    public clear(): void {
      this._totalBytes = 0;
      this.buffers.clear();
      for (const consumer of this.consumers)
        consumer.clear();
    }

    public addTexture(numBytes: number) { this.addConsumer(ConsumerType.Textures, numBytes); }
    public addVertexTable(numBytes: number) { this.addConsumer(ConsumerType.VertexTables, numBytes); }
    public addFeatureTable(numBytes: number) { this.addConsumer(ConsumerType.FeatureTables, numBytes); }
    public addFeatureOverrides(numBytes: number) { this.addConsumer(ConsumerType.FeatureOverrides, numBytes); }
    public addClipVolume(numBytes: number) { this.addConsumer(ConsumerType.ClipVolumes, numBytes); }
    public addPlanarClassifier(numBytes: number) { this.addConsumer(ConsumerType.PlanarClassifiers, numBytes); }
    public addShadowMap(numBytes: number) { this.addConsumer(ConsumerType.ShadowMaps, numBytes); }
    public addTextureAttachment(numBytes: number) { this.addConsumer(ConsumerType.TextureAttachments, numBytes); }

    public addSurface(numBytes: number) { this.addBuffer(BufferType.Surfaces, numBytes); }
    public addVisibleEdges(numBytes: number) { this.addBuffer(BufferType.VisibleEdges, numBytes); }
    public addSilhouetteEdges(numBytes: number) { this.addBuffer(BufferType.SilhouetteEdges, numBytes); }
    public addPolylineEdges(numBytes: number) { this.addBuffer(BufferType.PolylineEdges, numBytes); }
    public addPolyline(numBytes: number) { this.addBuffer(BufferType.Polylines, numBytes); }
    public addPointString(numBytes: number) { this.addBuffer(BufferType.PointStrings, numBytes); }
    public addPointCloud(numBytes: number) { this.addBuffer(BufferType.PointClouds, numBytes); }
    public addInstances(numBytes: number) { this.addBuffer(BufferType.Instances, numBytes); }
  }

  /** @internal */
  export interface Consumer {
    collectStatistics(stats: Statistics): void;
  }
}

/** An opaque representation of a texture draped on geometry within a [[Viewport]].
 * @internal
 */
export abstract class RenderTextureDrape implements IDisposable {
  public abstract dispose(): void;

  /** @internal */
  public abstract collectStatistics(stats: RenderMemory.Statistics): void;
  public abstract collectGraphics(context: SceneContext): void;
}
/** @internal */
export type TextureDrapeMap = Map<Id64String, RenderTextureDrape>;

/** Describes a texture loaded from an HTMLImageElement
 * @internal
 */
export interface TextureImage {
  /** The HTMLImageElement containing the texture's image data */
  image: HTMLImageElement | undefined;
  /** The format of the texture's image data */
  format: ImageSourceFormat | undefined;
}

/** @internal */
export const enum RenderDiagnostics {
  /** No diagnostics enabled. */
  None = 0,
  /** Debugging output to browser console enabled. */
  DebugOutput = 1 << 1,
  /** Potentially expensive checks of WebGL state enabled. */
  WebGL = 1 << 2,
  /** All diagnostics enabled. */
  All = DebugOutput | WebGL,
}

/** @internal */
export interface GLTimerResult {
  /** Label from GLTimer.beginOperation */
  label: string;
  /** Time elapsed in nanoseconds, inclusive of child result times.
   *  @note no-op queries seem to have 32ns of noise.
   */
  nanoseconds: number;
  /** Child results if GLTimer.beginOperation calls were nested */
  children?: GLTimerResult[];
}

/** @internal */
export type GLTimerResultCallback = (result: GLTimerResult) => void;

/** Default implementation of RenderGraphicOwner. */
class GraphicOwner extends RenderGraphicOwner {
  public constructor(private readonly _graphic: RenderGraphic) { super(); }
  public get graphic(): RenderGraphic { return this._graphic; }
}

/** An interface optionally exposed by a RenderSystem that allows control of various debugging features.
 * @beta
 */
export interface RenderSystemDebugControl {
  /** Destroy this system's webgl context. Returns false if this behavior is not supported. */
  loseContext(): boolean;
  /** Draw surfaces as "pseudo-wiremesh", using GL_LINES instead of GL_TRIANGLES. Useful for visualizing faces of a mesh. Not suitable for real wiremesh display. */
  drawSurfacesAsWiremesh: boolean;
  /** Record GPU profiling information for each frame drawn. Check isGLTimerSupported before using.
   * @internal
   */
  resultsCallback?: GLTimerResultCallback;
  /** Returns true if the browser supports GPU profiling queries.
   * @internal
   */
  readonly isGLTimerSupported: boolean;
  /** Attempts to compile all shader programs and returns true if all were successful. May throw exceptions on errors.
   * This is useful for debugging shader compilation on specific platforms - especially those which use neither ANGLE nor SwiftShader (e.g., linux, mac, iOS)
   * because our unit tests which also compile all shaders run in software mode and therefore may not catch some "errors" (especially uniforms that have no effect on
   * program output).
   * @internal
   */
  compileAllShaders(): boolean;
}

/** A RenderSystem provides access to resources used by the internal WebGL-based rendering system.
 * An application rarely interacts directly with the RenderSystem; instead it interacts with types like [[Viewport]] which
 * coordinate with the RenderSystem on the application's behalf.
 * @see [[IModelApp.renderSystem]].
 * @public
 */
export abstract class RenderSystem implements IDisposable {
  /** Options used to initialize the RenderSystem. These are primarily used for feature-gating.
   * This object is frozen and cannot be modified after the RenderSystem is created.
   * @internal
   */
  public readonly options: RenderSystem.Options;

  /** Initialize the RenderSystem with the specified options.
   * @note The RenderSystem takes ownership of the supplied Options and freezes it.
   * @internal
   */
  protected constructor(options?: RenderSystem.Options) {
    this.options = undefined !== options ? options : {};
    Object.freeze(this.options);
    if (undefined !== this.options.disabledExtensions)
      Object.freeze(this.options.disabledExtensions);
  }

  /** @internal */
  public abstract get isValid(): boolean;

  /** @internal */
  public abstract dispose(): void;

  /** @internal */
  public get maxTextureSize(): number { return 0; }

  /** @internal */
  public get supportsInstancing(): boolean { return true; }

  /** @internal */
  public abstract createTarget(canvas: HTMLCanvasElement): RenderTarget;
  /** @internal */
  public abstract createOffscreenTarget(rect: ViewRect): RenderTarget;

  /** Find a previously-created [RenderMaterial]($common) by its ID.
   * @param _key The unique ID of the material within the context of the IModelConnection. Typically an element ID.
   * @param _imodel The IModelConnection with which the material is associated.
   * @returns A previously-created material matching the specified ID, or undefined if no such material exists.
   */
  public findMaterial(_key: string, _imodel: IModelConnection): RenderMaterial | undefined { return undefined; }

  /** Create a [RenderMaterial]($common) from parameters
   * If the parameters include a non-empty key, and no previously-created material already exists with that key, the newly-created material will be cached on the IModelConnection such
   * that it can later be retrieved by the same key using [[RenderSystem.findMaterial]].
   * @param _params A description of the material's properties.
   * @param _imodel The IModelConnection associated with the material.
   * @returns the newly-created material, or undefined if the material could not be created or if a material with the same key as that specified in the params already exists.
   */
  public createMaterial(_params: RenderMaterial.Params, _imodel: IModelConnection): RenderMaterial | undefined { return undefined; }

  /** Creates a [[GraphicBuilder]] for creating a [[RenderGraphic]].
   * @param placement The local-to-world transform in which the builder's geometry is to be defined.
   * @param type The type of builder to create.
   * @param viewport The viewport in which the resultant [[RenderGraphic]] will be rendered.
   * @param pickableId If the decoration is to be pickable, a unique identifier to associate with the resultant [[RenderGraphic]].
   * @returns A builder for creating a [[RenderGraphic]] of the specified type appropriate for rendering within the specified viewport.
   * @see [[IModelConnection.transientIds]] for obtaining an ID for a pickable decoration.
   * @see [[RenderContext.createGraphicBuilder]].
   * @see [[Decorator]]
   */
  public abstract createGraphicBuilder(placement: Transform, type: GraphicType, viewport: Viewport, pickableId?: Id64String): GraphicBuilder;

  /** @internal */
  public createTriMesh(args: MeshArgs, instances?: InstancedGraphicParams | Point3d): RenderGraphic | undefined {
    const params = MeshParams.create(args);
    return this.createMesh(params, instances);
  }

  /** @internal */
  public createIndexedPolylines(args: PolylineArgs, instances?: InstancedGraphicParams | Point3d): RenderGraphic | undefined {
    if (args.flags.isDisjoint) {
      const pointStringParams = PointStringParams.create(args);
      return undefined !== pointStringParams ? this.createPointString(pointStringParams, instances) : undefined;
    } else {
      const polylineParams = PolylineParams.create(args);
      return undefined !== polylineParams ? this.createPolyline(polylineParams, instances) : undefined;
    }
  }

  /** @internal */
  public createMesh(_params: MeshParams, _instances?: InstancedGraphicParams | Point3d): RenderGraphic | undefined { return undefined; }
  /** @internal */
  public createPolyline(_params: PolylineParams, _instances?: InstancedGraphicParams | Point3d): RenderGraphic | undefined { return undefined; }
  /** @internal */
  public createPointString(_params: PointStringParams, _instances?: InstancedGraphicParams | Point3d): RenderGraphic | undefined { return undefined; }
  /** @internal */
  public createPointCloud(_args: PointCloudArgs, _imodel: IModelConnection): RenderGraphic | undefined { return undefined; }
  /** @internal */
  public createSheetTilePolyfaces(_corners: Point3d[], _clip?: ClipVector): IndexedPolyface[] { return []; }
  /** @internal */
  public createSheetTile(_tile: RenderTexture, _polyfaces: IndexedPolyface[], _tileColor: ColorDef): GraphicList { return []; }
  /** @internal */
  public createClipVolume(_clipVector: ClipVector): RenderClipVolume | undefined { return undefined; }
  /** @internal */
  public createBackgroundMapDrape(_drapedTree: TileTreeReference, _mapTree: BackgroundMapTileTreeReference): RenderTextureDrape | undefined { return undefined; }
  /** @internal */
  public createTile(tileTexture: RenderTexture, corners: Point3d[], featureIndex?: number): RenderGraphic | undefined {
    const rasterTile = new MeshArgs();

    // corners
    // [0] [1]
    // [2] [3]
    // Quantize the points according to their range
    rasterTile.points = new QPoint3dList(QParams3d.fromRange(Range3d.create(...corners)));
    for (let i = 0; i < 4; ++i)
      rasterTile.points.add(corners[i]);

    // Now remove the translation from the quantized points and put it into a transform instead.
    // This prevents graphical artifacts when quantization origin is large relative to quantization scale.
    // ###TODO: Would be better not to create a branch for every tile.
    const qorigin = rasterTile.points.params.origin;
    const transform = Transform.createTranslationXYZ(qorigin.x, qorigin.y, qorigin.z);
    qorigin.setZero();

    rasterTile.vertIndices = [0, 1, 2, 2, 1, 3];
    rasterTile.textureUv = [
      new Point2d(0.0, 0.0),
      new Point2d(1.0, 0.0),
      new Point2d(0.0, 1.0),
      new Point2d(1.0, 1.0),
    ];

    rasterTile.texture = tileTexture;
    rasterTile.isPlanar = true;

    if (undefined !== featureIndex) {
      rasterTile.features.featureID = featureIndex;
      rasterTile.features.type = FeatureIndexType.Uniform;
    }

    const trimesh = this.createTriMesh(rasterTile);
    if (undefined === trimesh)
      return undefined;

    const branch = new GraphicBranch(true);
    branch.add(trimesh);
    return this.createBranch(branch, transform);
  }

  /** Create a Graphic for a [[SkyBox]] which encompasses the entire scene, rotating with the camera. */
  public createSkyBox(_params: SkyBox.CreateParams): RenderGraphic | undefined { return undefined; }

  /** Create a RenderGraphic consisting of a list of Graphics to be drawn together. */
  public abstract createGraphicList(primitives: RenderGraphic[]): RenderGraphic;

  /** Create a RenderGraphic consisting of a list of Graphics, with optional transform and symbology overrides applied to the list */
  public createBranch(branch: GraphicBranch, transform: Transform): RenderGraphic {
    return this.createGraphicBranch(branch, transform);
  }

  /** @internal */
  public abstract createGraphicBranch(branch: GraphicBranch, transform: Transform, options?: GraphicBranchOptions): RenderGraphic;

  /** Create a RenderGraphic consisting of batched [[Feature]]s.
   * @internal
   */
  public abstract createBatch(graphic: RenderGraphic, features: PackedFeatureTable, range: ElementAlignedBox3d, tileId?: string): RenderGraphic;

  /** Create a graphic that assumes ownership of another graphic.
   * @param ownedGraphic The RenderGraphic to be owned.
   * @returns The owning graphic that exposes a `disposeGraphic` method for explicitly disposing of the owned graphic.
   * @see [[RenderGraphicOwner]] for details regarding ownership semantics.
   * @public
   */
  public createGraphicOwner(ownedGraphic: RenderGraphic): RenderGraphicOwner { return new GraphicOwner(ownedGraphic); }

  /** Create a "layer" containing the graphics belonging to it. A layer has a unique identifier and all of its geometry lies in an XY plane.
   * Different layers can be drawn coincident with one another; their draw order can be controlled by a per-layer priority value so that one layer draws
   * on top of another. Layers cannot nest inside other layers. Multiple GraphicLayers can exist with the same ID; they are treated as belonging to the same layer.
   * A GraphicLayer must be contained (perhaps indirectly) inside a GraphicLayerContainer.
   * @see [[createGraphicLayerContainer]]
   * @internal
   */
  public createGraphicLayer(graphic: RenderGraphic, _layerId: string): RenderGraphic { return graphic; }

  /** Create a graphic that can contain [[GraphicLayer]]s.
   * @internal
   */
  public createGraphicLayerContainer(graphic: RenderGraphic, _drawAsOverlay: boolean, _transparency: number): RenderGraphic { return graphic; }

  /** Find a previously-created [[RenderTexture]] by its ID.
   * @param _key The unique ID of the texture within the context of the IModelConnection. Typically an element ID.
   * @param _imodel The IModelConnection with which the texture is associated.
   * @returns A previously-created texture matching the specified ID, or undefined if no such texture exists.
   */
  public findTexture(_key: string, _imodel: IModelConnection): RenderTexture | undefined { return undefined; }

  /** Find or create a [[RenderTexture]] from a persistent texture element.
   * @param id The ID of the texture element.
   * @param iModel The IModel containing the texture element.
   * @returns A Promise resolving to the created RenderTexture or to undefined if the texture could not be created.
   * @note If the texture is successfully created, it will be cached on the IModelConnection such that it can later be retrieved by its ID using [[RenderSystem.findTexture]].
   * @see [[RenderSystem.loadTextureImage]].
   * @internal
   */
  public async loadTexture(id: Id64String, iModel: IModelConnection): Promise<RenderTexture | undefined> {
    let texture = this.findTexture(id.toString(), iModel);
    if (undefined === texture) {
      const image = await this.loadTextureImage(id, iModel);
      if (undefined !== image) {
        // This will return a pre-existing RenderTexture if somebody else loaded it while we were awaiting the image.
        texture = this.createTextureFromImage(image.image!, ImageSourceFormat.Png === image.format!, iModel, new RenderTexture.Params(id.toString()));
      }
    }

    return texture;
  }

  /**
   * Load a texture image given the ID of a texture element.
   * @param id The ID of the texture element.
   * @param iModel The IModel containing the texture element.
   * @returns A Promise resolving to a TextureImage created from the texture element's data, or to undefined if the TextureImage could not be created.
   * @see [[RenderSystem.loadTexture]]
   * @internal
   */
  public async loadTextureImage(id: Id64String, iModel: IModelConnection): Promise<TextureImage | undefined> {
    const elemProps = await iModel.elements.getProps(id);
    if (1 !== elemProps.length)
      return undefined;

    const textureProps = elemProps[0] as TextureProps;
    if (undefined === textureProps.data || "string" !== typeof (textureProps.data) || undefined === textureProps.format || "number" !== typeof (textureProps.format))
      return undefined;

    const format = textureProps.format as ImageSourceFormat;
    if (!isValidImageSourceFormat(format))
      return undefined;

    const imageSource = new ImageSource(base64StringToUint8Array(textureProps.data as string), format);
    const imagePromise = imageElementFromImageSource(imageSource);
    return imagePromise.then((image: HTMLImageElement) => ({ image, format }));
  }

  /** Obtain a texture created from a gradient.
   * @param _symb The description of the gradient.
   * @param _imodel The IModelConnection with which the texture is associated.
   * @returns A texture created from the gradient image, or undefined if the texture could not be created.
   * @note If a texture matching the specified gradient already exists, it will be returned.
   * Otherwise, the newly-created texture will be cached on the IModelConnection such that a subsequent call to getGradientTexture with an equivalent gradient will
   * return the previously-created texture.
   * @beta
   */
  public getGradientTexture(_symb: Gradient.Symb, _imodel: IModelConnection): RenderTexture | undefined { return undefined; }

  /** Create a new texture from an [[ImageBuffer]]. */
  public createTextureFromImageBuffer(_image: ImageBuffer, _imodel: IModelConnection, _params: RenderTexture.Params): RenderTexture | undefined { return undefined; }

  /** Create a new texture from an HTML image. Typically the image was extracted from a binary representation of a jpeg or png via [[imageElementFromImageSource]] */
  public createTextureFromImage(_image: HTMLImageElement, _hasAlpha: boolean, _imodel: IModelConnection | undefined, _params: RenderTexture.Params): RenderTexture | undefined { return undefined; }

  /** Create a new texture from an [[ImageSource]]. */
  public async createTextureFromImageSource(source: ImageSource, imodel: IModelConnection | undefined, params: RenderTexture.Params): Promise<RenderTexture | undefined> {
    return imageElementFromImageSource(source).then((image) => IModelApp.hasRenderSystem ? this.createTextureFromImage(image, ImageSourceFormat.Png === source.format, imodel, params) : undefined);
  }

  /** Create a new texture from a cube of HTML images.
   * @internal
   */
  public createTextureFromCubeImages(_posX: HTMLImageElement, _negX: HTMLImageElement, _posY: HTMLImageElement, _negY: HTMLImageElement, _posZ: HTMLImageElement, _negZ: HTMLImageElement, _imodel: IModelConnection, _params: RenderTexture.Params): RenderTexture | undefined { return undefined; }

  /** @internal */
  public onInitialized(): void { }

  /** @internal */
  public enableDiagnostics(_enable: RenderDiagnostics): void { }

  /** @internal */
  public get supportsLogZBuffer(): boolean { return false !== this.options.logarithmicDepthBuffer; }

  /** Obtain an object that can be used to control various debugging features. Returns `undefined` if debugging features are unavailable for this `RenderSystem`.
   * @beta
   */
  public get debugControl(): RenderSystemDebugControl | undefined { return undefined; }

  /** @internal */
  public collectStatistics(_stats: RenderMemory.Statistics): void { }
}

/** @internal */
export type WebGLExtensionName = "WEBGL_draw_buffers" | "OES_element_index_uint" | "OES_texture_float" | "OES_texture_float_linear" |
  "OES_texture_half_float" | "OES_texture_half_float_linear" | "EXT_texture_filter_anisotropic" | "WEBGL_depth_texture" |
  "EXT_color_buffer_float" | "EXT_shader_texture_lod" | "ANGLE_instanced_arrays" | "OES_vertex_array_object" | "WEBGL_lose_context" |
  "EXT_frag_depth" | "EXT_disjoint_timer_query" | "EXT_disjoint_timer_query_webgl2";

/** A RenderSystem provides access to resources used by the internal WebGL-based rendering system.
 * An application rarely interacts directly with the RenderSystem; instead it interacts with types like [[Viewport]] which
 * coordinate with the RenderSystem on the application's behalf.
 * @see [[IModelApp.renderSystem]].
 * @public
 */
export namespace RenderSystem {
  /** Options passed to [[IModelApp.supplyRenderSystem]] to configure the [[RenderSystem]] on startup. Many of these options serve as "feature flags" used to enable newer, experimental features. As such they typically begin life tagged as "alpha" or "beta" and are subsequently deprecated when the feature is declared stable.
   *
   * @beta
   */
  export interface Options {
    /** WebGL extensions to be explicitly disabled, regardless of whether or not the WebGL implementation supports them.
     * This is chiefly useful for testing code which only executes in the absence of particular extensions.
     *
     * Default value: undefined
     *
     * @internal
     */
    disabledExtensions?: WebGLExtensionName[];

    /** If true, preserve the shader source code as internal strings, useful for debugging purposes.
     *
     * Default value: false
     *
     * @internal
     */
    preserveShaderSourceCode?: boolean;

    /** If true, display solar shadows when enabled by [ViewFlags.shadows]($common).
     *
     * Default value: true
     *
     * @beta
     */
    displaySolarShadows?: boolean;

    /** If the view frustum is sufficiently large, and the EXT_frag_depth WebGL extension is available, use a logarithmic depth buffer to improve depth buffer resolution. Framerate may degrade to an extent while the logarithmic depth buffer is in use. If this option is disabled, or the extension is not supported, the near and far planes of very large view frustums will instead be moved to reduce the draw distance.
     *
     * Default value: true
     *
     * @beta
     */
    logarithmicDepthBuffer?: boolean;

    /** If true anisotropic filtering is applied to map tile textures.
     *
     * Default value: false
     *
     * @internal
     */
    filterMapTextures?: boolean;

    /** If true anisotropic filtering is not applied to draped map tile textures.
     *
     * Default value: true
     *
     * @internal
     */
    filterMapDrapeTextures?: boolean;

    /** If true, [[ScreenViewport]]s will respect the DPI of the display.  See [[Viewport.devicePixelRatio]] and [[Viewport.cssPixelsToDevicePixels]].
     *
     * Default value: true
     *
     * @beta
     */
    dpiAwareViewports?: boolean;

    /** @internal
     * @deprecated This setting no longer has any effect.
     */
    directScreenRendering?: boolean;

    /** If true will attempt to create a WebGL2 context.
     *
     * Default value: false
     *
     * @internal
     */
    useWebGL2?: boolean;

    /** If true, plan projection models will be rendered using [PlanProjectionSettings]($common) defined by the [[DisplayStyle3dState]].
     * Default value: false
     * @internal
     */
    planProjections?: boolean;
  }
}
