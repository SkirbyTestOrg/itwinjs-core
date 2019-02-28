/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import * as chai from "chai";
import { ConnectClient, Project, ConnectRequestQueryOptions } from "../ConnectClients";
import { AuthorizationToken, AccessToken } from "../Token";
import { TestConfig } from "./TestConfig";
import { ActivityLoggingContext } from "@bentley/bentleyjs-core";

chai.should();
describe("ConnectClient (#integration)", () => {
  let accessToken: AccessToken;
  const connectClient: ConnectClient = new ConnectClient();
  const actx = new ActivityLoggingContext("");
  before(async function (this: Mocha.IHookCallbackContext) {
    this.enableTimeouts(false);
    const authToken: AuthorizationToken = await TestConfig.login();
    accessToken = await connectClient.getAccessToken(actx, authToken);
  });

  it("should get a list of projects (#integration)", async function (this: Mocha.ITestCallbackContext) {
    const queryOptions: ConnectRequestQueryOptions = {
      $select: "*",
      $top: 20,
    };

    const projects: Project[] = await connectClient.getProjects(actx, accessToken, queryOptions);
    chai.expect(projects.length).greaterThan(10);
  });

  it("should get a list of Most Recently Used (MRU) projects (#integration)", async function (this: Mocha.ITestCallbackContext) {
    const queryOptions: ConnectRequestQueryOptions = {
      $select: "*",
      $top: 20,
      isMRU: true,
    };

    const projects: Project[] = await connectClient.getProjects(actx, accessToken, queryOptions);
    chai.expect(projects.length).greaterThan(5);
  });

  it("should get a list of Favorite projects (#integration)", async function (this: Mocha.ITestCallbackContext) {
    const queryOptions: ConnectRequestQueryOptions = {
      $select: "*",
      $top: 20,
      isFavorite: true,
    };

    const projects: Project[] = await connectClient.getProjects(actx, accessToken, queryOptions);
    chai.expect(projects.length).to.be.greaterThan(0);
  });

  it("should get a project by name (#integration)", async function (this: Mocha.ITestCallbackContext) {
    const queryOptions: ConnectRequestQueryOptions = {
      $select: "*",
      $filter: "Name+eq+'" + TestConfig.projectName + "'",
    };
    const project: Project = await connectClient.getProject(actx, accessToken, queryOptions);
    chai.expect(project.name).equals(TestConfig.projectName);
  });

  it("should get a list of invited projects (#integration)", async function (this: Mocha.ITestCallbackContext) {
    const invitedProjects: Project[] = await connectClient.getInvitedProjects(actx, accessToken);
    chai.expect(invitedProjects.length).greaterThan(5); // TODO: Setup a private test user where we can maintain a more strict control of invited projects.
  });

});
