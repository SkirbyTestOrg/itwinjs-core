/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { IDisposable } from "@bentley/bentleyjs-core";
import { IModelConnection } from "@bentley/imodeljs-frontend";

/**
 * Interface for a presentation data provider
 * @public
 */
export interface IPresentationDataProvider extends IDisposable {
  /**
   * [[IModelConnection]] used by this data provider
   */
  readonly imodel: IModelConnection;

  /**
   * Id of the ruleset used by this data provider
   */
  readonly rulesetId: string;
}
