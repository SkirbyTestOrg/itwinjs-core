/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { OpenMode, assert } from "@bentley/bentleyjs-core";
import {
  BentleyCloudRpcManager,
  ElectronRpcConfiguration,
  ElectronRpcManager,
  IModelReadRpcInterface,
  IModelTileRpcInterface,
  IModelToken,
  RpcConfiguration,
  RpcOperation,
  SnapshotIModelRpcInterface,
  MobileRpcConfiguration,
  MobileRpcManager,
} from "@bentley/imodeljs-common";
import { Config, OidcFrontendClientConfiguration } from "@bentley/imodeljs-clients";
import {
  FrontendRequestContext,
  IModelApp,
  IModelConnection,
  OidcBrowserClient,
  RenderDiagnostics,
  RenderSystem,
  WebGLExtensionName,
} from "@bentley/imodeljs-frontend";
import { SimpleViewState } from "./SimpleViewState";
import { showStatus } from "./Utils";
import { SVTConfiguration } from "../common/SVTConfiguration";
import { DisplayTestApp } from "./App";
import { Viewer } from "./Viewer";
import SVTRpcInterface from "../common/SVTRpcInterface";
import { setTitle } from "./Title";

RpcConfiguration.developmentMode = true; // needed for snapshots in web apps

const activeViewState: SimpleViewState = new SimpleViewState();
const configuration = {} as SVTConfiguration;

// Retrieves the configuration for starting SVT from configuration.json file located in the built public folder
async function retrieveConfiguration(): Promise<void> {
  return new Promise<void>((resolve, _reject) => {
    if (MobileRpcConfiguration.isMobileFrontend) {
      const newConfigurationInfo = JSON.parse(window.localStorage.getItem("imodeljs:env")!);
      Object.assign(configuration, newConfigurationInfo);
      resolve();
    } else {
      const request: XMLHttpRequest = new XMLHttpRequest();
      request.open("GET", "configuration.json");
      request.setRequestHeader("Cache-Control", "no-cache");
      request.onreadystatechange = ((_event: Event) => {
        if (request.readyState === XMLHttpRequest.DONE) {
          if (request.status === 200) {
            const newConfigurationInfo: any = JSON.parse(request.responseText);
            Object.assign(configuration, newConfigurationInfo);
            resolve();
          }
        }
      });
      request.send();
    }
  });
}

// opens the configured iModel from disk
async function openSnapshotIModel(state: SimpleViewState, filename: string) {
  configuration.standalone = true;
  state.iModelConnection = await IModelConnection.openSnapshot(filename);
  configuration.iModelName = state.iModelConnection.name;
}

// If we are using a browser, close the current iModel before leaving
window.onbeforeunload = () => {
  if (activeViewState.iModelConnection !== undefined)
    if (configuration.standalone)
      activeViewState.iModelConnection.closeSnapshot(); // tslint:disable-line:no-floating-promises
    else {
      activeViewState.iModelConnection.close(); // tslint:disable-line:no-floating-promises
    }
};

async function initializeOidc(requestContext: FrontendRequestContext) {
  assert(!!activeViewState);
  if (activeViewState.oidcClient)
    return;

  const clientId = (ElectronRpcConfiguration.isElectron) ? Config.App.get("imjs_electron_test_client_id") : Config.App.get("imjs_browser_test_client_id");
  const redirectUri = (ElectronRpcConfiguration.isElectron) ? Config.App.get("imjs_electron_test_redirect_uri") : Config.App.get("imjs_browser_test_redirect_uri");
  const oidcConfig: OidcFrontendClientConfiguration = { clientId, redirectUri, scope: "openid email profile organization imodelhub context-registry-service imodeljs-router reality-data:read product-settings-service" };

  const oidcClient = new OidcBrowserClient(oidcConfig);
  await oidcClient.initialize(requestContext);
  activeViewState.oidcClient = oidcClient;
  IModelApp.authorizationClient = oidcClient;
}

// Wraps the signIn process
// - called the first time to start the signIn process - resolves to false
// - called the second time as the Authorization provider redirects to cause the application to refresh/reload - resolves to false
// - called the third time as the application redirects back to complete the authorization - finally resolves to true
// @return Promise that resolves to true only after signIn is complete. Resolves to false until then.
async function signIn(): Promise<boolean> {
  const requestContext = new FrontendRequestContext();
  await initializeOidc(requestContext);

  if (!activeViewState.oidcClient!.hasSignedIn) {
    await activeViewState.oidcClient!.signIn(new FrontendRequestContext());
    return false;
  }

  activeViewState.accessToken = await activeViewState.oidcClient!.getAccessToken(requestContext);
  return true;
}

// main entry point.
async function main() {
  // retrieve, set, and output the global configuration variable
  await retrieveConfiguration(); // (does a fetch)
  console.log("Configuration", JSON.stringify(configuration)); // tslint:disable-line:no-console

  // Start the app. (This tries to fetch a number of localization json files from the origin.)
  const renderSystemOptions: RenderSystem.Options = {
    disabledExtensions: configuration.disabledExtensions as WebGLExtensionName[],
    preserveShaderSourceCode: configuration.preserveShaderSourceCode,
    displaySolarShadows: configuration.displaySolarShadows,
  };

  if (configuration.disableInstancing)
    DisplayTestApp.tileAdminProps.enableInstancing = false;
  if (configuration.disableMagnification)
    DisplayTestApp.tileAdminProps.disableMagnification = true;

  DisplayTestApp.tileAdminProps.tileTreeExpirationTime = configuration.tileTreeExpirationSeconds;

  DisplayTestApp.startup({ renderSys: renderSystemOptions });
  if (configuration.enableDiagnostics)
    IModelApp.renderSystem.enableDiagnostics(RenderDiagnostics.All);

  // Choose RpcConfiguration based on whether we are in electron or browser
  let rpcConfiguration: RpcConfiguration;
  if (ElectronRpcConfiguration.isElectron) {
    rpcConfiguration = ElectronRpcManager.initializeClient({}, [IModelTileRpcInterface, SnapshotIModelRpcInterface, IModelReadRpcInterface, SVTRpcInterface]);
  } else if (MobileRpcConfiguration.isMobileFrontend) {
    rpcConfiguration = MobileRpcManager.initializeClient([IModelTileRpcInterface, SnapshotIModelRpcInterface, IModelReadRpcInterface, SVTRpcInterface]);
  } else {
    const uriPrefix = configuration.customOrchestratorUri || "http://localhost:3001";
    rpcConfiguration = BentleyCloudRpcManager.initializeClient({ info: { title: "SimpleViewApp", version: "v1.0" }, uriPrefix }, [IModelTileRpcInterface, SnapshotIModelRpcInterface, IModelReadRpcInterface, SVTRpcInterface]);
    // WIP: WebAppRpcProtocol seems to require an IModelToken for every RPC request. ECPresentation initialization tries to set active locale using
    // RPC without any imodel and fails...
    for (const definition of rpcConfiguration.interfaces())
      RpcOperation.forEach(definition, (operation) => operation.policy.token = (request) => (request.findTokenPropsParameter() || new IModelToken("test", "test", "test", "test", OpenMode.Readonly)));
  }

  if (!configuration.standalone && !configuration.customOrchestratorUri) {
    alert("Standalone iModel required. Set SVT_STANDALONE_FILENAME in environment");
    return;
  }

  const uiReady = displayUi(); // Get the browser started loading our html page and the svgs that it references but DON'T WAIT

  // while the browser is loading stuff, start work on logging in and downloading the imodel, etc.
  try {
    if ((!configuration.standalone || configuration.signInForStandalone) && !MobileRpcConfiguration.isMobileFrontend) {
      const signedIn: boolean = await signIn();
      if (!signedIn)
        return;
    }
    const iModelName = configuration.iModelName!;
    await openSnapshotIModel(activeViewState, iModelName);
    setTitle(iModelName);
    await uiReady; // Now wait for the HTML UI to finish loading.
    await initView();
  } catch (reason) {
    alert(reason);
    return;
  }
}

async function initView() {
  // open the specified view
  showStatus("opening View", configuration.viewName);
  await Viewer.create({
    iModel: activeViewState.iModelConnection!,
    defaultViewName: configuration.viewName,
    fileDirectoryPath: configuration.standalonePath,
  });

  showStatus("View Ready");
  hideSpinner();
}

// Set up the HTML UI elements and wire them to our functions
async function displayUi() {
  return new Promise(async (resolve) => {
    showSpinner();
    resolve();
  });
}

function showSpinner() {
  const spinner = document.getElementById("spinner") as HTMLElement;
  spinner.style.display = "block";
}

function hideSpinner() {
  const spinner = document.getElementById("spinner");
  if (spinner)
    spinner.style.display = "none";
}

// Entry point - run the main function
main(); // tslint:disable-line:no-floating-promises
