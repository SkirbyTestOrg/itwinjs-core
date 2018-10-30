/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import { ECClass } from "./Class";
import { processCustomAttributes, CustomAttributeSet, serializeCustomAttributes } from "./CustomAttribute";
import { EntityClass, createNavigationProperty, createNavigationPropertySync } from "./EntityClass";
import { Mixin } from "./Mixin";
import { NavigationProperty } from "./Property";
import { Schema } from "./Schema";
import { DelayedPromiseWithProps } from "./../DelayedPromise";
import { RelationshipClassProps, RelationshipConstraintProps } from "./../Deserialization/JsonProps";
import {
  CustomAttributeContainerType, ECClassModifier, SchemaItemType, StrengthDirection,
  strengthDirectionToString, strengthToString, StrengthType, RelationshipEnd,
} from "./../ECObjects";
import { ECObjectsError, ECObjectsStatus } from "./../Exception";
import { LazyLoadedRelationshipConstraintClass } from "./../Interfaces";
import { SchemaItemKey } from "./../SchemaKey";

type AnyConstraintClass = EntityClass | Mixin | RelationshipClass;

/**
 * A Typescript class representation of a ECRelationshipClass.
 */
export class RelationshipClass extends ECClass {
  public readonly schema!: Schema; // tslint:disable-line
  public readonly schemaItemType!: SchemaItemType.RelationshipClass; // tslint:disable-line
  protected _strength: StrengthType;
  protected _strengthDirection: StrengthDirection;
  protected _source: RelationshipConstraint;
  protected _target: RelationshipConstraint;

  constructor(schema: Schema, name: string, modifier?: ECClassModifier) {
    super(schema, name, modifier);
    this.schemaItemType = SchemaItemType.RelationshipClass;
    this._strengthDirection = StrengthDirection.Forward;
    this._strength = StrengthType.Referencing;
    this._source = new RelationshipConstraint(this, RelationshipEnd.Source);
    this._target = new RelationshipConstraint(this, RelationshipEnd.Target);
  }

  get strength() { return this._strength; }

  get strengthDirection() { return this._strengthDirection; }

  get source() { return this._source; }

  get target() { return this._target; }

  /**
   *
   * @param name
   * @param relationship
   * @param direction
   */
  protected async createNavigationProperty(name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): Promise<NavigationProperty> {
    return this.addProperty(await createNavigationProperty(this, name, relationship, direction));
  }

  protected createNavigationPropertySync(name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): NavigationProperty {
    return this.addProperty(createNavigationPropertySync(this, name, relationship, direction));
  }

  public toJson(standalone: boolean, includeSchemaVersion: boolean) {
    const schemaJson = super.toJson(standalone, includeSchemaVersion);
    schemaJson.strength = strengthToString(this.strength);
    schemaJson.strengthDirection = strengthDirectionToString(this.strengthDirection);
    schemaJson.source = this.source.toJson();
    schemaJson.target = this.target.toJson();
    return schemaJson;
  }

  public deserializeSync(relationshipClassProps: RelationshipClassProps) {
    super.deserializeSync(relationshipClassProps);
    this._strength = relationshipClassProps.strength;
    this._strengthDirection = relationshipClassProps.strengthDirection;
  }

  public async deserialize(relationshipClassProps: RelationshipClassProps) {
    this.deserializeSync(relationshipClassProps);
  }
}

/**
 * A Typescript class representation of a ECRelationshipConstraint.
 */
export class RelationshipConstraint {
  protected _abstractConstraint?: LazyLoadedRelationshipConstraintClass;
  protected _relationshipClass: RelationshipClass;
  protected _relationshipEnd: RelationshipEnd;
  protected _multiplicity?: RelationshipMultiplicity;
  protected _polymorphic?: boolean;
  protected _roleLabel?: string;
  protected _constraintClasses?: LazyLoadedRelationshipConstraintClass[];
  protected _customAttributes?: CustomAttributeSet;

  constructor(relClass: RelationshipClass, relEnd: RelationshipEnd, roleLabel?: string, polymorphic?: boolean) {
    this._relationshipEnd = relEnd;
    if (polymorphic)
      this._polymorphic = polymorphic;
    else
      this._polymorphic = false;

    this._multiplicity = RelationshipMultiplicity.zeroOne;
    this._relationshipClass = relClass;
    this._roleLabel = roleLabel;
  }

  get multiplicity() { return this._multiplicity; }
  get polymorphic() { return this._polymorphic; }
  get roleLabel() { return this._roleLabel; }
  get constraintClasses(): LazyLoadedRelationshipConstraintClass[] | undefined { return this._constraintClasses; }
  get relationshipClass() { return this._relationshipClass; }
  get relationshipEnd() { return this._relationshipEnd; }
  get customAttributes(): CustomAttributeSet | undefined { return this._customAttributes; }

  get abstractConstraint(): LazyLoadedRelationshipConstraintClass | undefined {
    if (this._abstractConstraint)
      return this._abstractConstraint;

    if (this.constraintClasses && this.constraintClasses.length === 1)
      return this.constraintClasses[0];

    return this._abstractConstraint;
  }

  set abstractConstraint(abstractConstraint: LazyLoadedRelationshipConstraintClass | undefined) {
    this._abstractConstraint = abstractConstraint;
  }

  /**
   * True if this RelationshipConstraint is the Source relationship end.
   */
  get isSource(): boolean { return this.relationshipEnd === RelationshipEnd.Source; }

  /**
   * Adds the provided class as a constraint class to this constraint.
   * @param constraint The class to add as a constraint class.
   */
  public addClass(constraint: EntityClass | Mixin | RelationshipClass): void {
    // TODO: Ensure we don't start mixing constraint class types
    // TODO: Check that this class is or subclasses abstract constraint?

    if (!this._constraintClasses)
      this._constraintClasses = [];

    // TODO: Handle relationship constraints
    this._constraintClasses.push(new DelayedPromiseWithProps(constraint.key, async () => constraint));
  }

  public toJson() {
    const schemaJson: { [value: string]: any } = {};
    schemaJson.multiplicity = this.multiplicity!.toString();
    schemaJson.roleLabel = this.roleLabel;
    schemaJson.polymorphic = this.polymorphic;
    if (undefined !== this.abstractConstraint) {
      schemaJson.abstractConstraint = this.abstractConstraint.fullName;
    }
    if (this.constraintClasses !== undefined && this.constraintClasses.length > 0) {
      schemaJson.constraintClasses = [];
      this.constraintClasses.forEach(async (constraintClass: LazyLoadedRelationshipConstraintClass) => {
        schemaJson.constraintClasses.push(constraintClass.fullName);
      });
    }
    const customAttributes = serializeCustomAttributes(this.customAttributes);
    if (undefined !== customAttributes)
      schemaJson.customAttributes = customAttributes;
    return schemaJson;
  }

  public deserializeSync(relationshipConstraintProps: RelationshipConstraintProps) {

    this._roleLabel = relationshipConstraintProps.roleLabel;
    this._polymorphic = relationshipConstraintProps.polymorphic;

    const parsedMultiplicity = RelationshipMultiplicity.fromString(relationshipConstraintProps.multiplicity);
    if (!parsedMultiplicity)
      throw new ECObjectsError(ECObjectsStatus.InvalidMultiplicity, ``);
    this._multiplicity = parsedMultiplicity;

    const relClassSchema = this.relationshipClass.schema;

    if (undefined !== relationshipConstraintProps.abstractConstraint) {
      const abstractConstraintSchemaItemKey = relClassSchema.getSchemaItemKey(relationshipConstraintProps.abstractConstraint);
      if (!abstractConstraintSchemaItemKey)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate the abstractConstraint ${relationshipConstraintProps.abstractConstraint}.`);
      this.abstractConstraint = new DelayedPromiseWithProps<SchemaItemKey, AnyConstraintClass>(abstractConstraintSchemaItemKey,
        async () => {
          const tempAbstractConstraint = await relClassSchema.lookupItem<AnyConstraintClass>(relationshipConstraintProps.abstractConstraint!);
          if (undefined === tempAbstractConstraint)
            throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate the abstractConstraint ${relationshipConstraintProps.abstractConstraint}.`);

          return tempAbstractConstraint;
        });
    }

    const loadEachConstraint = (constraintClassName: any) => {
      const tempConstraintClass = relClassSchema.lookupItemSync<AnyConstraintClass>(constraintClassName);
      if (!tempConstraintClass)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, ``);
      return tempConstraintClass;
    };

    for (const constraintClassName of relationshipConstraintProps.constraintClasses) {
      const constraintClass = loadEachConstraint(constraintClassName);
      this.addClass(constraintClass);
    }

    this._customAttributes = processCustomAttributes(relationshipConstraintProps.customAttributes, debugName(this), CustomAttributeContainerType.AnyRelationshipConstraint);
  }
  public async deserialize(relationshipConstraintProps: RelationshipConstraintProps) {
    this.deserializeSync(relationshipConstraintProps);
  }

}

const INT32_MAX = 2147483647;

/**
 *
 */
export class RelationshipMultiplicity {
  public static readonly zeroOne = new RelationshipMultiplicity(0, 1);
  public static readonly zeroMany = new RelationshipMultiplicity(0, INT32_MAX);
  public static readonly oneOne = new RelationshipMultiplicity(1, 1);
  public static readonly oneMany = new RelationshipMultiplicity(1, INT32_MAX);

  public readonly lowerLimit: number;
  public readonly upperLimit: number;

  constructor(lowerLimit: number, upperLimit: number) {
    this.lowerLimit = lowerLimit;
    this.upperLimit = upperLimit;
  }

  public static fromString(str: string): RelationshipMultiplicity | undefined {
    const matches = /^\(([0-9]*)\.\.([0-9]*|\*)\)$/.exec(str);
    if (matches === null || matches.length !== 3)
      return undefined;

    const lowerLimit = parseInt(matches[1], undefined);
    const upperLimit = matches[2] === "*" ? INT32_MAX : parseInt(matches[2], undefined);
    if (0 === lowerLimit && 1 === upperLimit)
      return RelationshipMultiplicity.zeroOne;
    else if (0 === lowerLimit && INT32_MAX === upperLimit)
      return RelationshipMultiplicity.zeroMany;
    else if (1 === lowerLimit && 1 === upperLimit)
      return RelationshipMultiplicity.oneOne;
    else if (1 === lowerLimit && INT32_MAX === upperLimit)
      return RelationshipMultiplicity.oneMany;

    return new RelationshipMultiplicity(lowerLimit, upperLimit);
  }

  public equals(rhs: RelationshipMultiplicity): boolean {
    return this.lowerLimit === rhs.lowerLimit && this.upperLimit === rhs.upperLimit;
  }

  public toString(): string {
    return `(${this.lowerLimit}..${this.upperLimit === INT32_MAX ? "*" : this.upperLimit})`;
  }
}

function debugName(constraint: RelationshipConstraint): string {
  return constraint.relationshipClass.name + ((constraint.isSource) ? ".source" : ".target");
}
