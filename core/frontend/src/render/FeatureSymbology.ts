/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Rendering */

import { LinePixels, ColorDef, RgbColor, Feature, GeometryClass, SubCategoryOverride } from "@bentley/imodeljs-common";
import { Id64Set, Id64 } from "@bentley/bentleyjs-core";
import { ViewState, SpecialElements, DrawnElementSets } from "../ViewState";

export namespace FeatureSymbology {
  export interface AppearanceProps {
    rgb?: RgbColor;
    weight?: number;
    alpha?: number;
    linePixels?: LinePixels;
    ignoresMaterial?: true | undefined;
  }

  /** Defines overrides for selected aspects of a Feature's symbology. */
  export class Appearance {
    public rgb?: RgbColor;
    public weight?: number;
    public alpha?: number;
    public linePixels?: LinePixels;
    public ignoresMaterial: boolean;

    public static defaults = new Appearance({});

    public static fromJSON(props?: AppearanceProps) {
      if (undefined === props || (undefined === props.rgb && undefined === props.weight && undefined === props.alpha && undefined === props.linePixels && !props.ignoresMaterial))
        return this.defaults;
      else
        return new Appearance(props);
    }

    /** Create an Appearance which overrides the RGB color of a Feature. */
    public static fromRgb(color: ColorDef): Appearance { return this.fromJSON({ rgb: RgbColor.fromColorDef(color) }); }

    /** Create an Appearance which overides the RGB and alpha of a Feature. */
    public static fromRgba(color: ColorDef): Appearance {
      return this.fromJSON({
        rgb: RgbColor.fromColorDef(color),
        alpha: color.getAlpha(),
      });
    }

    /** Create an Appearance with overrides corresponding to those defined by the supplied SubCategoryOverride. */
    public static fromSubCategoryOverride(ovr: SubCategoryOverride): Appearance {
      const rgb = undefined !== ovr.color ? RgbColor.fromColorDef(ovr.color) : undefined;
      const alpha = undefined !== ovr.transparency ? ovr.transparency : undefined;
      const weight = undefined !== ovr.weight ? ovr.weight : undefined;
      const ignoresMaterial = undefined !== ovr.material && !ovr.material.isValid ? true : undefined;
      return this.fromJSON({ rgb, alpha, weight, ignoresMaterial });
    }

    public get overridesRgb(): boolean { return undefined !== this.rgb; }
    public get overridesAlpha(): boolean { return undefined !== this.alpha; }
    public get overridesLinePixels(): boolean { return undefined !== this.linePixels; }
    public get overridesWeight(): boolean { return undefined !== this.weight; }
    public get overridesSymbology(): boolean { return this.overridesRgb || this.overridesAlpha || this.overridesWeight || this.overridesLinePixels || this.ignoresMaterial; }

    public equals(other: Appearance): boolean {
      const { rgb, weight, alpha, linePixels, ignoresMaterial } = other;
      return this.rgbIsEqual(rgb) && this.weight === weight && this.alpha === alpha && this.linePixels === linePixels && this.ignoresMaterial === ignoresMaterial;
    }

    public toJSON(): AppearanceProps {
      return {
        rgb: this.rgb,
        weight: this.weight,
        alpha: this.alpha,
        linePixels: this.linePixels,
        ignoresMaterial: this.ignoresMaterial ? true : undefined,
      };
    }

    /** Produce an Appearance from the supplied Appearance in which any aspect not defined by the base Appearance is overridden by this Appearance. */
    public extendAppearance(base: Appearance): Appearance {
      if (!this.overridesSymbology)
        return base;

      const props = base.toJSON();
      if (undefined === props.rgb) props.rgb = this.rgb;
      if (undefined === props.alpha) props.alpha = this.alpha;
      if (undefined === props.linePixels) props.linePixels = this.linePixels;
      if (undefined === props.weight) props.weight = this.weight;
      if (undefined === props.ignoresMaterial && this.ignoresMaterial) props.ignoresMaterial = true;

      return Appearance.fromJSON(props);
    }

    private constructor(props: AppearanceProps) {
      this.rgb = props.rgb;
      this.weight = props.weight;
      this.alpha = props.alpha;
      this.linePixels = props.linePixels;
      this.ignoresMaterial = undefined !== props.ignoresMaterial && props.ignoresMaterial;
    }

    private rgbIsEqual(rgb?: RgbColor): boolean { return undefined === this.rgb ? undefined === rgb ? true : false : undefined === rgb ? false : this.rgb.equals(rgb); }
  }

  export class Overrides implements DrawnElementSets {
    /** Drawn Sets */
    private readonly _specialElements = new SpecialElements();
    public get neverDrawn(): Id64Set { return this._specialElements.neverDrawn; } // Get the list of elements that are never drawn
    public get alwaysDrawn(): Id64Set { return this._specialElements.alwaysDrawn; } // Get the list of elements that are always drawn

    /** Following properties are only mutable internally: */
    private _defaultOverrides = Appearance.defaults;
    private _constructions = false;
    private _dimensions = false;
    private _patterns = false;
    private _alwaysDrawnExclusive = false;
    private _lineWeights = true;

    public readonly modelOverrides = new Map<string, Appearance>();
    public readonly elementOverrides = new Map<string, Appearance>();
    public readonly subCategoryOverrides = new Map<string, Appearance>();

    public readonly visibleSubCategories = new Set<string>();

    public get defaultOverrides(): Appearance { return this._defaultOverrides; }
    public get isAlwaysDrawnExclusive(): boolean { return this._alwaysDrawnExclusive; }
    public get lineWeights(): boolean { return this._lineWeights; }

    public copyAlwaysDrawn(always: Id64Set): void { this._specialElements.setAlwaysDrawn(always); }
    public copyNeverDrawn(never: Id64Set): void { this._specialElements.setNeverDrawn(never); }

    public isNeverDrawn(id: Id64): boolean { return this._specialElements.isNeverDrawn(id); }
    public isAlwaysDrawn(id: Id64): boolean { return this._specialElements.isAlwaysDrawn(id); }
    public isSubCategoryVisible(id: Id64): boolean { return this.visibleSubCategories.has(id.value); }

    public clearModelOverrides(id: Id64): void { this.modelOverrides.delete(id.value); }
    public clearElementOverrides(id: Id64): void { this.elementOverrides.delete(id.value); }
    public clearSubCategoryOverrides(id: Id64): void { this.subCategoryOverrides.delete(id.value); }
    public clearAlwaysDrawn(id?: Id64): void { this._specialElements.clearAlwaysDrawn(id); }
    public clearNeverDrawn(id?: Id64): void { this._specialElements.clearNeverDrawn(id); }
    public clearVisibleSubCategory(id: Id64): void { this.visibleSubCategories.delete(id.value); }

    public getModelOverrides(id: Id64): Appearance | undefined { return this.modelOverrides.get(id.value); }
    public getElementOverrides(id: Id64): Appearance | undefined { return this.elementOverrides.get(id.value); }
    public getSubCategoryOverrides(id: Id64): Appearance | undefined { return this.subCategoryOverrides.get(id.value); }

    public setVisibleSubCategory(id: Id64): void { this.visibleSubCategories.add(id.value); }
    public setNeverDrawn(id: Id64): void { this._specialElements.setNeverDrawn(id); }
    public setAlwaysDrawn(id: Id64): void { this._specialElements.setAlwaysDrawn(id); }
    public setAlwaysDrawnExclusive(exclusive: boolean = true): void { this._alwaysDrawnExclusive = exclusive; }

    /** Returns the feature's Appearance overrides, or undefined if the feature is not visible. */
    public getAppearance(feature: Feature, modelId: Id64): Appearance | undefined {
      let app = !this._lineWeights ? Appearance.fromJSON({ weight: 1 }) : Appearance.defaults;
      const modelApp = this.getModelOverrides(modelId);
      if (undefined !== modelApp)
        app = modelApp.extendAppearance(app);

      // Is the element visible?
      const { elementId, subCategoryId, geometryClass } = feature;
      let elemApp, alwaysDrawn = false;

      if (elementId.isValid()) {
        if (this.isNeverDrawn(elementId))
          return undefined;

        alwaysDrawn = this.isAlwaysDrawn(elementId);
        if (!alwaysDrawn && this.isAlwaysDrawnExclusive)
          return undefined;

        // Element overrides take precedence
        elemApp = this.getElementOverrides(elementId);
        if (undefined !== elemApp)
          app = undefined !== modelApp ? elemApp.extendAppearance(app) : elemApp;
      }

      if (subCategoryId.isValid()) {
        if (!alwaysDrawn && !this.isSubCategoryVisible(subCategoryId))
          return undefined;

        const subCat = this.getSubCategoryOverrides(subCategoryId);
        if (undefined !== subCat)
          app = subCat.extendAppearance(app);
      }

      if (undefined === elemApp && undefined === modelApp)
        app = this._defaultOverrides.extendAppearance(app);

      let visible = alwaysDrawn || this.isClassVisible(geometryClass);
      if (visible && app.overridesAlpha)
        visible = app.alpha! < 0xff; // don't bother rendering something with full transparency...

      return visible ? app : undefined;
    }

    public isClassVisible(geomClass: GeometryClass): boolean {
      switch (geomClass) {
        case GeometryClass.Construction: return this._constructions;
        case GeometryClass.Dimension: return this._dimensions;
        case GeometryClass.Pattern: return this._patterns;
        default: return true;
      }
    }

    public isFeatureVisible(feature: Feature): boolean {
      // TFS#808986: Navigator puts some elements into both the 'never' and 'always' lists which is weird but
      // the docs for ViewController::GetNeverDrawn() assert that in that case the 'never' list wins.
      const { elementId, subCategoryId, geometryClass } = feature;
      const isValidElemId = elementId.isValid();

      if (isValidElemId && this.isNeverDrawn(elementId))
        return false;

      const alwaysDrawn = isValidElemId && this.isAlwaysDrawn(elementId);
      if (alwaysDrawn || this.isAlwaysDrawnExclusive)
        return alwaysDrawn;

      if (!this.isSubCategoryVisible(subCategoryId))
        return false;

      return this.isClassVisible(geometryClass);
    }

    // Specify overrides for all elements within the specified model. These overrides take priority.
    public overrideModel(id: Id64, app: Appearance, replaceExisting: boolean = true): void {
      if (!id.isValid())
        return;

      if (replaceExisting || undefined === this.getModelOverrides(id))
        this.modelOverrides.set(id.value, app);
    }

    public overrideSubCategory(id: Id64, app: Appearance, replaceExisting: boolean = true): void {
      if (!id.isValid() || !this.isSubCategoryVisible(id))
        return;

      // NB: Appearance may specify no overridden symbology - this means "don't apply the default overrides to this subcategory"
      if (replaceExisting || undefined === this.getSubCategoryOverrides(id))
        this.subCategoryOverrides.set(id.value, app);
    }

    // NB: Appearance can override nothing, which prevents the default overrides from applying to it.
    public overrideElement(id: Id64, app: Appearance, replaceExisting: boolean = true): void {
      if (!id.isValid() || this.isNeverDrawn(id))
        return;

      // NB: Appearance may specify no overridden symbology - this means "don't apply the default overrides to this element"
      if (replaceExisting || undefined === this.getElementOverrides(id))
        this.elementOverrides.set(id.value, app);
    }

    public setDefaultOverrides(appearance: Appearance, replaceExisting: boolean = true): void {
      if (replaceExisting || !appearance.overridesSymbology)
        this._defaultOverrides = appearance;
    }

    public initFromView(view: ViewState) {
      const { alwaysDrawn, neverDrawn, viewFlags } = view;
      const { constructions, dimensions, patterns } = viewFlags;

      this.copyAlwaysDrawn(alwaysDrawn);
      this.copyNeverDrawn(neverDrawn);

      this._constructions = constructions;
      this._dimensions = dimensions;
      this._patterns = patterns;
      this._lineWeights = viewFlags.showWeights();

      for (const categoryId of view.categorySelector.categories) {
        const subCategoryIds = view.subCategories.getSubCategories(categoryId);
        if (undefined === subCategoryIds)
          continue;

        for (const subCategoryId of subCategoryIds) {
          if (view.isSubCategoryVisible(subCategoryId)) {
            this.visibleSubCategories.add(subCategoryId);
            const ovr = view.getSubCategoryOverride(subCategoryId);
            if (undefined !== ovr) {
              const app = Appearance.fromSubCategoryOverride(ovr);
              if (app.overridesSymbology)
                this.subCategoryOverrides.set(subCategoryId, app);
            }
          }
        }
      }
    }

    constructor(view?: ViewState) { if (undefined !== view) this.initFromView(view); }
  }
}
