/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module RpcInterface */

import { AccessToken } from "@bentley/imodeljs-clients";
import { Point3d } from "@bentley/geometry-core";
import { RpcInterface } from "../RpcInterface";
import { RpcManager } from "../RpcManager";
import { IModel, IModelToken } from "../IModel";
import { AxisAlignedBox3d } from "../geometry/Primitives";
import { IModelNotFoundResponse } from "./IModelReadRpcInterface";

/**
 * The RPC interface for writing to an iModel.
 * All operations require read+write access.
 * This interface is not normally used directly. See IModelConnection for higher-level and more convenient API for accessing iModels from a frontend.
 */
export abstract class IModelWriteRpcInterface extends RpcInterface {
  /** The types that can be marshaled by the interface. */
  public static types = () => [
    AccessToken,
    AxisAlignedBox3d,
    IModelToken,
    Point3d,
    IModelNotFoundResponse,
  ]

  /** Returns the IModelWriteRpcInterface client instance for the frontend. */
  public static getClient(): IModelWriteRpcInterface { return RpcManager.getClientForInterface(IModelWriteRpcInterface); }

  /** The version of the interface. */
  public static version = "0.2.0";

  /*===========================================================================================
      NOTE: Any add/remove/change to the methods below requires an update of the interface version.
      NOTE: Please consult the README in this folder for the semantic versioning rules.
  ===========================================================================================*/
  public async openForWrite(_accessToken: AccessToken, _iModelToken: IModelToken): Promise<IModel> { return this.forward(arguments); }
  public async saveChanges(_iModelToken: IModelToken, _description?: string): Promise<void> { return this.forward(arguments); }
  public async updateProjectExtents(_iModelToken: IModelToken, _newExtents: AxisAlignedBox3d): Promise<void> { return this.forward(arguments); }
  public async saveThumbnail(_iModelToken: IModelToken, _val: Uint8Array): Promise<void> { return this.forward(arguments); }
}
