/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Views */

import { Id64, Id64Props, JsonUtils } from "@bentley/bentleyjs-core";
import { ColorDef, ColorDefProps } from "./ColorDef";

/** Properties to create a SubCategory Appearance */
export interface AppearanceProps {
  color?: ColorDefProps;
  invisible?: boolean;
  dontPlot?: boolean;
  dontSnap?: boolean;
  dontLocate?: boolean;
  weight?: number;
  style?: Id64Props;
  priority?: number;
  material?: Id64Props;
  transp?: number;
}

/** Parameters that define the way geometry on a SubCategory appears. */
export class Appearance {
  public color: ColorDef = ColorDef.black;
  public weight = 0;
  public priority = 0;
  public transparency = 0;
  public invisible = false;
  public dontPlot = false;
  public dontSnap = false;
  public dontLocate = false;
  public styleId: Id64;
  public materialId: Id64;

  constructor(props?: AppearanceProps) {
    if (!props) {
      this.styleId = new Id64();
      this.materialId = new Id64();
      return;
    }

    this.invisible = JsonUtils.asBool(props.invisible);
    this.dontSnap = JsonUtils.asBool(props.dontSnap);
    this.dontLocate = JsonUtils.asBool(props.dontLocate);
    this.dontPlot = JsonUtils.asBool(props.dontPlot);
    this.color = ColorDef.fromJSON(props.color);
    this.weight = JsonUtils.asInt(props.weight);
    this.styleId = Id64.fromJSON(props.style);
    this.priority = JsonUtils.asInt(props.priority);
    this.materialId = Id64.fromJSON(props.material);
    this.transparency = JsonUtils.asInt(props.transp);
  }

  public equals(other: Appearance): boolean {
    return this.invisible === other.invisible &&
      this.dontPlot === other.dontPlot &&
      this.dontSnap === other.dontSnap &&
      this.dontLocate === other.dontLocate &&
      this.color.equals(other.color) &&
      this.weight === other.weight &&
      this.priority === other.priority &&
      this.styleId.equals(other.styleId) &&
      this.materialId.equals(other.materialId) &&
      this.transparency === other.transparency;
  }

  public toJSON(): AppearanceProps {
    const val = { color: this.color.toJSON() } as AppearanceProps;
    if (this.invisible) val.invisible = true;
    if (this.dontPlot) val.dontPlot = true;
    if (this.dontSnap) val.dontSnap = true;
    if (this.dontLocate) val.dontLocate = true;
    if (0 !== this.weight) val.weight = this.weight;
    if (this.styleId.isValid()) val.style = this.styleId;
    if (0 !== this.priority) val.priority = this.priority;
    if (this.materialId.isValid()) val.material = this.materialId;
    if (0.0 !== this.transparency) val.transp = this.transparency;
    return val;
  }
}

/** the SubCategory appearance overrides for a view */
export class SubCategoryOverride {
  private readonly _value = new Appearance();
  private _invisible?: boolean;
  private _color?: boolean;
  private _weight?: boolean;
  private _style?: boolean;
  private _priority?: boolean;
  private _material?: boolean;
  private _transp?: boolean;

  public setInvisible(val: boolean): void { this._invisible = true; this._value.invisible = val; }
  public setColor(val: ColorDef): void { this._color = true; this._value.color = val; }
  public setWeight(val: number): void { this._weight = true; this._value.weight = val; }
  public setStyle(val: Id64) { this._style = true; this._value.styleId = val; }
  public setDisplayPriority(val: number) { this._priority = true; this._value.priority = val; }
  public setMaterial(val: Id64) { this._material = true; this._value.materialId = val; }
  public setTransparency(val: number) { this._transp = true; this._value.transparency = val; }
  public applyTo(appear: Appearance): void {
    if (this._invisible) appear.invisible = this._value.invisible;
    if (this._color) appear.color = this._value.color;
    if (this._weight) appear.weight = this._value.weight;
    if (this._style) appear.styleId = this._value.styleId;
    if (this._material) appear.materialId = this._value.materialId;
    if (this._priority) appear.priority = this._value.priority;
    if (this._transp) appear.transparency = this._value.transparency;
  }

  /** convert this SubCategoryOverride to a JSON object */
  public toJSON(): any {
    const val: any = {};
    if (this._invisible) val.invisible = this._value.invisible;
    if (this._color) val.color = this._value.color;
    if (this._weight) val.weight = this._value.weight;
    if (this._style) val.style = this._value.styleId;
    if (this._material) val.material = this._value.materialId;
    if (this._priority) val.priority = this._value.priority;
    if (this._transp) val.transp = this._value.transparency;
    return val;
  }

  /** Create a new SubCategoryOverride from a JSON object */
  public static fromJSON(json: any): SubCategoryOverride {
    const val = new SubCategoryOverride();
    if (!json)
      return val;

    if (json.invisible) val.setInvisible(JsonUtils.asBool(json.invisible));
    if (json.color) val.setColor(ColorDef.fromJSON(json.color));
    if (json.weight) val.setWeight(JsonUtils.asInt(json.weight));
    if (json.style) val.setStyle(Id64.fromJSON(json.style));
    if (json.material) val.setMaterial(Id64.fromJSON(json.material));
    if (json.priority) val.setDisplayPriority(JsonUtils.asInt(json.priority));
    if (json.transp) val.setTransparency(JsonUtils.asDouble(json.transp));
    return val;
  }
}

/** the rank for a Category */
export const enum Rank {
  System = 0,       // This category is predefined by the system
  Domain = 1,       // This category is defined by a schema. Elements in this category may be unknown to system functionality.
  Application = 2,  // This category is defined by an application. Elements in this category may be unknown to system and schema functionality.
  User = 3,         // This category is defined by a user. Elements in this category may be unknown to system, schema, and application functionality.
}
