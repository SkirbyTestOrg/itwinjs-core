/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import * as chai from "chai";
import * as fs from "fs";
import * as path from "path";
import * as deepAssign from "deep-assign";
import { IModelHubStatus, GuidString } from "@bentley/bentleyjs-core";
import {
  AccessToken, IModelClient, IModelHubClient, Briefcase, ChangeSet, ChangeSetQuery, CheckpointQuery,
  IModelHubClientError, Version, AuthorizedClientRequestContext,
} from "@bentley/imodeljs-clients";
import { ResponseBuilder, RequestType, ScopeType } from "../ResponseBuilder";
import { TestConfig } from "../TestConfig";
import { TestUsers } from "../TestUsers";
import * as utils from "./TestUtils";
import { AzureFileHandler } from "../../imodelhub/AzureFileHandler";

chai.should();

function mockPostNewChangeSet(imodelId: GuidString, changeSet: ChangeSet) {
  const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "ChangeSet");

  const postBody = ResponseBuilder.generatePostBody(changeSet);

  const cs = new ChangeSet();
  deepAssign(cs, changeSet);
  cs.id! = cs.id!;
  cs.uploadUrl = `${utils.IModelHubUrlMock.getUrl()}/imodelhub-${imodelId}/123456`;
  const requestResponse = ResponseBuilder.generatePostResponse(cs);

  ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Post, requestPath, requestResponse, 1, postBody);
}

function mockPostUpdatedChangeSet(imodelId: GuidString, changeSet: ChangeSet) {
  const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "ChangeSet", changeSet.id!);

  const cs = new ChangeSet();
  deepAssign(cs, changeSet);
  cs.isUploaded = true;
  cs.id! = changeSet.id!;
  const postBody = ResponseBuilder.generatePostBody(cs);

  const requestResponse = ResponseBuilder.generatePostResponse(cs);

  ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Post, requestPath, requestResponse, 1, postBody);
}

function mockCreateChangeSet(imodelId: GuidString, changeSet: ChangeSet) {
  if (!TestConfig.enableMocks)
    return;

  mockPostNewChangeSet(imodelId, changeSet);
  utils.mockUploadFile(imodelId, 1);
  mockPostUpdatedChangeSet(imodelId, changeSet);
}

describe("iModelHub ChangeSetHandler", () => {
  let imodelId: GuidString;
  let iModelClient: IModelClient;
  let briefcase: Briefcase;
  const imodelName = "imodeljs-clients ChangeSets test";
  let requestContext: AuthorizedClientRequestContext;

  const cumulativeChangeSetBackwardVersionId = "CumulativeChangeSet-backward-Version.Id";
  const cumulativeChangeSetBackwardChangeSetId = "CumulativeChangeSet-backward-ChangeSet.Id";
  const followingChangeSetBackwardVersionId = "FollowingChangeSet-backward-Version.Id";
  const followingChangesetBackwardChangesetId = "FollowingChangeSet-backward-ChangeSet.Id";

  before(async function (this: Mocha.IHookCallbackContext) {
    this.enableTimeouts(false);
    const accessToken: AccessToken = TestConfig.enableMocks ? new utils.MockAccessToken() : await utils.login(TestUsers.super);
    requestContext = new AuthorizedClientRequestContext(accessToken);

    await utils.createIModel(requestContext, imodelName);
    imodelId = await utils.getIModelId(requestContext, imodelName);
    iModelClient = utils.getDefaultClient();
    if (!TestConfig.enableMocks) {
      const changeSetCount = (await iModelClient.changeSets.get(requestContext, imodelId)).length;
      if (changeSetCount > 9) {
        // Recreate iModel if can not create any new changesets
        await utils.createIModel(requestContext, imodelName, undefined, true);
        imodelId = await utils.getIModelId(requestContext, imodelName);
      }
    }
    briefcase = (await utils.getBriefcases(requestContext, imodelId, 1))[0];

    // Ensure that at least 3 exist
    await utils.createChangeSets(requestContext, imodelId, briefcase, 0, 3);

    if (!TestConfig.enableMocks) {
      const changesets = (await iModelClient.changeSets.get(requestContext, imodelId));
      // Ensure that at least one lock exists
      await utils.createLocks(requestContext, imodelId, briefcase, 1, 2, 2, changesets[0].id, changesets[0].index);

      // Create named versions
      await utils.createVersions(requestContext, imodelId, [changesets[0].id!, changesets[1].id!, changesets[2].id!],
        ["Version 1", "Version 2", "Version 3"]);
    }

    if (!fs.existsSync(utils.workDir)) {
      fs.mkdirSync(utils.workDir);
    }
  });

  afterEach(() => {
    ResponseBuilder.clearMocks();
  });

  it("should create a new ChangeSet", async function (this: Mocha.ITestCallbackContext) {
    const mockChangeSets = utils.getMockChangeSets(briefcase);

    utils.mockGetChangeSet(imodelId, false, undefined, mockChangeSets[0], mockChangeSets[1]);
    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId);

    const index = changeSets.length;
    const filePath = utils.getMockChangeSetPath(index, mockChangeSets[index].id!);

    mockCreateChangeSet(imodelId, mockChangeSets[2]);
    const progressTracker = new utils.ProgressTracker();
    const newChangeSet = await iModelClient.changeSets.create(requestContext, imodelId, mockChangeSets[index], filePath, progressTracker.track());

    chai.assert(newChangeSet);
    progressTracker.check();
  });

  it("should get information on ChangeSets", async () => {
    const mockedChangeSets = utils.getMockChangeSets(briefcase).slice(0, 3);
    utils.mockGetChangeSet(imodelId, true, undefined, ...mockedChangeSets);

    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().selectDownloadUrl());
    chai.expect(changeSets.length).to.be.greaterThan(1);

    let i = 0;
    for (const changeSet of changeSets) {
      utils.mockGetChangeSet(imodelId, false, changeSet.id!, mockedChangeSets[i++]);

      const fileName: string = changeSet.fileName!;
      chai.expect(fileName.length).to.be.greaterThan(0);

      const downloadUrl: string = changeSet.downloadUrl!;
      chai.assert(downloadUrl.startsWith("https://"));

      const changeSet2: ChangeSet = (await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().byId(changeSet.id!)))[0];

      chai.expect(changeSet.id!).to.be.equal(changeSet2.id!);
      chai.expect(changeSet.index).to.be.equal(changeSet2.index);
    }

    const lastButOneChangeSet = changeSets[changeSets.length - 2];
    const lastButOneId = lastButOneChangeSet.id || lastButOneChangeSet.id!;
    if (TestConfig.enableMocks) {
      const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "ChangeSet",
        `?$filter=${followingChangesetBackwardChangesetId}+eq+%27${lastButOneId}%27`);
      ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Get, requestPath, ResponseBuilder.generateGetResponse(mockedChangeSets[changeSets.length - 2]));
    }
    const followingChangeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().fromId(lastButOneId));
    chai.expect(followingChangeSets.length).to.be.equal(1);
  });

  it.skip("should download Checkpoint", async () => {
    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().selectDownloadUrl());
    const id: string = changeSets[1].id!;
    const checkpoints1 = await iModelClient.checkpoints.get(requestContext, imodelId, new CheckpointQuery().precedingCheckpoint(id));
    chai.assert(checkpoints1);
    const checkpoints2 = await iModelClient.checkpoints.get(requestContext, imodelId, new CheckpointQuery().nearestCheckpoint(id).selectDownloadUrl());
    chai.assert(checkpoints2);
    await iModelClient.checkpoints.download(requestContext, checkpoints2[0], path.join(utils.workDir, checkpoints2[0].fileName!));
  });

  it("should download ChangeSets", async () => {
    utils.mockGetChangeSet(imodelId, true, undefined, utils.generateChangeSet(), utils.generateChangeSet());
    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().selectDownloadUrl());

    const downloadChangeSetsToPath: string = path.join(utils.workDir, imodelId.toString());

    utils.mockFileResponse(2);
    const progressTracker = new utils.ProgressTracker();
    await iModelClient.changeSets.download(requestContext, changeSets, downloadChangeSetsToPath, progressTracker.track());
    fs.existsSync(downloadChangeSetsToPath).should.be.equal(true);
    progressTracker.check();
    for (const changeSet of changeSets) {
      const fileName: string = changeSet.fileName!;
      const downloadedPathname: string = path.join(downloadChangeSetsToPath, fileName);

      fs.existsSync(downloadedPathname).should.be.equal(true);
    }
  });

  it("should download ChangeSets with Buffering", async () => {
    iModelClient.setFileHandler(new AzureFileHandler(true));
    utils.mockGetChangeSet(imodelId, true, undefined, utils.generateChangeSet(), utils.generateChangeSet());
    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().selectDownloadUrl());

    const downloadChangeSetsToPath: string = path.join(utils.workDir, imodelId.toString());

    utils.mockFileResponse(2);
    const progressTracker = new utils.ProgressTracker();
    await iModelClient.changeSets.download(requestContext, changeSets, downloadChangeSetsToPath, progressTracker.track());
    fs.existsSync(downloadChangeSetsToPath).should.be.equal(true);
    progressTracker.check();
    for (const changeSet of changeSets) {
      const fileName: string = changeSet.fileName!;
      const downloadedPathname: string = path.join(downloadChangeSetsToPath, fileName);

      fs.existsSync(downloadedPathname).should.be.equal(true);
    }

    iModelClient.setFileHandler(new AzureFileHandler());
  });

  it("should get ChangeSets skipping the first one", async () => {
    const mockChangeSets = utils.getMockChangeSets(briefcase);
    utils.mockGetChangeSet(imodelId, false, "?$skip=1", mockChangeSets[2]);
    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().skip(1));
    chai.assert(changeSets);
    chai.expect(parseInt(changeSets[0].index!, 10)).to.be.greaterThan(1);
  });

  it("should get latest ChangeSets", async () => {
    const mockChangeSets = utils.getMockChangeSets(briefcase);
    utils.mockGetChangeSet(imodelId, false, "?$orderby=Index+desc&$top=2", mockChangeSets[2], mockChangeSets[1]);
    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().latest().top(2));
    chai.assert(changeSets);
    chai.expect(changeSets.length).to.be.equal(2);
    chai.expect(parseInt(changeSets[0].index!, 10)).to.be.greaterThan(parseInt(changeSets[1].index!, 10));
    utils.mockGetChangeSet(imodelId, false, "?$orderby=Index+desc&$top=2", mockChangeSets[2], mockChangeSets[1]);

    const changeSets2: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().orderBy("Index+desc").top(2));
    chai.assert(changeSets);
    chai.expect(changeSets).to.be.deep.equal(changeSets2);
  });

  it("should fail getting a ChangeSet by invalid id", async () => {
    let error: IModelHubClientError | undefined;
    try {
      await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().byId("InvalidId"));
    } catch (err) {
      if (err instanceof IModelHubClientError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.errorNumber).to.be.equal(IModelHubStatus.InvalidArgumentError);
  });

  it("should fail downloading ChangeSets with no file handler", async () => {
    const mockChangeSets = utils.getMockChangeSets(briefcase);
    utils.mockGetChangeSet(imodelId, false, "?$orderby=Index+desc&$top=1", mockChangeSets[2]);
    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().latest().top(1));

    let error: IModelHubClientError | undefined;
    const invalidClient = new IModelHubClient();
    try {
      await invalidClient.changeSets.download(requestContext, changeSets, utils.workDir);
    } catch (err) {
      if (err instanceof IModelHubClientError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.errorNumber).to.be.equal(IModelHubStatus.FileHandlerNotSet);
  });

  it("should fail downloading ChangeSets with no file url", async () => {
    let error: IModelHubClientError | undefined;
    try {
      await iModelClient.changeSets.download(requestContext, [new ChangeSet()], utils.workDir);
    } catch (err) {
      if (err instanceof IModelHubClientError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.errorNumber).to.be.equal(IModelHubStatus.MissingDownloadUrlError);
  });

  it("should fail creating a ChangeSet with no file handler", async () => {
    let error: IModelHubClientError | undefined;
    const invalidClient = new IModelHubClient();
    try {
      await invalidClient.changeSets.create(requestContext, imodelId, new ChangeSet(), utils.workDir);
    } catch (err) {
      if (err instanceof IModelHubClientError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.errorNumber).to.be.equal(IModelHubStatus.FileHandlerNotSet);
  });

  it("should fail creating a ChangeSet with no file", async () => {
    let error: IModelHubClientError | undefined;
    try {
      await iModelClient.changeSets.create(requestContext, imodelId, new ChangeSet(), utils.workDir + "InvalidChangeSet.cs");
    } catch (err) {
      if (err instanceof IModelHubClientError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.errorNumber).to.be.equal(IModelHubStatus.FileNotFound);
  });

  it("should fail creating a ChangeSet with directory path", async () => {
    let error: IModelHubClientError | undefined;
    try {
      await iModelClient.changeSets.create(requestContext, imodelId, new ChangeSet(), utils.workDir);
    } catch (err) {
      if (err instanceof IModelHubClientError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.errorNumber).to.be.equal(IModelHubStatus.FileNotFound);
  });

  it("should query between changesets", async function (this: Mocha.ITestCallbackContext) {
    if (TestConfig.enableMocks) {
      const mockedChangeSets = utils.getMockChangeSets(briefcase).slice(0, 3);
      utils.mockGetChangeSet(imodelId, true, undefined, ...mockedChangeSets);

      let filter = `(${cumulativeChangeSetBackwardChangeSetId}+eq+%27${mockedChangeSets[0].id}%27`;
      filter += `+and+${followingChangesetBackwardChangesetId}+eq+%27${mockedChangeSets[2].id}%27)`;
      filter += `+or+(${cumulativeChangeSetBackwardChangeSetId}+eq+%27${mockedChangeSets[2].id}%27`;
      filter += `+and+${followingChangesetBackwardChangesetId}+eq+%27${mockedChangeSets[0].id}%27)`;

      const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "ChangeSet",
        `?$filter=${filter}`);
      ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Get, requestPath,
        ResponseBuilder.generateGetArrayResponse([mockedChangeSets[1], mockedChangeSets[2]]));
    }
    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().selectDownloadUrl());
    chai.expect(changeSets.length).to.be.greaterThan(2);

    const selectedChangeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId,
      new ChangeSetQuery().betweenChangeSets(changeSets[0].id!, changeSets[2].id));
    chai.expect(selectedChangeSets.length).to.be.equal(2);
    chai.expect(selectedChangeSets[0].id).to.be.equal(changeSets[1].id);
    chai.expect(selectedChangeSets[0].seedFileId!.toString()).to.be.equal(changeSets[1].seedFileId!.toString());
    chai.expect(selectedChangeSets[1].id).to.be.equal(changeSets[2].id);
    chai.expect(selectedChangeSets[1].seedFileId!.toString()).to.be.equal(changeSets[2].seedFileId!.toString());
  });

  it("should query between changeset", async function (this: Mocha.ITestCallbackContext) {
    if (TestConfig.enableMocks) {
      const mockedChangeSets = utils.getMockChangeSets(briefcase).slice(0, 3);
      utils.mockGetChangeSet(imodelId, true, undefined, ...mockedChangeSets);

      const filter = `${cumulativeChangeSetBackwardChangeSetId}+eq+%27${mockedChangeSets[2].id}%27`;

      const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "ChangeSet",
        `?$filter=${filter}`);
      ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Get, requestPath,
        ResponseBuilder.generateGetArrayResponse([mockedChangeSets[0], mockedChangeSets[1], mockedChangeSets[2]]));
    }
    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().selectDownloadUrl());
    chai.expect(changeSets.length).to.be.greaterThan(2);

    const selectedChangeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId,
      new ChangeSetQuery().betweenChangeSets(changeSets[2].id!));
    chai.expect(selectedChangeSets.length).to.be.equal(3);
    chai.expect(selectedChangeSets[0].id).to.be.equal(changeSets[0].id);
    chai.expect(selectedChangeSets[0].seedFileId!.toString()).to.be.equal(changeSets[0].seedFileId!.toString());
    chai.expect(selectedChangeSets[1].id).to.be.equal(changeSets[1].id);
    chai.expect(selectedChangeSets[1].seedFileId!.toString()).to.be.equal(changeSets[1].seedFileId!.toString());
    chai.expect(selectedChangeSets[2].id).to.be.equal(changeSets[2].id);
    chai.expect(selectedChangeSets[2].seedFileId!.toString()).to.be.equal(changeSets[2].seedFileId!.toString());
  });

  it("should get version changesets", async function (this: Mocha.ITestCallbackContext) {
    if (TestConfig.enableMocks) {
      const mockedVersion = utils.generateVersion();
      utils.mockGetVersions(imodelId, undefined, mockedVersion);

      const mockedChangeSets = utils.getMockChangeSets(briefcase).slice(0, 3);
      utils.mockGetChangeSet(imodelId, true, undefined, ...mockedChangeSets);

      const filter = `${cumulativeChangeSetBackwardVersionId}+eq+%27${mockedVersion.id!}%27`;
      const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "ChangeSet",
        `?$filter=${filter}`);
      ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Get, requestPath,
        ResponseBuilder.generateGetResponse(mockedChangeSets[0]));
    }

    const versions: Version[] = await iModelClient.versions.get(requestContext, imodelId);
    chai.assert(versions);
    chai.expect(versions.length).to.be.greaterThan(0);
    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().selectDownloadUrl());
    chai.expect(changeSets.length).to.be.greaterThan(2);

    const selectedChangeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId,
      new ChangeSetQuery().getVersionChangeSets(versions[versions.length - 1].id!));
    chai.expect(selectedChangeSets.length).to.be.equal(1);
    chai.expect(selectedChangeSets[0].id).to.be.equal(changeSets[0].id);
    chai.expect(selectedChangeSets[0].seedFileId!.toString()).to.be.equal(changeSets[0].seedFileId!.toString());
  });

  it("should get changesets after version", async function (this: Mocha.ITestCallbackContext) {
    if (TestConfig.enableMocks) {
      const mockedVersion = Array(3).fill(0).map(() => utils.generateVersion());
      utils.mockGetVersions(imodelId, undefined, ...mockedVersion);

      const mockedChangeSets = utils.getMockChangeSets(briefcase).slice(0, 3);
      utils.mockGetChangeSet(imodelId, true, undefined, ...mockedChangeSets);

      const filter = `${followingChangeSetBackwardVersionId}+eq+%27${mockedVersion[1].id!}%27`;
      const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "ChangeSet",
        `?$filter=${filter}`);
      ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Get, requestPath,
        ResponseBuilder.generateGetArrayResponse([mockedChangeSets[2], mockedChangeSets[1]]));
    }

    const versions: Version[] = await iModelClient.versions.get(requestContext, imodelId);
    chai.assert(versions);
    chai.expect(versions.length).to.be.greaterThan(1);
    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().selectDownloadUrl());
    chai.expect(changeSets.length).to.be.greaterThan(2);

    const selectedChangeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId,
      new ChangeSetQuery().afterVersion(versions[versions.length - 2].id!));
    chai.expect(selectedChangeSets.length).to.be.greaterThan(1);
    chai.expect(selectedChangeSets[0].id).to.be.equal(changeSets[2].id);
    chai.expect(selectedChangeSets[0].seedFileId!.toString()).to.be.equal(changeSets[2].seedFileId!.toString());
  });

  it("should query changesets between versions", async function (this: Mocha.ITestCallbackContext) {
    if (TestConfig.enableMocks) {
      const mockedVersions = Array(3).fill(0).map(() => utils.generateVersion());
      utils.mockGetVersions(imodelId, undefined, ...mockedVersions);

      const mockedChangeSets = utils.getMockChangeSets(briefcase).slice(0, 3);
      utils.mockGetChangeSet(imodelId, true, undefined, ...mockedChangeSets);

      let filter = `(${followingChangeSetBackwardVersionId}+eq+%27${mockedVersions[0].id!}%27`;
      filter += `+and+${cumulativeChangeSetBackwardVersionId}+eq+%27${mockedVersions[2].id!}%27)`;
      filter += `+or+(${followingChangeSetBackwardVersionId}+eq+%27${mockedVersions[2].id!}%27`;
      filter += `+and+${cumulativeChangeSetBackwardVersionId}+eq+%27${mockedVersions[0].id!}%27)`;

      const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "ChangeSet",
        `?$filter=${filter}`);
      ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Get, requestPath,
        ResponseBuilder.generateGetArrayResponse([mockedChangeSets[1], mockedChangeSets[2]]));
    }

    const versions: Version[] = await iModelClient.versions.get(requestContext, imodelId);
    chai.assert(versions);
    chai.expect(versions.length).to.be.greaterThan(1);
    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().selectDownloadUrl());
    chai.expect(changeSets.length).to.be.greaterThan(2);

    const selectedChangeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId,
      new ChangeSetQuery().betweenVersions(versions[0].id!, versions[2].id!));
    chai.expect(selectedChangeSets.length).to.be.equal(2);
    chai.expect(selectedChangeSets[0].id).to.be.equal(changeSets[1].id);
    chai.expect(selectedChangeSets[0].seedFileId!.toString()).to.be.equal(changeSets[1].seedFileId!.toString());
    chai.expect(selectedChangeSets[1].id).to.be.equal(changeSets[2].id);
    chai.expect(selectedChangeSets[1].seedFileId!.toString()).to.be.equal(changeSets[2].seedFileId!.toString());
  });

  it("should query changesets between version and changeset", async function (this: Mocha.ITestCallbackContext) {
    if (TestConfig.enableMocks) {
      const mockedVersion = utils.generateVersion();
      utils.mockGetVersions(imodelId, undefined, mockedVersion);

      const mockedChangeSets = utils.getMockChangeSets(briefcase).slice(0, 3);
      utils.mockGetChangeSet(imodelId, true, undefined, ...mockedChangeSets);

      let filter = `(${cumulativeChangeSetBackwardVersionId}+eq+%27${mockedVersion.id!}%27+and+`;
      filter += `${followingChangesetBackwardChangesetId}+eq+%27${mockedChangeSets[1].id}%27)`;
      filter += `+or+`;
      filter += `(${followingChangeSetBackwardVersionId}+eq+%27${mockedVersion.id!}%27+and+`;
      filter += `${cumulativeChangeSetBackwardChangeSetId}+eq+%27${mockedChangeSets[1].id}%27)`;

      const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "ChangeSet",
        `?$filter=${filter}`);
      ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Get, requestPath,
        ResponseBuilder.generateGetResponse(mockedChangeSets[1]));
    }

    const versions: Version[] = await iModelClient.versions.get(requestContext, imodelId);
    chai.assert(versions);
    chai.expect(versions.length).to.be.greaterThan(0);
    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().selectDownloadUrl());
    chai.expect(changeSets.length).to.be.greaterThan(2);

    const selectedChangeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId,
      new ChangeSetQuery().betweenVersionAndChangeSet(versions[versions.length - 1].id!, changeSets[1].id!));
    chai.expect(selectedChangeSets.length).to.be.equal(1);
    chai.expect(selectedChangeSets[0].id).to.be.equal(changeSets[1].id);
    chai.expect(selectedChangeSets[0].seedFileId!.toString()).to.be.equal(changeSets[1].seedFileId!.toString());
  });

  it("should query changesets by seed file id", async function (this: Mocha.ITestCallbackContext) {
    if (TestConfig.enableMocks) {
      const mockedChangeSets = utils.getMockChangeSets(briefcase).slice(0, 3);
      utils.mockGetChangeSet(imodelId, true, undefined, ...mockedChangeSets);

      const filter = `SeedFileId+eq+%27${mockedChangeSets[0].seedFileId!}%27`;

      const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "ChangeSet",
        `?$filter=${filter}`);
      ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Get, requestPath,
        ResponseBuilder.generateGetResponse(mockedChangeSets[0]));
    }
    const changeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId, new ChangeSetQuery().selectDownloadUrl());
    chai.expect(changeSets.length).to.be.greaterThan(0);

    const selectedChangeSets: ChangeSet[] = await iModelClient.changeSets.get(requestContext, imodelId,
      new ChangeSetQuery().bySeedFileId(changeSets[0].seedFileId!));
    chai.expect(selectedChangeSets.length).to.be.greaterThan(0);
    selectedChangeSets.forEach((cs: ChangeSet) => {
      chai.expect(cs.seedFileId!.toString()).to.be.equal(changeSets[0].seedFileId!.toString());
    });
  });
});
