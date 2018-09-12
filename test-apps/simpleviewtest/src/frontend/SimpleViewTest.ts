/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { Id64, JsonUtils, OpenMode } from "@bentley/bentleyjs-core";
import { AngleSweep, Arc3d, Matrix3d, Point2d, Point3d, Transform, Vector3d, XAndY, XYAndZ } from "@bentley/geometry-core";
import { Config, DeploymentEnv } from "@bentley/imodeljs-clients";
import {
  AxisAlignedBox3d, BentleyCloudRpcManager, ColorDef, ElectronRpcConfiguration, ElectronRpcManager, IModelReadRpcInterface,
  IModelTileRpcInterface, IModelToken, LinePixels, ModelProps, ModelQueryParams, RenderMode, RgbColor, RpcConfiguration,
  RpcOperation, StandaloneIModelRpcInterface, ViewQueryParams, ColorByName,
} from "@bentley/imodeljs-common";
import { MobileRpcConfiguration, MobileRpcManager } from "@bentley/imodeljs-common/lib/rpc/mobile/MobileRpcManager";
import {
  AccuDraw, AccuDrawHintBuilder, AccuDrawShortcuts, AccuSnap, BeButtonEvent, ClusterMarker, CoordinateLockOverrides, DecorateContext,
  DynamicsContext, EditManipulator, EventHandled, HitDetail, ImageUtil, IModelApp, IModelConnection, Marker, MarkerSet, MessageBoxIconType,
  MessageBoxType, MessageBoxValue, NotificationManager, NotifyMessageDetails, PrimitiveTool, RotationMode, ScreenViewport, SnapMode,
  SpatialModelState, SpatialViewState, StandardViewId, ToolTipOptions, Viewport, ViewState, ViewState3d,
} from "@bentley/imodeljs-frontend";
import { FeatureSymbology, GraphicType } from "@bentley/imodeljs-frontend/lib/rendering";
import { PerformanceMetrics, Target } from "@bentley/imodeljs-frontend/lib/webgl";
import * as ttjs from "tooltip.js";
import { ConnectProject } from "./ConnectProject";
import { NonConnectProject } from "./NonConnectProject";
import { ProjectAbstraction } from "./ProjectAbstraction";
import { SimpleViewState } from "./SimpleViewState";
import { showError, showStatus } from "./Utils";

type Tooltip = ttjs.default;

// Only want the following imports if we are using electron and not a browser -----
// tslint:disable-next-line:variable-name
let remote: any;
if (ElectronRpcConfiguration.isElectron) {
  // tslint:disable-next-line:no-var-requires
  remote = require("electron").remote;
}

// tslint:disable:no-console

interface RenderModeOptions {
  flags: Map<string, boolean>;
  mode: RenderMode;
}

const renderModeOptions: RenderModeOptions = {
  flags: new Map<string, boolean>(),
  mode: RenderMode.SmoothShade,
};

let activeViewState: SimpleViewState = new SimpleViewState();
const viewMap = new Map<string, ViewState | IModelConnection.ViewSpec>();
let theViewport: ScreenViewport | undefined;
let curModelProps: ModelProps[] = [];
let curModelPropIndices: number[] = [];
let curNumModels = 0;
const curCategories: Set<string> = new Set<string>();
const configuration = {} as SVTConfiguration;
let curFPSIntervalId: NodeJS.Timer;
let overrideColor: ColorDef | undefined;

function addFeatureOverrides(ovrs: FeatureSymbology.Overrides, viewport: Viewport): void {
  if (undefined === overrideColor)
    return;

  const color = RgbColor.fromColorDef(overrideColor);
  const app = FeatureSymbology.Appearance.fromJSON({ rgb: color, weight: 4, linePixels: LinePixels.Code1 });
  for (const elemId of viewport.iModel.selectionSet.elements)
    ovrs.overrideElement(elemId, app);
}

/** Parameters for starting SimpleViewTest with a specified initial configuration */
interface SVTConfiguration {
  useIModelBank: boolean;
  viewName?: string;
  environment?: DeploymentEnv;
  // standalone-specific config:
  standalone?: boolean;
  iModelName?: string;
  filename?: string;
  standalonePath?: string;    // Used when run in the browser - a common base path for all standalone imodels
}

// Retrieves the configuration for starting SVT from configuration.json file located in the built public folder
function retrieveConfiguration(): Promise<void> {
  return new Promise((resolve, _reject) => {
    const request: XMLHttpRequest = new XMLHttpRequest();
    request.open("GET", "configuration.json", false);
    request.setRequestHeader("Cache-Control", "no-cache");
    request.onreadystatechange = ((_event: Event) => {
      if (request.readyState === XMLHttpRequest.DONE) {
        if (request.status === 200) {
          const newConfigurationInfo: any = JSON.parse(request.responseText);
          Object.assign(configuration, newConfigurationInfo);
          resolve();
        }
        // Everything is good, the response was received.
      } else {
        // Not ready yet.
      }
    });
    request.send();
  });
}

// opens the configured iModel from disk
async function openStandaloneIModel(state: SimpleViewState, filename: string) {
  configuration.standalone = true;
  state.iModelConnection = await IModelConnection.openStandalone(filename);
  configuration.iModelName = state.iModelConnection.name;
}

// selects the configured view.
async function buildViewList(state: SimpleViewState, configurations?: { viewName?: string }) {
  const config = undefined !== configurations ? configurations : {};
  const viewList = document.getElementById("viewList") as HTMLSelectElement;
  const viewQueryParams: ViewQueryParams = { wantPrivate: false };
  const viewSpecs: IModelConnection.ViewSpec[] = await state.iModelConnection!.views.getViewList(viewQueryParams);
  for (const viewSpec of viewSpecs) {
    const option = document.createElement("option");
    option.text = viewSpec.name;
    viewList.add(option);
    viewMap.set(viewSpec.name, viewSpec);
    if (undefined === config.viewName)
      config.viewName = viewSpec.name;
    if (viewSpec.name === config.viewName) {
      viewList!.value = viewSpec.name;
      const viewState = await state.iModelConnection!.views.load(viewSpec.id);
      viewMap.set(viewSpec.name, viewState);
      state.viewState = viewState;
    }
  }
}

// open up the model toggle menu
function startToggleModel(_event: any) {
  const menu = document.getElementById("toggleModelMenu") as HTMLDivElement;
  menu.style.display = menu.style.display === "none" || menu.style.display === "" ? "block" : "none";
}

// open up the category selection model
function startCategorySelection(_event: any) {
  const menu = document.getElementById("categorySelectionMenu") as HTMLDivElement;
  menu.style.display = menu.style.display === "none" || menu.style.display === "" ? "block" : "none";
}

// build list of models; enables those defined in model selector
async function buildModelMenu(state: SimpleViewState) {
  const modelMenu = document.getElementById("toggleModelMenu") as HTMLDivElement;
  const modelButton = document.getElementById("startToggleModel")!;
  const spatialView = undefined !== state.viewState && state.viewState instanceof SpatialViewState ? state.viewState as SpatialViewState : undefined;
  if (undefined === spatialView) {
    modelMenu.style.display = modelButton.style.display = "none";
    return;
  }

  modelButton.style.display = "inline";
  const modelQueryParams: ModelQueryParams = { from: SpatialModelState.getClassFullName(), wantPrivate: false };
  curModelProps = await state.iModelConnection!.models.queryProps(modelQueryParams);
  curModelPropIndices = [];
  modelMenu.innerHTML = "";

  // ###TODO: Load models on demand when they are enabled in the dialog - not all up front like this...super-inefficient...
  let i = 0;
  for (const modelProp of curModelProps) {
    const model = spatialView.iModel.models.getLoaded(modelProp.id!.toString());
    if (undefined === model)
      await spatialView.iModel.models.load(modelProp.id!.toString());

    modelMenu.innerHTML += '<input id="cbxModel' + i + '" type="checkbox"> ' + modelProp.name + "\n<br>\n";
    curModelPropIndices.push(i);

    let j = 0;
    if (model !== undefined) {
      if (model.jsonProperties.classifiers !== undefined) {
        for (const classifier of model.jsonProperties.classifiers) {
          modelMenu.innerHTML += '&nbsp;&nbsp;<input id="cbxModel' + i + "_" + j + '" type="checkbox"> ' + classifier.name + "\n<br>\n";
          j++;
        }
      }
    }

    i++;
  }

  curNumModels = i;
  for (let c = 0; c < curNumModels; c++) {
    const cbxName = "cbxModel" + c;
    const enabled = spatialView.modelSelector.has(curModelProps[c].id!.toString());
    updateCheckboxToggleState(cbxName, enabled);
    addModelToggleHandler(cbxName);

    const model = spatialView.iModel.models.getLoaded(curModelProps[c].id!.toString());
    if (model !== undefined) {
      if (model.jsonProperties.classifiers !== undefined) {
        let cc = 0;
        for (const classifier of model.jsonProperties.classifiers) {
          const classifierName = "cbxModel" + c + "_" + cc;
          updateCheckboxToggleState(classifierName, classifier.isActive);
          addClassifierToggleHandler(classifierName);
          cc++;
        }
      }
    }
  }

  applyModelToggleChange("cbxModel0"); // force view to update based on all being enabled
}

// build list of categories; enable those defined in category selector
async function buildCategoryMenu(state: SimpleViewState) {
  curCategories.clear();
  let html = '<input id="cbxCatToggleAll" type="checkbox"> Toggle All\n<br>\n';

  const view = state.viewState!;
  const ecsql = "SELECT ECInstanceId as id, CodeValue as code, UserLabel as label FROM " + (view.is3d() ? "BisCore.SpatialCategory" : "BisCore.DrawingCategory");
  const rows = await view.iModel.executeQuery(ecsql);

  for (const row of rows) {
    let label = row.label as string;
    if (undefined === label)
      label = row.code;

    const id = row.id as string;
    curCategories.add(id);
    html += '<input id="cbxCat' + id + '" type="checkbox"> ' + label + "\n<br>\n";
  }

  const categoryMenu = document.getElementById("categorySelectionMenu") as HTMLDivElement;
  categoryMenu.innerHTML = html;

  updateCheckboxToggleState("cbxCatToggleAll", curCategories.size === view.categorySelector.categories.size);
  addCategoryToggleAllHandler();

  for (const cat of curCategories) {
    const cbxName = "cbxCat" + cat;
    updateCheckboxToggleState(cbxName, view.categorySelector.has(cat));
    addCategoryToggleHandler(cbxName);
  }
}

// set checkbox state to checked or unchecked
function updateCheckboxToggleState(id: string, enabled: boolean) {
  (document.getElementById(id)! as HTMLInputElement).checked = enabled;
}

// query checkbox state (checked or unchecked)
function getCheckboxToggleState(id: string): boolean {
  return (document.getElementById(id)! as HTMLInputElement).checked;
}

// apply a model checkbox state being changed (actually change list of viewed models)
function applyModelToggleChange(_cbxModel: string) {
  if (!(theViewport!.view instanceof SpatialViewState))
    return;
  const view = theViewport!.view as SpatialViewState;

  view.clearViewedModels();

  for (let c = 0; c < curNumModels; c++) {
    const cbxName = "cbxModel" + c;
    const isChecked = getCheckboxToggleState(cbxName);
    if (isChecked)
      view.addViewedModel(curModelProps[curModelPropIndices[c]].id!);
  }

  theViewport!.sync.invalidateScene();

  const menu = document.getElementById("toggleModelMenu") as HTMLDivElement;
  menu.style.display = "none"; // menu.style.display === "none" || menu.style.display === "" ? "none" : "block";
}

// apply a classifier checkbox state being changed (change isActive flag on classifier on a model)
function applyClassifierToggleChange(cName: string) {
  if (!(theViewport!.view instanceof SpatialViewState))
    return;
  const view = theViewport!.view as SpatialViewState;

  for (let c = 0; c < curNumModels; c++) {
    const model = view.iModel.models.getLoaded(curModelProps[c].id!.toString());
    if (model !== undefined) {
      if (model.jsonProperties.classifiers !== undefined) {
        let cc = 0;
        for (const classifier of model.jsonProperties.classifiers) {
          const classifierName = "cbxModel" + c + "_" + cc;
          if (cName === classifierName) { // Found the classifier
            classifier.isActive = getCheckboxToggleState(classifierName);
            theViewport!.sync.invalidateScene();
            const menu = document.getElementById("toggleModelMenu") as HTMLDivElement;
            menu.style.display = "none"; // menu.style.display === "none" || menu.style.display === "" ? "none" : "block";
            return;
          }
          cc++;
        }
      }
    }
  }
}

function toggleCategoryState(invis: boolean, catId: string, view: ViewState) {
  view.changeCategoryDisplay(catId, !invis);
}

// apply a category checkbox state being changed
function applyCategoryToggleChange(_cbxCategory: string) {
  const view = theViewport!.view;

  let allToggledOn = true;
  for (const cat of curCategories) {
    const cbxName = "cbxCat" + cat;
    const isChecked = getCheckboxToggleState(cbxName);
    const invis = isChecked ? false : true;
    toggleCategoryState(invis, cat, view);
    if (invis)
      allToggledOn = false;
  }

  updateCheckboxToggleState("cbxCatToggleAll", allToggledOn);

  const menu = document.getElementById("categorySelectionMenu") as HTMLDivElement;
  menu.style.display = "none"; // menu.style.display === "none" || menu.style.display === "" ? "none" : "block";
}

// toggle all checkboxes being toggled
function applyCategoryToggleAllChange() {
  const view = theViewport!.view;
  const isChecked = getCheckboxToggleState("cbxCatToggleAll");

  for (const cat of curCategories) {
    const cbxName = "cbxCat" + cat;
    updateCheckboxToggleState(cbxName, isChecked);

    const invis = isChecked ? false : true;
    toggleCategoryState(invis, cat, view);
  }

  const menu = document.getElementById("categorySelectionMenu") as HTMLDivElement;
  menu.style.display = "none"; // menu.style.display === "none" || menu.style.display === "" ? "none" : "block";
}

// add a click handler to model checkbox
function addModelToggleHandler(id: string) {
  document.getElementById(id)!.addEventListener("click", () => applyModelToggleChange(id));
}

// add a click handler to classifier checkbox
function addClassifierToggleHandler(id: string) {
  document.getElementById(id)!.addEventListener("click", () => applyClassifierToggleChange(id));
}

// add a click handler to category checkbox
function addCategoryToggleHandler(id: string) {
  document.getElementById(id)!.addEventListener("click", () => applyCategoryToggleChange(id));
}

// add a click handler to the category 'toggle all' checkbox
function addCategoryToggleAllHandler() {
  document.getElementById("cbxCatToggleAll")!.addEventListener("click", () => applyCategoryToggleAllChange());
}

function toggleStandardViewMenu(_event: any) {
  const menu = document.getElementById("standardRotationMenu") as HTMLDivElement;
  menu.style.display = menu.style.display === "none" || menu.style.display === "" ? "block" : "none";
}

function toggleRenderModeMenu(_event: any) {
  const menu = document.getElementById("changeRenderModeMenu") as HTMLDivElement;
  menu.style.display = menu.style.display === "none" || menu.style.display === "" ? "block" : "none";
}

function toggleSnapModeMenu(_event: any) {
  const menu = document.getElementById("changeSnapModeMenu") as HTMLDivElement;
  menu.style.display = menu.style.display === "none" || menu.style.display === "" ? "block" : "none";
}

function applyStandardViewRotation(rotationId: StandardViewId, label: string) {
  if (undefined === theViewport)
    return;

  if (StandardViewId.Top !== rotationId && !theViewport.view.allow3dManipulations())
    return;

  const rMatrix = AccuDraw.getStandardRotation(rotationId, theViewport, theViewport.isContextRotationRequired);
  const inverse = rMatrix.inverse();
  if (undefined === inverse)
    return;

  const targetMatrix = inverse.multiplyMatrixMatrix(theViewport.rotMatrix);
  const rotateTransform = Transform.createFixedPointAndMatrix(theViewport.view.getTargetPoint(), targetMatrix);
  const startFrustum = theViewport.getFrustum();
  const newFrustum = startFrustum.clone();
  newFrustum.multiply(rotateTransform);

  theViewport.animateFrustumChange(startFrustum, newFrustum);
  theViewport.view.setupFromFrustum(newFrustum);
  theViewport.synchWithView(true);
  showStatus(label, "view");
}

function applyRenderModeChange(mode: string) {
  const menuDialog = document.getElementById("changeRenderModeMenu");
  const newValue = (document.getElementById(mode)! as HTMLInputElement).checked;
  renderModeOptions.flags.set(mode, newValue);
  IModelApp.tools.run("View.ChangeRenderMode", theViewport!, renderModeOptions.flags, menuDialog, renderModeOptions.mode);
}

function stringToRenderMode(name: string): RenderMode {
  switch (name) {
    case "Smooth Shade": return RenderMode.SmoothShade;
    case "Solid Fill": return RenderMode.SolidFill;
    case "Hidden Line": return RenderMode.HiddenLine;
    default: return RenderMode.Wireframe;
  }
}

function renderModeToString(mode: RenderMode): string {
  switch (mode) {
    case RenderMode.SmoothShade: return "Smooth Shade";
    case RenderMode.SolidFill: return "Solid Fill";
    case RenderMode.HiddenLine: return "Hidden Line";
    default: return "Wireframe";
  }
}

function changeRenderMode(): void {
  const select = (document.getElementById("renderModeList") as HTMLSelectElement)!;
  renderModeOptions.mode = stringToRenderMode(select.value);
  IModelApp.tools.run("View.ChangeRenderMode", theViewport!, renderModeOptions.flags, document.getElementById("changeRenderModeMenu"), renderModeOptions.mode);
}

enum MapType { Street = 0, Aerial = 1, Hybrid = 2 } // ###TODO - this is duplicated from WebMercatorTileTree.ts - needs common location

function stringToMapType(s: string): MapType {
  if ("Street" === s) return MapType.Street;
  if ("Aerial" === s) return MapType.Aerial;
  return MapType.Hybrid;
}

function mapTypeToString(m: MapType): string {
  if (MapType.Street === m) return "Street";
  if (MapType.Aerial === m) return "Aerial";
  return "Hybrid";
}

function changeBackgroundMapState(): void {
  if (!theViewport!.view.is3d())
    return;
  const mapProviderString = (document.getElementById("mapProviderList") as HTMLSelectElement)!.value;
  const mapTypeString = (document.getElementById("mapTypeList") as HTMLSelectElement)!.value;
  const mapTypeVal = stringToMapType(mapTypeString);
  const view = theViewport!.view as ViewState3d;
  const ds = view.getDisplayStyle3d();
  ds.setStyle("backgroundMap", { providerName: mapProviderString, mapType: mapTypeVal });
  ds.syncBackgroundMapState();
  IModelApp.tools.run("View.ChangeRenderMode", theViewport!, renderModeOptions.flags, document.getElementById("changeRenderModeMenu"), renderModeOptions.mode);
}

function updateRenderModeOption(id: string, enabled: boolean, options: Map<string, boolean>) {
  (document.getElementById(id)! as HTMLInputElement).checked = enabled;
  options.set(id, enabled);
}

// updates the checkboxes and the map for turning off and on rendering options to match what the current view is showing
function updateRenderModeOptionsMap() {
  let skybox = false;
  let groundplane = false;
  let providerName = "BingProvider";
  let mapType = MapType.Hybrid;
  if (theViewport!.view.is3d()) {
    const view = theViewport!.view as ViewState3d;
    const env = view.getDisplayStyle3d().environment;
    skybox = env.sky.display;
    groundplane = env.ground.display;
    const backgroundMap = view.getDisplayStyle3d().getStyle("backgroundMap");
    providerName = JsonUtils.asString(backgroundMap.mapType, "BingProvider");
    mapType = JsonUtils.asInt(backgroundMap.mapType, MapType.Hybrid);
  }

  const viewflags = theViewport!.view.viewFlags;
  const lights = viewflags.sourceLights || viewflags.solarLight || viewflags.cameraLights;

  updateRenderModeOption("skybox", skybox, renderModeOptions.flags);
  updateRenderModeOption("groundplane", groundplane, renderModeOptions.flags);
  updateRenderModeOption("ACSTriad", viewflags.acsTriad, renderModeOptions.flags);
  updateRenderModeOption("fill", viewflags.fill, renderModeOptions.flags);
  updateRenderModeOption("grid", viewflags.grid, renderModeOptions.flags);
  updateRenderModeOption("textures", viewflags.textures, renderModeOptions.flags);
  updateRenderModeOption("visibleEdges", viewflags.visibleEdges, renderModeOptions.flags);
  updateRenderModeOption("hiddenEdges", viewflags.hiddenEdges, renderModeOptions.flags);
  updateRenderModeOption("materials", viewflags.materials, renderModeOptions.flags);
  updateRenderModeOption("lights", lights, renderModeOptions.flags);
  updateRenderModeOption("monochrome", viewflags.monochrome, renderModeOptions.flags);
  updateRenderModeOption("constructions", viewflags.constructions, renderModeOptions.flags);
  updateRenderModeOption("weights", viewflags.weights, renderModeOptions.flags);
  updateRenderModeOption("styles", viewflags.styles, renderModeOptions.flags);
  updateRenderModeOption("transparency", viewflags.transparency, renderModeOptions.flags);
  updateRenderModeOption("clipVolume", viewflags.clipVolume, renderModeOptions.flags);
  updateRenderModeOption("backgroundMap", viewflags.backgroundMap, renderModeOptions.flags);
  (document.getElementById("mapProviderList") as HTMLSelectElement)!.value = providerName;
  (document.getElementById("mapTypeList") as HTMLSelectElement)!.value = mapTypeToString(mapType);

  const backgroundMapDisabled = !theViewport!.iModel.isGeoLocated;
  (document.getElementById("backgroundMap")! as HTMLInputElement).disabled = backgroundMapDisabled;
  (document.getElementById("mapProviderList")! as HTMLInputElement).disabled = backgroundMapDisabled;
  (document.getElementById("mapTypeList")! as HTMLInputElement).disabled = backgroundMapDisabled;

  renderModeOptions.mode = viewflags.renderMode;
  (document.getElementById("renderModeList") as HTMLSelectElement)!.value = renderModeToString(viewflags.renderMode);
}

// opens the view and connects it to the HTML canvas element.
async function openView(state: SimpleViewState) {
  // find the canvas.
  const vpDiv = document.getElementById("imodel-viewport") as HTMLDivElement;
  theViewport = ScreenViewport.create(vpDiv, state.viewState!);
  await _changeView(state.viewState!);
  theViewport.addFeatureOverrides = addFeatureOverrides;
  theViewport.continuousRendering = (document.getElementById("continuousRendering")! as HTMLInputElement).checked;
  theViewport.wantTileBoundingBoxes = (document.getElementById("boundingBoxes")! as HTMLInputElement).checked;
  IModelApp.viewManager.addViewport(theViewport);
}

async function _changeView(view: ViewState) {
  theViewport!.changeView(view);
  activeViewState.viewState = view;
  await buildModelMenu(activeViewState);
  await buildCategoryMenu(activeViewState);
  updateRenderModeOptionsMap();
}

export class MeasurePointsTool extends PrimitiveTool {
  public static toolId = "Measure.Points";
  public readonly points: Point3d[] = [];

  public requireWriteableTarget(): boolean { return false; }
  public onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }

  public setupAndPromptForNextAction(): void {
    IModelApp.accuSnap.enableSnap(true);

    if (0 === this.points.length)
      return;

    const hints = new AccuDrawHintBuilder();
    hints.enableSmartRotation = true;

    if (this.points.length > 1 && !(this.points[this.points.length - 1].isAlmostEqual(this.points[this.points.length - 2])))
      hints.setXAxis(Vector3d.createStartEnd(this.points[this.points.length - 2], this.points[this.points.length - 1])); // Rotate AccuDraw to last segment...

    hints.setOrigin(this.points[this.points.length - 1]);
    hints.sendHints();
  }

  public onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    if (this.points.length < 1)
      return;

    const tmpPoints = this.points.slice();
    tmpPoints.push(ev.point.clone());

    const builder = context.createGraphicBuilder(GraphicType.Scene);

    builder.setSymbology(ColorDef.white, ColorDef.white, 1);
    builder.addLineString(tmpPoints);

    context.addGraphic(builder.finish());
  }

  public async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    this.points.push(ev.point.clone());
    this.setupAndPromptForNextAction();

    if (!this.isDynamicsStarted)
      this.beginDynamics();

    return EventHandled.No;
  }

  public async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    this.onReinitialize();
    return EventHandled.No;
  }

  public onUndoPreviousStep(): boolean {
    if (0 === this.points.length)
      return false;

    this.points.pop();
    if (0 === this.points.length)
      this.onReinitialize();
    else
      this.setupAndPromptForNextAction();
    return true;
  }

  public async onKeyTransition(wentDown: boolean, keyEvent: KeyboardEvent): Promise<EventHandled> {
    if (wentDown) {
      switch (keyEvent.key) {
        case " ":
          AccuDrawShortcuts.changeCompassMode();
          break;
        case "Enter":
          AccuDrawShortcuts.lockSmart();
          break;
        case "x":
        case "X":
          AccuDrawShortcuts.lockX();
          break;
        case "y":
        case "Y":
          AccuDrawShortcuts.lockY();
          break;
        case "z":
        case "Z":
          AccuDrawShortcuts.lockZ();
          break;
        case "a":
        case "A":
          AccuDrawShortcuts.lockAngle();
          break;
        case "d":
        case "D":
          AccuDrawShortcuts.lockDistance();
          break;
        case "t":
        case "T":
          AccuDrawShortcuts.setStandardRotation(RotationMode.Top);
          break;
        case "f":
        case "F":
          AccuDrawShortcuts.setStandardRotation(RotationMode.Front);
          break;
        case "s":
        case "S":
          AccuDrawShortcuts.setStandardRotation(RotationMode.Side);
          break;
        case "v":
        case "V":
          AccuDrawShortcuts.setStandardRotation(RotationMode.View);
          break;
        case "o":
        case "O":
          AccuDrawShortcuts.setOrigin();
          break;
        case "c":
        case "C":
          AccuDrawShortcuts.rotateCycle(false);
          break;
        case "q":
        case "Q":
          AccuDrawShortcuts.rotateAxes(true);
          break;
        case "e":
        case "E":
          AccuDrawShortcuts.rotateToElement(false);
          break;
        case "r":
        case "R":
          AccuDrawShortcuts.defineACSByPoints();
          break;
      }
    }
    return EventHandled.No;
  }

  public onRestartTool(): void {
    const tool = new MeasurePointsTool();
    if (!tool.run())
      this.exitTool();
  }
}

export class ProjectExtentsResizeTool extends EditManipulator.HandleTool {
  protected init(): void {
    this.receivedDownEvent = true;
    IModelApp.toolAdmin.toolState.coordLockOvr = CoordinateLockOverrides.All;
    IModelApp.accuSnap.enableLocate(false);
    IModelApp.accuSnap.enableSnap(false);
    IModelApp.accuDraw.deactivate();
    this.beginDynamics();
  }

  protected accept(_ev: BeButtonEvent): boolean { return true; }

  public onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    const builder = context.createGraphicBuilder(GraphicType.Scene);

    const black = ColorDef.black.clone();
    const white = ColorDef.white.clone();

    builder.setSymbology(white, black, 10);
    builder.addPointString([ev.point]);
    context.addGraphic(builder.finish());
  }
}

export class ProjectExtentsDecoration extends EditManipulator.HandleProvider {
  private static _decorator?: ProjectExtentsDecoration;
  protected _extents: AxisAlignedBox3d;
  protected _boxId?: string;
  protected _controlIds: string[] = [];
  public markers: Marker[] = [];

  public constructor() {
    super(activeViewState.iModelConnection!);
    this._extents = this._iModel.projectExtents;
    this._boxId = this._iModel.transientIds.next.value;
    this.updateDecorationListener(true);

    const image = ImageUtil.fromUrl("map_pin.svg");
    const markerDrawFunc = (ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, 2 * Math.PI);
      ctx.fillStyle = "green";
      ctx.lineWidth = 1;
      ctx.strokeStyle = "black";
      ctx.fill();
      ctx.stroke();
    };

    const markerSize = { x: 48, y: 48 };
    const imageOffset = { x: -11, y: 32 };
    const createBoundsMarker = (label: string, markerPos: Point3d): void => {
      const marker = new Marker(markerPos, markerSize);
      marker.drawFunc = markerDrawFunc;
      marker.label = label;
      marker.imageOffset = imageOffset;
      marker.setImage(image);
      marker.setScaleFactor({ low: .4, high: 1.5 });
      this.markers.push(marker);
    };

    createBoundsMarker(this._iModel.iModelToken.key!, this._extents.getCenter());
    createBoundsMarker("low", this._extents.low);
    createBoundsMarker("high", this._extents.high);
  }

  protected stop(): void {
    const selectedId = (undefined !== this._boxId && this._iModel.selectionSet.has(this._boxId)) ? this._boxId : undefined;
    this._boxId = undefined; // Invalidate id so that decorator will be dropped...
    super.stop();
    if (undefined !== selectedId)
      this._iModel.selectionSet.remove(selectedId); // Don't leave decorator id in selection set...
  }

  //  public async getElementProps(elementIds: Id64Set): Promise<ElementProps[]> { return IModelReadRpcInterface.getClient().getElementProps(this._iModel.iModelToken, elementIds); }

  protected async createControls(): Promise<boolean> {
    /*     if (1 === this._iModel.selectionSet.size) {
          const props = await this.getElementProps(this._iModel.selectionSet.elements);
          if (0 !== props.length && undefined !== props[0].placement) {
            const placement = Placement3d.fromJSON(props[0].placement);
            this._extents = placement.calculateRange();
            return true;
          }
        } */

    // Decide if resize controls should be presented.
    if (undefined === this._boxId)
      return false;

    // Show controls if only extents box and it's controls are selected, selection set doesn't include any other elements...
    let showControls = false;
    if (this._iModel.selectionSet.size <= this._controlIds.length + 1 && this._iModel.selectionSet.has(this._boxId)) {
      showControls = true;
      if (this._iModel.selectionSet.size > 1) {
        this._iModel.selectionSet.elements.forEach((val) => { if (!Id64.areEqual(this._boxId, val) && !this._controlIds.includes(val)) showControls = false; });
      }
    }
    return showControls;
  }

  protected clearControls(): void {
    if (0 !== this._controlIds.length && this._iModel.selectionSet.isActive) {
      for (const controlId of this._controlIds) {
        if (!this._iModel.selectionSet.has(controlId))
          continue;
        this._iModel.selectionSet.remove(this._controlIds); // Remove selected controls as they won't continue to be displayed...
        break;
      }
    }
    super.clearControls();
  }

  protected modifyControls(_hit: HitDetail, _ev: BeButtonEvent): boolean {
    const manipTool = new ProjectExtentsResizeTool(this);
    return manipTool.run();
  }

  public testDecorationHit(id: string): boolean { return (id === this._boxId || this._controlIds.includes(id)); }
  public async getDecorationToolTip(hit: HitDetail): Promise<string> { return (hit.sourceId === this._boxId ? "Project Extents" : "Resize Project Extents"); }
  public async onDecorationButtonEvent(hit: HitDetail, ev: BeButtonEvent): Promise<EventHandled> { return (hit.sourceId === this._boxId ? EventHandled.No : super.onDecorationButtonEvent(hit, ev)); }

  protected updateDecorationListener(_add: boolean) {
    super.updateDecorationListener(undefined !== this._boxId); // Decorator isn't just for resize controls...
  }

  public decorate(context: DecorateContext): void {
    if (undefined === this._boxId)
      return;

    const vp = context.viewport;
    if (!vp.view.isSpatialView())
      return;

    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration, undefined, this._boxId);

    builder.setSymbology(ColorDef.white, ColorDef.black, 1);
    builder.addRangeBox(this._extents);
    context.addDecorationFromBuilder(builder);

    this.markers.forEach((marker) => marker.addDecoration(context));

    if (!this._isActive)
      return;

    if (0 === this._controlIds.length) {
      this._controlIds[0] = vp.view.iModel.transientIds.next.value;
      this._controlIds[1] = vp.view.iModel.transientIds.next.value;
      this._controlIds[2] = vp.view.iModel.transientIds.next.value;
      this._controlIds[3] = vp.view.iModel.transientIds.next.value;
      this._controlIds[4] = vp.view.iModel.transientIds.next.value;
      this._controlIds[5] = vp.view.iModel.transientIds.next.value;
    }

    const center = this._extents.getCenter();
    const outlineColor = vp.getContrastToBackgroundColor();
    const faceColors: ColorDef[] = [];
    const faceCenters: Point3d[] = [];
    const faceNormals: Vector3d[] = [];
    const radius = Math.min(this._extents.xLength(), this._extents.yLength(), this._extents.zLength()) * 0.1;

    faceColors[0] = ColorDef.red.clone(); faceColors[0].setAlpha(100);
    faceColors[1] = faceColors[0];
    faceNormals[0] = Vector3d.unitX(0.5 * this._extents.xLength());
    faceNormals[1] = Vector3d.unitX(-0.5 * this._extents.xLength());
    faceCenters[0] = center.plus(faceNormals[0]);
    faceCenters[1] = center.plus(faceNormals[1]);

    faceColors[2] = ColorDef.green.clone(); faceColors[2].setAlpha(100);
    faceColors[3] = faceColors[2];
    faceNormals[2] = Vector3d.unitY(0.5 * this._extents.yLength());
    faceNormals[3] = Vector3d.unitY(-0.5 * this._extents.yLength());
    faceCenters[2] = center.plus(faceNormals[2]);
    faceCenters[3] = center.plus(faceNormals[3]);

    faceColors[4] = ColorDef.blue.clone(); faceColors[4].setAlpha(100);
    faceColors[5] = faceColors[4];
    faceNormals[4] = Vector3d.unitZ(0.5 * this._extents.zLength());
    faceNormals[5] = Vector3d.unitZ(-0.5 * this._extents.zLength());
    faceCenters[4] = center.plus(faceNormals[4]);
    faceCenters[5] = center.plus(faceNormals[5]);

    for (let iFace = 0; iFace < faceCenters.length; iFace++) {
      const faceBuilder = context.createGraphicBuilder(GraphicType.WorldDecoration, undefined, this._controlIds[iFace]);
      const ellipse = Arc3d.createScaledXYColumns(faceCenters[iFace], Matrix3d.createRigidHeadsUp(faceNormals[iFace]), radius, radius, AngleSweep.create360());

      faceBuilder.setSymbology(outlineColor, faceColors[iFace], 1);
      faceBuilder.addArc(ellipse, true, true);
      faceBuilder.addArc(ellipse, false, false);
      context.addDecorationFromBuilder(faceBuilder);
    }
  }

  public static toggle() {
    if (undefined === ProjectExtentsDecoration._decorator) {
      ProjectExtentsDecoration._decorator = new ProjectExtentsDecoration();
      IModelApp.toolAdmin.startDefaultTool();
    } else {
      ProjectExtentsDecoration._decorator.stop();
      ProjectExtentsDecoration._decorator = undefined;
    }
  }
}

class IncidentMarker extends Marker {
  private static _size = Point2d.create(30, 30);
  private static _imageSize = Point2d.create(40, 40);
  private static _imageOffset = Point2d.create(0, 30);
  private static _amber = new ColorDef(ColorByName.amber);
  public color: string;
  public drawFunc(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.rect(-10, -11, 20, 20);
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.stroke();
  }

  public clusterDrawFunc = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    ctx.strokeStyle = this.color;
    ctx.fillStyle = "white";
    ctx.lineWidth = 5;
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  public get wantImage() { return this._isHilited; }
  public static makeColor(severity: number): string {
    return severity <= 16 ? ColorDef.green.lerp(this._amber, (severity - 1) / 15.).toHexString() :
      this._amber.lerp(ColorDef.red, (severity - 16) / 14.).toHexString();
  }
  constructor(location: XYAndZ, public severity: number, public id: number, icon: Promise<HTMLImageElement>) {
    super(location, IncidentMarker._size);
    this.color = IncidentMarker.makeColor(severity);
    this.setImage(icon);
    this.imageOffset = IncidentMarker._imageOffset;
    this.imageSize = IncidentMarker._imageSize;
    this.label = severity.toString();
    this.title = "Incident Id: " + id;
    this.setScaleFactor({ low: .2, high: 1.4 });
  }
}

class IncidentMarkerSet extends MarkerSet<IncidentMarker> {
  private _warningSign = ImageUtil.fromUrl("Warning_sign.svg");

  protected getClusterMarker(cluster: ClusterMarker<IncidentMarker>): Marker {
    let total = cluster.markers.length;
    let highest = 0;
    cluster.markers.forEach((m) => {
      total += m.severity;
      if (m.severity > highest)
        highest = m.severity;
    });
    const average = total / cluster.markers.length;
    const marker = cluster.markers[0].makeFrom() as IncidentMarker;
    marker.drawFunc = marker.clusterDrawFunc;
    marker.setImage(this._warningSign);
    marker.imageOffset = new Point3d(0, 28);
    marker.imageSize = new Point2d(30, 30);
    marker.label = cluster.markers.length.toString();
    marker.labelColor = "black";
    marker.labelFont = "bold 14px san-serif";
    marker.title = "Total severity = " + total + "<br>Average severity = " + average + "<br>Highest severity = " + highest;
    marker.color = IncidentMarker.makeColor(highest);
    return marker;
  }
}

class IncidentMarkerDemo {
  private _incidents = new IncidentMarkerSet();
  private static _decorator?: IncidentMarkerDemo;

  public constructor() {
    const makerIcons = [
      ImageUtil.fromUrl("Hazard_biological.svg"),
      ImageUtil.fromUrl("Hazard_electric.svg"),
      ImageUtil.fromUrl("Hazard_flammable.svg"),
      ImageUtil.fromUrl("Hazard_toxic.svg"),
      ImageUtil.fromUrl("Hazard_tripping.svg"),
    ];

    const extents = activeViewState.iModelConnection!.projectExtents;
    const pos = new Point3d();
    for (let i = 0; i < 500; ++i) {
      pos.x = extents.low.x + (Math.random() * extents.xLength());
      pos.y = extents.low.y + (Math.random() * extents.yLength());
      pos.z = extents.low.z + (Math.random() * extents.zLength());
      this._incidents.markers.add(new IncidentMarker(pos, 1 + Math.round(Math.random() * 29), i, makerIcons[i % makerIcons.length]));
    }
  }

  public decorate(context: DecorateContext) {
    if (context.viewport.view.isSpatialView())
      this._incidents.addDecoration(context);
  }

  public static toggle() {
    if (undefined === IncidentMarkerDemo._decorator) {
      IncidentMarkerDemo._decorator = new IncidentMarkerDemo();
      IModelApp.viewManager.addDecorator(IncidentMarkerDemo._decorator);
    } else {
      IModelApp.viewManager.dropDecorator(IncidentMarkerDemo._decorator);
      IncidentMarkerDemo._decorator = undefined;
    }
  }
}

// Starts Measure between points tool
function startMeasurePoints(event: any) {
  const useMeasureTool = false;
  if (useMeasureTool) {
    const menu = document.getElementById("snapModeList") as HTMLDivElement;
    if (event.target === menu)
      return;
    IModelApp.tools.run("Measure.Points", theViewport!);
  } else {
    ProjectExtentsDecoration.toggle();
  }
}

// functions that start viewing commands, associated with icons in wireIconsToFunctions
function startToggleCamera(_event: any) {
  const togglingOff = theViewport!.isCameraOn;
  showStatus("Camera", togglingOff ? "off" : "on");
  IModelApp.tools.run("View.ToggleCamera", theViewport!);
}

function startFit(_event: any) {
  IModelApp.tools.run("View.Fit", theViewport!, true);
}

// starts Window Area
function startWindowArea(_event: any) {
  IModelApp.tools.run("View.WindowArea", theViewport!);
}

// starts element selection tool
function startSelect(_event: any) {
  IModelApp.tools.run("Select");
}

// starts walk command
function startWalk(_event: any) {
  IModelApp.tools.run("View.Walk", theViewport!);
}

// start rotate view.
function startRotateView(_event: any) {
  IModelApp.tools.run("View.Rotate", theViewport!);
}

// override symbology for selected elements
function changeOverrideColor() {
  const select = (document.getElementById("colorList") as HTMLSelectElement)!;
  overrideColor = new ColorDef(select.value);
  theViewport!.view.setFeatureOverridesDirty();
}

// change iModel on mobile app
async function changeModel(event: any) {
  const modelName = event.target.selectedOptions["0"].value;
  await resetStandaloneIModel("sample_documents/" + modelName);
}

// change active view.
async function changeView(event: any) {
  const spinner = document.getElementById("spinner") as HTMLDivElement;
  spinner.style.display = "block";
  const viewName = event.target.selectedOptions["0"].label;
  let view = viewMap.get(viewName);
  if (!(view instanceof ViewState)) {
    view = await activeViewState.iModelConnection!.views.load((view as IModelConnection.ViewSpec).id);
    viewMap.set(viewName, view);
  }
  await _changeView(view.clone());
  spinner.style.display = "none";
}

async function clearViews() {
  if (activeViewState.iModelConnection !== undefined)
    if (configuration.standalone)
      await activeViewState.iModelConnection.closeStandalone();
    else
      await activeViewState.iModelConnection!.close(activeViewState.accessToken!);
  activeViewState = new SimpleViewState();
  viewMap.clear();
  document.getElementById("viewList")!.innerHTML = "";
}

async function resetStandaloneIModel(filename: string) {
  const spinner = document.getElementById("spinner") as HTMLDivElement;

  spinner.style.display = "block";
  IModelApp.viewManager.dropViewport(theViewport!);
  await clearViews();
  await openStandaloneIModel(activeViewState, filename);
  await buildViewList(activeViewState);
  await openView(activeViewState);
  spinner.style.display = "none";
}

async function selectIModel() {
  if (ElectronRpcConfiguration.isElectron) {  // Electron
    const options = {
      properties: ["openFile"],
      filters: [{ name: "IModels", extensions: ["ibim", "bim"] }],
    };
    remote.dialog.showOpenDialog(options, async (filePaths?: string[]) => {
      if (undefined !== filePaths)
        await resetStandaloneIModel(filePaths[0]);
    });
  } else {  // Browser
    if (configuration.standalonePath === undefined || !document.createEvent) { // Do not have standalone path for files or support for document.createEvent... request full file path
      const filePath = prompt("Enter the full local path of the iModel you wish to open:");
      if (filePath !== null) {
        try {
          await resetStandaloneIModel(filePath);
        } catch {
          alert("Error - The file path given is invalid.");
          const spinner = document.getElementById("spinner") as HTMLDivElement;
          spinner.style.display = "none";
        }
      }
    } else {  // Was given a base path for all standalone files. Let them select file using file selector
      const selector = document.getElementById("browserFileSelector");
      const evt = document.createEvent("MouseEvents");
      evt.initEvent("click", true, false);
      selector!.dispatchEvent(evt);
    }
  }
}

// undo prev view manipulation
function doUndo(_event: any) {
  IModelApp.tools.run("View.Undo", theViewport!);
}

// redo view manipulation
function doRedo(_event: any) {
  IModelApp.tools.run("View.Redo", theViewport!);
}

function setFpsInfo() {
  const perfMet = (theViewport!.target as Target).performanceMetrics;
  if (document.getElementById("showfps") && perfMet) document.getElementById("showfps")!.innerHTML =
    "Avg. FPS: " + (perfMet.spfTimes.length / perfMet.spfSum).toFixed(2)
    + " Render Time (ms): " + (perfMet.renderSpfSum / perfMet.renderSpfTimes.length).toFixed(2)
    + "<br />Scene Time (ms): " + (perfMet.loadTileSum / perfMet.loadTileTimes.length).toFixed(2);
}

function addRenderModeHandler(id: string) {
  document.getElementById(id)!.addEventListener("click", () => applyRenderModeChange(id));
}

// associate viewing commands to icons. I couldn't get assigning these in the HTML to work.
function wireIconsToFunctions() {
  if (MobileRpcConfiguration.isMobileFrontend) {
    const modelList = document.createElement("select");
    modelList.id = "modelList";
    // Use hardcoded list for test sample files
    modelList.innerHTML =
      " <option value='04_Plant.i.ibim'>04_Plant</option> \
        <option value='almostopaque.ibim'>almostopaque</option> \
        <option value='mesh_widget_piece.ibim'>mesh_widget_piece</option> \
        <option value='PhotoRealisticRendering.ibim'>PhotoRealisticRendering</option> \
        <option value='PSolidNewTransparent.ibim'>PSolidNewTransparent</option> \
        <option value='rectangle.ibim'>rectangle</option> \
        <option value='scattergories.ibim'>scattergories</option> \
        <option value='SketchOnSurface.ibim'>SketchOnSurface</option> \
        <option value='slabs.ibim'>slabs</option> \
        <option value='small_building_2.ibim'>small_building_2</option> \
        <option value='tr_blk.ibim'>tr_blk</option>";

    document.getElementById("toolBar")!.replaceChild(modelList, document.getElementById("selectIModel")!);
    modelList.addEventListener("change", changeModel);
  } else {
    document.getElementById("selectIModel")!.addEventListener("click", selectIModel);
  }
  document.getElementById("viewList")!.addEventListener("change", changeView);
  document.getElementById("startToggleModel")!.addEventListener("click", startToggleModel);
  document.getElementById("startCategorySelection")!.addEventListener("click", startCategorySelection);
  document.getElementById("startToggleCamera")!.addEventListener("click", startToggleCamera);
  document.getElementById("startFit")!.addEventListener("click", startFit);
  document.getElementById("startWindowArea")!.addEventListener("click", startWindowArea);
  document.getElementById("startSelect")!.addEventListener("click", startSelect);
  document.getElementById("startMeasurePoints")!.addEventListener("click", startMeasurePoints);
  document.getElementById("incidentMarkers")!.addEventListener("click", IncidentMarkerDemo.toggle);
  document.getElementById("startWalk")!.addEventListener("click", startWalk);
  document.getElementById("startRotateView")!.addEventListener("click", startRotateView);
  document.getElementById("switchStandardRotation")!.addEventListener("click", toggleStandardViewMenu);
  document.getElementById("renderModeToggle")!.addEventListener("click", toggleRenderModeMenu);
  document.getElementById("snapModeToggle")!.addEventListener("click", toggleSnapModeMenu);
  document.getElementById("doUndo")!.addEventListener("click", doUndo);
  document.getElementById("doRedo")!.addEventListener("click", doRedo);

  // standard view rotation handlers
  document.getElementById("top")!.addEventListener("click", () => applyStandardViewRotation(StandardViewId.Top, "Top"));
  document.getElementById("bottom")!.addEventListener("click", () => applyStandardViewRotation(StandardViewId.Bottom, "Bottom"));
  document.getElementById("left")!.addEventListener("click", () => applyStandardViewRotation(StandardViewId.Left, "Left"));
  document.getElementById("right")!.addEventListener("click", () => applyStandardViewRotation(StandardViewId.Right, "Right"));
  document.getElementById("front")!.addEventListener("click", () => applyStandardViewRotation(StandardViewId.Front, "Front"));
  document.getElementById("back")!.addEventListener("click", () => applyStandardViewRotation(StandardViewId.Back, "Back"));
  document.getElementById("iso")!.addEventListener("click", () => applyStandardViewRotation(StandardViewId.Iso, "Iso"));
  document.getElementById("rightIso")!.addEventListener("click", () => applyStandardViewRotation(StandardViewId.RightIso, "RightIso"));

  // render mode handlers
  addRenderModeHandler("skybox");
  addRenderModeHandler("groundplane");
  addRenderModeHandler("ACSTriad");
  addRenderModeHandler("fill");
  addRenderModeHandler("grid");
  addRenderModeHandler("textures");
  addRenderModeHandler("visibleEdges");
  addRenderModeHandler("hiddenEdges");
  addRenderModeHandler("materials");
  addRenderModeHandler("lights");
  addRenderModeHandler("monochrome");
  addRenderModeHandler("constructions");
  addRenderModeHandler("clipVolume");
  addRenderModeHandler("weights");
  addRenderModeHandler("styles");
  addRenderModeHandler("transparency");
  addRenderModeHandler("backgroundMap");
  document.getElementById("continuousRendering")!.addEventListener("click", () => {
    const checked: boolean = (document.getElementById("continuousRendering")! as HTMLInputElement).checked;
    if (theViewport) {
      theViewport.continuousRendering = checked;
      (theViewport!.target as Target).performanceMetrics = checked ? new PerformanceMetrics(false, true) : undefined;
    }
    if (checked) {
      curFPSIntervalId = setInterval(setFpsInfo, 500);
      document.getElementById("showfps")!.style.display = "inline";
    } else {
      document.getElementById("showfps")!.style.display = "none";
      clearInterval(curFPSIntervalId);
    }
  });

  const boundingBoxes = document.getElementById("boundingBoxes")! as HTMLInputElement;
  boundingBoxes.addEventListener("click", () => theViewport!.wantTileBoundingBoxes = boundingBoxes.checked);

  document.getElementById("renderModeList")!.addEventListener("change", () => changeRenderMode());
  document.getElementById("mapProviderList")!.addEventListener("change", () => changeBackgroundMapState());
  document.getElementById("mapTypeList")!.addEventListener("change", () => changeBackgroundMapState());
  document.getElementById("colorList")!.addEventListener("change", () => changeOverrideColor());

  // File Selector for the browser (a change represents a file selection)... only used when in browser and given base path for local files
  document.getElementById("browserFileSelector")!.addEventListener("change", async function onChange(this: HTMLElement) {
    const files = (this as any).files;
    if (files !== undefined && files.length > 0) {
      try {
        await resetStandaloneIModel(configuration.standalonePath + "/" + files[0].name);
      } catch {
        alert("Error Opening iModel - Make sure you are selecting files from the following directory: " + configuration.standalonePath);
        const spinner = document.getElementById("spinner") as HTMLDivElement;
        spinner.style.display = "none";
      }
    }
  });
}

// If we are using a browser, close the current iModel before leaving
window.onbeforeunload = () => {
  if (activeViewState.iModelConnection !== undefined)
    if (configuration.standalone)
      activeViewState.iModelConnection.closeStandalone();
    else
      activeViewState.iModelConnection.close(activeViewState.accessToken!);
};

function stringToSnapMode(name: string): SnapMode {
  switch (name) {
    case "Keypoint": return SnapMode.NearestKeypoint;
    case "Nearest": return SnapMode.Nearest;
    case "Center": return SnapMode.Center;
    case "Origin": return SnapMode.Origin;
    case "Intersection": return SnapMode.Intersection;
    default: return SnapMode.NearestKeypoint;
  }
}

class SVTAccuSnap extends AccuSnap {
  public getActiveSnapModes(): SnapMode[] {
    const select = (document.getElementById("snapModeList") as HTMLSelectElement)!;
    const snapMode = stringToSnapMode(select.value);
    const snaps: SnapMode[] = [];
    snaps.push(snapMode);
    return snaps;
  }
}

class SVTNotifications extends NotificationManager {
  private _toolTip?: Tooltip;
  private _el?: HTMLElement;
  private _tooltipDiv?: HTMLDivElement;

  public outputPrompt(prompt: string) { showStatus(prompt); }

  /** Output a message and/or alert to the user. */
  public outputMessage(message: NotifyMessageDetails) { showError(message.briefMessage); }

  public openMessageBox(_mbType: MessageBoxType, _message: string, _icon: MessageBoxIconType): Promise<MessageBoxValue> {
    const rootDiv: HTMLDivElement = document.getElementById("root") as HTMLDivElement;
    if (!rootDiv)
      return Promise.resolve(MessageBoxValue.Cancel);
    // create a dialog element.
    const dialog: HTMLDialogElement = document.createElement("dialog") as HTMLDialogElement;
    dialog.className = "notification-messagebox";

    // set up the message
    const span: HTMLSpanElement = document.createElement("span");
    span.innerHTML = _message;
    span.className = "notification-messageboxtext";
    dialog.appendChild(span);

    // make the ok button.
    const button: HTMLButtonElement = document.createElement("button");
    button.className = "notification-messageboxbutton";
    button.innerHTML = "Ok";
    button.onclick = (event) => {
      const okButton = event.target as HTMLButtonElement;
      const msgDialog = okButton.parentElement as HTMLDialogElement;
      const topDiv = msgDialog.parentElement as HTMLDivElement;
      msgDialog.close();
      topDiv.removeChild(dialog);
    };
    dialog.appendChild(button);

    // add the dialog to the root div element and show it.
    rootDiv.appendChild(dialog);
    dialog.showModal();

    return Promise.resolve(MessageBoxValue.Ok);
  }

  protected toolTipIsOpen(): boolean { return undefined !== this._toolTip; }

  public clearToolTip(): void {
    if (!this.isToolTipOpen)
      return;

    this._toolTip!.dispose();
    this._el!.removeChild(this._tooltipDiv!);
    this._toolTip = undefined;
    this._el = undefined;
    this._tooltipDiv = undefined;
  }

  protected _showToolTip(el: HTMLElement, message: string, pt?: XAndY, options?: ToolTipOptions): void {
    this.clearToolTip();

    const rect = el.getBoundingClientRect();
    if (undefined === pt)
      pt = { x: rect.width / 2, y: rect.height / 2 };

    const location = document.createElement("div");
    const height = 20;
    const width = 20;
    location.style.position = "absolute";
    location.style.top = (pt.y - height / 2) + "px";
    location.style.left = (pt.x - width / 2) + "px";
    location.style.width = width + "px";
    location.style.height = height + "px";

    el.appendChild(location);

    this._el = el;
    this._tooltipDiv = location;
    this._toolTip = new ttjs.default(location, { trigger: "manual", html: true, placement: (options && options.placement) ? options.placement as any : "right-start", title: message });
    this._toolTip!.show();
  }
}

class SVTIModelApp extends IModelApp {
  protected static onStartup(): void {
    IModelApp.accuSnap = new SVTAccuSnap();
    IModelApp.notifications = new SVTNotifications();
    const svtToolNamespace = IModelApp.i18n.registerNamespace("SVTTools");
    MeasurePointsTool.register(svtToolNamespace);
  }
}

const docReady = new Promise((resolve) => {
  window.addEventListener("DOMContentLoaded", () => {
    resolve();
  });
});

// main entry point.
async function main() {
  if (!MobileRpcConfiguration.isMobileFrontend) {
    // retrieve, set, and output the global configuration variable
    await retrieveConfiguration(); // (does a fetch)
    console.log("Configuration", JSON.stringify(configuration));
  }
  // Start the app. (This tries to fetch a number of localization json files from the orgin.)
  SVTIModelApp.startup();

  // Choose RpcConfiguration based on whether we are in electron or browser
  let rpcConfiguration: RpcConfiguration;
  if (ElectronRpcConfiguration.isElectron) {
    rpcConfiguration = ElectronRpcManager.initializeClient({}, [IModelTileRpcInterface, StandaloneIModelRpcInterface, IModelReadRpcInterface]);
  } else if (MobileRpcConfiguration.isMobileFrontend) {
    Object.assign(configuration, { standalone: true, iModelName: "sample_documents/04_Plant.i.ibim" });
    rpcConfiguration = MobileRpcManager.initializeClient([IModelTileRpcInterface, StandaloneIModelRpcInterface, IModelReadRpcInterface]);
  } else {
    rpcConfiguration = BentleyCloudRpcManager.initializeClient({ info: { title: "SimpleViewApp", version: "v1.0" } }, [IModelTileRpcInterface, StandaloneIModelRpcInterface, IModelReadRpcInterface]);
    Config.devCorsProxyServer = "https://localhost:3001";
    // WIP: WebAppRpcProtocol seems to require an IModelToken for every RPC request. ECPresentation initialization tries to set active locale using
    // RPC without any imodel and fails...
    for (const definition of rpcConfiguration.interfaces())
      RpcOperation.forEach(definition, (operation) => operation.policy.token = (_request) => new IModelToken("test", "test", "test", "test", OpenMode.Readonly));
  }

  const uiReady = displayUi();  // Get the browser started loading our html page and the svgs that it references but DON'T WAIT

  // while the browser is loading stuff, start work on logging in and downloading the imodel, etc.
  try {
    if (configuration.standalone) {
      await openStandaloneIModel(activeViewState, configuration.iModelName!);
    } else {
      IModelApp.hubDeploymentEnv = configuration.environment || "QA";
      const projectMgr: ProjectAbstraction = configuration.useIModelBank ? new NonConnectProject() : new ConnectProject();
      await projectMgr.loginAndOpenImodel(activeViewState);
    }

  } catch (reason) {
    alert(reason);
    return;
  }

  await uiReady; // Now wait for the HTML UI to finish loading.

  // open the specified view
  showStatus("opening View", configuration.viewName);
  await buildViewList(activeViewState, configuration);

  showStatus("View Ready");
  hideSpinner();

  // now connect the view to the canvas
  await openView(activeViewState);
}

// Set up the HTML UI elements and wire them to our functions
async function displayUi() {
  return new Promise(async (resolve) => {
    await docReady; // We must wait for the document to be in place.
    showSpinner();
    wireIconsToFunctions();
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
main();
