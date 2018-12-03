/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { JsonUtils, OpenMode, ActivityLoggingContext, Guid } from "@bentley/bentleyjs-core";
import { Point2d, Point3d, Transform, Vector3d, XAndY, XYAndZ, Geometry, Range3d, Arc3d, AngleSweep, LineString3d } from "@bentley/geometry-core";
import { IModelJson as GeomJson } from "@bentley/geometry-core/lib/serialization/IModelJsonSchema";
import {
  AxisAlignedBox3d, BentleyCloudRpcManager, ColorDef, ElectronRpcConfiguration, ElectronRpcManager, IModelReadRpcInterface,
  IModelTileRpcInterface, IModelToken, LinePixels, ModelProps, ModelQueryParams, RenderMode, RgbColor, RpcConfiguration,
  RpcOperation, StandaloneIModelRpcInterface, ViewQueryParams, ColorByName, GeometryStreamProps, BackgroundMapType, ContextRealityModelProps,
} from "@bentley/imodeljs-common";
import { AccessToken, Config, OidcFrontendClientConfiguration } from "@bentley/imodeljs-clients";
import { OidcClientWrapper } from "@bentley/ui-framework/lib/oidc";
import { MobileRpcConfiguration, MobileRpcManager } from "@bentley/imodeljs-common/lib/rpc/mobile/MobileRpcManager";
import {
  AccuDraw, AccuDrawHintBuilder, AccuDrawShortcuts, AccuSnap, BeButtonEvent, Cluster, CoordinateLockOverrides, DecorateContext,
  DynamicsContext, EditManipulator, EventHandled, HitDetail, imageElementFromUrl, IModelApp, IModelConnection, Marker, MarkerSet, MessageBoxIconType,
  MessageBoxType, MessageBoxValue, NotificationManager, NotifyMessageDetails, PrimitiveTool, RotationMode, ScreenViewport, SnapMode,
  SpatialModelState, SpatialViewState, StandardViewId, ToolTipOptions, Viewport, ViewState, ViewState3d, MarkerImage, BeButton, SnapStatus, imageBufferToPngDataUrl,
  ContextRealityModelState,
} from "@bentley/imodeljs-frontend";
import { FeatureSymbology, GraphicType } from "@bentley/imodeljs-frontend/lib/rendering";
import { PerformanceMetrics, Target } from "@bentley/imodeljs-frontend/lib/webgl";
import ToolTip from "tooltip.js";
import { IModelApi } from "./IModelApi";
import { SimpleViewState } from "./SimpleViewState";
import { showError, showStatus } from "./Utils";
import { initializeCustomCloudEnv } from "./CustomCloudEnv";
import { initializeIModelHub } from "./ConnectEnv";
import { SVTConfiguration } from "../common/SVTConfiguration";

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

const availableContextRealityModels: ContextRealityModelProps[] = ContextRealityModelState.findAvailableRealityModels();

let activeViewState: SimpleViewState = new SimpleViewState();
const viewMap = new Map<string, ViewState | IModelConnection.ViewSpec>();
let theViewport: ScreenViewport | undefined;
let curModelProps: ModelProps[] = [];
let curModelPropIndices: number[] = [];
let curNumModels = 0;
const curCategories = new Set<string>();
const configuration = {} as SVTConfiguration;
let curFPSIntervalId: NodeJS.Timer;
let overrideColor: ColorDef | undefined;
let overrideTransparency: number | undefined;
let curContextRealityModels: ContextRealityModelState[];

function addFeatureOverrides(ovrs: FeatureSymbology.Overrides, viewport: Viewport): void {
  if (undefined === overrideColor && undefined === overrideTransparency)
    return;

  const color = undefined !== overrideColor ? RgbColor.fromColorDef(overrideColor) : undefined;
  const app = FeatureSymbology.Appearance.fromJSON({ rgb: color, weight: 4, linePixels: LinePixels.Code1, transparency: overrideTransparency });
  for (const elemId of viewport.iModel.selectionSet.elements)
    ovrs.overrideElement(elemId, app);
}

// Retrieves the configuration for starting SVT from configuration.json file located in the built public folder
async function retrieveConfiguration(): Promise<void> {
  return new Promise<void>((resolve, _reject) => {
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

// opens the configured iModel from iModelHub or iModelBank
async function openIModel(state: SimpleViewState) {
  await retrieveProjectConfiguration();
  configuration.iModelName = activeViewState.projectConfig!.iModelName;
  if (configuration.customOrchestratorUri)
    await initializeCustomCloudEnv(state, configuration.customOrchestratorUri);
  else {
    await initializeIModelHub(state);
  }

  state.iModel = await IModelApi.getIModelByName(state.accessToken!, state.project!.wsgId, configuration.iModelName!);
  if (state.iModel === undefined)
    throw new Error(`${configuration.iModelName} - IModel not found in project ${state.project!.name}`);
  state.iModelConnection = await IModelApi.openIModel(state.accessToken!, state.project!.wsgId, state.iModel!.wsgId, undefined, OpenMode.Readonly);
}

// selects the configured view.
async function buildViewList(state: SimpleViewState, configurations?: { viewName?: string }) {
  const config = undefined !== configurations ? configurations : {};
  const viewList = document.getElementById("viewList") as HTMLSelectElement;
  const viewQueryParams: ViewQueryParams = { wantPrivate: false };
  const viewSpecs: IModelConnection.ViewSpec[] = await state.iModelConnection!.views.getViewList(viewQueryParams);
  if (undefined === config.viewName) {
    const defaultViewId = (await state.iModelConnection!.views.queryDefaultViewId()).toString();
    for (const spec of viewSpecs) {
      if (spec.id.toString() === defaultViewId) {
        config.viewName = spec.name;
        break;
      }
    }
  }

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
function startToggleModel() {
  const menu = document.getElementById("toggleModelMenu") as HTMLDivElement;
  menu.style.display = menu.style.display === "none" || menu.style.display === "" ? "block" : "none";
}
// open up the context model toggle menu
function startToggleContextRealityModel() {
  const menu = document.getElementById("toggleContextRealityModelMenu") as HTMLDivElement;
  menu.style.display = menu.style.display === "none" || menu.style.display === "" ? "block" : "none";
}

// open up the category selection model
function startCategorySelection() {
  const menu = document.getElementById("categorySelectionMenu") as HTMLDivElement;
  menu.style.display = menu.style.display === "none" || menu.style.display === "" ? "block" : "none";
}

// build list of contextRealityContextRealityModels; enables those defined in contextRealityModel selector
async function buildContextRealityModelMenu(state: SimpleViewState) {
  const contextRealityModelMenu = document.getElementById("toggleContextRealityModelMenu") as HTMLDivElement;
  const contextRealityModelButton = document.getElementById("startToggleContextRealityModel")!;
  const spatialView = undefined !== state.viewState && state.viewState instanceof SpatialViewState ? state.viewState as SpatialViewState : undefined;
  if (undefined === spatialView) {
    contextRealityModelMenu.style.display = contextRealityModelButton.style.display = "none";
    return;
  }
  curContextRealityModels = [];
  contextRealityModelButton.style.display = "inline";
  contextRealityModelMenu.innerHTML = '<input id="cbxCRMToggleAll" type="checkbox"> Toggle All\n<br>\n';
  for (const availableCRM of availableContextRealityModels) {
    const contextRealityModel = new ContextRealityModelState(availableCRM, activeViewState.iModelConnection!);

    if (await contextRealityModel.intersectsProjectExtents()) {   // Add geospatial filtering
      curContextRealityModels.push(contextRealityModel);
    }
  }
  if (curContextRealityModels.length === 0) {
    contextRealityModelMenu.style.display = contextRealityModelButton.style.display = "none";
    return;
  }

  for (const contextRealityModel of curContextRealityModels) {
    const cbxName = "cbxCRM" + contextRealityModel.url; // Use URL for ID.
    contextRealityModelMenu.innerHTML += '&nbsp;&nbsp;<input id="' + cbxName + '" type="checkbox"> ' + contextRealityModel.name + "\n<br>\n";
  }

  let allEnabled = true;    // TBD - Test if all enabled

  for (const contextRealityModel of curContextRealityModels) {
    const enabled = spatialView.displayStyle.containsContextRealityModel(contextRealityModel);
    if (!enabled) allEnabled = false;
    const cbxName = "cbxCRM" + contextRealityModel.url; // Use URL for ID.
    updateCheckboxToggleState(cbxName, enabled);
    addContextRealityModelToggleHandler(cbxName);
  }
  updateCheckboxToggleState("cbxCRMToggleAll", allEnabled);
  addContextRealityModelToggleAllHandler();
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
  modelMenu.innerHTML = '<input id="cbxModelToggleAll" type="checkbox"> Toggle All\n<br>\n';

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
  let allEnabled: boolean = true;
  for (let c = 0; c < curNumModels; c++) {
    const cbxName = "cbxModel" + c;
    const enabled = spatialView.modelSelector.has(curModelProps[c].id!.toString());
    if (!enabled)
      allEnabled = false;

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

  updateCheckboxToggleState("cbxModelToggleAll", allEnabled);
  addModelToggleAllHandler();

  applyModelToggleChange("cbxModel0"); // force view to update based on all being enabled
}

// build list of categories; enable those defined in category selector
async function buildCategoryMenu(state: SimpleViewState) {
  curCategories.clear();
  let html = '<input id="cbxCatToggleAll" type="checkbox"> Toggle All\n<br>\n';

  const view = state.viewState!;
  if (undefined === view) return;
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

  let allEnabled: boolean = true;
  for (let c = 0; c < curNumModels; c++) {
    const cbxName = "cbxModel" + c;
    const isChecked = getCheckboxToggleState(cbxName);
    if (isChecked)
      view.addViewedModel(curModelProps[curModelPropIndices[c]].id!);
    else
      allEnabled = false;
  }

  theViewport!.sync.invalidateScene();

  updateCheckboxToggleState("cbxModelToggleAll", allEnabled);

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
// apply a model checkbox state being changed (actually change list of viewed models)
function applyContextRealityModelToggleChange(_cbxContextRealityModel: string) {
  if (!(theViewport!.view instanceof SpatialViewState))
    return;
  const view = theViewport!.view as SpatialViewState;
  const currentCRMs = view.displayStyle.contextRealityModels;
  const prefix = "cbxCRM";

  for (let i = 0; i < currentCRMs.length; i++) {
    if (prefix + currentCRMs[i].url === _cbxContextRealityModel) {
      currentCRMs.splice(i, 1);
      theViewport!.sync.invalidateScene();
      return;
    }
  }
  currentCRMs.push(new ContextRealityModelState({ name: "", tilesetUrl: _cbxContextRealityModel.slice(prefix.length) }, activeViewState.iModelConnection!));
  theViewport!.sync.invalidateScene();
}
function applyContextRealityModelToggleAllChange() {
  if (!(theViewport!.view instanceof SpatialViewState))
    return;

  const isChecked = getCheckboxToggleState("cbxCRMToggleAll");
  const view = theViewport!.view as SpatialViewState;
  const displayStyle = view.displayStyle;

  if (!isChecked)
    displayStyle.contextRealityModels = [];

  for (const curr of curContextRealityModels) {
    if (isChecked && !displayStyle.containsContextRealityModel(curr))
      displayStyle.contextRealityModels.push(curr);

    const cbxName = "cbxCRM" + curr.url; // Use URL for ID.
    updateCheckboxToggleState(cbxName, isChecked);
  }
  theViewport!.sync.invalidateScene();
}

function toggleCategoryState(invis: boolean, catId: string, view: ViewState) {
  const enableAllSubCategories = false; // set to true to emulate semi-wacky Navigator behavior...
  const alreadyInvis = !view.viewsCategory(catId);
  if (alreadyInvis !== invis)
    view.changeCategoryDisplay(catId, !invis, enableAllSubCategories);
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

function applyModelToggleAllChange() {
  if (!(theViewport!.view instanceof SpatialViewState))
    return;

  const view = theViewport!.view as SpatialViewState;
  view.clearViewedModels();

  const isChecked = getCheckboxToggleState("cbxModelToggleAll");
  for (let c = 0; c < curNumModels; c++) {
    const cbxName = "cbxModel" + c;
    (document.getElementById(cbxName)! as HTMLInputElement).checked = isChecked;
    if (isChecked) {
      const id = curModelProps[curModelPropIndices[c]].id!;
      view.addViewedModel(id);
    }
  }

  theViewport!.sync.invalidateScene();

  const menu = document.getElementById("toggleModelMenu") as HTMLDivElement;
  menu.style.display = "none"; // menu.style.display === "none" || menu.style.display === "" ? "none" : "block";
}

// add a click handler to model checkbox
function addModelToggleHandler(id: string) {
  document.getElementById(id)!.addEventListener("click", () => applyModelToggleChange(id));
}

function addModelToggleAllHandler() {
  document.getElementById("cbxModelToggleAll")!.addEventListener("click", () => applyModelToggleAllChange());
}

// add a click handler to context reality model checkbox
function addContextRealityModelToggleHandler(id: string) {
  document.getElementById(id)!.addEventListener("click", () => applyContextRealityModelToggleChange(id));
}

function addContextRealityModelToggleAllHandler() {
  document.getElementById("cbxCRMToggleAll")!.addEventListener("click", () => applyContextRealityModelToggleAllChange());
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

function toggleStandardViewMenu() {
  const menu = document.getElementById("standardRotationMenu") as HTMLDivElement;
  menu.style.display = menu.style.display === "none" || menu.style.display === "" ? "block" : "none";
}

function toggleDebugToolsMenu() {
  const menu = document.getElementById("debugToolsMenu") as HTMLDivElement;
  menu.style.display = menu.style.display === "none" || menu.style.display === "" ? "block" : "none";
}

function toggleRenderModeMenu() {
  const menu = document.getElementById("changeRenderModeMenu") as HTMLDivElement;
  menu.style.display = menu.style.display === "none" || menu.style.display === "" ? "block" : "none";
}

function toggleSnapModeMenu() {
  const menu = document.getElementById("changeSnapModeMenu") as HTMLDivElement;
  menu.style.display = menu.style.display === "none" || menu.style.display === "" ? "block" : "none";
}

function toggleAnimationMenu() {
  const menu = document.getElementById("animationMenu") as HTMLDivElement;
  menu.style.display = menu.style.display === "none" || menu.style.display === "" ? "block" : "none";
}

let isAnimating: boolean = false;
let isAnimationPaused: boolean = false;
let animationStartTime: number = 0;
let animationPauseTime: number = 0;
let animationEndTime: number = 0;

function setAnimationStateMessage(msg: string) {
  const animationState = document.getElementById("animationState") as HTMLDivElement;
  animationState.innerHTML = msg;
}

function enableAnimationUI(enabled: boolean = true) {
  const animationDuration = document.getElementById("animationDuration") as HTMLInputElement;
  const animationLoop = document.getElementById("animationLoop") as HTMLInputElement;
  animationDuration.disabled = !enabled;
  animationLoop.disabled = !enabled;
}

function isAnimationLooping(): boolean {
  const animationLoop = document.getElementById("animationLoop") as HTMLInputElement;
  return animationLoop.checked;
}

function processAnimationSliderAdjustment() {
  const animationSlider = document.getElementById("animationSlider") as HTMLInputElement;

  if (animationSlider.value === "0") {
    stopAnimation();
    return;
  }

  if (!isAnimating)
    startAnimation();
  if (!isAnimationPaused)
    pauseAnimation();

  const sliderValue = parseInt(animationSlider.value, undefined);
  const animationFraction = sliderValue / 1000.0;
  animationPauseTime = animationStartTime + (animationEndTime - animationStartTime) * animationFraction;
  theViewport!.animationFraction = animationFraction;
}

function updateAnimation() {
  if (isAnimationPaused) {
    window.requestAnimationFrame(updateAnimation);
    return;
  }

  const animationSlider = document.getElementById("animationSlider") as HTMLInputElement;
  const animationCurTime = (new Date()).getTime();
  theViewport!.animationFraction = (animationCurTime - animationStartTime) / (animationEndTime - animationStartTime);
  animationSlider.value = (theViewport!.animationFraction * 1000).toString();
  const userHitStop = !isAnimating;
  if (animationCurTime >= animationEndTime || !isAnimating) { // stop the animation!
    enableAnimationUI();
    animationSlider.value = "0";
    theViewport!.animationFraction = 0;
    isAnimating = false;
    setAnimationStateMessage("Stopped.");
  } else { // continue the animation - request the next frame
    window.requestAnimationFrame(updateAnimation);
  }
  if (!userHitStop && isAnimationLooping()) // only loop if user did not hit stop (naturally finished animation)
    startAnimation();
}

function startAnimation() {
  if (isAnimationPaused) { // resume animation
    const animationPauseOffset = (new Date()).getTime() - animationPauseTime; // how long were we paused?
    animationStartTime += animationPauseOffset;
    animationEndTime += animationPauseOffset;
    setAnimationStateMessage("Playing.");
    isAnimationPaused = false;
    return;
  }

  if (isAnimating)
    return; // cannot animate while animating

  setAnimationStateMessage("Playing.");

  theViewport!.animationFraction = 0;
  animationStartTime = (new Date()).getTime();
  const animationDuration = document.getElementById("animationDuration") as HTMLInputElement;
  animationEndTime = animationStartTime + parseFloat(animationDuration.value) * 1000;
  enableAnimationUI(false);
  isAnimating = true;
  isAnimationPaused = false;
  window.requestAnimationFrame(updateAnimation);
}

function pauseAnimation() {
  if (isAnimationPaused || !isAnimating)
    return;
  animationPauseTime = (new Date()).getTime();
  isAnimationPaused = true;
  setAnimationStateMessage("Paused.");
}

function stopAnimation() {
  if (!isAnimating)
    return; // already not animating!
  isAnimating = false;
  isAnimationPaused = false;
}

function processAnimationMenuEvent() { // keep animation menu open even when it is clicked
  const menu = document.getElementById("animationMenu") as HTMLDivElement;
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

  const targetMatrix = inverse.multiplyMatrixMatrix(theViewport.rotation);
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

function stringToMapType(s: string): BackgroundMapType {
  if ("Street" === s) return BackgroundMapType.Street;
  if ("Aerial" === s) return BackgroundMapType.Aerial;
  return BackgroundMapType.Hybrid;
}

function mapTypeToString(m: BackgroundMapType): string {
  if (BackgroundMapType.Street === m) return "Street";
  if (BackgroundMapType.Aerial === m) return "Aerial";
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
  ds.setBackgroundMap({ providerName: mapProviderString, providerData: { mapType: mapTypeVal } });
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
  let mapType = BackgroundMapType.Hybrid;
  if (theViewport!.view.is3d()) {
    const view = theViewport!.view as ViewState3d;
    const env = view.getDisplayStyle3d().environment;
    skybox = env.sky.display;
    groundplane = env.ground.display;
    const backgroundMap = view.getDisplayStyle3d().backgroundMap;
    providerName = JsonUtils.asString(backgroundMap.providerName, "BingProvider");
    mapType = JsonUtils.asInt(backgroundMap.mapType, BackgroundMapType.Hybrid);
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
  if (undefined === theViewport) {
    const vpDiv = document.getElementById("imodel-viewport") as HTMLDivElement;
    theViewport = ScreenViewport.create(vpDiv, state.viewState!);
  }

  await _changeView(state.viewState!);
  theViewport.addFeatureOverrides = addFeatureOverrides;
  theViewport.continuousRendering = (document.getElementById("continuousRendering")! as HTMLInputElement).checked;
  theViewport.wantTileBoundingBoxes = (document.getElementById("boundingBoxes")! as HTMLInputElement).checked;
  IModelApp.viewManager.addViewport(theViewport);
}

async function _changeView(view: ViewState) {
  stopAnimation(); // cease any previous animation
  theViewport!.changeView(view);
  activeViewState.viewState = view;
  await buildModelMenu(activeViewState);
  await buildCategoryMenu(activeViewState);
  await buildContextRealityModelMenu(activeViewState);
  updateRenderModeOptionsMap();
}

export class MeasurePointsTool extends PrimitiveTool {
  public static toolId = "Measure.Points";
  public readonly points: Point3d[] = [];
  protected _snapGeomId?: string;

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

  public testDecorationHit(id: string): boolean { return id === this._snapGeomId; }

  public getDecorationGeometry(_hit: HitDetail): GeometryStreamProps | undefined {
    if (this.points.length < 2)
      return undefined;

    const geomData = GeomJson.Writer.toIModelJson(LineString3d.create(this.points));
    return (undefined === geomData ? undefined : [geomData]);
  }

  public decorate(context: DecorateContext): void {
    if (this.points.length < 2)
      return;

    if (undefined === this._snapGeomId)
      this._snapGeomId = this.iModel.transientIds.next;

    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration, undefined, this._snapGeomId);

    builder.setSymbology(context.viewport.getContrastToBackgroundColor(), ColorDef.black, 1);
    builder.addLineString(this.points);

    context.addDecorationFromBuilder(builder);
  }

  public onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    if (this.points.length < 1)
      return;

    const builder = context.createGraphicBuilder(GraphicType.Scene);

    builder.setSymbology(context.viewport.getContrastToBackgroundColor(), ColorDef.black, 1);
    builder.addLineString([this.points[this.points.length - 1], ev.point]); // Only draw current segment in dynamics, accepted segments are drawn as pickable decorations...

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
    if (undefined !== IModelApp.accuSnap.currHit) {
      const status = await IModelApp.accuSnap.resetButton(); // Test AccuSnap hit cycling...only restart when no current hit or not hot snap on next hit...
      if (SnapStatus.Success === status)
        return EventHandled.No;
    }
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
  protected _anchorIndex: number;
  protected _ids: string[];
  protected _base: Point3d[];
  protected _axis: Vector3d[];

  public constructor(manipulator: EditManipulator.HandleProvider, hitId: string, ids: string[], base: Point3d[], axis: Vector3d[]) {
    super(manipulator);
    this._anchorIndex = ids.indexOf(hitId);
    this._ids = ids;
    this._base = base;
    this._axis = axis;
  }

  protected init(): void {
    this.receivedDownEvent = true;
    this.initLocateElements(false, false, undefined, CoordinateLockOverrides.All); // Disable locate/snap/locks for control modification; overrides state inherited from suspended primitive...
    IModelApp.accuDraw.deactivate(); // Disable activate of compass from beginDynamics...
    this.beginDynamics();
  }

  protected accept(ev: BeButtonEvent): boolean {
    const extents = this.computeNewExtents(ev);
    if (undefined === extents)
      return true;

    // NEEDSWORK: Update extents and low/high markers...
    return true;
  }

  public computeNewExtents(ev: BeButtonEvent): Range3d | undefined {
    if (-1 === this._anchorIndex || undefined === ev.viewport)
      return undefined;

    // NOTE: Use AccuDraw z instead of view z if AccuDraw is explicitly enabled (tool disables by default)...
    const projectedPt = EditManipulator.HandleUtils.projectPointToLineInView(ev.point, this._base[this._anchorIndex], this._axis[this._anchorIndex], ev.viewport, true);
    if (undefined === projectedPt)
      return undefined;

    const anchorPt = this._base[this._anchorIndex];
    const offsetVec = Vector3d.createStartEnd(anchorPt, projectedPt);
    let offset = offsetVec.normalizeWithLength(offsetVec).mag;
    if (offset < Geometry.smallMetricDistance)
      return;
    if (offsetVec.dotProduct(this._axis[this._anchorIndex]) < 0.0)
      offset *= -1.0;

    const adjustedPts: Point3d[] = [];
    for (let iFace = 0; iFace < this._ids.length; iFace++) {
      if (iFace === this._anchorIndex || this.manipulator.iModel.selectionSet.has(this._ids[iFace]))
        adjustedPts.push(this._base[iFace].plusScaled(this._axis[iFace], offset));
      else
        adjustedPts.push(this._base[iFace]);
    }

    const extents = Range3d.create();
    extents.extendArray(adjustedPts);

    return extents;
  }

  public onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    const extents = this.computeNewExtents(ev);
    if (undefined === extents)
      return;

    const builder = context.createGraphicBuilder(GraphicType.Scene);
    builder.setSymbology(ev.viewport!.getContrastToBackgroundColor(), ColorDef.black, 1, LinePixels.Code2);
    builder.addRangeBox(extents);
    context.addGraphic(builder.finish());
  }
}

export class ProjectExtentsDecoration extends EditManipulator.HandleProvider {
  private static _decorator?: ProjectExtentsDecoration;
  protected _extents: AxisAlignedBox3d;
  protected _markers: Marker[] = [];
  protected _boxId?: string;
  protected _controlIds: string[] = [];
  protected _controlPoint: Point3d[] = [];
  protected _controlAxis: Vector3d[] = [];

  public constructor() {
    super(activeViewState.iModelConnection!);
    this._extents = this.iModel.projectExtents;
    this._boxId = this.iModel.transientIds.next;
    this.updateDecorationListener(true);

    const image = imageElementFromUrl("map_pin.svg");
    const markerDrawFunc = (ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, 2 * Math.PI);
      ctx.fillStyle = "green";
      ctx.lineWidth = 1;
      ctx.strokeStyle = "black";
      ctx.fill();
      ctx.stroke();
    };

    const markerSize = Point2d.create(48, 48);
    const imageOffset = Point2d.create(-11, 32);
    const createBoundsMarker = (label: string, markerPos: Point3d): void => {
      const marker = new Marker(markerPos, markerSize);
      marker.drawFunc = markerDrawFunc;
      marker.label = label;
      marker.imageOffset = imageOffset;
      marker.setImage(image);
      marker.setScaleFactor({ low: .4, high: 1.5 });
      this._markers.push(marker);
    };

    createBoundsMarker(this.iModel.iModelToken.key!, this._extents.center);
    createBoundsMarker("low", this._extents.low);
    createBoundsMarker("high", this._extents.high);
  }

  protected stop(): void {
    const selectedId = (undefined !== this._boxId && this.iModel.selectionSet.has(this._boxId)) ? this._boxId : undefined;
    this._boxId = undefined; // Invalidate id so that decorator will be dropped...
    super.stop();
    if (undefined !== selectedId)
      this.iModel.selectionSet.remove(selectedId); // Don't leave decorator id in selection set...
  }

  protected async createControls(): Promise<boolean> {
    //    if (this.iModel.isReadonly)
    //      return false;

    // Decide if resize controls should be presented.
    if (undefined === this._boxId)
      return false;

    const iModel = this.iModel;

    // Show controls if only extents box and it's controls are selected, selection set doesn't include any other elements...
    let showControls = false;
    if (iModel.selectionSet.size <= this._controlIds.length + 1 && iModel.selectionSet.has(this._boxId)) {
      showControls = true;
      if (iModel.selectionSet.size > 1) {
        iModel.selectionSet.elements.forEach((val) => {
          if (this._boxId !== val && !this._controlIds.includes(val))
            showControls = false;
        });
      }
    }

    if (!showControls)
      return false;

    this._extents = iModel.projectExtents; // Update extents post-modify...NEEDSWORK - Update marker locations too!

    const transientIds = iModel.transientIds;
    if (0 === this._controlIds.length) {
      this._controlIds[0] = transientIds.next;
      this._controlIds[1] = transientIds.next;
      this._controlIds[2] = transientIds.next;
      this._controlIds[3] = transientIds.next;
      this._controlIds[4] = transientIds.next;
      this._controlIds[5] = transientIds.next;
    }

    const xOffset = 0.5 * this._extents.xLength();
    const yOffset = 0.5 * this._extents.yLength();
    const zOffset = 0.5 * this._extents.zLength();
    const center = this._extents.center;

    this._controlAxis[0] = Vector3d.unitX();
    this._controlAxis[1] = Vector3d.unitX(-1.0);
    this._controlPoint[0] = center.plusScaled(this._controlAxis[0], xOffset);
    this._controlPoint[1] = center.plusScaled(this._controlAxis[1], xOffset);

    this._controlAxis[2] = Vector3d.unitY();
    this._controlAxis[3] = Vector3d.unitY(-1.0);
    this._controlPoint[2] = center.plusScaled(this._controlAxis[2], yOffset);
    this._controlPoint[3] = center.plusScaled(this._controlAxis[3], yOffset);

    this._controlAxis[4] = Vector3d.unitZ();
    this._controlAxis[5] = Vector3d.unitZ(-1.0);
    this._controlPoint[4] = center.plusScaled(this._controlAxis[4], zOffset);
    this._controlPoint[5] = center.plusScaled(this._controlAxis[5], zOffset);

    return true;
  }

  protected clearControls(): void {
    this.iModel.selectionSet.remove(this._controlIds); // Remove any selected controls as they won't continue to be displayed...
    super.clearControls();
  }

  protected modifyControls(hit: HitDetail, _ev: BeButtonEvent): boolean {
    const manipTool = new ProjectExtentsResizeTool(this, hit.sourceId, this._controlIds, this._controlPoint, this._controlAxis);
    return manipTool.run();
  }

  public testDecorationHit(id: string): boolean { return (id === this._boxId || this._controlIds.includes(id)); }
  public async getDecorationToolTip(hit: HitDetail): Promise<HTMLElement | string> {
    if (hit.sourceId === this._boxId) {
      const popup = window.document.createElement("div");
      const image = window.document.createElement("img"); image.className = "simpleicon"; image.src = "Warning_sign.svg"; popup.appendChild(image);
      const descr = window.document.createElement("div"); descr.className = "tooltip"; descr.innerHTML = "Project Extents"; popup.appendChild(descr);
      return popup;
    }
    return "Resize Project Extents";
  }
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

    builder.setSymbology(vp.getContrastToBackgroundColor(), ColorDef.black, 3);
    builder.addRangeBox(this._extents);
    context.addDecorationFromBuilder(builder);

    this._markers.forEach((marker) => marker.addDecoration(context));

    if (!this._isActive)
      return;

    const outlineColor = ColorDef.black.adjustForContrast(vp.view.backgroundColor, 100);
    for (let iFace = 0; iFace < this._controlIds.length; iFace++) {
      const transform = EditManipulator.HandleUtils.getArrowTransform(vp, this._controlPoint[iFace], this._controlAxis[iFace], 0.75);
      if (undefined === transform)
        continue;

      const fillColor = (0.0 !== this._controlAxis[iFace].x ? ColorDef.red : (0.0 !== this._controlAxis[iFace].y ? ColorDef.green : ColorDef.blue)).adjustForContrast(vp.view.backgroundColor, 100);
      const shapePts = EditManipulator.HandleUtils.getArrowShape(0.0, 0.15, 0.55, 1.0, 0.3, 0.5, 0.1);
      const arrowBuilder = context.createGraphicBuilder(GraphicType.WorldOverlay, transform, this._controlIds[iFace]);

      arrowBuilder.setSymbology(outlineColor, outlineColor, 2);
      arrowBuilder.addLineString(shapePts);
      arrowBuilder.setBlankingFill(fillColor);
      arrowBuilder.addShape(shapePts);

      context.addDecorationFromBuilder(arrowBuilder);
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

/** Example Marker to show an *incident*. Each incident has an *id*, a *severity*, and an *icon*. */
class IncidentMarker extends Marker {
  private static _size = Point2d.create(30, 30);
  private static _imageSize = Point2d.create(40, 40);
  private static _imageOffset = Point2d.create(0, 30);
  private static _amber = new ColorDef(ColorByName.amber);
  private static _sweep360 = AngleSweep.create360();
  private _color: ColorDef;

  /** This makes the icon only show when the cursor is over an incident marker. */
  // public get wantImage() { return this._isHilited; }

  /** Get a color based on severity by interpolating Green(0) -> Amber(15) -> Red(30)  */
  public static makeColor(severity: number): ColorDef {
    return (severity <= 16 ? ColorDef.green.lerp(this._amber, (severity - 1) / 15.) :
      this._amber.lerp(ColorDef.red, (severity - 16) / 14.));
  }

  public onMouseButton(ev: BeButtonEvent): boolean {
    if (ev.button === BeButton.Data) {
      if (ev.isDown) {
        IModelApp.notifications.openMessageBox(MessageBoxType.LargeOk, "severity = " + this.severity, MessageBoxIconType.Information); // tslint:disable-line:no-floating-promises
      }
    }
    return true;
  }

  // /** draw a filled square with the incident color and a white outline */
  // public drawFunc(ctx: CanvasRenderingContext2D) {
  //   ctx.beginPath();
  //   ctx.fillStyle = this._color.toHexString();
  //   ctx.rect(-11, -11, 20, 20);
  //   ctx.fill();
  //   ctx.strokeStyle = "white";
  //   ctx.stroke();
  // }

  /** Create a new IncidentMarker */
  constructor(location: XYAndZ, public severity: number, public id: number, icon: Promise<HTMLImageElement>) {
    super(location, IncidentMarker._size);
    this._color = IncidentMarker.makeColor(severity); // color interpolated from severity
    this.setImage(icon); // save icon
    this.imageOffset = IncidentMarker._imageOffset; // move icon up by 30 pixels
    this.imageSize = IncidentMarker._imageSize; // 40x40
    this.labelFont = "italic 14px san-serif"; // use italic so incidents look different than Clusters
    // this.label = severity.toLocaleString(); // label with severity
    this.title = "Severity: " + severity + "<br>Id: " + id; // tooltip
    this.setScaleFactor({ low: .2, high: 1.4 }); // make size 20% at back of frustum and 140% at front of frustum (if camera is on)
  }

  public addMarker(context: DecorateContext) {
    super.addMarker(context);
    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration);
    const ellipse = Arc3d.createScaledXYColumns(this.worldLocation, context.viewport.rotation.transpose(), .2, .2, IncidentMarker._sweep360);
    builder.setSymbology(ColorDef.white, this._color, 1);
    builder.addArc(ellipse, false, false);
    builder.setBlankingFill(this._color);
    builder.addArc(ellipse, true, true);
    context.addDecorationFromBuilder(builder);
  }
}

/** A Marker used to show a cluster of incidents */
class IncidentClusterMarker extends Marker {
  private _clusterColor: string;
  // public get wantImage() { return this._isHilited; }

  // draw the cluster as a white circle with an outline color based on what's in the cluster
  public drawFunc(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.strokeStyle = this._clusterColor;
    ctx.fillStyle = "white";
    ctx.lineWidth = 5;
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /** Create a new cluster marker with label and color based on the content of the cluster */
  constructor(location: XYAndZ, size: XAndY, cluster: Cluster<IncidentMarker>, image: Promise<MarkerImage>) {
    super(location, size);

    // get the top 10 incidents by severity
    const sorted: IncidentMarker[] = [];
    const maxLen = 10;
    cluster.markers.forEach((marker) => {
      if (maxLen > sorted.length || marker.severity > sorted[sorted.length - 1].severity) {
        const index = sorted.findIndex((val) => val.severity < marker.severity);
        if (index === -1)
          sorted.push(marker);
        else
          sorted.splice(index, 0, marker);
        if (sorted.length > maxLen)
          sorted.length = maxLen;
      }
    });

    this.imageOffset = new Point3d(0, 28);
    this.imageSize = new Point2d(30, 30);
    this.label = cluster.markers.length.toLocaleString();
    this.labelColor = "black";
    this.labelFont = "bold 14px san-serif";

    let title = "";
    sorted.forEach((marker) => {
      if (title !== "")
        title += "<br>";
      title += "Severity: " + marker.severity + " Id: " + marker.id;
    });
    if (cluster.markers.length > maxLen)
      title += "<br>...";

    this.title = title;
    this._clusterColor = IncidentMarker.makeColor(sorted[0].severity).toHexString();
    this.setImage(image);
  }
}

/** A MarkerSet to hold incidents. This class supplies to `getClusterMarker` method to create IncidentClusterMarkers. */
class IncidentMarkerSet extends MarkerSet<IncidentMarker> {
  protected getClusterMarker(cluster: Cluster<IncidentMarker>): Marker {
    return IncidentClusterMarker.makeFrom(cluster.markers[0], cluster, IncidentMarkerDemo.warningSign);
  }
}

/** This demo shows how to use MarkerSets to cluster markers that overlap on the screen. It creates a set of 500
 * "incidents" at random locations within the ProjectExtents. For each incident, it creates an IncidentMarker with an Id and
 * with a random value between 1-30 for "severity", and one of 5 possible icons.
 */
class IncidentMarkerDemo {
  public static warningSign?: HTMLImageElement;
  private _incidents = new IncidentMarkerSet();
  private static _decorator?: IncidentMarkerDemo; // static variable just so we can tell if the demo is active.

  public constructor() {
    const markerIcons = [
      imageElementFromUrl("Hazard_biological.svg"),
      imageElementFromUrl("Hazard_electric.svg"),
      imageElementFromUrl("Hazard_flammable.svg"),
      imageElementFromUrl("Hazard_toxic.svg"),
      imageElementFromUrl("Hazard_tripping.svg"),
    ];

    if (undefined === IncidentMarkerDemo.warningSign)
      imageElementFromUrl("Warning_sign.svg").then((image) => IncidentMarkerDemo.warningSign = image); // tslint:disable-line:no-floating-promises

    const extents = activeViewState.iModelConnection!.projectExtents;
    const pos = new Point3d();
    for (let i = 0; i < 500; ++i) {
      pos.x = extents.low.x + (Math.random() * extents.xLength());
      pos.y = extents.low.y + (Math.random() * extents.yLength());
      pos.z = extents.low.z + (Math.random() * extents.zLength());
      this._incidents.markers.add(new IncidentMarker(pos, 1 + Math.round(Math.random() * 29), i, markerIcons[i % markerIcons.length]));
    }
  }

  /** We added this class as a ViewManager.decorator below. This method is called to ask for our decorations. We add the MarkerSet. */
  public decorate(context: DecorateContext) {
    if (context.viewport.view.isSpatialView())
      this._incidents.addDecoration(context);
  }

  /** Turn the markers on and off. Each time it runs it creates a new random set of incidents. */
  public static toggle() {
    if (undefined === IncidentMarkerDemo._decorator) {
      // start the demo by creating the demo object and adding it as a ViewManager decorator.
      IncidentMarkerDemo._decorator = new IncidentMarkerDemo();
      IModelApp.viewManager.addDecorator(IncidentMarkerDemo._decorator);
    } else {
      // stop the demo
      IModelApp.viewManager.dropDecorator(IncidentMarkerDemo._decorator);
      IncidentMarkerDemo._decorator = undefined;
    }
  }
}

// Starts Measure between points tool
function startMeasurePoints(event: Event) {
  const menu = document.getElementById("snapModeList") as HTMLDivElement;
  if (event.target === menu)
    return;
  IModelApp.tools.run("Measure.Points", theViewport!);
}

// functions that start viewing commands, associated with icons in wireIconsToFunctions
function startToggleCamera() {
  const togglingOff = theViewport!.isCameraOn;
  showStatus("Camera", togglingOff ? "off" : "on");
  IModelApp.tools.run("View.ToggleCamera", theViewport!);
}

// override symbology for selected elements
function changeOverrideColor() {
  const select = (document.getElementById("colorList") as HTMLSelectElement)!;
  const value = select.value;
  const transparency = Number.parseFloat(value);
  if (Number.isNaN(transparency)) {
    overrideTransparency = undefined;
    overrideColor = new ColorDef(select.value);
  } else {
    overrideTransparency = transparency;
    overrideColor = undefined;
  }

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
  IModelApp.viewManager.dropViewport(theViewport!, false);
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

function setFpsInfo() {
  const perfMet = (theViewport!.target as Target).performanceMetrics;
  if (undefined !== perfMet && document.getElementById("showfps")) {
    document.getElementById("showfps")!.innerHTML =
      "Avg. FPS: " + (perfMet.spfTimes.length / perfMet.spfSum).toFixed(2)
      + " Render Time (ms): " + (perfMet.renderSpfSum / perfMet.renderSpfTimes.length).toFixed(2)
      + "<br />Scene Time (ms): " + (perfMet.loadTileSum / perfMet.loadTileTimes.length).toFixed(2);

    let msg = "";
    perfMet.frameTimings.forEach((v, k) => {
      if (0 < msg.length)
        msg += ", ";

      msg += k + "=" + v;
    });

    console.log(msg);
  }
}

function addRenderModeHandler(id: string) {
  document.getElementById(id)!.addEventListener("click", () => applyRenderModeChange(id));
}

function keepOpenDebugToolsMenu(_open: boolean = true) { // keep open debug tool menu
  const menu = document.getElementById("debugToolsMenu") as HTMLDivElement;
  menu.style.display = menu.style.display === "none" || menu.style.display === "" ? "block" : "none";
}

function saveImage() {
  const vp = theViewport!;
  const buffer = vp.readImage(undefined, undefined, true); // flip vertically...
  if (undefined === buffer) {
    alert("Failed to read image");
    return;
  }

  const url = imageBufferToPngDataUrl(buffer);
  if (undefined === url) {
    alert("Failed to produce PNG");
    return;
  }

  window.open(url, "Saved View");
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
  document.getElementById("animationSlider")!.addEventListener("input", processAnimationSliderAdjustment);

  const addClickListener = (el: string, listener: (ev: Event) => void) => { document.getElementById(el)!.addEventListener("click", listener); };
  addClickListener("startToggleModel", startToggleModel);
  addClickListener("startToggleContextRealityModel", startToggleContextRealityModel);
  addClickListener("startCategorySelection", startCategorySelection);
  addClickListener("startToggleCamera", startToggleCamera);
  addClickListener("startFit", () => IModelApp.tools.run("View.Fit", theViewport, true));
  addClickListener("startWindowArea", () => IModelApp.tools.run("View.WindowArea", theViewport));
  addClickListener("startSelect", () => IModelApp.tools.run("Select"));
  addClickListener("startMeasurePoints", startMeasurePoints);
  addClickListener("startWalk", () => IModelApp.tools.run("View.Walk", theViewport));
  addClickListener("startRotateView", () => IModelApp.tools.run("View.Rotate", theViewport));
  addClickListener("switchStandardRotation", toggleStandardViewMenu);
  addClickListener("debugTools", toggleDebugToolsMenu);
  addClickListener("renderModeToggle", toggleRenderModeMenu);
  addClickListener("snapModeToggle", toggleSnapModeMenu);
  addClickListener("doUndo", () => IModelApp.tools.run("View.Undo", theViewport));
  addClickListener("doRedo", () => IModelApp.tools.run("View.Redo", theViewport));
  addClickListener("showAnimationMenu", toggleAnimationMenu);
  addClickListener("animationPlay", startAnimation);
  addClickListener("animationPause", pauseAnimation);
  addClickListener("animationStop", stopAnimation);
  addClickListener("animationMenu", processAnimationMenuEvent);

  // debug tool handlers
  addClickListener("incidentMarkers", () => IncidentMarkerDemo.toggle());
  addClickListener("projectExtents", () => ProjectExtentsDecoration.toggle());
  addClickListener("saveImage", () => saveImage());
  addClickListener("debugToolsMenu", () => keepOpenDebugToolsMenu());

  // standard view rotation handlers
  addClickListener("top", () => applyStandardViewRotation(StandardViewId.Top, "Top"));
  addClickListener("bottom", () => applyStandardViewRotation(StandardViewId.Bottom, "Bottom"));
  addClickListener("left", () => applyStandardViewRotation(StandardViewId.Left, "Left"));
  addClickListener("right", () => applyStandardViewRotation(StandardViewId.Right, "Right"));
  addClickListener("front", () => applyStandardViewRotation(StandardViewId.Front, "Front"));
  addClickListener("back", () => applyStandardViewRotation(StandardViewId.Back, "Back"));
  addClickListener("iso", () => applyStandardViewRotation(StandardViewId.Iso, "Iso"));
  addClickListener("rightIso", () => applyStandardViewRotation(StandardViewId.RightIso, "RightIso"));

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
      activeViewState.iModelConnection.closeStandalone(); // tslint:disable-line:no-floating-promises
    else
      activeViewState.iModelConnection.close(activeViewState.accessToken!); // tslint:disable-line:no-floating-promises
};

function stringToSnapModes(name: string): SnapMode[] {
  const snaps: SnapMode[] = [];
  switch (name) {
    case "Keypoint":
      snaps.push(SnapMode.NearestKeypoint);
      break;
    case "Nearest":
      snaps.push(SnapMode.Nearest);
      break;
    case "Center":
      snaps.push(SnapMode.Center);
      break;
    case "Origin":
      snaps.push(SnapMode.Origin);
      break;
    case "Intersection":
      snaps.push(SnapMode.Intersection);
      break;
    default:
      snaps.push(SnapMode.NearestKeypoint);
      snaps.push(SnapMode.Nearest);
      snaps.push(SnapMode.Intersection);
      snaps.push(SnapMode.MidPoint);
      snaps.push(SnapMode.Origin);
      snaps.push(SnapMode.Center);
      snaps.push(SnapMode.Bisector);
      break;
  }
  return snaps;
}

class SVTAccuSnap extends AccuSnap {
  public get keypointDivisor() { return 2; }
  public getActiveSnapModes(): SnapMode[] {
    const select = (document.getElementById("snapModeList") as HTMLSelectElement)!;
    return stringToSnapModes(select.value);
  }
}

class SVTNotifications extends NotificationManager {
  private _toolTip?: ToolTip;
  private _el?: HTMLElement;
  private _tooltipDiv?: HTMLDivElement;

  public outputPrompt(prompt: string) { showStatus(prompt); }

  /** Output a message and/or alert to the user. */
  public outputMessage(message: NotifyMessageDetails) { showError(message.briefMessage); }

  public async openMessageBox(_mbType: MessageBoxType, _message: string, _icon: MessageBoxIconType): Promise<MessageBoxValue> {
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

  public get isToolTipSupported(): boolean { return true; }
  public get isToolTipOpen(): boolean { return undefined !== this._toolTip; }

  public clearToolTip(): void {
    if (!this.isToolTipOpen)
      return;

    this._toolTip!.dispose();
    this._el!.removeChild(this._tooltipDiv!);
    this._toolTip = undefined;
    this._el = undefined;
    this._tooltipDiv = undefined;
  }

  protected _showToolTip(el: HTMLElement, message: HTMLElement | string, pt?: XAndY, options?: ToolTipOptions): void {
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
    this._toolTip = new ToolTip(location, { trigger: "manual", html: true, placement: (options && options.placement) ? options.placement as any : "right-start", title: message });
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

async function initializeOidc(actx: ActivityLoggingContext) {
  actx.enter();

  const clientId = Config.App.get("imjs_browser_test_client_id");
  const redirectUri = Config.App.getString("imjs_browser_test_redirect_uri"); // must be set in config
  const oidcConfig: OidcFrontendClientConfiguration = { clientId, redirectUri };

  await OidcClientWrapper.initialize(actx, oidcConfig);
  actx.enter();

  OidcClientWrapper.oidcClient.onUserStateChanged.addListener((accessToken: AccessToken | undefined) => {
    activeViewState.accessToken = accessToken;
  });

  activeViewState.accessToken = await OidcClientWrapper.oidcClient.getAccessToken(actx);
  actx.enter();
}

// main entry point.
async function main() {
  const actx = new ActivityLoggingContext(Guid.createValue());
  actx.enter();

  if (!MobileRpcConfiguration.isMobileFrontend) {
    // retrieve, set, and output the global configuration variable
    await retrieveConfiguration(); // (does a fetch)
    console.log("Configuration", JSON.stringify(configuration));
  }
  // Start the app. (This tries to fetch a number of localization json files from the origin.)
  SVTIModelApp.startup();

  // Choose RpcConfiguration based on whether we are in electron or browser
  let rpcConfiguration: RpcConfiguration;
  if (ElectronRpcConfiguration.isElectron) {
    rpcConfiguration = ElectronRpcManager.initializeClient({}, [IModelTileRpcInterface, StandaloneIModelRpcInterface, IModelReadRpcInterface]);
  } else if (MobileRpcConfiguration.isMobileFrontend) {
    Object.assign(configuration, { standalone: true, iModelName: "sample_documents/04_Plant.i.ibim" });
    rpcConfiguration = MobileRpcManager.initializeClient([IModelTileRpcInterface, StandaloneIModelRpcInterface, IModelReadRpcInterface]);
  } else {
    const uriPrefix = configuration.customOrchestratorUri;
    rpcConfiguration = BentleyCloudRpcManager.initializeClient({ info: { title: "SimpleViewApp", version: "v1.0" }, uriPrefix }, [IModelTileRpcInterface, StandaloneIModelRpcInterface, IModelReadRpcInterface]);
    // WIP: WebAppRpcProtocol seems to require an IModelToken for every RPC request. ECPresentation initialization tries to set active locale using
    // RPC without any imodel and fails...
    for (const definition of rpcConfiguration.interfaces())
      RpcOperation.forEach(definition, (operation) => operation.policy.token = (_request) => new IModelToken("test", "test", "test", "test", OpenMode.Readonly));
  }

  const uiReady = displayUi();  // Get the browser started loading our html page and the svgs that it references but DON'T WAIT

  // while the browser is loading stuff, start work on logging in and downloading the imodel, etc.
  try {
    // Standalone
    if (configuration.standalone) {
      await openStandaloneIModel(activeViewState, configuration.iModelName!);
      await uiReady; // Now wait for the HTML UI to finish loading.
      await initView();
      return;
    }

    // Connected to hub
    await initializeOidc(actx);
    actx.enter();

    if (!activeViewState.accessToken)
      OidcClientWrapper.oidcClient.signIn(actx);
    else {
      await openIModel(activeViewState);
      await uiReady; // Now, wait for the HTML UI to finish loading.
      await initView();
    }
  } catch (reason) {
    alert(reason);
    return;
  }

}

async function initView() {
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
main(); // tslint:disable-line:no-floating-promises
