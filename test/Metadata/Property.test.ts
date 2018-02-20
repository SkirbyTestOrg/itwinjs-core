/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";

import Schema from "../../source/Metadata/Schema";
import EntityClass from "../../source/Metadata/EntityClass";
import { ECObjectsError } from "../../source/Exception";
import { Property, PrimitiveProperty } from "../../source/Metadata/Property";
import { PropertyType } from "../../source/PropertyTypes";
import { PrimitiveArrayProperty, EnumerationProperty, DelayedPromiseWithProps, StructProperty, PrimitiveType, StructArrayProperty, EnumerationArrayProperty, NavigationProperty } from "../../source/index";
import Enumeration from "../../source/Metadata/Enumeration";
import { StructClass } from "../../source/Metadata/Class";
import PropertyCategory from "../../source/Metadata/PropertyCategory";
import KindOfQuantity from "../../source/Metadata/KindOfQuantity";
import RelationshipClass from "../../source/Metadata/RelationshipClass";

async function testInvalidAttribute(prop: Property, attributeName: string, expectedType: string, value: any) {
  expect(prop).to.exist;
  const json: any = {
    name: prop.name,
    [attributeName]: value,
  };
  await expect(prop.fromJson(json)).to.be.rejectedWith(ECObjectsError, `The Property ${prop.name} has an invalid '${attributeName}' attribute. It should be of type '${expectedType}'.`);
}

describe("Property", () => {
  let testClass: EntityClass;
  let testCategory: PropertyCategory;
  let testKindOfQuantity: KindOfQuantity;
  let testEnumeration: Enumeration;
  let testStruct: StructClass;
  let testRelationship: RelationshipClass;

  class MockProperty extends Property {
    constructor(name: string, type: PropertyType = PropertyType.String) {
      super(testClass, name, type);
    }
  }

  beforeEach(async () => {
    const schema = new Schema("TestSchema", 1, 0, 0);
    testClass = await schema.createEntityClass("TestClass");
    testCategory = await schema.createPropertyCategory("TestCategory");
    testKindOfQuantity = await schema.createKindOfQuantity("TestKoQ");
    testEnumeration = await schema.createEnumeration("TestEnumeration");
    testStruct = await schema.createStructClass("TestStruct");
    testRelationship = await schema.createRelationshipClass("TestRelationship");
  });

  describe("type guards", () => {
    let primitiveProperty: PrimitiveProperty;
    let enumProperty: EnumerationProperty;
    let structProperty: StructProperty;
    let navProperty: NavigationProperty;
    let primitiveArrayProperty: PrimitiveArrayProperty;
    let enumArrayProperty: EnumerationArrayProperty;
    let structArrayProperty: StructArrayProperty;

    beforeEach(() => {
      primitiveProperty = new PrimitiveProperty(testClass, "A");
      enumProperty = new EnumerationProperty(testClass, "B", new DelayedPromiseWithProps(testEnumeration.key, async () => testEnumeration));
      structProperty = new StructProperty(testClass, "C", new DelayedPromiseWithProps(testStruct.key, async () => testStruct));
      navProperty = new NavigationProperty(testClass, "D", new DelayedPromiseWithProps(testRelationship.key, async () => testRelationship));
      primitiveArrayProperty = new PrimitiveArrayProperty(testClass, "E");
      enumArrayProperty = new EnumerationArrayProperty(testClass, "F", new DelayedPromiseWithProps(testEnumeration.key, async () => testEnumeration));
      structArrayProperty = new StructArrayProperty(testClass, "G", new DelayedPromiseWithProps(testStruct.key, async () => testStruct));
    });

    it("should correctly determine when a property is an ArrayProperty", async () => {
      expect(primitiveProperty.isArray()).to.eql(false);
      expect(enumProperty.isArray()).to.eql(false);
      expect(structProperty.isArray()).to.eql(false);
      expect(navProperty.isArray()).to.eql(false);
      expect(primitiveArrayProperty.isArray()).to.eql(true);
      expect(enumArrayProperty.isArray()).to.eql(true);
      expect(structArrayProperty.isArray()).to.eql(true);
    });

    it("should correctly determine when a property is a PrimitiveProperty", async () => {
      expect(primitiveProperty.isPrimitive()).to.eql(true);
      expect(enumProperty.isPrimitive()).to.eql(true);
      expect(structProperty.isPrimitive()).to.eql(false);
      expect(navProperty.isPrimitive()).to.eql(false);
      expect(primitiveArrayProperty.isPrimitive()).to.eql(true);
      expect(enumArrayProperty.isPrimitive()).to.eql(true);
      expect(structArrayProperty.isPrimitive()).to.eql(false);
    });

    it("should correctly determine when a property is a StructProperty", async () => {
      expect(primitiveProperty.isStruct()).to.eql(false);
      expect(enumProperty.isStruct()).to.eql(false);
      expect(structProperty.isStruct()).to.eql(true);
      expect(navProperty.isStruct()).to.eql(false);
      expect(primitiveArrayProperty.isStruct()).to.eql(false);
      expect(enumArrayProperty.isStruct()).to.eql(false);
      expect(structArrayProperty.isStruct()).to.eql(true);
    });

    it("should correctly determine when a property is an EnumerationProperty", async () => {
      expect(primitiveProperty.isEnumeration()).to.eql(false);
      expect(enumProperty.isEnumeration()).to.eql(true);
      expect(structProperty.isEnumeration()).to.eql(false);
      expect(navProperty.isEnumeration()).to.eql(false);
      expect(primitiveArrayProperty.isEnumeration()).to.eql(false);
      expect(enumArrayProperty.isEnumeration()).to.eql(true);
      expect(structArrayProperty.isEnumeration()).to.eql(false);
    });

    it("should correctly determine when a property is a NavigationProperty", async () => {
      expect(primitiveProperty.isNavigation()).to.eql(false);
      expect(enumProperty.isNavigation()).to.eql(false);
      expect(structProperty.isNavigation()).to.eql(false);
      expect(navProperty.isNavigation()).to.eql(true);
      expect(primitiveArrayProperty.isNavigation()).to.eql(false);
      expect(enumArrayProperty.isNavigation()).to.eql(false);
      expect(structArrayProperty.isNavigation()).to.eql(false);
    });
  });

  describe("fromJson", () => {
    it("should successfully deserialize valid JSON", async () => {
      const propertyJson = {
        name: "BadProp",
        label: "SomeDisplayLabel",
        description: "A really long description...",
        priority: 1000,
        readOnly: false,
        category: "TestSchema.TestCategory",
        kindOfQuantity: "TestSchema.TestKoQ",        // FIXME: kindOfQuantity: "TestSchema.1.0.0.TestKoQ",
      };
      const testProp = new MockProperty("BadProp");
      expect(testProp).to.exist;
      await testProp.fromJson(propertyJson);

      expect(testProp.name).to.eql("BadProp");
      expect(testProp.label).to.eql("SomeDisplayLabel");
      expect(testProp.description).to.eql("A really long description...");
      expect(testProp.priority).to.eql(1000);
      expect(testProp.isReadOnly).to.eql(false);
      expect(await testProp.category).to.eql(testCategory);
      expect(await testProp.kindOfQuantity).to.eql(testKindOfQuantity);
    });

    it("should throw for mismatched name", async () => {
      const propertyJson = { name: "ThisDoesNotMatch"};
      const testProp = new MockProperty("BadProp");
      expect(testProp).to.exist;
      await expect(testProp.fromJson(propertyJson)).to.be.rejectedWith(ECObjectsError);
    });

    it("should throw for invalid name", async () => testInvalidAttribute(new MockProperty("BadProp"), "name", "string", 0));
    it("should throw for invalid label", async () => testInvalidAttribute(new MockProperty("BadProp"), "label", "string", 0));
    it("should throw for invalid description", async () => testInvalidAttribute(new MockProperty("BadProp"), "description", "string", 0));
    it("should throw for invalid priority", async () => testInvalidAttribute(new MockProperty("BadProp"), "priority", "number", "0"));
    it("should throw for invalid readOnly", async () => testInvalidAttribute(new MockProperty("BadProp"), "readOnly", "boolean", 0));
    it("should throw for invalid category", async () => {
      await testInvalidAttribute(new MockProperty("BadProp"), "category", "string", 0);

      // Also test for a PropertyCategory that doesn't exist
      const propertyJson = { category: "TestSchema.NonExistentPropertyCategory"};
      const testProp = new MockProperty("BadProp");
      expect(testProp).to.exist;
      await expect(testProp.fromJson(propertyJson)).to.be.rejectedWith(ECObjectsError);
    });

    it("should throw for invalid kindOfQuantity", async () => {
      await testInvalidAttribute(new MockProperty("BadProp"), "kindOfQuantity", "string", 0);

      // Also test for a KindOfQuantity that doesn't exist
      const propertyJson = { kindOfQuantity: "TestSchema.NonExistentKindOfQuantity"};
      const testProp = new MockProperty("BadProp");
      expect(testProp).to.exist;
      await expect(testProp.fromJson(propertyJson)).to.be.rejectedWith(ECObjectsError);
    });
  });
});

describe("PrimitiveProperty", () => {
  describe("fromJson", () => {
    let testProperty: PrimitiveProperty;

    beforeEach(() => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      const testClass = new EntityClass(schema, "TestClass");
      testProperty = new PrimitiveProperty(testClass, "TestProperty", PrimitiveType.Double);
    });

    it("should successfully deserialize valid JSON", async () => {
      const propertyJson = {
        typeName: "double",
        minLength: 2,
        maxLength: 4,
        minValue: 6,
        maxValue: 8,
        extendedTypeName: "SomeExtendedType",
      };
      expect(testProperty).to.exist;
      await testProperty.fromJson(propertyJson);

      expect(testProperty.minLength).to.eql(2);
      expect(testProperty.maxLength).to.eql(4);
      expect(testProperty.minValue).to.eql(6);
      expect(testProperty.maxValue).to.eql(8);
      expect(testProperty.extendedTypeName).to.eql("SomeExtendedType");
    });

    it("should throw for mismatched typeName", async () => {
      const propertyJson = { typeName: "string"};
      expect(testProperty).to.exist;
      await expect(testProperty.fromJson(propertyJson)).to.be.rejectedWith(ECObjectsError);
    });

    it("should throw for invalid typeName", async () => testInvalidAttribute(testProperty, "typeName", "string", 0));
    it("should throw for invalid minLength", async () => testInvalidAttribute(testProperty, "minLength", "number", "0"));
    it("should throw for invalid maxLength", async () => testInvalidAttribute(testProperty, "maxLength", "number", "0"));
    it("should throw for invalid minValue", async () => testInvalidAttribute(testProperty, "minValue", "number", "0"));
    it("should throw for invalid maxValue", async () => testInvalidAttribute(testProperty, "maxValue", "number", "0"));
    it("should throw for invalid extendedTypeName", async () => testInvalidAttribute(testProperty, "extendedTypeName", "string", 0));
  });
});

describe("EnumerationProperty", () => {
  describe("fromJson", () => {
    let testProperty: EnumerationProperty;
    let testEnum: Enumeration;

    beforeEach(async () => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      const testClass = await schema.createEntityClass("TestClass");
      testEnum = await schema.createEnumeration("TestEnum");
      testProperty = new EnumerationProperty(testClass, "TestProperty", new DelayedPromiseWithProps(testEnum.key, async () => testEnum));
    });

    it("should successfully deserialize valid JSON", async () => {
      const propertyJson = {
        typeName: "TestSchema.1.0.0.TestEnum",
      };
      expect(testProperty).to.exist;
      await testProperty.fromJson(propertyJson);
      expect(await testProperty.enumeration).to.eql(testEnum);

      // Should also work if typeName is not specified
      await testProperty.fromJson({});
      expect(await testProperty.enumeration).to.eql(testEnum);
    });

    it("should throw for invalid typeName", async () => testInvalidAttribute(testProperty, "typeName", "string", 0));
    it("should throw for mismatched typeName", async () => {
      const propertyJson = { typeName: "ThisDoesNotMatch"};
      expect(testProperty).to.exist;
      await expect(testProperty.fromJson(propertyJson)).to.be.rejectedWith(ECObjectsError);
    });
  });
});

describe("StructProperty", () => {
  describe("fromJson", () => {
    let testProperty: StructProperty;
    let testStruct: StructClass;

    beforeEach(async () => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      const testClass = await schema.createEntityClass("TestClass");
      testStruct = await schema.createStructClass("TestStruct");
      testProperty = new StructProperty(testClass, "TestProperty", new DelayedPromiseWithProps(testStruct.key, async () => testStruct));
    });

    it("should successfully deserialize valid JSON", async () => {
      const propertyJson = {
        typeName: "TestSchema.1.0.0.TestStruct",
      };
      expect(testProperty).to.exist;
      await testProperty.fromJson(propertyJson);
      expect(await testProperty.structClass).to.eql(testStruct);

      // Should also work if typeName is not specified
      await testProperty.fromJson({});
      expect(await testProperty.structClass).to.eql(testStruct);
    });

    it("should throw for invalid typeName", async () => testInvalidAttribute(testProperty, "typeName", "string", 0));
    it("should throw for mismatched typeName", async () => {
      const propertyJson = { typeName: "ThisDoesNotMatch"};
      expect(testProperty).to.exist;
      await expect(testProperty.fromJson(propertyJson)).to.be.rejectedWith(ECObjectsError);
    });
  });
});

describe("PrimitiveArrayProperty", () => {
  describe("fromJson", () => {
    let testProperty: PrimitiveArrayProperty;

    beforeEach(() => {
      const schema = new Schema("TestSchema", 1, 0, 0);
      const testClass = new EntityClass(schema, "TestClass");
      testProperty = new PrimitiveArrayProperty(testClass, "TestProperty");
    });

    it("should successfully deserialize valid JSON", async () => {
      const propertyJson = {
        minOccurs: 2,
        maxOccurs: 4,
      };
      expect(testProperty).to.exist;
      await testProperty.fromJson(propertyJson);

      expect(testProperty.minOccurs).to.eql(2);
      expect(testProperty.maxOccurs).to.eql(4);
    });

    it("should throw for invalid minOccurs", async () => testInvalidAttribute(testProperty, "minOccurs", "number", "0"));
    it("should throw for invalid maxOccurs", async () => testInvalidAttribute(testProperty, "maxOccurs", "number", "0"));
  });
});
