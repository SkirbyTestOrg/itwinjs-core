/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Core */

import { Id64 } from "@bentley/bentleyjs-core";

export type ClassId = Id64;

export type InstanceId = Id64;

/** A key that uniquely identifies an instance in an iModel */
export interface InstanceKey {
  className: string;
  id: InstanceId;
}

/** A serialized version of [[InstanceKey]] */
export interface InstanceKeyJSON {
  className: string;
  id: string;
}

/** Deserializes [[InstanceKey]] from [[InstanceKeyJSON]] */
export const instanceKeyFromJSON = (json: InstanceKeyJSON): InstanceKey => {
  return { ...json, id: new Id64(json.id) };
};

/** An array of [[InstanceKey]] objects */
export type InstanceKeysList = InstanceKey[];

/** Information about an ECClass */
export interface ClassInfo {
  id: ClassId;
  name: string;
  label: string;
}

/** A serialized version of [[ClassInfo]] */
export interface ClassInfoJSON {
  id: string;
  name: string;
  label: string;
}

/** Deserializes [[ClassInfo]] from [[ClassInfoJSON]] */
export const classInfoFromJSON = (json: ClassInfoJSON): ClassInfo => {
  return { ...json, id: new Id64(json.id) };
};

/** A single choice in enumeration */
export interface EnumerationChoice {
  label: string;
  value: string | number;
}

/** Enumeration information */
export interface EnumerationInfo {
  choices: EnumerationChoice[];
  isStrict: boolean;
}

/** Kind of quantity information */
export interface KindOfQuantityInfo {
  name: string;
  label: string;
  persistenceUnit: string;
  currentFormatId: string;
}

/** A structure that describes an ECProperty */
export interface PropertyInfo {
  classInfo: ClassInfo;
  name: string;
  type: string;
  enumerationInfo?: EnumerationInfo;
  kindOfQuantity?: KindOfQuantityInfo;
}

/** A serialized version of [[PropertyInfo]] */
export interface PropertyInfoJSON {
  classInfo: ClassInfoJSON;
  name: string;
  type: string;
  enumerationInfo?: EnumerationInfo;
  kindOfQuantity?: KindOfQuantityInfo;
}

/** Deserializes [[PropertyInfo]] from [[PropertyInfoJSON]] */
export const propertyInfoFromJSON = (json: PropertyInfoJSON): PropertyInfo => {
  return { ...json, classInfo: classInfoFromJSON(json.classInfo) };
};

/** A structure that describes a related class and the properties of that relationship. */
export interface RelatedClassInfo {
  /** Information about the source ECClass */
  sourceClassInfo: ClassInfo;

  /** Information about the target ECClass */
  targetClassInfo: ClassInfo;

  /** Information about the relationship ECClass */
  relationshipInfo: ClassInfo;

  /** Should the relationship be followed in a forward direction to access the related class. */
  isForwardRelationship: boolean;

  /** Is the relationship handled polymorphically */
  isPolymorphicRelationship: boolean;
}

/** A serialized version of [[RelatedClassInfo]] */
export interface RelatedClassInfoJSON {
  sourceClassInfo: ClassInfoJSON;
  targetClassInfo: ClassInfoJSON;
  relationshipInfo: ClassInfoJSON;
  isForwardRelationship: boolean;
  isPolymorphicRelationship: boolean;
}

/** Deserializes [[RelatedClassInfo]] from [[RelatedClassInfoJSON]] */
export const relatedClassInfoFromJSON = (json: RelatedClassInfoJSON): RelatedClassInfo => {
  return {
    ...json,
    sourceClassInfo: classInfoFromJSON(json.sourceClassInfo),
    targetClassInfo: classInfoFromJSON(json.targetClassInfo),
    relationshipInfo: classInfoFromJSON(json.relationshipInfo),
  };
};

/** A structure that describes a related class path. */
export type RelationshipPathInfo = RelatedClassInfo[];

/** Serialized [[RelationshipPathInfo]] */
export type RelationshipPathInfoJSON = RelatedClassInfoJSON[];
