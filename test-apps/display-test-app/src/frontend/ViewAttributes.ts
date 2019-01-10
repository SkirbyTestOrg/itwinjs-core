/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import {
  JsonUtils,
} from "@bentley/bentleyjs-core";
import {
  ViewState,
  ViewState3d,
  Viewport,
} from "@bentley/imodeljs-frontend";
import {
  AmbientOcclusion,
  BackgroundMapProps,
  BackgroundMapType,
  RenderMode,
  ViewFlags,
} from "@bentley/imodeljs-common";
import { CheckBox, createCheckBox } from "./CheckBox";
import { createComboBox } from "./ComboBox";
import { createSlider, Slider } from "./Slider";
import { createButton } from "./Button";
import { ToolBarDropDown } from "./ToolBar";

type UpdateAttribute = (view: ViewState) => void;

type ViewFlag = "acsTriad" | "grid" | "fill" | "materials" | "textures" | "visibleEdges" | "hiddenEdges" | "monochrome" | "constructions" | "transparency" | "weights" | "styles" | "clipVolume";
type EnvironmentAspect = "ground" | "sky";

export class ViewAttributes {
  private static _expandViewFlags = true;
  private readonly _vp: Viewport;
  private readonly _element: HTMLElement;
  private readonly _updates: UpdateAttribute[] = [];
  private _updating = false;
  private readonly _removeMe: () => void;
  private readonly _parent: HTMLElement;
  private _id = 0;
  private _aoBias?: Slider;
  private _aoZLengthCap?: Slider;
  private _aoIntensity?: Slider;
  private _aoTexelStepSize?: Slider;
  private _aoBlurDelta?: Slider;
  private _aoBlurSigma?: Slider;
  private _aoBlurTexelStepSize?: Slider;
  private _scratchViewFlags = new ViewFlags();

  public constructor(vp: Viewport, parent: HTMLElement) {
    this._vp = vp;
    this._parent = parent;
    this._element = document.createElement("div");
    this._element.className = "debugPanel"; // "toolMenu"; or set display="block"...

    this._removeMe = vp.onViewChanged.addListener((_vp) => this.update());

    this.addRenderMode();
    this._element.appendChild(document.createElement("hr"));

    const flagsToggle = document.createElement("div");
    flagsToggle.innerText = "View Attributes";
    this._element.appendChild(flagsToggle);

    const flagsDiv = document.createElement("div");
    flagsDiv.appendChild(document.createElement("hr"));
    this._element.appendChild(flagsDiv);

    this.addViewFlagAttribute(flagsDiv, "ACS Triad", "acsTriad");
    this.addViewFlagAttribute(flagsDiv, "Grid", "grid");
    this.addViewFlagAttribute(flagsDiv, "Fill", "fill");
    this.addViewFlagAttribute(flagsDiv, "Materials", "materials");
    this.addViewFlagAttribute(flagsDiv, "Textures", "textures");
    this.addViewFlagAttribute(flagsDiv, "Visible Edges", "visibleEdges", true);
    this.addViewFlagAttribute(flagsDiv, "Hidden Edges", "hiddenEdges", true);
    this.addViewFlagAttribute(flagsDiv, "Monochrome", "monochrome");
    this.addViewFlagAttribute(flagsDiv, "Constructions", "constructions");
    this.addViewFlagAttribute(flagsDiv, "Transparency", "transparency");
    this.addViewFlagAttribute(flagsDiv, "Line Weights", "weights");
    this.addViewFlagAttribute(flagsDiv, "Line Styles", "styles");
    this.addViewFlagAttribute(flagsDiv, "Clip Volume", "clipVolume", true);

    this.addEnvAttribute(flagsDiv, "Sky Box", "sky");
    this.addEnvAttribute(flagsDiv, "Ground Plane", "ground");

    // We use a static so the expand/collapse state persists after closing and reopening the drop-down.
    flagsDiv.style.display = ViewAttributes._expandViewFlags ? "block" : "none";
    flagsToggle.addEventListener("click", () => {
      ViewAttributes._expandViewFlags = !ViewAttributes._expandViewFlags;
      flagsDiv.style.display = ViewAttributes._expandViewFlags ? "block" : "none";
    });

    this.addBackgroundMap();
    this.addAmbientOcclusion();

    // Set initial states
    this.update();

    parent.appendChild(this._element);
  }

  public dispose(): void {
    this._removeMe();
    this._parent.removeChild(this._element);
  }

  private addViewFlagAttribute(parent: HTMLElement, label: string, flag: ViewFlag, only3d: boolean = false): void {
    const elems = this.addCheckbox(label, (enabled: boolean) => {
      const vf = this._vp.view.viewFlags.clone(this._scratchViewFlags);
      vf[flag] = enabled;
      this._vp.view.viewFlags = vf;
      this.sync();
    }, parent);

    const update = (view: ViewState) => {
      const visible = !only3d || view.is3d();
      elems.div.style.display = visible ? "block" : "none";
      if (visible)
        elems.checkbox.checked = view.viewFlags[flag];
    };

    this._updates.push(update);
  }

  private addEnvAttribute(parent: HTMLElement, label: string, aspect: EnvironmentAspect): void {
    const elems = this.addCheckbox(label, (enabled: boolean) => {
      const view3d = this._vp.view as ViewState3d;
      const style = view3d.getDisplayStyle3d();
      const env = style.environment;
      env[aspect].display = enabled;
      view3d.getDisplayStyle3d().environment = env; // setter converts it to JSON
      this.sync();
    }, parent);

    const update = (view: ViewState) => {
      const visible = view.is3d();
      elems.div.style.display = visible ? "block" : "none";
      if (visible) {
        const view3d = view as ViewState3d;
        const style = view3d.getDisplayStyle3d();
        elems.checkbox.checked = style.environment[aspect].display;
      }
    };

    this._updates.push(update);
  }

  private addRenderMode(): void {
    const div = document.createElement("div") as HTMLDivElement;

    const entries = [
      { name: "Wireframe", value: RenderMode.Wireframe },
      { name: "Solid Fill", value: RenderMode.SolidFill },
      { name: "Hidden Line", value: RenderMode.HiddenLine },
      { name: "Smooth Shade", value: RenderMode.SmoothShade },
    ];

    const select = createComboBox({
      parent: div,
      name: "Render Mode: ",
      entries,
      id: "viewAttr_renderMode",
      value: this._vp.viewFlags.renderMode,
      handler: (thing) => {
        this._vp.viewFlags.renderMode = Number.parseInt(thing.value, 10);
        this.sync();
      },
    }).select;

    this._updates.push((view) => {
      const visible = view.is3d();
      div.style.display = visible ? "block" : "none";
      if (visible)
        select.value = view.viewFlags.renderMode.toString();
    });

    this._element.appendChild(div);
  }

  private addAmbientOcclusion(): void {
    const isAOSupported = (view: ViewState) => view.is3d() && RenderMode.SmoothShade === view.viewFlags.renderMode;
    const isAOEnabled = (view: ViewState) => view.viewFlags.ambientOcclusion;

    const div = document.createElement("div");
    div.appendChild(document.createElement("hr")!);

    const slidersDiv = document.createElement("div")!;

    const showHideDropDowns = (show: boolean) => {
      const display = show ? "block" : "none";
      slidersDiv.style.display = display;
    };

    const enableAO = (enabled: boolean) => {
      const vf = this._vp.view.viewFlags.clone(this._scratchViewFlags);
      vf.ambientOcclusion = enabled;
      this._vp.view.viewFlags = vf;
      showHideDropDowns(enabled);
      this.sync();
    };
    const checkbox = this.addCheckbox("Ambient Occlusion", enableAO, div).checkbox;

    this._aoBias = createSlider({
      parent: slidersDiv,
      name: "Bias: ",
      id: "viewAttr_AOBias",
      min: "0.0",
      step: "0.025",
      max: "1.0",
      value: "0.0",
      handler: (slider) => this.updateAmbientOcclusion(parseFloat(slider.value)),
    });

    this._aoZLengthCap = createSlider({
      parent: slidersDiv,
      name: "Length Cap: ",
      id: "viewAttr_AOZLengthCap",
      min: "0.0",
      step: "0.000025",
      max: "0.25",
      value: "0.0",
      handler: (slider) => this.updateAmbientOcclusion(undefined, parseFloat(slider.value)),
    });

    this._aoIntensity = createSlider({
      parent: slidersDiv,
      name: "Intensity: ",
      id: "viewAttr_AOIntensity",
      min: "1.0",
      step: "0.1",
      max: "16.0",
      value: "0.0",
      handler: (slider) => this.updateAmbientOcclusion(undefined, undefined, parseFloat(slider.value)),
    });

    this._aoTexelStepSize = createSlider({
      parent: slidersDiv,
      name: "Step: ",
      id: "viewAttr_AOTexelStepSize",
      min: "1.0",
      step: "0.005",
      max: "5.0",
      value: "0.0",
      handler: (slider) => this.updateAmbientOcclusion(undefined, undefined, undefined, parseFloat(slider.value)),
    });

    this._aoBlurDelta = createSlider({
      parent: slidersDiv,
      name: "Blur Delta: ",
      id: "viewAttr_AOBlurDelta",
      min: "0.5",
      step: "0.0001",
      max: "1.5",
      value: "0.0",
      handler: (slider) => this.updateAmbientOcclusion(undefined, undefined, undefined, undefined, parseFloat(slider.value)),
    });

    this._aoBlurSigma = createSlider({
      parent: slidersDiv,
      name: "Blur Sigma: ",
      id: "viewAttr_AOBlurSigma",
      min: "0.5",
      step: "0.0001",
      max: "5.0",
      value: "0.0",
      handler: (slider) => this.updateAmbientOcclusion(undefined, undefined, undefined, undefined, undefined, parseFloat(slider.value)),
    });

    this._aoBlurTexelStepSize = createSlider({
      parent: slidersDiv,
      name: "Blur Step: ",
      id: "viewAttr_AOBlurTexelStepSize",
      min: "1.0",
      step: "0.005",
      max: "5.0",
      value: "0.0",
      handler: (slider) => this.updateAmbientOcclusion(undefined, undefined, undefined, undefined, undefined, undefined, parseFloat(slider.value)),
    });

    const resetButton = createButton({
      parent: slidersDiv,
      id: "viewAttr_AOReset",
      value: "Reset",
      handler: () => this.resetAmbientOcclusion(),
    });
    resetButton.div.style.textAlign = "center";

    this._updates.push((view) => {
      const visible = isAOSupported(view);
      div.style.display = visible ? "block" : "none";
      if (!visible)
        return;

      checkbox.checked = isAOEnabled(view);
      showHideDropDowns(checkbox.checked);

      this.updateAmbientOcclusionUI(view);
    });

    div.appendChild(slidersDiv);

    this._element.appendChild(div);
  }

  private updateAmbientOcclusionUI(view: ViewState) {
    const getAOSettings = (v: ViewState) => (v as ViewState3d).getDisplayStyle3d().settings.ambientOcclusionSettings;

    const aoSettings = getAOSettings(view);

    this._aoBias!.slider.value = aoSettings.bias!.toString();
    this._aoZLengthCap!.slider.value = aoSettings.zLengthCap!.toString();
    this._aoIntensity!.slider.value = aoSettings.intensity!.toString();
    this._aoTexelStepSize!.slider.value = aoSettings.texelStepSize!.toString();
    this._aoBlurDelta!.slider.value = aoSettings.blurDelta!.toString();
    this._aoBlurSigma!.slider.value = aoSettings.blurSigma!.toString();
    this._aoBlurTexelStepSize!.slider.value = aoSettings.blurTexelStepSize!.toString();
  }

  private updateAmbientOcclusion(newBias?: number, newZLengthCap?: number, newIntensity?: number, newTexelStepSize?: number, newBlurDelta?: number, newBlurSigma?: number, newBlurTexelStepSize?: number): void {
    const oldAOSettings = (this._vp.view as ViewState3d).getDisplayStyle3d().settings.ambientOcclusionSettings;
    const newAOSettings = AmbientOcclusion.Settings.fromJSON({
      bias: newBias !== undefined ? newBias : oldAOSettings.bias,
      zLengthCap: newZLengthCap !== undefined ? newZLengthCap : oldAOSettings.zLengthCap,
      intensity: newIntensity !== undefined ? newIntensity : oldAOSettings.intensity,
      texelStepSize: newTexelStepSize !== undefined ? newTexelStepSize : oldAOSettings.texelStepSize,
      blurDelta: newBlurDelta !== undefined ? newBlurDelta : oldAOSettings.blurDelta,
      blurSigma: newBlurSigma !== undefined ? newBlurSigma : oldAOSettings.blurSigma,
      blurTexelStepSize: newBlurTexelStepSize !== undefined ? newBlurTexelStepSize : oldAOSettings.blurTexelStepSize,
    });
    (this._vp.view as ViewState3d).getDisplayStyle3d().settings.ambientOcclusionSettings = newAOSettings;
    this.sync();
  }

  private resetAmbientOcclusion(): void {
    const newAOSettings = AmbientOcclusion.Settings.defaults;
    (this._vp.view as ViewState3d).getDisplayStyle3d().settings.ambientOcclusionSettings = newAOSettings;
    this.sync();
    this.updateAmbientOcclusionUI(this._vp.view);
  }

  private addBackgroundMap(): void {
    const isMapSupported = (view: ViewState) => view.is3d() && view.iModel.isGeoLocated;
    const getBackgroundMap = (view: ViewState) => (view as ViewState3d).getDisplayStyle3d().backgroundMap;

    const div = document.createElement("div");
    div.appendChild(document.createElement("hr")!);

    const comboBoxesDiv = document.createElement("div")!;

    const showHideDropDowns = (show: boolean) => {
      const display = show ? "block" : "none";
      comboBoxesDiv.style.display = display;
    };

    const enableMap = (enabled: boolean) => {
      const vf = this._vp.view.viewFlags.clone(this._scratchViewFlags);
      vf.backgroundMap = enabled;
      this._vp.view.viewFlags = vf;
      showHideDropDowns(enabled);
      this.sync();
    };
    const checkbox = this.addCheckbox("Background Map", enableMap, div).checkbox;

    const providers = createComboBox({
      parent: comboBoxesDiv,
      name: "Provider: ",
      id: "viewAttr_MapProvider",
      entries: [
        { name: "Bing", value: "BingProvider" },
        { name: "MapBox", value: "MapBoxProvider" },
      ],
      handler: (select) => this.updateBackgroundMap(getBackgroundMap(this._vp.view), select.value, undefined),
    }).select;

    const types = createComboBox({
      parent: comboBoxesDiv,
      name: "Type: ",
      id: "viewAttr_mapType",
      entries: [
        { name: "Street", value: BackgroundMapType.Street },
        { name: "Aerial", value: BackgroundMapType.Aerial },
        { name: "Hybrid", value: BackgroundMapType.Hybrid },
      ],
      handler: (select) => this.updateBackgroundMap(getBackgroundMap(this._vp.view), undefined, Number.parseInt(select.value, 10)),
    }).select;

    this._updates.push((view) => {
      const visible = isMapSupported(view);
      div.style.display = visible ? "block" : "none";
      if (!visible)
        return;

      checkbox.checked = view.viewFlags.backgroundMap;
      showHideDropDowns(checkbox.checked);

      const map = getBackgroundMap(view);
      providers.value = JsonUtils.asString(map.providerName, "BingProvider");
      types.value = JsonUtils.asInt(map.mapType, BackgroundMapType.Hybrid).toString();
    });

    div.appendChild(comboBoxesDiv);

    this._element.appendChild(div);
  }

  private updateBackgroundMap(map: BackgroundMapProps, newProvider?: string, newType?: BackgroundMapType): void {
    let type: BackgroundMapType | undefined;
    if (undefined !== newType)
      type = newType;
    else if (undefined !== map.providerData)
      type = map.providerData.mapType;

    if (undefined === type)
      type = BackgroundMapType.Hybrid;

    const props = {
      providerName: undefined !== newProvider ? newProvider : map.providerName,
      providerData: {
        mapType: type,
      },
    };

    (this._vp.view as ViewState3d).getDisplayStyle3d().setBackgroundMap(props);
    this.sync();
  }

  private addCheckbox(cbLabel: string, handler: (enabled: boolean) => void, parent?: HTMLElement): CheckBox {
    if (undefined === parent)
      parent = this._element;

    return createCheckBox({
      parent,
      name: cbLabel,
      id: this._nextId,
      handler: (cb) => handler(cb.checked),
    });
  }

  private update(): void {
    if (!this._updating) {
      this._updating = true;
      for (const update of this._updates)
        update(this._vp.view);

      this._updating = false;
    }
  }

  private sync(): void {
    this._vp.synchWithView(true);
  }

  private get _nextId(): string {
    ++this._id;
    return "viewAttributesPanel_" + this._id;
  }
}

export class ViewAttributesPanel extends ToolBarDropDown {
  private readonly _vp: Viewport;
  private readonly _parent: HTMLElement;
  private _attributes?: ViewAttributes;

  public constructor(vp: Viewport, parent: HTMLElement) {
    super();
    this._vp = vp;
    this._parent = parent;
    this.open();
  }

  public get isOpen() { return undefined !== this._attributes; }
  protected _open(): void {
    this._attributes = new ViewAttributes(this._vp, this._parent);
  }

  protected _close(): void {
    if (undefined !== this._attributes) {
      this._attributes.dispose();
      this._attributes = undefined;
    }
  }
}
