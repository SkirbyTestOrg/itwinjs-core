/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import { processCustomAttributes, CustomAttributeContainerProps, CustomAttributeSet, serializeCustomAttributes } from "./CustomAttribute";
import { EntityClass } from "./EntityClass";
import { Enumeration } from "./Enumeration";
import {
  EnumerationArrayProperty, EnumerationProperty, PrimitiveArrayProperty,
  PrimitiveProperty, Property, StructArrayProperty, StructProperty,
} from "./Property";
import { Schema } from "./Schema";
import { SchemaItem } from "./SchemaItem";
import { DelayedPromiseWithProps } from "./../DelayedPromise";
import { ClassProps } from "./../Deserialization/JsonProps";
import {
  classModifierToString, CustomAttributeContainerType, ECClassModifier,
  parseClassModifier, parsePrimitiveType, PrimitiveType, SchemaItemType,
} from "./../ECObjects";
import { ECObjectsError, ECObjectsStatus } from "./../Exception";
import { AnyClass, LazyLoadedECClass, SchemaItemVisitor } from "./../Interfaces";
import { SchemaItemKey } from "./../SchemaKey";

/**
 * A common abstract class for all of the ECClass types.
 */
export abstract class ECClass extends SchemaItem implements CustomAttributeContainerProps {
  protected _modifier: ECClassModifier;
  protected _baseClass?: LazyLoadedECClass;
  protected _properties?: Property[];
  protected _customAttributes?: CustomAttributeSet;
  private _mergedPropertyCache?: Property[];

  get modifier() { return this._modifier; }

  get baseClass(): LazyLoadedECClass | undefined { return this._baseClass; }

  set baseClass(baseClass: LazyLoadedECClass | undefined) { this._baseClass = baseClass; }

  get properties(): Property[] | undefined { return this._properties; }

  get customAttributes(): CustomAttributeSet | undefined { return this._customAttributes; }

  constructor(schema: Schema, name: string, modifier?: ECClassModifier) {
    super(schema, name);

    if (modifier)
      this._modifier = modifier;
    else
      this._modifier = ECClassModifier.None;
  }

  /**
   * Convenience method for adding an already loaded ECProperty used by create*Property methods.
   * @param prop The property to add.
   * @return The property that was added.
   */
  protected addProperty<T extends Property>(prop: T): T {
    if (!this._properties)
      this._properties = [];

    this._properties.push(prop);
    return prop;
  }

  public getBaseClassSync(): ECClass | undefined {
    if (!this.baseClass) {
      return undefined;
    }

    return this.schema.lookupItemSync<ECClass>(this.baseClass);
  }

  /**
   * Searches, case-insensitive, for a local ECProperty with the name provided.
   * @param name
   */
  public async getProperty(name: string, includeInherited: boolean = false): Promise<Property | undefined> {
    if (this.properties) {
      const upperKey = name.toUpperCase();
      const foundProp = this.properties.find((prop) => prop.name.toUpperCase() === upperKey);
      if (foundProp) {
        return foundProp;
      }
    }

    if (!includeInherited) {
      return undefined;
    }

    return this.getInheritedProperty(name);
  }

  /**
   * Searches, case-insensitive, for a local ECProperty with the name provided.
   * @param name
   */
  public getPropertySync(name: string, includeInherited: boolean = false): Property | undefined {
    if (this.properties) {
      const upperKey = name.toUpperCase();
      const foundProp = this.properties.find((prop) => prop.name.toLocaleUpperCase() === upperKey);
      if (foundProp) {
        return foundProp;
      }
    }

    if (!includeInherited) {
      return undefined;
    }

    return this.getInheritedPropertySync(name);
  }

  /**
   * Searches the base class, if one exists, for the property with the name provided.
   * @param name The name of the inherited property to find.
   */
  public async getInheritedProperty(name: string): Promise<Property | undefined> {
    if (this.baseClass) {
      const baseClassObj = await this.baseClass;
      return baseClassObj.getProperty(name, true);
    }

    return undefined;
  }

  /**
   * Searches the base class, if one exists, for the property with the name provided.
   * @param name The name of the inherited property to find.
   */
  public getInheritedPropertySync(name: string): Property | undefined {
    const baseClassObj = this.getBaseClassSync();
    if (baseClassObj)
      return baseClassObj.getPropertySync(name, true);

    return undefined;
  }

  /**
   * Creates a PrimitiveECProperty.
   * @param name The name of property to create.
   * @param primitiveType The primitive type of property to create. If not provided the default is PrimitiveType.Integer
   * @throws ECObjectsStatus DuplicateProperty: thrown if a property with the same name already exists in the class.
   */
  protected async createPrimitiveProperty(name: string, primitiveType: PrimitiveType): Promise<PrimitiveProperty>;
  protected async createPrimitiveProperty(name: string, primitiveType: Enumeration): Promise<EnumerationProperty>;
  protected async createPrimitiveProperty(name: string, primitiveType?: string | PrimitiveType | Enumeration): Promise<Property> {
    if (await this.getProperty(name))
      throw new ECObjectsError(ECObjectsStatus.DuplicateProperty, `An ECProperty with the name ${name} already exists in the class ${this.name}.`);

    const propType = await this.loadPrimitiveType(primitiveType, this.schema);
    if (typeof (propType) === "number")
      return this.addProperty(new PrimitiveProperty(this, name, propType));

    return this.addProperty(new EnumerationProperty(this, name, new DelayedPromiseWithProps(propType.key, async () => propType)));
  }

  /**
   * Creates a PrimitiveECProperty.
   * @param name The name of property to create.
   * @param primitiveType The primitive type of property to create. If not provided the default is PrimitiveType.Integer
   * @throws ECObjectsStatus DuplicateProperty: thrown if a property with the same name already exists in the class.
   */
  protected createPrimitivePropertySync(name: string, primitiveType: PrimitiveType): PrimitiveProperty;
  protected createPrimitivePropertySync(name: string, primitiveType: Enumeration): EnumerationProperty;
  protected createPrimitivePropertySync(name: string, primitiveType?: string | PrimitiveType | Enumeration): Property {
    if (this.getPropertySync(name))
      throw new ECObjectsError(ECObjectsStatus.DuplicateProperty, `An ECProperty with the name ${name} already exists in the class ${this.name}.`);

    const propType = this.loadPrimitiveTypeSync(primitiveType, this.schema);
    if (typeof (propType) === "number")
      return this.addProperty(new PrimitiveProperty(this, name, propType));

    return this.addProperty(new EnumerationProperty(this, name, new DelayedPromiseWithProps(propType.key, async () => propType)));
  }

  /**
   * Creates a PrimitiveArrayECProperty.
   * @param name The name of property to create.
   * @param primitiveType The primitive type of property to create. If not provided the default is PrimitiveType.Integer
   */
  protected async createPrimitiveArrayProperty(name: string, primitiveType: PrimitiveType): Promise<PrimitiveArrayProperty>;
  protected async createPrimitiveArrayProperty(name: string, primitiveType: Enumeration): Promise<EnumerationArrayProperty>;
  protected async createPrimitiveArrayProperty(name: string, primitiveType?: string | PrimitiveType | Enumeration): Promise<Property> {
    if (await this.getProperty(name))
      throw new ECObjectsError(ECObjectsStatus.DuplicateProperty, `An ECProperty with the name ${name} already exists in the class ${this.name}.`);

    const propType = await this.loadPrimitiveType(primitiveType, this.schema);
    if (typeof (propType) === "number")
      return this.addProperty(new PrimitiveArrayProperty(this, name, propType));

    return this.addProperty(new EnumerationArrayProperty(this, name, new DelayedPromiseWithProps(propType.key, async () => propType)));
  }

  /**
   * Creates a PrimitiveArrayECProperty.
   * @param name The name of property to create.
   * @param primitiveType The primitive type of property to create. If not provided the default is PrimitiveType.Integer
   */
  protected createPrimitiveArrayPropertySync(name: string, primitiveType: PrimitiveType): PrimitiveArrayProperty;
  protected createPrimitiveArrayPropertySync(name: string, primitiveType: Enumeration): EnumerationArrayProperty;
  protected createPrimitiveArrayPropertySync(name: string, primitiveType?: string | PrimitiveType | Enumeration): Property {
    if (this.getPropertySync(name))
      throw new ECObjectsError(ECObjectsStatus.DuplicateProperty, `An ECProperty with the name ${name} already exists in the class ${this.name}.`);

    const propType = this.loadPrimitiveTypeSync(primitiveType, this.schema);
    if (typeof (propType) === "number")
      return this.addProperty(new PrimitiveArrayProperty(this, name, propType));

    return this.addProperty(new EnumerationArrayProperty(this, name, new DelayedPromiseWithProps(propType.key, async () => propType)));
  }

  /**
   *
   * @param name The name of property to create.
   * @param structType The struct type of property to create.
   */
  protected async createStructProperty(name: string, structType: string | StructClass): Promise<StructProperty> {
    if (await this.getProperty(name))
      throw new ECObjectsError(ECObjectsStatus.DuplicateProperty, `An ECProperty with the name ${name} already exists in the class ${this.name}.`);

    return this.addProperty(new StructProperty(this, name, await this.loadStructType(structType, this.schema)));
  }

  /**
   *
   * @param name The name of property to create.
   * @param structType The struct type of property to create.
   */
  protected createStructPropertySync(name: string, structType: string | StructClass): StructProperty {
    if (this.getPropertySync(name))
      throw new ECObjectsError(ECObjectsStatus.DuplicateProperty, `An ECProperty with the name ${name} already exists in the class ${this.name}.`);

    return this.addProperty(new StructProperty(this, name, this.loadStructTypeSync(structType, this.schema)));
  }

  /**
   *
   * @param name
   * @param type
   */
  protected async createStructArrayProperty(name: string, structType: string | StructClass): Promise<StructArrayProperty> {
    if (await this.getProperty(name))
      throw new ECObjectsError(ECObjectsStatus.DuplicateProperty, `An ECProperty with the name ${name} already exists in the class ${this.name}.`);

    return this.addProperty(new StructArrayProperty(this, name, await this.loadStructType(structType, this.schema)));
  }

  /**
   *
   * @param name
   * @param type
   */
  protected createStructArrayPropertySync(name: string, structType: string | StructClass): StructArrayProperty {
    if (this.getPropertySync(name))
      throw new ECObjectsError(ECObjectsStatus.DuplicateProperty, `An ECProperty with the name ${name} already exists in the class ${this.name}.`);

    return this.addProperty(new StructArrayProperty(this, name, this.loadStructTypeSync(structType, this.schema)));
  }

  protected async loadStructType(structType: string | StructClass | undefined, schema: Schema): Promise<StructClass> {
    let correctType: StructClass | undefined;
    if (typeof (structType) === "string") {
      correctType = await schema.lookupItem<StructClass>(structType);
    } else
      correctType = structType as StructClass | undefined;

    if (!correctType)
      throw new ECObjectsError(ECObjectsStatus.InvalidType, `The provided Struct type, ${structType}, is not a valid StructClass.`);

    return correctType;
  }

  protected loadStructTypeSync(structType: string | StructClass | undefined, schema: Schema): StructClass {
    let correctType: StructClass | undefined;
    if (typeof (structType) === "string") {
      correctType = schema.lookupItemSync<StructClass>(structType);
    } else
      correctType = structType as StructClass | undefined;

    if (!correctType)
      throw new ECObjectsError(ECObjectsStatus.InvalidType, `The provided Struct type, ${structType}, is not a valid StructClass.`);

    return correctType;
  }

  protected async loadPrimitiveType(primitiveType: string | PrimitiveType | Enumeration | undefined, schema: Schema): Promise<PrimitiveType | Enumeration> {
    if (primitiveType === undefined)
      return PrimitiveType.Integer;

    if (typeof (primitiveType) === "string") {
      let resolvedType: (PrimitiveType | Enumeration | undefined) = parsePrimitiveType(primitiveType);
      if (!resolvedType) {
        resolvedType = await schema.lookupItem<Enumeration>(primitiveType);
      }

      if (resolvedType === undefined)
        throw new ECObjectsError(ECObjectsStatus.InvalidType, `The provided primitive type, ${primitiveType}, is not a valid PrimitiveType or Enumeration.`);

      // If resolvedType is a SchemaItem, make sure it is an Enumeration- if not, throw an error
      if (typeof (resolvedType) !== "number" && resolvedType.schemaItemType !== SchemaItemType.Enumeration)
        throw new ECObjectsError(ECObjectsStatus.InvalidType, `The provided primitive type, ${primitiveType}, is not a valid PrimitiveType or Enumeration.`);

      return resolvedType;
    }

    return primitiveType;
  }

  protected loadPrimitiveTypeSync(primitiveType: string | PrimitiveType | Enumeration | undefined, schema: Schema): PrimitiveType | Enumeration {
    if (primitiveType === undefined)
      return PrimitiveType.Integer;

    if (typeof (primitiveType) === "string") {
      let resolvedType: (PrimitiveType | Enumeration | undefined) = parsePrimitiveType(primitiveType);
      if (!resolvedType) {
        resolvedType = schema.lookupItemSync<Enumeration>(primitiveType);
      }

      if (resolvedType === undefined)
        throw new ECObjectsError(ECObjectsStatus.InvalidType, `The provided primitive type, ${primitiveType}, is not a valid PrimitiveType or Enumeration.`);

      return resolvedType;
    }

    return primitiveType;
  }

  public toJson(standalone: boolean, includeSchemaVersion: boolean) {
    const schemaJson = super.toJson(standalone, includeSchemaVersion);
    schemaJson.modifier = classModifierToString(this.modifier);
    if (this.baseClass !== undefined)
      schemaJson.baseClass = this.baseClass.fullName;
    if (this.properties !== undefined && this.properties.length > 0) {
      schemaJson.properties = [];
      this.properties.forEach((prop: Property) => {
        schemaJson.properties.push(prop.toJson());
      });
    }
    const customAttributes = serializeCustomAttributes(this.customAttributes);
    if (customAttributes !== undefined)
      schemaJson.customAttributes = customAttributes;
    return schemaJson;
  }

  public deserializeSync(classProps: ClassProps) {
    super.deserializeSync(classProps);

    if (undefined !== classProps.modifier) {
      const modifier = parseClassModifier(classProps.modifier);
      if (undefined === modifier)
        throw new ECObjectsError(ECObjectsStatus.InvalidModifier, `The string '${classProps.modifier}' is not a valid ECClassModifier.`);
      this._modifier = modifier;
    }

    if (undefined !== classProps.baseClass) {
      const ecClassSchemaItemKey = this.schema.getSchemaItemKey(classProps.baseClass);
      if (!ecClassSchemaItemKey)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate the baseClass ${classProps.baseClass}.`);
      this._baseClass = new DelayedPromiseWithProps<SchemaItemKey, ECClass>(ecClassSchemaItemKey,
        async () => {
          const baseClass = await this.schema.lookupItem<ECClass>(ecClassSchemaItemKey);
          if (undefined === baseClass)
            throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate the baseClass ${classProps.baseClass}.`);
          return baseClass;
        });
    }
    this._customAttributes = processCustomAttributes(classProps.customAttributes, this.name, CustomAttributeContainerType.AnyClass);
  }
  public async deserialize(classProps: ClassProps): Promise<void> {
    this.deserializeSync(classProps);
  }

  public async accept(visitor: SchemaItemVisitor) {
    if (visitor.visitClass)
      await visitor.visitClass(this as AnyClass);
  }

  /**
   * Iterates (recursively) over all base classes and mixins, in "property override" order.
   * This is essentially a depth-first traversal through the inheritance tree.
   */
  public async *getAllBaseClasses(): AsyncIterableIterator<ECClass> {
    const baseClasses: ECClass[] = [this];
    const addBaseClasses = async (ecClass: AnyClass) => {
      if (SchemaItemType.EntityClass === ecClass.schemaItemType) {
        for (let i = (ecClass as EntityClass).mixins.length - 1; i >= 0; i--) {
          baseClasses.push(await (ecClass as EntityClass).mixins[i]);
        }
      }

      if (ecClass.baseClass)
        baseClasses.push(await ecClass.baseClass);
    };

    while (baseClasses.length > 0) {
      const baseClass = baseClasses.pop() as AnyClass;
      await addBaseClasses(baseClass);
      if (baseClass !== this)
        yield baseClass as ECClass;
    }
  }

  public *getAllBaseClassesSync(): Iterable<AnyClass> {
    const baseClasses: ECClass[] = [this];
    const addBaseClasses = (ecClass: AnyClass) => {
      if (SchemaItemType.EntityClass === ecClass.schemaItemType) {
        for (const m of Array.from(ecClass.getMixinsSync()).reverse()) {
          baseClasses.push(m);
        }
      }

      const baseClass = ecClass.getBaseClassSync();
      if (baseClass)
        baseClasses.push(baseClass);
    };

    while (baseClasses.length > 0) {
      const baseClass = baseClasses.pop() as AnyClass;
      addBaseClasses(baseClass);
      if (baseClass !== this)
        yield baseClass;
    }
  }

  protected static mergeProperties(target: Property[], existingValues: Map<string, number>, propertiesToMerge: Property[], overwriteExisting: boolean) {
    for (const property of propertiesToMerge) {
      const upperCaseName = property.name.toUpperCase();
      const existing = existingValues.get(upperCaseName);
      if (existing !== undefined) {
        if (overwriteExisting) {
          target[existing] = property;
        }
      } else {
        existingValues.set(upperCaseName, target.length);
        target.push(property);
      }
    }
  }

  protected async buildPropertyCache(result: Property[], existingValues?: Map<string, number>, resetBaseCaches: boolean = false): Promise<void> {
    if (!existingValues) {
      existingValues = new Map<string, number>();
    }

    if (this.baseClass) {
      ECClass.mergeProperties(result, existingValues, await (await this.baseClass).getProperties(resetBaseCaches), false);
    }

    if (!this.properties)
      return;

    ECClass.mergeProperties(result, existingValues, this.properties, true);
  }

  protected buildPropertyCacheSync(result: Property[], existingValues?: Map<string, number>, resetBaseCaches: boolean = false): void {
    if (!existingValues) {
      existingValues = new Map<string, number>();
    }

    const baseClass = this.getBaseClassSync();
    if (baseClass) {
      ECClass.mergeProperties(result, existingValues, baseClass.getPropertiesSync(resetBaseCaches), false);
    }

    if (!this.properties)
      return;

    ECClass.mergeProperties(result, existingValues, this.properties, true);
  }

  /**
   * Iterates all properties, including the ones merged from base classes and mixins. To obtain only local properties, use the 'properties' field.
   * Since this is an expensive operation, results will be cached after first call.
   * @param resetCache if true, any previously cached results will be dropped and cache will be rebuilt
   */
  public getPropertiesSync(resetCache: boolean = false): Property[] {
    if (!this._mergedPropertyCache || resetCache) {
      this._mergedPropertyCache = [];
      this.buildPropertyCacheSync(this._mergedPropertyCache, undefined, resetCache);
    }

    return this._mergedPropertyCache;
  }

  /**
   * Iterates all properties, including the ones merged from base classes and mixins. To obtain only local properties, use the 'properties' field.
   * Since this is an expensive operation, results will be cached after first call.
   * @param resetCache if true, any previously cached results will be dropped and cache will be rebuilt
   */
  public async getProperties(resetCache: boolean = false): Promise<Property[]> {
    if (!this._mergedPropertyCache || resetCache) {
      this._mergedPropertyCache = [];
      await this.buildPropertyCache(this._mergedPropertyCache, undefined, resetCache);
    }

    return this._mergedPropertyCache;
  }

  /**
   * Asynchronously traverses through the inheritance tree, using depth-first traversal, calling the given callback
   * function for each base class encountered.
   * @param callback The function to call for each base class in the hierarchy.
   * @param arg An argument that will be passed as the second parameter to the callback function.
   */
  public async traverseBaseClasses(callback: (ecClass: ECClass, arg?: any) => boolean, arg?: any): Promise<boolean> {
    const baseClasses = await this.getAllBaseClasses();
    if (!baseClasses)
      return false;

    for await (const baseClass of baseClasses) {
      if (callback(baseClass, arg))
        return true;
    }

    return false;
  }

  /**
   * Synchronously traverses through the inheritance tree, using depth-first traversal, calling the given callback
   * function for each base class encountered.
   * @param callback The function to call for each base class in the hierarchy.
   * @param arg An argument that will be passed as the second parameter to the callback function.
   */
  public traverseBaseClassesSync(callback: (ecClass: ECClass, arg?: any) => boolean, arg?: any): boolean {
    const baseClasses = this.getAllBaseClassesSync();
    if (!baseClasses)
      return false;

    for (const baseClass of baseClasses) {
      if (callback(baseClass, arg))
        return true;
    }

    return false;
  }

  /**
   * Indicates if the targetClass is of this type.
   * @param targetClass The class to check.
   */
  public async is(targetClass: ECClass): Promise<boolean> {
    if (SchemaItem.equalByKey(this, targetClass))
      return true;

    return this.traverseBaseClasses(SchemaItem.equalByKey, targetClass);
  }

  /**
   * A synchronous version of the [[ECClass.is]], indicating if the targetClass is of this type.
   * @param targetClass The class to check.
   */
  public isSync(targetClass: ECClass): boolean {
    if (SchemaItem.equalByKey(this, targetClass))
      return true;

    return this.traverseBaseClassesSync(SchemaItem.equalByKey, targetClass);
  }
}

/**
 * A Typescript class representation of an ECStructClass.
 */
export class StructClass extends ECClass {
  public readonly schemaItemType!: SchemaItemType.StructClass; // tslint:disable-line

  constructor(schema: Schema, name: string, modifier?: ECClassModifier) {
    super(schema, name, modifier);
    this.schemaItemType = SchemaItemType.StructClass;
  }
}

/** @hidden
 * Hackish approach that works like a "friend class" so we can access protected members without making them public.
 */
export abstract class MutableClass extends ECClass {
  public abstract async createPrimitiveProperty(name: string, primitiveType: PrimitiveType): Promise<PrimitiveProperty>;
  public abstract async createPrimitiveProperty(name: string, primitiveType: Enumeration): Promise<EnumerationProperty>;
  public abstract async createPrimitiveProperty(name: string, primitiveType?: string | PrimitiveType | Enumeration): Promise<Property>;

  public abstract createPrimitivePropertySync(name: string, primitiveType: PrimitiveType): PrimitiveProperty;
  public abstract createPrimitivePropertySync(name: string, primitiveType: Enumeration): EnumerationProperty;
  public abstract createPrimitivePropertySync(name: string, primitiveType?: string | PrimitiveType | Enumeration): Property;

  public abstract async createPrimitiveArrayProperty(name: string, primitiveType: PrimitiveType): Promise<PrimitiveArrayProperty>;
  public abstract async createPrimitiveArrayProperty(name: string, primitiveType: Enumeration): Promise<EnumerationArrayProperty>;
  public abstract async createPrimitiveArrayProperty(name: string, primitiveType?: string | PrimitiveType | Enumeration): Promise<Property>;

  public abstract createPrimitiveArrayPropertySync(name: string, primitiveType: PrimitiveType): PrimitiveArrayProperty;
  public abstract createPrimitiveArrayPropertySync(name: string, primitiveType: Enumeration): EnumerationArrayProperty;
  public abstract createPrimitiveArrayPropertySync(name: string, primitiveType?: string | PrimitiveType | Enumeration): Property;

  public abstract async createStructProperty(name: string, structType: string | StructClass): Promise<StructProperty>;
  public abstract createStructPropertySync(name: string, structType: string | StructClass): StructProperty;

  public abstract async createStructArrayProperty(name: string, structType: string | StructClass): Promise<StructArrayProperty>;
  public abstract createStructArrayPropertySync(name: string, structType: string | StructClass): StructArrayProperty;
}
