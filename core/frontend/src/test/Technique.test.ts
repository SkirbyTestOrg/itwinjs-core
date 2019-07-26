/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { expect, assert } from "chai";
import { IModelApp } from "../IModelApp";
import { ClippingType } from "../render/System";
import {
  ProgramBuilder,
  VertexShaderComponent,
  FragmentShaderComponent,
  Target,
  System,
  TechniqueId,
  TechniqueFlags,
  FeatureMode,
  SingularTechnique,
  ViewportQuadGeometry,
  DrawParams,
  ShaderProgramParams,
  AttributeMap,
} from "../webgl";

function createPurpleQuadTechnique(target: Target): TechniqueId {
  const builder = new ProgramBuilder(AttributeMap.findAttributeMap(undefined, false));
  builder.vert.set(VertexShaderComponent.ComputePosition, "return rawPos;");
  builder.frag.set(FragmentShaderComponent.ComputeBaseColor, "return vec4(1.0, 0.0, 0.5, 1.0);");
  builder.frag.set(FragmentShaderComponent.AssignFragData, "FragColor = baseColor;");

  const prog = builder.buildProgram(System.instance.context);
  const technique = new SingularTechnique(prog);
  return target.techniques.addDynamicTechnique(technique, "PurpleQuad");
}

function createTarget(): Target | undefined {
  let canvas = document.getElementById("WebGLTestCanvas") as HTMLCanvasElement;
  if (null === canvas) {
    canvas = document.createElement("canvas") as HTMLCanvasElement;
    if (null !== canvas) {
      canvas.id = "WebGLTestCanvas";
      document.body.appendChild(document.createTextNode("WebGL tests"));
      document.body.appendChild(canvas);
    }
  }
  canvas.width = 300;
  canvas.height = 150;
  assert(undefined !== canvas);
  return System.instance!.createTarget(canvas!) as Target;
}

describe("Technique tests", () => {
  before(() => IModelApp.startup());
  after(() => IModelApp.shutdown());

  it("should produce a simple dynamic rendering technique", () => {
    const target = createTarget();
    assert(undefined !== target);

    const techId = createPurpleQuadTechnique(target!);
    expect(techId).to.equal(TechniqueId.NumBuiltIn);
  });

  it("should render a purple quad", () => {
    const target = createTarget();
    assert(undefined !== target);
    if (undefined === target) {
      return;
    }

    const techId = createPurpleQuadTechnique(target);
    const geom = ViewportQuadGeometry.create(techId);
    assert.isDefined(geom);

    const progParams = new ShaderProgramParams();
    progParams.init(target);
    const drawParams = new DrawParams();
    drawParams.init(progParams, geom!);
    target.techniques.draw(drawParams);
  });

  it("should compile material atlas program", () => {
    const flags = new TechniqueFlags();
    flags.setHasMaterialAtlas(true);
    const tech = System.instance.techniques.getTechnique(TechniqueId.Surface);
    const prog = tech.getShader(flags);
    expect(prog.compile()).to.be.true;
  });

  // NB: this can potentially take a long time, especially on our mac build machines.
  it("should successfully compile all shader programs", () => {
    if (IModelApp.initialized) {
      expect(System.instance.techniques.compileShaders()).to.be.true;
    }
  }).timeout("80000");

  it("should successfully compile surface shader with clipping planes", () => {
    const flags = new TechniqueFlags(true);
    flags.clip.type = ClippingType.Planes;
    flags.clip.numberOfPlanes = 6;
    flags.featureMode = FeatureMode.Overrides;

    const tech = System.instance.techniques.getTechnique(TechniqueId.Surface);
    const prog = tech.getShader(flags);
    expect(prog.compile()).to.be.true;
  });

  it("should successfully compile animation shaders", () => {
    const flags = new TechniqueFlags();
    flags.setAnimated(true);
    let tech = System.instance.techniques.getTechnique(TechniqueId.Edge);
    let prog = tech.getShader(flags);
    expect(prog.compile()).to.be.true;

    tech = System.instance.techniques.getTechnique(TechniqueId.Surface);
    prog = tech.getShader(flags);
    expect(prog.compile()).to.be.true;

    flags.isTranslucent = true;
    flags.featureMode = FeatureMode.Overrides;
    prog = tech.getShader(flags);
    expect(prog.compile()).to.be.true;

    flags.clip.type = ClippingType.Planes;
    flags.clip.numberOfPlanes = 6;
    prog = tech.getShader(flags);
    expect(prog.compile()).to.be.true;
  });
});
