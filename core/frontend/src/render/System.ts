/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Rendering */

import { assert, base64StringToUint8Array, dispose, disposeArray, Id64, Id64String, IDisposable } from "@bentley/bentleyjs-core";
import { ClipVector, IndexedPolyface, Point2d, Point3d, Range3d, Transform, XAndY, Vector3d, Range1d } from "@bentley/geometry-core";
import {
  AntiAliasPref, BatchType, ColorDef, ElementAlignedBox3d, Feature, FeatureIndexType, FeatureTable, Frustum, Gradient,
  HiddenLine, Hilite, ImageBuffer, ImageSource, ImageSourceFormat, isValidImageSourceFormat, QParams3d, SolarShadows,
  QPoint3dList, RenderMaterial, RenderTexture, ViewFlag, ViewFlags, AnalysisStyle, GeometryClass, AmbientOcclusion, SpatialClassificationProps,
} from "@bentley/imodeljs-common";
import { SkyBox } from "../DisplayStyleState";
import { imageElementFromImageSource } from "../ImageUtil";
import { IModelApp } from "../IModelApp";
import { IModelConnection } from "../IModelConnection";
import { HiliteSet } from "../SelectionSet";
import { BeButtonEvent, BeWheelEvent } from "../tools/Tool";
import { ViewFrustum, Viewport, ViewRect } from "../Viewport";
import { FeatureSymbology } from "./FeatureSymbology";
import { GraphicBuilder, GraphicType } from "./GraphicBuilder";
import { MeshArgs, PolylineArgs } from "./primitives/mesh/MeshPrimitives";
import { PointCloudArgs } from "./primitives/PointCloudPrimitive";
import { MeshParams, PointStringParams, PolylineParams } from "./primitives/VertexTable";
import { TileTree } from "../tile/TileTree";
import { SceneContext } from "../ViewContext";
import { SpatialViewState } from "../ViewState";
import { BackgroundMapTileTreeReference } from "../tile/WebMapTileTree";

// tslint:disable:no-const-enum

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

/** A RenderPlan holds a Frustum and the render settings for displaying a RenderScene into a RenderTarget.
 * @internal
 */
export class RenderPlan {
  public readonly is3d: boolean;
  public readonly viewFlags: ViewFlags;
  public readonly viewFrustum: ViewFrustum;
  public readonly bgColor: ColorDef;
  public readonly monoColor: ColorDef;
  public readonly hiliteSettings: Hilite.Settings;
  public readonly aaLines: AntiAliasPref;
  public readonly aaText: AntiAliasPref;
  public readonly activeVolume?: ClipVector;
  public readonly hline?: HiddenLine.Settings;
  public readonly analysisStyle?: AnalysisStyle;
  public readonly ao?: AmbientOcclusion.Settings;
  public readonly isFadeOutActive: boolean;
  public analysisTexture?: RenderTexture;
  public classificationTextures?: Map<Id64String, RenderTexture>;
  private _curFrustum: ViewFrustum;

  public get frustum(): Frustum { return this._curFrustum.getFrustum(); }
  public get fraction(): number { return this._curFrustum.frustFraction; }

  public selectViewFrustum() { this._curFrustum = this.viewFrustum; }

  private constructor(is3d: boolean, viewFlags: ViewFlags, bgColor: ColorDef, monoColor: ColorDef, hiliteSettings: Hilite.Settings, aaLines: AntiAliasPref, aaText: AntiAliasPref, viewFrustum: ViewFrustum, isFadeOutActive: boolean, activeVolume?: ClipVector, hline?: HiddenLine.Settings, analysisStyle?: AnalysisStyle, ao?: AmbientOcclusion.Settings) {
    this.is3d = is3d;
    this.viewFlags = viewFlags;
    this.bgColor = bgColor;
    this.monoColor = monoColor;
    this.hiliteSettings = hiliteSettings;
    this.aaLines = aaLines;
    this.aaText = aaText;
    this.activeVolume = activeVolume;
    this.hline = hline;
    this._curFrustum = this.viewFrustum = viewFrustum;
    this.analysisStyle = analysisStyle;
    this.ao = ao;
    this.isFadeOutActive = isFadeOutActive;
  }

  public static createFromViewport(vp: Viewport): RenderPlan {
    const view = vp.view;
    const style = view.displayStyle;

    const hline = style.is3d() ? style.settings.hiddenLineSettings : undefined;
    const ao = style.is3d() ? style.settings.ambientOcclusionSettings : undefined;
    const clipVec = view.getViewClip();
    const rp = new RenderPlan(view.is3d(), style.viewFlags, view.backgroundColor, style.monochromeColor, vp.hilite, vp.wantAntiAliasLines, vp.wantAntiAliasText, vp.viewFrustum, vp.isFadeOutActive, clipVec, hline, style.analysisStyle, ao);
    if (rp.analysisStyle !== undefined && rp.analysisStyle.scalarThematicSettings !== undefined)
      rp.analysisTexture = vp.target.renderSystem.getGradientTexture(Gradient.Symb.createThematic(rp.analysisStyle.scalarThematicSettings), vp.iModel);

    return rp;
  }
}

/** Abstract representation of an object which can be rendered by a [[RenderSystem]].
 * Two broad classes of graphics exist:
 *  - "Scene" graphics generated on the back-end to represent the contents of the models displayed in a [[Viewport]]; and
 *  - [[Decorations]] created on the front-end to be rendered along with the scene.
 * The latter are produced using a [[GraphicBuilder]].
 * @public
 */
export abstract class RenderGraphic implements IDisposable /* , RenderMemory.Consumer */ {
  public abstract dispose(): void;

  /** @internal */
  public abstract collectStatistics(stats: RenderMemory.Statistics): void;
}

/** Describes the type of a RenderClipVolume.
 * @beta
 */
export const enum ClippingType {
  /** No clip volume. */
  None,
  /** A 2d mask which excludes geometry obscured by the mask. */
  Mask,
  /** A 3d set of convex clipping planes which excludes geometry outside of the planes. */
  Planes,
}

/** An opaque representation of a clip volume applied to geometry within a [[Viewport]].
 * A RenderClipVolume is created from a [[ClipVector]] and takes ownership of that ClipVector, expecting that it will not be modified while the RenderClipVolume still references it.
 * @see [System.createClipVolume]
 * @beta
 */
export abstract class RenderClipVolume implements IDisposable /* , RenderMemory.Consumer */ {
  /** The ClipVector from which this volume was created. It must not be modified. */
  public readonly clipVector: ClipVector;

  protected constructor(clipVector: ClipVector) {
    this.clipVector = clipVector;
  }

  /** Returns the type of this clipping volume. */
  public abstract get type(): ClippingType;

  /** Disposes of any WebGL resources owned by this volume. Must be invoked when finished with the clip volume object to prevent memory leaks. */
  public abstract dispose(): void;

  /** @internal */
  public abstract collectStatistics(stats: RenderMemory.Statistics): void;
}
/** An opaque representation of a shadow map.
 * @internal
 */
export abstract class RenderSolarShadowMap implements IDisposable {
  public abstract dispose(): void;

  /** @internal */
  public abstract collectStatistics(stats: RenderMemory.Statistics): void;

  /** @internal */
  public abstract collectGraphics(sceneContext: SceneContext): void;
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

/** An opaque representation of a planar classifier applied to geometry within a [[Viewport]].
 * @beta
 */
export abstract class RenderPlanarClassifier implements IDisposable {
  public abstract dispose(): void;
}

/** @beta */
export type PlanarClassifierMap = Map<Id64String, RenderPlanarClassifier>;

/** An array of [[RenderGraphic]]s.
 * @public
 */
export type GraphicList = RenderGraphic[];

/** A [Decoration]($docs/learning/frontend/ViewDecorations#canvas-decorations) that is drawn onto the
 * [2d canvas](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D) on top of a ScreenViewport.
 * CanvasDecorations may be pickable by implementing [[pick]].
 * @public
 */
export interface CanvasDecoration {
  /**
   * Required method to draw this decoration into the supplied [CanvasRenderingContext2D](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D). This method is called every time a frame is rendered.
   * @param ctx The CanvasRenderingContext2D for the [[ScreenViewport]] being rendered.
   * @note Before this this function is called, the state of the CanvasRenderingContext2D is [saved](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/save),
   * and it is [restored](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/restore) when this method returns. Therefore,
   * it is *not* necessary for implementers to save/restore themselves.
   */
  drawDecoration(ctx: CanvasRenderingContext2D): void;
  /**
   * Optional view coordinates position of this overlay decoration. If present, [ctx.translate](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/translate) is called
   * with this point before [[drawDecoration]] is called.
   */
  position?: XAndY;
  /** Optional method to provide feedback when mouse events occur on this decoration.
   * @param pt The position of the mouse in the ScreenViewport
   * @return true if the mouse is inside this decoration.
   * @note If this method is not present, no mouse events are directed to this decoration.
   */
  pick?(pt: XAndY): boolean;
  /** Optional method to be called whenever this decorator is picked and the mouse first enters this decoration. */
  onMouseEnter?(ev: BeButtonEvent): void;
  /** Optional method to be called whenever when the mouse leaves this decoration. */
  onMouseLeave?(): void;
  /** Optional method to be called whenever when the mouse moves inside this decoration. */
  onMouseMove?(ev: BeButtonEvent): void;
  /**
   * Optional method to be called whenever this decorator is picked and a mouse button is pressed or released inside this decoration.
   * @return true if the event was handled by this decoration and should *not* be forwarded to the active tool.
   * @note This method is called for both mouse up and down events. If it returns `true` for a down event, it should also return `true` for the
   * corresponding up event.
   */
  onMouseButton?(ev: BeButtonEvent): boolean;
  /**
   * Optional method to be called when the mouse wheel is rolled with the pointer over this decoration.
   * @return true to indicate that the event has been handled and should not be propagated to default handler
   */
  onWheel?(ev: BeWheelEvent): boolean;
  /** Cursor to use when mouse is inside this decoration. Default is "pointer". */
  decorationCursor?: string;
}

/** An array of [[CanvasDecoration]]s.
 * @public
 */
export type CanvasDecorationList = CanvasDecoration[];

/** A set of [[RenderGraphic]]s and [[CanvasDecoration]]s produced by [[Tool]]s and [[Decorator]]s, used to decorate the contents of a [[Viewport]].
 * @public
 */
export class Decorations implements IDisposable {
  private _skyBox?: RenderGraphic;
  private _viewBackground?: RenderGraphic; // drawn first, view units, with no zbuffer, smooth shading, default lighting. e.g., a skybox
  private _normal?: GraphicList;       // drawn with zbuffer, with scene lighting
  private _world?: GraphicList;        // drawn with zbuffer, with default lighting, smooth shading
  private _worldOverlay?: GraphicList; // drawn in overlay mode, world units
  private _viewOverlay?: GraphicList;  // drawn in overlay mode, view units

  public canvasDecorations?: CanvasDecorationList;

  /** A view decoration created from a [[SkyBox]] rendered behind all other geometry to provide environmental context. */
  public get skyBox(): RenderGraphic | undefined { return this._skyBox; }
  public set skyBox(skyBox: RenderGraphic | undefined) { dispose(this._skyBox); this._skyBox = skyBox; }
  /** A view decoration drawn as the background of the view. @see [[GraphicType.ViewBackground]]. */
  public get viewBackground(): RenderGraphic | undefined { return this._viewBackground; }
  public set viewBackground(viewBackground: RenderGraphic | undefined) { dispose(this._viewBackground); this._viewBackground = viewBackground; }
  /** Decorations drawn as if they were part of the scene. @see [[GraphicType.Scene]]. */
  public get normal(): GraphicList | undefined { return this._normal; }
  public set normal(normal: GraphicList | undefined) { disposeArray(this._normal); this._normal = normal; }
  /** Decorations drawn as if they were part of the world, but ignoring the view's [[ViewFlags]]. @see [[GraphicType.WorldDecoration]]. */
  public get world(): GraphicList | undefined { return this._world; }
  public set world(world: GraphicList | undefined) { disposeArray(this._world); this._world = world; }
  /** Overlay decorations drawn in world coordinates. @see [[GraphicType.WorldOverlay]]. */
  public get worldOverlay(): GraphicList | undefined { return this._worldOverlay; }
  public set worldOverlay(worldOverlay: GraphicList | undefined) { disposeArray(this._worldOverlay); this._worldOverlay = worldOverlay; }
  /** Overlay decorations drawn in view coordinates. @see [[GraphicType.ViewOverlay]]. */
  public get viewOverlay(): GraphicList | undefined { return this._viewOverlay; }
  public set viewOverlay(viewOverlay: GraphicList | undefined) { disposeArray(this._viewOverlay); this._viewOverlay = viewOverlay; }

  public dispose() {
    this.skyBox = undefined;
    this.viewBackground = undefined;
    this.world = undefined;
    this.worldOverlay = undefined;
    this.viewOverlay = undefined;
    this.normal = undefined;
  }
}

/**
 * A node in a scene graph. The branch itself is not renderable. Instead it contains a list of RenderGraphics,
 * and a transform, symbology overrides, and clip volume which are to be applied when rendering them.
 * Branches can be nested to build an arbitrarily-complex scene graph.
 * @see [[RenderSystem.createBranch]]
 * @public
 */
export class GraphicBranch implements IDisposable /* , RenderMemory.Consumer */ {
  /** The child nodes of this branch */
  public readonly entries: RenderGraphic[] = [];
  /** If true, when the branch is disposed of, the RenderGraphics in its entries array will also be disposed */
  public readonly ownsEntries: boolean;
  private _viewFlagOverrides = new ViewFlag.Overrides();
  /** Optional symbology overrides to be applied to all graphics in this branch */
  public symbologyOverrides?: FeatureSymbology.Overrides;
  /** Optional animation branch Id.
   * @internal
   */
  public animationId?: string;

  /** Constructor
   * @param ownsEntries If true, when this branch is [[dispose]]d, all of the [[RenderGraphic]]s it contains will also be disposed.
   */
  public constructor(ownsEntries: boolean = false) { this.ownsEntries = ownsEntries; }

  /** Add a graphic to this branch. */
  public add(graphic: RenderGraphic): void { this.entries.push(graphic); }
  /** @internal */
  public getViewFlags(flags: ViewFlags, out?: ViewFlags): ViewFlags { return this._viewFlagOverrides.apply(flags.clone(out)); }
  /** @internal */
  public setViewFlags(flags: ViewFlags): void { this._viewFlagOverrides.overrideAll(flags); }
  /** @internal */
  public setViewFlagOverrides(ovr: ViewFlag.Overrides): void { this._viewFlagOverrides.copyFrom(ovr); }

  public dispose() { this.clear(); }
  public get isEmpty(): boolean { return 0 === this.entries.length; }

  /** Empties the list of [[RenderGraphic]]s contained in this branch, and if the [[GraphicBranch.ownsEntries]] flag is set, also disposes of them. */
  public clear(): void {
    if (this.ownsEntries)
      disposeArray(this.entries);
    else
      this.entries.length = 0;
  }

  /** @internal */
  public collectStatistics(stats: RenderMemory.Statistics): void {
    for (const entry of this.entries)
      entry.collectStatistics(stats);
  }
}

/** Describes aspects of a pixel as read from a [[Viewport]].
 * @see [[Viewport.readPixels]]
 * @beta
 */
export namespace Pixel {
  /** Describes a single pixel within a [[Pixel.Buffer]]. */
  export class Data {
    public readonly feature?: Feature;
    public readonly distanceFraction: number;
    public readonly type: GeometryType;
    public readonly planarity: Planarity;
    /** @internal */
    public readonly featureTable?: PackedFeatureTable;
    /** @internal */
    public readonly iModel?: IModelConnection;
    /** @internal */
    public readonly tileId?: string;
    /** @internal */
    public get isClassifier(): boolean { return undefined !== this.featureTable && BatchType.Primary !== this.featureTable.type; }

    /** @internal */
    public constructor(feature?: Feature, distanceFraction = -1.0, type = GeometryType.Unknown, planarity = Planarity.Unknown, featureTable?: PackedFeatureTable, iModel?: IModelConnection, tileId?: string) {
      this.feature = feature;
      this.distanceFraction = distanceFraction;
      this.type = type;
      this.planarity = planarity;
      this.featureTable = featureTable;
      this.iModel = iModel;
      this.tileId = tileId;
    }

    public get elementId(): Id64String | undefined { return undefined !== this.feature ? this.feature.elementId : undefined; }
    public get subCategoryId(): Id64String | undefined { return undefined !== this.feature ? this.feature.subCategoryId : undefined; }
    public get geometryClass(): GeometryClass | undefined { return undefined !== this.feature ? this.feature.geometryClass : undefined; }
  }

  /** Describes the foremost type of geometry which produced the [[Pixel.Data]]. */
  export const enum GeometryType {
    /** [[Pixel.Selector.GeometryAndDistance]] was not specified, or the type could not be determined. */
    Unknown, // Geometry was not selected, or type could not be determined
    /** No geometry was rendered to this pixel. */
    None,
    /** A surface produced this pixel. */
    Surface,
    /** A point primitive or polyline produced this pixel. */
    Linear,
    /** This pixel was produced by an edge of a surface. */
    Edge,
    /** This pixel was produced by a silhouette edge of a curved surface. */
    Silhouette,
  }

  /** Describes the planarity of the foremost geometry which produced the pixel. */
  export const enum Planarity {
    /** [[Pixel.Selector.GeometryAndDistance]] was not specified, or the planarity could not be determined. */
    Unknown,
    /** No geometry was rendered to this pixel. */
    None,
    /** Planar geometry produced this pixel. */
    Planar,
    /** Non-planar geometry produced this pixel. */
    NonPlanar,
  }

  /**
   * Bit-mask by which callers of [[Viewport.readPixels]] specify which aspects are of interest.
   * Aspects not specified will be omitted from the returned data.
   */
  export const enum Selector {
    None = 0,
    /** Select the [[Feature]] which produced each pixel, as well as the [[PackedFeatureTable]] from which the feature originated. */
    Feature = 1 << 0,
    /** Select the type and planarity of geometry which produced each pixel as well as the fraction of its distance between the near and far planes. */
    GeometryAndDistance = 1 << 2,
    /** Select all aspects of each pixel. */
    All = GeometryAndDistance | Feature,
  }

  /** A rectangular array of pixels as read from a [[Viewport]]'s frame buffer. Each pixel is represented as a [[Pixel.Data]] object.
   * @see [[Viewport.readPixels]].
   */
  export interface Buffer {
    /** Retrieve the data associated with the pixel at (x,y) in view coordinates. */
    getPixel(x: number, y: number): Data;
  }

  /** A function which receives the results of a call to [[Viewport.readPixels]].
   * @note The contents of the buffer become invalid once the Receiver function returns. Do not store a reference to it.
   */
  export type Receiver = (pixels: Buffer | undefined) => void;
}

/** @internal */
export interface PackedFeature {
  elementId: Id64.Uint32Pair;
  subCategoryId: Id64.Uint32Pair;
  geometryClass: GeometryClass;
  animationNodeId: number;
}

/**
 * An immutable, packed representation of a [[FeatureTable]]. The features are packed into a single array of 32-bit integer values,
 * wherein each feature occupies 3 32-bit integers.
 * @internal
 */
export class PackedFeatureTable {
  private readonly _data: Uint32Array;
  public readonly modelId: Id64String;
  public readonly maxFeatures: number;
  public readonly numFeatures: number;
  public readonly anyDefined: boolean;
  public readonly type: BatchType;
  private readonly _animationNodeIds?: Uint8Array | Uint16Array | Uint32Array;

  public get byteLength(): number { return this._data.byteLength; }

  /** Construct a PackedFeatureTable from the packed binary data.
   * This is used internally when deserializing Tiles in iMdl format.
   * @internal
   */
  public constructor(data: Uint32Array, modelId: Id64String, numFeatures: number, maxFeatures: number, type: BatchType, animationNodeIds?: Uint8Array | Uint16Array | Uint32Array) {
    this._data = data;
    this.modelId = modelId;
    this.maxFeatures = maxFeatures;
    this.numFeatures = numFeatures;
    this.type = type;
    this._animationNodeIds = animationNodeIds;

    switch (this.numFeatures) {
      case 0:
        this.anyDefined = false;
        break;
      case 1:
        this.anyDefined = this.getFeature(0).isDefined;
        break;
      default:
        this.anyDefined = true;
        break;
    }

    assert(this._data.length >= this._subCategoriesOffset);
    assert(this.maxFeatures >= this.numFeatures);
    assert(undefined === this._animationNodeIds || this._animationNodeIds.length === this.numFeatures);
  }

  /** Create a packed feature table from a [[FeatureTable]]. */
  public static pack(featureTable: FeatureTable): PackedFeatureTable {
    // We must determine how many subcategories we have ahead of time to compute the size of the Uint32Array, as
    // the array cannot be resized after it is created.
    // We are not too worried about this as FeatureTables created on the front-end will contain few if any features; those obtained from the
    // back-end arrive within tiles already in the packed format.
    const subcategories = new Map<string, number>();
    for (const iv of featureTable.getArray()) {
      const found = subcategories.get(iv.value.subCategoryId.toString());
      if (undefined === found)
        subcategories.set(iv.value.subCategoryId, subcategories.size);
    }

    // We need 3 32-bit integers per feature, plus 2 32-bit integers per subcategory.
    const subCategoriesOffset = 3 * featureTable.length;
    const nUint32s = subCategoriesOffset + 2 * subcategories.size;
    const uint32s = new Uint32Array(nUint32s);

    for (const iv of featureTable.getArray()) {
      const feature = iv.value;
      const index = iv.index * 3;

      let subCategoryIndex = subcategories.get(feature.subCategoryId)!;
      assert(undefined !== subCategoryIndex); // we inserted it above...
      subCategoryIndex |= (feature.geometryClass << 24);

      uint32s[index + 0] = Id64.getLowerUint32(feature.elementId);
      uint32s[index + 1] = Id64.getUpperUint32(feature.elementId);
      uint32s[index + 2] = subCategoryIndex;
    }

    subcategories.forEach((index: number, id: string, _map) => {
      const index32 = subCategoriesOffset + 2 * index;
      uint32s[index32 + 0] = Id64.getLowerUint32(id);
      uint32s[index32 + 1] = Id64.getUpperUint32(id);
    });

    return new PackedFeatureTable(uint32s, featureTable.modelId, featureTable.length, featureTable.maxFeatures, featureTable.type);
  }

  /** Retrieve the Feature associated with the specified index. */
  public getFeature(featureIndex: number): Feature {
    const packed = this.getPackedFeature(featureIndex);
    const elemId = Id64.fromUint32Pair(packed.elementId.lower, packed.elementId.upper);
    const subcatId = Id64.fromUint32Pair(packed.subCategoryId.lower, packed.subCategoryId.upper);
    return new Feature(elemId, subcatId, packed.geometryClass);
  }

  /** Returns the Feature associated with the specified index, or undefined if the index is out of range. */
  public findFeature(featureIndex: number): Feature | undefined {
    return featureIndex < this.numFeatures ? this.getFeature(featureIndex) : undefined;
  }

  /** @internal */
  public getElementIdPair(featureIndex: number): Id64.Uint32Pair {
    assert(featureIndex < this.numFeatures);
    const offset = 3 * featureIndex;
    return {
      lower: this._data[offset],
      upper: this._data[offset + 1],
    };
  }

  /** @internal */
  public getSubCategoryIdPair(featureIndex: number): Id64.Uint32Pair {
    const index = 3 * featureIndex;
    let subCatIndex = this._data[index + 2];
    subCatIndex = (subCatIndex & 0x00ffffff) >>> 0;
    subCatIndex = subCatIndex * 2 + this._subCategoriesOffset;
    return { lower: this._data[subCatIndex], upper: this._data[subCatIndex + 1] };
  }

  /** @internal */
  public getAnimationNodeId(featureIndex: number): number {
    return undefined !== this._animationNodeIds ? this._animationNodeIds[featureIndex] : 0;
  }

  /** @internal */
  public getPackedFeature(featureIndex: number): PackedFeature {
    assert(featureIndex < this.numFeatures);

    const index32 = 3 * featureIndex;
    const elementId = { lower: this._data[index32], upper: this._data[index32 + 1] };

    const subCatIndexAndClass = this._data[index32 + 2];
    const geometryClass = (subCatIndexAndClass >>> 24) & 0xff;

    let subCatIndex = (subCatIndexAndClass & 0x00ffffff) >>> 0;
    subCatIndex = subCatIndex * 2 + this._subCategoriesOffset;
    const subCategoryId = { lower: this._data[subCatIndex], upper: this._data[subCatIndex + 1] };

    const animationNodeId = this.getAnimationNodeId(featureIndex);
    return { elementId, subCategoryId, geometryClass, animationNodeId };
  }

  /** Returns the element ID of the Feature associated with the specified index, or undefined if the index is out of range. */
  public findElementId(featureIndex: number): Id64String | undefined {
    if (featureIndex >= this.numFeatures)
      return undefined;
    else
      return this.readId(3 * featureIndex);
  }

  /** Return true if this table contains exactly 1 feature. */
  public get isUniform(): boolean { return 1 === this.numFeatures; }

  /** If this table contains exactly 1 feature, return it. */
  public get uniform(): Feature | undefined { return this.isUniform ? this.getFeature(0) : undefined; }

  public get isVolumeClassifier(): boolean { return BatchType.VolumeClassifier === this.type; }
  public get isPlanarClassifier(): boolean { return BatchType.VolumeClassifier === this.type; }
  public get isClassifier(): boolean { return this.isVolumeClassifier || this.isPlanarClassifier; }

  /** Unpack the features into a [[FeatureTable]]. */
  public unpack(): FeatureTable {
    const table = new FeatureTable(this.maxFeatures, this.modelId);
    for (let i = 0; i < this.numFeatures; i++) {
      const feature = this.getFeature(i);
      table.insertWithIndex(feature, i);
    }

    return table;
  }

  private get _subCategoriesOffset(): number { return this.numFeatures * 3; }

  private readId(offset32: number): Id64String {
    return Id64.fromUint32Pair(this._data[offset32], this._data[offset32 + 1]);
  }
}

/** Used for debugging purposes, to toggle display of instanced or batched primitives.
 * @see [[RenderTargetDebugControl]].
 * @alpha
 */
export const enum PrimitiveVisibility {
  /** Draw all primitives. */
  All,
  /** Only draw instanced primitives. */
  Instanced,
  /** Only draw un-instanced primitives. */
  Uninstanced,
}

/** An interface optionally exposed by a RenderTarget that allows control of various debugging features.
 * @beta
 */
export interface RenderTargetDebugControl {
  /** If true, render to the screen as if rendering off-screen for readPixels(). */
  drawForReadPixels: boolean;
  /** If true, use log-z depth buffer (assuming supported by client). */
  useLogZ: boolean;
  /** @alpha */
  primitiveVisibility: PrimitiveVisibility;
}

/** A RenderTarget connects a [[Viewport]] to a WebGLRenderingContext to enable the viewport's contents to be displayed on the screen.
 * Application code rarely interacts directly with a RenderTarget - instead, it interacts with a Viewport which forwards requests to the implementation
 * of the RenderTarget.
 * @internal
 */
export abstract class RenderTarget implements IDisposable {
  public pickOverlayDecoration(_pt: XAndY): CanvasDecoration | undefined { return undefined; }

  public static get frustumDepth2d(): number { return 1.0; } // one meter
  public static get maxDisplayPriority(): number { return (1 << 23) - 32; }
  public static get minDisplayPriority(): number { return -this.maxDisplayPriority; }

  /** Returns a transform mapping an object's display priority to a depth from 0 to frustumDepth2d. */
  public static depthFromDisplayPriority(priority: number): number {
    return (priority - this.minDisplayPriority) / (this.maxDisplayPriority - this.minDisplayPriority) * this.frustumDepth2d;
  }

  public abstract get renderSystem(): RenderSystem;
  public abstract get cameraFrustumNearScaleLimit(): number;
  public abstract get viewRect(): ViewRect;
  public abstract get wantInvertBlackBackground(): boolean;

  public abstract get animationFraction(): number;
  public abstract set animationFraction(fraction: number);

  public get animationBranches(): AnimationBranchStates | undefined { return undefined; }
  public set animationBranches(_transforms: AnimationBranchStates | undefined) { }
  public get solarShadowMap(): RenderSolarShadowMap | undefined { return undefined; }

  public createGraphicBuilder(type: GraphicType, viewport: Viewport, placement: Transform = Transform.identity, pickableId?: Id64String) { return this.renderSystem.createGraphicBuilder(placement, type, viewport, pickableId); }

  public dispose(): void { }
  public reset(): void { }
  public abstract changeScene(scene: GraphicList): void;
  public abstract changeBackgroundMap(_graphics: GraphicList): void;
  public abstract changeOverlayGraphics(_scene: GraphicList): void;
  public changeTextureDrapes(_drapes: TextureDrapeMap): void { }
  public changePlanarClassifiers(_classifiers?: PlanarClassifierMap): void { }
  public changeSolarShadowMap(_solarShadowMap?: RenderSolarShadowMap): void { }
  public abstract changeDynamics(dynamics?: GraphicList): void;
  public abstract changeDecorations(decorations: Decorations): void;
  public abstract changeRenderPlan(plan: RenderPlan): void;
  public abstract drawFrame(sceneMilSecElapsed?: number): void;
  public overrideFeatureSymbology(_ovr: FeatureSymbology.Overrides): void { }
  public setHiliteSet(_hilited: HiliteSet): void { }
  public setFlashed(_elementId: Id64String, _intensity: number): void { }
  public abstract setViewRect(_rect: ViewRect, _temporary: boolean): void;
  public onResized(): void { }
  public abstract updateViewRect(): boolean; // force a RenderTarget viewRect to resize if necessary since last draw
  public abstract readPixels(rect: ViewRect, selector: Pixel.Selector, receiver: Pixel.Receiver, excludeNonLocatable: boolean): void;
  public readImage(_rect: ViewRect, _targetSize: Point2d, _flipVertically: boolean): ImageBuffer | undefined { return undefined; }

  public get debugControl(): RenderTargetDebugControl | undefined { return undefined; }
}

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

/** Parameters for creating a [[RenderGraphic]] representing a collection of instances of shared geometry.
 * Each instance is drawn using the same graphics, but with its own transform and (optionally) [[Feature]] Id.
 * @internal
 */
export interface InstancedGraphicParams {
  /** The number of instances.
   * Must be greater than zero.
   * Must be equal to (transforms.length / 12)
   * If featureIds is defined, must be equal to (featureIds.length / 3)
   * If symbologyOverrides is defined, must be equal to (symbologyOverrides.length / 8)
   */
  readonly count: number;

  /** An array of instance-to-model transforms.
   * Each transform consists of 3 rows of 4 columns where the 4th column holds the translation.
   * The translations are relative to the `transformCenter` property.
   */
  readonly transforms: Float32Array;

  /** A point roughly in the center of the range of all of the instances, to which each instance's translation is relative.
   * This is used to reduce precision errors when transforming the instances in shader code.
   */
  readonly transformCenter: Point3d;

  /** If defined, an array of little-endian 24-bit unsigned integers containing the feature ID of each instance. */
  readonly featureIds?: Uint8Array;

  /**
   * If defined, as array of bytes (8 per instance) encoding the symbology overrides for each instance. The encoding matches that used by FeatureOverrides, though only the RGB, alpha, line weight, and line code are used.
   * @internal
   */
  readonly symbologyOverrides?: Uint8Array;
}

/** Options passed to [[RenderSystem.createGraphicBranch]].
 * @internal
 */
export interface GraphicBranchOptions {
  clipVolume?: RenderClipVolume;
  classifierOrDrape?: RenderPlanarClassifier | RenderTextureDrape;
  iModel?: IModelConnection;
}

/** An interface optionally exposed by a RenderSystem that allows control of various debugging features.
 * @beta
 */
export interface RenderSystemDebugControl {
  /** Destroy this system's webgl context. Returns false if this behavior is not supported. */
  loseContext(): boolean;
  /** Draw surfaces as "pseudo-wiremesh", using GL_LINES instead of GL_TRIANGLES. Useful for visualizing faces of a mesh. Not suitable for real wiremesh display. */
  drawSurfacesAsWiremesh: boolean;
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
  public createTriMesh(args: MeshArgs, instances?: InstancedGraphicParams): RenderGraphic | undefined {
    const params = MeshParams.create(args);
    return this.createMesh(params, instances);
  }

  /** @internal */
  public createIndexedPolylines(args: PolylineArgs, instances?: InstancedGraphicParams): RenderGraphic | undefined {
    if (args.flags.isDisjoint) {
      const pointStringParams = PointStringParams.create(args);
      return undefined !== pointStringParams ? this.createPointString(pointStringParams, instances) : undefined;
    } else {
      const polylineParams = PolylineParams.create(args);
      return undefined !== polylineParams ? this.createPolyline(polylineParams, instances) : undefined;
    }
  }

  /** @internal */
  public createMesh(_params: MeshParams, _instances?: InstancedGraphicParams): RenderGraphic | undefined { return undefined; }
  /** @internal */
  public createPolyline(_params: PolylineParams, _instances?: InstancedGraphicParams): RenderGraphic | undefined { return undefined; }
  /** @internal */
  public createPointString(_params: PointStringParams, _instances?: InstancedGraphicParams): RenderGraphic | undefined { return undefined; }
  /** @internal */
  public createPointCloud(_args: PointCloudArgs, _imodel: IModelConnection): RenderGraphic | undefined { return undefined; }
  /** @internal */
  public createSheetTilePolyfaces(_corners: Point3d[], _clip?: ClipVector): IndexedPolyface[] { return []; }
  /** @internal */
  public createSheetTile(_tile: RenderTexture, _polyfaces: IndexedPolyface[], _tileColor: ColorDef): GraphicList { return []; }
  /** @internal */
  public createClipVolume(_clipVector: ClipVector): RenderClipVolume | undefined { return undefined; }
  /** @internal */
  public createPlanarClassifier(_properties: SpatialClassificationProps.Classifier, _tileTree: TileTree, _classifiedTileTree: TileTree, _sceneContext: SceneContext): RenderPlanarClassifier | undefined { return undefined; }
  /** @internal */
  public createBackgroundMapDrape(_drapedTree: TileTree, _mapTree: BackgroundMapTileTreeReference, _heightRange?: Range1d): RenderTextureDrape | undefined { return undefined; }
  /** @internal */
  public getSolarShadowMap(_frustum: Frustum, _direction: Vector3d, _settings: SolarShadows.Settings, _view: SpatialViewState): RenderSolarShadowMap | undefined { return undefined; }
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

    const textureProps = elemProps[0];
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
  public get supportsLogZBuffer(): boolean { return true === this.options.logarithmicDepthBuffer; }

  /** Obtain an object that can be used to control various debugging features. Returns `undefined` if debugging features are unavailable for this `RenderSystem`.
   * @beta
   */
  public get debugControl(): RenderSystemDebugControl | undefined { return undefined; }
}

/** @internal */
export type WebGLExtensionName = "WEBGL_draw_buffers" | "OES_element_index_uint" | "OES_texture_float" | "OES_texture_float_linear" |
  "OES_texture_half_float" | "OES_texture_half_float_linear" | "EXT_texture_filter_anisotropic" | "WEBGL_depth_texture" |
  "EXT_color_buffer_float" | "EXT_shader_texture_lod" | "ANGLE_instanced_arrays" | "OES_vertex_array_object" | "WEBGL_lose_context" |
  "EXT_frag_depth";

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
     * Default value: false
     *
     * @beta
     */
    displaySolarShadows?: boolean;

    /** If the view frustum is sufficiently large, and the EXT_frag_depth WebGL extension is available, use a logarithmic depth buffer to improve depth buffer resolution. Framerate may degrade to an extent while the logarithmic depth buffer is in use. If this option is disabled, or the extension is not supported, the near and far planes of very large view frustums will instead be moved to reduce the draw distance.
     *
     * Default value: false
     *
     * @beta
     */
    logarithmicDepthBuffer?: boolean;
  }
}

/** Clip/Transform for a branch that are varied over time.
 * @internal
 */
export class AnimationBranchState {
  public readonly omit?: boolean;
  public readonly transform?: Transform;
  public readonly clip?: RenderClipVolume;
  constructor(transform?: Transform, clip?: RenderClipVolume, omit?: boolean) { this.transform = transform; this.clip = clip; this.omit = omit; }
}

/** Mapping from node/branch IDs to animation branch state
 * @internal
 */
export type AnimationBranchStates = Map<string, AnimationBranchState>;
