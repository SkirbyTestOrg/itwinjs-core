/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import * as sinon from "sinon";

import { Schema } from "../../src/Metadata/Schema";
import { InvertedUnit } from "../../src/Metadata/InvertedUnit";
import { ECObjectsError } from "../../src/Exception";
import { UnitSystem } from "../../src/Metadata/UnitSystem";
import { Unit } from "../../src/Metadata/Unit";
import { schemaItemTypeToString, SchemaItemType } from "../../src/ECObjects";

describe("Inverted Unit tests", () => {
  let testUnit: InvertedUnit;
  describe("accept", () => {
    beforeEach(() => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      testUnit = new InvertedUnit(schema, "TestInvertedUnit");
    });

    it("should call visitInvertedUnit on a SchemaItemVisitor object", async () => {
      expect(testUnit).to.exist;
      const mockVisitor = { visitInvertedUnit: sinon.spy() };
      await testUnit.accept(mockVisitor);
      expect(mockVisitor.visitInvertedUnit.calledOnce).to.be.true;
      expect(mockVisitor.visitInvertedUnit.calledWithExactly(testUnit)).to.be.true;
    });

    it("should safely handle a SchemaItemVisitor without visitInvertedUnit defined", async () => {
      expect(testUnit).to.exist;
      await testUnit.accept({});
    });
  });

  describe("SchemaItemType", () => {
    const schema = new Schema("TestSchema", 1, 0, 0);
    testUnit = new InvertedUnit(schema, "Test");
    it("should return correct item type and string", () => {
      assert.equal(testUnit.schemaItemType, SchemaItemType.InvertedUnit);
      assert.equal(schemaItemTypeToString(testUnit.schemaItemType), "InvertedUnit");
    });
  });

  describe("Async fromJson", () => {
    beforeEach(() => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      testUnit = new InvertedUnit(schema, "HORIZONTAL_PER_VERTICAL");
    });

    it("Basic test for label", async () => {
      const json = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          HORIZONTAL_PER_VERTICAL: {
            schemaItemType: "InvertedUnit",
            unitSystem: "TestSchema.INTERNATIONAL",
            invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
            label: "Horizontal/Vertical",
          },
          INTERNATIONAL: {
            schemaItemType: "UnitSystem",
            label: "Imperial",
            description: "Units of measure from the british imperial empire",
          },
          VERTICAL_PER_HORIZONTAL: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.INTERNATIONAL",
            definition: "Vert/Horizontal",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "TestSchema.Length",
          },
        },
      };
      const ecSchema = await Schema.fromJson(json);
      assert.isDefined(ecSchema);
      const testItem = await ecSchema.getItem("HORIZONTAL_PER_VERTICAL");
      assert.isDefined(testItem);
      assert.isTrue(testItem instanceof InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      assert.isDefined(testInvertedUnit);
      assert(testInvertedUnit.label, "Horizontal/Vertical");
    });
    it("Label and description are optional", async () => {
      const json = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          HORIZONTAL_PER_VERTICAL: {
            schemaItemType: "InvertedUnit",
            unitSystem: "TestSchema.INTERNATIONAL",
            invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
            label: "Horizontal/Vertical",
          },
          INTERNATIONAL: {
            schemaItemType: "UnitSystem",
            label: "Imperial",
            description: "Units of measure from the british imperial empire",
          },
          VERTICAL_PER_HORIZONTAL: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.INTERNATIONAL",
            definition: "Vert/Horizontal",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "TestSchema.Length",
          },
        },
      };
      const ecSchema = await Schema.fromJson(json);
      assert.isDefined(ecSchema);
      const testItem = await ecSchema.getItem("HORIZONTAL_PER_VERTICAL");
      assert.isDefined(testItem);
      assert.isTrue(testItem instanceof InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      assert.isDefined(testInvertedUnit);
      assert(testInvertedUnit.unitSystem, "TestSchema.INTERNATIONAL");
      assert(testInvertedUnit.invertsUnit, "TestSchema.VERTICAL_PER_HORIZONTAL");
    });
    it("unitSystem is required", async () => {
      const json = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          HORIZONTAL_PER_VERTICAL: {
            schemaItemType: "InvertedUnit",
            invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
            label: "Horizontal/Vertical",
          },
          INTERNATIONAL: {
            schemaItemType: "UnitSystem",
            label: "Imperial",
            description: "Units of measure from the british imperial empire",
          },
          VERTICAL_PER_HORIZONTAL: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.INTERNATIONAL",
            definition: "Vert/Horizontal",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "TestSchema.Length",
          },
        },
      };
      await expect(Schema.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The InvertedUnit TestSchema.HORIZONTAL_PER_VERTICAL does not have the required 'unitSystem' attribute.`);
    });
    it("Resolve all dependencies for inverts unit and unit system", async () => {
      const json = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          HORIZONTAL_PER_VERTICAL: {
            schemaItemType: "InvertedUnit",
            unitSystem: "TestSchema.INTERNATIONAL",
            invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
          },
          INTERNATIONAL: {
            schemaItemType: "UnitSystem",
            label: "Imperial",
            description: "Units of measure from the british imperial empire",
          },
          VERTICAL_PER_HORIZONTAL: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.INTERNATIONAL",
            definition: "Vert/Horizontal",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "TestSchema.Length",
          },
        },
      };
      const ecSchema = await Schema.fromJson(json);
      assert.isDefined(ecSchema);
      const testItem = await ecSchema.getItem("HORIZONTAL_PER_VERTICAL");
      assert.isDefined(testItem);
      assert.isTrue(testItem instanceof InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      assert.isDefined(testInvertedUnit);

      const unitSysFromInvertedUnit = await testInvertedUnit.unitSystem;
      const invertsUnitFromInvertedUnit = await testInvertedUnit.invertsUnit;

      const testUnitSys = await ecSchema.getItem("INTERNATIONAL");
      assert.isDefined(testUnitSys);
      assert.isTrue(testUnitSys instanceof UnitSystem);
      const testUnitSysItem: UnitSystem = testUnitSys as UnitSystem;
      assert(unitSysFromInvertedUnit!.description, testUnitSysItem!.description);

      const testInvertsUnit = await ecSchema.getItem("VERTICAL_PER_HORIZONTAL");
      assert.isDefined(testInvertsUnit);
      assert.isTrue(testInvertsUnit instanceof Unit);
      const testInvertsUnitItem: Unit = testInvertsUnit as Unit;
      assert(invertsUnitFromInvertedUnit!.definition, testInvertsUnitItem!.definition);
    });
  });
  describe("Sync fromJson", () => {
    beforeEach(() => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      testUnit = new InvertedUnit(schema, "HORIZONTAL_PER_VERTICAL");
    });

    it("Basic test for label", () => {
      const json = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          HORIZONTAL_PER_VERTICAL: {
            schemaItemType: "InvertedUnit",
            unitSystem: "TestSchema.INTERNATIONAL",
            invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
            label: "Horizontal/Vertical",
          },
          INTERNATIONAL: {
            schemaItemType: "UnitSystem",
            label: "Imperial",
            description: "Units of measure from the british imperial empire",
          },
          VERTICAL_PER_HORIZONTAL: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.INTERNATIONAL",
            definition: "Vert/Horizontal",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "TestSchema.Length",
          },
        },
      };
      const ecSchema = Schema.fromJsonSync(json);
      assert.isDefined(ecSchema);
      const testItem = ecSchema.getItemSync("HORIZONTAL_PER_VERTICAL");
      assert.isDefined(testItem);
      assert.isTrue(testItem instanceof InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      assert.isDefined(testInvertedUnit);
      assert(testInvertedUnit.label, "Horizontal/Vertical");
    });
    it("Label and description are optional", () => {
      const json = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          HORIZONTAL_PER_VERTICAL: {
            schemaItemType: "InvertedUnit",
            unitSystem: "TestSchema.INTERNATIONAL",
            invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
            label: "Horizontal/Vertical",
          },
          INTERNATIONAL: {
            schemaItemType: "UnitSystem",
            label: "Imperial",
            description: "Units of measure from the british imperial empire",
          },
          VERTICAL_PER_HORIZONTAL: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.INTERNATIONAL",
            definition: "Vert/Horizontal",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "TestSchema.Length",
          },
        },
      };
      const ecSchema = Schema.fromJsonSync(json);
      assert.isDefined(ecSchema);
      const testItem = ecSchema.getItemSync("HORIZONTAL_PER_VERTICAL");
      assert.isDefined(testItem);
      assert.isTrue(testItem instanceof InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      assert.isDefined(testInvertedUnit);
      assert(testInvertedUnit.unitSystem, "TestSchema.INTERNATIONAL");
      assert(testInvertedUnit.invertsUnit, "TestSchema.VERTICAL_PER_HORIZONTAL");
    });
    it("Resolve all dependencies for inverts unit and unit system", async () => {
      const json = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
        version: "1.0.0",
        name: "TestSchema",
        items: {
          HORIZONTAL_PER_VERTICAL: {
            schemaItemType: "InvertedUnit",
            unitSystem: "TestSchema.INTERNATIONAL",
            invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
          },
          INTERNATIONAL: {
            schemaItemType: "UnitSystem",
            label: "Imperial",
            description: "Units of measure from the british imperial empire",
          },
          VERTICAL_PER_HORIZONTAL: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.INTERNATIONAL",
            definition: "Vert/Horizontal",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "TestSchema.Length",
          },
        },
      };
      const ecSchema = Schema.fromJsonSync(json);
      assert.isDefined(ecSchema);
      const testItem = ecSchema.getItemSync("HORIZONTAL_PER_VERTICAL");
      assert.isDefined(testItem);
      assert.isTrue(testItem instanceof InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      assert.isDefined(testInvertedUnit);

      const unitSysFromInvertedUnit = await testInvertedUnit.unitSystem;
      const invertsUnitFromInvertedUnit = await testInvertedUnit.invertsUnit;

      const testUnitSys = ecSchema.getItemSync("INTERNATIONAL");
      assert.isDefined(testUnitSys);
      assert.isTrue(testUnitSys instanceof UnitSystem);
      const testUnitSysItem: UnitSystem = testUnitSys as UnitSystem;
      assert(unitSysFromInvertedUnit!.description, testUnitSysItem!.description);

      const testInvertsUnit = await ecSchema.getItem("VERTICAL_PER_HORIZONTAL");
      assert.isDefined(testInvertsUnit);
      assert.isTrue(testInvertsUnit instanceof Unit);
      const testInvertsUnitItem: Unit = testInvertsUnit as Unit;
      assert(invertsUnitFromInvertedUnit!.definition, testInvertsUnitItem!.definition);
    });
  });
  describe("toJson", () => {
    beforeEach(() => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      testUnit = new InvertedUnit(schema, "HORIZONTAL_PER_VERTICAL");
    });

    const jsonOne = {
      $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/ecschema",
      version: "1.0.0",
      name: "TestSchema",
      items: {
        HORIZONTAL_PER_VERTICAL: {
          schemaItemType: "InvertedUnit",
          unitSystem: "TestSchema.INTERNATIONAL",
          invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
        },
        INTERNATIONAL: {
          schemaItemType: "UnitSystem",
          label: "Imperial",
          description: "Units of measure from the british imperial empire",
        },
        VERTICAL_PER_HORIZONTAL: {
          schemaItemType: "Unit",
          phenomenon: "TestSchema.Length",
          unitSystem: "TestSchema.INTERNATIONAL",
          definition: "Vert/Horizontal",
        },
        Length: {
          schemaItemType: "Phenomenon",
          definition: "TestSchema.Length",
        },
      },
    };
    it("async- Serialization of fully defined inverted unit", async () => {
      const ecSchema = await Schema.fromJson(jsonOne);
      assert.isDefined(ecSchema);
      const testItem = await ecSchema.getItem("HORIZONTAL_PER_VERTICAL");
      assert.isTrue(testItem instanceof InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      assert.isDefined(testInvertedUnit);
      const invertedUnitSerialization = testInvertedUnit!.toJson(true, true);
      expect(invertedUnitSerialization.unitSystem).to.eql("INTERNATIONAL");
      expect(invertedUnitSerialization.invertsUnit).to.eql("VERTICAL_PER_HORIZONTAL");
    });
    it("sync- Serialization of fully defined inverted unit", () => {
      const ecSchema = Schema.fromJsonSync(jsonOne);
      assert.isDefined(ecSchema);
      const testItem = ecSchema.getItemSync("HORIZONTAL_PER_VERTICAL");
      assert.isTrue(testItem instanceof InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      assert.isDefined(testInvertedUnit);
      const invertedUnitSerialization = testInvertedUnit!.toJson(true, true);
      expect(invertedUnitSerialization.unitSystem).to.eql("INTERNATIONAL");
      expect(invertedUnitSerialization.invertsUnit).to.eql("VERTICAL_PER_HORIZONTAL");
    });
  });
});
