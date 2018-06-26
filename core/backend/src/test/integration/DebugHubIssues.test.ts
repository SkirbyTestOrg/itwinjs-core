/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import * as path from "path";
import { assert } from "chai";
import { OpenMode } from "@bentley/bentleyjs-core";
import { AccessToken } from "@bentley/imodeljs-clients";
import { IModelVersion } from "@bentley/imodeljs-common";
import { IModelDb, OpenParams, IModelHost, IModelHostConfiguration } from "../../backend";
import { IModelTestUtils, TestUsers } from "../IModelTestUtils";
import { HubUtility } from "./HubUtility";
import { IModelWriter } from "./IModelWriter";
import { IModelJsFs } from "../../IModelJsFs";
import { BriefcaseManager } from "../../BriefcaseManager";

// Useful utilities to download/upload test cases from/to the iModel Hub
describe.skip("DebugHubIssues (#integration)", () => {
  let accessToken: AccessToken;
  const iModelRootDir = "d:\\temp\\IModelDumps\\";

  before(async () => {
    accessToken = await IModelTestUtils.getTestUserAccessToken();
  });

  it.skip("create a test case on the Hub with a named version from a standalone iModel", async () => {
    const projectName = "NodeJsTestProject";
    const pathname = "d:\\temp\\IModelDumps\\Office Building4.bim";

    // Push the iModel to the Hub
    const projectId = await HubUtility.queryProjectIdByName(accessToken, projectName);
    const iModelId: string = await HubUtility.pushIModel(accessToken, projectId, pathname);

    const iModelDb = await IModelDb.open(accessToken, projectId, iModelId, OpenParams.pullAndPush(), IModelVersion.latest());
    assert(!!iModelDb);

    // Create and upload a dummy change set to the Hub
    const modelId = IModelWriter.insertPhysicalModel(iModelDb, "DummyTestModel");
    assert(!!modelId);
    iModelDb.saveChanges("Dummy change set");
    await iModelDb.pushChanges(accessToken!);

    // Create a named version on the just uploaded change set
    const changeSetId: string = await IModelVersion.latest().evaluateChangeSet(accessToken, iModelId, BriefcaseManager.hubClient);
    await BriefcaseManager.hubClient.Versions().create(accessToken, iModelId, changeSetId, "DummyVersion", "Just a dummy version for testing with web navigator");
  });

  it.skip("should be able to download the seed files, change sets, for any iModel on the Hub", async () => {
    const projectName = "NodeJsTestProject";
    const iModelName = "TestModel";

    const iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.downloadIModelByName(accessToken, projectName, iModelName, iModelDir);
  });

  it.skip("should be able to delete any iModel on the Hub", async () => {
    await HubUtility.deleteIModel(accessToken, "NodeJsTestProject", "TestModel");
  });

  it.skip("should be able to upload seed files, change sets, for any iModel on the Hub", async () => {
    const projectName = "NodeJsTestProject";
    const iModelName = "TestModel";

    const iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.pushIModelAndChangeSets(accessToken, projectName, iModelDir);
  });

  it.skip("should be able to open any iModel on the Hub", async () => {
    const projectName = "NodeJsTestProject";
    const iModelName = "TestModel";

    const myProjectId = await HubUtility.queryProjectIdByName(accessToken, projectName);
    const myIModelId = await HubUtility.queryIModelIdByName(accessToken, myProjectId, iModelName);

    const iModel: IModelDb = await IModelDb.open(accessToken, myProjectId, myIModelId, OpenParams.fixedVersion());
    assert.exists(iModel);
    assert(iModel.openParams.openMode === OpenMode.Readonly);

    iModel.close(accessToken);
  });

  it.skip("should be able to create a change set from a standalone iModel)", async () => {
    const dbName = "D:\\temp\\Defects\\879278\\DPIntegrationTestProj79.bim";
    const iModel: IModelDb = IModelDb.openStandalone(dbName, OpenMode.ReadWrite, true); // could throw Error
    assert.exists(iModel);

    const changeSetToken = BriefcaseManager.createStandaloneChangeSet(iModel.briefcase);
    assert(IModelJsFs.existsSync(changeSetToken.pathname));

    BriefcaseManager.dumpChangeSet(iModel.briefcase, changeSetToken);
  });

  it.skip("should be able to open any iModel on the Hub", async () => {
    const projectName = "AbdTestProject";
    const iModelName = "ATP_2018050310145994_scenario22";

    const myProjectId = await HubUtility.queryProjectIdByName(accessToken, projectName);
    const myIModelId = await HubUtility.queryIModelIdByName(accessToken, myProjectId, iModelName);

    const iModel: IModelDb = await IModelDb.open(accessToken, myProjectId, myIModelId, OpenParams.fixedVersion());
    assert.exists(iModel);
    assert(iModel.openParams.openMode === OpenMode.Readonly);

    iModel.close(accessToken);
  });

  it.skip("should be able to download the seed files, change sets, for any iModel on the Hub in PROD", async () => {
    const accessToken1: AccessToken = await IModelTestUtils.getTestUserAccessToken(TestUsers.regular, "PROD");

    // Restart host on PROD
    IModelHost.shutdown();
    const hostConfig: IModelHostConfiguration = new IModelHostConfiguration();
    hostConfig.hubDeploymentEnv = "PROD";
    IModelHost.startup(hostConfig);

    const projectName = "1MWCCN01 - North Project";
    const iModelName = "1MWCCN01";

    const iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.downloadIModelByName(accessToken1, projectName, iModelName, iModelDir);
  });

  it.skip("should be able to download the seed files, change sets, for any iModel on the Hub in DEV", async () => {
    const accessToken1: AccessToken = await IModelTestUtils.getTestUserAccessToken(TestUsers.user1, "QA");

    // Restart host on DEV
    IModelHost.shutdown();
    const hostConfig: IModelHostConfiguration = new IModelHostConfiguration();
    hostConfig.hubDeploymentEnv = "DEV";
    IModelHost.startup(hostConfig);
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Turn off SSL validation in DEV

    const projectId = "bffa4aea-5f3f-4b60-8ecb-4656081ea480";
    const iModelId = "5e8f5fbb-6613-479a-afb1-ce8de037ef0e";
    const iModelDir = path.join(iModelRootDir, iModelId);

    const startTime = Date.now();
    await HubUtility.downloadIModelById(accessToken1, projectId, iModelId, iModelDir);
    const finishTime = Date.now();
    console.log(`Time taken to download is ${finishTime - startTime} milliseconds`); // tslint:disable-line:no-console
  });

});
