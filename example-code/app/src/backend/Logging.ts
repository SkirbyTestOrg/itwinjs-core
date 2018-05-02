/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
// __PUBLISH_EXTRACT_START__ Logging.serviceLoggingExample
import { Logger, LoggerLevelsConfig, EnvMacroSubst, BentleyError, IModelStatus } from "@bentley/bentleyjs-core";
import { BunyanLoggerConfig } from "@bentley/bentleyjs-core/lib/BunyanLoggerConfig";
import { SeqLoggerConfig, SeqConfig } from "@bentley/bentleyjs-core/lib/SeqLoggerConfig";

export function initializeLogging(): void {
  // Read the configuration parameters for my service. Some config
  // params might be specified as envvars.
  const config = require("./MyService.config.json");

  const defaultConfigValues: any = {
    "RobotWorld-DEFAULT-LOG-LEVEL": "Error",
    "RobotWorld-SEQ-URL": "http://localhost",
    "RobotWorld-SEQ-PORT": "5341",
  };

  EnvMacroSubst.replaceInProperties(config, true, defaultConfigValues);
  if (EnvMacroSubst.anyPropertyContainsEnvvars(config.seq, true)) {
    throw new BentleyError(IModelStatus.NotFound, "Unmatched environment variables in configuration.");
  }

  // Set up to log to the seq service
  if ("seq" in config) {
    if (SeqLoggerConfig.validateProps(config.seq))
      BunyanLoggerConfig.logToBunyan(SeqLoggerConfig.createBunyanSeqLogger(config.seq as SeqConfig, "RobotWorld"));
  }

  // Configure log levels by category
  if ("loggerConfig" in config) {
    if (Logger.validateProps(config.loggerConfig))
      Logger.configureLevels(config.loggerConfig as LoggerLevelsConfig);
  }
}
// __PUBLISH_EXTRACT_END__
