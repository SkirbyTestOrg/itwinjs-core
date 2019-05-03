/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Properties */
import { QuantityType } from "../QuantityFormatter";

/**
 * Enumeration for Property Editor Param Types
 * @alpha
 */
export enum PropertyEditorParamTypes {
  ButtonGroupData,
  CheckBoxIcons,
  Icon,
  InputEditorSize,
  JSON,
  MultilineText,
  Range,
  Slider,
  SuppressUnitLabel,
  SuppressEditorLabel,
  ColorData,
  CustomFormattedNumber,
}

/**
 * Base interface for Property Editor Params
 * @alpha
 */
export interface BasePropertyEditorParams {
  type: PropertyEditorParamTypes;
}

/**
 * Parameters used by PropertyEditors that use HTML <input> element.
 * @alpha
 */
export interface InputEditorSizeParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.InputEditorSize;
  /** Optionally define the width in characters. */
  size?: number;
  /** Optionally define the maximum number of characters allowed. */
  maxLength?: number;
}

/**
 * Parameters used to populate color type editor with a specific set of colors. If not specified the Color
 * Editor will show a default palette of 16 colors.
 * @alpha
 */
export interface ColorEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.ColorData;
  /** array of color values to show in color picker popup. Use [[ColorByName]] enum values. Values should be 32-bit integer in the form 0xBBGGRR. */
  colorValues: number[];
  /** number of columns to show in color picker popup. The value of 4 is used if not defined. */
  numColumns?: number;
}

/**
 * Information about an icon displayed next to a property editor.
 * @alpha
 */
export interface IconDefinition {
  /** icon class name. */
  iconClass: string;
  isEnabledFunction?: () => boolean;
}

/**
 * Parameters used by EnumButtonGroupEditor to define icons in button group.
 * @alpha
 */
export interface ButtonGroupEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.ButtonGroupData;
  buttons: IconDefinition[];
}

/**
 * Parameters used to suppress the label for a type editor in the ToolSettings widget.
 * @alpha
 */
export interface SuppressLabelEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.SuppressEditorLabel;
  /** if false then an empty placeholder label is created. This is sometimes necessary to align editor in proper column */
  suppressLabelPlaceholder?: boolean;
}

/**
 * Parameters used by PropertyEditors that support JSON.
 * @alpha
 */
export interface JsonEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.JSON;
  json: any;
}

/**
 * Parameters used by PropertyEditors that support defining a minimum and maximum value.
 * @alpha
 */
export interface RangeEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.Range;
  /** Optionally define the minimum value. */
  minimum?: number;
  /** Optionally define the maximum value. */
  maximum?: number;
}

/**
 * Parameters used to indicate that a Slider should be presented for the property
 * and to specify the values needed by the slider.
 * @alpha
 */
export interface SliderEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.Slider;
  /** Defines the minimum value. */
  minimum: number;
  /** Defines the maximum value. */
  maximum: number;
  /** Show buttons at intervals, requires NumButtons to be set. */
  intervals?: boolean;
  /** Number of interval buttons to display */
  numButtons?: number;
  /** If Vertical is set, the slider will display in a vertical orientation, default is to draw Horizontally. */
  vertical?: boolean;
  /** Since slider must work with integer values define factor used to produce a integer (0.1=10, 0.01=100, 0.001=1000). */
  valueFactor?: number;
}

/**
 * Parameter that is used to indicate that a multiline text editor should be created.
 * The number of rows specified will determine the height of the editor control.
 * @alpha
 */
export interface MultilineTextEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.MultilineText;
  heightInRows: number;
}

/**
 * Parameters used to display an icon next to property editor.
 * @alpha
 */
export interface IconEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.Icon;
  definition: IconDefinition;
}

/**
 * Parameters used with boolean properties to indicate icon overrides.
 * @alpha
 */
export interface CheckBoxIconsEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.CheckBoxIcons;
  onIconDefinition?: IconDefinition;
  offIconDefinition?: IconDefinition;
}

/**
 * Parameter used to suppress Unit labels
 * @alpha
 */
export interface SuppressUnitLabelEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.SuppressUnitLabel;
}

/**
 * defines Results of parsing a string input by a user into its desired value type
 * @alpha
 */
export interface ParseResults {
  value?: string | number | boolean | {} | string[] | Date | [] | undefined;
  parseError?: string;
}

/**
 * Parameters used with properties that want to control parsing and formatting.
 * @alpha
 */
export interface CustomFormattedNumberParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.CustomFormattedNumber;
  formatFunction: (numberValue: number, quantityType?: QuantityType | string) => string;
  parseFunction: (stringValue: string, quantityType?: QuantityType | string) => ParseResults;
}

/**
 * Type definition for all Property Editor params
 * @alpha
 */
export type PropertyEditorParams = ButtonGroupEditorParams | ColorEditorParams | InputEditorSizeParams | SuppressLabelEditorParams | BasePropertyEditorParams | CustomFormattedNumberParams;
/*  Not yet supported
  |  JsonEditorParams | RangeEditorParams | SliderEditorParams |
  | IconEditorParams | CheckBoxIconsEditorParams | SuppressUnitLabelEditorParams
*/
