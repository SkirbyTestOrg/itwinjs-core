/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
// tslint:disable:variable-name
// tslint:disable:no-var-requires
// tslint:disable:no-console
import * as path from "path";
const { logBuildWarning, logBuildError, failBuild } = require("../scripts/rush/utils");

const Base = require("mocha/lib/reporters/base");
const Spec = require("mocha/lib/reporters/spec");
const MochaJUnitReporter = require("mocha-junit-reporter");

function withStdErr(callback: () => void) {
  const originalConsoleLog = console.log;
  console.log = console.error;
  callback();
  console.log = originalConsoleLog;
}

const isCI = process.env.CI || process.env.TF_BUILD;

// This is necessary to enable colored output when running in rush test:
Object.defineProperty(Base, "useColors", {
  get: () => process.env.FORCE_COLOR !== "false" && process.env.FORCE_COLOR !== "0",
  set: () => { },
});

class BentleyMochaReporter extends Spec {
  constructor(_runner: any, options: any) {
    super(...arguments);
    this._junitReporter = new MochaJUnitReporter(...arguments);

    // Force rush test to fail CI builds if describe.only or it.only is used.
    // These should only be used for debugging and must not be committed, otherwise we may be accidentally skipping lots of tests.
    if (isCI)
      options.forbidOnly = true;
  }

  public epilogue(...args: any[]) {
    // Force test errors to be printed to stderr instead of stdout.
    // This will allow rush to correctly summarize test failure when running rush test.
    if (this.stats.failures) {
      withStdErr(() => super.epilogue(...args));
    } else {
      super.epilogue(...args);

      if (0 === this.stats.passes) {
        logBuildError("There were 0 passing tests.  That doesn't seem right."
          + "\nIf there are really no passing tests and no failures, then what was even the point?"
          + "\nIt seems likely that tests were skipped by it.only, it.skip, or grep filters, so I'm going to fail now.");
        failBuild();
      }
    }

    // Also log warnings in CI builds when tests have been skipped.
    if (this.stats.pending) {
      const currentPackage = require(path.join(process.cwd(), "package.json")).name;
      if (this.stats.pending === 1)
        logBuildWarning(`1 test skipped in ${currentPackage}`);
      else
        logBuildWarning(`${this.stats.pending} tests skipped in ${currentPackage}`);
    }
  }
}

module.exports = BentleyMochaReporter;
