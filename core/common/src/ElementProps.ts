/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module WireFormats */

import { Id64, Id64Props, GuidProps } from "@bentley/bentleyjs-core";
import { CodeProps } from "./Code";
import { EntityProps } from "./EntityProps";
import { AngleProps, XYZProps, XYProps, YawPitchRollProps, LowAndHighXYZ, LowAndHighXY } from "@bentley/geometry-core";
import { IModelError, IModelStatus } from "./IModelError";
import { GeometryStreamProps } from "./geometry/GeometryStream";
import { Rank, AppearanceProps } from "./SubCategoryAppearance";

/** Properties of an ECNavigationProperty. */
export interface RelatedElementProps {
  id: Id64Props;
  relClassName?: string;
}

/** Properties of an [Element]($docs/bis/intro/element-fundamentals) */
export interface ElementProps extends EntityProps {
  model?: Id64Props | RelatedElementProps;
  code?: CodeProps;
  parent?: RelatedElementProps;
  federationGuid?: GuidProps;
  userLabel?: string;
  jsonProperties?: any;
}

/** The Id and relationship class of an Element that is somehow related to another Element */
export class RelatedElement implements RelatedElementProps {
  public readonly id: Id64;
  public readonly relClassName?: string;
  constructor(props: RelatedElementProps) { this.id = Id64.fromJSON(props.id); this.relClassName = props.relClassName; }
  public static fromJSON(json?: RelatedElementProps): RelatedElement | undefined { return json ? new RelatedElement(json) : undefined; }

  /** Accept the value of a navigation property that might be in the shortened format of just an id or might be in the full RelatedElement format. */
  public static idFromJson(json: any): Id64 {
    if ((typeof json === "object") && ("id" in json)) {
      const r = RelatedElement.fromJSON(json);
      if (r === undefined)
        throw new IModelError(IModelStatus.BadArg);
      return r.id;
    }
    return Id64.fromJSON(json);
  }
}

/** A [RelatedElement]($common) relationship that describes the [TypeDefinitionElement]($backend) of an element. */
export class TypeDefinition extends RelatedElement {
}

/** Properties of a [GeometricElement]($backend) */
export interface GeometricElementProps extends ElementProps {
  category: Id64Props;
  geom?: GeometryStreamProps;
}

/** Properties of a [[Placement3d]] */
export interface Placement3dProps {
  origin: XYZProps;
  angles: YawPitchRollProps;
  bbox?: LowAndHighXYZ;
}

/** Properties of a [[Placement2d]] */
export interface Placement2dProps {
  origin: XYProps;
  angle: AngleProps;
  bbox?: LowAndHighXY;
}

/** Properties that define a [GeometricElement3d]($backend) */
export interface GeometricElement3dProps extends GeometricElementProps {
  placement?: Placement3dProps;
  typeDefinition?: RelatedElementProps;
}

/** Properties that define a [GeometricElement2d]($backend) */
export interface GeometricElement2dProps extends GeometricElementProps {
  placement?: Placement2dProps;
  typeDefinition?: RelatedElementProps;
}

/** Properties of a [GeometryPart]($backend) */
export interface GeometryPartProps extends ElementProps {
  geom?: GeometryStreamProps;
  bbox?: LowAndHighXYZ;
}

/** Properties for a [ViewAttachment]($backend) */
export interface ViewAttachmentProps extends GeometricElement2dProps {
  view?: Id64Props;
}

/** Properties of a [Subject]($backend) */
export interface SubjectProps extends ElementProps {
  description?: string;
}

/** Properties of a [SheetBorderTemplate]($backend) */
export interface SheetBorderTemplateProps extends ElementProps {
  height?: number;
  width?: number;
}

/** Properties of a [SheetTemplate]($backend) */
export interface SheetTemplateProps extends ElementProps {
  height?: number;
  width?: number;
  border?: Id64Props;
}

/** Properties of a [Sheet]($backend) */
export interface SheetProps extends ElementProps {
  scale?: number;
  height?: number;
  width?: number;
  sheetTemplate?: Id64Props;
}

/** Properties of a [DefinitionElement]($backend) */
export interface DefinitionElementProps extends ElementProps {
  isPrivate?: boolean;
}

/** Properties of a [TypeDefinitionElement]($backend) */
export interface TypeDefinitionElementProps extends DefinitionElementProps {
  recipe?: RelatedElementProps;
}

/** Properties of a [InformationPartitionElement]($backend) */
export interface InformationPartitionElementProps extends DefinitionElementProps {
  description?: string;
}

/** Parameters to specify what element to load for [IModelDb.Elements.getElementProps]($backend). */
export interface ElementLoadProps {
  id?: Id64Props;
  code?: CodeProps;
  federationGuid?: GuidProps;
  /** Whether to include geometry stream in GeometricElementProps and GeometryPartProps, false when undefined */
  wantGeometry?: boolean;
  /** When including a geometry stream containing brep entries, whether to return the raw brep data or proxy geometry, false when undefined */
  wantBRepData?: boolean;
}

/** Properties of an [ElementAspect]($backend) */
export interface ElementAspectProps extends EntityProps {
  id: Id64Props;
  element: Id64Props;
}

/** Properties of a [LineStyle]($backend) */
export interface LineStyleProps extends ElementProps {
  description?: string;
  data: string;
}

/** Properties of a [LightLocation]($backend) */
export interface LightLocationProps extends GeometricElement3dProps {
  enabled?: boolean;
}

/** Parameters of a [Category]($backend) */
export interface CategoryProps extends ElementProps {
  rank?: Rank;
  description?: string;
}

/** Parameters of a [SubCategory]($backend) */
export interface SubCategoryProps extends ElementProps {
  appearance?: AppearanceProps;
  description?: string;
}
