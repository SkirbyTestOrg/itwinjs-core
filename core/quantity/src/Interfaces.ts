/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** This interface provides basic information about a Unit that is return from a UnitProvider. This info
 * uniquely identifies a unit by its name.
 */
export interface UnitProps {
  /** Unique name for unit. */
  readonly name: string;
  /** Default label for unit. */
  readonly label: string;
  /** Unique name of unit family, in the ECMetaData world this is equivalent to Phenomenon. Example family names include 'Units.LENGTH', 'Units.AREA', and 'Units.VOLUME' */
  readonly unitFamily: string;
  /** This is set to true if the Unit is known by the UnitsProvider. */
  readonly isValid: boolean;
}

/** This interface defines the required properties of a Quantity.
 */
export interface QuantityProps {
  readonly magnitude: number;
  readonly unit: UnitProps;
  readonly isValid: boolean;
}

/** This interface defines the properties required to convert a quantity value from one unit to another such as from meters to feet
 * or from Celsius to Fahrenheit.
 */
export interface UnitConversion {
  factor: number;
  offset: number;
}

/** This interface is implemented by the class that is responsible for locating units by name or label and providing conversion values between units.
 * The methods to be implemented are async allowing the UnitsProvider to query the backend when necessary to look up unit definition and conversion rules.
 */
export interface UnitsProvider {
  findUnit(unitLabel: string, unitFamily?: string): Promise<UnitProps>;
  findUnitByName(unitName: string): Promise<UnitProps>;
  getConversion(fromUnit: UnitProps, toUnit: UnitProps): Promise<UnitConversion>;
}

/** This class is a convenience class that can be returned when a valid Unit cannot be determined.
 */
export class BadUnit implements UnitProps {
  public name = "";
  public label = "";
  public unitFamily = "";
  public isValid = false;
}
