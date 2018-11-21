/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { createSchemaJsonWithItems } from "../TestUtils/DeserializationHelpers";

import { Schema, MutableSchema } from "../../src/Metadata/Schema";
import { EntityClass } from "../../src/Metadata/EntityClass";
import { Mixin } from "../../src/Metadata/Mixin";
import { ECObjectsError } from "../../src/Exception";
import { NavigationProperty } from "../../src/Metadata/Property";
import { StrengthDirection } from "../../src/ECObjects";

describe("Mixin", () => {
  describe("deserialization", () => {
    function createSchemaJson(mixinJson: any): any {
      return createSchemaJsonWithItems({
        TestMixin: {
          schemaItemType: "Mixin",
          ...mixinJson,
        },
        TestEntity: {
          schemaItemType: "EntityClass",
        },
        NavPropRelationship: {
          schemaItemType: "RelationshipClass",
          strength: "Embedding",
          strengthDirection: "Forward",
          modifier: "Sealed",
          source: {
            polymorphic: true,
            multiplicity: "(0..*)",
            roleLabel: "Source RoleLabel",
            constraintClasses: ["TestSchema.TestEntity"],
          },
          target: {
            polymorphic: true,
            multiplicity: "(0..*)",
            roleLabel: "Target RoleLabel",
            constraintClasses: ["TestSchema.TestEntity"],
          },
        },
      });
    }

    it("should succeed with fully defined", async () => {
      const testSchema = createSchemaJsonWithItems({
        TestMixin: {
          schemaItemType: "Mixin",
          baseClass: "TestSchema.BaseMixin",
          appliesTo: "TestSchema.TestEntity",
        },
        BaseMixin: {
          schemaItemType: "Mixin",
          appliesTo: "TestSchema.TestEntity",
        },
        TestEntity: {
          schemaItemType: "EntityClass",
        },
      });

      const schema = await Schema.fromJson(testSchema);
      assert.isDefined(schema);

      const entity = await schema.getItem<EntityClass>("TestEntity");
      const baseMixin = await schema.getItem<Mixin>("BaseMixin");

      const mixin = await schema.getItem<Mixin>("TestMixin");
      assert.isDefined(mixin);

      assert.isDefined(await mixin!.appliesTo);
      assert.isTrue(await mixin!.appliesTo === entity);
      assert.isTrue(await mixin!.baseClass === baseMixin);
    });

    it("should succeed with NavigationProperty", async () => {
      const json = createSchemaJson({
        appliesTo: "TestSchema.TestEntity",
        properties: [
          {
            type: "NavigationProperty",
            name: "testNavProp",
            relationshipName: "TestSchema.NavPropRelationship",
            direction: "forward",
          },
        ],
      });

      const schema = await Schema.fromJson(json);
      expect(schema).to.exist;

      const mixin = await schema.getItem<Mixin>("TestMixin");
      expect(mixin).to.exist;

      const navProp = await mixin!.getProperty("testNavProp", false) as NavigationProperty;
      expect(navProp).to.exist;
      expect(navProp.isNavigation()).to.be.true;
      expect(navProp.direction).to.equal(StrengthDirection.Forward);
    });

    it("should succeed with NavigationPropertySynchronously", () => {
      const json = createSchemaJson({
        appliesTo: "TestSchema.TestEntity",
        properties: [
          {
            type: "NavigationProperty",
            name: "testNavProp",
            relationshipName: "TestSchema.NavPropRelationship",
            direction: "forward",
          },
        ],
      });

      const schema = Schema.fromJsonSync(json);
      expect(schema).to.exist;

      const mixin = schema.getItemSync<Mixin>("TestMixin");
      expect(mixin).to.exist;

      const navProp = mixin!.getPropertySync("testNavProp", false) as NavigationProperty;
      expect(navProp).to.exist;
      expect(navProp.isNavigation()).to.be.true;
      expect(navProp.direction).to.equal(StrengthDirection.Forward);
    });

    it("should throw for invalid appliesTo", async () => {
      const json = createSchemaJson({
        appliesTo: 0,
      });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The Mixin TestSchema.TestMixin has an invalid 'appliesTo' attribute. It should be of type 'string'.`);
    });
  });

  describe("Async fromJson", () => {
    let testEntity: EntityClass;
    let testMixin: Mixin;
    const baseJson = { schemaItemType: "Mixin" };

    beforeEach(async () => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      testEntity = await (schema as MutableSchema).createEntityClass("TestEntity");
      testMixin = new Mixin(schema, "TestMixin");
    });

    it("should successfully deserialize valid JSON", async () => {
      const json = {
        ...baseJson,
        appliesTo: "TestSchema.TestEntity",
      };
      expect(testMixin).to.exist;
      await testMixin.deserialize(json);
      expect(await testMixin.appliesTo).to.eql(testEntity);
    });

    it("should throw for invalid appliesTo", async () => {
      expect(testMixin).to.exist;
      const unloadedAppliesToJson = { ...baseJson, appliesTo: "ThisClassDoesNotExist" };
      await expect(testMixin.deserialize(unloadedAppliesToJson)).to.be.rejectedWith(ECObjectsError);
    });
  });
  describe("Sync fromJson", () => {
    let testEntity: EntityClass;
    let testMixin: Mixin;
    const baseJson = { schemaItemType: "Mixin" };

    beforeEach(() => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      testEntity = (schema as MutableSchema).createEntityClassSync("TestEntity");
      testMixin = new Mixin(schema, "TestMixin");
    });

    it("should successfully deserialize valid JSON", async () => {
      const json = {
        ...baseJson,
        appliesTo: "TestSchema.TestEntity",
      };
      expect(testMixin).to.exist;
      testMixin.deserializeSync(json);

      expect(await testMixin.appliesTo).to.eql(testEntity);
    });
    it("should throw for invalid appliesTo", async () => {
      expect(testMixin).to.exist;
      const json = { ...baseJson, appliesTo: "ThisClassDoesNotExist" };
      assert.throws(() => testMixin.deserializeSync(json), ECObjectsError);
    });
  });
});
