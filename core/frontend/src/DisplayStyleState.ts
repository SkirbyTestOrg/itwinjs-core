/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 - present Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Views */
import {
  Light,
  LightType,
  ViewFlags,
  HiddenLine,
  ColorDefProps,
  ColorDef,
  ColorByName,
  DisplayStyleProps,
  RenderTexture,
  RenderMaterial,
  Gradient,
  SubCategoryOverride,
} from "@bentley/imodeljs-common";
import { ElementState } from "./EntityState";
import { IModelConnection } from "./IModelConnection";
import { JsonUtils, Id64, Id64String } from "@bentley/bentleyjs-core";
import { Vector3d } from "@bentley/geometry-core";
import { RenderSystem, TextureImage } from "./render/System";
import { BackgroundMapState } from "./tile/WebMercatorTileTree";
import { Plane3dByOriginAndUnitNormal } from "@bentley/geometry-core/lib/AnalyticGeometry";

/** A DisplayStyle defines the parameters for 'styling' the contents of a View */
export abstract class DisplayStyleState extends ElementState implements DisplayStyleProps {
  private readonly _viewFlags: ViewFlags;
  private readonly _background: ColorDef;
  private readonly _monochrome: ColorDef;
  private readonly _subCategoryOverrides: Map<string, SubCategoryOverride> = new Map<string, SubCategoryOverride>();
  private _backgroundMap: BackgroundMapState;

  constructor(props: DisplayStyleProps, iModel: IModelConnection) {
    super(props, iModel);
    this._viewFlags = ViewFlags.fromJSON(this.getStyle("viewflags"));
    this._background = ColorDef.fromJSON(this.getStyle("backgroundColor"));
    const monoName = "monochromeColor"; // because tslint: "object access via string literals is disallowed"...
    const monoJson = this.styles[monoName];
    this._monochrome = undefined !== monoJson ? ColorDef.fromJSON(monoJson) : ColorDef.white.clone();
    this._backgroundMap = new BackgroundMapState(this.getStyle("backgroundMap"), iModel);

    // Read subcategory overrides.
    // ###TODO: overrideSubCategory() and dropSubCategoryOverride() should be updating this element's JSON properties...
    // NB: Not using this.getStyle() because it inserts the style as an object if not found, but this style is supposed to be an array...
    const jsonProps = JsonUtils.asObject(props.jsonProperties);
    const styles = undefined !== jsonProps ? JsonUtils.asObject(jsonProps.styles) : undefined;
    const ovrsArray = undefined !== styles ? JsonUtils.asArray(styles.subCategoryOvr) : undefined;
    if (undefined !== ovrsArray) {
      for (const ovrJson of ovrsArray) {
        const subCatId = Id64.fromJSON(ovrJson.subCategory);
        if (subCatId.isValid) {
          const subCatOvr = SubCategoryOverride.fromJSON(ovrJson);
          if (subCatOvr.anyOverridden)
            this.overrideSubCategory(subCatId, subCatOvr);
        }
      }
    }
  }

  public syncBackgroundMapState() {
    this._backgroundMap = new BackgroundMapState(this.getStyle("backgroundMap"), this.iModel);
  }

  public equalState(other: DisplayStyleState): boolean {
    return JSON.stringify(this.styles) === JSON.stringify(other.styles);
  }

  public get backgroundMap() { return this._backgroundMap; }

  /** Get the name of this DisplayStyle */
  public get name(): string { return this.code.getValue(); }

  public get viewFlags(): ViewFlags { return this._viewFlags; }
  public set viewFlags(flags: ViewFlags) {
    flags.clone(this._viewFlags);
    this.setStyle("viewflags", flags);
  }

  public get styles(): any {
    const p = this.jsonProperties as any;
    if (undefined === p.styles)
      p.styles = new Object();

    return p.styles;
  }
  public getStyle(name: string): any {
    const style: object = this.styles[name];
    return style ? style : {};
  }
  /** change the value of a style on this DisplayStyle */
  public setStyle(name: string, value: any): void { this.styles[name] = value; }

  /** Remove a Style from this DisplayStyle. */
  public removeStyle(name: string) { delete this.styles[name]; }

  /** Get the background color for this DisplayStyle */
  public get backgroundColor(): ColorDef { return this._background; }
  public set backgroundColor(val: ColorDef) { this._background.setFrom(val); this.setStyle("backgroundColor", val); }

  public get monochromeColor(): ColorDef { return this._monochrome; }
  public set monochromeColor(val: ColorDef) { this._monochrome.setFrom(val); this.setStyle("monochromeColor", val); }

  public get backgroundMapPlane(): Plane3dByOriginAndUnitNormal | undefined { return this.viewFlags.backgroundMap ? this.backgroundMap.getPlane() : undefined; }
  public is3d(): this is DisplayStyle3dState { return this instanceof DisplayStyle3dState; }

  public overrideSubCategory(id: Id64String, ovr: SubCategoryOverride) {
    this._subCategoryOverrides.set(id.toString(), ovr);
  }

  public dropSubCategoryOverride(id: Id64String) {
    this._subCategoryOverrides.delete(id.toString());
  }

  public get hasSubCategoryOverride() { return this._subCategoryOverrides.entries.length > 0; }

  public getSubCategoryOverride(id: Id64String): SubCategoryOverride | undefined {
    return this._subCategoryOverrides.get(id.toString());
  }
}

/** A DisplayStyle for 2d views */
export class DisplayStyle2dState extends DisplayStyleState {
  constructor(props: DisplayStyleProps, iModel: IModelConnection) { super(props, iModel); }
}

export interface GroundPlaneProps {
  display?: boolean;
  elevation?: number;
  aboveColor?: ColorDefProps;
  belowColor?: ColorDefProps;
}

/** A circle drawn at a Z elevation, whose diameter is the the XY diagonal of the project extents */
export class GroundPlane implements GroundPlaneProps {
  public display: boolean = false;
  public elevation: number = 0.0;  // the Z height to draw the ground plane
  public aboveColor: ColorDef;     // the color to draw the ground plane if the view shows the ground from above
  public belowColor: ColorDef;     // the color to draw the ground plane if the view shows the ground from below
  private _aboveSymb?: Gradient.Symb; // symbology for ground plane when view is from above
  private _belowSymb?: Gradient.Symb; // symbology for ground plane when view is from below

  public constructor(ground?: GroundPlaneProps) {
    ground = ground ? ground : {};
    this.display = JsonUtils.asBool(ground.display, false);
    this.elevation = JsonUtils.asDouble(ground.elevation, -.01);
    this.aboveColor = (undefined !== ground.aboveColor) ? ColorDef.fromJSON(ground.aboveColor) : new ColorDef(ColorByName.darkGreen);
    this.belowColor = (undefined !== ground.belowColor) ? ColorDef.fromJSON(ground.belowColor) : new ColorDef(ColorByName.darkBrown);
  }

  /**
   * Returns and locally stores gradient symbology for the ground plane texture depending on whether we are looking from above or below.
   * Will store the ground colors used in the optional ColorDef array provided.
   */
  public getGroundPlaneGradient(aboveGround: boolean): Gradient.Symb {
    let gradient = aboveGround ? this._aboveSymb : this._belowSymb;
    if (undefined !== gradient)
      return gradient;

    const values = [0, .25, .5];   // gradient goes from edge of rectangle (0.0) to center (1.0)...
    const color = aboveGround ? this.aboveColor : this.belowColor;
    const alpha = aboveGround ? 0x80 : 0x85;
    const groundColors = [color.clone(), color.clone(), color.clone()];
    groundColors[0].setTransparency(0xff);
    groundColors[1].setTransparency(alpha);
    groundColors[2].setTransparency(alpha);

    // Get the possibly cached gradient from the system, specific to whether or not we want ground from above or below.
    gradient = new Gradient.Symb();
    gradient.mode = Gradient.Mode.Spherical;
    gradient.keys = [{ color: groundColors[0], value: values[0] }, { color: groundColors[1], value: values[1] }, { color: groundColors[2], value: values[2] }];

    // Store the gradient for possible future use
    if (aboveGround)
      this._aboveSymb = gradient;
    else
      this._belowSymb = gradient;

    return gradient;
  }
}

export const enum SkyBoxImageType {
  None,
  Spherical,
  Cylindrical,
  Cube,
}

export interface SkyCubeProps {
  front?: Id64String;
  back?: Id64String;
  top?: Id64String;
  bottom?: Id64String;
  right?: Id64String;
  left?: Id64String;
}

export interface SkyBoxImageProps {
  type?: SkyBoxImageType;
  texture?: Id64String;
  textures?: SkyCubeProps;
}

export interface SkyBoxProps {
  display?: boolean;
  twoColor?: boolean;
  groundExponent?: number;
  skyExponent?: number;
  groundColor?: ColorDefProps;
  zenithColor?: ColorDefProps;
  nadirColor?: ColorDefProps;
  skyColor?: ColorDefProps;
  image?: SkyBoxImageProps;
}

export interface EnvironmentProps {
  ground?: GroundPlaneProps;
  sky?: SkyBoxProps;
}

/** The SkyBox is an environment drawn in the background of spatial views to provide context. */
export abstract class SkyBox implements SkyBoxProps {
  public display: boolean = false;

  protected constructor(sky?: SkyBoxProps) {
    this.display = undefined !== sky && JsonUtils.asBool(sky.display, false);
  }

  public toJSON(): SkyBoxProps {
    return { display: this.display };
  }

  public static createFromJSON(json?: SkyBoxProps): SkyBox {
    let imageType = SkyBoxImageType.None;
    if (undefined !== json && undefined !== json.image && undefined !== json.image.type)
      imageType = json.image.type;

    let skybox: SkyBox | undefined;
    switch (imageType) {
      case SkyBoxImageType.Spherical:
        skybox = SkySphere.fromJSON(json!);
        break;
      case SkyBoxImageType.Cube:
        skybox = SkyCube.fromJSON(json!);
        break;
      case SkyBoxImageType.Cylindrical: // ###TODO...
        break;
    }

    return undefined !== skybox ? skybox : new SkyGradient(json);
  }

  public abstract async loadParams(_system: RenderSystem, _iModel: IModelConnection): Promise<SkyBox.CreateParams | undefined>;
}

export namespace SkyBox {
  export class SphereParams {
    public constructor(public readonly texture: RenderTexture, public readonly rotation: number) { }
  }

  export class CreateParams {
    public readonly gradient?: SkyGradient;
    public readonly sphere?: SphereParams;
    public readonly cube?: RenderTexture;
    public readonly zOffset: number;

    private constructor(zOffset: number, gradient?: SkyGradient, sphere?: SphereParams, cube?: RenderTexture) {
      this.gradient = gradient;
      this.sphere = sphere;
      this.cube = cube;
      this.zOffset = zOffset;
    }

    public static createForGradient(gradient: SkyGradient, zOffset: number) { return new CreateParams(zOffset, gradient); }
    public static createForSphere(sphere: SphereParams, zOffset: number) { return new CreateParams(zOffset, undefined, sphere); }
    public static createForCube(cube: RenderTexture) { return new CreateParams(0.0, undefined, undefined, cube); }
  }
}

export class SkyGradient extends SkyBox {
  public readonly twoColor: boolean = false;
  public readonly zenithColor: ColorDef;         // the color of the zenith part of the sky gradient (shown when looking straight up.)
  public readonly nadirColor: ColorDef;          // the color of the nadir part of the ground gradient (shown when looking straight down.)
  public readonly groundColor: ColorDef;         // the color of the ground part of the ground gradient
  public readonly skyColor: ColorDef;            // the color of the sky part of the sky gradient
  public readonly groundExponent: number = 4.0;  // the cutoff between ground and nadir
  public readonly skyExponent: number = 4.0;     // the cutoff between sky and zenith

  public constructor(sky?: SkyBoxProps) {
    super(sky);

    sky = sky ? sky : {};
    this.twoColor = JsonUtils.asBool(sky.twoColor, false);
    this.groundExponent = JsonUtils.asDouble(sky.groundExponent, 4.0);
    this.skyExponent = JsonUtils.asDouble(sky.skyExponent, 4.0);
    this.groundColor = (undefined !== sky.groundColor) ? ColorDef.fromJSON(sky.groundColor) : ColorDef.from(120, 143, 125);
    this.zenithColor = (undefined !== sky.zenithColor) ? ColorDef.fromJSON(sky.zenithColor) : ColorDef.from(54, 117, 255);
    this.nadirColor = (undefined !== sky.nadirColor) ? ColorDef.fromJSON(sky.nadirColor) : ColorDef.from(40, 15, 0);
    this.skyColor = (undefined !== sky.skyColor) ? ColorDef.fromJSON(sky.skyColor) : ColorDef.from(143, 205, 255);
  }

  public toJSON(): SkyBoxProps {
    const val = super.toJSON();

    val.twoColor = this.twoColor ? true : undefined;
    val.groundExponent = this.groundExponent !== 4.0 ? this.groundExponent : undefined;
    val.skyExponent = this.skyExponent !== 4.0 ? this.skyExponent : undefined;

    val.groundColor = this.groundColor.toJSON();
    val.zenithColor = this.zenithColor.toJSON();
    val.nadirColor = this.nadirColor.toJSON();
    val.skyColor = this.skyColor.toJSON();

    return val;
  }

  public async loadParams(_system: RenderSystem, iModel: IModelConnection): Promise<SkyBox.CreateParams> {
    return Promise.resolve(SkyBox.CreateParams.createForGradient(this, iModel.globalOrigin.z));
  }
}

export class SkySphere extends SkyBox {
  public textureId: Id64;

  private constructor(textureId: Id64, display?: boolean) {
    super({ display });
    this.textureId = textureId;
  }

  public static fromJSON(json: SkyBoxProps): SkySphere | undefined {
    const textureId = new Id64(undefined !== json.image ? json.image.texture : undefined);
    return undefined !== textureId && textureId.isValid ? new SkySphere(textureId, json.display) : undefined;
  }

  public toJSON(): SkyBoxProps {
    const val = super.toJSON();
    val.image = {
      type: SkyBoxImageType.Spherical,
      texture: this.textureId.value,
    };
    return val;
  }

  public async loadParams(system: RenderSystem, iModel: IModelConnection): Promise<SkyBox.CreateParams | undefined> {
    const texture = await system.loadTexture(this.textureId, iModel);
    if (undefined === texture)
      return undefined;

    const rotation = 0.0; // ###TODO: from where do we obtain rotation?
    return SkyBox.CreateParams.createForSphere(new SkyBox.SphereParams(texture, rotation), iModel.globalOrigin.z);
  }
}

export class SkyCube extends SkyBox implements SkyCubeProps {
  public readonly front: Id64;
  public readonly back: Id64;
  public readonly top: Id64;
  public readonly bottom: Id64;
  public readonly right: Id64;
  public readonly left: Id64;

  private constructor(front: Id64, back: Id64, top: Id64, bottom: Id64, right: Id64, left: Id64, display?: boolean) {
    super({ display });

    this.front = front;
    this.back = back;
    this.top = top;
    this.bottom = bottom;
    this.right = right;
    this.left = left;
  }

  public static fromJSON(skyboxJson: SkyBoxProps): SkyCube | undefined {
    const image = skyboxJson.image;
    const json = (undefined !== image && image.type === SkyBoxImageType.Cube ? image.textures : undefined) as SkyCubeProps;
    if (undefined === json)
      return undefined;

    return this.create(Id64.fromJSON(json.front), Id64.fromJSON(json.back), Id64.fromJSON(json.top), Id64.fromJSON(json.bottom), Id64.fromJSON(json.right), Id64.fromJSON(json.left), skyboxJson.display);
  }

  public toJSON(): SkyBoxProps {
    const val = super.toJSON();
    val.image = {
      type: SkyBoxImageType.Cube,
      textures: {
        front: this.front.value,
        back: this.back.value,
        top: this.top.value,
        bottom: this.bottom.value,
        right: this.right.value,
        left: this.left.value,
      },
    };
    return val;
  }

  public static create(front: Id64, back: Id64, top: Id64, bottom: Id64, right: Id64, left: Id64, display?: boolean): SkyCube | undefined {
    if (!front.isValid || !back.isValid || !top.isValid || !bottom.isValid || !right.isValid || !left.isValid)
      return undefined;
    else
      return new SkyCube(front, back, top, bottom, right, left, display);
  }

  public async loadParams(system: RenderSystem, iModel: IModelConnection): Promise<SkyBox.CreateParams | undefined> {
    // ###TODO: We never cache the actual texture *images* used here to create a single cubemap texture...
    const textureIds = new Set<string>([this.front.value, this.back.value, this.top.value, this.bottom.value, this.right.value, this.left.value]);
    const promises = new Array<Promise<TextureImage | undefined>>();
    for (const textureId of textureIds)
      promises.push(system.loadTextureImage(textureId, iModel));

    try {
      const images = await Promise.all(promises);

      // ###TODO there's gotta be a simpler way to map the unique images back to their texture IDs...
      const idToImage = new Map<string, HTMLImageElement>();
      let index = 0;
      for (const textureId of textureIds) {
        const image = images[index++];
        if (undefined === image || undefined === image.image)
          return undefined;
        else
          idToImage.set(textureId, image.image);
      }

      const params = new RenderTexture.Params(undefined, RenderTexture.Type.SkyBox);
      const textureImages = [
        idToImage.get(this.front.value)!, idToImage.get(this.back.value)!, idToImage.get(this.top.value)!,
        idToImage.get(this.bottom.value)!, idToImage.get(this.right.value)!, idToImage.get(this.left.value)!,
      ];

      const texture = system.createTextureFromCubeImages(textureImages[0], textureImages[1], textureImages[2], textureImages[3], textureImages[4], textureImages[5], iModel, params);
      return undefined !== texture ? SkyBox.CreateParams.createForCube(texture) : undefined;
    } catch (_err) {
      return undefined;
    }
  }
}

/** The skyBox, groundPlane, etc. for a 3d view  */
export class Environment implements EnvironmentProps {
  public readonly sky: SkyBox;
  public readonly ground: GroundPlane;
  public constructor(json?: EnvironmentProps) {
    this.sky = SkyBox.createFromJSON(undefined !== json ? json.sky : undefined);
    this.ground = new GroundPlane(undefined !== json ? json.ground : undefined);
  }

  public toJSON(): EnvironmentProps {
    return {
      sky: this.sky.toJSON(),
      ground: this.ground, // ###TODO GroundPlane.toJSON missing...but lots of JSON inconsistencies associated with DisplayStyle...fix them all up later?
    };
  }
}

/** A DisplayStyle for 3d views */
export class DisplayStyle3dState extends DisplayStyleState {
  public skyboxMaterial: RenderMaterial | undefined;
  private _skyBoxParams?: SkyBox.CreateParams;
  private _skyBoxParamsLoaded?: boolean;
  private _environment?: Environment;

  public constructor(props: DisplayStyleProps, iModel: IModelConnection) { super(props, iModel); }
  public getHiddenLineParams(): HiddenLine.Params { return new HiddenLine.Params(this.getStyle("hline")); }
  public setHiddenLineParams(params: HiddenLine.Params) { this.setStyle("hline", params); }

  /** change one of the scene light specifications (Ambient, Flash, or Portrait) for this display style */
  public setSceneLight(light: Light) {
    if (!light.isValid)
      return;

    const sceneLights = this.getStyle("sceneLights");
    switch (light.lightType) {
      case LightType.Ambient:
        sceneLights.ambient = light;
        break;

      case LightType.Flash:
        sceneLights.flash = light;
        break;

      case LightType.Portrait:
        sceneLights.portrait = light;
        break;
    }
    this.setStyle("sceneLights", sceneLights);
  }

  /** change the light specification and direction of the solar light for this display style */
  public setSolarLight(light: Light, direction: Vector3d) {
    const sceneLights = this.getStyle("sceneLights");
    if (light.lightType !== LightType.Solar || !light.isValid) {
      delete sceneLights.sunDir;
    } else {
      sceneLights.sun = light;
      sceneLights.sunDir = direction;
    }
    this.setStyle("sceneLights", sceneLights);
  }

  public get environment(): Environment {
    if (undefined === this._environment)
      this._environment = new Environment(this.getStyle("environment"));

    return this._environment;
  }
  public set environment(env: Environment) {
    this.setStyle("environment", env.toJSON());
    this._environment = undefined;
  }

  public setSceneBrightness(fstop: number): void { fstop = Math.max(-3.0, Math.min(fstop, 3.0)); this.getStyle("sceneLights").fstop = fstop; }
  public getSceneBrightness(): number { return JsonUtils.asDouble(this.getStyle("sceneLights").fstop, 0.0); }

  /** Attempts to create textures for the sky of the environment, and load it into the sky. Returns true on success, and false otherwise. */
  public loadSkyBoxParams(system: RenderSystem): SkyBox.CreateParams | undefined {
    if (undefined === this._skyBoxParams && undefined === this._skyBoxParamsLoaded) {
      this._skyBoxParamsLoaded = false;
      const skybox = this.environment.sky;
      skybox.loadParams(system, this.iModel).then((params?: SkyBox.CreateParams) => {
        this._skyBoxParams = params;
        this._skyBoxParamsLoaded = true;
      }).catch((_err) => this._skyBoxParamsLoaded = true);
    }

    return this._skyBoxParams;
  }
}
