/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as faker from "faker";
import { BentleyCloudRpcManager, IModelRpcProps, RpcConfiguration, RpcManager, WebAppRpcRequest } from "@bentley/imodeljs-common";
import { PresentationRpcInterface } from "@bentley/presentation-common";

RpcConfiguration.disableRoutingValidation = true;

describe("PresentationRpcInterface usage with RPC protocols", () => {

  describe("BentleyCloudRpcProtocol", () => {

    let client: PresentationRpcInterface;
    let token: IModelRpcProps;

    before(() => {
      const params = { info: { title: "Test", version: "1.0" } };
      BentleyCloudRpcManager.initializeClient(params, [PresentationRpcInterface]);
      client = RpcManager.getClientForInterface(PresentationRpcInterface);
      token = {
        key: faker.random.uuid(),
        contextId: faker.random.uuid(),
        iModelId: faker.random.uuid(),
      };
    });

    it("creates valid request for getNodesCount", () => {
      const request = () => {
        const params = [{ imodel: token, knownBackendIds: [], rulesetId: faker.random.word() }];
        const r = new WebAppRpcRequest(client, "getNodesCount", params);
        (r as any).dispose(); // no way to properly destroy the created request...
      };
      expect(request).to.not.throw();
    });

  });

});
