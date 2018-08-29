/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Settings */
import { AuthorizationToken } from "./Token";

export const enum SettingsStatus {
  SETTINGS_ERROR_BASE = 0x1b000,
  Success = 0,
  AuthorizationError = SETTINGS_ERROR_BASE + 1,
  UrlError = SETTINGS_ERROR_BASE + 2,
  ProjectInvalid = SETTINGS_ERROR_BASE + 3,
  IModelInvalid = SETTINGS_ERROR_BASE + 4,
  SettingNotFound = SETTINGS_ERROR_BASE + 5,
  ServerError = SETTINGS_ERROR_BASE + 6,
  SettingAlreadyExists = SETTINGS_ERROR_BASE + 7,
  UnknownError = SETTINGS_ERROR_BASE + 8,
}

export class SettingsResult {
  constructor(public status: SettingsStatus, public errorMessage?: string, public setting?: any) {
  }
}

/** Methods available to save and get Settings objects on behalf of combinations of the Application, Project, IModel, and User */
export interface SettingsAdmin {

  saveUserSetting(settings: any, namespace: string, name: string, authToken: AuthorizationToken, applicationSpecific: boolean, projectId?: string, iModelId?: string): Promise<SettingsResult>;

  getUserSetting(namespace: string, name: string, authToken: AuthorizationToken, applicationSpecific: boolean, projectId?: string, iModelId?: string): Promise<SettingsResult>;

  deleteUserSetting(namespace: string, name: string, authToken: AuthorizationToken, applicationSpecific: boolean, projectId?: string, iModelId?: string): Promise<SettingsResult>;

  saveSetting(settings: any, namespace: string, name: string, authToken: AuthorizationToken, applicationSpecific: boolean, projectId?: string, iModelId?: string): Promise<SettingsResult>;

  getSetting(namespace: string, name: string, authToken: AuthorizationToken, applicationSpecific: boolean, projectId?: string, iModelId?: string): Promise<SettingsResult>;

  deleteSetting(namespace: string, name: string, authToken: AuthorizationToken, applicationSpecific: boolean, projectId?: string, iModelId?: string): Promise<SettingsResult>;
}
