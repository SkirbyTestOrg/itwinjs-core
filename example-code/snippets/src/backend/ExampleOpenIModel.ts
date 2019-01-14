/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { IModelDb, ConcurrencyControl, OpenParams } from "@bentley/imodeljs-backend";
import { OpenMode, EnvMacroSubst, ActivityLoggingContext, Guid } from "@bentley/bentleyjs-core";
import { IModelError, IModelStatus, IModelVersion } from "@bentley/imodeljs-common";

// __PUBLISH_EXTRACT_START__ imodeljs-clients.getAccessToken
import { AccessToken, AuthorizationToken, ImsActiveSecureTokenClient, ImsDelegationSecureTokenClient, Config } from "@bentley/imodeljs-clients";

interface UserCredentials {
    email: string;
    password: string;
}

async function getUserAccessToken(userCredentials: UserCredentials): Promise<AccessToken> {
    const alctx = new ActivityLoggingContext(Guid.createValue());
    const authToken: AuthorizationToken = await (new ImsActiveSecureTokenClient()).getToken(alctx, userCredentials.email, userCredentials.password);

    const accessToken = await (new ImsDelegationSecureTokenClient()).getToken(alctx, authToken!);

    return accessToken;
}
// __PUBLISH_EXTRACT_END__

// __PUBLISH_EXTRACT_START__ Service.readConfig
export function readConfigParams(): any {
    const config = require("./MyService.config.json");

    const defaultConfigValues: any = {
        /* ... define a property corresponding to each placeholder in the config file and a default value for it ... */
        "some-macro-name": "its-default-value",
    };

    // Replace ${some-macro-name} placeholders with actual environment variables,
    // falling back on the supplied default values.
    EnvMacroSubst.replaceInProperties(config, true, defaultConfigValues);

    return config;
}
// __PUBLISH_EXTRACT_END__

function configureIModel() {

    // __PUBLISH_EXTRACT_START__ IModelDb.onOpen
    IModelDb.onOpen.addListener((_accessToken: AccessToken, _contextId: string, _iModelId: string, openParams: OpenParams, _version: IModelVersion) => {
        // A read-only service might want to reject all requests to open an iModel for writing. It can do this in the onOpen event.
        if (openParams.openMode !== OpenMode.Readonly)
            throw new IModelError(IModelStatus.BadRequest, "Navigator is readonly");
    });
    // __PUBLISH_EXTRACT_END__

    // __PUBLISH_EXTRACT_START__ IModelDb.onOpened
    IModelDb.onOpened.addListener((iModel: IModelDb) => {
        if (iModel.openParams.openMode !== OpenMode.ReadWrite)
            return;

        // Setting a concurrency control policy is an example of something you might do in an onOpened event handler.
        iModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
    });
    // __PUBLISH_EXTRACT_END__
}

// Call the above functions, to avoid lint errors.
const cred = { email: Config.App.getString("imjs_test_regular_user_name"), password: Config.App.getString("imjs_test_regular_user_password") };
getUserAccessToken(cred).then((_accessToken: AccessToken) => { // tslint:disable-line:no-floating-promises
});

configureIModel();
