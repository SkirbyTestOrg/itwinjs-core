/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { IModelConnection } from "../IModelConnection";
import {
  Transform,
  Point3d,
  Point2d,
  Range3d,
  Arc3d,
  Polyface,
  StrokeOptions,
} from "@bentley/geometry-core";
import {
  AreaPattern,
  ColorDef,
  GraphicParams,
  GeometryParams,
  LinePixels,
  LineStyle,
} from "@bentley/imodeljs-common";
import { Viewport } from "../Viewport";
import { RenderGraphic } from "./System";

/**
 * Describes the type of a RenderGraphic. Used when creating a GraphicBuilder to specify the purpose of the RenderGraphic.
 * For RenderGraphics like overlays and view background for which depth testing is disabled:
 *  - The individual geometric primitives are rendered in the order in which they were defined in the GraphicBuilder; and
 *  - The individual RenderGraphics within the DecorationList are rendered in the order in which they appear in the list.
 */
export const enum GraphicType {
  /** Renders behind all other graphics. Coordinates: view. RenderMode: smooth. Lighting: none. Z-testing: disabled. */
  ViewBackground,
  /** Renders as if it were part of the scene. Coordinates: world. RenderMode: from view. Lighting: from view. Z-testing: enabled. */
  /** Used for the scene itself, dynamics, and 'normal' decorations. */
  Scene,
  /** Renders within the scene. Coordinates: world. RenderMode: smooth. Lighting: default. Z-testing: enabled */
  WorldDecoration,
  /**
   * Renders atop the scene. Coordinates: world. RenderMode: smooth. Lighting: none. Z-testing: disabled
   * Used for things like the ACS triad and the grid.
   */
  WorldOverlay,
  /**
   * Renders atop the scene. Coordinates: view. RenderMode: smooth. Lighting: none. Z-testing: disabled
   * Used for things like the locate circle.
   */
  ViewOverlay,
}

export abstract class Iterable<T> {
  constructor(protected list: T[]) { }
  public [Symbol.iterator]() {
    let key = 0;
    return { next: (): IteratorResult<T> => { const result = key < this.list.length ? { value: this.list[key], done: false } : { value: this.list[key - 1], done: true }; key++; return result; } };
  }
}

export class GraphicBuilderTileCorners extends Iterable<Point3d> {
  constructor(public pts: [Point3d, Point3d, Point3d, Point3d]) { super(pts); }
}

const identityTransform = Transform.createIdentity();
Object.freeze(identityTransform);

/** Parameters used to construct a GraphicBuilder. */
export class GraphicBuilderCreateParams {

  public get placement(): Transform { return this._placement; }
  public set placement(tf: Transform) { this._placement.setFrom(tf); }

  public get isViewCoordinates(): boolean { return this.type === GraphicType.ViewBackground || this.type === GraphicType.ViewOverlay; }
  public get isWorldCoordinates(): boolean { return !this.isViewCoordinates; }
  public get isSceneGraphic(): boolean { return this.type === GraphicType.Scene; }
  public get isViewBackground(): boolean { return this.type === GraphicType.ViewBackground; }
  public get isOverlay(): boolean { return this.type === GraphicType.ViewOverlay || this.type === GraphicType.WorldOverlay; }

  private readonly _placement: Transform;
  public readonly type: GraphicType;
  public readonly viewport: Viewport;
  public get iModel(): IModelConnection { return this.viewport.iModel; }

  constructor(placement: Transform = identityTransform, type: GraphicType, viewport: Viewport) {
    this._placement = placement;
    this.type = type;
    this.viewport = viewport;
  }

  /**
   * consolidates viewport and imodel parameters, as we would always want to use the imodel of the viewport if the viewport was passed
   */
  public static create(type: GraphicType, vp: Viewport, placement?: Transform): GraphicBuilderCreateParams {
    return new GraphicBuilderCreateParams(placement, type, vp);
  }

  /**
   * Create params for a graphic in world coordinates, not necessarily associated with any viewport.
   * When an iModel parameter is given, this function is chiefly used for tile generation code as the tolerance for faceting the graphic's geometry is independent of any viewport.
   * When an iModel parameter is not given, this function is chiefly used for code which produces 'normal' decorations and dynamics.
   * If this function is used outside of tile generation context, a default coarse tolerance will be used.
   * To get a tolerance appropriate to a viewport, use the overload accepting a Viewport.
   */
  public static scene(vp: Viewport, placement?: Transform) {
    return new GraphicBuilderCreateParams(placement, GraphicType.Scene, vp);
  }

  /**
   * Create params for a subgraphic
   */
  public subGraphic(placement?: Transform): GraphicBuilderCreateParams {
    return new GraphicBuilderCreateParams(placement, this.type, this.viewport);
  }

  /**
   * Create params for a WorldDecoration-type RenderGraphic
   * The faceting tolerance will be computed from the finished graphic's range and the viewport.
   */
  public static worldDecoration(vp: Viewport, placement?: Transform): GraphicBuilderCreateParams {
    return new GraphicBuilderCreateParams(placement, GraphicType.WorldDecoration, vp);
  }

  /**
   * Create params for a WorldOverlay-type RenderGraphic
   * The faceting tolerance will be computed from the finished graphic's range and the viewport.
   */
  public static worldOverlay(vp: Viewport, placement?: Transform): GraphicBuilderCreateParams {
    return new GraphicBuilderCreateParams(placement, GraphicType.WorldOverlay, vp);
  }

  /**
   * Create params for a ViewOverlay-type RenderGraphic
   */
  public static viewOverlay(vp: Viewport, placement?: Transform): GraphicBuilderCreateParams {
    return new GraphicBuilderCreateParams(placement, GraphicType.ViewOverlay, vp);
  }
}

/** Exposes methods for constructing a RenderGraphic from geometric primitives. */
export abstract class GraphicBuilder {
  protected _isOpen: boolean = false;

  /**
   * Get/Set the current GeometryStreamEntryId, which identifies the graphics that are currently being drawn.
   * Separated from _streamId to allow child classes to override the logic involved in setting the streamId
   */
  public get isOpen(): boolean { return this._isOpen; }
  public get iModel(): IModelConnection { return this.createParams.iModel; }
  public get localToWorldTransform(): Transform { return this.createParams.placement; }
  public get viewport(): Viewport { return this.createParams.viewport!; }
  public get isWorldCoordinates(): boolean { return this.createParams.isWorldCoordinates; }
  public get isViewCoordinates(): boolean { return this.createParams.isViewCoordinates; }

  constructor(public readonly createParams: GraphicBuilderCreateParams) { }

  /** IFacetOptions => StrokeOptions */
  public wantStrokeLineStyle(_symb: LineStyle.Info, _facetOptions: StrokeOptions): boolean { return true; }

  public wantStrokePattern(_pattern: AreaPattern.Params): boolean { return true; }

  // public abstract wantPreBakedBody(body: IBRepEntityCR): boolean;
  public abstract _finish(): RenderGraphic | undefined;
  public finish(): RenderGraphic | undefined { return this.isOpen ? this._finish() : undefined; }

  /**
   * Set a GraphicParams to be the "active" GraphicParams for this RenderGraphic.
   * @param graphicParams The new active GraphicParams. All geometry drawn via calls to this RenderGraphic will use them
   * @param geomParams The source GeometryParams if graphicParams was created by cooking geomParams, nullptr otherwise.
   */
  public abstract activateGraphicParams(graphicParams: GraphicParams, geomParams?: GeometryParams): void;

  /**
   * Draw a 3D line string.
   * @param points Array of vertices in the line string.
   */
  public abstract addLineString(points: Point3d[]): void;

  /** Helper for adding a series of line strings */
  public addLineStrings(...lines: Array<[number, Point3d[]]>): void { this.convertToLineStringParams(...lines).forEach((l) => this.addLineString(l.points)); }

  /** Helper for converting an array of string param data each of which are stored as array into an array of line string params */
  public convertToLineStringParams(...lines: Array<[number, Point3d[]]>): Array<{ numPoints: number, points: Point3d[] }> { return lines.map((l) => ({ numPoints: l[0], points: l[1] })); }

  /**
   * Draw a 2D line string.
   * @param points Array of vertices in the line string.
   * @param zDepth Z depth value in local coordinates.
   */
  public abstract addLineString2d(points: Point2d[], zDepth: number): void;

  /**
   * Draw a 3D point string. A point string is displayed as a series of points, one at each vertex in the array, with no vectors connecting the vertices.
   * @param numPoints Number of vertices in points array.
   * @param points Array of vertices in the point string.
   */
  public abstract addPointString(numPoints: number, points: Point3d[]): void;

  /**
   * Draw a 2D point string. A point string is displayed as a series of points, one at each vertex in the array, with no vectors connecting the vertices.
   * @param numPoints Number of vertices in points array.
   * @param points Array of vertices in the point string.
   * @param zDepth Z depth value.
   */
  public abstract addPointString2d(numPoints: number, points: Point2d[], zDepth: number): void;

  /**
   *  Draw a closed 3D shape.
   * @param numPoints Number of vertices in \c points array. If the last vertex in the array is not the same as the first vertex, an
   *  additional vertex will be added to close the shape.
   * @param points Array of vertices of the shape.
   * @param filled If true, the shape will be drawn filled.
   */
  public abstract addShape(numPoints: number, points: Point3d[], filled: boolean): void;

  /**
   * Draw a 2D shape.
   * @param numPoints Number of vertices in \c points array. If the last vertex in the array is not the same as the first vertex, an
   * additional vertex will be added to close the shape.
   * @param points Array of vertices of the shape.
   * @param zDepth Z depth value.
   * @param filled If true, the shape will be drawn filled.
   */
  public abstract addShape2d(numPoints: number, points: Point2d[], filled: boolean, zDepth: number): void;

  /**
   * Draw a 3D elliptical arc or ellipse.
   * @param ellipse arc data.
   * @param isEllipse If true, and if full sweep, then draw as an ellipse instead of an arc.
   * @param filled If true, and isEllipse is also true, then draw ellipse filled.
   */
  public abstract addArc(ellipse: Arc3d, isEllipse: boolean, filled: boolean): void;

  /**
   * Draw a 2D elliptical arc or ellipse.
   * @param ellipse arc data.
   * @param isEllipse If true, and if full sweep, then draw as an ellipse instead of an arc.
   * @param filled If true, and isEllipse is also true, then draw ellipse filled.
   * @param zDepth Z depth value
   */
  public abstract addArc2d(ellipse: Arc3d, isEllipse: boolean, filled: boolean, zDepth: number): void;

  /** @note Wireframe fill display supported for non-illuminated meshes. */
  public abstract addPolyface(meshData: Polyface, filled: boolean): void;

  /** Add DRange3d edges */
  public addRangeBox(range: Range3d) {
    const p: Point3d[] = [];
    for (let i = 0; i < 8; ++i) p[i] = new Point3d();

    p[0].x = p[3].x = p[4].x = p[5].x = range.low.x;
    p[1].x = p[2].x = p[6].x = p[7].x = range.high.x;
    p[0].y = p[1].y = p[4].y = p[7].y = range.low.y;
    p[2].y = p[3].y = p[5].y = p[6].y = range.high.y;
    p[0].z = p[1].z = p[2].z = p[3].z = range.low.z;
    p[4].z = p[5].z = p[6].z = p[7].z = range.high.z;

    const tmpPts: Point3d[] = [];
    tmpPts[0] = p[0]; tmpPts[1] = p[1]; tmpPts[2] = p[2];
    tmpPts[3] = p[3]; tmpPts[4] = p[5]; tmpPts[5] = p[6];
    tmpPts[6] = p[7]; tmpPts[7] = p[4]; tmpPts[8] = p[0];

    this.addLineStrings([9, tmpPts], [2, [p[0], p[3]]], [2, [p[4], p[5]]], [2, [p[1], p[7]]], [2, [p[2], p[6]]]);
  }

  /**
   * Set symbology for decorations that are only used for display purposes. Pickable decorations require a category, must initialize
   * a GeometryParams and cook it into a GraphicParams to have a locatable decoration.
   */
  public setSymbology(lineColor: ColorDef, fillColor: ColorDef, lineWidth: number, linePixels = LinePixels.Solid) {
    this.activateGraphicParams(GraphicParams.fromSymbology(lineColor, fillColor, lineWidth, linePixels));
  }

  /**
   * Set blanking fill symbology for decorations that are only used for display purposes. Pickable decorations require a category, must initialize
   * a GeometryParams and cook it into a GraphicParams to have a locatable decoration.
   */
  public setBlankingFill(fillColor: ColorDef) { this.activateGraphicParams(GraphicParams.FromBlankingFill(fillColor)); }
}
