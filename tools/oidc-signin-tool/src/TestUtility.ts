/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { AccessToken, AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { TestBrowserAuthorizationClient } from "./TestBrowserAuthorizationClient";
import { TestBrowserAuthorizationClientConfiguration, TestUserCredentials, TestUsers } from "./TestUsers";

/**
 * A set of convenience methods to get an Access Token, AuthorizationClient or an AuthorizedClientRequestContext for a given TestUserCredential.
 *
 * @internal
 */
export class TestUtility {
  private static _clients = new Map<string, TestBrowserAuthorizationClient>();

  /**
   * Gets the authorization client for the specified iModel.js test user.
   * - Caches the client for future use.
   * - Uses the default iModel.js internal OIDC SPA client registration by default.
   * @param user Test user credentials
   * @param oidcConfig Test oidc configuration to use for the provided user
   * @internal
   */
  public static getAuthorizationClient(user: TestUserCredentials, oidcConfig?: TestBrowserAuthorizationClientConfiguration): TestBrowserAuthorizationClient {
    let client = this._clients.get(user.email);
    if (client !== undefined)
      return client;

    const config = undefined === oidcConfig ? TestUsers.getTestBrowserAuthorizationClientConfiguration() : oidcConfig;
    client = new TestBrowserAuthorizationClient(config, user);
    this._clients.set(user.email, client);
    return client;
  }

  /**
   * Get the access token for the specified iModel.js test user.
   * - Retrieves a previously cached token if that's available, or otherwise uses [[TestBrowserAuthorizationClient]]
   * to signin the user through a headless browser.
   * - Uses the default iModel.js internal OIDC SPA client registration
   * @param user Test user credentials
   * @internal
   */
  public static async getAccessToken(user: TestUserCredentials): Promise<AccessToken> {
    const client = this.getAuthorizationClient(user);
    return client.getAccessToken();
  }

  /**
   * Create or retrieve the client request context for the specified iModel.js test user
   * - A previously cached token is reused if available to construct the context, or otherwise uses [[TestBrowserAuthorizationClient]]
   * to signin the user through a headless browser.
   * - Uses the default iModel.js internal OIDC SPA client registration
   * @param user Test user credentials
   * @internal
   */
  public static async getAuthorizedClientRequestContext(user: TestUserCredentials): Promise<AuthorizedClientRequestContext> {
    const accessToken = await this.getAccessToken(user);
    return new AuthorizedClientRequestContext(accessToken);
  }
}
