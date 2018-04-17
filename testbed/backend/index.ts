/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import * as express from "express";
import * as bodyParser from "body-parser";
import { IModelHost } from "@bentley/imodeljs-backend";
import { TestbedConfig, TestbedIpcMessage } from "../common/TestbedConfig";
import { TestGatewayImpl, TestGateway2Impl } from "./TestGatewayImpl";
import { CONSTANTS } from "../common/Testbed";

let pendingsSent = 0;
let pendingResponseQuota = 0;

// tslint:disable-next-line:no-var-requires
const { ipcMain } = require("electron");
ipcMain.on("testbed", (event: any, arg: any) => {
  const msg: TestbedIpcMessage = arg;
  if (msg.name === CONSTANTS.PENDING_RESPONSE_QUOTA_MESSAGE) {
    pendingResponseQuota = msg.value;
    pendingsSent = 0;
    event.returnValue = true;
  } else if (msg.name === CONSTANTS.REGISTER_TEST_GATEWAY2IMPL_CLASS_MESSAGE) {
    TestGateway2Impl.register();
    TestGateway2Impl.instantiate();
    event.returnValue = true;
  } else if (msg.name === CONSTANTS.REPLACE_TEST_GATEWAY2IMPL_INSTANCE_MESSAGE) {
    TestGateway2Impl.instantiate();
    event.returnValue = true;
  }
});

// Start the backend
IModelHost.startup();

TestGatewayImpl.register();
TestbedConfig.initializeGatewayConfig();

if (TestbedConfig.gatewayConfig) {
  const app = express();
  app.use(bodyParser.text());
  app.use(express.static(__dirname + "/public"));
  app.get(TestbedConfig.swaggerURI, (req, res) => TestbedConfig.gatewayConfig.protocol.handleOpenApiDescriptionRequest(req, res));

  app.post("*", (req, res) => {
    if (pendingResponseQuota && pendingsSent < pendingResponseQuota) {
      ++pendingsSent;
      res.status(202).send(`Pending Response #${pendingsSent}`);
      return;
    }

    pendingsSent = 0;
    TestbedConfig.gatewayConfig.protocol.handleOperationPostRequest(req, res);
  });

  app.listen(TestbedConfig.serverPort);
}
