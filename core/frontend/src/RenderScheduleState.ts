/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Views */

import { RenderSchedule, RgbColor, TileTreeProps, BatchType } from "@bentley/imodeljs-common";
import { Range1d, Transform, Point3d, Vector3d, Matrix3d, Plane3dByOriginAndUnitNormal, ClipPlane, ConvexClipPlaneSet, UnionOfConvexClipPlaneSets, Point4d } from "@bentley/geometry-core";
import { Id64String, Id64 } from "@bentley/bentleyjs-core";
import { FeatureSymbology } from "./render/FeatureSymbology";
import { TileTreeModelState } from "./ModelState";
import { IModelConnection } from "./IModelConnection";
import { TileTree, TileTreeState, IModelTileLoader } from "./tile/TileTree";
import { IModelApp } from "./IModelApp";
import { ClipPlanesVolume } from "./render/webgl/ClipVolume";
import { AnimationBranchStates, AnimationBranchState } from "./render/System";

export namespace RenderScheduleState {
  class Interval {
    constructor(public index0: number = 0, public index1: number = 0, public fraction: number = 0.0) { }
    public init(index0: number, index1: number, fraction: number) { this.index0 = index0; this.index1 = index1; this.fraction = fraction; }
  }
  function interpolate(value0: number, value1: number, fraction: number) {
    return value0 + fraction * (value1 - value0);
  }
  export class TimelineEntry implements RenderSchedule.TimelineEntryProps {
    public time: number;
    public interpolation: number;
    constructor(props: RenderSchedule.TimelineEntryProps) {
      this.time = props.time;
      this.interpolation = props.interpolation;
    }
  }
  export class VisibilityEntry extends TimelineEntry implements RenderSchedule.VisibilityEntryProps {
    public value: number = 100.0;
    constructor(props: RenderSchedule.VisibilityEntryProps) {
      super(props);
      this.value = props.value;
    }
  }
  export class ColorEntry extends TimelineEntry implements RenderSchedule.ColorEntryProps {
    public value: { red: number, green: number, blue: number };
    constructor(props: RenderSchedule.ColorEntryProps) {
      super(props);
      this.value = props.value;
    }
  }

  export class TransformEntry extends TimelineEntry implements RenderSchedule.TransformEntryProps {
    public value: RenderSchedule.TransformProps;
    constructor(props: RenderSchedule.TransformEntryProps) {
      super(props);
      this.value = props.value;
    }
  }
  export class CuttingPlaneEntry extends TimelineEntry implements RenderSchedule.CuttingPlaneEntryProps {
    public value: RenderSchedule.CuttingPlaneProps;
    constructor(props: RenderSchedule.CuttingPlaneEntryProps) {
      super(props);
      this.value = props.value;
    }
  }
  export class ElementTimeline implements RenderSchedule.ElementTimelineProps {
    public currentClip: ClipPlanesVolume | undefined = undefined;
    public elementIds: Id64String[];
    public visibilityTimeline?: VisibilityEntry[];
    public colorTimeline?: ColorEntry[];
    public transformTimeline?: TransformEntry[];
    public cuttingPlaneTimeline?: CuttingPlaneEntry[];
    public get isValid() { return this.elementIds.length > 0 && (Array.isArray(this.visibilityTimeline) && this.visibilityTimeline.length > 0) || (Array.isArray(this.colorTimeline) && this.colorTimeline.length > 0); }
    private constructor(elementIds: Id64String[]) { this.elementIds = elementIds; }
    public static fromJSON(json?: RenderSchedule.ElementTimelineProps): ElementTimeline {
      if (!json)
        return new ElementTimeline([]);

      const val = new ElementTimeline(json.elementIds);
      if (json.visibilityTimeline) {
        val.visibilityTimeline = [];
        json.visibilityTimeline.forEach((entry) => val.visibilityTimeline!.push(new VisibilityEntry(entry)));
      }
      if (json.colorTimeline) {
        val.colorTimeline = [];
        json.colorTimeline.forEach((entry) => val.colorTimeline!.push(new ColorEntry(entry)));
      }
      if (json.transformTimeline) {
        val.transformTimeline = [];
        json.transformTimeline.forEach((entry) => val.transformTimeline!.push(new TransformEntry(entry)));
      }
      if (json.cuttingPlaneTimeline) {
        val.cuttingPlaneTimeline = [];
        json.cuttingPlaneTimeline.forEach((entry) => val.cuttingPlaneTimeline!.push(new CuttingPlaneEntry(entry)));
      }
      return val;
    }
    public get duration() {
      const duration = Range1d.createNull();
      if (this.visibilityTimeline) this.visibilityTimeline.forEach((entry) => duration.extendX(entry.time));
      if (this.colorTimeline) this.colorTimeline.forEach((entry) => duration.extendX(entry.time));
      if (this.transformTimeline) this.transformTimeline.forEach((entry) => duration.extendX(entry.time));
      if (this.cuttingPlaneTimeline) this.cuttingPlaneTimeline.forEach((entry) => duration.extendX(entry.time));

      return duration;
    }
    public get containsFeatureOverrides() { return undefined !== this.visibilityTimeline || undefined !== this.colorTimeline; }
    public get containsAnimation() { return undefined !== this.transformTimeline || undefined !== this.cuttingPlaneTimeline; }

    private static findTimelineInterval(interval: Interval, time: number, timeline?: TimelineEntry[]) {
      if (!timeline || timeline.length === 0)
        return false;

      if (time < timeline[0].time) {
        interval.init(0, 0, 0);
        return true;
      }
      const last = timeline.length - 1;
      if (time >= timeline[last].time) {
        interval.init(last, last, 0.0);
        return true;
      }
      let i: number;
      for (i = 0; i < last; i++)
        if (timeline[i].time <= time && timeline[i + 1].time >= time) {
          interval.init(i, i + 1, timeline[i].interpolation === 2 ? ((time - timeline[i].time) / (timeline[i + 1].time - timeline[i].time)) : 0.0);
          break;
        }
      return true;
    }

    public getSymbologyOverrides(overrides: FeatureSymbology.Overrides, time: number, interval: Interval, batchId: number) {
      let colorOverride, transparencyOverride;

      if (ElementTimeline.findTimelineInterval(interval, time, this.visibilityTimeline) && this.visibilityTimeline![interval.index0].value !== null) {
        const timeline = this.visibilityTimeline!;
        let visibility = timeline[interval.index0].value;
        if (interval.fraction > 0)
          visibility = interpolate(visibility, timeline[interval.index1].value, interval.fraction);

        if (visibility <= 0) {
          overrides.setBatchNeverDrawn(batchId);
          return;
        }
        if (visibility <= 100)
          transparencyOverride = 1.0 - visibility / 100.0;
      }
      if (ElementTimeline.findTimelineInterval(interval, time, this.colorTimeline) && this.colorTimeline![interval.index0].value !== null) {
        const entry0 = this.colorTimeline![interval.index0].value;
        if (interval.fraction > 0) {
          const entry1 = this.colorTimeline![interval.index1].value;
          colorOverride = new RgbColor(interpolate(entry0.red, entry1.red, interval.fraction), interpolate(entry0.green, entry1.green, interval.fraction), interpolate(entry0.blue, entry1.blue, interval.fraction));
        } else
          colorOverride = new RgbColor(entry0.red, entry0.green, entry0.blue);
      }

      if (colorOverride || transparencyOverride)
        overrides.overrideBatch(batchId, FeatureSymbology.Appearance.fromJSON({ rgb: colorOverride, transparency: transparencyOverride }));
    }
    public getAnimationTransform(time: number, interval: Interval): Transform | undefined {
      if (!ElementTimeline.findTimelineInterval(interval, time, this.transformTimeline) || this.transformTimeline![interval.index0].value === null)
        return undefined;

      if (interval.index0 < 0)
        return Transform.createIdentity();

      const timeline = this.transformTimeline!;
      const value = timeline[interval.index0].value;
      const transform = Transform.fromJSON(value.transform);
      if (interval.fraction > 0.0) {
        const value1 = timeline[interval.index1].value;
        if (value1.pivot !== null && value1.orientation !== null && value1.position !== null) {
          const q0 = Point4d.fromJSON(value.orientation), q1 = Point4d.fromJSON(value1.orientation);
          const sum = Point4d.interpolateQuaternions(q0, interval.fraction, q1);
          const interpolatedMatrix = Matrix3d.createFromQuaternion(sum);
          const position0 = Vector3d.fromJSON(value.position), position1 = Vector3d.fromJSON(value1.position);
          const pivot = Vector3d.fromJSON(value.pivot);
          const pre = Transform.createTranslation(pivot);
          const post = Transform.createTranslation(position0.interpolate(interval.fraction, position1));
          const product = post.multiplyTransformMatrix3d(interpolatedMatrix);
          transform.setFromJSON(product.multiplyTransformTransform(pre));
        } else {
          const transform1 = Transform.fromJSON(value1.transform);
          const q0 = transform.matrix.inverse()!.toQuaternion(), q1 = transform1.matrix.inverse()!.toQuaternion();
          const sum = Point4d.interpolateQuaternions(q0, interval.fraction, q1);
          const interpolatedMatrix = Matrix3d.createFromQuaternion(sum);

          const origin = Vector3d.createFrom(transform.origin), origin1 = Vector3d.createFrom(transform1.origin);
          transform.setFromJSON({ origin: origin.interpolate(interval.fraction, origin1), matrix: interpolatedMatrix });
        }
      }
      return transform;
    }

    public getAnimationClip(time: number, interval: Interval): ClipPlanesVolume | undefined {
      if (this.currentClip) {
        this.currentClip.dispose();
        this.currentClip = undefined;
      }
      if (!ElementTimeline.findTimelineInterval(interval, time, this.cuttingPlaneTimeline) || this.cuttingPlaneTimeline![interval.index0].value === null)
        return undefined;

      const timeline = this.cuttingPlaneTimeline!;
      const value = timeline[interval.index0].value;
      if (!value)
        return undefined;

      const position = Point3d.fromJSON(value.position);
      const direction = Vector3d.fromJSON(value.direction);
      if (interval.fraction > 0.0) {
        const value1 = timeline[interval.index1].value;
        position.interpolate(interval.fraction, Point3d.fromJSON(value1.position), position);
        direction.interpolate(interval.fraction, Vector3d.fromJSON(value1.direction), direction);
      }

      direction.normalizeInPlace();
      const plane = Plane3dByOriginAndUnitNormal.create(position, direction);
      const clipPlane = ClipPlane.createPlane(plane!);
      const clipPlaneSet = UnionOfConvexClipPlaneSets.createConvexSets([ConvexClipPlaneSet.createPlanes([clipPlane])]);

      return (this.currentClip = ClipPlanesVolume.createFromClipPlaneSet(clipPlaneSet));
    }
  }

  class AnimationModelState implements TileTreeModelState {
    private _iModel: IModelConnection;
    private _modelId: Id64String;
    private _displayStyleId: Id64String;
    protected _tileTreeState: TileTreeState;
    constructor(modelId: Id64String, displayStyleId: Id64String, iModel: IModelConnection) { this._modelId = modelId; this._displayStyleId = displayStyleId, this._iModel = iModel; this._tileTreeState = new TileTreeState(iModel, true, modelId); }

    public get tileTree(): TileTree | undefined { return this._tileTreeState.tileTree; }
    public get loadStatus(): TileTree.LoadStatus { return this._tileTreeState.loadStatus; }
    /** @hidden */
    public loadTileTree(_asClassifier?: boolean, _classifierExpansion?: number): TileTree.LoadStatus {
      if (TileTree.LoadStatus.NotLoaded !== this._tileTreeState.loadStatus)
        return this._tileTreeState.loadStatus;

      this._tileTreeState.loadStatus = TileTree.LoadStatus.Loading;
      const id = "A:" + this._displayStyleId + "_" + this._modelId;

      this._iModel.tiles.getTileTreeProps(id).then((result: TileTreeProps) => {
        this._tileTreeState.setTileTree(result, new IModelTileLoader(this._iModel, BatchType.Primary));
        IModelApp.viewManager.onNewTilesReady();
      }).catch((_err) => {
        this._tileTreeState.loadStatus = TileTree.LoadStatus.NotFound; // on separate line because stupid chrome debugger.
      });

      return this._tileTreeState.loadStatus;
    }
  }
  export class ModelTimeline implements RenderSchedule.ModelTimelineProps {
    public modelId: Id64String;
    public elementTimelines: ElementTimeline[] = [];
    public containsFeatureOverrides: boolean = false;
    public containsAnimation: boolean = false;
    public animationModel?: AnimationModelState;
    private constructor(modelId: Id64String) { this.modelId = modelId; }
    public get duration() {
      const duration = Range1d.createNull();
      this.elementTimelines.forEach((element) => duration.extendRange(element.duration));
      return duration;
    }

    public static fromJSON(json?: RenderSchedule.ModelTimelineProps) {
      if (!json)
        return new ModelTimeline("");

      const value = new ModelTimeline(json.modelId);
      if (json.elementTimelines)
        json.elementTimelines.forEach((element) => {
          const elementTimeline = ElementTimeline.fromJSON(element);
          value.elementTimelines.push(elementTimeline);
          if (elementTimeline.containsFeatureOverrides)
            value.containsFeatureOverrides = true;
          if (elementTimeline.containsAnimation)
            value.containsAnimation = true;
        });

      return value;
    }
    public getSymbologyOverrides(overrides: FeatureSymbology.Overrides, time: number, nextBatchId: number) { const interval = new Interval(); this.elementTimelines.forEach((entry) => entry.getSymbologyOverrides(overrides, time, interval, nextBatchId++)); }
    public forEachAnimatedId(idFunction: (id: Id64String) => void): void {
      if (this.containsAnimation) {
        for (const timeline of this.elementTimelines)
          if (timeline.containsAnimation)
            for (const id of timeline.elementIds)
              idFunction(id);
      }
    }
    public getAnimationBranches(branches: AnimationBranchStates, scheduleTime: number) {
      const interval = new Interval();
      for (let i = 0; i < this.elementTimelines.length; i++) {
        const transform = this.elementTimelines[i].getAnimationTransform(scheduleTime, interval);
        const clip = this.elementTimelines[i].getAnimationClip(scheduleTime, interval);
        if (transform || clip)
          branches.set(this.modelId + "_Node_" + (i + 1).toString(), new AnimationBranchState(transform, clip));
      }
    }
    public initBatchMap(batchMap: Id64.Uint32Map<number>, nextBatchId: number) {
      for (const timeline of this.elementTimelines) {
        for (const id of timeline.elementIds)
          batchMap.setById(id, nextBatchId);

        nextBatchId++;
      }
    }
  }

  export class Script {
    public modelTimelines: ModelTimeline[] = [];
    public iModel: IModelConnection;
    public displayStyleId: Id64String;
    private _batchMap = new Id64.Uint32Map<number>();

    constructor(displayStyleId: Id64String, iModel: IModelConnection) { this.displayStyleId = displayStyleId; this.iModel = iModel; }
    public static fromJSON(displayStyleId: Id64String, iModel: IModelConnection, modelTimelines: RenderSchedule.ModelTimelineProps[]): Script | undefined {
      const value = new Script(displayStyleId, iModel);
      modelTimelines.forEach((entry) => value.modelTimelines.push(ModelTimeline.fromJSON(entry)));
      value.initBatchMap();
      return value;
    }
    public initBatchMap() {
      const nextBatchId = 0;
      this.modelTimelines.forEach((modelTimeline) => modelTimeline.initBatchMap(this._batchMap, nextBatchId));
    }
    public get containsAnimation() {
      for (const modelTimeline of this.modelTimelines)
        if (modelTimeline.containsAnimation)
          return true;
      return false;
    }
    public getAnimationBranches(scheduleTime: number): AnimationBranchStates | undefined {
      if (!this.containsAnimation)
        return undefined;

      const animationBranches = new Map<string, AnimationBranchState>();
      this.modelTimelines.forEach((modelTimeline) => modelTimeline.getAnimationBranches(animationBranches, scheduleTime));
      return animationBranches;
    }

    public get duration() {
      const duration = Range1d.createNull();
      this.modelTimelines.forEach((model) => duration.extendRange(model.duration));
      return duration;
    }

    public get containsFeatureOverrides() {
      let containsFeatureOverrides = false;
      this.modelTimelines.forEach((entry) => { if (entry.containsFeatureOverrides) containsFeatureOverrides = true; });
      return containsFeatureOverrides;
    }

    public getSymbologyOverrides(overrides: FeatureSymbology.Overrides, time: number) {
      overrides.batchMap = this._batchMap;   // Is it necessary to clone this??
      const batchId = 0;
      this.modelTimelines.forEach((entry) => entry.getSymbologyOverrides(overrides, time, batchId));
    }

    public forEachAnimationModel(tileTreeFunction: (model: TileTreeModelState) => void): void {
      for (const modelTimeline of this.modelTimelines) {
        if (modelTimeline.containsAnimation) {
          if (!modelTimeline.animationModel)
            modelTimeline.animationModel = new AnimationModelState(modelTimeline.modelId, this.displayStyleId, this.iModel);
          tileTreeFunction(modelTimeline.animationModel);
        }
      }
    }
  }
}
