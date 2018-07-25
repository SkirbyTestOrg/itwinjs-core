/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
*--------------------------------------------------------------------------------------------*/
/** @module PresentationRules */

import { RuleTypes, RuleBase, ConditionContainer } from "../Rule";

/** Available font styles */
export const enum FontStyle {
  Bold = "Bold",
  Italic = "Italic",
  ItalicBold = "Italic,Bold",
  Regular = "Regular",
}

/**
 * Rule to override default node style and dynamically define a foreground/background
 * colors and a font style for a particular nodes.
 */
export interface StyleOverride extends RuleBase, ConditionContainer {
  /** Used for serializing to JSON. */
  ruleType: RuleTypes.StyleOverride;

  /**
   * Foreground color that should be used for node. Supports on of the following formats:
   * - color name (`Red`, `Blue`, etc.)
   * - `rgb(255, 255, 255)`
   * - `#0F0F0F`
   */
  foreColor?: string;

  /**
   * Background color that should be used for node. Supports on of the following formats:
   * - color name (`Red`, `Blue`, etc.)
   * - `rgb(255, 255, 255)`
   * - `#0F0F0F`
   */
  backColor?: string;

  /**
   * Font style that should be used for nodes that meet the condition.
   * Defaults to [[FontStyle.Regular]].
   */
  fontStyle?: FontStyle;
}
