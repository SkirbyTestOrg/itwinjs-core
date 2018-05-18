/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { initialize, terminate } from "./IntegrationTests";
import { OpenMode } from "@bentley/bentleyjs-core";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { ECPresentation } from "@bentley/ecpresentation-frontend";

before(() => {
  initialize();
});

after(() => {
  terminate();
});

describe("Localization", async () => {

  let imodel: IModelConnection;
  before(async () => {
    const testIModelName: string = "assets/datasets/1K.bim";
    imodel = await IModelConnection.openStandalone(testIModelName, OpenMode.Readonly);
    expect(imodel).is.not.null;
  });
  after(async () => {
    await imodel.closeStandalone();
  });

  it("localizes using app/test supplied localized strings", async () => {
    const nodes = await ECPresentation.presentation.getRootNodes(imodel.iModelToken, undefined, { RulesetId: "LocalizationTest" });
    expect(nodes.length).to.eq(1);
    expect(nodes[0].label).to.eq("test value");
  });

});
