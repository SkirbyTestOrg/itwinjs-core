/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module LocatingElements */
import { HitSource, HitDetail, HitList, SnapDetail, SnapMode, HitPriority } from "./HitDetail";
import { Point3d, Point2d } from "@bentley/geometry-core";
import { Viewport, ViewRect } from "./Viewport";
import { BeButtonEvent } from "./tools/Tool";
import { IModelApp } from "./IModelApp";
import { Pixel } from "./rendering";

// tslint:disable:variable-name

/** The possible actions for which a locate filter can be called. */
export const enum LocateAction {
  Identify = 0,
  AutoLocate = 1,
}

/**
 * Values to return from a locate filter.
 *
 * @note It would be rare and extreme for a locate filter to ever return Accept.
 *
 * Usually, filters will return Reject to indicate the element is unacceptable, or Neutral to
 * indicate that the element is acceptable <i>as far as this filter is concerned.</i> By returning Accept, a
 * single filter can cause the element to be accepted, *without calling other filters* that might otherwise reject the element.
 * Indicates the reason an element was rejected by a filter.
 */
export const enum LocateFilterStatus {
  Reject = 0,
  Neutral = 1,
  Accept = 2,
}

export const enum SnapStatus {
  Success = 0,
  Aborted = 1,
  NoElements = 2,
  Disabled = 100,
  NoSnapPossible = 200,
  NotSnappable = 300,
  ModelNotSnappable = 301,
  FilteredByCategory = 400,
  FilteredByUser = 500,
  FilteredByApp = 600,
  FilteredByAppQuietly = 700,
}

export const enum TestHitStatus {
  NotOn = 0,
  IsOn = 1,
}

export class LocateOptions {
  public disableIModelFilter = false;
  public allowDecorations = false;
  public maxHits = 20;
  public hitSource = HitSource.DataPoint;
  public clone(): LocateOptions {
    const other = new LocateOptions();
    other.disableIModelFilter = this.disableIModelFilter;
    other.allowDecorations = this.allowDecorations;
    other.maxHits = this.maxHits;
    other.hitSource = this.hitSource;
    return other;
  }
  public init() { this.disableIModelFilter = false, this.allowDecorations = false; this.maxHits = 20; this.hitSource = HitSource.DataPoint; }
}

export class LocateResponse {
  public snapStatus = SnapStatus.Success;
  public reason?: string;
  public explanation = "";
}

export interface HitListHolder {
  setHitList(list: HitList | undefined): void;
}

export class ElementPicker {
  public viewport?: Viewport;
  public readonly pickPointWorld = new Point3d();
  public hitList?: HitList;

  public empty() {
    this.pickPointWorld.setZero();
    this.viewport = undefined;
    if (this.hitList)
      this.hitList.empty();
    else
      this.hitList = new HitList();
  }

  /** return the HitList for the last Pick performed. Optionally allows the caller to take ownership of the list. */
  public getHitList(takeOwnership: boolean): HitList {
    const list = this.hitList!;
    if (takeOwnership)
      this.hitList = undefined;
    return list;
  }

  public getNextHit(): HitDetail | undefined {
    const list = this.hitList;
    return list ? list.getNextHit() : undefined;
  }

  /** return a particular hit from the list of hits from the last time pickElements was called. */
  public getHit(i: number): HitDetail | undefined {
    const list = this.hitList;
    return list ? list.getHit(i) : undefined;
  }

  public resetCurrentHit(): void {
    const list = this.hitList;
    if (list) list.resetCurrentHit();
  }

  /** Generate a list of elements that are close to a given point. */
  public doPick(vp: Viewport, pickPointWorld: Point3d, pickRadiusView: number, options: LocateOptions): number {
    if (this.hitList && this.hitList.size() > 0 && vp === this.viewport && pickPointWorld.isAlmostEqual(this.pickPointWorld)) {
      this.hitList.resetCurrentHit();
      return this.hitList.size();
    }

    this.empty(); // empty the hit list
    this.viewport = vp;
    this.pickPointWorld.setFrom(pickPointWorld);

    const pickPointView = vp.worldToView(pickPointWorld);
    const testPointView = new Point2d(Math.floor(pickPointView.x + 0.5), Math.floor(pickPointView.y + 0.5));
    const pixelRadius = Math.floor(pickRadiusView + 0.5);
    const rect = new ViewRect(testPointView.x - pixelRadius, testPointView.y - pixelRadius, testPointView.x + pixelRadius, testPointView.y + pixelRadius);
    const pixels = vp.readPixels(rect, Pixel.Selector.All);

    if (undefined === pixels)
      return 0;

    const testPoint = Point2d.createZero();
    for (testPoint.x = testPointView.x - pixelRadius; testPoint.x <= testPointView.x + pixelRadius; ++testPoint.x) {
      for (testPoint.y = testPointView.y - pixelRadius; testPoint.y <= testPointView.y + pixelRadius; ++testPoint.y) {
        const pixel = pixels.getPixel(testPoint.x, testPoint.y);
        if (undefined === pixel || undefined === pixel.elementId)
          continue; // no geometry at this location...
        const distXY = testPointView.distance(testPoint);
        if (distXY > pixelRadius)
          continue; // ignore corners. it's a locate circle not square...
        const hitPointWorld = vp.getPixelDataWorldPoint(pixels, testPoint.x, testPoint.y);
        if (undefined === hitPointWorld)
          continue;
        let priority = HitPriority.Unknown;
        switch (pixel.type) {
          case Pixel.GeometryType.Surface:
            priority = Pixel.Planarity.Planar === pixel.planarity ? HitPriority.PlanarSurface : HitPriority.NonPlanarSurface;
            break;
          case Pixel.GeometryType.Linear:
            priority = HitPriority.WireEdge;
            break;
          case Pixel.GeometryType.Edge:
            priority = Pixel.Planarity.Planar === pixel.planarity ? HitPriority.PlanarEdge : HitPriority.NonPlanarEdge;
            break;
          case Pixel.GeometryType.Silhouette:
            priority = HitPriority.SilhouetteEdge;
            break;
        }
        const hit = new HitDetail(pickPointWorld, vp, options.hitSource, hitPointWorld, pixel.elementId.toString(), priority, distXY, pixel.distanceFraction);
        this.hitList!.addHit(hit);
        if (this.hitList!.hits.length > options.maxHits)
          this.hitList!.hits.length = options.maxHits; // truncate array...
      }
    }
    return this.hitList!.size();
  }

  /**
   * test a (previously generated) hit against a new datapoint (presumes same view)
   * @return true if the point is on the element
   */
  public testHit(hit: HitDetail, hitList: HitList | undefined, vp: Viewport, pickPointWorld: Point3d, pickRadiusView: number, options: LocateOptions): TestHitStatus {
    // if they didn't supply a hit list, and we don't have one, create one.
    if (!hitList && !this.hitList)
      this.empty();

    if (!this.doPick(vp, pickPointWorld, pickRadiusView, options) || undefined === this.hitList)
      return TestHitStatus.NotOn;

    for (let i = 0; i < this.hitList.size(); i++) {
      const thisHit = this.hitList.getHit(i);
      if (!hit.isSameHit(thisHit))
        continue;
      if (hitList)
        hitList = this.getHitList(true);
      return TestHitStatus.IsOn;
    }
    return TestHitStatus.NotOn;
  }
}

export class ElementLocateManager {
  public hitList?: HitList;
  public currHit?: HitDetail;
  public readonly options = new LocateOptions();
  public readonly picker = new ElementPicker();

  /** get the full message key for a locate failure  */
  public static getFailureMessageKey(key: string) { return "LocateFailure." + key; }
  public onInitialized() { }
  public getApertureInches() { return 0.11; }
  public getKeypointDivisor() { return 2; }
  public synchSnapMode() { }
  public onFlashHit(_detail: SnapDetail) { }
  public onAccuSnapMotion(_detail: HitDetail | undefined, _wasHot: boolean, _ev: BeButtonEvent) { }
  public getElementPicker() { return this.picker; }
  public setChosenSnapMode(_snapMode: SnapMode) { }

  public clear(): void { this.setCurrHit(undefined); }
  public setHitList(list?: HitList) { this.hitList = list; }
  public setCurrHit(hit?: HitDetail): void { this.currHit = hit; }
  public getNextHit(): HitDetail | undefined {
    const list = this.hitList;
    return list ? list.getNextHit() : undefined;
  }

  /** return the current path from either the snapping logic or the pre-locating systems. */
  public getPreLocatedHit(): HitDetail | undefined {
    // NOTE: Check AccuSnap first as Tentative is used to build intersect snap. For normal snaps when a Tentative is active there should be no AccuSnap.
    let preLocated = IModelApp.accuSnap.getHitAndList(this);

    if (!preLocated && !!(preLocated = IModelApp.tentativePoint.getHitAndList(this))) {
      const vp = preLocated.viewport!;
      this.picker.empty(); // Get new hit list at hit point; want reset to cycle hits using adjusted point location...
      this.picker.doPick(vp, preLocated.getPoint(), (vp.pixelsFromInches(this.getApertureInches()) / 2.0) + 1.5, this.options);
      this.setHitList(this.picker.getHitList(true));
    }

    if (this.hitList)
      this.hitList.resetCurrentHit();

    return preLocated;
  }

  public getPreferredPointSnapModes(source: HitSource): SnapMode[] {
    const snaps: SnapMode[] = [];

    // The user's finger is likely to create unwanted AccuSnaps
    if (HitSource.AccuSnap === source && !IModelApp.toolAdmin.isCurrentInputSourceMouse())
      return snaps;

    // We need a snap mode UI!!! Removed center and intersection they were just obnoxious. -BB 06/2015
    snaps.push(SnapMode.NearestKeypoint);
    snaps.push(SnapMode.Nearest);
    return snaps;
  }

  public filterHit(hit: HitDetail, _action: LocateAction, out: LocateResponse): boolean {
    // Tools must opt-in to locate of transient geometry as it requires special treatment.
    if (!hit.isElementHit() && !this.options.allowDecorations) {
      out.reason = ElementLocateManager.getFailureMessageKey("Transient");
      return true;
    }

    const tool = IModelApp.toolAdmin.activeTool;
    if (!tool)
      return false;

    const retVal = !tool.onPostLocate(hit, out);
    if (retVal)
      out.reason = ElementLocateManager.getFailureMessageKey("ByCommand");

    return retVal;
  }

  public initLocateOptions() { this.options.init(); }
  public initToolLocate() {
    this.initLocateOptions();
    this.clear();
    this.getElementPicker().empty();
    IModelApp.tentativePoint.clear(true);
  }

  private _doLocate(response: LocateResponse, newSearch: boolean, testPoint: Point3d, vp: Viewport | undefined, filterHits: boolean): HitDetail | undefined {
    if (!vp)
      return;
    // the "newSearch" flag indicates whether the caller wants us to conduct a new search at the testPoint, or just continue
    // returning paths from the previous search.
    if (newSearch) {
      const hit = this.getPreLocatedHit();

      // if we're snapped to something, that path has the highest priority and becomes the active hit.
      if (hit) {
        if (!filterHits || !this.filterHit(hit, LocateAction.Identify, response))
          return hit;

        response = new LocateResponse(); // we have the reason and explanation we want.
      }

      this.picker.empty();
      this.picker.doPick(vp, testPoint, (vp.pixelsFromInches(this.getApertureInches()) / 2.0) + 1.5, this.options);

      const hitList = this.picker.getHitList(true);
      this.setHitList(hitList);
    }

    let newHit: HitDetail | undefined;
    while (undefined !== (newHit = this.getNextHit())) {
      if (!filterHits || !this.filterHit(newHit, LocateAction.Identify, response))
        return newHit;
      response = new LocateResponse(); // we have the reason and explanation we want.
    }

    return undefined;
  }

  public doLocate(response: LocateResponse, newSearch: boolean, testPoint: Point3d, view: Viewport | undefined, filterHits = true): HitDetail | undefined {
    response.reason = ElementLocateManager.getFailureMessageKey("NoElements");
    response.explanation = "";

    const hit = this._doLocate(response, newSearch, testPoint, view, filterHits);
    this.setCurrHit(hit);

    // if we found a hit, remove it from the list of remaining hit near the current search point.
    if (hit && this.hitList)
      this.hitList.removeHitsFrom(hit.sourceId);
    return hit;
  }
}
