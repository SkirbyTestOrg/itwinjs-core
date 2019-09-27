/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module WebGL */
import { dispose } from "@bentley/bentleyjs-core";
import { RenderMemory, RenderTextureDrape } from "../System";
import { Texture } from "./Texture";
import { Target } from "./Target";
import { Matrix4 } from "./Matrix";
import { SceneContext } from "../../ViewContext";

export abstract class TextureDrape implements RenderTextureDrape, RenderMemory.Consumer {
  protected _texture?: Texture;
  protected _projectionMatrix = new Matrix4();
  public get texture(): Texture | undefined { return this._texture; }
  public get projectionMatrix(): Matrix4 { return this._projectionMatrix; }
  public abstract collectGraphics(context: SceneContext): void;
  public abstract draw(target: Target): void;
  public get isReady(): boolean { return this._texture !== undefined; }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    if (undefined !== this._texture)
      stats.addPlanarClassifier(this._texture.bytesUsed);
  }

  public dispose() {
    this._texture = dispose(this._texture);
  }

  public getParams(params: Float32Array): void {
    params[0] = 5.0; // Inside, pure texture.
    params[1] = 0.0; // Outside, off.
  }
}
