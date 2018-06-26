/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module WebGL */

import { TextureUnit } from "../RenderFlags";
import { VariableType, FragmentShaderComponent } from "../ShaderBuilder";
import { ShaderProgram } from "../ShaderProgram";
import { SingleTexturedViewportQuadGeometry } from "../CachedGeometry";
import { TextureHandle } from "../Texture";
import { GLSLFragment } from "./Fragment";
import { createViewportQuadBuilder } from "./ViewportQuad";

const computeColor = `return TEXTURE(u_color, v_texCoord);`;

const computeColorNoAlpha = `return vec4(TEXTURE(u_color, v_texCoord).rgb, 1.0);`;

export function createCopyColorProgram(context: WebGLRenderingContext, copyAlpha: boolean = true): ShaderProgram {
  const builder = createViewportQuadBuilder(true);
  const frag = builder.frag;

  frag.set(FragmentShaderComponent.ComputeBaseColor, copyAlpha ? computeColor : computeColorNoAlpha);
  frag.set(FragmentShaderComponent.AssignFragData, GLSLFragment.assignFragColor);
  frag.addUniform("u_color", VariableType.Sampler2D, (prog) => {
    prog.addGraphicUniform("u_color", (uniform, params) => {
      const geom = params.geometry as SingleTexturedViewportQuadGeometry;
      TextureHandle.bindSampler(uniform, geom.texture, TextureUnit.Zero);
    });
  });

  return builder.buildProgram(context);
}
