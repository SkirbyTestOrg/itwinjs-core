/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { Schema } from "./../../src/Metadata/Schema";
import { SchemaKey, SchemaItemKey } from "./../../src/SchemaKey";
import { EntityClass } from "./../../src/Metadata/EntityClass";
import { SchemaContext } from "../../src/Context";
import { createEmptyXmlDocument } from "../TestUtils/SerializationHelper";

describe("SchemaItem", () => {
  describe("toJson", () => {
    let baseClass: any;
    let schema;

    before(() => {
      schema = new Schema(new SchemaContext(), "ExampleSchema", 1, 0, 0);
      baseClass = new EntityClass(schema, "ExampleEntity");
    });

    it("Serialize SchemaItem Standalone", async () => {
      const propertyJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/schemaitem",
        schema: "ExampleSchema",
        version: "1.0.0",
        schemaItemType: "EntityClass",
        name: "ExampleEntity",
        label: "ExampleEntity",
        description: "An example entity class.",
      };
      await (baseClass as EntityClass).deserialize(propertyJson);
      const testClass = await (baseClass as EntityClass).toJson(true, true);
      expect(testClass).to.exist;
      assert.strictEqual(testClass.$schema, "https://dev.bentley.com/json_schemas/ec/32/schemaitem");
      assert.strictEqual(testClass.schema, "ExampleSchema");
      assert.strictEqual(testClass.schemaVersion, "01.00.00");
      assert.strictEqual(testClass.schemaItemType, "EntityClass");
      assert.strictEqual(testClass.name, "ExampleEntity");
      assert.strictEqual(testClass.label, "ExampleEntity");
      assert.strictEqual(testClass.description, "An example entity class.");
    });
    it("Serialize SchemaItem", async () => {
      const schemaItemJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "ExampleSchema",
        version: "1.0.0",
        alias: "ex",
        items: {
          ExampleEntity: {
            schemaItemType: "EntityClass",
            label: "ExampleEntity",
            description: "An example entity class.",
          },
        },
      };
      const ecschema = await Schema.fromJson(schemaItemJson, new SchemaContext());
      const testEntity = await ecschema.getItem<EntityClass>("ExampleEntity");
      assert.isDefined(testEntity);
      const testClass = await testEntity!.toJson(true, true);
      expect(testClass).to.exist;
      assert.strictEqual(testClass.schemaItemType, "EntityClass");
      assert.strictEqual(testClass.name, "ExampleEntity");
      assert.strictEqual(testClass.description, "An example entity class.");
    });
  });

  describe("toXml", () => {
    let baseClass: EntityClass;
    let schema: Schema;
    let newDom: Document;

    before(() => {
      schema = new Schema(new SchemaContext(), "ExampleSchema", 1, 0, 0);
      baseClass = new EntityClass(schema, "ExampleEntity");
    });

    beforeEach(() => {
      newDom = createEmptyXmlDocument();
    });

    it("Serialize SchemaItem", async () => {
      const propertyJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/schemaitem",
        schema: "ExampleSchema",
        version: "1.0.0",
        schemaItemType: "EntityClass",
        name: "ExampleEntity",
        label: "ExampleEntity",
        description: "An example entity class.",
      };
      await baseClass.deserialize(propertyJson);
      const testClass = await baseClass.toXml(newDom);
      expect(testClass.nodeName).to.eql("ECEntityClass");
      expect(testClass.getAttribute("typeName")).to.eql("ExampleEntity");
      expect(testClass.getAttribute("displayLabel")).to.eql("ExampleEntity");
      expect(testClass.getAttribute("description")).to.eql("An example entity class.");
    });
  });
});

describe("SchemaItemKey", () => {
  describe("matches", () => {
    const schemaKeyA = new SchemaKey("SchemaTest", 1, 2, 3);
    const schemaKeyB = new SchemaKey("OtherTestSchema", 1, 2, 3);

    it("should return false if names do not match", () => {
      expect(new SchemaItemKey("MixinA", schemaKeyA).matches(new SchemaItemKey("MixinB", schemaKeyA))).to.be.false;
    });

    it("should return false if types do not match", () => {
      expect(new SchemaItemKey("Name", schemaKeyA).matches(new SchemaItemKey("Name", schemaKeyB))).to.be.false;
    });

    it("should return true if keys match", () => {
      expect(new SchemaItemKey("MixinA", schemaKeyA).matches(new SchemaItemKey("MixinA", schemaKeyA))).to.be.true;
    });
  });
});
