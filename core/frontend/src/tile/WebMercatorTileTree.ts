/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Tile */

import { assert, ActivityLoggingContext, Guid } from "@bentley/bentleyjs-core";
import { TileTreeProps, TileProps, Cartographic, ImageSource, ImageSourceFormat, RenderTexture, EcefLocation, BackgroundMapType, BackgroundMapProps } from "@bentley/imodeljs-common";
import { JsonUtils } from "@bentley/bentleyjs-core";
import { Range3dProps, Range3d, TransformProps, Transform, Point3d, Point2d, Range2d, Vector3d, Angle } from "@bentley/geometry-core";
import { TileLoader, TileTree, Tile, TileRequests } from "./TileTree";
import { BentleyError, IModelStatus } from "@bentley/bentleyjs-core";
import { request, Response, RequestOptions } from "@bentley/imodeljs-clients";
import { imageElementFromImageSource } from "../ImageUtil";
import { IModelApp } from "../IModelApp";
import { RenderSystem } from "../render/System";
import { IModelConnection } from "../IModelConnection";
import { SceneContext, DecorateContext } from "../ViewContext";
import { ScreenViewport } from "../Viewport";
import { Plane3dByOriginAndUnitNormal } from "@bentley/geometry-core";
import { MessageBoxType, MessageBoxIconType } from "../NotificationManager";

function longitudeToMercator(longitude: number) { return (longitude + Angle.piRadians) / Angle.pi2Radians; }
function latitudeToMercator(latitude: number) {
  const sinLatitude = Math.sin(latitude);
  return (0.5 - Math.log((1.0 + sinLatitude) / (1.0 - sinLatitude)) / (4.0 * Angle.piRadians));   // https://msdn.microsoft.com/en-us/library/bb259689.aspx
}

function ecefToMercator(point: Point3d) {
  const cartoGraphic = Cartographic.fromEcef(point)!;
  return Point3d.create(longitudeToMercator(cartoGraphic.longitude), latitudeToMercator(cartoGraphic.latitude), 0.0);
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
  // gets the corners of a QuadId in a number between 0 and 1.
  private getMercatorCorners(): Point3d[] {
    const nTiles = (1 << this.level);
    const scale = 1.0 / nTiles;

    const corners: Point3d[] = [];             //    ----x----->
    corners.push(Point3d.create(scale * this.column, scale * this.row, 0.0));   //  | [0]     [1]
    corners.push(Point3d.create(scale * (this.column + 1), scale * this.row, 0.0));   //  y
    corners.push(Point3d.create(scale * this.column, scale * (this.row + 1), 0.0));   //  | [2]     [3]
    corners.push(Point3d.create(scale * (this.column + 1), scale * (this.row + 1), 0.0));   //  v

    return corners;
  }
  public getCorners(mercatorToDb: Transform): Point3d[] {
    const corners = this.getMercatorCorners();
    mercatorToDb.multiplyPoint3dArrayInPlace(corners);
    return corners;
  }
  public getRange(mercatorToDb: Transform): Range3d {
    const corners = this.getCorners(mercatorToDb);
    return Range3d.createArray(corners);
  }

  // get the lat long for pixels within this quadId.
  public pixelXYToLatLong(pixelX: number, pixelY: number): Point2d {
    const mapSize = 256 << this.level;
    const left = 256 * this.column;
    const top = 256 * this.row;
    const x = ((left + pixelX) / mapSize) - .5;
    const y = 0.5 - ((top + pixelY) / mapSize);
    const outPoint: Point2d = new Point2d(360.0 * x, 90.0 - 360.0 * Math.atan(Math.exp(-y * 2 * Math.PI)) / Math.PI);
    return outPoint;
  }

  public getLatLongRange(): Range2d {
    const lowerLeft = this.pixelXYToLatLong(0, 256);
    const upperRight = this.pixelXYToLatLong(256, 0);
    const range: Range2d = new Range2d();
    range.low = lowerLeft;
    range.high = upperRight;
    // first get range in pixels.
    return range;
  }
}
class WebMercatorTileTreeProps implements TileTreeProps {
  /** The unique identifier of this TileTree within the iModel */
  public id: string = "";
  /** Metadata describing the tree's root Tile. */
  public rootTile: TileProps;
  /** Transform tile coordinates to iModel world coordinates. */
  public location: TransformProps;
  public yAxisUp = true;
  public isTerrain = true;
  public constructor(mercatorToDb: Transform) {
    this.rootTile = new WebMercatorTileProps("0_0_0", mercatorToDb);
    this.location = Transform.createIdentity();
  }
}

class WebMercatorTileProps implements TileProps {
  public readonly contentId: string;
  public readonly range: Range3dProps;
  public readonly contentRange?: Range3dProps;
  public readonly maximumSize: number;
  public readonly sizeMultiplier: number = 1.0;
  public readonly isLeaf: boolean = false;

  constructor(thisId: string, mercatorToDb: Transform) {
    this.contentId = thisId;
    const quadId = new QuadId(thisId);
    this.range = quadId.getRange(mercatorToDb);
    this.maximumSize = (0 === quadId.level) ? 0.0 : 256;
  }
}

class WebMercatorTileLoader extends TileLoader {
  private _providerInitializing?: Promise<void>;
  private _providerInitialized: boolean = false;
  public mercatorToDb: Transform;
  constructor(private _imageryProvider: ImageryProvider, private _iModel: IModelConnection, groundBias: number) {
    super();
    const ecefLocation: EcefLocation = _iModel.ecefLocation!;
    const dbToEcef = Transform.createOriginAndMatrix(ecefLocation.origin, ecefLocation.orientation.toMatrix3d());

    const projectCenter = _iModel.projectExtents.center;
    const projectEast = Point3d.create(projectCenter.x + 1.0, projectCenter.y, groundBias);
    const projectNorth = Point3d.create(projectCenter.x, projectCenter.y + 1.0, groundBias);

    const mercatorOrigin = ecefToMercator(dbToEcef.multiplyPoint3d(projectCenter));
    const mercatorX = ecefToMercator(dbToEcef.multiplyPoint3d(projectEast));
    const mercatorY = ecefToMercator(dbToEcef.multiplyPoint3d(projectNorth));

    const deltaX = Vector3d.createStartEnd(mercatorOrigin, mercatorX);
    const deltaY = Vector3d.createStartEnd(mercatorOrigin, mercatorY);

    const dbToMercator = Transform.createOriginAndMatrixColumns(mercatorOrigin, deltaX, deltaY, Vector3d.create(0.0, 0.0, 1.0)).multiplyTransformTransform(Transform.createTranslationXYZ(-projectCenter.x, -projectCenter.y, -groundBias));
    this.mercatorToDb = dbToMercator.inverse() as Transform;
  }
  public tileRequiresLoading(params: Tile.Params): boolean { return 0.0 !== params.maximumSize; }
  public async getChildrenProps(parent: Tile): Promise<TileProps[]> {
    const quadId = new QuadId(parent.contentId);
    const level = quadId.level + 1;
    const column = quadId.column * 2;
    const row = quadId.row * 2;

    const props: WebMercatorTileProps[] = [];
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const childId = level + "_" + (column + i) + "_" + (row + j);
        props.push(new WebMercatorTileProps(childId, this.mercatorToDb));
      }
    }

    return props;
  }
  public async loadTileContents(missingArray: Tile[]): Promise<void> {
    // Provider initialization is asynchronous...ensure we don't request same tiles again before provider is ready.
    for (const tile of missingArray)
      tile.setIsQueued();

    if (!this._providerInitialized) {
      if (undefined === this._providerInitializing)
        this._providerInitializing = this._imageryProvider.initialize();
      await this._providerInitializing;
      this._providerInitialized = true;
      this._providerInitializing = undefined;
    }

    await Promise.all(missingArray.map(async (missingTile) => {
      assert(missingTile.isQueued);

      const quadId = new QuadId(missingTile.contentId);
      const corners = quadId.getCorners(this.mercatorToDb);
      const imageSource = await this._imageryProvider.loadTile(quadId.row, quadId.column, quadId.level);
      if (undefined === imageSource) {
        missingTile.setNotFound();
      } else {
        const textureLoad = this.loadTextureImage(imageSource as ImageSource, this._iModel, IModelApp.renderSystem);
        textureLoad.catch((_err) => missingTile.setNotFound());
        textureLoad.then((result) => { // tslint:disable-line:no-floating-promises
          missingTile.setGraphic(IModelApp.renderSystem.createTile(result as RenderTexture, corners as Point3d[]));
        });
      }
    }));
  }

  private async loadTextureImage(imageSource: ImageSource, iModel: IModelConnection, system: RenderSystem): Promise<RenderTexture | undefined> {
    try {
      const isCanceled = false;  // Tbd...
      const textureParams = new RenderTexture.Params(undefined, RenderTexture.Type.TileSection);
      return imageElementFromImageSource(imageSource)
        .then((image) => isCanceled ? undefined : system.createTextureFromImage(image, ImageSourceFormat.Png === imageSource.format, iModel, textureParams))
        .catch((_) => undefined);
    } catch (e) {
      return undefined;
    }
  }

  public get maxDepth(): number { return this._providerInitialized ? this._imageryProvider.maximumZoomLevel : 32; }
}

// Represents the service that is providing map tiles for Web Mercator models (background maps).
abstract class ImageryProvider {
  public mapType: BackgroundMapType;

  constructor(mapType: BackgroundMapType) {
    this.mapType = mapType;
  }

  public abstract get tileWidth(): number;
  public abstract get tileHeight(): number;
  public abstract get minimumZoomLevel(): number;
  public abstract get maximumZoomLevel(): number;
  public abstract constructUrl(row: number, column: number, zoomLevel: number): string;
  public abstract getCopyrightMessage(bgMapState: BackgroundMapState, viewport: ScreenViewport): HTMLElement | undefined;
  public abstract getCopyrightImage(bgMapState: BackgroundMapState): HTMLImageElement | undefined;

  // initialize the subclass of ImageryProvider
  public abstract async initialize(): Promise<void>;

  // returns true if the tile data matches the tile data of a "missing tile". See BingMapProvider.initialize.
  public matchesMissingTile(_tileData: Uint8Array): boolean {
    return false;
  }

  // returns a Uint8Array with the contents of the tile.
  public async loadTile(row: number, column: number, zoomLevel: number): Promise<ImageSource | undefined> {
    const tileUrl: string = this.constructUrl(row, column, zoomLevel);
    const alctx = new ActivityLoggingContext(Guid.createValue());
    const tileRequestOptions: RequestOptions = { method: "GET", responseType: "arraybuffer" };
    try {
      const tileResponse: Response = await request(alctx, tileUrl, tileRequestOptions);
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

// Our ImageryProvider for Bing Maps.
class BingMapProvider extends ImageryProvider {
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

  constructor(mapType: BackgroundMapType) {
    super(mapType);
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

  private showAttributions(state: BackgroundMapState, viewport: ScreenViewport) {
    // our "this" is the BingMapProvider for which we want to show the data provider attribution.
    // We need to get the tiles that are used in the view.
    const tiles: Tile[] = state.getTilesForView(viewport);
    const matchingAttributions: BingAttribution[] = this.getMatchingAttributions(tiles);
    let dataString: string = IModelApp.i18n.translate("iModelJs:BackgroundMap.BingDataAttribution");
    for (const match of matchingAttributions) {
      dataString = dataString.concat("<li>", match.copyrightMessage, "</li>");
    }
    IModelApp.notifications.openMessageBox(MessageBoxType.LargeOk, dataString, MessageBoxIconType.Information); // tslint:disable-line:no-floating-promises
  }

  public getCopyrightImage(_bgMapState: BackgroundMapState): HTMLImageElement | undefined { return this._logoImage; }

  public getCopyrightMessage(bgMapState: BackgroundMapState, viewport: ScreenViewport): HTMLElement | undefined {
    const copyrightElement: HTMLSpanElement = document.createElement("span");
    copyrightElement.className = "bgmap-copyright";
    copyrightElement.onclick = this.showAttributions.bind(this, bgMapState, viewport);
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

  // initializes the BingMapProvider by reading the templateUrl, logo image, and attribution list.
  public async initialize(): Promise<void> {
    // get the template url
    // NEEDSWORK - should get bing key from server.
    const bingKey = "AtaeI3QDNG7Bpv1L53cSfDBgBKXIgLq3q-xmn_Y2UyzvF-68rdVxwAuje49syGZt";
    const alctx = new ActivityLoggingContext(Guid.createValue());

    let imagerySet = "Road";
    if (BackgroundMapType.Aerial === this.mapType)
      imagerySet = "Aerial";
    else if (BackgroundMapType.Hybrid === this.mapType)
      imagerySet = "AerialWithLabels";

    let bingRequestUrl: string = "http://dev.virtualearth.net/REST/v1/Imagery/Metadata/{imagerySet}?o=json&incl=ImageryProviders&key={bingKey}";
    bingRequestUrl = bingRequestUrl.replace("{imagerySet}", imagerySet);
    bingRequestUrl = bingRequestUrl.replace("{bingKey}", bingKey);
    const requestOptions: RequestOptions = {
      method: "GET",
    };
    try {
      const response: Response = await request(alctx, bingRequestUrl, requestOptions);
      const bingResponseProps: any = response.body;
      this._logoUrl = bingResponseProps.brandLogoUri;

      const thisResourceSetProps = bingResponseProps.resourceSets[0];
      const thisResourceProps = thisResourceSetProps.resources[0];
      this._zoomMin = thisResourceProps.zoomMin;
      this._zoomMax = thisResourceProps.zoomMax;
      this._tileHeight = thisResourceProps.imageHeight;
      this._tileWidth = thisResourceProps.imageWidth;
      this._urlTemplate = thisResourceProps.imageUrl.replace("{culture}", "en-US"); // NEEDSWORK - get locale from somewhere.
      this._urlSubdomains = thisResourceProps.imageUrlSubdomains;
      // read the list of Bing's data suppliers and the range of data they provide. Used in calculation of copyright message.
      this.readAttributions(thisResourceProps.imageryProviders);

      // read the Bing logo data, used in getCopyrightImage
      this.readLogo().then((logoByteArray) => { // tslint:disable-line:no-floating-promises
        this._logoImage = new Image();
        const base64Data = Base64.btoa(String.fromCharCode.apply(null, logoByteArray));
        this._logoImage.src = "data:image/png;base64," + base64Data;
      });

      // Bing sometimes provides tiles that have nothing but a stupid camera icon in the middle of them when you ask
      // for tiles at zoom levels where they don't have data. Their application stops you from zooming in when that's the
      // case, but we can't stop - the user might want to look at design data a closer zoom. So we intentionally load such
      // a tile, and then compare other tiles to it, rejecting them if they match.
      this.loadTile(0, 0, this._zoomMax - 1).then((tileData: ImageSource | undefined) => { // tslint:disable-line:no-floating-promises
        if (tileData !== undefined) this._missingTileData = tileData.data;
      });
    } catch (error) {
      throw new BentleyError(IModelStatus.BadModel, "Error in Bing Server communications");
    }
  }

  // reads the Bing logo from the url returned as part of the first response.
  private async readLogo(): Promise<Uint8Array | undefined> {
    const alctx = new ActivityLoggingContext(Guid.createValue());
    if (!this._logoUrl || (this._logoUrl.length === 0))
      return Promise.resolve(undefined);
    const logoRequestOptions: RequestOptions = { method: "GET", responseType: "arraybuffer" };
    return request(alctx, this._logoUrl, logoRequestOptions).then((logoResponse: Response) => {
      const byteArray = new Uint8Array(logoResponse.body);
      if (!byteArray || (byteArray.length === 0))
        return undefined;
      return byteArray;
    }, (_error) => {
      return undefined;
    });
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

// Our ImageryProvider for MapBox.
class MapBoxProvider extends ImageryProvider {
  private _zoomMin: number;
  private _zoomMax: number;
  private _baseUrl: string;

  constructor(mapType: BackgroundMapType) {
    super(mapType);
    this._zoomMin = 1; this._zoomMax = 20;
    switch (mapType) {
      case BackgroundMapType.Street:
        this._baseUrl = "http://api.mapbox.com/v4/mapbox.streets/";
        break;

      case BackgroundMapType.Aerial:
        this._baseUrl = "http://api.mapbox.com/v4/mapbox.satellite/";
        break;

      case BackgroundMapType.Hybrid:
        this._baseUrl = "http://api.mapbox.com/v4/mapbox.streets-satellite/";
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

  public getCopyrightImage(_bgMapState: BackgroundMapState): HTMLImageElement | undefined { return undefined; }

  public getCopyrightMessage(_bgMapState: BackgroundMapState, _viewport: ScreenViewport): HTMLElement | undefined {
    const copyrightElement: HTMLSpanElement = document.createElement("span");
    copyrightElement.innerText = IModelApp.i18n.translate("IModelJs:BackgroundMap.MapBoxCopyright");
    copyrightElement.className = "bgmap-copyright";
    return copyrightElement;
  }

  // no initialization needed for MapBoxProvider.
  public async initialize(): Promise<void> { }
}

/** @hidden */
export class BackgroundMapState {
  private _tileTree?: TileTree;
  private _loadStatus: TileTree.LoadStatus = TileTree.LoadStatus.NotLoaded;
  private _provider?: ImageryProvider;
  public providerName: string;
  private _groundBias: number;
  public mapType: BackgroundMapType;

  public setTileTree(props: TileTreeProps, loader: TileLoader) {
    this._tileTree = new TileTree(TileTree.Params.fromJSON(props, this._iModel, true, loader, ""));
    this._loadStatus = TileTree.LoadStatus.Loaded;
  }
  public getPlane(): Plane3dByOriginAndUnitNormal {
    return Plane3dByOriginAndUnitNormal.createXYPlane(new Point3d(0.0, 0.0, this._groundBias));  // TBD.... use this.groundBias when clone problem is sorted for Point3d
  }

  public getTilesForView(viewport: ScreenViewport): Tile[] {
    let displayTiles: Tile[] = [];
    if (this._tileTree) {
      const sceneContext = new SceneContext(viewport, new TileRequests());
      sceneContext.backgroundMap = this;
      displayTiles = this._tileTree.selectTilesForScene(sceneContext);
    }
    return displayTiles;
  }

  public constructor(json: BackgroundMapProps, private _iModel: IModelConnection) {
    this.providerName = JsonUtils.asString(json.providerName, "BingProvider");
    // this.providerData = JsonUtils.asString(json.providerData, "aerial");
    this._groundBias = JsonUtils.asDouble(json.groundBias, 0.0);
    this.mapType = json.providerData ? JsonUtils.asInt(json.providerData.mapType, BackgroundMapType.Hybrid) : BackgroundMapType.Hybrid;
  }

  private loadTileTree(): TileTree.LoadStatus {
    if (TileTree.LoadStatus.NotLoaded !== this._loadStatus)
      return this._loadStatus;

    if (this._iModel.ecefLocation === undefined) {
      return this._loadStatus;
    }

    if ("BingProvider" === this.providerName) {
      this._provider = new BingMapProvider(this.mapType);
    } else if ("MapBoxProvider" === this.providerName) {
      this._provider = new MapBoxProvider(this.mapType);
    }
    if (this._provider === undefined)
      throw new BentleyError(IModelStatus.BadModel, "WebMercator provider invalid");

    const loader = new WebMercatorTileLoader(this._provider, this._iModel, this._groundBias);
    const tileTreeProps = new WebMercatorTileTreeProps(loader.mercatorToDb);
    this.setTileTree(tileTreeProps, loader);
    return this._loadStatus;
  }

  public addToScene(context: SceneContext) {
    if (!context.viewFlags.backgroundMap)
      return;

    this.loadTileTree();
    if (undefined === this._tileTree)
      return;

    context.backgroundMap = this;
    this._tileTree.drawScene(context);
    context.backgroundMap = undefined;
  }

  public decorate(context: DecorateContext) {
    if (!this._provider)
      return;

    const copyrightImage = this._provider.getCopyrightImage(this);
    if (copyrightImage) {
      const position = new Point2d(0, (context.viewport.viewRect.height - copyrightImage.height));
      const drawDecoration = (ctx: CanvasRenderingContext2D) => {
        ctx.drawImage(copyrightImage, 0, 0, copyrightImage.width, copyrightImage.height);
      };
      context.addCanvasDecoration({ position, drawDecoration });
    }

    const copyrightMessage = this._provider.getCopyrightMessage(this, context.screenViewport);
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
    }
  }

  public equalsProps(props: BackgroundMapProps): boolean {
    const providerName = JsonUtils.asString(props.providerName, "BingProvider");
    const groundBias = JsonUtils.asDouble(props.groundBias, 0.0);
    const mapType = undefined !== props.providerData ? JsonUtils.asInt(props.providerData.mapType, BackgroundMapType.Hybrid) : BackgroundMapType.Hybrid;

    return providerName === this.providerName && groundBias === this._groundBias && mapType === this.mapType;
  }
}
