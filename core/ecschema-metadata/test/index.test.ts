/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as ECStringConstants from "../src/Constants";
import * as Context from "../src/Context";
import * as DelayedPromise from "../src/DelayedPromise";
import * as SchemaGraphUtil from "../src/Deserialization/SchemaGraphUtil";
import * as ECObjects from "../src/ECObjects";
import * as Index from "../src/ecschema-metadata";
import * as Exception from "../src/Exception";
import * as Interfaces from "../src/Interfaces";
import { ECClass, StructClass } from "../src/Metadata/Class";
import * as Constant from "../src/Metadata/Constant";
import * as CustomAttributeClass from "../src/Metadata/CustomAttributeClass";
import { EntityClass } from "../src/Metadata/EntityClass";
import { Enumeration } from "../src/Metadata/Enumeration";
import * as Format from "../src/Metadata/Format";
import * as InvertedUnit from "../src/Metadata/InvertedUnit";
import * as KindOfQuantity from "../src/Metadata/KindOfQuantity";
import * as Mixin from "../src/Metadata/Mixin";
import * as OverrideFormat from "../src/Metadata/OverrideFormat";
import * as Phenomenon from "../src/Metadata/Phenomenon";
import * as Property from "../src/Metadata/Property";
import * as PropertyCategory from "../src/Metadata/PropertyCategory";
import * as RelationshipClass from "../src/Metadata/RelationshipClass";
import { Schema } from "../src/Metadata/Schema";
import * as SchemaItem from "../src/Metadata/SchemaItem";
import * as Unit from "../src/Metadata/Unit";
import * as UnitSystem from "../src/Metadata/UnitSystem";
import * as PropertyTypes from "../src/PropertyTypes";
import * as SchemaKey from "../src/SchemaKey";
import * as FormatEnums from "../src/utils/FormatEnums";

// new type with specified index signature
type Dict = {
  [key: string]: any
};

// modules are not iterable. to traverse their members, the imports are spread into an object
const index: Dict = {
  ...Index
};
const moduleImports: Dict = {
  ...ECObjects,
  ...ECStringConstants,
  ...Context,
  ...Interfaces,
  ...DelayedPromise,
  ...Exception,
  ...PropertyTypes,
  ...FormatEnums,
  Schema,
  ...SchemaItem,
  ...SchemaKey,
  ECClass,
  StructClass,
  EntityClass,
  ...Mixin,
  ...RelationshipClass,
  ...CustomAttributeClass,
  Enumeration,
  ...KindOfQuantity,
  ...Constant,
  ...Format,
  ...OverrideFormat,
  ...InvertedUnit,
  ...Phenomenon,
  ...Unit,
  ...UnitSystem,
  ...PropertyCategory,
  ...Property,
  ...SchemaGraphUtil,
};

describe("Index", () => {
  it("should successfully import Index module", () => {
    expect(index).to.not.be.undefined;
  });

  it(`should match the explicit module imports`, () => {
    for (var name in moduleImports) {
      if (name.startsWith("Mutable"))
        continue;

      expect(index.hasOwnProperty(name), `The type '${name}' is missing from the index.ts barrel module.`).true;
    }
  });

  it("Ensure no Mutable classes are exported", () => {
    for (const name in index)
      expect(!name.startsWith("Mutable"), `The class '${name}' should not be exported from the index.ts file.`).true;
  });
});
