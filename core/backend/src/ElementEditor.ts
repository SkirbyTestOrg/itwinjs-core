/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module iModels */

import { GeometryStreamBuilder, GeometricElement3dProps, Placement3d } from "@bentley/imodeljs-common";
import { IModelDb } from "./IModelDb";
import { DbOpcode, BentleyError, IModelStatus, Id64Array, Id64, Logger } from "@bentley/bentleyjs-core";
import { AuthorizedClientRequestContext } from "@bentley/imodeljs-clients";
import { Transform, Point3d, YawPitchRollAngles, IModelJson, GeometryQuery, TransformProps } from "@bentley/geometry-core";
import { GeometricElement3d } from "./Element";
import { BackendLoggerCategory } from "./BackendLoggerCategory";

const loggingCategory = BackendLoggerCategory.Editing;

function deepCopy(obj: any): any {
  return JSON.parse(JSON.stringify(obj));
}

export interface IElementEditor {
  readonly iModel: IModelDb;
}

/**
 * @internal
 */
export class GeometricElement3dEditor implements IElementEditor {
  private _targets: GeometricElement3dEditor.Target[] = [];
  private _stateStack: GeometricElement3dEditor.Target[][] = [];
  public readonly iModel: IModelDb;

  constructor(iModel: IModelDb) {
    this.iModel = iModel;
  }

  private buildGeometry(builder: GeometryStreamBuilder, geometry: any) {
    if (geometry instanceof GeometryQuery) {
      if (!builder.appendGeometry(geometry))
        throw new BentleyError(IModelStatus.BadRequest, "GeometricElement3dEditor.buildGeometry failed", Logger.logError, loggingCategory, () => ({ builder, geometry }));
      return;
    }
    if (Array.isArray(geometry)) {
      geometry.forEach((g) => this.buildGeometry(builder, g));
      return;
    }
    throw new BentleyError(IModelStatus.BadArg, "GeometricElement3dEditor.buildGeometry - unsupported geometry type", Logger.logError, loggingCategory, () => ({ builder, geometry }));
  }

  private writeChangesToBriefcase(target: GeometricElement3dEditor.Target) {
    // Note that Element.onUpdate/onInsert will verify that that required locks and codes are held.

    // Case 1: The target element has been modified in some way. Write it.
    if (target.newGeometry === undefined) {
      if (Id64.isValidId64(target.element.id || ""))
        this.iModel.elements.updateElement(target.element);
      else
        this.iModel.elements.insertElement(target.element);
      return;
    }

    // Case 2: We have new geometry for the target element. Apply the geometry and then write the element(s).
    //          We may be breaking one element into many.
    for (const builder of target.newGeometry) {
      target.element.geom = builder.geometryStream;
      if (Id64.isValidId64(target.element.id || "")) {
        this.iModel.elements.updateElement(target.element);  // the first part of the new state is assigned to the original element
      } else {
        this.iModel.elements.insertElement(target.element);  // the rest of the new state goes into new elements
      }
      target.element.id = undefined;
    }
  }

  public end() {
  }

  /**
   * The tool is delcaring its intention to edit the specified elements. The editor
   * will make sure that the required locks and codes are held. The editor will then
   * start tracking the state of these elements.
   */
  public async startModifyingElements(ctx: AuthorizedClientRequestContext, elementIds: Id64Array): Promise<void> {
    ctx.enter();
    const elements = elementIds.map((id: string) => ({ element: this.iModel.elements.getElement<GeometricElement3d>(id), opcode: DbOpcode.Update }));
    await this.iModel.concurrencyControl.requestResources(ctx, elements);  // don't allow the tool to start editing this element until we have locked them and their models.
    ctx.enter();
    elements.forEach((e) => this._targets.push({ element: e.element }));
  }

  /**
   * Create an instance of the specified class, using the supplied props and the supplied geometry.
   * If the class has a method called "createGeometricElement3d", then that method is called to create the new instance.
   * A createGeometricElement3d class method may use the specified geometry as the element's geometry or only as a hint.
   * For example, a hypothetical "Pipe" class may expect `geometry` to contain two Point3d's that define the endpoints, while it expects `props` to contain a radius value.
   * If the class does not have a method called "createGeometricElement3d", then an instance is created by calling 'new' and then assigning it the supplied geometry (if any)
   * @param props Element properties, excluding placement and geom. Must specify classFullName.
   * @param origin The placement origin
   * @param angles The placement angles
   * @param geometryJson Geometry that should be used by the element class to construct the new instance in serialized JSON format.
   */
  public createElement(props: GeometricElement3dProps, origin?: Point3d, angles?: YawPitchRollAngles, geometryJson?: any) {
    if (undefined === props.classFullName)
      throw new BentleyError(IModelStatus.BadArg, "GeometricElement3dEditor.createElement - missing classFullName", Logger.logError, loggingCategory, () => ({ props }));

    let newElements: GeometricElement3dProps[];

    const geometry = geometryJson ? IModelJson.Reader.parse(geometryJson) : undefined;

    const jsClass = this.iModel.getJsClass(props.classFullName);

    if (jsClass.hasOwnProperty("createGeometricElement3d")) {
      newElements = (jsClass as any).createElement3d(props, origin, angles, geometry);
    } else {
      const newGeom3d = this.iModel.constructEntity<GeometricElement3d>(props);
      if (geometry !== undefined) {
        const builder = new GeometryStreamBuilder();
        this.buildGeometry(builder, geometry);
        // TODO ask builder to compute placement using origin, angles, and geometry
        newGeom3d.geom = builder.geometryStream;
      }
      newElements = [newGeom3d];
    }
    if (newElements === undefined)
      throw new BentleyError(IModelStatus.BadRequest);

    newElements.forEach((element) => this._targets.push({ element }));
  }

  public applyTransform(tprops: TransformProps) {
    const transform = Transform.fromJSON(tprops);
    this._targets.forEach((target) => {
      const placement = Placement3d.fromJSON(target.element.placement);
      placement.multiplyTransform(transform);
      target.element.placement = placement;
    });
  }

  public writeAllChangesToBriefcase() {
    this._targets.forEach((t) => this.writeChangesToBriefcase(t));
    this._targets.length = 0;
    this._stateStack.length = 0;
  }

  public pushState() {
    this._stateStack.push(deepCopy(this._targets));
  }

  public popState() {
    if (this._stateStack.length === 0)
      throw new BentleyError(IModelStatus.BadRequest, "GeometricElement3dEditor.popState - stack is empty", Logger.logError, loggingCategory);
    this._targets = this._stateStack.pop()!;
  }

}

/** @internal */
export namespace GeometricElement3dEditor {

  /** @internal */
  export class Target {
    public element: GeometricElement3dProps;
    public newGeometry?: GeometryStreamBuilder[];

    constructor(el: GeometricElement3dProps) {
      this.element = el;
    }
  }

}
