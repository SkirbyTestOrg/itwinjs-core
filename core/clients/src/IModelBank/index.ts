/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
export * from "./IModelBankClient";
export * from "./IModelBankHandler";

// NOTE: Classes with backend-specific dependencies (like "fs") must be kept out of the "barrel" to avoid unacceptable webpack trickery on the frontend.
// NOTE: Do not export UrlFileHandler - "fs" dependency
