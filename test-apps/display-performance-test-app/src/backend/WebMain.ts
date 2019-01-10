/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import * as path from "path";
import * as express from "express";
import * as https from "https";
import * as bodyParser from "body-parser";
import * as fs from "fs";

import { BentleyCloudRpcManager, IModelTileRpcInterface, StandaloneIModelRpcInterface, IModelReadRpcInterface } from "@bentley/imodeljs-common";
import { Logger, LogLevel } from "@bentley/bentleyjs-core";
import { initializeBackend } from "./backend";
import DisplayPerfRpcInterface from "../common/DisplayPerfRpcInterface";

// tslint:disable:no-console

export function getRpcInterfaces() {
  return [DisplayPerfRpcInterface, IModelTileRpcInterface, StandaloneIModelRpcInterface, IModelReadRpcInterface];
}

function setupStandaloneConfiguration() {
  const filename = process.env.SVT_STANDALONE_FILENAME;
  if (filename !== undefined) {
    const configuration: any = {};
    configuration.standalone = true;
    configuration.standalonePath = filename;
    configuration.viewName = process.env.SVT_STANDALONE_VIEWNAME; // optional
    configuration.iModelName = filename;
    fs.writeFileSync(path.join(__dirname, "configuration.json"), JSON.stringify(configuration), "utf8");
  }
}

// Initialize the backend
initializeBackend();

Logger.setLevelDefault(LogLevel.Error);
Logger.setLevel("imodeljs-clients", LogLevel.Trace);
Logger.setLevel("imodeljs-backend", LogLevel.Trace);
Logger.setLevel("SVT", LogLevel.Trace);

let serverConfig: any;
let serverOptions: any;

if (process.argv.length >= 3) {
  if (process.argv.length > 3 && process.argv[3].split(".").pop() === "json")
    DisplayPerfRpcInterface.jsonFilePath = process.argv[3];
  else if (process.argv[2].split(".").pop() === "json")
    DisplayPerfRpcInterface.jsonFilePath = process.argv[2];
  else {
    Logger.logTrace("SVT", `reading server config from ${process.argv[2]}`);
    try {
      // tslint:disable-next-line:no-var-requires
      serverConfig = require(process.argv[2]);
      serverOptions = {
        key: fs.readFileSync(serverConfig.keyFile),
        cert: fs.readFileSync(serverConfig.certFile),
      };
    } catch (_err) { }
  }
}

if (serverConfig === undefined) {
  setupStandaloneConfiguration();

  serverConfig = { port: 3000, baseUrl: "https://localhost" };
} else {

}

Logger.logTrace("SVT", `config = ${JSON.stringify(serverConfig)}`);

// Set up the ability to serve the supported rpcInterfaces via web requests
const cloudConfig = BentleyCloudRpcManager.initializeImpl({ info: { title: "SimpleViewApp", version: "v1.0" } }, getRpcInterfaces());

const app = express();
app.use(bodyParser.text({ limit: "50mb" }));

// Enable CORS for all apis
app.all("/*", (_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Authorization, X-Requested-With");
  next();
});

// --------------------------------------------
// Routes
// --------------------------------------------
app.use(express.static(path.resolve(__dirname, "public")));
app.get("/v3/swagger.json", (req, res) => cloudConfig.protocol.handleOpenApiDescriptionRequest(req, res));
app.post("*", async (req, res) => cloudConfig.protocol.handleOperationPostRequest(req, res));
app.get(/\/imodel\//, async (req, res) => cloudConfig.protocol.handleOperationGetRequest(req, res));

// ---------------------------------------------
// Run the server...
// ---------------------------------------------
app.set("port", serverConfig.port);

const announce = () => console.log(`***** Display Performance Testing App listening on ${serverConfig.baseUrl}:${app.get("port")}`);

if (serverOptions === undefined) {
  app.listen(app.get("port"), announce);
} else {
  https.createServer(serverOptions, app).listen(app.get("port"), announce);
}
