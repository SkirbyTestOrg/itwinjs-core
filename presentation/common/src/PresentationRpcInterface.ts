/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module RPC */

import { Id64 } from "@bentley/bentleyjs-core";
import { RpcInterface, IModelToken } from "@bentley/imodeljs-common";
import { Ruleset } from "./rules";
import { NodeKey, Node, NodePathElement } from "./hierarchy";
import { SelectionInfo, Descriptor, Content, Field, Item, PropertiesField, NestedContentField } from "./content";
import { HierarchyRequestOptions, ContentRequestOptions, Paged } from "./IPresentationManager";
import { VariableValueTypes, VariableValue } from "./IRulesetVariablesManager";
import KeySet from "./KeySet";
import { InstanceKey } from "./EC";

export interface RpcRequestOptions {
  knownBackendIds: string[];
  clientId?: string;
}
export type HierarchyRpcRequestOptions = RpcRequestOptions & HierarchyRequestOptions<IModelToken>;
export type ContentRpcRequestOptions = RpcRequestOptions & ContentRequestOptions<IModelToken>;
export type RulesetRpcRequestOptions = RpcRequestOptions;
export type RulesetVariableRpcRequestOptions = RpcRequestOptions & { rulesetId: string };

/** Interface used for communication between Presentation backend and frontend. */
export default class PresentationRpcInterface extends RpcInterface {
  // developer note: It's called an interface but actually it's a real implemented
  // frontend-specific class. It's setup that way to keep consistency with imodeljs-core.

  /** The version of the interface. */
  public static version = "1.0.0";

  /** The types that can be marshaled by the interface. */
  /* istanbul ignore next */
  public static types = () => [
    Descriptor,
    Content,
    Field,
    PropertiesField,
    NestedContentField,
    Item,
    Id64,
  ]

  /** See [[PresentationManager.getRootNodes]] */
  public getRootNodes(_options: Paged<HierarchyRpcRequestOptions>): Promise<Node[]> { return this.forward.apply(this, arguments); }
  /** See [[PresentationManager.getRootNodesCount]] */
  public getRootNodesCount(_options: HierarchyRpcRequestOptions): Promise<number> { return this.forward.apply(this, arguments); }
  /** See [[PresentationManager.getChildren]] */
  public getChildren(_options: Paged<HierarchyRpcRequestOptions>, _parentKey: Readonly<NodeKey>): Promise<Node[]> { return this.forward.apply(this, arguments); }
  /** See [[PresentationManager.getChildrenCount]] */
  public getChildrenCount(_options: HierarchyRpcRequestOptions, _parentKey: Readonly<NodeKey>): Promise<number> { return this.forward.apply(this, arguments); }
  /** See [[PresentationManager.getNodePaths]] */
  public getNodePaths(_options: HierarchyRpcRequestOptions, _paths: InstanceKey[][], _markedIndex: number): Promise<NodePathElement[]> { return this.forward.apply(this, arguments); }
  /** See [[PresentationManager.getFilteredNodePaths]] */
  public getFilteredNodePaths(_options: HierarchyRpcRequestOptions, _filterText: string): Promise<NodePathElement[]> { return this.forward.apply(this, arguments); }

  /** See [[PresentationManager.getContentDescriptor]] */
  public getContentDescriptor(_options: ContentRpcRequestOptions, _displayType: string, _keys: Readonly<KeySet>, _selection: Readonly<SelectionInfo> | undefined): Promise<Descriptor | undefined> { return this.forward.apply(this, arguments); }
  /** See [[PresentationManager.getContentSetSize]] */
  public getContentSetSize(_options: ContentRpcRequestOptions, _descriptor: Readonly<Descriptor>, _keys: Readonly<KeySet>): Promise<number> { return this.forward.apply(this, arguments); }
  /** See [[PresentationManager.getContent]] */
  public getContent(_options: ContentRpcRequestOptions, _descriptor: Readonly<Descriptor>, _keys: Readonly<KeySet>): Promise<Content> { return this.forward.apply(this, arguments); }
  /** See [[PresentationManager.getDistinctValues]] */
  public getDistinctValues(_options: ContentRpcRequestOptions, _descriptor: Readonly<Descriptor>, _keys: Readonly<KeySet>, _fieldName: string, _maximumValueCount: number): Promise<string[]> { return this.forward.apply(this, arguments); }

  /** See [[IRulesetManager.get]] */
  public getRuleset(_options: RulesetRpcRequestOptions, _rulesetId: string): Promise<[Ruleset, string] | undefined> { return this.forward.apply(this, arguments); }
  /** See [[IRulesetManager.add]] */
  public addRuleset(_options: RulesetRpcRequestOptions, _ruleset: Ruleset): Promise<string> { return this.forward.apply(this, arguments); }
  /** See [[IRulesetManager.add]] */
  public addRulesets(_options: RulesetRpcRequestOptions, _rulesets: Ruleset[]): Promise<string[]> { return this.forward.apply(this, arguments); }
  /** See [[IRulesetManager.remove]] */
  public removeRuleset(_options: RulesetRpcRequestOptions, _rulesetId: string, _hash: string): Promise<boolean> { return this.forward.apply(this, arguments); }
  /** See [[IRulesetManager.clear]] */
  public clearRulesets(_options: RulesetRpcRequestOptions): Promise<void> { return this.forward.apply(this, arguments); }

  /** Retrieves ruleset variable value */
  public getRulesetVariableValue(_options: RulesetVariableRpcRequestOptions, _id: string, _type: VariableValueTypes): Promise<VariableValue> { return this.forward.apply(this, arguments); }
  /** Sets ruleset variable value */
  public setRulesetVariableValue(_options: RulesetVariableRpcRequestOptions, _id: string, _type: VariableValueTypes, _value: VariableValue): Promise<void> { return this.forward.apply(this, arguments); }
  /** Sets multiple ruleset variable values */
  public setRulesetVariableValues(_options: RulesetVariableRpcRequestOptions, _values: Array<[string, VariableValueTypes, VariableValue]>): Promise<void> { return this.forward.apply(this, arguments); }
}
