/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { DelayedPromiseWithProps } from "../DelayedPromise";
import { ConstantProps } from "../Deserialization/JsonProps";
import { XmlSerializationUtils } from "../Deserialization/XmlSerializationUtils";
import { SchemaItemType } from "../ECObjects";
import { ECObjectsError, ECObjectsStatus } from "../Exception";
import { LazyLoadedPhenomenon } from "../Interfaces";
import { SchemaItemKey } from "../SchemaKey";
import { Phenomenon } from "./Phenomenon";
import { Schema } from "./Schema";
import { SchemaItem } from "./SchemaItem";

/**
 * A Constant is a specific type of Unit that represents a number.
 * @beta
 */
export class Constant extends SchemaItem {
  public readonly schemaItemType!: SchemaItemType.Constant; // tslint:disable-line
  protected _phenomenon?: LazyLoadedPhenomenon;
  protected _definition: string;
  protected _numerator: number;
  protected _denominator: number;

  constructor(schema: Schema, name: string) {
    super(schema, name);
    this.schemaItemType = SchemaItemType.Constant;
    this._definition = "";
    this._denominator = 1.0;
    this._numerator = 1.0;
  }

  get phenomenon(): LazyLoadedPhenomenon | undefined { return this._phenomenon; }
  get definition(): string { return this._definition; }
  get numerator(): number { return this._numerator; }
  get denominator(): number { return this._denominator; }

  /**
   * Save this Constants properties to an object for serializing to JSON.
   * @param standalone Serialization includes only this object (as opposed to the full schema).
   * @param includeSchemaVersion Include the Schema's version information in the serialized object.
   */
  public toJSON(standalone: boolean, includeSchemaVersion: boolean): ConstantProps {
    const schemaJson = super.toJSON(standalone, includeSchemaVersion) as any;
    if (this.phenomenon !== undefined)
      schemaJson.phenomenon = this.phenomenon!.fullName;
    schemaJson.definition = this.definition;
    if (this.numerator !== undefined)
      schemaJson.numerator = this.numerator;
    schemaJson.denominator = this.denominator;
    return schemaJson as ConstantProps;
  }

  /** @internal */
  public async toXml(schemaXml: Document): Promise<Element> {
    const itemElement = await super.toXml(schemaXml);
    itemElement.setAttribute("definition", this.definition);
    if (undefined !== this.numerator)
      itemElement.setAttribute("numerator", this.numerator.toString());
    if (undefined !== this.denominator)
      itemElement.setAttribute("denominator", this.denominator.toString());

    const phenomenon = await this.phenomenon;
    if (undefined !== phenomenon) {
      const phenomenonName = XmlSerializationUtils.createXmlTypedName(this.schema, phenomenon.schema, phenomenon.name);
      itemElement.setAttribute("phenomenon", phenomenonName);
    }

    return itemElement;
  }

  public fromJSONSync(constantProps: ConstantProps) {
    super.fromJSONSync(constantProps);

    const schemaItemKey = this.schema.getSchemaItemKey(constantProps.phenomenon);
    if (!schemaItemKey)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate the phenomenon ${constantProps.phenomenon}.`);
    this._phenomenon = new DelayedPromiseWithProps<SchemaItemKey, Phenomenon>(schemaItemKey,
      async () => {
        const phenom = await this.schema.lookupItem<Phenomenon>(schemaItemKey);
        if (undefined === phenom)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate the phenomenon ${constantProps.phenomenon}.`);
        return phenom;
      });

    if (this._definition !== "" && constantProps.definition.toLowerCase() !== this._definition.toLowerCase())
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Constant ${this.name} has an invalid 'definition' attribute.`);
    else if (this._definition === "")
      this._definition = constantProps.definition;

    if (undefined !== constantProps.numerator) {
      if (constantProps.numerator !== this._numerator)
        this._numerator = constantProps.numerator;
    }

    if (undefined !== constantProps.denominator) {
      if (constantProps.denominator !== this._denominator)
        this._denominator = constantProps.denominator;
    }
  }

  public async fromJSON(constantProps: ConstantProps) {
    this.fromJSONSync(constantProps);
  }
}
