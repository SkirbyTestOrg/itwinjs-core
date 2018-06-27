/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
// tslint:disable-next-line:no-var-keyword
// tslint:disable-next-line:no-var-requires
// const prompt = require("prompt");
import { BriefcaseManager, IModelHost, IModelDb, /*OpenParams,*/ IModelHostConfiguration, IModelAccessContext } from "@bentley/imodeljs-backend";
import { AccessToken, IModelQuery, IModel as HubIModel, ChangeSet, Version } from "@bentley/imodeljs-clients";
// import { Logger, LogLevel } from "@bentley/bentleyjs-core";
import * as path from "path";
import * as fs from "fs-extra";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // (needed temporarily to use self-signed cert to communicate with iModelBank via https)

let useIModelHub: boolean;

export class DemoBackend {

  // Call this when starting up the backend
  public static initialize(useHub: boolean) {
    useIModelHub = useHub;

    // Logger.initializeToConsole();
    // Logger.setLevel("imodeljs-clients", LogLevel.Error);

    const hostConfig = new IModelHostConfiguration();
    hostConfig.briefcaseCacheDir = path.join(__dirname, "briefcaseCache", useIModelHub ? "hub" : "bank");
    if (!fs.existsSync(hostConfig.briefcaseCacheDir))
      fs.mkdirsSync(hostConfig.briefcaseCacheDir);
    IModelHost.startup(hostConfig);
  }

  private static displayIModelInfo(iModel: HubIModel) {
    console.log(`name: ${iModel.name} ID: ${iModel.wsgId}`);
    // *** TODO: Log more info
  }

  private static displayChangeSet(changeSet: ChangeSet) {
    // tslint:disable-next-line:no-console
    console.log(`ID: ${changeSet.wsgId} parentId: ${changeSet.parentId} pushDate: ${changeSet.pushDate} containsSchemaChanges: ${changeSet.containsSchemaChanges} briefcaseId: ${changeSet.briefcaseId} description: ${changeSet.description}`);
  }

  private static displayVersion(version: Version) {
    // tslint:disable-next-line:no-console
    console.log(`name: ${version.name} changeSetId: ${version.changeSetId}`);
  }

  /*
  private static fmtElement(iModelDb: IModelDb, id: Id64): string {
    const el: Element = iModelDb.elements.getElement(id);
    let desc = `${el.classFullName} ${el.code.value}`;
    if (el.parent)
      desc += " { " + this.fmtElement(iModelDb, el.parent.id) + " }";
    return desc;
  }

  private static displayModel(model: Model) {
    // tslint:disable-next-line:no-console
    console.log(`name: ${model.name} modeledElement: ${this.fmtElement(model.iModel, model.modeledElement.id)}`);
  }
  */

  public async createNamedVersion(changeSetId: string, versionName: string, context: IModelAccessContext, accessToken: AccessToken) {
    BriefcaseManager.setContext(context);

    await BriefcaseManager.hubClient.Versions().create(accessToken, context.iModelId, changeSetId, versionName);
  }

  public async logChangeSets(context: IModelAccessContext, accessToken: AccessToken) {
    BriefcaseManager.setContext(context);

    console.log("\niModel:");
    const iModel: HubIModel = (await BriefcaseManager.hubClient.IModels().get(accessToken, context.projectId, new IModelQuery().byId(context.iModelId)))[0];
    DemoBackend.displayIModelInfo(iModel);

    console.log("\nChangeSets:");
    const changeSets: ChangeSet[] = await BriefcaseManager.hubClient.ChangeSets().get(accessToken, context.iModelId);
    for (const changeSet of changeSets) {
      DemoBackend.displayChangeSet(changeSet);
    }

    console.log("\nVersions:");
    const versions: Version[] = await BriefcaseManager.hubClient.Versions().get(accessToken, context.iModelId);
    for (const version of versions) {
      DemoBackend.displayVersion(version);
    }

    /*
    console.log("\nModels:");
    const imodelDb = await IModelDb.open(accessToken, context.projectId, context.iModelId, OpenParams.pullAndPush());
    imodelDb.withPreparedStatement("select ecinstanceid as id from bis.Model", (stmt: ECSqlStatement) => {
      while (stmt.step() === DbResult.BE_SQLITE_ROW)
        DemoBackend.displayModel(imodelDb.models.getModel(stmt.getValue(0).getId()));
    });
    */
  }

  public async downloadBriefcase(context: IModelAccessContext, accessToken: AccessToken) {
    BriefcaseManager.setContext(context);

    const imodel = await IModelDb.open(accessToken, context.projectId, context.iModelId /*, OpenParams.pullAndPush()*/);
    console.log(`Briefcase: ${imodel.briefcase.pathname}`);
  }
}
