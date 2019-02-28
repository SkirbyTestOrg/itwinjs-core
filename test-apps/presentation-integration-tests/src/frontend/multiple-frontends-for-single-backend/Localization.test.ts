/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { initialize, terminate } from "../../IntegrationTests";
import { OpenMode } from "@bentley/bentleyjs-core";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { PresentationManager } from "@bentley/presentation-frontend";

describe("Multiple frontends for one backend", async () => {

  describe("Localization", () => {

    let imodel: IModelConnection;
    let frontends: PresentationManager[];

    before(async () => {
      initialize();

      const testIModelName: string = "assets/datasets/Properties_60InstancesWithUrl2.ibim";
      imodel = await IModelConnection.openStandalone(testIModelName, OpenMode.Readonly);
      expect(imodel).is.not.null;

      frontends = ["en", "test"].map((locale) => PresentationManager.create({ activeLocale: locale }));
    });

    after(async () => {
      await imodel.closeStandalone();
      frontends.forEach((f) => f.dispose());
      terminate();
    });

    it("Handles multiple simultaneous requests from different frontends with different locales", async () => {
      for (let i = 0; i < 100; ++i) {
        const nodes = {
          en: await frontends[0].getNodes({ imodel, rulesetId: "Localization" }),
          test: await frontends[1].getNodes({ imodel, rulesetId: "Localization" }),
        };

        expect(nodes.en[0].label).to.eq("test value");
        expect(nodes.en[0].description).to.eq("test nested value");

        expect(nodes.test[0].label).to.eq("_test_ string");
        expect(nodes.test[0].description).to.eq("_test_ nested string");
      }
    });

  });

});
