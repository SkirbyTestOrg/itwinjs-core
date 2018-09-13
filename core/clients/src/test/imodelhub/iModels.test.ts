/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import * as chai from "chai";
import * as fs from "fs";
import * as path from "path";

import { Guid, IModelHubStatus, ActivityLoggingContext } from "@bentley/bentleyjs-core";

import { AccessToken, WsgError, IModelQuery, IModelClient } from "../../";
import {
  IModelHubClient, IModelRepository, SeedFile, IModelHubError,
  IModelHubClientError,
} from "../../";

import { TestConfig } from "../TestConfig";
import { ResponseBuilder, RequestType, ScopeType } from "../ResponseBuilder";
import * as utils from "./TestUtils";
import { IModelProjectClient } from "../../IModelCloudEnvironment";

function mockGetIModelByName(projectId: string, name: string, description = "", imodelId?: string, initialized = true) {
  if (!TestConfig.enableMocks)
    return;

  imodelId = imodelId || Guid.createValue();
  const requestPath = utils.createRequestUrl(ScopeType.Project, projectId,
    "iModel", `?$filter=Name+eq+%27${encodeURIComponent(name)}%27`);
  const requestResponse = ResponseBuilder.generateGetResponse<IModelRepository>(ResponseBuilder.generateObject<IModelRepository>(IModelRepository,
    new Map<string, any>([
      ["name", name],
      ["description", description],
      ["wsgId", imodelId],
      ["initialized", initialized],
    ])));
  ResponseBuilder.mockResponse(utils.defaultUrl, RequestType.Get, requestPath, requestResponse);
}

function mockPostiModel(projectId: string, imodelId: string, imodelName: string, description: string) {
  const requestPath = utils.createRequestUrl(ScopeType.Project, projectId, "iModel");
  const postBody = ResponseBuilder.generatePostBody<IModelRepository>(
    ResponseBuilder.generateObject<IModelRepository>(IModelRepository,
      new Map<string, any>([
        ["name", imodelName],
        ["description", description],
      ])));
  const requestResponse = ResponseBuilder.generatePostResponse<IModelRepository>(ResponseBuilder.generateObject<IModelRepository>(IModelRepository,
    new Map<string, any>([
      ["wsgId", imodelId],
      ["name", imodelName],
      ["description", description],
      ["initialized", false],
    ])));
  ResponseBuilder.mockResponse(utils.defaultUrl, RequestType.Post, requestPath, requestResponse, 1, postBody);
}

function mockPostNewSeedFile(imodelId: string, fileId: string, filePath: string, description?: string) {
  const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "SeedFile");
  const postBody = ResponseBuilder.generatePostBody<SeedFile>(ResponseBuilder.generateObject<SeedFile>(SeedFile,
    new Map<string, any>([
      ["fileName", path.basename(filePath)],
      ["fileDescription", description],
      ["fileSize", fs.statSync(filePath).size.toString()],
    ])));
  const requestResponse = ResponseBuilder.generatePostResponse<SeedFile>(ResponseBuilder.generateObject<SeedFile>(SeedFile,
    new Map<string, any>([
      ["wsgId", fileId],
      ["fileId", fileId],
      ["fileName", path.basename(filePath)],
      ["fileDescription", description],
      ["uploadUrl", `${utils.defaultUrl}/imodelhub-${imodelId}/123456`],
    ])));
  ResponseBuilder.mockResponse(utils.defaultUrl, RequestType.Post, requestPath, requestResponse, 1, postBody);
}

function mockPostUpdatedSeedFile(imodelId: string, fileId: string, filePath: string, description?: string) {
  const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "SeedFile", fileId);
  const postBody = ResponseBuilder.generatePostBody<SeedFile>(ResponseBuilder.generateObject<SeedFile>(SeedFile,
    new Map<string, any>([
      ["wsgId", fileId],
      ["fileName", path.basename(filePath)],
      ["fileId", fileId],
      ["isUploaded", true],
      ["fileDescription", description],
    ])));

  const requestResponse = ResponseBuilder.generatePostResponse<SeedFile>(ResponseBuilder.generateObject<SeedFile>(SeedFile,
    new Map<string, any>([
      ["fileId", fileId],
      ["wsgId", fileId],
      ["isUploaded", true],
    ])));
  ResponseBuilder.mockResponse(utils.defaultUrl, RequestType.Post, requestPath, requestResponse, 1, postBody);
}

function mockGetSeedFile(imodelId: string, getFileUrl = false) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "SeedFile",
    getFileUrl ? "?$select=*,FileAccessKey-forward-AccessKey.DownloadURL&$orderby=Index+desc" : "?$orderby=Index+desc");
  const values = new Map<string, any>();
  if (getFileUrl) {
    values.set("downloadUrl", "https://imodelhubqasa01.blob.core.windows.net/imodelhubfile");
    values.set("fileSize", utils.getMockFileSize());
  } else {
    values.set("initializationState", 0);
  }
  const requestResponse = ResponseBuilder.generateGetResponse<SeedFile>(ResponseBuilder.generateObject<SeedFile>(SeedFile, values));
  ResponseBuilder.mockResponse(utils.defaultUrl, RequestType.Get, requestPath, requestResponse);
}

function mockCreateiModel(projectId: string, imodelId: string, imodelName: string, description: string, filePath: string, chunks = 1) {
  if (!TestConfig.enableMocks)
    return;

  const fileId = Guid.createValue();
  mockPostiModel(projectId, imodelId, imodelName, description);
  mockPostNewSeedFile(imodelId, fileId, filePath, description);
  utils.mockUploadFile(imodelId, chunks);
  mockPostUpdatedSeedFile(imodelId, fileId, filePath, description);
  mockGetSeedFile(imodelId);
}

function mockDeleteiModel(projectId: string, imodelId: string) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = utils.createRequestUrl(ScopeType.Project, projectId,
    "iModel", imodelId);
  ResponseBuilder.mockResponse(utils.defaultUrl, RequestType.Delete, requestPath);
}

function mockUpdateiModel(projectId: string, imodel: IModelRepository) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = utils.createRequestUrl(ScopeType.Project, projectId, "iModel", imodel.wsgId);
  const postBody = ResponseBuilder.generatePostBody<IModelRepository>(imodel);
  const requestResponse = ResponseBuilder.generatePostResponse<IModelRepository>(imodel);
  ResponseBuilder.mockResponse(utils.defaultUrl, RequestType.Post, requestPath, requestResponse, 1, postBody);
}

describe("iModelHub iModelHandler", () => {
  let accessToken: AccessToken;
  let projectId: string;
  let iModelId: string;
  let iModelClient: IModelClient;
  const imodelName = "imodeljs-clients iModels test";
  const createIModelName = "imodeljs-client iModels Create test";
  const imodelProject: IModelProjectClient = utils.getCloudEnv().project;
  const alctx = new ActivityLoggingContext("");

  before(async () => {
    accessToken = await utils.login();
    projectId = await utils.getProjectId(accessToken, undefined);
    await utils.createIModel(accessToken, imodelName);
    iModelId = await utils.getIModelId(accessToken, imodelName);
    iModelClient = await utils.getClient(iModelId);
    await utils.deleteIModelByName(accessToken, projectId, createIModelName);

    if (!fs.existsSync(utils.workDir)) {
      fs.mkdirSync(utils.workDir);
    }
  });

  afterEach(() => {
    ResponseBuilder.clearMocks();
  });

  after(async () => {
    await utils.deleteIModelByName(accessToken, projectId, createIModelName);
    utils.getCloudEnv().terminate();
  });

  it("should get list of IModels", async () => {
    if (TestConfig.enableMocks) {
      const requestPath = utils.createRequestUrl(ScopeType.Project, projectId, "iModel");
      const requestResponse = ResponseBuilder.generateGetResponse<IModelRepository>(ResponseBuilder.generateObject<IModelRepository>(IModelRepository,
        new Map<string, any>([["name", imodelName]])));
      ResponseBuilder.mockResponse(utils.defaultUrl, RequestType.Get, requestPath, requestResponse);
    }

    let imodels: IModelRepository[];
    imodels = await imodelProject.queryIModels(alctx, accessToken, projectId, undefined);
    chai.expect(imodels.length).to.be.greaterThan(0);
  });

  it("should get a specific IModel", async () => {
    mockGetIModelByName(projectId, imodelName);
    const iModel: IModelRepository = (await imodelProject.queryIModels(alctx, accessToken, projectId, new IModelQuery().byName(imodelName)))[0];
    chai.expect(iModel.name).to.be.equal(imodelName);
  });

  it("should be able to delete iModels", async function (this: Mocha.ITestCallbackContext) {
    if (!TestConfig.enableMocks)
      this.skip();

    // Used only for maintenance
    const names = ["22_LargePlant.166.i"];
    for (const name of names) {
      mockGetIModelByName(projectId, name);
      const iModel: IModelRepository = (await imodelProject.queryIModels(alctx, accessToken, projectId, new IModelQuery().byName(name)))[0];
      chai.expect(iModel.name).to.be.equal(name);
      mockDeleteiModel(projectId, iModel.wsgId);
      await imodelProject.deleteIModel(alctx, accessToken, projectId, iModel.wsgId);
    }
  });

  it("should retrieve an iModel by its id", async () => {
    if (TestConfig.enableMocks) {
      const requestPath = utils.createRequestUrl(ScopeType.Project, projectId, "iModel", iModelId);
      const requestResponse = ResponseBuilder.generateGetResponse<IModelRepository>(ResponseBuilder.generateObject<IModelRepository>(IModelRepository,
        new Map<string, any>([["wsgId", iModelId]])));
      ResponseBuilder.mockResponse(utils.defaultUrl, RequestType.Get, requestPath, requestResponse);
    }

    const iModel: IModelRepository = (await imodelProject.queryIModels(alctx, accessToken, projectId, new IModelQuery().byId(iModelId)))[0];

    chai.expect(iModel.wsgId).to.be.equal(iModelId);
  });

  it("should fail getting an invalid iModel", async () => {
    if (TestConfig.enableMocks) {
      const requestPath = utils.createRequestUrl(ScopeType.Project, projectId, "iModel", "00000000-0000-0000-0000-000000000000");
      ResponseBuilder.mockResponse(utils.defaultUrl, RequestType.Get, requestPath, ResponseBuilder.generateError("InstanceNotFound"),
        1, undefined, undefined, 404);
    }

    let error: WsgError | undefined;
    try {
      await imodelProject.queryIModels(alctx, accessToken, projectId, new IModelQuery().byId("00000000-0000-0000-0000-000000000000"));
    } catch (err) {
      if (err instanceof WsgError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.name).to.be.equal("InstanceNotFound");
  });

  it("should fail getting an iModel without projectId", async () => {
    let error: IModelHubClientError | undefined;
    try {
      await imodelProject.queryIModels(alctx, accessToken, "", new IModelQuery().byId(iModelId));
    } catch (err) {
      if (err instanceof IModelHubClientError)
        error = err;
    }

    chai.assert(error);
    chai.expect(error!.errorNumber).to.be.equal(IModelHubStatus.UndefinedArgumentError);
  });

  it("should fail creating existing and initialized iModel", async function (this: Mocha.ITestCallbackContext) {
    if (TestConfig.enableMocks) {
      const requestPath = utils.createRequestUrl(ScopeType.Project, projectId, "iModel");
      const requestResponse = ResponseBuilder.generateError("iModelHub.iModelAlreadyExists", "iModel already exists", undefined,
        new Map<string, any>([["iModelInitialized", true]]));
      ResponseBuilder.mockResponse(utils.defaultUrl, RequestType.Post, requestPath, requestResponse, 1, undefined, undefined, 409);
    }

    let error: IModelHubError | undefined;
    try {
      await imodelProject.createIModel(alctx, accessToken, projectId, {
        name: imodelName, description: "", seedFile: utils.getMockSeedFilePath(),
      });
    } catch (err) {
      if (err instanceof IModelHubError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.errorNumber).to.be.equal(IModelHubStatus.iModelAlreadyExists);
  });

  it("should create iModel and upload SeedFile", async function (this: Mocha.ITestCallbackContext) {
    const filePath = utils.assetsPath + "LargerSeedFile.bim";
    const description = "Test iModel created by imodeljs-clients tests";
    mockCreateiModel(projectId, Guid.createValue(), createIModelName, description, filePath, 2);
    const progressTracker = new utils.ProgressTracker();
    const iModel = await imodelProject.createIModel(alctx, accessToken, projectId, {
      name: createIModelName, description, seedFile: filePath, tracker: progressTracker.track(),
    });

    chai.expect(iModel.name).to.be.equal(createIModelName);
    chai.expect(iModel.initialized).to.be.equal(true);
    progressTracker.check();
  });

  it("should continue creating not initialized iModel", async function (this: Mocha.ITestCallbackContext) {
    if (!TestConfig.enableMocks)
      this.skip();

    const filePath = utils.getMockSeedFilePath();
    if (TestConfig.enableMocks) {
      const requestPath = utils.createRequestUrl(ScopeType.Project, projectId, "iModel");
      const postBody = ResponseBuilder.generatePostBody<IModelRepository>(
        ResponseBuilder.generateObject<IModelRepository>(IModelRepository,
          new Map<string, any>([["name", imodelName]])));
      const requestResponse = ResponseBuilder.generateError("iModelHub.iModelAlreadyExists", "iModel already exists", undefined,
        new Map<string, any>([["iModelInitialized", false]]));
      ResponseBuilder.mockResponse(utils.defaultUrl, RequestType.Post, requestPath, requestResponse, 1, postBody, undefined, 409);

      const fileId = Guid.createValue();
      mockGetIModelByName(projectId, imodelName, "", iModelId, false);
      mockPostNewSeedFile(iModelId, fileId, filePath, undefined);
      utils.mockUploadFile(iModelId, 1);
      mockPostUpdatedSeedFile(iModelId, fileId, filePath, undefined);
      mockGetSeedFile(iModelId);
    }

    const iModel = await imodelProject.createIModel(alctx, accessToken, projectId, {
      name: imodelName, description: "", seedFile: filePath,
    });

    chai.expect(iModel.wsgId).to.be.equal(iModelId);
    chai.expect(iModel.name).to.be.equal(imodelName);
    chai.expect(iModel.initialized).to.be.equal(true);
  });

  it("should download a Seed File", async () => {
    mockGetSeedFile(iModelId, true);
    const downloadToPathname: string = path.join(utils.workDir, iModelId);
    utils.mockFileResponse();

    const progressTracker = new utils.ProgressTracker();
    await iModelClient.IModels().download(alctx, accessToken, iModelId, downloadToPathname, progressTracker.track());
    progressTracker.check();
    fs.existsSync(downloadToPathname).should.be.equal(true);
  });

  it("should fail downloading the Seed File with no file handler", async () => {
    let error: IModelHubClientError | undefined;
    const invalidClient = new IModelHubClient(TestConfig.deploymentEnv);
    try {
      await invalidClient.IModels().download(alctx, accessToken, iModelId, utils.workDir);
    } catch (err) {
      if (err instanceof IModelHubClientError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.errorNumber).to.be.equal(IModelHubStatus.FileHandlerNotSet);
  });

  it("should fail creating an iModel with no file handler", async function (this: Mocha.ITestCallbackContext) {
    if (!utils.getCloudEnv().isIModelHub)
      this.skip();

    let error: IModelHubClientError | undefined;
    const invalidClient = new IModelHubClient(TestConfig.deploymentEnv);
    try {
      await invalidClient.IModels().create(alctx, accessToken, projectId, createIModelName, utils.workDir);
    } catch (err) {
      if (err instanceof IModelHubClientError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.errorNumber).to.be.equal(IModelHubStatus.FileHandlerNotSet);
  });

  it("should fail creating an iModel with no file", async () => {
    let error: IModelHubClientError | undefined;
    try {
      await iModelClient.IModels().create(alctx, accessToken, projectId, createIModelName, utils.workDir + "InvalidiModel.bim");
    } catch (err) {
      if (err instanceof IModelHubClientError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.errorNumber).to.be.equal(IModelHubStatus.FileNotFound);
  });

  it("should fail creating an iModel with directory path", async () => {
    let error: IModelHubClientError | undefined;
    try {
      await iModelClient.IModels().create(alctx, accessToken, projectId, createIModelName, utils.workDir);
    } catch (err) {
      if (err instanceof IModelHubClientError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.errorNumber).to.be.equal(IModelHubStatus.FileNotFound);
  });

  it("should update iModel name and description", async () => {
    mockGetIModelByName(projectId, imodelName);
    const imodel: IModelRepository = (await iModelClient.IModels().get(alctx, accessToken, projectId, new IModelQuery().byName(imodelName)))[0];
    chai.expect(imodel.name).to.be.equal(imodelName);

    const newName = imodel.name + "_updated";
    const newDescription = "Description_updated";
    imodel.name = newName;
    imodel.description = newDescription;
    mockUpdateiModel(projectId, imodel);
    let updatediModel = await iModelClient.IModels().update(alctx, accessToken, projectId, imodel);

    chai.expect(updatediModel.wsgId).to.be(imodel.wsgId);
    chai.expect(updatediModel.name).to.be.equal(newName);
    chai.expect(updatediModel.description).to.be.equal(newDescription);

    mockGetIModelByName(projectId, newName, newDescription);
    updatediModel = (await iModelClient.IModels().get(alctx, accessToken, projectId, new IModelQuery().byName(newName)))[0];

    chai.assert(!!updatediModel);
    chai.expect(updatediModel.wsgId).to.be(imodel.wsgId);
    chai.expect(updatediModel.name).to.be.equal(newName);
    chai.expect(updatediModel.description).to.be.equal(newDescription);
  });
});
