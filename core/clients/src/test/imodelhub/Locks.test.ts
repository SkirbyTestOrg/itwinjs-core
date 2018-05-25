/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import * as chai from "chai";

import { AccessToken } from "../../";
import {
  IModelHubClient, Lock, Briefcase, ChangeSet, LockType, LockLevel, LockQuery,
  AggregateResponseError, ConflictingLocksError,
  IModelHubRequestError, IModelHubRequestErrorId,
} from "../../";

import { TestConfig } from "../TestConfig";
import { ResponseBuilder, RequestType, ScopeType } from "../ResponseBuilder";
import * as utils from "./TestUtils";

chai.should();

function mockDeleteAllLocks(imodelId: string, briefcaseId: number) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = utils.createRequestUrl(ScopeType.iModel, imodelId, "Lock", `DeleteAll-${briefcaseId}`);
  ResponseBuilder.mockResponse(utils.defaultUrl, RequestType.Delete, requestPath);
}

describe("iModelHubClient LockHandler", () => {
  let accessToken: AccessToken;
  let iModelId: string;
  const imodelName = "imodeljs-clients Locks test";
  const imodelHubClient: IModelHubClient = utils.getDefaultClient();
  let briefcases: Briefcase[];
  let changeSet: ChangeSet;
  let lastObjectId: string;
  const conflictStrategyOption = { CustomOptions: { ConflictStrategy: "Continue" } };

  before(async function (this: Mocha.IHookCallbackContext) {
    accessToken = await utils.login();
    // Doesn't create an imodel right now, but should in the future
    await utils.createIModel(accessToken, imodelName, undefined, true);
    iModelId = await utils.getIModelId(accessToken, imodelName);
    briefcases = (await utils.getBriefcases(accessToken, iModelId, 2));
    lastObjectId = await utils.getLastLockObjectId(accessToken, iModelId);
    changeSet = (await utils.createChangeSets(accessToken, iModelId, briefcases[0]))[0];
    if (changeSet === undefined) {
      changeSet = (await imodelHubClient.ChangeSets().get(accessToken, iModelId))[0];
    }

    // make sure there exists at least two locks
    if ((!TestConfig.enableMocks) && lastObjectId === "0x0") {
      lastObjectId = utils.incrementLockObjectId(lastObjectId);
      await imodelHubClient.Locks().update(accessToken, iModelId,
        [utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId, LockType.Model, LockLevel.Shared, briefcases[0].fileId,
          changeSet.id, changeSet.index)]);

      lastObjectId = utils.incrementLockObjectId(lastObjectId);
      await imodelHubClient.Locks().update(accessToken, iModelId,
        [utils.generateLock(false, briefcases[1].briefcaseId!, lastObjectId, LockType.Model, LockLevel.Shared, briefcases[1].fileId)]);
    }
  });

  afterEach(() => {
    ResponseBuilder.clearMocks();
  });

  it("should acquire one Lock", async function (this: Mocha.ITestCallbackContext) {
    lastObjectId = utils.incrementLockObjectId(lastObjectId);
    const generatedLock = utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId, 1, 1, briefcases[0].fileId);
    utils.mockUpdateLocks(iModelId, [generatedLock]);
    const lock = (await imodelHubClient.Locks().update(accessToken, iModelId, [generatedLock]))[0];

    chai.assert(lock);
    chai.expect(lock.briefcaseId).equal(briefcases[0].briefcaseId);
    chai.expect(lock.lockLevel).equal(generatedLock.lockLevel);
    chai.expect(lock.lockType).equal(generatedLock.lockType);
  });

  it("should acquire multiple Locks", async function (this: Mocha.ITestCallbackContext) {
    lastObjectId = utils.incrementLockObjectId(lastObjectId);
    const generatedLock1 = utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId, 1, 1, briefcases[0].fileId);
    lastObjectId = utils.incrementLockObjectId(lastObjectId);
    const generatedLock2 = utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId, 1, 1, briefcases[0].fileId);

    utils.mockUpdateLocks(iModelId, [generatedLock1, generatedLock2]);
    const locks = (await imodelHubClient.Locks().update(accessToken, iModelId, [generatedLock1, generatedLock2]));

    chai.assert(locks);
    chai.expect(locks.length).to.be.equal(2);
  });

  it("should update Lock multiple times", async function (this: Mocha.ITestCallbackContext) {
    utils.mockGetLocks(iModelId, undefined,
      utils.generateLock(false, briefcases[0].briefcaseId, undefined, LockType.Model, LockLevel.Shared));
    let lock: Lock = (await imodelHubClient.Locks().get(accessToken, iModelId))[0];
    chai.assert(lock);

    lock.seedFileId = briefcases[0].fileId!;
    lock.lockLevel = LockLevel.None;
    utils.mockUpdateLocks(iModelId, [lock]);
    lock = (await imodelHubClient.Locks().update(accessToken, iModelId, [lock]))[0];
    chai.assert(lock);
    chai.expect(lock.lockLevel).equals(LockLevel.None);

    lock.seedFileId = briefcases[0].fileId!;
    lock.lockLevel = LockLevel.Shared;
    utils.mockUpdateLocks(iModelId, [lock]);
    lock = (await imodelHubClient.Locks().update(accessToken, iModelId, [lock]))[0];
    chai.assert(lock);
    chai.expect(lock.lockLevel).equals(LockLevel.Shared);
  });

  it("should get information on Locks", async function (this: Mocha.ITestCallbackContext) {

    utils.mockGetLocks(iModelId, undefined, ResponseBuilder.generateObject<Lock>(Lock));
    // Needs to acquire before expecting more than 0.
    const locks: Lock[] = await imodelHubClient.Locks().get(accessToken, iModelId);
    chai.expect(locks.length).to.be.greaterThan(0);
  });

  it("should get locks by briefcaseId", async () => {
    const filter = `?$filter=BriefcaseId+eq+${briefcases[0].briefcaseId}`;
    utils.mockGetLocks(iModelId, filter, utils.generateLock(false, briefcases[0].briefcaseId));

    const query = new LockQuery().byBriefcaseId(briefcases[0].briefcaseId!);
    const locks = await imodelHubClient.Locks().get(accessToken, iModelId, query);
    chai.assert(locks);
    chai.expect(locks).length.to.be.greaterThan(0);
    locks.forEach((lock) => chai.expect(lock.briefcaseId).to.be.equal(briefcases[0].briefcaseId));
  });

  it("should get lock by objectId", async () => {
    const objectId = "0x1";
    const filter = `?$filter=ObjectId+eq+%27${objectId}%27`;
    utils.mockGetLocks(iModelId, filter, utils.generateLock(false, undefined, objectId));

    const query = new LockQuery().byObjectId(objectId);
    const locks = await imodelHubClient.Locks().get(accessToken, iModelId, query);
    chai.assert(locks);
    chai.expect(locks).length.to.be.greaterThan(0);
    locks.forEach((lock) => chai.expect(lock.objectId).to.be.equal(objectId));
  });

  it("should get locks by releasedWithChangeset", async () => {
    const filter = `?$filter=ReleasedWithChangeSet+eq+%27${changeSet.id}%27`;
    utils.mockGetLocks(iModelId, filter, utils.generateLock(false, briefcases[0].briefcaseId,
      undefined, undefined, undefined, undefined, changeSet.id));

    const query = new LockQuery().byReleasedWithChangeSet(changeSet.id!);
    const locks = await imodelHubClient.Locks().get(accessToken, iModelId, query);
    chai.assert(locks);
    chai.expect(locks).length.to.be.greaterThan(0);
    locks.forEach((lock) => chai.expect(lock.releasedWithChangeSet).to.be.equal(changeSet.id));
  });

  it("should get locks by releasedWithChangeSetIndex", async () => {
    const filter = `?$filter=ReleasedWithChangeSetIndex+eq+${changeSet.index}`;
    utils.mockGetLocks(iModelId, filter, utils.generateLock(false, briefcases[0].briefcaseId,
      undefined, undefined, undefined, undefined, undefined, changeSet.index));

    const query = new LockQuery().byReleasedWithChangeSetIndex(changeSet.index!);
    const locks = await imodelHubClient.Locks().get(accessToken, iModelId, query);
    chai.assert(locks);
    chai.expect(locks).length.to.be.greaterThan(0);
    locks.forEach((lock) => chai.expect(lock.releasedWithChangeSetIndex).to.be.equal(changeSet.index));
  });

  it("should get locks by lock level and lock type", async () => {
    const filter = `?$filter=LockLevel+eq+${LockLevel.Shared}+and+LockType+eq+${LockType.Model}`;
    utils.mockGetLocks(iModelId, filter, utils.generateLock(false, briefcases[0].briefcaseId));

    const query = new LockQuery().byLockLevel(LockLevel.Shared).byLockType(LockType.Model);
    const locks = await imodelHubClient.Locks().get(accessToken, iModelId, query);
    chai.assert(locks);
    chai.expect(locks).length.to.be.greaterThan(0);
    locks.forEach((lock) => {
      chai.expect(lock.lockLevel).to.be.equal(LockLevel.Shared);
      chai.expect(lock.lockType).to.be.equal(LockType.Model);
    });
  });

  it("should get locks by instance ids", async () => {
    const mockedLocks = [utils.generateLock(true, briefcases[0].briefcaseId, undefined, LockType.Model, LockLevel.Shared),
    utils.generateLock(true, briefcases[1].briefcaseId, undefined, LockType.Model, LockLevel.Shared)];
    utils.mockGetLocks(iModelId, undefined, ...mockedLocks);

    let existingLocks = await imodelHubClient.Locks().get(accessToken, iModelId);
    existingLocks = existingLocks.slice(0, 2);

    let filter = `?$filter=$id+in+[%27${mockedLocks[0].lockType}-${mockedLocks[0].objectId}-${mockedLocks[0].briefcaseId!}%27,`;
    filter += `%27${mockedLocks[1].lockType}-${mockedLocks[1].objectId}-${mockedLocks[1].briefcaseId!}%27]`;
    utils.mockGetLocks(iModelId, filter, ...mockedLocks);

    const query = new LockQuery().byLocks(existingLocks);
    const locks = await imodelHubClient.Locks().get(accessToken, iModelId, query);
    chai.assert(locks);
    chai.expect(locks.length).to.be.greaterThan(0);
    chai.expect(locks).to.be.deep.equal(existingLocks);
  });

  it("should fail on conflicting locks", async () => {
    const lock1 = utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId = utils.incrementLockObjectId(lastObjectId), 1, 2, briefcases[0].fileId);
    const lock2 = utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId = utils.incrementLockObjectId(lastObjectId), 1, 2, briefcases[0].fileId);
    const lock3 = utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId = utils.incrementLockObjectId(lastObjectId), 1, 2, briefcases[0].fileId);
    const lock4 = utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId = utils.incrementLockObjectId(lastObjectId), 1, 2, briefcases[0].fileId);

    utils.mockUpdateLocks(iModelId, [lock1, lock2, lock3]);

    const result = await imodelHubClient.Locks().update(accessToken, iModelId, [lock1, lock2, lock3]);
    chai.assert(result);
    chai.expect(result.length).to.be.equal(3);

    lock2.briefcaseId = briefcases[1].briefcaseId;
    lock3.briefcaseId = briefcases[1].briefcaseId;
    lock4.briefcaseId = briefcases[1].briefcaseId;

    utils.mockDeniedLocks(iModelId, [lock2]);
    utils.mockDeniedLocks(iModelId, [lock3]);
    utils.mockUpdateLocks(iModelId, [lock4]);

    let receivedError: Error | undefined;
    try {
      await imodelHubClient.Locks().update(accessToken, iModelId, [lock2, lock3, lock4],
        { deniedLocks: false, locksPerRequest: 1 });
    } catch (error) {
      receivedError = error;
    }

    chai.assert(receivedError);
    chai.expect(receivedError).to.be.instanceof(AggregateResponseError);
  });

  it("should fail updating and return conflicting lock", async () => {
    const lock1 = utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId = utils.incrementLockObjectId(lastObjectId), 1, 2, briefcases[0].fileId);
    const lock2 = utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId = utils.incrementLockObjectId(lastObjectId), 1, 2, briefcases[0].fileId);
    const lock3 = utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId = utils.incrementLockObjectId(lastObjectId), 1, 2, briefcases[0].fileId);

    utils.mockUpdateLocks(iModelId, [lock1, lock2, lock3]);

    const result = await imodelHubClient.Locks().update(accessToken, iModelId, [lock1, lock2, lock3]);
    chai.assert(result);
    chai.expect(result.length).to.be.equal(3);

    lock2.briefcaseId = briefcases[1].briefcaseId;
    lock3.briefcaseId = briefcases[1].briefcaseId;

    utils.mockDeniedLocks(iModelId, [lock2]);
    utils.mockDeniedLocks(iModelId, [lock3]);

    let receivedError: ConflictingLocksError | undefined;
    try {
      await imodelHubClient.Locks().update(accessToken, iModelId, [lock2, lock3],
        { deniedLocks: true, locksPerRequest: 1 });
    } catch (error) {
      chai.expect(error).to.be.instanceof(ConflictingLocksError);
      receivedError = error;
    }
    chai.assert(receivedError);
    chai.assert(receivedError!.conflictingLocks);
    chai.expect(receivedError!.conflictingLocks!.length).to.be.equal(1);
    chai.expect(receivedError!.conflictingLocks![0].lockLevel).to.be.equal(lock2.lockLevel);
    chai.expect(receivedError!.conflictingLocks![0].lockType).to.be.equal(lock2.lockType);
  });

  it("should return conflicting locks", async () => {
    const lock1 = utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId = utils.incrementLockObjectId(lastObjectId), 1, 2, briefcases[0].fileId);
    const lock2 = utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId = utils.incrementLockObjectId(lastObjectId), 1, 2, briefcases[0].fileId);
    const lock3 = utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId = utils.incrementLockObjectId(lastObjectId), 1, 2, briefcases[0].fileId);
    const lock4 = utils.generateLock(false, briefcases[0].briefcaseId!, lastObjectId = utils.incrementLockObjectId(lastObjectId), 1, 2, briefcases[0].fileId);

    utils.mockUpdateLocks(iModelId, [lock1, lock2, lock3]);

    const result = await imodelHubClient.Locks().update(accessToken, iModelId, [lock1, lock2, lock3]);
    chai.assert(result);
    chai.expect(result.length).to.be.equal(3);

    lock2.briefcaseId = briefcases[1].briefcaseId;
    lock3.briefcaseId = briefcases[1].briefcaseId;
    lock4.briefcaseId = briefcases[1].briefcaseId;

    utils.mockDeniedLocks(iModelId, [lock2], conflictStrategyOption);
    utils.mockDeniedLocks(iModelId, [lock3], conflictStrategyOption);
    utils.mockUpdateLocks(iModelId, [lock4], conflictStrategyOption);

    let receivedError: ConflictingLocksError | undefined;
    try {
      await imodelHubClient.Locks().update(accessToken, iModelId, [lock2, lock3, lock4],
        { deniedLocks: true, locksPerRequest: 1, continueOnConflict: true });
    } catch (error) {
      chai.expect(error).to.be.instanceof(ConflictingLocksError);
      receivedError = error;
    }
    chai.assert(receivedError);
    chai.assert(receivedError!.conflictingLocks);
    chai.expect(receivedError!.conflictingLocks!.length).to.be.equal(2);
    chai.expect(receivedError!.conflictingLocks![0].lockLevel).to.be.equal(lock2.lockLevel);
    chai.expect(receivedError!.conflictingLocks![0].lockType).to.be.equal(lock2.lockType);
    chai.expect(receivedError!.conflictingLocks![1].lockLevel).to.be.equal(lock3.lockLevel);
    chai.expect(receivedError!.conflictingLocks![1].lockType).to.be.equal(lock3.lockType);
  });

  it("should delete all locks", async () => {
    for (const briefcase of briefcases) {
      mockDeleteAllLocks(iModelId, briefcase.briefcaseId!);
      await imodelHubClient.Locks().deleteAll(accessToken, iModelId, briefcase.briefcaseId!);
    }
  });

  it("should not create a query by locks with empty array", () => {
    let error: IModelHubRequestError | undefined;
    try {
      new LockQuery().byLocks([]);
    } catch (err) {
      if (err instanceof IModelHubRequestError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.id!).to.be.equal(IModelHubRequestErrorId.InvalidArgumentError);
  });

  it("should not create a query by locks with no object id", () => {
    let error: IModelHubRequestError | undefined;
    try {
      const lock = new Lock();
      lock.briefcaseId = 0; lock.lockType = LockType.Model;
      new LockQuery().byLocks([lock]);
    } catch (err) {
      if (err instanceof IModelHubRequestError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.id!).to.be.equal(IModelHubRequestErrorId.InvalidArgumentError);
  });

  it("should fail deleting all locks with invalid briefcase id", async () => {
    let error: IModelHubRequestError | undefined;
    try {
      await imodelHubClient.Locks().deleteAll(accessToken, iModelId, 0);
    } catch (err) {
      if (err instanceof IModelHubRequestError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.id!).to.be.equal(IModelHubRequestErrorId.InvalidArgumentError);
  });
});
