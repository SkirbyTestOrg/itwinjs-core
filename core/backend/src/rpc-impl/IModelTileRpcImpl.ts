/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module RpcInterface */

import { assert, BeDuration, ClientRequestContext, Id64Array, Logger, PerfLogger } from "@bentley/bentleyjs-core";
import { IModelTileRpcInterface, IModelToken, RpcInterface, RpcManager, RpcPendingResponse, TileTreeProps, CloudStorageContainerDescriptor, CloudStorageContainerUrl, TileContentIdentifier, CloudStorageTileCache, IModelTokenProps, RpcInvocation } from "@bentley/imodeljs-common";
import { IModelDb } from "../IModelDb";
import { IModelHost } from "../IModelHost";
import { BackendLoggerCategory } from "../BackendLoggerCategory";
import { PromiseMemoizer, QueryablePromise } from "../PromiseMemoizer";
import { CloudStorageUploadOptions } from "../CloudStorageBackend";

interface TileRequestProps {
  requestContext: ClientRequestContext;
  iModelToken: IModelToken;
  treeId: string;
}

function generateTileRequestKey(props: TileRequestProps): string {
  return `${JSON.stringify(props.iModelToken)}:${props.treeId}`;
}

abstract class TileRequestMemoizer<Result, Props extends TileRequestProps> extends PromiseMemoizer<Result> {
  private readonly _loggerCategory = BackendLoggerCategory.IModelTileRequestRpc;
  protected abstract get _operationName(): string;
  protected abstract addMetadata(metadata: any, props: Props): void;
  protected abstract stringify(props: Props): string;
  protected abstract get _timeoutMilliseconds(): number;

  private makeMetadata(props: Props): any {
    const meta = { ...props.iModelToken };
    this.addMetadata(meta, props);
    return meta;
  }

  protected constructor(memoizeFn: (props: Props) => Promise<Result>, generateKeyFn: (props: Props) => string) {
    super(memoizeFn, generateKeyFn);
  }

  private _superMemoize = this.memoize;
  public memoize = (props: Props): QueryablePromise<Result> => {
    return this._superMemoize(props);
  }

  private _superDeleteMemoized = this.deleteMemoized;
  public deleteMemoized = (props: Props) => {
    this._superDeleteMemoized(props);
  }

  private log(status: string, props: Props): void {
    const descr = this._operationName + "(" + this.stringify(props) + ")";
    Logger.logTrace(this._loggerCategory, "Backend " + status + " " + descr, () => this.makeMetadata(props));
  }

  protected async perform(props: Props): Promise<Result> {
    props.requestContext.enter();
    this.log("received", props);

    const tileQP = this.memoize(props);
    const waitPromise = BeDuration.wait(this._timeoutMilliseconds);

    await Promise.race([tileQP.promise, waitPromise]).catch(() => Promise.resolve());
    // Note: Rejections must be caught so that the memoization entry can be deleted

    props.requestContext.enter();

    if (tileQP.isPending) {
      this.log("issuing pending status for", props);
      throw new RpcPendingResponse();
    }

    this.deleteMemoized(props);

    if (tileQP.isFulfilled) {
      this.log("completed", props);
      return tileQP.result!;
    }

    assert(tileQP.isRejected);
    this.log("rejected", props);
    throw tileQP.error!;
  }
}

async function getTileTreeProps(props: TileRequestProps): Promise<TileTreeProps> {
  const db = IModelDb.find(props.iModelToken);
  return db.tiles.requestTileTreeProps(props.requestContext, props.treeId);
}

class RequestTileTreePropsMemoizer extends TileRequestMemoizer<TileTreeProps, TileRequestProps> {
  protected get _timeoutMilliseconds() { return IModelHost.tileTreeRequestTimeout; }
  protected get _operationName() { return "requestTileTreeProps"; }
  protected stringify(props: TileRequestProps): string { return props.treeId; }
  protected addMetadata(meta: any, props: TileRequestProps): void {
    meta.treeId = props.treeId;
  }

  private static _instance?: RequestTileTreePropsMemoizer;

  private constructor() {
    super(getTileTreeProps, generateTileRequestKey);
  }

  public static async perform(props: TileRequestProps): Promise<TileTreeProps> {
    if (undefined === this._instance)
      this._instance = new RequestTileTreePropsMemoizer();

    return this._instance.perform(props);
  }
}

interface TileContentRequestProps extends TileRequestProps {
  contentId: string;
}

async function getTileContent(props: TileContentRequestProps): Promise<Uint8Array> {
  const db = IModelDb.find(props.iModelToken);
  return db.tiles.requestTileContent(props.requestContext, props.treeId, props.contentId);
}

function generateTileContentKey(props: TileContentRequestProps): string {
  return generateTileRequestKey(props) + `:${props.contentId}`;
}

class RequestTileContentMemoizer extends TileRequestMemoizer<Uint8Array, TileContentRequestProps> {
  protected get _timeoutMilliseconds() { return IModelHost.tileContentRequestTimeout; }
  protected get _operationName() { return "requestTileContent"; }
  protected stringify(props: TileContentRequestProps): string { return props.treeId + ":" + props.contentId; }
  protected addMetadata(meta: any, props: TileContentRequestProps): void {
    meta.treeId = props.treeId;
    meta.contentId = props.contentId;
  }

  private static _instance?: RequestTileContentMemoizer;

  private constructor() {
    super(getTileContent, generateTileContentKey);
  }

  public static async perform(props: TileContentRequestProps): Promise<Uint8Array> {
    if (undefined === this._instance)
      this._instance = new RequestTileContentMemoizer();

    return this._instance.perform(props);
  }
}

/** @internal */
export class IModelTileRpcImpl extends RpcInterface implements IModelTileRpcInterface {
  public static register() { RpcManager.registerImpl(IModelTileRpcInterface, IModelTileRpcImpl); }

  public async requestTileTreeProps(tokenProps: IModelTokenProps, treeId: string): Promise<TileTreeProps> {
    const requestContext = ClientRequestContext.current;
    const iModelToken = IModelToken.fromJSON(tokenProps);
    return RequestTileTreePropsMemoizer.perform({ requestContext, iModelToken, treeId });
  }

  public async purgeTileTrees(tokenProps: IModelTokenProps, modelIds: Id64Array | undefined): Promise<void> {
    // `undefined` gets forwarded as `null`...
    if (null === modelIds)
      modelIds = undefined;

    const token = IModelToken.fromJSON(tokenProps);
    const db = IModelDb.find(token);
    return db.nativeDb.purgeTileTrees(modelIds);
  }

  public async requestTileContent(tokenProps: IModelTokenProps, treeId: string, contentId: string, _unused?: () => boolean, guid?: string): Promise<Uint8Array> {
    const requestContext = ClientRequestContext.current;
    const iModelToken = IModelToken.fromJSON(tokenProps);
    const content = await RequestTileContentMemoizer.perform({ requestContext, iModelToken, treeId, contentId });

    // ###TODO: Verify the guid supplied by the front-end matches the guid stored in the model?
    this.cacheTile(tokenProps, treeId, contentId, content, guid);
    return content;
  }

  public async getTileCacheContainerUrl(_tokenProps: IModelTokenProps, id: CloudStorageContainerDescriptor): Promise<CloudStorageContainerUrl> {
    const invocation = RpcInvocation.current(this);

    if (!IModelHost.usingExternalTileCache) {
      return CloudStorageContainerUrl.empty();
    }

    const expiry = CloudStorageTileCache.getCache().supplyExpiryForContainerUrl(id);
    const clientIp = (IModelHost.restrictTileUrlsByClientIp && invocation.request.ip) ? invocation.request.ip : undefined;
    return IModelHost.tileCacheService.obtainContainerUrl(id, expiry, clientIp);
  }

  private cacheTile(tokenProps: IModelTokenProps, treeId: string, contentId: string, content: Uint8Array, guid: string | undefined) {
    if (!IModelHost.usingExternalTileCache) {
      return;
    }

    const iModelToken = IModelToken.fromJSON(tokenProps);
    const id: TileContentIdentifier = { iModelToken, treeId, contentId, guid };

    setTimeout(async () => {
      try {
        const cache = CloudStorageTileCache.getCache();

        const options: CloudStorageUploadOptions = {};
        if (IModelHost.compressCachedTiles) {
          options.contentEncoding = "gzip";
        }
        const perfInfo = { ...iModelToken, treeId, contentId, size: content.byteLength, compress: IModelHost.compressCachedTiles };
        const perfLogger = new PerfLogger("Uploading tile to external tile cache", () => perfInfo);
        await IModelHost.tileCacheService.upload(cache.formContainerName(id), cache.formResourceName(id), content, options);
        perfLogger.dispose();
      } catch (err) {
        Logger.logError(BackendLoggerCategory.IModelTileUpload, (err instanceof Error) ? err.toString() : JSON.stringify(err));
      }
    });
  }
}
