/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import { AuthorizationToken, AccessToken, ImsActiveSecureTokenClient, ImsDelegationSecureTokenClient } from "@build/imodeljs-core/node_modules/@bentley/imodeljs-clients";
import { ConnectClient, Project, IModelHubClient } from "@build/imodeljs-core/node_modules/@bentley/imodeljs-clients";

export class TestData {
  public static user = {
    email: "bistroDEV_pmadm1@mailinator.com",
    password: "pmadm1",
  };

  public static connectClient = new ConnectClient("QA");
  public static hubClient = new IModelHubClient("QA");
  public static accessToken: AccessToken;
  public static testProjectId: string;
  public static testIModelId: string;
  public static testChangeSetId: string;

  public static async load() {
    TestData.accessToken = await TestData.getTestUserAccessToken();
    TestData.testProjectId = await TestData.getTestProjectId(TestData.accessToken, "NodeJsTestProject");
    TestData.testIModelId = await TestData.getTestIModelId(TestData.accessToken, TestData.testProjectId, "MyTestModel");
  }

  public static async getTestUserAccessToken(): Promise<AccessToken> {
    const authToken: AuthorizationToken = await (new ImsActiveSecureTokenClient("QA")).getToken(TestData.user.email, TestData.user.password);
    assert(authToken);

    const accessToken = await (new ImsDelegationSecureTokenClient("QA")).getToken(authToken!);
    assert(accessToken);

    return accessToken;
  }

  public static async getTestProjectId(accessToken: AccessToken, projectName: string): Promise<string> {
    const project: Project = await TestData.connectClient.getProject(accessToken, {
      $select: "*",
      $filter: "Name+eq+'" + projectName + "'",
    });
    assert(project && project.wsgId);
    return project.wsgId;
  }

  public static async getTestIModelId(accessToken: AccessToken, projectId: string, iModelName: string): Promise<string> {
    const iModels = await TestData.hubClient.getIModels(accessToken, projectId, {
      $select: "*",
      $filter: "Name+eq+'" + iModelName + "'",
    });
    assert(iModels.length > 0);
    assert(iModels[0].wsgId);

    return iModels[0].wsgId;
  }

}
