/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModels
 */

import * as glob from "glob";
import * as path from "path";
import { AzureFileHandler, IOSAzureFileHandler } from "@bentley/backend-itwin-client";
import {
  assert, AsyncMutex, BeDuration, BeEvent, BentleyStatus, ChangeSetApplyOption, ChangeSetStatus, ClientRequestContext, DbResult, GuidString, Id64,
  IModelHubStatus, IModelStatus, Logger, LogLevel, OpenMode, PerfLogger,
} from "@bentley/bentleyjs-core";
import { ContextRegistryClient } from "@bentley/context-registry-client";
import {
  Briefcase as HubBriefcase, BriefcaseQuery, ChangeSet, ChangeSetQuery, ChangesType, Checkpoint, CheckpointQuery, ConflictingCodesError, HubCode,
  HubIModel, IModelBankClient, IModelClient, IModelHubClient, IModelHubError,
} from "@bentley/imodelhub-client";
import {
  BriefcaseDownloader, BriefcaseKey, BriefcaseProps, BriefcaseStatus, CreateIModelProps, DownloadBriefcaseOptions, DownloadBriefcaseStatus,
  IModelError, IModelVersion, MobileRpcConfiguration, RequestBriefcaseProps, SyncMode,
} from "@bentley/imodeljs-common";
import { IModelJsNative } from "@bentley/imodeljs-native";
import { AuthorizedClientRequestContext, CancelRequest, ProgressCallback, ProgressInfo, UserCancelledError } from "@bentley/itwin-client";
import { BackendLoggerCategory } from "./BackendLoggerCategory";
import { IModelDb, OpenParams } from "./IModelDb";
import { IModelHost } from "./IModelHost";
import { IModelJsFs } from "./IModelJsFs";

const loggerCategory: string = BackendLoggerCategory.IModelDb;

/** The Id assigned to a briefcase by iModelHub, or a [[BriefcaseIdValue]] that identify special kinds of iModels.
 * @public
 */
export type BriefcaseId = number;

/** The reserved BriefcaseId values used to identify special kinds of IModelDbs.
 * @see [[BriefcaseId]]
 * @public
 */
export enum BriefcaseIdValue {
  /** Indicates an invalid/illegal BriefcaseId */
  Illegal = 0xffffffff,

  /** BriefcaseIds must be less than this value */
  Max = 1 << 24,

  /** All valid iModelHub issued BriefcaseIds will be equal or higher than this */
  FirstValid = 2,

  /** All valid iModelHub issued BriefcaseIds will be equal or lower than this */
  LastValid = BriefcaseIdValue.Max - 11,

  /** a Standalone briefcase */
  Standalone = 0,

  /** @internal */
  DeprecatedStandalone = 1,
}

/**
 * Result of validity check of a briefcase in cache or on disk
 */
enum BriefcaseValidity {
  Reuse, // the briefcase is valid and can be re-used as is, OR is invalid and cannot be updated/re-created
  Update, // the briefcase can be made valid by updating it
  Recreate, // the briefcase can be made valid by re-fetching it
}

/** A token that represents a ChangeSet
 * @internal
 */
export class ChangeSetToken {
  constructor(public id: string, public parentId: string, public index: number, public pathname: string, public changeType: ChangesType, public pushDate?: string) { }
}

/** Entry in the briefcase cache
 * @internal
 */
export class BriefcaseEntry {

  /** Constructor */
  public constructor(contextId: GuidString, iModelId: GuidString, targetChangeSetId: GuidString, pathname: string, syncMode: SyncMode, openMode: OpenMode, briefcaseId: BriefcaseId) {
    this.contextId = contextId;
    this.iModelId = iModelId;
    this.targetChangeSetId = targetChangeSetId;
    this.pathname = pathname;
    this.syncMode = syncMode;
    this.openMode = openMode;
    this.openParams = new OpenParams(openMode, syncMode); // tslint:disable-line:deprecation
    this.briefcaseId = briefcaseId;
  }

  /** Id of the iModel - set to the DbGuid field in the briefcase, it corresponds to the Guid used to track the iModel in iModelHub */
  public iModelId: GuidString;

  /** Absolute path where the briefcase is cached/stored */
  public pathname: string;

  /** Id of the last change set that was applied to the briefcase.
   * Set to an empty string if it is the initial version, or a standalone briefcase
   */
  public parentChangeSetId!: GuidString;

  /** Index of the last change set that was applied to the briefcase.
   * Only specified if the briefcase was acquired from the Hub.
   * Set to 0 if it is the initial version.
   */
  public parentChangeSetIndex?: number;

  /** Briefcase Id  */
  public briefcaseId: BriefcaseId;

  /** Flag to indicate if the briefcase is currently open */
  public isOpen!: boolean;

  /** Promise that if specified, resolves when the briefcase is ready for use */
  public downloadPromise: Promise<void> = Promise.resolve();

  /** Status of download of the briefcase */
  public downloadStatus: DownloadBriefcaseStatus = DownloadBriefcaseStatus.NotStarted;

  /** In-memory handle of the native Db */
  private _nativeDb!: IModelJsNative.DgnDb;
  public get nativeDb(): IModelJsNative.DgnDb { return this._nativeDb; }

  /** Operations allowed when synchronizing changes between the Briefcase and iModelHub */
  public syncMode: SyncMode;

  /** Mode used to open the briefcase */
  public openMode: OpenMode;

  /** Params used to open the briefcase */
  public openParams: OpenParams; // tslint:disable-line:deprecation

  /** Id of the last change set that was applied to the briefcase after it was reversed.
   * Undefined if no change sets have been reversed.
   * Set to empty string if reversed to the first version.
   */
  public reversedChangeSetId?: GuidString;

  /** Index of the last change set that was applied to the briefcase after it was reversed.
   * Undefined if no change sets have been reversed
   * Set to 0 if the briefcase has been reversed to the first version
   */
  public reversedChangeSetIndex?: number;

  /** ChangeSet id that the briefcase eventually needs to be set to
   * currentChangeSetId may not match this if the briefcase is being prepared for use
   */
  public targetChangeSetId: string;

  /** Change set index that the briefcase needs to be set to
   * currentChangeSetIndex may not match this if the briefcase is being prepared for use
   */
  public targetChangeSetIndex?: number;

  /** The IModelDb for this briefcase. */
  private _iModelDb?: IModelDb;
  public get iModelDb(): IModelDb | undefined { return this._iModelDb; }
  public set iModelDb(iModelDb: IModelDb | undefined) {
    this.nativeDb.setIModelDb(iModelDb); // store a pointer to this IModelDb on the native object so we can send it callbacks
    this._iModelDb = iModelDb;
  }

  /** File Id used to upload change sets for this briefcase (only setup in Read-Write cases) */
  public fileId?: string;

  /** Error set if push has succeeded, but updating codes has failed with conflicts */
  public conflictError?: ConflictingCodesError;

  /** Identifies the IModelClient to use when accessing this briefcase. If not defined, this may be a standalone briefcase, or it may be
   * a briefcase downloaded from iModelHub. Only iModelBank briefcases use custom contexts.
   */
  public contextId: GuidString;

  /** Event called after a changeset is applied to a briefcase. */
  public readonly onChangesetApplied = new BeEvent<() => void>();

  /** Event called right before the briefcase is about to be closed */
  public readonly onBeforeClose = new BeEvent<() => void>();

  /** Event called right before the briefcase is about to be opened */
  public readonly onBeforeOpen = new BeEvent<(_requestContext: AuthorizedClientRequestContext) => void>();

  /** Event called after the briefcase was opened */
  public readonly onAfterOpen = new BeEvent<(_requestContext: AuthorizedClientRequestContext) => void>();

  /** Event called when the version of the briefcase has been updated */
  public readonly onBeforeVersionUpdate = new BeEvent<() => void>();

  /** Gets the key to locate the briefcase in the cache */
  public getKey(): BriefcaseKey {
    if (this.syncMode === SyncMode.FixedVersion)
      return `${this.iModelId}:${this.targetChangeSetId}`;

    return `${this.iModelId}:${this.briefcaseId}`;
  }

  /** Gets the current changeSetId of the briefcase
   * @note This may not be the changeSetId if the briefcase has reversed changes
   */
  public get currentChangeSetId(): GuidString {
    return (this.reversedChangeSetId !== undefined) ? this.reversedChangeSetId : this.parentChangeSetId;
  }

  /** Gets the current changeSetIndex of the briefcase
   * @note This may not be the changeSetIndex if the briefcase has reversed changes
   */
  public get currentChangeSetIndex(): number {
    return this.reversedChangeSetIndex !== undefined ? this.reversedChangeSetIndex! : this.parentChangeSetIndex!;
  }

  /** Returns true if the briefcase has reversed changes */
  public get hasReversedChanges(): boolean {
    return this.reversedChangeSetId !== undefined;
  }

  /** Progress downloading the briefcase */
  public downloadProgress?: ProgressCallback;

  /** Cancel downloading of briefcase */
  public cancelDownloadRequest: CancelRequest = {
    cancel: () => false,
  };

  /** Get the briefcase size in bytes */
  private getBriefcaseSize(): number | undefined {
    if (this.downloadStatus !== DownloadBriefcaseStatus.Complete)
      return undefined;

    try {
      const stat = IModelJsFs.lstatSync(this.pathname);
      return stat ? stat.size : undefined;
    } catch {
      Logger.logError(loggerCategory, "Failed to determine size of the file", () => this.getDebugInfo());
    }

    return undefined;
  }

  /** Get the properties of the briefcase relevant to external users */
  public getBriefcaseProps(): BriefcaseProps {
    const briefcaseProps: BriefcaseProps = {
      contextId: this.contextId,
      iModelId: this.iModelId,
      changeSetId: this.targetChangeSetId,
      syncMode: this.syncMode,
      openMode: this.openMode,
      key: this.getKey(),
      downloadStatus: this.downloadStatus,
      fileSize: this.getBriefcaseSize(),
    };
    return briefcaseProps;
  }

  /** Get the properties of this briefcase that are useful for debug logs
   * @internal
   */
  public getDebugInfo(): any {
    return {
      ...this.getBriefcaseProps(),
      pathname: this.pathname,
      briefcaseId: this.briefcaseId,
      fileId: this.fileId,
      targetChangeSetId: this.targetChangeSetId,
      targetChangeSetIndex: this.targetChangeSetIndex,
      parentChangeSetId: this.parentChangeSetId,
      parentChangeSetIndex: this.parentChangeSetIndex,
      reversedChangeSetId: this.reversedChangeSetId,
      reversedChangeSetIndex: this.reversedChangeSetIndex,
      isOpen: this.isOpen,
      currentChangeSetId: this.currentChangeSetId,
      currentChangeSetIndex: this.currentChangeSetIndex,
    };
  }

  /** Set the native db */
  public setNativeDb(nativeDb: IModelJsNative.DgnDb) {
    this._nativeDb = nativeDb;
    this.parentChangeSetId = nativeDb.getParentChangeSetId();
    this.reversedChangeSetId = nativeDb.getReversedChangeSetId();
    this.briefcaseId = nativeDb.getBriefcaseId();
    this.isOpen = nativeDb.isOpen();
  }
}

/** In-memory cache of briefcases
 * @internal
 */
class BriefcaseCache {
  private readonly _briefcases = new Map<string, BriefcaseEntry>();

  /** Find a briefcase in the cache by key */
  public findBriefcaseByKey(key: BriefcaseKey): BriefcaseEntry | undefined {
    return this._briefcases.get(key);
  }

  /** Find a briefcase in the cache */
  public findBriefcase(briefcase: BriefcaseEntry): BriefcaseEntry | undefined {
    return this._briefcases.get(briefcase.getKey());
  }

  /** Find FixedVersion briefcase */
  public findBriefcaseByChangeSetId(iModelId: GuidString, changeSetId: GuidString): BriefcaseEntry | undefined {
    for (const entry of this._briefcases.values()) {
      if (entry.iModelId === iModelId && entry.targetChangeSetId === changeSetId && entry.syncMode === SyncMode.FixedVersion)
        return entry;
    }
    return undefined;
  }

  /** Find VariableVersion (PullAndPush or PullOnly) briefcase */
  public findBriefcaseByBriefcaseId(iModelId: GuidString, briefcaseId: BriefcaseId, syncMode: SyncMode): BriefcaseEntry | undefined {
    for (const entry of this._briefcases.values()) {
      if (entry.iModelId === iModelId && entry.briefcaseId === briefcaseId && entry.syncMode === syncMode)
        return entry;
    }
    return undefined;
  }

  /** Add a briefcase to the cache */
  public addBriefcase(briefcase: BriefcaseEntry) {
    const key = briefcase.getKey();

    if (this._briefcases.get(key))
      throw new IModelError(DbResult.BE_SQLITE_ERROR, `Briefcase ${key} already exists in the cache.`, Logger.logError, loggerCategory, () => briefcase.getDebugInfo());

    Logger.logTrace(loggerCategory, "Added briefcase to the cache", () => briefcase.getDebugInfo());
    this._briefcases.set(key, briefcase);
  }

  /** Delete a briefcase from the cache by key */
  public deleteBriefcaseByKey(key: BriefcaseKey) {
    const briefcase = this._briefcases.get(key);
    if (!briefcase)
      throw new IModelError(DbResult.BE_SQLITE_ERROR, "Briefcase not found in cache", Logger.logError, loggerCategory, () => ({ key }));

    this._briefcases.delete(key);
    Logger.logTrace(loggerCategory, "Deleted briefcase from the cache", () => briefcase.getDebugInfo());
  }

  /** Get a subset of entries in the cache */
  public getFilteredBriefcases(filterFn: (value: BriefcaseEntry) => boolean): BriefcaseEntry[] {
    const filteredBriefcases = new Array<BriefcaseEntry>();
    this._briefcases.forEach((value: BriefcaseEntry) => {
      if (filterFn(value))
        filteredBriefcases.push(value);
    });
    return filteredBriefcases;
  }

  /** Checks if the cache is empty */
  public get isEmpty(): boolean { return this._briefcases.size === 0; }

  /** Clears all entries in the cache */
  public clear() { this._briefcases.clear(); }
}

/** Utility to manage briefcases
 * @beta
 */
export class BriefcaseManager {
  private static _cache: BriefcaseCache = new BriefcaseCache();
  private static _imodelClient?: IModelClient;

  /** IModel Server Client to be used for all briefcase operations
   * @internal
   */
  public static get imodelClient(): IModelClient {
    if (!this._imodelClient) {
      if (!this._initialized)
        throw new Error("BriefcaseManager.initialize() should be called before any backend operations");
      this.setupDefaultIModelClient();
    }

    return this._imodelClient!;
  }

  private static _firstChangeSetDir: string = "first";
  private static _contextRegistryClient?: ContextRegistryClient;

  /**
   * Client to be used for all briefcase operations
   * @internal
   */
  public static get connectClient(): ContextRegistryClient {
    return BriefcaseManager._contextRegistryClient!;
  }

  /** Get the local path of the root folder storing the imodel seed file, change sets and briefcases */
  private static getIModelPath(iModelId: GuidString): string {
    const pathname = path.join(BriefcaseManager.cacheDir, iModelId, "/");
    return path.normalize(pathname);
  }

  /** @internal */
  public static getChangeSetsPath(iModelId: GuidString): string { return path.join(BriefcaseManager.getIModelPath(iModelId), "csets"); }

  /** @internal */
  public static getChangeCachePathName(iModelId: GuidString): string { return path.join(BriefcaseManager.getIModelPath(iModelId), iModelId.concat(".bim.ecchanges")); }

  /** @internal */
  public static getChangedElementsPathName(iModelId: GuidString): string { return path.join(BriefcaseManager.getIModelPath(iModelId), iModelId.concat(".bim.elems")); }

  /** Initialize the the briefcase manager (cache) for offline cases (only used for native applications)
   * @internal
   */
  public static initializeOffline() {
    if (this._initializedOffline)
      return;
    if (!IModelJsFs.existsSync(BriefcaseManager.cacheDir))
      return;

    const iModelDirs = IModelJsFs.readdirSync(BriefcaseManager.cacheDir);
    for (const iModelId of iModelDirs) {
      const iModelPath = path.join(BriefcaseManager.cacheDir, iModelId);
      if (!IModelJsFs.lstatSync(iModelPath)?.isDirectory)
        continue;

      this.initializeIModelBriefcasesOffline(iModelId, SyncMode.FixedVersion);
      this.initializeIModelBriefcasesOffline(iModelId, SyncMode.PullOnly);
      this.initializeIModelBriefcasesOffline(iModelId, SyncMode.PullAndPush);
    }
    this._initializedOffline = true;
  }

  private static initializeIModelBriefcasesOffline(iModelIdSubDir: GuidString, syncMode: SyncMode) {
    // Get briefcase directory for a specific SyncMode (PullAndPush, PullOnly, FixedVersion)
    const bcSyncModePath = BriefcaseManager.getBriefcaseSyncModePath(iModelIdSubDir, syncMode);
    if (!IModelJsFs.existsSync(bcSyncModePath))
      return;

    const bcSubDirs = IModelJsFs.readdirSync(bcSyncModePath);
    for (const bcSubDir of bcSubDirs) {
      const bcPath = path.join(bcSyncModePath, bcSubDir);
      if (!IModelJsFs.lstatSync(bcPath)?.isDirectory)
        continue;

      try {
        this.initializeBriefcaseOffline(iModelIdSubDir, syncMode, bcSubDir, bcPath);
      } catch (_err) {
      }
    }
  }

  private static initializeBriefcaseOffline(iModelIdSubDir: string, syncMode: SyncMode, bcSubDir: string, bcPath: string) {
    const bcPathname = path.join(bcPath, "bc.bim");
    if (!IModelJsFs.existsSync(bcPathname))
      return;

    const openMode = syncMode === SyncMode.FixedVersion ? OpenMode.Readonly : OpenMode.ReadWrite;
    const nativeDb = new IModelHost.platform.DgnDb();
    const res = nativeDb.openIModel(bcPathname, openMode);
    if (DbResult.BE_SQLITE_OK !== res)
      throw new IModelError(res, "Cannot open briefcase offline", Logger.logError, loggerCategory, () => ({ iModelId, syncMode, briefcasePathname: bcPathname, openMode }));

    const contextId: GuidString = nativeDb.queryProjectGuid();
    const iModelId: GuidString = nativeDb.getDbGuid();
    const parentChangeSetId = nativeDb.getParentChangeSetId();
    const reversedChangeSetId = nativeDb.getReversedChangeSetId();
    const briefcaseId = nativeDb.getBriefcaseId();
    const currentChangeSetId = (reversedChangeSetId !== undefined) ? reversedChangeSetId : parentChangeSetId;

    /* Validate briefcase information in the Db against the location in the cache folder structure */
    try {
      if (iModelId !== iModelIdSubDir) {
        throw new IModelError(BentleyStatus.ERROR, "BriefcaseManager.initializeBriefcaseOffline: The briefcase found doesn't have the expected iModelId", Logger.logError, loggerCategory, () => ({
          pathname: bcPathname, iModelId, iModelIdSubDir,
        }));
      }

      if (syncMode === SyncMode.FixedVersion) {
        // Validate that the sub directory name matches the changeSetId stored in the db
        const changeSetIdFromSubDir = this.getChangeSetIdFromFolderName(bcSubDir);
        if (currentChangeSetId !== changeSetIdFromSubDir) {
          throw new IModelError(BentleyStatus.ERROR, "BriefcaseManager.initializeBriefcaseOffline: The briefcase found doesn't have the expected changeSetId", Logger.logError, loggerCategory, () => ({
            pathname: bcPathname, syncMode, parentChangeSetId, reversedChangeSetId, currentChangeSetId, changeSetSubDir: bcSubDir,
          }));
        }
        // Validate that the briefcase id is set to standalone
        if (briefcaseId !== BriefcaseIdValue.Standalone) {
          throw new IModelError(BentleyStatus.ERROR, "BriefcaseManager.initializeBriefcaseOfline: The briefcase found is not valid", Logger.logError, loggerCategory, () => ({
            pathname: bcPathname, syncMode, briefcaseId,
          }));
        }
      } else {
        // Validate that the sub directory name matches the briefcaseId stored in the db
        if (briefcaseId !== +bcSubDir) {
          throw new IModelError(BentleyStatus.ERROR, "BriefcaseManager.initializeBriefcaseOffline: The briefcase doesn't have the expected briefcaseId", Logger.logError, loggerCategory, () => ({
            pathname: bcPathname, syncMode, briefcaseId, briefcaseSubDir: bcSubDir,
          }));
        }
      }
    } catch (error) {
      nativeDb.closeIModel();
      throw error;
    }

    const briefcase = new BriefcaseEntry(contextId, iModelId, currentChangeSetId, bcPathname, syncMode, openMode, briefcaseId);
    if (this._cache.findBriefcase(briefcase)) {
      nativeDb.closeIModel();
      return;
    }

    briefcase.setNativeDb(nativeDb);
    BriefcaseManager.closeBriefcase(briefcase, false);
    briefcase.downloadStatus = DownloadBriefcaseStatus.Complete;
    BriefcaseManager._cache.addBriefcase(briefcase);
  }

  private static getBriefcaseBasePath(iModelId: GuidString): string {
    return path.join(BriefcaseManager.getIModelPath(iModelId), "bc");
  }

  private static getBriefcaseSyncModePath(iModelId: GuidString, syncMode: SyncMode): string {
    let subFolder = "";
    if (syncMode === SyncMode.PullAndPush)
      subFolder = "PullAndPush";
    else if (syncMode === SyncMode.PullOnly)
      subFolder = "PullOnly";
    else {
      assert(syncMode === SyncMode.FixedVersion);
      subFolder = "FixedVersion";
    }

    return path.join(BriefcaseManager.getBriefcaseBasePath(iModelId), subFolder);
  }

  private static getChangeSetIdFromFolderName(folderName: string): GuidString {
    if (folderName === this._firstChangeSetDir)
      return "";
    return folderName;
  }

  private static getChangeSetFolderNameFromId(changeSetId: GuidString): string {
    return changeSetId || this._firstChangeSetDir;
  }

  private static buildFixedVersionBriefcasePath(iModelId: GuidString, changeSetId: GuidString): string {
    const pathBaseName: string = BriefcaseManager.getBriefcaseSyncModePath(iModelId, SyncMode.FixedVersion);
    return path.join(pathBaseName, this.getChangeSetFolderNameFromId(changeSetId), "bc.bim");
  }

  private static buildVariableVersionBriefcasePath(iModelId: GuidString, briefcaseId: BriefcaseId, syncMode: SyncMode): string {
    const pathBaseName: string = BriefcaseManager.getBriefcaseSyncModePath(iModelId, syncMode);
    return path.join(pathBaseName, briefcaseId.toString(), "bc.bim");
  }

  private static findFixedVersionBriefcaseInCache(iModelId: GuidString, changeSetId: string): BriefcaseEntry | undefined {
    return this._cache.findBriefcaseByChangeSetId(iModelId, changeSetId);
  }

  private static initializeFixedVersionBriefcaseOnDisk(requestBriefcaseProps: RequestBriefcaseProps, downloadOptions: DownloadBriefcaseOptions): BriefcaseEntry | undefined {
    const { iModelId, changeSetId } = requestBriefcaseProps;
    const pathname = this.buildFixedVersionBriefcasePath(iModelId, changeSetId);
    if (!IModelJsFs.existsSync(pathname))
      return;
    const briefcase = this.initializeBriefcase(requestBriefcaseProps, downloadOptions, pathname, BriefcaseIdValue.Standalone);
    return briefcase;
  }

  private static findPullOnlyBriefcaseInCache(iModelId: GuidString): BriefcaseEntry | undefined {
    return this._cache.findBriefcaseByBriefcaseId(iModelId, BriefcaseIdValue.Standalone, SyncMode.PullOnly);
  }

  private static initializePullOnlyBriefcaseOnDisk(requestBriefcaseProps: RequestBriefcaseProps, downloadOptions: DownloadBriefcaseOptions): BriefcaseEntry | undefined {
    const { iModelId } = requestBriefcaseProps;
    const pathname = this.buildVariableVersionBriefcasePath(iModelId, BriefcaseIdValue.Standalone, SyncMode.PullOnly);
    if (!IModelJsFs.existsSync(pathname))
      return;
    const briefcase = this.initializeBriefcase(requestBriefcaseProps, downloadOptions, pathname, BriefcaseIdValue.Standalone);
    return briefcase;
  }

  private static findPullAndPushBriefcaseInCache(iModelId: GuidString, hubBriefcases: HubBriefcase[]): BriefcaseEntry | undefined {
    for (const hubBriefcase of hubBriefcases) {
      const briefcase = this._cache.findBriefcaseByBriefcaseId(iModelId, hubBriefcase.briefcaseId!, SyncMode.PullAndPush);
      if (briefcase)
        return briefcase;
    }
    return undefined;
  }

  private static findPullAndPushBriefcaseOnDisk(iModelId: GuidString, hubBriefcases: HubBriefcase[]): { pathname: string, briefcaseId: BriefcaseId } | undefined {
    for (const hubBriefcase of hubBriefcases) {
      const pathname = this.buildVariableVersionBriefcasePath(iModelId, hubBriefcase.briefcaseId!, SyncMode.PullAndPush);
      if (IModelJsFs.existsSync(pathname))
        return { pathname, briefcaseId: hubBriefcase.briefcaseId! };
    }
    return undefined;
  }

  /** Clear the briefcase manager cache */
  private static clearCache() {
    BriefcaseManager._cache.clear();
  }

  private static closeAllBriefcases() {
    const briefcases = BriefcaseManager._cache.getFilteredBriefcases((briefcase: BriefcaseEntry) => briefcase.isOpen);
    for (const briefcase of briefcases) {
      BriefcaseManager.closeBriefcase(briefcase, true);
    }
  }

  private static _initialized?: boolean;

  /**
   * Required for native apps only in order to read model that is stored in cache
   */
  private static _initializedOffline: boolean;

  private static setupDefaultIModelClient() {
    if (MobileRpcConfiguration.isMobileBackend)
      this._imodelClient = new IModelHubClient(new IOSAzureFileHandler());
    else
      this._imodelClient = new IModelHubClient(new AzureFileHandler());
  }

  private static setupContextRegistryClient() {
    BriefcaseManager._contextRegistryClient = new ContextRegistryClient();
  }

  /** Initialize BriefcaseManager
   * @internal
   */
  public static initialize(cacheRootDir: string, iModelClient?: IModelClient) {
    if (this._initialized)
      return;
    this._imodelClient = iModelClient;
    BriefcaseManager.setupCacheDir(cacheRootDir);
    BriefcaseManager.setupContextRegistryClient();
    IModelHost.onBeforeShutdown.addListener(BriefcaseManager.finalize);
    this._initialized = true;
  }

  /** Finalize/Reset BriefcaseManager */
  private static finalize() {
    BriefcaseManager.closeAllBriefcases();
    BriefcaseManager.clearCache();
    IModelHost.onBeforeShutdown.removeListener(BriefcaseManager.finalize);
    BriefcaseManager._imodelClient = undefined;
    BriefcaseManager._contextRegistryClient = undefined;
    BriefcaseManager.clearCacheDir();
    BriefcaseManager._initialized = false;
    BriefcaseManager._initializedOffline = false;
  }

  /** Create a folder, recursively setting up the path as necessary */
  private static createFolder(dirPath: string) {
    if (IModelJsFs.existsSync(dirPath))
      return;
    const parentPath = path.dirname(dirPath);
    if (parentPath !== dirPath)
      BriefcaseManager.createFolder(parentPath);
    IModelJsFs.mkdirSync(dirPath);
  }

  private static readonly _cacheMajorVersion: number = 4;
  private static readonly _cacheMinorVersion: number = 0;

  private static buildCacheSubDir(): string {
    return `v${BriefcaseManager._cacheMajorVersion}_${BriefcaseManager._cacheMinorVersion}`;
  }

  private static findCacheSubDir(cacheRootDir: string): string | undefined {
    let dirs: string[] | undefined;
    try {
      dirs = glob.sync(`v${BriefcaseManager._cacheMajorVersion}_*`, { cwd: cacheRootDir });
      assert(dirs.length === 1, "Expected *only* a single directory for a major version");
    } catch (error) {
    }
    if (!dirs || dirs.length === 0)
      return undefined;
    return dirs[0];
  }

  private static _cacheRootDir?: string;
  private static _cacheDir?: string;

  /** @internal */
  public static get cacheDir(): string {
    return BriefcaseManager._cacheDir!;
  }

  private static setupCacheDir(cacheRootDir: string) {
    this._cacheRootDir = cacheRootDir;

    const cacheSubDirOnDisk = BriefcaseManager.findCacheSubDir(cacheRootDir);
    const cacheSubDir = BriefcaseManager.buildCacheSubDir();
    const cacheDir = path.join(cacheRootDir, cacheSubDir);

    if (!cacheSubDirOnDisk) {
      // For now, just recreate the entire cache if the directory for the major version is not found
      // Note: This will not work if there are multiple iModel.js instances sharing the same cacheRoot directory, but are running different cache major versions
      BriefcaseManager.deleteFolderContents(cacheRootDir);
    } else if (cacheSubDirOnDisk !== cacheSubDir) {
      const cacheDirOnDisk = path.join(cacheRootDir, cacheSubDirOnDisk);
      BriefcaseManager.deleteFolderAndContents(cacheDirOnDisk);
    }

    if (!IModelJsFs.existsSync(cacheDir))
      BriefcaseManager.createFolder(cacheDir);

    BriefcaseManager._cacheDir = cacheDir;
  }

  private static clearCacheDir() {
    this._cacheRootDir = undefined;
    this._cacheDir = undefined;
  }

  /** Get the index of the change set from its id */
  private static async getChangeSetIndexFromId(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, changeSetId: GuidString): Promise<number> {
    requestContext.enter();
    if (changeSetId === "")
      return 0; // the first version

    const changeSet: ChangeSet = (await BriefcaseManager.imodelClient.changeSets.get(requestContext, iModelId, new ChangeSetQuery().byId(changeSetId)))[0];
    requestContext.enter();

    return +changeSet.index!;
  }

  private static _asyncMutex = new AsyncMutex();

  /** Request downloading of a briefcase
   * @return Information on the downloaded briefcase, and a promise that resolves when the download completes
   * @param requestContext The client request context.
   * @param contextId Id of the iTwin Project or Asset containing the iModel
   * @param iModelId Id of the iModel
   * @param downloadOptions Options to affect the download of the briefcase
   * @param version Version of the iModel to open
   * @internal
   */
  public static async requestDownload(requestContext: AuthorizedClientRequestContext, contextId: GuidString, iModelId: GuidString, downloadOptions: DownloadBriefcaseOptions, version: IModelVersion = IModelVersion.latest(), downloadProgress?: ProgressCallback): Promise<BriefcaseDownloader> {
    requestContext.enter();

    const changeSetId: string = await version.evaluateChangeSet(requestContext, iModelId, BriefcaseManager.imodelClient);
    requestContext.enter();

    const requestBriefcaseProps: RequestBriefcaseProps = { contextId, iModelId, changeSetId };

    let briefcaseEntry: BriefcaseEntry;
    try {
      if (downloadOptions.syncMode === SyncMode.FixedVersion) {
        briefcaseEntry = this.requestDownloadFixedVersion(requestBriefcaseProps, downloadOptions, downloadProgress);
        requestContext.enter();
      } else if (downloadOptions.syncMode === SyncMode.PullOnly) {
        briefcaseEntry = this.requestDownloadPullOnly(requestBriefcaseProps, downloadOptions, downloadProgress);
        requestContext.enter();
      } else {
        const unlock = await this._asyncMutex.lock();
        try {
          // Note: It's important that the code below is called only once at a time - see docs with the method for more info
          briefcaseEntry = await this.requestDownloadPullAndPush(requestContext, requestBriefcaseProps, downloadOptions, downloadProgress);
        } finally {
          requestContext.enter();
          unlock();
        }
      }
    } catch (error) {
      requestContext.enter();
      Logger.logError(loggerCategory, "BriefcaseManager.requestDownloadBriefcase failed", () => ({ ...requestBriefcaseProps, ...downloadOptions }));
      throw error;
    }

    const downloader: BriefcaseDownloader = {
      briefcaseProps: briefcaseEntry.getBriefcaseProps(),
      downloadPromise: briefcaseEntry.downloadPromise,
      requestCancel: async () => briefcaseEntry.cancelDownloadRequest.cancel(),
    };
    return downloader;
  }

  /** Download an iModel briefcase from iModelHub, and cache it locally.
   * @param requestContext The client request context.
   * @param contextId Id of the Project or Asset containing the iModel
   * @param iModelId Id of the iModel
   * @param downloadOptions Options to affect the download of the briefcase
   * @param version Version of the iModel to download
   * @beta
   */
  public static async download(requestContext: AuthorizedClientRequestContext, contextId: GuidString, iModelId: GuidString, downloadOptions: DownloadBriefcaseOptions, version: IModelVersion = IModelVersion.latest(), downloadProgress?: ProgressCallback): Promise<BriefcaseProps> {
    requestContext.enter();

    const { briefcaseProps, downloadPromise } = await BriefcaseManager.requestDownload(requestContext, contextId, iModelId, downloadOptions, version, downloadProgress);
    requestContext.enter();

    try {
      await downloadPromise;
      requestContext.enter();
    } catch (error) {
      // Note: If the briefcase download fails, the entry is cleared from the cache and the next call for the same briefcase will be a fresh attempt
      requestContext.enter();
      Logger.logError(loggerCategory, "BriefcaseManager.downloadBriefcase failed", () => briefcaseProps);
      throw error;
    }

    return briefcaseProps;
  }

  /**
   * Gets the briefcases that have been downloaded, or a download has been requested
   * @internal
   */
  public static getBriefcases(): BriefcaseProps[] {
    const filterFn = (_value: BriefcaseEntry) => true; // no standalone files or snapshots
    const briefcases = this._cache.getFilteredBriefcases(filterFn).map((briefcaseEntry: BriefcaseEntry) => briefcaseEntry.getBriefcaseProps());
    return briefcases;
  }

  /** Open a downloaded briefcase
   * @internal
   */
  public static openBriefcase(briefcase: BriefcaseEntry) {
    const res: DbResult = briefcase.nativeDb!.openIModel(briefcase.pathname, briefcase.openMode);
    briefcase.isOpen = true;
    if (DbResult.BE_SQLITE_OK !== res)
      throw new IModelError(res, `Unable to reopen briefcase at ${briefcase.pathname}`, Logger.logError, loggerCategory, () => briefcase.getDebugInfo());
  }

  /**
   * Requests/starts download of a "fixed version" briefcase - the briefcase is organized by iModelId + changeSetId, and cannot be switched to a different version than when it was opened.
   * Note: It's important that this method be kept synchronous - in the least there shouldn't be any await-s between cache lookup and cache update!
   */
  private static requestDownloadFixedVersion(requestBriefcaseProps: RequestBriefcaseProps, downloadOptions: DownloadBriefcaseOptions, downloadProgress?: ProgressCallback): BriefcaseEntry {
    const { iModelId, changeSetId } = requestBriefcaseProps;

    // Find briefcase in cache, or add a new entry
    const cachedBriefcase = this.findFixedVersionBriefcaseInCache(iModelId, changeSetId);
    if (cachedBriefcase) {
      Logger.logTrace(loggerCategory, "BriefcaseManager.requestDownloadFixedVersion - found briefcase in cache", () => cachedBriefcase.getDebugInfo());
      return cachedBriefcase;
    }

    // Find matching briefcase on disk if available (and add it to the cache)
    const diskBriefcase = this.initializeFixedVersionBriefcaseOnDisk(requestBriefcaseProps, downloadOptions);
    if (diskBriefcase) {
      Logger.logTrace(loggerCategory, "BriefcaseManager.requestDownloadFixedVersion - opening briefcase from disk", () => diskBriefcase.getDebugInfo());
      return diskBriefcase;
    }

    // Create a new briefcase (and it to the cache)
    const newBriefcase = this.createFixedVersionBriefcase(requestBriefcaseProps, downloadOptions, downloadProgress);
    Logger.logTrace(loggerCategory, "BriefcaseManager.requestDownloadFixedVersion - creating a new briefcase", () => newBriefcase.getDebugInfo());
    return newBriefcase;
  }

  /**
   * Requests/starts download of a "pull only" briefcase - the briefcase is organized by iModelId, assumed to be standalone, and subsequent pulls may update to a newer version as long
   * as the briefcase is not already open.
   * Note: It's important that this method be kept synchronous - in the least there shouldn't be any await-s between cache lookup and cache update!
   */
  private static requestDownloadPullOnly(requestBriefcaseProps: RequestBriefcaseProps, downloadOptions: DownloadBriefcaseOptions, downloadProgress?: ProgressCallback): BriefcaseEntry {
    const { iModelId, changeSetId } = requestBriefcaseProps;

    /*
     * Note: It's important that there are no await-s between cache lookup and cache update!!
     *                 -- so the calls below should be kept synchronous --
     */

    // Find briefcase in cache, or add a new entry
    const cachedBriefcase = this.findPullOnlyBriefcaseInCache(iModelId);
    if (cachedBriefcase) {
      if (cachedBriefcase.downloadStatus !== DownloadBriefcaseStatus.Complete && cachedBriefcase.downloadStatus !== DownloadBriefcaseStatus.Error) {
        Logger.logTrace(loggerCategory, "BriefcaseManager.requestDownloadPullOnly - found briefcase in cache", () => cachedBriefcase.getDebugInfo());
        return cachedBriefcase;
      }

      const briefcaseValidity = this.validateBriefcase(cachedBriefcase, changeSetId, cachedBriefcase.briefcaseId);
      if (briefcaseValidity === BriefcaseValidity.Reuse) {
        Logger.logTrace(loggerCategory, "BriefcaseManager.requestDownloadPullAndPush - reusing briefcase in cache", () => cachedBriefcase.getDebugInfo());
        return cachedBriefcase;
      }

      if (cachedBriefcase.isOpen) {
        Logger.logError(loggerCategory, "Briefcase found is not of the required version, but is already open. Cannot update or recreate it!", ({ ...cachedBriefcase.getDebugInfo(), requiredChangeSetId: changeSetId }));
        return cachedBriefcase;
      }

      // Remove the briefcase from cache so that it can be re-located or re-created and re-added to the cache
      BriefcaseManager.deleteBriefcaseFromCache(cachedBriefcase);

      // Remove the briefcase from the local disk so that it can be re-created
      if (briefcaseValidity === BriefcaseValidity.Recreate) {
        BriefcaseManager.deleteBriefcaseFromLocalDisk(cachedBriefcase);
      }
    }

    // Find matching briefcase on disk if available (and add it to the cache)
    const diskBriefcase = this.initializePullOnlyBriefcaseOnDisk(requestBriefcaseProps, downloadOptions);
    if (diskBriefcase) {
      Logger.logTrace(loggerCategory, "BriefcaseManager.requestDownloadPullOnly - opening briefcase from disk", () => diskBriefcase.getDebugInfo());
      return diskBriefcase;
    }

    // Set up the briefcase and add it to the cache
    const newBriefcase = this.createVariableVersionBriefcase(requestBriefcaseProps, downloadOptions, BriefcaseIdValue.Standalone, downloadProgress);
    Logger.logTrace(loggerCategory, "BriefcaseManager.requestDownloadPullOnly - creating a new briefcase.", () => newBriefcase.getDebugInfo());
    return newBriefcase;
  }

  /** Open (or create) a briefcase for pull and push workflows
   * Note: It's important that this method ibe made atomic - i.e., there should never be a case where there are two asynchronous calls to this method
   * being processed at the same time. Otherwise there may be multiple briefcases that are acquired and downloaded for the same user.
   */
  private static async requestDownloadPullAndPush(requestContext: AuthorizedClientRequestContext, requestBriefcaseProps: RequestBriefcaseProps, downloadOptions: DownloadBriefcaseOptions, downloadProgress?: ProgressCallback): Promise<BriefcaseEntry> {
    requestContext.enter();
    const { iModelId, changeSetId } = requestBriefcaseProps;

    const hubBriefcases: HubBriefcase[] = await BriefcaseManager.imodelClient.briefcases.get(requestContext, iModelId, new BriefcaseQuery().ownedByMe().selectDownloadUrl());
    requestContext.enter();

    let briefcaseId: BriefcaseId | undefined;
    if (hubBriefcases.length > 0) {
      /** Find any of the briefcases in cache */
      const cachedBriefcase = this.findPullAndPushBriefcaseInCache(iModelId, hubBriefcases);
      if (cachedBriefcase) {
        if (cachedBriefcase.downloadStatus !== DownloadBriefcaseStatus.Complete && cachedBriefcase.downloadStatus !== DownloadBriefcaseStatus.Error) {
          Logger.logTrace(loggerCategory, "BriefcaseManager.requestDownloadPullAndPush - found briefcase that's being downloaded in cache", () => cachedBriefcase.getDebugInfo());
          return cachedBriefcase;
        }

        const briefcaseValidity = this.validateBriefcase(cachedBriefcase, changeSetId, cachedBriefcase.briefcaseId);
        if (briefcaseValidity === BriefcaseValidity.Reuse) {
          Logger.logTrace(loggerCategory, "BriefcaseManager.requestDownloadPullAndPush - reusing briefcase in cache", () => cachedBriefcase.getDebugInfo());
          return cachedBriefcase;
        }

        if (cachedBriefcase.isOpen) {
          Logger.logError(loggerCategory, "Briefcase found is not of the required version, but is already open. Cannot update or recreate it!", ({ ...cachedBriefcase.getDebugInfo(), requiredChangeSetId: changeSetId }));
          return cachedBriefcase;
        }

        // Remove the briefcase from cache so that it can be re-located or re-created and re-added to the cache
        BriefcaseManager.deleteBriefcaseFromCache(cachedBriefcase);

        // Remove the briefcase from the local disk so that it can be re-created
        if (briefcaseValidity === BriefcaseValidity.Recreate) {
          briefcaseId = cachedBriefcase.briefcaseId; // Reuse the briefcase id if it gets re-created
          BriefcaseManager.deleteBriefcaseFromLocalDisk(cachedBriefcase);
        }
      }

      /** Find matching briefcase on disk if available (and add it to the cache) */
      if (briefcaseId === undefined) { // i.e., it's not the case of re-creating a briefcase
        const foundEntry: { pathname: string, briefcaseId: BriefcaseId } | undefined = this.findPullAndPushBriefcaseOnDisk(iModelId, hubBriefcases);
        if (foundEntry !== undefined) {
          briefcaseId = foundEntry.briefcaseId; // Reuse the briefcase id
          const diskBriefcase = this.initializeBriefcase(requestBriefcaseProps, downloadOptions, foundEntry.pathname, briefcaseId);
          if (diskBriefcase) {
            Logger.logTrace(loggerCategory, "BriefcaseManager.requestDownloadPullAndPush - opening briefcase from disk", () => diskBriefcase.getDebugInfo());
            return diskBriefcase;
          }
        }
      }
    }

    /** Acquire a new briefcase if necessary */
    if (briefcaseId === undefined) {
      const acquiredBriefcase = await BriefcaseManager.acquireBriefcase(requestContext, iModelId);
      requestContext.enter();
      briefcaseId = acquiredBriefcase.briefcaseId!;
    }

    // Set up the briefcase and add it to the cache
    const newBriefcase = this.createVariableVersionBriefcase(requestBriefcaseProps, downloadOptions, briefcaseId, downloadProgress);
    Logger.logTrace(loggerCategory, "BriefcaseManager.requestDownloadPullAndPush - creating a new briefcase.", () => newBriefcase.getDebugInfo());
    return newBriefcase;
  }

  private static validateBriefcase(briefcase: BriefcaseEntry, requiredChangeSetId: GuidString, requiredBriefcaseId: BriefcaseId): BriefcaseValidity {
    if (briefcase.downloadStatus === DownloadBriefcaseStatus.Error) {
      Logger.logError(loggerCategory, "Briefcase found that had download errors. Must recreate it.", () => ({ ...briefcase.getDebugInfo(), requiredBriefcaseId }));
      return BriefcaseValidity.Recreate;
    }

    if (briefcase.briefcaseId !== requiredBriefcaseId) {
      Logger.logError(loggerCategory, "Briefcase found does not have the expected briefcase id. Must recreate it.", () => ({ ...briefcase.getDebugInfo(), requiredBriefcaseId }));
      return BriefcaseValidity.Recreate;
    }

    if (briefcase.currentChangeSetId === requiredChangeSetId) {
      Logger.logTrace(loggerCategory, "Briefcase found is of the required version and briefcaseId.", () => ({ ...briefcase.getDebugInfo(), requiredChangeSetId, requiredBriefcaseId }));
      return BriefcaseValidity.Reuse;
    }

    if (briefcase.syncMode === SyncMode.FixedVersion) {
      Logger.logError(loggerCategory, "Briefcase found is not of the required version. Must recreate it.", () => ({ ...briefcase.getDebugInfo(), requiredChangeSetId }));
      return BriefcaseValidity.Recreate;
    }

    // PullOnly or PullAndPush, and the required version doesn't match the current version
    Logger.logWarning(loggerCategory, "Briefcase found is not of the required version. Must be updated before use", () => ({ ...briefcase.getDebugInfo(), requiredChangeSetId }));
    return BriefcaseValidity.Update;
  }

  private static initializeBriefcase(requestBriefcaseProps: RequestBriefcaseProps, downloadOptions: DownloadBriefcaseOptions, pathname: string, briefcaseId: BriefcaseId): BriefcaseEntry | undefined {
    const { contextId, iModelId, changeSetId } = requestBriefcaseProps;
    const { syncMode } = downloadOptions;
    const openMode = (syncMode === SyncMode.FixedVersion) ? OpenMode.Readonly : OpenMode.ReadWrite;

    const briefcase = new BriefcaseEntry(contextId, iModelId, changeSetId, pathname, syncMode, openMode, briefcaseId);

    const nativeDb = new IModelHost.platform.DgnDb();
    const res = nativeDb.openIModel(pathname, briefcase.openMode);
    if (DbResult.BE_SQLITE_OK !== res) {
      Logger.logError(loggerCategory, "Cannot open briefcase. Deleting it to allow retries.", () => briefcase.getDebugInfo());
      BriefcaseManager.deleteBriefcaseFromLocalDisk(briefcase);
      return undefined;
    }
    briefcase.setNativeDb(nativeDb); // Note: Sets briefcaseId, currentChangeSetId in BriefcaseEntry by reading the values from nativeDb
    assert(briefcase.isOpen);

    const briefcaseValidity = this.validateBriefcase(briefcase, briefcase.targetChangeSetId, briefcaseId);
    if (briefcaseValidity === BriefcaseValidity.Recreate) {
      Logger.logError(loggerCategory, "Deleting briefcase to recreate.", () => briefcase.getDebugInfo());
      BriefcaseManager.closeBriefcase(briefcase, false);
      BriefcaseManager.deleteBriefcaseFromLocalDisk(briefcase);
      return undefined;
    }

    assert(!this._cache.findBriefcase(briefcase), "Attempting to open or create briefcase twice");
    BriefcaseManager._cache.addBriefcase(briefcase);

    briefcase.downloadStatus = DownloadBriefcaseStatus.Initializing;
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    briefcase.downloadPromise = this.finishInitializeBriefcase(requestContext, briefcase);
    return briefcase;
  }

  private static async finishInitializeBriefcase(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry) {
    requestContext.enter();

    const briefcaseHasChanges = briefcase.nativeDb!.hasPendingTxns();
    try {
      await this.initBriefcaseChangeSetIndexes(requestContext, briefcase);
      requestContext.enter();
      await this.initBriefcaseFileId(requestContext, briefcase);
      requestContext.enter();

      // Apply change sets if necessary
      if (briefcase.currentChangeSetId !== briefcase.targetChangeSetId) {
        await BriefcaseManager.processChangeSets(requestContext, briefcase, briefcase.targetChangeSetId, briefcase.targetChangeSetIndex!);
        requestContext.enter();
      }

      // Close the briefcase to complete the download/initialization
      BriefcaseManager.closeBriefcase(briefcase, false);

      // Set the flag to mark that briefcase download has completed
      briefcase.downloadStatus = DownloadBriefcaseStatus.Complete;
    } catch (error) {
      requestContext.enter();
      briefcase.downloadStatus = DownloadBriefcaseStatus.Error;

      if (briefcaseHasChanges && briefcase.syncMode === SyncMode.PullAndPush)
        Logger.logError(loggerCategory, "Unable to update existing briefcase to the required version. Since it has changes that may have to be pushed, leaving it as is.", () => briefcase.getDebugInfo());
      else {
        Logger.logError(loggerCategory, "Initializing a briefcase fails - deleting it to allow retries", () => briefcase.getDebugInfo());
        await BriefcaseManager.deleteBriefcase(requestContext, briefcase);
        requestContext.enter();
        throw error;
      }
    }
  }

  private static async initBriefcaseChangeSetIndexes(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry) {
    requestContext.enter();
    briefcase.targetChangeSetIndex = await BriefcaseManager.getChangeSetIndexFromId(requestContext, briefcase.iModelId, briefcase.targetChangeSetId);
    requestContext.enter();
    briefcase.parentChangeSetIndex = await BriefcaseManager.getChangeSetIndexFromId(requestContext, briefcase.iModelId, briefcase.parentChangeSetId);
    requestContext.enter();
    if (typeof briefcase.reversedChangeSetId !== "undefined") {
      briefcase.reversedChangeSetIndex = await BriefcaseManager.getChangeSetIndexFromId(requestContext, briefcase.iModelId, briefcase.reversedChangeSetId);
      requestContext.enter();
    } else
      briefcase.reversedChangeSetIndex = undefined;
  }

  /** @internal */
  public static isStandaloneBriefcaseId(id: BriefcaseId) {
    return id === BriefcaseIdValue.Standalone || id === BriefcaseIdValue.DeprecatedStandalone;
  }
  /** @internal */
  public static isValidBriefcaseId(id: BriefcaseId) {
    return id >= BriefcaseIdValue.FirstValid && id <= BriefcaseIdValue.LastValid;
  }

  private static async initBriefcaseFileId(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry) {
    if (!this.isValidBriefcaseId(briefcase.briefcaseId)) // only possible to get fileId only for normal briefcases
      return;

    const hubBriefcases: HubBriefcase[] = await BriefcaseManager.imodelClient.briefcases.get(requestContext, briefcase.iModelId, new BriefcaseQuery().byId(briefcase.briefcaseId));
    requestContext.enter();
    if (hubBriefcases.length === 0)
      throw new IModelError(DbResult.BE_SQLITE_ERROR, `Unable to find briefcase on the Hub (for the current user)`, Logger.logError, loggerCategory, () => briefcase.getDebugInfo());
    briefcase.fileId = hubBriefcases[0].fileId!.toString();
  }

  private static createFixedVersionBriefcase(requestBriefcaseProps: RequestBriefcaseProps, downloadOptions: DownloadBriefcaseOptions, downloadProgress?: ProgressCallback): BriefcaseEntry {
    const { contextId, iModelId, changeSetId } = requestBriefcaseProps;
    const { syncMode } = downloadOptions;
    const openMode = OpenMode.Readonly;

    const pathname = this.buildFixedVersionBriefcasePath(iModelId, changeSetId);
    const briefcase = new BriefcaseEntry(contextId, iModelId, changeSetId, pathname, syncMode, openMode, BriefcaseIdValue.Standalone);
    briefcase.downloadProgress = downloadProgress;

    briefcase.downloadStatus = DownloadBriefcaseStatus.Initializing;
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    briefcase.downloadPromise = this.finishCreateBriefcase(requestContext, briefcase);

    assert(!this._cache.findBriefcase(briefcase), "Attempting to open or create briefcase twice");
    BriefcaseManager._cache.addBriefcase(briefcase);

    return briefcase;
  }

  private static createVariableVersionBriefcase(requestBriefcaseProps: RequestBriefcaseProps, downloadOptions: DownloadBriefcaseOptions, briefcaseId: BriefcaseId, downloadProgress?: ProgressCallback): BriefcaseEntry {
    const { contextId, iModelId, changeSetId } = requestBriefcaseProps;
    const { syncMode } = downloadOptions;
    const openMode = OpenMode.ReadWrite;

    const pathname = this.buildVariableVersionBriefcasePath(iModelId, briefcaseId, syncMode);
    const briefcase = new BriefcaseEntry(contextId, iModelId, changeSetId, pathname, syncMode, openMode, briefcaseId);
    briefcase.downloadProgress = downloadProgress;

    briefcase.downloadStatus = DownloadBriefcaseStatus.Initializing;
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    briefcase.downloadPromise = this.finishCreateBriefcase(requestContext, briefcase);

    assert(!this._cache.findBriefcase(briefcase), "Attempting to open or create briefcase twice");
    BriefcaseManager._cache.addBriefcase(briefcase);

    return briefcase;
  }

  private static async finishCreateBriefcase(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry): Promise<void> {
    requestContext.enter();
    try {
      const perfLogger = new PerfLogger("BriefcaseManager - downloading briefcase", () => briefcase.getDebugInfo());

      // Download checkpoint
      let checkpointQuery = new CheckpointQuery().selectDownloadUrl();
      checkpointQuery = checkpointQuery.precedingCheckpoint(briefcase.targetChangeSetId);
      const checkpoints: Checkpoint[] = await BriefcaseManager.imodelClient.checkpoints.get(requestContext, briefcase.iModelId, checkpointQuery);
      requestContext.enter();
      if (checkpoints.length === 0)
        throw new IModelError(BriefcaseStatus.VersionNotFound, "Checkpoint not found", Logger.logError, loggerCategory, () => briefcase.getDebugInfo());
      const checkpoint = checkpoints[0];
      if (checkpoint.fileId)
        briefcase.fileId = checkpoint.fileId.toString();

      briefcase.downloadStatus = DownloadBriefcaseStatus.DownloadingCheckpoint;
      await BriefcaseManager.downloadCheckpoint(requestContext, checkpoint, briefcase.pathname, briefcase.downloadProgress, briefcase.cancelDownloadRequest);
      requestContext.enter();

      briefcase.downloadStatus = DownloadBriefcaseStatus.Initializing;

      // Open checkpoint
      const nativeDb = new IModelHost.platform.DgnDb();
      const res = nativeDb.openIModel(briefcase.pathname, OpenMode.ReadWrite);
      if (DbResult.BE_SQLITE_OK !== res)
        throw new IModelError(res, "Unable to open Db", Logger.logError, loggerCategory, () => ({ ...briefcase.getDebugInfo(), result: res }));

      if (nativeDb.getBriefcaseId() !== briefcase.briefcaseId)
        nativeDb.resetBriefcaseId(briefcase.briefcaseId);

      // verify that all following values were set correctly
      assert(nativeDb.getParentChangeSetId() === checkpoint.mergedChangeSetId, "The parentChangeSetId of the checkpoint was not correctly set by iModelHub");
      assert(nativeDb.getBriefcaseId() === briefcase.briefcaseId);
      assert(nativeDb.getDbGuid() === briefcase.iModelId);
      assert(nativeDb.queryProjectGuid() === briefcase.contextId);

      briefcase.setNativeDb(nativeDb);
      await this.initBriefcaseChangeSetIndexes(requestContext, briefcase);
      requestContext.enter();

      // Apply change sets if necessary
      if (briefcase.currentChangeSetId !== briefcase.targetChangeSetId) {
        // Note: For fixed version cases, the briefcase meta-data may have been set to Readonly, even if the nativeDb was just created ReadWrite to
        // apply change sets. We temporarily set it to ReadWrite in these cases to allow processChangeSets to not error out applying the change sets.
        const backupOpenMode = briefcase.openMode;
        briefcase.openMode = OpenMode.ReadWrite;
        await BriefcaseManager.processChangeSets(requestContext, briefcase, briefcase.targetChangeSetId, briefcase.targetChangeSetIndex!);
        requestContext.enter();
        briefcase.openMode = backupOpenMode;
      }

      // Close the briefcase to complete the download/initialization
      BriefcaseManager.closeBriefcase(briefcase, false);

      // Set the flag to mark that briefcase download has completed
      briefcase.downloadStatus = DownloadBriefcaseStatus.Complete;

      perfLogger.dispose();
    } catch (error) {
      requestContext.enter();
      Logger.logError(loggerCategory, "Error downloading briefcase - deleting it", () => briefcase.getDebugInfo());

      briefcase.downloadStatus = DownloadBriefcaseStatus.Error;
      await BriefcaseManager.deleteBriefcase(requestContext, briefcase);
      requestContext.enter();

      if (error.errorNumber === ChangeSetStatus.CorruptedChangeStream || error.errorNumber === ChangeSetStatus.InvalidId || error.errorNumber === ChangeSetStatus.InvalidVersion) {
        Logger.logError(loggerCategory, "Detected potential corruption of change sets. Deleting them to enable retries", () => briefcase.getDebugInfo());
        BriefcaseManager.deleteChangeSetsFromLocalDisk(briefcase.iModelId);
      }
      throw error;
    }
  }

  /** Close a briefcase
   * @internal
   */
  public static close(briefcase: BriefcaseEntry) {
    BriefcaseManager.closeBriefcase(briefcase, true);
  }

  /** Acquire a briefcase */
  private static async acquireBriefcase(requestContext: AuthorizedClientRequestContext, iModelId: GuidString): Promise<HubBriefcase> {
    requestContext.enter();

    const briefcase: HubBriefcase = await BriefcaseManager.imodelClient.briefcases.create(requestContext, iModelId);
    requestContext.enter();

    if (!briefcase) {
      // Could well be that the current user does not have the appropriate access
      return Promise.reject(new IModelError(BriefcaseStatus.CannotAcquire, "Could not acquire briefcase", Logger.logError, loggerCategory));
    }
    return briefcase;
  }

  private static enableDownloadTrace(checkpoint: Checkpoint, progressCallback?: ProgressCallback): ProgressCallback {
    const sasUrl = new URL(checkpoint.downloadUrl!);
    const se = sasUrl.searchParams.get("se");
    if (se) {
      const expiresAt = new Date(se);
      const now = new Date();
      const expiresInSeconds = (expiresAt.getTime() - now.getTime()) / 1000;
      Logger.logTrace(loggerCategory, "Downloading checkpoint (started)...", () => ({
        expiresInSeconds,
        fileSizeInBytes: checkpoint.fileSize,
      }));
    }

    let lastReported = 0;
    const startedTime = (new Date()).getTime();
    const progressCallbackWrapper = (progressInfo: ProgressInfo) => {
      if (progressCallback)
        progressCallback(progressInfo);
      if (progressInfo.percent === undefined)
        return;
      if (progressInfo.percent - lastReported > 5.0) {
        lastReported = progressInfo.percent;
        const currentTime = (new Date()).getTime();
        const elapsedSeconds = (currentTime - startedTime) / 1000;
        const remainingSeconds = (elapsedSeconds * (100.0 - progressInfo.percent)) / progressInfo.percent;
        Logger.logTrace(loggerCategory, "Downloading checkpoint (progress)...", () => ({
          downloadedBytes: progressInfo.loaded, totalBytes: progressInfo.total, percentComplete: progressInfo.percent?.toFixed(2),
          elapsedSeconds: elapsedSeconds.toFixed(0), remainingSeconds: remainingSeconds.toFixed(0),
        }));
      }
    };
    return progressCallbackWrapper;
  }

  /** Downloads the checkpoint file */
  private static async downloadCheckpoint(requestContext: AuthorizedClientRequestContext, checkpoint: Checkpoint, seedPathname: string, progressCallback?: ProgressCallback, cancelRequest?: CancelRequest): Promise<void> {
    requestContext.enter();
    if (IModelJsFs.existsSync(seedPathname))
      return;

    let progressCallbackWrapper: ProgressCallback | undefined = progressCallback;
    if (Logger.isEnabled(loggerCategory, LogLevel.Trace))
      progressCallbackWrapper = this.enableDownloadTrace(checkpoint, progressCallback);

    try {
      await BriefcaseManager.imodelClient.checkpoints.download(requestContext, checkpoint, seedPathname, progressCallbackWrapper, cancelRequest);
    } catch (error) {
      requestContext.enter();
      if (!(error instanceof UserCancelledError))
        Logger.logError(loggerCategory, "Could not download checkpoint", () => ({ error: error.message || error.name }));
      throw error;
    }
  }

  /** Deletes the chain of parent folders starting with the briefcase path itself, checking if these folders are empty at every level.
   * Returns true if the top most parent iModel folder was entirely deleted
   */
  private static deleteBriefcaseParentFolders(iModelId: GuidString, syncMode: SyncMode): boolean {
    // Delete briefcase directory for a specific SyncMode if empty (PullAndPush, PullOnly, FixedVersion)
    const bcSyncModePath = BriefcaseManager.getBriefcaseSyncModePath(iModelId, syncMode);
    if (!this.deleteFolderIfEmpty(bcSyncModePath))
      return false;

    // Delete the specific iModel root directory if the "bc" directory is empty and was successfully deleted (since there aren't any more cached briefcases for that iModel)
    const bcPath = this.getBriefcaseBasePath(iModelId);
    if (!this.deleteFolderIfEmpty(bcPath))
      return false;

    // Delete the iModel directory
    const iModelPath = this.getIModelPath(iModelId);
    if (!this.deleteFolderAndContents(iModelPath))
      return false;

    return true;
  }

  /** Deletes a briefcase from the local disk (if it exists) */
  private static deleteBriefcaseFromLocalDisk(briefcase: BriefcaseEntry) {
    if (briefcase.isOpen) {
      Logger.logError(loggerCategory, "Cannot delete an open briefcase from local disk", () => briefcase.getDebugInfo());
      return;
    }

    // Delete the briefcase folder itself
    const briefcaseFolderPath = path.dirname(briefcase.pathname);
    if (BriefcaseManager.deleteFolderAndContents(briefcaseFolderPath))
      Logger.logTrace(loggerCategory, "Deleted briefcase from local disk", () => briefcase.getDebugInfo());

    this.deleteBriefcaseParentFolders(briefcase.iModelId, briefcase.syncMode);
  }

  /** Deletes change sets of an iModel from local disk */
  private static deleteChangeSetsFromLocalDisk(iModelId: string) {
    const changeSetsPath: string = BriefcaseManager.getChangeSetsPath(iModelId);
    if (BriefcaseManager.deleteFolderAndContents(changeSetsPath))
      Logger.logTrace(loggerCategory, "Deleted change sets from local disk", () => ({ iModelId, changeSetsPath }));
  }

  /** Deletes a briefcase from the IModelServer (if it exists) */
  private static async deleteBriefcaseFromServer(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry): Promise<void> {
    requestContext.enter();
    if (!this.isValidBriefcaseId(briefcase.briefcaseId))
      return;
    if (!briefcase.iModelId) {
      Logger.logError(loggerCategory, "Briefcase with invalid iModelId detected", () => briefcase.getDebugInfo());
      return;
    }
    return this.deleteBriefcaseFromServerById(requestContext, briefcase.iModelId, briefcase.briefcaseId);
  }

  private static async deleteBriefcaseFromServerById(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, briefcaseId: number): Promise<void> {
    requestContext.enter();

    try {
      await BriefcaseManager.imodelClient.briefcases.get(requestContext, iModelId, new BriefcaseQuery().byId(briefcaseId));
      requestContext.enter();
    } catch (err) {
      requestContext.enter();
      return; // Briefcase does not exist on the hub, or cannot be accessed
    }

    try {
      await BriefcaseManager.imodelClient.briefcases.delete(requestContext, iModelId, briefcaseId);
      requestContext.enter();
      Logger.logTrace(loggerCategory, "Deleted briefcase from the server", () => ({ iModelId, briefcaseId }));
    } catch (err) {
      requestContext.enter();
      Logger.logError(loggerCategory, "Could not delete the acquired briefcase", () => ({ iModelId, briefcaseId })); // Could well be that the current user does not have the appropriate access
    }
  }

  /** Deletes a briefcase from the cache (if it exists) */
  private static deleteBriefcaseFromCache(briefcase: BriefcaseEntry) {
    if (!BriefcaseManager._cache.findBriefcase(briefcase))
      return;

    BriefcaseManager._cache.deleteBriefcaseByKey(briefcase.getKey());
  }

  /**
   * Delete a previously downloaded briefcase
   * @param requestContext
   * @param iModelToken
   * @throws [[IModelError]] If unable to delete the briefcase - e.g., if it wasn't completely downloaded, OR was left open
   * @beta
   */
  public static async delete(requestContext: ClientRequestContext | AuthorizedClientRequestContext, key: BriefcaseKey): Promise<void> {
    const briefcase = BriefcaseManager.findBriefcaseByKey(key);
    if (briefcase === undefined)
      throw new IModelError(IModelStatus.BadRequest, "Cannot delete a briefcase that not been downloaded", Logger.logError, loggerCategory, () => key);
    if (briefcase.downloadStatus !== DownloadBriefcaseStatus.Complete && briefcase.downloadStatus !== DownloadBriefcaseStatus.Error)
      throw new IModelError(IModelStatus.BadRequest, "Cannot delete a briefcase that's being downloaded", Logger.logError, loggerCategory, () => briefcase.getDebugInfo());
    if (briefcase.isOpen)
      throw new IModelError(IModelStatus.BadRequest, "Cannot delete a briefcase that's open", Logger.logError, loggerCategory, () => briefcase.getDebugInfo());
    await BriefcaseManager.deleteBriefcase(requestContext, briefcase);
  }

  /** Deletes a briefcase, and releases its references in iModelHub if necessary */
  private static async deleteBriefcase(requestContext: ClientRequestContext | AuthorizedClientRequestContext, briefcase: BriefcaseEntry): Promise<void> {
    requestContext.enter();
    Logger.logTrace(loggerCategory, "Started deleting briefcase", () => briefcase.getDebugInfo());
    BriefcaseManager.closeBriefcase(briefcase, false);
    BriefcaseManager.deleteBriefcaseFromCache(briefcase);
    if (this.isValidBriefcaseId(briefcase.briefcaseId)) {
      if (!(requestContext instanceof AuthorizedClientRequestContext))
        throw new IModelError(BentleyStatus.ERROR, "Deleting a briefcase with SyncMode = PullPush requires authorization - pass AuthorizedClientRequestContext instead of ClientRequestContext");
      await BriefcaseManager.deleteBriefcaseFromServer(requestContext, briefcase);
      requestContext.enter();
    }
    BriefcaseManager.deleteBriefcaseFromLocalDisk(briefcase);
    Logger.logTrace(loggerCategory, "Finished deleting briefcase", () => briefcase.getDebugInfo());
  }

  private static async downloadChangeSetsInternal(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, query: ChangeSetQuery): Promise<ChangeSet[]> {
    requestContext.enter();
    const changeSetsPath: string = BriefcaseManager.getChangeSetsPath(iModelId);

    const perfLogger = new PerfLogger("BriefcaseManager.downloadChangeSets", () => ({ iModelId }));
    let changeSets;
    try {
      changeSets = await BriefcaseManager.imodelClient.changeSets.download(requestContext, iModelId, query, changeSetsPath);
      requestContext.enter();
    } catch (error) {
      requestContext.enter();
      Logger.logError(loggerCategory, "Could not download changesets", () => ({ iModelId }));
      throw error;
    }
    perfLogger.dispose();
    return changeSets;
  }

  /** Downloads change sets in the specified range.
   *  * Downloads change sets *after* the specified fromChangeSetId, up to and including the toChangeSetId
   *  * If the ids are the same returns an empty array.
   * @internal
   */
  public static async downloadChangeSets(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, fromChangeSetId: string, toChangeSetId: string): Promise<ChangeSet[]> {
    requestContext.enter();

    if (toChangeSetId === "" /* first version */ || fromChangeSetId === toChangeSetId)
      return new Array<ChangeSet>();

    const query = new ChangeSetQuery();
    query.betweenChangeSets(toChangeSetId, fromChangeSetId);

    return BriefcaseManager.downloadChangeSetsInternal(requestContext, iModelId, query);
  }

  /** Deletes a file
   *  - Does not throw any error, but logs it instead
   *  - Returns true if the delete was successful
   */
  private static deleteFile(pathname: string): boolean {
    try {
      IModelJsFs.unlinkSync(pathname);
    } catch (error) {
      Logger.logError(loggerCategory, `Cannot delete file ${pathname}`);
      return false;
    }
    return true;
  }

  /** Deletes a folder, checking if it's empty
   *  - Does not throw any error, but logs it instead
   *  - Returns true if the delete was successful
   */
  private static deleteFolderIfEmpty(folderPathname: string): boolean {
    try {
      const files = IModelJsFs.readdirSync(folderPathname);
      if (files.length > 0)
        return false;

      IModelJsFs.rmdirSync(folderPathname);
    } catch (error) {
      Logger.logError(loggerCategory, `Cannot delete folder: ${folderPathname}`);
      return false;
    }
    return true;
  }

  /** Deletes the contents of a folder, but not the folder itself
   *  - Does not throw any errors, but logs them.
   *  - returns true if the delete was successful.
   */
  private static deleteFolderContents(folderPathname: string): boolean {
    if (!IModelJsFs.existsSync(folderPathname))
      return false;

    let status = true;
    const files = IModelJsFs.readdirSync(folderPathname);
    for (const file of files) {
      const curPath = path.join(folderPathname, file);
      const locStatus = (IModelJsFs.lstatSync(curPath)!.isDirectory) ? BriefcaseManager.deleteFolderAndContents(curPath) : BriefcaseManager.deleteFile(curPath);
      if (!locStatus)
        status = false;
    }
    return status;
  }

  /** Deletes a folder and all it's contents.
   *  - Does not throw any errors, but logs them.
   *  - returns true if the delete was successful.
   */
  private static deleteFolderAndContents(folderPathname: string): boolean {
    if (!IModelJsFs.existsSync(folderPathname))
      return true;

    let status = false;
    status = BriefcaseManager.deleteFolderContents(folderPathname);
    if (!status)
      return false;

    status = BriefcaseManager.deleteFolderIfEmpty(folderPathname);
    return status;
  }

  /** Purges the in-memory and disk caches -
   * * Closes any open briefcases.
   * * Deletes all briefcases (ignores ones that are locked by other processes).
   * * Releases any deleted briefcases acquired from the hub (by the supplied user).
   * * Removes the iModelDirectory if the aren't any briefcases left.
   * @internal
   */
  public static async purgeCache(requestContext: AuthorizedClientRequestContext) {
    await this.purgeInMemoryCache(requestContext);
    await this.purgeDiskCache(requestContext);
  }

  private static purgeFixedVersionBriefcases(iModelId: GuidString): boolean {
    const fixedVersionPath = this.getBriefcaseSyncModePath(iModelId, SyncMode.FixedVersion);
    if (!IModelJsFs.existsSync(fixedVersionPath))
      return true;

    let status = true;
    for (const csetId of IModelJsFs.readdirSync(fixedVersionPath)) {
      const briefcaseDir = path.join(fixedVersionPath, csetId);
      try {
        this.deleteFolderAndContents(briefcaseDir);
      } catch (_error) {
        status = false;
        continue;
      }
    }

    if (status)
      this.deleteFolderAndContents(fixedVersionPath);

    return status;
  }

  private static async purgeVariableVersionBriefcases(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, syncMode: SyncMode): Promise<boolean> {
    const variableVersionPath = this.getBriefcaseSyncModePath(iModelId, syncMode);
    if (!IModelJsFs.existsSync(variableVersionPath))
      return true;

    // Delete all briefcases from the server
    for (const bIdString of IModelJsFs.readdirSync(variableVersionPath)) {
      const briefcaseId = +bIdString;
      try {
        await BriefcaseManager.imodelClient.briefcases.get(requestContext, iModelId, new BriefcaseQuery().byId(briefcaseId));
        requestContext.enter();
        await BriefcaseManager.imodelClient.briefcases.delete(requestContext, iModelId, briefcaseId);
        requestContext.enter();
      } catch (error) {
        // Best effort - it could well be that the iModel has been deleted
        continue;
      }
    }

    try {
      this.deleteFolderAndContents(variableVersionPath);
    } catch (error) {
      return false;
    }
    return true;
  }

  /** Purges the disk cache for a specific iModel starting with the briefcases.
   * Returns true if successful in deleting the entire folder, and false otherwise
   */
  private static async purgeDiskCacheForIModel(requestContext: AuthorizedClientRequestContext, iModelId: GuidString): Promise<boolean> {
    requestContext.enter();

    const deletedFixedVersionBriefcases = this.purgeFixedVersionBriefcases(iModelId);
    const deletedPullAndPushBriefcases = await this.purgeVariableVersionBriefcases(requestContext, iModelId, SyncMode.PullAndPush);
    requestContext.enter();
    const deletedPullOnlyBriefcases = await this.purgeVariableVersionBriefcases(requestContext, iModelId, SyncMode.PullOnly);
    requestContext.enter();
    if (!deletedFixedVersionBriefcases || !deletedPullAndPushBriefcases || !deletedPullOnlyBriefcases)
      return false; // Don't do additional deletes - the folders are being used

    const iModelPath = this.getIModelPath(iModelId);
    try {
      this.deleteFolderAndContents(iModelPath);
    } catch (error) {
      return false;
    }

    return true;
  }

  /** Purges the cached briefcase, changeset and other files on disk */
  private static async purgeDiskCache(requestContext: AuthorizedClientRequestContext): Promise<boolean> {
    let deletedAllCacheDirs = true;
    for (const iModelId of IModelJsFs.readdirSync(BriefcaseManager.cacheDir)) {
      const deleted = await this.purgeDiskCacheForIModel(requestContext, iModelId);
      if (!deleted)
        deletedAllCacheDirs = false;
    }
    if (deletedAllCacheDirs) {
      this.deleteFolderContents(this._cacheRootDir!);
    }
    return deletedAllCacheDirs;
  }

  /** Purge in-memory cache of briefcases */
  private static async purgeInMemoryCache(requestContext: AuthorizedClientRequestContext) {
    this.closeAllBriefcases();
    await this.deleteClosed(requestContext);
    requestContext.enter();
    this.clearCache();
  }

  /** Delete closed briefcases */
  private static async deleteClosed(requestContext: AuthorizedClientRequestContext) {
    requestContext.enter();
    const briefcases = this._cache.getFilteredBriefcases((briefcase: BriefcaseEntry) => !briefcase.isOpen);
    for (const briefcase of briefcases) {
      await this.deleteBriefcase(requestContext, briefcase);
      requestContext.enter();
    }
  }

  /** Find the existing briefcase
   * @internal
   */
  public static findBriefcaseByKey(key: BriefcaseKey): BriefcaseEntry | undefined {
    return this._cache.findBriefcaseByKey(key);
  }

  /** Close the briefcase */
  private static closeBriefcase(briefcase: BriefcaseEntry, raiseOnCloseEvent: boolean) {
    if (!briefcase.isOpen) {
      Logger.logTrace(loggerCategory, "Briefcase already closed", () => briefcase.getDebugInfo());
      return;
    }
    if (raiseOnCloseEvent)
      briefcase.onBeforeClose.raiseEvent();
    briefcase.nativeDb.closeIModel();
    briefcase.isOpen = false;
    Logger.logTrace(loggerCategory, "Closed briefcase ", () => briefcase.getDebugInfo());
  }

  private static async evaluateVersion(requestContext: AuthorizedClientRequestContext, version: IModelVersion, iModelId: string): Promise<{ changeSetId: string, changeSetIndex: number }> {
    requestContext.enter();

    const changeSetId: string = await version.evaluateChangeSet(requestContext, iModelId, BriefcaseManager.imodelClient);
    requestContext.enter();

    const changeSetIndex: number = await BriefcaseManager.getChangeSetIndexFromId(requestContext, iModelId, changeSetId);
    return { changeSetId, changeSetIndex };
  }

  /** Processes (merges, reverses, reinstates) change sets to get the briefcase to the specified target version.
   * Note: The briefcase must have been opened ReadWrite, and the method keeps it in the same state.
   */
  private static async processChangeSets(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry, targetChangeSetId: string, targetChangeSetIndex: number): Promise<void> {
    requestContext.enter();
    if (!briefcase.nativeDb || !briefcase.isOpen)
      return Promise.reject(new IModelError(ChangeSetStatus.ApplyError, "Briefcase must be open to process change sets", Logger.logError, loggerCategory, () => briefcase.getDebugInfo()));
    if (briefcase.openMode !== OpenMode.ReadWrite)
      return Promise.reject(new IModelError(ChangeSetStatus.ApplyError, "Briefcase must be open ReadWrite to process change sets", Logger.logError, loggerCategory, () => briefcase.getDebugInfo()));
    assert(briefcase.nativeDb.getParentChangeSetId() === briefcase.parentChangeSetId, "Mismatch between briefcase and the native Db");

    // Determine the reinstates, reversals or merges required
    let reverseToId: string | undefined, reinstateToId: string | undefined, mergeToId: string | undefined;
    let reverseToIndex: number | undefined, reinstateToIndex: number | undefined, mergeToIndex: number | undefined;
    if (briefcase.hasReversedChanges) {
      if (targetChangeSetIndex < briefcase.reversedChangeSetIndex!) {
        reverseToId = targetChangeSetId;
        reverseToIndex = targetChangeSetIndex;
      } else if (targetChangeSetIndex > briefcase.reversedChangeSetIndex!) {
        reinstateToId = targetChangeSetId;
        reinstateToIndex = targetChangeSetIndex;
        if (targetChangeSetIndex > briefcase.parentChangeSetIndex!) {
          reinstateToId = briefcase.parentChangeSetId;
          reinstateToIndex = briefcase.parentChangeSetIndex;
          mergeToId = targetChangeSetId;
          mergeToIndex = targetChangeSetIndex;
        }
      }
    } else {
      if (targetChangeSetIndex < briefcase.parentChangeSetIndex!) {
        reverseToId = targetChangeSetId;
        reverseToIndex = targetChangeSetIndex;
      } else if (targetChangeSetIndex > briefcase.parentChangeSetIndex!) {
        mergeToId = targetChangeSetId;
        mergeToIndex = targetChangeSetIndex;
      }
    }
    if (typeof reverseToId === "undefined" && typeof reinstateToId === "undefined" && typeof mergeToId === "undefined")
      return;

    // Reverse, reinstate and merge as necessary
    const perfLogger = new PerfLogger("Processing change sets", () => ({ ...briefcase.getDebugInfo(), targetChangeSetId, targetChangeSetIndex }));
    try {
      if (typeof reverseToId !== "undefined") {
        Logger.logTrace(loggerCategory, "Started reversing changes to the briefcase", () => ({ reverseToId, ...briefcase.getDebugInfo() }));
        await BriefcaseManager.applyChangeSets(requestContext, briefcase, reverseToId, reverseToIndex!, ChangeSetApplyOption.Reverse);
        requestContext.enter();
        Logger.logTrace(loggerCategory, "Finished reversing changes to the briefcase", () => ({ reverseToId, ...briefcase.getDebugInfo() }));
      }
      if (typeof reinstateToId !== "undefined") {
        Logger.logTrace(loggerCategory, "Started reinstating changes to the briefcase", () => ({ reinstateToId, ...briefcase.getDebugInfo() }));
        await BriefcaseManager.applyChangeSets(requestContext, briefcase, reinstateToId, reinstateToIndex!, ChangeSetApplyOption.Reinstate);
        requestContext.enter();
        Logger.logTrace(loggerCategory, "Finished reinstating changes to the briefcase", () => ({ reinstateToId, ...briefcase.getDebugInfo() }));
      }
      if (typeof mergeToId !== "undefined") {
        Logger.logTrace(loggerCategory, "Started merging changes to the briefcase", () => ({ mergeToId, ...briefcase.getDebugInfo() }));
        await BriefcaseManager.applyChangeSets(requestContext, briefcase, mergeToId, mergeToIndex!, ChangeSetApplyOption.Merge);
        requestContext.enter();
        Logger.logTrace(loggerCategory, "Finished merging changes to the briefcase", () => ({ mergeToId, ...briefcase.getDebugInfo() }));
      }
    } finally {
      perfLogger.dispose();

      // Setup all change set ids and indexes
      briefcase.parentChangeSetId = briefcase.nativeDb.getParentChangeSetId();
      briefcase.reversedChangeSetId = briefcase.nativeDb.getReversedChangeSetId();
      await this.initBriefcaseChangeSetIndexes(requestContext, briefcase);
      requestContext.enter();
    }
  }

  private static async applyChangeSets(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry, targetChangeSetId: string, targetChangeSetIndex: number, processOption: ChangeSetApplyOption): Promise<void> {
    requestContext.enter();

    const currentChangeSetId: string = briefcase.currentChangeSetId;
    const currentChangeSetIndex: number = briefcase.currentChangeSetIndex;
    if (targetChangeSetIndex === currentChangeSetIndex)
      return Promise.resolve(); // nothing to apply

    // Download change sets
    const reverse: boolean = (targetChangeSetIndex < currentChangeSetIndex);
    let perfLogger = new PerfLogger("Processing change sets - downloading change sets", () => ({ ...briefcase.getDebugInfo(), targetChangeSetId, targetChangeSetIndex }));
    const backupDownloadStatus = briefcase.downloadStatus;
    briefcase.downloadStatus = DownloadBriefcaseStatus.DownloadingChangeSets;
    const changeSets: ChangeSet[] = await BriefcaseManager.downloadChangeSets(requestContext, briefcase.iModelId, reverse ? targetChangeSetId : currentChangeSetId, reverse ? currentChangeSetId : targetChangeSetId);
    requestContext.enter();
    perfLogger.dispose();
    assert(changeSets.length <= Math.abs(targetChangeSetIndex - currentChangeSetIndex));
    if (reverse)
      changeSets.reverse();
    briefcase.downloadStatus = backupDownloadStatus;

    // Gather the changeset tokens
    const changeSetTokens = new Array<ChangeSetToken>();
    const changeSetsPath = BriefcaseManager.getChangeSetsPath(briefcase.iModelId);
    let maxFileSize: number = 0;
    let containsSchemaChanges: boolean = false;
    changeSets.forEach((changeSet: ChangeSet) => {
      const changeSetPathname = path.join(changeSetsPath, changeSet.fileName!);
      assert(IModelJsFs.existsSync(changeSetPathname), `Change set file ${changeSetPathname} does not exist`);
      const changeSetToken = new ChangeSetToken(changeSet.wsgId, changeSet.parentId!, +changeSet.index!, changeSetPathname, changeSet.changesType!);
      changeSetTokens.push(changeSetToken);
      if (+changeSet.fileSize! > maxFileSize)
        maxFileSize = +changeSet.fileSize!;
      if (changeSet.changesType === ChangesType.Schema)
        containsSchemaChanges = true;
    });

    /* Apply change sets
     * If any of the change sets contain schema changes, or are otherwise too large, we process them asynchronously
     * to avoid blocking the main-thread/event-loop and keep the backend responsive. However, this will be an invasive
     * operation that will force the Db to be closed and reopened.
     * If the change sets are processed synchronously, they are applied one-by-one to avoid blocking the main
     * thread and the event loop. Even so, if any single change set too long to process that will again cause the
     * cause the event loop to be blocked. Also if any of the change sets contain schema changes, that will cause
     * the Db to be closed and reopened.
     */
    perfLogger = new PerfLogger("Processing change sets - applying change sets", () => ({ ...briefcase.getDebugInfo() }));
    briefcase.downloadStatus = DownloadBriefcaseStatus.ApplyingChangeSets;
    let status: ChangeSetStatus;
    if (containsSchemaChanges || maxFileSize > 1024 * 1024) {
      status = await this.applyChangeSetsToNativeDbAsync(requestContext, briefcase, changeSetTokens, processOption);
      requestContext.enter();
    } else {
      status = await this.applyChangeSetsToNativeDbSync(briefcase, changeSetTokens, processOption);
    }
    perfLogger.dispose();

    if (ChangeSetStatus.Success !== status)
      throw new IModelError(status, "Error applying changesets", Logger.logError, loggerCategory, () => ({ ...briefcase.getDebugInfo(), targetChangeSetId, targetChangeSetIndex }));
    briefcase.onChangesetApplied.raiseEvent();
    briefcase.downloadStatus = backupDownloadStatus;
  }

  /** Apply change sets synchronously
   * - change sets are applied one-by-one to avoid blocking the main thread
   * - must NOT be called if some of the change sets are too large since that will also block the main thread and leave the backend unresponsive
   * - may cause the Db to close and reopen *if* the change sets contain schema changes
   */
  private static async applyChangeSetsToNativeDbSync(briefcase: BriefcaseEntry, changeSetTokens: ChangeSetToken[], processOption: ChangeSetApplyOption): Promise<ChangeSetStatus> {
    // Apply the changes (one by one to avoid blocking the event loop)
    for (const changeSetToken of changeSetTokens) {
      const tempChangeSetTokens = new Array<ChangeSetToken>(changeSetToken);
      const status = IModelHost.platform.ApplyChangeSetsRequest.doApplySync(briefcase.nativeDb, JSON.stringify(tempChangeSetTokens), processOption);
      if (ChangeSetStatus.Success !== status)
        return status;
      await BeDuration.wait(0); // Just turns this operation asynchronous to avoid blocking the event loop
    }
    return ChangeSetStatus.Success;
  }

  /** Apply change sets asynchronously
   * - invasive operation that closes/reopens the Db
   * - must be called if some of the change sets are too large and the synchronous call will leave the backend unresponsive
   */
  private static async applyChangeSetsToNativeDbAsync(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry, changeSetTokens: ChangeSetToken[], processOption: ChangeSetApplyOption): Promise<ChangeSetStatus> {
    requestContext.enter();

    const applyRequest = new IModelHost.platform.ApplyChangeSetsRequest(briefcase.nativeDb);

    let status: ChangeSetStatus = applyRequest.readChangeSets(JSON.stringify(changeSetTokens));
    if (status !== ChangeSetStatus.Success)
      return status;

    briefcase.onBeforeClose.raiseEvent();
    applyRequest.closeBriefcase();

    const doApply = new Promise<ChangeSetStatus>((resolve, _reject) => {
      applyRequest.doApplyAsync(resolve, processOption);
    });
    status = await doApply;
    requestContext.enter();

    briefcase.onBeforeOpen.raiseEvent(requestContext);
    const result = applyRequest.reopenBriefcase(briefcase.openMode);
    if (result !== DbResult.BE_SQLITE_OK)
      status = ChangeSetStatus.ApplyError;
    else
      briefcase.onAfterOpen.raiseEvent(requestContext);

    return status;
  }

  /** @internal */
  public static async reverseChanges(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry, reverseToVersion: IModelVersion): Promise<void> {
    requestContext.enter();
    if (briefcase.openMode === OpenMode.Readonly)
      throw new IModelError(ChangeSetStatus.ApplyError, "Cannot reverse changes in a ReadOnly briefcase", Logger.logError, loggerCategory, () => briefcase.getDebugInfo());

    const { changeSetId: targetChangeSetId, changeSetIndex: targetChangeSetIndex } = await BriefcaseManager.evaluateVersion(requestContext, reverseToVersion, briefcase.iModelId);
    requestContext.enter();
    if (targetChangeSetIndex > briefcase.currentChangeSetIndex)
      throw new IModelError(ChangeSetStatus.ApplyError, "Cannot reverse to a later version", Logger.logError, loggerCategory, () => ({ ...briefcase.getDebugInfo(), targetChangeSetId, targetChangeSetIndex }));

    return BriefcaseManager.processChangeSets(requestContext, briefcase, targetChangeSetId, targetChangeSetIndex);
  }

  /** @internal */
  public static async reinstateChanges(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry, reinstateToVersion?: IModelVersion): Promise<void> {
    requestContext.enter();
    if (briefcase.openMode === OpenMode.Readonly)
      throw new IModelError(ChangeSetStatus.ApplyError, "Cannot reinstate (or reverse) changes in a ReadOnly briefcase", Logger.logError, loggerCategory, () => briefcase.getDebugInfo());

    const targetVersion: IModelVersion = reinstateToVersion || IModelVersion.asOfChangeSet(briefcase.parentChangeSetId);

    const { changeSetId: targetChangeSetId, changeSetIndex: targetChangeSetIndex } = await BriefcaseManager.evaluateVersion(requestContext, targetVersion, briefcase.iModelId);
    requestContext.enter();
    if (targetChangeSetIndex < briefcase.currentChangeSetIndex)
      return Promise.reject(new IModelError(ChangeSetStatus.ApplyError, "Can reinstate only to a later version", Logger.logError, loggerCategory, () => ({ ...briefcase.getDebugInfo(), targetChangeSetId, targetChangeSetIndex })));

    return BriefcaseManager.processChangeSets(requestContext, briefcase, targetChangeSetId, targetChangeSetIndex);
  }

  /** Pull and merge changes from the hub
   * @param requestContext The client request context
   * @param briefcase Local briefcase
   * @param mergeToVersion Version of the iModel to merge until.
   * @internal
   */
  public static async pullAndMergeChanges(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry, mergeToVersion: IModelVersion = IModelVersion.latest()): Promise<void> {
    requestContext.enter();

    const { changeSetId: targetChangeSetId, changeSetIndex: targetChangeSetIndex } = await BriefcaseManager.evaluateVersion(requestContext, mergeToVersion, briefcase.iModelId);
    requestContext.enter();
    if (targetChangeSetIndex < briefcase.currentChangeSetIndex)
      return Promise.reject(new IModelError(ChangeSetStatus.NothingToMerge, "Nothing to merge", Logger.logError, loggerCategory, () => ({ ...briefcase.getDebugInfo(), targetChangeSetId, targetChangeSetIndex })));

    await BriefcaseManager.updatePendingChangeSets(requestContext, briefcase);
    requestContext.enter();

    return BriefcaseManager.processChangeSets(requestContext, briefcase, targetChangeSetId, targetChangeSetIndex);
  }

  private static startCreateChangeSet(briefcase: BriefcaseEntry): ChangeSetToken {
    const res: IModelJsNative.ErrorStatusOrResult<ChangeSetStatus, string> = briefcase.nativeDb!.startCreateChangeSet();
    if (res.error)
      throw new IModelError(res.error.status, "Error in startCreateChangeSet", Logger.logError, loggerCategory, () => briefcase.getDebugInfo());
    return JSON.parse(res.result!);
  }

  private static finishCreateChangeSet(briefcase: BriefcaseEntry) {
    const status = briefcase.nativeDb!.finishCreateChangeSet();
    if (ChangeSetStatus.Success !== status)
      throw new IModelError(status, "Error in finishCreateChangeSet", Logger.logError, loggerCategory, () => briefcase.getDebugInfo());
  }

  private static abandonCreateChangeSet(briefcase: BriefcaseEntry) {
    briefcase.nativeDb!.abandonCreateChangeSet();
  }

  /** Get array of pending ChangeSet ids that need to have their codes updated */
  private static getPendingChangeSets(briefcase: BriefcaseEntry): string[] {
    const res: IModelJsNative.ErrorStatusOrResult<DbResult, string> = briefcase.nativeDb!.getPendingChangeSets();
    if (res.error)
      throw new IModelError(res.error.status, "Error in getPendingChangeSets", Logger.logWarning, loggerCategory, () => briefcase.getDebugInfo());
    return JSON.parse(res.result!) as string[];
  }

  /** Add a pending ChangeSet before updating its codes */
  private static addPendingChangeSet(briefcase: BriefcaseEntry, changeSetId: string): void {
    const result = briefcase.nativeDb!.addPendingChangeSet(changeSetId);
    if (DbResult.BE_SQLITE_OK !== result)
      throw new IModelError(result, "Error in addPendingChangeSet", Logger.logError, loggerCategory, () => briefcase.getDebugInfo());
  }

  /** Remove a pending ChangeSet after its codes have been updated */
  private static removePendingChangeSet(briefcase: BriefcaseEntry, changeSetId: string): void {
    const result = briefcase.nativeDb!.removePendingChangeSet(changeSetId);
    if (DbResult.BE_SQLITE_OK !== result)
      throw new IModelError(result, "Error in removePendingChangeSet", Logger.logError, loggerCategory, () => briefcase.getDebugInfo());
  }

  /** Update codes for all pending ChangeSets */
  private static async updatePendingChangeSets(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry): Promise<void> {
    requestContext.enter();

    let pendingChangeSets = BriefcaseManager.getPendingChangeSets(briefcase);
    if (pendingChangeSets.length === 0)
      return;

    pendingChangeSets = pendingChangeSets.slice(0, 100);

    const query = new ChangeSetQuery().filter(`$id+in+[${pendingChangeSets.map((value: string) => `'${value}'`).join(",")}]`).selectDownloadUrl();
    const changeSets = await BriefcaseManager.downloadChangeSetsInternal(requestContext, briefcase.iModelId, query);
    requestContext.enter();

    const changeSetsPath = BriefcaseManager.getChangeSetsPath(briefcase.iModelId);

    for (const changeSet of changeSets) {
      const changeSetPathname = path.join(changeSetsPath, changeSet.fileName!);
      const token = new ChangeSetToken(changeSet.wsgId, changeSet.parentId!, +changeSet.index!, changeSetPathname, changeSet.changesType!);
      try {
        const codes = BriefcaseManager.extractCodesFromFile(briefcase, [token]);
        await BriefcaseManager.imodelClient.codes.update(requestContext, briefcase.iModelId, codes, { deniedCodes: true, continueOnConflict: true });
        requestContext.enter();
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
  private static parseCodesFromJson(briefcase: BriefcaseEntry, json: string): HubCode[] {
    return JSON.parse(json, (key: any, value: any) => {
      if (key === "state") {
        return (value as number);
      }
      // If the key is a number, it is an array member.
      if (!Number.isNaN(Number.parseInt(key, 10))) {
        const code = new HubCode();
        Object.assign(code, value);
        code.codeSpecId = Id64.fromJSON(value.codeSpecId);
        code.briefcaseId = briefcase.briefcaseId;
        return code;
      }
      return value;
    }) as HubCode[];
  }

  /** Extracts codes from current ChangeSet */
  private static extractCodes(briefcase: BriefcaseEntry): HubCode[] {
    const res: IModelJsNative.ErrorStatusOrResult<DbResult, string> = briefcase.nativeDb!.extractCodes();
    if (res.error)
      throw new IModelError(res.error.status, "Error in extractCodes", Logger.logError, loggerCategory, () => briefcase.getDebugInfo());
    return BriefcaseManager.parseCodesFromJson(briefcase, res.result!);
  }

  /** Extracts codes from ChangeSet file */
  private static extractCodesFromFile(briefcase: BriefcaseEntry, changeSetTokens: ChangeSetToken[]): HubCode[] {
    const res: IModelJsNative.ErrorStatusOrResult<DbResult, string> = briefcase.nativeDb!.extractCodesFromFile(JSON.stringify(changeSetTokens));
    if (res.error)
      throw new IModelError(res.error.status, "Error in extractCodesFromFile", Logger.logError, loggerCategory, () => briefcase.getDebugInfo());
    return BriefcaseManager.parseCodesFromJson(briefcase, res.result!);
  }

  /** Attempt to update codes without rejecting so pull wouldn't fail */
  private static async tryUpdatingCodes(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry, changeSet: ChangeSet, relinquishCodesLocks: boolean): Promise<void> {
    requestContext.enter();

    // Add ChangeSet id, in case updating failed due to something else than conflicts
    BriefcaseManager.addPendingChangeSet(briefcase, changeSet.id!);

    let failedUpdating = false;
    try {
      await BriefcaseManager.imodelClient.codes.update(requestContext, briefcase.iModelId, BriefcaseManager.extractCodes(briefcase), { deniedCodes: true, continueOnConflict: true });
      requestContext.enter();
    } catch (error) {
      requestContext.enter();
      if (error instanceof ConflictingCodesError) {
        Logger.logError(loggerCategory, "Found conflicting codes when pushing briefcase changes", () => briefcase.getDebugInfo());
        briefcase.conflictError = error;
      } else {
        failedUpdating = true;
      }
    }

    // Cannot retry relinquishing later, ignore error
    try {
      if (relinquishCodesLocks) {
        await BriefcaseManager.imodelClient.codes.deleteAll(requestContext, briefcase.iModelId, briefcase.briefcaseId);
        requestContext.enter();

        await BriefcaseManager.imodelClient.locks.deleteAll(requestContext, briefcase.iModelId, briefcase.briefcaseId);
        requestContext.enter();
      }
    } catch (error) {
      requestContext.enter();
      Logger.logError(loggerCategory, `Relinquishing codes or locks has failed with: ${error}`, () => briefcase.getDebugInfo());
    }

    // Remove ChangeSet id if it succeeded or failed with conflicts
    if (!failedUpdating)
      BriefcaseManager.removePendingChangeSet(briefcase, changeSet.id!);
  }

  /** Attempt to push a ChangeSet to iModelHub */
  private static async pushChangeSet(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry, description: string, changeType: ChangesType, relinquishCodesLocks: boolean): Promise<void> {
    requestContext.enter();
    if (briefcase.syncMode !== SyncMode.PullAndPush)
      throw new IModelError(BentleyStatus.ERROR, "Invalid to call pushChanges when the briefcase was not opened with SyncMode = PullAndPush", Logger.logError, loggerCategory, () => briefcase.getDebugInfo());

    const changeSetToken: ChangeSetToken = BriefcaseManager.startCreateChangeSet(briefcase);
    const changeSet = new ChangeSet();
    changeSet.briefcaseId = briefcase.briefcaseId;
    changeSet.id = changeSetToken.id;
    changeSet.parentId = changeSetToken.parentId;
    changeSet.changesType = changeSetToken.changeType === ChangesType.Schema ? ChangesType.Schema : changeType;
    changeSet.seedFileId = briefcase.fileId!;
    changeSet.fileSize = IModelJsFs.lstatSync(changeSetToken.pathname)!.size.toString();
    changeSet.description = description;
    if (changeSet.description.length >= 255) {
      Logger.logWarning(loggerCategory, "pushChanges - Truncating description to 255 characters. " + changeSet.description, () => briefcase.getDebugInfo());
      changeSet.description = changeSet.description.slice(0, 254);
    }

    let postedChangeSet: ChangeSet | undefined;
    try {
      postedChangeSet = await BriefcaseManager.imodelClient.changeSets.create(requestContext, briefcase.iModelId, changeSet, changeSetToken.pathname);
      requestContext.enter();
    } catch (error) {
      requestContext.enter();
      // If ChangeSet already exists, updating codes and locks might have timed out.
      if (!(error instanceof IModelHubError) || error.errorNumber !== IModelHubStatus.ChangeSetAlreadyExists) {
        return Promise.reject(error);
      }
    }

    await BriefcaseManager.tryUpdatingCodes(requestContext, briefcase, changeSet, relinquishCodesLocks);
    requestContext.enter();

    BriefcaseManager.finishCreateChangeSet(briefcase);

    const oldKey = briefcase.getKey();
    briefcase.parentChangeSetId = postedChangeSet!.wsgId;
    briefcase.parentChangeSetIndex = +postedChangeSet!.index!;

    // Update cache if necessary
    if (BriefcaseManager._cache.findBriefcaseByKey(oldKey)) {
      BriefcaseManager._cache.deleteBriefcaseByKey(oldKey);
      BriefcaseManager._cache.addBriefcase(briefcase);
    }
  }

  /** Attempt to pull merge and push once */
  private static async pushChangesOnce(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry, description: string, changeType: ChangesType, relinquishCodesLocks: boolean): Promise<void> {
    await BriefcaseManager.pullAndMergeChanges(requestContext, briefcase, IModelVersion.latest());
    requestContext.enter();

    try {
      await BriefcaseManager.pushChangeSet(requestContext, briefcase, description, changeType, relinquishCodesLocks);
      requestContext.enter();
    } catch (err) {
      requestContext.enter();
      BriefcaseManager.abandonCreateChangeSet(briefcase);
      return Promise.reject(err);
    }
  }

  /** Return true if should attempt pushing again. */
  private static shouldRetryPush(error: any): boolean {
    if (error instanceof IModelHubError && error.errorNumber) {
      switch (error.errorNumber!) {
        case IModelHubStatus.AnotherUserPushing:
        case IModelHubStatus.PullIsRequired:
        case IModelHubStatus.DatabaseTemporarilyLocked:
        case IModelHubStatus.OperationFailed:
          return true;
      }
    }
    return false;
  }

  /** Push local changes to the hub
   * @param requestContext The client request context
   * @param briefcase Identifies the IModelDb that contains the pending changes.
   * @param description a description of the changeset that is to be pushed.
   * @param relinquishCodesLocks release locks held and codes reserved (but not used) after pushing?
   * @internal
   */
  public static async pushChanges(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseEntry, description: string, changeType: ChangesType = ChangesType.Regular, relinquishCodesLocks: boolean = true): Promise<void> {
    requestContext.enter();
    for (let i = 0; i < 5; ++i) {
      let pushed = false;
      let error: any;
      try {
        await BriefcaseManager.pushChangesOnce(requestContext, briefcase, description, changeType, relinquishCodesLocks);
        requestContext.enter();
        pushed = true;
      } catch (err) {
        requestContext.enter();
        error = err;
      }
      if (pushed)
        return;

      if (!BriefcaseManager.shouldRetryPush(error)) {
        return Promise.reject(error);
      }
      const delay = Math.floor(Math.random() * 4800) + 200;
      await new Promise((resolve: any) => setTimeout(resolve, delay));
    }
  }

  private static isUsingIModelBankClient(): boolean {
    return (this.imodelClient === undefined) || (this._imodelClient instanceof IModelBankClient);
  }

  /** Create an iModel on iModelHub
   * @beta
   */
  public static async create(requestContext: AuthorizedClientRequestContext, contextId: GuidString, iModelName: GuidString, args: CreateIModelProps): Promise<GuidString> {
    requestContext.enter();
    if (this.isUsingIModelBankClient()) {
      throw new IModelError(IModelStatus.BadRequest, "Cannot create an iModel in iModelBank. This is a iModelHub only operation", Logger.logError, loggerCategory, () => ({ contextId, iModelName }));
    }
    const hubIModel: HubIModel = await BriefcaseManager.imodelClient.iModels.create(requestContext, contextId, iModelName, { description: args.rootSubject.description });
    return hubIModel.wsgId;
  }

  /** @internal */
  // TODO: This should take contextId as an argument, so that we know which server (iModelHub or iModelBank) to use.
  public static async deleteAllBriefcases(requestContext: AuthorizedClientRequestContext, iModelId: GuidString) {
    requestContext.enter();
    if (BriefcaseManager.imodelClient === undefined)
      return;

    const promises = new Array<Promise<void>>();
    const briefcases = await BriefcaseManager.imodelClient.briefcases.get(requestContext, iModelId);
    requestContext.enter();

    briefcases.forEach((briefcase: HubBriefcase) => {
      promises.push(BriefcaseManager.imodelClient.briefcases.delete(requestContext, iModelId, briefcase.briefcaseId!).then(() => {
        requestContext.enter();
      }));
    });
    return Promise.all(promises);
  }
}
