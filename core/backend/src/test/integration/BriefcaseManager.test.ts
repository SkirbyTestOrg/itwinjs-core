/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import { IModelJsFs } from "../../IModelJsFs";
import { OpenMode, ActivityLoggingContext, GuidString } from "@bentley/bentleyjs-core";
import { IModelVersion } from "@bentley/imodeljs-common";
import { IModelTestUtils, TestUsers, TestIModelInfo } from "../IModelTestUtils";
import { KeepBriefcase, IModelDb, OpenParams, AccessMode, ExclusiveAccessOption, Element, IModelHost, IModelHostConfiguration, BriefcaseManager, BriefcaseEntry } from "../../imodeljs-backend";
import { AccessToken, BriefcaseQuery, Briefcase as HubBriefcase } from "@bentley/imodeljs-clients";
import { HubUtility } from "./HubUtility";

describe("BriefcaseManager (#integration)", () => {
  let accessToken: AccessToken;
  let managerAccessToken: AccessToken;
  let testProjectId: string;

  let readOnlyTestIModel: TestIModelInfo;
  const readOnlyTestVersions = ["FirstVersion", "SecondVersion", "ThirdVersion"];
  const readOnlyTestElementCounts = [27, 28, 29];

  let readWriteTestIModel: TestIModelInfo;
  let noVersionsTestIModel: TestIModelInfo;

  const actx = new ActivityLoggingContext("");

  const getElementCount = (iModel: IModelDb): number => {
    const rows: any[] = iModel.executeQuery("SELECT COUNT(*) AS cnt FROM bis.Element");
    const count = +(rows[0].cnt);
    return count;
  };

  const validateBriefcaseCache = () => {
    const paths = new Array<string>();
    (BriefcaseManager as any)._cache._briefcases.forEach((briefcase: BriefcaseEntry, key: string) => {
      assert.isTrue(IModelJsFs.existsSync(briefcase.pathname), `File corresponding to briefcase cache entry not found: ${briefcase.pathname}`);
      assert.strictEqual<string>(briefcase.getKey(), key, `Cached key ${key} doesn't match the current generated key ${briefcase.getKey()}`);
      if (briefcase.isOpen) {
        assert.strictEqual<string>(briefcase.nativeDb.getParentChangeSetId(), briefcase.changeSetId, `Parent change set id of Db doesn't match what's cached in memory`);
      }
      assert.isFalse(paths.includes(briefcase.pathname), `Briefcase with path: ${briefcase.pathname} (key: ${key}) has a duplicate in the cache`);
      paths.push(briefcase.pathname);
    });
  };

  before(async () => {
    accessToken = await HubUtility.login(TestUsers.regular);

    testProjectId = await HubUtility.queryProjectIdByName(accessToken, "iModelJsIntegrationTest");
    readOnlyTestIModel = await IModelTestUtils.getTestModelInfo(accessToken, testProjectId, "ReadOnlyTest");
    noVersionsTestIModel = await IModelTestUtils.getTestModelInfo(accessToken, testProjectId, "NoVersionsTest");
    readWriteTestIModel = await IModelTestUtils.getTestModelInfo(accessToken, testProjectId, "ReadWriteTest");

    // Purge briefcases that are close to reaching the acquire limit
    managerAccessToken = await HubUtility.login(TestUsers.manager);
    await HubUtility.purgeAcquiredBriefcases(managerAccessToken, "iModelJsIntegrationTest", "ReadOnlyTest");
    await HubUtility.purgeAcquiredBriefcases(managerAccessToken, "iModelJsIntegrationTest", "NoVersionsTest");
    await HubUtility.purgeAcquiredBriefcases(managerAccessToken, "iModelJsIntegrationTest", "ReadWriteTest");
    await HubUtility.purgeAcquiredBriefcases(managerAccessToken, "iModelJsIntegrationTest", "ConnectionReadTest");
  });

  afterEach(() => {
    validateBriefcaseCache();
  });

  it("should create a valid in memory cache", async () => {
    await (BriefcaseManager as any).initCache(actx, accessToken);
    validateBriefcaseCache();
  });

  it("should open and close an iModel from the Hub", async () => {
    let onOpenCalled: boolean = false;
    const onOpenListener = (accessTokenIn: AccessToken, contextIdIn: string, iModelIdIn: string, openParams: OpenParams, _version: IModelVersion) => {
      onOpenCalled = true;
      assert.deepEqual(accessTokenIn, accessToken);
      assert.equal(contextIdIn, testProjectId);
      assert.equal(iModelIdIn, readOnlyTestIModel.id);
      assert.equal(openParams.openMode, OpenMode.Readonly);
    };
    IModelDb.onOpen.addListener(onOpenListener);

    let onOpenedCalled: boolean = false;
    const onOpenedListener = (iModelDb: IModelDb) => {
      onOpenedCalled = true;
      assert.equal(iModelDb.iModelToken.iModelId, readOnlyTestIModel.id);
    };
    IModelDb.onOpened.addListener(onOpenedListener);

    let onBeforeCloseCalled: boolean = false;
    const onBeforeCloseListener = () => {
      onBeforeCloseCalled = true;
    };

    try {
      const iModel: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.fixedVersion(), IModelVersion.latest());
      assert.exists(iModel, "No iModel returned from call to BriefcaseManager.open");

      iModel.onBeforeClose.addListener(onBeforeCloseListener);

      // Validate that the IModelDb is readonly
      assert(iModel.openParams.openMode === OpenMode.Readonly, "iModel not set to Readonly mode");

      const expectedChangeSetId = await IModelVersion.latest().evaluateChangeSet(actx, accessToken, readOnlyTestIModel.id, BriefcaseManager.imodelClient);
      assert.strictEqual<string>(iModel.briefcase.changeSetId, expectedChangeSetId);
      assert.strictEqual<string>(iModel.iModelToken.changeSetId!, expectedChangeSetId);

      assert.isTrue(onOpenedCalled);
      assert.isTrue(onOpenCalled);

      const pathname = iModel.briefcase.pathname;
      assert.isTrue(IModelJsFs.existsSync(pathname));
      await iModel.close(actx, accessToken, KeepBriefcase.No);
      assert.equal(iModel.briefcase, undefined);
      assert.isFalse(IModelJsFs.existsSync(pathname));
      assert.isTrue(onBeforeCloseCalled);
    } finally {

      IModelDb.onOpen.removeListener(onOpenListener);
      IModelDb.onOpened.removeListener(onOpenedListener);
    }
  });

  it("should reuse briefcases", async () => {
    const iModel1: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.fixedVersion(AccessMode.Shared), IModelVersion.named("FirstVersion"));
    assert.exists(iModel1, "No iModel returned from call to BriefcaseManager.open");

    const iModel2: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.fixedVersion(AccessMode.Shared), IModelVersion.named("FirstVersion"));
    assert.exists(iModel2, "No iModel returned from call to BriefcaseManager.open");
    assert.equal(iModel1, iModel2, "previously open briefcase was expected to be shared");

    const iModel3: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.fixedVersion(AccessMode.Shared), IModelVersion.named("SecondVersion"));
    assert.exists(iModel3, "No iModel returned from call to BriefcaseManager.open");
    assert.notEqual(iModel3, iModel2, "opening two different versions should not cause briefcases to be shared when the older one is open");
    assert.notEqual(iModel3.briefcase, iModel2.briefcase, "opening two different versions should not cause briefcases to be shared when the older one is open");

    const briefcase2 = iModel2.briefcase;
    const pathname2 = briefcase2.pathname;
    await iModel2.close(actx, accessToken);
    assert.equal(iModel2.briefcase, undefined);
    assert.isTrue(IModelJsFs.existsSync(pathname2));

    const briefcase3 = iModel3.briefcase;
    const pathname3 = briefcase3.pathname;
    await iModel3.close(actx, accessToken);
    assert.equal(iModel3.briefcase, undefined);
    assert.isTrue(IModelJsFs.existsSync(pathname3));

    const iModel4: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.fixedVersion(AccessMode.Shared), IModelVersion.named("FirstVersion"));
    assert.exists(iModel4, "No iModel returned from call to BriefcaseManager.open");
    assert.equal(iModel4.briefcase, briefcase2, "previously closed briefcase was expected to be shared");

    const iModel5: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.fixedVersion(AccessMode.Shared), IModelVersion.named("SecondVersion"));
    assert.exists(iModel5, "No iModel returned from call to BriefcaseManager.open");
    assert.equal(iModel5.briefcase, briefcase3, "previously closed briefcase was expected to be shared");

    await iModel4.close(actx, accessToken, KeepBriefcase.No);
    assert.isFalse(IModelJsFs.existsSync(pathname2));

    await iModel5.close(actx, accessToken, KeepBriefcase.No);
    assert.isFalse(IModelJsFs.existsSync(pathname3));
  });

  it("should optionally reuse open briefcases for exclusive access (#integration)", async () => {
    // Note: Compare this with a similar test on the frontend
    const iModel1: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullOnly(AccessMode.Exclusive, ExclusiveAccessOption.TryReuseOpenBriefcase), IModelVersion.latest());
    assert.exists(iModel1, "No iModel returned from call to BriefcaseManager.open");

    const iModel2: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullOnly(AccessMode.Exclusive, ExclusiveAccessOption.TryReuseOpenBriefcase), IModelVersion.latest());
    assert.exists(iModel2, "No iModel returned from call to BriefcaseManager.open");

    const iModel3: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullOnly(AccessMode.Exclusive, ExclusiveAccessOption.CreateNewBriefcase), IModelVersion.latest());
    assert.exists(iModel3, "No iModel returned from call to BriefcaseManager.open");

    assert.equal(iModel1, iModel2);
    assert.notEqual(iModel1.briefcase.pathname, iModel3.briefcase.pathname);

    const iModel4: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullAndPush(ExclusiveAccessOption.TryReuseOpenBriefcase), IModelVersion.latest());
    assert.exists(iModel4, "No iModel returned from call to BriefcaseManager.open");

    const iModel5: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullAndPush(ExclusiveAccessOption.TryReuseOpenBriefcase), IModelVersion.latest());
    assert.exists(iModel5, "No iModel returned from call to BriefcaseManager.open");

    const iModel6: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullAndPush(ExclusiveAccessOption.CreateNewBriefcase), IModelVersion.latest());
    assert.exists(iModel6, "No iModel returned from call to BriefcaseManager.open");

    assert.equal(iModel4, iModel5);
    assert.notEqual(iModel4.briefcase.pathname, iModel6.briefcase.pathname);

    await iModel1.close(actx, accessToken, KeepBriefcase.No);
    await iModel3.close(actx, accessToken, KeepBriefcase.No);
    await iModel4.close(actx, accessToken, KeepBriefcase.No);
    await iModel6.close(actx, accessToken, KeepBriefcase.No);
  });

  it("should not reuse exclusive read-only briefcases for read-write purposes (#integration)", async () => {
    const iModel1: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullOnly(AccessMode.Exclusive), IModelVersion.latest());
    assert.exists(iModel1, "No iModel returned from call to BriefcaseManager.open");
    const pathname1 = iModel1.briefcase.pathname;
    await iModel1.close(actx, accessToken, KeepBriefcase.Yes);

    const iModel2: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullAndPush(), IModelVersion.latest());
    assert.exists(iModel2, "No iModel returned from call to BriefcaseManager.open");
    assert.notEqual(iModel2.briefcase.pathname, pathname1);
    await iModel2.close(actx, accessToken, KeepBriefcase.No);

    const iModel3: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullOnly(AccessMode.Exclusive), IModelVersion.latest());
    assert.exists(iModel3, "No iModel returned from call to BriefcaseManager.open");
    assert.equal(iModel3.briefcase.pathname, pathname1);
    await iModel3.close(actx, accessToken, KeepBriefcase.No);
  });

  it("should open iModels of specific versions from the Hub", async () => {
    const iModelFirstVersion: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.fixedVersion(), IModelVersion.first());
    assert.exists(iModelFirstVersion);
    assert.strictEqual<string>(iModelFirstVersion.briefcase.currentChangeSetId, "");

    for (const [arrayIndex, versionName] of readOnlyTestVersions.entries()) {
      const iModelFromVersion = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.fixedVersion(), IModelVersion.asOfChangeSet(readOnlyTestIModel.changeSets[arrayIndex + 1].wsgId));
      assert.exists(iModelFromVersion);
      assert.strictEqual<string>(iModelFromVersion.briefcase.currentChangeSetId, readOnlyTestIModel.changeSets[arrayIndex + 1].wsgId);

      const iModelFromChangeSet = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.fixedVersion(), IModelVersion.named(versionName));
      assert.exists(iModelFromChangeSet);
      assert.strictEqual(iModelFromChangeSet, iModelFromVersion);
      assert.strictEqual<string>(iModelFromChangeSet.briefcase.currentChangeSetId, readOnlyTestIModel.changeSets[arrayIndex + 1].wsgId);

      const elementCount = getElementCount(iModelFromVersion);
      assert.equal(elementCount, readOnlyTestElementCounts[arrayIndex], `Count isn't what's expected for ${iModelFromVersion.briefcase.pathname}, version ${versionName}`);

      await iModelFromVersion.close(actx, accessToken, KeepBriefcase.Yes);
    }

    const iModelLatestVersion: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.fixedVersion(), IModelVersion.latest());
    assert.exists(iModelLatestVersion);
    assert.isUndefined(iModelLatestVersion.briefcase.reversedChangeSetId);
    assert.strictEqual<string>(iModelLatestVersion.briefcase.changeSetId, readOnlyTestIModel.changeSets[3].wsgId);
    assert.strictEqual<string>(iModelLatestVersion.briefcase.nativeDb.getParentChangeSetId(), readOnlyTestIModel.changeSets[3].wsgId);
    assert.isNotTrue(!!iModelLatestVersion.briefcase.reversedChangeSetId);

    await iModelFirstVersion.close(actx, accessToken, KeepBriefcase.No);
    await iModelLatestVersion.close(actx, accessToken, KeepBriefcase.No);
  });

  it("should open an iModel with no versions", async () => {
    const iModelNoVer: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, noVersionsTestIModel.id, OpenParams.fixedVersion());
    assert.exists(iModelNoVer);
    assert(iModelNoVer.iModelToken.iModelId && iModelNoVer.iModelToken.iModelId === noVersionsTestIModel.id, "Correct iModel not found");
  });

  it("should be able to pull or reverse changes only if allowed", async () => {
    const secondChangeSetId = readOnlyTestIModel.changeSets[1].wsgId;

    const iModelFixed: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.fixedVersion(AccessMode.Shared), IModelVersion.asOfChangeSet(secondChangeSetId));
    assert.exists(iModelFixed);
    assert.strictEqual<string>(iModelFixed.briefcase.currentChangeSetId, secondChangeSetId);

    const iModelPullOnly: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullOnly(AccessMode.Shared), IModelVersion.asOfChangeSet(secondChangeSetId));
    assert.exists(iModelPullOnly);
    assert.strictEqual<string>(iModelPullOnly.briefcase.currentChangeSetId, secondChangeSetId);

    assert.notStrictEqual<string>(iModelPullOnly.briefcase.pathname, iModelFixed.briefcase.pathname, "pull only and fixed versions should not share the same briefcase");

    const thirdChangeSetId = readOnlyTestIModel.changeSets[2].wsgId;

    await iModelPullOnly.pullAndMergeChanges(actx, accessToken, IModelVersion.asOfChangeSet(thirdChangeSetId));
    assert.strictEqual<string>(iModelPullOnly.briefcase.currentChangeSetId, thirdChangeSetId);

    let exceptionThrown = false;
    try {
      await iModelFixed.pullAndMergeChanges(actx, accessToken, IModelVersion.asOfChangeSet(thirdChangeSetId));
    } catch (error) {
      exceptionThrown = true;
    }
    assert.isTrue(exceptionThrown);
    assert.strictEqual<string>(iModelFixed.briefcase.currentChangeSetId, secondChangeSetId);

    try {
      const firstChangeSetId = readOnlyTestIModel.changeSets[0].wsgId;
      await iModelFixed.reverseChanges(actx, accessToken, IModelVersion.asOfChangeSet(firstChangeSetId));
    } catch (error) {
      exceptionThrown = true;
    }
    assert.isTrue(exceptionThrown);

    await iModelPullOnly.close(actx, accessToken, KeepBriefcase.No);
    await iModelFixed.close(actx, accessToken, KeepBriefcase.No);
  });

  it("should be able to edit and push only if it's allowed (#integration)", async () => {
    const iModelFixed: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readWriteTestIModel.id, OpenParams.fixedVersion(AccessMode.Shared), IModelVersion.latest());
    assert.exists(iModelFixed);

    let rootEl: Element = iModelFixed.elements.getRootSubject();
    rootEl.userLabel = rootEl.userLabel + "changed";
    assert.throws(() => iModelFixed.elements.updateElement(rootEl));

    const iModelPullOnly: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readWriteTestIModel.id, OpenParams.pullOnly(AccessMode.Shared), IModelVersion.latest());
    assert.exists(iModelPullOnly);

    rootEl = iModelPullOnly.elements.getRootSubject();
    rootEl.userLabel = rootEl.userLabel + "changed";
    iModelPullOnly.elements.updateElement(rootEl);
    iModelPullOnly.saveChanges();

    let exceptionThrown = false;
    try {
      await iModelPullOnly.pushChanges(actx, accessToken);
    } catch (error) {
      exceptionThrown = true;
    }
    assert.isTrue(exceptionThrown);

    const iModelPullAndPush: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readWriteTestIModel.id, OpenParams.pullAndPush(), IModelVersion.latest());
    assert.exists(iModelPullAndPush);

    rootEl = iModelPullAndPush.elements.getRootSubject();
    rootEl.userLabel = rootEl.userLabel + "changed";
    iModelPullAndPush.elements.updateElement(rootEl);

    iModelPullAndPush.saveChanges(); // Push is tested out in a separate test

    await iModelFixed.close(actx, accessToken, KeepBriefcase.No);
    await iModelPullOnly.close(actx, accessToken, KeepBriefcase.No);
    await iModelPullAndPush.close(actx, accessToken, KeepBriefcase.No);
  });

  it("should be able to allow exclusive access to iModels (#integration)", async () => {
    const iModelShared: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readWriteTestIModel.id, OpenParams.fixedVersion(AccessMode.Shared), IModelVersion.latest());
    assert.exists(iModelShared);

    const iModelFixed: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readWriteTestIModel.id, OpenParams.fixedVersion(AccessMode.Exclusive, ExclusiveAccessOption.CreateNewBriefcase), IModelVersion.latest());
    assert.exists(iModelFixed);
    assert.notStrictEqual(iModelFixed.briefcase.pathname, iModelShared.briefcase.pathname);

    const iModelFixed2: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readWriteTestIModel.id, OpenParams.fixedVersion(AccessMode.Exclusive, ExclusiveAccessOption.CreateNewBriefcase), IModelVersion.latest());
    assert.exists(iModelFixed);
    assert.notStrictEqual(iModelFixed.briefcase.pathname, iModelFixed2.briefcase.pathname);

    const iModelPullOnly: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readWriteTestIModel.id, OpenParams.pullOnly(AccessMode.Exclusive, ExclusiveAccessOption.CreateNewBriefcase), IModelVersion.latest());
    assert.exists(iModelPullOnly);
    assert.notStrictEqual(iModelPullOnly.briefcase.pathname, iModelShared.briefcase.pathname);
    assert.notStrictEqual(iModelPullOnly.briefcase.pathname, iModelFixed.briefcase.pathname);

    const iModelPullOnly2: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readWriteTestIModel.id, OpenParams.pullOnly(AccessMode.Exclusive, ExclusiveAccessOption.CreateNewBriefcase), IModelVersion.latest());
    assert.exists(iModelPullOnly2);
    assert.notStrictEqual(iModelPullOnly2.briefcase.pathname, iModelPullOnly.briefcase.pathname);

    const iModelPullAndPush: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readWriteTestIModel.id, OpenParams.pullAndPush(), IModelVersion.latest());
    assert.exists(iModelPullAndPush);
    assert.notStrictEqual(iModelPullAndPush.briefcase.pathname, iModelShared.briefcase.pathname);
    assert.notStrictEqual(iModelPullAndPush.briefcase.pathname, iModelFixed.briefcase.pathname);
    assert.notStrictEqual(iModelPullAndPush.briefcase.pathname, iModelPullOnly.briefcase.pathname);

    await iModelShared.close(actx, accessToken, KeepBriefcase.No);
    await iModelFixed.close(actx, accessToken, KeepBriefcase.No);
    await iModelPullOnly.close(actx, accessToken, KeepBriefcase.No);
    await iModelPullAndPush.close(actx, accessToken, KeepBriefcase.No);
  });

  it("should be able to reuse existing briefcases from a previous session (#integration)", async () => {
    let iModelShared: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.fixedVersion(AccessMode.Shared), IModelVersion.latest());
    assert.exists(iModelShared);
    const sharedPathname = iModelShared.briefcase.pathname;

    let iModelExclusive: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullAndPush(), IModelVersion.latest());
    assert.exists(iModelExclusive);
    const exclusivePathname = iModelExclusive.briefcase.pathname;

    await iModelShared.close(actx, accessToken, KeepBriefcase.Yes);
    await iModelExclusive.close(actx, accessToken, KeepBriefcase.Yes);

    IModelHost.shutdown();

    assert.isTrue(IModelJsFs.existsSync(sharedPathname));
    assert.isTrue(IModelJsFs.existsSync(exclusivePathname));

    IModelHost.startup();

    iModelShared = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.fixedVersion(AccessMode.Shared), IModelVersion.latest());
    assert.exists(iModelShared);
    assert.strictEqual<string>(iModelShared.briefcase.pathname, sharedPathname);

    iModelExclusive = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullAndPush(), IModelVersion.latest());
    assert.exists(iModelExclusive);
    assert.strictEqual<string>(iModelExclusive.briefcase.pathname, exclusivePathname);

    await iModelShared.close(actx, accessToken, KeepBriefcase.No);
    await iModelExclusive.close(actx, accessToken, KeepBriefcase.No);
  });

  it("should be able to gracefully error out if a bad cache dir is specified", async () => {
    const config = new IModelHostConfiguration();
    config.briefcaseCacheDir = "\\\\blah\\blah\\blah";
    IModelTestUtils.shutdownBackend();
    IModelHost.startup(config);

    let exceptionThrown = false;
    try {
      const iModelShared: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.fixedVersion(AccessMode.Shared), IModelVersion.latest());
      assert.notExists(iModelShared);
    } catch (error) {
      exceptionThrown = true;
    }
    assert.isTrue(exceptionThrown);

    // Restart the backend to the default configuration
    IModelHost.shutdown();
    IModelTestUtils.startBackend();
  });

  it("should be able to reverse and reinstate changes (#integration)", async () => {
    const iModel: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullOnly(), IModelVersion.latest());

    let arrayIndex: number;
    for (arrayIndex = readOnlyTestVersions.length - 1; arrayIndex >= 0; arrayIndex--) {
      await iModel.reverseChanges(actx, accessToken, IModelVersion.named(readOnlyTestVersions[arrayIndex]));
      assert.equal(readOnlyTestElementCounts[arrayIndex], getElementCount(iModel));
    }

    await iModel.reverseChanges(actx, accessToken, IModelVersion.first());

    for (arrayIndex = 0; arrayIndex < readOnlyTestVersions.length; arrayIndex++) {
      await iModel.reinstateChanges(actx, accessToken, IModelVersion.named(readOnlyTestVersions[arrayIndex]));
      assert.equal(readOnlyTestElementCounts[arrayIndex], getElementCount(iModel));
    }

    await iModel.reinstateChanges(actx, accessToken, IModelVersion.latest());
  });

  const briefcaseExistsOnHub = async (iModelId: GuidString, briefcaseId: number): Promise<boolean> => {
    try {
      const hubBriefcases: HubBriefcase[] = await BriefcaseManager.imodelClient.briefcases.get(actx, accessToken, iModelId, new BriefcaseQuery().byId(briefcaseId));
      return (hubBriefcases.length > 0) ? true : false;
    } catch (e) {
      return false;
    }
  };

  it("should allow purging the cache and delete any acquired briefcases from the hub (#integration)", async () => {
    const iModel1: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullOnly(AccessMode.Exclusive, ExclusiveAccessOption.CreateNewBriefcase), IModelVersion.latest());
    assert.exists(iModel1, "No iModel returned from call to BriefcaseManager.open");

    const iModel2: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullAndPush(ExclusiveAccessOption.CreateNewBriefcase), IModelVersion.latest());
    const briefcaseId2: number = iModel2.briefcase.briefcaseId;
    let exists = await briefcaseExistsOnHub(readOnlyTestIModel.id, briefcaseId2);
    assert.isTrue(exists);

    const iModel3: IModelDb = await IModelDb.open(actx, accessToken, testProjectId, readOnlyTestIModel.id, OpenParams.pullAndPush(ExclusiveAccessOption.CreateNewBriefcase), IModelVersion.latest());
    const briefcaseId3: number = iModel3.briefcase.briefcaseId;
    exists = await briefcaseExistsOnHub(readOnlyTestIModel.id, briefcaseId3);
    assert.isTrue(exists);

    await BriefcaseManager.purgeCache(actx, managerAccessToken);

    exists = await briefcaseExistsOnHub(readOnlyTestIModel.id, briefcaseId2);
    assert.isFalse(exists);

    exists = await briefcaseExistsOnHub(readOnlyTestIModel.id, briefcaseId3);
    assert.isFalse(exists);
  });

});
