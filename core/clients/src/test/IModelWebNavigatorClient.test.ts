/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import * as chai from "chai";
import { IModelWebNavigatorClient } from "../IModelWebNavigatorClient";
import { UrlDiscoveryMock } from "./ResponseBuilder";
import { DeploymentEnv, UrlDescriptor } from "../Client";

chai.should();

export class IModelWebNavigatorUrlMock {
  private static readonly _urlDescriptor: UrlDescriptor = {
    DEV: "https://dev-connect-imodelweb.bentley.com",
    QA: "https://qa-connect-imodelweb.bentley.com",
    PROD: "https://connect-imodelweb.bentley.com",
    PERF: "https://connect-imodelweb.bentley.com",
  };

  public static getUrl(env: DeploymentEnv): string {
    return this._urlDescriptor[env];
  }

  public static mockGetUrl(env: DeploymentEnv) {
    UrlDiscoveryMock.mockGetUrl(IModelWebNavigatorClient.searchKey, env, this._urlDescriptor[env]);
  }
}

describe("IModelWebNavigatorClient", () => {
  it("should setup its URLs", async () => {
    IModelWebNavigatorUrlMock.mockGetUrl("DEV");
    let url: string = await new IModelWebNavigatorClient("DEV").getUrl();
    chai.expect(url).equals("https://dev-connect-imodelweb.bentley.com");

    IModelWebNavigatorUrlMock.mockGetUrl("QA");
    url = await new IModelWebNavigatorClient("QA").getUrl();
    chai.expect(url).equals("https://qa-connect-imodelweb.bentley.com");

    IModelWebNavigatorUrlMock.mockGetUrl("PROD");
    url = await new IModelWebNavigatorClient("PROD").getUrl();
    chai.expect(url).equals("https://connect-imodelweb.bentley.com");

    IModelWebNavigatorUrlMock.mockGetUrl("PERF");
    url = await new IModelWebNavigatorClient("PERF").getUrl();
    chai.expect(url).equals("https://connect-imodelweb.bentley.com");
  });

});
