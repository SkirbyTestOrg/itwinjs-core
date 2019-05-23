/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import { assert, compareStringsOrUndefined, Id64, Id64Arg } from "@bentley/bentleyjs-core";
import { SpatialClassificationProps } from "@bentley/imodeljs-common";
import { Viewport, SpatialViewState, SpatialModelState, GeometricModelState, SpatialClassification } from "@bentley/imodeljs-frontend";
import { CheckBox, createCheckBox } from "./CheckBox";
import { ComboBox, ComboBoxEntry, createComboBox } from "./ComboBox";
import { createNumericInput } from "./NumericInput";
import { ToolBarDropDown } from "./ToolBar";

export abstract class IdPicker extends ToolBarDropDown {
  protected readonly _vp: Viewport;
  protected readonly _element: HTMLElement;
  protected readonly _parent: HTMLElement;
  protected readonly _checkboxes: HTMLInputElement[] = [];
  protected readonly _availableIds = new Set<string>();

  protected abstract get _elementType(): "Model" | "Category";
  protected get _showIn2d(): boolean { return true; }
  protected abstract get _enabledIds(): Set<string>;
  protected abstract changeDisplay(ids: Id64Arg, enabled: boolean): void;

  protected toggleAll(enabled: boolean): void {
    this.changeDisplay(this._availableIds, enabled);
    for (const cb of this._checkboxes)
      cb.checked = enabled;
  }

  protected invertAll(): void {
    for (const cb of this._checkboxes) {
      const enabled = !cb.checked;
      cb.checked = enabled;
      this.changeDisplay(cb.id, enabled);
    }
  }

  protected get _comboBoxEntries(): Array<ComboBoxEntry<string>> {
    return [
      { name: "", value: "" },
      { name: "Show All", value: "All" },
      { name: "Hide All", value: "None" },
      { name: "Invert", value: "Inverse" },
      { name: "Isolate Selected", value: "Isolate" },
      { name: "Hide Selected", value: "Hide" },
      { name: "Hilite Enabled", value: "Hilite" },
      { name: "Un-hilite Enabled", value: "Dehilite" },
    ];
  }

  protected abstract async _populate(): Promise<void>;
  public async populate(): Promise<void> {
    this._availableIds.clear();
    this._checkboxes.length = 0;
    while (this._element.hasChildNodes())
      this._element.removeChild(this._element.firstChild!);

    const visible = this._showIn2d || this._vp.view.isSpatialView();
    this._parent.style.display = visible ? "block" : "none";
    if (!visible)
      return Promise.resolve();

    createComboBox({
      name: "Display: ",
      id: this._elementType + "Picker_show",
      parent: this._element,
      handler: (select) => {
        this.show(select.value);
        select.value = "";
      },
      value: "",
      entries: this._comboBoxEntries,
    });

    this._element.appendChild(document.createElement("hr"));

    return this._populate();
  }

  protected constructor(vp: Viewport, parent: HTMLElement) {
    super();
    this._vp = vp;
    this._parent = parent;

    this._element = document.createElement("div");
    this._element.className = "scrollingToolMenu";
    this._element.style.display = "block";

    parent.appendChild(this._element);
  }

  public get isOpen(): boolean { return "none" !== this._element.style.display; }
  protected _open(): void { this._element.style.display = "block"; }
  protected _close(): void { this._element.style.display = "none"; }
  public get onViewChanged(): Promise<void> { return this.populate(); }

  protected showOrHide(element: HTMLElement, show: boolean) { if (element) element.style.display = show ? "block" : "none"; }

  protected addCheckbox(name: string, id: string, isChecked: boolean): CheckBox {
    this._availableIds.add(id);

    const cb = createCheckBox({
      name,
      id,
      parent: this._element,
      isChecked,
      handler: (checkbox) => {
        this.changeDisplay(checkbox.id, checkbox.checked);
      },
    });

    this._checkboxes.push(cb.checkbox);
    return cb;
  }

  protected show(which: string): void {
    switch (which) {
      case "All":
        this.toggleAll(true);
        return;
      case "None":
        this.toggleAll(false);
        return;
      case "Inverse":
        this.invertAll();
        return;
      case "Hilite":
      case "Dehilite":
        this.hiliteEnabled("Hilite" === which);
        return;
      case "":
        return;
    }

    this.queryIds().then((ids) => {
      if (0 === ids.length)
        return;

      const isolate = "Isolate" === which;
      if (isolate)
        this.toggleAll(false);

      this.toggleIds(ids, isolate);
    }).catch((reason) => {
      alert("Error querying iModel: " + reason);
    });
  }

  private async queryIds(): Promise<string[]> {
    const is2d = this._vp.view.is2d();
    const elementType = this._elementType;
    if (is2d && elementType === "Model")
      return Promise.resolve([]);

    const selectedElems = this._vp.iModel.selectionSet.elements;
    if (0 === selectedElems.size || selectedElems.size > 20) {
      if (0 < selectedElems.size)
        alert("Too many elements selected");

      return Promise.resolve([]);
    }

    const elemIds = "(" + Array.from(selectedElems).join(",") + ")";
    const ecsql = "SELECT DISTINCT " + elementType + ".Id FROM bis.GeometricElement" + (is2d ? "2d" : "3d") + " WHERE ECInstanceId IN " + elemIds;
    const rows = [];
    for await (const row of this._vp.view.iModel.query(ecsql)) {
      rows.push(row);
    }
    const column = elementType.toLowerCase() + ".id";
    return rows.map((value) => value[column]);
  }

  private toggleIds(ids: Id64Arg, enabled: boolean): void {
    const boxById = new Map<string, HTMLInputElement>();
    this._checkboxes.map((box) => boxById.set(box.id, box));
    Id64.forEach(ids, (id) => {
      this.changeDisplay(id, enabled);
      if (boxById.get(id))
        boxById.get(id)!.checked = enabled;
    });
  }

  protected abstract hiliteEnabled(hiliteOn: boolean): void;
}

function getCategoryName(row: any): string {
  return undefined !== row.label ? row.label : row.code;
}

const selectUsedSpatialCategoryIds = "SELECT DISTINCT Category.Id as CategoryId from BisCore.GeometricElement3d WHERE Category.Id IN (SELECT ECInstanceId from BisCore.SpatialCategory)";
const selectUsedDrawingCategoryIds = "SELECT DISTINCT Category.Id as CategoryId from BisCore.GeometricElement2d WHERE Model.Id=? AND Category.Id IN (SELECT ECInstanceId from BisCore.DrawingCategory)";
const selectCategoryProps = "SELECT ECInstanceId as id, CodeValue as code, UserLabel as label FROM ";
const selectSpatialCategoryProps = selectCategoryProps + "BisCore.SpatialCategory WHERE ECInstanceId IN (" + selectUsedSpatialCategoryIds + ")";
const selectDrawingCategoryProps = selectCategoryProps + "BisCore.DrawingCategory WHERE ECInstanceId IN (" + selectUsedDrawingCategoryIds + ")";

export class CategoryPicker extends IdPicker {
  public constructor(vp: Viewport, parent: HTMLElement) { super(vp, parent); }

  protected get _elementType(): "Category" { return "Category"; }
  protected get _enabledIds() { return this._vp.view.categorySelector.categories; }
  protected changeDisplay(ids: Id64Arg, enabled: boolean) { this._vp.changeCategoryDisplay(ids, enabled); }

  protected get _comboBoxEntries(): Array<ComboBoxEntry<string>> {
    const entries = super._comboBoxEntries;
    entries.push({ name: "All SubCategories", value: "Subcategories" });
    return entries;
  }

  protected async _populate(): Promise<void> {
    const view = this._vp.view;
    const ecsql = view.is3d() ? selectSpatialCategoryProps : selectDrawingCategoryProps;
    const bindings = view.is2d() ? [view.baseModelId] : undefined;
    const rows: any[] = [];
    for await (const row of view.iModel.query(`${ecsql} LIMIT 1000`, bindings)) {
      rows.push(row);
    }
    rows.sort((lhs, rhs) => {
      const lhName = getCategoryName(lhs);
      const rhName = getCategoryName(rhs);
      if (lhName < rhName)
        return -1;
      else if (lhName > rhName)
        return 1;
      else
        return 0;
    });

    for (const row of rows) {
      const name = getCategoryName(row);
      this.addCheckbox(name, row.id, view.categorySelector.has(row.id));
    }

    // Remove any unused categories from category selector (otherwise areAllEnabled criterion is broken).
    let unusedCategories: Set<string> | undefined;
    for (const categoryId of view.categorySelector.categories) {
      if (!this._availableIds.has(categoryId)) {
        if (undefined === unusedCategories)
          unusedCategories = new Set<string>();

        unusedCategories.add(categoryId);
      }
    }

    if (undefined !== unusedCategories)
      this._vp.changeCategoryDisplay(unusedCategories, false);
  }

  protected show(which: string): void {
    if ("Subcategories" === which)
      this._vp.changeCategoryDisplay(this._enabledIds, true, true);
    else
      super.show(which);
  }

  protected hiliteEnabled(hiliteOn: boolean): void {
    const catIds = this._enabledIds;
    const cache = this._vp.iModel.subcategories;
    const set = this._vp.iModel.hilited.subcategories;
    for (const catId of catIds) {
      const subcatIds = cache.getSubCategories(catId);
      if (undefined !== subcatIds) {
        for (const subcatId of subcatIds) {
          if (hiliteOn)
            set.addId(subcatId);
          else
            set.deleteId(subcatId);
        }
      }
    }
  }
}

export class ModelPicker extends IdPicker {
  public constructor(vp: Viewport, parent: HTMLElement) { super(vp, parent); }

  protected get _elementType(): "Model" { return "Model"; }
  protected get _enabledIds() { return (this._vp.view as SpatialViewState).modelSelector.models; }
  protected get _showIn2d() { return false; }
  protected changeDisplay(ids: Id64Arg, enabled: boolean) { this._vp.changeModelDisplay(ids, enabled); }

  protected hiliteEnabled(hiliteOn: boolean): void {
    const modelIds = this._enabledIds;
    const hilites = this._vp.iModel.hilited;
    for (const modelId of modelIds) {
      if (hiliteOn)
        hilites.models.addId(modelId);
      else
        hilites.models.deleteId(modelId);
    }
  }

  protected async _populate(): Promise<void> {
    const view = this._vp.view as SpatialViewState;
    assert(undefined !== view && view.isSpatialView());

    const query = { from: SpatialModelState.classFullName, wantPrivate: false };
    const props = await view.iModel.models.queryProps(query);
    props.sort((lhs, rhs) => compareStringsOrUndefined(lhs.name, rhs.name));

    const selector = view.modelSelector;
    for (const prop of props) {
      if (undefined === prop.id || undefined === prop.name)
        continue;

      let model = view.iModel.models.getLoaded(prop.id);
      if (undefined === model) {
        // ###TODO: Load models on demand when they are enabled in the dialog - not all up front like this...super-inefficient.
        await view.iModel.models.load(prop.id);
        model = view.iModel.models.getLoaded(prop.id);
        if (undefined === model)
          continue;
      }

      const id = prop.id;
      const cb = this.addCheckbox(prop.name, id, selector.has(id));

      const geometricModel = model as GeometricModelState;
      // If reality model with no classifiers -- add classifiers (for testing)
      if (model.jsonProperties && undefined !== model.jsonProperties.tilesetUrl && undefined === model.jsonProperties.classifiers)   // We need a better test for reality models.
        for (const otherProp of props)
          if (otherProp !== prop && undefined !== otherProp.id && undefined !== otherProp.name)
            SpatialClassification.addSpatialClassifier(geometricModel, new SpatialClassificationProps.Properties({ name: otherProp.name, modelId: otherProp.id, expand: 1.0, flags: new SpatialClassificationProps.Flags(), isActive: false }));

      let insideCombo: ComboBox | undefined;
      let outsideCombo: ComboBox | undefined;
      let expandInput: HTMLInputElement | undefined;
      if (undefined !== geometricModel && undefined !== SpatialClassification.getSpatialClassifier(geometricModel, 0)) {
        const div = document.createElement("div");
        cb.div.appendChild(div);

        const entries = [{ name: "None", value: -1 }];
        let classifier;
        let activeClassifierIndex = SpatialClassification.getActiveSpatialClassifier(geometricModel);
        let activeClassifier = (activeClassifierIndex >= 0) ? SpatialClassification.getSpatialClassifier(geometricModel, activeClassifierIndex) : undefined;
        for (let i = 0; undefined !== (classifier = SpatialClassification.getSpatialClassifier(geometricModel, i)); i++)
          entries.push({ name: classifier.name, value: i });

        createComboBox({
          parent: div,
          name: "Classifier: ",
          id: "Classifier_" + id,
          value: activeClassifierIndex,
          handler: (select) => {
            activeClassifierIndex = Number.parseInt(select.value, 10);
            SpatialClassification.setActiveSpatialClassifier(geometricModel, activeClassifierIndex, true).then((_) => {
              activeClassifier = SpatialClassification.getSpatialClassifier(geometricModel, activeClassifierIndex);
              this.showOrHide(insideCombo!.div, activeClassifier !== undefined);
              this.showOrHide(outsideCombo!.div, activeClassifier !== undefined);
              this.showOrHide(expandInput!, activeClassifier !== undefined);
              if (activeClassifier) {
                if (insideCombo) insideCombo.div.style.display = "block";
                if (outsideCombo) outsideCombo.select.selectedIndex = activeClassifier.flags.outside;
                if (expandInput) expandInput.value = activeClassifier.expand.toString();
              }
              this._vp.invalidateScene();
            }).catch((_) => undefined);
          },
          entries,
        });

        insideCombo = createComboBox({
          parent: div,
          name: "Inside: ",
          id: "ClassifierInside_" + id,
          value: activeClassifier ? activeClassifier!.flags.inside : 1,
          handler: (select) => {
            if (activeClassifier) {
              activeClassifier.flags.inside = Number.parseInt(select.value, 10);
              SpatialClassification.setSpatialClassifier(geometricModel, activeClassifierIndex, activeClassifier);
              this._vp.invalidateScene();
            }
          },
          entries: [{ name: "Off", value: 0 }, { name: "On", value: 1 }, { name: "Dimmed", value: 2 }, { name: "Hilite", value: 3 }, { name: "Color", value: 4 }],
        });
        outsideCombo = createComboBox({
          parent: div,
          name: "Outside: ",
          id: "ClassifierInside_" + id,
          value: activeClassifier ? activeClassifier.flags.outside : 1,
          handler: (select) => {
            if (activeClassifier) {
              activeClassifier.flags.outside = Number.parseInt(select.value, 10);
              SpatialClassification.setSpatialClassifier(geometricModel, activeClassifierIndex, activeClassifier);
              this._vp.invalidateScene();
            }
          },
          entries: [{ name: "Off", value: 0 }, { name: "On", value: 1 }, { name: "Dimmed", value: 2 }],
        });
        expandInput = createNumericInput({
          parent: div,
          id: "ClassifierExpand_" + id,
          value: activeClassifier ? activeClassifier.expand : 0.0,
          handler: (select) => {
            if (activeClassifier) {
              activeClassifier.expand = select;
              SpatialClassification.setSpatialClassifier(geometricModel, activeClassifierIndex, activeClassifier);
              this._vp.invalidateScene();
            }
          },
        });

        this.showOrHide(insideCombo!.div, activeClassifier !== undefined);
        this.showOrHide(outsideCombo!.div, activeClassifier !== undefined);
        this.showOrHide(expandInput!, activeClassifier !== undefined);
      }
    }
  }
}
