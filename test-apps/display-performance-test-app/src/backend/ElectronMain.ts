/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as electron from "electron";
import * as path from "path";
import { IModelJsElectronManager, StandardElectronManager, WebpackDevServerElectronManager } from "@bentley/electron-manager";
import { ElectronRpcManager } from "@bentley/imodeljs-common";
import DisplayPerfRpcInterface from "../common/DisplayPerfRpcInterface";
import { getRpcInterfaces, initializeBackend } from "./backend";

(async () => { // tslint:disable-line:no-floating-promises
  // --------------------------------------------------------------------------------------
  // ------- Initialization and setup of host and tools before starting app ---------------

  // Start the backend
  await initializeBackend();

  if (process.argv.length > 2 && process.argv[2].split(".").pop() === "json")
    DisplayPerfRpcInterface.jsonFilePath = process.argv[2];

  // --------------------------------------------------------------------------------------
  // ---------------- This part copied from protogist ElectronMain.ts ---------------------
  const autoOpenDevTools = (undefined === process.env.SVT_NO_DEV_TOOLS);
  const maximizeWindow = (undefined === process.env.SVT_NO_MAXIMIZE_WINDOW); // Make max window the default

  const manager: IModelJsElectronManager = new IModelJsElectronManager(path.join(__dirname, "..", "..", "build"));

  await manager.initialize({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      experimentalFeatures: true, // Needed for CSS Grid support
    },
    autoHideMenuBar: true,
    show: !maximizeWindow,
  });

  // Initialize application gateway configuration for the backend
  ElectronRpcManager.initializeImpl({}, getRpcInterfaces());

  if (manager.mainWindow) {
    if (maximizeWindow) {
      manager.mainWindow.maximize(); // maximize before showing to avoid resize event on startup
      manager.mainWindow.show();
    }
    if (autoOpenDevTools)
      manager.mainWindow.webContents.toggleDevTools();
  }

  // Handle custom keyboard shortcuts
  electron.app.on("web-contents-created", (_e, wc) => {
    wc.on("before-input-event", (event, input) => {
      // CTRL + SHIFT + I  ==> Toggle DevTools
      if (input.key === "I" && input.control && !input.alt && !input.meta && input.shift) {
        if (manager.mainWindow)
          manager.mainWindow.webContents.toggleDevTools();

        event.preventDefault();
      }
    });
  });
})();
