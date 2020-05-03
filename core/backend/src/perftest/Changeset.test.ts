/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import * as path from "path";
import { Id64String, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { ChangeSet, ChangesType, HubIModel, IModelHubClient, IModelHubError, IModelQuery } from "@bentley/imodelhub-client";
import { IModel, IModelVersion, SubCategoryAppearance, SyncMode } from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { TestUsers, TestUtility } from "@bentley/oidc-signin-tool";
import { Reporter } from "@bentley/perf-tools/lib/Reporter";
import { BriefcaseManager, ConcurrencyControl, DictionaryModel, Element, IModelDb, IModelJsFs, SpatialCategory } from "../imodeljs-backend";
import { IModelTestUtils, TestIModelInfo } from "../test/IModelTestUtils";
import { HubUtility } from "../test/integration/HubUtility";
import { KnownTestLocations } from "../test/KnownTestLocations";
import { RevisionUtility } from "../test/RevisionUtility";

async function getIModelAfterApplyingCS(requestContext: AuthorizedClientRequestContext, reporter: Reporter, projectId: string, imodelId: string, client: IModelHubClient) {
  const changeSets: ChangeSet[] = await client.changeSets.get(requestContext, imodelId);
  const firstChangeSetId = changeSets[0].wsgId;
  const secondChangeSetId = changeSets[1].wsgId;

  // open imodel first time from imodel-hub with first revision
  const startTime = new Date().getTime();
  const iModelDb = await IModelTestUtils.downloadAndOpenBriefcaseDb(requestContext, projectId, imodelId, SyncMode.FixedVersion, IModelVersion.asOfChangeSet(firstChangeSetId));
  const endTime = new Date().getTime();
  assert.exists(iModelDb);
  const elapsedTime = (endTime - startTime) / 1000.0;
  assert.strictEqual<string>(iModelDb.briefcase.currentChangeSetId, firstChangeSetId);
  iModelDb.close();
  reporter.addEntry("ImodelChangesetPerformance", "GetImodel", "Execution time(s)", elapsedTime, { Description: "from hub first CS", Operation: "Open" });

  // open imodel from local cache with second revision
  const startTime1 = new Date().getTime();
  const iModelDb1 = await IModelTestUtils.downloadAndOpenBriefcaseDb(requestContext, projectId, imodelId, SyncMode.FixedVersion, IModelVersion.asOfChangeSet(secondChangeSetId));
  const endTime1 = new Date().getTime();
  assert.exists(iModelDb1);
  const elapsedTime1 = (endTime1 - startTime1) / 1000.0;
  assert.strictEqual<string>(iModelDb1.briefcase.currentChangeSetId, secondChangeSetId);
  iModelDb1.close();
  reporter.addEntry("ImodelChangesetPerformance", "GetImodel", "Execution time(s)", elapsedTime1, { Description: "from cache second CS", Operation: "Open" });

  // open imodel from local cache with first revision
  const startTime2 = new Date().getTime();
  const iModelDb2 = await IModelTestUtils.downloadAndOpenBriefcaseDb(requestContext, projectId, imodelId, SyncMode.FixedVersion, IModelVersion.first());
  const endTime2 = new Date().getTime();
  assert.exists(iModelDb2);
  const elapsedTime2 = (endTime2 - startTime2) / 1000.0;
  iModelDb2.close();
  reporter.addEntry("ImodelChangesetPerformance", "GetImodel", "Execution time(s)", elapsedTime2, { Description: "from cache first CS", Operation: "Open" });

  // open imodel from local cache with latest revision
  const startTime3 = new Date().getTime();
  const iModelDb3 = await IModelTestUtils.downloadAndOpenBriefcaseDb(requestContext, projectId, imodelId, SyncMode.FixedVersion, IModelVersion.named("latest"));
  const endTime3 = new Date().getTime();
  assert.exists(iModelDb3);
  const elapsedTime3 = (endTime3 - startTime3) / 1000.0;
  iModelDb3.close();
  reporter.addEntry("ImodelChangesetPerformance", "GetImodel", "Execution time(s)", elapsedTime3, { Description: "from cache latest CS", Operation: "Open" });
}

async function pushIModelAfterMetaChanges(requestContext: AuthorizedClientRequestContext, reporter: Reporter, projectId: string, imodelPushId: string) {
  const iModelPullAndPush = await IModelTestUtils.downloadAndOpenBriefcaseDb(requestContext, projectId, imodelPushId, SyncMode.PullAndPush, IModelVersion.latest());
  assert.exists(iModelPullAndPush);
  iModelPullAndPush.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());

  // get the time of applying a meta data change on an imodel
  const startTime = new Date().getTime();
  const rootEl: Element = iModelPullAndPush.elements.getRootSubject();
  rootEl.userLabel = rootEl.userLabel + "changed";
  iModelPullAndPush.elements.updateElement(rootEl);
  await iModelPullAndPush.concurrencyControl.request(requestContext);
  iModelPullAndPush.saveChanges("user changes root subject of the imodel");
  const endTime = new Date().getTime();
  const elapsedTime = (endTime - startTime) / 1000.0;
  reporter.addEntry("ImodelChangesetPerformance", "PushMetaChangeToHub", "Execution time(s)", elapsedTime, { Description: "make meta changes", Operation: "Update" });

  try {
    // get the time to push a meta data change of an imodel to imodel hub
    const startTime1 = new Date().getTime();
    await iModelPullAndPush.pushChanges(requestContext, "test change");
    const endTime1 = new Date().getTime();
    const elapsedTime1 = (endTime1 - startTime1) / 1000.0;
    reporter.addEntry("ImodelChangesetPerformance", "PushMetaChangeToHub", "Execution time(s)", elapsedTime1, { Description: "meta changes to hub", Operation: "Push" });
  } catch (error) { }

  await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModelPullAndPush);
}

async function createNewModelAndCategory(requestContext: AuthorizedClientRequestContext, rwIModel: IModelDb) {
  // Create a new physical model.
  const [, modelId] = IModelTestUtils.createAndInsertPhysicalPartitionAndModel(rwIModel, IModelTestUtils.getUniqueModelCode(rwIModel, "newPhysicalModel"), true);

  // Find or create a SpatialCategory.
  const dictionary: DictionaryModel = rwIModel.models.getModel(IModel.dictionaryId) as DictionaryModel;
  const newCategoryCode = IModelTestUtils.getUniqueSpatialCategoryCode(dictionary, "ThisTestSpatialCategory");
  const spatialCategoryId: Id64String = SpatialCategory.insert(rwIModel, IModel.dictionaryId, newCategoryCode.value!, new SubCategoryAppearance({ color: 0xff0000 }));

  // Reserve all of the codes that are required by the new model and category.
  try {
    if (rwIModel.isBriefcaseDb()) {
      await rwIModel.concurrencyControl.request(requestContext);
      requestContext.enter();
    }
  } catch (err) {
    if (err instanceof IModelHubError) {
      assert.fail(JSON.stringify(err));
    }
  }

  return { modelId, spatialCategoryId };
}

async function pushIModelAfterDataChanges(requestContext: AuthorizedClientRequestContext, reporter: Reporter, projectId: string) {
  const iModelName = "CodesPushTest";
  // delete any existing imodel with given name
  const iModels: HubIModel[] = await BriefcaseManager.imodelClient.iModels.get(requestContext, projectId, new IModelQuery().byName(iModelName));
  for (const iModelTemp of iModels) {
    await BriefcaseManager.imodelClient.iModels.delete(requestContext, projectId, iModelTemp.id!);
  }
  // create new imodel with given name
  const rwIModelId = await BriefcaseManager.create(requestContext, projectId, iModelName, { rootSubject: { name: "TestSubject" } });
  assert.isNotEmpty(rwIModelId);
  const rwIModel = await IModelTestUtils.downloadAndOpenBriefcaseDb(requestContext, projectId, rwIModelId, SyncMode.PullAndPush);

  // create new model, category and physical element, and insert in imodel
  rwIModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
  const r: { modelId: Id64String, spatialCategoryId: Id64String } = await createNewModelAndCategory(requestContext, rwIModel);
  rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, r.modelId, r.spatialCategoryId));
  rwIModel.saveChanges("User created model, category and one physical element");

  // get the time to push a data change of an imodel to imodel hub
  const startTime1 = new Date().getTime();
  await rwIModel.pushChanges(requestContext, "test change").catch();
  const endTime1 = new Date().getTime();
  const elapsedTime1 = (endTime1 - startTime1) / 1000.0;
  reporter.addEntry("ImodelChangesetPerformance", "PushDataChangeToHub", "Execution time(s)", elapsedTime1, { Description: "data changes to hub", Operation: "Push" });
  await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, rwIModel);
}

async function pushIModelAfterSchemaChanges(requestContext: AuthorizedClientRequestContext, reporter: Reporter, projectId: string) {
  const iModelName = "SchemaPushTest";
  // delete any existing imodel with given name
  const iModels: HubIModel[] = await BriefcaseManager.imodelClient.iModels.get(requestContext, projectId, new IModelQuery().byName(iModelName));
  for (const iModelTemp of iModels) {
    await BriefcaseManager.imodelClient.iModels.delete(requestContext, projectId, iModelTemp.id!);
  }
  // create new imodel with given name
  const rwIModelId = await BriefcaseManager.create(requestContext, projectId, iModelName, { rootSubject: { name: "TestSubject" } });
  assert.isNotEmpty(rwIModelId);
  const rwIModel = await IModelTestUtils.downloadAndOpenBriefcaseDb(requestContext, projectId, rwIModelId, SyncMode.PullAndPush);

  assert.isNotEmpty(rwIModelId);
  // import schema and push change to hub
  const schemaPathname = path.join(KnownTestLocations.assetsDir, "PerfTestDomain.ecschema.xml");
  rwIModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
  await rwIModel.importSchemas(requestContext, [schemaPathname]).catch();
  assert.isDefined(rwIModel.getMetaData("PerfTestDomain:" + "PerfElement"), "PerfElement" + "is present in iModel.");
  await rwIModel.concurrencyControl.request(requestContext);
  rwIModel.saveChanges("schema change pushed");
  await rwIModel.pullAndMergeChanges(requestContext);
  const startTime1 = new Date().getTime();
  await rwIModel.pushChanges(requestContext, "test change");
  const endTime1 = new Date().getTime();
  const elapsedTime1 = (endTime1 - startTime1) / 1000.0;
  reporter.addEntry("ImodelChangesetPerformance", "PushSchemaChangeToHub", "Execution time(s)", elapsedTime1, { Description: "schema changes to hub", Operation: "Push" });
  await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, rwIModel);
}

const getElementCount = (iModel: IModelDb): number => {
  const rows: any[] = IModelTestUtils.executeQuery(iModel, "SELECT COUNT(*) AS cnt FROM bis.Element");
  const count = + rows[0].cnt;
  return count;
};

async function executeQueryTime(requestContext: AuthorizedClientRequestContext, reporter: Reporter, projectId: string, imodelId: string) {
  const iModelDb = await IModelTestUtils.downloadAndOpenBriefcaseDb(requestContext, projectId, imodelId, SyncMode.FixedVersion, IModelVersion.named("latest"));
  assert.exists(iModelDb);
  const startTime = new Date().getTime();
  const stat = IModelTestUtils.executeQuery(iModelDb, "SELECT * FROM BisCore.LineStyle");
  const endTime = new Date().getTime();
  const elapsedTime1 = (endTime - startTime) / 1000.0;
  assert.equal(7, stat.length);
  reporter.addEntry("ImodelChangesetPerformance", "ExecuteQuery", "Execution time(s)", elapsedTime1, { Description: "execute a simple ECSQL query", Operation: "ExecuteQuery" });
  iModelDb.close();
}

async function reverseChanges(requestContext: AuthorizedClientRequestContext, reporter: Reporter, projectId: string) {
  const iModelName = "reverseChangeTest";
  // delete any existing imodel with given name
  const iModels: HubIModel[] = await BriefcaseManager.imodelClient.iModels.get(requestContext, projectId, new IModelQuery().byName(iModelName));
  for (const iModelTemp of iModels)
    await BriefcaseManager.imodelClient.iModels.delete(requestContext, projectId, iModelTemp.id!);

  // create new imodel with given name
  const rwIModelId = await BriefcaseManager.create(requestContext, projectId, iModelName, { rootSubject: { name: "TestSubject" } });
  assert.isNotEmpty(rwIModelId);
  const rwIModel = await IModelTestUtils.downloadAndOpenBriefcaseDb(requestContext, projectId, rwIModelId, SyncMode.PullAndPush);

  // create new model, category and physical element, and insert in imodel, and push these changes
  rwIModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
  const r: { modelId: Id64String, spatialCategoryId: Id64String } = await createNewModelAndCategory(requestContext, rwIModel);
  rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, r.modelId, r.spatialCategoryId));
  rwIModel.saveChanges("User created model, category and one physical element");
  await rwIModel.pushChanges(requestContext, "test change").catch();
  const firstCount = getElementCount(rwIModel);
  assert.equal(firstCount, 7);

  let i = 0;
  while (i < 4) {
    rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, r.modelId, r.spatialCategoryId));
    i = i + 1;
  }
  rwIModel.saveChanges("added more elements to imodel");
  await rwIModel.pushChanges(requestContext, "test change").catch();
  const secondCount = getElementCount(rwIModel);
  assert.equal(secondCount, 11);

  const imodelInfo: TestIModelInfo = await IModelTestUtils.getTestModelInfo(requestContext, projectId, "reverseChangeTest");
  const firstChangeSetId = imodelInfo.changeSets[0].wsgId;
  const startTime = new Date().getTime();
  await rwIModel.reverseChanges(requestContext, IModelVersion.asOfChangeSet(firstChangeSetId));
  const endTime = new Date().getTime();
  const elapsedTime1 = (endTime - startTime) / 1000.0;

  const reverseCount = getElementCount(rwIModel);
  assert.equal(reverseCount, firstCount);

  reporter.addEntry("ImodelChangesetPerformance", "ReverseChanges", "Execution time(s)", elapsedTime1, { Description: "reverse the imodel to first CS from latest", Operation: "ReverseChanges" });
  rwIModel.close();
}

async function reinstateChanges(requestContext: AuthorizedClientRequestContext, reporter: Reporter, projectId: string) {
  const iModelName = "reinstateChangeTest";
  // delete any existing imodel with given name
  const iModels: HubIModel[] = await BriefcaseManager.imodelClient.iModels.get(requestContext, projectId, new IModelQuery().byName(iModelName));
  for (const iModelTemp of iModels)
    await BriefcaseManager.imodelClient.iModels.delete(requestContext, projectId, iModelTemp.id!);

  // create new imodel with given name
  const rwIModelId = await BriefcaseManager.create(requestContext, projectId, iModelName, { rootSubject: { name: "TestSubject" } });
  assert.isNotEmpty(rwIModelId);
  const rwIModel = await IModelTestUtils.downloadAndOpenBriefcaseDb(requestContext, projectId, rwIModelId, SyncMode.PullAndPush);

  // create new model, category and physical element, and insert in imodel, and push these changes
  rwIModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
  const r: { modelId: Id64String, spatialCategoryId: Id64String } = await createNewModelAndCategory(requestContext, rwIModel);
  rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, r.modelId, r.spatialCategoryId));
  rwIModel.saveChanges("User created model, category and one physical element");
  await rwIModel.pushChanges(requestContext, "test change").catch();
  const firstCount = getElementCount(rwIModel);
  assert.equal(firstCount, 7);

  let i = 0;
  while (i < 4) {
    rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, r.modelId, r.spatialCategoryId));
    i = i + 1;
  }
  rwIModel.saveChanges("added more elements to imodel");
  await rwIModel.pushChanges(requestContext, "test change").catch();
  const secondCount = getElementCount(rwIModel);
  assert.equal(secondCount, 11);

  const imodelInfo: TestIModelInfo = await IModelTestUtils.getTestModelInfo(requestContext, projectId, iModelName);
  const firstChangeSetId = imodelInfo.changeSets[0].wsgId;
  await rwIModel.reverseChanges(requestContext, IModelVersion.asOfChangeSet(firstChangeSetId));
  const reverseCount = getElementCount(rwIModel);
  assert.equal(reverseCount, firstCount);

  const startTime = new Date().getTime();
  await rwIModel.reinstateChanges(requestContext, IModelVersion.latest());
  const endTime = new Date().getTime();
  const elapsedTime1 = (endTime - startTime) / 1000.0;
  const reinstateCount = getElementCount(rwIModel);
  assert.equal(reinstateCount, secondCount);

  reporter.addEntry("ImodelChangesetPerformance", "ReinstateChanges", "Execution time(s)", elapsedTime1, { Description: "reinstate the imodel to latest CS from first", Operation: "ReinstateChanges" });
  rwIModel.close();
}

describe("ImodelChangesetPerformance", () => {
  const reporter = new Reporter();
  let projectId: string;
  let imodelId: string;
  let imodelPushId: string;
  let client: IModelHubClient;
  let requestContext: AuthorizedClientRequestContext;

  before(async () => {
    if (!IModelJsFs.existsSync(KnownTestLocations.outputDir))
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);
    const configData = require(path.join(__dirname, "CSPerfConfig.json"));
    projectId = configData.basicTest.projectId;
    imodelId = configData.basicTest.imodelId;
    imodelPushId = configData.basicTest.imodelPushId;

    client = new IModelHubClient();

    requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
  });

  after(() => {
    const csvPath1 = path.join(KnownTestLocations.outputDir, "BackendOnlyPerfTest.csv");
    reporter.exportCSV(csvPath1);
  });

  it("GetImodel", async () => {
    await getIModelAfterApplyingCS(requestContext, reporter, projectId, imodelId, client).catch();
  });

  it("PushMetaChangeToHub", async () => {
    await pushIModelAfterMetaChanges(requestContext, reporter, projectId, imodelPushId).catch();
  });

  it("PushDataChangeToHub", async () => {
    await pushIModelAfterDataChanges(requestContext, reporter, projectId).catch();
  });

  it("PushSchemaChangeToHub", async () => {
    await pushIModelAfterSchemaChanges(requestContext, reporter, projectId).catch();
  });

  it("ExecuteQuery", async () => {
    await executeQueryTime(requestContext, reporter, projectId, imodelId).catch();
  });

  it("ReverseChanges", async () => {
    await reverseChanges(requestContext, reporter, projectId).catch();
  });

  it("ReinstateChanges", async () => {
    await reinstateChanges(requestContext, reporter, projectId).catch();
  });

});

describe.skip("ImodelChangesetPerformance big datasets", () => {
  const reporter = new Reporter();
  const configData = require(path.join(__dirname, "CSPerfConfig.json"));
  const csvPath = path.join(KnownTestLocations.outputDir, "ApplyCSPerf.csv");

  function getChangesetSummary(changeSets: ChangeSet[]): {} {
    const schemaChanges = changeSets.filter((obj) => obj.changesType === ChangesType.Schema);
    const dataChanges = changeSets.filter((obj) => obj.changesType === ChangesType.Regular);
    const csSummary = {
      count: changeSets.length,
      fileSizeKB: Math.round(changeSets.reduce((prev, cs) => prev + Number(cs.fileSize), 0) / 1024),
      schemaChanges: {
        count: schemaChanges.length,
        fileSizeKB: Math.round(schemaChanges.reduce((prev, cs) => prev + Number(cs.fileSize), 0) / 1024),
      },
      dataChanges: {
        count: dataChanges.length,
        fileSizeKB: Math.round(dataChanges.reduce((prev, cs) => prev + Number(cs.fileSize), 0) / 1024),
      },
    };
    return csSummary;
  }

  before(async () => {
    if (!IModelJsFs.existsSync(KnownTestLocations.outputDir))
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);
  });

  after(() => {
    reporter.exportCSV(csvPath);
  });

  it("Get changeset summaries", async () => {
    const summary: any[] = [];
    for (const ds of configData.bigDatasets) {
      const projId: string = ds.projId;
      const imodelId: string = ds.modelId;

      const client: IModelHubClient = new IModelHubClient();
      const requestContext: AuthorizedClientRequestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);

      const changeSets: ChangeSet[] = await client.changeSets.get(requestContext, imodelId);
      const modelSummary = {
        projectId: projId,
        modelId: imodelId,
        changesetSummary: getChangesetSummary(changeSets),
      };
      summary.push(modelSummary);
      const changeSetsJsonStr = JSON.stringify(changeSets, undefined, 4);
      const changeSetsJsonPathname = path.join(KnownTestLocations.outputDir, "changeSets_" + imodelId + ".json");
      IModelJsFs.writeFileSync(changeSetsJsonPathname, changeSetsJsonStr);
    }
    const csSummary: string = JSON.stringify(summary, undefined, 4);
    const summaryJsonFile = path.join(KnownTestLocations.outputDir, "ChangesetSummary.json");
    IModelJsFs.writeFileSync(summaryJsonFile, csSummary);
  });

  it("ApplyChangeset", async () => {
    const batchSize: number = 50;
    for (const ds of configData.bigDatasets) {
      const projectId: string = ds.projId;
      const imodelId: string = ds.modelId;

      const client: IModelHubClient = new IModelHubClient();
      let requestContext: AuthorizedClientRequestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
      const changeSets: ChangeSet[] = await client.changeSets.get(requestContext, imodelId);
      const startNum: number = ds.csStart ? ds.csStart : 0;
      const endNum: number = ds.csEnd ? ds.csEnd : changeSets.length;
      const modelInfo = {
        projId: projectId,
        projName: ds.projName,
        modelId: imodelId,
        modelName: ds.modelName,
      };

      const firstChangeSetId = changeSets[startNum].wsgId;
      const iModelDb = await IModelTestUtils.downloadAndOpenBriefcaseDb(requestContext, projectId, imodelId, SyncMode.PullAndPush, IModelVersion.asOfChangeSet(firstChangeSetId));

      for (let j = startNum; j < endNum; ++j) {
        const cs: ChangeSet = changeSets[j];
        let apply: boolean = false;
        if (ds.csType === "All") {
          apply = true;
        } else {
          if (ds.csType === cs.changesType) {
            apply = true;
          }
        }
        if (apply) {
          // tslint:disable-next-line:no-console
          console.log("For iModel: " + ds.modelName + ": Applying changeset: " + (j + 1).toString() + " / " + endNum.toString());
          requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
          const startTime = new Date().getTime();
          await iModelDb.pullAndMergeChanges(requestContext, IModelVersion.asOfChangeSet(cs.wsgId));
          const endTime = new Date().getTime();
          const elapsedTime = (endTime - startTime) / 1000.0;

          const csInfo = {
            GUID: cs.wsgId,
            fileSize: cs.fileSize,
            type: cs.changesType,
            desc: cs.description,
          };
          reporter.addEntry("ImodelChangesetPerformance", "ApplyChangeset", "Time(s)", elapsedTime, { csNum: j, csDetail: csInfo, modelDetail: modelInfo });
        }
        if (j % batchSize === 0) { // After few runs write results in case test fails
          reporter.exportCSV(csvPath);
          reporter.clearEntries();
        }
      }
      iModelDb.close();
      reporter.exportCSV(csvPath);
      reporter.clearEntries();
    }
  });
});

describe("ImodelChangesetPerformance Apply Local", () => {
  let iModelRootDir: string;
  const configData = require(path.join(__dirname, "CSPerfConfig.json"));
  const csvPath = path.join(KnownTestLocations.outputDir, "ApplyCSLocalPerf.csv");

  before(async () => {
    iModelRootDir = configData.rootDir;
    if (!IModelJsFs.existsSync(KnownTestLocations.outputDir))
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);
  });

  async function downloadFromHub(modelInfo: any) {
    const downloadDir: string = path.join(iModelRootDir, modelInfo.modelName);
    // if folder exists, we'll just use the local copy
    if (!IModelJsFs.existsSync(downloadDir)) {
      const requestContext: AuthorizedClientRequestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
      await HubUtility.downloadIModelById(requestContext, modelInfo.projId, modelInfo.modelId, downloadDir);
    }
  }

  function getStats(changesetFilePath: string) {
    const stats = RevisionUtility.computeStatistics(changesetFilePath, true);
    const details = {
      rowsDeleted: stats.statistics.byOp.rowDeleted,
      rowsInserted: stats.statistics.byOp.rowInserted,
      rowsUpdated: stats.statistics.byOp.rowsUpdated,
      rowsChanged: stats.statistics.rowsChanged,
      tablesChanged: stats.statistics.tablesChanged,
      schemaChangesTable: 0,
      schemaChangesIndex: 0,
    };
    if (stats.hasSchemaChanges) {
      const parts: string[] = stats.schemaChanges.toString().split(";");
      const indexParts = parts.filter((obj) => obj.includes("INDEX"));
      const tableParts = parts.filter((obj) => obj.includes("TABLE"));

      details.schemaChangesTable = tableParts.length;
      details.schemaChangesIndex = indexParts.length;
    }
    return details;
  }

  it("apply all changesets", async () => {
    Logger.initializeToConsole();
    Logger.setLevelDefault(LogLevel.Error);
    Logger.setLevel("HubUtility", LogLevel.Info);
    Logger.setLevel("Performance", LogLevel.Info);

    for (const ds of configData.bigDatasets) {
      const modelInfo = {
        projId: ds.projId,
        projName: ds.projName,
        modelId: ds.modelId,
        modelName: ds.modelName,
      };
      const csStart = ds.csStart;
      const csEnd = ds.csEnd;
      const iModelDir: string = path.join(iModelRootDir, modelInfo.modelName);
      await downloadFromHub(modelInfo);
      const results = HubUtility.getApplyChangeSetTime(iModelDir, csStart, csEnd);

      const changeSetJsonPathname = path.join(iModelDir, "changeSets.json");
      const jsonStr = IModelJsFs.readFileSync(changeSetJsonPathname) as string;
      const changeSetsJson = JSON.parse(jsonStr);

      const changesetsInfo = [];
      for (const changeSetJson of changeSetsJson) {
        changesetsInfo.push(changeSetJson);
      }

      const reporter = new Reporter();
      for (const result of results) {
        const csDetail = changesetsInfo.filter((obj) => obj.id === result.csId);
        const csInfo = {
          GUID: result.csId,
          fileSize: csDetail[0].fileSize,
          type: csDetail[0].changesType,
          desc: csDetail[0].description,
        };
        const stats = getStats(path.join(iModelDir, "changeSets", result.csId + ".cs"));
        reporter.addEntry("ImodelChangesetPerformance", "ApplyChangesetLocal", "Time(s)", result.time, { csNum: result.csNum, csDetail: csInfo, csStats: stats, modelDetail: modelInfo });
      }
      reporter.exportCSV(csvPath);
    }
  });

});
