## API Report File for "@itwin/editor-backend"

> Do not edit this file. It is a report generated by [API Extractor](https://api-extractor.com/).

```ts

import { BasicManipulationCommandIpc } from '@itwin/editor-common';
import { BlendEdgesProps } from '@itwin/editor-common';
import { BooleanOperationProps } from '@itwin/editor-common';
import { BRepEntityType } from '@itwin/editor-common';
import { ChamferEdgesProps } from '@itwin/editor-common';
import { CompressedId64Set } from '@itwin/core-bentley';
import { ConnectedSubEntityProps } from '@itwin/editor-common';
import { CutProps } from '@itwin/editor-common';
import { DeleteSubEntityProps } from '@itwin/editor-common';
import { EcefLocationProps } from '@itwin/core-common';
import { EdgeParameterRangeProps } from '@itwin/editor-common';
import { EditCommandIpc } from '@itwin/editor-common';
import { ElementGeometryBuilderParams } from '@itwin/core-common';
import { ElementGeometryBuilderParamsForPart } from '@itwin/core-common';
import { ElementGeometryCacheFilter } from '@itwin/editor-common';
import { ElementGeometryInfo } from '@itwin/core-common';
import { ElementGeometryResultOptions } from '@itwin/editor-common';
import { ElementGeometryResultProps } from '@itwin/editor-common';
import { EmbossProps } from '@itwin/editor-common';
import { EvaluatedEdgeProps } from '@itwin/editor-common';
import { EvaluatedFaceProps } from '@itwin/editor-common';
import { EvaluatedVertexProps } from '@itwin/editor-common';
import { FaceParameterRangeProps } from '@itwin/editor-common';
import { FlatBufferGeometryFilter } from '@itwin/editor-common';
import { GeometricElementProps } from '@itwin/core-common';
import { GeometryPartProps } from '@itwin/core-common';
import { HollowFacesProps } from '@itwin/editor-common';
import { Id64String } from '@itwin/core-bentley';
import { IModelDb } from '@itwin/core-backend';
import { IModelStatus } from '@itwin/core-bentley';
import { ImprintProps } from '@itwin/editor-common';
import { LocateSubEntityProps } from '@itwin/editor-common';
import { LoftProps } from '@itwin/editor-common';
import { Matrix3dProps } from '@itwin/core-geometry';
import { OffsetEdgesProps } from '@itwin/editor-common';
import { OffsetFacesProps } from '@itwin/editor-common';
import { PointInsideResultProps } from '@itwin/editor-common';
import { Range3dProps } from '@itwin/core-geometry';
import { SewSheetProps } from '@itwin/editor-common';
import { SolidModelingCommandIpc } from '@itwin/editor-common';
import { SpinFacesProps } from '@itwin/editor-common';
import { SubEntityGeometryProps } from '@itwin/editor-common';
import { SubEntityLocationProps } from '@itwin/editor-common';
import { SubEntityProps } from '@itwin/editor-common';
import { SubEntityType } from '@itwin/editor-common';
import { SweepFacesProps } from '@itwin/editor-common';
import { SweepPathProps } from '@itwin/editor-common';
import { ThickenSheetProps } from '@itwin/editor-common';
import { TransformProps } from '@itwin/core-geometry';
import { TransformSubEntityProps } from '@itwin/editor-common';
import { XYZProps } from '@itwin/core-geometry';

// @alpha (undocumented)
export class BasicManipulationCommand extends EditCommand implements BasicManipulationCommandIpc {
    constructor(iModel: IModelDb, _str: string);
    // (undocumented)
    static commandId: string;
    // (undocumented)
    deleteElements(ids: CompressedId64Set): Promise<IModelStatus>;
    // (undocumented)
    insertGeometricElement(props: GeometricElementProps, data?: ElementGeometryBuilderParams): Promise<Id64String>;
    // (undocumented)
    insertGeometryPart(props: GeometryPartProps, data?: ElementGeometryBuilderParamsForPart): Promise<Id64String>;
    // (undocumented)
    onStart(): Promise<string>;
    // (undocumented)
    requestElementGeometry(elementId: Id64String, filter?: FlatBufferGeometryFilter): Promise<ElementGeometryInfo | undefined>;
    // (undocumented)
    rotatePlacement(ids: CompressedId64Set, matrixProps: Matrix3dProps, aboutCenter: boolean): Promise<IModelStatus>;
    // (undocumented)
    protected _str: string;
    // (undocumented)
    transformPlacement(ids: CompressedId64Set, transProps: TransformProps): Promise<IModelStatus>;
    // (undocumented)
    updateEcefLocation(ecefLocation: EcefLocationProps): Promise<void>;
    // (undocumented)
    updateGeometricElement(propsOrId: GeometricElementProps | Id64String, data?: ElementGeometryBuilderParams): Promise<void>;
    // (undocumented)
    updateProjectExtents(extents: Range3dProps): Promise<void>;
}

// @alpha
export class EditCommand implements EditCommandIpc {
    constructor(iModel: IModelDb, ..._args: any[]);
    static commandId: string;
    // (undocumented)
    get ctor(): EditCommandType;
    readonly iModel: IModelDb;
    // (undocumented)
    onCleanup(): void;
    // (undocumented)
    onFinish(): void;
    // (undocumented)
    onStart(): Promise<any>;
    // (undocumented)
    ping(): Promise<{
        commandId: string;
        version: string;
        [propName: string]: any;
    }>;
    // (undocumented)
    static version: string;
}

// @alpha
export class EditCommandAdmin {
    // (undocumented)
    static get activeCommand(): EditCommand | undefined;
    // (undocumented)
    static readonly commands: Map<string, typeof EditCommand>;
    static register(commandType: EditCommandType): void;
    static registerModule(moduleObj: any): void;
    // (undocumented)
    static runCommand(cmd?: EditCommand): Promise<any> | undefined;
    static unRegister(commandId: string): void;
}

// @alpha (undocumented)
export type EditCommandType = typeof EditCommand;

// @alpha (undocumented)
export class SolidModelingCommand extends BasicManipulationCommand implements SolidModelingCommandIpc {
    // (undocumented)
    blendEdges(id: Id64String, params: BlendEdgesProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    booleanOperation(id: Id64String, params: BooleanOperationProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    chamferEdges(id: Id64String, params: ChamferEdgesProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    clearElementGeometryCache(): Promise<void>;
    // (undocumented)
    static commandId: string;
    // (undocumented)
    createElementGeometryCache(id: Id64String, filter?: ElementGeometryCacheFilter): Promise<boolean>;
    // (undocumented)
    cutSolid(id: Id64String, params: CutProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    deleteSubEntities(id: Id64String, params: DeleteSubEntityProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    embossBody(id: Id64String, params: EmbossProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    evaluateSubEntity(id: Id64String, subEntity: SubEntityProps, uParam?: number, vParam?: number): Promise<EvaluatedFaceProps | EvaluatedEdgeProps | EvaluatedVertexProps | undefined>;
    // (undocumented)
    getBodySubEntities(id: Id64String, type: SubEntityType, firstOnly?: true): Promise<SubEntityProps[] | undefined>;
    // (undocumented)
    getClosestFace(id: Id64String, point: XYZProps, direction?: XYZProps): Promise<SubEntityLocationProps | undefined>;
    // (undocumented)
    getClosestPoint(id: Id64String, subEntity: SubEntityProps, point: XYZProps): Promise<SubEntityLocationProps | undefined>;
    // (undocumented)
    getClosestSubEntity(id: Id64String, point: XYZProps): Promise<SubEntityLocationProps | undefined>;
    // (undocumented)
    getConnectedSubEntities(id: Id64String, subEntity: SubEntityProps, type: SubEntityType, options?: ConnectedSubEntityProps): Promise<SubEntityProps[] | undefined>;
    // (undocumented)
    getSubEntityGeometry(id: Id64String, subEntity: SubEntityProps, opts: Omit<ElementGeometryResultOptions, "writeChanges" | "insertProps">): Promise<SubEntityGeometryProps | undefined>;
    // (undocumented)
    getSubEntityParameterRange(id: Id64String, subEntity: SubEntityProps): Promise<FaceParameterRangeProps | EdgeParameterRangeProps | undefined>;
    // (undocumented)
    hasCurvedFaceOrEdge(id: Id64String, index: number): Promise<boolean>;
    // (undocumented)
    hasOnlyPlanarFaces(id: Id64String, index: number): Promise<boolean>;
    // (undocumented)
    hollowFaces(id: Id64String, params: HollowFacesProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    imprintBody(id: Id64String, params: ImprintProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    isDisjointBody(id: Id64String, index: number): Promise<boolean>;
    // (undocumented)
    isLaminarEdge(id: Id64String, subEntity: SubEntityProps): Promise<boolean>;
    // (undocumented)
    isLinearEdge(id: Id64String, subEntity: SubEntityProps): Promise<boolean>;
    // (undocumented)
    isPlanarBody(id: Id64String, index: number): Promise<boolean>;
    // (undocumented)
    isPlanarFace(id: Id64String, subEntity: SubEntityProps): Promise<boolean>;
    // (undocumented)
    isPointInside(id: Id64String, point: XYZProps): Promise<PointInsideResultProps[] | undefined>;
    // (undocumented)
    isRedundantEdge(id: Id64String, subEntity: SubEntityProps): Promise<boolean>;
    // (undocumented)
    isSingleFacePlanarSheet(id: Id64String, index: number): Promise<boolean>;
    // (undocumented)
    isSmoothEdge(id: Id64String, subEntity: SubEntityProps): Promise<boolean>;
    // (undocumented)
    isSmoothVertex(id: Id64String, subEntity: SubEntityProps): Promise<boolean>;
    // (undocumented)
    locateFace(id: Id64String, subEntity: SubEntityProps, point: XYZProps, direction: XYZProps): Promise<SubEntityLocationProps[] | undefined>;
    // (undocumented)
    locateSubEntities(id: Id64String, point: XYZProps, direction: XYZProps, options: LocateSubEntityProps): Promise<SubEntityLocationProps[] | undefined>;
    // (undocumented)
    loftProfiles(id: Id64String, params: LoftProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    offsetEdges(id: Id64String, params: OffsetEdgesProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    offsetFaces(id: Id64String, params: OffsetFacesProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    onStart(): Promise<string>;
    // (undocumented)
    sewSheets(id: Id64String, params: SewSheetProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    spinFaces(id: Id64String, params: SpinFacesProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    summarizeElementGeometryCache(id: Id64String): Promise<BRepEntityType[] | undefined>;
    // (undocumented)
    sweepAlongPath(id: Id64String, params: SweepPathProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    sweepFaces(id: Id64String, params: SweepFacesProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    thickenSheets(id: Id64String, params: ThickenSheetProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
    // (undocumented)
    transformSubEntities(id: Id64String, params: TransformSubEntityProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined>;
}

// (No @packageDocumentation comment for this package)

```
