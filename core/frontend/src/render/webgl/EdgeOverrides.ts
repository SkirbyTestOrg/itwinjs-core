/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { LinePixels, HiddenLine } from "@bentley/imodeljs-common";
import { FloatPreMulRgba } from "./FloatRGBA";
import { OvrFlags } from "./RenderFlags";

// Describes one of the pre-defined line patterns.
// See Render.LinePixels.
export namespace LineCode {
  export function valueFromLinePixels(pixels: LinePixels): number {
    switch (pixels) {
      case LinePixels.Code0: return 0;
      case LinePixels.Code1: return 1;
      case LinePixels.Code2: return 2;
      case LinePixels.Code3: return 3;
      case LinePixels.Code4: return 4;
      case LinePixels.Code5: return 5;
      case LinePixels.Code6: return 6;
      case LinePixels.Code7: return 7;
      case LinePixels.HiddenLine: return 8;
      case LinePixels.Invisible: return 9;
      default: return 0;
    }
  }

  export const solid = 0;
}

export class EdgeOverrides {
  private _color?: FloatPreMulRgba;
  private _lineCode?: number;
  private _weight?: number;
  private _forceOpaque: boolean = false;

  public get color() { return this._color; }
  public get lineCode() { return this._lineCode; }
  public get weight() { return this._weight; }
  public get forceOpaque() { return this._forceOpaque; }

  public get overridesColor() { return undefined !== this.color; }
  public get overridesLineCode() { return undefined !== this.lineCode; }
  public get overridesWeight() { return undefined !== this.weight; }
  public get overridesAlpha() { return this.forceOpaque; }
  public get anyOverridden() { return this.overridesColor || this.overridesLineCode || this.overridesWeight || this.overridesAlpha; }

  public constructor(style?: HiddenLine.Style, forceOpaque: boolean = false) {
    this.init(forceOpaque, style);
  }

  public computeOvrFlags(): OvrFlags {
    let flags = OvrFlags.None;

    if (this.overridesColor)    flags |= OvrFlags.Rgba;
    if (this.overridesWeight)   flags |= OvrFlags.Weight;
    if (this.overridesLineCode) flags |= OvrFlags.LineCode;
    if (this.overridesAlpha)    flags |= OvrFlags.Alpha;

    return flags;
  }

  public init(forceOpaque: boolean, style?: HiddenLine.Style): void {
    this._forceOpaque = forceOpaque;
    if (undefined === style) {
      this._color = undefined;
      this._weight = undefined;
      this._lineCode = undefined;
    } else {
      this._color = style.ovrColor ? FloatPreMulRgba.fromColorDef(style.color) : undefined;
      this._weight = style.width !== 0 ? style.width : undefined;
      this._lineCode = LinePixels.Invalid !== style.pattern ? LineCode.valueFromLinePixels(style.pattern) : undefined;
    }
  }
}
