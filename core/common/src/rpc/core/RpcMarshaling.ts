/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module RpcInterface */

// tslint:disable:no-string-literal

import { RpcRegistry } from "./RpcRegistry";
import { RpcOperation } from "./RpcOperation";
import { RpcProtocol } from "./RpcProtocol";
import { RpcConfiguration } from "./RpcConfiguration";
import { IModelError, BentleyStatus } from "../../IModelError";
import { RpcMarshalingDirective } from "./RpcConstants";

let marshalingScope = "";
let marshalingTarget: RpcSerializedValue;

interface MarshalingBinaryMarker {
  [RpcMarshalingDirective.Binary]: true;
  type: number;
  index: number;
  size: number;
}

export namespace MarshalingBinaryMarker {
  export function createDefault(): MarshalingBinaryMarker {
    return { [RpcMarshalingDirective.Binary]: true, type: 0, index: 0, size: -1 };
  }
}

export interface RpcSerializedValue {
  objects: string;
  data: Uint8Array[];
}

export namespace RpcSerializedValue {
  export function create(objects = "", data: Uint8Array[] = []): RpcSerializedValue {
    return { objects, data };
  }
}

/** @hidden */
export class RpcMarshaling {
  private constructor() { }

  /** Serializes a value. */
  public static serialize(operation: RpcOperation | string, _protocol: RpcProtocol | undefined, value: any): RpcSerializedValue {
    const serialized = RpcSerializedValue.create();

    if (typeof (value) === "undefined") {
      return serialized;
    }

    marshalingTarget = serialized;
    marshalingScope = typeof (operation) === "string" ? operation : operation.interfaceDefinition.name;
    serialized.objects = JSON.stringify(value, WireFormat.marshal);
    marshalingTarget = undefined as any;

    return serialized;
  }

  /** Deserializes a value. */
  public static deserialize(_operation: RpcOperation, _protocol: RpcProtocol | undefined, value: RpcSerializedValue): any {
    if (value.objects === "") {
      return undefined;
    }

    marshalingTarget = value;
    const result = JSON.parse(value.objects, WireFormat.unmarshal);
    marshalingTarget = undefined as any;

    return result;
  }
}

class WireFormat {
  public static binaryTypes = [
    Uint8Array,
  ];

  /** JSON.stringify replacer callback that marshals JavaScript class instances. */
  public static marshal(this: any, key: string, value: any) {
    if (key === RpcMarshalingDirective.Name || key === RpcMarshalingDirective.Undefined || key === RpcMarshalingDirective.Unregistered) {
      delete this[key];
    }

    const custom = this[key] !== value && (typeof (value) !== "object" || value === null || Array.isArray(value) || Buffer.isBuffer(this[key]));
    const originalValue = custom ? this[key] : value;

    const asBinary = WireFormat.marshalBinary(originalValue);
    if (asBinary) {
      return asBinary;
    }

    if (typeof (originalValue) === "object" && originalValue !== null && !Array.isArray(originalValue) && originalValue.constructor !== Object) {
      const name = `${marshalingScope}_${originalValue.constructor.name}`;
      const unregistered = !RpcRegistry.instance.types.has(name);

      if (custom) {
        return WireFormat.marshalCustom(name, value, unregistered);
      } else {
        if (value instanceof Map) {
          return WireFormat.marshalMap(name, value, unregistered);
        } else if (value instanceof Set) {
          return WireFormat.marshalSet(name, value, unregistered);
        } else {
          WireFormat.recordClass(value, name, unregistered);

          if (value instanceof Error) {
            WireFormat.marshalError(value);
          }

          WireFormat.recordUndefineds(value);
        }
      }
    }

    return value;
  }

  /** JSON.parse reviver callback that unmarshals JavaScript class instances. */
  public static unmarshal(_key: string, value: any) {
    if (typeof (value) === "object" && value !== null) {
      if (value[RpcMarshalingDirective.Binary]) {
        return WireFormat.unmarshalBinary(value);
      } else if (value[RpcMarshalingDirective.Name]) {
        return WireFormat.unmarshalObject(value);
      }
    }

    return value;
  }

  private static marshalBinary(value: any): any {
    if (ArrayBuffer.isView(value) || Buffer.isBuffer(value)) {
      const marker: MarshalingBinaryMarker = { [RpcMarshalingDirective.Binary]: true, type: -1, index: -1, size: -1 };

      let i = -1;
      if (Buffer.isBuffer(value)) {
        i = 0;
      } else {
        for (i = 0; i !== WireFormat.binaryTypes.length; ++i) {
          if (value instanceof WireFormat.binaryTypes[i]) {
            break;
          }
        }
      }

      if (i === -1) {
        throw new IModelError(BentleyStatus.ERROR, `Cannot marshal binary type "${value.constructor.name}".`);
      } else {
        marker.type = i;
        marker.index = marshalingTarget.data.push(value as Uint8Array) - 1;
        marker.size = value.byteLength;
      }

      return marker;
    } else {
      return undefined;
    }
  }

  private static unmarshalBinary(value: MarshalingBinaryMarker): any {
    if (value.type >= WireFormat.binaryTypes.length) {
      throw new IModelError(BentleyStatus.ERROR, `Cannot unmarshal unknown binary type.`);
    }

    if (value.index >= marshalingTarget.data.length) {
      throw new IModelError(BentleyStatus.ERROR, `Cannot unmarshal missing binary value.`);
    }

    return new WireFormat.binaryTypes[value.type](marshalingTarget.data[value.index]);
  }

  private static marshalCustom(name: string, value: any, unregistered: boolean) {
    return {
      [RpcMarshalingDirective.Name]: name,
      [RpcMarshalingDirective.JSON]: value,
      [RpcMarshalingDirective.Unregistered]: unregistered,
    };
  }

  private static marshalMap(name: string, value: Map<any, any>, unregistered: boolean) {
    return {
      [RpcMarshalingDirective.Name]: name,
      [RpcMarshalingDirective.Map]: Array.from(value),
      [RpcMarshalingDirective.Unregistered]: unregistered,
    };
  }

  private static marshalSet(name: string, value: Set<any>, unregistered: boolean) {
    return {
      [RpcMarshalingDirective.Name]: name,
      [RpcMarshalingDirective.Set]: Array.from(value),
      [RpcMarshalingDirective.Unregistered]: unregistered,
    };
  }

  private static marshalError(value: Error) {
    (value as any)[RpcMarshalingDirective.Error] = true;

    const errorName = value.name;
    value.name = "";

    const errorMessage = value.message;
    value.message = "[Backend to Frontend Transition]";

    let stack = value.stack;
    if (typeof (stack) === "undefined")
      stack = "[Backend to Frontend Transition]\n[Backend Implementation]";

    (value as any)[RpcMarshalingDirective.ErrorStack] = stack;

    value.message = errorMessage;
    (value as any)[RpcMarshalingDirective.ErrorMessage] = value.message;

    value.name = errorName;
    (value as any)[RpcMarshalingDirective.ErrorName] = value.name;
  }

  private static recordUndefineds(value: any) {
    const undefineds = [];
    for (const prop in value) {
      if (value.hasOwnProperty(prop) && value[prop] === undefined)
        undefineds.push(prop);
    }

    if (undefineds.length) {
      value[RpcMarshalingDirective.Undefined] = undefineds;
    }
  }

  // tslint:disable-next-line:ban-types
  private static unmarshalCustom(type: Function | undefined, customValue: any) {
    if (type) {
      const typeFromJSON = (type as any).fromJSON;
      if (typeFromJSON)
        return typeFromJSON(customValue);
      else
        return new (type as any)(customValue);
    } else {
      return customValue;
    }
  }

  private static buildDescriptors(value: any) {
    const isError = value[RpcMarshalingDirective.Error];
    delete value[RpcMarshalingDirective.Error];

    const errorName = value[RpcMarshalingDirective.ErrorName];
    delete value[RpcMarshalingDirective.ErrorName];

    const errorMessage = value[RpcMarshalingDirective.ErrorMessage];
    delete value[RpcMarshalingDirective.ErrorMessage];

    const errorStack = value[RpcMarshalingDirective.ErrorStack];
    delete value[RpcMarshalingDirective.ErrorStack];

    const descriptors: { [index: string]: PropertyDescriptor } = {};
    const props = Object.keys(value);
    for (const prop of props) {
      descriptors[prop] = Object.getOwnPropertyDescriptor(value, prop) as PropertyDescriptor;
    }

    if (isError) {
      if (!descriptors.hasOwnProperty("name")) {
        descriptors["name"] = { configurable: true, enumerable: true, writable: true, value: errorName };
      }

      if (!descriptors.hasOwnProperty("message")) {
        descriptors["message"] = { configurable: true, enumerable: true, writable: true, value: errorMessage };
      }

      if (!descriptors.hasOwnProperty("stack")) {
        descriptors["stack"] = { configurable: true, enumerable: true, writable: true, value: errorStack };
      }
    }

    return descriptors;
  }

  // tslint:disable-next-line:ban-types
  private static inflateObject(type: Function | undefined, value: any) {
    const undefineds = value[RpcMarshalingDirective.Undefined];
    if (undefineds) {
      delete value[RpcMarshalingDirective.Undefined];
    }

    const descriptors = WireFormat.buildDescriptors(value);

    if (undefineds) {
      for (const prop of undefineds) {
        descriptors[prop] = { configurable: true, enumerable: true, writable: true, value: undefined };
      }
    }

    return Object.create(type ? type.prototype : Object.prototype, descriptors);
  }

  private static unmarshalObject(value: any): object {
    const name: string = value[RpcMarshalingDirective.Name];
    delete value[RpcMarshalingDirective.Name];

    WireFormat.checkUnregistered(name, value);

    const type = RpcRegistry.instance.types.get(name);

    const customValue = value[RpcMarshalingDirective.JSON];
    if (customValue) {
      return WireFormat.unmarshalCustom(type, customValue);
    } else {
      const mapInit = value[RpcMarshalingDirective.Map];
      const setInit = value[RpcMarshalingDirective.Set];
      if (mapInit) {
        return new Map(mapInit);
      } else if (setInit) {
        return new Set(setInit);
      } else {
        return WireFormat.inflateObject(type, value);
      }
    }
  }

  private static checkUnregistered(name: string, value: any): void {
    if (RpcConfiguration.strictMode && value[RpcMarshalingDirective.Unregistered]) {
      const [className, typeName] = name.split("_", 2);
      throw new Error(`Cannot unmarshal type "${typeName} for this RPC interface. Ensure this type is listed in ${className}.types or suppress using RpcConfiguration.strictMode.`);
    }

    delete value[RpcMarshalingDirective.Unregistered];
  }

  private static recordClass(value: any, name: string, unregistered: boolean) {
    value[RpcMarshalingDirective.Name] = name;
    value[RpcMarshalingDirective.Unregistered] = unregistered;
  }
}
