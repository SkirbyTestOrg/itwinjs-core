/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { IModelHost, IModelHostConfiguration } from "@bentley/imodeljs-backend";
import { Logger } from "@bentley/bentleyjs-core";
import { IModelTileRpcInterface, SnapshotIModelRpcInterface, IModelReadRpcInterface, MobileRpcConfiguration } from "@bentley/imodeljs-common";
import * as fs from "fs";
import * as path from "path";
import { IModelJsConfig } from "@bentley/config-loader/lib/IModelJsConfig";
import { IModelBankClient, Config } from "@bentley/imodeljs-clients";
import { UrlFileHandler } from "@bentley/imodeljs-clients-backend";
import { SVTConfiguration } from "../common/SVTConfiguration";
import "./SVTRpcImpl"; // just to get the RPC implementation registered
import SVTRpcInterface from "../common/SVTRpcInterface";

IModelJsConfig.init(true /* suppress exception */, true /* suppress error message */, Config.App);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // (needed temporarily to use self-signed cert to communicate with iModelBank via https)

export function getRpcInterfaces() {
  return [IModelTileRpcInterface, SnapshotIModelRpcInterface, IModelReadRpcInterface, SVTRpcInterface];
}

function setupStandaloneConfiguration() {
  if (MobileRpcConfiguration.isMobileBackend)
    return;

  const filename = process.env.SVT_STANDALONE_FILENAME;
  if (filename !== undefined) {
    const configuration: SVTConfiguration = {};
    configuration.standalone = true;
    configuration.standalonePath = process.env.SVT_STANDALONE_FILEPATH; // optional (browser-use only)
    configuration.viewName = process.env.SVT_STANDALONE_VIEWNAME; // optional
    configuration.iModelName = filename;
    configuration.enableDiagnostics = undefined === process.env.SVT_DISABLE_DIAGNOSTICS;
    if (undefined !== process.env.SVT_STANDALONE_SIGNIN)
      configuration.signInForStandalone = true;

    configuration.disableInstancing = undefined !== process.env.SVT_DISABLE_INSTANCING;
    configuration.disableMagnification = undefined !== process.env.SVT_DISABLE_MAGNIFICATION;
    const treeExpiration = process.env.SVT_TILETREE_EXPIRATION_SECONDS;
    if (undefined !== treeExpiration)
      try {
        configuration.tileTreeExpirationSeconds = Number.parseInt(treeExpiration, 10);
      } catch (_) {
        //
      }

    configuration.displaySolarShadows = true;

    configuration.preserveShaderSourceCode = undefined !== process.env.SVT_PRESERVE_SHADER_SOURCE_CODE;

    const extensions = process.env.SVT_DISABLED_EXTENSIONS;
    if (undefined !== extensions)
      configuration.disabledExtensions = extensions.split(";");

    const configPathname = path.normalize(path.join(__dirname, "../webresources", "configuration.json"));
    fs.writeFileSync(configPathname, JSON.stringify(configuration), "utf8");
  }
}

export function initializeBackend() {
  setupStandaloneConfiguration();

  const hostConfig = new IModelHostConfiguration();
  hostConfig.logTileLoadTimeThreshold = 3;
  hostConfig.logTileSizeThreshold = 500000;
  if (MobileRpcConfiguration.isMobileBackend) {
    // Does not seem SVTConfiguraiton is used anymore.
  } else {
    // tslint:disable-next-line:no-var-requires
    const configPathname = path.normalize(path.join(__dirname, "../webresources", "configuration.json"));
    const svtConfig: SVTConfiguration = require(configPathname);
    if (svtConfig.customOrchestratorUri)
      hostConfig.imodelClient = new IModelBankClient(svtConfig.customOrchestratorUri, new UrlFileHandler());
  }

  IModelHost.startup(hostConfig);

  Logger.initializeToConsole(); // configure logging for imodeljs-core
}
