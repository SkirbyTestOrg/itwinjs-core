/*---------------------------------------------------------------------------------------------
| $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Views */
import { Light, LightType, ViewFlags, HiddenLine, ColorDef, ColorByName, ElementProps, RenderTexture, RenderMaterial, Gradient, SubCategoryOverride } from "@bentley/imodeljs-common";
import { ElementState } from "./EntityState";
import { IModelConnection } from "./IModelConnection";
import { JsonUtils, Id64 } from "@bentley/bentleyjs-core";
import { Vector3d } from "@bentley/geometry-core";
import { RenderSystem } from "./rendering";
import { SkyBoxCreateParams, SkyboxSphereType } from "./render/System";

/** A DisplayStyle defines the parameters for 'styling' the contents of a View */
export abstract class DisplayStyleState extends ElementState {
  private _viewFlags: ViewFlags;
  private _background: ColorDef;
  private _monochrome: ColorDef;
  private _subCategoryOverrides: Map<string, SubCategoryOverride> = new Map<string, SubCategoryOverride>();

  constructor(props: ElementProps, iModel: IModelConnection) {
    super(props, iModel);
    this._viewFlags = ViewFlags.fromJSON(this.getStyle("viewflags"));
    this._background = ColorDef.fromJSON(this.getStyle("backgroundColor"));
    const monoName = "monochromeColor"; // because tslint: "object access via string literals is disallowed"...
    const monoJson = this.getStyles()[monoName];
    this._monochrome = undefined !== monoJson ? ColorDef.fromJSON(monoJson) : ColorDef.white.clone();
  }

  public equalState(other: DisplayStyleState): boolean {
    return JSON.stringify(this.getStyles()) === JSON.stringify(other.getStyles());
  }

  /** Get the name of this DisplayStyle */
  public get name(): string { return this.code.getValue(); }

  public get viewFlags(): ViewFlags { return this._viewFlags; }
  public set viewFlags(flags: ViewFlags) {
    flags.clone(this._viewFlags);
    this.setStyle("viewflags", flags);
  }

  public getStyles(): any { const p = this.jsonProperties as any; if (!p.styles) p.styles = new Object(); return p.styles; }
  public getStyle(name: string): any {
    const style: object = this.getStyles()[name];
    return style ? style : {};
  }
  /** change the value of a style on this DisplayStyle */
  public setStyle(name: string, value: any): void { this.getStyles()[name] = value; }

  /** Remove a Style from this DisplayStyle. */
  public removeStyle(name: string) { delete this.getStyles()[name]; }

  /** Get the background color for this DisplayStyle */
  public get backgroundColor(): ColorDef { return this._background; }
  public set backgroundColor(val: ColorDef) { this._background = val; this.setStyle("backgroundColor", val); }

  public getMonochromeColor(): ColorDef { return this._monochrome; }
  public setMonochromeColor(val: ColorDef): void { this._monochrome = val; this.setStyle("monochromeColor", val); }

  public is3d(): this is DisplayStyle3dState { return this instanceof DisplayStyle3dState; }

  public overrideSubCategory(id: Id64, ovr: SubCategoryOverride) {
    if (id.isValid)
      this._subCategoryOverrides.set(id.value, ovr);
  }

  public dropSubCategoryOverride(id: Id64) {
    this._subCategoryOverrides.delete(id.value);
  }

  public get hasSubCategoryOverride() { return this._subCategoryOverrides.entries.length > 0; }

  public getSubCategoryOverride(id: Id64 | string): SubCategoryOverride | undefined {
    return this._subCategoryOverrides.get(id.toString());
  }
}

/** A DisplayStyle for 2d views */
export class DisplayStyle2dState extends DisplayStyleState {
  constructor(props: ElementProps, iModel: IModelConnection) { super(props, iModel); }
}

/** A circle drawn at a Z elevation, whose diameter is the the XY diagonal of the project extents */
export class GroundPlane {
  public display: boolean = false;
  public elevation: number = 0.0;  // the Z height to draw the ground plane
  public aboveColor: ColorDef;     // the color to draw the ground plane if the view shows the ground from above
  public belowColor: ColorDef;     // the color to draw the ground plane if the view shows the ground from below
  private aboveSymb?: Gradient.Symb; // symbology for ground plane when view is from above
  private belowSymb?: Gradient.Symb; // symbology for ground plane when view is from below

  public constructor(ground: any) {
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
  public getGroundPlaneTextureSymb(aboveGround: boolean, groundColors?: ColorDef[]): Gradient.Symb {
    if (aboveGround) {
      if (this.aboveSymb) {
        return this.aboveSymb;
      }
    } else {
      if (this.belowSymb)
        return this.belowSymb;
    }

    const values = [0, .25, .5];   // gradient goes from edge of rectangle (0.0) to center (1.0)...
    const color = aboveGround ? this.aboveColor : this.belowColor;
    groundColors = groundColors !== undefined ? groundColors : [];
    groundColors.length = 0;
    groundColors.push(color.clone());
    groundColors.push(color.clone());
    groundColors.push(color.clone());

    const alpha = aboveGround ? 0x80 : 0x85;
    groundColors[0].setTransparency(0xff);
    groundColors[1].setTransparency(alpha);
    groundColors[2].setTransparency(alpha);

    // Get the possibly cached gradient from the system, specific to whether or not we want ground from above or below.
    const gradient = new Gradient.Symb();
    gradient.mode = Gradient.Mode.Spherical;
    gradient.keys = [{ color: groundColors[0], value: values[0] }, { color: groundColors[1], value: values[1] }, { color: groundColors[2], value: values[2] }];

    // Store the gradient for possible future use
    if (aboveGround)
      this.aboveSymb = gradient;
    else
      this.belowSymb = gradient;

    return gradient;
  }
}

export const enum SkyBoxImageType {
  None,
  Spherical,
  Cylindrical,
}

export class SkyBoxImage {
  public type: SkyBoxImageType;
  public textureId: Id64;

  public constructor(json: any) {
    if (undefined !== json) {
      this.type = JsonUtils.asInt(json.type, SkyBoxImageType.None);
      this.textureId = new Id64(JsonUtils.asString(json.texture));
    } else {
      this.type = SkyBoxImageType.None;
      this.textureId = Id64.invalidId;
    }
  }

  public toJSON(): any {
    return {
      type: this.type,
      texture: this.textureId.toString(),
    };
  }
}

/** The SkyBox is a grid drawn in the background of spatial views to provide context. */
export class SkyBox {
  public display: boolean = false;
  public readonly twoColor: boolean = false;
  public readonly image: SkyBoxImage;
  public readonly zenithColor: ColorDef;         // if no image, the color of the zenith part of the sky gradient (shown when looking straight up.)
  public readonly nadirColor: ColorDef;          // if no image, the color of the nadir part of the ground gradient (shown when looking straight down.)
  public readonly groundColor: ColorDef;         // if no image, the color of the ground part of the ground gradient
  public readonly skyColor: ColorDef;            // if no image, the color of the sky part of the sky gradient
  public readonly groundExponent: number = 4.0;  // if no image, the cutoff between ground and nadir
  public readonly skyExponent: number = 4.0;     // if no image, the cutoff between sky and zenith

  public constructor(sky: any) {
    sky = sky ? sky : {};
    this.display = JsonUtils.asBool(sky.display, false);
    this.twoColor = JsonUtils.asBool(sky.twoColor, false);
    this.groundExponent = JsonUtils.asDouble(sky.groundExponent, 4.0);
    this.skyExponent = JsonUtils.asDouble(sky.skyExponent, 4.0);
    this.groundColor = (undefined !== sky.groundColor) ? ColorDef.fromJSON(sky.groundColor) : ColorDef.from(120, 143, 125);
    this.zenithColor = (undefined !== sky.zenithColor) ? ColorDef.fromJSON(sky.zenithColor) : ColorDef.from(54, 117, 255);
    this.nadirColor = (undefined !== sky.nadirColor) ? ColorDef.fromJSON(sky.nadirColor) : ColorDef.from(40, 15, 0);
    this.skyColor = (undefined !== sky.skyColor) ? ColorDef.fromJSON(sky.skyColor) : ColorDef.from(143, 205, 255);
    this.image = new SkyBoxImage(sky.image);
  }

  public toJSON(): any {
    const val: any = {};
    if (this.display)
      val.display = true;
    if (this.twoColor)
      val.twoColor = true;
    if (this.groundExponent !== 4.0)
      val.groundExponent = this.groundExponent;
    if (this.skyExponent !== 4.0)
      val.skyExponent = this.groundExponent;

    val.groundColor = this.groundColor;
    val.zenithColor = this.zenithColor;
    val.nadirColor = this.nadirColor;
    val.skyColor = this.skyColor;
    val.image = this.image.toJSON();

    return val;
  }
}

/** The skyBox, groundPlane, etc. for a 3d view  */
export class Environment {
  public readonly sky: SkyBox;
  public readonly ground: GroundPlane;
  public constructor(json: any) {
    this.sky = new SkyBox(json.sky);
    this.ground = new GroundPlane(json.ground);
  }
}

/** A DisplayStyle for 3d views */
export class DisplayStyle3dState extends DisplayStyleState {
  public skyboxMaterial: RenderMaterial | undefined;
  public skyBoxParams?: SkyBoxCreateParams;
  public constructor(props: ElementProps, iModel: IModelConnection) { super(props, iModel); }
  public getHiddenLineParams(): HiddenLine.Params { return new HiddenLine.Params(this.getStyle("hline")); }
  public setHiddenLineParams(params: HiddenLine.Params) { this.setStyle("hline", params); }

  /** change one of the scene light specifications (Ambient, Flash, or Portrait) for this display style */
  public setSceneLight(light: Light) {
    if (!light.isValid())
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
    if (light.lightType !== LightType.Solar || !light.isValid()) {
      delete sceneLights.sunDir;
    } else {
      sceneLights.sun = light;
      sceneLights.sunDir = direction;
    }
    this.setStyle("sceneLights", sceneLights);
  }

  public getEnvironment() { return new Environment(this.getStyle("environment")); }
  public setEnvironment(env: Environment) { this.setStyle("environment", env); }

  public setSceneBrightness(fstop: number): void { fstop = Math.max(-3.0, Math.min(fstop, 3.0)); this.getStyle("sceneLights").fstop = fstop; }
  public getSceneBrightness(): number { return JsonUtils.asDouble(this.getStyle("sceneLights").fstop, 0.0); }

  private _useSkyBoxImages: boolean = false;
  private _skyBoxImagePrefix: string = "Teide/";
  private _skyBoxImageSuffix: string = "jpg";

  /** Attempts to create textures for the sky of the environment, and load it into the sky. Returns true on success, and false otherwise. */
  public loadSkyBoxParams(system: RenderSystem): boolean {
    if (this.skyBoxParams !== undefined)
      return true;  // skybox params have already been loaded

    const skybox = this.getEnvironment().sky;
    // ###TODO: Need something in Skybox to tell us whether to use gradient, spherical texture, or cube texture.
    const useSpherical = true;
    if (useSpherical)
      return this.loadSphericalSkyBoxParams(skybox, system);

    if (this._useSkyBoxImages)
      return this.loadImageSkyBoxParams(system);

    // const env = this.getEnvironment();
    // ###TODO - Use actual textures - just defining our own textures for now (different colors to distinguish them); can key off env.sky.jpegFile (needs more than one file though!)
    // ###TODO - If possible, use a cubemap texture to store all six images in one fell swoop (better use of GPU resources)
    // ###TODO - if any image buffer or texture fails to load, bail out.
    return true;
  }

  // ###TODO: This is all temporary...
  private _loadingImages: boolean = false;
  private loadImageSkyBoxParams(system: RenderSystem): boolean {
    if (this._loadingImages)
      return true;

    this._loadingImages = true;

    const promises: Array<Promise<HTMLImageElement>> = [];
    const prefix = this._skyBoxImagePrefix;
    const ext = this._skyBoxImageSuffix;
    const suffixes = ["posx", "negx", "posy", "negy", "posz", "negz"];
    for (let i = 0; i < suffixes.length; i++) {
      const suffix = suffixes[i];
      const url = "./skyboxes/" + prefix + suffix + "." + ext;
      const promise = new Promise((resolve: (image: HTMLImageElement) => void, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
        (image as any).faceIndex = i;
      });

      promises.push(promise);
    }

    Promise.all(promises).then((images: HTMLImageElement[]) => {
      const params = new RenderTexture.Params(undefined, RenderTexture.Type.SkyBox);
      const texture = system.createTextureFromCubeImages(images[0], images[1], images[2], images[3], images[4], images[5], this.iModel, params);
      this.skyBoxParams = SkyBoxCreateParams.createForTexturedCube(texture!);
      this._loadingImages = false;
    });

    return true;
  }

  public loadSphericalSkyBoxParams(sky: SkyBox, system: RenderSystem): boolean {
    // sky.jpegFile = "texturify_pano-1-13SMall.jpg"; // SphericalChurch.jpg";
    const skyJpegFile: string | undefined = undefined;
    if (undefined !== skyJpegFile && "" !== skyJpegFile) {
      if (this._loadingImages)
        return true;

      this._loadingImages = true;

      const promises: Array<Promise<HTMLImageElement>> = [];
      const url = "./skyboxes/" + skyJpegFile;
      const promise = new Promise((resolve: (image: HTMLImageElement) => void, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });
      promises.push(promise);

      Promise.all(promises).then((images: HTMLImageElement[]) => {
        const params = new RenderTexture.Params(undefined, RenderTexture.Type.SkyBox);
        const texture = system.createTextureFromImage(images[0], false, this.iModel, params);
        this.skyBoxParams = SkyBoxCreateParams.createForTexturedSphere(texture!, this.iModel.globalOrigin.z, 0.0); // ###TODO: where do we get rotation from?
        this._loadingImages = false;
      });
    } else if (sky.twoColor)
      this.skyBoxParams = SkyBoxCreateParams.createForGradientSphere(SkyboxSphereType.Gradient2Color, this.iModel.globalOrigin.z, sky.zenithColor, sky.nadirColor);
    else
      this.skyBoxParams = SkyBoxCreateParams.createForGradientSphere(SkyboxSphereType.Gradient4Color, this.iModel.globalOrigin.z, sky.zenithColor, sky.nadirColor, sky.skyColor, sky.groundColor, sky.skyExponent, sky.groundExponent);

    return true;
  }
}
