/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import { join } from "path";
import * as fs from "fs";
import { ClientRequestContext, DbOpcode, DbResult, Guid, GuidString, Id64, Id64Array, Id64String, IModelStatus, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { Matrix3d, Matrix3dProps, Point3d, Range2d, Range3d, StandardViewIndex, Transform, YawPitchRollAngles } from "@bentley/geometry-core";
import {  ChangesetType, ColorByName, ColorDef, IModel, IModelError, IModelVersion, Placement3d, RenderMode, RepositoryLinkProps, SubCategoryAppearance, ViewFlagProps, ViewFlags } from "@bentley/imodeljs-common";
import {
  BackendLoggerCategory, BisCoreSchema, BriefcaseDb, CategorySelector, ConcurrencyControl, DefinitionModel, DisplayStyle2d, DisplayStyle3d, DisplayStyleCreationOptions, DocumentListModel, Drawing, DrawingCategory, DrawingViewDefinition, ECSqlStatement, ExternalSourceAspect,
  FunctionalModel,
  FunctionalSchema,
  GeometricElement3d,
  IModelDb,  IModelHost,IModelJsFs, IModelJsNative, IModelTransformer, InformationPartitionElement, LinkElement, ModelSelector, NativeLoggerCategory, PhysicalElement, PhysicalModel,
  RepositoryLink,
  SnapshotDb, SpatialCategory, SpatialViewDefinition,
} from "../../imodeljs-backend";
import { HubMock } from "../HubMock";
import { IModelTestUtils, TestUserType } from "../IModelTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { HubUtility } from "./HubUtility";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { StandardDefinitionManager } from "../../substation desing/StandardDefinitionManager";
import { lockElements } from "../../substation desing/EntityLocks";
import { EquipmentPlacementProps, EquipmentPlacementService } from "../../substation desing/EquipmentPlacementService";
import {  TestDefinitionDataCodes } from "../../substation desing/TestDataConstants";
import { SubstationSchema } from "./Schema";

const catalogDbPath = join(KnownTestLocations.assetsDir ,"substation", "Substation Test Catalog.bim");
// const  catalogDbPath = "C:\\Users\\Pratik.Thube\\source\\repos\\imodeljs\\core\\backend\\src\\substation desing\\catlog\\Substation Test Catalog.bim";
/**
 * Creates a 3d view with some defaults. To be improved if we want to expose this.
 */
async function insert3dView(context: AuthorizedClientRequestContext, iModelDb: IModelDb, modelIds: Id64Array, definitionModelId: Id64String, categoryIds: Id64Array): Promise<Id64String> {
  context.enter();

  // Default view display settings
  const viewFlagProps: ViewFlagProps = {
    renderMode: RenderMode.SmoothShade,
    grid: true,
    acs: true,
    noTransp: true,
    clipVol: false,
  };
  const displayStyleOptions: DisplayStyleCreationOptions = {
    backgroundColor: ColorDef.fromTbgr(ColorByName.lightGray),
    viewFlags: ViewFlags.fromJSON(viewFlagProps),
  };

  const viewName = "Default 3D View";
  const modelSelector: ModelSelector = ModelSelector.create(iModelDb, definitionModelId, viewName, modelIds);
  const categorySelector: CategorySelector = CategorySelector.create(iModelDb, definitionModelId, viewName, categoryIds);
  const displayStyle: DisplayStyle3d = DisplayStyle3d.create(iModelDb, definitionModelId, viewName, displayStyleOptions);

  const viewRange = new Range3d(-100, -100, -100, 100, 100, 100);

  await lockElements(context, iModelDb, DbOpcode.Insert, [modelSelector, categorySelector, displayStyle]);
  context.enter();
  const modelSelectorId: Id64String = modelSelector.insert();
  const categorySelectorId: Id64String = categorySelector.insert();
  const displayStyleId: Id64String = displayStyle.insert();

  const spatialView: SpatialViewDefinition = SpatialViewDefinition.createWithCamera(iModelDb, definitionModelId, viewName, modelSelectorId, categorySelectorId, displayStyleId, viewRange, StandardViewIndex.Iso);

  await lockElements(context, iModelDb, DbOpcode.Insert, [spatialView]);
  context.enter();
  const spatialViewId: Id64String = spatialView.insert();

  return spatialViewId;
}

/**
 * Creates a 2d view with some defaults. To be improved if we want to expose this.
 */
async function insert2dView(context: AuthorizedClientRequestContext, iModelDb: IModelDb, drawingModelId: Id64String, definitionModelId: Id64String, categoryIds: Id64Array): Promise<Id64String> {
  const viewName = "Default 2D View";
  const categorySelector: CategorySelector = CategorySelector.create(iModelDb, definitionModelId, viewName, categoryIds);
  const viewRange = new Range2d(-100, -100, 100, 100);
  const displayStyle: DisplayStyle2d = DisplayStyle2d.create(iModelDb, definitionModelId, viewName);

  await lockElements(context, iModelDb, DbOpcode.Insert, [categorySelector, displayStyle]);
  context.enter();
  const categorySelectorId: Id64String = categorySelector.insert();
  const displayStyleId: Id64String = displayStyle.insert();

  const drawingView: DrawingViewDefinition = DrawingViewDefinition.create(iModelDb, definitionModelId, viewName, drawingModelId, categorySelectorId, displayStyleId, viewRange);

  await lockElements(context, iModelDb, DbOpcode.Insert, [drawingView]);
  context.enter();
  const drawingViewId: Id64String = drawingView.insert();

  return drawingViewId;
}

async function provisionOnlineIModel(context: AuthorizedClientRequestContext, iModel: IModelDb){
  context.enter();
  if (iModel.isBriefcaseDb()) {
    iModel.concurrencyControl.startBulkMode();
    context.enter();
  }
  // Import Temp Electrical, Functional schemas.
  const electricalSchemaPath = join(KnownTestLocations.assetsDir ,"substation", "Substation.ecschema.xml");
  // const electricalSchemaPath = "\\\\?\\C:\\Users\\Pratik.Thube\\source\\repos\\imodeljs\\core\\backend\\src\\test\\Substation.ecschema.xml";
  const schemas: string[] = [BisCoreSchema.schemaFilePath, FunctionalSchema.schemaFilePath, electricalSchemaPath];
  await iModel.importSchemas(ClientRequestContext.current, schemas);

  // Changeset containing schema imports should not have any other kind of changes
  iModel.saveChanges();

  // Default partitions and models
  const spatialLocationModelId: Id64String = PhysicalModel.insert(iModel, IModel.rootSubjectId, "Substation Physical");
  const documentListModelId: Id64String = DocumentListModel.insert(iModel, IModel.rootSubjectId, "Substation Documents");
  const definitionModelId: Id64String = DefinitionModel.insert(iModel, IModel.rootSubjectId, "Substation Definitions");
  const drawingModelId: Id64String = Drawing.insert(iModel, documentListModelId, "Substation Drawings");
  FunctionalModel.insert(iModel, IModel.rootSubjectId, "Substation Functional");

  // Create a couple of default categories (later these follow the schema)
  const appearance: SubCategoryAppearance = new SubCategoryAppearance({
    color: ColorByName.black,
    fill: ColorByName.blue,
  });
  const defaultSpatialCategoryId: Id64String = SpatialCategory.insert(iModel, definitionModelId,
    "Default Category (Spatial)", appearance);
  const defaultDrawingCategoryId: Id64String = DrawingCategory.insert(iModel, definitionModelId,
    "Default Category (Drawing)", appearance);

  const defaultView3dId: Id64String = await insert3dView(context, iModel, [spatialLocationModelId], definitionModelId, [defaultSpatialCategoryId]);
  context.enter();
  await insert2dView(context, iModel, drawingModelId, definitionModelId, [defaultDrawingCategoryId]);
  context.enter();

  iModel.views.setDefaultViewId(defaultView3dId);

  const projectExtents = new Range3d(-1000, -1000, -1000, 1000, 1000, 1000);
  iModel.updateProjectExtents(projectExtents);

  // Import CodeSpecs
  const defManager = new StandardDefinitionManager(iModel);
  defManager.ensureStandardCodeSpecs();

  if (iModel.isBriefcaseDb()) {
    await iModel.concurrencyControl.endBulkMode(context);
    context.enter();
  }

  iModel.saveChanges();
}

describe.only("IModelTransformerHubSubstationSpecific (#integration)", () => {
  const outputDir = join(KnownTestLocations.outputDir, "IModelTransformerHub");
  let projectId: GuidString;
  let requestContext: AuthorizedClientRequestContext;

  before(async () => {
    HubMock.startup("IModelTransformerHub");
    IModelJsFs.recursiveMkDirSync(outputDir);

    requestContext = await IModelTestUtils.getUserContext(TestUserType.Regular);
    projectId = HubUtility.contextId!;

    // initialize logging
    if (false) {
      Logger.initializeToConsole();
      Logger.setLevelDefault(LogLevel.Error);
      Logger.setLevel(BackendLoggerCategory.IModelExporter, LogLevel.Trace);
      Logger.setLevel(BackendLoggerCategory.IModelImporter, LogLevel.Trace);
      Logger.setLevel(BackendLoggerCategory.IModelTransformer, LogLevel.Trace);
      Logger.setLevel(NativeLoggerCategory.Changeset, LogLevel.Trace);
    }
  });

  after(() => HubMock.shutdown());

  it("should merge changes made on a branch back to master", async () => {
    SubstationSchema.registerSchema();
    // create and push master IModel
    const masterIModelName = "Master";
    const masterSeedFileName = join(outputDir, `${masterIModelName}.bim`);
    if (IModelJsFs.existsSync(masterSeedFileName))
      IModelJsFs.removeSync(masterSeedFileName); // make sure file from last run does not exist

    const masterSeedDb = SnapshotDb.createEmpty(masterSeedFileName, { rootSubject: { name: "Master" } });
    // populateMaster(masterSeedDb, state0);
    assert.isTrue(IModelJsFs.existsSync(masterSeedFileName));
    masterSeedDb.nativeDb.saveProjectGuid(projectId); // WIP: attempting a workaround for "ContextId was not properly setup in the checkpoint" issue
    masterSeedDb.saveChanges();
    masterSeedDb.close();
    const masterIModelId = await IModelHost.hubAccess.createIModel({ contextId: projectId, iModelName: masterIModelName, revision0: masterSeedFileName });
    assert.isTrue(Guid.isGuid(masterIModelId));
    IModelJsFs.removeSync(masterSeedFileName); // now that iModel is pushed, can delete local copy of the seed
    const masterDb = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: projectId, iModelId: masterIModelId });
    masterDb.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
    await provisionOnlineIModel( requestContext, masterDb);
    await saveAndPushChanges(masterDb, "State0");
    assert.isTrue(masterDb.isBriefcaseDb());
    assert.equal(masterDb.contextId, projectId);
    assert.equal(masterDb.iModelId, masterIModelId);

    const placedBreaker = await placeACMEBreaker(requestContext, masterDb, "ACMEB1");
    await saveAndPushChanges(masterDb, "State0 -> State1");
    const changeSetMasterState0 = masterDb.changeSetId;
    // create Branch1 iModel using Master as a template
    const branchIModelName1 = "Branch1";
    const branchIModelId1 = await IModelHost.hubAccess.createIModel({ contextId: projectId, iModelName: branchIModelName1, description: `Branch1 of ${masterIModelName}`, revision0: masterDb.pathName });

    const branchDb1 = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: projectId, iModelId: branchIModelId1 });
    branchDb1.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
    assert.isTrue(branchDb1.isBriefcaseDb());
    assert.equal(branchDb1.contextId, projectId);
    const changeSetBranch1First = branchDb1.changeSetId;

    // create empty iModel meant to contain replayed master history
    const replayedIModelName = "Replayed";
    const replayedIModelId = await IModelHost.hubAccess.createIModel({ contextId: projectId, iModelName: replayedIModelName, description: "blank" });

    const replayedDb = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: projectId, iModelId: replayedIModelId });
    replayedDb.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
    assert.isTrue(replayedDb.isBriefcaseDb());
    assert.equal(replayedDb.contextId, projectId);

    try {
      // incert repository link of the parent
      // const repoLInkId =await  addReference(branchDb1, branchDb1.contextId, branchDb1.iModelId, branchDb1.name);
      // record provenance in Branch1 and Branch2 iModels
      const provenanceInserterB1 = new IModelTransformer(masterDb, branchDb1, {
        wasSourceIModelCopiedToTarget: true,
        // targetScopeElementId: repoLInkId,
      });
      await provenanceInserterB1.processAll();
      provenanceInserterB1.dispose();

      // push Branch1 and Branch2 provenance changes
      await saveAndPushChanges(branchDb1, "State0");
      const changeSetBranch1State0 = branchDb1.changeSetId;
      assert.notEqual(changeSetBranch1State0, changeSetBranch1First);

      // push Branch1 State1
      // await importACMEBreakerDefination(requestContext, branchDb1);
      const point3d = new Point3d(placedBreaker.placement.origin.x+1, placedBreaker.placement.origin.y, placedBreaker.placement.origin.z);
      await transformElement(branchDb1, placedBreaker.id, point3d, {} as Matrix3dProps, true);
      await placeACMEBreaker(requestContext, branchDb1, "Test");
      await saveAndPushChanges(branchDb1, "State0 -> State1");
      const changeSetBranch1State1 = branchDb1.changeSetId;
      assert.notEqual(changeSetBranch1State1, changeSetBranch1State0);

      // merge changes made on Branch1 back to Master
      const branch1ToMaster = new IModelTransformer(branchDb1, masterDb, {
        isReverseSynchronization: true, // provenance stored in source/branch
        noProvenance: true,
      });
      await branch1ToMaster.processChanges(requestContext,changeSetBranch1State0);
      branch1ToMaster.dispose();
      // assert.equal(count(masterDb, ExternalSourceAspect.classFullName), 0);
      await saveAndPushChanges(masterDb, "State0 -> State2"); // a squash of 2 branch changes into 1 in the masterDb change ledger
      const changeSetMasterState2 = masterDb.changeSetId;
      assert.notEqual(changeSetMasterState2, changeSetMasterState0);
      branchDb1.saveChanges(); // saves provenance locally in case of re-merge

      const masterDbChangeSets = await IModelHost.hubAccess.downloadChangesets({ requestContext, iModelId: masterIModelId, range: { first: 0, end: masterDb.changeset.index }, targetDir: fs.mkdtempSync("substationspecifictest_") });
      const masterDeletedElementIds = new Set<Id64String>();
      for (const masterDbChangeSet of masterDbChangeSets) {
        assert.isDefined(masterDbChangeSet.id);
        assert.isDefined(masterDbChangeSet.description); // test code above always included a change description when pushChanges was called
        const changeSetPath = masterDbChangeSet.pathname;
        assert.isTrue(IModelJsFs.existsSync(changeSetPath));
        // below is one way of determining the set of elements that were deleted in a specific changeSet
        const statusOrResult: IModelJsNative.ErrorStatusOrResult<IModelStatus, any> = masterDb.nativeDb.extractChangedInstanceIdsFromChangeSet(changeSetPath);
        assert.isUndefined(statusOrResult.error);
        const result: IModelJsNative.ChangedInstanceIdsProps = JSON.parse(statusOrResult.result);
        assert.isDefined(result.element);
        if (result.element?.delete) {
          result.element.delete.forEach((id: Id64String) => masterDeletedElementIds.add(id));
        }
      }

      // replay master history to create replayed iModel
      const sourceDb = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: projectId, iModelId: masterIModelId, asOf: IModelVersion.first().toJSON() });
      const replayTransformer = new IModelTransformer(sourceDb, replayedDb);
      // this replay strategy pretends that deleted elements never existed
      for (const elementId of masterDeletedElementIds) {
        replayTransformer.exporter.excludeElement(elementId);
      }
      replayTransformer.dispose();
      sourceDb.close();

      masterDb.close();
      branchDb1.close();
      replayedDb.close();
    } finally {
      await IModelHost.hubAccess.deleteIModel({ contextId: projectId, iModelId: masterIModelId });
      await IModelHost.hubAccess.deleteIModel({ contextId: projectId, iModelId: branchIModelId1 });
      await IModelHost.hubAccess.deleteIModel({ contextId: projectId, iModelId: replayedIModelId });
    }
  });

  function count(iModelDb: IModelDb, classFullName: string): number {
    return iModelDb.withPreparedStatement(`SELECT COUNT(*) FROM ${classFullName}`, (statement: ECSqlStatement): number => {
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getInteger() : 0;
    });
  }

  async function saveAndPushChanges(briefcaseDb: BriefcaseDb, description: string, changesType?: ChangesetType): Promise<void> {
    await briefcaseDb.concurrencyControl.request(requestContext);
    briefcaseDb.saveChanges(description);
    await briefcaseDb.pushChanges(requestContext, description, changesType);
  }

  /*
  async function  importACMEBreakerDefination(requestContext:  AuthorizedClientRequestContext, targetDB: IModelDb) {
    requestContext.enter();
    const sourceDb = SnapshotDb.openFile(catalogDbPath);
    const srcStandardDefinitionManager = new StandardDefinitionManager(sourceDb);
    const targetStandardDefinitionManager = new StandardDefinitionManager(targetDB);
    const defImporter = new DefinitionImportEngine(srcStandardDefinitionManager, targetStandardDefinitionManager);
    const breakerDefId = srcStandardDefinitionManager.tryGetEquipmentDefinitionId(DefinitionContainerName.SampleEquipmentCatalog, TestDefinitionDataCodes.ACMEBreaker);
    await defImporter.importEquipmentDefinition(requestContext, breakerDefId!);
  }*/

  function getEquipmentPlacementProps(srcIModelDbPath: string, targetIModelDb: IModelDb, equipmentDefId: string, placement: Placement3d, codeValue?: string): EquipmentPlacementProps {
    const physicalModelId = targetIModelDb.elements.queryElementIdByCode(InformationPartitionElement.createCode(targetIModelDb, IModel.rootSubjectId, "Substation Physical"))!;// IModelDb.rootSubjectId
    const functionalModelId = targetIModelDb.elements.queryElementIdByCode(InformationPartitionElement.createCode(targetIModelDb, IModel.rootSubjectId, "Substation Functional"))!;
    const drawingModelId = targetIModelDb.elements.queryElementIdByCode(InformationPartitionElement.createCode(targetIModelDb,IModel.rootSubjectId, "Substation Drawing"))!;

    const props: EquipmentPlacementProps = {
      equipmentDefinitionId: equipmentDefId,
      catalogDbPath: srcIModelDbPath,
      physicalModelId,
      functionalModelId,
      drawingModelId,
      placement,
      codeValue,
    };

    return props;
  }

  async function placeACMEBreaker(reqContext: AuthorizedClientRequestContext, iModelDb: IModelDb, codeValue?: string) {
    reqContext.enter();
    if (iModelDb.isBriefcaseDb()) {
      iModelDb.concurrencyControl.startBulkMode();
      reqContext.enter();
    }
    const srcDb = SnapshotDb.openFile(catalogDbPath);
    const definitionId = EquipmentPlacementService.getEquipmentDefinitionIdByName(TestDefinitionDataCodes.ACMEBreaker, srcDb);
    const placement = new Placement3d(Point3d.create(0, 0, 0), new YawPitchRollAngles(), new Range3d());

    const placementProps = getEquipmentPlacementProps(catalogDbPath, iModelDb, definitionId, placement, codeValue);

    const placedBreakerEquipmentId = await EquipmentPlacementService.placeEquipment(reqContext, iModelDb, placementProps);
    assert.isTrue(Id64.isValidId64(placedBreakerEquipmentId));

    if (iModelDb.isBriefcaseDb()) {
      await iModelDb.concurrencyControl.endBulkMode(reqContext);
      reqContext.enter();
    }
    const physicalElement = iModelDb.elements.getElement<PhysicalElement>(placedBreakerEquipmentId, PhysicalElement);
    assert.isTrue(Id64.isValidId64(physicalElement.id));
    // assert.equal(physicalElement.code.value, codeValue);
    return physicalElement;
  }

  async function getIModelUrl(contextId: GuidString, iModelId: GuidString) {
    const iModelHubUrl = "";

    return `${iModelHubUrl}Context/${contextId}/iModel/${iModelId}`;
  }

  async  function insertRepositoryLink(targetDb: IModelDb,codeValue: string, url: string, format: string): Promise<string> {
    if (!targetDb) return "";

    const repositoryLinkProps: RepositoryLinkProps = {
      classFullName: RepositoryLink.classFullName,
      model: IModel.repositoryModelId,
      code: LinkElement.createCode(targetDb, IModel.repositoryModelId, codeValue),
      url,
      format,
    };

    return targetDb?.elements.insertElement(repositoryLinkProps);

  }
  async function addReference(targetDb: IModelDb, sourceContextId: string, sourceIModelId: string, sourceIModelName: string) {
    if (!targetDb || !(targetDb instanceof BriefcaseDb)) return;

    const url = await getIModelUrl(sourceContextId,sourceIModelId);
    sourceIModelName = sourceIModelName || "";
    const referenceElementId = await insertRepositoryLink(targetDb,sourceIModelName, url, "bim");

    await targetDb.concurrencyControl.request(requestContext);
    requestContext.enter();
    targetDb.saveChanges();

    return referenceElementId;
  }

  async function transformElement(iModel: IModelDb ,elementId: string, point: Point3d, matrix3dProps: Matrix3dProps, isMove: boolean): Promise<any> {
    const context: AuthorizedClientRequestContext = requestContext;
    context.enter();

    try {
      const allElementIds: string[] = iModel.elements.queryChildren(elementId);
      allElementIds.unshift(elementId);

      const elementsToBeTransformed: GeometricElement3d[] = [];
      allElementIds.forEach((id) => {
        const geometricElement = iModel.elements.getElement<GeometricElement3d>(id, GeometricElement3d);
        const transform3d = isMove ? Transform.createTranslationXYZ(point.x, point.y, point.z)
          : Transform.createFixedPointAndMatrix(point, Matrix3d.fromJSON(matrix3dProps));
        geometricElement.placement.multiplyTransform(transform3d);
        elementsToBeTransformed.push(geometricElement);
      });

      // Acquire transform rights
      if (iModel instanceof BriefcaseDb) {
        await lockElements(context, iModel, DbOpcode.Update, elementsToBeTransformed);
        context.enter();
      }
      elementsToBeTransformed.forEach((item) => iModel.elements.updateElement(item));

      if (iModel.isBriefcaseDb()) {
        await iModel.concurrencyControl.request(context);
        context.enter();
      }
      iModel.saveChanges(`Transformed 3d element: `);

      return;
    } catch (e: any) {
      context.enter();
      iModel.abandonChanges();

      throw new IModelError(IModelStatus.WriteError, e);
    }
  }
});
