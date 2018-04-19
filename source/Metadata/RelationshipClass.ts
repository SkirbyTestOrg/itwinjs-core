/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
*--------------------------------------------------------------------------------------------*/

import ECClass from "./Class";
import { ECClassModifier, RelatedInstanceDirection, RelationshipEnd, RelationshipMultiplicity, SchemaItemType, StrengthType,
        parseStrength, parseStrengthDirection } from "../ECObjects";
import { LazyLoadedRelationshipConstraintClass } from "../Interfaces";
import { ECObjectsError, ECObjectsStatus } from "../Exception";
import { NavigationProperty } from "./Property";
import { DelayedPromiseWithProps } from "../DelayedPromise";
import EntityClass from "./EntityClass";
import Mixin from "./Mixin";
import Schema from "./Schema";

type AnyConstraintClass = EntityClass | Mixin | RelationshipClass;

/**
 * A Typescript class representation of a ECRelationshipClass.
 */
export default class RelationshipClass extends ECClass {
  public readonly schema: Schema;
  public readonly type: SchemaItemType.RelationshipClass;
  protected _strength: StrengthType = StrengthType.Referencing;
  protected _strengthDirection: RelatedInstanceDirection = RelatedInstanceDirection.Forward;
  protected _source: RelationshipConstraint;
  protected _target: RelationshipConstraint;

  constructor(schema: Schema, name: string, modifier?: ECClassModifier) {
    super(schema, name, SchemaItemType.RelationshipClass, modifier);

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
  public async createNavigationProperty(name: string, relationship: string | RelationshipClass, direction: string | RelatedInstanceDirection): Promise<NavigationProperty> {
    if (await this.getProperty(name))
      throw new ECObjectsError(ECObjectsStatus.DuplicateProperty, `An ECProperty with the name ${name} already exists in the class ${this.name}.`);

    let resolvedRelationship: RelationshipClass | undefined;
    if (typeof(relationship) === "string")
      resolvedRelationship = await this.schema.getItem<RelationshipClass>(relationship, true);
    else
      resolvedRelationship = relationship;

    if (!resolvedRelationship)
      throw new ECObjectsError(ECObjectsStatus.InvalidType, `The provided RelationshipClass, ${relationship}, is not a valid RelationshipClassInterface.`);

    if (typeof(direction) === "string") {
      const tmpDirection = parseStrengthDirection(direction);
      if (undefined === tmpDirection)
        throw new ECObjectsError(ECObjectsStatus.InvalidStrengthDirection, `The provided StrengthDirection, ${direction}, is not a valid StrengthDirection.`);
      direction = tmpDirection;
    }

    const lazyRelationship = new DelayedPromiseWithProps(resolvedRelationship.key, async () => resolvedRelationship!);
    return this.addProperty(new NavigationProperty(this, name, lazyRelationship, direction));
  }

  /**
   *
   * @param jsonObj
   */
  public async fromJson(jsonObj: any): Promise<void> {
    await super.fromJson(jsonObj);

    if (undefined !== jsonObj.strength) {
      if (typeof(jsonObj.strength) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipClass ${this.name} has an invalid 'strength' attribute. It should be of type 'string'.`);
      const strength = parseStrength(jsonObj.strength);
      if (undefined === strength)
        throw new ECObjectsError(ECObjectsStatus.InvalidStrength, `The RelationshipClass ${this.name} has an invalid 'strength' attribute. '${jsonObj.strength}' is not a valid StrengthType`);
      this._strength = strength;
    }

    if (undefined !== jsonObj.strengthDirection) {
      if (typeof(jsonObj.strengthDirection) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipClass ${this.name} has an invalid 'strengthDirection' attribute. It should be of type 'string'.`);

      const strengthDirection = parseStrengthDirection(jsonObj.strengthDirection);
      if (undefined === strengthDirection)
        throw new ECObjectsError(ECObjectsStatus.InvalidStrength, `The RelationshipClass ${this.name} has an invalid 'strengthDirection' attribute. '${jsonObj.strengthDirection}' is not a valid StrengthDirection`);
      this._strengthDirection = strengthDirection;
    }
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
   * Returns true if this RelationshipConstraint is the Source relationship end.
   */
  get isSource(): boolean { return this.relationshipEnd === RelationshipEnd.Source; }

  /**
   * Adds the provided class as a constraint class to this constraint.
   * @param constraint The class to add as a constraint class.
   */
  public addClass(constraint: EntityClass | Mixin | RelationshipClass): void {
    // Ensure we don't start mixing constraint class types
    if (this.constraintClasses && this.constraintClasses.length > 0 && this.constraintClasses[0].type !== constraint.key.type)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, ``);

    if (!this._constraintClasses)
      this._constraintClasses = [];

    // TODO: Handle relationship constraints
    this._constraintClasses.push(new DelayedPromiseWithProps(constraint.key, async () => constraint));
  }

  /**
   * Populates this object with the provided json object.
   * @param jsonObj The json representation of an ECRelationshipConstraint using the ECSchemaJson format.
   */
  public async fromJson(jsonObj: any): Promise<void> {
    // TODO: Require all constraints to be fully defined.
    if (undefined !== jsonObj.roleLabel) {
      if (typeof(jsonObj.roleLabel) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipConstraint ${debugName(this)} has an invalid 'roleLabel' attribute. It should be of type 'string'.`);
      this._roleLabel = jsonObj.roleLabel;
    }

    if (undefined !== jsonObj.polymorphic) {
      if (typeof(jsonObj.polymorphic) !== "boolean")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipConstraint ${debugName(this)} has an invalid 'polymorphic' attribute. It should be of type 'boolean'.`);
      this._polymorphic = jsonObj.polymorphic;
    }

    if (undefined !== jsonObj.multiplicity) {
      if (typeof(jsonObj.multiplicity) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipConstraint ${debugName(this)} has an invalid 'multiplicity' attribute. It should be of type 'string'.`);

      const parsedMultiplicity = RelationshipMultiplicity.fromString(jsonObj.multiplicity);
      if (!parsedMultiplicity)
        throw new ECObjectsError(ECObjectsStatus.InvalidMultiplicity, ``);
      this._multiplicity = parsedMultiplicity;
    }

    const relClassSchema = this.relationshipClass.schema;

    if (undefined !== jsonObj.abstractConstraint) {
      if (typeof(jsonObj.abstractConstraint) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipConstraint ${debugName(this)} has an invalid 'abstractConstraint' attribute. It should be of type 'string'.`);

      const tempAbstractConstraint = await relClassSchema.getItem<AnyConstraintClass>(jsonObj.abstractConstraint, true);
      if (!tempAbstractConstraint)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, ``);

      this.abstractConstraint = new DelayedPromiseWithProps(tempAbstractConstraint.key, async () => tempAbstractConstraint);
    }

    if (undefined !== jsonObj.constraintClasses) {
      if (!Array.isArray(jsonObj.constraintClasses))
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipConstraint ${debugName(this)} has an invalid 'constraintClasses' attribute. It should be of type 'string[]'.`);

      const loadEachConstraint = async (constraintClassName: any) => {
        if (typeof(constraintClassName) !== "string")
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipConstraint ${debugName(this)} has an invalid 'constraintClasses' attribute. It should be of type 'string[]'.`);

        const tempConstraintClass = await relClassSchema.getItem<AnyConstraintClass>(constraintClassName, true);
        if (!tempConstraintClass)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, ``);

        return tempConstraintClass;
      };
      const constraintClasses = await Promise.all<AnyConstraintClass>(jsonObj.constraintClasses.map(loadEachConstraint));
      constraintClasses.forEach((constraintClass: AnyConstraintClass) => this.addClass(constraintClass));
    }
  }
}

function debugName(constraint: RelationshipConstraint): string {
  return constraint.relationshipClass.name + ((constraint.isSource) ? ".source" : ".target");
}
