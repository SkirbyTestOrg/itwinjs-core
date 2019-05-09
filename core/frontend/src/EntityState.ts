/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module ElementState */

import { Id64, Id64String, GuidString } from "@bentley/bentleyjs-core";
import { EntityProps, Code, ElementProps, RelatedElement } from "@bentley/imodeljs-common";
import { IModelConnection } from "./IModelConnection";

/** The "state" of an Entity as represented in a web browser.
 * @public
 */
export class EntityState implements EntityProps {
  /** The BIS schema name for this EntityState.
   * @note Subclasses from other than the BisCore domain must override the static member "schemaName" with their schema name.
   */
  public static get schemaName() { return "BisCore"; }
  /** The BIS class name for this EntityState.
   * @note Every subclass of EntityState **MUST** override this method to identify its BIS class.
   * Failure to do so will ordinarily result in an error when the class is registered, since there may only
   * be one JavaScript class for a given BIS class (usually the errant class will collide with its superclass.)
   */
  public static get className() { return "Entity"; }

  public readonly id: Id64String;
  public readonly iModel: IModelConnection;
  public readonly classFullName: string;
  public readonly jsonProperties: { [key: string]: any };

  /** Constructor for EntityState
   * @param props the properties of the Entity for this EntityState
   * @param iModel the iModel from which this EntityState is to be constructed
   * @param _state source EntityState for clone
   */
  constructor(props: EntityProps, iModel: IModelConnection, _state?: EntityState) {
    this.classFullName = props.classFullName;
    this.iModel = iModel;
    this.id = Id64.fromJSON(props.id);
    this.jsonProperties = props.jsonProperties ? JSON.parse(JSON.stringify(props.jsonProperties)) : {}; // make sure we have our own copy
  }

  public toJSON(): EntityProps {
    const val: any = {};
    val.classFullName = this.classFullName;
    if (Id64.isValid(this.id))
      val.id = this.id;
    if (this.jsonProperties && Object.keys(this.jsonProperties).length > 0)
      val.jsonProperties = this.jsonProperties;
    return val;
  }

  public equals(other: this): boolean { return JSON.stringify(this.toJSON()) === JSON.stringify(other.toJSON()); }

  /** Make an independent copy of this EntityState */
  public clone(iModel?: IModelConnection): this { return new (this.constructor as typeof EntityState)(this.toJSON(), iModel ? iModel : this.iModel, this) as this; }

  /** Get full BIS class name of this Entity in the form "SchemaName:ClassName".  */
  public static get classFullName(): string { return this.schemaName + ":" + this.className; }
}

/** The "state" of an Element as represented in a web browser.
 * @public
 */
export class ElementState extends EntityState implements ElementProps {
  /** The name of the associated ECClass */
  public static get className() { return "Element"; }

  public readonly model: Id64String;
  public readonly code: Code;
  public readonly parent?: RelatedElement;
  public readonly federationGuid?: GuidString;
  public readonly userLabel?: string;

  constructor(props: ElementProps, iModel: IModelConnection) {
    super(props, iModel);
    this.code = Code.fromJSON(props.code);
    this.model = RelatedElement.idFromJson(props.model);
    this.parent = RelatedElement.fromJSON(props.parent);
    this.federationGuid = props.federationGuid;
    this.userLabel = props.userLabel;
  }

  public toJSON(): ElementProps {
    const val = super.toJSON() as ElementProps;
    if (Id64.isValid(this.code.spec))
      val.code = this.code;
    val.model = this.model;
    val.parent = this.parent;
    val.federationGuid = this.federationGuid;
    val.userLabel = this.userLabel;
    return val;
  }
}
