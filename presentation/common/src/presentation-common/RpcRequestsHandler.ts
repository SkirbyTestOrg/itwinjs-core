/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RPC
 */

import { Guid, Id64String, IDisposable } from "@bentley/bentleyjs-core";
import { IModelRpcProps, RpcManager } from "@bentley/imodeljs-common";
import { DescriptorJSON } from "./content/Descriptor";
import { ItemJSON } from "./content/Item";
import { DisplayValueGroupJSON } from "./content/Value";
import { InstanceKeyJSON } from "./EC";
import { PresentationError, PresentationStatus } from "./Error";
import { NodeKeyJSON } from "./hierarchy/Key";
import { NodeJSON } from "./hierarchy/Node";
import { NodePathElementJSON } from "./hierarchy/NodePathElement";
import { KeySetJSON } from "./KeySet";
import { LabelDefinitionJSON } from "./LabelDefinition";
import {
  ContentDescriptorRequestOptions, ContentRequestOptions, DisplayLabelRequestOptions, DisplayLabelsRequestOptions, DistinctValuesRequestOptions,
  ExtendedContentRequestOptions, ExtendedHierarchyRequestOptions, HierarchyRequestOptions, Paged, PresentationDataCompareOptions,
  SelectionScopeRequestOptions,
} from "./PresentationManagerOptions";
import { PresentationRpcInterface, PresentationRpcRequestOptions, PresentationRpcResponse } from "./PresentationRpcInterface";
import { SelectionScope } from "./selection/SelectionScope";
import { PartialHierarchyModificationJSON } from "./Update";
import { Omit, PagedResponse } from "./Utils";

/**
 * Configuration parameters for [[RpcRequestsHandler]].
 *
 * @internal
 */
export interface RpcRequestsHandlerProps {
  /**
   * Optional ID used to identify client that requests data. If not specified,
   * the handler creates a unique GUID as a client id.
   * @internal
   */
  clientId?: string;
}

/**
 * RPC requests handler that wraps [[PresentationRpcInterface]] and
 * adds handling for cases when backend needs to be synced with client
 * state.
 *
 * @internal
 */
export class RpcRequestsHandler implements IDisposable {
  private _maxRequestRepeatCount: number = 10;

  /** ID that identifies this handler as a client */
  public readonly clientId: string;

  public constructor(props?: RpcRequestsHandlerProps) {
    this.clientId = (props && props.clientId) ? props.clientId : Guid.createValue();
  }

  public dispose() {
  }

  // tslint:disable-next-line:naming-convention
  private get rpcClient(): PresentationRpcInterface { return RpcManager.getClientForInterface(PresentationRpcInterface); }

  private injectClientId<T>(options: T): PresentationRpcRequestOptions<T> {
    return {
      ...options,
      clientId: this.clientId,
    };
  }

  private async requestRepeatedly<TResult, TOptions extends PresentationRpcRequestOptions<unknown>>(func: (opts: TOptions) => PresentationRpcResponse<TResult>, options: TOptions, repeatCount: number = 1): Promise<TResult> {
    const response = await func(options);

    if (response.statusCode === PresentationStatus.Success)
      return response.result!;

    if (response.statusCode === PresentationStatus.BackendTimeout && repeatCount < this._maxRequestRepeatCount) {
      repeatCount++;
      return this.requestRepeatedly(func, options, repeatCount);
    }

    throw new PresentationError(response.statusCode, response.errorMessage);
  }

  /**
   * Send request to current backend. If the backend is unknown to the requestor,
   * the request is rejected with `PresentationStatus.UnknownBackend` status. In
   * such case the client is synced with the backend using registered `syncHandlers`
   * and the request is repeated.
   *
   * @internal
   */
  public async request<TResult, TOptions extends { imodel: IModelRpcProps }, TArg = any>(
    context: any,
    func: (token: IModelRpcProps, options: PresentationRpcRequestOptions<Omit<TOptions, "imodel">>, ...args: TArg[]) => PresentationRpcResponse<TResult>,
    options: TOptions,
    ...args: TArg[]): Promise<TResult> {
    type TFuncOptions = PresentationRpcRequestOptions<Omit<TOptions, "imodel">>;
    const { imodel, ...rpcOptions } = options;
    const doRequest = async (funcOptions: TFuncOptions) => func.apply(context, [imodel, funcOptions, ...args]);
    return this.requestRepeatedly(doRequest, this.injectClientId(rpcOptions));
  }

  public async getNodesCount(options: ExtendedHierarchyRequestOptions<IModelRpcProps, NodeKeyJSON>): Promise<number> {
    return this.request<number, ExtendedHierarchyRequestOptions<IModelRpcProps, NodeKeyJSON>>(
      this.rpcClient, this.rpcClient.getNodesCount, options); // tslint:disable-line:deprecation - false positive
  }
  public async getPagedNodes(options: Paged<ExtendedHierarchyRequestOptions<IModelRpcProps, NodeKeyJSON>>): Promise<PagedResponse<NodeJSON>> {
    return this.request<PagedResponse<NodeJSON>, Paged<ExtendedHierarchyRequestOptions<IModelRpcProps, NodeKeyJSON>>>(
      this.rpcClient, this.rpcClient.getPagedNodes, options);
  }

  public async getNodePaths(options: HierarchyRequestOptions<IModelRpcProps>, paths: InstanceKeyJSON[][], markedIndex: number): Promise<NodePathElementJSON[]> {
    return this.request<NodePathElementJSON[], HierarchyRequestOptions<IModelRpcProps>>(
      this.rpcClient, this.rpcClient.getNodePaths, options, paths, markedIndex);
  }
  public async getFilteredNodePaths(options: HierarchyRequestOptions<IModelRpcProps>, filterText: string): Promise<NodePathElementJSON[]> {
    return this.request<NodePathElementJSON[], HierarchyRequestOptions<IModelRpcProps>>(
      this.rpcClient, this.rpcClient.getFilteredNodePaths, options, filterText);
  }

  public async loadHierarchy(options: HierarchyRequestOptions<IModelRpcProps>): Promise<void> {
    return this.request<void, HierarchyRequestOptions<IModelRpcProps>>(
      this.rpcClient, this.rpcClient.loadHierarchy, options);
  }

  public async getContentDescriptor(options: ContentDescriptorRequestOptions<IModelRpcProps, KeySetJSON>): Promise<DescriptorJSON | undefined> {
    return this.request<DescriptorJSON | undefined, ContentDescriptorRequestOptions<IModelRpcProps, KeySetJSON>>(
      this.rpcClient, this.rpcClient.getContentDescriptor, options); // tslint:disable-line:deprecation - false positive
  }
  public async getContentSetSize(options: ExtendedContentRequestOptions<IModelRpcProps, DescriptorJSON, KeySetJSON>): Promise<number> {
    return this.request<number, ExtendedContentRequestOptions<IModelRpcProps, DescriptorJSON, KeySetJSON>>(
      this.rpcClient, this.rpcClient.getContentSetSize, options); // tslint:disable-line:deprecation - false positive
  }
  public async getPagedContent(options: Paged<ExtendedContentRequestOptions<IModelRpcProps, DescriptorJSON, KeySetJSON>>) {
    return this.request<{ descriptor: DescriptorJSON, contentSet: PagedResponse<ItemJSON> } | undefined, Paged<ExtendedContentRequestOptions<IModelRpcProps, DescriptorJSON, KeySetJSON>>>(
      this.rpcClient, this.rpcClient.getPagedContent, options);
  }
  public async getPagedContentSet(options: Paged<ExtendedContentRequestOptions<IModelRpcProps, DescriptorJSON, KeySetJSON>>) {
    return this.request<PagedResponse<ItemJSON>, Paged<ExtendedContentRequestOptions<IModelRpcProps, DescriptorJSON, KeySetJSON>>>(
      this.rpcClient, this.rpcClient.getPagedContentSet, options);
  }

  public async getDistinctValues(options: ContentRequestOptions<IModelRpcProps>, descriptor: DescriptorJSON, keys: KeySetJSON, fieldName: string, maximumValueCount: number): Promise<string[]> {
    return this.request<string[], ContentRequestOptions<IModelRpcProps>>(
      this.rpcClient, this.rpcClient.getDistinctValues, options, descriptor, keys, fieldName, maximumValueCount);
  }
  public async getPagedDistinctValues(options: DistinctValuesRequestOptions<IModelRpcProps, DescriptorJSON, KeySetJSON>): Promise<PagedResponse<DisplayValueGroupJSON>> {
    return this.request<PagedResponse<DisplayValueGroupJSON>, DistinctValuesRequestOptions<IModelRpcProps, DescriptorJSON, KeySetJSON>>(
      this.rpcClient, this.rpcClient.getPagedDistinctValues, options);
  }

  public async getDisplayLabelDefinition(options: DisplayLabelRequestOptions<IModelRpcProps, InstanceKeyJSON>): Promise<LabelDefinitionJSON> {
    return this.request<LabelDefinitionJSON, DisplayLabelRequestOptions<IModelRpcProps, InstanceKeyJSON>, any>(
      this.rpcClient, this.rpcClient.getDisplayLabelDefinition, options); // tslint:disable-line:deprecation - false positive
  }
  public async getPagedDisplayLabelDefinitions(options: DisplayLabelsRequestOptions<IModelRpcProps, InstanceKeyJSON>): Promise<PagedResponse<LabelDefinitionJSON>> {
    return this.request<PagedResponse<LabelDefinitionJSON>, DisplayLabelsRequestOptions<IModelRpcProps, InstanceKeyJSON>, any>(
      this.rpcClient, this.rpcClient.getPagedDisplayLabelDefinitions, options);
  }

  public async getSelectionScopes(options: SelectionScopeRequestOptions<IModelRpcProps>): Promise<SelectionScope[]> {
    return this.request<SelectionScope[], SelectionScopeRequestOptions<IModelRpcProps>>(
      this.rpcClient, this.rpcClient.getSelectionScopes, options);
  }
  public async computeSelection(options: SelectionScopeRequestOptions<IModelRpcProps>, ids: Id64String[], scopeId: string): Promise<KeySetJSON> {
    return this.request<KeySetJSON, SelectionScopeRequestOptions<IModelRpcProps>>(
      this.rpcClient, this.rpcClient.computeSelection, options, ids, scopeId);
  }
  public async compareHierarchies(options: PresentationDataCompareOptions<IModelRpcProps, NodeKeyJSON>): Promise<PartialHierarchyModificationJSON[]> {
    return this.request<PartialHierarchyModificationJSON[], PresentationDataCompareOptions<IModelRpcProps, NodeKeyJSON>>(
      this.rpcClient, this.rpcClient.compareHierarchies, options);
  }
}
