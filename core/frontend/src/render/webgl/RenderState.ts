/*---------------------------------------------------------------------------------------------
| $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/

import { GL } from "./GL";
import { System } from "./System";

export class RenderStateFlags {
  public cull: boolean = false;
  public depthTest: boolean = false;
  public blend: boolean = false;
  public stencilTest: boolean = false;
  public depthMask: boolean = true;

  public constructor(src?: RenderStateFlags) {
    if (src) {
      this.copyFrom(src);
    }
  }

  public copyFrom(src: RenderStateFlags): void {
    this.cull = src.cull;
    this.depthTest = src.depthTest;
    this.blend = src.blend;
    this.stencilTest = src.stencilTest;
    this.depthMask = src.depthMask;
  }

  public clone(result?: RenderStateFlags): RenderStateFlags {
    if (!result) {
      return new RenderStateFlags(this);
    } else {
      result.copyFrom(this);
      return result;
    }
  }

  public equals(rhs: RenderStateFlags): boolean {
    return this.cull === rhs.cull
        && this.depthTest === rhs.depthTest
        && this.blend === rhs.blend
        && this.stencilTest === rhs.stencilTest
        && this.depthMask === rhs.depthMask;
  }

  public apply(previousFlags: RenderStateFlags): void {
    RenderStateFlags.enableOrDisable(this.cull, GL.Capability.CullFace, previousFlags.cull);
    RenderStateFlags.enableOrDisable(this.depthTest, GL.Capability.DepthTest, previousFlags.depthTest);
    RenderStateFlags.enableOrDisable(this.blend, GL.Capability.Blend, previousFlags.blend);
    RenderStateFlags.enableOrDisable(this.stencilTest, GL.Capability.StencilTest, previousFlags.stencilTest);

    if (previousFlags.depthMask !== this.depthMask) {
      System.instance.context.depthMask(this.depthMask);
    }
  }

  public static enableOrDisable(currentFlag: boolean, value: number, previousFlag: boolean) {
    if (currentFlag !== previousFlag) {
      const gl: WebGLRenderingContext = System.instance.context;
      if (currentFlag) {
        gl.enable(value);
      } else {
        gl.disable(value);
      }
    }
  }
}

export class RenderStateBlend {
  public color: [number, number, number, number] = [0.0, 0.0, 0.0, 0.0];
  public equationRgb: GL.BlendEquation = GL.BlendEquation.Default;
  public equationAlpha: GL.BlendEquation = GL.BlendEquation.Default;
  public functionSourceRgb: GL.BlendFactor = GL.BlendFactor.DefaultSrc;
  public functionSourceAlpha: GL.BlendFactor = GL.BlendFactor.DefaultSrc;
  public functionDestRgb: GL.BlendFactor = GL.BlendFactor.DefaultDst;
  public functionDestAlpha: GL.BlendFactor = GL.BlendFactor.DefaultDst;

  public constructor(src?: RenderStateBlend) {
    if (src) {
      this.copyFrom(src);
    }
  }

  public apply(previousBlend?: RenderStateBlend): void {
    const gl: WebGLRenderingContext = System.instance.context;

    if (previousBlend === undefined || previousBlend.color !== this.color) {
      gl.blendColor(this.color[0], this.color[1], this.color[2], this.color[3]);
    }
    if (previousBlend === undefined || previousBlend.equationRgb !== this.equationRgb || previousBlend.equationAlpha !== this.equationAlpha) {
      gl.blendEquationSeparate(this.equationRgb, this.equationAlpha);
    }
    if (previousBlend === undefined || previousBlend.functionSourceRgb !== this.functionSourceRgb || previousBlend.functionSourceAlpha !== this.functionSourceAlpha
      || previousBlend.functionDestRgb !== this.functionDestRgb || previousBlend.functionDestAlpha !== this.functionDestAlpha) {
      gl.blendFuncSeparate(this.functionSourceRgb, this.functionDestRgb, this.functionSourceAlpha, this.functionDestAlpha);
    }
  }

  public copyFrom(src: RenderStateBlend): void {
    this.setColor(src.color);
    this.equationRgb = src.equationRgb;
    this.equationAlpha = src.equationAlpha;
    this.functionSourceRgb = src.functionSourceRgb;
    this.functionSourceAlpha = src.functionSourceAlpha;
    this.functionDestRgb = src.functionDestRgb;
    this.functionDestAlpha = src.functionDestAlpha;
  }

  public clone(result?: RenderStateBlend): RenderStateBlend {
    if (!result) {
      return new RenderStateBlend(this);
    } else {
      result.copyFrom(this);
      return result;
    }
  }

  public equals(rhs: RenderStateBlend): boolean {
    return this.color[0] === rhs.color[0] && this.color[1] === rhs.color[1] && this.color[2] === rhs.color[2] && this.color[3] === rhs.color[3]
        && this.equationRgb === rhs.equationRgb
        && this.equationAlpha === rhs.equationAlpha
        && this.functionSourceRgb === rhs.functionSourceRgb
        && this.functionSourceAlpha === rhs.functionSourceAlpha
        && this.functionDestRgb === rhs.functionDestRgb
        && this.functionDestAlpha === rhs.functionDestAlpha;
  }

  public setColor(color: [number, number, number, number]) {
    this.color[0] = color[0];
    this.color[1] = color[1];
    this.color[2] = color[2];
    this.color[3] = color[3];
  }

  public setBlendFunc(src: GL.BlendFactor, dst: GL.BlendFactor): void {
    this.setBlendFuncSeparate(src, src, dst, dst);
  }

  public setBlendFuncSeparate(srcRgb: GL.BlendFactor, srcAlpha: GL.BlendFactor, dstRgb: GL.BlendFactor, dstAlpha: GL.BlendFactor): void {
    this.functionSourceRgb = srcRgb;
    this.functionSourceAlpha = srcAlpha;
    this.functionDestRgb = dstRgb;
    this.functionDestAlpha = dstAlpha;
  }
}

/* Stenciling commented out for now since it is not used */
// export class RenderStateStencilOperation {
//   public fail: GL.StencilOperation = GL.StencilOperation.Default;
//   public zFail: GL.StencilOperation = GL.StencilOperation.Default;
//   public zPass: GL.StencilOperation = GL.StencilOperation.Default;

//   public constructor(src?: RenderStateStencilOperation) {
//     if (src) {
//       this.copyFrom(src);
//     }
//   }

//   public copyFrom(src: RenderStateStencilOperation): void {
//     this.fail = src.fail;
//     this.zFail = src.zFail;
//     this.zPass = src.zPass;
//   }

//   public clone(result?: RenderStateStencilOperation): RenderStateStencilOperation {
//     if (!result) {
//       return new RenderStateStencilOperation(this);
//     } else {
//       result.copyFrom(this);
//       return result;
//     }
//   }

//   public equals(rhs: RenderStateStencilOperation): boolean {
//     return this.fail === rhs.fail
//         && this.zFail === rhs.zFail
//         && this.zPass === rhs.zPass;
//   }
// }

// export class RenderStateStencil {
//   public frontFunction: GL.StencilFunction = GL.StencilFunction.Default;
//   public backFunction: GL.StencilFunction = GL.StencilFunction.Default;
//   public frontRef: number = 0;
//   public backRef: number = 0;
//   public frontMask: number = 0xFFFFFFFF;
//   public backMask: number = 0xFFFFFFFF;
//   public frontOperation: RenderStateStencilOperation = new RenderStateStencilOperation();
//   public backOperation: RenderStateStencilOperation = new RenderStateStencilOperation();

//   public constructor(src?: RenderStateStencil) {
//     if (src) {
//       this.copyFrom(src);
//     }
//   }

//   public apply(gl: WebGLRenderingContext, previousStencil?: RenderStateStencil): void {
//     if (previousStencil === undefined || previousStencil.frontFunction !== this.frontFunction || previousStencil.frontRef !== this.frontRef || previousStencil.frontMask !== this.frontMask) {
//       gl.stencilFuncSeparate(GL.CullFace.Front, this.frontFunction, this.frontRef, this.frontMask);
//     }
//     if (previousStencil === undefined || previousStencil.backFunction !== this.backFunction || previousStencil.backRef !== this.backRef || previousStencil.backMask !== this.backMask) {
//       gl.stencilFuncSeparate(GL.CullFace.Back, this.backFunction, this.backRef, this.backMask);
//     }
//     if (previousStencil === undefined || !previousStencil.frontOperation.equals(this.frontOperation)) {
//       gl.stencilOpSeparate(GL.CullFace.Front, this.frontOperation.fail, this.frontOperation.zFail, this.frontOperation.zPass);
//     }
//     if (previousStencil === undefined || !previousStencil.backOperation.equals(this.backOperation)) {
//       gl.stencilOpSeparate(GL.CullFace.Back, this.backOperation.fail, this.backOperation.zFail, this.backOperation.zPass);
//     }
//   }

//   public copyFrom(src: RenderStateStencil): void {
//     this.frontFunction = src.frontFunction;
//     this.backFunction = src.backFunction;
//     this.frontRef = src.frontRef;
//     this.backRef = src.backRef;
//     this.frontMask = src.frontMask;
//     this.backMask = src.backMask;
//     this.frontOperation.copyFrom(src.frontOperation);
//     this.backOperation.copyFrom(src.backOperation);
//   }

//   public clone(result?: RenderStateStencil): RenderStateStencil {
//     if (!result) {
//       return new RenderStateStencil(this);
//     } else {
//       result.copyFrom(this);
//       return result;
//     }
//   }

//   public equals(rhs: RenderStateStencil): boolean {
//     return this.frontFunction === rhs.frontFunction
//         && this.backFunction === rhs.backFunction
//         && this.frontRef === rhs.frontRef
//         && this.backRef === rhs.backRef
//         && this.frontMask === rhs.frontMask
//         && this.backMask === rhs.backMask
//         && this.frontOperation.equals(rhs.frontOperation)
//         && this.backOperation.equals(rhs.backOperation);
//   }
// }

/** Encapsulates the state of an OpenGL context.
 * to modify the context for a rendering operation, do *not* directly call
 * functions like glDepthMask(), glBlendFunc(), etc - otherwise such calls may adversely
 * affect subsequent rendering operations.
 * Instead, set up a RenderState as desired and invoke Target::ApplyRenderState() or
 * System::ApplyRenderState().
 * The context tracks the most-recently applied RenderState, allowing it to minimize
 * the number of GL state changes actually invoked, improving performance.
 */
export class RenderState {
  public flags: RenderStateFlags = new RenderStateFlags();
  public blend: RenderStateBlend = new RenderStateBlend();
  // public stencil: RenderStateStencil = new RenderStateStencil();
  public frontFace: GL.FrontFace = GL.FrontFace.Default;
  public cullFace: GL.CullFace = GL.CullFace.Default;
  public depthFunc: GL.DepthFunc = GL.DepthFunc.Default;
  public stencilMask: number = 0xFFFFFFFF;

  public constructor(src?: RenderState) {
    if (src) {
      this.copyFrom(src);
    }
  }

  public static defaults = new RenderState();

  public copyFrom(src: RenderState): void {
    this.flags.copyFrom(src.flags);
    this.blend.copyFrom(src.blend);
    // this.stencil.copyFrom(src.stencil);
    this.frontFace = src.frontFace;
    this.cullFace = src.cullFace;
    this.depthFunc = src.depthFunc;
    this.stencilMask = src.stencilMask;
  }

  public clone(result?: RenderState): RenderState {
    if (!result) {
      return new RenderState(this);
    } else {
      result.copyFrom(this);
      return result;
    }
  }

  public set clockwiseFrontFace(clockwise: boolean) {
    this.frontFace = clockwise ? GL.FrontFace.Clockwise : GL.FrontFace.CounterClockwise;
  }

  public equals(rhs: RenderState): boolean {
    return this.flags.equals(rhs.flags)
        && this.blend.equals(rhs.blend)
        // && this.stencil.equals(rhs.stencil)
        && this.frontFace === rhs.frontFace
        && this.cullFace === rhs.cullFace
        && this.depthFunc === rhs.depthFunc
        && this.stencilMask === rhs.stencilMask;
  }

  public apply(prevState: RenderState): void {
    this.flags.apply(prevState.flags);

    if (this.flags.blend) {
      if (prevState.flags.blend)
        this.blend.apply(prevState.blend);
      else
        this.blend.apply();
    }

    if (this.flags.cull) {
      if (!prevState.flags.cull || prevState.cullFace !== this.cullFace) {
        System.instance.context.cullFace(this.cullFace);
      }
    }

    if (this.flags.depthTest) {
      if (!prevState.flags.depthTest || prevState.depthFunc !== this.depthFunc) {
        System.instance.context.depthFunc(this.depthFunc);
      }
    }

    /* Stenciling commented out for now since it is not used */
    // if (this.flags.stencilTest) {
    //   if (prevState.flags.stencilTest)
    //     this.stencil.apply(gl, prevState.stencil);
    //   else
    //     this.stencil.apply(gl);
    // }

    if (this.frontFace !== prevState.frontFace) {
      System.instance.context.frontFace(this.frontFace);
    }

    if (this.stencilMask !== prevState.stencilMask) {
      System.instance.context.stencilMask(this.stencilMask);
    }
  }
}

Object.freeze(RenderState.defaults);
