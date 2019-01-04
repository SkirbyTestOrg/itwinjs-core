#!/usr/bin/env node

/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

"use strict";

require('yargonaut')
  .style('green')
  .style('yellow', "required")
  .style('cyan', "Positionals:")
  .helpStyle('cyan')
  .errorsStyle('red.bold');

const chalk = require("chalk");
const yargs = require("yargs");
const argv = yargs
  .wrap(Math.min(120, yargs.terminalWidth()))
  .usage(`\n${chalk.bold("$0")} ${chalk.yellow("<command>")}`)
  .command(require("../scripts/start"))
  .command(require("../scripts/start-backend"))
  .command(require("../scripts/start-frontend"))
  .command(require("../scripts/test"))
  .command(require("../scripts/test-e2e"))
  .command(require("../scripts/cover"))
  .command(require("../scripts/build"))
  .epilogue(`${chalk.cyan("For more information on a particular command, run:")}\n\n    ${chalk.bold("bentley-webpack-tools")} ${chalk.yellow("<command>")} ${chalk.green("--help")}`)
  .argv;
