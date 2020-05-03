/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RPC
 */

import { ClientRequestContext, Id64String, Logger } from "@bentley/bentleyjs-core";
import { IModelDb } from "@bentley/imodeljs-backend";
import { IModelRpcProps } from "@bentley/imodeljs-common";
import {
  ContentJSON, ContentRpcRequestOptions, Descriptor, DescriptorJSON, DescriptorOverrides, HierarchyRpcRequestOptions, InstanceKey, InstanceKeyJSON,
  KeySet, KeySetJSON, LabelDefinition, LabelDefinitionJSON, LabelRpcRequestOptions, Node, NodeJSON, NodeKey, NodeKeyJSON, NodePathElement,
  NodePathElementJSON, Paged, PartialHierarchyModification, PartialHierarchyModificationJSON, PresentationDataCompareRpcOptions, PresentationError,
  PresentationRpcInterface, PresentationRpcResponse, PresentationStatus, Ruleset, SelectionInfo, SelectionScope, SelectionScopeRpcRequestOptions,
} from "@bentley/presentation-common";
import { Presentation } from "./Presentation";
import { PresentationManager } from "./PresentationManager";

type ContentGetter<TResult = any> = (requestContext: ClientRequestContext, requestOptions: any) => TResult;

/**
 * The backend implementation of PresentationRpcInterface. All it's basically
 * responsible for is forwarding calls to [[Presentation.manager]].
 *
 * Consumers should not use this class. Instead, they should register
 * [PresentationRpcInterface]($presentation-common):
 * ``` ts
 * [[include:Backend.Initialization.RpcInterface]]
 * ```
 *
 * @internal
 */
export class PresentationRpcImpl extends PresentationRpcInterface {

  public constructor(_id?: string) {
    super();
  }

  /**
   * Get the maximum result waiting time.
   */
  public get requestTimeout(): number { return Presentation.getRequestTimeout(); }

  /** Returns an ok response with result inside */
  private successResponse<TResult>(result: TResult) {
    return {
      statusCode: PresentationStatus.Success,
      result,
    };
  }

  /** Returns a bad request response with empty result and an error code */
  private errorResponse(errorCode: PresentationStatus, errorMessage?: string) {
    return {
      statusCode: errorCode,
      result: undefined,
      errorMessage,
    };
  }

  /**
   * Get the [[PresentationManager]] used by this RPC impl.
   */
  public getManager(clientId?: string): PresentationManager {
    return Presentation.getManager(clientId);
  }

  private getIModel(token: IModelRpcProps): IModelDb {
    let imodel: IModelDb;
    try {
      imodel = IModelDb.findByKey(token.key);
    } catch {
      throw new PresentationError(PresentationStatus.InvalidArgument, "IModelRpcProps doesn't point to a valid iModel");
    }
    return imodel;
  }

  private async makeRequest<TOptions extends { rulesetOrId?: Ruleset | string, clientId?: string }, TResult>(token: IModelRpcProps, requestOptions: TOptions, request: ContentGetter<Promise<TResult>>): PresentationRpcResponse<TResult> {
    const requestContext = ClientRequestContext.current;
    let imodel: IModelDb;
    try {
      imodel = this.getIModel(token);
    } catch (e) {
      return this.errorResponse((e as PresentationError).errorNumber, (e as PresentationError).message);
    }

    const { clientId, ...options } = requestOptions;
    const resultPromise = request(requestContext, { ...options, imodel })
      .then((result: TResult) => this.successResponse(result))
      .catch((e: PresentationError) => this.errorResponse(e.errorNumber, e.message));

    if (this.requestTimeout === 0)
      return resultPromise;

    let timeout: NodeJS.Timeout;
    const timeoutPromise = new Promise<any>((_resolve, reject) => {
      timeout = setTimeout(() => {
        reject("Timed out");
      }, this.requestTimeout);
    });

    return Promise.race([resultPromise, timeoutPromise])
      .catch(() => this.errorResponse(PresentationStatus.BackendTimeout))
      .finally(() => clearTimeout(timeout));
  }

  public async getNodesAndCount(token: IModelRpcProps, requestOptions: Paged<HierarchyRpcRequestOptions>, parentKey?: NodeKeyJSON) {
    return this.makeRequest(token, requestOptions, async (requestContext, options) => {
      const result = await this.getManager(requestOptions.clientId).getNodesAndCount(requestContext, options, nodeKeyFromJson(parentKey));
      requestContext.enter();
      return { ...result, nodes: result.nodes.map(Node.toJSON) };
    });
  }

  public async getNodes(token: IModelRpcProps, requestOptions: Paged<HierarchyRpcRequestOptions>, parentKey?: NodeKeyJSON): PresentationRpcResponse<NodeJSON[]> {
    return this.makeRequest(token, requestOptions, async (requestContext, options) => {
      const nodes = await this.getManager(requestOptions.clientId).getNodes(requestContext, options, nodeKeyFromJson(parentKey));
      requestContext.enter();
      return nodes.map(Node.toJSON);
    });
  }

  public async getNodesCount(token: IModelRpcProps, requestOptions: HierarchyRpcRequestOptions, parentKey?: NodeKeyJSON): PresentationRpcResponse<number> {
    return this.makeRequest(token, requestOptions, async (requestContext, options) =>
      this.getManager(requestOptions.clientId).getNodesCount(requestContext, options, nodeKeyFromJson(parentKey)),
    );
  }

  public async getNodePaths(token: IModelRpcProps, requestOptions: HierarchyRpcRequestOptions, paths: InstanceKeyJSON[][], markedIndex: number): PresentationRpcResponse<NodePathElementJSON[]> {
    return this.makeRequest(token, requestOptions, async (requestContext, options) => {
      const result = await this.getManager(requestOptions.clientId).getNodePaths(requestContext, options, paths, markedIndex);
      requestContext.enter();
      return result.map(NodePathElement.toJSON);
    });
  }

  public async getFilteredNodePaths(token: IModelRpcProps, requestOptions: HierarchyRpcRequestOptions, filterText: string): PresentationRpcResponse<NodePathElementJSON[]> {
    return this.makeRequest(token, requestOptions, async (requestContext, options) => {
      const result = await this.getManager(requestOptions.clientId).getFilteredNodePaths(requestContext, options, filterText);
      requestContext.enter();
      return result.map(NodePathElement.toJSON);
    });
  }

  public async loadHierarchy(token: IModelRpcProps, requestOptions: HierarchyRpcRequestOptions): PresentationRpcResponse<void> {
    return this.makeRequest(token, requestOptions, async (requestContext, options) => {
      const manager = this.getManager(requestOptions.clientId);
      // note: we intentionally don't await here - don't want frontend waiting for this task to complete
      // tslint:disable-next-line:no-floating-promises
      manager.loadHierarchy(requestContext, options)
        .catch((e) => Logger.logWarning("Presentation", `Error loading '${manager.getRulesetId(requestOptions.rulesetOrId)}' hierarchy: ${e}`));
    });
  }

  public async getContentDescriptor(token: IModelRpcProps, requestOptions: ContentRpcRequestOptions, displayType: string, keys: KeySetJSON, selection: SelectionInfo | undefined): PresentationRpcResponse<DescriptorJSON | undefined> {
    return this.makeRequest(token, requestOptions, async (requestContext, options) => {
      const descriptor = await this.getManager(requestOptions.clientId).getContentDescriptor(requestContext, options, displayType, KeySet.fromJSON(keys), selection);
      requestContext.enter();
      if (descriptor)
        return descriptor.toJSON();
      return undefined;
    });
  }

  public async getContentSetSize(token: IModelRpcProps, requestOptions: ContentRpcRequestOptions, descriptorOrOverrides: DescriptorJSON | DescriptorOverrides, keys: KeySetJSON): PresentationRpcResponse<number> {
    return this.makeRequest(token, requestOptions, async (requestContext, options) =>
      this.getManager(requestOptions.clientId).getContentSetSize(requestContext, options, descriptorFromJson(descriptorOrOverrides), KeySet.fromJSON(keys)),
    );
  }

  public async getContentAndSize(token: IModelRpcProps, requestOptions: ContentRpcRequestOptions, descriptorOrOverrides: DescriptorJSON | DescriptorOverrides, keys: KeySetJSON) {
    return this.makeRequest(token, requestOptions, async (requestContext, options) => {
      const result = await this.getManager(requestOptions.clientId).getContentAndSize(requestContext, options, descriptorFromJson(descriptorOrOverrides), KeySet.fromJSON(keys));
      requestContext.enter();
      if (result.content)
        return { ...result, content: result.content.toJSON() };
      return { ...result, content: undefined };
    });
  }

  public async getContent(token: IModelRpcProps, requestOptions: Paged<ContentRpcRequestOptions>, descriptorOrOverrides: DescriptorJSON | DescriptorOverrides, keys: KeySetJSON): PresentationRpcResponse<ContentJSON | undefined> {
    return this.makeRequest(token, requestOptions, async (requestContext, options) => {
      const content = await this.getManager(requestOptions.clientId).getContent(requestContext, options, descriptorFromJson(descriptorOrOverrides), KeySet.fromJSON(keys));
      requestContext.enter();
      if (content)
        return content.toJSON();
      return undefined;
    });
  }

  public async getDistinctValues(token: IModelRpcProps, requestOptions: ContentRpcRequestOptions, descriptor: DescriptorJSON, keys: KeySetJSON, fieldName: string, maximumValueCount: number): PresentationRpcResponse<string[]> {
    return this.makeRequest(token, requestOptions, async (requestContext, options) =>
      this.getManager(requestOptions.clientId).getDistinctValues(requestContext, options, Descriptor.fromJSON(descriptor)!, KeySet.fromJSON(keys), fieldName, maximumValueCount),
    );
  }

  public async getDisplayLabelDefinition(token: IModelRpcProps, requestOptions: LabelRpcRequestOptions, key: InstanceKeyJSON): PresentationRpcResponse<LabelDefinitionJSON> {
    return this.makeRequest(token, requestOptions, async (requestContext, options) => {
      const label = await this.getManager(requestOptions.clientId).getDisplayLabelDefinition(requestContext, options, InstanceKey.fromJSON(key));
      requestContext.enter();
      return LabelDefinition.toJSON(label);
    });
  }

  public async getDisplayLabelDefinitions(token: IModelRpcProps, requestOptions: LabelRpcRequestOptions, keys: InstanceKeyJSON[]): PresentationRpcResponse<LabelDefinitionJSON[]> {
    return this.makeRequest(token, requestOptions, async (requestContext, options) => {
      const labels = await this.getManager(requestOptions.clientId).getDisplayLabelDefinitions(requestContext, options, keys.map(InstanceKey.fromJSON));
      requestContext.enter();
      return labels.map(LabelDefinition.toJSON);
    });
  }

  public async getSelectionScopes(token: IModelRpcProps, requestOptions: SelectionScopeRpcRequestOptions): PresentationRpcResponse<SelectionScope[]> {
    return this.makeRequest(token, requestOptions, async (requestContext, options) =>
      this.getManager(requestOptions.clientId).getSelectionScopes(requestContext, options),
    );
  }

  public async computeSelection(token: IModelRpcProps, requestOptions: SelectionScopeRpcRequestOptions, ids: Id64String[], scopeId: string): PresentationRpcResponse<KeySetJSON> {
    return this.makeRequest(token, requestOptions, async (requestContext, options) => {
      const keys = await this.getManager(requestOptions.clientId).computeSelection(requestContext, options, ids, scopeId);
      requestContext.enter();
      return keys.toJSON();
    });
  }

  public async compareHierarchies(token: IModelRpcProps, requestOptions: PresentationDataCompareRpcOptions): PresentationRpcResponse<PartialHierarchyModificationJSON[]> {
    return this.makeRequest(token, requestOptions, async (requestContext, options) =>
      (await this.getManager(requestOptions.clientId).compareHierarchies(requestContext, options))
        .map(PartialHierarchyModification.toJSON),
    );
  }
}

const nodeKeyFromJson = (json: NodeKeyJSON | undefined): NodeKey | undefined => {
  if (!json)
    return undefined;
  return NodeKey.fromJSON(json);
};

const descriptorFromJson = (json: DescriptorJSON | DescriptorOverrides): Descriptor | DescriptorOverrides => {
  if ((json as DescriptorJSON).connectionId)
    return Descriptor.fromJSON(json as DescriptorJSON)!;
  return json as DescriptorOverrides;
};
