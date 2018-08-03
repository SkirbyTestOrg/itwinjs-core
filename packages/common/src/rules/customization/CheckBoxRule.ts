/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
*--------------------------------------------------------------------------------------------*/
/** @module PresentationRules */

import { RuleTypes, RuleBase, ConditionContainer } from "../Rule";

/**
 * Rule that allows configuring check boxes for certain nodes.
 *
 * Is also allows binding check box state with boolean properties by setting [[propertyName]] parameter.
 * If [[propertyName]] is not set, then [[defaultValue]] is used for default check box state.
 */
export interface CheckBoxRule extends RuleBase, ConditionContainer {
  /** Used for serializing to JSON. */
  ruleType: RuleTypes.CheckBox;

  /**
   * Name of boolean type ECProperty which is bound with the check box state. When set,
   * property value gets bound to checkbox state.
   *
   * @minLength 1
   */
  propertyName?: string;

  /**
   * Should property value be inversed for the check box state.
   */
  useInversedPropertyValue?: boolean;

  /**
   * Default value to use for the check box state
   */
  defaultValue?: boolean;

  /**
   * Indicates whether check box is enabled or disabled.
   *
   * **Note:** Only makes sense when not bound to an ECProperty.
   */
  isEnabled?: string;
}
