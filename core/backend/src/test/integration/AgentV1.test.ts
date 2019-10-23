/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import { ClientRequestContext } from "@bentley/bentleyjs-core";
import { IModelVersion } from "@bentley/imodeljs-common";
import { Config, AccessToken } from "@bentley/imodeljs-clients";
import { OidcAgentClientConfigurationV1, OidcAgentClientV1 } from "@bentley/imodeljs-clients-backend";
import { IModelTestUtils } from "../IModelTestUtils";
import { IModelDb, OpenParams, AuthorizedBackendRequestContext } from "../../imodeljs-backend";
import { HubUtility } from "./HubUtility";

describe("AgentV1 (#integration)", () => {

  let agentConfiguration: OidcAgentClientConfigurationV1;

  before(async () => {
    IModelTestUtils.setupLogging();
    // IModelTestUtils.setupDebugLogLevels();

    agentConfiguration = {
      clientId: Config.App.getString("imjs_agent_v1_test_client_id"),
      clientSecret: Config.App.getString("imjs_agent_v1_test_client_secret"),
      serviceUserEmail: Config.App.getString("imjs_agent_v1_test_service_user_email"),
      serviceUserPassword: Config.App.getString("imjs_agent_v1_test_service_user_password"),
      scope: "openid email profile organization context-registry-service imodelhub",
    };

  });

  it("Agent should be able to open an iModel Readonly", async () => {
    const agentClient = new OidcAgentClientV1(agentConfiguration);
    const jwt: AccessToken = await agentClient.getToken(new ClientRequestContext());
    const requestContext = new AuthorizedBackendRequestContext(jwt);

    const testProjectId = await HubUtility.queryProjectIdByName(requestContext, "iModelJsIntegrationTest");
    const testIModelId = await HubUtility.queryIModelIdByName(requestContext, testProjectId, "ReadOnlyTest");

    const iModelDb = await IModelDb.open(requestContext, testProjectId, testIModelId, OpenParams.fixedVersion(), IModelVersion.latest());
    assert.isDefined(iModelDb);
  });

  it("Agent should be able to open an iModel ReadWrite", async () => {
    const agentClient = new OidcAgentClientV1(agentConfiguration);
    const jwt: AccessToken = await agentClient.getToken(new ClientRequestContext());
    const requestContext = new AuthorizedBackendRequestContext(jwt);

    const testProjectId = await HubUtility.queryProjectIdByName(requestContext, "iModelJsIntegrationTest");
    const testIModelId = await HubUtility.queryIModelIdByName(requestContext, testProjectId, "ReadWriteTest");

    const iModelDb = await IModelDb.open(requestContext, testProjectId, testIModelId, OpenParams.pullAndPush(), IModelVersion.latest());
    assert.isDefined(iModelDb);
  });

});
