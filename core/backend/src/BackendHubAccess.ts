/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module HubAccess
 */

import { AccessToken, BeEvent, GuidString, Id64String, IModelHubStatus } from "@itwin/core-bentley";
import {
  BriefcaseId, ChangesetFileProps, ChangesetIdWithIndex, ChangesetIndex, ChangesetIndexAndId, ChangesetIndexOrId, ChangesetProps, ChangesetRange, IModelError,
  IModelVersion, LocalDirName, LocalFileName,
} from "@itwin/core-common";
import { CheckpointProps, DownloadRequest } from "./CheckpointManager";
import { TokenArg } from "./IModelDb";

/** The state of a lock.
 * @public
 */
export enum LockState {
  /** The element is not locked */
  None = 0,
  /** Holding a shared lock on an element blocks other users from acquiring the Exclusive lock it. More than one user may acquire the shared lock. */
  Shared = 1,
  /** A Lock that permits modifications to an element and blocks other users from making modifications to it.
   * Holding an exclusive lock on an "owner" (a model or a parent element), implicitly exclusively locks all its members.
   */
  Exclusive = 2,
}

/** Exception thrown if lock cannot be acquired.
 * @beta
*/
export class LockConflict extends IModelError {
  public constructor(
    /** Id of Briefcase holding lock */
    public readonly briefcaseId: BriefcaseId,
    /** Alias of Briefcase holding lock */
    public readonly briefcaseAlias: string,
    msg: "shared lock is held" | "exclusive lock is already held"
  ) {
    super(IModelHubStatus.LockOwnedByAnotherBriefcase, msg);
  }
}

/**
 * Controls cancellation.
 * @note This is based on AbortController (https://developer.mozilla.org/en-US/docs/Web/API/AbortController).
 * @beta
 */
export class CancelController {
  private _cancelEvent = new BeEvent<() => void>();

  /** Signal raised by this controller on cancellation. */
  public get signal(): CancelSignal {
    return {
      addListener: (listener) => this._cancelEvent.addListener(listener),
    };
  }

  /** Raises cancellation signal. */
  public cancel() {
    this._cancelEvent.raiseEvent();
  }
}

/**
 * Allows to add listener for cancellation.
 * @note This is based on AbortSignal (https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal).
 * @beta
 */
export interface CancelSignal {
  /**
   * Registers a Listener to be executed whenever this signal is raised.
   * @param listener A listener to be executed whenever this signal is raised.
   * @returns A function that will remove this listener.
   */
  addListener(listener: () => void): () => void;
}

/**
 * The properties to access a V2 checkpoint through a daemon.
 * @internal
 */
export interface V2CheckpointAccessProps {
  /** blob store account name. */
  readonly accountName: string;
  /** The name of the iModel's blob store container holding all checkpoints. */
  readonly containerId: string;
  /** AccessToken that grants access to the container. */
  readonly sasToken: AccessToken;
  /** The name of the virtual file within the container, used for the checkpoint */
  readonly dbName: string;
  /** blob storage module: e.g. "azure", "google", "aws". May also include URI style parameters. */
  readonly storageType: string;
}

/** @internal */
export type LockMap = Map<Id64String, LockState>;

/**
 * The properties of a lock that may be obtained from a lock server.
 * @beta
 */
export interface LockProps {
  /** The elementId for the lock */
  readonly id: Id64String;
  /** the lock state */
  readonly state: LockState;
}

/**
 * Function used to indicate progress as the changeset is downloaded.
 * @param loaded Bytes downloaded.
 * @param total Total size of item(s) in bytes.
 * @beta
 */
export type DownloadProgressFunction = (loaded: number, total: number) => void;

/**
 * Argument for tracking download progress.
 * @beta
 */
export interface DownloadProgressArg {
  progressCallback?: DownloadProgressFunction;
}

/**
 * Argument for cancelling download.
 * @beta
 */
export interface CancelDownloadArg {
  cancelSignal?: CancelSignal;
}

/**
 * Argument for methods that must supply an iTwinId
 * @public
 */
export interface ITwinIdArg {
  readonly iTwinId: GuidString;
}

/**
 * Argument for methods that must supply an IModelId
 * @public
 */
export interface IModelIdArg extends TokenArg {
  readonly iModelId: GuidString;
}

/**
 * Argument for acquiring a new BriefcaseId
 * @public
 */
export interface AcquireNewBriefcaseIdArg extends IModelIdArg {
  /** A string to be reported to other users to identify this briefcase, for example in the case of conflicts or lock collisions. */
  readonly briefcaseAlias?: string;
}

/** Argument for methods that must supply an IModel name and iTwinId
 * @public
 */
export interface IModelNameArg extends TokenArg, ITwinIdArg {
  readonly iModelName: string;
}

/** Argument for methods that must supply an IModelId and a BriefcaseId
 * @public
 */
export interface BriefcaseIdArg extends IModelIdArg {
  readonly briefcaseId: BriefcaseId;
}

/** Argument for methods that must supply a briefcaseId and a changeset
 * @public
 */
export interface BriefcaseDbArg extends BriefcaseIdArg {
  readonly changeset: ChangesetIdWithIndex;
}

/** Argument for methods that must supply an IModelId and a changeset
 * @public
 */
export interface ChangesetArg extends IModelIdArg {
  readonly changeset: ChangesetIndexOrId;
}

/** Argument for downloading a changeset.
 * @beta
 */
export interface DownloadChangesetArg extends ChangesetArg, DownloadProgressArg, CancelDownloadArg {
  /** Directory where the changeset should be downloaded. */
  targetDir: LocalDirName;
}

/** @internal */
export interface ChangesetIndexArg extends IModelIdArg {
  readonly changeset: ChangesetIdWithIndex;
}

/** Argument for methods that must supply an IModelId and a range of Changesets.
 * @public
 */
export interface ChangesetRangeArg extends IModelIdArg {
  /** the range of changesets desired. If is undefined, *all* changesets are returned. */
  readonly range?: ChangesetRange;
}

/** Argument for downloading a changeset range.
 * @beta
 */
export interface DownloadChangesetRangeArg extends ChangesetRangeArg, DownloadProgressArg, CancelDownloadArg {
  /** Directory where the changesets should be downloaded. */
  targetDir: LocalDirName;
}

/** @internal */
export type CheckpointArg = DownloadRequest;

/**
 * Arguments to create a new iModel in iModelHub
 *  @public
 */
export interface CreateNewIModelProps extends IModelNameArg {
  readonly description?: string;
  readonly version0?: LocalFileName;
  readonly noLocks?: true;
}

/**
 * Methods for accessing services of IModelHub from an iTwin.js backend.
 * Generally direct access to these methods should not be required, since higher-level apis are provided.
 * @beta
 */
export interface BackendHubAccess {
  /** Download all the changesets in the specified range. */
  downloadChangesets: (arg: DownloadChangesetRangeArg) => Promise<ChangesetFileProps[]>;
  /** Download a single changeset. */
  downloadChangeset: (arg: DownloadChangesetArg) => Promise<ChangesetFileProps>;
  /** Query the changeset properties given a ChangesetIndex  */
  queryChangeset: (arg: ChangesetArg) => Promise<ChangesetProps>;
  /** Query an array of changeset properties given a range of ChangesetIndexes  */
  queryChangesets: (arg: ChangesetRangeArg) => Promise<ChangesetProps[]>;
  /** Push a changeset to iModelHub. Returns the newly pushed changeset's index */
  pushChangeset: (arg: IModelIdArg & { changesetProps: ChangesetFileProps }) => Promise<ChangesetIndex>;
  /** Get the ChangesetProps of the most recent changeset */
  getLatestChangeset: (arg: IModelIdArg) => Promise<ChangesetProps>;
  /** Get the ChangesetProps for an IModelVersion */
  getChangesetFromVersion: (arg: IModelIdArg & { version: IModelVersion }) => Promise<ChangesetProps>;
  /** Get the ChangesetProps for a named version */
  getChangesetFromNamedVersion: (arg: IModelIdArg & { versionName: string }) => Promise<ChangesetProps>;

  /** Acquire a new briefcaseId for the supplied iModelId
     * @note usually there should only be one briefcase per iModel per user.
     */
  acquireNewBriefcaseId: (arg: AcquireNewBriefcaseIdArg) => Promise<BriefcaseId>;
  /** Release a briefcaseId. After this call it is illegal to generate changesets for the released briefcaseId. */
  releaseBriefcase: (arg: BriefcaseIdArg) => Promise<void>;

  /** get an array of the briefcases assigned to a user. */
  getMyBriefcaseIds: (arg: IModelIdArg) => Promise<BriefcaseId[]>;

  /**
   * download a v1 checkpoint
   * @internal
   */
  downloadV1Checkpoint: (arg: CheckpointArg) => Promise<ChangesetIndexAndId>;

  /**
   * Get the access props for a V2 checkpoint. Returns undefined if no V2 checkpoint exists.
   * @internal
   */
  queryV2Checkpoint: (arg: CheckpointProps) => Promise<V2CheckpointAccessProps | undefined>;
  /**
   * download a v2 checkpoint
   * @internal
   */
  downloadV2Checkpoint: (arg: CheckpointArg) => Promise<ChangesetIndexAndId>;

  /**
   * acquire one or more locks. Throws if unsuccessful. If *any* lock cannot be obtained, no locks are acquired
   * @internal
   */
  acquireLocks: (arg: BriefcaseDbArg, locks: LockMap) => Promise<void>;

  /**
   * Get the list of all held locks for a briefcase. This can be very expensive and is currently used only for tests.
   * @internal
   */
  queryAllLocks: (arg: BriefcaseDbArg) => Promise<LockProps[]>;

  /**
   * Release all currently held locks
   * @internal
   */
  releaseAllLocks: (arg: BriefcaseDbArg) => Promise<void>;

  /** Get the iModelId of an iModel by name. Undefined if no iModel with that name exists.  */
  queryIModelByName: (arg: IModelNameArg) => Promise<GuidString | undefined>;

  /** create a new iModel. Returns the Guid of the newly created iModel */
  createNewIModel: (arg: CreateNewIModelProps) => Promise<GuidString>;

  /** delete an iModel */
  deleteIModel: (arg: IModelIdArg & ITwinIdArg) => Promise<void>;
}
