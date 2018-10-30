/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import * as sinon from "sinon";

import { Schema } from "./../../src/Metadata/Schema";
import { Format } from "./../../src/Metadata/Format";
import { ShowSignOption, FormatType, FormatTraits, FractionalPrecision } from "./../../src/utils/FormatEnums";
import { ECObjectsError } from "./../../src/Exception";
import { Unit } from "./../../src/Metadata/Unit";
import { schemaItemTypeToString, SchemaItemType } from "./../../src/ECObjects";
import { JsonParser } from "../../src/Deserialization/JsonParser";

describe("Format tests", () => {
  let testFormat: Format;
  let parser = new JsonParser();
  describe("accept", () => {
    beforeEach(() => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      testFormat = new Format(schema, "TestFormat");
    });

    it("should call visitFormat on a SchemaItemVisitor object", async () => {
      expect(testFormat).to.exist;
      const mockVisitor = { visitFormat: sinon.spy() };
      await testFormat.accept(mockVisitor);
      expect(mockVisitor.visitFormat.calledOnce).to.be.true;
      expect(mockVisitor.visitFormat.calledWithExactly(testFormat)).to.be.true;
    });

    it("should safely handle a SchemaItemVisitor without visitFormat defined", async () => {
      expect(testFormat).to.exist;
      await testFormat.accept({});
    });
  });

  describe("SchemaItemType", () => {
    const schema = new Schema("TestSchema", 1, 0, 0);
    testFormat = new Format(schema, "Test");
    it("should return correct item type and string", () => {
      assert.equal(testFormat.schemaItemType, SchemaItemType.Format);
      assert.equal(schemaItemTypeToString(testFormat.schemaItemType), "Format");
    });
  });

  describe("Async Tests without Composite", () => {
    beforeEach(() => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      testFormat = new Format(schema, "AmerMYFI4");
    });
    describe("fromJson", () => {
      it("Basic test", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.name, "AmerMYFI4");
        assert(testFormat.label, "myfi4");
        assert(testFormat.description === "");
        assert(testFormat.roundFactor === 0.0);
        assert(testFormat.type === FormatType.Fractional);
        assert(testFormat.showSignOption === ShowSignOption.OnlyNegative);
        assert(testFormat.hasFormatTrait(FormatTraits.KeepSingleZero));
        assert(testFormat.hasFormatTrait(FormatTraits.TrailZeroes));
        assert(testFormat.hasFormatTrait(FormatTraits.ApplyRounding) === false);
        assert(testFormat.precision === FractionalPrecision.Four);
        assert(testFormat.decimalSeparator, ".");
        assert(testFormat.thousandSeparator, ",");
        assert(testFormat.uomSeparator, " ");
        assert(testFormat.stationSeparator, "+");
      });
      it("Name must be a valid ECName", async () => {
        const json = {
          schema: "TestSchema",
          schemaItemType: "Format",
          name: "10AmerMYFI4",
          label: "myfi4",
          description: "",
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserialize(parser.parseFormatProps(json, json.name)), ECObjectsError, `The Format TestSchema.10AmerMYFI4 has an invalid 'name' attribute. '10AmerMYFI4' is not a valid ECName.`);
      });
      it("Description must be a string", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: 12345678,
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => parser.parseSchemaItemProps(json, testFormat.schema.name, testFormat.name), ECObjectsError, `The SchemaItem TestSchema.AmerMYFI4 has an invalid 'description' attribute. It should be of type 'string'.`);
      });
      it("Round factor is not default value", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          roundFactor: 20,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.roundFactor === 20);
      });
      it("Type is required", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => parser.parseFormatProps(json, testFormat.name), ECObjectsError, `The Format AmerMYFI4 does not have the required 'type' attribute.`);
      });
      it("Type value is invalid", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "fraction",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await expect(testFormat.deserialize(parser.parseFormatProps(json, testFormat.name))).to.be.rejectedWith(ECObjectsError, `The Format AmerMYFI4 has an invalid 'type' attribute.`);
      });
      it("Type is fractional; Precision value is invalid", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "fractional",
          description: "",
          showSignOption: "onlyNegative",
          precision: 3,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await expect(testFormat.deserialize(parser.parseFormatProps(json, testFormat.name))).to.be.rejectedWith(ECObjectsError, `The Format AmerMYFI4 has an invalid 'precision' attribute.`);
      });
      it("Type is fractional; Precision value is valid", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "fractional",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 16,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.precision === 16);
      });
      it("Type is decimal, scientific, or station; Precision value is invalid", async () => {
        const jsonDecimal = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "decimal",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 13,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        const jsonScientific = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "scientific",
          scientificType: "normalized",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 30,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        const jsonStation = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "station",
          stationOffsetSize: 3,
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: -1,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await expect(testFormat.deserialize(parser.parseFormatProps(jsonDecimal, testFormat.name))).to.be.rejectedWith(ECObjectsError, `The Format AmerMYFI4 contains a 'precision' attribute which must be an integer in the range 0-12.`);
        await expect(testFormat.deserialize(parser.parseFormatProps(jsonScientific, testFormat.name))).to.be.rejectedWith(ECObjectsError, `The Format AmerMYFI4 contains a 'precision' attribute which must be an integer in the range 0-12.`);
        await expect(testFormat.deserialize(parser.parseFormatProps(jsonStation, testFormat.name))).to.be.rejectedWith(ECObjectsError, `The Format AmerMYFI4 contains a 'precision' attribute which must be an integer in the range 0-12.`);
      });
      it("Type is decimal, scientific, or station; Precision value is valid", async () => {
        const jsonDecimal = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "decimal",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 3,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        const jsonScientific = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "scientific",
          scientificType: "normalized",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 0,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        const jsonStation = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "station",
          stationOffsetSize: 3,
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 12,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await testFormat.deserialize(parser.parseFormatProps(jsonDecimal, testFormat.name));
        assert(testFormat.precision === 3);
        await testFormat.deserialize(parser.parseFormatProps(jsonScientific, testFormat.name));
        assert(testFormat.precision === 0);
        await testFormat.deserialize(parser.parseFormatProps(jsonStation, testFormat.name));
        assert(testFormat.precision === 12);
      });
      it("MinWidth is not an int", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          minWidth: 3.3,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => parser.parseFormatProps(json, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'minWidth' attribute.`);
      });
      it("MinWidth is not positive", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          minWidth: -3,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => parser.parseFormatProps(json, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'minWidth' attribute.`);
      });
      it("Type is scientific; ScientificType is required", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "scientific",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await expect(testFormat.deserialize(parser.parseFormatProps(json, testFormat.name))).to.be.rejectedWith(ECObjectsError, `The Format AmerMYFI4 has type 'Scientific' therefore attribute 'scientificType' is required.`);
      });
      it("ScientificType value is not valid", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "scientific",
          showSignOption: "onlyNegative",
          scientificType: "normal",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await expect(testFormat.deserialize(parser.parseFormatProps(json, testFormat.name))).to.be.rejectedWith(ECObjectsError, `The Format AmerMYFI4 has an invalid 'scientificType' attribute.`);
      });
      it("Type is not scientific; ScientificType is provided and should be ignored", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "decimal",
          scientificType: "normalized",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.scientificType === undefined);
      });
      it("showSignOption must be a string", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "decimal",
          showSignOption: 456,
          scientificType: "normalized",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => parser.parseFormatProps(json, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'showSignOption' attribute. It should be of type 'string'.`);
      });
      it("showSignOption is not default value", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "decimal",
          showSignOption: "noSign",
          scientificType: "normalized",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.showSignOption === ShowSignOption.NoSign);
      });
      it("showSignOption is invalid", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "decimal",
          showSignOption: "noSigned",
          scientificType: "normalized",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
        };
        await expect(testFormat.deserialize(parser.parseFormatProps(json, testFormat.name))).to.be.rejectedWith(ECObjectsError, `The Format AmerMYFI4 has an invalid 'showSignOption' attribute.`);
      });
      it("UOMSeparator is not default", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: "-",
        };
        await testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.uomSeparator, "-");
      });
      it("StationSeparator is not default", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          stationSeparator: "-",
        };
        await testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.stationSeparator, "-");
      });
      it("StationOffsetSize is not an int", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          stationOffsetSize: 3.3,
          type: "station",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => parser.parseFormatProps(json, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'stationOffsetSize' attribute. It should be a positive integer.`);
      });
      it("StationOffsetSize is not positive", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          stationOffsetSize: -3,
          type: "station",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => parser.parseFormatProps(json, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'stationOffsetSize' attribute. It should be a positive integer.`);
      });
      it("Type is station; StationOffsetSize is required", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "station",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await expect(testFormat.deserialize(parser.parseFormatProps(json, testFormat.name))).to.be.rejectedWith(ECObjectsError, `The Format AmerMYFI4 has type 'Station' therefore attribute 'stationOffsetSize' is required.`);
      });
      it("Type is not station; StationOffsetSize is ignored", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          stationOffsetSize: 3,
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.stationOffsetSize === undefined);
      });
      it("decimalSeparator, thousandSeparator, uomSeparator, stationSeparator cannot be more than one character", async () => {
        const jsonDecimalSeparator = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "decimal",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 3,
          decimalSeparator: "..",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        const jsonThousandSeparator = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "scientific",
          scientificType: "normalized",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 0,
          decimalSeparator: ".",
          thousandSeparator: ",.",
          uomSeparator: " ",
        };
        const jsonUOMSeparator = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "station",
          stationOffsetSize: 3,
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 12,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: "  ",
        };
        const jsonStationSeparator = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "station",
          stationOffsetSize: 3,
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 12,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
          stationSeparator: "++",
        };
        assert.throws(() => parser.parseFormatProps(jsonDecimalSeparator, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'decimalSeparator' attribute.`);

        assert.throws(() => parser.parseFormatProps(jsonThousandSeparator, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'thousandSeparator' attribute.`);

        assert.throws(() => parser.parseFormatProps(jsonUOMSeparator, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'uomSeparator' attribute.`);

        assert.throws(() => parser.parseFormatProps(jsonStationSeparator, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'stationSeparator' attribute.`);
      });
    });
    describe("fromJson FormatTraits Tests", () => {
      it("String with valid options", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "trailZeroes|keepSingleZero|zeroEmpty|keepDecimalPoint|applyRounding|fractionDash|showUnitLabel|prependUnitLabel|use1000Separator|exponentOnlyNegative",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert((testFormat!.formatTraits & 0x3FF) === testFormat!.formatTraits);
      });
      it("Valid options with multiple separators", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "trailZeroes;keepSingleZero|zeroEmpty|keepDecimalPoint,applyRounding|fractionDash;showUnitLabel,prependUnitLabel;use1000Separator,exponentOnlyNegative",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert((testFormat!.formatTraits & 0x3FF) === testFormat!.formatTraits);
      });
      it("Valid options with invalid separator", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "trailZeroes;keepSingleZero|zeroEmpty|keepDecimalPoint,applyRounding\fractionDash;showUnitLabel,prependUnitLabel;use1000Separator,exponentOnlyNegative",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await expect(testFormat.deserialize(parser.parseFormatProps(json, testFormat.name))).to.be.rejectedWith(ECObjectsError, `Format has an invalid 'formatTraits' option.`);
      });
      it("String with invalid option", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "trailZero|keepSingleZero|zeroEmpty",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await expect(testFormat.deserialize(parser.parseFormatProps(json, testFormat.name))).to.be.rejectedWith(ECObjectsError, `Format has an invalid 'formatTraits' option.`);
      });
      it("Empty string should make formatTraits undefined", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.formatTraits === 0);
      });
      it("String[] with valid options", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: [
            "trailZeroes",
            "keepSingleZero",
            "zeroEmpty",
            "keepDecimalPoint",
            "applyRounding",
            "fractionDash",
            "showUnitLabel",
            "prependUnitLabel",
            "use1000Separator",
            "exponentOnlyNegative",
          ],
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await await testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert((testFormat!.formatTraits & 0x3FF) === testFormat!.formatTraits);
      });
      it("String[] with one valid option", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: [
            "trailZeroes",
          ],
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.hasFormatTrait(FormatTraits.KeepSingleZero) === false);
        assert(testFormat.hasFormatTrait(FormatTraits.TrailZeroes));
        assert(testFormat.hasFormatTrait(FormatTraits.ApplyRounding) === false);
      });
      it("String[] with invalid option", async () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: [
            "trailZero",
          ],
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        await expect(testFormat.deserialize(parser.parseFormatProps(json, testFormat.name))).to.be.rejectedWith(ECObjectsError, `Format has an invalid 'formatTraits' option.`);
      });
    });
  });
  describe("Sync Tests without Composite", () => {
    beforeEach(() => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      testFormat = new Format(schema, "AmerMYFI4");
    });
    describe("fromJson", () => {
      it("Basic test", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.name, "AmerMYFI4");
        assert(testFormat.label, "myfi4");
        assert(testFormat.description === "");
        assert(testFormat.roundFactor === 0.0);
        assert(testFormat.type === FormatType.Fractional);
        assert(testFormat.showSignOption === ShowSignOption.OnlyNegative);
        assert(testFormat.hasFormatTrait(FormatTraits.KeepSingleZero));
        assert(testFormat.hasFormatTrait(FormatTraits.TrailZeroes));
        assert(testFormat.hasFormatTrait(FormatTraits.ApplyRounding) === false);
        assert(testFormat.precision === FractionalPrecision.Four);
        assert(testFormat.decimalSeparator, ".");
        assert(testFormat.thousandSeparator, ",");
        assert(testFormat.uomSeparator, " ");
        assert(testFormat.stationSeparator, "+");
      });
      it("Name must be a valid ECName", () => {
        const json = {
          schema: "TestSchema",
          schemaItemType: "Format",
          name: "10AmerMYFI4",
          label: "myfi4",
          description: "",
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(json, json.name)), ECObjectsError, `The Format TestSchema.10AmerMYFI4 has an invalid 'name' attribute. '10AmerMYFI4' is not a valid ECName.`);
      });
      it("Description must be a string", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: 12345678,
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => parser.parseSchemaItemProps(json, testFormat.schema.name, testFormat.name), ECObjectsError, `The SchemaItem TestSchema.AmerMYFI4 has an invalid 'description' attribute. It should be of type 'string'.`);
      });
      it("Round factor is not default value", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          roundFactor: 20,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.roundFactor === 20);
      });
      it("Type is required", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name)), ECObjectsError, `The Format AmerMYFI4 does not have the required 'type' attribute.`);
      });
      it("Type value is invalid", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "fraction",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name)), ECObjectsError, `The Format AmerMYFI4 has an invalid 'type' attribute.`);
      });
      it("Type is fractional; Precision value is invalid", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "fractional",
          description: "",
          showSignOption: "onlyNegative",
          precision: 3,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name)), ECObjectsError, `The Format AmerMYFI4 has an invalid 'precision' attribute.`);
      });
      it("Type is fractional; Precision value is valid", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "fractional",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 16,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.precision === 16);
      });
      it("Type is decimal, scientific, or station; Precision value is invalid", () => {
        const jsonDecimal = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "decimal",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 13,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        const jsonScientific = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "scientific",
          scientificType: "normalized",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 30,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        const jsonStation = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "station",
          stationOffsetSize: 3,
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: -1,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(jsonDecimal, testFormat.name)), ECObjectsError, `The Format ${testFormat.name} contains a 'precision' attribute which must be an integer in the range 0-12.`);
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(jsonScientific, testFormat.name)), ECObjectsError, `The Format ${testFormat.name} contains a 'precision' attribute which must be an integer in the range 0-12.`);
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(jsonStation, testFormat.name)), ECObjectsError, `The Format ${testFormat.name} contains a 'precision' attribute which must be an integer in the range 0-12.`);
      });
      it("Type is decimal, scientific, or station; Precision value is valid", () => {
        const jsonDecimal = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "decimal",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 3,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        const jsonScientific = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "scientific",
          scientificType: "normalized",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 0,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        const jsonStation = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "station",
          stationOffsetSize: 3,
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 12,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        testFormat.deserializeSync(parser.parseFormatProps(jsonDecimal, testFormat.name));
        assert(testFormat.precision === 3);
        testFormat.deserializeSync(parser.parseFormatProps(jsonScientific, testFormat.name));
        assert(testFormat.precision === 0);
        testFormat.deserializeSync(parser.parseFormatProps(jsonStation, testFormat.name));
        assert(testFormat.precision === 12);
      });
      it("MinWidth is not an int", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          minWidth: 3.3,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name)), ECObjectsError, `The Format AmerMYFI4 has an invalid 'minWidth' attribute.`);
      });
      it("MinWidth is not positive", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          minWidth: -3,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name)), ECObjectsError, `The Format AmerMYFI4 has an invalid 'minWidth' attribute.`);
      });
      it("Type is scientific; ScientificType is required", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "scientific",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name)), ECObjectsError, `The Format AmerMYFI4 has type 'Scientific' therefore attribute 'scientificType' is required.`);
      });
      it("ScientificType value is not valid", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "scientific",
          showSignOption: "onlyNegative",
          scientificType: "normal",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name)), ECObjectsError, `The Format AmerMYFI4 has an invalid 'scientificType' attribute.`);
      });
      it("Type is not scientific; ScientificType is provided and should be ignored", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "decimal",
          scientificType: "normalized",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.scientificType === undefined);
      });
      it("showSignOption must be a string", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "decimal",
          showSignOption: 456,
          scientificType: "normalized",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name)), ECObjectsError, `The Format AmerMYFI4 has an invalid 'showSignOption' attribute. It should be of type 'string'.`);
      });
      it("showSignOption is not default value", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "decimal",
          showSignOption: "noSign",
          scientificType: "normalized",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.showSignOption === ShowSignOption.NoSign);
      });
      it("showSignOption is invalid", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "decimal",
          showSignOption: "noSigned",
          scientificType: "normalized",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name)), ECObjectsError, `The Format AmerMYFI4 has an invalid 'showSignOption' attribute.`);
      });
      it("UOMSeparator is not default", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: "-",
        };
        testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.uomSeparator, "-");
      });
      it("StationSeparator is not default", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          stationSeparator: "-",
        };
        testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.stationSeparator, "-");
      });
      it("StationOffsetSize is not an int", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          stationOffsetSize: 3.3,
          type: "station",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => parser.parseFormatProps(json, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'stationOffsetSize' attribute. It should be a positive integer.`);
      });
      it("StationOffsetSize is not positive", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          stationOffsetSize: -3,
          type: "station",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => parser.parseFormatProps(json, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'stationOffsetSize' attribute. It should be a positive integer.`);
      });
      it("Type is station; StationOffsetSize is required", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "station",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name)), ECObjectsError, `The Format AmerMYFI4 has type 'Station' therefore attribute 'stationOffsetSize' is required.`);
      });
      it("Type is not station; StationOffsetSize is ignored", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          stationOffsetSize: 3,
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.stationOffsetSize === undefined);
      });
      it("decimalSeparator, thousandSeparator, uomSeparator, stationSeparator cannot be more than one character", () => {
        const jsonDecimalSeparator = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "decimal",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 3,
          decimalSeparator: "..",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        const jsonThousandSeparator = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "scientific",
          scientificType: "normalized",
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 0,
          decimalSeparator: ".",
          thousandSeparator: ",.",
          uomSeparator: " ",
        };
        const jsonUOMSeparator = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "station",
          stationOffsetSize: 3,
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 12,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: "  ",
        };
        const jsonStationSeparator = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          type: "station",
          stationOffsetSize: 3,
          description: "",
          showSignOption: "onlyNegative",
          formatTraits: "keepSingleZero|trailZeroes",
          precision: 12,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
          stationSeparator: "++",
        };
        assert.throws(() => parser.parseFormatProps(jsonDecimalSeparator, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'decimalSeparator' attribute.`);
        assert.throws(() => parser.parseFormatProps(jsonThousandSeparator, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'thousandSeparator' attribute.`);
        assert.throws(() => parser.parseFormatProps(jsonUOMSeparator, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'uomSeparator' attribute.`);
        assert.throws(() => parser.parseFormatProps(jsonStationSeparator, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has an invalid 'stationSeparator' attribute.`);
      });
    });
    describe("fromJson FormatTraits Tests", () => {
      it("String with valid options", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "trailZeroes|keepSingleZero|zeroEmpty|keepDecimalPoint|applyRounding|fractionDash|showUnitLabel|prependUnitLabel|use1000Separator|exponentOnlyNegative",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert((testFormat!.formatTraits & 0x3FF) === testFormat!.formatTraits);
      });
      it("Valid options with multiple separators", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "trailZeroes;keepSingleZero|zeroEmpty|keepDecimalPoint,applyRounding|fractionDash;showUnitLabel,prependUnitLabel;use1000Separator,exponentOnlyNegative",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert((testFormat!.formatTraits & 0x3FF) === testFormat!.formatTraits);
      });
      it("Valid options with invalid separator", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "trailZeroes;keepSingleZero|zeroEmpty|keepDecimalPoint,applyRounding\fractionDash;showUnitLabel,prependUnitLabel;use1000Separator,exponentOnlyNegative",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name)), ECObjectsError, `Format has an invalid 'formatTraits' option.`);
      });
      it("String with invalid option", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "trailZero|keepSingleZero|zeroEmpty",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name)), ECObjectsError, `Format has an invalid 'formatTraits' option.`);
      });
      it("Empty string should make formatTraits undefined", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: "",
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.formatTraits === 0);
      });
      it("String[] with valid options", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: [
            "trailZeroes",
            "keepSingleZero",
            "zeroEmpty",
            "keepDecimalPoint",
            "applyRounding",
            "fractionDash",
            "showUnitLabel",
            "prependUnitLabel",
            "use1000Separator",
            "exponentOnlyNegative",
          ],
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name));
        assert((testFormat!.formatTraits & 0x3FF) === testFormat!.formatTraits);
      });
      it("String[] with one valid option", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: [
            "trailZeroes",
          ],
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name));
        assert(testFormat.hasFormatTrait(FormatTraits.KeepSingleZero) === false);
        assert(testFormat.hasFormatTrait(FormatTraits.TrailZeroes));
        assert(testFormat.hasFormatTrait(FormatTraits.ApplyRounding) === false);
      });
      it("String[] with invalid option", () => {
        const json = {
          schemaItemType: "Format",
          name: "AmerMYFI4",
          label: "myfi4",
          description: "",
          roundFactor: 0.0,
          type: "fractional",
          showSignOption: "onlyNegative",
          formatTraits: [
            "trailZero",
          ],
          precision: 4,
          decimalSeparator: ".",
          thousandSeparator: ",",
          uomSeparator: " ",
        };
        assert.throws(() => testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name)), ECObjectsError, `Format has an invalid 'formatTraits' option.`);
      });
    });
  });
  describe("Async Tests with Composite", () => {
    beforeEach(() => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      testFormat = new Format(schema, "AmerMYFI4");
    });

    it("Basic test", async () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: false,
              spacer: "-",
              units: [
                {
                  name: "TestSchema.MILE",
                  label: "mile(s)",
                },
              ],
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      const ecSchema = await Schema.fromJson(testSchema);
      assert.isDefined(ecSchema);
      const testItem = await ecSchema.getItem("AmerMYFI4");
      assert.isDefined(testItem);
      assert.isTrue(testItem instanceof Format);
      const formatTest: Format = testItem as Format;
      assert.isDefined(formatTest);
      expect(formatTest.type === FormatType.Fractional);
      const testUnitItem = await ecSchema.getItem("MILE");
      assert.isDefined(testUnitItem);
      const unitTest: Unit = testUnitItem as Unit;
      assert(unitTest!.name, "MILE");
    });
    it("Throw for Composite with missing units attribute", async () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: false,
              spacer: "-",
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      await expect(Schema.fromJson(testSchema)).to.be.rejectedWith(ECObjectsError, `The Format AmerMYFI4 has an invalid 'Composite' attribute. It must have 1-4 units.`);
    });
    it("Throw for Composite with empty units array", async () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: false,
              spacer: "-",
              units: [

              ],
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      await expect(Schema.fromJson(testSchema)).to.be.rejectedWith(ECObjectsError, `The Format AmerMYFI4 has an invalid 'Composite' attribute. It must have 1-4 units.`);
    });
    it("includeZero must be boolean", async () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: "false",
              spacer: "-",
              units: [
                {
                  name: "TestSchema.MILE",
                  label: "mile(s)",
                },
              ],
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      await expect(Schema.fromJson(testSchema)).to.be.rejectedWith(ECObjectsError, `The Format AmerMYFI4 has a Composite with an invalid 'includeZero' attribute. It should be of type 'boolean'.`);
    });
    it("spacer must be a one character string", async () => {
      const json = {
        schemaItemType: "Format",
        name: "AmerMYFI4",
        type: "fractional",
        precision: 4,
        composite: {
          includeZero: false,
          spacer: "space",
          units: [
            {
              name: "TestSchema.MILE",
              label: "mile(s)",
            },
          ],
        },
      };
      assert.throws(() => parser.parseFormatProps(json, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has a Composite with an invalid 'spacer' attribute.`);
    });
    it("spacer must be a string", async () => {
      const json = {
        includeZero: false,
        schemaItemType: "Format",
        name: "AmerMYFI4",
        type: "fractional",
        precision: 4,
        composite: {
          includeZero: false,
          spacer: 1,
          units: [
            {
              name: "TestSchema.MILE",
              label: "mile(s)",
            },
          ],
        },
      };
      assert.throws(() => parser.parseFormatProps(json, testFormat.name), ECObjectsError, `The Format AmerMYFI4 has a Composite with an invalid 'spacer' attribute.`);
    });
    it("Unit names must be unique", async () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: false,
              spacer: "-",
              units: [
                {
                  name: "TestSchema.MILE",
                  label: "mile(s)",
                },
                {
                  name: "TestSchema.MILE",
                  label: "yrd(s)",
                },
              ],
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      await expect(Schema.fromJson(testSchema)).to.be.rejectedWith(ECObjectsError, `The unit MILE has a duplicate name.`);

    });
    it("Cannot have more than 4 units", async () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: false,
              spacer: "-",
              units: [
                {
                  name: "MILE",
                  label: "mile(s)",
                },
                {
                  name: "YRD",
                  label: "yrd(s)",
                },
                {
                  name: "FT",
                  label: "'",
                },
                {
                  name: "IN",
                  label: "\"",
                },
                {
                  name: "METER",
                  label: "meter(s)",
                },
              ],
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      await expect(Schema.fromJson(testSchema)).to.be.rejectedWith(ECObjectsError, `The Format AmerMYFI4 has an invalid 'Composite' attribute. It must have 1-4 units.`);
    });
  });
  describe("Sync Tests with Composite", () => {
    beforeEach(() => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      testFormat = new Format(schema, "AmerMYFI4");
    });

    it("Basic test", () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: false,
              spacer: "-",
              units: [
                {
                  name: "TestSchema.MILE",
                  label: "mile(s)",
                },
              ],
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      const ecSchema = Schema.fromJsonSync(testSchema);
      assert.isDefined(ecSchema);
      const testItem = ecSchema.getItemSync("AmerMYFI4");
      assert.isDefined(testItem);
      assert.isTrue(testItem instanceof Format);
      const formatTest: Format = testItem as Format;
      assert.isDefined(formatTest);
      expect(formatTest.type === FormatType.Fractional);
      const testUnitItem = ecSchema.getItemSync("MILE");
      assert.isDefined(testUnitItem);
      const unitTest: Unit = testUnitItem as Unit;
      assert(unitTest!.name, "MILE");
    });
    it("Throw for Composite with missing units attribute", () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: false,
              spacer: "-",
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      assert.throws(() => Schema.fromJsonSync(testSchema), ECObjectsError, `The Format AmerMYFI4 has an invalid 'Composite' attribute. It must have 1-4 units.`);
    });
    it("Throw for Composite with empty units array", () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: false,
              spacer: "-",
              units: [

              ],
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      assert.throws(() => Schema.fromJsonSync(testSchema), ECObjectsError, `The Format AmerMYFI4 has an invalid 'Composite' attribute. It must have 1-4 units.`);
    });
    it("includeZero must be boolean", () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: "false",
              spacer: "-",
              units: [
                {
                  name: "TestSchema.MILE",
                  label: "mile(s)",
                },
              ],
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      assert.throws(() => Schema.fromJsonSync(testSchema), ECObjectsError, `The Format AmerMYFI4 has a Composite with an invalid 'includeZero' attribute. It should be of type 'boolean'.`);
    });
    it("spacer must be a one character string", () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: false,
              spacer: "spacer",
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      assert.throws(() => Schema.fromJsonSync(testSchema), ECObjectsError, `The Format AmerMYFI4 has a Composite with an invalid 'spacer' attribute.`);
    });
    it("spacer must be a string", () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: false,
              spacer: 8,
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      assert.throws(() => Schema.fromJsonSync(testSchema), ECObjectsError, `The Format AmerMYFI4 has a Composite with an invalid 'spacer' attribute.`);
    });
    it("Unit names must be unique", () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: false,
              spacer: "-",
              units: [
                {
                  name: "TestSchema.MILE",
                  label: "mile(s)",
                },
                {
                  name: "TestSchema.MILE",
                  label: "yrd(s)",
                },
              ],
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      assert.throws(() => Schema.fromJsonSync(testSchema), ECObjectsError, `The unit MILE has a duplicate name.`);

    });
    it("Cannot have more than 4 units", () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: false,
              spacer: "-",
              units: [
                {
                  name: "MILE",
                  label: "mile(s)",
                },
                {
                  name: "YRD",
                  label: "yrd(s)",
                },
                {
                  name: "FT",
                  label: "'",
                },
                {
                  name: "IN",
                  label: "\"",
                },
                {
                  name: "METER",
                  label: "meter(s)",
                },
              ],
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      assert.throws(() => Schema.fromJsonSync(testSchema), ECObjectsError, `The Format AmerMYFI4 has an invalid 'Composite' attribute. It must have 1-4 units.`);
    });
  });
  describe("toJson", () => {
    beforeEach(() => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      testFormat = new Format(schema, "AmerMYFI4");
    });

    it("Basic test I", () => {
      const testSchema = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          AmerMYFI4: {
            schemaItemType: "Format",
            type: "fractional",
            precision: 4,
            composite: {
              includeZero: false,
              spacer: "-",
              units: [
                {
                  name: "TestSchema.MILE",
                  label: "mile(s)",
                },
              ],
            },
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Imperial: {
            schemaItemType: "UnitSystem",
          },
          MILE: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Imperial",
            definition: "mile",
          },
        },
      };
      const ecSchema = Schema.fromJsonSync(testSchema);
      assert.isDefined(ecSchema);
      const testItem = ecSchema.getItemSync("AmerMYFI4");
      assert.isDefined(testItem);
      assert.isTrue(testItem instanceof Format);
      const formatTest: Format = testItem as Format;
      assert.isDefined(formatTest);
      const formatSerialization = formatTest.toJson(false, true);
      assert.isDefined(formatSerialization);
      expect(formatSerialization.type).equals("Fractional");
      expect(formatSerialization.precision).equals(4);
      expect(formatSerialization.decimalSeparator).equals(".");
      expect(formatSerialization.roundFactor).equals(0);
      expect(formatSerialization.showSignOption).equals("OnlyNegative");
      expect(formatSerialization.stationSeparator).equals("+");
      expect(formatSerialization.thousandSeparator).equals(",");
      expect(formatSerialization.uomSeparator).equals(" ");
      expect(formatSerialization.composite.includeZero).equals(false);
      expect(formatSerialization.composite.spacer).equals("-");
      expect(formatSerialization.composite.units).to.deep.equal([{ name: "MILE", label: "mile(s)" }]);

    });
    it("Basic test with formatTraits", () => {
      const json = {
        schemaItemType: "Format",
        name: "AmerMYFI4",
        label: "myfi4",
        description: "",
        roundFactor: 0.0,
        type: "fractional",
        formatTraits: "keepSingleZero|trailZeroes",
        precision: 4,
        decimalSeparator: ".",
        thousandSeparator: ",",
        uomSeparator: " ",
      };
      testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name));
      const formatSerialization = testFormat.toJson(false, true);
      assert.isDefined(formatSerialization);
      assert(formatSerialization.formatTraits.indexOf("KeepSingleZero") !== -1);
      assert(formatSerialization.formatTraits.indexOf("TrailZeroes") !== -1);
    });
    it("String with valid options", () => {
      const json = {
        schemaItemType: "Format",
        name: "AmerMYFI4",
        label: "myfi4",
        description: "",
        roundFactor: 0.0,
        type: "fractional",
        showSignOption: "onlyNegative",
        formatTraits: "trailZeroes|keepSingleZero|zeroEmpty|keepDecimalPoint|applyRounding|fractionDash|showUnitLabel|prependUnitLabel|use1000Separator|exponentOnlyNegative",
        precision: 4,
        decimalSeparator: ".",
        thousandSeparator: ",",
        uomSeparator: " ",
      };
      testFormat.deserializeSync(parser.parseFormatProps(json, testFormat.name));
      const formatSerialization = testFormat.toJson(false, true);
      assert.isDefined(formatSerialization);
      assert(formatSerialization.formatTraits.indexOf("TrailZeroes") !== -1);
      assert(formatSerialization.formatTraits.indexOf("KeepSingleZero") !== -1);
      assert(formatSerialization.formatTraits.indexOf("ZeroEmpty") !== -1);
      assert(formatSerialization.formatTraits.indexOf("KeepDecimalPoint") !== -1);
      assert(formatSerialization.formatTraits.indexOf("ApplyRounding") !== -1);
      assert(formatSerialization.formatTraits.indexOf("FractionDash") !== -1);
      assert(formatSerialization.formatTraits.indexOf("ShowUnitLabel") !== -1);
      assert(formatSerialization.formatTraits.indexOf("PrependUnitLabel") !== -1);
      assert(formatSerialization.formatTraits.indexOf("Use1000Separator") !== -1);
      assert(formatSerialization.formatTraits.indexOf("ExponentOnlyNegative") !== -1);
    });
    it("Empty string should make formatTraits undefined", () => {
      const json = {
        schemaItemType: "Format",
        name: "AmerMYFI4",
        label: "myfi4",
        description: "",
        roundFactor: 0.0,
        type: "fractional",
        showSignOption: "onlyNegative",
        formatTraits: "",
        precision: 4,
        decimalSeparator: ".",
        thousandSeparator: ",",
        uomSeparator: " ",
      };
      testFormat.deserialize(parser.parseFormatProps(json, testFormat.name));
      const formatSerialization = testFormat.toJson(false, true);
      assert.isDefined(formatSerialization);
      assert(formatSerialization.formatTraits.length === 0);
    });
  });
});
