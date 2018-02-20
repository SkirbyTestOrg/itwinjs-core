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
          $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
          name: "ValidSchema",
          version: "1.2.3",
          alias: "vs",
          label: "SomeDisplayLabel",
          description: "A really long description...",
        };
        const testSchema = new Schema();
        expect(testSchema).to.exist;
        await testSchema.fromJson(propertyJson);
        assertValidSchema(testSchema);
      });

      it("with name/version repeated in JSON", async () => {
        const propertyJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
          name: "ValidSchema",
          version: "1.2.3",
          alias: "vs",
          label: "SomeDisplayLabel",
          description: "A really long description...",
        };
        const testSchema = new Schema("ValidSchema", 1, 2, 3);
        expect(testSchema).to.exist;
        await testSchema.fromJson(propertyJson);
        assertValidSchema(testSchema);
      });

      it("with name/version omitted in JSON", async () => {
        const propertyJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
          alias: "vs",
          label: "SomeDisplayLabel",
          description: "A really long description...",
        };
        const testSchema = new Schema("ValidSchema", 1, 2, 3);
        expect(testSchema).to.exist;
        await testSchema.fromJson(propertyJson);
        assertValidSchema(testSchema);
      });
    });

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

    it("should throw for missing name", async () => {
      const json = {
        $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
      };
      const testSchema = new Schema();
      expect(testSchema).to.exist;
      expect(() => testSchema.name).to.throw(ECObjectsError, "An ECSchema is missing the required 'name' attribute.");
      await expect(testSchema.fromJson(json)).to.be.rejectedWith(ECObjectsError, "An ECSchema is missing the required 'name' attribute.");
    });

    it("should throw for mismatched name", async () => {
      const json = {
        $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
        name: "ThisDoesNotMatch",
      };
      const testSchema = new Schema("BadSchema");
      expect(testSchema).to.exist;
      await expect(testSchema.fromJson(json)).to.be.rejectedWith(ECObjectsError);
    });

    it("should throw for invalid name", async () => {
      const schema = new Schema();
      const schemaWithName = new Schema("BadSchema");

      const json: any = {
        $schema: "https://dev.bentley.com/json_schemas/ec/31/draft-01/ecschema",
        name: 0,
      };
      await expect(schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `An ECSchema has an invalid 'name' attribute. It should be of type 'string'.`);
      await expect(schemaWithName.fromJson(json)).to.be.rejectedWith(ECObjectsError, `he ECSchema BadSchema has an invalid 'name' attribute. It should be of type 'string'.`);
    });
    it("should throw for invalid alias", async () => testInvalidAttribute(new Schema("BadSchema"), "alias", "string", 0));
    it("should throw for invalid label", async () => testInvalidAttribute(new Schema("BadSchema"), "label", "string", 0));
    it("should throw for invalid description", async () => testInvalidAttribute(new Schema("BadSchema"), "description", "string", 0));
    it("should throw for invalid version", async () => testInvalidAttribute(new Schema("BadSchema"), "version", "string", 0));
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
});
