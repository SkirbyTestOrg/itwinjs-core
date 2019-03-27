/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Content */

import {
  PropertyInfo, PropertyInfoJSON, propertyInfoFromJSON,
  RelationshipPathInfo, RelationshipPathInfoJSON, relatedClassInfoFromJSON,
} from "../EC";

/**
 * Data structure that describes one step of property
 * accessor path.
 */
export interface PropertyAccessor {
  /** Name of ECProperty */
  propertyName: string;
  /** If the property is an array, array index. Otherwise undefined. */
  arrayIndex?: number;
}

/**
 * Describes path to a property.
 */
export type PropertyAccessorPath = PropertyAccessor[];

/**
 * Data structure that describes a single ECProperty that's
 * included in a [[PropertiesField]].
 */
export default interface Property {
  /** ECProperty information */
  property: Readonly<PropertyInfo>;
  /**
   * Relationship path from [Primary instance]($docs/learning/content/Terminology#primary-instance) to
   * this property. This array is not empty only for [Related properties]($docs/learning/content/Terminology#related-properties).
   */
  relatedClassPath: Readonly<RelationshipPathInfo>;
}

/**
 * Serialized [[Property]]
 *
 * @hidden
 */
export interface PropertyJSON {
  property: PropertyInfoJSON;
  relatedClassPath: RelationshipPathInfoJSON;
}

/**
 * Deserializes [[Property]] from [[PropertyJSON]]
 *
 * @hidden
 */
export const propertyFromJSON = (json: PropertyJSON): Property => {
  return {
    property: propertyInfoFromJSON(json.property),
    relatedClassPath: json.relatedClassPath.map((p) => relatedClassInfoFromJSON(p)),
  };
};
