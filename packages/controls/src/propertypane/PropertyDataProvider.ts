/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Content */

import * as _ from "lodash";
import {
  PropertyDataProvider as IPropertyDataProvider, PropertyData,
  PropertyCategory, PropertyRecord, PropertyValueFormat, PropertyValue,
} from "@bentley/ui-components";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import {
  CategoryDescription, Descriptor, ContentFlags,
  Field, NestedContentField, DefaultContentDisplayTypes, Item,
  ECPresentationError, ECPresentationStatus,
} from "@bentley/ecpresentation-common";
import ContentDataProvider, { CacheInvalidationProps } from "../common/ContentDataProvider";
import ContentBuilder from "../common/ContentBuilder";
import { prioritySortFunction, translate } from "../common/Utils";

const favoritesCategoryName = "Favorite";
let favoritesCategoryPromise: Promise<CategoryDescription> | undefined;
const getFavoritesCategory = async (): Promise<CategoryDescription> => {
  if (!favoritesCategoryPromise) {
    favoritesCategoryPromise = Promise.all([
      translate("categories.favorite.label"),
      translate("categories.favorite.description"),
    ]).then(([label, description]): CategoryDescription => ({
      name: favoritesCategoryName,
      label,
      description,
      priority: Number.MAX_VALUE,
      expand: true,
    }));
  }
  return await favoritesCategoryPromise;
};

interface PropertyPaneCallbacks {
  isFavorite(field: Field): boolean;
  isHidden(field: Field): boolean;
  sortCategories(categories: CategoryDescription[]): void;
  sortFields(category: CategoryDescription, fields: Field[]): void;
}

interface CategorizedFields {
  categories: CategoryDescription[];
  fields: { [categoryName: string]: Field[] };
}

interface CategorizedRecords {
  categories: PropertyCategory[];
  records: { [categoryName: string]: PropertyRecord[] };
}

const isValueEmpty = (v: PropertyValue): boolean => {
  switch (v.valueFormat) {
    case PropertyValueFormat.Primitive:
      return (null === v.value || undefined === v.value || "" === v.value);
    case PropertyValueFormat.Array:
      return 0 === v.items.length;
    case PropertyValueFormat.Struct:
      return 0 === Object.keys(v.members).length;
  }
  /* istanbul ignore next */
  throw new ECPresentationError(ECPresentationStatus.InvalidArgument, "Unknown property value format");
};

class PropertyDataBuilder {
  private _descriptor: Descriptor;
  private _contentItem: Item;
  private _includeWithNoValues: boolean;
  private _callbacks: PropertyPaneCallbacks;

  constructor(descriptor: Descriptor, item: Item, includeWithNoValues: boolean, callbacks: PropertyPaneCallbacks) {
    this._descriptor = descriptor;
    this._contentItem = item;
    this._callbacks = callbacks;
    this._includeWithNoValues = includeWithNoValues;
  }

  private async createCategorizedFields(): Promise<CategorizedFields> {
    const favoritesCategory = await getFavoritesCategory();
    const categories = new Array<CategoryDescription>();
    const categoryFields: { [categoryName: string]: Field[] } = {};
    const includeField = (category: CategoryDescription, field: Field, onlyIfFavorite: boolean) => {
      if (field.isNestedContentField()) {
        includeFields(field.nestedFields, true);
      }
      if (onlyIfFavorite && favoritesCategoryName !== field.category.name)
        return;
      if (!categoryFields.hasOwnProperty(category.name)) {
        categories.push(category);
        categoryFields[category.name] = new Array<Field>();
      }
      categoryFields[category.name].push(field);
    };
    const includeFields = (fields: Field[], onlyIfFavorite: boolean) => {
      fields.forEach((field) => {
        if (favoritesCategoryName !== field.category.name && this._callbacks.isFavorite(field))
          includeField(favoritesCategory, field, false);
        includeField(field.category, field, onlyIfFavorite);
      });
    };
    includeFields(this._descriptor.fields, false);

    // sort categories
    this._callbacks.sortCategories(categories);

    // sort fields
    for (const category of categories)
      this._callbacks.sortFields(category, categoryFields[category.name]);

    return {
      categories,
      fields: categoryFields,
    } as CategorizedFields;
  }

  private createRecord(field: Field): PropertyRecord {
    let pathToRootField: Field[] | undefined;
    if (field.parent) {
      pathToRootField = [field];
      let parentField = field.parent;
      while (parentField.parent) {
        pathToRootField.push(parentField);
        parentField = parentField.parent;
      }
      field = parentField;
      pathToRootField.reverse();
    }
    return ContentBuilder.createPropertyRecord(field, this._contentItem, pathToRootField);
  }

  private createCategorizedRecords(fields: CategorizedFields): CategorizedRecords {
    const result: CategorizedRecords = {
      categories: [],
      records: {},
    };
    for (const category of fields.categories) {
      const records = new Array<PropertyRecord>();
      const addRecord = (field: Field, record: PropertyRecord) => {
        if (category.name !== favoritesCategoryName) {
          // note: favorite fields should be displayed even if they're hidden
          if (this._callbacks.isHidden(field))
            return;
          if (!this._includeWithNoValues && !record.isMerged && isValueEmpty(record.value))
            return;
        }
        records.push(record);
      };
      const handleNestedContentRecord = (field: NestedContentField, record: PropertyRecord) => {
        if (1 === fields.fields[category.name].length) {
          // note: special handling if this is the only field in the category
          if (record.value.valueFormat === PropertyValueFormat.Array && 0 === record.value.items.length) {
            // don't include empty arrays at all
            return;
          }
          if (record.value.valueFormat === PropertyValueFormat.Struct) {
            // for structs just include all their members
            for (const nestedField of field.nestedFields)
              addRecord(nestedField, record.value.members[nestedField.name]);
            return;
          }
        }
        addRecord(field, record);
      };

      // create/add records for each field
      for (const field of fields.fields[category.name]) {
        const record = this.createRecord(field);
        if (field.isNestedContentField())
          handleNestedContentRecord(field, record);
        else
          addRecord(field, record);
      }

      if (records.length === 0) {
        // don't create the category if it has no records
        continue;
      }

      result.categories.push({
        name: category.name,
        label: category.label,
        expand: category.expand,
      });
      result.records[category.name] = records;
    }
    return result;
  }

  public async buildPropertyData(): Promise<PropertyData> {
    const fields = await this.createCategorizedFields();
    const records = this.createCategorizedRecords(fields);
    return {
      ...records,
      label: this._contentItem.label,
      description: this._contentItem.classInfo ? this._contentItem.classInfo.label : undefined,
    } as PropertyData;
  }
}

export default class PropertyDataProvider extends ContentDataProvider implements IPropertyDataProvider {
  private _includeFieldsWithNoValues: boolean;

  /** Constructor. */
  constructor(connection: IModelConnection, rulesetId: string) {
    super(connection, rulesetId, DefaultContentDisplayTypes.PROPERTY_PANE);
    this._includeFieldsWithNoValues = true;
  }

  protected configureContentDescriptor(descriptor: Readonly<Descriptor>): Descriptor {
    const configured = super.configureContentDescriptor(descriptor);
    configured.contentFlags |= ContentFlags.ShowLabels;
    return configured;
  }

  protected invalidateCache(props: CacheInvalidationProps): void {
    if (this.getData)
      this.getData.cache.clear();
    super.invalidateCache(props);
  }

  protected shouldExcludeFromDescriptor(field: Field): boolean { return this.isFieldHidden(field) && !this.isFieldFavorite(field); }

  public get includeFieldsWithNoValues(): boolean { return this._includeFieldsWithNoValues; }
  public set includeFieldsWithNoValues(value: boolean) {
    if (this._includeFieldsWithNoValues === value)
      return;
    this._includeFieldsWithNoValues = value;
    this.invalidateCache({ content: true });
  }

  /** Is the specified field in the favorites list. */
  protected isFieldFavorite(_field: Field): boolean { return false; }

  protected sortCategories(categories: CategoryDescription[]): void {
    categories.sort(prioritySortFunction);
  }

  protected sortFields(_category: CategoryDescription, fields: Field[]): void {
    fields.sort(prioritySortFunction);
  }

  public getData = _.memoize(async (): Promise<PropertyData> => {
    const content = await this.getContent();
    if (!content || 0 === content.contentSet.length)
      throw new ECPresentationError(ECPresentationStatus.NoContent);

    const contentItem = content.contentSet[0];
    const callbacks: PropertyPaneCallbacks = {
      isFavorite: this.isFieldFavorite,
      isHidden: this.isFieldHidden,
      sortCategories: this.sortCategories,
      sortFields: this.sortFields,
    };
    const builder = new PropertyDataBuilder(content.descriptor, contentItem,
      this.includeFieldsWithNoValues, callbacks);
    return await builder.buildPropertyData();
  });
}
