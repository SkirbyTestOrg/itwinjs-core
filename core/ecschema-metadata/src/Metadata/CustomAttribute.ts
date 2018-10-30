/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import { containerTypeToString, CustomAttributeContainerType } from "./../ECObjects";
import { ECObjectsError, ECObjectsStatus } from "./../Exception";

export interface CustomAttribute {
  className: string;
  [propName: string]: any;
}

export class CustomAttributeSet {
  [name: string]: CustomAttribute;
}

export interface CustomAttributeContainerProps {
  customAttributes?: CustomAttributeSet;
}

export function processCustomAttributes(customAttributesJson: any, name: string, type: CustomAttributeContainerType): CustomAttributeSet | undefined { // TODO: Check for duplicate class names
  if (undefined !== customAttributesJson) {
    if (!Array.isArray(customAttributesJson)) {
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ${containerTypeToString(type)} ${name} has an invalid 'customAttributes' attribute. It should be of type 'array'.`);
    }
    const customAttributeSet = new CustomAttributeSet();
    customAttributesJson.forEach((attribute: CustomAttribute) => {
      customAttributeSet![attribute.className] = attribute;
    });
    return customAttributeSet;
  }
  return undefined;
}

export function serializeCustomAttributes(customAttributes: CustomAttributeSet | undefined): any[] | undefined {
  if (undefined !== customAttributes) { // custom attributes is optional
    const attributes: any[] = [];
    Object.keys(customAttributes).map((key) => { // each custom attribute may have multiple properties, so we need to process them
      const attribute: { [value: string]: any } = {};
      Object.keys(customAttributes![key]).map((property: any) => {
        const propertyName = property.toString();
        attribute[propertyName] = customAttributes[key][property];
      });
      attributes.push(attribute);
    });
    return attributes;
  }
  return undefined;
}
