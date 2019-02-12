/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module RpcInterface */
import { RpcInterface, RpcManager, IModelToken } from "@bentley/imodeljs-common";
import { IModelUnitTestRpcInterface } from "../common/IModelUnitTestRpcInterface"; // not part of the "barrel"
import { IModelDb } from "@bentley/imodeljs-backend";

/**
 * The backend implementation of IModelUnitTestRpcInterface.
 * @hidden
 */
export class IModelUnitTestRpcImpl extends RpcInterface implements IModelUnitTestRpcInterface {
  public static register() { RpcManager.registerImpl(IModelUnitTestRpcInterface, IModelUnitTestRpcImpl); }
  public async executeTest(iModelToken: IModelToken, testName: string, params: any): Promise<any> { return JSON.parse(IModelDb.find(iModelToken).nativeDb.executeTest(testName, JSON.stringify(params))); }
}
