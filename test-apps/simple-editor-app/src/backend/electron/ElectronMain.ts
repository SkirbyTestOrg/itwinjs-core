/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as path from "path";
import { assert } from "@bentley/bentleyjs-core";
import { IModelJsElectronManager, StandardElectronManager, WebpackDevServerElectronManager } from "@bentley/electron-manager";
import { ElectronRpcManager, RpcInterfaceDefinition } from "@bentley/imodeljs-common";

/**
 * Initializes Electron backend
 */

const autoOpenDevTools = false;

export default function initialize(rpcs: RpcInterfaceDefinition[]) {
  (async () => { // tslint:disable-line:no-floating-promises
    let manager: StandardElectronManager;
    if (process.env.NODE_ENV === "production")
      manager = new IModelJsElectronManager(path.join(__dirname, "..", "..", "..", "build"));
    else
      manager = new WebpackDevServerElectronManager(3000); // port should match the port of the local dev server

    await manager.initialize({
      width: 800,
      height: 650,
      autoHideMenuBar: true,
      show: true,
      webPreferences: {
        nodeIntegration: true,
      },
    });

    // tell ElectronRpcManager which RPC interfaces to handle
    ElectronRpcManager.initializeImpl({}, rpcs);

    const mainWindow = manager.mainWindow!;
    assert(!!mainWindow);

    if (autoOpenDevTools)
      mainWindow.webContents.toggleDevTools();
  })();
}
