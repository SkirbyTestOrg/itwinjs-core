/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { ClientRequestContext } from "@bentley/bentleyjs-core";
import { RpcInterface, RpcManager, IModelTokenProps, IModelToken } from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/imodeljs-clients";
import { TestRpcInterface } from "../common/RpcInterfaces";
import { IModelDb, ChangeSummaryExtractOptions, ChangeSummaryManager, BriefcaseManager, IModelJsFs, IModelHost } from "@bentley/imodeljs-backend";
import * as path from "path";
import { Reporter } from "@bentley/perf-tools/lib/Reporter";

export class TestRpcImpl extends RpcInterface implements TestRpcInterface {
  public static reporter: Reporter;

  public async initializeReporter(): Promise<any> {
    TestRpcImpl.reporter = new Reporter();
  }

  public async addNewEntry(testSuit: string, testName: string, valueDescription: string, value: number, info: string): Promise<any> {
    const temp = JSON.parse(info);
    TestRpcImpl.reporter.addEntry(testSuit, testName, valueDescription, value, temp);
  }

  public async saveReport(): Promise<any> {
    const pth = "./lib/outputdir";
    if (!IModelJsFs.existsSync(pth))
      IModelJsFs.mkdirSync(pth);
    const csvPath = path.join(pth, "IntegrationPefTests.csv");
    TestRpcImpl.reporter.exportCSV(csvPath);
  }

  public static register() {
    RpcManager.registerImpl(TestRpcInterface, TestRpcImpl);
  }

  public async restartIModelHost(): Promise<void> {
    IModelHost.shutdown();
    IModelHost.startup();
  }

  public async extractChangeSummaries(tokenProps: IModelTokenProps, options: any): Promise<void> {
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    await ChangeSummaryManager.extractChangeSummaries(requestContext, IModelDb.find(IModelToken.fromJSON(tokenProps)), options as ChangeSummaryExtractOptions);
  }

  public async deleteChangeCache(iModelToken: IModelTokenProps): Promise<void> {
    if (!iModelToken.iModelId)
      throw new Error("iModelToken is invalid. Must not be a standalone iModel");

    const changesPath: string = BriefcaseManager.getChangeCachePathName(iModelToken.iModelId);
    if (IModelJsFs.existsSync(changesPath))
      IModelJsFs.unlinkSync(changesPath);
  }

  public async executeTest(tokenProps: IModelTokenProps, testName: string, params: any): Promise<any> {
    return JSON.parse(IModelDb.find(IModelToken.fromJSON(tokenProps)).nativeDb.executeTest(testName, JSON.stringify(params)));
  }
}

TestRpcImpl.register();
