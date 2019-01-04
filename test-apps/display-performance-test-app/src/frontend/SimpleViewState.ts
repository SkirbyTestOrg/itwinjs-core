/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { AccessToken, HubIModel, Project } from "@bentley/imodeljs-clients";
import { IModelConnection, ViewState, Viewport } from "@bentley/imodeljs-frontend";
import { ViewDefinitionProps } from "@bentley/imodeljs-common";
import { ConnectProjectConfiguration } from "../common/SVTConfiguration";

/** Global information on the currently opened iModel and the state of the view. */
export class SimpleViewState {
  public accessToken?: AccessToken;
  public project?: Project;
  public iModel?: HubIModel;
  public iModelConnection?: IModelConnection;
  public viewDefinition?: ViewDefinitionProps;
  public viewState?: ViewState;
  public viewPort?: Viewport;
  public projectConfig?: ConnectProjectConfiguration;
  constructor() { }
}
