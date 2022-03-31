#!/usr/bin/env node

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import * as glob from "glob";
import { join } from "path";
import * as readline from "readline";
import * as Yargs from "yargs";
import {
  CloudSqlite, EditableWorkspaceDb, IModelHost, IModelHostConfiguration, IModelJsFs, IModelJsNative, ITwinWorkspaceContainer, ITwinWorkspaceDb,
  WorkspaceContainer, WorkspaceDb, WorkspaceResource,
} from "@itwin/core-backend";
import { BentleyError, DbResult, Logger, LogLevel, StopWatch } from "@itwin/core-bentley";
import { IModelError, LocalDirName, LocalFileName } from "@itwin/core-common";

// cspell:ignore nodir
/* eslint-disable id-blacklist,no-console */

/** Currently executing an "@" script? */
let inScript = false;

interface EditorProps {
  /** Allows overriding the location of WorkspaceDbs. If not present, defaults to `${homedir}/iTwin/Workspace` */
  directory?: LocalDirName;
  /** number of simultaneous http requests */
  nRequests?: number;
  /** enable logging */
  logging?: boolean;
}

interface EditorOpts extends EditorProps, WorkspaceContainer.Props {
  /** user name */
  user: string;
}

/** options for initializing a WorkspaceContainer */
interface InitializeOpts extends EditorOpts {
  noPrompt?: boolean;
}

/** options for performing an operation on a WorkspaceDb */
interface WorkspaceDbOpt extends EditorOpts {
  dbName: WorkspaceDb.Name;
  dbFileName: string;
  version?: string;
  like?: string;
}

/** options for copying a WorkspaceDb to a new name */
interface CopyWorkspaceDbOpt extends WorkspaceDbOpt {
  newDbName: WorkspaceDb.Name;
}

/** options for creating a new version of a WorkspaceDb */
interface MakeVersionOpt extends WorkspaceDbOpt {
  versionType: WorkspaceDb.VersionIncrement;
}

/** Resource type names */
type RscType = "blob" | "string" | "file";

/** Options for adding, updating, extracting, or deleting resources from a WorkspaceDb */
interface ResourceOption extends WorkspaceDbOpt {
  rscName?: WorkspaceResource.Name;
  type: RscType;
}

/** Options for deleting resources from a WorkspaceDb */
interface RemoveResourceOpts extends ResourceOption {
  rscName: WorkspaceResource.Name;
}

/** Options for extracting resources from a WorkspaceDb */
interface ExtractResourceOpts extends ResourceOption {
  rscName: WorkspaceResource.Name;
  fileName: LocalFileName;
}

/** Options for adding or updating local files as resources into a WorkspaceDb */
interface AddFileOptions extends ResourceOption {
  files: LocalFileName;
  root?: LocalDirName;
}

/** Options for listing the resources in a WorkspaceDb */
interface ListOptions extends WorkspaceDbOpt {
  strings?: boolean;
  files?: boolean;
  blobs?: boolean;
}

type TransferOptions = WorkspaceDbOpt & CloudSqlite.TransferDbProps & {
  noVacuum?: boolean;
};

/** Options for uploading a WorkspaceDb to blob storage */
interface UploadOptions extends TransferOptions {
  replace: boolean;
}

const askQuestion = async (query: string) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<string>((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans); }));
};

/** Create a new empty WorkspaceDb  */
async function createWorkspaceDb(args: WorkspaceDbOpt) {
  const wsFile = new EditableWorkspaceDb(args, IModelHost.appWorkspace.getContainer({ ...args, writeable: true }));
  await wsFile.createDb();
  console.log(`created WorkspaceDb ${wsFile.sqliteDb.nativeDb.getFilePath()}`);
}

/** open, call a function to process, then close a WorkspaceDb */
function processWorkspace<W extends ITwinWorkspaceDb, T extends WorkspaceDbOpt>(args: T, ws: W, fn: (ws: W, args: T) => void) {
  ws.open();
  console.log(`WorkspaceDb [${ws.sqliteDb.nativeDb.getFilePath()}]`);
  try {
    fn(ws, args);
  } finally {
    ws.close();
  }
}

/** get a WorkspaceContainer that may or may not be a cloud container. */
async function getContainer(args: EditorOpts) {
  const container = IModelHost.appWorkspace.getContainer({ ...args, writeable: true });
  await container.cloudContainer?.checkForChanges();
  return container;
}

/** get a WorkspaceContainer that is expected to be a cloud container, throw otherwise. */
async function getCloudContainer(args: EditorOpts): Promise<IModelJsNative.CloudContainer> {
  const container = await getContainer(args);
  const cloudContainer = container.cloudContainer;
  if (!cloudContainer)
    throw new Error("no cloud container");
  return cloudContainer;
}

function fixVersionArg(args: WorkspaceDbOpt) {
  const dbParts = ITwinWorkspaceContainer.parseDbFileName(args.dbName);
  args.dbName = dbParts.dbName;
  args.version = args.version ?? dbParts.version;
  args.dbFileName = ITwinWorkspaceContainer.makeDbFileName(dbParts.dbName, dbParts.version);
}

/** Open for write, call a function to process, then close a WorkspaceDb */
async function editWorkspace<T extends WorkspaceDbOpt>(args: T, fn: (ws: EditableWorkspaceDb, args: T) => void) {
  fixVersionArg(args);

  const ws = new EditableWorkspaceDb(args, await getContainer(args));
  if (ws.container.cloudContainer?.queryDatabase(ws.dbFileName)?.state !== "copied")
    throw new Error(`${args.dbFileName} is not editable. Create a new version first`);

  processWorkspace(args, ws, fn);
}

/** Open for read, call a function to process, then close a WorkspaceDb */
async function readWorkspace<T extends WorkspaceDbOpt>(args: T, fn: (ws: ITwinWorkspaceDb, args: T) => void) {
  fixVersionArg(args);
  processWorkspace(args, new ITwinWorkspaceDb(args, await getContainer(args)), fn);
}

/** List the contents of a WorkspaceDb */
async function listWorkspaceDb(args: ListOptions) {
  await readWorkspace(args, (file, args) => {
    if (!args.strings && !args.blobs && !args.files)
      args.blobs = args.files = args.strings = true;

    if (args.strings) {
      console.log(" strings:");
      file.sqliteDb.withSqliteStatement("SELECT id,value FROM strings", (stmt) => {
        while (DbResult.BE_SQLITE_ROW === stmt.step())
          console.log(`  name=${stmt.getValueString(0)}, size=${stmt.getValueString(1).length}`);
      });
    }
    if (args.blobs) {
      console.log(" blobs:");
      file.sqliteDb.withSqliteStatement("SELECT id,value FROM blobs", (stmt) => {
        while (DbResult.BE_SQLITE_ROW === stmt.step())
          console.log(`  name=${stmt.getValueString(0)}, size=${stmt.getColumnBytes(1)}`);
      });

    }
    if (args.files) {
      console.log(" files:");
      file.sqliteDb.withSqliteStatement("SELECT name FROM be_EmbedFile", (stmt) => {
        while (DbResult.BE_SQLITE_ROW === stmt.step()) {
          const embed = file.queryFileResource(stmt.getValueString(0));
          if (embed) {
            const info = embed.info;
            const date = new Date(info.date);
            console.log(`  name=${stmt.getValueString(0)}, size=${info.size}, ext="${info.fileExt}", date=${date.toString()}`);
          }
        }
      });
    }
  });
}

/** Add files into a WorkspaceDb. */
async function addResource(args: AddFileOptions) {
  await editWorkspace(args, (wsFile, args) => {
    glob.sync(args.files, { cwd: args.root ?? process.cwd(), nodir: true }).forEach((filePath) => {
      const file = args.root ? join(args.root, filePath) : filePath;
      if (!IModelJsFs.existsSync(file))
        throw new Error(`file [${file}] does not exist`);
      const name = args.rscName ?? filePath;
      try {
        if (args.type === "string") {
          const val = fs.readFileSync(file, "utf-8");
          wsFile.addString(name, val);
        } else if (args.type === "blob") {
          const val = fs.readFileSync(file);
          wsFile.addBlob(name, val);
        } else {
          wsFile.addFile(name, file);
        }
        console.log(` added "${file}" as ${args.type} resource [${name}]`);
      } catch (e: unknown) {
        console.error(IModelError.getErrorMessage(e));
      }
    });
  });
}

/** Replace files in a WorkspaceDb. */
async function replaceResource(args: AddFileOptions) {
  await editWorkspace(args, (wsFile, args) => {
    glob.sync(args.files, { cwd: args.root ?? process.cwd(), nodir: true }).forEach((filePath) => {
      const file = args.root ? join(args.root, filePath) : filePath;
      if (!IModelJsFs.existsSync(file))
        throw new Error(`file [${file}] does not exist`);
      const name = args.rscName ?? filePath;
      try {
        if (args.type === "string") {
          const val = fs.readFileSync(file, "utf-8");
          wsFile.updateString(name, val);
        } else if (args.type === "blob") {
          const val = fs.readFileSync(file);
          wsFile.updateBlob(name, val);
        } else {
          wsFile.updateFile(name, file);
        }
        console.log(` updated "${file}" as ${args.type} resource [${name}]`);
      } catch (e: unknown) {
        console.error(IModelError.getErrorMessage(e));
      }
    });
  });
}

/** Extract a single resource from a WorkspaceDb into a local file */
async function extractResource(args: ExtractResourceOpts) {
  await readWorkspace(args, (file, args) => {
    const verify = <T>(val: T | undefined): T => {
      if (val === undefined)
        throw new Error(` ${args.type} resource "${args.rscName}" does not exist`);
      return val;
    };

    if (args.type === "string") {
      fs.writeFileSync(args.fileName, verify(file.getString(args.rscName)));
    } else if (args.type === "blob") {
      fs.writeFileSync(args.fileName, verify(file.getBlob(args.rscName)));
    } else {
      verify(file.getFile(args.rscName, args.fileName));
    }
    console.log(` ${args.type} resource [${args.rscName}] extracted to "${args.fileName}"`);
  });
}

/** Remove a single resource from a WorkspaceDb */
async function removeResource(args: RemoveResourceOpts) {
  await editWorkspace(args, (wsFile, args) => {
    if (args.type === "string")
      wsFile.removeString(args.rscName);
    else if (args.type === "blob")
      wsFile.removeBlob(args.rscName);
    else
      wsFile.removeFile(args.rscName);
    console.log(` removed ${args.type} resource [${args.rscName}]`);
  });
}

/** Vacuum a WorkspaceDb. */
async function vacuumWorkspaceDb(args: WorkspaceDbOpt) {
  const container = await getContainer(args);
  fixVersionArg(args);
  const localFile = new ITwinWorkspaceDb(args, container).dbFileName;
  IModelHost.platform.DgnDb.vacuum(localFile, container.cloudContainer);
  console.log(`${localFile} vacuumed`);
}

/** Either upload or download a WorkspaceDb to/from a cloud WorkspaceContainer. Shows progress % during transfer */
async function performTransfer(container: IModelJsNative.CloudContainer, direction: CloudSqlite.TransferDirection, args: TransferOptions) {
  fixVersionArg(args);
  const localFileName = args.localFileName;

  if (direction === "upload" && !args.noVacuum) {
    IModelHost.platform.DgnDb.vacuum(localFileName);
    console.log(`${localFileName} vacuumed`);
  }
  const info = `${direction === "download" ? "export" : "import"} ${localFileName}, container=${args.containerId}, dbName=${args.dbFileName} : `;

  let last = 0;
  const onProgress = (loaded: number, total: number) => {
    if (loaded > last) {
      last = loaded;
      const message = ` ${(loaded * 100 / total).toFixed(2)}%`;
      readline.cursorTo(process.stdout, info.length);
      process.stdout.write(message);
    }
    return 0;
  };
  process.stdout.write(info);
  const timer = new StopWatch(direction, true);
  args.dbName = args.dbFileName;
  await CloudSqlite.transferDb(direction, container, { ...args, localFileName, onProgress });
  readline.cursorTo(process.stdout, info.length);
  process.stdout.write(`complete, ${timer.elapsedSeconds.toString()} seconds`);
  console.log("");
}

/** import a WorkspaceDb to a cloud WorkspaceContainer. */
async function importWorkspaceDb(args: UploadOptions) {
  const container = await getCloudContainer(args);
  await CloudSqlite.withWriteLock(args.user, container, async () => {
    await performTransfer(container, "upload", args);
  });
}

/** export a WorkspaceDb from a cloud WorkspaceContainer. */
async function exportWorkspaceDb(args: TransferOptions) {
  await performTransfer(await getCloudContainer(args), "download", args);
}

/** Delete a WorkspaceDb from a cloud WorkspaceContainer. */
async function deleteWorkspaceDb(args: WorkspaceDbOpt) {
  const container = await getCloudContainer(args);
  await CloudSqlite.withWriteLock(args.user, container, async () => {
    return container.deleteDatabase(args.dbName);
  });

  console.log(`deleted WorkspaceDb [${args.dbName}] from ${sayContainer(args)}`);
}

function sayContainer(args: EditorOpts) {
  return `container [${args.containerId}]`;
}

/** initialize (empty if it exists) a cloud WorkspaceContainer. */
async function initializeWorkspace(args: InitializeOpts) {
  if (undefined === args.storageType || !args.accountName)
    throw new Error("No cloud container supplied");
  if (!args.noPrompt) {
    const yesNo = await askQuestion(`Are you sure you want to initialize ${sayContainer(args)}"? [y/n]: `);
    if (yesNo[0].toUpperCase() !== "Y")
      return;
  }
  const container = new IModelHost.platform.CloudContainer(args as CloudSqlite.ContainerAccessProps);
  container.initializeContainer({ checksumBlockNames: true });
  console.log(`container "${args.containerId} initialized`);
}

/** purge unused (garbage) blocks from a WorkspaceContainer. */
async function purgeWorkspace(args: EditorOpts) {
  const container = await getCloudContainer(args);
  const nGarbage = container.garbageBlocks;
  await CloudSqlite.withWriteLock(args.user, container, async () => container.cleanDeletedBlocks());
  await container.checkForChanges(); // re-read manifest to get current garbage count
  console.log(`purged ${sayContainer(args)}. ${nGarbage - container.garbageBlocks} garbage blocks cleaned`);
}

/** Make a copy of a WorkspaceDb with a new name. */
async function copyWorkspaceDb(args: CopyWorkspaceDbOpt) {
  const container = await getCloudContainer(args);
  const oldName = ITwinWorkspaceContainer.resolveCloudFileName(container, args);
  const newVersion = ITwinWorkspaceContainer.parseDbFileName(args.newDbName);
  ITwinWorkspaceContainer.validateDbName(newVersion.dbName);
  const newName = ITwinWorkspaceContainer.makeDbFileName(newVersion.dbName, ITwinWorkspaceContainer.validateVersion(newVersion.version));

  await CloudSqlite.withWriteLock(args.user, container, async () => container.copyDatabase(oldName, newName));
  console.log(`copied WorkspaceDb [${oldName}] to [${newName}] in ${sayContainer(args)}`);
}

/** Make a copy of a WorkspaceDb with a new name. */
async function versionWorkspaceDb(args: MakeVersionOpt) {
  fixVersionArg(args);
  const container = await getCloudContainer(args);
  const result = await ITwinWorkspaceContainer.makeNewVersion(container, args, args.versionType);
  console.log(`created new version: [${result.newName}] from [${result.oldName}] in ${sayContainer(args)}`);
}

/** pin a WorkspaceDb from a WorkspaceContainer. */
async function pinWorkspaceDb(args: WorkspaceDbOpt) {
  fixVersionArg(args);
  const container = await getCloudContainer(args);
  await container.pinDatabase(args.dbFileName, true);
  console.log(`pinned WorkspaceDb [${args.dbFileName}] in ${sayContainer(args)}`);
}

/** pin a WorkspaceDb from a WorkspaceContainer. */
async function unPinWorkspaceDb(args: WorkspaceDbOpt) {
  fixVersionArg(args);
  const container = await getCloudContainer(args);
  await container.pinDatabase(args.dbFileName, false);
  console.log(`un-pinned WorkspaceDb [${args.dbFileName}] in ${sayContainer(args)}`);
}

/** acquire the write lock for a WorkspaceContainer. */
async function acquireLock(args: WorkspaceDbOpt) {
  const container = await getCloudContainer(args);
  if (container.hasWriteLock)
    throw new Error(`write lock is already held for ${sayContainer(args)}`);
  await container.acquireWriteLock(args.user);
  console.log(`acquired lock for ${sayContainer(args)}`);
}

/** release the write lock for a WorkspaceContainer. */
async function releaseLock(args: WorkspaceDbOpt) {
  const container = await getCloudContainer(args);
  if (!container.hasWriteLock)
    throw new Error(`write lock is not held for ${sayContainer(args)}`);

  await container.releaseWriteLock();
  console.log(`released lock for ${sayContainer(args)}`);
}

/** clear the write lock for a WorkspaceContainer. */
async function clearWriteLock(args: WorkspaceDbOpt) {
  const container = await getCloudContainer(args);
  container.clearWriteLock();
  console.log(`write lock cleared for ${sayContainer(args)}`);
}

/** query the list of WorkspaceDb in a WorkspaceContainer. */
async function queryWorkspaceDbs(args: WorkspaceDbOpt) {
  const container = await getCloudContainer(args);
  const writeLockMsg = container.hasWriteLock ? ",  writeLocked" : "";
  const hasLocalMsg = container.hasLocalChanges ? ", has local changes" : "";
  const nGarbage = container.garbageBlocks;
  const garbageMsg = nGarbage ? `, ${nGarbage} garbage block${nGarbage > 1 ? "s" : ""}` : "";
  console.log(`WorkspaceDbs in ${sayContainer(args)}${writeLockMsg}${hasLocalMsg}${garbageMsg}`);

  const dbs = container.queryDatabases(args.like);
  for (const dbName of dbs) {
    const db = container.queryDatabase(dbName);
    if (db) {
      const dirty = db.dirtyBlocks ? `, ${db.dirtyBlocks} dirty` : "";
      const pinned = db.pinned !== 0 ? ", pinned" : "";
      const editable = db.state === "copied" ? ", editable" : "";
      console.log(` "${dbName}", size=${db.totalBlocks * 4}Mb, ${(100 * db.localBlocks / db.totalBlocks).toFixed(0)}% downloaded${editable}${dirty}${pinned}`);
    }
  }
}

/** Start `IModelHost`, then run a WorkspaceEditor command. Errors are logged to console. */
function runCommand<T extends EditorProps>(cmd: (args: T) => Promise<void>) {
  return async (args: T) => {
    if (inScript)
      return cmd(args);

    let timer: NodeJS.Timeout | undefined;
    try {
      const config = new IModelHostConfiguration();
      config.workspace = {
        containerDir: args.directory,
        cloudCache: {
          nRequests: args.nRequests,
        },
      };
      await IModelHost.startup(config);
      if (true === args.logging) {
        Logger.initializeToConsole();
        Logger.setLevel("CloudSqlite", LogLevel.Trace);
        IModelHost.appWorkspace.cloudCache?.setLogMask(0xff);
        timer = setInterval(() => IModelHost.platform.flushLog(), 250); // logging from other threads is buffered. This causes it to appear every 1/4 second.
      }

      await cmd(args);
    } catch (e: any) {
      if (typeof e.errorNumber === "number")
        e = new BentleyError(e.errorNumber, e.message);

      console.error(BentleyError.getErrorMessage(e));
    } finally {
      if (timer) {
        IModelHost.platform.flushLog();
        clearInterval(timer);
      }
    }
  };
}

const type: Yargs.Options = { alias: "t", describe: "the type of resource", choices: ["blob", "string", "file"], demandOption: true };
const addOrReplace = {
  rscName: { alias: "n", describe: "resource name for file", string: true },
  root: { alias: "r", describe: "root directory. Path parts after this will be saved in resource name", string: true },
  type,
};
Yargs.usage("Edits or lists contents of a WorkspaceDb");
Yargs.wrap(Math.min(150, Yargs.terminalWidth()));
Yargs.strict();
Yargs.env("WORKSPACE_EDITOR");
Yargs.config();
Yargs.help();
Yargs.version("V2.0");
Yargs.options({
  directory: { alias: "d", describe: "directory to use for WorkspaceContainers", string: true },
  nRequest: { describe: "number of simultaneous http requests for cloud operations", number: true },
  containerId: { alias: "c", describe: "WorkspaceContainerId for WorkspaceDb", string: true, demandOption: true },
  user: { describe: "user name", string: true, default: "workspace-editor" },
  accountName: { alias: "a", describe: "cloud storage account name for container", string: true },
  sasToken: { describe: "shared access signature token", string: true, default: "" },
  storageType: { describe: "storage module type", string: true, default: "azure?sas=1" },
  logging: { describe: "enable log messages", boolean: true, default: "false" },
});
Yargs.command<AddFileOptions>({
  command: "add <dbName> <files>",
  describe: "add files into a WorkspaceDb",
  builder: addOrReplace,
  handler: runCommand(addResource),
});
Yargs.command<AddFileOptions>({
  command: "replace <dbName> <files>",
  describe: "replace files in a WorkspaceDb",
  builder: addOrReplace,
  handler: runCommand(replaceResource),
});
Yargs.command<RemoveResourceOpts>({
  command: "remove <dbName> <rscName>",
  describe: "remove a resource from a WorkspaceDb",
  builder: { type },
  handler: runCommand(removeResource),
});
Yargs.command<ExtractResourceOpts>({
  command: "extract <dbName> <rscName> <fileName>",
  describe: "extract a resource from a WorkspaceDb into a local file",
  builder: { type },
  handler: runCommand(extractResource),
});
Yargs.command<ListOptions>({
  command: "listDb <dbName>",
  describe: "list the contents of a WorkspaceDb",
  builder: {
    strings: { alias: "s", describe: "list string resources", boolean: true, default: false },
    blobs: { alias: "b", describe: "list blob resources", boolean: true, default: false },
    files: { alias: "f", describe: "list file resources", boolean: true, default: false },
  },
  handler: runCommand(listWorkspaceDb),
});
Yargs.command<WorkspaceDbOpt>({
  command: "deleteDb <dbName>",
  describe: "delete a WorkspaceDb from a cloud container",
  handler: runCommand(deleteWorkspaceDb),
});
Yargs.command<WorkspaceDbOpt>({
  command: "createDb <dbName>",
  describe: "create a new WorkspaceDb",
  handler: runCommand(createWorkspaceDb),
});
Yargs.command<CopyWorkspaceDbOpt>({
  command: "copyDb <dbName> <newDbName>",
  describe: "make a copy of a WorkspaceDb in a cloud container with a new name",
  handler: runCommand(copyWorkspaceDb),
});
Yargs.command<MakeVersionOpt>({
  command: "versionDb <dbName>",
  describe: "make a new version of a WorkspaceDb",
  builder: {
    versionType: { describe: "the type of version to create", default: "patch", string: true, choices: ["major", "minor", "patch"] },
  },
  handler: runCommand(versionWorkspaceDb),
});
Yargs.command<WorkspaceDbOpt>({
  command: "pinDb <dbName>",
  describe: "pin a WorkspaceDb from a cloud container",
  handler: runCommand(pinWorkspaceDb),
});
Yargs.command<WorkspaceDbOpt>({
  command: "unpinDb <dbName>",
  describe: "un-pin a WorkspaceDb from a cloud container",
  handler: runCommand(unPinWorkspaceDb),
});
Yargs.command<WorkspaceDbOpt>({
  command: "vacuumDb <dbName>",
  describe: "vacuum a WorkspaceDb",
  handler: runCommand(vacuumWorkspaceDb),
});
Yargs.command<UploadOptions>({
  command: "importDb <dbName> <localFileName>",
  describe: "import a WorkspaceDb into a cloud container",
  builder: {
    noVacuum: { describe: "don't vacuum source Db before importing", boolean: true },
  },
  handler: runCommand(importWorkspaceDb),
});
Yargs.command<TransferOptions>({
  command: "exportDb <dbName> <localFileName>",
  describe: "export a WorkspaceDb from a cloud container to a local file",
  handler: runCommand(exportWorkspaceDb),
});
Yargs.command<WorkspaceDbOpt>({
  command: "queryDbs [like]",
  describe: "query the list of WorkspaceDbs in a cloud container",
  handler: runCommand(queryWorkspaceDbs),
});
Yargs.command<WorkspaceDbOpt>({
  command: "acquireLock",
  describe: "acquire the write lock for a cloud container",
  handler: runCommand(acquireLock),
});
Yargs.command<WorkspaceDbOpt>({
  command: "releaseLock",
  describe: "release the write lock for a cloud container",
  handler: runCommand(releaseLock),
});
Yargs.command<WorkspaceDbOpt>({
  command: "clearWriteLock",
  describe: "clear the write lock for a cloud container. Note: this can be dangerous!",
  handler: runCommand(clearWriteLock),
});
Yargs.command<EditorOpts>({
  command: "purgeWorkspace",
  describe: "purge deleted blocks from a WorkspaceContainer",
  handler: runCommand(purgeWorkspace),
});
Yargs.command<InitializeOpts>({
  command: "initializeWorkspace",
  describe: "initialize a WorkspaceContainer (empties if already initialized)",
  builder: {
    noPrompt: { describe: "skip prompt", boolean: true, default: false },
  },
  handler: runCommand(initializeWorkspace),
});

/** execute an "@" script - a list of WorkspaceEditor commands */
async function runScript(arg: EditorProps & { scriptName: string }) {
  inScript = true;
  const val = fs.readFileSync(arg.scriptName, "utf-8");
  const lines = val.split("\r");
  let i = 0;
  for (let line of lines) {
    i++;
    line = line.split("#")[0].trim();
    if (line.length === 0)
      continue;

    await Yargs.parseAsync(line, {}, (err: Error | undefined, _argv: any, _output: string) => {
      if (err) {
        console.error(`${arg.scriptName}:${i} [${line}] : ${BentleyError.getErrorMessage(err)}`);
        process.exit(1);
      }
    });
  }
}

/** Parse and execute WorkspaceEditor commands */
async function main() {
  if (process.argv[2][0] === "@") {
    const parsed = Yargs.parseSync(process.argv.slice(3));
    if (parsed.config)
      process.env.WORKSPACE_EDITOR_CONFIG = parsed.config as string;

    await runCommand(runScript)({ scriptName: process.argv[2].substring(1) });
    return;
  }

  Yargs.demandCommand();
  await Yargs.parseAsync();
}

void main();
