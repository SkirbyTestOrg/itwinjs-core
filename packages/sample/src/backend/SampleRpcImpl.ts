/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import SampleRpcInterface from "../common/SampleRpcInterface";
import { RpcManager } from "@bentley/imodeljs-common";
import { IModelHost } from "@bentley/imodeljs-backend";
import * as fs from "fs";
import * as path from "path";

/** The backend implementation of SampleRpcInterface. */
export default class SampleRpcImpl extends SampleRpcInterface {

  private getAssetsDir(): string {
    if (IModelHost.appAssetsDir)
      return IModelHost.appAssetsDir;
    return "assets";
  }

  public async getSampleImodels(): Promise<string[]> {
    const dir = path.join(this.getAssetsDir(), "sample_documents");
    const files = fs.readdirSync(dir);
    return files.map((name: string) => (path.resolve(dir, name)));
  }

}

/** Auto-register the impl when this file is included. */
RpcManager.registerImpl(SampleRpcInterface, SampleRpcImpl);
