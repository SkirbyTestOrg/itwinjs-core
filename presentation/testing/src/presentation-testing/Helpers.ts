/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Helpers
 */
import * as path from "path";
import * as rimraf from "rimraf";
// common includes
import { Guid, Config } from "@bentley/bentleyjs-core";
import { PresentationRpcInterface } from "@bentley/presentation-common";
// backend includes
import { IModelHost, KnownLocations } from "@bentley/imodeljs-backend";
import { Presentation as PresentationBackend, PresentationManagerProps as PresentationBackendProps } from "@bentley/presentation-backend";
// frontend includes
import {
  SnapshotIModelRpcInterface,
  IModelReadRpcInterface,
  RpcConfiguration,
  RpcInterfaceDefinition,
  RpcDefaultConfiguration,
} from "@bentley/imodeljs-common";
import { NoRenderApp, IModelApp, IModelAppOptions } from "@bentley/imodeljs-frontend";
import {
  Presentation as PresentationFrontend,
  PresentationManagerProps as PresentationFrontendProps,
} from "@bentley/presentation-frontend";

import { AgentAuthorizationClientConfiguration, AgentAuthorizationClient } from "@bentley/imodeljs-clients-backend";

function initializeRpcInterfaces(interfaces: RpcInterfaceDefinition[]) {
  const config = class extends RpcDefaultConfiguration {
    public interfaces: any = () => interfaces;
  };

  for (const definition of interfaces)
    RpcConfiguration.assign(definition, () => config);

  const instance = RpcConfiguration.obtain(config);

  try {
    RpcConfiguration.initializeInterfaces(instance);
  } catch {
    // this may fail with "Error: RPC interface "xxx" is already initialized." because
    // multiple different tests want to set up rpc interfaces
  }
}

let isInitialized = false;

/** @public */
export interface PresentationTestingInitProps {
  /** Properties for backend initialization */
  backendProps?: PresentationBackendProps;
  /** Properties for frontend initialization */
  frontendProps?: PresentationFrontendProps;
  /** IModelApp implementation */
  frontendApp?: { startup: (opts?: IModelAppOptions) => Promise<void> };
  /** Whether to use authorization client */
  useClientServices?: boolean;
}

/**
 * Initialize the framework for presentation testing. The function sets up backend,
 * frontend and RPC communication between them.
 *
 * @see `terminate`
 *
 * @public
 */
export const initialize = async (props?: PresentationTestingInitProps) => {
  if (isInitialized)
    return;

  if (!props)
    props = {};

  // init backend
  // make sure backend gets assigned an id which puts its resources into a unique directory
  props.backendProps = props.backendProps ?? {};
  if (!props.backendProps.id)
    props.backendProps.id = `test-${Guid.createValue()}`;
  IModelHost.startup();
  PresentationBackend.initialize(props.backendProps);

  // set up rpc interfaces
  initializeRpcInterfaces([SnapshotIModelRpcInterface, IModelReadRpcInterface, PresentationRpcInterface]);

  // init frontend
  if (!props.frontendApp)
    props.frontendApp = NoRenderApp;
  if (props.useClientServices) {
    const agentConfiguration: AgentAuthorizationClientConfiguration = {
      clientId: Config.App.getString("imjs_agent_test_client_id"),
      clientSecret: Config.App.getString("imjs_agent_test_client_secret"),
      scope: "imodelhub rbac-user:external-client reality-data:read urlps-third-party context-registry-service:read-only imodeljs-backend-2686 product-settings-service",
    };
    const authorizationClient = new AgentAuthorizationClient(agentConfiguration);
    await authorizationClient.getAccessToken();
    await props.frontendApp.startup({ authorizationClient });
  } else {
    await props.frontendApp.startup();
  }
  const defaultFrontendProps: PresentationFrontendProps = {
    activeLocale: IModelApp.i18n.languageList()[0],
  };
  await PresentationFrontend.initialize({ ...defaultFrontendProps, ...props.frontendProps });

  isInitialized = true;
};

/**
 * Undoes the setup made by `initialize`.
 * @param frontendApp IModelApp implementation
 *
 * @see `initialize`
 *
 * @public
 */
export const terminate = (frontendApp = IModelApp) => {
  if (!isInitialized)
    return;

  // store directory that needs to be cleaned-up
  const tempDirectory = (PresentationBackend.initProps && PresentationBackend.initProps.id)
    ? path.join(KnownLocations.tmpdir, "ecpresentation", PresentationBackend.initProps.id) : undefined;

  // terminate backend
  PresentationBackend.terminate();
  IModelHost.shutdown();
  if (tempDirectory)
    rimraf.sync(tempDirectory);

  // terminate frontend
  PresentationFrontend.terminate();
  frontendApp.shutdown();

  isInitialized = false;
};
