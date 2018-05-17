/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/

import { assert, using, IDisposable } from "@bentley/bentleyjs-core";
import { ShaderProgram, ShaderProgramExecutor } from "./ShaderProgram";
import { TechniqueId } from "./TechniqueId";
import { TechniqueFlags, WithClipVolume, FeatureMode } from "./TechniqueFlags";
import { ProgramBuilder, VertexShaderComponent, FragmentShaderComponent, VariableType } from "./ShaderBuilder";
import { DrawParams, DrawCommands } from "./DrawCommand";
import { Target } from "./Target";
import { RenderPass, CompositeFlags } from "./RenderFlags";
import { createClearTranslucentProgram } from "./glsl/ClearTranslucent";
import { createClearPickAndColorProgram } from "./glsl/ClearPickAndColor";
import { createCopyColorProgram } from "./glsl/CopyColor";
import { createCopyPickBuffersProgram } from "./glsl/CopyPickBuffers";
import { createCompositeProgram } from "./glsl/Composite";
import { createClipMaskProgram } from "./glsl/ClipMask";
import { addTranslucency } from "./glsl/Translucency";
import { addMonochrome } from "./glsl/Monochrome";
import { createSurfaceBuilder, createSurfaceHiliter, addMaterial } from "./glsl/Surface";
import { createPointStringBuilder, createPointStringHiliter } from "./PointString";
import { addElementId, addFeatureSymbology, addRenderOrder, computeElementId, computeEyeSpace, FeatureSymbologyOptions } from "./glsl/FeatureSymbology";
import { GLSLFragment } from "./glsl/Fragment";
import { GLSLDecode } from "./glsl/Decode";
import { addFrustum } from "./glsl/Common";
import { addModelViewMatrix } from "./glsl/Vertex";
import { createPolylineBuilder, createPolylineHiliter } from "./glsl/Polyline";

// Defines a rendering technique implemented using one or more shader programs.
export interface Technique extends IDisposable {
  getShader(flags: TechniqueFlags): ShaderProgram;

  // Chiefly for tests - compiles all shader programs - more generally programs are compiled on demand.
  compileShaders(): boolean;
}

// A rendering technique implemented using a single shader program, typically for some specialized purpose.
export class SingularTechnique implements Technique {
  public readonly program: ShaderProgram;

  public constructor(program: ShaderProgram) { this.program = program; }

  public getShader(_flags: TechniqueFlags) { return this.program; }
  public compileShaders(): boolean { return this.program.compile(); }

  public dispose(): void { this.program.dispose(); }
}

function numFeatureVariants(numBaseShaders: number) { return numBaseShaders * 3; }
const numHiliteVariants = 1;
const clips = [WithClipVolume.No, WithClipVolume.Yes];
const featureModes = [FeatureMode.None, FeatureMode.Pick, FeatureMode.Overrides];
const scratchTechniqueFlags = new TechniqueFlags();

// A rendering technique implemented using multiple shader programs, selected based on TechniqueFlags.
export abstract class VariedTechnique implements Technique {
  private readonly _programs: ShaderProgram[] = [];

  public getShader(flags: TechniqueFlags): ShaderProgram { return this._programs[this.getShaderIndex(flags)]; }
  public compileShaders(): boolean {
    let allCompiled = true;
    for (const program of this._programs) {
      if (!program.compile()) allCompiled = false;
    }

    return allCompiled;
  }

  public dispose(): void {
    for (const program of this._programs) {
      program.dispose();
    }
  }

  protected constructor(numPrograms: number) {
    this._programs.length = numPrograms;
  }

  protected abstract computeShaderIndex(flags: TechniqueFlags): number;

  protected addShader(builder: ProgramBuilder, flags: TechniqueFlags, gl: WebGLRenderingContext): void { this.addProgram(flags, builder.buildProgram(gl)); }
  protected addProgram(flags: TechniqueFlags, program: ShaderProgram): void {
    const index = this.getShaderIndex(flags);
    assert(undefined === this._programs[index], "program already exists");
    this._programs[index] = program;
  }

  protected addHiliteShader(clip: WithClipVolume, gl: WebGLRenderingContext, create: (clip: WithClipVolume) => ProgramBuilder): void {
    const builder = create(clip);
    scratchTechniqueFlags.initForHilite(clip);
    this.addShader(builder, scratchTechniqueFlags, gl);
  }

  protected addTranslucentShader(builder: ProgramBuilder, flags: TechniqueFlags, gl: WebGLRenderingContext): void {
    flags.isTranslucent = true;
    addTranslucency(builder.frag);
    this.addShader(builder, flags, gl);
  }

  protected addElementId(builder: ProgramBuilder, feat: FeatureMode) {
    const frag = builder.frag;
    if (FeatureMode.None === feat)
      frag.set(FragmentShaderComponent.AssignFragData, GLSLFragment.assignFragColor);
    else {
      const vert = builder.vert;
      vert.set(VertexShaderComponent.AddComputeElementId, computeElementId);
      addFrustum(builder);
      builder.addInlineComputedVarying("v_eyeSpace", VariableType.Vec3, computeEyeSpace);
      addModelViewMatrix(vert);
      addRenderOrder(frag);
      addElementId(builder);
      frag.addExtension("GL_EXT_draw_buffers");
      frag.addFunction(GLSLDecode.encodeDepthRgb);
      frag.addFunction(GLSLFragment.computeLinearDepth);
      frag.set(FragmentShaderComponent.AssignFragData, GLSLFragment.assignFragData);
    }
  }

  private getShaderIndex(flags: TechniqueFlags) {
    assert(!flags.isHilite || (!flags.isTranslucent && flags.hasFeatures), "invalid technique flags");
    const index = this.computeShaderIndex(flags);
    assert(index < this._programs.length, "shader index out of bounds");
    return index;
  }
}

class SurfaceTechnique extends VariedTechnique {
  private static readonly kOpaque = 0;
  private static readonly kTranslucent = 1;
  private static readonly kFeature = 2;
  private static readonly kHilite = numFeatureVariants(SurfaceTechnique.kFeature);
  private static readonly kClip = SurfaceTechnique.kHilite + 1;

  public constructor(gl: WebGLRenderingContext) {
    super((numFeatureVariants(2) + numHiliteVariants) * 2);

    const flags = scratchTechniqueFlags;
    for (const clip of clips) {
      this.addHiliteShader(clip, gl, createSurfaceHiliter);
      for (const featureMode of featureModes) {
        flags.reset(featureMode, clip);
        const builder = createSurfaceBuilder(featureMode, clip);
        addMonochrome(builder.frag);
        addMaterial(builder.frag);

        this.addShader(builder, flags, gl);
        this.addTranslucentShader(builder, flags, gl);
      }
    }
  }

  public computeShaderIndex(flags: TechniqueFlags): number {
    if (flags.isHilite) {
      assert(flags.hasFeatures);
      let hIndex = SurfaceTechnique.kHilite;
      if (flags.hasClipVolume) {
        hIndex += SurfaceTechnique.kClip;
      }
      return hIndex;
    }

    let index = flags.isTranslucent ? SurfaceTechnique.kTranslucent : SurfaceTechnique.kOpaque;
    index += SurfaceTechnique.kFeature * flags.featureMode;
    if (flags.hasClipVolume) {
      index += SurfaceTechnique.kClip;
    }

    return index;
  }
}

export class PolylineTechnique extends VariedTechnique {
  private static readonly kOpaque = 0;
  private static readonly kTranslucent = 1;
  private static readonly kFeature = 2;
  private static readonly kHilite = numFeatureVariants(PolylineTechnique.kFeature);
  private static readonly kClip = PolylineTechnique.kHilite + 1;

  public constructor(gl: WebGLRenderingContext) {
    super((numFeatureVariants(2) + numHiliteVariants) * 2);

    const flags = scratchTechniqueFlags;
    for (const clip of clips) {
      this.addHiliteShader(clip, gl, createPolylineHiliter);
      for (const featureMode of featureModes) {
        flags.reset(featureMode, clip);
        const builder = createPolylineBuilder(clip);
        addMonochrome(builder.frag);
        addMaterial(builder.frag);

        // The translucent shaders do not need the element IDs.
        const builderTrans = createPolylineBuilder(clip);
        addMonochrome(builderTrans.frag);
        if (FeatureMode.Overrides === featureMode) {
          addFeatureSymbology(builderTrans, featureMode, FeatureSymbologyOptions.Point);
          addFeatureSymbology(builder, featureMode, FeatureSymbologyOptions.Point);
          this.addTranslucentShader(builderTrans, flags, gl);
        } else {
          this.addTranslucentShader(builderTrans, flags, gl);
          addFeatureSymbology(builder, featureMode, FeatureSymbologyOptions.None);
        }
        this.addElementId(builder, featureMode);
        this.addShader(builder, flags, gl);
      }
    }
  }

  public computeShaderIndex(flags: TechniqueFlags): number {
    if (flags.isHilite) {
      assert(flags.hasFeatures);
      let hIndex = PolylineTechnique.kHilite;
      if (flags.hasClipVolume) {
        hIndex += PolylineTechnique.kClip;
      }
      return hIndex;
    }

    let index = flags.isTranslucent ? PolylineTechnique.kTranslucent : PolylineTechnique.kOpaque;
    index += PolylineTechnique.kFeature * flags.featureMode;
    if (flags.hasClipVolume) {
      index += PolylineTechnique.kClip;
    }

    return index;
  }
}

export class PointStringTechnique extends VariedTechnique { // ###TODO - shouldn't need to export
  private static readonly kOpaque = 0;
  private static readonly kTranslucent = 1;
  private static readonly kFeature = 2;
  private static readonly kHilite = numFeatureVariants(PointStringTechnique.kFeature);
  private static readonly kClip = PointStringTechnique.kHilite + 1;

  public constructor(gl: WebGLRenderingContext) {
    super((numFeatureVariants(2) + numHiliteVariants) * 2);

    const flags = scratchTechniqueFlags;
    for (const clip of clips) {
      this.addHiliteShader(clip, gl, createPointStringHiliter);
      for (const featureMode of featureModes) {
        flags.reset(featureMode, clip);
        const builder = createPointStringBuilder(clip);
        addMonochrome(builder.frag);

        // The translucent shaders do not need the element IDs.
        const builderTrans = createPointStringBuilder(clip);
        addMonochrome(builderTrans.frag);
        if (FeatureMode.Overrides === featureMode) {
          addFeatureSymbology(builderTrans, featureMode, FeatureSymbologyOptions.Point);
          addFeatureSymbology(builder, featureMode, FeatureSymbologyOptions.Point);
          this.addTranslucentShader(builderTrans, flags, gl);
        } else {
          this.addTranslucentShader(builderTrans, flags, gl);
          addFeatureSymbology(builder, featureMode, FeatureSymbologyOptions.None);
        }
        this.addElementId(builder, featureMode);
        this.addShader(builder, flags, gl);
      }
    }
  }

  public computeShaderIndex(flags: TechniqueFlags): number {
    if (flags.isHilite) {
      assert(flags.hasFeatures);
      let hIndex = PointStringTechnique.kHilite;
      if (flags.hasClipVolume) {
        hIndex += PointStringTechnique.kClip;
      }
      return hIndex;
    }

    let index = flags.isTranslucent ? PointStringTechnique.kTranslucent : PointStringTechnique.kOpaque;
    index += PointStringTechnique.kFeature * flags.featureMode;
    if (flags.hasClipVolume) {
      index += PointStringTechnique.kClip;
    }

    return index;
  }
}

// A placeholder for techniques which have not yet been implemented.
class DummyTechnique extends VariedTechnique {
  public constructor(gl: WebGLRenderingContext) {
    super(2);

    const builder = new ProgramBuilder(false);
    builder.vert.set(VertexShaderComponent.ComputePosition, "return vec4(0.0);");
    builder.frag.set(FragmentShaderComponent.ComputeBaseColor, "return vec4(1.0);");
    builder.frag.set(FragmentShaderComponent.AssignFragData, "FragColor = baseColor;");

    const prog = builder.buildProgram(gl);
    const flags = new TechniqueFlags();
    this.addProgram(flags, prog);
    flags.isTranslucent = true;
    this.addProgram(flags, prog);
  }

  protected computeShaderIndex(flags: TechniqueFlags): number { return flags.isTranslucent ? 0 : 1; }
}

// A collection of rendering techniques accessed by ID.
export class Techniques implements IDisposable {
  private readonly _list = new Array<Technique>(); // indexed by TechniqueId, which may exceed TechniqueId.NumBuiltIn for dynamic techniques.
  private readonly _dynamicTechniqueIds = new Array<string>(); // technique ID = (index in this array) + TechniqueId.NumBuiltIn

  public static create(gl: WebGLRenderingContext) {
    const techs = new Techniques();
    return techs.initializeBuiltIns(gl) ? techs : undefined;
  }

  public getTechnique(id: TechniqueId): Technique {
    assert(id < this._list.length, "technique index out of bounds");
    return this._list[id];
  }

  public addDynamicTechnique(technique: Technique, name: string): TechniqueId {
    for (let i = 0; i < this._dynamicTechniqueIds.length; i++) {
      if (this._dynamicTechniqueIds[i] === name) {
        return TechniqueId.NumBuiltIn + i;
      }
    }

    this._dynamicTechniqueIds.push(name);
    this._list.push(technique);
    return TechniqueId.NumBuiltIn + this._dynamicTechniqueIds.length - 1;
  }

  private readonly _scratchTechniqueFlags = new TechniqueFlags();

  /** Execute each command in the list */
  public execute(target: Target, commands: DrawCommands, renderPass: RenderPass) {
    assert(RenderPass.None !== renderPass, "invalid render pass");

    const flags = this._scratchTechniqueFlags;
    using(new ShaderProgramExecutor(target, renderPass), (executor: ShaderProgramExecutor) => {
      for (const command of commands) {
        command.preExecute(executor);

        const techniqueId = command.getTechniqueId(target);
        if (TechniqueId.Invalid !== techniqueId) {
          // A primitive command.
          assert(command.isPrimitiveCommand, "expected primitive command");
          flags.init(target, renderPass);
          const tech = this.getTechnique(techniqueId);
          const program = tech.getShader(flags);
          if (executor.setProgram(program)) {
            command.execute(executor);
          }
        } else {
          // A branch command.
          assert(!command.isPrimitiveCommand, "expected non-primitive command");
          command.execute(executor);
        }

        command.postExecute(executor);
      }
    });
  }

  /** Draw a single primitive. Usually used for special-purpose rendering techniques. */
  public draw(params: DrawParams): void {
    const tech = this.getTechnique(params.geometry.getTechniqueId(params.target));
    const program = tech.getShader(TechniqueFlags.defaults);
    using(new ShaderProgramExecutor(params.target, params.renderPass, program), (executor: ShaderProgramExecutor) => {
      assert(executor.isValid);
      if (executor.isValid) {
        executor.draw(params);
      }
    });
  }

  public dispose(): void {
    for (const tech of this._list) {
      tech.dispose();
    }

    this._list.length = 0;
  }

  // Chiefly for tests - compiles all shader programs - more generally programs are compiled on demand.
  public compileShaders(): boolean {
    let allCompiled = true;

    for (const tech of this._list) {
      if (!tech.compileShaders()) {
        allCompiled = false;
      }
    }

    return allCompiled;
  }

  private constructor() { }

  private initializeBuiltIns(gl: WebGLRenderingContext): boolean {
    // ###TODO: For now, use a dummy placeholder for each unimplemented built-in technique...
    const tech = new DummyTechnique(gl);
    for (let i = 0; i < TechniqueId.NumBuiltIn; i++) {
      this._list.push(tech);
    }

    // Replace dummy techniques with the real techniques implemented thus far...
    this._list[TechniqueId.OITClearTranslucent] = new SingularTechnique(createClearTranslucentProgram(gl));
    this._list[TechniqueId.ClearPickAndColor] = new SingularTechnique(createClearPickAndColorProgram(gl));
    this._list[TechniqueId.CopyColor] = new SingularTechnique(createCopyColorProgram(gl));
    this._list[TechniqueId.CopyPickBuffers] = new SingularTechnique(createCopyPickBuffersProgram(gl));
    this._list[TechniqueId.CompositeHilite] = new SingularTechnique(createCompositeProgram(CompositeFlags.Hilite, gl));
    this._list[TechniqueId.CompositeTranslucent] = new SingularTechnique(createCompositeProgram(CompositeFlags.Translucent, gl));
    this._list[TechniqueId.CompositeHiliteAndTranslucent] = new SingularTechnique(createCompositeProgram(CompositeFlags.Hilite | CompositeFlags.Translucent, gl));
    this._list[TechniqueId.ClipMask] = new SingularTechnique(createClipMaskProgram(gl));
    this._list[TechniqueId.Surface] = new SurfaceTechnique(gl);
    // this._list[TechniqueId.Polyline] = new PolylineTechnique(gl);
    // this._list[TechniqueId.PointString] = new PointStringTechnique(gl); // ###TODO

    assert(this._list.length === TechniqueId.NumBuiltIn, "unexpected number of built-in techniques");
    return true;
  }
}
