/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module WebGL */

import { Id64, BeTimePoint, IDisposable, dispose, assert } from "@bentley/bentleyjs-core";
import { ViewFlags, ElementAlignedBox3d } from "@bentley/imodeljs-common";
import { Transform } from "@bentley/geometry-core";
import { Primitive } from "./Primitive";
import { IModelConnection } from "../../IModelConnection";
import { RenderGraphic, GraphicBranch, GraphicBranchOptions, GraphicList, PackedFeature, PackedFeatureTable, RenderMemory } from "../System";
import { RenderCommands } from "./DrawCommand";
import { FeatureSymbology } from "../FeatureSymbology";
import { TextureHandle, Texture2DHandle, Texture2DDataUpdater } from "./Texture";
import { LUTDimensions, LUTParams } from "./FeatureDimensions";
import { Hilites, Target } from "./Target";
import { OvrFlags, RenderPass } from "./RenderFlags";
import { LineCode } from "./EdgeOverrides";
import { GL } from "./GL";
import { ClipPlanesVolume, ClipMaskVolume } from "./ClipVolume";
import { TextureDrape } from "./TextureDrape";
import { DisplayParams } from "../primitives/DisplayParams";

function isFeatureHilited(feature: PackedFeature, hilites: Hilites): boolean {
  if (hilites.isEmpty)
    return false;

  return hilites.elements.has(feature.elementId.lower, feature.elementId.upper) ||
    hilites.subcategories.has(feature.subCategoryId.lower, feature.subCategoryId.upper);
}

/** @internal */
export class FeatureOverrides implements IDisposable {
  public lut?: TextureHandle;
  public readonly target: Target;
  private _mostRecentSymbologyOverrides?: FeatureSymbology.Overrides;
  private _lastFlashUpdated: BeTimePoint = BeTimePoint.now();
  private _lastHiliteUpdated: BeTimePoint = BeTimePoint.now();
  public lutParams: LUTParams = new LUTParams(1, 1);
  public anyOverridden: boolean = true;
  public allHidden: boolean = true;
  public anyTranslucent: boolean = true;
  public anyOpaque: boolean = true;
  public anyHilited: boolean = true;

  public get byteLength(): number { return undefined !== this.lut ? this.lut.bytesUsed : 0; }
  public get isUniform() { return 2 === this.lutParams.width && 1 === this.lutParams.height; }
  public get isUniformFlashed() {
    if (!this.isUniform || undefined === this.lut)
      return false;

    const lut = this.lut as Texture2DHandle;
    const flags = lut.dataBytes![0];
    return 0 !== (flags & OvrFlags.Flashed);
  }

  private _initialize(map: PackedFeatureTable, ovrs: FeatureSymbology.Overrides, hilite: Hilites, flashed?: Id64.Uint32Pair): TextureHandle | undefined {
    const nFeatures = map.numFeatures;
    const dims: LUTDimensions = LUTDimensions.computeWidthAndHeight(nFeatures, 2);
    const width = dims.width;
    const height = dims.height;
    assert(width * height >= nFeatures);

    this.lutParams = new LUTParams(width, height);

    const data = new Uint8Array(width * height * 4);
    const creator = new Texture2DDataUpdater(data);
    this.buildLookupTable(creator, map, ovrs, flashed, hilite);

    return TextureHandle.createForData(width, height, data, true, GL.Texture.WrapMode.ClampToEdge);
  }

  private _update(map: PackedFeatureTable, lut: TextureHandle, flashed?: Id64.Uint32Pair, hilites?: Hilites, ovrs?: FeatureSymbology.Overrides) {
    const updater = new Texture2DDataUpdater(lut.dataBytes!);

    if (undefined === ovrs) {
      this.updateFlashedAndHilited(updater, map, flashed, hilites);
    } else {
      assert(undefined !== hilites);
      this.buildLookupTable(updater, map, ovrs, flashed, hilites!);
    }

    (lut as Texture2DHandle).update(updater);
  }

  private buildLookupTable(data: Texture2DDataUpdater, map: PackedFeatureTable, ovr: FeatureSymbology.Overrides, flashedIdParts: Id64.Uint32Pair | undefined, hilites: Hilites) {
    const modelIdParts = Id64.getUint32Pair(map.modelId);
    const isModelHilited = hilites.models.has(modelIdParts.lower, modelIdParts.upper);

    this.anyOpaque = this.anyTranslucent = this.anyHilited = false;

    let nHidden = 0;
    let nOverridden = 0;

    // NB: We currently use 2 RGBA values per feature as follows:
    //  [0]
    //      R = override flags (see FeatureOverrides::Flags)
    //      G = line weight
    //      B = line code
    //      A = 1 if no-locatable
    //  [1]
    //      RGB = rgb
    //      A = alpha
    for (let i = 0; i < map.numFeatures; i++) {
      const feature = map.getPackedFeature(i);
      const dataIndex = i * 4 * 2;

      const app = ovr.getAppearance(
        feature.elementId.lower, feature.elementId.upper,
        feature.subCategoryId.lower, feature.subCategoryId.upper,
        feature.geometryClass,
        modelIdParts.lower, modelIdParts.upper, map.type, feature.animationNodeId);

      if (undefined === app || app.isFullyTransparent) {
        // The feature is not visible. We don't care about any of the other overrides, because we're not going to render it.
        data.setOvrFlagsAtIndex(dataIndex, OvrFlags.Visibility);
        nHidden++;
        nOverridden++;
        continue;
      }

      let flags = OvrFlags.None;
      if (isModelHilited || isFeatureHilited(feature, hilites)) {
        flags |= OvrFlags.Hilited;
        this.anyHilited = true;
      }

      if (app.overridesRgb && app.rgb) {
        flags |= OvrFlags.Rgb;
        const rgb = app.rgb;
        data.setByteAtIndex(dataIndex + 4, rgb.r);
        data.setByteAtIndex(dataIndex + 5, rgb.g);
        data.setByteAtIndex(dataIndex + 6, rgb.b);
      }

      if (undefined !== app.transparency) {
        // transparency in range [0, 1]...convert to byte and invert so 0=transparent...
        flags |= OvrFlags.Alpha;
        let alpha = 1.0 - app.transparency;
        alpha = Math.floor(0xff * alpha + 0.5);
        if ((0xff - alpha) < DisplayParams.minTransparency)
          alpha = 0xff;

        data.setByteAtIndex(dataIndex + 7, alpha);
        if (0xff === alpha)
          this.anyOpaque = true;
        else
          this.anyTranslucent = true;
      }

      if (app.overridesWeight && app.weight) {
        flags |= OvrFlags.Weight;
        let weight = app.weight;
        weight = Math.min(31, weight);
        weight = Math.max(1, weight);
        data.setByteAtIndex(dataIndex + 1, weight);
      }

      if (app.overridesLinePixels && app.linePixels) {
        flags |= OvrFlags.LineCode;
        const lineCode = LineCode.valueFromLinePixels(app.linePixels);
        data.setByteAtIndex(dataIndex + 2, lineCode);
      }

      if (app.ignoresMaterial)
        flags |= OvrFlags.IgnoreMaterial;

      if (undefined !== flashedIdParts && feature.elementId.lower === flashedIdParts.lower && feature.elementId.upper === flashedIdParts.upper)
        flags |= OvrFlags.Flashed;

      data.setByteAtIndex(dataIndex + 3, app.nonLocatable ? 1 : 0);

      data.setOvrFlagsAtIndex(dataIndex, flags);
      if (OvrFlags.None !== flags || app.nonLocatable)
        nOverridden++;
    }

    this.allHidden = (nHidden === map.numFeatures);
    this.anyOverridden = (nOverridden > 0);
  }

  // NB: If hilites is undefined, it means that the hilited set has not changed.
  private updateFlashedAndHilited(data: Texture2DDataUpdater, map: PackedFeatureTable, flashed?: Id64.Uint32Pair, hilites?: Hilites) {
    this.anyOverridden = this.anyHilited = false;

    let isModelHilited = false;
    let needElemId = undefined !== flashed;
    let needSubCatId = false;
    if (undefined !== hilites) {
      const modelId = Id64.getUint32Pair(map.modelId);
      isModelHilited = hilites.models.has(modelId.lower, modelId.upper);
      needSubCatId = !isModelHilited && !hilites.subcategories.isEmpty;
      needElemId = needElemId || (!isModelHilited && !hilites.elements.isEmpty);
    }

    for (let i = 0; i < map.numFeatures; i++) {
      const dataIndex = i * 4 * 2;
      const oldFlags = data.getFlagsAtIndex(dataIndex);
      if (OvrFlags.None !== (oldFlags & OvrFlags.Visibility)) {
        // Do the same thing as when applying feature overrides - if it's invisible, none of the other flags matter
        // (and if we don't check this we can end up rendering silhouettes around invisible elements in selection set)
        this.anyOverridden = true;
        continue;
      }

      let isFlashed = false;
      let isHilited = undefined !== hilites ? isModelHilited : (0 !== (oldFlags & OvrFlags.Hilited));

      if (needElemId) {
        const elemId = map.getElementIdPair(i);
        if (undefined !== flashed)
          isFlashed = elemId.lower === flashed.lower && elemId.upper === flashed.upper;

        if (!isHilited && undefined !== hilites)
          isHilited = hilites.elements.has(elemId.lower, elemId.upper);
      }

      if (needSubCatId && !isHilited) {
        const subcat = map.getSubCategoryIdPair(i);
        isHilited = hilites!.subcategories.has(subcat.lower, subcat.upper);
      }

      let newFlags = isFlashed ? (oldFlags | OvrFlags.Flashed) : (oldFlags & ~OvrFlags.Flashed);
      newFlags = isHilited ? (newFlags | OvrFlags.Hilited) : (newFlags & ~OvrFlags.Hilited);

      data.setOvrFlagsAtIndex(dataIndex, newFlags);
      if (OvrFlags.None !== newFlags) {
        this.anyOverridden = true;
        this.anyHilited = this.anyHilited || isHilited;
      }
    }
  }

  private constructor(target: Target) {
    this.target = target;
  }

  public static createFromTarget(target: Target) {
    return new FeatureOverrides(target);
  }

  public dispose() {
    dispose(this.lut);
    this.lut = undefined;
  }

  public initFromMap(map: PackedFeatureTable) {
    const nFeatures = map.numFeatures;
    assert(0 < nFeatures);

    this.lut = undefined;

    const ovrs: FeatureSymbology.Overrides = this.target.currentFeatureSymbologyOverrides;
    this._mostRecentSymbologyOverrides = ovrs;
    const hilite = this.target.hilites;
    this.lut = this._initialize(map, ovrs, hilite, this.target.flashed);
    this._lastFlashUpdated = this._lastHiliteUpdated = BeTimePoint.now();
  }

  public update(features: PackedFeatureTable) {
    let ovrs: FeatureSymbology.Overrides | undefined = this.target.currentFeatureSymbologyOverrides;
    const ovrsUpdated = ovrs !== this._mostRecentSymbologyOverrides;
    if (ovrsUpdated)
      this._mostRecentSymbologyOverrides = ovrs;
    else
      ovrs = undefined;

    const flashLastUpdated = this.target.flashedUpdateTime;
    const hiliteLastUpdated = this.target.hiliteUpdateTime;
    const hiliteUpdated = this._lastHiliteUpdated.before(hiliteLastUpdated);

    const hilite = this.target.hilites;
    if (ovrsUpdated || hiliteUpdated || this._lastFlashUpdated.before(flashLastUpdated)) {
      this._update(features, this.lut!, this.target.flashed, undefined !== ovrs || hiliteUpdated ? hilite : undefined, ovrs);

      this._lastFlashUpdated = flashLastUpdated;
      this._lastHiliteUpdated = hiliteLastUpdated;
    }
  }
}

/** @internal */
export abstract class Graphic extends RenderGraphic {
  public abstract addCommands(_commands: RenderCommands): void;
  public get isPickable(): boolean { return false; }
  public addHiliteCommands(_commands: RenderCommands, _batch: Batch, _pass: RenderPass): void { assert(false); }
  public toPrimitive(): Primitive | undefined { return undefined; }
}

/** Transiently assigned to a Batch while rendering a frame, reset afterward. Used to provide context for pick IDs.
 * @internal
 */
export interface BatchContext {
  batchId: number;
  iModel?: IModelConnection;
}

/** @internal */
export class Batch extends Graphic {
  public readonly graphic: RenderGraphic;
  public readonly featureTable: PackedFeatureTable;
  public readonly range: ElementAlignedBox3d;
  public readonly tileId?: string; // Chiefly for debugging.
  private readonly _context: BatchContext = { batchId: 0 };
  private _overrides: FeatureOverrides[] = [];

  public get batchId() { return this._context.batchId; }
  public get batchIModel() { return this._context.iModel; }
  public setContext(batchId: number, iModel: IModelConnection | undefined) {
    this._context.batchId = batchId;
    this._context.iModel = iModel;
  }
  public resetContext() {
    this._context.batchId = 0;
    this._context.iModel = undefined;
  }

  public constructor(graphic: RenderGraphic, features: PackedFeatureTable, range: ElementAlignedBox3d, tileId?: string) {
    super();
    this.graphic = graphic;
    this.featureTable = features;
    this.range = range;
    this.tileId = tileId;
  }

  // Note: This does not remove FeatureOverrides from the array, but rather disposes of the WebGL resources they contain
  public dispose() {
    dispose(this.graphic);
    for (const over of this._overrides) {
      over.target.onBatchDisposed(this);
      dispose(over);
    }
    this._overrides.length = 0;
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    this.graphic.collectStatistics(stats);
    stats.addFeatureTable(this.featureTable.byteLength);
    for (const ovrs of this._overrides)
      stats.addFeatureOverrides(ovrs.byteLength);
  }

  public addCommands(commands: RenderCommands): void { commands.addBatch(this); }
  public get isPickable(): boolean { return true; }

  public getOverrides(target: Target): FeatureOverrides {
    let ret: FeatureOverrides | undefined;

    for (const ovr of this._overrides) {
      if (ovr.target === target) {
        ret = ovr;
        break;
      }
    }

    if (undefined === ret) {
      ret = FeatureOverrides.createFromTarget(target);
      this._overrides.push(ret);
      target.addBatch(this);
      ret.initFromMap(this.featureTable);
    }

    ret.update(this.featureTable);
    return ret;
  }

  public onTargetDisposed(target: Target) {
    let index = 0;
    let foundIndex = -1;

    for (const ovr of this._overrides) {
      if (ovr.target === target) {
        foundIndex = index;
        break;
      }
      index++;
    }

    if (foundIndex > -1) {
      dispose(this._overrides[foundIndex]);
      this._overrides.splice(foundIndex, 1);
    }
  }
}

// NB: This import MUST happen after Graphic is defined or a circular dependency is introduced.
import { PlanarClassifier } from "./PlanarClassifier";

/** @internal */
export class Branch extends Graphic {
  public readonly branch: GraphicBranch;
  public localToWorldTransform: Transform;
  public clips?: ClipPlanesVolume | ClipMaskVolume;
  public planarClassifier?: PlanarClassifier;
  public textureDrape?: TextureDrape;
  public readonly animationId?: number;
  public readonly iModel?: IModelConnection; // used chiefly for readPixels to identify context of picked Ids.

  public constructor(branch: GraphicBranch, localToWorld: Transform, viewFlags?: ViewFlags, opts?: GraphicBranchOptions) {
    super();
    this.branch = branch;
    this.localToWorldTransform = localToWorld;

    if (undefined !== viewFlags)
      branch.setViewFlags(viewFlags);

    if (undefined !== opts) {
      this.clips = opts.clipVolume as any;
      this.iModel = opts.iModel;

      if (undefined !== opts.classifierOrDrape) {
        if (opts.classifierOrDrape instanceof PlanarClassifier)
          this.planarClassifier = opts.classifierOrDrape;
        else
          this.textureDrape = opts.classifierOrDrape as TextureDrape;
      }
    }
  }

  public dispose() { this.branch.dispose(); }
  public collectStatistics(stats: RenderMemory.Statistics): void {
    this.branch.collectStatistics(stats);
    if (undefined !== this.clips)
      this.clips.collectStatistics(stats);
  }

  public addCommands(commands: RenderCommands): void { commands.addBranch(this); }
  public addHiliteCommands(commands: RenderCommands, batch: Batch, pass: RenderPass): void { commands.addHiliteBranch(this, batch, pass); }
}

/** @internal */
export class WorldDecorations extends Branch {
  public constructor(viewFlags: ViewFlags) {
    super(new GraphicBranch(), Transform.identity, viewFlags);

    // World decorations ignore all the symbology overrides for the "scene" geometry...
    this.branch.symbologyOverrides = new FeatureSymbology.Overrides();
  }

  public init(decs: GraphicList): void {
    this.branch.clear();
    for (const dec of decs) {
      this.branch.add(dec);
    }
  }
}
/** @internal */
export class GraphicsArray extends Graphic {
  // Note: We assume the graphics array we get contains undisposed graphics to start
  constructor(public graphics: RenderGraphic[]) { super(); }

  public dispose() {
    for (const graphic of this.graphics)
      dispose(graphic);
    this.graphics.length = 0;
  }

  public addCommands(commands: RenderCommands): void {
    for (const graphic of this.graphics) {
      (graphic as Graphic).addCommands(commands);
    }
  }

  public addHiliteCommands(commands: RenderCommands, batch: Batch, pass: RenderPass): void {
    for (const graphic of this.graphics) {
      (graphic as Graphic).addHiliteCommands(commands, batch, pass);
    }
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    for (const graphic of this.graphics)
      graphic.collectStatistics(stats);
  }
}
