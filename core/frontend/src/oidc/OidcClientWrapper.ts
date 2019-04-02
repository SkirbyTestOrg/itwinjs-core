/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module OIDC */
import { ClientRequestContext } from "@bentley/bentleyjs-core";
import { IOidcFrontendClient, OidcFrontendClientConfiguration } from "@bentley/imodeljs-clients";
import { ElectronRpcConfiguration, MobileRpcConfiguration } from "@bentley/imodeljs-common";
import { OidcBrowserClient } from "./OidcBrowserClient";
import { OidcIOSClient } from "./OidcIOSClient";

let OidcClient: any; // tslint:disable-line:variable-name
if (ElectronRpcConfiguration.isElectron) {
  // TODO: Need to figure a way to load a module that contains OidcDeviceClient, and
  // eventually migrate that to a separate imodeljs-clients-device package.
  OidcClient = OidcBrowserClient; // eval("require")("@bentley/imodeljs-clients-backend").OidcDeviceClient; // tslint:disable-line:no-eval
} else if (MobileRpcConfiguration.isIOSFrontend) {
  OidcClient = OidcIOSClient;
} else {
  OidcClient = OidcBrowserClient;
}

/** @internal */
export class OidcClientWrapper {

  private static _oidcClient: IOidcFrontendClient;

  public static get oidcClient(): IOidcFrontendClient {
    return this._oidcClient;
  }

  public static async initialize(requestContext: ClientRequestContext, config: OidcFrontendClientConfiguration) {
    requestContext.enter();
    this._oidcClient = new OidcClient(config);
    await this._oidcClient.initialize(requestContext);
  }
}
