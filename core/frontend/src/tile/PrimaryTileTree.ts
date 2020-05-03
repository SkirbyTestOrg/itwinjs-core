/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, compareBooleans, compareStrings, Id64String } from "@bentley/bentleyjs-core";
import { Range3d, Transform } from "@bentley/geometry-core";
import { BatchType, compareIModelTileTreeIds, iModelTileTreeIdToString, PrimaryTileTreeId, ViewFlagOverrides } from "@bentley/imodeljs-common";
import { IModelApp } from "../IModelApp";
import { IModelConnection } from "../IModelConnection";
import { GeometricModelState } from "../ModelState";
import { SceneContext } from "../ViewContext";
import { ViewState, ViewState3d } from "../ViewState";
import {
  IModelTileTree, IModelTileTreeParams, iModelTileTreeParamsFromJSON, TileDrawArgs, TileGraphicType, TileTree, TileTreeOwner, TileTreeReference,
  TileTreeSupplier,
} from "./internal";

interface PrimaryTreeId {
  readonly treeId: PrimaryTileTreeId;
  readonly modelId: Id64String;
  readonly is3d: boolean;
  readonly guid: string | undefined;
  readonly isPlanProjection: boolean;
}

class PlanProjectionTileTree extends IModelTileTree {
  public readonly baseElevation: number;

  public constructor(params: IModelTileTreeParams, baseElevation: number) {
    super(params);
    this.baseElevation = baseElevation;
  }
}

class PrimaryTreeSupplier implements TileTreeSupplier {
  public compareTileTreeIds(lhs: PrimaryTreeId, rhs: PrimaryTreeId): number {
    // NB: We intentionally do not compare the guids. They are expected to be equal if the modelIds are equal.
    // Similarly we don't compare isPlanProjection - it should always have the same value for a given modelId.
    let cmp = compareStrings(lhs.modelId, rhs.modelId);
    if (0 === cmp) {
      cmp = compareBooleans(lhs.is3d, rhs.is3d);
      if (0 === cmp) {
        cmp = compareIModelTileTreeIds(lhs.treeId, rhs.treeId);
      }
    }

    return cmp;
  }

  public async createTileTree(id: PrimaryTreeId, iModel: IModelConnection): Promise<TileTree | undefined> {
    const treeId = id.treeId;
    const idStr = iModelTileTreeIdToString(id.modelId, treeId, IModelApp.tileAdmin);
    const props = await iModel.tiles.getTileTreeProps(idStr);

    const options = {
      edgesRequired: treeId.edgesRequired,
      allowInstancing: undefined === treeId.animationId && !treeId.enforceDisplayPriority,
      is3d: id.is3d,
      batchType: BatchType.Primary,
    };

    const params = iModelTileTreeParamsFromJSON(props, iModel, id.modelId, id.guid, options);
    if (!id.isPlanProjection)
      return new IModelTileTree(params);

    let elevation = 0;
    try {
      const ranges = await iModel.models.queryModelRanges(id.modelId);
      if (1 === ranges.length) {
        const range = Range3d.fromJSON(ranges[0]);
        const lo = range.low.z;
        const hi = range.high.z;
        if (lo <= hi)
          elevation = (lo + hi) / 2;
      }
    } catch (_err) {
      //
    }

    return new PlanProjectionTileTree(params, elevation);
  }

  public getOwner(id: PrimaryTreeId, iModel: IModelConnection): TileTreeOwner {
    return iModel.tiles.getTileTreeOwner(id, this);
  }
}

const primaryTreeSupplier = new PrimaryTreeSupplier();

class PrimaryTreeReference extends TileTreeReference {
  protected readonly _view: ViewState;
  protected readonly _model: GeometricModelState;
  protected _id: PrimaryTreeId;
  private _owner: TileTreeOwner;

  public constructor(view: ViewState, model: GeometricModelState, isPlanProjection: boolean) {
    super();
    this._view = view;
    this._model = model;
    this._id = {
      modelId: model.id,
      is3d: model.is3d,
      treeId: this.createTreeId(view, model.id),
      guid: model.geometryGuid,
      isPlanProjection,
    };

    this._owner = primaryTreeSupplier.getOwner(this._id, model.iModel);
  }

  public get castsShadows() {
    return true;
  }

  public get treeOwner(): TileTreeOwner {
    const newId = this.createTreeId(this._view, this._id.modelId);
    if (0 !== compareIModelTileTreeIds(newId, this._id.treeId)) {
      this._id = {
        modelId: this._id.modelId,
        is3d: this._id.is3d,
        treeId: newId,
        guid: this._id.guid,
        isPlanProjection: this._id.isPlanProjection,
      };

      this._owner = primaryTreeSupplier.getOwner(this._id, this._model.iModel);
    }

    return this._owner;
  }

  protected createTreeId(view: ViewState, modelId: Id64String): PrimaryTileTreeId {
    const script = view.scheduleScript;
    const animationId = undefined !== script ? script.getModelAnimationId(modelId) : undefined;
    const edgesRequired = view.viewFlags.edgesRequired();
    return { type: BatchType.Primary, edgesRequired, animationId };
  }
}

class PlanProjectionTreeReference extends PrimaryTreeReference {
  private get _view3d() { return this._view as ViewState3d; }
  private _curTransform?: { transform: Transform, elevation: number };
  private readonly _viewFlagOverrides = new ViewFlagOverrides();

  public constructor(view: ViewState3d, model: GeometricModelState) {
    super(view, model, true);
    this._viewFlagOverrides.setForceSurfaceDiscard(true);
  }

  public get castsShadows() {
    return false;
  }

  protected getViewFlagOverrides(_tree: TileTree) {
    return this._viewFlagOverrides;
  }

  public createDrawArgs(context: SceneContext): TileDrawArgs | undefined {
    const args = super.createDrawArgs(context);
    if (undefined !== args && this._id.treeId.enforceDisplayPriority) {
      args.drawGraphics = () => {
        const graphics = args.produceGraphics();
        if (undefined !== graphics) {
          const settings = this.getSettings();
          const asOverlay = undefined !== settings && settings.overlay;
          const transparency = settings?.transparency || 0;

          assert(undefined !== this._curTransform);
          context.outputGraphic(context.target.renderSystem.createGraphicLayerContainer(graphics, asOverlay, transparency, this._curTransform.elevation));
        }
      };
    }

    return args;
  }

  protected computeTransform(tree: TileTree): Transform {
    assert(tree instanceof PlanProjectionTileTree);
    const settings = this.getSettings();
    const elevation = settings?.elevation ?? (tree as PlanProjectionTileTree).baseElevation;
    if (undefined === this._curTransform) {
      this._curTransform = { transform: tree.iModelTransform.clone(), elevation };
    } else if (this._curTransform.elevation !== elevation) {
      const transform = tree.iModelTransform.clone();
      if (undefined !== settings?.elevation)
        transform.origin.z = elevation;

      this._curTransform.transform = transform;
      this._curTransform.elevation = elevation;
    }

    return this._curTransform.transform;
  }

  public draw(args: TileDrawArgs): void {
    const settings = this.getSettings();
    if (undefined === settings || settings.enforceDisplayPriority || !settings.overlay)
      super.draw(args);
    else
      args.context.withGraphicType(TileGraphicType.Overlay, () => args.tree.draw(args));
  }

  private getSettings() {
    return this._view3d.getDisplayStyle3d().settings.getPlanProjectionSettings(this._model.id);
  }

  protected createTreeId(view: ViewState, modelId: Id64String): PrimaryTileTreeId {
    const id = super.createTreeId(view, modelId);
    const settings = this.getSettings();
    if (undefined !== settings && settings.enforceDisplayPriority)
      id.enforceDisplayPriority = true;

    return id;
  }
}

/** @internal */
export function createPrimaryTileTreeReference(view: ViewState, model: GeometricModelState): TileTreeReference {
  if (IModelApp.renderSystem.options.planProjections) {
    const model3d = view.is3d() ? model.asGeometricModel3d : undefined;
    if (undefined !== model3d && model3d.isPlanProjection)
      return new PlanProjectionTreeReference(view as ViewState3d, model);
  }

  return new PrimaryTreeReference(view, model, false);
}
