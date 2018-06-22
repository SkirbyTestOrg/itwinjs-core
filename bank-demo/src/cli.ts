/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { DemoFrontend } from "./DemoFrontend";
import { DemoBackend } from "./DemoBackend";

const args = process.argv.slice(2);

let useIModelHub = false;
if (args[0].toLowerCase() === "hub")
  useIModelHub = true;
else {
  if (args[0].toLowerCase() !== "bank") {
    console.log(`syntax: ${process.argv0} {hub|bank} [cmd]`);
    process.exit(1);
  }
}

// Pretend that we are spinning up the app's own backend
const backend = new DemoBackend();
DemoBackend.initialize(useIModelHub);

// Pretend that this is the app's frontend
const frontend = new DemoFrontend(useIModelHub);

async function runDemo() {
  await frontend.login();
  const iModelId = await frontend.chooseIModel();
  const context = await frontend.getIModelAccessContext(iModelId);
  await backend.downloadBriefcase(context, frontend.accessToken);
  await backend.logChangeSets(context, frontend.accessToken);
}

async function createNamedVersion(changeSetId: string, versionName: string) {
  await frontend.login();
  const iModelId = await frontend.chooseIModel();
  const context = await frontend.getIModelAccessContext(iModelId);
  await backend.createNamedVersion(changeSetId, versionName, context, frontend.accessToken);
}

const cmd = (args.length > 1) ? args[1] : "";
if (cmd === "namedVersion") {
  createNamedVersion(args[2], args[3]).then(() => process.exit(0));
} else {
  runDemo().then(() => process.exit(0));
}
