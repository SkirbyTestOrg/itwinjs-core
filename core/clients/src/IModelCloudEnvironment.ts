/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module iModelHubClient */
import { ClientRequestContext } from "@bentley/bentleyjs-core";
import { AccessToken } from "./Token";
import { UserInfo } from "./UserInfo";
import { Project, Asset } from "./ConnectClients";
import { AuthorizedClientRequestContext } from "./AuthorizedClientRequestContext";

/** How to discover "contexts". A context corresponds roughly to a "project" in Connect.
 * @internal
 */
export interface ContextManagerClient {
  queryProjectByName(requestContext: AuthorizedClientRequestContext, name: string): Promise<Project>;
  queryAssetByName(requestContext: AuthorizedClientRequestContext, name: string): Promise<Asset>;
}

/** User-authorization service.
 * @internal
 */
export interface IModelAuthorizationClient {
  authorizeUser(requestContext: ClientRequestContext, userInfo: UserInfo | undefined, userCredentials: any): Promise<AccessToken>;
}

/** All of the services that a frontend or other client app needs to find and access iModels.
 * @internal
 */
export interface IModelCloudEnvironment {
  readonly isIModelHub: boolean;
  readonly authorization: IModelAuthorizationClient;
  readonly contextMgr: ContextManagerClient;
  startup(): Promise<void>;
  shutdown(): Promise<number>;
}
