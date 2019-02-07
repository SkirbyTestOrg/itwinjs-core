/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import {
  ContextRealityModelProps,
  CartographicRange,
} from "@bentley/imodeljs-common";
import {
  ContextRealityModelState,
  SpatialViewState,
  Viewport,
} from "@bentley/imodeljs-frontend";
import { ToolBarDropDown } from "./ToolBar";
import { createCheckBox } from "./CheckBox";

// ###TODO: Why not just append these to the contents of the model picker?
export class RealityModelPicker extends ToolBarDropDown {
  private readonly _vp: Viewport;
  private readonly _element: HTMLElement;
  private readonly _parent: HTMLElement;
  private readonly _models: ContextRealityModelState[] = [];
  private readonly _availableModels: Promise<ContextRealityModelProps[]>;

  public constructor(vp: Viewport, parent: HTMLElement) {
    super();

    this._vp = vp;
    this._parent = parent;

    if (this._vp.iModel.ecefLocation) {
      const modelCartographicRange = new CartographicRange(this._vp.iModel.projectExtents, this._vp.iModel.ecefLocation.getTransform());

      this._availableModels = ContextRealityModelState.findAvailableRealityModels("fb1696c8-c074-4c76-a539-a5546e048cc6", modelCartographicRange);
    } else {
      this._availableModels = ContextRealityModelState.findAvailableRealityModels("fb1696c8-c074-4c76-a539-a5546e048cc6", undefined);
    }

    this._element = document.createElement("div");
    this._element.className = "scrollingToolMenu";
    this._element.style.display = "block";

    parent.appendChild(this._element);
  }

  public get isOpen(): boolean { return "none" !== this._element.style.display; }
  protected _open(): void { this._element.style.display = "block"; }
  protected _close(): void { this._element.style.display = "none"; }
  public get onViewChanged(): Promise<void> { return this.populate(); }

  public async populate(): Promise<void> {
    this._models.length = 0;
    while (this._element.hasChildNodes())
      this._element.removeChild(this._element.firstChild!);

    let visible = this._vp.view.isSpatialView() && (await this._availableModels).length > 0;
    if (visible) {
      await this.populateModels();
      visible = this._models.length > 0;
    }

    this._parent.style.display = visible ? "block" : "none";
    if (!visible)
      return Promise.resolve();

    const view = this._vp.view as SpatialViewState;
    for (const model of this._models) {
      createCheckBox({
        name: model.name,
        id: model.url,
        parent: this._element,
        isChecked: view.displayStyle.containsContextRealityModel(model),
        handler: (checkbox) => this.toggle(model, checkbox.checked),
      });
    }
  }

  private async populateModels(): Promise<void> {
    for (const props of await this._availableModels) {
      try {
        const model = new ContextRealityModelState(props, this._vp.iModel);
        if (await model.intersectsProjectExtents())
          this._models.push(model);
      } catch (e) {
      }
    }
  }

  private toggle(model: ContextRealityModelState, enabled: boolean): void {
    const view = this._vp.view as SpatialViewState;
    const currentModels = view.displayStyle.contextRealityModels;
    if (enabled) {
      currentModels.push(model);
    } else {
      const index = currentModels.indexOf(model);
      if (-1 !== index)
        currentModels.splice(index, 1);
    }

    this._vp.invalidateScene();
  }
}
