/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import * as sinon from "sinon";

import { createSchemaJsonWithItems } from "../TestUtils/DeserializationHelpers";
import { TestSchemaLocater } from "../TestUtils/FormatTestHelper";

import { ECObjectsError } from "../../src/Exception";
import KindOfQuantity from "../../src/Metadata/KindOfQuantity";
import OverrideFormat from "../../src/Metadata/OverrideFormat";
import Schema from "../../src/Metadata/Schema";

import Unit from "../../src/Metadata/Unit";
import Format from "../../src/Metadata/Format";
import SchemaContext from "../../src/Context";
import { DecimalPrecision } from "../../src/utils/FormatEnums";

describe("KindOfQuantity", () => {

  describe("accept", () => {
    const schema = new Schema("TestSchema", 1, 0, 0);
    let testKoq: KindOfQuantity;

    beforeEach(() => {
      testKoq = new KindOfQuantity(schema, "TestKindOfQuantity");
    });

    it("should call visitKindOfQuantity on a SchemaItemVisitor object", async () => {
      expect(testKoq).to.exist;
      const mockVisitor = { visitKindOfQuantity: sinon.spy() };
      await testKoq.accept(mockVisitor);
      expect(mockVisitor.visitKindOfQuantity.calledOnce).to.be.true;
      expect(mockVisitor.visitKindOfQuantity.calledWithExactly(testKoq)).to.be.true;
    });

    it("should safely handle a SchemaItemVisitor without visitKindOfQuantity defined", async () => {
      expect(testKoq).to.exist;
      await testKoq.accept({});
    });
  });

  describe("deserialization", () => {
    let context: SchemaContext;
    beforeEach(() => {
      context = new SchemaContext();

      // contains the Formats schema
      context.addLocater(new TestSchemaLocater());
    });

    function createSchemaJson(koq: any) {
      return createSchemaJsonWithItems({
        TestKoQ: {
          schemaItemType: "KindOfQuantity",
          ...koq,
        },
      }, {
          references: [
            {
              name: "Formats",
              version: "1.0.0",
            },
          ],
        });
    }

    const fullDefinedJson = createSchemaJson({
      relativeError: 5,
      persistenceUnit: "Formats.IN",
      presentationUnits: [
        "Formats.DefaultReal",
      ],
    });
    it("async - should succeed with fully defined", async () => {
      const ecSchema = await Schema.fromJson(fullDefinedJson, context);
      assert.isDefined(ecSchema);

      const testItem = await ecSchema.getItem("testKoQ");
      assert.isTrue(testItem instanceof KindOfQuantity);
      const koq: KindOfQuantity = testItem as KindOfQuantity;
      assert.isDefined(koq);

      expect(koq.relativeError).equal(5);

      assert.isDefined(koq.persistenceUnit);
      const schemaPersistenceUnit = await ecSchema.lookupItem<Unit>("Formats.IN");
      assert.equal(schemaPersistenceUnit, await koq.persistenceUnit);

      assert.isDefined(koq.presentationUnits);
      expect(koq.presentationUnits!.length).to.eql(1);
      for (const lazyFormat of koq.presentationUnits!) {
        const schemaFormat = await ecSchema.lookupItem<Format>("Formats.DefaultReal");
        const koqFormat = await lazyFormat;
        assert.isTrue(schemaFormat === koqFormat);
      }
    });
    it("sync - should succeed with fully defined", () => {
      const ecSchema = Schema.fromJsonSync(fullDefinedJson, context);
      assert.isDefined(ecSchema);

      const testItem = ecSchema.getItemSync("testKoQ");
      assert.isTrue(testItem instanceof KindOfQuantity);
      const koq: KindOfQuantity = testItem as KindOfQuantity;
      assert.isDefined(koq);

      expect(koq.relativeError).equal(5);

      assert.isDefined(koq.persistenceUnit);
      const schemaPersistenceUnit = ecSchema.lookupItemSync<Unit>("Formats.IN");
      assert.equal(schemaPersistenceUnit, ecSchema.lookupItemSync<Unit>(koq.persistenceUnit!.fullName));

      assert.isDefined(koq.presentationUnits);
      expect(koq.presentationUnits!.length).to.eql(1);
      // Can't do this portion of the test because need to wait to resolve the format....
      // for (const lazyFormat of koq.presentationUnits!) {
      //   const schemaFormat = ecSchema.getItemSync<Format>("Formats.DefaultReal", true);
      //   assert.equal(schemaFormat, ecSchema.getItemSync<Format>(lazyFormat.key.schemaName + "." + lazyFormat.name, true));
      // }
    });

    // should throw for missing persistenceUnit
    const missingPersistenceUnit = createSchemaJson({
      relativeError: 5,
    });
    it("async - should throw for missing persistenceUnit", async () => {
      await expect(Schema.fromJson(missingPersistenceUnit, context)).to.be.rejectedWith(ECObjectsError, `The KindOfQuantity TestKoQ is missing the required attribute 'persistenceUnit'.`);
    });
    it("sync - should throw for missing persistenceUnit", () => {
      assert.throws(() => Schema.fromJsonSync(missingPersistenceUnit, context), ECObjectsError, `The KindOfQuantity TestKoQ is missing the required attribute 'persistenceUnit'.`);
    });

    // should throw for not found persistenceUnit
    const badPersistenceUnit = createSchemaJson({
      relativeError: 4,
      persistenceUnit: "TestSchema.BadUnit",
    });
    it("async - should throw when persistenceUnit not found", async () => {
      await expect(Schema.fromJson(badPersistenceUnit, context)).to.be.rejectedWith(ECObjectsError, `The SchemaItem BadUnit does not exist.`);
    });
    it("sync - should throw when persistenceUnit not found", () => {
      assert.throws(() => Schema.fromJsonSync(badPersistenceUnit, context), ECObjectsError, `The SchemaItem BadUnit does not exist.`);
    });

    // should throw for presentationUnits not an array or string
    const invalidPresentationUnits = createSchemaJson({
      relativeError: 5,
      persistenceUnit: "Formats.IN",
      presentationUnits: 5,
    });
    it("async - should throw for presentationUnits not an array or string", async () => {
      await expect(Schema.fromJson(invalidPresentationUnits, context)).to.be.rejectedWith(ECObjectsError, `The Kind Of Quantity TestKoQ has an invalid 'presentationUnits' attribute. It should be of type 'string' or 'string[]'.`);
    });
    it("sync - should throw for presentationUnits not an array or string", () => {
      assert.throws(() => Schema.fromJsonSync(invalidPresentationUnits, context), ECObjectsError, `The Kind Of Quantity TestKoQ has an invalid 'presentationUnits' attribute. It should be of type 'string' or 'string[]'.`);
    });

    // invalid presentation format
    const formatNonExistent = createSchemaJson({
      relativeError: 4,
      persistenceUnit: "Formats.IN",
      presentationUnits: [
        "TestSchema.NonexistentFormat",
      ],
    });
    it("async - should throw for presentationUnit having a non-existent format", async () => {
      await expect(Schema.fromJson(formatNonExistent, context)).to.be.rejectedWith(ECObjectsError, `The SchemaItem NonexistentFormat does not exist.`);
    });
    it("sync - should throw for presentationUnit having a non-existent format", () => {
      assert.throws(() => Schema.fromJsonSync(formatNonExistent, context), ECObjectsError, `The SchemaItem NonexistentFormat does not exist.`);
    });

    describe("format overrides", () => {
      // relativeError override
      const relativeErrorOverride = createSchemaJson({
        relativeError: 4,
        persistenceUnit: "Formats.IN",
        presentationUnits: [
          "Formats.DefaultReal(2)",
          "Formats.DefaultReal(3,)",
          "Formats.DefaultReal(4,,)",
        ],
      });
      it("async - relativeError override", async () => {
        const schema = await Schema.fromJson(relativeErrorOverride, context);
        const testKoQItem = await schema.getItem<KindOfQuantity>("TestKoQ");

        assert.isDefined(testKoQItem);
        expect(testKoQItem!.presentationUnits!.length).to.eql(3);
        const defaultFormat = testKoQItem!.defaultPresentationFormat;
        assert.isDefined(defaultFormat);
        assert.isTrue(defaultFormat instanceof OverrideFormat);

        assert.notEqual(defaultFormat, await schema.lookupItem<Format>((defaultFormat as OverrideFormat).parent.key.fullName), "The format in the KOQ should be different than the one in the schema");

        expect(defaultFormat!.precision).eql(DecimalPrecision.Two);

        expect(testKoQItem!.presentationUnits![1].precision).eql(3);
        expect(testKoQItem!.presentationUnits![2].precision).eql(4);
      });
      it("sync - relativeError override", () => {
        const schema = Schema.fromJsonSync(relativeErrorOverride, context);
        const testKoQItem = schema.getItemSync<KindOfQuantity>("TestKoQ");

        assert.isDefined(testKoQItem);
        expect(testKoQItem!.presentationUnits!.length).to.eql(3);
        const defaultFormat = testKoQItem!.defaultPresentationFormat;
        assert.isDefined(defaultFormat);

        assert.notEqual(defaultFormat, schema.lookupItemSync<Format>((defaultFormat as OverrideFormat).parent.key.fullName), "The format in the KOQ should be different than the one in the schema");

        expect(defaultFormat!.precision).eql(DecimalPrecision.Two);

        expect(testKoQItem!.presentationUnits![1].precision).eql(3);
        expect(testKoQItem!.presentationUnits![2].precision).eql(4);
      });

      // single unit override
      const singleUnitOverride = createSchemaJson({
        relativeError: 4,
        persistenceUnit: "Formats.IN",
        presentationUnits: [
          "Formats.DefaultReal[Formats.IN]",
        ],
      });
      it("async - single unit override", async () => {
        const schema = await Schema.fromJson(singleUnitOverride, context);
        const testKoQItem = await schema.getItem<KindOfQuantity>("TestKoQ");

        assert.isDefined(testKoQItem);
        expect(testKoQItem!.presentationUnits!.length).to.eql(1);
        const defaultFormat = await testKoQItem!.defaultPresentationFormat;
        assert.isDefined(defaultFormat);

        assert.notEqual(defaultFormat, await schema.lookupItem<Format>((defaultFormat as OverrideFormat).parent.key.fullName), "The format in the KOQ should be different than the one in the schema");

        assert.isDefined(defaultFormat!.units);
        expect(defaultFormat!.units!.length).to.eql(1);
        const unitOverride = defaultFormat!.units![0];
        const unitFromSchema = await schema.lookupItem(unitOverride[0].key.schemaName + "." + unitOverride[0].name);
        assert.equal(await unitOverride[0], unitFromSchema);
        assert.isUndefined(unitOverride[1]);
      });
      it("sync - single unit override", () => {
        const schema = Schema.fromJsonSync(singleUnitOverride, context);
        const testKoQItem = schema.getItemSync<KindOfQuantity>("TestKoQ");

        assert.isDefined(testKoQItem);
        expect(testKoQItem!.presentationUnits!.length).to.eql(1);
        const defaultFormat = testKoQItem!.defaultPresentationFormat;
        assert.isDefined(defaultFormat);

        assert.notEqual(defaultFormat, schema.lookupItemSync<Format>((defaultFormat as OverrideFormat).parent.key.fullName), "The format in the KOQ should be different than the one in the schema");

        assert.isDefined(defaultFormat!.units);
        expect(defaultFormat!.units!.length).to.eql(1);
        const unitOverride = defaultFormat!.units![0];
        const unitFromSchema = schema.lookupItemSync(unitOverride[0].key.schemaName + "." + unitOverride[0].name);
        assert.equal(unitOverride[0], unitFromSchema);
        assert.isUndefined(unitOverride[1]);
      });

      // single unit label override
      const singleUnitLabelOverride = createSchemaJson({
        relativeError: 4,
        persistenceUnit: "Formats.IN",
        presentationUnits: [
          "Formats.DefaultReal[Formats.IN| in]",
        ],
      });
      it("async - single unit label override", async () => {
        const schema = await Schema.fromJson(singleUnitLabelOverride, context);
        const testKoQItem = await schema.getItem<KindOfQuantity>("TestKoQ");

        assert.isDefined(testKoQItem);
        expect(testKoQItem!.presentationUnits!.length).to.eql(1);
        const defaultFormat = testKoQItem!.defaultPresentationFormat;
        assert.isDefined(defaultFormat);

        assert.isDefined(defaultFormat!.units);
        expect(defaultFormat!.units!.length).to.eql(1);
        const unitOverride = defaultFormat!.units![0];
        const unitFromSchema = await schema.lookupItem(unitOverride[0].key.schemaName + "." + unitOverride[0].name);
        assert.equal(await unitOverride[0], unitFromSchema);
        expect(unitOverride[1]).to.be.eql(" in");
      });
      it("sync - single unit label override", () => {
        const schema = Schema.fromJsonSync(singleUnitLabelOverride, context);
        const testKoQItem = schema.getItemSync<KindOfQuantity>("TestKoQ");

        assert.isDefined(testKoQItem);
        expect(testKoQItem!.presentationUnits!.length).to.eql(1);
        const defaultFormat = testKoQItem!.defaultPresentationFormat;
        assert.isDefined(defaultFormat);

        assert.isDefined(defaultFormat!.units);
        expect(defaultFormat!.units!.length).to.eql(1);
        const unitOverride = defaultFormat!.units![0];
        const unitFromSchema = schema.lookupItemSync(unitOverride[0].key.schemaName + "." + unitOverride[0].name);
        assert.equal(unitOverride[0], unitFromSchema);
        expect(unitOverride[1]).to.be.eql(" in");
      });

      // TODO add tests for all # of overrides

      // failure cases
      function testInvalidFormatStrings(testName: string, formatString: string, expectedErrorMessage: string) {
        const badOverrideString = createSchemaJson({
          relativeError: 4,
          persistenceUnit: "Formats.IN",
          presentationUnits: [
            formatString,
          ],
        });

        it("async - " + testName, async () => {
          await expect(Schema.fromJson(badOverrideString, context)).to.be.rejectedWith(ECObjectsError, expectedErrorMessage);
        });

        it("sync - " + testName, () => {
          assert.throws(() => Schema.fromJsonSync(badOverrideString, context), ECObjectsError, expectedErrorMessage);
        });
      }

      // The regex doesn't properly catch this case and just ignores the ().
      // testInvalidFormatStrings("should throw for invalid override string without any overrides", "Formats.DefaultReal()", "");
      // testInvalidFormatStrings("should throw for invalid override string with empty unit brackets", "Formats.DefaultReal[]", "");
      // testInvalidFormatStrings("should throw for invalid override string with only vertical bar in unit brackets", "Formats.DefaultReal[|]", "");
      // testInvalidFormatStrings("should throw for invalid override string with an empty string for unit", "Formats.DefaultReal[|label]", "Unable to locate SchemaItem .");
      testInvalidFormatStrings("should throw for invalid override string with an invalid precision", "Formats.DefaultReal(banana)", "");
      testInvalidFormatStrings("should throw for invalid override string without any overrides but still has commas", "Formats.DefaultReal(,,,,,)", "");
      testInvalidFormatStrings("should throw for invalid override string with 5 unit overrides", "Formats.DefaultReal[Formats.MILE|m][Formats.YRD|yard][Formats.FT|feet][Formats.IN|in][Formats.MILLIINCH|milli]", "");
      testInvalidFormatStrings("should throw for presentationUnit having a non-existent unit as an override", "Formats.DefaultReal[Formats.NonexistentUnit]", "Unable to locate SchemaItem Formats.NonexistentUnit.");
    });
  });
  describe("toJson", () => {
    let context: SchemaContext;
    beforeEach(() => {
      context = new SchemaContext();

      // contains the Formats schema
      context.addLocater(new TestSchemaLocater());
    });

    function createSchemaJson(koq: any) {
      return createSchemaJsonWithItems({
        TestKoQ: {
          schemaItemType: "KindOfQuantity",
          ...koq,
        },
      }, {
          references: [
            {
              name: "Formats",
              version: "1.0.0",
            },
          ],
        });
    }

    it("async - should succeed with fully defined", async () => {
      const fullDefinedJson = createSchemaJson({
        relativeError: 5,
        persistenceUnit: "Formats.IN",
        presentationUnits: [
          "Formats.DefaultReal",
        ],
      });
      const ecSchema = await Schema.fromJson(fullDefinedJson, context);
      assert.isDefined(ecSchema);

      const testItem = await ecSchema.getItem("testKoQ");
      assert.isTrue(testItem instanceof KindOfQuantity);
      const koq: KindOfQuantity = testItem as KindOfQuantity;
      assert.isDefined(koq);
      const koqSerialization = koq.toJson(true, true);
      assert.isDefined(koqSerialization);
      expect(koqSerialization.relativeError).equal(5);
      expect(koqSerialization.persistenceUnit).equal("Formats.IN");
      expect(koqSerialization.presentationUnits[0]).equal("DefaultReal");
    });
    it("sync - should succeed with fully defined", () => {
      const fullDefinedJson = createSchemaJson({
        relativeError: 5,
        persistenceUnit: "Formats.IN",
        presentationUnits: [
          "Formats.DefaultReal",
        ],
      });
      const ecSchema = Schema.fromJsonSync(fullDefinedJson, context);
      assert.isDefined(ecSchema);

      const testItem = ecSchema.getItemSync("testKoQ");
      assert.isTrue(testItem instanceof KindOfQuantity);
      const koq: KindOfQuantity = testItem as KindOfQuantity;
      assert.isDefined(koq);
      const koqSerialization = koq.toJson(true, true);
      assert.isDefined(koqSerialization);
      expect(koqSerialization.relativeError).equal(5);
      expect(koqSerialization.persistenceUnit).equal("Formats.IN");
      expect(koqSerialization.presentationUnits[0]).equal("DefaultReal");
    });
    it("async - should succeed with list of presentation units", async () => {
      const fullDefinedJson = createSchemaJson({
        relativeError: 5,
        persistenceUnit: "Formats.FT",
        presentationUnits: [
          "Formats.DefaultReal",
          "Formats.DefaultReal",
          "Formats.DefaultReal",
        ],
      });
      const ecSchema = await Schema.fromJson(fullDefinedJson, context);
      assert.isDefined(ecSchema);

      const testItem = await ecSchema.getItem("testKoQ");
      assert.isTrue(testItem instanceof KindOfQuantity);
      const koq: KindOfQuantity = testItem as KindOfQuantity;
      assert.isDefined(koq);
      const koqSerialization = koq.toJson(true, true);
      assert.isDefined(koqSerialization);
      expect(koqSerialization.relativeError).equal(5);
      expect(koqSerialization.persistenceUnit).equal("Formats.FT");
      expect(koqSerialization.presentationUnits).to.deep.equal(["DefaultReal", "DefaultReal", "DefaultReal"]);
    });
    it("sync - should succeed with list of presentation units", () => {
      const fullDefinedJson = createSchemaJson({
        relativeError: 5,
        persistenceUnit: "Formats.FT",
        presentationUnits: [
          "Formats.DefaultReal",
          "Formats.DefaultReal",
          "Formats.DefaultReal",
        ],
      });
      const ecSchema = Schema.fromJsonSync(fullDefinedJson, context);
      assert.isDefined(ecSchema);

      const testItem = ecSchema.getItemSync("testKoQ");
      assert.isTrue(testItem instanceof KindOfQuantity);
      const koq: KindOfQuantity = testItem as KindOfQuantity;
      assert.isDefined(koq);
      const koqSerialization = koq.toJson(true, true);
      assert.isDefined(koqSerialization);
      expect(koqSerialization.relativeError).equal(5);
      expect(koqSerialization.persistenceUnit).equal("Formats.FT");
      expect(koqSerialization.presentationUnits).to.deep.equal(["DefaultReal", "DefaultReal", "DefaultReal"]);
    });
  });
});
