/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import * as chai from "chai";
// import { Version } from "../imodelhub/Versions";
import { AuthorizationToken, AccessToken } from "../Token";
import { TestConfig } from "./TestConfig";
import { RealityDataServicesClient, RealityData } from "../RealityDataServicesClient";
// import { IModelHubClient } from "../imodeljs-clients";
import { ActivityLoggingContext } from "@bentley/bentleyjs-core";
import { Range2d } from "@bentley/geometry-core";

chai.should();

describe.skip("RealityDataServicesClient", () => {

  let accessToken: AccessToken;
  // const imodelHubClient: IModelHubClient = new IModelHubClient();
  const realityDataServiceClient: RealityDataServicesClient = new RealityDataServicesClient();
  const projectId: string = "fb1696c8-c074-4c76-a539-a5546e048cc6";
  // const iModelId: string = "0c315eb1-d10c-4449-9c09-f36d54ad37f2";
  // let versionId: string;
  const tilesId: string = "593eff78-b757-4c07-84b2-a8fe31c19927";
  const tilesIdWithRootDocPath: string = "3317b4a0-0086-4f16-a979-6ceb496d785e";

  const actx = new ActivityLoggingContext("");

  before(async function (this: Mocha.IHookCallbackContext) {

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const authToken: AuthorizationToken = await TestConfig.login();
    accessToken = await realityDataServiceClient.getAccessToken(actx, authToken);

    // const imodelHubToken = await imodelHubClient.getAccessToken(actx, authToken);
    // const versions: Version[] = await imodelHubClient.versions.get(actx, imodelHubToken, iModelId);
    // chai.expect(versions);
    // versionId = versions[0].wsgId;
    // chai.expect(versionId);

    // const instanceId: string = `${projectId}--${iModelId}--${versionId}`;
    // const queryOptions: RequestQueryOptions = {
    //   $select: "*",
    //   $filter: `$id+eq+'${instanceId}'`,
    // };

    chai.expect(tilesId);
  });

  it("should be able to retrieve reality data properties  (#integration)", async function (this: Mocha.ITestCallbackContext) {
    const realityData: RealityData = await realityDataServiceClient.getRealityData(actx, accessToken, projectId, tilesId);
    chai.assert(realityData);
    chai.assert(realityData.id === tilesId);
    chai.assert(realityData.client);
    chai.assert(realityData.projectId === projectId);
  });

  it("should be able to retrieve reality data properties for every reality data associated to project (#integration)", async function (this: Mocha.ITestCallbackContext) {
    const realityData: RealityData[] = await realityDataServiceClient.getRealityDataInProject(actx, accessToken, projectId);

    realityData.forEach((value) => {
      chai.assert(value.type === "RealityMesh3DTiles"); // iModelJS only supports this type
      chai.assert(value.rootDocument && value.rootDocument !== ""); // All such type require a root document to work correctly
      chai.assert(value.projectId === projectId);
      chai.assert(value.id);
    });

    chai.assert(realityData);
  });

  it("should be able to retrieve reality data properties for every reality data associated to project within an extent (#integration)", async function (this: Mocha.ITestCallbackContext) {
    const theRange = Range2d.createXYXY(-80 * 3.1416 / 180, 39 * 3.1416 / 180, -74 * 3.1416 / 180, 42 * 3.1416 / 180); // Range encloses Pensylvania and should gather Shell project
    const realityData: RealityData[] = await realityDataServiceClient.getRealityDataInProjectOverlapping(actx, accessToken, projectId, theRange);

    realityData.forEach((value) => {
      chai.assert(value.type === "RealityMesh3DTiles"); // iModelJS only supports this type
      chai.assert(value.rootDocument && value.rootDocument !== ""); // All such type require a root document to work correctly
      chai.assert(value.projectId === projectId);
      chai.assert(value.id);
    });

    chai.assert(realityData);
  });

  it("should be able to retrieve app data json blob url  (#integration)", async function (this: Mocha.ITestCallbackContext) {
    const realityData: RealityData = await realityDataServiceClient.getRealityData(actx, accessToken, projectId, tilesId);

    const url: string = await realityData.getRootDocumentJson(actx, accessToken);

    chai.assert(url);
  });

  it("should be able to get model data json  (#integration)", async function (this: Mocha.ITestCallbackContext) {
    const realityData: RealityData = await realityDataServiceClient.getRealityData(actx, accessToken, projectId, tilesId);

    const rootData: any = await realityData.getRootDocumentJson(actx, accessToken);
    chai.assert(rootData);

    const rootDataJson = JSON.parse(rootData.toString("utf8"));

    const modelName = rootDataJson.root.children[0].content.url;
    chai.assert(modelName);

    const modelData: any = await realityData.getModelData(actx, accessToken, modelName);

    chai.assert(modelData);
  });

  it("should be able to get model data content  (#integration)", async function (this: Mocha.ITestCallbackContext) {
    const realityData: RealityData = await realityDataServiceClient.getRealityData(actx, accessToken, projectId, tilesId);

    const rootData: any = await realityData.getRootDocumentJson(actx, accessToken);
    const rootDataJson = JSON.parse(rootData.toString("utf8"));

    const modelName = rootDataJson.root.children[0].content.url;

    chai.assert(rootData);
    chai.assert(modelName);

    const modelData: any = await realityData.getModelData(actx, accessToken, modelName);

    chai.assert(modelData);
  });

  it("should be able to get model data content with root doc not at blob root (root doc path) (#integration)", async function (this: Mocha.ITestCallbackContext) {
    const realityData: RealityData = await realityDataServiceClient.getRealityData(actx, accessToken, projectId, tilesIdWithRootDocPath);

    // The root document of this reality should not be at the root of the blob
    const rootParts = realityData.rootDocument!.split("/");
    chai.assert(rootParts.length >= 2);
    rootParts.pop();
    const rootDocPath: string = rootParts.join("/") + "/";

    const rootData: any = await realityData.getRootDocumentJson(actx, accessToken);
    const rootDataJson = JSON.parse(rootData.toString("utf8"));

    const modelName = rootDataJson.root.children[0].children[0].content.url;

    chai.assert(rootData);
    chai.assert(modelName);

    let exceptionThrown: boolean = false;
    try {
      // Should fail as we call with an incorrect content path.
      const data: any = await realityData.getTileContent(actx, accessToken, modelName);
      chai.assert(!data); /// Should never be reached.
    } catch {
      exceptionThrown = true;
    }
    chai.assert(exceptionThrown);

    // Should succeed as we call with added root document path
    const data2: any = await realityData.getTileContent(actx, accessToken, rootDocPath + modelName, false);

    chai.assert(data2);

    // Should succeed as we call with indicate that path is relative to root path
    const data3: any = await realityData.getTileContent(actx, accessToken, modelName, true);

    chai.assert(data3);
  });

});
