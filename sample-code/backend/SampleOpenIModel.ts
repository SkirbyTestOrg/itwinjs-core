/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { IModelDb, ConcurrencyControl, AutoPush } from "@bentley/imodeljs-backend";
import { OpenMode, EnvMacroSubst } from "@bentley/bentleyjs-core";
import { IModelError, IModelStatus, IModelVersion } from "@bentley/imodeljs-common";
import { AccessToken, DeploymentEnv, AuthorizationToken, ImsActiveSecureTokenClient, ImsDelegationSecureTokenClient } from "@bentley/imodeljs-clients";

// __PUBLISH_EXTRACT_START__ imodeljs-clients.getAccessToken
interface UserCredentials {
  email: string;
  password: string;
}

async function getUserAccessToken(userCredentials: UserCredentials, env: DeploymentEnv): Promise<AccessToken> {
  const authToken: AuthorizationToken = await (new ImsActiveSecureTokenClient(env)).getToken(userCredentials.email, userCredentials.password);

  const accessToken = await (new ImsDelegationSecureTokenClient(env)).getToken(authToken!);

  return accessToken;
}
// __PUBLISH_EXTRACT_END__

// __PUBLISH_EXTRACT_START__ Logging.logToBunyan
import { Logger, LoggerLevelsConfig } from "@bentley/bentleyjs-core";
import { BunyanLoggerConfig } from "@bentley/bentleyjs-core/lib/BunyanLoggerConfig";
import { SeqLoggerConfig, SeqConfig } from "@bentley/bentleyjs-core/lib/SeqLoggerConfig";

export function initializeLogging(seqConfig: SeqConfig): void {
  BunyanLoggerConfig.logToBunyan(SeqLoggerConfig.createBunyanSeqLogger(seqConfig, "MyService"));
}
// __PUBLISH_EXTRACT_END__

export function configureLevels(cfg: LoggerLevelsConfig): void {
// __PUBLISH_EXTRACT_START__ Logging.configureLevels
  Logger.configureLevels(cfg);
// __PUBLISH_EXTRACT_END__
}

// __PUBLISH_EXTRACT_START__ IModelDb.open
async function openModel(projectid: string, imodelid: string, accessToken: AccessToken) {
  const imodel: IModelDb = await IModelDb.open(accessToken, projectid, imodelid, OpenMode.Readonly);
  return imodel;
}
// __PUBLISH_EXTRACT_END__

// __PUBLISH_EXTRACT_START__ Service.readConfig
function readConfigParams(): any {
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
  IModelDb.onOpen.addListener((_accessToken: AccessToken, _contextId: string, _iModelId: string, openMode: OpenMode, _version: IModelVersion) => {
    // A read-only service might want to reject all requests to open an iModel for writing. It can do this in the onOpen event.
    if (openMode !== OpenMode.Readonly)
      throw new IModelError(IModelStatus.BadRequest, "Navigator is readonly");
  });
// __PUBLISH_EXTRACT_END__

// __PUBLISH_EXTRACT_START__ IModelDb.onOpened
  IModelDb.onOpened.addListener((iModel: IModelDb) => {
    if (iModel.openMode !== OpenMode.ReadWrite)
      return;

    // Setting a concurrency control policy is an example of something you might do in an onOpened event handler.
    iModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());

    // Starting AutoPush is an example of something you might do in an onOpen event handler.
    // Note that AutoPush registers itself with IModelDb. That keeps it alive while the DB is open and releases it when the DB closes.
    new AutoPush(iModel, readConfigParams());
  });
// __PUBLISH_EXTRACT_END__
}

const cred = {email: "Regular.IModelJsTestUser@mailinator.com", password: "Regular@iMJs"};
getUserAccessToken(cred, "PROD").then((accessToken: AccessToken) => {
  const im = openModel("x", "y", accessToken);
  if (im === undefined)
    return;
});

configureIModel();
