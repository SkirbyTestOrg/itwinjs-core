/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { ActivityLoggingContext } from "@bentley/bentleyjs-core";
import { IModelDb, OpenParams } from "@bentley/imodeljs-backend";
import { AccessToken } from "@bentley/imodeljs-clients";
import { IModelVersion } from "@bentley/imodeljs-common";

const actx = new ActivityLoggingContext("");

/** Injectable handles for opening IModels andStatic functions to create Models, CodeSecs, Categories, Category Selector, Styles, and View Definitions */
export class IModelDbHandler {
    public constructor() { }
    public async openLatestIModelDb(accessToken: AccessToken, projectId: string, iModelId: string,
        openParams: OpenParams = OpenParams.pullAndPush(), iModelVersion: IModelVersion = IModelVersion.latest()): Promise<IModelDb> {
        return IModelDb.open(actx, accessToken, projectId, iModelId, openParams, iModelVersion);
    }
}
