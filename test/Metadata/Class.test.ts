/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";

import Schema, { MutableSchema } from "../../source/Metadata/Schema";
import EntityClass from "../../source/Metadata/EntityClass";
import { SchemaContext } from "../../source/Context";
import { DelayedPromiseWithProps } from "../../source/DelayedPromise";
import ECClass, { MutableClass } from "../../source/Metadata/Class";
import { ECObjectsError } from "../../source/Exception";
import { SchemaItemType } from "../../source/ECObjects";
import * as sinon from "sinon";

describe("ECClass", () => {
  let schema: Schema;

  describe("get properties", () => {
    beforeEach(() => {
      schema = new Schema("TestSchema", 1, 0, 0);
    });

    it("inherited properties from base class", async () => {
      const baseClass = new EntityClass(schema, "TestBase");
      const basePrimProp = await (baseClass as ECClass as MutableClass).createPrimitiveProperty("BasePrimProp");

      const entityClass = new EntityClass(schema, "TestClass");
      await (entityClass as ECClass as MutableClass).createPrimitiveProperty("PrimProp");
      entityClass.baseClass = new DelayedPromiseWithProps(baseClass.key, async () => baseClass);

      expect(await entityClass.getProperty("BasePrimProp")).to.be.undefined;
      expect(await entityClass.getProperty("BasePrimProp", false)).to.be.undefined;
      expect(await entityClass.getProperty("BasePrimProp", true)).equal(basePrimProp);
      expect(await entityClass.getInheritedProperty("BasePrimProp")).equal(basePrimProp);
      expect(await entityClass.getInheritedProperty("PrimProp")).to.be.undefined;
    });

    it("inherited properties from base class synchronously", () => {
      const baseClass = (schema as MutableSchema).createEntityClassSync("TestBase");
      const basePrimProp = (baseClass as ECClass as MutableClass).createPrimitivePropertySync("BasePrimProp");

      const entityClass = (schema as MutableSchema).createEntityClassSync("TestClass");
      (entityClass as ECClass as MutableClass).createPrimitivePropertySync("PrimProp");
      entityClass.baseClass = new DelayedPromiseWithProps(baseClass.key, async () => baseClass);

      expect(entityClass.getPropertySync("BasePrimProp")).to.be.undefined;
      expect(entityClass.getPropertySync("BasePrimProp", false)).to.be.undefined;
      expect(entityClass.getPropertySync("BasePrimProp", true)).equal(basePrimProp);
      expect(entityClass.getInheritedPropertySync("BasePrimProp")).equal(basePrimProp);
      expect(entityClass.getInheritedPropertySync("PrimProp")).to.be.undefined;
    });

    it("case-insensitive search", async () => {
      const entityClass = new EntityClass(schema, "TestClass");
      const primProp = await (entityClass as ECClass as MutableClass).createPrimitiveProperty("TestProp");

      expect(await entityClass.getProperty("TESTPROP")).equal(primProp);
      expect(await entityClass.getProperty("testprop")).equal(primProp);
      expect(await entityClass.getProperty("tEsTpRoP")).equal(primProp);
    });

    it("case-insensitive inherited property search", async () => {
      const baseClass = new EntityClass(schema, "BaseClass");
      const primProp = await (baseClass as ECClass as MutableClass).createPrimitiveProperty("TestProp");

      const entityClass = new EntityClass(schema, "TestClass");
      entityClass.baseClass = new DelayedPromiseWithProps(baseClass.key, async () => baseClass);

      expect(await entityClass.getProperty("TESTPROP", true)).equal(primProp);
      expect(await entityClass.getProperty("testprop", true)).equal(primProp);
      expect(await entityClass.getProperty("tEsTpRoP", true)).equal(primProp);

      expect(await entityClass.getInheritedProperty("TESTPROP")).equal(primProp);
      expect(await entityClass.getInheritedProperty("testprop")).equal(primProp);
      expect(await entityClass.getInheritedProperty("tEsTpRoP")).equal(primProp);
    });
  });

  describe("deserialization", () => {
    it("class with base class", async () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        items: {
          testBaseClass: {
            schemaItemType: "EntityClass",
          },
          testClass: {
            schemaItemType: "EntityClass",
            baseClass: "TestSchema.testBaseClass",
          },
        },
      };

      schema = await Schema.fromJson(schemaJson);
      assert.isDefined(schema);

      const testClass = await schema.getClass<EntityClass>("testClass");
      assert.isDefined(testClass);
      assert.isDefined(await testClass!.baseClass);

      const baseClass = await schema.getClass<EntityClass>("testBaseClass");
      assert.isDefined(baseClass);
      assert.isTrue(baseClass === await testClass!.baseClass);
    });

    it("class with base class in reference schema", async () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        references: [
          {
            name: "RefSchema",
            version: "1.0.5",
          },
        ],
        items: {
          testClass: {
            schemaItemType: "EntityClass",
            baseClass: "RefSchema.BaseClassInRef",
          },
        },
      };

      const refSchema = new Schema("RefSchema", 1, 0, 5);
      const refBaseClass = await (refSchema as MutableSchema).createEntityClass("BaseClassInRef");

      const context = new SchemaContext();
      await context.addSchema(refSchema);

      schema = await Schema.fromJson(schemaJson, context);

      const testClass = await schema.getClass<EntityClass>("testClass");

      assert.isDefined(testClass);
      assert.isDefined(await testClass!.baseClass);
      assert.isTrue(await testClass!.baseClass === refBaseClass);
    });

    // Used to test that all property types are deserialized correctly. For failure and other tests look at the property
    // specific test files.
    it("with properties", async () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        items: {
          testStruct: {
            schemaItemType: "StructClass",
          },
          testClass: {
            schemaItemType: "EntityClass",
            properties: [
              {
                propertyType: "PrimitiveProperty",
                typeName: "double",
                name: "testPrimProp",
              },
              {
                propertyType: "StructProperty",
                name: "testStructProp",
                typeName: "TestSchema.testStruct",
              },
              {
                propertyType: "PrimitiveArrayProperty",
                typeName: "string",
                name: "testPrimArrProp",
              },
              {
                propertyType: "StructArrayProperty",
                name: "testStructArrProp",
                typeName: "TestSchema.testStruct",
              },
            ],
          },
        },
      };

      const ecSchema = await Schema.fromJson(schemaJson);
      assert.isDefined(ecSchema);

      const testEntity = await ecSchema.getClass("testClass");
      assert.isDefined(testEntity);

      const testPrimProp = await testEntity!.getProperty("testPrimProp");
      assert.isDefined(testPrimProp);
      const testPrimArrProp = await testEntity!.getProperty("testPrimArrProp");
      assert.isDefined(testPrimArrProp);
      const testStructProp = await testEntity!.getProperty("testStructProp");
      assert.isDefined(testStructProp);
      const testStructArrProp = await testEntity!.getProperty("testStructArrProp");
      assert.isDefined(testStructArrProp);
    });
  });

  describe("deserialization sync", () => {
    it("class with base class", () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        items: {
          testBaseClass: {
            schemaItemType: "EntityClass",
          },
          testClass: {
            schemaItemType: "EntityClass",
            baseClass: "TestSchema.testBaseClass",
          },
        },
      };

      schema = Schema.fromJsonSync(schemaJson);
      assert.isDefined(schema);

      const testClass = schema.getClassSync<EntityClass>("testClass");
      assert.isDefined(testClass);
      assert.isDefined(testClass!.getBaseClassSync());

      const baseClass = schema.getClassSync<EntityClass>("testBaseClass");
      assert.isDefined(baseClass);
      assert.isTrue(baseClass === testClass!.getBaseClassSync());
    });

    it("class with base class in reference schema", () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        references: [
          {
            name: "RefSchema",
            version: "1.0.5",
          },
        ],
        items: {
          testClass: {
            schemaItemType: "EntityClass",
            baseClass: "RefSchema.BaseClassInRef",
          },
        },
      };

      const refSchema = new Schema("RefSchema", 1, 0, 5);
      const refBaseClass = (refSchema as MutableSchema).createEntityClassSync("BaseClassInRef");

      const context = new SchemaContext();
      context.addSchemaSync(refSchema);

      schema = Schema.fromJsonSync(schemaJson, context);

      const testClass = schema.getClassSync<EntityClass>("testClass");

      assert.isDefined(testClass);
      assert.isDefined(testClass!.getBaseClassSync());
      assert.isTrue(testClass!.getBaseClassSync() === refBaseClass);
    });

    // Used to test that all property types are deserialized correctly. For failure and other tests look at the property
    // specific test files.
    it("with properties", () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        items: {
          testStruct: {
            schemaItemType: "StructClass",
          },
          testClass: {
            schemaItemType: "EntityClass",
            properties: [
              {
                propertyType: "PrimitiveProperty",
                typeName: "double",
                name: "testPrimProp",
              },
              {
                propertyType: "StructProperty",
                name: "testStructProp",
                typeName: "TestSchema.testStruct",
              },
              {
                propertyType: "PrimitiveArrayProperty",
                typeName: "string",
                name: "testPrimArrProp",
              },
              {
                propertyType: "StructArrayProperty",
                name: "testStructArrProp",
                typeName: "TestSchema.testStruct",
              },
            ],
          },
        },
      };

      const ecSchema = Schema.fromJsonSync(schemaJson);
      assert.isDefined(ecSchema);

      const testEntity = ecSchema.getClassSync("testClass");
      assert.isDefined(testEntity);

      const testPrimProp = testEntity!.getPropertySync("testPrimProp");
      assert.isDefined(testPrimProp);
      const testPrimArrProp = testEntity!.getPropertySync("testPrimArrProp");
      assert.isDefined(testPrimArrProp);
      const testStructProp = testEntity!.getPropertySync("testStructProp");
      assert.isDefined(testStructProp);
      const testStructArrProp = testEntity!.getPropertySync("testStructArrProp");
      assert.isDefined(testStructArrProp);
    });
  });

  describe("fromJson", () => {
    let testClass: ECClass;
    class MockECClass extends ECClass {}

    beforeEach(() => {
      testClass = new MockECClass(schema, "TestClass", SchemaItemType.EntityClass);
    });

    it("should throw for invalid modifier", async () => {
      expect(testClass).to.exist;
      const invalidModifierJson = { schemaItemType: "EntityClass", modifier: 0 };
      await expect(testClass.fromJson(invalidModifierJson)).to.be.rejectedWith(ECObjectsError, `The ECClass TestClass has an invalid 'modifier' attribute. It should be of type 'string'.`);
    });

    it("should throw for invalid baseClass", async () => {
      expect(testClass).to.exist;
      const invalidBaseClassJson = { schemaItemType: "EntityClass", baseClass: 0 };
      await expect(testClass.fromJson(invalidBaseClassJson)).to.be.rejectedWith(ECObjectsError, `The ECClass TestClass has an invalid 'baseClass' attribute. It should be of type 'string'.`);

      const unloadedBaseClassJson = { schemaItemType: "EntityClass", baseClass: "ThisClassDoesNotExist" };
      await expect(testClass.fromJson(unloadedBaseClassJson)).to.be.rejectedWith(ECObjectsError);
    });
  });

  describe("accept", () => {
    let testClass: ECClass;
    class MockECClass extends ECClass {}

    beforeEach(() => {
      testClass = new MockECClass(schema, "TestClass", SchemaItemType.EntityClass);
    });

    it("should call visitClass on a SchemaItemVisitor object", async () => {
      expect(testClass).to.exist;
      const mockVisitor = { visitClass: sinon.spy() };
      await testClass.accept(mockVisitor);
      expect(mockVisitor.visitClass.calledOnce).to.be.true;
      expect(mockVisitor.visitClass.calledWithExactly(testClass)).to.be.true;
    });

    it("should safely handle a SchemaItemVisitor without visitClass defined", async () => {
      expect(testClass).to.exist;
      await testClass.accept({});
    });
  });

  describe("getAllBaseClasses", () => {
    it("should correctly traverse a complex inheritance hierarchy", async () => {
      // This is the class hierarchy used in this test. The numbers indicate override priority,
      // i.e., the order that they should be returned by testClass.getAllBaseClasses():
      //
      //  2[A]  3(B)  5(C)  7(D)          [] := EntityClass
      //     \   /     /     /            () := Mixin
      //    1[ G ]  4(E)  6(F)
      //        \    /     /
      //        [    H    ]
      //
      const testSchemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
        name: "TestSchema",
        version: "01.00.00",
        alias: "ts",
        items: {
          A: { schemaItemType: "EntityClass" },
          B: { schemaItemType: "Mixin",         appliesTo: "TestSchema.A" },
          C: { schemaItemType: "Mixin",         appliesTo: "TestSchema.A" },
          D: { schemaItemType: "Mixin",         appliesTo: "TestSchema.A" },
          E: { schemaItemType: "Mixin",         appliesTo: "TestSchema.A", baseClass: "TestSchema.C" },
          F: { schemaItemType: "Mixin",         appliesTo: "TestSchema.A", baseClass: "TestSchema.D" },
          G: { schemaItemType: "EntityClass",   baseClass: "TestSchema.A", mixins: [ "TestSchema.B" ] },
          H: { schemaItemType: "EntityClass",   baseClass: "TestSchema.G", mixins: [ "TestSchema.E", "TestSchema.F" ] },
        },
      };
      const expectedNames = ["G", "A", "B", "E", "C", "F", "D"];
      const actualNames: string[] = [];

      schema = await Schema.fromJson(testSchemaJson);
      expect(schema).to.exist;

      const testClass = await schema.getClass("H");
      expect(testClass).to.exist;
      for await (const baseClass of testClass!.getAllBaseClasses()) {
        actualNames.push(baseClass.name);
      }

      expect(actualNames).to.eql(expectedNames);
    });
  });
});
