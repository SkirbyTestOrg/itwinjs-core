/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";

import Schema from "../../source/Metadata/Schema";
import ECClass from "../../source/Metadata/Class";
import EntityClass from "../../source/Metadata/EntityClass";
import Mixin from "../../source/Metadata/Mixin";
import { StructClass } from "../../source/Metadata/Class";
import { ECObjectsError } from "../../source/Exception";
import { SchemaKey, SchemaMatchType } from "../../source/ECObjects";

describe("Schema", () => {
  describe("api creation of schema", () => {
    it("with only the essentials", () => {
      const testSchema = new Schema("TestSchemaCreation", 10, 99, 15);
      assert.equal(testSchema.name, "TestSchemaCreation");
      assert.equal(testSchema.readVersion, 10);
      assert.equal(testSchema.writeVersion, 99);
      assert.equal(testSchema.minorVersion, 15);
    });

    it("with setting properties", () => {
      const testSchema = new Schema("TestSchema", 1, 0, 2);
      testSchema.alias = "ts";
      assert.isDefined(testSchema.alias);
      assert.equal(testSchema.alias, "ts");

      testSchema.description = "Test setting a description";
      assert.isDefined(testSchema.description);
      assert.equal(testSchema.description, "Test setting a description");
    });

    it("with invalid version numbers should fail", () => {
      expect(() => {new Schema("NewSchemaWithInvalidReadVersion", 123, 4, 5); }).to.throw(ECObjectsError);
      expect(() => {new Schema("NewSchemaWithInvalidWriteVersion", 12, 345, 6); }).to.throw(ECObjectsError);
      expect(() => {new Schema("NewSchemaWithInvalidMinorVersion", 12, 34, 567); }).to.throw(ECObjectsError);
    });

    it("should throw when attempting to change the version to an invalid version", () => {
      const testSchema = new Schema("TestSchema", 1, 1, 1);
      expect(() => {testSchema.readVersion = 123; }).to.throw(ECObjectsError);
      expect(testSchema.readVersion).equal(1);
      expect(() => {testSchema.writeVersion = 123; }).to.throw(ECObjectsError);
      expect(testSchema.writeVersion).equal(1);
      expect(() => {testSchema.minorVersion = 123; }).to.throw(ECObjectsError);
      expect(testSchema.minorVersion).equal(1);
    });
  });

  describe("", () => {

  });

  describe("create schema children", () => {
    it("should succeed for entity class", async () => {
      const testSchema = new Schema("TestSchema", 1, 1, 1);
      await testSchema.createEntityClass("TestEntity");

      expect(await testSchema.getClass("TestEntity")).instanceof(ECClass);
      expect(await testSchema.getClass<EntityClass>("TestEntity")).instanceof(EntityClass);
    });

    it("should succeed for mixin class", async () => {
      const testSchema = new Schema("TestSchema", 1, 2, 3);
      await testSchema.createMixinClass("TestMixin");

      expect(await testSchema.getClass("TestMixin")).instanceof(ECClass);
      expect(await testSchema.getClass<Mixin>("TestMixin")).instanceof(Mixin);
    });

    it("should succeed for struct class", async () => {
      const testSchema = new Schema("TestSchema", 1, 2, 3);
      await testSchema.createStructClass("TestStruct");

      expect(await testSchema.getClass("TestStruct")).instanceof(ECClass);
      expect(await testSchema.getClass<StructClass>("TestStruct")).instanceof(StructClass);
    });

    it("should succeed with case-insensitive search", async () => {
      const testSchema = new Schema("TestSchema", 1, 0, 0);
      await testSchema.createEntityClass("testEntity");

      expect(await testSchema.getClass("TESTENTITY")).not.undefined;
      expect(await testSchema.getClass("TestEntity")).not.undefined;
      expect(await testSchema.getClass("testEntity")).not.undefined;
    });
  });

  describe("fromJson", () => {
    async function testInvalidAttribute(schema: Schema, attributeName: string, expectedType: string, value: any) {
      expect(schema).to.exist;
      const json: any = {
        $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
        [attributeName]: value,
      };
      await expect(schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The ECSchema ${schema.name} has an invalid '${attributeName}' attribute. It should be of type '${expectedType}'.`);
    }

    it("should throw for missing $schema", async () => {
      const testSchema = new Schema("BadSchema");
      expect(testSchema).to.exist;
      await expect(testSchema.fromJson({})).to.be.rejectedWith(ECObjectsError);
    });

    it("should throw for invalid $schema", async () => {
      const schemaJson = { $schema: "https://badmetaschema.com" };
      const testSchema = new Schema("BadSchema");
      expect(testSchema).to.exist;
      await expect(testSchema.fromJson(schemaJson)).to.be.rejectedWith(ECObjectsError);
    });

    it("should throw for invalid name", async () => testInvalidAttribute(new Schema("BadSchema"), "name", "string", 0));
    it("should throw for invalid alias", async () => testInvalidAttribute(new Schema("BadSchema"), "alias", "string", 0));
    it("should throw for invalid label", async () => testInvalidAttribute(new Schema("BadSchema"), "label", "string", 0));
    it("should throw for invalid description", async () => testInvalidAttribute(new Schema("BadSchema"), "description", "string", 0));
    it("should throw for invalid version", async () => testInvalidAttribute(new Schema("BadSchema"), "version", "string", 0));
  });
}); // Schema tests

describe("SchemaKey ", () => {
  describe("Comparison", () => {
    it("should match identical", () => {
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 0))).true;
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 0))).false;
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 2, 0, 0))).false;
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 1))).false;

      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 0), SchemaMatchType.Exact)).true;
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 0), SchemaMatchType.Exact)).false;
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 2, 0, 0), SchemaMatchType.Exact)).false;
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 1), SchemaMatchType.Exact)).false;

      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 0), SchemaMatchType.Identical)).true;
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 0), SchemaMatchType.Identical)).false;
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 2, 0, 0), SchemaMatchType.Identical)).false;
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 1), SchemaMatchType.Identical)).false;

      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 0), SchemaMatchType.Latest)).true;
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 0), SchemaMatchType.Latest)).false;
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 2, 0, 0), SchemaMatchType.Latest)).true;
      expect(new SchemaKey("SchemaTest", 1, 0, 1).matches(new SchemaKey("SchemaTest", 1, 0, 0), SchemaMatchType.Latest)).true;

      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 0), SchemaMatchType.LatestWriteCompatible)).true;
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaNotTest", 1, 0, 0), SchemaMatchType.LatestWriteCompatible)).false;
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 2, 0, 0), SchemaMatchType.LatestWriteCompatible)).false;
      expect(new SchemaKey("SchemaTest", 1, 0, 1).matches(new SchemaKey("SchemaTest", 1, 0, 0), SchemaMatchType.LatestWriteCompatible)).true;
      expect(new SchemaKey("SchemaTest", 1, 0, 0).matches(new SchemaKey("SchemaTest", 1, 0, 1), SchemaMatchType.LatestWriteCompatible)).false;
    });
  });
});
