/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModels
 */

import { GuidString, OpenMode } from "@bentley/bentleyjs-core";

/**
 * Status of downloading a briefcase
 * @internal
 */
export enum DownloadBriefcaseStatus {
  NotStarted,
  Initializing,
  DownloadingCheckpoint,
  DownloadingChangeSets,
  ApplyingChangeSets,
  Complete,
  Error,
}

/** Operations allowed when synchronizing changes between the Briefcase and iModelHub
 * @public
 */
export enum SyncMode { FixedVersion = 1, PullAndPush = 2, PullOnly = 3 }

/**
 * Key to locate a briefcase
 * @internal
 */
export type BriefcaseKey = string;

/**
 * Options to download the briefcase
 * @beta
 */
export interface DownloadBriefcaseOptions {
  /** This setting defines the operations allowed when synchronizing changes between the briefcase and iModelHub */
  syncMode: SyncMode;
}

/**
 * Options to open the briefcase
 * @beta
 */
export interface OpenBriefcaseOptions {
  /** Limit the opened briefcase for Readonly operations by establishing a Readonly connection with the Db */
  openAsReadOnly?: boolean;
}

/**
 * Properties required to request download of a briefcase
 * @internal
 */
export interface RequestBriefcaseProps {
  /** Context (Project or Asset) that the iModel belongs to */
  readonly contextId: GuidString;

  /** Id of the iModel */
  readonly iModelId: GuidString;

  /** Id of the change set */
  readonly changeSetId: GuidString;
}

/**
 * Properties of a briefcase
 * @internal
 */
export interface BriefcaseProps extends RequestBriefcaseProps, DownloadBriefcaseOptions {
  /** Key to locate the briefcase in the disk cache */
  readonly key: BriefcaseKey;

  /** Mode used to open the briefcase */
  openMode: OpenMode;

  /** Status of downloading a briefcase */
  downloadStatus: DownloadBriefcaseStatus;

  /** File size of the briefcase on disk - only set for briefcases that are completely downloaded */
  fileSize?: number;
}

/**
 * Manages the download of a briefcase
 * @internal
 */
export interface BriefcaseDownloader {
  /** Properties of the briefcase that's being downloaded */
  briefcaseProps: BriefcaseProps;

  /** Promise that resolves when the download completes. await this to complete the download */
  downloadPromise: Promise<void>;

  /** Request cancellation of the download */
  requestCancel: () => Promise<boolean>;
}

/** Option to control the validation and upgrade of domain schemas in the Db
 * @internal
 */
export enum DomainOptions {
  /** Domain schemas will be validated for any required upgrades. Any errors will be reported back, and cause the application to fail opening the Db */
  CheckRequiredUpgrades = 0,

  /** Domain schemas will be validated for any required or optional upgrades. Any errors will be reported back, and cause the application to fail opening the Db */
  CheckRecommendedUpgrades = 1,

  /** Domain schemas will be upgraded if necessary. However, only compatible schema upgrades will be allowed - these are typically additions of classes, properties, and changes to custom attributes */
  Upgrade = 2,

  /** Domain schemas will neither be validated nor be upgraded. Used only internally */
  SkipCheck = 3,
}

/** Options that control whether a profile upgrade should be performed when opening a Db
 * @internal
 */
export enum ProfileOptions {
  /** No profile upgrade will be performed. If a profile upgrade was required, opening the file will fail */
  None = 0,

  /** Profile upgrade will be performed if necessary */
  Upgrade = 1,
}

/** Arguments to validate and update the profile and domain schemas when opening a Db
 * @internal
 */
export interface UpgradeOptions {
  /** Option to control the validation and upgrade of domain schemas in the Db */
  domain?: DomainOptions;

  /** Options that control whether a profile upgrade should be performed when opening a file */
  profile?: ProfileOptions;
}
