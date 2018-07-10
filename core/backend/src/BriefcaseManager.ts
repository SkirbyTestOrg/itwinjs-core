/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module iModels */

import {
  AccessToken, Briefcase as HubBriefcase, IModelHubClient, ConnectClient, ChangeSet, IModelRepository,
  ContainsSchemaChanges, Briefcase, Code, IModelHubError,
  BriefcaseQuery, ChangeSetQuery, IModelQuery, AzureFileHandler, ConflictingCodesError,
} from "@bentley/imodeljs-clients";
import { ChangeSetApplyOption, BeEvent, DbResult, OpenMode, assert, Logger, ChangeSetStatus, BentleyStatus, IModelHubStatus } from "@bentley/bentleyjs-core";
import { BriefcaseStatus, IModelError, IModelVersion, IModelToken, CreateIModelProps } from "@bentley/imodeljs-common";
import { NativePlatformRegistry } from "./NativePlatformRegistry";
import { NativeDgnDb, ErrorStatusOrResult } from "./imodeljs-native-platform-api";
import { IModelDb, OpenParams, SyncMode, AccessMode } from "./IModelDb";
import { IModelHost } from "./IModelHost";
import { IModelJsFs } from "./IModelJsFs";
import * as path from "path";
import * as glob from "glob";

const loggingCategory = "imodeljs-backend.BriefcaseManager";

/** The Id assigned to a briefcase by iModelHub, or one of the special values that identify special kinds of iModels */
export class BriefcaseId {
  private value: number;
  public static get Illegal(): number { return 0xffffffff; }
  public static get Master(): number { return 0; }
  public static get Standalone(): number { return 1; }
  constructor(value?: number) {
    if (value === undefined)
      this.value = BriefcaseId.Illegal;
    else this.value = value;
  }
  public isValid(): boolean { return this.value !== BriefcaseId.Illegal; }
  public isMaster(): boolean { return this.value !== BriefcaseId.Master; }
  public isStandaloneId(): boolean { return this.value !== BriefcaseId.Standalone; }
  public getValue(): number { return this.value; }
  public toString(): string { return this.value.toString(); }
}

/** Option to keep briefcase when the imodel is closed */
export const enum KeepBriefcase {
  No = 0,
  Yes = 1,
}

/** A token that represents a ChangeSet */
export class ChangeSetToken {
  constructor(public id: string, public parentId: string, public index: number, public pathname: string, public containsSchemaChanges: ContainsSchemaChanges) { }
}

/** Entry in the briefcase cache */
export class BriefcaseEntry {

  /** Id of the iModel - set to the DbGuid field in the BIM, it corresponds to the Guid used to track the iModel in iModelHub */
  public iModelId!: string;

  /** Absolute path where the briefcase is cached/stored */
  public pathname!: string;

  /** Id of the last change set that was applied to the BIM.
   * Set to an empty string if it is the initial version, or a standalone briefcase
   */
  public changeSetId!: string;

  /** Index of the last change set that was applied to the BI.
   * Only specified if the briefcase was acquired from the Hub.
   * Set to 0 if it is the initial version.
   */
  public changeSetIndex?: number;

  /** Briefcase Id  */
  public briefcaseId!: number;

  /** Flag indicating if the briefcase is a standalone iModel that only exists locally on disk, or is from iModelHub */
  public isStandalone!: boolean;

  /** Flag to indicate if the briefcase is currently open */
  public isOpen!: boolean;

  /** In-memory handle of the native Db */
  public nativeDb!: NativeDgnDb;

  /** Params used to open the briefcase */
  public openParams?: OpenParams;

  /** Id of the last change set that was applied to the BIM after it was reversed.
   * Undefined if no change sets have been reversed.
   * Set to empty string if reversed to the first version.
   */
  public reversedChangeSetId?: string;

  /** Index of the last change set that was applied to the BIM after it was reversed.
   * Undefined if no change sets have been reversed
   * Set to 0 if the briefcase has been reversed to the first version
   */
  public reversedChangeSetIndex?: number;

  /** Id of the user that acquired the briefcase. This is not set if it is a standalone briefcase */
  public userId?: string;

  /** In-memory handle fo the IModelDb that corresponds with this briefcase. This is only set if an IModelDb wrapper has been created for this briefcase */
  public iModelDb?: IModelDb;

  /** File Id used to upload change sets for this briefcase (only setup in Read-Write cases) */
  public fileId?: string;

  /** Error set if push has succeeded, but updating codes has failed with conflicts */
  public conflictError?: ConflictingCodesError;

  /** @hidden Event called after a changeset is applied to a briefcase. */
  public readonly onChangesetApplied = new BeEvent<() => void>();

  /** @hidden Event called when the briefcase is about to be closed */
  public readonly onBeforeClose = new BeEvent<() => void>();

  /** @hidden Event called when the version of the briefcase has been updated */
  public readonly onBeforeVersionUpdate = new BeEvent<() => void>();

  /** Gets the path key to be used in the cache and iModelToken */
  public getKey(): string {
    if (this.isStandalone)
      return this.pathname;

    // Standalone (FixedVersion, PullOnly)
    if (this.briefcaseId === BriefcaseId.Standalone) {
      const uniqueId = path.basename(path.dirname(this.pathname)).substr(1);
      return `${this.iModelId}:${this.changeSetId}:${uniqueId}`;
    }

    // Acquired (PullPush)
    return `${this.iModelId}:${this.briefcaseId}`;
  }
}

/** In-memory cache of briefcases */
class BriefcaseCache {
  private readonly briefcases = new Map<string, BriefcaseEntry>();

  /** Find a briefcase in the cache by token */
  public findBriefcaseByToken({ key }: IModelToken): BriefcaseEntry | undefined {
    assert(!!key);
    return this.findBriefcaseByKey(key!);
  }

  /** Find a briefcase in the cache by key */
  public findBriefcaseByKey(key: string): BriefcaseEntry | undefined {
    return this.briefcases.get(key);
  }

  /** Find a briefcase in the cache */
  public findBriefcase(briefcase: BriefcaseEntry): BriefcaseEntry | undefined {
    return this.briefcases.get(briefcase.getKey());
  }

  /** Add a briefcase to the cache */
  public addBriefcase(briefcase: BriefcaseEntry) {
    const key = briefcase.getKey();

    if (this.briefcases.get(key)) {
      const msg = `Briefcase ${key} already exists in the cache.`;
      Logger.logError(loggingCategory, msg);
      throw new IModelError(DbResult.BE_SQLITE_ERROR, msg);
    }

    Logger.logTrace(loggingCategory, `Added briefcase ${key} (${briefcase.pathname}) to the cache`);
    this.briefcases.set(key, briefcase);
  }

  /** Delete a briefcase from the cache */
  public deleteBriefcase(briefcase: BriefcaseEntry) {
    this.deleteBriefcaseByKey(briefcase.getKey());
  }

  /** Delete a briefcase from the cache by key */
  public deleteBriefcaseByKey(key: string) {
    const briefcase = this.briefcases.get(key);
    if (!briefcase) {
      const msg = `Briefcase ${key} not found in cache`;
      Logger.logError(loggingCategory, msg);
      throw new IModelError(DbResult.BE_SQLITE_ERROR, msg);
    }

    Logger.logTrace(loggingCategory, `Removed briefcase ${key} (${briefcase.pathname}) from the cache`);
    this.briefcases.delete(key);
  }

  /** Get a subset of entries in the cache */
  public getFilteredBriefcases(filterFn: (value: BriefcaseEntry) => boolean): BriefcaseEntry[] {
    const filteredBriefcases = new Array<BriefcaseEntry>();
    this.briefcases.forEach((value: BriefcaseEntry) => {
      if (filterFn(value))
        filteredBriefcases.push(value);
    });
    return filteredBriefcases;
  }

  /** Checks if the cache is empty */
  public isEmpty(): boolean { return this.briefcases.size === 0; }

  /** Clears all entries in the cache */
  public clear() { this.briefcases.clear(); }
}

/** Utility to manage briefcases */
export class BriefcaseManager {
  private static cache: BriefcaseCache = new BriefcaseCache();
  private static isCacheInitialized?: boolean;
  private static _hubClient?: IModelHubClient;

  /** IModelHub Client to be used for all briefcase operations */
  public static get hubClient(): IModelHubClient {
    if (!BriefcaseManager._hubClient) {
      if (!IModelHost.configuration)
        throw new Error("IModelHost.startup() should be called before any backend operations");
      BriefcaseManager._hubClient = new IModelHubClient(IModelHost.configuration.hubDeploymentEnv, new AzureFileHandler(false));
    }
    return BriefcaseManager._hubClient;
  }

  private static _connectClient?: ConnectClient;

  /** Connect client to be used for all briefcase operations */
  public static get connectClient(): ConnectClient {
    if (!BriefcaseManager._connectClient) {
      if (!IModelHost.configuration)
        throw new Error("IModelHost.startup() should be called before any backend operations");
      BriefcaseManager._connectClient = new ConnectClient(IModelHost.configuration.hubDeploymentEnv);
    }
    return BriefcaseManager._connectClient;
  }

  /** Get the local path of the root folder storing the imodel seed file, change sets and briefcases */
  private static getIModelPath(iModelId: string): string {
    const pathname = path.join(BriefcaseManager.cacheDir, iModelId, "/");
    return path.normalize(pathname);
  }

  public static getChangeSetsPath(iModelId: string): string { return path.join(BriefcaseManager.getIModelPath(iModelId), "csets"); }
  public static getChangeCachePathName(iModelId: string): string { return path.join(BriefcaseManager.getIModelPath(iModelId), iModelId.concat(".bim.ecchanges")); }

  private static getBriefcasesPath(iModelId: string) {
    return path.join(BriefcaseManager.getIModelPath(iModelId), "bc");
  }

  private static buildStandalonePathname(iModelId: string, iModelName: string): string {
    const briefcases = BriefcaseManager.cache.getFilteredBriefcases((entry: BriefcaseEntry) => {
      return entry.iModelId === iModelId && entry.briefcaseId === BriefcaseId.Standalone;
    });

    const pathBaseName: string = BriefcaseManager.getBriefcasesPath(iModelId);

    let pathname: string | undefined;
    for (let ii = briefcases.length; !pathname || IModelJsFs.existsSync(pathname); ii++) {
      pathname = path.join(pathBaseName, `_${ii.toString()}`, iModelName.concat(".bim"));
    }
    return pathname;
  }

  private static buildAcquiredPathname(iModelId: string, briefcaseId: number, iModelName: string): string {
    const pathBaseName: string = BriefcaseManager.getBriefcasesPath(iModelId);

    return path.join(pathBaseName, briefcaseId.toString(), iModelName.concat(".bim"));
  }

  private static buildScratchPath(): string { return path.join(BriefcaseManager.cacheDir, "scratch"); }

  /** Clear the briefcase manager cache */
  private static clearCache() {
    BriefcaseManager.cache.clear();
    BriefcaseManager.isCacheInitialized = undefined;
  }

  private static onIModelHostShutdown() {
    BriefcaseManager.clearCache();
    BriefcaseManager._hubClient = undefined;
    BriefcaseManager._connectClient = undefined;
    BriefcaseManager._cacheDir = undefined;
    IModelHost.onBeforeShutdown.removeListener(BriefcaseManager.onIModelHostShutdown);
  }

  /** Create a directory, recursively setting up the path as necessary */
  private static makeDirectoryRecursive(dirPath: string) {
    if (IModelJsFs.existsSync(dirPath))
      return;
    BriefcaseManager.makeDirectoryRecursive(path.dirname(dirPath));
    IModelJsFs.mkdirSync(dirPath);
  }

  /** Get information on a briefcase on disk by opening it, and querying the hub */
  private static async addBriefcaseToCache(accessToken: AccessToken, briefcaseDir: string, iModelId: string) {
    const fileNames = IModelJsFs.readdirSync(briefcaseDir);
    if (fileNames.length !== 1)
      throw new IModelError(DbResult.BE_SQLITE_ERROR, `Briefcase directory ${briefcaseDir} must contain exactly one briefcase`);
    const pathname = path.join(briefcaseDir, fileNames[0]);

    // Open the briefcase (for now as ReadWrite to allow reinstating reversed briefcases)
    const briefcase = BriefcaseManager.openBriefcase(iModelId, pathname, new OpenParams(OpenMode.ReadWrite));

    try {
      // Append information from the Hub
      briefcase.changeSetIndex = await BriefcaseManager.getChangeSetIndexFromId(accessToken, briefcase.iModelId, briefcase.changeSetId);
      if (briefcase.reversedChangeSetId)
        briefcase.reversedChangeSetIndex = await BriefcaseManager.getChangeSetIndexFromId(accessToken, briefcase.iModelId, briefcase.reversedChangeSetId);
      if (briefcase.briefcaseId !== BriefcaseId.Standalone) {
        const hubBriefcases: HubBriefcase[] = await BriefcaseManager.hubClient.Briefcases().get(accessToken, iModelId, new BriefcaseQuery().byId(briefcase.briefcaseId));
        if (hubBriefcases.length === 0)
          throw new IModelError(DbResult.BE_SQLITE_ERROR, `Unable to find briefcase ${briefcase.briefcaseId}:${briefcase.pathname} on the Hub (for the current user)`);
        briefcase.userId = hubBriefcases[0].userId;
        briefcase.fileId = hubBriefcases[0].fileId;
      }

      // Reinstate any reversed changes - these can happen with exclusive briefcases
      // Note: We currently allow reversal only in Exclusive briefcases. Ideally we should just keep these briefcases reversed in case they
      // are exclusive, but at the moment we don't have a way of differentiating exclusive and shared briefcases when opening them the
      // first time. We could consider caching that information also. see findCachedBriefcaseToOpen()
      if (briefcase.reversedChangeSetId) {
        await BriefcaseManager.reinstateChanges(accessToken, briefcase);
        assert(!briefcase.reversedChangeSetId && !briefcase.nativeDb.getReversedChangeSetId(), "Error with reinstating reversed changes");
      }
    } catch (error) {
      throw error;
    } finally {
      if (briefcase && briefcase.isOpen)
        BriefcaseManager.closeBriefcase(briefcase);
    }

    BriefcaseManager.cache.addBriefcase(briefcase);
  }

  /** Get basic information on all briefcases on disk under the specified path */
  private static async initCacheForIModel(accessToken: AccessToken, iModelId: string) {
    const basePath = BriefcaseManager.getBriefcasesPath(iModelId);
    if (!IModelJsFs.existsSync(basePath))
      return;
    const subDirs = IModelJsFs.readdirSync(basePath);
    if (subDirs.length === 0)
      return;

    for (const subDirName of subDirs) {
      const briefcaseDir = path.join(basePath, subDirName);
      try {
        await BriefcaseManager.addBriefcaseToCache(accessToken, briefcaseDir, iModelId);
      } catch (error) {
        Logger.logWarning(loggingCategory, `Deleting briefcase in ${briefcaseDir} from cache`);
        BriefcaseManager.deleteFolderRecursive(briefcaseDir);
      }
    }
  }

  private static readonly cacheMajorVersion: number = 1;
  private static readonly cacheMinorVersion: number = 0;

  private static buildCacheSubDir(): string {
    return `v${BriefcaseManager.cacheMajorVersion}_${BriefcaseManager.cacheMinorVersion}`;
  }

  private static findCacheSubDir(): string | undefined {
    if (!IModelHost.configuration || !IModelHost.configuration.briefcaseCacheDir) {
      assert(false, "Cache directory undefined");
      return undefined;
    }
    const cacheDir = IModelHost.configuration.briefcaseCacheDir;
    let dirs: string[] | undefined;
    try {
      dirs = glob.sync(`v${BriefcaseManager.cacheMajorVersion}_*`, { cwd: cacheDir });
      assert(dirs.length === 1, "Expected *only* a single directory for a major version");
    } catch (error) {
    }
    if (!dirs || dirs.length === 0)
      return undefined;
    return dirs[0];
  }

  private static _cacheDir?: string;
  public static get cacheDir(): string {
    if (!BriefcaseManager._cacheDir)
      BriefcaseManager.setupCacheDir();
    return BriefcaseManager._cacheDir!;
  }

  private static setupCacheDir() {
    const cacheSubDirOnDisk = BriefcaseManager.findCacheSubDir();
    const cacheSubDir = BriefcaseManager.buildCacheSubDir();
    const cacheDir = path.join(IModelHost.configuration!.briefcaseCacheDir, cacheSubDir);

    if (!cacheSubDirOnDisk) {
      // For now, just recreate the entire cache if the directory for the major version is not found - NEEDS_WORK
      BriefcaseManager.deleteFolderRecursive(IModelHost.configuration!.briefcaseCacheDir!);
    } else if (cacheSubDirOnDisk !== cacheSubDir) {
      const cacheDirOnDisk = path.join(IModelHost.configuration!.briefcaseCacheDir!, cacheSubDirOnDisk);
      BriefcaseManager.deleteFolderRecursive(cacheDirOnDisk);
    }

    if (!IModelJsFs.existsSync(cacheDir))
      BriefcaseManager.makeDirectoryRecursive(cacheDir);

    BriefcaseManager._cacheDir = cacheDir;
  }

  /** Initialize the briefcase manager cache of in-memory briefcases (if necessary).
   * Note: Callers should use memoizedInitCache() instead
   */
  private static async initCache(accessToken?: AccessToken): Promise<void> {
    if (BriefcaseManager.isCacheInitialized)
      return;

    if (!IModelHost.configuration)
      throw new IModelError(DbResult.BE_SQLITE_ERROR, "IModelHost.startup() should be called before any backend operations");

    IModelHost.onBeforeShutdown.addListener(BriefcaseManager.onIModelHostShutdown);
    if (!accessToken)
      return;

    for (const iModelId of IModelJsFs.readdirSync(BriefcaseManager.cacheDir)) {
      await BriefcaseManager.initCacheForIModel(accessToken, iModelId);
    }

    BriefcaseManager.isCacheInitialized = true;
  }

  private static _memoizedInitCache?: Promise<void>;
  /** Memoized initCache - avoids race condition caused by two async calls to briefcase manager */
  private static async memoizedInitCache(accessToken?: AccessToken) {
    // NEEDS_WORK: initCache() is to be made synchronous and independent of the accessToken passed in.
    if (!BriefcaseManager._memoizedInitCache)
      BriefcaseManager._memoizedInitCache = BriefcaseManager.initCache(accessToken);
    await BriefcaseManager._memoizedInitCache;
    BriefcaseManager._memoizedInitCache = undefined;
  }

  /** Get the index of the change set from its id */
  private static async getChangeSetIndexFromId(accessToken: AccessToken, iModelId: string, changeSetId: string): Promise<number> {
    if (changeSetId === "")
      return 0; // the first version
    try {
      const changeSet: ChangeSet = (await BriefcaseManager.hubClient.ChangeSets().get(accessToken, iModelId, new ChangeSetQuery().byId(changeSetId)))[0];
      return +changeSet.index!;
    } catch (err) {
      assert(false, "Could not determine index of change set");
      return -1;
    }
  }

  /** Open a briefcase */
  public static async open(accessToken: AccessToken, projectId: string, iModelId: string, openParams: OpenParams, version: IModelVersion): Promise<BriefcaseEntry> {
    await BriefcaseManager.memoizedInitCache(accessToken);
    assert(!!BriefcaseManager.hubClient);

    const changeSetId: string = await version.evaluateChangeSet(accessToken, iModelId, BriefcaseManager.hubClient);

    let changeSetIndex: number;
    if (changeSetId === "") {
      changeSetIndex = 0; // First version
    } else {
      const changeSet: ChangeSet = await BriefcaseManager.getChangeSetFromId(accessToken, iModelId, changeSetId);
      changeSetIndex = changeSet ? +changeSet.index! : 0;
    }

    let briefcase = BriefcaseManager.findCachedBriefcaseToOpen(accessToken, iModelId, changeSetIndex, openParams);
    if (briefcase && briefcase.isOpen) {
      Logger.logTrace(loggingCategory, `Reused briefcase ${briefcase.pathname} without changes`);
      assert(briefcase.changeSetIndex === changeSetIndex);
      return briefcase;
    }

    let isNewBriefcase: boolean = false;
    const tempOpenParams = new OpenParams(OpenMode.ReadWrite, openParams.accessMode, openParams.syncMode); // Merge needs the Db to be opened ReadWrite
    if (briefcase) {
      Logger.logTrace(loggingCategory, `Reused briefcase ${briefcase.pathname} after upgrades (if necessary)`);
      BriefcaseManager.reopenBriefcase(briefcase, tempOpenParams);
    } else {
      briefcase = await BriefcaseManager.createBriefcase(accessToken, projectId, iModelId, tempOpenParams); // Merge needs the Db to be opened ReadWrite
      isNewBriefcase = true;
    }

    let changeSetApplyOption: ChangeSetApplyOption | undefined;
    if (changeSetIndex > briefcase.changeSetIndex!) {
      changeSetApplyOption = ChangeSetApplyOption.Merge;
    } else if (changeSetIndex < briefcase.changeSetIndex!) {
      if (openParams.syncMode === SyncMode.PullAndPush) {
        Logger.logWarning(loggingCategory, `No support to open an older version when opening an IModel to push changes (SyncMode.PullAndPush). Cannot open briefcase ${briefcase.iModelId}:${briefcase.briefcaseId}.`);
        await BriefcaseManager.deleteBriefcase(accessToken, briefcase);
        return Promise.reject(new IModelError(BriefcaseStatus.CannotApplyChanges, "Cannot merge when there are reversed changes"));
      }
      changeSetApplyOption = ChangeSetApplyOption.Reverse;
    }

    if (changeSetApplyOption) {
      assert(briefcase.isOpen && briefcase.openParams!.openMode === OpenMode.ReadWrite); // Briefcase must be opened ReadWrite first to allow applying change sets
      try {
        await BriefcaseManager.applyChangeSets(accessToken, briefcase, IModelVersion.asOfChangeSet(changeSetId), changeSetApplyOption);
      } catch (error) {
        Logger.logWarning(loggingCategory, `Error merging changes to briefcase  ${briefcase.iModelId}:${briefcase.briefcaseId}. Deleting it so that it can be re-fetched again.`);
        await BriefcaseManager.deleteBriefcase(accessToken, briefcase);
        return Promise.reject(error);
      }
    }

    // Reopen the briefcase if the briefcase hasn't been opened with the required OpenMode
    if (briefcase.openParams!.openMode !== openParams.openMode)
      BriefcaseManager.reopenBriefcase(briefcase, openParams);

    // Add briefcase to cache if necessary
    if (isNewBriefcase) {
      // Note: This cannot be done right after creation since the version (that's part of the key to the cache)
      // is not established until the change sets are merged
      BriefcaseManager.cache.addBriefcase(briefcase);
    }

    return briefcase;
  }

  /** Close a briefcase */
  public static async close(accessToken: AccessToken, briefcase: BriefcaseEntry, keepBriefcase: KeepBriefcase): Promise<void> {
    assert(!briefcase.isStandalone, "Cannot use IModelDb.close() to close a standalone iModel. Use IModelDb.closeStandalone() instead");
    briefcase.onBeforeClose.raiseEvent(briefcase);
    BriefcaseManager.closeBriefcase(briefcase);
    if (keepBriefcase === KeepBriefcase.No)
      await BriefcaseManager.deleteBriefcase(accessToken, briefcase);
  }

  /** Get the change set from the specified id */
  private static async getChangeSetFromId(accessToken: AccessToken, iModelId: string, changeSetId: string): Promise<ChangeSet> {
    const changeSets: ChangeSet[] = await BriefcaseManager.hubClient.ChangeSets().get(accessToken, iModelId, new ChangeSetQuery().byId(changeSetId));
    if (changeSets.length > 0)
      return changeSets[0];

    return Promise.reject(new IModelError(BriefcaseStatus.VersionNotFound, changeSetId));
  }

  /** Finds any existing briefcase for the specified parameters. Pass null for the requiredChangeSet if the first version is to be retrieved */
  private static findCachedBriefcaseToOpen(accessToken: AccessToken, iModelId: string, requiredChangeSetIndex: number, requiredOpenParams: OpenParams): BriefcaseEntry | undefined {

    const requiredUserId = accessToken.getUserProfile()!.userId;

    const filterBriefcaseFn = (entry: BriefcaseEntry): boolean => {

      // Narrow down to entries for the specified iModel
      if (entry.iModelId !== iModelId)
        return false;

      // Reject any previously open briefcases if exclusive access is required
      if (entry.isOpen && requiredOpenParams.accessMode === AccessMode.Exclusive)
        return false;

      // Narrow down to the exact same open parameters (if it was opened)
      if (entry.isOpen && (entry.openParams!.openMode !== requiredOpenParams.openMode || entry.openParams!.accessMode !== requiredOpenParams.accessMode || entry.openParams!.syncMode !== requiredOpenParams.syncMode))
        return false;

      // For PullOnly or FixedVersion briefcases, ensure that the briefcase is opened Standalone, and does NOT have any reversed changes
      // Note: We currently allow reversal only in Exclusive briefcases. Also, we reinstate any reversed changes in all briefcases when the
      // cache is initialized, but that may be removed in the future. See addBriefcaseToCache()
      if (requiredOpenParams.syncMode !== SyncMode.PullAndPush)
        return entry.briefcaseId === BriefcaseId.Standalone && !entry.reversedChangeSetId;

      // For PullAndPush briefcases, ensure that the user had acquired the briefcase the first time around
      // else if (requiredOpenParams.syncMode === SyncMode.PullAndPush)
      return entry.userId === requiredUserId;
    };

    // Narrow the cache down to the entries for the specified imodel, with the specified openMode (if defined) and those that don't have any change sets reversed
    const briefcases = this.cache.getFilteredBriefcases(filterBriefcaseFn);
    if (!briefcases || briefcases.length === 0)
      return undefined;

    let briefcase: BriefcaseEntry | undefined;

    /* FixedVersion, PullOnly - find a standalone briefcase */
    if (requiredOpenParams.syncMode !== SyncMode.PullAndPush) {

      // first prefer a briefcase that's open, and with changeSetIndex = requiredChangeSetIndex (if exclusive access is not required)
      if (requiredOpenParams.accessMode !== AccessMode.Exclusive) {
        briefcase = briefcases.find((entry: BriefcaseEntry): boolean => {
          return entry.isOpen && entry.changeSetIndex === requiredChangeSetIndex;
        });
        if (briefcase)
          return briefcase;
      }

      // next prefer a briefcase that's closed, and with changeSetIndex = requiredChangeSetIndex
      briefcase = briefcases.find((entry: BriefcaseEntry): boolean => {
        return !entry.isOpen && entry.changeSetIndex === requiredChangeSetIndex;
      });
      if (briefcase)
        return briefcase;

      // next prefer any standalone briefcase that's closed, and with changeSetIndex < requiredChangeSetIndex
      briefcase = briefcases.find((entry: BriefcaseEntry): boolean => {
        return !entry.isOpen && entry.changeSetIndex! < requiredChangeSetIndex;
      });
      if (briefcase)
        return briefcase;

      return undefined;
    }

    /* PullAndPush - find the acquired briefcase */

    // first prefer any briefcase with changeSetIndex = requiredChangeSetIndex
    briefcase = briefcases.find((entry: BriefcaseEntry): boolean => {
      return entry.changeSetIndex === requiredChangeSetIndex;
    });
    if (briefcase) {
      assert(!briefcase.isOpen); // PullAndPush require Exclusive access, and cannot reuse a previously open briefcase
      return briefcase;
    }

    // next prefer any briefcase with changeSetIndex < requiredChangeSetIndex
    briefcase = briefcases.find((entry: BriefcaseEntry): boolean => {
      return entry.changeSetIndex! < requiredChangeSetIndex;
    });
    if (briefcase) {
      assert(!briefcase.isOpen); // PullAndPush require Exclusive access, and cannot reuse a previously open briefcase
      return briefcase;
    }

    return undefined;
  }

  private static setupBriefcase(briefcase: BriefcaseEntry, openParams: OpenParams): DbResult {
    const nativeDb: NativeDgnDb = new (NativePlatformRegistry.getNativePlatform()).NativeDgnDb();

    assert(openParams.openMode === OpenMode.ReadWrite); // Expect to setup briefcase as ReadWrite to allow pull and merge of changes (irrespective of the real openMode)

    let res: DbResult = nativeDb.openIModel(briefcase.pathname, openParams.openMode);
    if (DbResult.BE_SQLITE_OK !== res) {
      Logger.logError(loggingCategory, `Unable to open briefcase at ${briefcase.pathname}`);
      return res;
    }

    res = nativeDb.setBriefcaseId(briefcase.briefcaseId);
    if (DbResult.BE_SQLITE_OK !== res) {
      Logger.logError(loggingCategory, `Unable to setup briefcase id for ${briefcase.pathname}`);
      return res;
    }
    assert(nativeDb.getParentChangeSetId() === briefcase.changeSetId);

    briefcase.nativeDb = nativeDb;
    briefcase.openParams = openParams;
    briefcase.isOpen = true;
    briefcase.isStandalone = false;

    Logger.logTrace(loggingCategory, `Created briefcase ${briefcase.pathname}`);
    return DbResult.BE_SQLITE_OK;
  }

  /** Create a briefcase */
  private static async createBriefcase(accessToken: AccessToken, contextId: string, iModelId: string, openParams: OpenParams): Promise<BriefcaseEntry> {
    const iModel: IModelRepository = (await BriefcaseManager.hubClient.IModels().get(accessToken, contextId, new IModelQuery().byId(iModelId)))[0];

    const briefcase = new BriefcaseEntry();
    briefcase.iModelId = iModelId;
    briefcase.userId = accessToken.getUserProfile()!.userId;

    if (openParams.syncMode !== SyncMode.PullAndPush) {
      /* FixedVersion, PullOnly => Create standalone briefcase */
      briefcase.pathname = BriefcaseManager.buildStandalonePathname(iModelId, iModel.name!);
      briefcase.briefcaseId = BriefcaseId.Standalone;
      await BriefcaseManager.downloadSeedFile(accessToken, iModelId, briefcase.pathname);
      briefcase.changeSetId = "";
      briefcase.changeSetIndex = 0;
    } else {
      /* PullAndPush => Acquire a briefcase from the hub */
      const hubBriefcase: HubBriefcase = await BriefcaseManager.acquireBriefcase(accessToken, iModelId);
      briefcase.pathname = BriefcaseManager.buildAcquiredPathname(iModelId, +hubBriefcase.briefcaseId!, iModel.name!);
      briefcase.briefcaseId = hubBriefcase.briefcaseId!;
      briefcase.fileId = hubBriefcase.fileId;
      await BriefcaseManager.downloadBriefcase(hubBriefcase, briefcase.pathname);
      briefcase.changeSetId = hubBriefcase.mergedChangeSetId!;
      briefcase.changeSetIndex = await BriefcaseManager.getChangeSetIndexFromId(accessToken, iModelId, briefcase.changeSetId);
    }

    const res: DbResult = BriefcaseManager.setupBriefcase(briefcase, openParams);
    if (DbResult.BE_SQLITE_OK !== res) {
      Logger.logWarning(loggingCategory, `Unable to create briefcase ${briefcase.pathname}. Deleting any remnants of it`);
      await BriefcaseManager.deleteBriefcase(accessToken, briefcase);
      throw new IModelError(res, briefcase.pathname);
    }

    return briefcase;
  }

  /** Acquire a briefcase */
  private static async acquireBriefcase(accessToken: AccessToken, iModelId: string): Promise<HubBriefcase> {
    const briefcase: HubBriefcase = await BriefcaseManager.hubClient.Briefcases().create(accessToken, iModelId);
    if (!briefcase) {
      Logger.logError(loggingCategory, "Could not acquire briefcase"); // Could well be that the current user does not have the appropriate access
      return Promise.reject(new IModelError(BriefcaseStatus.CannotAcquire));
    }
    return briefcase;
  }

  /** Downloads the briefcase file */
  private static async downloadBriefcase(briefcase: Briefcase, seedPathname: string): Promise<void> {
    if (IModelJsFs.existsSync(seedPathname))
      return;
    return BriefcaseManager.hubClient.Briefcases().download(briefcase, seedPathname)
      .catch(() => {
        return Promise.reject(new IModelError(BriefcaseStatus.CannotDownload));
      });
  }

  /** Downloads the briefcase seed file */
  private static async downloadSeedFile(accessToken: AccessToken, imodelId: string, seedPathname: string): Promise<void> {
    if (IModelJsFs.existsSync(seedPathname))
      return;
    return BriefcaseManager.hubClient.IModels().download(accessToken, imodelId, seedPathname)
      .catch(() => {
        return Promise.reject(new IModelError(BriefcaseStatus.CannotDownload));
      });
  }

  /** Deletes a briefcase from the local disk (if it exists) */
  private static deleteBriefcaseFromLocalDisk(briefcase: BriefcaseEntry) {
    const dirName = path.dirname(briefcase.pathname);
    BriefcaseManager.deleteFolderRecursive(dirName);
  }

  /** Deletes a briefcase from the hub (if it exists) */
  private static async deleteBriefcaseFromHub(accessToken: AccessToken, briefcase: BriefcaseEntry): Promise<void> {
    assert(!!briefcase.iModelId);
    if (briefcase.briefcaseId === BriefcaseId.Standalone)
      return;

    try {
      await BriefcaseManager.hubClient.Briefcases().get(accessToken, briefcase.iModelId, new BriefcaseQuery().byId(briefcase.briefcaseId));
    } catch (err) {
      return; // Briefcase does not exist on the hub, or cannot be accessed
    }

    await BriefcaseManager.hubClient.Briefcases().delete(accessToken, briefcase.iModelId, briefcase.briefcaseId)
      .catch(() => {
        Logger.logError(loggingCategory, "Could not delete the acquired briefcase"); // Could well be that the current user does not have the appropriate access
      });
  }

  /** Deletes a briefcase from the cache (if it exists) */
  private static deleteBriefcaseFromCache(briefcase: BriefcaseEntry) {
    if (!BriefcaseManager.cache.findBriefcase(briefcase))
      return;

    BriefcaseManager.cache.deleteBriefcase(briefcase);
  }

  /** Deletes a briefcase, and releases its references in iModelHub if necessary */
  private static async deleteBriefcase(accessToken: AccessToken, briefcase: BriefcaseEntry): Promise<void> {
    BriefcaseManager.deleteBriefcaseFromCache(briefcase);
    await BriefcaseManager.deleteBriefcaseFromHub(accessToken, briefcase);
    BriefcaseManager.deleteBriefcaseFromLocalDisk(briefcase);
  }

  /** Get change sets in the specified range
   *  * Gets change sets *after* the specified fromChangeSetId, up to and including the toChangeSetId
   *  * If the ids are the same returns an empty array
   */
  private static async getChangeSets(accessToken: AccessToken, iModelId: string, includeDownloadLink: boolean, fromChangeSetId: string, toChangeSetId: string): Promise<ChangeSet[]> {
    if (toChangeSetId === "" /* first version */ || fromChangeSetId === toChangeSetId)
      return new Array<ChangeSet>();

    const query = new ChangeSetQuery();
    if (fromChangeSetId)
      query.fromId(fromChangeSetId);
    if (includeDownloadLink)
      query.selectDownloadUrl();
    const allChangeSets: ChangeSet[] = await BriefcaseManager.hubClient.ChangeSets().get(accessToken, iModelId, query);

    const changeSets = new Array<ChangeSet>();
    for (const changeSet of allChangeSets) {
      changeSets.push(changeSet);
      if (changeSet.wsgId === toChangeSetId)
        return changeSets;
    }

    return Promise.reject(new IModelError(BriefcaseStatus.VersionNotFound));
  }

  private static async downloadChangeSetsInternal(iModelId: string, changeSets: ChangeSet[]) {
    const changeSetsPath: string = BriefcaseManager.getChangeSetsPath(iModelId);

    const changeSetsToDownload = new Array<ChangeSet>();
    for (const changeSet of changeSets) {
      const changeSetPathname = path.join(changeSetsPath, changeSet.fileName!);
      if (!IModelJsFs.existsSync(changeSetPathname))
        changeSetsToDownload.push(changeSet);
    }

    // download
    if (changeSetsToDownload.length > 0) {
      await BriefcaseManager.hubClient.ChangeSets().download(changeSetsToDownload, changeSetsPath)
        .catch(() => {
          return Promise.reject(new IModelError(BriefcaseStatus.CannotDownload));
        });
    }
  }

  /** Downloads change sets in the specified range.
   *  * Downloads change sets *after* the specified fromChangeSetId, up to and including the toChangeSetId
   *  * If the ids are the same returns an empty array.
   */
  public static async downloadChangeSets(accessToken: AccessToken, iModelId: string, fromChangeSetId: string, toChangeSetId: string): Promise<ChangeSet[]> {
    const changeSets = await BriefcaseManager.getChangeSets(accessToken, iModelId, true /*includeDownloadLink*/, fromChangeSetId, toChangeSetId);
    if (changeSets.length === 0)
      return new Array<ChangeSet>();

    await BriefcaseManager.downloadChangeSetsInternal(iModelId, changeSets);

    return changeSets;
  }

  /** Open a standalone iModel from the local disk */
  public static openStandalone(pathname: string, openMode: OpenMode, enableTransactions: boolean): BriefcaseEntry {
    if (BriefcaseManager.cache.findBriefcaseByToken(new IModelToken(pathname)))
      throw new IModelError(DbResult.BE_SQLITE_CANTOPEN, `Cannot open ${pathname} again - it has already been opened once`);

    const nativeDb: NativeDgnDb = new (NativePlatformRegistry.getNativePlatform()).NativeDgnDb();

    const res = nativeDb.openIModel(pathname, openMode);
    if (DbResult.BE_SQLITE_OK !== res)
      throw new IModelError(res, pathname);

    let briefcaseId: number = nativeDb.getBriefcaseId();
    if (enableTransactions) {
      if (briefcaseId === BriefcaseId.Illegal || briefcaseId === BriefcaseId.Master) {
        briefcaseId = BriefcaseId.Standalone;
        nativeDb.setBriefcaseId(briefcaseId);
      }
      assert(nativeDb.getBriefcaseId() !== BriefcaseId.Illegal || nativeDb.getBriefcaseId() !== BriefcaseId.Master);
    }

    const briefcase = new BriefcaseEntry();
    briefcase.iModelId = nativeDb.getDbGuid();
    briefcase.pathname = pathname;
    briefcase.changeSetId = nativeDb.getParentChangeSetId();
    briefcase.briefcaseId = briefcaseId;
    briefcase.isOpen = true;
    briefcase.openParams = OpenParams.standalone(openMode);
    briefcase.isStandalone = true;
    briefcase.nativeDb = nativeDb;

    BriefcaseManager.cache.addBriefcase(briefcase);
    return briefcase;
  }

  /** Create a standalone iModel from the local disk */
  public static createStandalone(fileName: string, args: CreateIModelProps): BriefcaseEntry {
    if (BriefcaseManager.cache.findBriefcaseByToken(new IModelToken(fileName)))
      throw new IModelError(DbResult.BE_SQLITE_ERROR_FileExists, `Cannot create file ${fileName} again - it already exists`);

    const nativeDb: NativeDgnDb = new (NativePlatformRegistry.getNativePlatform()).NativeDgnDb();

    const res: DbResult = nativeDb.createIModel(fileName, JSON.stringify(args));
    if (DbResult.BE_SQLITE_OK !== res)
      throw new IModelError(res, fileName);

    nativeDb.setBriefcaseId(BriefcaseId.Standalone);

    const briefcase = new BriefcaseEntry();
    briefcase.iModelId = nativeDb.getDbGuid();
    briefcase.pathname = fileName;
    briefcase.changeSetId = "";
    briefcase.briefcaseId = BriefcaseId.Standalone;
    briefcase.isOpen = true;
    briefcase.openParams = OpenParams.standalone(OpenMode.ReadWrite);
    briefcase.isStandalone = true;
    briefcase.nativeDb = nativeDb;

    BriefcaseManager.cache.addBriefcase(briefcase);
    return briefcase;
  }

  /** Close the standalone briefcase */
  public static closeStandalone(briefcase: BriefcaseEntry) {
    assert(briefcase.isStandalone, "Cannot use IModelDb.closeStandalone() to close a non-standalone iModel. Use IModelDb.close() instead");
    briefcase.onBeforeClose.raiseEvent(briefcase);
    BriefcaseManager.closeBriefcase(briefcase);
    if (BriefcaseManager.cache.findBriefcase(briefcase))
      BriefcaseManager.cache.deleteBriefcase(briefcase);
  }

  /** Purge closed briefcases */
  public static async purgeClosed(accessToken: AccessToken) {
    await BriefcaseManager.memoizedInitCache(accessToken);

    const briefcases = BriefcaseManager.cache.getFilteredBriefcases((briefcase: BriefcaseEntry) => !briefcase.isOpen);
    for (const briefcase of briefcases) {
      await BriefcaseManager.deleteBriefcase(accessToken, briefcase);
    }
  }

  private static deleteFolderRecursive(folderPath: string) {
    if (!IModelJsFs.existsSync(folderPath))
      return;

    try {
      const files = IModelJsFs.readdirSync(folderPath);
      for (const file of files) {
        const curPath = path.join(folderPath, file);
        if (IModelJsFs.lstatSync(curPath)!.isDirectory) {
          BriefcaseManager.deleteFolderRecursive(curPath);
        } else {
          try {
            IModelJsFs.unlinkSync(curPath);
          } catch (error) {
            Logger.logError(loggingCategory, `Cannot delete file ${curPath}`);
            throw error;
          }
        }
      }
      try {
        IModelJsFs.rmdirSync(folderPath);
      } catch (error) {
        Logger.logError(loggingCategory, `Cannot delete folder: ${folderPath}`);
        throw error;
      }
    } catch (error) {
    }
  }

  /** Purge all briefcases and reset the briefcase manager */
  public static purgeAll() {
    if (IModelJsFs.existsSync(BriefcaseManager.cacheDir))
      BriefcaseManager.deleteFolderRecursive(BriefcaseManager.cacheDir);

    BriefcaseManager.clearCache();
  }

  /** Find the existing briefcase */
  public static findBriefcaseByToken(iModelToken: IModelToken): BriefcaseEntry | undefined {
    return BriefcaseManager.cache.findBriefcaseByToken(iModelToken);
  }

  private static buildChangeSetTokens(changeSets: ChangeSet[], changeSetsPath: string): ChangeSetToken[] {
    const changeSetTokens = new Array<ChangeSetToken>();
    changeSets.forEach((changeSet: ChangeSet) => {
      const changeSetPathname = path.join(changeSetsPath, changeSet.fileName!);
      changeSetTokens.push(new ChangeSetToken(changeSet.wsgId, changeSet.parentId!, +changeSet.index!, changeSetPathname, changeSet.containsSchemaChanges!));
    });
    return changeSetTokens;
  }

  private static openBriefcase(iModelId: string, pathname: string, openParams: OpenParams): BriefcaseEntry {
    const briefcase = new BriefcaseEntry();
    briefcase.iModelId = iModelId;
    briefcase.pathname = pathname;

    briefcase.nativeDb = new (NativePlatformRegistry.getNativePlatform()).NativeDgnDb();
    const res: DbResult = briefcase.nativeDb.openIModel(briefcase.pathname, openParams.openMode);
    if (DbResult.BE_SQLITE_OK !== res)
      throw new IModelError(DbResult.BE_SQLITE_ERROR, `Unable to open briefcase at ${briefcase.pathname}`);

    briefcase.isOpen = true;
    briefcase.openParams = openParams;
    briefcase.isStandalone = false;
    briefcase.briefcaseId = briefcase.nativeDb.getBriefcaseId();
    briefcase.changeSetId = briefcase.nativeDb.getParentChangeSetId();
    briefcase.reversedChangeSetId = briefcase.nativeDb.getReversedChangeSetId();

    return briefcase;
  }

  private static closeBriefcase(briefcase: BriefcaseEntry) {
    assert(briefcase.isOpen, "Briefcase must be open for it to be closed");
    briefcase.nativeDb.closeIModel();
    briefcase.isOpen = false;
    briefcase.openParams = undefined;
  }

  private static reopenBriefcase(briefcase: BriefcaseEntry, openParams: OpenParams) {
    if (briefcase.isOpen)
      BriefcaseManager.closeBriefcase(briefcase);

    briefcase.nativeDb = briefcase.nativeDb || new (NativePlatformRegistry.getNativePlatform()).NativeDgnDb();

    const res: DbResult = briefcase.nativeDb!.openIModel(briefcase.pathname, openParams.openMode);
    if (DbResult.BE_SQLITE_OK !== res)
      throw new IModelError(res, briefcase.pathname);

    briefcase.openParams = openParams;
    briefcase.isOpen = true;
  }

  private static async applyChangeSets(accessToken: AccessToken, briefcase: BriefcaseEntry, targetVersion: IModelVersion, processOption: ChangeSetApplyOption): Promise<void> {
    assert(!!briefcase.nativeDb && briefcase.isOpen);
    assert(briefcase.nativeDb.getParentChangeSetId() === briefcase.changeSetId, "Mismatch between briefcase and the native Db");

    if (briefcase.changeSetIndex === undefined)
      return Promise.reject(new IModelError(ChangeSetStatus.ApplyError, "Cannot apply changes to a standalone file"));

    const targetChangeSetId: string = await targetVersion.evaluateChangeSet(accessToken, briefcase.iModelId, BriefcaseManager.hubClient);
    const targetChangeSetIndex: number = await BriefcaseManager.getChangeSetIndexFromId(accessToken, briefcase.iModelId, targetChangeSetId);
    if (targetChangeSetIndex === undefined)
      return Promise.reject(new IModelError(ChangeSetStatus.ApplyError, "Could not determine change set information from the Hub"));

    const hasReversedChanges = briefcase.reversedChangeSetId !== undefined;

    const currentChangeSetId: string = hasReversedChanges ? briefcase.reversedChangeSetId! : briefcase.changeSetId!;
    const currentChangeSetIndex: number = hasReversedChanges ? briefcase.reversedChangeSetIndex! : briefcase.changeSetIndex!;

    if (targetChangeSetIndex === currentChangeSetIndex)
      return Promise.resolve(); // nothing to apply

    switch (processOption) {
      case ChangeSetApplyOption.Merge:
        if (hasReversedChanges)
          return Promise.reject(new IModelError(ChangeSetStatus.CannotMergeIntoReversed, "Cannot merge when there are reversed changes"));
        if (targetChangeSetIndex < currentChangeSetIndex)
          return Promise.reject(new IModelError(ChangeSetStatus.NothingToMerge, "Nothing to merge"));

        break;
      case ChangeSetApplyOption.Reinstate:
        if (!hasReversedChanges)
          return Promise.reject(new IModelError(ChangeSetStatus.ApplyError, "No reversed changes to reinstate"));
        if (targetChangeSetIndex < currentChangeSetIndex)
          return Promise.reject(new IModelError(ChangeSetStatus.ApplyError, "Cannot reinstate to an earlier version"));
        assert(briefcase.openParams!.accessMode !== AccessMode.Shared, "Cannot reinstate. If a Db has shared access, we should NOT have allowed to reverse in the first place!");

        break;
      case ChangeSetApplyOption.Reverse:
        if (targetChangeSetIndex >= currentChangeSetIndex)
          return Promise.reject(new IModelError(ChangeSetStatus.ApplyError, "Cannot reverse to a later version"));
        if (briefcase.openParams!.accessMode === AccessMode.Shared)
          return Promise.reject(new IModelError(ChangeSetStatus.ApplyError, "Cannot reverse changes when the Db allows shared access - open with AccessMode.Exclusive"));

        break;
      default:
        assert(false, "Unknown change set process option");
        return Promise.reject(new IModelError(ChangeSetStatus.ApplyError, "Unknown ChangeSet process option"));
    }

    const reverse: boolean = (targetChangeSetIndex < currentChangeSetIndex);
    const changeSets: ChangeSet[] = await BriefcaseManager.downloadChangeSets(accessToken, briefcase.iModelId, reverse ? targetChangeSetId : currentChangeSetId, reverse ? currentChangeSetId : targetChangeSetId);
    assert(changeSets.length <= Math.abs(targetChangeSetIndex - currentChangeSetIndex));
    if (reverse)
      changeSets.reverse();

    const changeSetTokens: ChangeSetToken[] = BriefcaseManager.buildChangeSetTokens(changeSets, BriefcaseManager.getChangeSetsPath(briefcase.iModelId));

    // Close Db before merge (if there are schema changes)
    const containsSchemaChanges: boolean = changeSets.some((changeSet: ChangeSet) => changeSet.containsSchemaChanges === ContainsSchemaChanges.Yes);
    if (containsSchemaChanges && briefcase.isOpen)
      briefcase.onBeforeClose.raiseEvent(briefcase);

    // Apply the changes
    const status: ChangeSetStatus = briefcase.nativeDb!.applyChangeSets(JSON.stringify(changeSetTokens), processOption);
    if (ChangeSetStatus.Success !== status)
      return Promise.reject(new IModelError(status));

    // Mark Db as reopened after merge (if there are schema changes)
    if (containsSchemaChanges)
      briefcase.isOpen = true;

    switch (processOption) {
      case ChangeSetApplyOption.Merge:
        BriefcaseManager.updateBriefcaseVersion(briefcase, targetChangeSetId, targetChangeSetIndex);
        assert(briefcase.nativeDb.getParentChangeSetId() === briefcase.changeSetId);
        break;
      case ChangeSetApplyOption.Reinstate:
        if (targetChangeSetIndex === briefcase.changeSetIndex) {
          briefcase.reversedChangeSetIndex = undefined;
          briefcase.reversedChangeSetId = undefined;
        } else {
          briefcase.reversedChangeSetIndex = targetChangeSetIndex;
          briefcase.reversedChangeSetId = targetChangeSetId;
        }
        assert(briefcase.nativeDb.getReversedChangeSetId() === briefcase.reversedChangeSetId);
        break;
      case ChangeSetApplyOption.Reverse:
        briefcase.reversedChangeSetIndex = targetChangeSetIndex;
        briefcase.reversedChangeSetId = targetChangeSetId;
        assert(briefcase.nativeDb.getReversedChangeSetId() === briefcase.reversedChangeSetId);
        break;
      default:
        assert(false, "Unknown change set process option");
        return Promise.reject(new IModelError(BriefcaseStatus.CannotApplyChanges, "Unknown ChangeSet process option"));
    }

    briefcase.onChangesetApplied.raiseEvent();
  }

  private static updateBriefcaseVersion(briefcase: BriefcaseEntry, changeSetId: string, changeSetIndex: number) {
    const oldKey = briefcase.getKey();
    briefcase.changeSetId = changeSetId;
    briefcase.changeSetIndex = changeSetIndex;

    // Update cache if necessary
    if (BriefcaseManager.cache.findBriefcaseByKey(oldKey)) {
      BriefcaseManager.cache.deleteBriefcaseByKey(oldKey);
      BriefcaseManager.cache.addBriefcase(briefcase);
    }
  }

  public static async reverseChanges(accessToken: AccessToken, briefcase: BriefcaseEntry, reverseToVersion: IModelVersion): Promise<void> {
    return BriefcaseManager.applyChangeSets(accessToken, briefcase, reverseToVersion, ChangeSetApplyOption.Reverse);
  }

  public static async reinstateChanges(accessToken: AccessToken, briefcase: BriefcaseEntry, reinstateToVersion?: IModelVersion): Promise<void> {
    const targetVersion: IModelVersion = reinstateToVersion || IModelVersion.asOfChangeSet(briefcase.changeSetId);
    return BriefcaseManager.applyChangeSets(accessToken, briefcase, targetVersion, ChangeSetApplyOption.Reinstate);
  }

  /**
   * Pull and merge changes from the hub
   * @param accessToken Delegation token of the authorized user
   * @param briefcase Local briefcase
   * @param mergeToVersion Version of the iModel to merge until.
   */
  public static async pullAndMergeChanges(accessToken: AccessToken, briefcase: BriefcaseEntry, mergeToVersion: IModelVersion = IModelVersion.latest()): Promise<void> {
    await BriefcaseManager.updatePendingChangeSets(accessToken, briefcase);
    return BriefcaseManager.applyChangeSets(accessToken, briefcase, mergeToVersion, ChangeSetApplyOption.Merge);
  }

  private static startCreateChangeSet(briefcase: BriefcaseEntry): ChangeSetToken {
    const res: ErrorStatusOrResult<ChangeSetStatus, string> = briefcase.nativeDb!.startCreateChangeSet();
    if (res.error)
      throw new IModelError(res.error.status);
    return JSON.parse(res.result!);
  }

  private static finishCreateChangeSet(briefcase: BriefcaseEntry) {
    const status = briefcase.nativeDb!.finishCreateChangeSet();
    if (ChangeSetStatus.Success !== status)
      throw new IModelError(status);
  }

  private static abandonCreateChangeSet(briefcase: BriefcaseEntry) {
    briefcase.nativeDb!.abandonCreateChangeSet();
  }

  /** Get array of pending ChangeSet ids that need to have their codes updated */
  private static getPendingChangeSets(briefcase: BriefcaseEntry): string[] {
    const res: ErrorStatusOrResult<DbResult, string> = briefcase.nativeDb!.getPendingChangeSets();
    if (res.error)
      throw new IModelError(res.error.status);
    return JSON.parse(res.result!) as string[];
  }

  /** Add a pending ChangeSet before updating its codes */
  private static addPendingChangeSet(briefcase: BriefcaseEntry, changeSetId: string): void {
    const result = briefcase.nativeDb!.addPendingChangeSet(changeSetId);
    if (DbResult.BE_SQLITE_OK !== result)
      throw new IModelError(result);
  }

  /** Remove a pending ChangeSet after its codes have been updated */
  private static removePendingChangeSet(briefcase: BriefcaseEntry, changeSetId: string): void {
    const result = briefcase.nativeDb!.removePendingChangeSet(changeSetId);
    if (DbResult.BE_SQLITE_OK !== result)
      throw new IModelError(result);
  }

  /** Update codes for all pending ChangeSets */
  private static async updatePendingChangeSets(accessToken: AccessToken, briefcase: BriefcaseEntry): Promise<void> {
    let pendingChangeSets = BriefcaseManager.getPendingChangeSets(briefcase);
    if (pendingChangeSets.length === 0)
      return;

    pendingChangeSets = pendingChangeSets.slice(0, 100);

    const query = new ChangeSetQuery().filter(`$id+in+[${pendingChangeSets.map((value: string) => `'${value}'`).join(",")}]`).selectDownloadUrl();
    const changeSets: ChangeSet[] = await BriefcaseManager.hubClient.ChangeSets().get(accessToken, briefcase.iModelId, query);

    await BriefcaseManager.downloadChangeSetsInternal(briefcase.iModelId, changeSets);

    const changeSetTokens: ChangeSetToken[] = BriefcaseManager.buildChangeSetTokens(changeSets, BriefcaseManager.getChangeSetsPath(briefcase.iModelId));

    for (const token of changeSetTokens) {
      try {
        const codes = BriefcaseManager.extractCodesFromFile(briefcase, [token]);
        await BriefcaseManager.hubClient.Codes().update(accessToken, briefcase.iModelId, codes, { deniedCodes: true, continueOnConflict: true });
        BriefcaseManager.removePendingChangeSet(briefcase, token.id);
      } catch (error) {
        if (error instanceof ConflictingCodesError) {
          briefcase.conflictError = error;
          BriefcaseManager.removePendingChangeSet(briefcase, token.id);
        }
      }
    }
  }

  /** Parse Code array from json */
  private static parseCodesFromJson(briefcase: BriefcaseEntry, json: string): Code[] {
    return JSON.parse(json, (key: any, value: any) => {
      if (key === "state") {
        return (value as number);
      }
      // If the key is a number, it is an array member.
      if (!Number.isNaN(Number.parseInt(key))) {
        const code = new Code();
        Object.assign(code, value);
        code.briefcaseId = briefcase.briefcaseId;
        return code;
      }
      return value;
    }) as Code[];
  }

  /** Extracts codes from current ChangeSet */
  private static extractCodes(briefcase: BriefcaseEntry): Code[] {
    const res: ErrorStatusOrResult<DbResult, string> = briefcase.nativeDb!.extractCodes();
    if (res.error)
      throw new IModelError(res.error.status);
    return BriefcaseManager.parseCodesFromJson(briefcase, res.result!);
  }

  /** Extracts codes from ChangeSet file */
  private static extractCodesFromFile(briefcase: BriefcaseEntry, changeSetTokens: ChangeSetToken[]): Code[] {
    const res: ErrorStatusOrResult<DbResult, string> = briefcase.nativeDb!.extractCodesFromFile(JSON.stringify(changeSetTokens));
    if (res.error)
      throw new IModelError(res.error.status);
    return BriefcaseManager.parseCodesFromJson(briefcase, res.result!);
  }

  /** Attempt to update codes without rejecting so pull wouldn't fail */
  private static async tryUpdatingCodes(accessToken: AccessToken, briefcase: BriefcaseEntry, changeSet: ChangeSet, relinquishCodesLocks: boolean): Promise<void> {
    // Add ChangeSet id, in case updating failed due to something else than conflicts
    BriefcaseManager.addPendingChangeSet(briefcase, changeSet.id!);

    let failedUpdating = false;
    try {
      await BriefcaseManager.hubClient.Codes().update(accessToken, briefcase.iModelId, BriefcaseManager.extractCodes(briefcase), { deniedCodes: true, continueOnConflict: true });
    } catch (error) {
      if (error instanceof ConflictingCodesError) {
        const msg = `Found conflicting codes when pushing briefcase ${briefcase.iModelId}:${briefcase.briefcaseId} changes.`;
        Logger.logError(loggingCategory, msg);
        briefcase.conflictError = error;
      } else {
        failedUpdating = true;
      }
    }

    // Cannot retry relinquishing later, ignore error
    try {
      if (relinquishCodesLocks) {
        await BriefcaseManager.hubClient.Codes().deleteAll(accessToken, briefcase.iModelId, briefcase.briefcaseId);
        await BriefcaseManager.hubClient.Locks().deleteAll(accessToken, briefcase.iModelId, briefcase.briefcaseId);
      }
    } catch (error) {
      const msg = `Relinquishing codes or locks has failed with: ${error}`;
      Logger.logError(loggingCategory, msg);
    }

    // Remove ChangeSet id if it succeeded or failed with conflicts
    if (!failedUpdating)
      BriefcaseManager.removePendingChangeSet(briefcase, changeSet.id!);
  }

  /** Creates a change set file from the changes in a standalone iModel
   * @return Path to the standalone change set file
   * @hidden
   */
  public static createStandaloneChangeSet(briefcase: BriefcaseEntry): ChangeSetToken {
    if (!briefcase.isStandalone)
      throw new IModelError(BentleyStatus.ERROR);

    const changeSetToken: ChangeSetToken = BriefcaseManager.startCreateChangeSet(briefcase);
    BriefcaseManager.finishCreateChangeSet(briefcase);

    return changeSetToken;
  }

  /** Applies a change set to a standalone iModel */
  public static applyStandaloneChangeSets(briefcase: BriefcaseEntry, changeSetTokens: ChangeSetToken[], processOption: ChangeSetApplyOption): ChangeSetStatus {
    if (!briefcase.isStandalone)
      throw new IModelError(BentleyStatus.ERROR);

    return briefcase.nativeDb!.applyChangeSets(JSON.stringify(changeSetTokens), processOption);
  }

  /** Dumps a change set */
  public static dumpChangeSet(briefcase: BriefcaseEntry, changeSetToken: ChangeSetToken) {
    briefcase.nativeDb!.dumpChangeSet(JSON.stringify(changeSetToken));
  }

  /** Attempt to push a ChangeSet to iModel Hub */
  private static async pushChangeSet(accessToken: AccessToken, briefcase: BriefcaseEntry, description: string, relinquishCodesLocks: boolean): Promise<void> {
    if (briefcase.openParams!.syncMode !== SyncMode.PullAndPush) {
      throw new IModelError(BriefcaseStatus.CannotUpload, "Cannot push from an IModelDb that's opened PullOnly");
    }

    const changeSetToken: ChangeSetToken = BriefcaseManager.startCreateChangeSet(briefcase);
    const changeSet = new ChangeSet();
    changeSet.briefcaseId = briefcase.briefcaseId;
    changeSet.id = changeSetToken.id;
    changeSet.parentId = changeSetToken.parentId;
    changeSet.containsSchemaChanges = changeSetToken.containsSchemaChanges;
    changeSet.seedFileId = briefcase.fileId!;
    changeSet.fileSize = IModelJsFs.lstatSync(changeSetToken.pathname)!.size.toString();
    changeSet.description = description;
    if (changeSet.description.length >= 255) {
      Logger.logWarning(loggingCategory, "pushChanges - Truncating description to 255 characters. " + changeSet.description);
      changeSet.description = changeSet.description.slice(0, 254);
    }

    let postedChangeSet: ChangeSet | undefined;
    try {
      postedChangeSet = await BriefcaseManager.hubClient.ChangeSets().create(accessToken, briefcase.iModelId, changeSet, changeSetToken.pathname);
    } catch (error) {
      // If ChangeSet already exists, updating codes and locks might have timed out.
      if (!(error instanceof IModelHubError) || error.errorNumber !== IModelHubStatus.ChangeSetAlreadyExists) {
        Promise.reject(error);
      }
    }

    await BriefcaseManager.tryUpdatingCodes(accessToken, briefcase, changeSet, relinquishCodesLocks);

    BriefcaseManager.finishCreateChangeSet(briefcase);
    BriefcaseManager.updateBriefcaseVersion(briefcase, postedChangeSet!.wsgId, +postedChangeSet!.index!);
  }

  /** Attempt to pull merge and push once */
  private static async pushChangesOnce(accessToken: AccessToken, briefcase: BriefcaseEntry, description: string, relinquishCodesLocks: boolean): Promise<void> {
    await BriefcaseManager.pullAndMergeChanges(accessToken, briefcase, IModelVersion.latest());
    await BriefcaseManager.pushChangeSet(accessToken, briefcase, description, relinquishCodesLocks).catch((err) => {
      BriefcaseManager.abandonCreateChangeSet(briefcase);
      return Promise.reject(err);
    });
  }

  /** Return true if should attempt pushing again. */
  private static shouldRetryPush(error: any): boolean {
    if (error instanceof IModelHubError && error.errorNumber) {
      switch (error.errorNumber!) {
        case IModelHubStatus.AnotherUserPushing:
        case IModelHubStatus.PullIsRequired:
        case IModelHubStatus.DatabaseTemporarilyLocked:
        case IModelHubStatus.iModelHubOperationFailed:
          return true;
      }
    }
    return false;
  }

  /** Push local changes to the hub
   * @param accessToken The access token of the account that has write access to the iModel. This may be a service account.
   * @param briefcase Identifies the IModelDb that contains the pending changes.
   * @param description a description of the changeset that is to be pushed.
   */
  public static async pushChanges(accessToken: AccessToken, briefcase: BriefcaseEntry, description: string, relinquishCodesLocks?: boolean): Promise<void> {
    for (let i = 0; i < 5; ++i) {
      let pushed: boolean = false;
      let error: any;
      await BriefcaseManager.pushChangesOnce(accessToken, briefcase, description, relinquishCodesLocks || false).then(() => {
        pushed = true;
      }).catch((err) => {
        error = err;
      });
      if (pushed) {
        return Promise.resolve();
      }
      if (!BriefcaseManager.shouldRetryPush(error)) {
        return Promise.reject(error);
      }
      const delay: number = Math.floor(Math.random() * 4800) + 200;
      await new Promise((resolve: any) => setTimeout(resolve, delay));
    }
  }

  /** Create an iModel on iModelHub */
  public static async create(accessToken: AccessToken, projectId: string, hubName: string, args: CreateIModelProps): Promise<string> {
    await BriefcaseManager.memoizedInitCache(accessToken);
    assert(!!BriefcaseManager.hubClient);

    const nativeDb: NativeDgnDb = new (NativePlatformRegistry.getNativePlatform()).NativeDgnDb();

    const scratchDir = BriefcaseManager.buildScratchPath();
    if (!IModelJsFs.existsSync(scratchDir))
      IModelJsFs.mkdirSync(scratchDir);

    const fileName = path.join(scratchDir, hubName + ".bim");
    if (IModelJsFs.existsSync(fileName))
      IModelJsFs.unlinkSync(fileName); // Note: Cannot create two files with the same name at the same time with multiple async calls.

    let res: DbResult = nativeDb.createIModel(fileName, JSON.stringify(args));
    if (DbResult.BE_SQLITE_OK !== res)
      throw new IModelError(res, fileName);

    res = nativeDb.saveChanges();
    if (DbResult.BE_SQLITE_OK !== res)
      throw new IModelError(res);

    nativeDb.closeIModel();

    const iModelId: string = await BriefcaseManager.upload(accessToken, projectId, fileName, hubName, args.rootSubject.description);
    return iModelId;
  }

  /** Pushes a new iModel to the Hub */
  private static async upload(accessToken: AccessToken, projectId: string, pathname: string, hubName?: string, hubDescription?: string, timeOutInMilliseconds: number = 2 * 60 * 1000): Promise<string> {
    hubName = hubName || path.basename(pathname, ".bim");

    const iModel: IModelRepository = await BriefcaseManager.hubClient.IModels().create(accessToken, projectId, hubName, pathname, hubDescription, undefined, timeOutInMilliseconds);
    return iModel.wsgId;
  }

  /** @hidden */
  public static async deleteAllBriefcases(accessToken: AccessToken, iModelId: string) {
    if (BriefcaseManager.hubClient === undefined)
      return;
    const promises = new Array<Promise<void>>();
    const briefcases = await BriefcaseManager.hubClient.Briefcases().get(accessToken, iModelId);
    briefcases.forEach((briefcase: Briefcase) => {
      promises.push(BriefcaseManager.hubClient.Briefcases().delete(accessToken, iModelId, briefcase.briefcaseId!));
    });
    return Promise.all(promises);
  }

}
