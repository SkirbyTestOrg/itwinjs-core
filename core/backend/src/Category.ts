/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Categories */

import { Id64, Id64String, JsonUtils } from "@bentley/bentleyjs-core";
import { BisCodeSpec, Code, CodeScopeProps, CodeSpec, ElementProps, SubCategoryAppearance, Rank, SubCategoryProps, CategoryProps } from "@bentley/imodeljs-common";
import { DefinitionElement } from "./Element";
import { IModelDb } from "./IModelDb";
import { DefinitionModel } from "./Model";
import { CategoryOwnsSubCategories } from "./NavigationRelationship";

/** Defines the appearance for graphics in Geometric elements */
export class SubCategory extends DefinitionElement implements SubCategoryProps {
  /** The Appearance parameters for this SubCategory */
  public appearance: SubCategoryAppearance;
  /** Optional description of this SubCategory. */
  public description?: string;

  /** Construct a SubCategory.
   * @param props The properties of the SubCategory
   * @param iModel The IModelDb for the SubCategory
   * @hidden
   */
  public constructor(props: SubCategoryProps, iModel: IModelDb) {
    super(props, iModel);
    this.appearance = new SubCategoryAppearance(props.appearance);
    this.description = JsonUtils.asString(props.description);
  }

  /** @hidden */
  public toJSON(): SubCategoryProps {
    const val = super.toJSON();
    val.appearance = this.appearance.toJSON();
    if (this.description && this.description.length > 0)
      val.description = this.description;
    return val;
  }

  /** Get the SubCategory's name (its Code value). */
  public getSubCategoryName(): string { return this.code.getValue(); }
  /** Get the Id of the SubCategory. */
  public getSubCategoryId(): Id64String { return this.id; }
  /** Get the Id of this SubCategory's parent Category. */
  public getCategoryId(): Id64String { return this.parent ? this.parent.id : Id64.invalid; }
  /** Check if this is the default SubCategory of its parent Category. */
  public get isDefaultSubCategory(): boolean { return IModelDb.getDefaultSubCategoryId(this.getCategoryId()) === this.getSubCategoryId(); }

  /** Create a Code for a SubCategory given a name that is meant to be unique within the scope of the specified parent Category.
   * @param iModel  The IModel
   * @param parentCategoryId The Id of the parent Category that owns the SubCategory and provides the scope for its name.
   * @param codeValue The name of the SubCategory
   */
  public static createCode(iModel: IModelDb, parentCategoryId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(BisCodeSpec.subCategory);
    return new Code({ spec: codeSpec.id, scope: parentCategoryId, value: codeValue });
  }

  /** Insert a new SubCategory
   * @param iModelDb Insert into this iModel
   * @param parentCategoryId Insert the new SubCategory as a child of this Category
   * @param name The name of the SubCategory
   * @param appearance The appearance settings to use for this SubCategory
   * @returns The Id of the newly inserted SubCategory element.
   * @throws [[IModelError]] if unable to insert the element.
   */
  public static insert(iModelDb: IModelDb, parentCategoryId: Id64String, name: string, appearance: SubCategoryAppearance.Props): Id64String {
    const elements = iModelDb.elements;
    const parentCategory = elements.getElement<Category>(parentCategoryId);
    const subCategoryProps: SubCategoryProps = {
      classFullName: this.classFullName,
      model: parentCategory.model,
      parent: new CategoryOwnsSubCategories(parentCategoryId),
      code: this.createCode(iModelDb, parentCategoryId, name),
      appearance,
    };
    return elements.insertElement(subCategoryProps);
  }
}

/** A Category element is the target of the `category` member of [[GeometricElement]]. */
export class Category extends DefinitionElement implements CategoryProps {
  public rank: Rank = Rank.User;

  /** @hidden */
  public constructor(props: CategoryProps, iModel: IModelDb) {
    super(props, iModel);
    this.rank = JsonUtils.asInt(props.rank);
    this.description = JsonUtils.asString(props.description);
  }

  /** @hidden */
  public toJSON(): CategoryProps {
    const val = super.toJSON();
    val.rank = this.rank;
    if (this.description && this.description.length > 0)
      val.description = this.description;
    return val;
  }

  /** Get the Id of the default SubCategory for this Category. */
  public myDefaultSubCategoryId(): Id64String { return IModelDb.getDefaultSubCategoryId(this.id); }

  /** Set the appearance of the default SubCategory for this Category */
  public setDefaultAppearance(props: SubCategoryAppearance.Props): void {
    const subCat = this.iModel.elements.getElement<SubCategory>(this.myDefaultSubCategoryId());
    subCat.appearance = new SubCategoryAppearance(props);
    this.iModel.elements.updateElement(subCat);
  }
}

/** Categorizes 2d GeometricElements. */
export class DrawingCategory extends Category {
  /** Construct a DrawingCategory
   * @param opts  The properties of the new DrawingCategory
   * @param iModel The IModelDb where the DrawingCategory may be inserted.
   * @hidden
   */
  public constructor(opts: ElementProps, iModel: IModelDb) { super(opts, iModel); }

  /** Get the name of the CodeSpec that is used by DrawingCategory objects. */
  public static getCodeSpecName(): string { return BisCodeSpec.drawingCategory; }

  /** Looks up the CategoryId of a DrawingCategory by model and name */
  public static queryCategoryIdByName(iModel: IModelDb, scopeModelId: Id64String, categoryName: string): Id64String | undefined {
    const code: Code = DrawingCategory.createCode(iModel, scopeModelId, categoryName);
    return iModel.elements.queryElementIdByCode(code);
  }

  /** Create a Code for a DrawingCategory given a name that is meant to be unique within the scope of the specified DefinitionModel.
   * @param iModel  The IModel
   * @param scopeModelId The Id of the DefinitionModel that contains the DrawingCategory and provides the scope for its name.
   * @param codeValue The name of the category
   * @return A drawing category Code
   */
  public static createCode(iModel: IModelDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(DrawingCategory.getCodeSpecName());
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }

  /**
   * Insert a new DrawingCategory
   * @param iModelDb Insert into this iModel
   * @param definitionModelId Insert the new DrawingCategory into this DefinitionModel
   * @param name The name of the DrawingCategory
   * @param defaultAppearance The appearance settings to use for the default SubCategory of this DrawingCategory
   * @returns The Id of the newly inserted DrawingCategory element.
   * @throws [[IModelError]] if unable to insert the element.
   */
  public static insert(iModelDb: IModelDb, definitionModelId: Id64String, name: string, defaultAppearance: SubCategoryAppearance.Props): Id64String {
    const categoryProps: CategoryProps = {
      classFullName: this.classFullName,
      model: definitionModelId,
      code: this.createCode(iModelDb, definitionModelId, name),
      isPrivate: false,
    };
    const elements = iModelDb.elements;
    const categoryId = elements.insertElement(categoryProps);
    const category = elements.getElement<DrawingCategory>(categoryId);
    category.setDefaultAppearance(defaultAppearance);
    return categoryId;
  }
}

/** Categorizes SpatialElements. See [how to create a SpatialCategory]$(docs/learning/backend/CreateElements.md#SpatialCategory). */
export class SpatialCategory extends Category {
  /** Construct a SpatialCategory
   * @param opts  The properties of the new SpatialCategory
   * @param iModel The IModelDb where the SpatialCategory may be inserted.
   * @hidden
   */
  public constructor(opts: ElementProps, iModel: IModelDb) { super(opts, iModel); }

  /** Get the name of the CodeSpec that is used by SpatialCategory objects. */
  public static getCodeSpecName(): string { return BisCodeSpec.spatialCategory; }

  /** Looks up the CategoryId of a SpatialCategory by model and name */
  public static queryCategoryIdByName(iModel: IModelDb, scopeModelId: Id64String, categoryName: string): Id64String | undefined {
    const code: Code = SpatialCategory.createCode(iModel, scopeModelId, categoryName);
    return iModel.elements.queryElementIdByCode(code);
  }

  /** Create a Code for a SpatialCategory given a name that is meant to be unique within the scope of the specified DefinitionModel.
   * @param iModel  The IModel
   * @param scopeModelId The Id of the DefinitionModel that contains the SpatialCategory and provides the scope for its name.
   * @param codeValue The name of the category
   * @return A spatial category Code
   */
  public static createCode(iModel: IModelDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(SpatialCategory.getCodeSpecName());
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }

  /**
   * Create a new SpatialCategory element.
   * @param scopeModel The model in which the category element will be inserted by the caller.
   * @param categoryName The name of the category.
   * @return A new SpatialCategory element.
   */
  public static create(scopeModel: DefinitionModel, categoryName: string): SpatialCategory {
    return scopeModel.iModel.elements.createElement({
      classFullName: SpatialCategory.classFullName,
      model: scopeModel.id,
      code: SpatialCategory.createCode(scopeModel.iModel, scopeModel.id, categoryName),
    }) as SpatialCategory;
  }

  /**
   * Insert a new SpatialCategory
   * @param iModelDb Insert into this iModel
   * @param definitionModelId Insert the new SpatialCategory into this DefinitionModel
   * @param name The name of the SpatialCategory
   * @param defaultAppearance The appearance settings to use for the default SubCategory of this SpatialCategory
   * @returns The Id of the newly inserted SpatialCategory element.
   * @throws [[IModelError]] if unable to insert the element.
   */
  public static insert(iModelDb: IModelDb, definitionModelId: Id64String, name: string, defaultAppearance: SubCategoryAppearance.Props): Id64String {
    const categoryProps: CategoryProps = {
      classFullName: this.classFullName,
      model: definitionModelId,
      code: this.createCode(iModelDb, definitionModelId, name),
      isPrivate: false,
    };
    const elements = iModelDb.elements;
    const categoryId = elements.insertElement(categoryProps);
    const category = elements.getElement<SpatialCategory>(categoryId);
    category.setDefaultAppearance(defaultAppearance);
    return categoryId;
  }
}
