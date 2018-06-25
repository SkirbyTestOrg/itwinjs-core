/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Errors */

import { DbResult } from "./BeSQLite";
import { LogFunction } from "./Logger";

/** Standard status code.
 * This status code should be rarely used.
 * Prefer to throw an exception to indicate an error, rather than returning a special status code.
 * If a status code is to be returned, prefer to return a more specific error status type such as IModelStatus or DbResult.
 */
export const enum BentleyStatus {
  SUCCESS = 0x0000,
  ERROR = 0x8000,
}

/** Status codes that are used in conjunction with [[BentleyError]].
 * Error status codes are divided into separate ranges for different kinds of errors. All known ranges at least should be defined here, to avoid collisions.
 */
export const enum IModelStatus { // NOTE: values must be kept in sync with DgnDbStatus and DbResult on the DgnPlatform C++ side
  IMODEL_ERROR_BASE = 0x10000,
  Success = 0,
  AlreadyLoaded = IMODEL_ERROR_BASE + 1,
  AlreadyOpen = IMODEL_ERROR_BASE + 2,
  BadArg = IMODEL_ERROR_BASE + 3,
  BadElement = IMODEL_ERROR_BASE + 4,
  BadModel = IMODEL_ERROR_BASE + 5,
  BadRequest = IMODEL_ERROR_BASE + 6,
  BadSchema = IMODEL_ERROR_BASE + 7,
  CannotUndo = IMODEL_ERROR_BASE + 8,
  CodeNotReserved = IMODEL_ERROR_BASE + 9,
  DeletionProhibited = IMODEL_ERROR_BASE + 10,
  DuplicateCode = IMODEL_ERROR_BASE + 11,
  DuplicateName = IMODEL_ERROR_BASE + 12,
  ElementBlockedChange = IMODEL_ERROR_BASE + 13,
  FileAlreadyExists = IMODEL_ERROR_BASE + 14,
  FileNotFound = IMODEL_ERROR_BASE + 15,
  FileNotLoaded = IMODEL_ERROR_BASE + 16,
  ForeignKeyConstraint = IMODEL_ERROR_BASE + 17,
  IdExists = IMODEL_ERROR_BASE + 18,
  InDynamicTransaction = IMODEL_ERROR_BASE + 19,
  InvalidCategory = IMODEL_ERROR_BASE + 20,
  InvalidCode = IMODEL_ERROR_BASE + 21,
  InvalidCodeSpec = IMODEL_ERROR_BASE + 22,
  InvalidId = IMODEL_ERROR_BASE + 23,
  InvalidName = IMODEL_ERROR_BASE + 24,
  InvalidParent = IMODEL_ERROR_BASE + 25,
  InvalidProfileVersion = IMODEL_ERROR_BASE + 26,
  IsCreatingChangeSet = IMODEL_ERROR_BASE + 27,
  LockNotHeld = IMODEL_ERROR_BASE + 28,
  Mismatch2d3d = IMODEL_ERROR_BASE + 29,
  MismatchGcs = IMODEL_ERROR_BASE + 30,  // The Geographic Coordinate Systems of the source and target are not based on equivalent projections
  MissingDomain = IMODEL_ERROR_BASE + 31,
  MissingHandler = IMODEL_ERROR_BASE + 32,
  MissingId = IMODEL_ERROR_BASE + 33,
  NoGeometry = IMODEL_ERROR_BASE + 34,
  NoMultiTxnOperation = IMODEL_ERROR_BASE + 35,
  NotDgnMarkupProject = IMODEL_ERROR_BASE + 36,
  NotEnabled = IMODEL_ERROR_BASE + 37,
  NotFound = IMODEL_ERROR_BASE + 38,
  NotOpen = IMODEL_ERROR_BASE + 39,
  NotOpenForWrite = IMODEL_ERROR_BASE + 40,
  NotSameUnitBase = IMODEL_ERROR_BASE + 41,
  NothingToRedo = IMODEL_ERROR_BASE + 42,
  NothingToUndo = IMODEL_ERROR_BASE + 43,
  ParentBlockedChange = IMODEL_ERROR_BASE + 44,
  ReadError = IMODEL_ERROR_BASE + 45,
  ReadOnly = IMODEL_ERROR_BASE + 46,
  ReadOnlyDomain = IMODEL_ERROR_BASE + 47,
  RepositoryManagerError = IMODEL_ERROR_BASE + 48,
  SQLiteError = IMODEL_ERROR_BASE + 49,
  TransactionActive = IMODEL_ERROR_BASE + 50,
  UnitsMissing = IMODEL_ERROR_BASE + 51,
  UnknownFormat = IMODEL_ERROR_BASE + 52,
  UpgradeFailed = IMODEL_ERROR_BASE + 53,
  ValidationFailed = IMODEL_ERROR_BASE + 54,
  VersionTooNew = IMODEL_ERROR_BASE + 55,
  VersionTooOld = IMODEL_ERROR_BASE + 56,
  ViewNotFound = IMODEL_ERROR_BASE + 57,
  WriteError = IMODEL_ERROR_BASE + 58,
  WrongClass = IMODEL_ERROR_BASE + 59,
  WrongIModel = IMODEL_ERROR_BASE + 60,
  WrongDomain = IMODEL_ERROR_BASE + 61,
  WrongElement = IMODEL_ERROR_BASE + 62,
  WrongHandler = IMODEL_ERROR_BASE + 63,
  WrongModel = IMODEL_ERROR_BASE + 64,
  ConstraintNotUnique = IMODEL_ERROR_BASE + 65,
  NoGeoLocation = IMODEL_ERROR_BASE + 66,
}

/** Error status from various briefcase operations */
export const enum BriefcaseStatus {
  CannotAcquire = 0x20000,
  CannotDownload = 0x20001,
  CannotUpload = 0x20002,
  CannotCopy = 0x20003,
  CannotDelete = 0x20004,
  VersionNotFound = 0x20005,
  CannotApplyChanges = 0x20006,
}

/** Error status from various ChangeSet operations */
export const enum ChangeSetStatus { // Note: Values must be kept in sync with ChangeSetStatus in DgnPlatform
  Success = 0,
  CHANGESET_ERROR_BASE = 0x16000,
  ApplyError = CHANGESET_ERROR_BASE + 1,                /** Error applying a change set when reversing or reinstating it */
  ChangeTrackingNotEnabled = CHANGESET_ERROR_BASE + 2,  /** Change tracking has not been enabled. The ChangeSet API mandates this. */
  CorruptedChangeStream = CHANGESET_ERROR_BASE + 3,     /** Contents of the change stream are corrupted and does not match the ChangeSet */
  FileNotFound = CHANGESET_ERROR_BASE + 4,              /** File containing the changes to the change set is not found */
  FileWriteError = CHANGESET_ERROR_BASE + 5,            /** Error writing the contents of the change set to the backing change stream file */
  HasLocalChanges = CHANGESET_ERROR_BASE + 6,           /**  Cannot perform the operation since the Db has local changes */
  HasUncommittedChanges = CHANGESET_ERROR_BASE + 7,     /**  Cannot perform the operation since current transaction has uncommitted changes */
  InvalidId = CHANGESET_ERROR_BASE + 8,                 /**  Invalid ChangeSet Id */
  InvalidVersion = CHANGESET_ERROR_BASE + 9,            /**  Invalid version of the change set */
  InDynamicTransaction = CHANGESET_ERROR_BASE + 10,     /** Cannot perform the operation since system is in the middle of a dynamic transaction */
  IsCreatingChangeSet = CHANGESET_ERROR_BASE + 11,      /** Cannot perform operation since system is in the middle of a creating a change set */
  IsNotCreatingChangeSet = CHANGESET_ERROR_BASE + 12,   /** Cannot perform operation since the system is not creating a change set */
  MergePropagationError = CHANGESET_ERROR_BASE + 13,    /** Error propagating the changes after the merge */
  NothingToMerge = CHANGESET_ERROR_BASE + 14,           /** No change sets to merge */
  NoTransactions = CHANGESET_ERROR_BASE + 15,           /** No transactions are available to create a change set */
  ParentMismatch = CHANGESET_ERROR_BASE + 16,           /** Parent change set of the Db does not match the parent id of the change set */
  SQLiteError = CHANGESET_ERROR_BASE + 17,              /** Error performing a SQLite operation on the Db */
  WrongDgnDb = CHANGESET_ERROR_BASE + 18,               /** ChangeSet originated in a different Db */
  CouldNotOpenDgnDb = CHANGESET_ERROR_BASE + 19,        /** Could not open the DgnDb to merge change set */
  MergeSchemaChangesOnOpen = CHANGESET_ERROR_BASE + 20, /** Cannot merge changes in in an open DgnDb. Close the DgnDb, and process the operation when it is opened. */
  ReverseOrReinstateSchemaChangesOnOpen = CHANGESET_ERROR_BASE + 21,  /** Cannot reverse or reinstate schema changes in an open DgnDb. Close the DgnDb, and process the operation when it is opened. */
  ProcessSchemaChangesOnOpen = CHANGESET_ERROR_BASE + 22,             /** Cannot process changes schema changes in an open DgnDb. Close the DgnDb, and process the operation when it is opened. */
  CannotMergeIntoReadonly = CHANGESET_ERROR_BASE + 23,                /** Cannot merge changes into a Readonly DgnDb. */
  CannotMergeIntoMaster = CHANGESET_ERROR_BASE + 24,                  /**  Cannot merge changes into a Master DgnDb. */
  CannotMergeIntoReversed = CHANGESET_ERROR_BASE + 25,                /** Cannot merge changes into a DgnDb that has reversed change sets. */
}

/** Return codes for methods which perform repository management operations */
export const enum RepositoryStatus {
  Success = 0,
  ServerUnavailable = 0x15001, /**  The repository server did not respond to a request */
  LockAlreadyHeld = 0x15002, /**  A requested lock was already held by another briefcase */
  SyncError = 0x15003, /**  Failed to sync briefcase manager with server */
  InvalidResponse = 0x15004, /**  Response from server not understood */
  PendingTransactions = 0x15005, /**  An operation requires local changes to be committed or abandoned */
  LockUsed = 0x15006, /**  A lock cannot be relinquished because the associated object has been modified */
  CannotCreateChangeSet = 0x15007, /**  An operation required creation of a ChangeSet, which failed */
  InvalidRequest = 0x15008, /**  Request to server not understood */
  ChangeSetRequired = 0x15009, /**  A change set committed to the server must be integrated into the briefcase before the operation can be completed */
  CodeUnavailable = 0x1500A, /**  A requested DgnCode is reserved by another briefcase or in use */
  CodeNotReserved = 0x1500B, /**  A DgnCode cannot be released because it has not been reserved by the requesting briefcase */
  CodeUsed = 0x1500C, /**  A DgnCode cannot be relinquished because it has been used locally */
  LockNotHeld = 0x1500D, /**  A required lock is not held by this briefcase */
  RepositoryIsLocked = 0x1500E, /**  Repository is currently locked, no changes allowed */
}

/** Status from returned HTTP status code */
export const enum HttpStatus {
  Success = 0, /** 2xx Success */
  Info = 0x17001, /** 1xx Informational responses */
  Redirection = 0x17002, /** 3xx Redirection */
  ClientError = 0x17003, /** 4xx Client errors */
  ServerError = 0x17004, /** 5xx Server errors */
}

/** Server returned WSG errors */
export const enum WSStatus {
  Sucess = 0,
  WSERROR_BASE = 0x18000,

  Unknown = WSERROR_BASE + 1, /** Unknown error */
  LoginFailed = WSERROR_BASE + 2, /** Login Failed */
  SslRequired = WSERROR_BASE + 3, /** SSL required */
  NotEnoughRights = WSERROR_BASE + 4, /** Not enough rights */
  RepositoryNotFound = WSERROR_BASE + 5, /** Repository not found */
  SchemaNotFound = WSERROR_BASE + 6, /** Schema not found */
  ClassNotFound = WSERROR_BASE + 7, /** Class not found */
  PropertyNotFound = WSERROR_BASE + 8, /** Property not found */
  InstanceNotFound = WSERROR_BASE + 9, /** Instance not found */
  FileNotFound = WSERROR_BASE + 10, /** File not found */
  NotSupported = WSERROR_BASE + 11, /** Not supported */
  NoServerLicense = WSERROR_BASE + 12, /** No server license */
  NoClientLicense = WSERROR_BASE + 13, /** No client license */
  TooManyBadLoginAttempts = WSERROR_BASE + 14, /** Too many bad login attempts */
  LoginRequired = WSERROR_BASE + 15, /** Login required */
}

// iModel Hub Services Errors
export enum IModelHubStatus {
  Success = 0,
  IMODELHUBERROR_BASE = 0x19000,
  IMODELHUBERROR_REQUESTERRORBASE = 0x19100,
  Unknown = IMODELHUBERROR_BASE + 1, /** Unknown error */

  MissingRequiredProperties = IMODELHUBERROR_BASE + 2, /** Missing required properties */
  InvalidPropertiesValues = IMODELHUBERROR_BASE + 3, /** Invalid properties values */
  UserDoesNotHavePermission = IMODELHUBERROR_BASE + 4, /** User does not have permission */
  InvalidBriefcase = IMODELHUBERROR_BASE + 5, /** Invalid briefcase */
  BriefcaseDoesNotExist = IMODELHUBERROR_BASE + 6, /** Briefcase does not exist */
  BriefcaseDoesNotBelongToUser = IMODELHUBERROR_BASE + 7, /** Briefcase does not belong to user */
  AnotherUserPushing = IMODELHUBERROR_BASE + 8, /** Another user pushing */
  ChangeSetAlreadyExists = IMODELHUBERROR_BASE + 9, /** ChangeSet already exists */
  ChangeSetDoesNotExist = IMODELHUBERROR_BASE + 10, /** ChangeSet does not exist */
  FileIsNotUploaded = IMODELHUBERROR_BASE + 11, /** File is not uploaded */
  iModelIsNotInitialized = IMODELHUBERROR_BASE + 12, /** iModel is not initialized */
  ChangeSetPointsToBadSeed = IMODELHUBERROR_BASE + 13, /** ChangeSet points to a bad seed file */
  iModelHubOperationFailed = IMODELHUBERROR_BASE + 14, /** iModelHub operation failed */
  PullIsRequired = IMODELHUBERROR_BASE + 15, /** Pull is required */
  MaximumNumberOfBriefcasesPerUser = IMODELHUBERROR_BASE + 16, /** Limit of briefcases per user was reached */
  MaximumNumberOfBriefcasesPerUserPerMinute = IMODELHUBERROR_BASE + 17, /** Limit of briefcases per user per minute was reached */
  DatabaseTemporarilyLocked = IMODELHUBERROR_BASE + 18, /** Database is temporarily locked */
  iModelAlreadyExists = IMODELHUBERROR_BASE + 19, /** iModel already exists */
  iModelDoesNotExist = IMODELHUBERROR_BASE + 20, /** iModel does not exist */
  LockDoesNotExist = IMODELHUBERROR_BASE + 21, /** Lock does not exist */
  LocksExist = IMODELHUBERROR_BASE + 22, /** Lock already exists */
  LockOwnedByAnotherBriefcase = IMODELHUBERROR_BASE + 23, /** Lock is owned by another briefcase */
  UserAlreadyExists = IMODELHUBERROR_BASE + 24, /** User already exists */
  UserDoesNotExist = IMODELHUBERROR_BASE + 25, /** User does not exist */
  CodeStateInvalid = IMODELHUBERROR_BASE + 26, /** Code state is invalid */
  CodeReservedByAnotherBriefcase = IMODELHUBERROR_BASE + 27, /** Code is reserved by another briefcase */
  CodeDoesNotExist = IMODELHUBERROR_BASE + 28, /** Code does not exist */
  CodesExist = IMODELHUBERROR_BASE + 29, /** Code already exists */
  FileDoesNotExist = IMODELHUBERROR_BASE + 30, /** File does not exist */
  FileAlreadyExists = IMODELHUBERROR_BASE + 31, /** File already exists */
  iModelIsLocked = IMODELHUBERROR_BASE + 32, /** iModel is locked */
  EventTypeDoesNotExist = IMODELHUBERROR_BASE + 33, /** Event type does not exist */
  EventSubscriptionDoesNotExist = IMODELHUBERROR_BASE + 34, /** Event subscription does not exist */
  EventSubscriptionAlreadyExists = IMODELHUBERROR_BASE + 35, /** Event subscription already exists */
  ProjectAssociationIsNotEnabled = IMODELHUBERROR_BASE + 36, /** Project association is not enabled */
  ProjectIdIsNotSpecified = IMODELHUBERROR_BASE + 37, /** Project Id is not specified */
  FailedToGetProjectPermissions = IMODELHUBERROR_BASE + 38, /** Failed to get project permissions */
  ChangeSetAlreadyHasVersion = IMODELHUBERROR_BASE + 39, /** ChangeSet already has version */
  VersionAlreadyExists = IMODELHUBERROR_BASE + 40, /** Version already exists */
  QueryIdsNotSpecified = IMODELHUBERROR_BASE + 41, /** Query Id is not specified */
  ConflictsAggregate = IMODELHUBERROR_BASE + 42, /** Codes or locks are owned by another briefcase */
  SeedFileInitializationFailed = IMODELHUBERROR_BASE + 43,

  /** Id for errors that are returned for incorrect iModel Hub request. */
  UndefinedArguementError = IMODELHUBERROR_REQUESTERRORBASE + 1, /** Undefined argument */
  InvalidArgumentError = IMODELHUBERROR_REQUESTERRORBASE + 2, /** Invalid argument */
  MissingDownloadUrlError = IMODELHUBERROR_REQUESTERRORBASE + 3, /** Missing download url */
  NotSupportedInBrowser = IMODELHUBERROR_REQUESTERRORBASE + 4, /** Not supported in browser */
  FileHandlerNotSet = IMODELHUBERROR_REQUESTERRORBASE + 5, /** File handler is not set */
  FileNotFound = IMODELHUBERROR_REQUESTERRORBASE + 6, /** File not found */
}

/** When you want to associate an explanatory message with an error status value. */
export interface StatusCodeWithMessage<ErrorCodeType> {
  status: ErrorCodeType;
  message: string;
}

/** Defines the *signature* for a function that returns meta-data related to an error.
 * Declared as a function so that the expense of creating the meta-data is only paid when it is needed.
 */
export type GetMetaDataFunction = () => any;

/** The error type thrown by this module. `BentleyError` subclasses `Error` to add an `errorNumber` member. See [[IModelStatus]] for `errorNumber` values. */
export class BentleyError extends Error {
  private readonly _getMetaData: GetMetaDataFunction | undefined;
  public errorNumber: number;

  public constructor(errorNumber: number | IModelStatus | DbResult | BentleyStatus | BriefcaseStatus | RepositoryStatus | ChangeSetStatus | HttpStatus | WSStatus | IModelHubStatus, message?: string, log?: LogFunction, category?: string, getMetaData?: GetMetaDataFunction) {
    super(message);
    this.errorNumber = errorNumber;
    this._getMetaData = getMetaData;
    this.name = this._initName();
    if (log)
      log(category || "BentleyError", this.toString(), this._getMetaData);  // TODO: Can we come up with a better default category?
  }

  public hasMetaData(): boolean { return this._getMetaData !== undefined; }

  public getMetaData(): any {
    return this.hasMetaData() ? this._getMetaData!() : undefined;
  }

  /** This function returns the name of each error status. Override this method to handle more error status codes. */
  protected _initName(): string {
    switch (this.errorNumber) {
      // IModelStatus cases
      case IModelStatus.AlreadyLoaded: return "Already Loaded";
      case IModelStatus.AlreadyOpen: return "Already Open";
      case IModelStatus.BadArg: return "Bad Arg";
      case IModelStatus.BadElement: return "Bad Element";
      case IModelStatus.BadModel: return "Bad Model";
      case IModelStatus.BadRequest: return "Bad Request";
      case IModelStatus.BadSchema: return "Bad Schema";
      case IModelStatus.CannotUndo: return "Can not Undo";
      case IModelStatus.CodeNotReserved: return "Code Not Reserved";
      case IModelStatus.DeletionProhibited: return "Deletion Prohibited";
      case IModelStatus.DuplicateCode: return "Duplicate Code";
      case IModelStatus.DuplicateName: return "Duplicate Name";
      case IModelStatus.ElementBlockedChange: return "Element Blocked Change";
      case IModelStatus.FileAlreadyExists: return "File Already Exists";
      case IModelStatus.FileNotFound: return "File Not Found";
      case IModelStatus.FileNotLoaded: return "File Not Loaded";
      case IModelStatus.ForeignKeyConstraint: return "ForeignKey Constraint";
      case IModelStatus.IdExists: return "Id Exists";
      case IModelStatus.InDynamicTransaction: return "InDynamicTransaction";
      case IModelStatus.InvalidCategory: return "Invalid Category";
      case IModelStatus.InvalidCode: return "Invalid Code";
      case IModelStatus.InvalidCodeSpec: return "Invalid CodeSpec";
      case IModelStatus.InvalidId: return "Invalid Id";
      case IModelStatus.InvalidName: return "Invalid Name";
      case IModelStatus.InvalidParent: return "Invalid Parent";
      case IModelStatus.InvalidProfileVersion: return "Invalid Profile Version";
      case IModelStatus.IsCreatingChangeSet: return "IsCreatingChangeSet";
      case IModelStatus.LockNotHeld: return "Lock Not Held";
      case IModelStatus.Mismatch2d3d: return "Mismatch 2d3d";
      case IModelStatus.MismatchGcs: return "Mismatch Gcs";
      case IModelStatus.MissingDomain: return "Missing Domain";
      case IModelStatus.MissingHandler: return "Missing Handler";
      case IModelStatus.MissingId: return "Missing Id";
      case IModelStatus.NoGeometry: return "No Geometry";
      case IModelStatus.NoMultiTxnOperation: return "NoMultiTxnOperation";
      case IModelStatus.NotDgnMarkupProject: return "NotDgnMarkupProject";
      case IModelStatus.NotEnabled: return "Not Enabled";
      case IModelStatus.NotFound: return "Not Found";
      case IModelStatus.NotOpen: return "Not Open";
      case IModelStatus.NotOpenForWrite: return "Not Open For Write";
      case IModelStatus.NotSameUnitBase: return "Not Same Unit Base";
      case IModelStatus.NothingToRedo: return "Nothing To Redo";
      case IModelStatus.NothingToUndo: return "Nothing To Undo";
      case IModelStatus.ParentBlockedChange: return "Parent Blocked Change";
      case IModelStatus.ReadError: return "Read Error";
      case IModelStatus.ReadOnly: return "ReadOnly";
      case IModelStatus.ReadOnlyDomain: return "ReadOnlyDomain";
      case IModelStatus.RepositoryManagerError: return "RepositoryManagerError";
      case IModelStatus.SQLiteError: return "SQLiteError";
      case IModelStatus.TransactionActive: return "Transaction Active";
      case IModelStatus.UnitsMissing: return "Units Missing";
      case IModelStatus.UnknownFormat: return "Unknown Format";
      case IModelStatus.UpgradeFailed: return "Upgrade Failed";
      case IModelStatus.ValidationFailed: return "Validation Failed";
      case IModelStatus.VersionTooNew: return "Version Too New";
      case IModelStatus.VersionTooOld: return "Version Too Old";
      case IModelStatus.ViewNotFound: return "View Not Found";
      case IModelStatus.WriteError: return "Write Error";
      case IModelStatus.WrongClass: return "Wrong Class";
      case IModelStatus.WrongIModel: return "Wrong IModel";
      case IModelStatus.WrongDomain: return "Wrong Domain";
      case IModelStatus.WrongElement: return "Wrong Element";
      case IModelStatus.WrongHandler: return "Wrong Handler";
      case IModelStatus.WrongModel: return "Wrong Model";

      // DbResult cases
      case DbResult.BE_SQLITE_ERROR: return "BE_SQLITE_ERROR";
      case DbResult.BE_SQLITE_INTERNAL: return "BE_SQLITE_INTERNAL";
      case DbResult.BE_SQLITE_PERM: return "BE_SQLITE_PERM";
      case DbResult.BE_SQLITE_ABORT: return "BE_SQLITE_ABORT";
      case DbResult.BE_SQLITE_BUSY: return "Db is busy";
      case DbResult.BE_SQLITE_LOCKED: return "Db is Locked";
      case DbResult.BE_SQLITE_NOMEM: return "BE_SQLITE_NOMEM";
      case DbResult.BE_SQLITE_READONLY: return "Readonly";
      case DbResult.BE_SQLITE_INTERRUPT: return "BE_SQLITE_INTERRUPT";
      case DbResult.BE_SQLITE_IOERR: return "BE_SQLITE_IOERR";
      case DbResult.BE_SQLITE_CORRUPT: return "BE_SQLITE_CORRUPT";
      case DbResult.BE_SQLITE_NOTFOUND: return "Not Found";
      case DbResult.BE_SQLITE_FULL: return "BE_SQLITE_FULL";
      case DbResult.BE_SQLITE_CANTOPEN: return "Can't open";
      case DbResult.BE_SQLITE_PROTOCOL: return "BE_SQLITE_PROTOCOL";
      case DbResult.BE_SQLITE_EMPTY: return "BE_SQLITE_EMPTY";
      case DbResult.BE_SQLITE_SCHEMA: return "BE_SQLITE_SCHEMA";
      case DbResult.BE_SQLITE_TOOBIG: return "BE_SQLITE_TOOBIG";
      case DbResult.BE_SQLITE_MISMATCH: return "BE_SQLITE_MISMATCH";
      case DbResult.BE_SQLITE_MISUSE: return "BE_SQLITE_MISUSE";
      case DbResult.BE_SQLITE_NOLFS: return "BE_SQLITE_NOLFS";
      case DbResult.BE_SQLITE_AUTH: return "BE_SQLITE_AUTH";
      case DbResult.BE_SQLITE_FORMAT: return "BE_SQLITE_FORMAT";
      case DbResult.BE_SQLITE_RANGE: return "BE_SQLITE_RANGE";
      case DbResult.BE_SQLITE_NOTADB: return "Not a Database";
      case DbResult.BE_SQLITE_IOERR_READ: return "BE_SQLITE_IOERR_READ";
      case DbResult.BE_SQLITE_IOERR_SHORT_READ: return "BE_SQLITE_IOERR_SHORT_READ";
      case DbResult.BE_SQLITE_IOERR_WRITE: return "BE_SQLITE_IOERR_WRITE";
      case DbResult.BE_SQLITE_IOERR_FSYNC: return "BE_SQLITE_IOERR_FSYNC";
      case DbResult.BE_SQLITE_IOERR_DIR_FSYNC: return "BE_SQLITE_IOERR_DIR_FSYNC";
      case DbResult.BE_SQLITE_IOERR_TRUNCATE: return "BE_SQLITE_IOERR_TRUNCATE";
      case DbResult.BE_SQLITE_IOERR_FSTAT: return "BE_SQLITE_IOERR_FSTAT";
      case DbResult.BE_SQLITE_IOERR_UNLOCK: return "BE_SQLITE_IOERR_UNLOCK";
      case DbResult.BE_SQLITE_IOERR_RDLOCK: return "BE_SQLITE_IOERR_RDLOCK";
      case DbResult.BE_SQLITE_IOERR_DELETE: return "BE_SQLITE_IOERR_DELETE";
      case DbResult.BE_SQLITE_IOERR_BLOCKED: return "BE_SQLITE_IOERR_BLOCKED";
      case DbResult.BE_SQLITE_IOERR_NOMEM: return "BE_SQLITE_IOERR_NOMEM";
      case DbResult.BE_SQLITE_IOERR_ACCESS: return "BE_SQLITE_IOERR_ACCESS";
      case DbResult.BE_SQLITE_IOERR_CHECKRESERVEDLOCK: return "BE_SQLITE_IOERR_CHECKRESERVEDLOCK";
      case DbResult.BE_SQLITE_IOERR_LOCK: return "BE_SQLITE_IOERR_LOCK";
      case DbResult.BE_SQLITE_IOERR_CLOSE: return "BE_SQLITE_IOERR_CLOSE";
      case DbResult.BE_SQLITE_IOERR_DIR_CLOSE: return "BE_SQLITE_IOERR_DIR_CLOSE";
      case DbResult.BE_SQLITE_IOERR_SHMOPEN: return "BE_SQLITE_IOERR_SHMOPEN";
      case DbResult.BE_SQLITE_IOERR_SHMSIZE: return "BE_SQLITE_IOERR_SHMSIZE";
      case DbResult.BE_SQLITE_IOERR_SHMLOCK: return "BE_SQLITE_IOERR_SHMLOCK";
      case DbResult.BE_SQLITE_IOERR_SHMMAP: return "BE_SQLITE_IOERR_SHMMAP";
      case DbResult.BE_SQLITE_IOERR_SEEK: return "BE_SQLITE_IOERR_SEEK";
      case DbResult.BE_SQLITE_IOERR_DELETE_NOENT: return "BE_SQLITE_IOERR_DELETE_NOENT";
      case DbResult.BE_SQLITE_ERROR_FileExists: return "File Exists";
      case DbResult.BE_SQLITE_ERROR_AlreadyOpen: return "Already Open";
      case DbResult.BE_SQLITE_ERROR_NoPropertyTable: return "No Property Table";
      case DbResult.BE_SQLITE_ERROR_FileNotFound: return "File Not Found";
      case DbResult.BE_SQLITE_ERROR_NoTxnActive: return "No Txn Active";
      case DbResult.BE_SQLITE_ERROR_BadDbProfile: return "Bad Db Profile";
      case DbResult.BE_SQLITE_ERROR_InvalidProfileVersion: return "Invalid Profile Version";
      case DbResult.BE_SQLITE_ERROR_ProfileUpgradeFailed: return "Profile Upgrade Failed";
      case DbResult.BE_SQLITE_ERROR_ProfileTooOldForReadWrite: return "Profile Too Old For ReadWrite";
      case DbResult.BE_SQLITE_ERROR_ProfileTooOld: return "Profile Too Old";
      case DbResult.BE_SQLITE_ERROR_ProfileTooNewForReadWrite: return "Profile Too New For ReadWrite";
      case DbResult.BE_SQLITE_ERROR_ProfileTooNew: return "Profile Too New";
      case DbResult.BE_SQLITE_ERROR_ChangeTrackError: return "ChangeTrack Error";
      case DbResult.BE_SQLITE_ERROR_InvalidChangeSetVersion: return "Invalid ChangeSet Version";
      case DbResult.BE_SQLITE_ERROR_SchemaUpgradeRequired: return "Schema Upgrade Required";
      case DbResult.BE_SQLITE_ERROR_SchemaTooNew: return "Schema Too New";
      case DbResult.BE_SQLITE_ERROR_SchemaTooOld: return "Schema Too Old";
      case DbResult.BE_SQLITE_ERROR_SchemaLockFailed: return "Schema Lock Failed";
      case DbResult.BE_SQLITE_ERROR_SchemaUpgradeFailed: return "Schema Upgrade Failed";
      case DbResult.BE_SQLITE_ERROR_SchemaImportFailed: return "Schema Import Failed";
      case DbResult.BE_SQLITE_ERROR_CouldNotAcquireLocksOrCodes: return "Could Not Acquire Locks Or Codes";
      case DbResult.BE_SQLITE_LOCKED_SHAREDCACHE: return "BE_SQLITE_LOCKED_SHAREDCACHE";
      case DbResult.BE_SQLITE_BUSY_RECOVERY: return "BE_SQLITE_BUSY_RECOVERY";
      case DbResult.BE_SQLITE_CANTOPEN_NOTEMPDIR: return "SQLite No Temp Dir";
      case DbResult.BE_SQLITE_CANTOPEN_ISDIR: return "BE_SQLITE_CANTOPEN_ISDIR";
      case DbResult.BE_SQLITE_CANTOPEN_FULLPATH: return "BE_SQLITE_CANTOPEN_FULLPATH";
      case DbResult.BE_SQLITE_CORRUPT_VTAB: return "BE_SQLITE_CORRUPT_VTAB";
      case DbResult.BE_SQLITE_READONLY_RECOVERY: return "BE_SQLITE_READONLY_RECOVERY";
      case DbResult.BE_SQLITE_READONLY_CANTLOCK: return "BE_SQLITE_READONLY_CANTLOCK";
      case DbResult.BE_SQLITE_READONLY_ROLLBACK: return "BE_SQLITE_READONLY_ROLLBACK";
      case DbResult.BE_SQLITE_ABORT_ROLLBACK: return "BE_SQLITE_ABORT_ROLLBACK";
      case DbResult.BE_SQLITE_CONSTRAINT_CHECK: return "BE_SQLITE_CONSTRAINT_CHECK";
      case DbResult.BE_SQLITE_CONSTRAINT_COMMITHOOK: return "CommitHook Constraint Error";
      case DbResult.BE_SQLITE_CONSTRAINT_FOREIGNKEY: return "Foreign Key Constraint Error";
      case DbResult.BE_SQLITE_CONSTRAINT_FUNCTION: return "Function Constraint Error";
      case DbResult.BE_SQLITE_CONSTRAINT_NOTNULL: return "NotNull Constraint Error";
      case DbResult.BE_SQLITE_CONSTRAINT_PRIMARYKEY: return "Primary Key Constraint Error";
      case DbResult.BE_SQLITE_CONSTRAINT_TRIGGER: return "Trigger Constraint Error";
      case DbResult.BE_SQLITE_CONSTRAINT_UNIQUE: return "Unique Constraint Error";
      case DbResult.BE_SQLITE_CONSTRAINT_VTAB: return "VTable Constraint Error";

      // BentleyStatus cases
      case BentleyStatus.ERROR: return "Error";

      // BriefcaseStatus
      case BriefcaseStatus.CannotAcquire: return "CannotAcquire";
      case BriefcaseStatus.CannotDownload: return "CannotDownload";
      case BriefcaseStatus.CannotCopy: return "CannotCopy";
      case BriefcaseStatus.CannotDelete: return "CannotDelete";
      case BriefcaseStatus.VersionNotFound: return "VersionNotFound";

      // ChangeSetStatus
      case ChangeSetStatus.ApplyError: return "Error applying a change set when reversing or reinstating it";
      case ChangeSetStatus.ChangeTrackingNotEnabled: return "Change tracking has not been enabled. The ChangeSet API mandates this";
      case ChangeSetStatus.CorruptedChangeStream: return "Contents of the change stream are corrupted and does not match the ChangeSet";
      case ChangeSetStatus.FileNotFound: return "File containing the changes to the change set is not found";
      case ChangeSetStatus.FileWriteError: return "Error writing the contents of the change set to the backing change stream file";
      case ChangeSetStatus.HasLocalChanges: return "Cannot perform the operation since the Db has local changes";
      case ChangeSetStatus.HasUncommittedChanges: return "Cannot perform the operation since current transaction has uncommitted changes";
      case ChangeSetStatus.InvalidId: return "Invalid ChangeSet Id";
      case ChangeSetStatus.InvalidVersion: return "Invalid version of the change set";
      case ChangeSetStatus.InDynamicTransaction: return "Cannot perform the operation since system is in the middle of a dynamic transaction";
      case ChangeSetStatus.IsCreatingChangeSet: return "Cannot perform operation since system is in the middle of a creating a change set";
      case ChangeSetStatus.IsNotCreatingChangeSet: return "Cannot perform operation since the system is not creating a change set";
      case ChangeSetStatus.MergePropagationError: return "Error propagating the changes after the merge";
      case ChangeSetStatus.NothingToMerge: return "No change sets to merge";
      case ChangeSetStatus.NoTransactions: return "No transactions are available to create a change set";
      case ChangeSetStatus.ParentMismatch: return "Parent change set of the Db does not match the parent id of the change set";
      case ChangeSetStatus.SQLiteError: return "Error performing a SQLite operation on the Db";
      case ChangeSetStatus.WrongDgnDb: return "ChangeSet originated in a different Db";
      case ChangeSetStatus.CouldNotOpenDgnDb: return "Could not open the DgnDb to merge change set";
      case ChangeSetStatus.MergeSchemaChangesOnOpen: return "Cannot merge changes in in an open DgnDb. Close the DgnDb, and process the operation when it is opened";
      case ChangeSetStatus.ReverseOrReinstateSchemaChangesOnOpen: return "Cannot reverse or reinstate schema changes in an open DgnDb. Close the DgnDb, and process the operation when it is opened";
      case ChangeSetStatus.ProcessSchemaChangesOnOpen: return "Cannot process changes schema changes in an open DgnDb. Close the DgnDb, and process the operation when it is opened";
      case ChangeSetStatus.CannotMergeIntoReadonly: return "Cannot merge changes into a Readonly DgnDb";
      case ChangeSetStatus.CannotMergeIntoMaster: return "Cannot merge changes into a Master DgnDb";
      case ChangeSetStatus.CannotMergeIntoReversed: return "Cannot merge changes into a DgnDb that has reversed change sets";

      // RepositoryStatus
      case RepositoryStatus.ServerUnavailable: return "ServerUnavailable";
      case RepositoryStatus.LockAlreadyHeld: return "LockAlreadyHeld";
      case RepositoryStatus.SyncError: return "SyncError";
      case RepositoryStatus.InvalidResponse: return "InvalidResponse";
      case RepositoryStatus.PendingTransactions: return "PendingTransactions";
      case RepositoryStatus.LockUsed: return "LockUsed";
      case RepositoryStatus.CannotCreateChangeSet: return "CannotCreateChangeSet";
      case RepositoryStatus.InvalidRequest: return "InvalidRequest";
      case RepositoryStatus.ChangeSetRequired: return "ChangeSetRequired";
      case RepositoryStatus.CodeUnavailable: return "CodeUnavailable";
      case RepositoryStatus.CodeNotReserved: return "CodeNotReserved";
      case RepositoryStatus.CodeUsed: return "CodeUsed";
      case RepositoryStatus.LockNotHeld: return "LockNotHeld";
      case RepositoryStatus.RepositoryIsLocked: return "RepositoryIsLocked";

      // HTTP Status
      case HttpStatus.Info: return "HTTP Info";
      case HttpStatus.Redirection: return "HTTP Redirection";
      case HttpStatus.ClientError: return "HTTP Client error";
      case HttpStatus.ServerError: return "HTTP Server error";

      // WSStatus
      case WSStatus.Unknown: return "Unknown error";
      case WSStatus.ClassNotFound: return "Class not found";
      case WSStatus.FileNotFound: return "File not found";
      case WSStatus.InstanceNotFound: return "Instance not found";
      case WSStatus.LoginFailed: return "Login failed";
      case WSStatus.NoClientLicense: return "No client license";
      case WSStatus.NoServerLicense: return "No server license";
      case WSStatus.NotEnoughRights: return "Not enough rights";
      case WSStatus.NotSupported: return "Not supported";
      case WSStatus.PropertyNotFound: return "Property not found";
      case WSStatus.RepositoryNotFound: return "Repository not found";
      case WSStatus.SchemaNotFound: return "Schema not found";
      case WSStatus.SslRequired: return "SSL required";
      case WSStatus.TooManyBadLoginAttempts: return "Too many bad login attempts";

      // IModelHubStatus
      case IModelHubStatus.Unknown: return "Unknown error";
      case IModelHubStatus.MissingRequiredProperties: return "Missing required properties";
      case IModelHubStatus.InvalidPropertiesValues: return "Invalid properties values";
      case IModelHubStatus.UserDoesNotHavePermission: return "User does not have permission";
      case IModelHubStatus.InvalidBriefcase: return "Invalid briefcase";
      case IModelHubStatus.BriefcaseDoesNotExist: return "Briefcase does not exist";
      case IModelHubStatus.BriefcaseDoesNotBelongToUser: return "Briefcase does not belong to user";
      case IModelHubStatus.AnotherUserPushing: return "Another user pushing";
      case IModelHubStatus.ChangeSetAlreadyExists: return "ChangeSet already exists";
      case IModelHubStatus.ChangeSetDoesNotExist: return "ChangeSet does not exist";
      case IModelHubStatus.FileIsNotUploaded: return "File is not uploaded";
      case IModelHubStatus.iModelIsNotInitialized: return "iModel is not initialized";
      case IModelHubStatus.ChangeSetPointsToBadSeed: return "ChangeSet points to a bad seed file";
      case IModelHubStatus.iModelHubOperationFailed: return "iModelHub operation failed";
      case IModelHubStatus.PullIsRequired: return "Pull is required";
      case IModelHubStatus.MaximumNumberOfBriefcasesPerUser: return "Limit of briefcases per user was reached";
      case IModelHubStatus.MaximumNumberOfBriefcasesPerUserPerMinute: return "Limit of briefcases per user per minute was reached";
      case IModelHubStatus.DatabaseTemporarilyLocked: return "Database is temporarily locked";
      case IModelHubStatus.iModelAlreadyExists: return "iModel already exists";
      case IModelHubStatus.iModelDoesNotExist: return "iModel does not exist";
      case IModelHubStatus.LockDoesNotExist: return "Lock does not exist";
      case IModelHubStatus.LocksExist: return "Lock already exists";
      case IModelHubStatus.LockOwnedByAnotherBriefcase: return "Lock is owned by another briefcase";
      case IModelHubStatus.UserAlreadyExists: return "User already exists";
      case IModelHubStatus.UserDoesNotExist: return "User does not exist";
      case IModelHubStatus.CodeStateInvalid: return "Code state is invalid";
      case IModelHubStatus.CodeReservedByAnotherBriefcase: return "Code is reserved by another briefcase";
      case IModelHubStatus.CodeDoesNotExist: return "Code does not exist";
      case IModelHubStatus.CodesExist: return "Code already exists";
      case IModelHubStatus.FileDoesNotExist: return "File does not exist";
      case IModelHubStatus.FileAlreadyExists: return "File already exists";
      case IModelHubStatus.iModelIsLocked: return "iModel is locked";
      case IModelHubStatus.EventTypeDoesNotExist: return "Event type does not exist";
      case IModelHubStatus.EventSubscriptionDoesNotExist: return "Event subscription does not exist";
      case IModelHubStatus.EventSubscriptionAlreadyExists: return "Event subscription already exists";
      case IModelHubStatus.ProjectAssociationIsNotEnabled: return "Project association is not enabled";
      case IModelHubStatus.ProjectIdIsNotSpecified: return "Project Id is not specified";
      case IModelHubStatus.FailedToGetProjectPermissions: return "Failed to get project permissions";
      case IModelHubStatus.ChangeSetAlreadyHasVersion: return "ChangeSet already has version";
      case IModelHubStatus.VersionAlreadyExists: return "Version already exists";
      case IModelHubStatus.QueryIdsNotSpecified: return "Query Id is not specified";
      case IModelHubStatus.ConflictsAggregate: return "Codes or locks are owned by another briefcase";
      /** Id for errors that are returned for incorrect iModel Hub request. */
      case IModelHubStatus.UndefinedArguementError: return "Undefined argument";
      case IModelHubStatus.InvalidArgumentError: return "Invalid argument";
      case IModelHubStatus.MissingDownloadUrlError: return "Missing download url";
      case IModelHubStatus.NotSupportedInBrowser: return "Not supported in browser";
      case IModelHubStatus.FileHandlerNotSet: return "File handler is not set";
      case IModelHubStatus.FileNotFound: return "File not found";

      // Unexpected cases
      case IModelStatus.Success:
      case DbResult.BE_SQLITE_OK:
      case DbResult.BE_SQLITE_ROW:
      case DbResult.BE_SQLITE_DONE:
      case BentleyStatus.SUCCESS:
        return "Success";

      default:
        return "Error (" + this.errorNumber + ")";
    }
  }
}
