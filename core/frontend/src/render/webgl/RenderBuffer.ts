/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@bentley/bentleyjs-core";
import { GLDisposable } from "./GLDisposable";
import { GL } from "./GL";
import { System } from "./System";

export class RenderBuffer implements GLDisposable {
  private _glBuffer?: WebGLRenderbuffer;

  public static create(width: number, height: number, format = GL.RenderBuffer.Format.DepthComponent) {
    const gl: WebGLRenderingContext = System.instance.context;

    const glBuffer = gl.createRenderbuffer();
    if (null === glBuffer) {
      return undefined;
    }

    assert(0 < width && 0 < height);
    RenderBuffer.bindBuffer(glBuffer);
    gl.renderbufferStorage(GL.RenderBuffer.TARGET, format, width, height);
    RenderBuffer.unbind();

    return new RenderBuffer(glBuffer);
  }

  public dispose(): void {
    if (undefined !== this._glBuffer) {
      System.instance.context.deleteRenderbuffer(this._glBuffer);
      this._glBuffer = undefined;
    }
  }

  public bind() {
    assert(undefined !== this._glBuffer);
    if (undefined !== this._glBuffer) {
      RenderBuffer.bindBuffer(this._glBuffer);
    }
  }

  private constructor(glBuffer: WebGLRenderbuffer) { this._glBuffer = glBuffer; }

  private static bindBuffer(glBuffer: WebGLRenderbuffer | null) { System.instance.context.bindRenderbuffer(GL.RenderBuffer.TARGET, glBuffer); }
  private static unbind() { this.bindBuffer(null); }
}
