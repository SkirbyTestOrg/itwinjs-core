import { QueryQuota } from "@bentley/imodeljs-common";

/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** Configuration for concurrent query manager
 * @internal
 */
export interface Config {
  /** Time seconds after which any completed query result will be purged */
  autoExpireTimeForCompletedQuery?: number;
  /** Number of concurrent worker to use. By default set to available CPUs */
  concurrent?: number;
  /** Number of ECSQL cached statement held by a single worker */
  cachedStatementsPerThread?: number;
  /** Maximum size of query queue after which incoming queries are rejected */
  maxQueueSize?: number;
  /** Minimum time interval in seconds after which monitor starts. */
  minMonitorInterval?: number;
  /** idle period of time in seconds after which resources and caches are purged */
  idleCleanupTime?: number;
  /** Poll interval in milliseconds. */
  pollInterval?: number;
  /** Global restriction on query quota */
  quota?: QueryQuota;
}

/** Post status for concurrent query manager
 *  @internal
 */
export enum PostStatus {
  NotInitialized = 0,
  Done = 1,
  QueueSizeExceeded = 2,
}

/** Poll status for concurrent query manager
 *  @internal
 */
export enum PollStatus {
  NotInitialized = 0,
  Done = 1,
  Pending = 2,
  Partial = 3,
  Timeout = 4,
  Error = 5,
  NotFound = 6,
}
