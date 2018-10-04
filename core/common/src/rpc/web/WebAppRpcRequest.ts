/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module RpcInterface */

import { IModelError } from "../../IModelError";
import { BentleyStatus } from "@bentley/bentleyjs-core";
import { RpcInterface } from "../../RpcInterface";
import { RpcProtocolEvent, SerializedRpcRequest } from "../core/RpcProtocol";
import { RpcRequest, RpcResponseType } from "../core/RpcRequest";
import { WebAppRpcProtocol, HttpServerRequest, WEB_RPC_CONSTANTS } from "./WebAppRpcProtocol";

const emptyBuffer = new Uint8Array(0);

export type HttpMethod_T = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace";

export class WebAppRpcRequest extends RpcRequest {
  private _loading: boolean = false;
  private _request: RequestInit = {};
  private _responseText: string = "";
  private _responseBytes: Uint8Array = emptyBuffer;
  private _connectionResponse: Response | undefined;

  /** The underlying HTTP connection object. */
  public connection: Promise<Response> | undefined;

  /** The URI path component for this request. */
  public path: string;

  /** The HTTP method for this request. */
  public method: HttpMethod_T;

  /** Convenience access to the protocol of this request. */
  public readonly protocol: WebAppRpcProtocol = this.client.configuration.protocol as any;

  /** Deserializes a request. */
  public static deserialize(protocol: WebAppRpcProtocol, req: HttpServerRequest): SerializedRpcRequest {
    const operation = protocol.getOperationFromPath(req.path);

    const id = req.header(protocol.requestIdHeaderName);
    if (!id)
      throw new IModelError(BentleyStatus.ERROR, `Invalid request.`);

    const authorization = req.header(protocol.authorizationHeaderName) || "";

    return {
      id,
      authorization,
      operation: {
        interfaceDefinition: operation.interfaceDefinition,
        operationName: operation.operationName,
        interfaceVersion: operation.interfaceVersion,
      },
      method: req.method,
      path: req.path,
      parameters: req.body,
    };
  }

  /** Constructs a web application request. */
  public constructor(client: RpcInterface, operation: string, parameters: any[]) {
    super(client, operation, parameters);
    this.path = this.protocol.supplyPathForOperation(this.operation, this);
    this.method = this.protocol.supplyMethodForOperation(this.operation);
  }

  /** Initializes the request communication channel. */
  protected initializeChannel(): void {
    if (this._loading)
      throw new IModelError(BentleyStatus.ERROR, `Loading in progress.`);

    this._request.method = this.method;
    this._request.headers = {};
  }

  /** Sets request header values. */
  protected setHeader(name: string, value: string): void {
    const headers = this._request.headers as { [key: string]: string };
    headers[name] = value;
  }

  /** Sends the request. */
  protected send(): void {
    this._loading = true;
    this._request.body = this.protocol.serialize(this).parameters;
    this.setHeader(WEB_RPC_CONSTANTS.CONTENT, typeof (this._request.body) === "string" ? WEB_RPC_CONSTANTS.TEXT : WEB_RPC_CONSTANTS.BINARY);
    this.connection = fetch(new Request(this.path, this._request));

    this.connection.then(async (response) => {
      if (!this._loading)
        return;

      this._connectionResponse = response;
      this.protocol.events.raiseEvent(RpcProtocolEvent.ResponseLoading, this);

      if (this.getResponseType() === RpcResponseType.Text) {
        this._responseText = await response.text();
      } else if (this.getResponseType() === RpcResponseType.Binary) {
        this._responseBytes = new Uint8Array(await response.arrayBuffer());
      } else {
        throw new IModelError(BentleyStatus.ERROR, "Unknown response type");
      }

      this._loading = false;
      this.setLastUpdatedTime();
      this.protocol.events.raiseEvent(RpcProtocolEvent.ResponseLoaded, this);
    }, (reason) => {
      if (!this._loading)
        return;

      this._loading = false;
      // this.protocol.events.raiseEvent(RpcProtocolEvent.ConnectionAborted, this), reason;
      this.protocol.events.raiseEvent(RpcProtocolEvent.ConnectionErrorReceived, this, reason);
    });
  }

  /** Supplies response status code. */
  public getResponseStatusCode(): number {
    return this._connectionResponse ? this._connectionResponse.status : 0;
  }

  /** Supplies response text. */
  public getResponseText(): string {
    return this._responseText;
  }

  /** Supplies response bytes. */
  public getResponseBytes(): Uint8Array {
    return this._responseBytes;
  }

  /** Supplies response type. */
  public getResponseType(): RpcResponseType {
    if (!this._connectionResponse)
      return RpcResponseType.Unknown;

    const type = this._connectionResponse.headers.get(WEB_RPC_CONSTANTS.CONTENT);
    if (!type)
      return RpcResponseType.Unknown;

    if (type.indexOf(WEB_RPC_CONSTANTS.ANY_TEXT) === 0) {
      return RpcResponseType.Text;
    } else if (type.indexOf(WEB_RPC_CONSTANTS.BINARY) === 0) {
      return RpcResponseType.Binary;
    } else {
      return RpcResponseType.Unknown;
    }
  }
}
