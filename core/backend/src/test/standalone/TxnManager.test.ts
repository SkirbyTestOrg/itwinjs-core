/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { BeDuration, IModelStatus, OpenMode } from "@bentley/bentleyjs-core";
import { Code, ColorByName, IModel, IModelError, SubCategoryAppearance } from "@bentley/imodeljs-common";
import { assert } from "chai";
import { IModelDb, IModelJsFs, PhysicalModel, SpatialCategory, TxnAction, BackendRequestContext } from "../../imodeljs-backend";
import { IModelTestUtils, TestElementDrivesElement, TestPhysicalObject, TestPhysicalObjectProps } from "../IModelTestUtils";

describe("TxnManager", () => {
  let imodel: IModelDb;
  let props: TestPhysicalObjectProps;
  const requestContext = new BackendRequestContext();

  before(async () => {
    IModelTestUtils.registerTestBimSchema();
    const testFileName = IModelTestUtils.prepareOutputFile("TxnManager", "TxnManagerTest.bim");
    const seedFileName = IModelTestUtils.resolveAssetFile("test.bim");
    const schemaFileName = IModelTestUtils.resolveAssetFile("TestBim.ecschema.xml");
    IModelJsFs.copySync(seedFileName, testFileName);
    imodel = IModelDb.openStandalone(testFileName, OpenMode.ReadWrite);
    await imodel.importSchema(requestContext, schemaFileName); // will throw an exception if import fails

    props = {
      classFullName: "TestBim:TestPhysicalObject",
      model: PhysicalModel.insert(imodel, IModel.rootSubjectId, "TestModel"),
      category: SpatialCategory.insert(imodel, IModel.dictionaryId, "MySpatialCategory", new SubCategoryAppearance({ color: ColorByName.darkRed })),
      code: Code.createEmpty(),
      intProperty: 100,
    };

    imodel.saveChanges("schema change");
    imodel.nativeDb.enableTxnTesting();
  });

  after(() => imodel.closeStandalone());

  it("Undo/Redo", () => {
    assert.isDefined(imodel.getMetaData("TestBim:TestPhysicalObject"), "TestPhysicalObject is present");

    const txns = imodel.txns;
    assert.isFalse(txns.hasPendingTxns);

    const change1Msg = "change 1";
    const change2Msg = "change 2";
    let beforeUndo = 0;
    let afterUndo = 0;
    let undoAction = TxnAction.None;

    txns.onBeforeUndoRedo.addListener(() => afterUndo++);
    txns.onAfterUndoRedo.addListener((action) => { beforeUndo++; undoAction = action; });

    let elementId = imodel.elements.insertElement(props);
    assert.isFalse(txns.isRedoPossible);
    assert.isFalse(txns.isUndoPossible);
    assert.isTrue(txns.hasUnsavedChanges);
    assert.isFalse(txns.hasPendingTxns);

    imodel.saveChanges(change1Msg);
    assert.isFalse(txns.hasUnsavedChanges);
    assert.isTrue(txns.hasPendingTxns);
    assert.isTrue(txns.hasLocalChanges);

    let element = imodel.elements.getElement<TestPhysicalObject>(elementId);
    assert.equal(element.intProperty, 100, "int property should be 100");

    assert.isTrue(txns.isUndoPossible);  // we have an undoable Txn, but nothing undone.
    assert.equal(change1Msg, txns.getUndoString());
    assert.equal(IModelStatus.Success, txns.reverseSingleTxn());
    assert.isTrue(txns.isRedoPossible);
    assert.equal(change1Msg, txns.getRedoString());
    assert.equal(beforeUndo, 1);
    assert.equal(afterUndo, 1);
    assert.equal(undoAction, TxnAction.Reverse);

    assert.throws(() => imodel.elements.getElement(elementId), IModelError);
    assert.equal(IModelStatus.Success, txns.reinstateTxn());
    assert.isTrue(txns.isUndoPossible);
    assert.isFalse(txns.isRedoPossible);
    assert.equal(beforeUndo, 2);
    assert.equal(afterUndo, 2);
    assert.equal(undoAction, TxnAction.Reinstate);

    element = imodel.elements.getElement(elementId);
    element.intProperty = 200;
    element.update();

    imodel.saveChanges(change2Msg);
    element = imodel.elements.getElement(elementId);
    assert.equal(element.intProperty, 200, "int property should be 200");
    assert.equal(txns.getTxnDescription(txns.queryPreviousTxnId(txns.getCurrentTxnId())), change2Msg);

    assert.equal(IModelStatus.Success, txns.reverseSingleTxn());
    element = imodel.elements.getElement(elementId);
    assert.equal(element.intProperty, 100, "int property should be 100");

    // make sure abandon changes works.
    element.delete();
    assert.throws(() => imodel.elements.getElement(elementId), IModelError);
    imodel.abandonChanges(); //
    element = imodel.elements.getElement(elementId); // should be back now.
    imodel.elements.insertElement(props); // create a new element
    imodel.saveChanges(change2Msg);

    elementId = imodel.elements.insertElement(props); // create a new element
    assert.isTrue(txns.hasUnsavedChanges);
    assert.equal(IModelStatus.Success, txns.reverseSingleTxn());
    assert.isFalse(txns.hasUnsavedChanges);
    assert.throws(() => imodel.elements.getElement(elementId), IModelError); // reversing a txn with pending uncommitted changes should abandon them.
    assert.equal(IModelStatus.Success, txns.reinstateTxn());
    assert.throws(() => imodel.elements.getElement(elementId), IModelError); // doesn't come back, wasn't committed

    // verify multi-txn operations are undone/redone together
    const el1 = imodel.elements.insertElement(props);
    imodel.saveChanges("step 1");
    txns.beginMultiTxnOperation();
    assert.equal(1, txns.getMultiTxnOperationDepth());
    const el2 = imodel.elements.insertElement(props);
    imodel.saveChanges("step 2");
    const el3 = imodel.elements.insertElement(props);
    imodel.saveChanges("step 3");
    txns.endMultiTxnOperation();
    assert.equal(0, txns.getMultiTxnOperationDepth());
    assert.equal(IModelStatus.Success, txns.reverseSingleTxn());
    assert.throws(() => imodel.elements.getElement(el2), IModelError);
    assert.throws(() => imodel.elements.getElement(el3), IModelError);
    imodel.elements.getElement(el1);
    assert.equal(IModelStatus.Success, txns.reverseSingleTxn());
    assert.throws(() => imodel.elements.getElement(el1), IModelError);
    assert.equal(IModelStatus.Success, txns.reinstateTxn());
    assert.throws(() => imodel.elements.getElement(el2), IModelError);
    assert.throws(() => imodel.elements.getElement(el3), IModelError);
    imodel.elements.getElement(el1);
    assert.equal(IModelStatus.Success, txns.reinstateTxn());
    imodel.elements.getElement(el1);
    imodel.elements.getElement(el2);
    imodel.elements.getElement(el3);

    assert.equal(IModelStatus.Success, txns.cancelTo(txns.queryFirstTxnId()));
    assert.isFalse(txns.hasUnsavedChanges);
    assert.isFalse(txns.hasPendingTxns);
    assert.isFalse(txns.hasLocalChanges);
  });

  it("Element drives element events", async () => {
    assert.isDefined(imodel.getMetaData("TestBim:TestPhysicalObject"), "TestPhysicalObject is present");

    const el1 = imodel.elements.insertElement(props);
    const el2 = imodel.elements.insertElement(props);
    const ede = TestElementDrivesElement.create<TestElementDrivesElement>(imodel, el1, el2);
    ede.property1 = "test ede";
    ede.insert();

    const removals: VoidFunction[] = [];
    let beforeOutputsHandled = 0;
    let allInputsHandled = 0;
    let rootChanged = 0;
    let validateOutput = 0;
    let deletedDependency = 0;
    let commits = 0;
    let committed = 0;
    removals.push(TestElementDrivesElement.deletedDependency.addListener((evProps) => {
      assert.equal(evProps.sourceId, el1);
      assert.equal(evProps.targetId, el2);
      ++deletedDependency;
    }));
    removals.push(TestElementDrivesElement.rootChanged.addListener((evProps, im) => {
      const ede2 = im.relationships.getInstance<TestElementDrivesElement>(evProps.classFullName, evProps.id!);
      assert.equal(ede2.property1, ede.property1);
      assert.equal(evProps.sourceId, el1);
      assert.equal(evProps.targetId, el2);
      ++rootChanged;
    }));
    removals.push(TestElementDrivesElement.validateOutput.addListener((_props) => ++validateOutput));
    removals.push(TestPhysicalObject.beforeOutputsHandled.addListener((id) => {
      assert.equal(id, el1);
      ++beforeOutputsHandled;
    }));
    removals.push(TestPhysicalObject.allInputsHandled.addListener((id) => {
      assert.equal(id, el2);
      ++allInputsHandled;
    }));

    removals.push(imodel.txns.onCommit.addListener(() => commits++));
    removals.push(imodel.txns.onCommitted.addListener(() => committed++));

    imodel.saveChanges("step 1");
    assert.equal(commits, 1);
    assert.equal(committed, 1);
    assert.equal(beforeOutputsHandled, 1);
    assert.equal(allInputsHandled, 1);
    assert.equal(rootChanged, 1);
    assert.equal(validateOutput, 0);
    assert.equal(deletedDependency, 0);

    // NOTE: for this test, we're going to update the element we just inserted. The TxnManager relies on the last-modified-time of the element
    // to recognize that something changed about that element (unless you modify one of the properties of the Element *base class*).
    // Since the resolution of that value is milliseconds, we need to wait at least 1 millisecond
    // before we call update on the same element we just inserted.
    // We don't think this will be a problem in the real world.
    await BeDuration.wait(2); // wait 2 milliseconds, just for safety

    const element2 = imodel.elements.getElement<TestPhysicalObject>(el2);
    element2.update(); // since nothing really changed about this element, only the last-modified-time will change.
    imodel.saveChanges("step 2");
    assert.equal(commits, 2);
    assert.equal(committed, 2);

    assert.equal(allInputsHandled, 2, "allInputsHandled not called for update");
    assert.equal(beforeOutputsHandled, 2, "beforeOutputsHandled not called for update");
    assert.equal(rootChanged, 2, "rootChanged not called for update");
    assert.equal(validateOutput, 0, "validateOutput shouldn't be called for update");
    assert.equal(deletedDependency, 0, "deleteDependency shouldn't be called for update");
    removals.forEach((drop) => drop());
  });

});
