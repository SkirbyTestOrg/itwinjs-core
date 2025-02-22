/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as hash from "object-hash";
import * as path from "path";
import { IModelDb, IModelJsNative, IpcHost } from "@itwin/core-backend";
import { BeEvent, IDisposable } from "@itwin/core-bentley";
import { UnitSystemKey } from "@itwin/core-quantity";
import {
  Content, ContentDescriptorRequestOptions, ContentFlags, ContentRequestOptions, ContentSourcesRequestOptions, DefaultContentDisplayTypes, Descriptor,
  DescriptorOverrides, DiagnosticsOptions, DisplayLabelRequestOptions, DisplayLabelsRequestOptions, DisplayValueGroup, DistinctValuesRequestOptions,
  ElementProperties, FilterByInstancePathsHierarchyRequestOptions, FilterByTextHierarchyRequestOptions, HierarchyRequestOptions, InstanceKey, Key,
  KeySet, LabelDefinition, Node, NodeKey, NodePathElement, Paged, PagedResponse, PresentationError, PresentationStatus, Prioritized, Ruleset,
  RulesetVariable, SelectClassInfo, SingleElementPropertiesRequestOptions, WithCancelEvent,
} from "@itwin/presentation-common";
import { PRESENTATION_BACKEND_ASSETS_ROOT, PRESENTATION_COMMON_ASSETS_ROOT } from "./Constants";
import { buildElementsProperties } from "./ElementPropertiesHelper";
import {
  createDefaultNativePlatform, NativePlatformDefinition, NativePlatformRequestTypes, NativePlatformResponse, NativePresentationDefaultUnitFormats,
  NativePresentationKeySetJSON, NativePresentationUnitSystem,
} from "./NativePlatform";
import { HierarchyCacheConfig, HierarchyCacheMode, PresentationManagerMode, PresentationManagerProps, UnitSystemFormat } from "./PresentationManager";
import { RulesetManager, RulesetManagerImpl } from "./RulesetManager";
import { UpdatesTracker } from "./UpdatesTracker";
import { BackendDiagnosticsAttribute, BackendDiagnosticsOptions, combineDiagnosticsOptions, getElementKey, reportDiagnostics } from "./Utils";

/** @internal */
export class PresentationManagerDetail implements IDisposable {
  private _disposed: boolean;
  private _nativePlatform: NativePlatformDefinition | undefined;
  private _updatesTracker: UpdatesTracker | undefined;
  private _onManagerUsed: (() => void) | undefined;
  private _diagnosticsOptions: BackendDiagnosticsOptions | undefined;

  public rulesets: RulesetManager;
  public activeUnitSystem: UnitSystemKey | undefined;

  constructor(params: PresentationManagerProps) {
    this._disposed = false;

    const presentationAssetsRoot = params.presentationAssetsRoot ?? {
      common: PRESENTATION_COMMON_ASSETS_ROOT,
      backend: PRESENTATION_BACKEND_ASSETS_ROOT,
    };
    const mode = params.mode ?? PresentationManagerMode.ReadWrite;
    const changeTrackingEnabled = mode === PresentationManagerMode.ReadWrite && !!params.updatesPollInterval;
    this._nativePlatform = params.addon ?? createNativePlatform(
      params.id ?? "",
      params.workerThreadsCount ?? 2,
      mode,
      changeTrackingEnabled,
      params.caching,
      params.defaultFormats,
      params.useMmap,
    );

    const getNativePlatform = () => this.getNativePlatform();
    if (IpcHost.isValid && changeTrackingEnabled) {
      this._updatesTracker = UpdatesTracker.create({
        nativePlatformGetter: getNativePlatform,
        pollInterval: params.updatesPollInterval!,
      });
    } else {
      this._updatesTracker = undefined;
    }

    setupRulesetDirectories(
      this._nativePlatform,
      typeof presentationAssetsRoot === "string" ? presentationAssetsRoot : presentationAssetsRoot.backend,
      params.supplementalRulesetDirectories ?? [],
      params.rulesetDirectories ?? [],
    );
    this.activeUnitSystem = params.defaultUnitSystem;

    this._onManagerUsed = undefined;
    this.rulesets = new RulesetManagerImpl(getNativePlatform);
    this._diagnosticsOptions = params.diagnostics;
  }

  public dispose(): void {
    if (this._disposed) {
      return;
    }

    this.getNativePlatform().dispose();
    this._nativePlatform = undefined;

    this._updatesTracker?.dispose();
    this._updatesTracker = undefined;

    this._disposed = true;
  }

  public getNativePlatform(): NativePlatformDefinition {
    if (this._disposed) {
      throw new PresentationError(
        PresentationStatus.NotInitialized,
        "Attempting to use Presentation manager after disposal",
      );
    }

    return this._nativePlatform!;
  }

  public setOnManagerUsedHandler(handler: () => void) {
    this._onManagerUsed = handler;
  }

  public async getNodes(requestOptions: WithCancelEvent<Prioritized<Paged<HierarchyRequestOptions<IModelDb, NodeKey, RulesetVariable>>>> & BackendDiagnosticsAttribute): Promise<Node[]> {
    const { rulesetOrId, parentKey, ...strippedOptions } = requestOptions;
    const params = {
      requestId: parentKey ? NativePlatformRequestTypes.GetChildren : NativePlatformRequestTypes.GetRootNodes,
      rulesetId: this.registerRuleset(rulesetOrId),
      ...strippedOptions,
      nodeKey: parentKey,
    };
    return JSON.parse(await this.request(params), Node.listReviver);
  }

  public async getNodesCount(requestOptions: WithCancelEvent<Prioritized<HierarchyRequestOptions<IModelDb, NodeKey, RulesetVariable>>> & BackendDiagnosticsAttribute): Promise<number> {
    const { rulesetOrId, parentKey, ...strippedOptions } = requestOptions;
    const params = {
      requestId: parentKey ? NativePlatformRequestTypes.GetChildrenCount : NativePlatformRequestTypes.GetRootNodesCount,
      rulesetId: this.registerRuleset(rulesetOrId),
      ...strippedOptions,
      nodeKey: parentKey,
    };
    return JSON.parse(await this.request(params));
  }

  public async getNodePaths(requestOptions: WithCancelEvent<Prioritized<FilterByInstancePathsHierarchyRequestOptions<IModelDb, RulesetVariable>>> & BackendDiagnosticsAttribute): Promise<NodePathElement[]> {
    const { rulesetOrId, instancePaths, ...strippedOptions } = requestOptions;
    const params = {
      requestId: NativePlatformRequestTypes.GetNodePaths,
      rulesetId: this.registerRuleset(rulesetOrId),
      ...strippedOptions,
      paths: instancePaths.map((p) => p.map((s) => InstanceKey.toJSON(s))),
    };
    return JSON.parse(await this.request(params), NodePathElement.listReviver);
  }

  public async getFilteredNodePaths(requestOptions: WithCancelEvent<Prioritized<FilterByTextHierarchyRequestOptions<IModelDb, RulesetVariable>>> & BackendDiagnosticsAttribute): Promise<NodePathElement[]> {
    const { rulesetOrId, ...strippedOptions } = requestOptions;
    const params = {
      requestId: NativePlatformRequestTypes.GetFilteredNodePaths,
      rulesetId: this.registerRuleset(rulesetOrId),
      ...strippedOptions,
    };
    return JSON.parse(await this.request(params), NodePathElement.listReviver);
  }

  public async getContentDescriptor(requestOptions: WithCancelEvent<Prioritized<ContentDescriptorRequestOptions<IModelDb, KeySet>>>): Promise<string> {
    const { rulesetOrId, ...strippedOptions } = requestOptions;
    const params = {
      requestId: NativePlatformRequestTypes.GetContentDescriptor,
      rulesetId: this.registerRuleset(rulesetOrId),
      ...strippedOptions,
      contentFlags: ContentFlags.DescriptorOnly,
      keys: getKeysForContentRequest(requestOptions.keys, (map) => bisElementInstanceKeysProcessor(requestOptions.imodel, map)),
    };
    return this.request(params);
  }

  public async getContentSources(requestOptions: WithCancelEvent<Prioritized<ContentSourcesRequestOptions<IModelDb>>> & BackendDiagnosticsAttribute): Promise<SelectClassInfo[]> {
    const params = {
      requestId: NativePlatformRequestTypes.GetContentSources,
      rulesetId: "ElementProperties",
      ...requestOptions,
    };
    const reviver = (key: string, value: any) => {
      return key === "" ? SelectClassInfo.listFromCompressedJSON(value.sources, value.classesMap) : value;
    };
    return JSON.parse(await this.request(params), reviver);
  }

  public async getContentSetSize(requestOptions: WithCancelEvent<Prioritized<ContentRequestOptions<IModelDb, Descriptor | DescriptorOverrides, KeySet, RulesetVariable>>> & BackendDiagnosticsAttribute): Promise<number> {
    const { rulesetOrId, descriptor, ...strippedOptions } = requestOptions;
    const params = {
      requestId: NativePlatformRequestTypes.GetContentSetSize,
      rulesetId: this.registerRuleset(rulesetOrId),
      ...strippedOptions,
      keys: getKeysForContentRequest(requestOptions.keys, (map) => bisElementInstanceKeysProcessor(requestOptions.imodel, map)),
      descriptorOverrides: createContentDescriptorOverrides(descriptor),
    };
    return JSON.parse(await this.request(params));
  }

  public async getContent(requestOptions: WithCancelEvent<Prioritized<Paged<ContentRequestOptions<IModelDb, Descriptor | DescriptorOverrides, KeySet, RulesetVariable>>>> & BackendDiagnosticsAttribute): Promise<Content | undefined> {
    const { rulesetOrId, descriptor, ...strippedOptions } = requestOptions;
    const params = {
      requestId: NativePlatformRequestTypes.GetContent,
      rulesetId: this.registerRuleset(rulesetOrId),
      ...strippedOptions,
      keys: getKeysForContentRequest(requestOptions.keys, (map) => bisElementInstanceKeysProcessor(requestOptions.imodel, map)),
      descriptorOverrides: createContentDescriptorOverrides(descriptor),
    };
    return JSON.parse(await this.request(params), Content.reviver);
  }

  public async getPagedDistinctValues(requestOptions: WithCancelEvent<Prioritized<DistinctValuesRequestOptions<IModelDb, Descriptor | DescriptorOverrides, KeySet, RulesetVariable>>> & BackendDiagnosticsAttribute): Promise<PagedResponse<DisplayValueGroup>> {
    const { rulesetOrId, ...strippedOptions } = requestOptions;
    const { descriptor, keys, ...strippedOptionsNoDescriptorAndKeys } = strippedOptions;
    const params = {
      requestId: NativePlatformRequestTypes.GetPagedDistinctValues,
      rulesetId: this.registerRuleset(rulesetOrId),
      ...strippedOptionsNoDescriptorAndKeys,
      keys: getKeysForContentRequest(keys, (map) => bisElementInstanceKeysProcessor(requestOptions.imodel, map)),
      descriptorOverrides: createContentDescriptorOverrides(descriptor),
    };
    const reviver = (key: string, value: any) => {
      return key === "" ? {
        total: value.total,
        items: value.items.map(DisplayValueGroup.fromJSON),
      } : value;
    };
    return JSON.parse(await this.request(params), reviver);
  }

  public async getDisplayLabelDefinition(requestOptions: WithCancelEvent<Prioritized<DisplayLabelRequestOptions<IModelDb, InstanceKey>>> & BackendDiagnosticsAttribute): Promise<LabelDefinition> {
    const params = {
      requestId: NativePlatformRequestTypes.GetDisplayLabel,
      ...requestOptions,
      key: InstanceKey.toJSON(requestOptions.key),
    };
    return JSON.parse(await this.request(params), LabelDefinition.reviver);
  }

  public async getDisplayLabelDefinitions(requestOptions: WithCancelEvent<Prioritized<Paged<DisplayLabelsRequestOptions<IModelDb, InstanceKey>>>> & BackendDiagnosticsAttribute): Promise<LabelDefinition[]> {
    const concreteKeys = requestOptions.keys.map((k) => {
      if (k.className === "BisCore:Element")
        return getElementKey(requestOptions.imodel, k.id);
      return k;
    }).filter<InstanceKey>((k): k is InstanceKey => !!k);
    const contentRequestOptions: ContentRequestOptions<IModelDb, Descriptor | DescriptorOverrides, KeySet> = {
      ...requestOptions,
      rulesetOrId: "RulesDrivenECPresentationManager_RulesetId_DisplayLabel",
      descriptor: {
        displayType: DefaultContentDisplayTypes.List,
        contentFlags: ContentFlags.ShowLabels | ContentFlags.NoFields,
      },
      keys: new KeySet(concreteKeys),
    };
    const content = await this.getContent(contentRequestOptions);
    return concreteKeys.map((key) => {
      const item = content ? content.contentSet.find((it) => it.primaryKeys.length > 0 && InstanceKey.compare(it.primaryKeys[0], key) === 0) : undefined;
      if (!item)
        return { displayValue: "", rawValue: "", typeName: "" };
      return item.label;
    });
  }

  public async getElementProperties(requestOptions: WithCancelEvent<Prioritized<SingleElementPropertiesRequestOptions<IModelDb>>> & BackendDiagnosticsAttribute): Promise<ElementProperties | undefined> {
    const { elementId, ...optionsNoElementId } = requestOptions;
    const content = await this.getContent({
      ...optionsNoElementId,
      descriptor: {
        displayType: DefaultContentDisplayTypes.PropertyPane,
        contentFlags: ContentFlags.ShowLabels,
      },
      rulesetOrId: "ElementProperties",
      keys: new KeySet([{ className: "BisCore:Element", id: elementId }]),
    });
    const properties = buildElementsProperties(content);
    return properties[0];
  }

  /** Registers given ruleset and replaces the ruleset with its ID in the resulting object */
  public registerRuleset(rulesetOrId: Ruleset | string): string {
    if (typeof rulesetOrId === "object") {
      const rulesetWithNativeId = { ...rulesetOrId, id: this.getRulesetId(rulesetOrId) };
      return this.rulesets.add(rulesetWithNativeId).id;
    }

    return rulesetOrId;
  }

  /** @internal */
  public getRulesetId(rulesetOrId: Ruleset | string): string {
    return getRulesetIdObject(rulesetOrId).uniqueId;
  }

  public async request(params: RequestParams): Promise<string> {
    this._onManagerUsed?.();
    const { requestId, imodel, unitSystem, diagnostics: requestDiagnostics, cancelEvent, ...strippedParams } = params;
    const imodelAddon = this.getNativePlatform().getImodelAddon(imodel);
    const response = await withOptionalDiagnostics(
      [this._diagnosticsOptions, requestDiagnostics],
      async (diagnosticsOptions) => {
        const nativeRequestParams: any = {
          requestId,
          params: {
            unitSystem: toOptionalNativeUnitSystem(unitSystem ?? this.activeUnitSystem),
            ...strippedParams,
            ...(diagnosticsOptions ? { diagnostics: diagnosticsOptions } : undefined),
          },
        };
        return this.getNativePlatform().handleRequest(imodelAddon, JSON.stringify(nativeRequestParams), cancelEvent);
      },
    );
    return response.result;
  }
}

async function withOptionalDiagnostics(
  diagnosticsOptions: Array<BackendDiagnosticsOptions | undefined>,
  nativePlatformRequestHandler: (combinedDiagnosticsOptions: DiagnosticsOptions | undefined) => Promise<NativePlatformResponse<string>>,
): Promise<NativePlatformResponse<string>> {
  const contexts = diagnosticsOptions.map((d) => d?.requestContextSupplier?.());
  const combinedOptions = combineDiagnosticsOptions(...diagnosticsOptions);
  const response = await nativePlatformRequestHandler(combinedOptions);
  if (response.diagnostics) {
    const diagnostics = { logs: [response.diagnostics] };
    diagnosticsOptions.forEach((options, i) => {
      options && reportDiagnostics(diagnostics, options, contexts[i]);
    });
  }
  return response;
}

interface RequestParams {
  diagnostics?: BackendDiagnosticsOptions;
  requestId: string;
  imodel: IModelDb;
  unitSystem?: UnitSystemKey;
  cancelEvent?: BeEvent<() => void>;
}

function setupRulesetDirectories(
  nativePlatform: NativePlatformDefinition,
  presentationAssetsRoot: string,
  supplementalRulesetDirectoriesOverrides: string[],
  rulesetDirectories: string[],
): void {
  const supplementalRulesetDirectories = collateAssetDirectories(
    path.join(presentationAssetsRoot, "supplemental-presentation-rules"),
    supplementalRulesetDirectoriesOverrides,
  );
  nativePlatform.setupSupplementalRulesetDirectories(supplementalRulesetDirectories);

  const primaryRulesetDirectories = collateAssetDirectories(
    path.join(presentationAssetsRoot, "primary-presentation-rules"),
    rulesetDirectories,
  );
  nativePlatform.setupRulesetDirectories(primaryRulesetDirectories);
}

interface RulesetIdObject {
  uniqueId: string;
  parts: {
    id: string;
    hash?: string;
  };
}

/** @internal */
export function getRulesetIdObject(rulesetOrId: Ruleset | string): RulesetIdObject {
  if (typeof rulesetOrId === "object") {
    if (IpcHost.isValid) {
      // in case of native apps we don't want to enforce ruleset id uniqueness as ruleset variables
      // are stored on a backend and creating new id will lose those variables
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
export function getKeysForContentRequest(
  keys: Readonly<KeySet>,
  classInstanceKeysProcessor?: (keys: Map<string, Set<string>>) => void,
): NativePresentationKeySetJSON {
  const result: NativePresentationKeySetJSON = {
    instanceKeys: [],
    nodeKeys: [],
  };
  const classInstancesMap = new Map<string, Set<string>>();
  keys.forEach((key) => {
    if (Key.isNodeKey(key)) {
      result.nodeKeys.push(key);
    }

    if (Key.isInstanceKey(key)) {
      addInstanceKey(classInstancesMap, key);
    }
  });

  if (classInstanceKeysProcessor) {
    classInstanceKeysProcessor(classInstancesMap);
  }

  for (const entry of classInstancesMap) {
    if (entry[1].size > 0) {
      result.instanceKeys.push([entry["0"], [...entry[1]]]);
    }
  }

  return result;
}

/** @internal */
export function bisElementInstanceKeysProcessor(imodel: IModelDb, classInstancesMap: Map<string, Set<string>>) {
  const elementClassName = "BisCore:Element";
  const elementIds = classInstancesMap.get(elementClassName);
  if (elementIds) {
    const deleteElementIds = new Array<string>();
    elementIds.forEach((elementId) => {
      const concreteKey = getElementKey(imodel, elementId);
      if (concreteKey && concreteKey.className !== elementClassName) {
        deleteElementIds.push(elementId);
        addInstanceKey(classInstancesMap, { className: concreteKey.className, id: elementId });
      }
    });
    for (const id of deleteElementIds) {
      elementIds.delete(id);
    }
  }
}

function addInstanceKey(classInstancesMap: Map<string, Set<string>>, key: InstanceKey): void {
  let set = classInstancesMap.get(key.className);
  // istanbul ignore else
  if (!set) {
    set = new Set();
    classInstancesMap.set(key.className, set);
  }
  set.add(key.id);
}

interface UnitFormatMap {
  [phenomenon: string]: UnitSystemFormat;
}

function createNativePlatform(
  id: string,
  workerThreadsCount: number,
  mode: PresentationManagerMode,
  changeTrackingEnabled: boolean,
  caching: PresentationManagerProps["caching"],
  defaultFormats: UnitFormatMap | undefined,
  useMmap: boolean | number | undefined,
): NativePlatformDefinition {
  return new (createDefaultNativePlatform({
    id,
    taskAllocationsMap: { [Number.MAX_SAFE_INTEGER]: workerThreadsCount },
    mode,
    isChangeTrackingEnabled: changeTrackingEnabled,
    cacheConfig: createCacheConfig(caching?.hierarchies),
    contentCacheSize: caching?.content?.size,
    workerConnectionCacheSize: caching?.workerConnectionCacheSize,
    defaultFormats: toNativeUnitFormatsMap(defaultFormats),
    useMmap,
  }))();

  function createCacheConfig(config?: HierarchyCacheConfig): IModelJsNative.ECPresentationHierarchyCacheConfig {
    switch (config?.mode) {
      case HierarchyCacheMode.Disk:
        return { ...config, directory: normalizeDirectory(config.directory) };

      case HierarchyCacheMode.Hybrid:
        return {
          ...config,
          disk: config.disk ? { ...config.disk, directory: normalizeDirectory(config.disk.directory) } : undefined,
        };

      case HierarchyCacheMode.Memory:
        return config;

      default:
        return { mode: HierarchyCacheMode.Disk, directory: "" };
    }
  }

  function normalizeDirectory(directory?: string): string {
    return directory ? path.resolve(directory) : "";
  }

  function toNativeUnitFormatsMap(map: UnitFormatMap | undefined): NativePresentationDefaultUnitFormats | undefined {
    if (!map) {
      return undefined;
    }

    const nativeFormatsMap: NativePresentationDefaultUnitFormats = {};
    Object.keys(map).forEach((phenomenon) => {
      const unitSystemsFormat = map[phenomenon];
      nativeFormatsMap[phenomenon] = {
        unitSystems: unitSystemsFormat.unitSystems.map(toNativeUnitSystem),
        format: unitSystemsFormat.format,
      };
    });
    return nativeFormatsMap;
  }
}

function toOptionalNativeUnitSystem(unitSystem: UnitSystemKey | undefined): NativePresentationUnitSystem | undefined {
  return unitSystem ? toNativeUnitSystem(unitSystem) : undefined;
}

function toNativeUnitSystem(unitSystem: UnitSystemKey): NativePresentationUnitSystem {
  switch (unitSystem) {
    case "imperial": return NativePresentationUnitSystem.BritishImperial;
    case "metric": return NativePresentationUnitSystem.Metric;
    case "usCustomary": return NativePresentationUnitSystem.UsCustomary;
    case "usSurvey": return NativePresentationUnitSystem.UsSurvey;
  }
}

function collateAssetDirectories(mainDirectory: string, additionalDirectories: string[]): string[] {
  return [...new Set([mainDirectory, ...additionalDirectories])];
}

const createContentDescriptorOverrides = (descriptorOrOverrides: Descriptor | DescriptorOverrides): DescriptorOverrides => {
  if (descriptorOrOverrides instanceof Descriptor)
    return descriptorOrOverrides.createDescriptorOverrides();
  return descriptorOrOverrides;
};
