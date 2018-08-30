/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { ViewState, SceneContext, TileRequests } from "@bentley/imodeljs-frontend";
import { ViewDefinitionProps, ViewFlag, RenderMode } from "@bentley/imodeljs-common";
import { AccessToken, Project, IModelRepository } from "@bentley/imodeljs-clients";
import { PerformanceWriterClient } from "./PerformanceWriterClient";
import { IModelConnection, IModelApp, Viewport } from "@bentley/imodeljs-frontend";
import { Target, PerformanceMetrics/*, System*/ } from "@bentley/imodeljs-frontend/lib/rendering";
import { IModelApi } from "./IModelApi";
import { ProjectApi } from "./ProjectApi";
// import { CONSTANTS } from "../../common/Testbed";
// import * as path from "path";
import { StopWatch } from "@bentley/bentleyjs-core";
import { addColumnsToCsvFile, addDataToCsvFile, createNewCsvFile } from "./CsvWriter";
import * as fs from "fs";
import * as path from "path";

const resultsLocation = "D:\\output\\performanceData\\";
const resultsFileName = "performanceResults_new.csv";
const modelsLocation = "D:\\models\\TimingTests\\";
let jsonFile: any;

// const iModelLocation = path.join(CONSTANTS.IMODELJS_CORE_DIRNAME, "test-apps/testbed/frontend/performance/imodels/");
// const glContext: WebGLRenderingContext | null = null;

const wantConsoleOutput: boolean = false;
function debugPrint(msg: string): void {
  if (wantConsoleOutput)
    console.log(msg); // tslint:disable-line
}

function resolveAfterXMilSeconds(ms: number) { // must call await before this function!!!
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

function removeFilesFromDir(startPath: string, filter: string) {
  if (!fs.existsSync(startPath))
    return;
  const files = fs.readdirSync(startPath);
  files.forEach((file) => {
    const filename = path.join(startPath, file);
    if (fs.lstatSync(filename).isDirectory()) {
      removeFilesFromDir(filename, filter); // recurse
    } else if (filename.indexOf(filter) >= 0) {
      debugPrint("deleting file " + filename);
      fs.unlinkSync(filename); // Delete file
    }
  });
}

function readJsonFile() {
  const jsonStr = fs.readFileSync("frontend\\performance\\DefaultConfig.json").toString();
  jsonFile = JSON.parse(jsonStr);
}

function setViewFlagOverrides(config: any): ViewFlag.Overrides {
  const vfo = new ViewFlag.Overrides();
  const vf = config.viewFlags;
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
  }

  const rm: string = config.renderMode.toString();
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
  let vfString = " ";
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
  return vfString;
}

function createWindow() {
  const canv = document.createElement("canvas");
  canv.id = "imodelview";
  document.body.appendChild(canv);
}

async function waitForTilesToLoad() {
  removeFilesFromDir(modelsLocation, ".Tiles");
  removeFilesFromDir(modelsLocation, ".TileCache");

  theViewport!.continuousRendering = false;

  // Start timer for tile loading time
  const timer = new StopWatch(undefined, true);
  let haveNewTiles = true;
  while (haveNewTiles) {
    theViewport!.sync.setRedrawPending;
    theViewport!.sync.invalidateScene();
    theViewport!.renderFrame();

    const requests = new TileRequests();
    const sceneContext = new SceneContext(theViewport!, requests);
    activeViewState.viewState!.createScene(sceneContext);
    requests.requestMissing();

    // The scene is ready when (1) all required TileTree roots have been created and (2) all required tiles have finished loading
    haveNewTiles = !(activeViewState.viewState!.areAllTileTreesLoaded) || requests.hasMissingTiles;
    // debugPrint(haveNewTiles ? "Awaiting tile loads..." : "...All tiles loaded.");

    await resolveAfterXMilSeconds(100);
  }
  theViewport!.continuousRendering = false;
  theViewport!.renderFrame();
  timer.stop();
  curTileLoadingTime = timer.current.milliseconds;
}

function getRowData(finalFrameTimings: Array<Map<string, number>>): Map<string, number | string> {
  const rowData = new Map<string, number | string>();
  rowData.set("iModel", /([^\\]+)$/.exec(configuration.iModelName)![1]);
  rowData.set("View", configuration.viewName ? configuration.viewName : "");
  rowData.set("Render Mode", getRenderMode());
  rowData.set("View Flags", getViewFlagsString());
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
  return rowData;
}

function printResults(filePath: string, fileName: string, rowData: Map<string, number | string>) {
  if (fs.existsSync(filePath + fileName))
    addColumnsToCsvFile(filePath + fileName, rowData);
  else
    createNewCsvFile(filePath, fileName, rowData);
  addDataToCsvFile(resultsLocation + resultsFileName, rowData);
}

export function savePng() {
  let img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0"
    + "NAAAAKElEQVQ4jWNgYGD4Twzu6FhFFGYYNXDUwGFpIAk2E4dHDRw1cDgaCAASFOffhEIO"
    + "3gAAAABJRU5ErkJggg==";
  img = (document.getElementById("imodelview") as HTMLCanvasElement)!.toDataURL("image/png");
  const data = img.replace(/^data:image\/\w+;base64,/, ""); // strip off the data: url prefix to get just the base64-encoded bytes
  const buf = new Buffer(data, "base64");
  fs.writeFileSync("image2.png", buf);

  //   // write((document.getElementById("imodelview") as HTMLCanvasElement)!.toBlob().toString(), "demo.png", "image/png");

  //   (document.getElementById("imodelview") as HTMLCanvasElement)!.toBlob((blob) => {
  //     // IModelApp.renderSystem.canvas!.toBlob((blob) => {
  //     const url = URL.createObjectURL(blob);
  //     // localStorage.setItem("elephant.png", url);

  //     const a = document.createElement("a");
  //     a.href = url, a.download = "demoModel.png";
  //     document.body.appendChild(a);
  //     a.click();
  //     setTimeout(() => {
  //       document.body.removeChild(a);
  //       window.URL.revokeObjectURL(url);
  //     }, 0);
  //   });

  //   // const a = document.createElement("a");
  //   // const url = URL.createObjectURL((document.getElementById("imodelview") as HTMLCanvasElement)!.toBlob());
  //   // a.href = url, a.download = "demoModel.png";
  //   // document.body.appendChild(a);
  //   // a.click();
  //   // setTimeout(() => {
  //   //   document.body.removeChild(a);
  //   //   window.URL.revokeObjectURL(url);
  //   // }, 0);

  //   // (document.getElementById("imodelview") as HTMLCanvasElement)!.toBlob();

  //   const tempUrl = (document.getElementById("imodelview") as HTMLCanvasElement)!.toDataURL("image/png");
  //   // const tempUrl = IModelApp.renderSystem.canvas.toDataURL("image/png");
  //   const defaultFileLocation = path.join(__dirname, "../../../frontend/performance/performancePic.png");
  //   // PerformanceWriterClient.saveCanvas(tempUrl); // (document.getElementById("imodelview") as HTMLCanvasElement)!.toDataURL());
  //   const newlink = document.createElement("a");
  //   // newlink.innerHTML = "Google";
  //   // newlink.setAttribute("title", "Google");

  //   newlink.setAttribute("href", tempUrl);
  //   newlink.setAttribute("id", "download");
  //   newlink.setAttribute("download", defaultFileLocation);
  //   newlink.setAttribute("target", "_blank");
  //   document.body.appendChild(newlink);

  //   // const link = $('<a href="' + tempUrl + '" id="download" download="' + fileName + '" target="_blank"> </a>');
  //   document.body.appendChild(newlink);
  //   (document.getElementById("download") as HTMLCanvasElement).click();
  //   // $("#download").get(0).click();

}

class SimpleViewState {
  public accessToken?: AccessToken;
  public project?: Project;
  public iModel?: IModelRepository;
  public iModelConnection?: IModelConnection;
  public viewDefinition?: ViewDefinitionProps;
  public viewState?: ViewState;
  public viewPort?: Viewport;
  constructor() { }
}

let configuration: SVTConfiguration;
let theViewport: Viewport | undefined;
let activeViewState: SimpleViewState = new SimpleViewState();
let curTileLoadingTime = 0;

async function _changeView(view: ViewState) {
  theViewport!.changeView(view);
  activeViewState.viewState = view;
}

// opens the view and connects it to the HTML canvas element.
async function openView(state: SimpleViewState) {
  // find the canvas.
  const htmlCanvas: HTMLCanvasElement = document.getElementById("imodelview") as HTMLCanvasElement;
  htmlCanvas!.width = 1239;
  htmlCanvas!.height = 685;
  document.body.appendChild(htmlCanvas!);

  if (htmlCanvas) {
    theViewport = new Viewport(htmlCanvas, state.viewState!);
    theViewport.continuousRendering = false;
    theViewport.sync.setRedrawPending;
    (theViewport!.target as Target).performanceMetrics = new PerformanceMetrics(true, false);
    await _changeView(state.viewState!);
  }
}

// selects the configured view.
async function loadView(state: SimpleViewState, configurations?: { viewName?: string }) {
  const config = undefined !== configurations ? configurations : {};
  const viewIds = await state.iModelConnection!.elements.queryIds({ from: ViewState.sqlName, where: "CodeValue = '" + config.viewName + "'" });
  if (1 === viewIds.size)
    state.viewState = await state.iModelConnection!.views.load(viewIds.values().next().value);

  if (undefined === state.viewState)
    debugPrint("Error: failed to load view by name");
}

// opens the configured iModel from disk
async function openStandaloneIModel(state: SimpleViewState, filename: string) {
  try {
    configuration.standalone = true;
    state.iModelConnection = await IModelConnection.openStandalone(filename);
  } catch (err) {
    debugPrint("openStandaloneIModel failed: " + err.toString());
    throw err;
  }
}
interface SVTConfiguration {
  filename: string;
  userName: string;
  password: string;
  projectName: string;
  iModelName: string;
  standalone: boolean;
  viewName?: string;
}

async function mainBody() {
  await PerformanceWriterClient.startup();

  // this is the default configuration
  configuration = {
    userName: "bistroDEV_pmadm1@mailinator.com",
    password: "pmadm1",
    iModelName: modelsLocation + "\\" + "Wraith.ibim", // "D:\\models\\ibim_bim0200dev\\Wraith.ibim", // path.join(iModelLocation, "Wraith_MultiMulti.ibim"),
    viewName: "V0",
  } as SVTConfiguration;

  // Start the backend
  createWindow();

  // start the app.
  IModelApp.startup();

  // initialize the Project and IModel Api
  await ProjectApi.init();
  await IModelApi.init();

  activeViewState = new SimpleViewState();
  activeViewState.viewState;

  await openStandaloneIModel(activeViewState, configuration.iModelName);

  // open the specified view
  await loadView(activeViewState, configuration);

  // Set the viewFlags
  if (activeViewState.viewState !== undefined) {
    readJsonFile();
    const vfo = setViewFlagOverrides(jsonFile.modelSet[0].tests[1]);
    vfo.setRenderMode(RenderMode.SmoothShade);
    vfo.apply(activeViewState.viewState.displayStyle.viewFlags);
  }

  // now connect the view to the canvas
  await openView(activeViewState);

  // Load all tiles
  await waitForTilesToLoad();
  debugPrint("1111111111111111111111 - waitForTilesToLoad has FINISHED");

  // debugPrint("1111111111111111111111 - b4 save png ");
  // await savePng();
  // debugPrint("1111111111111111111111 - after save png ");

  // Throw away the first n renderFrame times, until it's more consistent
  for (let i = 0; i < 10; ++i) {
    theViewport!.sync.setRedrawPending();
    theViewport!.renderFrame();
  }

  debugPrint("///////////////////////////////// start extra renderFrames");

  // Add a pause so that user can start the GPU Performance Capture program
  // await resolveAfterXMilSeconds(7000);

  const finalFrameTimings: Array<Map<string, number>> = [];
  const timer = new StopWatch(undefined, true);
  const numToRender = 50;
  for (let i = 0; i < numToRender; ++i) {
    // await savePng();
    theViewport!.sync.setRedrawPending();
    // debugPrint("///////////--- start collecting timing data");
    theViewport!.renderFrame();
    finalFrameTimings[i] = (theViewport!.target as Target).performanceMetrics!.frameTimings; // .slice();
  }
  timer.stop();
  debugPrint("------------ Elapsed Time: " + timer.elapsed.milliseconds + " = " + timer.elapsed.milliseconds / numToRender + "ms per frame");
  debugPrint("Tile Loading Time: " + curTileLoadingTime);
  for (const t of finalFrameTimings) {
    let timingsString = "[";
    t.forEach((val) => {
      timingsString += val + ", ";
    });
    debugPrint(timingsString + "]");
  }

  printResults(resultsLocation, resultsFileName, getRowData(finalFrameTimings));

  if (activeViewState.iModelConnection) await activeViewState.iModelConnection.closeStandalone();
  IModelApp.shutdown();

  debugPrint("//" + (theViewport!.target as Target).performanceMetrics!.frameTimings);
}

describe("PerformanceTests - 1 (#WebGLPerformance)", () => {
  it("Test 2 - Wraith_MultiMulti Model - V0", (done) => {
    removeFilesFromDir(modelsLocation, ".Tiles");
    removeFilesFromDir(modelsLocation, ".TileCache");
    mainBody().then((_result) => {
      removeFilesFromDir(modelsLocation, ".Tiles");
      removeFilesFromDir(modelsLocation, ".TileCache");
      done();
    }).catch((error) => {
      debugPrint("Exception in mainBody: " + error.toString());
    });
  });
});
