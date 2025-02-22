/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { assert } from "@itwin/core-bentley";
import { ColorDef, RgbColor } from "@itwin/core-common";
import { UniformHandle } from "./UniformHandle";

function clamp(norm: number): number {
  assert(() => norm >= 0 && norm <= 1);
  return Math.max(0, Math.min(1, norm));
}

function scale(norm: number): number {
  assert(() => norm >= 0 && norm <= 1);
  return Math.floor(norm * 255 + 0.5);
}

export abstract class FloatColor {
  protected readonly _components: Float32Array;
  private _tbgr: number;

  protected constructor(numComponents: number) {
    this._components = new Float32Array(numComponents);
    this._tbgr = 0;
  }

  protected abstract maskTbgr(tbgr: number): number;
  protected abstract setComponents(r: number, g: number, b: number, a: number): void;

  public get red() { return this._components[0]; }
  public get green() { return this._components[1]; }
  public get blue() { return this._components[2]; }
  public get tbgr() { return this._tbgr; }
  public get isWhite() { return 1.0 === this.red && 1.0 === this.green && 1.0 === this.blue; }

  public setColorDef(def: ColorDef) {
    this.setTbgr(def.tbgr);
  }

  public setRgbColor(rgb: RgbColor) {
    this.setTbgr((rgb.r | (rgb.g << 8) | (rgb.b << 16)) >>> 0);
  }

  public setTbgr(tbgr: number) {
    tbgr = this.maskTbgr(tbgr);
    if (tbgr === this.tbgr)
      return;

    const c = ColorDef.getColors(tbgr);
    this.setComponents(c.r / 255, c.g / 255, c.b / 255, 1.0 - c.t / 255);
    this._tbgr = tbgr;
  }

  protected setRgbComponents(r: number, g: number, b: number): void {
    this._components[0] = r;
    this._components[1] = g;
    this._components[2] = b;
  }

  protected setRgbaComponents(r: number, g: number, b: number, a: number): void {
    assert(() => r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1 && a >= 0 && a <= 1);
    r = clamp(r);
    g = clamp(g);
    b = clamp(b);
    a = clamp(a);

    const tbgr = (scale(r) | (scale(g) << 8) | (scale(b) << 16) | (scale(1 - a) << 24)) >>> 0;
    this._tbgr = this.maskTbgr(tbgr);
    this.setComponents(r, g, b, a);
  }
}

export class FloatRgb extends FloatColor {
  public constructor() {
    super(3);
  }

  protected maskTbgr(tbgr: number) {
    return (tbgr & 0x00ffffff) >>> 0;
  }

  protected setComponents(r: number, g: number, b: number, _a: number) {
    this.setRgbComponents(r, g, b);
  }

  public set(r: number, g: number, b: number) {
    this.setRgbaComponents(r, g, b, 1);
  }

  public bind(uniform: UniformHandle): void {
    uniform.setUniform3fv(this._components);
  }

  public static fromColorDef(def: ColorDef): FloatRgb {
    return FloatRgb.fromTbgr(def.tbgr);
  }

  public static fromRgbColor(rgb: RgbColor): FloatRgb {
    return FloatRgb.from(rgb.r / 255, rgb.g / 255, rgb.b / 255);
  }

  public static from(r: number, g: number, b: number): FloatRgb {
    const rgb = new FloatRgb();
    rgb.set(r, g, b);
    return rgb;
  }

  public static fromTbgr(tbgr: number): FloatRgb {
    const rgb = new FloatRgb();
    rgb.setTbgr(tbgr);
    return rgb;
  }
}

export class FloatRgba extends FloatColor {
  public constructor() {
    super(4);
    this._components[3] = 1.0;
  }

  protected maskTbgr(tbgr: number) {
    return tbgr;
  }

  protected setComponents(r: number, g: number, b: number, a: number) {
    this.setRgbComponents(r, g, b);
    this._components[3] = a;
  }

  public set(r: number, g: number, b: number, a: number) {
    this.setRgbaComponents(r, g, b, a);
  }

  public get alpha(): number { return this._components[3]; }
  public set alpha(alpha: number) { this._components[3] = alpha; }
  public get hasTranslucency(): boolean { return 1.0 !== this.alpha; }

  public bind(uniform: UniformHandle): void {
    uniform.setUniform4fv(this._components);
  }

  public static fromColorDef(def: ColorDef): FloatRgba {
    return FloatRgba.fromTbgr(def.tbgr);
  }

  public static fromTbgr(tbgr: number): FloatRgba {
    const rgba = new FloatRgba();
    rgba.setTbgr(tbgr);
    return rgba;
  }

  public static from(r: number, g: number, b: number, a: number): FloatRgba {
    const rgba = new FloatRgba();
    rgba.set(r, g, b, a);
    return rgba;
  }

  public clone(out?: FloatRgba): FloatRgba {
    if (undefined === out)
      return FloatRgba.from(this.red, this.green, this.blue, this.alpha);

    out.set(this.red, this.green, this.blue, this.alpha);
    return out;
  }
}
