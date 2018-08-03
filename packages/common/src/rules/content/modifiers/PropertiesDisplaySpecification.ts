/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
*--------------------------------------------------------------------------------------------*/
/** @module PresentationRules */

/** Sub-specification to hide / display specified ECInstance properties. */
export interface PropertiesDisplaySpecification {
  /** List of ECProperty names which should be hidden or shown */
  propertyNames: string[];

  /** Controls priority of the specification. Defaults to `1000`. */
  priority?: number;

  /** Should property be displayed. Defaults to `true`. */
  isDisplayed?: boolean;
}
