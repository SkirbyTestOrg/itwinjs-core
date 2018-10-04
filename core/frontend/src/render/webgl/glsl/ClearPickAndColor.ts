/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module WebGL */

import { createViewportQuadBuilder } from "./ViewportQuad";
import { VariableType, FragmentShaderComponent } from "../ShaderBuilder";
import { ShaderProgram } from "../ShaderProgram";
import { FloatRgba } from "../FloatRGBA";
import { System } from "../System";

const computeBaseColor = "return u_bgColor;";

const assignFragData = `
  FragColor0 = baseColor;
  FragColor1 = vec4(0.0);
  FragColor2 = vec4(0.0);
  FragColor3 = vec4(0.0);
`;

export function createClearPickAndColorProgram(context: WebGLRenderingContext): ShaderProgram {
  const builder = createViewportQuadBuilder(false);
  const frag = builder.frag;
  frag.addUniform("u_bgColor", VariableType.Vec4, (prog) => {
    prog.addProgramUniform("u_bgColor", (uniform, params) => {
      const bgColor = FloatRgba.fromColorDef(params.target.bgColor);
      bgColor.bind(uniform);
    });
  });

  frag.set(FragmentShaderComponent.ComputeBaseColor, computeBaseColor);

  if (!System.instance.capabilities.supportsMRTPickShaders) {
    // NB: This shader is never used - we gl.clear() directly
    frag.set(FragmentShaderComponent.AssignFragData, "FragColor = baseColor;");
  } else {
    frag.addDrawBuffersExtension();
    frag.set(FragmentShaderComponent.AssignFragData, assignFragData);
  }

  return builder.buildProgram(context);
}
