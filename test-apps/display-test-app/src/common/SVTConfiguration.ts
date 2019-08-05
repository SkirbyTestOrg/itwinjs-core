/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** Parameters for starting display-test-app with a specified initial configuration */
export interface SVTConfiguration {
  customOrchestratorUri?: string;
  viewName?: string;
  // standalone-specific config:
  standalone?: boolean;
  iModelName?: string;
  filename?: string;
  standalonePath?: string;    // Used when run in the browser - a common base path for all standalone imodels
  signInForStandalone?: boolean; // If true, and standalone is true, then sign in. Required when opening local files containing reality models.
  enableDiagnostics?: boolean; // If true, all RenderDiagnostics will be enabled (assertions, debug output, GL state checks).
  disabledExtensions?: string[]; // An array of names of WebGL extensions to be disabled
  disableInstancing?: boolean;
  disableMagnification?: boolean;
  preserveShaderSourceCode?: boolean;
  displaySolarShadows?: boolean; // default ON
  tileTreeExpirationSeconds?: number;
  logarithmicZBuffer?: boolean; // default ON (if extension supported)
}

export interface ConnectProjectConfiguration {
  projectName: string;
  iModelName: string;
}
