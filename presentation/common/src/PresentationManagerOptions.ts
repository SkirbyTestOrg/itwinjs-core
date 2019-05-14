/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Core */

/**
 * A generic request options type used for both hierarchy and content requests
 * @public
 */
export interface RequestOptions<TIModel> {
  /** iModel to request data from */
  imodel: TIModel;

  /** Optional locale to use when formatting / localizing data */
  locale?: string;
}

/**
 * Options for requests that require presentation ruleset ID. Not
 * meant to be used directly, see one of the subclasses.
 *
 * @public
 */
export interface RequestOptionsWithRuleset<TIModel> extends RequestOptions<TIModel> {
  /** Id of the ruleset to use when requesting data */
  rulesetId: string;
}

/**
 * Request type for hierarchy requests
 * @public
 */
export interface HierarchyRequestOptions<TIModel> extends RequestOptionsWithRuleset<TIModel> { }

/**
 * Request type for content requests
 * @public
 */
export interface ContentRequestOptions<TIModel> extends RequestOptionsWithRuleset<TIModel> { }

/**
 * Request type for label requests
 * @public
 */
export interface LabelRequestOptions<TIModel> extends RequestOptions<TIModel> { }

/**
 * Request options used for selection scope related requests
 * @public
 */
export interface SelectionScopeRequestOptions<TIModel> extends RequestOptions<TIModel> { }

/**
 * Paging options
 * @public
 */
export interface PageOptions {
  /** Inclusive start 0-based index of the page */
  start?: number;
  /** Maximum size of the page */
  size?: number;
}

/**
 * A wrapper type that injects [[PageOptions]] into supplied type
 * @public
 */
export type Paged<TOptions extends {}> = TOptions & {
  /** Optional paging parameters */
  paging?: PageOptions;
};
