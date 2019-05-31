/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module WebGL */
import { VariableType, ProgramBuilder, FragmentShaderComponent } from "../ShaderBuilder";
import { assert } from "@bentley/bentleyjs-core";
import { TextureUnit } from "../RenderFlags";
import { addUInt32s } from "./Common";
import { addModelMatrix } from "./Vertex";

const applyPlanarClassificationColor = `
  vec4 colorTexel = TEXTURE(s_pClassSampler, vec2(v_pClassPos.x, v_pClassPos.y / 2.0));
  if (colorTexel.a < .5) {
    if (s_pClassColorParams.y == 0.0)
      return vec4(0);                          // Unclassifed, Off.
   else if (s_pClassColorParams.y == 1.0)
      return baseColor;                        // Unclassified, On.
    else
      return baseColor * .6;                   // Unclassified, Dimmed.
   } else {
     if (s_pClassColorParams.x == 0.0)
       return vec4(0);                        // Classified, off.
       else if (s_pClassColorParams.x == 1.0)
       return baseColor;
      else if (s_pClassColorParams.x == 2.0)
        return baseColor * .6;                // Classified, dimmed.
      else if (s_pClassColorParams.x == 3.0)
        return baseColor * vec4(.8, .8, 1.0, 1.0);  // Classified, hilite.  TBD - make color configurable.
      else
        return baseColor * colorTexel;
    // TBD -- mode 1.  Return baseColor unless flash or hilite
   }
`;

const overrideFeatureId = `
  vec4 featureTexel = TEXTURE(s_pClassSampler, vec2(v_pClassPos.x, (1.0 + v_pClassPos.y) / 2.0));
  return (featureTexel == vec4(0)) ? currentId : addUInt32s(u_batchBase, featureTexel * 255.0) / 255.0;
  `;

const computeClassifiedSurfaceHiliteColor = `
  vec4 hiliteTexel = TEXTURE(s_pClassHiliteSampler, v_pClassPos.xy);
  if (hiliteTexel.a > 0.5 && isSurfaceBitSet(kSurfaceBit_HasTexture))
    return vec4(TEXTURE(s_texture, v_texCoord).a > 0.15 ? 1.0 : 0.0);
  else
  return vec4(hiliteTexel.a > 0.5 ? 1.0 : 0.0);
`;

const computeClassifiedSurfaceHiliteColorNoTexture = `
  vec4 hiliteTexel = TEXTURE(s_pClassHiliteSampler, v_pClassPos.xy);
  return vec4(hiliteTexel.a > 0.5 ? 1.0 : 0.0);
`;

const computeClassifierPos = "vec4 proj = u_pClassProj * MAT_MODEL * rawPosition; v_pClassPos = proj.xyz/proj.w;";
const scratchBytes = new Uint8Array(4);
const scratchBatchBaseId = new Uint32Array(scratchBytes.buffer);
const scratchBatchBaseComponents = [0, 0, 0, 0];
const scratchColorParams = new Float32Array(2);      // Unclassified scale, classified base scale, classified classifier scale.

function addPlanarClassifierCommon(builder: ProgramBuilder) {
  const vert = builder.vert;
  vert.addUniform("u_pClassProj", VariableType.Mat4, (prog) => {
    prog.addGraphicUniform("u_pClassProj", (uniform, params) => {
      const classifier = params.target.planarClassifiers.classifier!;
      assert(undefined !== classifier);
      uniform.setMatrix4(classifier.projectionMatrix);
    });
  });

  addModelMatrix(vert);
  builder.addInlineComputedVarying("v_pClassPos", VariableType.Vec3, computeClassifierPos);
}

/** @internal */
export function addColorPlanarClassifier(builder: ProgramBuilder) {
  addPlanarClassifierCommon(builder);
  const frag = builder.frag;
  const vert = builder.vert;

  frag.addUniform("s_pClassSampler", VariableType.Sampler2D, (prog) => {
    prog.addGraphicUniform("s_pClassSampler", (uniform, params) => {
      const classifier = params.target.planarClassifiers.classifier!;
      assert(undefined !== classifier && undefined !== classifier.combinedTexture);
      classifier.combinedTexture!.texture.bindSampler(uniform, TextureUnit.PlanarClassification);
    });
  });
  frag.addUniform("s_pClassColorParams", VariableType.Vec2, (prog) => {
    prog.addGraphicUniform("s_pClassColorParams", (uniform, params) => {
      const classifier = params.target.planarClassifiers.classifier!;
      assert(undefined !== classifier);
      scratchColorParams[0] = classifier.insideDisplay;
      scratchColorParams[1] = classifier.outsideDisplay;
      uniform.setUniform2fv(scratchColorParams);
    });
  });

  vert.addUniform("u_pClassProj", VariableType.Mat4, (prog) => {
    prog.addGraphicUniform("u_pClassProj", (uniform, params) => {
      const classifier = params.target.planarClassifiers.classifier!;
      assert(undefined !== classifier);
      uniform.setMatrix4(classifier.projectionMatrix);
    });
  });

  addModelMatrix(vert);
  frag.set(FragmentShaderComponent.ApplyPlanarClassifier, applyPlanarClassificationColor);
}

/** @internal */
export function addFeaturePlanarClassifier(builder: ProgramBuilder) {
  const frag = builder.frag;
  frag.addUniform("u_batchBase", VariableType.Vec4, (prog) => {     // TBD.  Instancing.
    prog.addGraphicUniform("u_batchBase", (uniform, params) => {
      const classifier = params.target.planarClassifiers.classifier!;
      assert(undefined !== classifier);
      scratchBatchBaseId[0] = classifier.baseBatchId;
      scratchBatchBaseComponents[0] = scratchBytes[0];
      scratchBatchBaseComponents[1] = scratchBytes[1];
      scratchBatchBaseComponents[2] = scratchBytes[2];
      scratchBatchBaseComponents[3] = scratchBytes[3];
      uniform.setUniform4fv(scratchBatchBaseComponents);
    });
  });
  frag.set(FragmentShaderComponent.OverrideFeatureId, overrideFeatureId);
  frag.addFunction(addUInt32s);
}

/** @internal */
export function addHilitePlanarClassifier(builder: ProgramBuilder, supportTextures = true) {
  const frag = builder.frag;
  frag.addUniform("s_pClassHiliteSampler", VariableType.Sampler2D, (prog) => {
    prog.addGraphicUniform("s_pClassHiliteSampler", (uniform, params) => {
      const classifier = params.target.planarClassifiers.classifier!;
      assert(undefined !== classifier && undefined !== classifier.hiliteTexture);
      classifier.hiliteTexture!.texture.bindSampler(uniform, TextureUnit.PlanarClassificationHilite);
    });
  });

  frag.set(FragmentShaderComponent.ComputeBaseColor, supportTextures ? computeClassifiedSurfaceHiliteColor : computeClassifiedSurfaceHiliteColorNoTexture);
}
