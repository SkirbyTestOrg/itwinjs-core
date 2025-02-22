/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

// portions adapted from Cesium.js Copyright 2011 - 2017 Cesium Contributors

import { WebGLContext } from "@itwin/webgl-compatibility";
import { AmbientOcclusionGeometry } from "../CachedGeometry";
import { TextureUnit } from "../RenderFlags";
import { FragmentShaderComponent, VariablePrecision, VariableType } from "../ShaderBuilder";
import { ShaderProgram } from "../ShaderProgram";
import { System } from "../System";
import { Texture2DHandle } from "../Texture";
import { addFrustum } from "./Common";
import { decodeDepthRgb } from "./Decode";
import { addRenderOrderConstants, readDepthAndOrder } from "./FeatureSymbology";
import { addWindowToTexCoords, assignFragColor } from "./Fragment";
import { addViewport } from "./Viewport";
import { createViewportQuadBuilder } from "./ViewportQuad";

// 'PB' indicates a shader variation when only the pickbuffer is available
// 'DB' indicates a shader variation when the real floating point depth buffer is available.

const computeAmbientOcclusionPrefixPB = `
vec2 tc = windowCoordsToTexCoords(gl_FragCoord.xy);
vec2 depthAndOrder = readDepthAndOrder(tc);
float db = depthAndOrder.y;
`;

const computeAmbientOcclusionPrefixDB = `
vec2 tc = windowCoordsToTexCoords(gl_FragCoord.xy);
vec2 depthAndOrder = readDepthAndOrder(tc);
float db = readDepth(tc);
`;

// This outputs 1 for unlit surfaces, and for polylines and point strings.
// Otherwise it computes ambient occlusion based on normal reconstructed from pick depth.
// NB: This shader code actually begins with a `computeAmbientOcclusionPrefix` variation as shown above.
const computeAmbientOcclusion = `
  depthAndOrder.y = unfinalizeLinearDepth(db);
  float order = depthAndOrder.x;
  if (order >= kRenderOrder_PlanarBit)
    order = order - kRenderOrder_PlanarBit;

  if (order < kRenderOrder_LitSurface || order == kRenderOrder_Linear)
    return vec4(1.0);

  // NB: linearDepth: 1 == near, 0 == far

  float linearDepth = depthAndOrder.y;
  float nonLinearDepth = computeNonLinearDepth(db);
  if (nonLinearDepth > u_maxDistance)
    return vec4(1.0);

  vec3 viewPos = computePositionFromDepth(tc, nonLinearDepth).xyz;

  vec2 pixelSize = 1.0 / u_viewport;
  vec3 viewNormal = computeNormalFromDepth(viewPos, tc, pixelSize);

  vec2 sampleDirection = vec2(1.0, 0.0);
  float gapAngle = 90.0 * 0.017453292519943295; // radians per degree

  // Grab some random noise
  // Multiply screen UV (range 0..1) with size of viewport divided by 4 in order to tile the 4x4 noise texture across the screen.
  // Multiply the random 0..1 vec3 by 2 and then substract 1.  This puts the components of the vec3 in the range -1..1.
  vec3 noiseVec = (TEXTURE(u_noise, tc * vec2(u_viewport.x / 4.0, u_viewport.y / 4.0)).rgb + 1.0) / 2.0;

  float bias = u_hbaoSettings.x; // Represents an angle in radians. If the dot product between the normal of the sample and the vector to the camera is less than this value, sampling stops in the current direction. This is used to remove shadows from near planar edges.
  float zLengthCap = u_hbaoSettings.y; // If the distance in linear Z from the current sample to first sample is greater than this value, sampling stops in the current direction.
  float intensity = u_hbaoSettings.z; // Raise the final occlusion to the power of this value.  Larger values make the ambient shadows darker.
  float texelStepSize = clamp(u_hbaoSettings.w * linearDepth, 1.0, u_hbaoSettings.w); // Indicates the distance to step toward the next texel sample in the current direction.

  float tOcclusion = 0.0;

  // loop for each direction
  for (int i = 0; i < 4; i++) {
    float newGapAngle = gapAngle * (float(i) + noiseVec.x);
    float cosVal = cos(newGapAngle);
    float sinVal = sin(newGapAngle);

    // rotate sampling direction
    vec2 rotatedSampleDirection = vec2(cosVal * sampleDirection.x - sinVal * sampleDirection.y, sinVal * sampleDirection.x + cosVal * sampleDirection.y);
    float curOcclusion = 0.0;
    float curStepSize = texelStepSize; // 1.0 = stepsize, StepSize should be specified by uniform - what are good values?

    // loop for each step
    for (int j = 0; j < 6; j++) {
      vec2 directionWithStep = vec2(rotatedSampleDirection.x * curStepSize * pixelSize.x, rotatedSampleDirection.y * curStepSize * pixelSize.y);
      vec2 newCoords = directionWithStep + tc;

      // do not repeat around the depth texture
      if(newCoords.x > 1.0 || newCoords.y > 1.0 || newCoords.x < 0.0 || newCoords.y < 0.0) {
          break;
      }

      db = readDepth(newCoords);
      float curLinearDepth = unfinalizeLinearDepth(db);
      float curNonLinearDepth = computeNonLinearDepth(db);
      vec3 curViewPos = computePositionFromDepth(newCoords, curNonLinearDepth).xyz;
      vec3 diffVec = curViewPos.xyz - viewPos.xyz;
      float zLength = abs(curLinearDepth - linearDepth);

      float dotVal = clamp(dot(viewNormal, normalize(diffVec)), 0.0, 1.0);
      float weight = smoothstep(0.0, 1.0, zLengthCap / zLength);

      if (dotVal < bias) {
          dotVal = 0.0;
      }

      curOcclusion = max(curOcclusion, dotVal * weight);
      curStepSize += texelStepSize;
    }
    tOcclusion += curOcclusion;
  }

  float distanceFadeFactor = kFrustumType_Perspective == u_frustum.z ? 1.0 - pow(clamp(nonLinearDepth / u_maxDistance, 0.0, 1.0), 4.0) : 1.0;
  tOcclusion *= distanceFadeFactor;

  tOcclusion /= 4.0;
  tOcclusion = 1.0 - clamp(tOcclusion, 0.0, 1.0);
  tOcclusion = pow(tOcclusion, intensity);

  return vec4(tOcclusion, tOcclusion, tOcclusion, 1.0);
`;

const computePositionFromDepth = `
vec4 computePositionFromDepth(vec2 tc, float nonLinearDepth) {
  if (kFrustumType_Perspective == u_frustum.z) {
    vec2 xy = vec2((tc.x * 2.0 - 1.0), ((1.0 - tc.y) * 2.0 - 1.0));
    vec4 posEC = u_invProj * vec4(xy, nonLinearDepth, 1.0);
    posEC = posEC / posEC.w;
    return posEC;
  } else {
    float top = u_frustumPlanes.x;
    float bottom = u_frustumPlanes.y;
    float left = u_frustumPlanes.z;
    float right = u_frustumPlanes.w;
    return vec4(mix(left, right, tc.x), mix(bottom, top, tc.y), nonLinearDepth, 1.0);
  }
}
`;

const computeNormalFromDepth = `
vec3 computeNormalFromDepth(vec3 viewPos, vec2 tc, vec2 pixelSize) {
  float nonLinearDepthU = computeNonLinearDepth(readDepth(tc - vec2(0.0, pixelSize.y)));
  float nonLinearDepthD = computeNonLinearDepth(readDepth(tc + vec2(0.0, pixelSize.y)));
  float nonLinearDepthL = computeNonLinearDepth(readDepth(tc - vec2(pixelSize.x, 0.0)));
  float nonLinearDepthR = computeNonLinearDepth(readDepth(tc + vec2(pixelSize.x, 0.0)));

  vec3 viewPosUp = computePositionFromDepth(tc - vec2(0.0, pixelSize.y), nonLinearDepthU).xyz;
  vec3 viewPosDown = computePositionFromDepth(tc + vec2(0.0, pixelSize.y), nonLinearDepthD).xyz;
  vec3 viewPosLeft = computePositionFromDepth(tc - vec2(pixelSize.x, 0.0), nonLinearDepthL).xyz;
  vec3 viewPosRight = computePositionFromDepth(tc + vec2(pixelSize.x, 0.0), nonLinearDepthR).xyz;

  vec3 up = viewPos.xyz - viewPosUp.xyz;
  vec3 down = viewPosDown.xyz - viewPos.xyz;
  vec3 left = viewPos.xyz - viewPosLeft.xyz;
  vec3 right = viewPosRight.xyz - viewPos.xyz;

  vec3 dx = length(left) < length(right) ? left : right;
  vec3 dy = length(up) < length(down) ? up : down;

  return normalize(cross(dy, dx));
}
`;

const computeNonLinearDepthPB = `
float computeNonLinearDepth(float linearDepth) {
  return mix(u_frustum.y, u_frustum.x, linearDepth);
}
`;
const computeNonLinearDepthDB = `
float computeNonLinearDepth(float depth) {
  return 0.0 == u_logZ.x ? depth * u_logZ.y : exp(depth * u_logZ.y) / u_logZ.x;
}
`;

const readDepthPB = `
float readDepth(vec2 tc) {
  return readDepthAndOrder(tc).y;
}
`;
const readDepthDB = `
float readDepth(vec2 tc) {
  return TEXTURE(u_depthBuffer, tc).r;
}
`;
const unfinalizeLinearDepthDB = `
  float unfinalizeLinearDepth(float depth) {
    float eyeZ = 0.0 == u_logZ.x ? depth * u_logZ.y : exp(depth * u_logZ.y) / u_logZ.x;
    float near = u_frustum.x, far = u_frustum.y;
    float depthRange = far - near;
    float linearDepth = (eyeZ - near) / depthRange;
    return 1.0 - linearDepth;
  }
`;

function _shouldUseDB() {
  return System.instance.supportsLogZBuffer && System.instance.capabilities.supportsTextureFloat;
}

/** @internal */
export function createAmbientOcclusionProgram(context: WebGLContext): ShaderProgram {
  const builder = createViewportQuadBuilder(true);
  const frag = builder.frag;
  const shouldUseDB = _shouldUseDB();

  addWindowToTexCoords(frag);
  frag.addFunction(decodeDepthRgb);
  frag.addFunction(readDepthAndOrder);

  if (shouldUseDB) {
    frag.addFunction(unfinalizeLinearDepthDB);
    frag.addFunction(computeNonLinearDepthDB);
    frag.addFunction(readDepthDB);
  } else {
    frag.addDefine("unfinalizeLinearDepth", "");
    frag.addFunction(computeNonLinearDepthPB);
    frag.addFunction(readDepthPB);
  }

  frag.addFunction(computePositionFromDepth);
  frag.addFunction(computeNormalFromDepth);
  addRenderOrderConstants(frag);

  if (shouldUseDB)
    frag.addUniform("u_logZ", VariableType.Vec2, (prog) => {
      prog.addProgramUniform("u_logZ", (uniform, params) => {
        uniform.setUniform2fv(params.target.uniforms.frustum.logZ);
      });
    });

  frag.set(FragmentShaderComponent.ComputeBaseColor, shouldUseDB ?
    computeAmbientOcclusionPrefixDB + computeAmbientOcclusion :
    computeAmbientOcclusionPrefixPB + computeAmbientOcclusion);
  frag.set(FragmentShaderComponent.AssignFragData, assignFragColor);

  frag.addUniform("u_pickDepthAndOrder", VariableType.Sampler2D, (prog) => {
    prog.addGraphicUniform("u_pickDepthAndOrder", (uniform, params) => {
      const geom = params.geometry as AmbientOcclusionGeometry;
      Texture2DHandle.bindSampler(uniform, geom.depthAndOrder, TextureUnit.Zero);
    });
  });

  if (shouldUseDB)
    frag.addUniform("u_depthBuffer", VariableType.Sampler2D, (prog) => {
      prog.addGraphicUniform("u_depthBuffer", (uniform, params) => {
        const geom = params.geometry as AmbientOcclusionGeometry;
        Texture2DHandle.bindSampler(uniform, geom.depth, TextureUnit.Two);
      });
    });

  frag.addUniform("u_noise", VariableType.Sampler2D, (prog) => {
    prog.addGraphicUniform("u_noise", (uniform, params) => {
      const geom = params.geometry as AmbientOcclusionGeometry;
      Texture2DHandle.bindSampler(uniform, geom.noise, TextureUnit.One);
    });
  });

  addFrustum(builder);
  addViewport(frag);

  frag.addUniform("u_invProj", VariableType.Mat4, (prog) => {
    prog.addProgramUniform("u_invProj", (uniform, params) => {
      const invProj = params.projectionMatrix.clone();
      invProj.invert();
      uniform.setMatrix4(invProj);
    });
  });

  frag.addUniform("u_frustumPlanes", VariableType.Vec4, (prog) => {
    prog.addProgramUniform("u_frustumPlanes", (uniform, params) => {
      uniform.setUniform4fv(params.target.uniforms.frustum.planes);
    });
  });

  frag.addUniform("u_hbaoSettings", VariableType.Vec4, (prog) => {
    prog.addProgramUniform("u_hbaoSettings", (uniform, params) => {
      const hbaoSettings = new Float32Array([
        params.target.ambientOcclusionSettings.bias,
        params.target.ambientOcclusionSettings.zLengthCap,
        params.target.ambientOcclusionSettings.intensity,
        params.target.ambientOcclusionSettings.texelStepSize]);
      uniform.setUniform4fv(hbaoSettings);
    });
  }, VariablePrecision.High);

  frag.addUniform("u_maxDistance", VariableType.Float, (prog) => {
    prog.addProgramUniform("u_maxDistance", (uniform, params) => {
      uniform.setUniform1f(params.target.ambientOcclusionSettings.maxDistance);
    });
  }, VariablePrecision.High);

  builder.vert.headerComment = "//!V! AmbientOcclusion";
  builder.frag.headerComment = "//!F! AmbientOcclusion";

  return builder.buildProgram(context);
}
