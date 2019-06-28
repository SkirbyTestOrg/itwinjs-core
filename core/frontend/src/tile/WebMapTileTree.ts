/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Tile */

import {
  assert,
  BentleyError,
  ClientRequestContext,
  compareNumbers,
  compareStrings,
  compareBooleans,
  IModelStatus,
  SortedArray,
} from "@bentley/bentleyjs-core";
import {
  TileTreeProps, TileProps, Cartographic, ImageSource, ImageSourceFormat, RenderTexture, EcefLocation,
  BackgroundMapSettings, BackgroundMapType, BackgroundMapProviderName, GeoCoordStatus,
} from "@bentley/imodeljs-common";
import { Range3dProps, Range3d, Range1d, TransformProps, Transform, Point3d, Point2d, Range2d, Vector3d, Angle, Plane3dByOriginAndUnitNormal, XYAndZ, XYZProps } from "@bentley/geometry-core";
import { TileLoader, TileTree } from "./TileTree";
import { Tile } from "./Tile";
import { TileRequest } from "./TileRequest";
import { request, Response, RequestOptions } from "@bentley/imodeljs-clients";
import { imageElementFromImageSource } from "../ImageUtil";
import { IModelApp } from "../IModelApp";
import { RenderSystem } from "../render/System";
import { IModelConnection } from "../IModelConnection";
import { DecorateContext, SceneContext } from "../ViewContext";
import { ScreenViewport, Viewport } from "../Viewport";
import { MessageBoxType, MessageBoxIconType } from "../NotificationManager";
import { GeoConverter } from "../GeoServices";
import { BingElevationProvider } from "./BingElevation";

// this interface is implemented in two ways:
// LinearTransformChildCreator is used when the range of the iModel is small, such as a building, when an approximation will work.
// GeoTransformChildCreator is used when the range is larger, as in a map. Then you must calculate the iModel coordinates more precisely from the lat/longs of the tile corners.
interface ChildCreator {
  getChildren(quadId: QuadId): Promise<WebMapTileProps[]>;
  onTilesSelected(): void;
}

// this is the simple version that is appropriate when the iModel covers a small area.
class LinearTransformChildCreator implements ChildCreator {
  public mercatorToDb: Transform;
  private _heightRange?: Range1d;

  constructor(private _iModel: IModelConnection, groundBias: number, private _heightProvider?: BingElevationProvider) {
    // calculate mercatorToDb.
    const ecefLocation: EcefLocation = _iModel.ecefLocation!;
    const dbToEcef = ecefLocation.getTransform();

    const projectCenter = Point3d.create(_iModel.projectExtents.center.x, _iModel.projectExtents.center.y, groundBias);
    const projectEast = Point3d.create(projectCenter.x + 1.0, projectCenter.y, groundBias);
    const projectNorth = Point3d.create(projectCenter.x, projectCenter.y + 1.0, groundBias);

    const mercatorOrigin = this.ecefToPixelFraction(dbToEcef.multiplyPoint3d(projectCenter));
    const mercatorX = this.ecefToPixelFraction(dbToEcef.multiplyPoint3d(projectEast));
    const mercatorY = this.ecefToPixelFraction(dbToEcef.multiplyPoint3d(projectNorth));

    const deltaX = Vector3d.createStartEnd(mercatorOrigin, mercatorX);
    const deltaY = Vector3d.createStartEnd(mercatorOrigin, mercatorY);

    const dbToMercator = Transform.createOriginAndMatrixColumns(mercatorOrigin, deltaX, deltaY, Vector3d.create(0.0, 0.0, 1.0)).multiplyTransformTransform(Transform.createTranslationXYZ(-projectCenter.x, -projectCenter.y, -groundBias));
    this.mercatorToDb = dbToMercator.inverse() as Transform;
  }

  // gets longitude in a number between 0 and 1, corresponding to the coordinate system of the tiles.
  private longitudeToPixelFraction(longitude: number) {
    return (longitude + Angle.piRadians) / Angle.pi2Radians;
  }

  // gets latitude in a number between 0 and 1, corresponding to the coordinate system of the tiles.
  private latitudeToPixelFraction(latitude: number) {
    const sinLatitude = Math.sin(latitude);
    return (0.5 - Math.log((1.0 + sinLatitude) / (1.0 - sinLatitude)) / (4.0 * Angle.piRadians));   // https://msdn.microsoft.com/en-us/library/bb259689.aspx
  }

  // gets the longitude and latitude into a point with coordinates between 0 and 1
  private ecefToPixelFraction(point: Point3d) {
    const cartoGraphic = Cartographic.fromEcef(point)!;
    return Point3d.create(this.longitudeToPixelFraction(cartoGraphic.longitude), this.latitudeToPixelFraction(cartoGraphic.latitude), 0.0);
  }

  // gets the corners of the tile in a number between 0 and 1.
  private getTileCorners(level: number, column: number, row: number): Point3d[] {
    const nTiles = (1 << level);
    const scale = 1.0 / nTiles;

    const corners: Point3d[] = [];             //    ----x----->
    corners.push(Point3d.create(scale * column, scale * row, 0.0));   //  | [0]     [1]
    corners.push(Point3d.create(scale * (column + 1), scale * row, 0.0));   //  y
    corners.push(Point3d.create(scale * column, scale * (row + 1), 0.0));   //  | [2]     [3]
    corners.push(Point3d.create(scale * (column + 1), scale * (row + 1), 0.0));   //  v
    return corners;
  }

  // Note: although there are only nine unique points, we don't bother with the optimization used in the
  // GeoTransformChildCreator because the calculation for each point is fast.
  public async getChildren(quadId: QuadId): Promise<WebMapTileProps[]> {
    const level = quadId.level + 1;
    const column = quadId.column * 2;
    const row = quadId.row * 2;
    if (!this._heightRange && this._heightProvider)
      this._heightRange = await this._heightProvider.getRange(this._iModel);

    const tileProps: WebMapTileProps[] = [];
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        // get them as LatLong
        const corners: Point3d[] = this.getTileCorners(level, column + i, row + j);

        // use the linear transform to get them into iModel Coordinates.
        this.mercatorToDb.multiplyPoint3dArrayInPlace(corners);

        const childId: string = level + "_" + (column + i) + "_" + (row + j);
        tileProps.push(new WebMapTileProps(childId, level, corners, this._heightRange));
      }
    }
    return Promise.resolve(tileProps);
  }

  public onTilesSelected() { }
}

function compareXYZ(lhs: XYAndZ, rhs: XYAndZ): number {
  let cmp = compareNumbers(lhs.x, rhs.x);
  if (0 === cmp) {
    cmp = compareNumbers(lhs.y, rhs.y);
    if (0 === cmp)
      cmp = compareNumbers(lhs.z, rhs.z);
  }

  return cmp;
}

// this is the simple version that is appropriate when the iModel covers a small area.
class GeoTransformChildCreator implements ChildCreator {
  // we are creating four children, so 16 corners, but only nine are unique:
  //   0       1       2
  //   +-------+-------+
  //   |      4|       |
  //  3+-------+-------+5
  //   |       |       |
  //   +-------+-------+
  //   6       7       8
  // (Also, we probably already have 0,2,6, and 8 in the cache.)
  private static _cornerList: number[][][] = [[[0, 1, 3, 4], [3, 4, 6, 7]], [[1, 2, 4, 5], [4, 5, 7, 8]]];
  private static _uniquePointPixels: number[][] = [[0, 0], [128, 0], [256, 0], [0, 128], [128, 128], [256, 128], [0, 256], [128, 256], [256, 256]];

  private _converter: GeoConverter;
  private _groundBias: number;
  private _linearChildCreator: LinearTransformChildCreator;
  // An array of points which need to be converted from geocoords to cartesian coords for loading of child tiles.
  // This is initialized by the first call to getChildrenProps() requiring geopoint conversion during selectTiles(), and reset to undefined after selectTiles() completes.
  private _request?: SortedArray<XYAndZ>;
  // A deferred Promise dispatched once tile selection completes, resolving when all geocoord conversion is complete.
  private _promise?: Promise<void>;

  private _heightRange?: Range1d;

  constructor(private _iModel: IModelConnection, groundBias: number, private _heightProvider?: BingElevationProvider) {
    this._converter = _iModel.geoServices.getConverter("WGS84");
    this._groundBias = groundBias;

    // a geographic transform doesn't work well outside a reasonable range, so use the linearChildCreator for the large-range tiles.
    this._linearChildCreator = new LinearTransformChildCreator(_iModel, groundBias, this._heightProvider);
  }

  public async getChildren(parentQuad: QuadId): Promise<WebMapTileProps[]> {
    const parentLevel = parentQuad.level;
    const parentColumn = parentQuad.column;
    const parentRow = parentQuad.row;

    // calculate the lat/long of the nine unique points:
    if (parentLevel < 6)
      return this._linearChildCreator.getChildren(parentQuad);

    const requestProps = new Array<XYZProps>(9);

    // we are passed the child level, and the top left corner column and row.
    const mapSize = 256 << parentLevel;
    const left = 256 * parentColumn;
    const top = 256 * parentRow;
    for (let iPoint = 0; iPoint < GeoTransformChildCreator._uniquePointPixels.length; ++iPoint) {
      const x = ((left + GeoTransformChildCreator._uniquePointPixels[iPoint][0]) / mapSize) - .5;
      const y = 0.5 - ((top + GeoTransformChildCreator._uniquePointPixels[iPoint][1]) / mapSize);
      requestProps[iPoint] = [
        360.0 * x,
        90.0 - 360.0 * Math.atan(Math.exp(-y * 2 * Math.PI)) / Math.PI,
        this._groundBias,
      ];
    }

    let cached = this._converter.getCachedIModelCoordinatesFromGeoCoordinates(requestProps);
    if (undefined !== cached.missing) {
      // Batch our missing points in with any others which may be needed during tile selection.
      // This promise will request the points needed by all tiles simultaneously and resolve when they are all available in the cache.
      await this.getPromise(cached.missing);

      // The points we need should all now be available in the cache.
      // ###TODO this is lazy - use the cached results from above; only query the converter for missing points
      cached = this._converter.getCachedIModelCoordinatesFromGeoCoordinates(requestProps);
      assert(undefined === cached.missing);
    }

    const iModelCoords = cached.result;

    // get the tileProps now that we have their geoCoords.
    const tileProps: WebMapTileProps[] = [];
    const level = parentLevel + 1;
    const column = parentColumn * 2;
    const row = parentRow * 2;
    for (let iCol = 0; iCol < 2; ++iCol) {
      for (let iRow = 0; iRow < 2; ++iRow) {
        const corners: Point3d[] = new Array<Point3d>(4);
        for (let iPoint = 0; iPoint < 4; ++iPoint) {
          const pointNum = GeoTransformChildCreator._cornerList[iCol][iRow][iPoint];
          const iModelCoord = iModelCoords[pointNum]!;
          assert(undefined !== iModelCoord);
          corners[iPoint] = Point3d.fromJSON(iModelCoord.p);
        }

        const childId: string = level + "_" + (column + iCol) + "_" + (row + iRow);
        if (this._heightProvider && !this._heightRange)
          this._heightRange = await this._heightProvider.getRange(this._iModel);

        tileProps.push(new WebMapTileProps(childId, level, corners, this._heightRange));
      }
    }

    return tileProps;
  }

  private async getPromise(geoPoints: XYZProps[]): Promise<void> {
    if (undefined === this._promise) {
      assert(undefined === this._request);
      const req = new SortedArray<XYAndZ>(compareXYZ);
      this._request = req;
      this._promise = Promise.resolve().then(async () => {
        // NB: At this point this._request and this._promise are undefined, or possibly pointing to different objects.
        await this._converter.getIModelCoordinatesFromGeoCoordinates(req.extractArray());
      });
    }

    assert(undefined !== this._request);
    for (const point of geoPoints)
      this._request!.insert(Point3d.fromJSON(point));

    return this._promise;
  }

  public onTilesSelected(): void {
    if (undefined === this._promise)
      return;

    assert(undefined !== this._request);
    this._promise = undefined;
    this._request = undefined;
  }
}

class QuadId {
  public level: number;
  public column: number;
  public row: number;
  public get isValid() { return this.level >= 0; }

  public constructor(stringId: string) {
    const idParts = stringId.split("_");
    if (3 !== idParts.length) {
      assert(false, "Invalid quadtree ID");
      this.level = this.row = this.column = -1;
      return;
    }

    this.level = parseInt(idParts[0], 10);
    this.column = parseInt(idParts[1], 10);
    this.row = parseInt(idParts[2], 10);
  }

  // get the lat long for pixels within this quadId.
  private pixelXYToLatLong(pixelX: number, pixelY: number): Point2d {
    const mapSize = 256 << this.level;
    const left = 256 * this.column;
    const top = 256 * this.row;
    const x = ((left + pixelX) / mapSize) - .5;
    const y = 0.5 - ((top + pixelY) / mapSize);
    const outPoint: Point2d = new Point2d(360.0 * x, 90.0 - 360.0 * Math.atan(Math.exp(-y * 2 * Math.PI)) / Math.PI);
    return outPoint;
  }

  // Not used in display - used only to tell whether this tile overlaps the range provided by a tile provider for attribution.
  public getLatLongRange(): Range2d {
    const lowerLeft = this.pixelXYToLatLong(0, 256);
    const upperRight = this.pixelXYToLatLong(256, 0);
    const range: Range2d = new Range2d();
    range.low = lowerLeft;
    range.high = upperRight;
    return range;
  }
}

class WebMapTileTreeProps implements TileTreeProps {
  /** The unique identifier of this TileTree within the iModel */
  public id: string = "";
  /** Metadata describing the tree's root Tile. */
  public rootTile: TileProps;
  /** Transform tile coordinates to iModel world coordinates. */
  public location: TransformProps;
  public yAxisUp = true;
  public isBackgroundMap = true;
  public maxTilesToSkip = 10;
  public constructor(groundBias: number) {
    const corners: Point3d[] = [];
    corners[0] = new Point3d(-10000000, -10000000, groundBias);
    corners[1] = new Point3d(-10000000, 10000000, groundBias);
    corners[2] = new Point3d(10000000, -10000000, groundBias);
    corners[3] = new Point3d(10000000, 10000000, groundBias);

    this.rootTile = new WebMapTileProps("0_0_0", 0, corners);
    this.location = Transform.createIdentity();
  }
}

class WebMapTileProps implements TileProps {
  public readonly contentId: string;
  public readonly range: Range3dProps;
  public readonly contentRange?: Range3dProps;  // not used for WebMap tiles.
  public readonly maximumSize: number;
  public readonly isLeaf: boolean = false;
  public readonly corners: Point3d[];

  constructor(thisId: string, level: number, corners: Point3d[], heightRange?: Range1d) {
    this.corners = corners;

    if (heightRange) {
      const range = Range3d.createArray(corners);
      range.low.z = heightRange.low;
      range.high.z = heightRange.high;
      this.range = range;
    } else
      this.range = Range3d.createArray(corners);

    this.contentId = thisId;
    this.maximumSize = (0 === level) ? 0.0 : 256;
  }
}

class WebMapTileLoader extends TileLoader {
  private _childTileCreator: ChildCreator;
  private _heightProvider?: BingElevationProvider;

  public get imageryProvider(): ImageryProvider {
    return this._imageryProvider;
  }

  constructor(private _imageryProvider: ImageryProvider, private _iModel: IModelConnection, groundBias: number, gcsConverterAvailable: boolean, applyTerrain: boolean) {
    super();
    const useLinearTransform: boolean = !gcsConverterAvailable || WebMapTileLoader.selectLinearChildCreator(_iModel);
    this._heightProvider = applyTerrain ? new BingElevationProvider() : undefined;
    if (useLinearTransform) {
      this._childTileCreator = new LinearTransformChildCreator(_iModel, groundBias, this._heightProvider);
    } else {
      this._childTileCreator = new GeoTransformChildCreator(_iModel, groundBias, this._heightProvider);
    }
  }

  private static selectLinearChildCreator(_iModel: IModelConnection) {
    const linearRangeSquared: number = _iModel.projectExtents.diagonal().magnitudeSquared();
    return linearRangeSquared < 1000.0 * 1000.00;  // if the range is greater than a kilometer, use the more exact but slower GCS method of generating the WebMap tile corners.
  }

  public tileRequiresLoading(params: Tile.Params): boolean {
    return 0.0 !== params.maximumSize;
  }

  public async getChildrenProps(parent: Tile): Promise<TileProps[]> {
    const quadId = new QuadId(parent.contentId);
    return this._childTileCreator.getChildren(quadId);
  }

  public async requestTileContent(tile: Tile, _isCanceled: () => boolean): Promise<TileRequest.Response> {
    const quadId = new QuadId(tile.contentId);
    return this._imageryProvider.loadTile(quadId.row, quadId.column, quadId.level);
  }

  public async loadTileContent(tile: Tile, data: TileRequest.ResponseData, isCanceled?: () => boolean): Promise<Tile.Content> {
    if (undefined === isCanceled)
      isCanceled = () => !tile.isLoading;

    assert(data instanceof ImageSource);
    const content: Tile.Content = {};
    const system = IModelApp.renderSystem;
    const texture = await this.loadTextureImage(data as ImageSource, this._iModel, system, isCanceled);
    if (undefined === texture)
      return content;

    // we put the corners property on WebMapTiles
    const corners = (tile as any).corners;
    if (undefined !== this._heightProvider) {
      const quadId = new QuadId(tile.contentId);
      content.graphic = await this._heightProvider.getGraphic(quadId.getLatLongRange(), corners, texture, system);
    } else {
      content.graphic = system.createTile(texture, corners);
    }

    return content;
  }

  private async loadTextureImage(imageSource: ImageSource, iModel: IModelConnection, system: RenderSystem, isCanceled: () => boolean): Promise<RenderTexture | undefined> {
    try {
      const textureParams = new RenderTexture.Params(undefined, RenderTexture.Type.TileSection);
      return imageElementFromImageSource(imageSource)
        .then((image) => isCanceled() ? undefined : system.createTextureFromImage(image, ImageSourceFormat.Png === imageSource.format, iModel, textureParams))
        .catch((_) => undefined);
    } catch (e) {
      return undefined;
    }
  }

  public get maxDepth(): number { return this._imageryProvider.maximumZoomLevel; }
  public get parentsAndChildrenExclusive(): boolean { return false; }
  public get priority(): Tile.LoadPriority { return Tile.LoadPriority.Background; }
  public processSelectedTiles(selected: Tile[], _args: Tile.DrawArgs): Tile[] {
    // Dispatch any requests for child tiles props (geo-coordination)
    this._childTileCreator.onTilesSelected();

    // Ensure lo-res tiles drawn before (therefore behind) hi-res tiles.
    // NB: Array.sort() sorts in-place and returns the input array - we're not making a copy.
    return selected.sort((lhs, rhs) => lhs.depth - rhs.depth);
  }
  public compareTilePriorities(lhs: Tile, rhs: Tile): number {
    // The default implementation prioritizes lower-resolution tiles. For maps, we want tiles closest to the camera to load first.
    // When the camera is ON, those will be the higher-resolution tiles - so invert the default behavior.
    // ###TODO: Compute actual distance from camera when camera is OFF.
    // NB: We never load higher-res children until the first displayable lowest-res tile is available - so we always have *something* to draw while awaiting hi-res tiles.
    return rhs.depth - lhs.depth;
  }
}

/** @internal */

/** @internal */
// Represents the service that is providing map tiles for Web Mercator models (background maps).
export abstract class ImageryProvider {
  protected _requestContext = new ClientRequestContext("");

  public abstract get tileWidth(): number;
  public abstract get tileHeight(): number;
  public abstract get minimumZoomLevel(): number;
  public abstract get maximumZoomLevel(): number;
  public abstract constructUrl(row: number, column: number, zoomLevel: number): string;
  public abstract getCopyrightMessage(tileProvider: MapTileTreeReference, viewport: ScreenViewport): HTMLElement | undefined;
  public abstract getCopyrightImage(tileProvider: MapTileTreeReference): HTMLImageElement | undefined;

  // initialize the subclass of ImageryProvider
  public abstract async initialize(): Promise<void>;

  // returns true if the tile data matches the tile data of a "missing tile". See BingImageryProvider.initialize.
  public matchesMissingTile(_tileData: Uint8Array): boolean {
    return false;
  }

  // returns a Uint8Array with the contents of the tile.
  public async loadTile(row: number, column: number, zoomLevel: number): Promise<ImageSource | undefined> {
    const tileUrl: string = this.constructUrl(row, column, zoomLevel);
    const tileRequestOptions: RequestOptions = { method: "GET", responseType: "arraybuffer" };
    try {
      const tileResponse: Response = await request(this._requestContext, tileUrl, tileRequestOptions);
      const byteArray: Uint8Array = new Uint8Array(tileResponse.body);
      if (!byteArray || (byteArray.length === 0))
        return undefined;
      if (this.matchesMissingTile(byteArray))
        return undefined;
      let imageFormat: ImageSourceFormat;
      switch (tileResponse.header["content-type"]) {
        case "image/jpeg":
          imageFormat = ImageSourceFormat.Jpeg;
          break;
        case "image/png":
          imageFormat = ImageSourceFormat.Png;
          break;
        default:
          assert(false, "Unknown image type");
          return undefined;
      }

      return new ImageSource(byteArray, imageFormat);
    } catch (error) {
      return undefined;
    }
  }

  public decorate(context: DecorateContext, tileProvider: MapTileTreeReference): void {
    const copyrightImage = this.getCopyrightImage(tileProvider);
    if (copyrightImage && 0 !== copyrightImage.naturalWidth && 0 !== copyrightImage.naturalHeight) {
      const position = new Point2d(0, (context.viewport.viewRect.height - copyrightImage.height));
      const drawDecoration = (ctx: CanvasRenderingContext2D) => {
        ctx.drawImage(copyrightImage, 0, 0, copyrightImage.width, copyrightImage.height);
      };
      context.addCanvasDecoration({ position, drawDecoration });
    }

    const copyrightMessage = this.getCopyrightMessage(tileProvider, context.screenViewport);
    if (copyrightMessage) {
      const decorationDiv = context.decorationDiv;
      decorationDiv.appendChild(copyrightMessage);
      const boundingRect = copyrightMessage.getBoundingClientRect();
      const style = copyrightMessage.style;
      style.display = "block";
      style.position = "absolute";
      style.left = (decorationDiv.clientWidth - (boundingRect.width + 15)) + "px";
      style.top = (decorationDiv.clientHeight - (boundingRect.height + 5)) + "px";
      style.color = "silver";
      style.backgroundColor = "transparent";
      style.pointerEvents = "initial";
      style.zIndex = "50";
    }
  }
}

/** this class provides a method for converting the tile row, column, and zoom level to the EPSG3857 cartesian coordinates that some
 * tile servers require. The getEPSG3857Extent method is usually used in the constructUrl method.
 * @internal
 */
export abstract class ImageryProviderEPSG3857 extends ImageryProvider {

  // calculates the projected x cartesian coordinate in EPSG:3857from the longitude in EPSG:4326 (WGS84)
  public getEPSG3857X(longitude: number): number {
    return longitude * 20037508.34 / 180.0;
  }

  // calculates the projected y cartesian coordinate in EPSG:3857from the latitude in EPSG:4326 (WGS84)
  public getEPSG3857Y(latitude: number): number {
    const y = Math.log(Math.tan((90.0 + latitude) * Math.PI / 360.0)) / (Math.PI / 180.0);
    return y * 20037508.34 / 180.0;
  }

  // Map tile providers like Bing and Mapbox allow the URL to be constructed directory from the zoomlevel and tile coordinates.
  // However, WMS-based servers take a bounding box instead. This method can help get that bounding box from a tile.
  public getEPSG3857Extent(row: number, column: number, zoomLevel: number): { left: number, right: number, top: number, bottom: number } {
    const mapSize = 256 << zoomLevel;
    const leftGrid = 256 * column;
    const topGrid = 256 * row;

    const longitudeLeft = 360 * ((leftGrid / mapSize) - 0.5);
    const y0 = 0.5 - ((topGrid + 256) / mapSize);
    const latitudeBottom = 90.0 - 360.0 * Math.atan(Math.exp(-y0 * 2 * Math.PI)) / Math.PI;

    const longitudeRight = 360 * (((leftGrid + 256) / mapSize) - 0.5);
    const y1 = 0.5 - (topGrid / mapSize);
    const latitudeTop = 90.0 - 360.0 * Math.atan(Math.exp(-y1 * 2 * Math.PI)) / Math.PI;

    const left = this.getEPSG3857X(longitudeLeft);
    const right = this.getEPSG3857X(longitudeRight);
    const bottom = this.getEPSG3857Y(latitudeBottom);
    const top = this.getEPSG3857Y(latitudeTop);

    return { left, right, bottom, top };
  }
}

// Represents one range of geography and tile zoom levels for a bing data provider
class Coverage {
  constructor(private _lowerLeftLongitude: number,
    private _lowerLeftLatitude: number,
    private _upperRightLongitude: number,
    private _upperRightLatitude: number,
    private _minimumZoomLevel: number,
    private _maximumZoomLevel: number) { }

  public overlaps(quadId: QuadId): boolean {
    const range: Range2d = quadId.getLatLongRange();
    if (quadId.level < this._minimumZoomLevel)
      return false;
    if (quadId.level > this._maximumZoomLevel)
      return false;
    if (range.low.x > this._upperRightLongitude)
      return false;
    if (range.low.y > this._upperRightLatitude)
      return false;
    if (range.high.x < this._lowerLeftLongitude)
      return false;
    if (range.high.y < this._lowerLeftLatitude)
      return false;

    return true;
  }
}

// Represents the copyright message and an array of coverage data for one of bing's data providers (HERE for example).
class BingAttribution {
  constructor(public copyrightMessage: string, private _coverages: Coverage[]) { }

  public matchesTile(tile: Tile): boolean {
    const quadId = new QuadId(tile.contentId);
    for (const coverage of this._coverages) {
      if (coverage.overlaps(quadId))
        return true;
    }
    return false;
  }
}

// in deployed applications, we can only make https requests, but the Bing Maps metadata request returns templates with "http:".
// This function fixes those.
function replaceHttpWithHttps(originalUrl: string) {
  return originalUrl.startsWith("http:") ? "https:".concat(originalUrl.slice(5)) : originalUrl;
}

// Our ImageryProvider for Bing Maps.
class BingImageryProvider extends ImageryProvider {
  private _urlTemplate?: string;
  private _urlSubdomains?: string[];
  private _logoUrl?: string;
  private _zoomMin: number;
  private _zoomMax: number;
  private _tileHeight: number;
  private _tileWidth: number;
  private _attributions?: BingAttribution[]; // array of Bing's data providers.
  private _missingTileData?: Uint8Array;
  private _logoImage?: HTMLImageElement;
  public readonly mapType: BackgroundMapType;

  constructor(mapType: BackgroundMapType) {
    super();
    this.mapType = mapType;
    this._zoomMin = this._zoomMax = 0;
    this._tileHeight = this._tileWidth = 0;
  }

  public get tileWidth(): number { return this._tileWidth; }
  public get tileHeight(): number { return this._tileHeight; }
  public get minimumZoomLevel(): number { return this._zoomMin; }
  public get maximumZoomLevel(): number { return this._zoomMax; }

  private tileXYToQuadKey(tileX: number, tileY: number, zoomLevel: number) {
    // from C# example in bing documentation https://msdn.microsoft.com/en-us/library/bb259689.aspx
    let quadKey: string = "";

    // Root tile is not displayable. Returns 0 for _GetMaximumSize(). Should not end up here.
    assert(0 !== zoomLevel);

    for (let i: number = zoomLevel; i > 0; i--) {
      let digit: number = 0x30; // '0'
      const mask: number = 1 << (i - 1);
      if ((tileX & mask) !== 0) {
        digit++;
      }
      if ((tileY & mask) !== 0) {
        digit++;
        digit++;
      }
      quadKey = quadKey.concat(String.fromCharCode(digit));
    }
    return quadKey;
  }

  // construct the Url from the desired Tile
  public constructUrl(row: number, column: number, zoomLevel: number): string {
    // From the tile, get a "quadKey" the Microsoft way.
    const quadKey: string = this.tileXYToQuadKey(column, row, zoomLevel);
    const subdomain: string = this._urlSubdomains![(row + column) % this._urlSubdomains!.length];

    // from the template url, construct the tile url.
    let url: string = this._urlTemplate!.replace("{subdomain}", subdomain);
    url = url.replace("{quadkey}", quadKey);

    return url;
  }

  // gets the attributions that match the tile set.
  private getMatchingAttributions(tiles: Tile[]): BingAttribution[] {
    const matchingAttributions: BingAttribution[] = new Array<BingAttribution>();
    if (!this._attributions)
      return matchingAttributions;

    const unmatchedSet: BingAttribution[] = this._attributions.slice();
    for (const tile of tiles) {
      // compare to the set of Bing attributions that we have not yet matched.
      for (let iAttr = 0; iAttr < unmatchedSet.length; iAttr++) {
        const attribution = unmatchedSet[iAttr];
        if (attribution && attribution.matchesTile(tile)) {
          matchingAttributions.push(attribution);
          delete unmatchedSet[iAttr];
        }
      }
    }
    return matchingAttributions;
  }

  private showAttributions(tileProvider: MapTileTreeReference, viewport: ScreenViewport, event: MouseEvent) {
    // our "this" is the BingImageryProvider for which we want to show the data provider attribution.
    // We need to get the tiles that are used in the view.
    event.stopPropagation();
    const tiles: Tile[] = tileProvider.getTilesForView(viewport);
    const matchingAttributions: BingAttribution[] = this.getMatchingAttributions(tiles);
    let dataString: string = IModelApp.i18n.translate("iModelJs:BackgroundMap.BingDataAttribution");
    for (const match of matchingAttributions) {
      dataString = dataString.concat("<li>", match.copyrightMessage, "</li>");
    }
    IModelApp.notifications.openMessageBox(MessageBoxType.LargeOk, dataString, MessageBoxIconType.Information); // tslint:disable-line:no-floating-promises
  }

  public getCopyrightImage(_tileProvider: MapTileTreeReference): HTMLImageElement | undefined { return this._logoImage; }

  public getCopyrightMessage(tileProvider: MapTileTreeReference, viewport: ScreenViewport): HTMLElement | undefined {
    const copyrightElement: HTMLSpanElement = document.createElement("span");
    copyrightElement.className = "bgmap-copyright";
    copyrightElement.onclick = this.showAttributions.bind(this, tileProvider, viewport);
    // stop propagation of all mouse related events so they don't go through to the view.
    copyrightElement.onmousemove = (event: MouseEvent) => { event.stopPropagation(); };
    copyrightElement.onmouseenter = (event: MouseEvent) => { event.stopPropagation(); };
    copyrightElement.onmouseout = (event: MouseEvent) => { event.stopPropagation(); };
    copyrightElement.onmousedown = (event: MouseEvent) => { event.stopPropagation(); };
    copyrightElement.onmouseup = (event: MouseEvent) => { event.stopPropagation(); };
    copyrightElement.innerText = IModelApp.i18n.translate("iModelJs:BackgroundMap.BingDataClickTarget");
    copyrightElement.style.textDecoration = "underline";
    copyrightElement.style.cursor = "pointer";
    return copyrightElement;
  }

  public matchesMissingTile(tileData: Uint8Array): boolean {
    if (!this._missingTileData)
      return false;
    if (tileData.length !== this._missingTileData.length)
      return false;
    for (let i: number = 0; i < tileData.length; i += 10) {
      if (this._missingTileData[i] !== tileData[i]) {
        return false;
      }
    }
    return true;
  }

  // initializes the BingImageryProvider by reading the templateUrl, logo image, and attribution list.
  public async initialize(): Promise<void> {
    // get the template url
    // NEEDSWORK - should get bing key from server.
    const bingKey = "AtaeI3QDNG7Bpv1L53cSfDBgBKXIgLq3q-xmn_Y2UyzvF-68rdVxwAuje49syGZt";

    let imagerySet = "Road";
    if (BackgroundMapType.Aerial === this.mapType)
      imagerySet = "Aerial";
    else if (BackgroundMapType.Hybrid === this.mapType)
      imagerySet = "AerialWithLabels";

    let bingRequestUrl: string = "https://dev.virtualearth.net/REST/v1/Imagery/Metadata/{imagerySet}?o=json&incl=ImageryProviders&key={bingKey}";
    bingRequestUrl = bingRequestUrl.replace("{imagerySet}", imagerySet);
    bingRequestUrl = bingRequestUrl.replace("{bingKey}", bingKey);
    const requestOptions: RequestOptions = {
      method: "GET",
    };

    try {
      const response: Response = await request(this._requestContext, bingRequestUrl, requestOptions);
      const bingResponseProps: any = response.body;
      this._logoUrl = replaceHttpWithHttps(bingResponseProps.brandLogoUri);

      const thisResourceSetProps = bingResponseProps.resourceSets[0];
      const thisResourceProps = thisResourceSetProps.resources[0];
      this._zoomMin = thisResourceProps.zoomMin;
      this._zoomMax = thisResourceProps.zoomMax;
      this._tileHeight = thisResourceProps.imageHeight;
      this._tileWidth = thisResourceProps.imageWidth;
      this._urlTemplate = replaceHttpWithHttps(thisResourceProps.imageUrl.replace("{culture}", "en-US")); // NEEDSWORK - get locale from somewhere.
      this._urlSubdomains = thisResourceProps.imageUrlSubdomains;
      // read the list of Bing's data suppliers and the range of data they provide. Used in calculation of copyright message.
      this.readAttributions(thisResourceProps.imageryProviders);

      // read the Bing logo data, used in getCopyrightImage
      if (undefined !== this._logoUrl && 0 < this._logoUrl.length) {
        this._logoImage = new Image();
        this._logoImage.src = this._logoUrl;
      }

      // Bing sometimes provides tiles that have nothing but a stupid camera icon in the middle of them when you ask
      // for tiles at zoom levels where they don't have data. Their application stops you from zooming in when that's the
      // case, but we can't stop - the user might want to look at design data a closer zoom. So we intentionally load such
      // a tile, and then compare other tiles to it, rejecting them if they match.
      this.loadTile(0, 0, this._zoomMax - 1).then((tileData: ImageSource | undefined) => { // tslint:disable-line:no-floating-promises
        if (tileData !== undefined) this._missingTileData = tileData.data as Uint8Array;
      });
    } catch (error) {
      throw new BentleyError(IModelStatus.BadModel, "Error in Bing Server communications");
    }
  }

  // reads the list of Bing data providers and the map range for which they each provide data.
  private readAttributions(attributionProps: any) {
    for (const thisAttributionProps of attributionProps) {
      const copyrightMessage: string = thisAttributionProps.attribution;
      const coverages: Coverage[] = new Array<Coverage>();
      for (const thisCoverageProps of thisAttributionProps.coverageAreas) {
        const thisCoverage = new Coverage(thisCoverageProps.bbox[0], thisCoverageProps.bbox[1], thisCoverageProps.bbox[2], thisCoverageProps.bbox[3],
          thisCoverageProps.zoomMin, thisCoverageProps.zoomMax);
        coverages.push(thisCoverage);
      }
      const thisAttribution: BingAttribution = new BingAttribution(copyrightMessage, coverages);
      if (!this._attributions)
        this._attributions = new Array<BingAttribution>();
      this._attributions.push(thisAttribution);
    }
  }
}

class MapBoxImageryProvider extends ImageryProvider {
  private _zoomMin: number;
  private _zoomMax: number;
  private _baseUrl: string;

  constructor(mapType: BackgroundMapType) {
    super();
    this._zoomMin = 1; this._zoomMax = 20;
    switch (mapType) {
      case BackgroundMapType.Street:
        this._baseUrl = "https://api.mapbox.com/v4/mapbox.streets/";
        break;

      case BackgroundMapType.Aerial:
        this._baseUrl = "https://api.mapbox.com/v4/mapbox.satellite/";
        break;

      case BackgroundMapType.Hybrid:
        this._baseUrl = "https://api.mapbox.com/v4/mapbox.streets-satellite/";
        break;

      default:
        this._baseUrl = "";
        assert(false);
    }
  }

  public get tileWidth(): number { return 256; }
  public get tileHeight(): number { return 256; }
  public get minimumZoomLevel(): number { return this._zoomMin; }
  public get maximumZoomLevel(): number { return this._zoomMax; }

  // construct the Url from the desired Tile
  public constructUrl(row: number, column: number, zoomLevel: number): string {

    // from the template url, construct the tile url.
    let url: string = this._baseUrl.concat(zoomLevel.toString());
    url = url.concat("/").concat(column.toString()).concat("/").concat(row.toString());
    url = url.concat(".jpg80?access_token=pk%2EeyJ1IjoibWFwYm94YmVudGxleSIsImEiOiJjaWZvN2xpcW00ZWN2czZrcXdreGg2eTJ0In0%2Ef7c9GAxz6j10kZvL%5F2DBHg");

    return url;
  }

  public getCopyrightImage(_tileProvider: MapTileTreeReference): HTMLImageElement | undefined { return undefined; }

  public getCopyrightMessage(_tileProvider: MapTileTreeReference, _viewport: ScreenViewport): HTMLElement | undefined {
    const copyrightElement: HTMLSpanElement = document.createElement("span");
    copyrightElement.innerText = IModelApp.i18n.translate("IModelJs:BackgroundMap.MapBoxCopyright");
    copyrightElement.className = "bgmap-copyright";
    return copyrightElement;
  }

  // no initialization needed for MapBoxImageryProvider.
  public async initialize(): Promise<void> { }
}

/** Methods and properties common to both BackgroundMapProviders and OverlayMapProviders
 * @internal
 */
interface BackgroundMapTreeId {
  providerName: BackgroundMapProviderName;
  mapType: BackgroundMapType;
  groundBias: number;
  applyTerrain: boolean;
}

class BackgroundMapTreeSupplier implements TileTree.Supplier {
  public compareTileTreeIds(lhs: BackgroundMapTreeId, rhs: BackgroundMapTreeId): number {
    let cmp = compareStrings(lhs.providerName, rhs.providerName);
    if (0 === cmp) {
      cmp = compareNumbers(lhs.mapType, rhs.mapType);
      if (0 === cmp) {
        cmp = compareNumbers(lhs.groundBias, rhs.groundBias);
        if (0 === cmp)
          cmp = compareBooleans(lhs.applyTerrain, rhs.applyTerrain);
      }
    }

    return cmp;
  }

  public async createTileTree(id: BackgroundMapTreeId, iModel: IModelConnection): Promise<TileTree | undefined> {
    // ###TODO: Doesn't seem like each tile tree should need its own imagery provider instance...
    let imageryProvider;
    switch (id.providerName) {
      case "BingProvider":
        imageryProvider = new BingImageryProvider(id.mapType);
        break;
      case "MapBoxProvider":
        imageryProvider = new MapBoxImageryProvider(id.mapType);
        break;
    }

    if (undefined === imageryProvider)
      return undefined;

    return createTileTreeFromImageryProvider(imageryProvider, id.groundBias, id.applyTerrain, iModel);
  }
}

const backgroundMapTreeSupplier = new BackgroundMapTreeSupplier();

/** Better if folks implement their own TileTree.Supplier which can share tiles... */
class ImageryTreeSupplier implements TileTree.Supplier {
  public readonly provider: ImageryProvider;

  public constructor(provider: ImageryProvider) {
    this.provider = provider;
  }

  public compareTileTreeIds(lhs: number, rhs: number) { return compareNumbers(lhs, rhs); }

  public async createTileTree(groundBias: number, iModel: IModelConnection): Promise<TileTree | undefined> {
    return createTileTreeFromImageryProvider(this.provider, groundBias, false, iModel);
  }
}

/** @internal */
// Represents the service that is providing map tiles for Web Mercator models (background maps).
export async function createTileTreeFromImageryProvider(imageryProvider: ImageryProvider, groundBias: number, applyTerrain: boolean, iModel: IModelConnection): Promise<TileTree | undefined> {
  if (undefined === iModel.ecefLocation)
    return undefined;

  await imageryProvider.initialize();

  // Determine if we have a usable GCS.
  const converter = iModel.geoServices.getConverter("WGS84");
  const requestProps: XYZProps[] = [{ x: 0, y: 0, z: 0 }];
  let haveConverter;
  try {
    const responseProps = await converter.getIModelCoordinatesFromGeoCoordinates(requestProps);
    haveConverter = responseProps.iModelCoords.length === 1 && responseProps.iModelCoords[0].s !== GeoCoordStatus.NoGCSDefined;
  } catch (_) {
    haveConverter = false;
  }

  const loader = new WebMapTileLoader(imageryProvider, iModel, groundBias, haveConverter, applyTerrain);
  const tileTreeProps = new WebMapTileTreeProps(groundBias);
  return new TileTree(TileTree.paramsFromJSON(tileTreeProps, iModel, true, loader, ""));
}

/** A reference to a TileTree used for drawing tiled map graphics into a Viewport.
 * @internal
 */
export abstract class MapTileTreeReference extends TileTree.Reference {
  private _plane?: {
    plane: Plane3dByOriginAndUnitNormal,
    height: number,
  };

  protected abstract get _groundBias(): number;
  protected abstract get _graphicType(): TileTree.GraphicType;
  protected abstract get _imageryProvider(): ImageryProvider | undefined;

  public get plane(): Plane3dByOriginAndUnitNormal {
    const height = this._groundBias;
    if (undefined === this._plane || this._plane.height !== height)
      this._plane = { height, plane: Plane3dByOriginAndUnitNormal.createXYPlane(new Point3d(0, 0, height)) };

    return this._plane.plane;
  }

  /** Map tiles do not contribute to the range used by "fit view". */
  public unionFitRange(_range: Range3d): void { }

  /** Select the tiles that would be displayed in the viewport. */
  public getTilesForView(viewport: Viewport): Tile[] {
    let tiles: Tile[] = [];
    const tree = this.treeOwner.tileTree;
    if (undefined !== tree) {
      const sceneContext = viewport.createSceneContext();
      sceneContext.withGraphicTypeAndPlane(this._graphicType, this.plane, () => tiles = tree.selectTilesForScene(sceneContext));
    }

    return tiles;
  }

  /** Add copyright info to the viewport. */
  public decorate(context: DecorateContext): void {
    const provider = this._imageryProvider;
    if (undefined !== provider)
      provider.decorate(context, this);
  }

  /** Draw the tiles into the viewport. */
  public addToScene(context: SceneContext): void {
    const tree = this.treeOwner.load();
    if (undefined !== tree)
      context.withGraphicTypeAndPlane(this._graphicType, this.plane, () => tree.drawScene(context));
  }
}

/** A reference to a TileTree used for drawing a background map. To change the type of tiles drawn simply modify the `settings` property.
 * @internal
 */
export class BackgroundMapTileTreeReference extends MapTileTreeReference {
  public settings: BackgroundMapSettings;
  private readonly _iModel: IModelConnection;
  private readonly _forDrape: boolean;

  public constructor(settings: BackgroundMapSettings, iModel: IModelConnection, forDrape = false) {
    super();
    this.settings = settings;
    this._iModel = iModel;
    this._forDrape = forDrape;
  }

  public get treeOwner(): TileTree.Owner {
    const id = {
      providerName: this.settings.providerName,
      mapType: this.settings.mapType,
      groundBias: this.settings.groundBias,
      applyTerrain: !this._forDrape && this.settings.applyTerrain,
    };

    return this._iModel.tiles.getTileTreeOwner(id, backgroundMapTreeSupplier);
  }

  protected get _groundBias() { return this.settings.groundBias; }
  protected get _graphicType() { return TileTree.GraphicType.BackgroundMap; }
  protected get _imageryProvider(): ImageryProvider | undefined {
    const tree = this.treeOwner.tileTree;
    return undefined !== tree ? (tree.loader as WebMapTileLoader).imageryProvider : undefined;
  }
}

/** A specialization of MapTileTreeReference associated with a specific ImageryProvider. Provided mostly as a convenience.
 * The ImageryProvider, graphic type, and/or ground bias can be changed to cause different tiles to be displayed.
 * @internal
 */
export class MapImageryTileTreeReference extends MapTileTreeReference {
  public groundBias: number;
  public applyTerrain: boolean;
  public provider: ImageryProvider;
  public graphicType: TileTree.GraphicType;
  protected readonly _iModel: IModelConnection;
  private _supplier: ImageryTreeSupplier;

  public constructor(imageryProvider: ImageryProvider, groundBias: number, applyTerrain: boolean, iModel: IModelConnection, graphicType: TileTree.GraphicType = TileTree.GraphicType.Overlay) {
    super();
    this.groundBias = groundBias;
    this.applyTerrain = applyTerrain;
    this.provider = imageryProvider;
    this.graphicType = graphicType;
    this._iModel = iModel;
    this._supplier = new ImageryTreeSupplier(imageryProvider);
  }

  public get treeOwner(): TileTree.Owner {
    if (this.provider !== this._supplier.provider)
      this._supplier = new ImageryTreeSupplier(this.provider);

    return this._iModel.tiles.getTileTreeOwner(this.groundBias, this._supplier);
  }

  protected get _groundBias() { return this.groundBias; }
  protected get _graphicType() { return this.graphicType; }
  protected get _imageryProvider() { return this.provider; }
}
