/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import * as chai from "chai";
import * as fs from "fs";
import * as path from "path";

import { AccessToken } from "../../";

import {
  IModelHubClient, Briefcase, BriefcaseQuery, IModelHubClientError,
} from "../../";
import { AzureFileHandler } from "../../imodelhub/AzureFileHandler";
import { TestConfig } from "../TestConfig";
import { ResponseBuilder, RequestType, ScopeType } from "../ResponseBuilder";
import * as utils from "./TestUtils";
import { IModelHubStatus, ActivityLoggingContext, GuidString } from "@bentley/bentleyjs-core";
import { IModelClient } from "../../IModelClient";

function mockGetBriefcaseById(imodelId: GuidString, briefcase: Briefcase) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "Briefcase", `${briefcase.briefcaseId!}`);
  const requestResponse = ResponseBuilder.generateGetResponse(briefcase);
  ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Get, requestPath, requestResponse);
}

function mockGetBriefcaseWithDownloadUrl(imodelId: GuidString, briefcase: Briefcase) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "Briefcase",
    `${briefcase.briefcaseId!}?$select=*,FileAccessKey-forward-AccessKey.DownloadURL`);
  briefcase.downloadUrl = "https://imodelhubqasa01.blob.core.windows.net/imodelhubfile";
  briefcase.fileName = "TestModel.bim";
  briefcase.fileSize = utils.getMockFileSize();
  const requestResponse = ResponseBuilder.generateGetResponse<Briefcase>(briefcase);
  ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Get, requestPath, requestResponse);
}

function mockDeleteBriefcase(imodelId: GuidString, briefcaseId: number) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "Briefcase", briefcaseId.toString());
  ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Delete, requestPath, {});
}

describe("iModelHub BriefcaseHandler", () => {
  let accessToken: AccessToken;
  let imodelId: GuidString;
  let iModelClient: IModelClient;
  const imodelName = "imodeljs-clients Briefcases test";
  let briefcaseId: number;
  let acquiredBriefcaseId: number;
  const actx = new ActivityLoggingContext("");

  before(async function (this: Mocha.IHookCallbackContext) {
    this.enableTimeouts(false);
    accessToken = await utils.login();
    await utils.createIModel(accessToken, imodelName);
    imodelId = await utils.getIModelId(accessToken, imodelName);
    iModelClient = utils.getDefaultClient();
    if (!TestConfig.enableMocks) {
      const briefcases = await iModelClient.Briefcases().get(actx, accessToken, imodelId);
      let briefcasesCount = briefcases.length;
      if (briefcasesCount > 19) {
        // Ensure that tests can still acquire briefcases
        for (const briefcase of briefcases) {
          await iModelClient.Briefcases().delete(actx, accessToken, imodelId, briefcase.briefcaseId!);
        }
        briefcasesCount = 0;
      }

      // Ensure that at least one briefcase is available for querying
      if (briefcasesCount === 0) {
        const briefcase = await iModelClient.Briefcases().create(actx, accessToken, imodelId);
        briefcaseId = briefcase.briefcaseId!;
      } else {
        briefcaseId = briefcases[0].briefcaseId!;
      }
    } else {
      briefcaseId = 2;
    }

    if (!fs.existsSync(utils.workDir)) {
      fs.mkdirSync(utils.workDir);
    }
  });

  afterEach(() => {
    ResponseBuilder.clearMocks();
  });

  it("should acquire a briefcase", async () => {
    utils.mockCreateBriefcase(imodelId, 3);
    const briefcase = await iModelClient.Briefcases().create(actx, accessToken, imodelId);
    chai.expect(briefcase.briefcaseId).to.be.greaterThan(1);
    acquiredBriefcaseId = briefcase.briefcaseId!;
  });

  it("should get all briefcases ", async () => {
    utils.mockGetBriefcase(imodelId, utils.generateBriefcase(2), utils.generateBriefcase(3));
    const briefcases = await iModelClient.Briefcases().get(actx, accessToken, imodelId);
    chai.expect(briefcases.length).to.be.greaterThan(0);

    for (const briefcase of briefcases) {
      chai.assert(briefcase.iModelId);
      chai.expect(briefcase.iModelId!.toString()).to.be.equal(imodelId.toString());
    }
  });

  it("should delete a briefcase", async () => {
    utils.mockGetBriefcase(imodelId, utils.generateBriefcase(2), utils.generateBriefcase(acquiredBriefcaseId));
    const originalBriefcaseCount = (await iModelClient.Briefcases().get(actx, accessToken, imodelId)).length;

    mockDeleteBriefcase(imodelId, acquiredBriefcaseId);
    await iModelClient.Briefcases().delete(actx, accessToken, imodelId, acquiredBriefcaseId);

    utils.mockGetBriefcase(imodelId, utils.generateBriefcase(2));
    const briefcaseCount = (await iModelClient.Briefcases().get(actx, accessToken, imodelId)).length;

    chai.expect(briefcaseCount).to.be.lessThan(originalBriefcaseCount);
  });

  it("should fail getting an invalid briefcase", async () => {
    let error: any;
    try {
      await iModelClient.Briefcases().get(actx, accessToken, imodelId, new BriefcaseQuery().byId(-1));
    } catch (err) {
      error = err;
    }
    chai.assert(error);
    chai.expect(error).to.be.instanceof(IModelHubClientError);
    chai.expect(error.errorNumber).to.be.equal(IModelHubStatus.InvalidArgumentError);
  });

  it("should get information on a briefcase by id", async () => {
    mockGetBriefcaseById(imodelId, utils.generateBriefcase(briefcaseId));
    const briefcase: Briefcase = (await iModelClient.Briefcases().get(actx, accessToken, imodelId, new BriefcaseQuery().byId(briefcaseId)))[0];
    chai.expect(briefcase.briefcaseId).to.be.equal(briefcaseId);
    chai.expect(briefcase.downloadUrl).to.be.equal(undefined);
    chai.assert(briefcase.iModelId);
    chai.expect(briefcase.iModelId!.toString()).to.be.equal(imodelId.toString());
  });

  it("should fail deleting an invalid briefcase", async () => {
    let error: any;
    try {
      await iModelClient.Briefcases().delete(actx, accessToken, imodelId, -1);
    } catch (err) {
      error = err;
    }
    chai.assert(error);
    chai.expect(error).to.be.instanceof(IModelHubClientError);
    chai.expect(error.errorNumber).to.be.equal(IModelHubStatus.InvalidArgumentError);
  });

  it("should get the download URL for a Briefcase", async () => {
    mockGetBriefcaseWithDownloadUrl(imodelId, utils.generateBriefcase(briefcaseId));
    const briefcase: Briefcase = (await iModelClient.Briefcases().get(actx, accessToken, imodelId, new BriefcaseQuery().byId(briefcaseId).selectDownloadUrl()))[0];
    chai.expect(briefcase.briefcaseId).to.be.equal(briefcaseId);
    chai.assert(briefcase.fileName);
    chai.expect(briefcase.fileName!.length).to.be.greaterThan(0);
    chai.assert(briefcase.downloadUrl);
    chai.assert(briefcase.downloadUrl!.startsWith("https://"));
  });

  it("should download a Briefcase", async () => {
    mockGetBriefcaseWithDownloadUrl(imodelId, utils.generateBriefcase(briefcaseId));
    const briefcase: Briefcase = (await iModelClient.Briefcases().get(actx, accessToken, imodelId, new BriefcaseQuery().byId(briefcaseId).selectDownloadUrl()))[0];
    chai.assert(briefcase.downloadUrl);

    const fileName: string = briefcase.fileName!;
    const downloadToPathname: string = path.join(utils.workDir, fileName);

    utils.mockFileResponse();

    const progressTracker = new utils.ProgressTracker();
    await iModelClient.Briefcases().download(actx, briefcase, downloadToPathname, progressTracker.track());
    progressTracker.check();
    fs.existsSync(downloadToPathname).should.be.equal(true);
  });

  it("should download a Briefcase without buffered write", async () => {
    mockGetBriefcaseWithDownloadUrl(imodelId, utils.generateBriefcase(briefcaseId));
    const briefcase: Briefcase = (await iModelClient.Briefcases().get(actx, accessToken, imodelId, new BriefcaseQuery().byId(briefcaseId).selectDownloadUrl()))[0];
    chai.assert(briefcase.downloadUrl);

    const fileName: string = briefcase.fileName!;
    const downloadToPathname: string = path.join(utils.workDir, fileName);

    utils.mockFileResponse();

    const progressTracker = new utils.ProgressTracker();
    const client = new IModelHubClient(new AzureFileHandler(false));
    await client.Briefcases().download(actx, briefcase, downloadToPathname, progressTracker.track());
    progressTracker.check();
    fs.existsSync(downloadToPathname).should.be.equal(true);
  });

  it("should get error 409 and fail to get briefcase", async function (this: Mocha.ITestCallbackContext) {
    if (!TestConfig.enableMocks)
      this.skip();

    const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "Briefcase");
    ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Get, requestPath, ResponseBuilder.generateError("NoServerLicense"), 1, undefined, undefined, 409);
    let error;
    try {
      (await iModelClient.Briefcases().get(actx, accessToken, imodelId));
    } catch (err) {
      error = err;
    }
    chai.assert(error);
    chai.expect(error.status).to.be.equal(409);
    chai.expect(error.name).to.be.equal("NoServerLicense");
  });

  it("should get error 500 and retry to get briefcase", async function (this: Mocha.ITestCallbackContext) {
    if (!TestConfig.enableMocks)
      this.skip();

    const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "Briefcase");
    ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Get, requestPath, ResponseBuilder.generateError(undefined, "ServerError"), 5, undefined, undefined, 500);
    let error;
    try {
      (await iModelClient.Briefcases().get(actx, accessToken, imodelId));
    } catch (err) {
      error = err;
    }
    chai.assert(error);
    chai.expect(error.status).to.be.equal(500);
  });

  it("should fail downloading briefcase with no file handler", async () => {
    let error: IModelHubClientError | undefined;
    const invalidClient = new IModelHubClient();
    try {
      await invalidClient.Briefcases().download(actx, new Briefcase(), utils.workDir);
    } catch (err) {
      if (err instanceof IModelHubClientError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.errorNumber).to.be.equal(IModelHubStatus.FileHandlerNotSet);
  });

  it("should fail downloading briefcase with no file url", async () => {
    let error: IModelHubClientError | undefined;
    try {
      await iModelClient.Briefcases().download(actx, new Briefcase(), utils.workDir);
    } catch (err) {
      if (err instanceof IModelHubClientError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.errorNumber).to.be.equal(IModelHubStatus.MissingDownloadUrlError);
  });
});
