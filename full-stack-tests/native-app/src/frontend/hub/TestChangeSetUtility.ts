/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { TestRpcInterface } from "../../common/RpcInterfaces";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { TestUserCredentials, getAccessTokenFromBackend } from "@bentley/oidc-signin-tool/lib/frontend";
import { TestAuthorizationClient, TestUsers } from "@bentley/oidc-signin-tool/lib/TestUsers";
import { AuthorizationClient } from "@bentley/itwin-client";

/** Test utility to push an iModel and ChangeSets */
export class TestChangeSetUtility {

  private _backupAuthorizationClient?: AuthorizationClient;
  private _testAuthorizationClient?: TestAuthorizationClient;

  private setTestAuthorizationClient() {
    this._backupAuthorizationClient = IModelApp.authorizationClient;
    IModelApp.authorizationClient = this._testAuthorizationClient;
  }

  private resetTestAuthorizationClient() {
    IModelApp.authorizationClient = this._backupAuthorizationClient;
  }

  // Initializes the utility
  public async initialize(projectName: string, iModelBaseName: string, user: TestUserCredentials = TestUsers.manager) {
    const accessToken = await getAccessTokenFromBackend(user);
    this._testAuthorizationClient = new TestAuthorizationClient(accessToken);

    this.setTestAuthorizationClient();
    await TestRpcInterface.getClient().initTestChangeSetUtility(projectName, iModelBaseName);
    this.resetTestAuthorizationClient();
  }

  // Creates a test iModel and returns it's id
  public async createTestIModel(): Promise<string> {
    this.setTestAuthorizationClient();
    const iModelId = TestRpcInterface.getClient().createTestIModel();
    this.resetTestAuthorizationClient();
    return iModelId;
  }

  // Pushes a test change set to the previously created test iModel
  public async pushTestChangeSet(): Promise<void> {
    this.setTestAuthorizationClient();
    await TestRpcInterface.getClient().pushTestChangeSet();
    this.resetTestAuthorizationClient();
  }

  // Deletes the test iModel
  public async deleteTestIModel(): Promise<void> {
    this.setTestAuthorizationClient();
    await TestRpcInterface.getClient().deleteTestIModel();
    this.resetTestAuthorizationClient();
  }
}
