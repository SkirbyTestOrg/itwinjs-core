/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import Schema from "../../source/Metadata/Schema";
import ECClass, { MutableClass } from "../../source/Metadata/Class";
import EntityClass, { MutableEntityClass } from "../../source/Metadata/EntityClass";
import Mixin from "../../source/Metadata/Mixin";
import RelationshipClass from "../../source/Metadata/RelationshipClass";
import { ECClassModifier } from "../../source/ECObjects";
import { DelayedPromiseWithProps } from "../../source/DelayedPromise";
import { ECObjectsError } from "../../source/Exception";

describe("EntityClass", () => {
  describe("get inherited properties", () => {
    let schema: Schema;

    beforeEach(() => {
      schema = new Schema("TestSchema", 1, 0, 0);
    });

    it("from mixins", async () => {
      const baseClass = new EntityClass(schema, "TestBase");
      const basePrimProp = await (baseClass as ECClass as MutableClass).createPrimitiveProperty("BasePrimProp");

      const mixin = new Mixin(schema, "TestMixin");
      const mixinPrimProp = await (mixin as ECClass as MutableClass).createPrimitiveProperty("MixinPrimProp");

      const entityClass = new EntityClass(schema, "TestClass");
      await (entityClass as ECClass as MutableClass).createPrimitiveProperty("PrimProp");
      entityClass.baseClass = new DelayedPromiseWithProps(baseClass.key, async () => baseClass);
      (entityClass as MutableEntityClass).addMixin(mixin);

      expect(await entityClass.getProperty("MixinPrimProp")).to.be.undefined;
      expect(await entityClass.getProperty("MixinPrimProp", true)).equal(mixinPrimProp);
      expect(await entityClass.getInheritedProperty("MixinPrimProp")).equal(mixinPrimProp);

      expect(await entityClass.getProperty("BasePrimProp")).to.be.undefined;
      expect(await entityClass.getProperty("BasePrimProp", false)).to.be.undefined;
      expect(await entityClass.getProperty("BasePrimProp", true)).equal(basePrimProp);
      expect(await entityClass.getInheritedProperty("BasePrimProp")).equal(basePrimProp);
      expect(await entityClass.getInheritedProperty("PrimProp")).to.be.undefined;
    });
  });

  describe("deserialization", () => {
    function createSchemaJsonWithChildren(childrenJson: any): any {
      return {
        $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        children: {
          ...childrenJson,
        },
      };
    }
    function createSchemaJson(entityClassJson: any): any {
      return createSchemaJsonWithChildren({
        TestEntityClass: {
          schemaChildType: "EntityClass",
          ...entityClassJson,
        },
      });
    }

    it("should succeed with fully defined", async () => {
      const schemaJson = createSchemaJson({
        label: "Test Entity Class",
        description: "Used for testing",
        modifier: "None",
      });

      const ecschema = await Schema.fromJson(schemaJson);
      const testClass = await ecschema.getClass<ECClass>("TestEntityClass");
      assert.isDefined(testClass);

      const testEntity = await ecschema.getClass<EntityClass>("TestEntityClass");
      assert.isDefined(testEntity);

      expect(testEntity!.name).equal("TestEntityClass");
      expect(testEntity!.label).equal("Test Entity Class");
      expect(testEntity!.description).equal("Used for testing");
      expect(testEntity!.modifier).equal(ECClassModifier.None);
    });

    it("should succeed with mixin", async () => {
      const schemaJson = createSchemaJsonWithChildren({
        testMixin: {
          schemaChildType: "Mixin",
          appliesTo: "TestSchema.testClass",
        },
        testClass: {
          schemaChildType: "EntityClass",
          mixins: [ "TestSchema.testMixin" ],
        },
      });

      const ecschema = await Schema.fromJson(schemaJson);
      assert.isDefined(ecschema);

      const testClass = await ecschema.getClass("testClass");
      assert.isDefined(testClass);
      assert.isTrue(testClass instanceof EntityClass);
      const entityClass = testClass as EntityClass;

      const mixinClass = await ecschema.getClass<Mixin>("testMixin");
      assert.isDefined(mixinClass);

      assert.isDefined(entityClass.mixins);
      expect(entityClass.mixins!.length).equal(1);
      assert.isTrue(await entityClass.mixins![0] === mixinClass);

      assert.isDefined(await mixinClass!.appliesTo);
      assert.isTrue(entityClass === await mixinClass!.appliesTo);
    });

    it("should succeed with multiple mixins", async () => {
      const schemaJson = createSchemaJsonWithChildren({
        testMixin: {
          schemaChildType: "Mixin",
          appliesTo: "TestSchema.testClass",
        },
        testClass: {
          schemaChildType: "EntityClass",
          mixins: [
            "TestSchema.testMixin",
            "TestSchema.anotherMixin",
          ],
        },
        anotherMixin: {
          schemaChildType: "Mixin",
          appliesTo: "TestSchema.testClass",
        },
      });
      const ecschema = await Schema.fromJson(schemaJson);
      assert.isDefined(ecschema);
    });

    it("should succeed with base class", async () => {
      const schemaJson = createSchemaJsonWithChildren({
        baseClass: {
          schemaChildType: "EntityClass",
        },
        testClass: {
          schemaChildType: "EntityClass",
          baseClass: "TestSchema.baseClass",
        },
      });

      const ecSchema = await Schema.fromJson(schemaJson);
      assert.isDefined(ecSchema);

      const testEntity = await ecSchema.getClass<EntityClass>("testClass");
      assert.isDefined(testEntity);

      const testBaseEntity = await ecSchema.getClass<EntityClass>("baseClass");
      assert.isDefined(testBaseEntity);

      assert.isDefined(await testEntity!.baseClass);
      assert.isTrue(typeof(await testEntity!.baseClass) === "object");

      assert.isTrue(await testEntity!.baseClass === testBaseEntity);
    });

    it("with navigation property", async () => {
      const schemaJson = createSchemaJsonWithChildren({
        NavPropRelationship: {
          schemaChildType: "RelationshipClass",
          strength: "Embedding",
          strengthDirection: "Forward",
          modifier: "Sealed",
          source: {
            polymorphic: true,
            multiplicity: "(0..*)",
            roleLabel: "Source RoleLabel",
            constraintClasses: [
              "TestSchema.TestClass",
            ],
          },
          target: {
            polymorphic: true,
            multiplicity: "(0..*)",
            roleLabel: "Target RoleLabel",
            constraintClasses: [
              "TestSchema.TargetClass",
            ],
          },
        },
        TargetClass: {
          schemaChildType: "EntityClass",
        },
        TestClass: {
          schemaChildType: "EntityClass",
          properties: [
            {
              propertyType: "NavigationProperty",
              name: "testNavProp",
              relationshipName: "TestSchema.NavPropRelationship",
            },
          ],
        },
      });

      const schema = await Schema.fromJson(schemaJson);
      assert.isDefined(schema);

      const entityClass = await schema.getClass<EntityClass>("TestClass");
      assert.isDefined(entityClass);

      const navProp = await entityClass!.getProperty("testNavProp");
      assert.isDefined(navProp);
      if (navProp && navProp.isNavigation()) {
        const relClass = await schema.getClass<RelationshipClass>("NavPropRelationship");
        assert.isTrue(await navProp.relationshipClass === relClass);
      } else {
        assert.fail();
      }
    });

    it("should throw for invalid baseClass", async () => {
      const json = createSchemaJson({ baseClass: 0 });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECClass TestEntityClass has an invalid 'baseClass' attribute. It should be of type 'string'.`);
    });

    it("should throw for invalid mixins", async () => {
      let json: any = createSchemaJson({ mixins: 0 });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECClass TestEntityClass has an invalid 'mixins' attribute. It should be of type 'string[]'.`);

      json = createSchemaJson({ mixins: [0] });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECClass TestEntityClass has an invalid 'mixins' attribute. It should be of type 'string[]'.`);
    });

    it("should throw for invalid properties", async () => {
      let json: any = createSchemaJson({ properties: 0 });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECClass TestEntityClass has an invalid 'properties' attribute. It should be of type 'object[]'.`);

      json = createSchemaJson({
        properties: [0],
      });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECClass TestEntityClass has an invalid 'properties' attribute. It should be of type 'object[]'.`);
    });

    it("should throw for property with missing name", async () => {
      const json = createSchemaJson({
        properties: [{ propertyType: "PrimitiveProperty" }],
      });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `An ECProperty in TestSchema.TestEntityClass is missing the required 'name' property.`);
    });

    it("should throw for property with invalid name", async () => {
      const json = createSchemaJson({
        properties: [{ propertyType: "PrimitiveProperty", name: 0 }],
      });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `An ECProperty in TestSchema.TestEntityClass has an invalid 'name' property. It should be of type 'string'.`);
    });

    it("should throw for property with missing propertyType", async () => {
      const json = createSchemaJson({
        properties: [{ name: "badProp" }],
      });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECProperty TestSchema.TestEntityClass.badProp is missing the required 'propertyType' property.`);
    });

    it("should throw for property with invalid propertyType", async () => {
      const json = createSchemaJson({
        properties: [{ name: "badProp", propertyType: 0 }],
      });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECProperty TestSchema.TestEntityClass.badProp has an invalid 'propertyType' property. It should be of type 'string'.`);
    });

    it("should throw for property with missing typeName", async () => {
      const json = createSchemaJson({
        properties: [{ name: "badProp", propertyType: "PrimitiveProperty"}],
      });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECProperty TestSchema.TestEntityClass.badProp is missing the required 'typeName' property.`);
    });

    it("should throw for property with invalid typeName", async () => {
      const json = createSchemaJson({
        properties: [{ name: "badProp", propertyType: "PrimitiveProperty", typeName: 0 }],
      });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECProperty TestSchema.TestEntityClass.badProp has an invalid 'typeName' property. It should be of type 'string'.`);
    });

    it("should throw for property with invalid category", async () => {
      const json = createSchemaJson({
        properties: [
          {
            propertyType: "PrimitiveProperty",
            typeName: "double",
            name: "testProp",
            category: 0,
          },
        ],
      });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECProperty TestEntityClass.testProp has an invalid 'category' property. It should be of type 'string'.`);
    });

    it("should throw for property with invalid kindOfQuantity", async () => {
      const json = createSchemaJson({
        properties: [
          {
            propertyType: "PrimitiveProperty",
            typeName: "double",
            name: "testProp",
            kindOfQuantity: 0,
          },
        ],
      });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECProperty TestEntityClass.testProp has an invalid 'kindOfQuantity' property. It should be of type 'string'.`);
    });

    it("should throw for navigation property with missing relationshipName", async () => {
      const json = createSchemaJson({
        properties: [
          {
            propertyType: "NavigationProperty",
            name: "testNavProp",
          },
        ],
      });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The Navigation Property TestEntityClass.testNavProp is missing the required 'relationshipName' property.`);
    });

    it("should throw for navigation property with missing relationshipName", async () => {
      const json = createSchemaJson({
        properties: [
          {
            propertyType: "NavigationProperty",
            name: "testNavProp",
            relationshipName: 0,
          },
        ],
      });
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The Navigation Property TestEntityClass.testNavProp has an invalid 'relationshipName' property. It should be of type 'string'.`);
    });
  });

  describe("fromJson", () => {
    let testClass: EntityClass;
    const baseJson = { schemaChildType: "EntityClass" };

    beforeEach(() => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      testClass = new EntityClass(schema, "TestEntity");
    });

    it("should throw for invalid mixins", async () => {
      expect(testClass).to.exist;
      let json: any = { ...baseJson, mixins: 0 };
      await expect(testClass.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECEntityClass TestEntity has an invalid 'mixins' attribute. It should be of type 'string[]'.`);

      json = { ...baseJson, mixins: [0] };
      await expect(testClass.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECEntityClass TestEntity has an invalid 'mixins' attribute. It should be of type 'string[]'.`);

      json = { ...baseJson, mixins: [ "DoesNotExist" ] };
      await expect(testClass.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECEntityClass TestEntity has a mixin ("DoesNotExist") that cannot be found.`);
    });
  });
});
