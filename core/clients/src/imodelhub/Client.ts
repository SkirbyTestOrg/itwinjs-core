/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module iModelHub */

import { AccessToken, AuthorizationToken } from "../Token";
import { IModelClient } from "../IModelClient";
import { FileHandler } from "../";
import { IModelBaseHandler } from "./BaseHandler";
import { ArgumentCheck } from "./Errors";
import { ActivityLoggingContext } from "@bentley/bentleyjs-core";

/**
 * Class that allows access to different iModelHub class handlers. Handlers should be accessed through an instance of this class, rather than constructed directly.
 */
export class IModelHubClient extends IModelClient {
  /**
   * Create an instance of IModelHubClient.
   * @param fileHandler File handler to handle file upload/download and file system operations. See [[AzureFileHandler]].
   */
  public constructor(fileHandler?: FileHandler) {
    super(new IModelBaseHandler(), fileHandler);
  }

  /**
   * Get the (delegation) access token to access the service
   * @param authorizationToken Authorization token.
   * @returns Resolves to the (delegation) access token.
   * @throws [[IModelHubClientError]] with [IModelHubStatus.UndefinedArgumentError]($bentley) if authorizationToken is undefined.
   * @throws [[ResponseError]] if request to delegation service failed.
   * @throws Error if failed to parse response.
   */
  public async getAccessToken(alctx: ActivityLoggingContext, authorizationToken: AuthorizationToken): Promise<AccessToken> {
    ArgumentCheck.defined("authorizationToken", authorizationToken);
    return this._handler.getAccessToken(alctx, authorizationToken);
  }
}
