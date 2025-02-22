/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { join } from "path";
import * as semver from "semver";
import {
  BisCoreSchema, BriefcaseDb, BriefcaseManager, deleteElementTree, ECSqlStatement, Element, ElementOwnsChildElements, ElementRefersToElements,
  ExternalSourceAspect, GenericSchema, HubMock, IModelDb, IModelHost, IModelJsFs, IModelJsNative, ModelSelector, NativeLoggerCategory, PhysicalModel,
  PhysicalObject, PhysicalPartition, SnapshotDb, SpatialCategory, Subject,
} from "@itwin/core-backend";

import * as BackendTestUtils from "@itwin/core-backend/lib/cjs/test";
import { AccessToken, DbResult, Guid, GuidString, Id64, Id64String, Logger, LogLevel } from "@itwin/core-bentley";
import { Code, ColorDef, ElementProps, IModel, IModelVersion, PhysicalElementProps, SubCategoryAppearance } from "@itwin/core-common";
import { Point3d, YawPitchRollAngles } from "@itwin/core-geometry";
import { IModelExporter, IModelImporter, IModelTransformer, TransformerLoggerCategory } from "../../core-transformer";
import {
  CountingIModelImporter, HubWrappers, IModelToTextFileExporter, IModelTransformerTestUtils, TestIModelTransformer,
  TransformerExtensiveTestScenario as TransformerExtensiveTestScenario,
} from "../IModelTransformerUtils";
import { KnownTestLocations } from "../KnownTestLocations";

import "./TransformerTestStartup"; // calls startup/shutdown IModelHost before/after all tests

describe("IModelTransformerHub", () => {
  const outputDir = join(KnownTestLocations.outputDir, "IModelTransformerHub");
  let iTwinId: GuidString;
  let accessToken: AccessToken;

  before(async () => {
    HubMock.startup("IModelTransformerHub", KnownTestLocations.outputDir);
    iTwinId = HubMock.iTwinId;
    IModelJsFs.recursiveMkDirSync(outputDir);

    accessToken = await HubWrappers.getAccessToken(BackendTestUtils.TestUserType.Regular);

    // initialize logging
    if (process.env.TRANSFORMER_TESTS_USE_LOG) {
      Logger.initializeToConsole();
      Logger.setLevelDefault(LogLevel.Error);
      Logger.setLevel(TransformerLoggerCategory.IModelExporter, LogLevel.Trace);
      Logger.setLevel(TransformerLoggerCategory.IModelImporter, LogLevel.Trace);
      Logger.setLevel(TransformerLoggerCategory.IModelTransformer, LogLevel.Trace);
      Logger.setLevel(NativeLoggerCategory.Changeset, LogLevel.Trace);
    }
  });
  after(() => HubMock.shutdown());

  it("Transform source iModel to target iModel", async () => {
    // Create and push seed of source IModel
    const sourceIModelName = "TransformerSource";
    const sourceSeedFileName = join(outputDir, `${sourceIModelName}.bim`);
    if (IModelJsFs.existsSync(sourceSeedFileName))
      IModelJsFs.removeSync(sourceSeedFileName);

    const sourceSeedDb = SnapshotDb.createEmpty(sourceSeedFileName, { rootSubject: { name: "TransformerSource" } });
    assert.isTrue(IModelJsFs.existsSync(sourceSeedFileName));
    await BackendTestUtils.ExtensiveTestScenario.prepareDb(sourceSeedDb);
    sourceSeedDb.saveChanges();
    sourceSeedDb.close();

    const sourceIModelId = await IModelHost.hubAccess.createNewIModel({ iTwinId, iModelName: sourceIModelName, description: "source", version0: sourceSeedFileName, noLocks: true });

    // Create and push seed of target IModel
    const targetIModelName = "TransformerTarget";
    const targetSeedFileName = join(outputDir, `${targetIModelName}.bim`);
    if (IModelJsFs.existsSync(targetSeedFileName)) {
      IModelJsFs.removeSync(targetSeedFileName);
    }
    const targetSeedDb = SnapshotDb.createEmpty(targetSeedFileName, { rootSubject: { name: "TransformerTarget" } });
    assert.isTrue(IModelJsFs.existsSync(targetSeedFileName));
    await TransformerExtensiveTestScenario.prepareTargetDb(targetSeedDb);
    assert.isTrue(targetSeedDb.codeSpecs.hasName("TargetCodeSpec")); // inserted by prepareTargetDb
    targetSeedDb.saveChanges();
    targetSeedDb.close();
    const targetIModelId = await IModelHost.hubAccess.createNewIModel({ iTwinId, iModelName: targetIModelName, description: "target", version0: targetSeedFileName, noLocks: true });

    try {
      const sourceDb = await HubWrappers.downloadAndOpenBriefcase({ accessToken, iTwinId, iModelId: sourceIModelId });
      const targetDb = await HubWrappers.downloadAndOpenBriefcase({ accessToken, iTwinId, iModelId: targetIModelId });
      assert.isTrue(sourceDb.isBriefcaseDb());
      assert.isTrue(targetDb.isBriefcaseDb());
      assert.isFalse(sourceDb.isSnapshot);
      assert.isFalse(targetDb.isSnapshot);
      assert.isTrue(targetDb.codeSpecs.hasName("TargetCodeSpec")); // make sure prepareTargetDb changes were saved and pushed to iModelHub

      if (true) { // initial import
        BackendTestUtils.ExtensiveTestScenario.populateDb(sourceDb);
        sourceDb.saveChanges();
        await sourceDb.pushChanges({ accessToken, description: "Populate source" });

        // Use IModelExporter.exportChanges to verify the changes to the sourceDb
        const sourceExportFileName: string = IModelTransformerTestUtils.prepareOutputFile("IModelTransformer", "TransformerSource-ExportChanges-1.txt");
        assert.isFalse(IModelJsFs.existsSync(sourceExportFileName));
        const sourceExporter = new IModelToTextFileExporter(sourceDb, sourceExportFileName);
        await sourceExporter.exportChanges(accessToken);
        assert.isTrue(IModelJsFs.existsSync(sourceExportFileName));
        const sourceDbChanges: any = (sourceExporter.exporter as any)._sourceDbChanges; // access private member for testing purposes
        assert.exists(sourceDbChanges);
        // expect inserts and 1 update from populateSourceDb
        assert.isAtLeast(sourceDbChanges.codeSpec.insertIds.size, 1);
        assert.isAtLeast(sourceDbChanges.element.insertIds.size, 1);
        assert.isAtLeast(sourceDbChanges.aspect.insertIds.size, 1);
        assert.isAtLeast(sourceDbChanges.model.insertIds.size, 1);
        assert.equal(sourceDbChanges.model.updateIds.size, 1, "Expect the RepositoryModel to be updated");
        assert.isTrue(sourceDbChanges.model.updateIds.has(IModel.repositoryModelId));
        assert.isAtLeast(sourceDbChanges.relationship.insertIds.size, 1);
        // expect no other updates nor deletes from populateSourceDb
        assert.equal(sourceDbChanges.codeSpec.updateIds.size, 0);
        assert.equal(sourceDbChanges.codeSpec.deleteIds.size, 0);
        assert.equal(sourceDbChanges.element.updateIds.size, 0);
        assert.equal(sourceDbChanges.element.deleteIds.size, 0);
        assert.equal(sourceDbChanges.aspect.updateIds.size, 0);
        assert.equal(sourceDbChanges.aspect.deleteIds.size, 0);
        assert.equal(sourceDbChanges.model.deleteIds.size, 0);
        assert.equal(sourceDbChanges.relationship.updateIds.size, 0);
        assert.equal(sourceDbChanges.relationship.deleteIds.size, 0);

        const transformer = new TestIModelTransformer(sourceDb, targetDb);
        await transformer.processChanges(accessToken);
        transformer.dispose();
        targetDb.saveChanges();
        await targetDb.pushChanges({ accessToken, description: "Import #1" });
        TransformerExtensiveTestScenario.assertTargetDbContents(sourceDb, targetDb);

        // Use IModelExporter.exportChanges to verify the changes to the targetDb
        const targetExportFileName: string = IModelTransformerTestUtils.prepareOutputFile("IModelTransformer", "TransformerTarget-ExportChanges-1.txt");
        assert.isFalse(IModelJsFs.existsSync(targetExportFileName));
        const targetExporter = new IModelToTextFileExporter(targetDb, targetExportFileName);
        await targetExporter.exportChanges(accessToken);
        assert.isTrue(IModelJsFs.existsSync(targetExportFileName));
        const targetDbChanges: any = (targetExporter.exporter as any)._sourceDbChanges; // access private member for testing purposes
        assert.exists(targetDbChanges);
        // expect inserts and a few updates from transforming the result of populateSourceDb
        assert.isAtLeast(targetDbChanges.codeSpec.insertIds.size, 1);
        assert.isAtLeast(targetDbChanges.element.insertIds.size, 1);
        assert.isAtMost(targetDbChanges.element.updateIds.size, 1, "Expect the root Subject to be updated");
        assert.isAtLeast(targetDbChanges.aspect.insertIds.size, 1);
        assert.isAtLeast(targetDbChanges.model.insertIds.size, 1);
        assert.isAtMost(targetDbChanges.model.updateIds.size, 1, "Expect the RepositoryModel to be updated");
        assert.isTrue(targetDbChanges.model.updateIds.has(IModel.repositoryModelId));
        assert.isAtLeast(targetDbChanges.relationship.insertIds.size, 1);
        // expect no other changes from transforming the result of populateSourceDb
        assert.equal(targetDbChanges.codeSpec.updateIds.size, 0);
        assert.equal(targetDbChanges.codeSpec.deleteIds.size, 0);
        assert.equal(targetDbChanges.element.deleteIds.size, 0);
        assert.equal(targetDbChanges.aspect.updateIds.size, 0);
        assert.equal(targetDbChanges.aspect.deleteIds.size, 0);
        assert.equal(targetDbChanges.model.deleteIds.size, 0);
        assert.equal(targetDbChanges.relationship.updateIds.size, 0);
        assert.equal(targetDbChanges.relationship.deleteIds.size, 0);
      }

      if (true) { // second import with no changes to source, should be a no-op
        const numTargetElements: number = count(targetDb, Element.classFullName);
        const numTargetExternalSourceAspects: number = count(targetDb, ExternalSourceAspect.classFullName);
        const numTargetRelationships: number = count(targetDb, ElementRefersToElements.classFullName);
        const targetImporter = new CountingIModelImporter(targetDb);
        const transformer = new TestIModelTransformer(sourceDb, targetImporter);
        await transformer.processChanges(accessToken);
        assert.equal(targetImporter.numModelsInserted, 0);
        assert.equal(targetImporter.numModelsUpdated, 0);
        assert.equal(targetImporter.numElementsInserted, 0);
        assert.equal(targetImporter.numElementsUpdated, 0);
        assert.equal(targetImporter.numElementsDeleted, 0);
        assert.equal(targetImporter.numElementAspectsInserted, 0);
        assert.equal(targetImporter.numElementAspectsUpdated, 0);
        assert.equal(targetImporter.numRelationshipsInserted, 0);
        assert.equal(targetImporter.numRelationshipsUpdated, 0);
        assert.equal(numTargetElements, count(targetDb, Element.classFullName), "Second import should not add elements");
        assert.equal(numTargetExternalSourceAspects, count(targetDb, ExternalSourceAspect.classFullName), "Second import should not add aspects");
        assert.equal(numTargetRelationships, count(targetDb, ElementRefersToElements.classFullName), "Second import should not add relationships");
        transformer.dispose();
        targetDb.saveChanges();
        assert.isFalse(targetDb.nativeDb.hasPendingTxns());
        await targetDb.pushChanges({ accessToken, description: "Should not actually push because there are no changes" });
      }

      if (true) { // update source db, then import again
        BackendTestUtils.ExtensiveTestScenario.updateDb(sourceDb);
        sourceDb.saveChanges();
        await sourceDb.pushChanges({ accessToken, description: "Update source" });

        // Use IModelExporter.exportChanges to verify the changes to the sourceDb
        const sourceExportFileName: string = IModelTransformerTestUtils.prepareOutputFile("IModelTransformer", "TransformerSource-ExportChanges-2.txt");
        assert.isFalse(IModelJsFs.existsSync(sourceExportFileName));
        const sourceExporter = new IModelToTextFileExporter(sourceDb, sourceExportFileName);
        await sourceExporter.exportChanges(accessToken);
        assert.isTrue(IModelJsFs.existsSync(sourceExportFileName));
        const sourceDbChanges: any = (sourceExporter.exporter as any)._sourceDbChanges; // access private member for testing purposes
        assert.exists(sourceDbChanges);
        // expect some inserts from updateDb
        assert.equal(sourceDbChanges.codeSpec.insertIds.size, 0);
        assert.equal(sourceDbChanges.element.insertIds.size, 1);
        assert.equal(sourceDbChanges.aspect.insertIds.size, 0);
        assert.equal(sourceDbChanges.model.insertIds.size, 0);
        assert.equal(sourceDbChanges.relationship.insertIds.size, 2);
        // expect some updates from updateDb
        assert.isAtLeast(sourceDbChanges.element.updateIds.size, 1);
        assert.isAtLeast(sourceDbChanges.aspect.updateIds.size, 1);
        assert.isAtLeast(sourceDbChanges.model.updateIds.size, 1);
        assert.isAtLeast(sourceDbChanges.relationship.updateIds.size, 1);
        // expect some deletes from updateDb
        assert.isAtLeast(sourceDbChanges.element.deleteIds.size, 1);
        assert.equal(sourceDbChanges.relationship.deleteIds.size, 1);
        // don't expect other changes from updateDb
        assert.equal(sourceDbChanges.codeSpec.updateIds.size, 0);
        assert.equal(sourceDbChanges.codeSpec.deleteIds.size, 0);
        assert.equal(sourceDbChanges.aspect.deleteIds.size, 0);
        assert.equal(sourceDbChanges.model.deleteIds.size, 0);

        const transformer = new TestIModelTransformer(sourceDb, targetDb);
        await transformer.processChanges(accessToken);
        transformer.dispose();
        targetDb.saveChanges();
        await targetDb.pushChanges({ accessToken, description: "Import #2" });
        BackendTestUtils.ExtensiveTestScenario.assertUpdatesInDb(targetDb);

        // Use IModelExporter.exportChanges to verify the changes to the targetDb
        const targetExportFileName: string = IModelTransformerTestUtils.prepareOutputFile("IModelTransformer", "TransformerTarget-ExportChanges-2.txt");
        assert.isFalse(IModelJsFs.existsSync(targetExportFileName));
        const targetExporter = new IModelToTextFileExporter(targetDb, targetExportFileName);
        await targetExporter.exportChanges(accessToken);
        assert.isTrue(IModelJsFs.existsSync(targetExportFileName));
        const targetDbChanges: any = (targetExporter.exporter as any)._sourceDbChanges; // access private member for testing purposes
        assert.exists(targetDbChanges);
        // expect some inserts from transforming the result of updateDb
        assert.equal(targetDbChanges.codeSpec.insertIds.size, 0);
        assert.equal(targetDbChanges.element.insertIds.size, 1);
        assert.equal(targetDbChanges.aspect.insertIds.size, 3);
        assert.equal(targetDbChanges.model.insertIds.size, 0);
        assert.equal(targetDbChanges.relationship.insertIds.size, 2);
        // expect some updates from transforming the result of updateDb
        assert.isAtLeast(targetDbChanges.element.updateIds.size, 1);
        assert.isAtLeast(targetDbChanges.aspect.updateIds.size, 1);
        assert.isAtLeast(targetDbChanges.model.updateIds.size, 1);
        assert.isAtLeast(targetDbChanges.relationship.updateIds.size, 1);
        // expect some deletes from transforming the result of updateDb
        assert.isAtLeast(targetDbChanges.element.deleteIds.size, 1);
        assert.isAtLeast(targetDbChanges.aspect.deleteIds.size, 1);
        assert.equal(targetDbChanges.relationship.deleteIds.size, 1);
        // don't expect other changes from transforming the result of updateDb
        assert.equal(targetDbChanges.codeSpec.updateIds.size, 0);
        assert.equal(targetDbChanges.codeSpec.deleteIds.size, 0);
        assert.equal(targetDbChanges.model.deleteIds.size, 0);
      }

      const sourceIModelChangeSets = await IModelHost.hubAccess.queryChangesets({ accessToken, iModelId: sourceIModelId });
      const targetIModelChangeSets = await IModelHost.hubAccess.queryChangesets({ accessToken, iModelId: targetIModelId });
      assert.equal(sourceIModelChangeSets.length, 2);
      assert.equal(targetIModelChangeSets.length, 2);

      await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, sourceDb);
      await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, targetDb);
    } finally {
      try {
        await IModelHost.hubAccess.deleteIModel({ iTwinId, iModelId: sourceIModelId });
        await IModelHost.hubAccess.deleteIModel({ iTwinId, iModelId: targetIModelId });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log("can't destroy", err);
      }
    }
  });

  it("Clone/upgrade test", async () => {
    const sourceIModelName: string = IModelTransformerTestUtils.generateUniqueName("CloneSource");
    const sourceIModelId = await HubWrappers.recreateIModel({ accessToken, iTwinId, iModelName: sourceIModelName, noLocks: true });
    assert.isTrue(Guid.isGuid(sourceIModelId));
    const targetIModelName: string = IModelTransformerTestUtils.generateUniqueName("CloneTarget");
    const targetIModelId = await HubWrappers.recreateIModel({ accessToken, iTwinId, iModelName: targetIModelName, noLocks: true });
    assert.isTrue(Guid.isGuid(targetIModelId));

    try {
      // open/upgrade sourceDb
      const sourceDb = await HubWrappers.downloadAndOpenBriefcase({ accessToken, iTwinId, iModelId: sourceIModelId });
      const seedBisCoreVersion = sourceDb.querySchemaVersion(BisCoreSchema.schemaName)!;
      assert.isTrue(semver.satisfies(seedBisCoreVersion, ">= 1.0.1"));
      await sourceDb.importSchemas([BisCoreSchema.schemaFilePath, GenericSchema.schemaFilePath]);
      const updatedBisCoreVersion = sourceDb.querySchemaVersion(BisCoreSchema.schemaName)!;
      assert.isTrue(semver.satisfies(updatedBisCoreVersion, ">= 1.0.10"));
      assert.isTrue(sourceDb.containsClass(ExternalSourceAspect.classFullName), "Expect BisCore to be updated and contain ExternalSourceAspect");
      const expectedHasPendingTxns: boolean = seedBisCoreVersion !== updatedBisCoreVersion;

      // push sourceDb schema changes
      assert.equal(sourceDb.nativeDb.hasPendingTxns(), expectedHasPendingTxns, "Expect importSchemas to have saved changes");
      assert.isFalse(sourceDb.nativeDb.hasUnsavedChanges(), "Expect no unsaved changes after importSchemas");
      await sourceDb.pushChanges({ accessToken, description: "Import schemas to upgrade BisCore" }); // may push schema changes

      // import schemas again to test common scenario of not knowing whether schemas are up-to-date or not..
      await sourceDb.importSchemas([BisCoreSchema.schemaFilePath, GenericSchema.schemaFilePath]);
      assert.isFalse(sourceDb.nativeDb.hasPendingTxns(), "Expect importSchemas to be a no-op");
      assert.isFalse(sourceDb.nativeDb.hasUnsavedChanges(), "Expect importSchemas to be a no-op");
      sourceDb.saveChanges(); // will be no changes to save in this case
      await sourceDb.pushChanges({ accessToken, description: "Import schemas again" }); // will be no changes to push in this case

      // populate sourceDb
      IModelTransformerTestUtils.populateTeamIModel(sourceDb, "Test", Point3d.createZero(), ColorDef.green);
      IModelTransformerTestUtils.assertTeamIModelContents(sourceDb, "Test");
      sourceDb.saveChanges();
      await sourceDb.pushChanges({ accessToken, description: "Populate Source" });

      // open/upgrade targetDb
      const targetDb = await HubWrappers.downloadAndOpenBriefcase({ accessToken, iTwinId, iModelId: targetIModelId });
      await targetDb.importSchemas([BisCoreSchema.schemaFilePath, GenericSchema.schemaFilePath]);
      assert.isTrue(targetDb.containsClass(ExternalSourceAspect.classFullName), "Expect BisCore to be updated and contain ExternalSourceAspect");

      // push targetDb schema changes
      targetDb.saveChanges();
      await targetDb.pushChanges({ accessToken, description: "Upgrade BisCore" });

      // import sourceDb changes into targetDb
      const transformer = new IModelTransformer(new IModelExporter(sourceDb), targetDb);
      await transformer.processAll();
      transformer.dispose();
      IModelTransformerTestUtils.assertTeamIModelContents(targetDb, "Test");
      targetDb.saveChanges();
      await targetDb.pushChanges({ accessToken, description: "Import changes from sourceDb" });

      // close iModel briefcases
      await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, sourceDb);
      await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, targetDb);
    } finally {
      try {
        // delete iModel briefcases
        await IModelHost.hubAccess.deleteIModel({ iTwinId, iModelId: sourceIModelId });
        await IModelHost.hubAccess.deleteIModel({ iTwinId, iModelId: targetIModelId });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log("can't destroy", err);
      }
    }
  });

  it("should merge changes made on a branch back to master", async () => {
    // create and push master IModel
    const masterIModelName = "Master";
    const masterSeedFileName = join(outputDir, `${masterIModelName}.bim`);
    if (IModelJsFs.existsSync(masterSeedFileName))
      IModelJsFs.removeSync(masterSeedFileName); // make sure file from last run does not exist

    const state0 = [1, 2, 20]; // 20 will be deleted by a branch
    const masterSeedDb = SnapshotDb.createEmpty(masterSeedFileName, { rootSubject: { name: "Master" } });
    populateMaster(masterSeedDb, state0);
    assert.isTrue(IModelJsFs.existsSync(masterSeedFileName));
    masterSeedDb.nativeDb.setITwinId(iTwinId); // WIP: attempting a workaround for "ContextId was not properly setup in the checkpoint" issue
    masterSeedDb.saveChanges();
    masterSeedDb.close();
    const masterIModelId = await IModelHost.hubAccess.createNewIModel({ iTwinId, iModelName: masterIModelName, description: "master", version0: masterSeedFileName, noLocks: true });
    assert.isTrue(Guid.isGuid(masterIModelId));
    IModelJsFs.removeSync(masterSeedFileName); // now that iModel is pushed, can delete local copy of the seed
    const masterDb = await HubWrappers.downloadAndOpenBriefcase({ accessToken, iTwinId, iModelId: masterIModelId });
    assert.isTrue(masterDb.isBriefcaseDb());
    assert.equal(masterDb.iTwinId, iTwinId);
    assert.equal(masterDb.iModelId, masterIModelId);
    assertPhysicalObjects(masterDb, state0);
    const changesetMasterState0 = masterDb.changeset.id;

    // create Branch1 iModel using Master as a template
    const branchIModelName1 = "Branch1";
    const branchIModelId1 = await IModelHost.hubAccess.createNewIModel({ iTwinId, iModelName: branchIModelName1, description: `Branch1 of ${masterIModelName}`, version0: masterDb.pathName, noLocks: true });

    const branchDb1 = await HubWrappers.downloadAndOpenBriefcase({ accessToken, iTwinId, iModelId: branchIModelId1 });
    assert.isTrue(branchDb1.isBriefcaseDb());
    assert.equal(branchDb1.iTwinId, iTwinId);
    assertPhysicalObjects(branchDb1, state0);
    const changesetBranch1First = branchDb1.changeset.id;

    // create Branch2 iModel using Master as a template
    const branchIModelName2 = "Branch2";
    const branchIModelId2 = await IModelHost.hubAccess.createNewIModel({ iTwinId, iModelName: branchIModelName2, description: `Branch2 of ${masterIModelName}`, version0: masterDb.pathName, noLocks: true });
    const branchDb2 = await HubWrappers.downloadAndOpenBriefcase({ accessToken, iTwinId, iModelId: branchIModelId2 });
    assert.isTrue(branchDb2.isBriefcaseDb());
    assert.equal(branchDb2.iTwinId, iTwinId);
    assertPhysicalObjects(branchDb2, state0);
    const changesetBranch2First = branchDb2.changeset.id;

    // create empty iModel meant to contain replayed master history
    const replayedIModelName = "Replayed";
    const replayedIModelId = await IModelHost.hubAccess.createNewIModel({ iTwinId, iModelName: replayedIModelName, description: "blank", noLocks: true });

    const replayedDb = await HubWrappers.downloadAndOpenBriefcase({ accessToken, iTwinId, iModelId: replayedIModelId });
    assert.isTrue(replayedDb.isBriefcaseDb());
    assert.equal(replayedDb.iTwinId, iTwinId);

    try {
      // record provenance in Branch1 and Branch2 iModels
      const provenanceInserterB1 = new IModelTransformer(masterDb, branchDb1, {
        wasSourceIModelCopiedToTarget: true,
      });
      const provenanceInserterB2 = new IModelTransformer(masterDb, branchDb2, {
        wasSourceIModelCopiedToTarget: true,
      });
      await provenanceInserterB1.processAll();
      await provenanceInserterB2.processAll();
      provenanceInserterB1.dispose();
      provenanceInserterB2.dispose();
      assert.equal(count(masterDb, ExternalSourceAspect.classFullName), 0);
      assert.isAbove(count(branchDb1, ExternalSourceAspect.classFullName), state0.length);
      assert.isAbove(count(branchDb2, ExternalSourceAspect.classFullName), state0.length);

      // push Branch1 and Branch2 provenance changes
      await saveAndPushChanges(branchDb1, "State0");
      await saveAndPushChanges(branchDb2, "State0");
      const changesetBranch1State0 = branchDb1.changeset.id;
      const changesetBranch2State0 = branchDb2.changeset.id;
      assert.notEqual(changesetBranch1State0, changesetBranch1First);
      assert.notEqual(changesetBranch2State0, changesetBranch2First);

      // push Branch1 State1
      const delta01 = [2, 3, 4]; // update 2, insert 3 and 4
      const state1 = [1, 2, 3, 4, 20];
      maintainPhysicalObjects(branchDb1, delta01);
      assertPhysicalObjects(branchDb1, state1);
      await saveAndPushChanges(branchDb1, "State0 -> State1");
      const changesetBranch1State1 = branchDb1.changeset.id;
      assert.notEqual(changesetBranch1State1, changesetBranch1State0);

      // push Branch1 State2
      const delta12 = [1, -3, 5, 6, -20]; // update 1, delete 3, 20, insert 5 and 6
      const state2 = [1, 2, -3, 4, 5, 6];
      maintainPhysicalObjects(branchDb1, delta12);
      assertPhysicalObjects(branchDb1, state2);
      await saveAndPushChanges(branchDb1, "State1 -> State2");
      const changesetBranch1State2 = branchDb1.changeset.id;
      assert.notEqual(changesetBranch1State2, changesetBranch1State1);

      // merge changes made on Branch1 back to Master
      const branch1ToMaster = new IModelTransformer(branchDb1, masterDb, {
        isReverseSynchronization: true, // provenance stored in source/branch
      });
      await branch1ToMaster.processChanges(accessToken, changesetBranch1State1);
      branch1ToMaster.dispose();
      assertPhysicalObjects(masterDb, state2);
      assertPhysicalObjectUpdated(masterDb, 1);
      assertPhysicalObjectUpdated(masterDb, 2);
      assert.equal(count(masterDb, ExternalSourceAspect.classFullName), 0);
      await saveAndPushChanges(masterDb, "State0 -> State2"); // a squash of 2 branch changes into 1 in the masterDb change ledger
      const changesetMasterState2 = masterDb.changeset.id;
      assert.notEqual(changesetMasterState2, changesetMasterState0);
      branchDb1.saveChanges(); // saves provenance locally in case of re-merge

      // merge changes from Master to Branch2
      const masterToBranch2 = new IModelTransformer(masterDb, branchDb2);
      await masterToBranch2.processChanges(accessToken, changesetMasterState2);
      masterToBranch2.dispose();
      assertPhysicalObjects(branchDb2, state2);
      await saveAndPushChanges(branchDb2, "State0 -> State2");
      const changesetBranch2State2 = branchDb2.changeset.id;
      assert.notEqual(changesetBranch2State2, changesetBranch2State0);

      // make changes to Branch2
      const delta23 = [7, 8]; // insert 7 (without any updates), and 8
      const state3 = [1, 2, -3, 4, 5, 6, 7, 8];
      maintainPhysicalObjects(branchDb2, delta23);
      assertPhysicalObjects(branchDb2, state3);
      await saveAndPushChanges(branchDb2, "State2 -> State3");
      const changesetBranch2State3 = branchDb2.changeset.id;
      assert.notEqual(changesetBranch2State3, changesetBranch2State2);

      // make conflicting changes to master
      const delta3Master = [7, 7, 9]; // insert 7 and update it so it conflicts with the branch, insert 9 too
      const state3Master = [1, 2, -3, 4, 5, 6, 7, 9];
      maintainPhysicalObjects(masterDb, delta3Master);
      assertPhysicalObjects(masterDb, state3Master);
      await saveAndPushChanges(masterDb, "State2 -> State3M");
      const changesetMasterState3M = masterDb.changeset.id;
      assert.notEqual(changesetMasterState3M, changesetMasterState2);

      // merge changes made on Branch2 back to Master with a conflict
      const branch2ToMaster = new IModelTransformer(branchDb2, masterDb, {
        isReverseSynchronization: true, // provenance stored in source/branch
      });
      const state3Merged = [1, 2, -3, 4, 5, 6, 7, 8, 9];
      await branch2ToMaster.processChanges(accessToken, changesetBranch2State3);
      branch2ToMaster.dispose();
      assertPhysicalObjects(masterDb, state3Merged); // source wins conflicts
      assertPhysicalObjectUpdated(masterDb, 7); // if it was updated, then the master version of it won
      assert.equal(count(masterDb, ExternalSourceAspect.classFullName), 0);
      await saveAndPushChanges(masterDb, "State3M -> State3");
      const changesetMasterState3 = masterDb.changeset.id;
      assert.notEqual(changesetMasterState3, changesetMasterState2);
      branchDb2.saveChanges(); // saves provenance locally in case of re-merge

      // make change directly on Master
      const delta34 = [6, -7]; // update 6, delete 7
      const state4 = [1, 2, -3, 4, 5, 6, -7, 8, 9];
      maintainPhysicalObjects(masterDb, delta34);
      assertPhysicalObjects(masterDb, state4);
      await saveAndPushChanges(masterDb, "State3 -> State4");
      const changesetMasterState4 = masterDb.changeset.id;
      assert.notEqual(changesetMasterState4, changesetMasterState3);

      // merge Master to Branch1
      const masterToBranch1 = new IModelTransformer(masterDb, branchDb1);
      await masterToBranch1.processChanges(accessToken, changesetMasterState2);
      masterToBranch1.dispose();
      assertPhysicalObjects(branchDb1, state4);
      assertPhysicalObjectUpdated(branchDb1, 6);
      await saveAndPushChanges(branchDb1, "State2 -> State4");
      const changesetBranch1State4 = branchDb1.changeset.id;
      assert.notEqual(changesetBranch1State4, changesetBranch1State2);

      const masterDbChangesets = await IModelHost.hubAccess.downloadChangesets({ accessToken, iModelId: masterIModelId, targetDir: BriefcaseManager.getChangeSetsPath(masterIModelId) });
      assert.equal(masterDbChangesets.length, 4);
      const masterDeletedElementIds = new Set<Id64String>();
      for (const masterDbChangeset of masterDbChangesets) {
        assert.isDefined(masterDbChangeset.id);
        assert.isDefined(masterDbChangeset.description); // test code above always included a change description when pushChanges was called
        const changesetPath = masterDbChangeset.pathname;
        assert.isTrue(IModelJsFs.existsSync(changesetPath));
        // below is one way of determining the set of elements that were deleted in a specific changeset
        const statusOrResult = masterDb.nativeDb.extractChangedInstanceIdsFromChangeSets([changesetPath]);
        assert.isUndefined(statusOrResult.error);
        const result = statusOrResult.result;
        if (result === undefined)
          throw Error("expected to be defined");

        assert.isDefined(result.element);
        if (result.element?.delete) {
          result.element.delete.forEach((id: Id64String) => masterDeletedElementIds.add(id));
        }
      }
      assert.isAtLeast(masterDeletedElementIds.size, 1);

      // replay master history to create replayed iModel
      const sourceDb = await HubWrappers.downloadAndOpenBriefcase({ accessToken, iTwinId, iModelId: masterIModelId, asOf: IModelVersion.first().toJSON() });
      const replayTransformer = new IModelTransformer(sourceDb, replayedDb);
      // this replay strategy pretends that deleted elements never existed
      for (const elementId of masterDeletedElementIds) {
        replayTransformer.exporter.excludeElement(elementId);
      }
      // note: this test knows that there were no schema changes, so does not call `processSchemas`
      await replayTransformer.processAll(); // process any elements that were part of the "seed"
      await saveAndPushChanges(replayedDb, "changes from source seed");
      for (const masterDbChangeset of masterDbChangesets) {
        await sourceDb.pullChanges({ accessToken, toIndex: masterDbChangeset.index });
        await replayTransformer.processChanges(accessToken, sourceDb.changeset.id);
        await saveAndPushChanges(replayedDb, masterDbChangeset.description ?? "");
      }
      replayTransformer.dispose();
      sourceDb.close();
      assertPhysicalObjects(replayedDb, state4); // should have same ending state as masterDb

      // make sure there are no deletes in the replay history (all elements that were eventually deleted from masterDb were excluded)
      const replayedDbChangesets = await IModelHost.hubAccess.downloadChangesets({ accessToken, iModelId: replayedIModelId, targetDir: BriefcaseManager.getChangeSetsPath(replayedIModelId) });
      assert.isAtLeast(replayedDbChangesets.length, masterDbChangesets.length); // replayedDb will have more changesets when seed contains elements
      const replayedDeletedElementIds = new Set<Id64String>();
      for (const replayedDbChangeset of replayedDbChangesets) {
        assert.isDefined(replayedDbChangeset.id);
        const changesetPath = replayedDbChangeset.pathname;
        assert.isTrue(IModelJsFs.existsSync(changesetPath));
        // below is one way of determining the set of elements that were deleted in a specific changeset
        const statusOrResult = replayedDb.nativeDb.extractChangedInstanceIdsFromChangeSets([changesetPath]);
        const result = statusOrResult.result;
        if (result === undefined)
          throw Error("expected to be defined");

        assert.isDefined(result.element);
        if (result.element?.delete) {
          result.element.delete.forEach((id: Id64String) => replayedDeletedElementIds.add(id));
        }
      }
      assert.equal(replayedDeletedElementIds.size, 0);

      masterDb.close();
      branchDb1.close();
      branchDb2.close();
      replayedDb.close();
    } finally {
      await IModelHost.hubAccess.deleteIModel({ iTwinId, iModelId: masterIModelId });
      await IModelHost.hubAccess.deleteIModel({ iTwinId, iModelId: branchIModelId1 });
      await IModelHost.hubAccess.deleteIModel({ iTwinId, iModelId: branchIModelId2 });
      await IModelHost.hubAccess.deleteIModel({ iTwinId, iModelId: replayedIModelId });
    }
  });

  it("ModelSelector processChanges", async () => {
    const sourceIModelName = "ModelSelectorSource";
    const sourceIModelId = await HubWrappers.recreateIModel({ accessToken, iTwinId, iModelName: sourceIModelName, noLocks: true });
    let targetIModelId!: GuidString;
    assert.isTrue(Guid.isGuid(sourceIModelId));

    try {
      const sourceDb = await HubWrappers.downloadAndOpenBriefcase({ accessToken, iTwinId, iModelId: sourceIModelId });

      // setup source
      const physModel1Id = PhysicalModel.insert(sourceDb, IModel.rootSubjectId, "phys-model-1");
      const physModel2Id = PhysicalModel.insert(sourceDb, IModel.rootSubjectId, "phys-model-2");
      const modelSelectorInSource = ModelSelector.create(sourceDb, IModelDb.dictionaryId, "model-selector", [physModel1Id]);
      const modelSelectorCode = modelSelectorInSource.code;
      const modelSelectorId = modelSelectorInSource.insert();
      sourceDb.saveChanges();
      await sourceDb.pushChanges({ accessToken, description: "setup source models and selector" });

      // create target branch
      const targetIModelName = "ModelSelectorTarget";
      targetIModelId = await HubWrappers.recreateIModel({ accessToken, iTwinId, iModelName: targetIModelName, noLocks: true, version0: sourceDb.pathName });
      assert.isTrue(Guid.isGuid(targetIModelId));
      const targetDb = await HubWrappers.downloadAndOpenBriefcase({ accessToken, iTwinId, iModelId: targetIModelId });
      await targetDb.importSchemas([BisCoreSchema.schemaFilePath, GenericSchema.schemaFilePath]);
      assert.isTrue(targetDb.containsClass(ExternalSourceAspect.classFullName), "Expect BisCore to be updated and contain ExternalSourceAspect");
      const provenanceInitializer = new IModelTransformer(sourceDb, targetDb, { wasSourceIModelCopiedToTarget: true });
      await provenanceInitializer.processSchemas();
      await provenanceInitializer.processAll();
      provenanceInitializer.dispose();

      // update source (add model2 to model selector)
      // (it's important that we only change the model selector here to keep the changes isolated)
      const modelSelectorUpdate = sourceDb.elements.getElement<ModelSelector>(modelSelectorId, ModelSelector);
      modelSelectorUpdate.models = [...modelSelectorUpdate.models, physModel2Id];
      modelSelectorUpdate.update();
      sourceDb.saveChanges();
      await sourceDb.pushChanges({ accessToken, description: "add model2 to model selector" });

      // check that the model selector has the expected change in the source
      const modelSelectorUpdate2 = sourceDb.elements.getElement<ModelSelector>(modelSelectorId, ModelSelector);
      expect(modelSelectorUpdate2.models).to.have.length(2);

      // test extracted changed ids
      const sourceDbChangesets = await IModelHost.hubAccess.downloadChangesets({ accessToken, iModelId: sourceIModelId, targetDir: BriefcaseManager.getChangeSetsPath(sourceIModelId) });
      expect(sourceDbChangesets).to.have.length(2);
      const latestChangeset = sourceDbChangesets[1];
      const extractedChangedIds = sourceDb.nativeDb.extractChangedInstanceIdsFromChangeSets([latestChangeset.pathname]);
      const expectedChangedIds: IModelJsNative.ChangedInstanceIdsProps = {
        element: { update: [modelSelectorId] },
        model: { update: [IModel.dictionaryId] }, // containing model will also get last modification time updated
      };
      expect(extractedChangedIds.result).to.deep.equal(expectedChangedIds);

      // synchronize
      let didExportModelSelector = false, didImportModelSelector = false;
      class IModelImporterInjected extends IModelImporter {
        public override importElement(sourceElement: ElementProps): Id64String {
          if (sourceElement.id === modelSelectorId)
            didImportModelSelector = true;
          return super.importElement(sourceElement);
        }
      }
      class IModelTransformerInjected extends IModelTransformer {
        public override async onExportElement(sourceElement: Element) {
          if (sourceElement.id === modelSelectorId)
            didExportModelSelector = true;
          return super.onExportElement(sourceElement);
        }
      }
      const synchronizer = new IModelTransformerInjected(sourceDb, new IModelImporterInjected(targetDb));
      await synchronizer.processChanges(accessToken);
      expect(didExportModelSelector).to.be.true;
      expect(didImportModelSelector).to.be.true;
      synchronizer.dispose();
      targetDb.saveChanges();
      await targetDb.pushChanges({ accessToken, description: "synchronize" });

      // check that the model selector has the expected change in the target
      const modelSelectorInTargetId = targetDb.elements.queryElementIdByCode(modelSelectorCode);
      assert(modelSelectorInTargetId !== undefined, `expected obj ${modelSelectorInTargetId} to be defined`);

      const modelSelectorInTarget = targetDb.elements.getElement<ModelSelector>(modelSelectorInTargetId, ModelSelector);
      expect(modelSelectorInTarget.models).to.have.length(2);

      // close iModel briefcases
      await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, sourceDb);
      await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, targetDb);
    } finally {
      try {
        // delete iModel briefcases
        await IModelHost.hubAccess.deleteIModel({ iTwinId, iModelId: sourceIModelId });
        await IModelHost.hubAccess.deleteIModel({ iTwinId, iModelId: targetIModelId });
      } catch (err) {
        assert.fail(err, undefined, "failed to clean up");
      }
    }
  });

  it("should delete branch-deleted elements in reverse synchronization", async () => {
    const masterIModelName = "ReSyncDeleteMaster";
    const masterIModelId = await HubWrappers.recreateIModel({ accessToken, iTwinId, iModelName: masterIModelName, noLocks: true });
    let branchIModelId!: GuidString;
    assert.isTrue(Guid.isGuid(masterIModelId));

    try {
      const masterDb = await HubWrappers.downloadAndOpenBriefcase({ accessToken, iTwinId, iModelId: masterIModelId });

      // populate master
      const categId = SpatialCategory.insert(masterDb, IModel.dictionaryId, "category", new SubCategoryAppearance());
      const modelToDeleteWithElemId = PhysicalModel.insert(masterDb, IModel.rootSubjectId, "model-to-delete-with-elem");
      const makePhysObjCommonProps = (num: number) => ({
        classFullName: PhysicalObject.classFullName,
        category: categId,
        geom: IModelTransformerTestUtils.createBox(Point3d.create(num, num, num)),
        placement: {
          origin: Point3d.create(num, num, num),
          angles: YawPitchRollAngles.createDegrees(num, num, num),
        },
      } as const);
      const elemInModelToDeleteId = new PhysicalObject({
        ...makePhysObjCommonProps(1),
        model: modelToDeleteWithElemId,
        code: new Code({ spec: IModelDb.rootSubjectId, scope: IModelDb.rootSubjectId, value: "elem-in-model-to-delete" }),
        userLabel: "elem-in-model-to-delete",
      }, masterDb).insert();
      const notDeletedModelId = PhysicalModel.insert(masterDb, IModel.rootSubjectId, "not-deleted-model");
      const elemToDeleteWithChildrenId = new PhysicalObject({
        ...makePhysObjCommonProps(2),
        model: notDeletedModelId,
        code: new Code({ spec: IModelDb.rootSubjectId, scope: IModelDb.rootSubjectId, value: "deleted-elem-with-children" }),
        userLabel: "deleted-elem-with-children",
      }, masterDb).insert();
      const childElemOfDeletedId = new PhysicalObject({
        ...makePhysObjCommonProps(3),
        model: notDeletedModelId,
        code: new Code({ spec: IModelDb.rootSubjectId, scope: IModelDb.rootSubjectId, value: "child-elem-of-deleted" }),
        userLabel: "child-elem-of-deleted",
        parent: new ElementOwnsChildElements(elemToDeleteWithChildrenId),
      }, masterDb).insert();
      const childSubjectId = Subject.insert(masterDb, IModel.rootSubjectId, "child-subject");
      const modelInChildSubjectId = PhysicalModel.insert(masterDb, childSubjectId, "model-in-child-subject");
      const childSubjectChildId = Subject.insert(masterDb, childSubjectId, "child-subject-child");
      const modelInChildSubjectChildId = PhysicalModel.insert(masterDb, childSubjectChildId, "model-in-child-subject-child");
      masterDb.saveChanges();
      await masterDb.pushChanges({ accessToken, description: "setup master" });

      // create and initialize branch from master
      const branchIModelName = "RevSyncDeleteBranch";
      branchIModelId = await HubWrappers.recreateIModel({ accessToken, iTwinId, iModelName: branchIModelName, noLocks: true, version0: masterDb.pathName });
      assert.isTrue(Guid.isGuid(branchIModelId));
      const branchDb = await HubWrappers.downloadAndOpenBriefcase({ accessToken, iTwinId, iModelId: branchIModelId });
      await branchDb.importSchemas([BisCoreSchema.schemaFilePath, GenericSchema.schemaFilePath]);
      assert.isTrue(branchDb.containsClass(ExternalSourceAspect.classFullName), "Expect BisCore to be updated and contain ExternalSourceAspect");
      const provenanceInitializer = new IModelTransformer(masterDb, branchDb, { wasSourceIModelCopiedToTarget: true });
      await provenanceInitializer.processSchemas();
      await provenanceInitializer.processAll();
      provenanceInitializer.dispose();
      branchDb.saveChanges();
      await branchDb.pushChanges({ accessToken, description: "setup branch" });

      const modelToDeleteWithElem = {
        entity: branchDb.models.getModel(modelToDeleteWithElemId),
        aspects: branchDb.elements.getAspects(modelToDeleteWithElemId),
      };
      const elemToDeleteWithChildren = {
        entity: branchDb.elements.getElement(elemToDeleteWithChildrenId),
        aspects: branchDb.elements.getAspects(elemToDeleteWithChildrenId),
      };
      const childElemOfDeleted = {
        aspects: branchDb.elements.getAspects(childElemOfDeletedId),
      };
      const elemInModelToDelete = {
        aspects: branchDb.elements.getAspects(elemInModelToDeleteId),
      };
      const childSubject = {
        entity: branchDb.elements.getElement(childSubjectId),
        aspects: branchDb.elements.getAspects(childSubjectId),
      };
      const modelInChildSubject = {
        entity: branchDb.models.getModel(modelInChildSubjectId),
        aspects: branchDb.elements.getAspects(modelInChildSubjectId),
      };
      const childSubjectChild = {
        entity: branchDb.elements.getElement(childSubjectChildId),
        aspects: branchDb.elements.getAspects(childSubjectChildId),
      };
      const modelInChildSubjectChild = {
        entity: branchDb.models.getModel(modelInChildSubjectChildId),
        aspects: branchDb.elements.getAspects(modelInChildSubjectChildId),
      };

      elemToDeleteWithChildren.entity.delete();
      modelToDeleteWithElem.entity.delete();
      deleteElementTree(branchDb, modelToDeleteWithElemId);
      deleteElementTree(branchDb, childSubjectId);
      branchDb.saveChanges();
      await branchDb.pushChanges({ accessToken, description: "branch deletes" });

      // verify the branch state
      expect(branchDb.models.tryGetModel(modelToDeleteWithElemId)).to.be.undefined;
      expect(branchDb.elements.tryGetElement(elemInModelToDeleteId)).to.be.undefined;
      expect(branchDb.models.tryGetModel(notDeletedModelId)).not.to.be.undefined;
      expect(branchDb.elements.tryGetElement(elemToDeleteWithChildrenId)).to.be.undefined;
      expect(branchDb.elements.tryGetElement(childElemOfDeletedId)).to.be.undefined;
      expect(branchDb.elements.tryGetElement(childSubjectId)).to.be.undefined;
      expect(branchDb.elements.tryGetElement(modelInChildSubjectId)).to.be.undefined;
      expect(branchDb.elements.tryGetElement(childSubjectChildId)).to.be.undefined;
      expect(branchDb.elements.tryGetElement(modelInChildSubjectChildId)).to.be.undefined;

      // expected extracted changed ids
      const branchDbChangesets = await IModelHost.hubAccess.downloadChangesets({ accessToken, iModelId: branchIModelId, targetDir: BriefcaseManager.getChangeSetsPath(branchIModelId) });
      expect(branchDbChangesets).to.have.length(2);
      const latestChangeset = branchDbChangesets[1];
      const extractedChangedIds = branchDb.nativeDb.extractChangedInstanceIdsFromChangeSets([latestChangeset.pathname]);
      const expectedChangedIds: IModelJsNative.ChangedInstanceIdsProps = {
        aspect: {
          delete: [
            ...modelToDeleteWithElem.aspects,
            ...childSubject.aspects,
            ...modelInChildSubject.aspects,
            ...childSubjectChild.aspects,
            ...modelInChildSubjectChild.aspects,
            ...elemInModelToDelete.aspects,
            ...elemToDeleteWithChildren.aspects,
            ...childElemOfDeleted.aspects,
          ].map((a) => a.id),
        },
        element: {
          delete: [
            modelToDeleteWithElemId,
            elemInModelToDeleteId,
            elemToDeleteWithChildrenId,
            childElemOfDeletedId,
            childSubjectId,
            modelInChildSubjectId,
            childSubjectChildId,
            modelInChildSubjectChildId,
          ],
        },
        model: {
          update: [IModelDb.rootSubjectId, notDeletedModelId], // containing model will also get last modification time updated
          delete: [modelToDeleteWithElemId, modelInChildSubjectId, modelInChildSubjectChildId],
        },
      };
      expect(extractedChangedIds.result).to.deep.equal(expectedChangedIds);

      const synchronizer = new IModelTransformer(branchDb, masterDb, {
        // NOTE: not using a targetScopeElementId because this test deals with temporary dbs, but that is a bad practice, use one
        isReverseSynchronization: true,
      });
      await synchronizer.processChanges(accessToken);
      branchDb.saveChanges();
      await branchDb.pushChanges({ accessToken, description: "synchronize" });
      synchronizer.dispose();

      const getFromTarget = (sourceEntityId: Id64String, type: "elem" | "model") => {
        const sourceEntity = masterDb.elements.tryGetElement(sourceEntityId);
        if (sourceEntity === undefined)
          return undefined;
        const codeVal = sourceEntity.code.value;
        assert(codeVal !== undefined, "all tested elements must have a code value");
        const targetId = IModelTransformerTestUtils.queryByCodeValue(masterDb, codeVal);
        if (Id64.isInvalid(targetId))
          return undefined;
        return type === "model"
          ? masterDb.models.tryGetModel(targetId)
          : masterDb.elements.tryGetElement(targetId);
      };

      // verify the master state
      expect(getFromTarget(modelToDeleteWithElemId, "model")).to.be.undefined;
      expect(getFromTarget(elemInModelToDeleteId, "elem")).to.be.undefined;
      expect(getFromTarget(notDeletedModelId, "model")).not.to.be.undefined;
      expect(getFromTarget(elemToDeleteWithChildrenId, "elem")).to.be.undefined;
      expect(getFromTarget(childElemOfDeletedId, "elem")).to.be.undefined;
      expect(getFromTarget(childSubjectId, "elem")).to.be.undefined;
      expect(getFromTarget(modelInChildSubjectId, "model")).to.be.undefined;
      expect(getFromTarget(childSubjectChildId, "elem")).to.be.undefined;
      expect(getFromTarget(modelInChildSubjectChildId, "model")).to.be.undefined;

      // close iModel briefcases
      await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, masterDb);
      await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, branchDb);
    } finally {
      // delete iModel briefcases
      await IModelHost.hubAccess.deleteIModel({ iTwinId, iModelId: masterIModelId });
      if (branchIModelId) {
        await IModelHost.hubAccess.deleteIModel({ iTwinId, iModelId: branchIModelId });
      }
    }
  });

  function count(iModelDb: IModelDb, classFullName: string): number {
    return iModelDb.withPreparedStatement(`SELECT COUNT(*) FROM ${classFullName}`, (statement: ECSqlStatement): number => {
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getInteger() : 0;
    });
  }

  async function saveAndPushChanges(briefcaseDb: BriefcaseDb, description: string): Promise<void> {
    briefcaseDb.saveChanges(description);
    await briefcaseDb.pushChanges({ accessToken, description });
  }

  function populateMaster(iModelDb: IModelDb, numbers: number[]): void {
    SpatialCategory.insert(iModelDb, IModel.dictionaryId, "SpatialCategory", new SubCategoryAppearance());
    PhysicalModel.insert(iModelDb, IModel.rootSubjectId, "PhysicalModel");
    maintainPhysicalObjects(iModelDb, numbers);
  }

  function assertPhysicalObjects(iModelDb: IModelDb, numbers: number[]): void {
    let numPhysicalObjects = 0;
    for (const n of numbers) {
      if (n > 0) { // negative "n" value means element was deleted
        ++numPhysicalObjects;
      }
      assertPhysicalObject(iModelDb, n);
    }
    assert.equal(numPhysicalObjects, count(iModelDb, PhysicalObject.classFullName));
  }

  function assertPhysicalObject(iModelDb: IModelDb, n: number): void {
    const physicalObjectId = getPhysicalObjectId(iModelDb, n);
    if (n > 0) {
      assert.isTrue(Id64.isValidId64(physicalObjectId), "Expected element to exist");
    } else {
      assert.equal(physicalObjectId, Id64.invalid, "Expected element to not exist"); // negative "n" means element was deleted
    }
  }

  function assertPhysicalObjectUpdated(iModelDb: IModelDb, n: number): void {
    assert.isTrue(n > 0);
    const physicalObjectId = getPhysicalObjectId(iModelDb, n);
    const physicalObject = iModelDb.elements.getElement(physicalObjectId, PhysicalObject);
    assert.isAtLeast(physicalObject.jsonProperties.updated, 1);
  }

  function getPhysicalObjectId(iModelDb: IModelDb, n: number): Id64String {
    const sql = `SELECT ECInstanceId FROM ${PhysicalObject.classFullName} WHERE UserLabel=:userLabel`;
    return iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement): Id64String => {
      statement.bindString("userLabel", n.toString());
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getId() : Id64.invalid;
    });
  }

  function maintainPhysicalObjects(iModelDb: IModelDb, numbers: number[]): void {
    const modelId = iModelDb.elements.queryElementIdByCode(PhysicalPartition.createCode(iModelDb, IModel.rootSubjectId, "PhysicalModel"))!;
    const categoryId = iModelDb.elements.queryElementIdByCode(SpatialCategory.createCode(iModelDb, IModel.dictionaryId, "SpatialCategory"))!;
    for (const n of numbers) {
      maintainPhysicalObject(iModelDb, modelId, categoryId, n);
    }
  }

  function maintainPhysicalObject(iModelDb: IModelDb, modelId: Id64String, categoryId: Id64String, n: number): Id64String {
    if (n > 0) { // positive "n" value means insert or update
      const physicalObjectId = getPhysicalObjectId(iModelDb, n);
      if (Id64.isValidId64(physicalObjectId)) { // if element exists, update it
        const physicalObject = iModelDb.elements.getElement(physicalObjectId, PhysicalObject);
        const numTimesUpdated: number = physicalObject.jsonProperties?.updated ?? 0;
        physicalObject.jsonProperties.updated = 1 + numTimesUpdated;
        physicalObject.update();
        return physicalObjectId;
      } else { // if element does not exist, insert it
        const physicalObjectProps: PhysicalElementProps = {
          classFullName: PhysicalObject.classFullName,
          model: modelId,
          category: categoryId,
          code: new Code({ spec: IModelDb.rootSubjectId, scope: IModelDb.rootSubjectId, value: n.toString() }),
          userLabel: n.toString(),
          geom: IModelTransformerTestUtils.createBox(Point3d.create(1, 1, 1)),
          placement: {
            origin: Point3d.create(n, n, 0),
            angles: YawPitchRollAngles.createDegrees(0, 0, 0),
          },
        };
        return iModelDb.elements.insertElement(physicalObjectProps);
      }
    } else { // negative "n" value means delete
      const physicalObjectId = getPhysicalObjectId(iModelDb, -n);
      iModelDb.elements.deleteElement(physicalObjectId);
      return physicalObjectId;
    }
  }
});
