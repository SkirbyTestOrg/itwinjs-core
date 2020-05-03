/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import * as hash from "object-hash";
import * as path from "path";
import { ClientRequestContext, Id64String, Logger } from "@bentley/bentleyjs-core";
import { BriefcaseDb, EventSink, EventSinkManager, IModelDb, IModelHost } from "@bentley/imodeljs-backend";
import {
  Content, ContentFlags, ContentRequestOptions, DefaultContentDisplayTypes, Descriptor, DescriptorOverrides, getLocalesDirectory,
  HierarchyRequestOptions, InstanceKey, KeySet, LabelDefinition, LabelRequestOptions, Node, NodeKey, NodePathElement, Paged,
  PartialHierarchyModification, PresentationDataCompareOptions, PresentationError, PresentationStatus, PresentationUnitSystem, RequestPriority,
  Ruleset, RulesetVariable, SelectionInfo, SelectionScope, SelectionScopeRequestOptions,
} from "@bentley/presentation-common";
import { PRESENTATION_BACKEND_ASSETS_ROOT, PRESENTATION_COMMON_PUBLIC_ROOT } from "./Constants";
import { createDefaultNativePlatform, NativePlatformDefinition, NativePlatformRequestTypes } from "./NativePlatform";
import { RulesetManager, RulesetManagerImpl } from "./RulesetManager";
import { RulesetVariablesManager, RulesetVariablesManagerImpl } from "./RulesetVariablesManager";
import { SelectionScopesHelper } from "./SelectionScopesHelper";
import { UpdatesTracker } from "./UpdatesTracker";
import { getElementKey } from "./Utils";

/**
 * Presentation manager working mode.
 * @public
 */
export enum PresentationManagerMode {
  /**
   * Presentation manager assumes iModels are opened in read-only mode and avoids doing some work
   * related to reacting to changes in iModels.
   */
  ReadOnly,

  /**
   * Presentation manager assumes iModels are opened in read-write mode and it may need to
   * react to changes. This involves some additional work and gives slightly worse performance.
   */
  ReadWrite,
}

/**
 * Properties that can be used to configure [[PresentationManager]]
 * @public
 */
export interface PresentationManagerProps {
  /**
   * A path override for presentation-backend's assets. Need to be overriden by application if
   * it puts these assets someplace else than the default.
   *
   * By default the root is determined using this algorithm:
   * - if 'presentation-backend' is in node_modules, assume the directory structure is:
   *   - assets/*\*\/*
   *   - presentation-backend/{source_files}
   *   which means the assets can be found through a relative path '../assets/' from the JS file being executed.
   * - else, assume the backend is webpacked into a single file with assets next to it:
   *   - assets/*\*\/*
   *   - main.js
   *   which means the assets can be found through a relative path './assets/' from the JS file being executed.
   */
  presentationAssetsRoot?: string;

  /**
   * A list of directories containing application's presentation rulesets.
   */
  rulesetDirectories?: string[];

  /**
   * A list of directories containing application's supplemental presentation rulesets.
   */
  supplementalRulesetDirectories?: string[];

  /**
   * A list of directories containing application's locale-specific localized
   * string files (in simplified i18next v3 format)
   */
  localeDirectories?: string[];

  /**
   * Sets the active locale to use when localizing presentation-related
   * strings. It can later be changed through [[PresentationManager]].
   */
  activeLocale?: string;

  /**
   * Sets the active unit system to use for formatting property values with
   * units. Default presentation units are used if this is not specified. The active unit
   * system can later be changed through [[PresentationManager]] or overriden for each request
   *
   * @alpha
   */
  activeUnitSystem?: PresentationUnitSystem;

  /**
   * Should schemas preloading be enabled. If true, presentation manager listens
   * for `BriefcaseDb.onOpened` event and force pre-loads all ECSchemas.
   */
  enableSchemasPreload?: boolean;

  /**
   * A map of 'priority' to 'number of slots allocated for simultaneously running tasks'
   * where 'priority' is the highest task priority that can allocate a slot. Example:
   * ```ts
   * {
   *   100: 1,
   *   500: 2,
   * }
   * ```
   * The above means there's one slot for tasks that are at most of 100 priority and there are
   * 2 slots for tasks that have at most of 500 priority. Higher priority tasks may allocate lower
   * priority slots, so a task of 400 priority could take all 3 slots.
   *
   * Configuring this map provides ability to choose how many tasks of what priority can run simultaneously.
   * E.g. in the above example only 1 task can run simultaneously if it's priority is less than 100 even though
   * we have lots of them queued. This leaves 2 slots for higher priority tasks which can be handled without
   * having to wait for the lower priority slot to free up.
   *
   * Defaults to
   * ```ts
   * {
   *   [RequestPriority.Preload]: 1,
   *   [RequestPriority.Max]: 1,
   * }
   * ```
   *
   * **Warning:** Tasks with priority higher than maximum priority in the slots allocation map will never
   * be handled.
   */
  taskAllocationsMap?: { [priority: number]: number };

  /**
   * Presentation manager working mode. Backends that use iModels in read-write mode should
   * use `ReadWrite`, others might want to set to `ReadOnly` for better performance.
   *
   * Defaults to `ReadWrite`.
   */
  mode?: PresentationManagerMode;

  /**
   * The interval (in milliseconds) used to poll for presentation data changes. Only has
   * effect in read-write mode (see [[mode]]).
   *
   * @alpha
   */
  updatesPollInterval?: number;

  /**
   * A directory for Presentation hierarchy caches. If not set hierarchy cache is created
   * along side iModel.
   *
   * @internal
   */
  cacheDirectory?: string;

  /**
   * An identifier which helps separate multiple presentation managers. It's
   * mostly useful in tests where multiple presentation managers can co-exist
   * and try to share the same resources, which we don't want. With this identifier
   * set, managers put their resources into id-named subdirectories.
   *
   * @internal
   */
  id?: string;

  /** @internal */
  addon?: NativePlatformDefinition;

  /** @internal */
  eventSink?: EventSink;
}

/**
 * Backend Presentation manager which pulls the presentation data from
 * an iModel using native platform.
 *
 * @public
 */
export class PresentationManager {

  private _props: PresentationManagerProps;
  private _nativePlatform?: NativePlatformDefinition;
  private _rulesets: RulesetManager;
  private _isOneFrontendPerBackend: boolean;
  private _isDisposed: boolean;
  private _disposeIModelOpenedListener?: () => void;
  private _updatesTracker?: UpdatesTracker;

  /** Get / set active locale used for localizing presentation data */
  public activeLocale: string | undefined;

  /** Get / set active unit system used to format property values with units */
  public activeUnitSystem: PresentationUnitSystem | undefined;

  /**
   * Creates an instance of PresentationManager.
   * @param props Optional configuration properties.
   */
  constructor(props?: PresentationManagerProps) {
    this._props = props ?? {};
    this._isDisposed = false;

    const mode = props?.mode ?? PresentationManagerMode.ReadWrite;
    const isChangeTrackingEnabled = (mode === PresentationManagerMode.ReadWrite && !!props?.updatesPollInterval);

    if (props && props.addon) {
      this._nativePlatform = props.addon;
    } else {
      const nativePlatformImpl = createDefaultNativePlatform({
        id: this._props.id ?? "",
        localeDirectories: createLocaleDirectoryList(props),
        taskAllocationsMap: createTaskAllocationsMap(props),
        mode,
        isChangeTrackingEnabled,
        cacheDirectory: this._props.cacheDirectory ? path.resolve(this._props.cacheDirectory) : "",
      });
      this._nativePlatform = new nativePlatformImpl();
    }

    this.setupRulesetDirectories(props);
    if (props) {
      this.activeLocale = props.activeLocale;
      this.activeUnitSystem = props.activeUnitSystem;
    }

    this._rulesets = new RulesetManagerImpl(this.getNativePlatform);

    if (this._props.enableSchemasPreload)
      this._disposeIModelOpenedListener = BriefcaseDb.onOpened.addListener(this.onIModelOpened);

    this._isOneFrontendPerBackend = IModelHost.isNativeAppBackend;
    if (isChangeTrackingEnabled) {
      // if change tracking is enabled, assume we're in native app mode even if `IModelHost.isNativeAppBackend` tells we're not
      this._isOneFrontendPerBackend = true;
      this._updatesTracker = UpdatesTracker.create({
        nativePlatformGetter: this.getNativePlatform,
        eventSink: (props && props.eventSink) ? props.eventSink /* istanbul ignore next */ : EventSinkManager.global,
        pollInterval: props!.updatesPollInterval!, // set if `isChangeTrackingEnabled == true`
      });
    }
  }

  /**
   * Dispose the presentation manager. Must be called to clean up native resources.
   */
  public dispose() {
    if (this._nativePlatform) {
      this.getNativePlatform().dispose();
      this._nativePlatform = undefined;
    }

    if (this._disposeIModelOpenedListener)
      this._disposeIModelOpenedListener();

    if (this._updatesTracker) {
      this._updatesTracker.dispose();
      this._updatesTracker = undefined;
    }

    this._isDisposed = true;
  }

  /** Properties used to initialize the manager */
  public get props() { return this._props; }

  /**
   * Get rulesets manager
   */
  public rulesets(): RulesetManager { return this._rulesets; }

  /**
   * Get ruleset variables manager for specific ruleset
   * @param rulesetId Id of the ruleset to get variables manager for
   */
  public vars(rulesetId: string): RulesetVariablesManager {
    return new RulesetVariablesManagerImpl(this.getNativePlatform, rulesetId);
  }

  // tslint:disable-next-line: naming-convention
  private onIModelOpened = (requestContext: ClientRequestContext, imodel: BriefcaseDb) => {
    const imodelAddon = this.getNativePlatform().getImodelAddon(imodel);
    // tslint:disable-next-line:no-floating-promises
    this.getNativePlatform().forceLoadSchemas(requestContext, imodelAddon);
  }

  /** @internal */
  public getNativePlatform = (): NativePlatformDefinition => {
    if (this._isDisposed)
      throw new PresentationError(PresentationStatus.UseAfterDisposal, "Attempting to use Presentation manager after disposal");
    return this._nativePlatform!;
  }

  private setupRulesetDirectories(props?: PresentationManagerProps) {
    const supplementalRulesetDirectories = [path.join(props?.presentationAssetsRoot ?? PRESENTATION_BACKEND_ASSETS_ROOT, "supplemental-presentation-rules")];
    if (props && props.supplementalRulesetDirectories) {
      props.supplementalRulesetDirectories.forEach((dir) => {
        if (-1 === supplementalRulesetDirectories.indexOf(dir))
          supplementalRulesetDirectories.push(dir);
      });
    }
    this.getNativePlatform().setupSupplementalRulesetDirectories(supplementalRulesetDirectories);
    if (props && props.rulesetDirectories)
      this.getNativePlatform().setupRulesetDirectories(props.rulesetDirectories);
  }

  private getRulesetIdObject(rulesetOrId: Ruleset | string): { uniqueId: string, parts: { id: string, hash?: string } } {
    if (typeof rulesetOrId === "object") {
      if (this._isOneFrontendPerBackend) {
        // in case of native apps we don't have to enforce ruleset id uniqueness, since there's ony one
        // frontend and it's up to the frontend to make sure rulesets are unique
        return {
          uniqueId: rulesetOrId.id,
          parts: { id: rulesetOrId.id },
        };
      }
      const hashedId = hash.MD5(rulesetOrId);
      return {
        uniqueId: `${rulesetOrId.id}-${hashedId}`,
        parts: {
          id: rulesetOrId.id,
          hash: hashedId,
        },
      };
    }
    return { uniqueId: rulesetOrId, parts: { id: rulesetOrId } };
  }

  /** @internal */
  public getRulesetId(rulesetOrId: Ruleset | string) {
    return this.getRulesetIdObject(rulesetOrId).uniqueId;
  }

  private ensureRulesetRegistered(rulesetOrId: Ruleset | string): string {
    if (typeof rulesetOrId === "object") {
      const rulesetWithNativeId = { ...rulesetOrId, id: this.getRulesetId(rulesetOrId) };
      return this.rulesets().add(rulesetWithNativeId).id;
    }
    return rulesetOrId;
  }

  /** Registers given ruleset and sets ruleset variables */
  private handleOptions<TOptions extends { rulesetOrId: Ruleset | string, rulesetVariables?: RulesetVariable[] }>(options: TOptions) {
    const { rulesetVariables, rulesetOrId, ...strippedOptions } = options;
    const registeredRulesetId = this.ensureRulesetRegistered(rulesetOrId);
    if (rulesetVariables) {
      const variablesManager = this.vars(registeredRulesetId);
      for (const variable of rulesetVariables) {
        variablesManager.setValue(variable.id, variable.type, variable.value);
      }
    }
    return { rulesetId: registeredRulesetId, ...strippedOptions };
  }

  /**
   * Retrieves nodes and node count
   * @param requestContext Client request context
   * @param requestOptions Options for the request
   * @param parentKey Key of the parentNode
   * @return A promise object that returns either a node response containing nodes and node count on success or an error string on error
   */
  public async getNodesAndCount(requestContext: ClientRequestContext, requestOptions: Paged<HierarchyRequestOptions<IModelDb>>, parentKey?: NodeKey) {
    requestContext.enter();
    const nodesCount = await this.getNodesCount(requestContext, requestOptions, parentKey);

    requestContext.enter();
    const nodesList = await this.getNodes(requestContext, requestOptions, parentKey);

    requestContext.enter();
    return { nodes: nodesList, count: nodesCount };
  }

  /**
   * Retrieves nodes
   * @param requestContext Client request context
   * @param requestOptions options for the request
   * @param parentKey    Key of the parent node if requesting for child nodes.
   * @return A promise object that returns either an array of nodes on success or an error string on error.
   */
  public async getNodes(requestContext: ClientRequestContext, requestOptions: Paged<HierarchyRequestOptions<IModelDb>>, parentKey?: NodeKey): Promise<Node[]> {
    requestContext.enter();
    const options = this.handleOptions(requestOptions);

    let params;
    if (parentKey)
      params = this.createRequestParams(NativePlatformRequestTypes.GetChildren, options, { nodeKey: parentKey });
    else
      params = this.createRequestParams(NativePlatformRequestTypes.GetRootNodes, options);
    return this.request<Node[]>(requestContext, requestOptions.imodel, params, Node.listReviver);
  }

  /**
   * Retrieves nodes count
   * @param requestContext Client request context
   * @param requestOptions options for the request
   * @param parentKey Key of the parent node if requesting for child nodes.
   * @return A promise object that returns the number of nodes.
   */
  public async getNodesCount(requestContext: ClientRequestContext, requestOptions: HierarchyRequestOptions<IModelDb>, parentKey?: NodeKey): Promise<number> {
    requestContext.enter();
    const options = this.handleOptions(requestOptions);

    let params;
    if (parentKey)
      params = this.createRequestParams(NativePlatformRequestTypes.GetChildrenCount, options, { nodeKey: parentKey });
    else
      params = this.createRequestParams(NativePlatformRequestTypes.GetRootNodesCount, options);
    return this.request<number>(requestContext, requestOptions.imodel, params);
  }

  /**
   * Retrieves paths from root nodes to children nodes according to specified keys. Intersecting paths will be merged.
   * @param requestContext The client request context
   * @param requestOptions options for the request
   * @param paths Paths from root node to some child node.
   * @param markedIndex Index of the path in `paths` that will be marked.
   * @return A promise object that returns either an array of paths on success or an error string on error.
   */
  public async getNodePaths(requestContext: ClientRequestContext, requestOptions: HierarchyRequestOptions<IModelDb>, paths: InstanceKey[][], markedIndex: number): Promise<NodePathElement[]> {
    requestContext.enter();
    const options = this.handleOptions(requestOptions);

    const params = this.createRequestParams(NativePlatformRequestTypes.GetNodePaths, options, {
      paths,
      markedIndex,
    });
    return this.request<NodePathElement[]>(requestContext, requestOptions.imodel, params, NodePathElement.listReviver);
  }

  /**
   * Retrieves paths from root nodes to nodes containing filter text in their label.
   * @param requestContext The client request context
   * @param requestOptions options for the request
   * @param filterText Text to filter nodes against.
   * @return A promise object that returns either an array of paths on success or an error string on error.
   */
  public async getFilteredNodePaths(requestContext: ClientRequestContext, requestOptions: HierarchyRequestOptions<IModelDb>, filterText: string): Promise<NodePathElement[]> {
    requestContext.enter();
    const options = this.handleOptions(requestOptions);

    const params = this.createRequestParams(NativePlatformRequestTypes.GetFilteredNodePaths, options, {
      filterText,
    });
    return this.request<NodePathElement[]>(requestContext, requestOptions.imodel, params, NodePathElement.listReviver);
  }

  /**
   * Loads the whole hierarchy with the specified parameters
   * @param requestContext The client request context
   * @param requestOptions options for the request
   * @return A promise object that resolves when the hierarchy is fully loaded
   * @alpha Hierarchy loading performance needs to be improved before this becomes publicly available.
   */
  public async loadHierarchy(requestContext: ClientRequestContext, requestOptions: HierarchyRequestOptions<IModelDb>): Promise<void> {
    requestContext.enter();
    const options = this.handleOptions(requestOptions);
    const params = this.createRequestParams(NativePlatformRequestTypes.LoadHierarchy, options);
    const start = new Date();
    await this.request<void>(requestContext, requestOptions.imodel, params);
    Logger.logInfo("ECPresentation.Node", `Loading full hierarchy for `
      + `iModel "${requestOptions.imodel.iModelId}" and ruleset "${options.rulesetId}" `
      + `completed in ${((new Date()).getTime() - start.getTime()) / 1000} s.`);
  }

  /**
   * Retrieves the content descriptor which can be used to get content.
   * @param requestContext The client request context
   * @param requestOptions options for the request
   * @param displayType  The preferred display type of the return content.
   * @param keys         Keys of ECInstances to get the content for.
   * @param selection    Optional selection info in case the content is being requested due to selection change.
   * @return A promise object that returns either a descriptor on success or an error string on error.
   */
  public async getContentDescriptor(requestContext: ClientRequestContext, requestOptions: ContentRequestOptions<IModelDb>, displayType: string, keys: KeySet, selection: SelectionInfo | undefined): Promise<Descriptor | undefined> {
    requestContext.enter();
    const options = this.handleOptions(requestOptions);

    const params = this.createRequestParams(NativePlatformRequestTypes.GetContentDescriptor, options, {
      displayType,
      keys: this.getKeysForContentRequest(requestOptions.imodel, keys).toJSON(),
      selection,
    });
    return this.request<Descriptor | undefined>(requestContext, requestOptions.imodel, params, Descriptor.reviver);
  }

  /**
   * Retrieves the content set size based on the supplied content descriptor override.
   * @param requestContext Client request context
   * @param requestOptions          options for the request
   * @param descriptorOrOverrides   Content descriptor or its overrides specifying how the content should be customized
   * @param keys                    Keys of ECInstances to get the content for.
   * @return A promise object that returns either a number on success or an error string on error.
   * Even if concrete implementation returns content in pages, this function returns the total
   * number of records in the content set.
   */
  public async getContentSetSize(requestContext: ClientRequestContext, requestOptions: ContentRequestOptions<IModelDb>, descriptorOrOverrides: Descriptor | DescriptorOverrides, keys: KeySet): Promise<number> {
    requestContext.enter();
    const options = this.handleOptions(requestOptions);

    const params = this.createRequestParams(NativePlatformRequestTypes.GetContentSetSize, options, {
      keys: this.getKeysForContentRequest(requestOptions.imodel, keys).toJSON(),
      descriptorOverrides: this.createContentDescriptorOverrides(descriptorOrOverrides),
    });
    return this.request<number>(requestContext, requestOptions.imodel, params);
  }

  /**
   * Retrieves the content based on the supplied content descriptor override.
   * @param requestContext Client request context
   * @param requestOptions          options for the request
   * @param descriptorOrOverrides   Content descriptor or its overrides specifying how the content should be customized
   * @param keys                    Keys of ECInstances to get the content for.
   * @return A promise object that returns either content on success or an error string on error.
   */
  public async getContent(requestContext: ClientRequestContext, requestOptions: Paged<ContentRequestOptions<IModelDb>>, descriptorOrOverrides: Descriptor | DescriptorOverrides, keys: KeySet): Promise<Content | undefined> {
    requestContext.enter();
    const options = this.handleOptions(requestOptions);

    const params = this.createRequestParams(NativePlatformRequestTypes.GetContent, options, {
      keys: this.getKeysForContentRequest(requestOptions.imodel, keys).toJSON(),
      descriptorOverrides: this.createContentDescriptorOverrides(descriptorOrOverrides),
    });
    return this.request<Content | undefined>(requestContext, requestOptions.imodel, params, Content.reviver);
  }

  /**
   * Retrieves the content and content size based on supplied content descriptor override.
   * @param requestContext Client request context
   * @param requestOptions          Options for thr request.
   * @param descriptorOrOverrides   Content descriptor or its overrides specifying how the content should be customized
   * @param keys                    Keys of ECInstances to get the content for
   * @return A promise object that returns either content and content set size on success or an error string on error.
   */
  public async getContentAndSize(requestContext: ClientRequestContext, requestOptions: Paged<ContentRequestOptions<IModelDb>>, descriptorOrOverrides: Descriptor | DescriptorOverrides, keys: KeySet) {
    requestContext.enter();
    const size = await this.getContentSetSize(requestContext, requestOptions, descriptorOrOverrides, keys);
    requestContext.enter();
    const content = await this.getContent(requestContext, requestOptions, descriptorOrOverrides, keys);
    requestContext.enter();
    return { content, size };
  }

  private createContentDescriptorOverrides(descriptorOrOverrides: Descriptor | DescriptorOverrides): DescriptorOverrides {
    if (descriptorOrOverrides instanceof Descriptor)
      return descriptorOrOverrides.createDescriptorOverrides();
    return descriptorOrOverrides as DescriptorOverrides;
  }

  /**
   * Retrieves distinct values of specific field from the content based on the supplied content descriptor override.
   * @param requestContext The client request context
   * @param requestOptions options for the request
   * @param descriptor           Content descriptor which specifies how the content should be returned.
   * @param keys                 Keys of ECInstances to get the content for.
   * @param fieldName            Name of the field from which to take values.
   * @param maximumValueCount    Maximum numbers of values that can be returned. Unlimited if 0.
   * @return A promise object that returns either distinct values on success or an error string on error.
   */
  public async getDistinctValues(requestContext: ClientRequestContext, requestOptions: ContentRequestOptions<IModelDb>, descriptor: Descriptor, keys: KeySet, fieldName: string, maximumValueCount: number = 0): Promise<string[]> {
    requestContext.enter();
    const options = this.handleOptions(requestOptions);

    const params = this.createRequestParams(NativePlatformRequestTypes.GetDistinctValues, options, {
      keys: this.getKeysForContentRequest(requestOptions.imodel, keys).toJSON(),
      descriptorOverrides: descriptor.createDescriptorOverrides(),
      fieldName,
      maximumValueCount,
    });
    return this.request<string[]>(requestContext, requestOptions.imodel, params);
  }

  /**
   * Retrieves display label definition of specific item
   * @param requestContext The client request context
   * @param requestOptions options for the request
   * @param key Key of an instance to get label for
   */
  public async getDisplayLabelDefinition(requestContext: ClientRequestContext, requestOptions: LabelRequestOptions<IModelDb>, key: InstanceKey): Promise<LabelDefinition> {
    requestContext.enter();
    const params = this.createRequestParams(NativePlatformRequestTypes.GetDisplayLabel, requestOptions, { key });
    return this.request<LabelDefinition>(requestContext, requestOptions.imodel, params, LabelDefinition.reviver);
  }

  /**
   * Retrieves display labels definitions of specific items
   * @param requestContext The client request context
   * @param requestOptions options for the request
   * @param instanceKeys Keys of instances to get labels for
   */
  public async getDisplayLabelDefinitions(requestContext: ClientRequestContext, requestOptions: LabelRequestOptions<IModelDb>, instanceKeys: InstanceKey[]): Promise<LabelDefinition[]> {
    instanceKeys = instanceKeys.map((k) => {
      if (k.className === "BisCore:Element")
        return getElementKey(requestOptions.imodel, k.id);
      return k;
    }).filter<InstanceKey>((k): k is InstanceKey => (undefined !== k));
    const rulesetId = "RulesDrivenECPresentationManager_RulesetId_DisplayLabel";
    const overrides: DescriptorOverrides = {
      displayType: DefaultContentDisplayTypes.List,
      contentFlags: ContentFlags.ShowLabels | ContentFlags.NoFields,
      hiddenFieldNames: [],
    };
    const content = await this.getContent(requestContext, { ...requestOptions, rulesetOrId: rulesetId }, overrides, new KeySet(instanceKeys));
    requestContext.enter();
    return instanceKeys.map((key) => {
      const item = content ? content.contentSet.find((it) => it.primaryKeys.length > 0 && InstanceKey.compare(it.primaryKeys[0], key) === 0) : undefined;
      if (!item)
        return { displayValue: "", rawValue: "", typeName: "" };
      return item.label;
    });
  }

  /**
   * Retrieves available selection scopes.
   * @param requestContext The client request context
   * @param requestOptions options for the request
   */
  public async getSelectionScopes(requestContext: ClientRequestContext, requestOptions: SelectionScopeRequestOptions<IModelDb>): Promise<SelectionScope[]> {
    requestContext.enter();
    (requestOptions as any);
    return SelectionScopesHelper.getSelectionScopes();
  }

  /**
   * Computes selection set based on provided selection scope.
   * @param requestContext The client request context
   * @param requestOptions Options for the request
   * @param keys Keys of elements to get the content for.
   * @param scopeId ID of selection scope to use for computing selection
   */
  public async computeSelection(requestContext: ClientRequestContext, requestOptions: SelectionScopeRequestOptions<IModelDb>, ids: Id64String[], scopeId: string): Promise<KeySet> {
    requestContext.enter();
    return SelectionScopesHelper.computeSelection(requestOptions, ids, scopeId);
  }

  private async request<T>(requestContext: ClientRequestContext, imodel: IModelDb, params: string, reviver?: (key: string, value: any) => any): Promise<T> {
    requestContext.enter();
    const imodelAddon = this.getNativePlatform().getImodelAddon(imodel);
    const serializedResponse = await this.getNativePlatform().handleRequest(requestContext, imodelAddon, params);
    requestContext.enter();
    if (!serializedResponse)
      throw new PresentationError(PresentationStatus.InvalidResponse, `Received invalid response from the addon: ${serializedResponse}`);
    return JSON.parse(serializedResponse, reviver);
  }

  private createRequestParams(requestId: string, genericOptions: { imodel: IModelDb, locale?: string, unitSystem?: PresentationUnitSystem }, additionalOptions?: object): string {
    const { imodel, locale, unitSystem, ...genericOptionsStripped } = genericOptions;
    const request = {
      requestId,
      params: {
        locale: normalizeLocale(locale ?? this.activeLocale),
        unitSystem: unitSystem ?? this.activeUnitSystem,
        ...genericOptionsStripped,
        ...additionalOptions,
      },
    };
    return JSON.stringify(request);
  }

  private getKeysForContentRequest(imodel: IModelDb, keys: KeySet): KeySet {
    const elementClassName = "BisCore:Element";
    const instanceKeys = keys.instanceKeys;
    if (!instanceKeys.has(elementClassName))
      return keys;

    const elementIds = instanceKeys.get(elementClassName)!;
    const keyset = new KeySet();
    keyset.add(keys);
    elementIds.forEach((elementId) => {
      const concreteKey = getElementKey(imodel, elementId);
      if (concreteKey) {
        keyset.delete({ className: elementClassName, id: elementId });
        keyset.add(concreteKey);
      }
    });
    return keyset;
  }

  public async compareHierarchies(requestContext: ClientRequestContext, requestOptions: PresentationDataCompareOptions<IModelDb>): Promise<PartialHierarchyModification[]> {
    requestContext.enter();

    const prev = getPrevValues(requestOptions);
    const currRulesetId = this.getRulesetIdObject(requestOptions.rulesetOrId);
    const prevRulesetId = this.getRulesetIdObject(prev.rulesetOrId);
    if (prevRulesetId.parts.id !== currRulesetId.parts.id)
      throw new PresentationError(PresentationStatus.InvalidArgument, "Can't compare rulesets with different IDs");

    // note: we're only using imodel property from `handleOptions` result, but it also
    // registers the changed ruleset and updates ruleset variable values (if necessary)
    const options = this.handleOptions(requestOptions);

    const imodelAddon = this.getNativePlatform().getImodelAddon(options.imodel);
    const modificationJsons = await this.getNativePlatform().compareHierarchies(requestContext, imodelAddon, {
      prevRulesetId: prevRulesetId.uniqueId,
      currRulesetId: currRulesetId.uniqueId,
      locale: normalizeLocale(options.locale ?? this.activeLocale) ?? "",
    });
    return modificationJsons.map(PartialHierarchyModification.fromJSON);
  }
}

const hasPrevRuleset = (prev: ({ rulesetOrId: string | Ruleset } | { rulesetVariables: RulesetVariable[] })): prev is ({ rulesetOrId: string | Ruleset }) => {
  return !!(prev as { rulesetOrId: string | Ruleset }).rulesetOrId;
};

const getPrevValues = (options: PresentationDataCompareOptions<IModelDb>) => {
  if (hasPrevRuleset(options.prev)) {
    return {
      rulesetOrId: options.prev.rulesetOrId,
      rulesetVariables: options.rulesetVariables ?? [],
    };
  }
  return {
    rulesetOrId: options.rulesetOrId,
    rulesetVariables: options.prev.rulesetVariables,
  };
};

const createLocaleDirectoryList = (props?: PresentationManagerProps) => {
  const localeDirectories = [getLocalesDirectory(props?.presentationAssetsRoot ?? PRESENTATION_COMMON_PUBLIC_ROOT)];
  if (props && props.localeDirectories) {
    props.localeDirectories.forEach((dir) => {
      if (-1 === localeDirectories.indexOf(dir))
        localeDirectories.push(dir);
    });
  }
  return localeDirectories;
};

const createTaskAllocationsMap = (props?: PresentationManagerProps) => {
  if (props && props.taskAllocationsMap)
    return props.taskAllocationsMap;

  // by default we allocate one slot for preloading tasks and one for all other requests
  return {
    [RequestPriority.Preload]: 1,
    [RequestPriority.Max]: 1,
  };
};

const normalizeLocale = (locale?: string) => {
  if (!locale)
    return undefined;
  return locale.toLocaleLowerCase();
};
