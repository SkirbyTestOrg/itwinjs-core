/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";

import { SchemaContext } from "./../../src/Context";
import { SchemaMatchType } from "./../../src/ECObjects";
import { ECObjectsError } from "./../../src/Exception";
import { ECClass, StructClass } from "./../../src/Metadata/Class";
import { EntityClass } from "./../../src/Metadata/EntityClass";
import { Mixin } from "./../../src/Metadata/Mixin";
import { MutableSchema, Schema } from "./../../src/Metadata/Schema";
import { SchemaKey } from "./../../src/SchemaKey";
import { AnySchemaItem } from "../../src/Interfaces";
import { Enumeration } from "./../../src/Metadata/Enumeration";
import { Format } from "./../../src/Metadata/Format";
import { KindOfQuantity } from "./../../src/Metadata/KindOfQuantity";
import { PropertyCategory } from "./../../src/Metadata/PropertyCategory";
import { Unit } from "./../../src/Metadata/Unit";

describe("Schema", () => {
  describe("api creation of schema", () => {
    it("with only the essentials", () => {
      const testSchema = new Schema(new SchemaContext(), "TestSchemaCreation", 10, 99, 15);
      assert.strictEqual(testSchema.name, "TestSchemaCreation");
      assert.strictEqual(testSchema.readVersion, 10);
      assert.strictEqual(testSchema.writeVersion, 99);
      assert.strictEqual(testSchema.minorVersion, 15);
    });

    it("with invalid version numbers should fail", () => {
      const context = new SchemaContext();
      expect(() => { new Schema(context, "NewSchemaWithInvalidReadVersion", 123, 4, 5); }).to.throw(ECObjectsError);
      expect(() => { new Schema(context, "NewSchemaWithInvalidWriteVersion", 12, 345, 6); }).to.throw(ECObjectsError);
      expect(() => { new Schema(context, "NewSchemaWithInvalidMinorVersion", 12, 34, 567); }).to.throw(ECObjectsError);
    });
  });

  describe("create schema items", () => {
    it("should succeed for entity class", async () => {
      const testSchema = new Schema(new SchemaContext(), "TestSchema", 1, 1, 1);
      await (testSchema as MutableSchema).createEntityClass("TestEntity");

      expect(await testSchema.getItem("TestEntity")).instanceof(ECClass);
      expect(await testSchema.getItem<EntityClass>("TestEntity")).instanceof(EntityClass);
    });

    it("should succeed for mixin class", async () => {
      const testSchema = new Schema(new SchemaContext(), "TestSchema", 1, 2, 3);
      await (testSchema as MutableSchema).createMixinClass("TestMixin");

      expect(await testSchema.getItem("TestMixin")).instanceof(ECClass);
      expect(await testSchema.getItem<Mixin>("TestMixin")).instanceof(Mixin);
    });

    it("should succeed for struct class", async () => {
      const testSchema = new Schema(new SchemaContext(), "TestSchema", 1, 2, 3);
      await (testSchema as MutableSchema).createStructClass("TestStruct");

      expect(await testSchema.getItem("TestStruct")).instanceof(ECClass);
      expect(await testSchema.getItem<StructClass>("TestStruct")).instanceof(StructClass);
    });

    it("should succeed for non-class schema items", async () => {
      const testSchema = new Schema(new SchemaContext(), "TestSchema", 1, 2, 3);
      await (testSchema as MutableSchema).createKindOfQuantity("TestKindOfQuantity");
      await (testSchema as MutableSchema).createEnumeration("TestEnumeration");
      await (testSchema as MutableSchema).createUnit("TestUnit");
      await (testSchema as MutableSchema).createPropertyCategory("TestPropertyCategory");
      await (testSchema as MutableSchema).createFormat("TestFormat");

      const schemaItems = testSchema.getItems();

      expect(schemaItems.next().value).instanceOf(KindOfQuantity);
      expect(schemaItems.next().value).instanceOf(Enumeration);
      expect(schemaItems.next().value).instanceOf(Unit);
      expect(schemaItems.next().value).instanceOf(PropertyCategory);
      expect(schemaItems.next().value).instanceOf(Format);
      expect(schemaItems.next().done).to.eql(true);
    });

    it("should succeed with case-insensitive search", async () => {
      const testSchema = new Schema(new SchemaContext(), "TestSchema", 1, 0, 0);
      await (testSchema as MutableSchema).createEntityClass("testEntity");

      expect(await testSchema.getItem("TESTENTITY")).not.undefined;
      expect(await testSchema.getItem("TestEntity")).not.undefined;
      expect(await testSchema.getItem("testEntity")).not.undefined;
    });
  });

  describe("bulk get methods for schema items", () => {
    let testSchema: Schema;

    before(async () => {
      testSchema = new Schema(new SchemaContext(), "TestSchema", 1, 2, 3);
      await (testSchema as MutableSchema).createEntityClass("TestEntity");
      await (testSchema as MutableSchema).createMixinClass("TestMixin");
      await (testSchema as MutableSchema).createStructClass("TestStruct");
      await (testSchema as MutableSchema).createKindOfQuantity("TestKindOfQuantity");
      await (testSchema as MutableSchema).createEnumeration("TestEnumeration");
      await (testSchema as MutableSchema).createUnit("TestUnit");
      await (testSchema as MutableSchema).createPropertyCategory("TestPropertyCategory");
      await (testSchema as MutableSchema).createFormat("TestFormat");
    });

    describe("getItems", () => {
      let schemaItems: IterableIterator<AnySchemaItem>;

      before(() => {
        schemaItems = testSchema.getItems();
      });

      it("should return all schema items in schema", () => {
        const itemArray = Array.from(testSchema.getItems());
        expect(itemArray.length).to.eql(8);

        expect(schemaItems.next().value).instanceOf(EntityClass);
        expect(schemaItems.next().value).instanceOf(Mixin);
        expect(schemaItems.next().value).instanceOf(StructClass);
        expect(schemaItems.next().value).instanceOf(KindOfQuantity);
        expect(schemaItems.next().value).instanceOf(Enumeration);
        expect(schemaItems.next().value).instanceOf(Unit);
        expect(schemaItems.next().value).instanceOf(PropertyCategory);
        expect(schemaItems.next().value).instanceOf(Format);
        expect(schemaItems.next().done).to.eql(true);
      });
    });

    describe("getClasses", () => {
      let schemaClasses: IterableIterator<ECClass>;

      before(() => {
        schemaClasses = testSchema.getClasses();
      });

      it("should return only class items in schema", async () => {
        const classArray = Array.from(testSchema.getClasses());
        expect(classArray.length).to.eql(3);

        expect(schemaClasses.next().value).instanceOf(EntityClass);
        expect(schemaClasses.next().value).instanceOf(Mixin);
        expect(schemaClasses.next().value).instanceOf(StructClass);
        expect(schemaClasses.next().done).to.eql(true);
      });
    });
  });

  describe("fromJson", () => {
    describe("should successfully deserialize valid JSON", () => {
      function assertValidSchema(testSchema: Schema) {
        expect(testSchema.name).to.eql("ValidSchema");
        expect(testSchema.alias).to.eql("vs");
        expect(testSchema.label).to.eql("SomeDisplayLabel");
        expect(testSchema.description).to.eql("A really long description...");
        expect(testSchema.readVersion).to.eql(1);
        expect(testSchema.writeVersion).to.eql(2);
        expect(testSchema.minorVersion).to.eql(3);
      }

      it("with name/version first specified in JSON", async () => {
        const propertyJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "ValidSchema",
          version: "1.2.3",
          alias: "vs",
          label: "SomeDisplayLabel",
          description: "A really long description...",
        };
        const testSchema = new Schema(new SchemaContext());
        expect(testSchema).to.exist;
        await testSchema.deserialize(propertyJson);
        assertValidSchema(testSchema);
      });

      it("with name/version repeated in JSON", async () => {
        const propertyJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "ValidSchema",
          version: "1.2.3",
          alias: "vs",
          label: "SomeDisplayLabel",
          description: "A really long description...",
        };
        const testSchema = new Schema(new SchemaContext(), "ValidSchema", 1, 2, 3);
        expect(testSchema).to.exist;
        await testSchema.deserialize(propertyJson);
        assertValidSchema(testSchema);
      });

      it("should throw for invalid $schema", async () => {
        const schemaJson = {
          $schema: "https://badmetaschema.com",
          name: "InvalidSchema",
          version: "1.2.3",
        };
        const context = new SchemaContext();
        const testSchema = new Schema(context, "InvalidSchema", 1, 2, 3);
        expect(testSchema).to.exist;
        await expect(testSchema.deserialize(schemaJson as any)).to.be.rejectedWith(ECObjectsError, "The Schema InvalidSchema has an unsupported namespace 'https://badmetaschema.com'.");
        await expect(Schema.fromJson(schemaJson as any, context)).to.be.rejectedWith(ECObjectsError, "The Schema InvalidSchema has an unsupported namespace 'https://badmetaschema.com'.");
      });

      it("should throw for mismatched name", async () => {
        const json = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "ThisDoesNotMatch",
          version: "1.2.3",
          alias: "bad",
        };
        const testSchema = new Schema(new SchemaContext(), "BadSchema", 1, 2, 3);
        expect(testSchema).to.exist;
        await expect(testSchema.deserialize(json)).to.be.rejectedWith(ECObjectsError);
      });

      it("should throw for mismatched version", async () => {
        const json = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "BadSchema",
          version: "1.2.6",
          alias: "bad",
        };
        const testSchema = new Schema(new SchemaContext(), "BadSchema", 1, 2, 3);
        expect(testSchema).to.exist;
        await expect(testSchema.deserialize(json)).to.be.rejectedWith(ECObjectsError);
      });
    });
    describe("toJSON", () => {
      it("Simple serialization", async () => {
        const schemaJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "ValidSchema",
          version: "1.2.3",
          alias: "vs",
          label: "SomeDisplayLabel",
          description: "A really long description...",
        };
        const testSchema = new Schema(new SchemaContext(), "ValidSchema", 1, 2, 3);
        expect(testSchema).to.exist;
        await testSchema.deserialize(schemaJson);
        const serialized = testSchema.toJson();
        expect(serialized).to.deep.equal({ ...schemaJson, version: "01.02.03" });
      });
      it("Serialization with one custom attribute- only class name", async () => {
        const propertyJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "ValidSchema",
          version: "1.2.3",
          alias: "vs",
          label: "SomeDisplayLabel",
          description: "A really long description...",
        };
        const testSchema = new Schema(new SchemaContext(), "ValidSchema", 1, 2, 3);
        expect(testSchema).to.exist;
        await testSchema.deserialize(propertyJson);
        (testSchema as MutableSchema).addCustomAttribute({ className: "CoreCustomAttributes.HiddenSchema" });
        const serialized = testSchema.toJson();
        assert.strictEqual(serialized.customAttributes[0].className, "CoreCustomAttributes.HiddenSchema");
      });
      it("Serialization with one custom attribute- additional properties", () => {
        const propertyJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "ValidSchema",
          version: "1.2.3",
          alias: "vs",
          label: "SomeDisplayLabel",
          description: "A really long description...",
        };
        const testSchema = new Schema(new SchemaContext(), "ValidSchema", 1, 2, 3);
        expect(testSchema).to.exist;
        testSchema.deserializeSync(propertyJson);
        (testSchema as MutableSchema).addCustomAttribute({ className: "CoreCustomAttributes.HiddenSchema", ShowClasses: true });
        const serialized = testSchema.toJson();
        assert.strictEqual(serialized.customAttributes[0].className, "CoreCustomAttributes.HiddenSchema");
        assert.isTrue(serialized.customAttributes[0].ShowClasses);
      });
      it("Serialization with multiple custom attributes- only class name", async () => {
        const propertyJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "ValidSchema",
          version: "1.2.3",
          alias: "vs",
          label: "SomeDisplayLabel",
          description: "A really long description...",
        };
        const testSchema = new Schema(new SchemaContext(), "ValidSchema", 1, 2, 3);
        expect(testSchema).to.exist;
        await testSchema.deserialize(propertyJson);
        (testSchema as MutableSchema).addCustomAttribute({ className: "CoreCustomAttributes.HiddenSchema" });
        (testSchema as MutableSchema).addCustomAttribute({ className: "CoreAttributes.HiddenSchema" });
        (testSchema as MutableSchema).addCustomAttribute({ className: "CoreCustom.HiddenSchema" });
        const serialized = testSchema.toJson();
        assert.strictEqual(serialized.customAttributes[0].className, "CoreCustomAttributes.HiddenSchema");
        assert.strictEqual(serialized.customAttributes[1].className, "CoreAttributes.HiddenSchema");
        assert.strictEqual(serialized.customAttributes[2].className, "CoreCustom.HiddenSchema");
      });
      it("Serialization with multiple custom attributes- additional properties", async () => {
        const propertyJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "ValidSchema",
          version: "1.2.3",
          alias: "vs",
          label: "SomeDisplayLabel",
          description: "A really long description...",
        };
        const testSchema = new Schema(new SchemaContext(), "ValidSchema", 1, 2, 3);
        expect(testSchema).to.exist;
        await testSchema.deserialize(propertyJson);
        (testSchema as MutableSchema).addCustomAttribute({ className: "CoreCustomAttributes.HiddenSchema", ShowClasses: true });
        (testSchema as MutableSchema).addCustomAttribute({ className: "CoreAttributes.HiddenSchema", FloatValue: 1.2 });
        (testSchema as MutableSchema).addCustomAttribute({ className: "CoreCustom.HiddenSchema", IntegerValue: 5 });
        const serialized = testSchema.toJson();
        assert.isTrue(serialized.customAttributes[0].ShowClasses);
        assert.strictEqual(serialized.customAttributes[1].FloatValue, 1.2);
        assert.strictEqual(serialized.customAttributes[2].IntegerValue, 5);
      });
      it("Serialization with one reference", async () => {
        const schemaJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "ValidSchema",
          version: "1.2.3",
          alias: "vs",
          label: "SomeDisplayLabel",
          description: "A really long description...",
          references: [
            {
              name: "RefSchema",
              version: "1.0.0",
            },
          ],
        };
        const refSchema = new Schema(new SchemaContext(), "RefSchema", 1, 0, 0);
        const context = new SchemaContext();
        await context.addSchema(refSchema);
        let testSchema = new Schema(new SchemaContext(), "ValidSchema", 1, 2, 3);
        testSchema = await Schema.fromJson(schemaJson, context);
        expect(testSchema).to.exist;
        const entityClassJson = testSchema.toJson();
        assert.isDefined(entityClassJson);
        assert.strictEqual(entityClassJson.references[0].name, "RefSchema");
        assert.strictEqual(entityClassJson.references[0].version, "01.00.00");
      });
      it("Serialization with multiple references", () => {
        const schemaJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "ValidSchema",
          version: "1.2.3",
          alias: "vs",
          label: "SomeDisplayLabel",
          description: "A really long description...",
          references: [
            {
              name: "RefSchema",
              version: "1.0.0",
            },
            {
              name: "AnotherRefSchema",
              version: "1.0.2",
            },
          ],
        };
        const context = new SchemaContext();
        const refSchema = new Schema(context, "RefSchema", 1, 0, 0);
        const anotherRefSchema = new Schema(context, "AnotherRefSchema", 1, 0, 2);
        context.addSchemaSync(refSchema);
        context.addSchemaSync(anotherRefSchema);
        let testSchema = new Schema(context, "ValidSchema", 1, 2, 3);
        testSchema = Schema.fromJsonSync(schemaJson, context);
        expect(testSchema).to.exist;
        const entityClassJson = testSchema.toJson();
        assert.isDefined(entityClassJson);
        assert.strictEqual(entityClassJson.references[0].name, "RefSchema");
        assert.strictEqual(entityClassJson.references[0].version, "01.00.00");
        assert.strictEqual(entityClassJson.references[1].name, "AnotherRefSchema");
        assert.strictEqual(entityClassJson.references[1].version, "01.00.02");
      });
      it("Serialization with one reference and item", async () => {
        const schemaJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
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
              label: "ExampleEntity",
              description: "An example entity class.",
            },
          },
        };

        const context = new SchemaContext();
        const refSchema = new Schema(context, "RefSchema", 1, 0, 5);
        const refBaseClass = await (refSchema as MutableSchema).createEntityClass("BaseClassInRef");
        assert.isDefined(refBaseClass);
        await context.addSchema(refSchema);
        let testSchema = new Schema(context, "TestSchema", 1, 2, 3);
        testSchema = await Schema.fromJson(schemaJson, context);
        const entityClassJson = testSchema.toJson();
        assert.isDefined(entityClassJson);
        assert.isDefined(entityClassJson.items.testClass);
        assert.strictEqual(entityClassJson.items.testClass.schemaItemType, "EntityClass");
        assert.strictEqual(entityClassJson.items.testClass.label, "ExampleEntity");
        assert.strictEqual(entityClassJson.items.testClass.description, "An example entity class.");
      });
      it("Serialization with one reference and multiple items", async () => {
        const schemaJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "TestSchema",
          version: "1.2.3",
          references: [
            {
              name: "RefSchema",
              version: "1.0.5",
            },
          ],
          items: {
            testEnum: {
              schemaItemType: "Enumeration",
              type: "int",
              enumerators: [
                {
                  name: "ZeroValue",
                  value: 0,
                  label: "None",
                },
              ],
            },
            testClass: {
              schemaItemType: "EntityClass",
              label: "ExampleEntity",
              description: "An example entity class.",
            },
            ExampleMixin: {
              schemaItemType: "Mixin",
              appliesTo: "TestSchema.testClass",
            },
            ExampleStruct: {
              schemaItemType: "StructClass",
              name: "ExampleStruct",
              modifier: "sealed",
              properties: [
                {
                  type: "PrimitiveArrayProperty",
                  name: "ExamplePrimitiveArray",
                  typeName: "TestSchema.testEnum",
                  minOccurs: 7,
                  maxOccurs: 20,
                },
              ],
            },
          },
        };

        const context = new SchemaContext();
        const refSchema = new Schema(context, "RefSchema", 1, 0, 5);
        const refBaseClass = await (refSchema as MutableSchema).createEntityClass("BaseClassInRef");
        assert.isDefined(refBaseClass);
        await context.addSchema(refSchema);
        let testSchema = new Schema(context, "TestSchema", 1, 2, 3);
        testSchema = await Schema.fromJson(schemaJson, context);
        const entityClassJson = testSchema.toJson();
        assert.isDefined(entityClassJson);

        assert.isDefined(entityClassJson.items.testClass);
        assert.strictEqual(entityClassJson.items.testClass.schemaItemType, "EntityClass");
        assert.strictEqual(entityClassJson.items.testClass.label, "ExampleEntity");
        assert.strictEqual(entityClassJson.items.testClass.description, "An example entity class.");

        assert.isDefined(entityClassJson.items.ExampleMixin);
        assert.strictEqual(entityClassJson.items.ExampleMixin.schemaItemType, "Mixin");

        assert.isDefined(entityClassJson.items.ExampleStruct);
        assert.strictEqual(entityClassJson.items.ExampleMixin.schemaItemType, "Mixin");

        assert.isDefined(entityClassJson.items.testEnum);
        assert.strictEqual(entityClassJson.items.testEnum.schemaItemType, "Enumeration");
      });
    });
  }); // Schema tests

  describe("SchemaKey ", () => {
    describe("matches", () => {
      it("should correctly handle SchemaMatchType.Identical", () => {
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 0))).true;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 0))).false;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 2, 0, 0))).false;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 1))).false;

        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 0), SchemaMatchType.Identical)).true;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 0), SchemaMatchType.Identical)).false;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 2, 0, 0), SchemaMatchType.Identical)).false;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 1), SchemaMatchType.Identical)).false;
      });

      it("should correctly handle SchemaMatchType.Exact", () => {
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 0), SchemaMatchType.Exact)).true;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 0), SchemaMatchType.Exact)).false;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 2, 0, 0), SchemaMatchType.Exact)).false;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 1), SchemaMatchType.Exact)).false;
      });

      it("should correctly handle SchemaMatchType.Latest", () => {
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 0), SchemaMatchType.Latest)).true;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 0), SchemaMatchType.Latest)).false;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 2, 0, 0), SchemaMatchType.Latest)).true;
        expect(new SchemaKey("SchemaTest", 1, 0, 1).matches(new SchemaKey("SchemaTest", 1, 0, 0), SchemaMatchType.Latest)).true;
      });

      it("should correctly handle SchemaMatchType.LatestWriteCompatible", () => {
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 0), SchemaMatchType.LatestWriteCompatible)).true;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 0), SchemaMatchType.LatestWriteCompatible)).false;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 2, 0, 0), SchemaMatchType.LatestWriteCompatible)).false;
        expect(new SchemaKey("SchemaTest", 1, 0, 1).matches(new SchemaKey("SchemaTest", 1, 0, 0), SchemaMatchType.LatestWriteCompatible)).true;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 1), SchemaMatchType.LatestWriteCompatible)).false;
      });

      it("should correctly handle SchemaMatchType.LatestReadCompatible", () => {
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 0), SchemaMatchType.LatestReadCompatible)).true;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 0), SchemaMatchType.LatestReadCompatible)).false;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 2, 0, 0), SchemaMatchType.LatestReadCompatible)).false;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 1, 0), SchemaMatchType.LatestReadCompatible)).false;
        expect(new SchemaKey("SchemaTest", 1, 0, 1).matches(new SchemaKey("SchemaTest", 1, 0, 0), SchemaMatchType.LatestReadCompatible)).true;
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 1, 1), SchemaMatchType.LatestReadCompatible)).false;
      });

      it("should correctly handle invalid SchemaMatchType", () => {
        expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 0), -1)).false;
      });
    });

    describe("parseString", () => {
      it("should throw for invalid string", () => {
        expect(() => SchemaKey.parseString("invalid")).to.throw(ECObjectsError);
      });

      it("should correctly parse a valid schema full name", () => {
        const key = SchemaKey.parseString("SchemaName.1.2.3");
        expect(key.name).to.equal("SchemaName");
        expect(key.readVersion).to.equal(1);
        expect(key.writeVersion).to.equal(2);
        expect(key.minorVersion).to.equal(3);
      });
    });

    describe("compareByName", () => {
      it("should compare against a string", () => {
        const key = new SchemaKey("SchemaName", 1, 2, 3);
        expect(key.compareByName("SchemaName")).to.be.true;
        expect(key.compareByName("WrongSchemaName")).to.be.false;
      });

      it("should compare against another SchemaKey", () => {
        const key = new SchemaKey("SchemaName", 1, 2, 3);
        const matchingKey = new SchemaKey("SchemaName", 1, 2, 3);
        const incompatibleKey = new SchemaKey("WrongSchemaName", 1, 2, 3);
        expect(key.compareByName(matchingKey)).to.be.true;
        expect(key.compareByName(incompatibleKey)).to.be.false;
      });
    });

    // Tests to ensure the schemaKey compareByVersion exists
    // and calls into ECVersion.compare.  See ECVersion.test.ts
    // for more comprehensive cases.
    describe("compareByVersion", () => {
      it("exact match, returns zero", async () => {
        const context = new SchemaContext();
        const leftSchema = new Schema(context, "LeftSchema", 1, 2, 3);
        const rightSchema = new Schema(context, "RightSchema", 1, 2, 3);
        const result = leftSchema.schemaKey.compareByVersion(rightSchema.schemaKey);
        assert.strictEqual(result, 0);
      });
    });
  });
});
