/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module RpcInterface */

import { Id64Set } from "@bentley/bentleyjs-core";
import { IModelDb } from "../IModelDb";
import {
  IModelTileRpcInterface,
  IModelToken,
  TileProps,
  TileId,
  TileTreeProps,
  RpcInterface,
  RpcManager,
} from "@bentley/imodeljs-common";

/** @hidden */
export class IModelTileRpcImpl extends RpcInterface implements IModelTileRpcInterface {
  public static register() { RpcManager.registerImpl(IModelTileRpcInterface, IModelTileRpcImpl); }

  public async getTileTreeProps(iModelToken: IModelToken, ids: Id64Set): Promise<TileTreeProps[]> {
    const db = IModelDb.find(iModelToken);
    const result: TileTreeProps[] = [];
    for (const id of ids) {
      try {
        const props = db.tiles.getTileTreeProps(id);
        result.push(props);
      } catch (error) {
        if (1 === ids.size)
          throw error;
      }
    }

    return result;
  }

  public async getTileProps(_iModelToken: IModelToken, _ids: TileId[]): Promise<TileProps[]> {
    const props: TileProps[] = [];
    return props;
  }
}
