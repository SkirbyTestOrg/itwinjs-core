/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as electron from "electron";
import { AuthStatus, BentleyError, ClientRequestContext, Logger } from "@bentley/bentleyjs-core";
import { DesktopAuthorizationClient, IModelHost } from "@bentley/imodeljs-backend";
import { DesktopAuthorizationClientConfiguration } from "@bentley/imodeljs-common";
import { AccessToken } from "@bentley/itwin-client";
import { ElectronManagerLoggerCategory } from "./ElectronManagerLoggerCategory";

const { ipcMain: ipc } = electron;

const loggerCategory: string = ElectronManagerLoggerCategory.Authorization;

/**
 * Utility to handle IPC calls for authorization in desktop applications
 * @internal
 */
export class DesktopAuthorizationClientIpc {
  private static _desktopAuthorizationClient?: DesktopAuthorizationClient;

  /** Wrapper around event.sender.send to add log traces */
  private static ipcReply(event: electron.IpcMainEvent, message: string, err: Error | null, ...args: any[]) {
    if (err)
      Logger.logTrace(loggerCategory, "DesktopAuthorizationClientIpc replies with error message", () => (err));
    else
      Logger.logTrace(loggerCategory, "DesktopAuthorizationClientIpc replies with success message", () => ({ message }));

    event.sender.send(message, err, ...args);
  }

  /** Wrapper around mainWindow.webContents.send to add log traces */
  private static ipcSend(mainWindow: electron.BrowserWindow, message: string, ...args: any[]) {
    Logger.logTrace(loggerCategory, "DesktopAuthorizationClientIpc sends message", () => ({ message }));
    mainWindow.webContents.send(message, ...args);
  }

  /** Wrapper around ipc.on to add log traces */
  private static ipcOn(message: string, fn: any) {
    Logger.logTrace(loggerCategory, "DesktopAuthorizationClientIpc receives message", () => ({ message }));
    ipc.on(message, fn);
  }

  /** Get the desktop client */
  public static get desktopAuthorizationClient(): DesktopAuthorizationClient | undefined {
    return this._desktopAuthorizationClient;
  }

  private static createRequestContext(requestContext: ClientRequestContext): ClientRequestContext {
    return new ClientRequestContext(requestContext.activityId, requestContext.applicationId, requestContext.applicationVersion, requestContext.sessionId);
  }

  /** Initialize the IPC communication for DesktopAuthorizationClient */
  public static initializeIpc(mainWindow: electron.BrowserWindow) {
    this.ipcOn("DesktopAuthorizationClient.initialize", async (event: electron.IpcMainEvent, requestContextObj: ClientRequestContext, configuration: DesktopAuthorizationClientConfiguration) => {
      const requestContext = this.createRequestContext(requestContextObj);
      requestContext.enter();
      try {
        this._desktopAuthorizationClient = new DesktopAuthorizationClient(configuration);
        this._desktopAuthorizationClient.onUserStateChanged.addListener((token: AccessToken | undefined) => {
          this.ipcSend(mainWindow, "DesktopAuthorizationClient.onUserStateChanged", token);
        });
        await this._desktopAuthorizationClient.initialize(requestContext);

        /*
         * Set up the authorizationClient at the backend so that code at the backend can use it to fetch the access token, or construct the required
         * RequestContext (AuthorizedBackendRequestContext). Note that this would have the side effect of backend code using this to retrieve tokens, rather than use
         * the tokens passed in from the frontend, but that should not matter since the clients at the frontend and backend in the electron case is exactly the same.
         */
        IModelHost.authorizationClient = this._desktopAuthorizationClient;

        this.ipcReply(event, "DesktopAuthorizationClient.initialize:complete", null);
      } catch (err) {
        this.ipcReply(event, "DesktopAuthorizationClient.initialize:complete", err);
      }
    });

    this.ipcOn("DesktopAuthorizationClient.signIn", async (event: electron.IpcMainEvent, requestContextObj: ClientRequestContext) => {
      const requestContext = this.createRequestContext(requestContextObj);
      requestContext.enter();
      if (!this._desktopAuthorizationClient) {
        this.ipcReply(event, "DesktopAuthorizationClient.signIn:complete", new BentleyError(AuthStatus.Error, "Not initialized. First call initialize()", Logger.logError, loggerCategory));
        return;
      }

      try {
        await this._desktopAuthorizationClient.signIn(requestContext);
        this.ipcReply(event, "DesktopAuthorizationClient.signIn:complete", null);
      } catch (err) {
        this.ipcReply(event, "DesktopAuthorizationClient.signIn:complete", err);
      }
    });

    this.ipcOn("DesktopAuthorizationClient.signOut", async (event: electron.IpcMainEvent, requestContextObj: ClientRequestContext) => {
      const requestContext = this.createRequestContext(requestContextObj);
      requestContext.enter();
      if (!this._desktopAuthorizationClient) {
        this.ipcReply(event, "DesktopAuthorizationClient.signOut:complete", new BentleyError(AuthStatus.Error, "Not initialized. First call initialize()", Logger.logError, loggerCategory));
        return;
      }

      try {
        await this._desktopAuthorizationClient.signOut(requestContext);
        this.ipcReply(event, "DesktopAuthorizationClient.signOut:complete", null);
      } catch (err) {
        this.ipcReply(event, "DesktopAuthorizationClient.signOut:complete", err);
      }
    });

    this.ipcOn("DesktopAuthorizationClient.getAccessToken", async (event: electron.IpcMainEvent, requestContextObj: ClientRequestContext) => {
      const requestContext = this.createRequestContext(requestContextObj);
      requestContext.enter();
      if (!this._desktopAuthorizationClient) {
        this.ipcReply(event, "DesktopAuthorizationClient.getAccessToken:complete", new BentleyError(AuthStatus.Error, "Not initialized. First call initialize()", Logger.logError, loggerCategory));
        return;
      }

      try {
        const token = await this._desktopAuthorizationClient.getAccessToken(requestContext);
        this.ipcReply(event, "DesktopAuthorizationClient.getAccessToken:complete", null, token);
      } catch (err) {
        this.ipcReply(event, "DesktopAuthorizationClient.getAccessToken:complete", err);
      }
    });
  }
}
