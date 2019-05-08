/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { ConnectClient, Project, AuthorizedClientRequestContext } from "@bentley/imodeljs-clients";
import { AuthorizedFrontendRequestContext } from "@bentley/imodeljs-frontend";
import { showStatus } from "./Utils";
import { SimpleViewState } from "./SimpleViewState";

/** Parameters for starting display-test-app with a specified initial configuration */

export enum ProjectScope {
  Favorites,
  MostRecentlyUsed,
  Invited,
  All,
}

// Logic to establish a connection to a Connect-hosted project and iModel
let _connectClient!: ConnectClient;

async function getProjectByName(requestContext: AuthorizedClientRequestContext, projectName: string): Promise<Project | undefined> {
  let project: Project;
  try {
    project = await _connectClient.getProject(requestContext, { $filter: `Name+eq+'${projectName}'` });
  } catch (e) {
    console.log(`Project with name "${projectName}" does not exist`); // tslint:disable-line:no-console
    return undefined;
  }

  return project;
}

export async function initializeIModelHub(state: SimpleViewState): Promise<void> {
  _connectClient = new ConnectClient();

  showStatus("opening Project", state.projectConfig!.projectName);

  const requestContext = await AuthorizedFrontendRequestContext.create();
  state.project = await getProjectByName(requestContext, state.projectConfig!.projectName);
}
