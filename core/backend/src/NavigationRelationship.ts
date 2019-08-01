/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Relationships */

// NOTE: A NavigationRelationship is not an Entity, so is not registered in the ClassRegistry.
// NOTE: It does, however, have a classFullName property for consistency with Entity subclasses.

import { Id64String } from "@bentley/bentleyjs-core";
import { RelatedElement } from "@bentley/imodeljs-common";

/** Relates a parent Element to child Elements which represent parts of the Entity modeled by the parent Element.
 * @public
 */
export class ElementOwnsChildElements extends RelatedElement {
  public static classFullName = "BisCore:ElementOwnsChildElements";
  public constructor(parentId: Id64String, relClassName: string = ElementOwnsChildElements.classFullName) {
    super({ id: parentId, relClassName });
  }
}

/** Relates a parent [[Subject]] to [[Subject]] child elements.
 * @public
 */
export class SubjectOwnsSubjects extends ElementOwnsChildElements {
  public static classFullName = "BisCore:SubjectOwnsSubjects";
  public constructor(parentId: Id64String, relClassName: string = SubjectOwnsSubjects.classFullName) {
    super(parentId, relClassName);
  }
}

/** Relates a parent [[Subject]] to [[InformationPartitionElement]] child elements.
 * @public
 */
export class SubjectOwnsPartitionElements extends ElementOwnsChildElements {
  public static classFullName = "BisCore:SubjectOwnsPartitionElements";
  public constructor(parentId: Id64String, relClassName: string = SubjectOwnsPartitionElements.classFullName) {
    super(parentId, relClassName);
  }
}

/** Relates a parent [[Category]] to [[SubCategory]] child elements.
 * @public
 */
export class CategoryOwnsSubCategories extends ElementOwnsChildElements {
  public static classFullName = "BisCore:CategoryOwnsSubCategories";
  public constructor(parentId: Id64String, relClassName: string = CategoryOwnsSubCategories.classFullName) {
    super(parentId, relClassName);
  }
}

/** Relates a parent [[RenderMaterial]] to [[RenderMaterial]] child elements.
 * @public
 */
export class RenderMaterialOwnsRenderMaterials extends ElementOwnsChildElements {
  public static classFullName = "BisCore:RenderMaterialOwnsRenderMaterials";
  public constructor(parentId: Id64String, relClassName: string = RenderMaterialOwnsRenderMaterials.classFullName) {
    super(parentId, relClassName);
  }
}

/** Relates a parent Element to child Elements which represent **hidden** parts of the Entity.
 * @public
 */
export class ElementEncapsulatesElements extends ElementOwnsChildElements {
  public static classFullName = "BisCore:ElementEncapsulatesElements";
  public constructor(parentId: Id64String, relClassName: string = ElementEncapsulatesElements.classFullName) {
    super(parentId, relClassName);
  }
}

/** Relates a parent [[PhysicalElement]] to [[PhysicalElement]] children that it assembles.
 * @public
 */
export class PhysicalElementAssemblesElements extends ElementOwnsChildElements {
  public static classFullName = "BisCore:PhysicalElementAssemblesElements";
  public constructor(parentId: Id64String, relClassName: string = PhysicalElementAssemblesElements.classFullName) {
    super(parentId, relClassName);
  }
}

/** Relates a [[GraphicalElement2d]] to its [[GraphicalType2d]]
 * @public
 */
export class GraphicalElement2dIsOfType extends RelatedElement {
  public static classFullName = "BisCore:GraphicalElement2dIsOfType";
  public constructor(id: Id64String, relClassName: string = GraphicalElement2dIsOfType.classFullName) {
    super({ id, relClassName });
  }
}

/** Relates a [[PhysicalElement]] to its [[PhysicalType]]
 * @public
 */
export class PhysicalElementIsOfType extends RelatedElement {
  public static classFullName = "BisCore:PhysicalElementIsOfType";
  public constructor(id: Id64String, relClassName: string = PhysicalElementIsOfType.classFullName) {
    super({ id, relClassName });
  }
}

/** Relates a [[SpatialLocationElement]] to its [[SpatialLocationType]]
 * @public
 */
export class SpatialLocationIsOfType extends RelatedElement {
  public static classFullName = "BisCore:SpatialLocationIsOfType";
  public constructor(id: Id64String, relClassName: string = SpatialLocationIsOfType.classFullName) {
    super({ id, relClassName });
  }
}

/** Relates an [[Element]] and an [[ElementUniqueAspect]] that it owns.
 * @public
 */
export class ElementOwnsUniqueAspect extends RelatedElement {
  public static classFullName = "BisCore:ElementOwnsUniqueAspect";
  public constructor(parentId: Id64String, relClassName: string = ElementOwnsUniqueAspect.classFullName) {
    super({ id: parentId, relClassName });
  }
}

/** Relates an [[Element]] and an [[ElementMultiAspect]] that it owns.
 * @public
 */
export class ElementOwnsMultiAspects extends RelatedElement {
  public static classFullName = "BisCore:ElementOwnsMultiAspects";
  public constructor(parentId: Id64String, relClassName: string = ElementOwnsMultiAspects.classFullName) {
    super({ id: parentId, relClassName });
  }
}
