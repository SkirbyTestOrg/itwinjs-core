/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
export * from "./Code";
export * from "./ColorDef";
export * from "./ECSqlTypes";
export * from "./ElementProps";
export * from "./EntityProps";
export * from "./FeatureGates";
export * from "./FeatureIndex";
export * from "./Frustum";
export * from "./Fonts";
export * from "./GeoCoordinateServices";
export * from "./RpcInterface";
export * from "./RpcManager";
export * from "./TextureProps";
export * from "./Image";
export * from "./IModel";
export * from "./IModelError";
export * from "./IModelVersion";
export * from "./Lighting";
export * from "./CommonLoggerCategory";
export * from "./MaterialProps";
export * from "./ModelProps";
export * from "./OctEncodedNormal";
export * from "./QPoint";
export * from "./SubCategoryAppearance";
export * from "./Snapping";
export * from "./TileProps";
export * from "./SpatialClassificationProps";
export * from "./Thumbnail";
export * from "./ViewProps";
export * from "./Render";
export * from "./Paging";
export * from "./RenderSchedule";
export * from "./ChangedElements";
export * from "./domains/FunctionalElementProps";
export * from "./domains/GenericElementProps";
export * from "./domains/LinearReferencingElementProps";
export * from "./geometry/AreaPattern";
export * from "./geometry/Cartographic";
export * from "./geometry/GeometryStream";
export * from "./geometry/LineStyle";
export * from "./geometry/Placement";
export * from "./geometry/TextString";
export * from "./rpc/TestRpcManager";
export * from "./rpc/WipRpcInterface";
export * from "./rpc/DevToolsRpcInterface";
export * from "./rpc/core/RpcConstants";
export * from "./rpc/core/RpcConfiguration";
export * from "./rpc/core/RpcInvocation";
export * from "./rpc/core/RpcOperation";
export * from "./rpc/core/RpcProtocol";
export * from "./rpc/core/RpcRegistry";
export * from "./rpc/core/RpcRequest";
export * from "./rpc/core/RpcRequestContext";
export * from "./rpc/core/RpcControl";
export * from "./rpc/core/RpcMarshaling";
export * from "./rpc/core/RpcPendingQueue";
export * from "./rpc/electron/ElectronRpcManager";
export * from "./rpc/electron/ElectronRpcProtocol";
export * from "./rpc/electron/ElectronRpcRequest";
export * from "./rpc/mobile/MobileRpcManager";
export * from "./rpc/mobile/MobileRpcProtocol";
export * from "./rpc/mobile/MobileRpcRequest";
export * from "./rpc/web/BentleyCloudRpcManager";
export * from "./rpc/web/BentleyCloudRpcProtocol";
export * from "./rpc/web/OpenAPI";
export * from "./rpc/web/WebAppRpcProtocol";
export * from "./rpc/web/RpcMultipart";
export * from "./rpc/web/WebAppRpcRequest";
export * from "./rpc/mobile/MobileRpcManager";
export * from "./rpc/IModelReadRpcInterface";
export * from "./rpc/IModelTileRpcInterface";
export * from "./rpc/IModelWriteRpcInterface";
export * from "./rpc/SnapshotIModelRpcInterface";
export * from "./CloudStorage";
export * from "./CloudStorageTileCache";

// Set the version number so it can be found at runtime. BUILD_SEMVER is replaced at build time by the webpack DefinePlugin.
declare var BUILD_SEMVER: string;
if ((typeof (BUILD_SEMVER) !== "undefined") && (typeof window !== "undefined") && window) {
  if (!(window as any).iModelJsVersions)
    (window as any).iModelJsVersions = new Map<string, string>();
  (window as any).iModelJsVersions.set("imodeljs-common", BUILD_SEMVER);
}

/** @docs-package-description
 * The imodeljs-common package contains classes for working with iModels that can be used in both [frontend]($docs/learning/frontend/index.md) and [backend]($docs/learning/backend/index.md).
 */
/**
 * @docs-group-description WireFormats
 * Definitions of the "props" interfaces and types that define the [wire format]($docs/learning/wireformat.md) for communication between the frontend and backend
 */
/**
 * @docs-group-description Codes
 * Classes for working with [Codes]($docs/bis/intro/codes.md)
 */
/**
 * @docs-group-description Geometry
 * Classes for working with geometry.
 */
/**
 * @docs-group-description Views
 * Classes for working with views of models and elements.
 */
/**
 * @docs-group-description Rendering
 * Classes for rendering geometry in views.
 */
/**
 * @docs-group-description Symbology
 * Classes that affect the appearance of geometry in a view
 */
/**
 * @docs-group-description iModels
 * Classes for working with [iModels]($docs/learning/IModels.md) in both the frontend and backend
 */
/**
 * @docs-group-description RpcInterface
 * Classes for working with [RpcInterfaces]($docs/learning/RpcInterface.md).
 */
/**
 * @docs-group-description ECSQL
 * Classes for working with [ECSQL]($docs/learning/ECSQL.md), [Spatial Queries]($docs/learning/SpatialQueries.md), and [ECSQL Geometry Functions]($docs/learning/GeometrySqlFuncs.md)
 */
