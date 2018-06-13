/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
*--------------------------------------------------------------------------------------------*/
import { IModelApp } from "@bentley/imodeljs-frontend";
import { RenderSystem } from "@bentley/imodeljs-frontend/lib/rendering";

export class NullRenderSystem extends RenderSystem {
  public createTarget() { return undefined as any; }
  public createOffscreenTarget() { return undefined as any; }
  public createGraphic() { return undefined as any; }
  public createGraphicList() { return undefined as any; }
  public createBranch() { return undefined as any; }
  public createBatch() { return undefined as any; }
  public constructor() { super(undefined as any); }
}

export class MaybeRenderApp extends IModelApp {
  protected static supplyRenderSystem(): RenderSystem {
    try {
      return super.supplyRenderSystem();
    } catch (e) {
      return new NullRenderSystem();
    }
  }
}

export namespace WebGLTestContext {
  export let isInitialized = false;

  export function startup() {
    MaybeRenderApp.startup();
    isInitialized = true;
  }

  export function shutdown() {
    MaybeRenderApp.shutdown();
  }

  const canvasId = "WebGLTestCanvas";

  export function createCanvas(width: number = 300, height: number = 150): HTMLCanvasElement | undefined {
    let canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (null === canvas) {
      canvas = document.createElement("canvas") as HTMLCanvasElement;
      if (null === canvas) return undefined;

      canvas.id = canvasId;
      document.body.appendChild(document.createTextNode("WebGL tests"));
      document.body.appendChild(canvas);
    }

    canvas.width = width;
    canvas.height = height;

    return canvas;
  }
}
