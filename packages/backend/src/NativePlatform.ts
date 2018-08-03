/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Core */

import { IDisposable } from "@bentley/bentleyjs-core";
import { NativeECPresentationManager, NativeECPresentationStatus, ErrorStatusOrResult } from "@bentley/imodeljs-backend/lib/imodeljs-native-platform-api";
import { IModelDb, NativePlatformRegistry } from "@bentley/imodeljs-backend";
import { ECPresentationError, ECPresentationStatus } from "@bentley/ecpresentation-common";

/** @hidden */
export enum NativePlatformRequestTypes {
  GetRootNodes = "GetRootNodes",
  GetRootNodesCount = "GetRootNodesCount",
  GetChildren = "GetChildren",
  GetChildrenCount = "GetChildrenCount",
  GetNodePaths = "GetNodePaths",
  GetFilteredNodePaths = "GetFilteredNodePaths",
  GetContentDescriptor = "GetContentDescriptor",
  GetContentSetSize = "GetContentSetSize",
  GetContent = "GetContent",
  GetDistinctValues = "GetDistinctValues",
}

/** @hidden */
export interface NativePlatformDefinition extends IDisposable {
  setupRulesetDirectories(directories: string[]): void;
  setupLocaleDirectories(directories: string[]): void;
  getImodelAddon(imodel: IModelDb): any;
  getRulesets(rulesetId: string): string;
  addRuleset(serializedRulesetJson: string): void;
  removeRuleset(rulesetId: string): void;
  clearRulesets(): void;
  handleRequest(db: any, options: string): Promise<string>;
  getUserSetting(rulesetId: string, settingId: string, settingType: string): any;
  setUserSetting(rulesetId: string, settingId: string, settingValue: string): void;
}

/** @hidden */
export const createDefaultNativePlatform = (): { new(): NativePlatformDefinition; } => {
  // note the implementation is constructed here to make ECPresentationManager
  // usable without loading the actual addon (if addon is set to something other)
  return class implements NativePlatformDefinition {
    private _nativeAddon: NativeECPresentationManager = new (NativePlatformRegistry.getNativePlatform()).NativeECPresentationManager();
    private getStatus(responseStatus: NativeECPresentationStatus): ECPresentationStatus {
      switch (responseStatus) {
        case NativeECPresentationStatus.InvalidArgument: return ECPresentationStatus.InvalidArgument;
        default: return ECPresentationStatus.Error;
      }
    }
    private handleResult<T>(response: ErrorStatusOrResult<NativeECPresentationStatus, T>): T {
      if (!response)
        throw new ECPresentationError(ECPresentationStatus.InvalidResponse);
      if (response.error)
        throw new ECPresentationError(this.getStatus(response.error.status), response.error.message);
      if (response.result === undefined)
        throw new ECPresentationError(ECPresentationStatus.InvalidResponse);
      return response.result;
    }
    private handleVoidResult(response: ErrorStatusOrResult<NativeECPresentationStatus, void>): void {
      if (!response)
        throw new ECPresentationError(ECPresentationStatus.InvalidResponse);
      if (response.error)
        throw new ECPresentationError(this.getStatus(response.error.status), response.error.message);
    }
    public dispose() {
      this._nativeAddon.dispose();
    }
    public setupRulesetDirectories(directories: string[]): void {
      this.handleVoidResult(this._nativeAddon.setupRulesetDirectories(directories));
    }
    public setupLocaleDirectories(directories: string[]): void {
      this.handleVoidResult(this._nativeAddon.setupLocaleDirectories(directories));
    }
    public getImodelAddon(imodel: IModelDb): any {
      if (!imodel.briefcase || !imodel.nativeDb)
        throw new ECPresentationError(ECPresentationStatus.InvalidArgument, "imodel");
      return imodel.nativeDb;
    }
    public getRulesets(rulesetId: string): string {
      return this.handleResult(this._nativeAddon.getRulesets(rulesetId));
    }
    public addRuleset(serializedRulesetJson: string): void {
      this.handleVoidResult(this._nativeAddon.addRuleset(serializedRulesetJson));
    }
    public removeRuleset(rulesetId: string): void {
      this.handleVoidResult(this._nativeAddon.removeRuleset(rulesetId));
    }
    public clearRulesets(): void {
      this.handleVoidResult(this._nativeAddon.clearRulesets());
    }
    public handleRequest(db: any, options: string): Promise<string> {
      return new Promise((resolve, reject) => {
        this._nativeAddon.handleRequest(db, options, (response) => {
          try {
            resolve(this.handleResult(response));
          } catch (error) {
            reject(error);
          }
        });
      });
    }
    public getUserSetting(rulesetId: string, settingId: string, settingType: string): any {
      return this.handleResult(this._nativeAddon.getUserSetting(rulesetId, settingId, settingType));
    }
    public setUserSetting(rulesetId: string, settingId: string, settingValue: string): void {
      this.handleVoidResult(this._nativeAddon.setUserSetting(rulesetId, settingId, settingValue));
    }
  };
};
