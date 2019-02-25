
/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { ActivityLoggingContext, Guid, OpenMode, StopWatch } from "@bentley/bentleyjs-core";
import { Config, AccessToken, HubIModel, Project, OidcFrontendClientConfiguration } from "@bentley/imodeljs-clients";
import {
  BentleyCloudRpcManager, DisplayStyleProps, ElectronRpcConfiguration, ElectronRpcManager, IModelReadRpcInterface,
  IModelTileRpcInterface, IModelToken, RpcConfiguration, RpcOperation, RenderMode, StandaloneIModelRpcInterface,
  ViewDefinitionProps, ViewFlag, MobileRpcConfiguration, MobileRpcManager,
} from "@bentley/imodeljs-common";
import { ConnectProjectConfiguration, SVTConfiguration } from "../common/SVTConfiguration";
import DisplayPerfRpcInterface from "../common/DisplayPerfRpcInterface";
import { DisplayStyleState, DisplayStyle3dState, IModelApp, IModelConnection, Viewport, ViewState, ScreenViewport, OidcClientWrapper, PerformanceMetrics, Target } from "@bentley/imodeljs-frontend";
import { IModelApi } from "./IModelApi";
import { initializeIModelHub } from "./ConnectEnv";

// Retrieve default config data from json file
async function getDefaultConfigs(): Promise<string> {
  return DisplayPerfRpcInterface.getClient().getDefaultConfigs();
}

async function saveCsv(outputPath: string, outputName: string, rowData: Map<string, number | string>): Promise<void> {
  return DisplayPerfRpcInterface.getClient().saveCsv(outputPath, outputName, rowData);
}

const wantConsoleOutput: boolean = false;
function debugPrint(msg: string): void {
  if (wantConsoleOutput)
    console.log(msg); // tslint:disable-line
}

async function resolveAfterXMilSeconds(ms: number) { // must call await before this function!!!
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

function removeFilesFromDir(_startPath: string, _filter: string) {
  // if (!fs.existsSync(startPath))
  //   return;
  // const files = fs.readdirSync(startPath);
  // files.forEach((file) => {
  //   const filename = path.join(startPath, file);
  //   if (fs.lstatSync(filename).isDirectory()) {
  //     removeFilesFromDir(filename, filter); // recurse
  //   } else if (filename.indexOf(filter) >= 0) {
  //     debugPrint("deleting file " + filename);
  //     fs.unlinkSync(filename); // Delete file
  //   }
  // });
}

function combineFilePaths(additionalPath: string, initPath?: string) {
  if (initPath === undefined || additionalPath[1] === ":") // if additionalPath is full path (like D:), ignore the initial path
    return additionalPath;
  let combined = initPath;
  while (combined.endsWith("\\") || combined.endsWith("\/"))
    combined = combined.slice(0, -1);
  if (additionalPath[0] !== "\\" && additionalPath[0] !== "\/")
    combined += "\\";
  combined += additionalPath;
  return combined;
}

function setViewFlagOverrides(vf: any, vfo?: ViewFlag.Overrides): ViewFlag.Overrides {
  if (!vfo) vfo = new ViewFlag.Overrides();
  if (vf) {
    if (vf.hasOwnProperty("dimensions"))
      vfo.setShowDimensions(vf.dimensions);
    if (vf.hasOwnProperty("patterns"))
      vfo.setShowPatterns(vf.patterns);
    if (vf.hasOwnProperty("weights"))
      vfo.setShowWeights(vf.weights);
    if (vf.hasOwnProperty("styles"))
      vfo.setShowStyles(vf.styles);
    if (vf.hasOwnProperty("transparency"))
      vfo.setShowTransparency(vf.transparency);
    if (vf.hasOwnProperty("fill"))
      vfo.setShowFill(vf.fill);
    if (vf.hasOwnProperty("textures"))
      vfo.setShowTextures(vf.textures);
    if (vf.hasOwnProperty("materials"))
      vfo.setShowMaterials(vf.materials);
    if (vf.hasOwnProperty("visibleEdges"))
      vfo.setShowVisibleEdges(vf.visibleEdges);
    if (vf.hasOwnProperty("hiddenEdges"))
      vfo.setShowHiddenEdges(vf.hiddenEdges);
    if (vf.hasOwnProperty("sourceLights"))
      vfo.setShowSourceLights(vf.sourceLights);
    if (vf.hasOwnProperty("cameraLights"))
      vfo.setShowCameraLights(vf.cameraLights);
    if (vf.hasOwnProperty("solarLights"))
      vfo.setShowSolarLight(vf.solarLights);
    if (vf.hasOwnProperty("shadows"))
      vfo.setShowShadows(vf.shadows);
    if (vf.hasOwnProperty("clipVolume"))
      vfo.setShowClipVolume(vf.clipVolume);
    if (vf.hasOwnProperty("constructions"))
      vfo.setShowConstructions(vf.constructions);
    if (vf.hasOwnProperty("monochrome"))
      vfo.setMonochrome(vf.monochrome);
    if (vf.hasOwnProperty("noGeometryMap"))
      vfo.setIgnoreGeometryMap(vf.noGeometryMap);
    if (vf.hasOwnProperty("backgroundMap"))
      vfo.setShowBackgroundMap(vf.backgroundMap);
    if (vf.hasOwnProperty("hLineMaterialColors"))
      vfo.setUseHlineMaterialColors(vf.hLineMaterialColors);
    if (vf.hasOwnProperty("edgeMask"))
      vfo.setEdgeMask(Number(vf.edgeMask));

    if (vf.hasOwnProperty("renderMode")) {
      const rm: string = vf.renderMode.toString();
      switch (rm.toLowerCase().trim()) {
        case "wireframe":
          vfo.setRenderMode(RenderMode.Wireframe);
          break;
        case "hiddenline":
          vfo.setRenderMode(RenderMode.HiddenLine);
          break;
        case "solidfill":
          vfo.setRenderMode(RenderMode.SolidFill);
          break;
        case "smoothshade":
          vfo.setRenderMode(RenderMode.SmoothShade);
          break;
        case "0":
          vfo.setRenderMode(RenderMode.Wireframe);
          break;
        case "3":
          vfo.setRenderMode(RenderMode.HiddenLine);
          break;
        case "4":
          vfo.setRenderMode(RenderMode.SolidFill);
          break;
        case "6":
          vfo.setRenderMode(RenderMode.SmoothShade);
          break;
      }
    }
  }
  return vfo;
}

function getRenderMode(): string {
  switch (activeViewState.viewState!.displayStyle.viewFlags.renderMode) {
    case 0: return "Wireframe";
    case 3: return "HiddenLine";
    case 4: return "SolidFill";
    case 6: return "SmoothShade";
    default: return "";
  }
}

function getViewFlagsString(): string {
  const vf = activeViewState.viewState!.displayStyle.viewFlags;
  let vfString = "";
  if (!vf.dimensions) vfString += "-dim";
  if (!vf.patterns) vfString += "-pat";
  if (!vf.weights) vfString += "-wt";
  if (!vf.styles) vfString += "-sty";
  if (!vf.transparency) vfString += "-trn";
  if (!vf.fill) vfString += "-fll";
  if (!vf.textures) vfString += "-txt";
  if (!vf.materials) vfString += "-mat";
  if (vf.visibleEdges) vfString += "+vsE";
  if (vf.hiddenEdges) vfString += "+hdE";
  if (vf.sourceLights) vfString += "+scL";
  if (vf.cameraLights) vfString += "+cmL";
  if (vf.solarLight) vfString += "+slL";
  if (vf.shadows) vfString += "+shd";
  if (!vf.clipVolume) vfString += "-clp";
  if (vf.constructions) vfString += "+con";
  if (vf.monochrome) vfString += "+mno";
  if (vf.noGeometryMap) vfString += "+noG";
  if (vf.backgroundMap) vfString += "+bkg";
  if (vf.hLineMaterialColors) vfString += "+hln";
  if (vf.edgeMask === 1) vfString += "+genM";
  if (vf.edgeMask === 2) vfString += "+useM";
  if (vf.ambientOcclusion) vfString += "+ao";
  return vfString;
}

async function waitForTilesToLoad(modelLocation?: string) {
  if (modelLocation) {
    removeFilesFromDir(modelLocation, ".Tiles");
    removeFilesFromDir(modelLocation, ".TileCache");
  }

  theViewport!.continuousRendering = false;

  // Start timer for tile loading time
  const timer = new StopWatch(undefined, true);
  let haveNewTiles = true;
  while (haveNewTiles) {
    theViewport!.sync.setRedrawPending;
    theViewport!.sync.invalidateScene();
    theViewport!.renderFrame();

    const sceneContext = theViewport!.createSceneContext();
    activeViewState.viewState!.createScene(sceneContext);
    sceneContext.requestMissingTiles();

    // The scene is ready when (1) all required TileTree roots have been created and (2) all required tiles have finished loading
    haveNewTiles = !(activeViewState.viewState!.areAllTileTreesLoaded) || sceneContext.hasMissingTiles || 0 < sceneContext.missingTiles.size;

    // NB: The viewport is NOT added to the ViewManager's render loop, therefore we must manually pump the tile request scheduler...
    if (haveNewTiles)
      IModelApp.tileAdmin.process();

    // debugPrint(haveNewTiles ? "Awaiting tile loads..." : "...All tiles loaded.");

    await resolveAfterXMilSeconds(100);
  }
  theViewport!.continuousRendering = false;
  theViewport!.renderFrame();
  timer.stop();
  curTileLoadingTime = timer.current.milliseconds;
}

function getRowData(finalFrameTimings: Array<Map<string, number>>, configs: DefaultConfigs): Map<string, number | string> {
  const rowData = new Map<string, number | string>();
  rowData.set("iModel", configs.iModelName!);
  rowData.set("View", configs.viewName!);
  rowData.set("Screen Size", configs.view!.width + "X" + configs.view!.height);
  rowData.set("Display Style", activeViewState.viewState!.displayStyle.name);
  rowData.set("Render Mode", getRenderMode());
  rowData.set("View Flags", " " + getViewFlagsString());
  rowData.set("Tile Loading Time", curTileLoadingTime);

  // Calculate average timings
  for (const colName of finalFrameTimings[0].keys()) {
    let sum = 0;
    finalFrameTimings.forEach((timing) => {
      const data = timing!.get(colName);
      sum += data ? data : 0;
    });
    rowData.set(colName, sum / finalFrameTimings.length);
  }
  rowData.set("Effective FPS", (1000.0 / Number(rowData.get("Total Time w/ GPU"))).toFixed(2));
  return rowData;
}

function getImageString(configs: DefaultConfigs): string {
  let output = configs.outputPath ? configs.outputPath : "";
  const lastChar = output[output.length - 1];
  if (lastChar !== "/" && lastChar !== "\\")
    output += "\\";
  output += configs.iModelName ? configs.iModelName.replace(/\.[^/.]+$/, "") : "";
  output += configs.viewName ? "_" + configs.viewName : "";
  output += configs.displayStyle ? "_" + configs.displayStyle.trim() : "";
  output += getRenderMode() ? "_" + getRenderMode() : "";
  output += getViewFlagsString() !== "" ? "_" + getViewFlagsString() : "";
  output += ".png";
  return output;
}

async function savePng(fileName: string): Promise<void> {
  if (theViewport && theViewport.canvas) {
    const img = theViewport.canvas.toDataURL("image/png"); // System.instance.canvas.toDataURL("image/png");
    const data = img.replace(/^data:image\/\w+;base64,/, ""); // strip off the data: url prefix to get just the base64-encoded bytes
    return DisplayPerfRpcInterface.getClient().savePng(fileName, data);
  }
}

class ViewSize {
  public width: number;
  public height: number;

  constructor(w = 0, h = 0) { this.width = w; this.height = h; }
}

class DefaultConfigs {
  public view?: ViewSize;
  public outputName?: string;
  public outputPath?: string;
  public iModelLocation?: string;
  public iModelName?: string;
  public iModelHubProject?: string;
  public viewName?: string;
  public testType?: string;
  public displayStyle?: string;
  public viewFlags?: ViewFlag.Overrides;
  public aoEnabled = false;

  public constructor(jsonData: any, prevConfigs?: DefaultConfigs, useDefaults = false) {
    if (useDefaults) {
      this.view = new ViewSize(1000, 1000);
      this.outputName = "performanceResults.csv";
      this.outputPath = "D:\\output\\performanceData\\";
      this.iModelName = "Wraith.ibim";
      this.iModelHubProject = "DisplayPerformanceTest";
      this.viewName = "V0";
      this.testType = "timing";
    }
    if (prevConfigs !== undefined) {
      if (prevConfigs.view) this.view = new ViewSize(prevConfigs.view.width, prevConfigs.view.height);
      if (prevConfigs.outputName) this.outputName = prevConfigs.outputName;
      if (prevConfigs.outputPath) this.outputPath = prevConfigs.outputPath;
      if (prevConfigs.iModelLocation) this.iModelLocation = prevConfigs.iModelLocation;
      if (prevConfigs.iModelName) this.iModelName = prevConfigs.iModelName;
      if (prevConfigs.iModelHubProject) this.iModelHubProject = prevConfigs.iModelHubProject;
      if (prevConfigs.viewName) this.viewName = prevConfigs.viewName;
      if (prevConfigs.testType) this.testType = prevConfigs.testType;
      if (prevConfigs.displayStyle) this.displayStyle = prevConfigs.displayStyle;
      if (prevConfigs.viewFlags) this.viewFlags = prevConfigs.viewFlags;
    } else if (jsonData.argOutputPath)
      this.outputPath = jsonData.argOutputPath;
    if (jsonData.view) this.view = new ViewSize(jsonData.view.width, jsonData.view.height);
    if (jsonData.outputName) this.outputName = jsonData.outputName;
    if (jsonData.outputPath) this.outputPath = combineFilePaths(jsonData.outputPath, this.outputPath);
    if (jsonData.iModelLocation) this.iModelLocation = combineFilePaths(jsonData.iModelLocation, this.iModelLocation);
    if (jsonData.iModelName) this.iModelName = jsonData.iModelName;
    if (jsonData.iModelHubProject) this.iModelHubProject = jsonData.iModelHubProject;
    if (jsonData.viewName) this.viewName = jsonData.viewName;
    if (jsonData.testType) this.testType = jsonData.testType;
    if (jsonData.displayStyle) this.displayStyle = jsonData.displayStyle;
    if (jsonData.viewFlags) this.viewFlags = setViewFlagOverrides(jsonData.viewFlags, this.viewFlags);
    this.aoEnabled = undefined !== jsonData.viewFlags && !!jsonData.viewFlags.ambientOcclusion;

    debugPrint("view: " + this.view ? (this.view!.width + "X" + this.view!.height) : "undefined");
    debugPrint("outputFile: " + this.outputFile);
    debugPrint("outputName: " + this.outputName);
    debugPrint("outputPath: " + this.outputPath);
    debugPrint("iModelFile: " + this.iModelFile);
    debugPrint("iModelLocation: " + this.iModelLocation);
    debugPrint("iModelName: " + this.iModelName);
    debugPrint("iModelHubProject: " + this.iModelHubProject);
    debugPrint("viewName: " + this.viewName);
    debugPrint("testType: " + this.testType);
    debugPrint("displayStyle: " + this.displayStyle);
    debugPrint("viewFlags: " + this.viewFlags);
  }

  private createFullFilePath(filePath: string | undefined, fileName: string | undefined): string | undefined {
    if (fileName === undefined)
      return undefined;
    if (filePath === undefined)
      return fileName;
    else {
      let output = filePath;
      const lastChar = output[output.length - 1];
      debugPrint("lastChar: " + lastChar);
      if (lastChar !== "/" && lastChar !== "\\")
        output += "\\";
      return output + fileName;
    }
  }
  public get iModelFile() { return this.createFullFilePath(this.iModelLocation, this.iModelName); }
  public get outputFile() { return this.createFullFilePath(this.outputPath, this.outputName); }
}

class SimpleViewState {
  public accessToken?: AccessToken;
  public project?: Project;
  public iModel?: HubIModel;
  public iModelConnection?: IModelConnection;
  public viewDefinition?: ViewDefinitionProps;
  public viewState?: ViewState;
  public viewPort?: Viewport;
  public projectConfig?: ConnectProjectConfiguration;
  constructor() { }
}

let theViewport: ScreenViewport | undefined;
let activeViewState: SimpleViewState = new SimpleViewState();
let curTileLoadingTime = 0;

async function _changeView(view: ViewState) {
  theViewport!.changeView(view);
  activeViewState.viewState = view;
}

// opens the view and connects it to the HTML canvas element.
async function openView(state: SimpleViewState, viewSize: ViewSize) {
  if (undefined !== theViewport) {
    theViewport.dispose();
    theViewport = undefined;
  }

  // find the canvas.
  const vpDiv = document.getElementById("imodel-viewport") as HTMLDivElement;

  if (vpDiv) {
    vpDiv.style.width = String(viewSize.width) + "px";
    vpDiv.style.height = String(viewSize.height) + "px";
    theViewport = ScreenViewport.create(vpDiv, state.viewState!);
    debugPrint("theViewport: " + theViewport);
    const canvas = theViewport.canvas as HTMLCanvasElement;
    debugPrint("canvas: " + canvas);
    canvas.style.width = String(viewSize.width) + "px";
    canvas.style.height = String(viewSize.height) + "px";
    theViewport.continuousRendering = false;
    theViewport.sync.setRedrawPending;
    (theViewport!.target as Target).performanceMetrics = new PerformanceMetrics(true, false);
    await _changeView(state.viewState!);
  }
}

async function initializeOidc(actx: ActivityLoggingContext) {
  actx.enter();
  const clientId = Config.App.get((ElectronRpcConfiguration.isElectron) ? "imjs_electron_test_client_id" : "imjs_browser_test_client_id");
  const redirectUri = Config.App.get((ElectronRpcConfiguration.isElectron) ? "imjs_electron_test_redirect_uri" : "imjs_browser_test_redirect_uri");
  const oidcConfig: OidcFrontendClientConfiguration = { clientId, redirectUri, scope: "openid email profile organization imodelhub context-registry-service imodeljs-router reality-data:read" };

  await OidcClientWrapper.initialize(actx, oidcConfig);
  actx.enter();

  OidcClientWrapper.oidcClient.onUserStateChanged.addListener((accessToken: AccessToken | undefined) => {
    activeViewState.accessToken = accessToken;
  });
  activeViewState.accessToken = await OidcClientWrapper.oidcClient.getAccessToken(actx);
  actx.enter();
}

// Retrieves the configuration for which project and imodel to open from connect-configuration.json file located in the built public folder
async function retrieveProjectConfiguration(): Promise<void> {
  return new Promise<void>((resolve, _reject) => {
    const request: XMLHttpRequest = new XMLHttpRequest();
    request.open("GET", "connect-configuration.json", false);
    request.setRequestHeader("Cache-Control", "no-cache");
    request.onreadystatechange = ((_event: Event) => {
      if (request.readyState === XMLHttpRequest.DONE) {
        if (request.status === 200) {
          activeViewState.projectConfig = JSON.parse(request.responseText);
          resolve();
        }
      }
    });
    request.send();
  });
}

async function loadIModel(testConfig: DefaultConfigs) {
  activeViewState = new SimpleViewState();
  activeViewState.viewState;

  // Open an iModel from a local file
  let openLocalIModel = (testConfig.iModelLocation !== undefined);
  if (openLocalIModel) {
    try {
      activeViewState.iModelConnection = await IModelConnection.openStandalone(testConfig.iModelFile!);
    } catch (err) {
      debugPrint("openStandalone on local iModel failed: " + err.toString());
      openLocalIModel = false;
    }
  }

  // Open an iModel from the iModelHub
  if (!openLocalIModel && testConfig.iModelHubProject !== undefined) {
    const actx = new ActivityLoggingContext(Guid.createValue());
    actx.enter();

    // Connected to hub
    await initializeOidc(actx);
    actx.enter();

    if (!activeViewState.accessToken)
      OidcClientWrapper.oidcClient.signIn(actx);
    else {
      await retrieveProjectConfiguration();
      activeViewState.projectConfig!.projectName = testConfig.iModelHubProject;
      activeViewState.projectConfig!.iModelName = testConfig.iModelName!.replace(".ibim", "").replace(".bim", "");
      await initializeIModelHub(activeViewState);
      activeViewState.iModel = await IModelApi.getIModelByName(activeViewState.accessToken!, activeViewState.project!.wsgId, activeViewState.projectConfig!.iModelName);
      if (activeViewState.iModel === undefined)
        throw new Error(`${activeViewState.projectConfig!.iModelName} - IModel not found in project ${activeViewState.project!.name}`);
      activeViewState.iModelConnection = await IModelApi.openIModel(activeViewState.accessToken!, activeViewState.project!.wsgId, activeViewState.iModel!.wsgId, undefined, OpenMode.Readonly);
    }
  }

  // open the specified view
  await loadView(activeViewState, testConfig.viewName!);

  // now connect the view to the canvas
  await openView(activeViewState, testConfig.view!);
  // assert(theViewport !== undefined, "ERROR: theViewport is undefined");

  // Set the display style
  const iModCon = activeViewState.iModelConnection;
  if (iModCon && testConfig.displayStyle) {
    const displayStyleProps = await iModCon.elements.queryProps({ from: DisplayStyleState.sqlName, where: "CodeValue = '" + testConfig.displayStyle + "'" });
    if (displayStyleProps.length >= 1)
      theViewport!.view.setDisplayStyle(new DisplayStyle3dState(displayStyleProps[0] as DisplayStyleProps, iModCon));
  }

  // Set the viewFlags (including the render mode)
  if (undefined !== activeViewState.viewState) {
    activeViewState.viewState.displayStyle.viewFlags.ambientOcclusion = testConfig.aoEnabled;
    if (testConfig.viewFlags)
      testConfig.viewFlags.apply(activeViewState.viewState.displayStyle.viewFlags);
  }

  // Load all tiles
  await waitForTilesToLoad(testConfig.iModelLocation);
}

async function closeIModel(standalone: boolean) {
  debugPrint("start closeIModel" + activeViewState.iModelConnection);
  if (activeViewState.iModelConnection) {
    if (standalone)
      await activeViewState.iModelConnection.closeStandalone();
    else
      await activeViewState.iModelConnection!.close(activeViewState.accessToken!);
  }

  debugPrint("end closeIModel");
}

async function runTest(testConfig: DefaultConfigs) {
  // Open and finish loading model
  await loadIModel(testConfig);

  if (testConfig.testType === "image" || testConfig.testType === "both")
    await savePng(getImageString(testConfig));

  if (testConfig.testType === "timing" || testConfig.testType === "both") {
    // Throw away the first n renderFrame times, until it's more consistent
    for (let i = 0; i < 15; ++i) {
      theViewport!.sync.setRedrawPending();
      theViewport!.renderFrame();
    }

    // Add a pause so that user can start the GPU Performance Capture program
    // await resolveAfterXMilSeconds(7000);

    const finalFrameTimings: Array<Map<string, number>> = [];
    const timer = new StopWatch(undefined, true);
    const numToRender = 50;
    for (let i = 0; i < numToRender; ++i) {
      theViewport!.sync.setRedrawPending();
      theViewport!.renderFrame();
      finalFrameTimings[i] = (theViewport!.target as Target).performanceMetrics!.frameTimings;
    }
    timer.stop();
    if (wantConsoleOutput) {
      debugPrint("------------ Elapsed Time: " + timer.elapsed.milliseconds + " = " + timer.elapsed.milliseconds / numToRender + "ms per frame");
      debugPrint("Tile Loading Time: " + curTileLoadingTime);
      for (const t of finalFrameTimings) {
        let timingsString = "[";
        t.forEach((val) => {
          timingsString += val + ", ";
        });
        debugPrint(timingsString + "]");
      }
    }
    const rowData = getRowData(finalFrameTimings, testConfig);
    await saveCsv(testConfig.outputPath!, testConfig.outputName!, rowData);
  }

  // Close the imodel
  await closeIModel(testConfig.iModelLocation !== undefined);
}

// selects the configured view.
async function loadView(state: SimpleViewState, viewName: string) {
  const viewIds = await state.iModelConnection!.elements.queryIds({ from: ViewState.sqlName, where: "CodeValue = '" + viewName + "'" });
  if (1 === viewIds.size)
    state.viewState = await state.iModelConnection!.views.load(viewIds.values().next().value);

  if (undefined === state.viewState)
    debugPrint("Error: failed to load view by name");
}

async function testModel(configs: DefaultConfigs, modelData: any) {
  // Create DefaultModelConfigs
  const modConfigs = new DefaultConfigs(modelData, configs);

  // Perform all tests for this model
  for (const testData of modelData.tests) {
    if (configs.iModelLocation) removeFilesFromDir(configs.iModelLocation, ".Tiles");
    if (configs.iModelLocation) removeFilesFromDir(configs.iModelLocation, ".TileCache");

    // Create DefaultTestConfigs
    const testConfig = new DefaultConfigs(testData, modConfigs, true);

    // Ensure imodel file exists
    // if (!fs.existsSync(testConfig.iModelFile!))
    //   break;

    await runTest(testConfig);
  }
  if (configs.iModelLocation) removeFilesFromDir(configs.iModelLocation, ".Tiles");
  if (configs.iModelLocation) removeFilesFromDir(configs.iModelLocation, ".TileCache");
}

async function main() {
  IModelApp.startup();

  // Retrieve DefaultConfigs
  const defaultConfigStr = await getDefaultConfigs();
  const jsonData = JSON.parse(defaultConfigStr);
  for (const i in jsonData.testSet) {
    if (i) {
      const modelData = jsonData.testSet[i];
      await testModel(new DefaultConfigs(jsonData), modelData);
    }
  }

  const topdiv = document.getElementById("topdiv")!;
  topdiv.style.display = "block";
  topdiv.innerText = "Tests Completed.";

  document.getElementById("imodel-viewport")!.style.display = "hidden";

  DisplayPerfRpcInterface.getClient().finishTest(); // tslint:disable-line:no-floating-promises

  IModelApp.shutdown();
}

window.onload = () => {
  const configuration = {} as SVTConfiguration;

  // Choose RpcConfiguration based on whether we are in electron or browser
  let rpcConfiguration: RpcConfiguration;
  if (ElectronRpcConfiguration.isElectron) {
    rpcConfiguration = ElectronRpcManager.initializeClient({}, [DisplayPerfRpcInterface, IModelTileRpcInterface, StandaloneIModelRpcInterface, IModelReadRpcInterface]);
  } else if (MobileRpcConfiguration.isMobileFrontend) {
    rpcConfiguration = MobileRpcManager.initializeClient([DisplayPerfRpcInterface, IModelTileRpcInterface, StandaloneIModelRpcInterface, IModelReadRpcInterface]);
  } else {
    const uriPrefix = configuration.customOrchestratorUri || "http://localhost:3001";
    rpcConfiguration = BentleyCloudRpcManager.initializeClient({ info: { title: "DisplayPerformanceTestApp", version: "v1.0" }, uriPrefix }, [DisplayPerfRpcInterface, IModelTileRpcInterface, StandaloneIModelRpcInterface, IModelReadRpcInterface]);

    // WIP: WebAppRpcProtocol seems to require an IModelToken for every RPC request. ECPresentation initialization tries to set active locale using
    // RPC without any imodel and fails...
    for (const definition of rpcConfiguration.interfaces())
      RpcOperation.forEach(definition, (operation) => operation.policy.token = (_request) => new IModelToken("test", "test", "test", "test", OpenMode.Readonly));
  }

  main(); // tslint:disable-line:no-floating-promises
};
