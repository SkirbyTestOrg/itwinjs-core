/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import * as chai from "chai";
import { IModelHubClient, Version } from "../imodelhub";
import { TilesGeneratorClient, Job } from "../TilesGeneratorClient";
import { AuthorizationToken, AccessToken } from "../Token";
import { TestConfig } from "./TestConfig";
import { RequestQueryOptions } from "../Request";
import { RealityDataServicesClient, RealityData } from "../RealityDataServicesClient";

chai.should();

describe("RealityDataServicesClient", () => {

  let accessToken: AccessToken;
  const imodelHubClient: IModelHubClient = new IModelHubClient("DEV");
  const tilesGeneratorClient: TilesGeneratorClient = new TilesGeneratorClient("DEV");
  const realityDataServiceClient: RealityDataServicesClient = new RealityDataServicesClient("DEV");
  const projectId: string = "b2101b1a-0c1f-451e-97f2-6599bf900d36";
  const iModelId: string = "0c315eb1-d10c-4449-9c09-f36d54ad37f2";
  let versionId: string;
  let tilesId: string;

  before(async function (this: Mocha.IHookCallbackContext) {
    if (TestConfig.enableMocks)
      this.skip();

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const authToken: AuthorizationToken = await TestConfig.login();
    accessToken = await realityDataServiceClient.getAccessToken(authToken);

    const imodelHubToken = await imodelHubClient.getAccessToken(authToken);
    const versions: Version[] = await imodelHubClient.Versions().get(imodelHubToken, iModelId);
    chai.expect(versions);
    versionId = versions[0].wsgId;
    chai.expect(versionId);

    // Update access token to that for TilesGeneratorClient
    const tilesGeneratorToken = await tilesGeneratorClient.getAccessToken(authToken);
    const instanceId: string = `${projectId}--${iModelId}--${versionId}`;
    const queryOptions: RequestQueryOptions = {
      $select: "*",
      $filter: `$id+eq+'${instanceId}'`,
    };

    const job: Job = await tilesGeneratorClient.getJob(tilesGeneratorToken, queryOptions);
    chai.expect(job);

    chai.expect(job.tilesId);
    tilesId = job.tilesId!;
  });

  it("should setup its URLs", async () => {
    let url: string = await new RealityDataServicesClient("DEV").getUrl(true);
    chai.expect(url).equals("https://dev-realitydataservices-eus.cloudapp.net");

    url = await new RealityDataServicesClient("QA").getUrl(true);
    chai.expect(url).equals("https://qa-connect-realitydataservices.bentley.com");

    url = await new RealityDataServicesClient("PROD").getUrl(true);
    chai.expect(url).equals("https://connect-realitydataservices.bentley.com");

    url = await new RealityDataServicesClient("PERF").getUrl(true);
    chai.expect(url).equals("https://perf-realitydataservices-eus.cloudapp.net");
  });

  it("should be able to retrieve reality data properties", async () => {

    const realityData: RealityData[] = await realityDataServiceClient.getRealityData(accessToken, projectId, tilesId);

    chai.assert(realityData);
  });

  it("should be able to retrieve app data json blob url", async () => {

    const url: string = await realityDataServiceClient.getAppDataBlobUrl(accessToken, projectId, tilesId);

    chai.assert(url);
  });

  it("should be able to get app data json", async () => {

    const appData: any = await realityDataServiceClient.getAppData(accessToken, projectId, tilesId);

    chai.assert(appData);
  });

  it("should be able to get model data json", async () => {

    const appData: any = await realityDataServiceClient.getAppData(accessToken, projectId, tilesId);
    const appDataJson = JSON.parse(appData.toString("utf8"));

    const modelName = appDataJson.models[Object.keys(appDataJson.models)[0]].tilesetUrl;

    chai.assert(appData);
    chai.assert(modelName);

    const modelData: any = await realityDataServiceClient.getModelData(accessToken, projectId, tilesId, modelName);

    chai.assert(modelData);
  });

  it("should be able to get model data content", async () => {

    const appData: any = await realityDataServiceClient.getAppData(accessToken, projectId, tilesId);
    const appDataJson = JSON.parse(appData.toString("utf8"));
    const modelName = appDataJson.models[Object.keys(appDataJson.models)[0]].tilesetUrl;

    chai.assert(appData);
    chai.assert(modelName);

    const modelData: any = await realityDataServiceClient.getModelData(accessToken, projectId, tilesId, modelName);
    const modelDataJson = JSON.parse(modelData.toString("utf8"));

    let contentPath = modelDataJson.root.content.url;
    contentPath = `TileSets//Bim//${contentPath.split(".")[0]}/${contentPath}`;

    const data: any = await realityDataServiceClient.getTileContent(accessToken, projectId, tilesId, contentPath);

    chai.assert(data);
  });

});
