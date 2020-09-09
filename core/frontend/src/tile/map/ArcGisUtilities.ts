/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Angle } from "@bentley/geometry-core";
import { MapSubLayerProps } from "@bentley/imodeljs-common";
import { getJson, request, RequestBasicCredentials, RequestOptions } from "@bentley/itwin-client";
import { FrontendRequestContext } from "../../imodeljs-frontend";
import { MapLayerSourceValidation } from "../internal";
import { MapCartoRectangle } from "./MapCartoRectangle";
import { MapLayerSource, MapLayerSourceStatus } from "./MapLayerSources";

/** @packageDocumentation
 * @module Tiles
 */
/** @internal */
export class ArcGisUtilities {
  private static getBBoxString(range?: MapCartoRectangle) {
    if (!range)
      range = MapCartoRectangle.create();

    return `${range.low.x * Angle.degreesPerRadian},${range.low.y * Angle.degreesPerRadian},${range.high.x * Angle.degreesPerRadian},${range.high.y * Angle.degreesPerRadian}`;
  }
  public static async getEndpoint(url: string): Promise<any | undefined> {
    const capabilities = await getJson(new FrontendRequestContext(""), `${url}?f=pjson`);

    return capabilities;
  }
  public static async getNationalMapSources(): Promise<MapLayerSource[]> {
    const sources = new Array<MapLayerSource>();
    const services = await getJson(new FrontendRequestContext(""), "https://viewer.nationalmap.gov/tnmaccess/api/getMapServiceList");

    if (!Array.isArray(services))
      return sources;

    for (const service of services) {
      if (service.wmsUrl.length === 0)    // Exclude Wfs..
        continue;
      switch (service.serviceType) {
        case "ArcGIS":
          sources.push(MapLayerSource.fromJSON({ name: service.displayName, url: service.serviceLink, formatId: "ArcGIS" })!);
          break;
        default: {
          const wmsIndex = service.wmsUrl.lastIndexOf("/wms");
          if (wmsIndex > 0) {
            const url = service.wmsUrl.slice(0, wmsIndex + 4);
            sources.push(MapLayerSource.fromJSON({ name: service.displayName, url, formatId: "WMS" })!);
          }
          break;
        }
      }
    }
    return sources;
  }
  public static async getServiceDirectorySources(url: string, baseUrl?: string): Promise<MapLayerSource[]> {
    if (undefined === baseUrl)
      baseUrl = url;
    let sources = new Array<MapLayerSource>();
    const json = await getJson(new FrontendRequestContext(""), `${url}?f=json`);
    if (json !== undefined) {
      if (Array.isArray(json.folders)) {
        for (const folder of json.folders) {
          sources = sources.concat(await ArcGisUtilities.getServiceDirectorySources(`${url}/${folder}`, url));
        }
      }
      if (Array.isArray(json.services)) {
        for (const service of json.services) {
          let source;
          if (service.type === "MapServer")
            source = MapLayerSource.fromJSON({ name: service.name, url: `${baseUrl}/${service.name}/MapServer`, formatId: "ArcGIS" });
          else if (service.type === "ImageServer")
            source = MapLayerSource.fromJSON({ name: service.name, url: `${baseUrl}/${service.name}/ImageServer`, formatId: "ArcGIS" });
          if (source)
            sources.push(source);
        }
      }
    }

    return sources;
  }
  public static async getSourcesFromQuery(range?: MapCartoRectangle, url = "https://usgs.maps.arcgis.com/sharing/rest/search"): Promise<MapLayerSource[]> {
    const sources = new Array<MapLayerSource>();
    for (let start = 1; start > 0;) {
      const json = await getJson(new FrontendRequestContext(""), `${url}?f=json&q=(group:9d1199a521334e77a7d15abbc29f8144) AND (type:"Map Service")&bbox=${ArcGisUtilities.getBBoxString(range)}&sortOrder=desc&start=${start}&num=100`);
      if (!json) break;
      start = json.nextStart ? json.nextStart : -1;
      if (json !== undefined && Array.isArray(json.results)) {
        for (const result of json.results) {
          const source = MapLayerSource.fromJSON({ name: result.name ? result.name : result.title, url: result.url, formatId: "ArcGIS" });
          if (source)
            sources.push(source);
        }
      }
    }

    return sources;
  }

  public static async validateSource(url: string, credentials?: RequestBasicCredentials): Promise<MapLayerSourceValidation> {
    const json = await this.getServiceJson(url, credentials);
    if (json === undefined || json.error !== undefined)
      return { status: MapLayerSourceStatus.InvalidUrl };

    let subLayers;
    if (json.layers) {

      subLayers = new Array<MapSubLayerProps>();

      for (const layer of json.layers) {
        const parent = layer.parentLayerId < 0 ? undefined : layer.parentLayerId;
        const children = Array.isArray(layer.subLayerIds) ? layer.subLayerIds : undefined;
        subLayers.push({ name: layer.name, visible: layer.defaultVisibility !== false, id: layer.id, parent, children });
      }
    }
    return { status: MapLayerSourceStatus.Valid, subLayers };

  }
  private static _serviceCache = new Map<string, any>();
  public static async getServiceJson(url: string, credentials?: RequestBasicCredentials): Promise<any> {
    const cached = ArcGisUtilities._serviceCache.get(url);
    if (cached !== undefined)
      return cached;

    try {
      const options: RequestOptions = {
        method: "GET",
        responseType: "json",
        auth: credentials,
      };
      const data = await request(new FrontendRequestContext(""), `${url}?f=json`, options);
      const json = data.body ? data.body : undefined;
      ArcGisUtilities._serviceCache.set(url, json);
      return json;
    } catch (_error) {
      ArcGisUtilities._serviceCache.set(url, undefined);
      return undefined;
    }
  }

  private static _footprintCache = new Map<string, any>();
  public static async getFootprintJson(url: string): Promise<any> {
    const cached = ArcGisUtilities._footprintCache.get(url);
    if (cached !== undefined)
      return cached;

    try {
      const json = await getJson(new FrontendRequestContext(""), `${url}?f=json&option=footprints&outSR=4326`);
      ArcGisUtilities._footprintCache.set(url, json);
      return json;
    } catch (_error) {
      ArcGisUtilities._footprintCache.set(url, undefined);
      return undefined;
    }
  }
}
