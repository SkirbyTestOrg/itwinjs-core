/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import { IModelApp, IModelConnection, NoRenderApp } from "@bentley/imodeljs-frontend";
import { StandaloneIModelRpcInterface, IModelToken, IModelReadRpcInterface, IModelWriteRpcInterface } from "@bentley/imodeljs-common";
import { RobotWorldReadRpcInterface, RobotWorldWriteRpcInterface } from "../../common/RobotWorldRpcInterface";
import { RobotWorldEngine } from "../RobotWorldEngine";
import { KnownTestLocations } from "./KnownTestLocations";
import { OpenMode, Id64String, Id64, ActivityLoggingContext } from "@bentley/bentleyjs-core";
import { IModelTestUtils } from "./Utils";
import { Point3d, Angle } from "@bentley/geometry-core";
import { TestRpcManager } from "@bentley/imodeljs-common/lib/rpc/TestRpcManager";
import { RobotWorld } from "../RobotWorldSchema";

const actx = new ActivityLoggingContext("<backend-initialization>");

function simulateBackendDeployment() {
  RobotWorldEngine.initialize(actx);
}

function simulateBackendShutdown() {
  RobotWorldEngine.shutdown();
}

const bimName = "RobotWorldRpc.bim";

async function setUpTest() {
  // Make a copy for the tests to work on
  let cc = IModelTestUtils.openIModel("empty.bim", { copyFilename: bimName, deleteFirst: true, openMode: OpenMode.ReadWrite });
  await RobotWorld.importSchema(actx, cc);
  cc.saveChanges();
  cc.closeStandalone();
  cc = IModelTestUtils.openIModelFromOut(bimName, { openMode: OpenMode.ReadWrite });
  IModelTestUtils.createNewModel(cc.elements.getRootSubject(), "test", true);
  cc.saveChanges();
  cc.closeStandalone();
}

describe("RobotWorldRpc", () => {

  // This node-based implementation of XHR is *not* required by our RPC mechanism. It is required by our
  // I18n module (specifically the i18next package).
  (global as any).XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest; // tslint:disable-line:no-var-requires

  it("should run robotWorld through RPC as a client", async () => {
    // Simulate the deployment of the backend server
    simulateBackendDeployment();

    await setUpTest();  // tricky: do this after simulateBackendDeployment, as that function has the side effect of initializing IModelHost

    NoRenderApp.startup();

    // expose interfaces using a direct call mechanism
    TestRpcManager.initialize([StandaloneIModelRpcInterface, IModelReadRpcInterface, IModelWriteRpcInterface, RobotWorldReadRpcInterface, RobotWorldWriteRpcInterface]);
    const roWrite = RobotWorldWriteRpcInterface.getClient();
    const roRead = RobotWorldReadRpcInterface.getClient();

    const iModel: IModelConnection = await IModelConnection.openStandalone(KnownTestLocations.outputDir + "/" + bimName, OpenMode.ReadWrite);
    assert.isTrue(iModel !== undefined);
    const iToken: IModelToken = iModel.iModelToken;

    let modelId!: Id64String;
    for (const modelStr of await iModel.queryEntityIds({ from: "bis:element", where: "CodeValue='test'" }))
      modelId = Id64.fromString(modelStr);

    //  Initial placement: Robot1 is not touching any barrier (or other robot)
    //
    //  |
    //  |<---barrier1------->
    //  |                   ^
    //  |                   |
    //  |                   barrier2
    //  |                   |
    //  |R1                 V
    //  +-- -- -- -- -- -- --
    const robot1Id = await roWrite.insertRobot(iToken, modelId, "r1", Point3d.create(0, 0, 0));
    const barrier1Id = await roWrite.insertBarrier(iToken, modelId, Point3d.create(0, 5, 0), Angle.createDegrees(0), 5);
    const barrier2Id = await roWrite.insertBarrier(iToken, modelId, Point3d.create(5, 0, 0), Angle.createDegrees(90), 5);

    await iModel.saveChanges();
    const barrier1 = (await iModel.elements.getProps(barrier1Id))[0];
    /* const barrier2 = */
    await iModel.elements.getProps(barrier2Id);
    assert.equal(await roRead.countRobots(iToken), 1);

    const hits0 = await roRead.queryObstaclesHitByRobot(iToken, robot1Id);
    assert.equal(hits0.length, 0, "no collisions initially");

    //  Move Robot1 up, so that it touches barrier1 but not barrier2
    //
    //  |
    //  |<---barrier1------->
    //  |R1                 ^
    //  |                   |
    //  |                   barrier2
    //  |                   |
    //  |                   V
    //  +-- -- -- -- -- -- --
    if (true) {
      roWrite.moveRobot(iToken, robot1Id, barrier1.placement.origin);
      await iModel.saveChanges();
      const r1 = (await iModel.elements.getProps(robot1Id))[0];
      assert.deepEqual(r1.placement.origin, barrier1.placement.origin);
      const barriersHit = await roRead.queryObstaclesHitByRobot(iToken, robot1Id);
      assert.equal(barriersHit.length, 1, "expect a collision");
      assert.equal(barriersHit[0].toString(), barrier1.id);
    }

    await iModel.closeStandalone();

    IModelApp.shutdown();

    simulateBackendShutdown();
  });
});

// __PUBLISH_EXTRACT_START__ RpcInterface.initializeClientBentleyCloudApp
import { BentleyCloudRpcManager, BentleyCloudRpcParams, RpcInterfaceDefinition } from "@bentley/imodeljs-common";

export function initializeRpcClientBentleyCloudForApp(interfaces: RpcInterfaceDefinition[]) {
  const cloudParams: BentleyCloudRpcParams = { info: { title: "RobotWorldEngine", version: "v1.0" } };
  BentleyCloudRpcManager.initializeClient(cloudParams, interfaces);
}
// __PUBLISH_EXTRACT_END__

// __PUBLISH_EXTRACT_START__ RpcInterface.initializeClientBentleyCloudRemote
export function initializeRpcClientBentleyCloud(interfaces: RpcInterfaceDefinition[], serviceUrl?: string) {
  const cloudParams: BentleyCloudRpcParams = { info: { title: "RobotWorldEngine", version: "v1.0" }, uriPrefix: serviceUrl };
  BentleyCloudRpcManager.initializeClient(cloudParams, interfaces);
}
// __PUBLISH_EXTRACT_END__

// __PUBLISH_EXTRACT_START__ RpcInterface.initializeClientDesktop
import { ElectronRpcManager } from "@bentley/imodeljs-common";

export function initializeRpcClientDesktop(interfaces: RpcInterfaceDefinition[]) {
  ElectronRpcManager.initializeClient({}, interfaces);
}
// __PUBLISH_EXTRACT_END__
