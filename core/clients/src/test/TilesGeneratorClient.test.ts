/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import * as chai from "chai";
import { ConnectClient } from "../ConnectClients";
import { TilesGeneratorClient, Job } from "../TilesGeneratorClient";
import { AuthorizationToken, AccessToken } from "../Token";
import { TestConfig } from "./TestConfig";
import { RequestQueryOptions } from "../Request";
import { ActivityLoggingContext } from "@bentley/bentleyjs-core";
chai.should();

describe("TilesGeneratorClient", () => {
  let accessToken: AccessToken;
  const connectClient = new ConnectClient();
  const tilesGeneratorClient: TilesGeneratorClient = new TilesGeneratorClient();
  let projectId: string;
  let iModelId: string;
  let versionId: string;
  const actx = new ActivityLoggingContext("");

  before(async function (this: Mocha.IHookCallbackContext) {
    this.enableTimeouts(false);
    const authToken: AuthorizationToken = await TestConfig.login();
    accessToken = await connectClient.getAccessToken(actx, authToken);

    const { project, iModel, version } = await TestConfig.queryTestCase(accessToken, "Hackathon", "Demo - ChangeSets", "First stage");

    projectId = project.wsgId;
    chai.expect(projectId);

    iModelId = iModel!.wsgId;
    chai.expect(iModelId);

    versionId = version!.wsgId;
    chai.expect(versionId);

    // Update access token to that for TilesGeneratorClient
    accessToken = await tilesGeneratorClient.getAccessToken(actx, authToken);
  });

  it("should be able to retrieve a tile generator job  (#integration)", async function (this: Mocha.ITestCallbackContext) {
    // The service can be queried ONLY by single instance ID filter.
    const instanceId: string = `${projectId}--${iModelId}--${versionId}`;
    const queryOptions: RequestQueryOptions = {
      $select: "*",
      $filter: `$id+eq+'${instanceId}'`,
    };

    const job: Job = await tilesGeneratorClient.getJob(actx, accessToken, queryOptions);
    // console.log(JSON.stringify(job));

    chai.assert(job);
    chai.expect(job.contextId).equals(projectId);
    chai.expect(job.documentId).equals(iModelId);
    chai.expect(job.versionId).equals(versionId);
    chai.expect(job.dataId).equals("6541fcb4-d1fa-4c58-8385-d73c9459d6d6");
    chai.expect(job.tilesId).equals("8ee4458a-53e2-46c3-af7c-e2a1cd5b08d1");
    chai.expect(job.wsgId).equals(instanceId);
  });

});
