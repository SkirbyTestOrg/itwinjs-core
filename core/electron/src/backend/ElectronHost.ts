/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

// Note: only import *types* from electron so this file can be imported by apps that sometimes use Electron and sometimes not.
import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import type * as ElectronModule from "electron";

import * as fs from "fs";
import * as path from "path";
import { BeDuration, IModelStatus, ProcessDetector } from "@itwin/core-bentley";
import { IpcHandler, IpcHost, NativeHost, NativeHostOpts } from "@itwin/core-backend";
import { IModelError, IpcListener, IpcSocketBackend, RemoveFunction, RpcConfiguration, RpcInterfaceDefinition } from "@itwin/core-common";
import { ElectronRpcConfiguration, ElectronRpcManager } from "../common/ElectronRpcManager";
import { dialogChannel, DialogModuleMethod } from "../common/ElectronIpcInterface";

// cSpell:ignore signin devserver webcontents copyfile unmaximize eopt

class ElectronIpc implements IpcSocketBackend {
  public addListener(channel: string, listener: IpcListener): RemoveFunction {
    ElectronHost.ipcMain.addListener(channel, listener);
    return () => ElectronHost.ipcMain.removeListener(channel, listener);
  }
  public removeListener(channel: string, listener: IpcListener) {
    ElectronHost.ipcMain.removeListener(channel, listener);
  }
  public send(channel: string, ...args: any[]): void {
    const window = ElectronHost.mainWindow ?? ElectronHost.electron.BrowserWindow.getAllWindows()[0];
    window?.webContents.send(channel, ...args);
  }
  public handle(channel: string, listener: (evt: any, ...args: any[]) => Promise<any>): RemoveFunction {
    ElectronHost.ipcMain.removeHandler(channel); // make sure there's not already a handler registered
    ElectronHost.ipcMain.handle(channel, listener);
    return () => ElectronHost.ipcMain.removeHandler(channel);
  }
}

/**
 * Options for  [[ElectronHost.startup]]
 * @beta
 */
export interface ElectronHostOptions {
  /** the path to find web resources  */
  webResourcesPath?: string;
  /** filename for the app's icon, relative to [[webResourcesPath]] */
  iconName?: string;
  /** name of frontend url to open.  */
  frontendURL?: string;
  /** use a development server rather than the "electron" protocol for loading frontend (see https://www.electronjs.org/docs/api/protocol) */
  developmentServer?: boolean;
  /** port number for development server. Default is 3000 */
  frontendPort?: number;
  /** list of RPC interface definitions to register */
  rpcInterfaces?: RpcInterfaceDefinition[];
  /** list of [IpcHandler]($common) classes to register */
  ipcHandlers?: (typeof IpcHandler)[];
}

/** @beta */
export interface ElectronHostOpts extends NativeHostOpts {
  electronHost?: ElectronHostOptions;
}

/** @beta */
export interface ElectronHostWindowOptions extends BrowserWindowConstructorOptions {
  storeWindowName?: string;
  /** The style of window title bar. Default is `default`. */
  titleBarStyle?: ("default" | "hidden" | "hiddenInset" | "customButtonsOnHover");
}

/** the size and position of a window as stored in the settings file.
 * @beta
 */
export interface WindowSizeAndPositionProps {
  width: number;
  height: number;
  x: number;
  y: number;
}

/**
 * The backend for Electron-based desktop applications
 * @beta
 */
export class ElectronHost {
  private static _ipc: ElectronIpc;
  private static _developmentServer: boolean;
  private static _electron: typeof ElectronModule;
  private static _electronFrontend = "electron://frontend/";
  private static _mainWindow?: BrowserWindow;
  public static webResourcesPath: string;
  public static appIconPath: string;
  public static frontendURL: string;
  public static rpcConfig: RpcConfiguration;
  public static get ipcMain() { return this._electron?.ipcMain; }
  public static get app() { return this._electron?.app; }
  public static get electron() { return this._electron; }

  private constructor() { }

  /**
   * Converts an "electron://frontend/" URL to an absolute file path.
   *
   * We use this protocol in production builds because our frontend must be built with absolute URLs,
   * however, since we're loading everything directly from the install directory, we cannot know the
   * absolute path at build time.
   */
  private static parseElectronUrl(requestedUrl: string): string {
    // Note that the "frontend/" path is arbitrary - this is just so we can handle *some* relative URLs...
    let assetPath = requestedUrl.substring(this._electronFrontend.length);
    if (assetPath.length === 0)
      assetPath = "index.html";
    assetPath = path.normalize(`${this.webResourcesPath}/${assetPath}`);
    // File protocols don't follow symlinks, so we need to resolve this to a real path.
    // However, if the file doesn't exist, it's fine to return an invalid path here - the request will just fail with net::ERR_FILE_NOT_FOUND
    try {
      assetPath = fs.realpathSync(assetPath);
    } catch (error) {
      // eslint-disable-next-line no-console
      // console.warn(`WARNING: Frontend requested "${requestedUrl}", but ${assetPath} does not exist`);
    }
    if (!assetPath.startsWith(this.webResourcesPath))
      throw new Error(`Access to files outside installation directory (${this.webResourcesPath}) is prohibited`);
    return assetPath;
  }

  private static _openWindow(options?: ElectronHostWindowOptions) {
    const opts: BrowserWindowConstructorOptions = {
      ...options,
      autoHideMenuBar: true,
      icon: this.appIconPath,
      webPreferences: {
        ...options?.webPreferences,

        // These web preference variables should not be overriden by the ElectronHostWindowOptions
        preload: require.resolve(/* webpack: copyfile */"./ElectronPreload.js"),
        experimentalFeatures: false,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        nativeWindowOpen: true,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
      },
    };

    this._mainWindow = new (this.electron.BrowserWindow)(opts);
    ElectronRpcConfiguration.targetWindowId = this._mainWindow.id;
    this._mainWindow.on("closed", () => this._mainWindow = undefined);
    this._mainWindow.loadURL(this.frontendURL); // eslint-disable-line @typescript-eslint/no-floating-promises

    /** Monitors and saves main window size, position and maximized state */
    if (options?.storeWindowName) {
      const mainWindow = this._mainWindow;
      const name = options.storeWindowName;
      const saveWindowPosition = () => {
        const resolution = mainWindow.getSize();
        const position = mainWindow.getPosition();
        const pos: WindowSizeAndPositionProps = {
          width: resolution[0],
          height: resolution[1],
          x: position[0],
          y: position[1],
        };
        NativeHost.settingsStore.setData(`windowPos-${name}`, JSON.stringify(pos));
      };
      const saveMaximized = (maximized: boolean) => {
        if (!maximized)
          saveWindowPosition();
        NativeHost.settingsStore.setData(`windowMaximized-${name}`, maximized);
      };

      mainWindow.on("resized", () => saveWindowPosition());
      mainWindow.on("moved", () => saveWindowPosition());
      mainWindow.on("maximize", () => saveMaximized(true));
      mainWindow.on("unmaximize", () => saveMaximized(false));

      saveMaximized(mainWindow.isMaximized());
    }
  }

  /** The "main" BrowserWindow for this application. */
  public static get mainWindow() { return this._mainWindow; }

  /** Gets window size and position for a window, by name, from settings file, if present */
  public static getWindowSizeSetting(windowName: string): WindowSizeAndPositionProps | undefined {
    const saved = NativeHost.settingsStore.getString(`windowPos-${windowName}`);
    return saved ? JSON.parse(saved) as WindowSizeAndPositionProps : undefined;
  }

  /** Gets "window maximized" flag for a window, by name, from settings file if present */
  public static getWindowMaximizedSetting(windowName: string): boolean | undefined {
    return NativeHost.settingsStore.getBoolean(`windowMaximized-${windowName}`);
  }

  /**
   * Open the main Window when the app is ready.
   * @param windowOptions Options for constructing the main BrowserWindow. See: https://electronjs.org/docs/api/browser-window#new-browserwindowoptions
   */
  public static async openMainWindow(windowOptions?: ElectronHostWindowOptions): Promise<void> {
    const app = this.app;
    // quit the application when all windows are closed (unless we're running on MacOS)
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin")
        app.quit();
    });

    // re-open the main window if it was closed and the app is re-activated (this is the normal MacOS behavior)
    app.on("activate", () => {
      if (!this._mainWindow)
        this._openWindow(windowOptions);
    });

    if (this._developmentServer) {
      // Occasionally, the electron backend may start before the webpack devserver has even started.
      // If this happens, we'll just retry and keep reloading the page.
      app.on("web-contents-created", (_e, webcontents) => {
        webcontents.on("did-fail-load", async (_event, errorCode, _errorDescription, _validatedURL, isMainFrame) => {
          // errorCode -102 is CONNECTION_REFUSED - see https://cs.chromium.org/chromium/src/net/base/net_error_list.h
          if (isMainFrame && errorCode === -102) {
            await BeDuration.wait(100);
            webcontents.reload();
          }
        });
      });
    }

    await app.whenReady();

    if (!this._developmentServer) {
      // handle any "electron://" requests and redirect them to "file://" URLs
      this.electron.protocol.registerFileProtocol("electron", (request, callback) => callback(this.parseElectronUrl(request.url))); // eslint-disable-line @typescript-eslint/no-var-requires
    }

    this._openWindow(windowOptions);
  }

  public static get isValid() { return this._ipc !== undefined; }

  /**
   * Initialize the backend of an Electron app.
   * This method configures the backend for all of the inter-process communication (RPC and IPC) for an
   * Electron app. It should be called from your Electron main function.
   * @param opts Options that control aspects of your backend.
   * @note This method must only be called from the backend of an Electron app (i.e. when [ProcessDetector.isElectronAppBackend]($bentley) is `true`).
   */
  public static async startup(opts?: ElectronHostOpts) {
    if (!ProcessDetector.isElectronAppBackend)
      throw new Error("Not running under Electron");

    if (!this.isValid) {
      this._electron = require("electron");
      this._ipc = new ElectronIpc();
      const app = this.app;
      if (!app.isReady())
        this.electron.protocol.registerSchemesAsPrivileged([{
          scheme: "electron",
          privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
          },
        }]);
      const eopt = opts?.electronHost;
      this._developmentServer = eopt?.developmentServer ?? false;
      const frontendPort = eopt?.frontendPort ?? 3000;
      this.webResourcesPath = eopt?.webResourcesPath ?? "";
      this.frontendURL = eopt?.frontendURL ?? (this._developmentServer ? `http://localhost:${frontendPort}` : `${this._electronFrontend}index.html`);
      this.appIconPath = path.join(this.webResourcesPath, eopt?.iconName ?? "appicon.ico");
      this.rpcConfig = ElectronRpcManager.initializeBackend(this._ipc, eopt?.rpcInterfaces);
    }

    opts = opts ?? {};
    opts.ipcHost = opts.ipcHost ?? {};
    opts.ipcHost.socket = this._ipc;
    await NativeHost.startup(opts);
    if (IpcHost.isValid) {
      ElectronDialogHandler.register();
      opts.electronHost?.ipcHandlers?.forEach((ipc) => ipc.register());
    }
  }
}

class ElectronDialogHandler extends IpcHandler {
  public get channelName() { return dialogChannel; }
  public async callDialog(method: DialogModuleMethod, ...args: any) {
    const dialog = ElectronHost.electron.dialog;
    const dialogMethod = dialog[method] as Function;
    if (typeof dialogMethod !== "function")
      throw new IModelError(IModelStatus.FunctionNotFound, `illegal electron dialog method`);

    return dialogMethod.call(dialog, ...args);
  }
}
