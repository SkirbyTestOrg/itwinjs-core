/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import stageIconSvg from "@bentley/icons-generic/icons/imodeljs.svg?sprite";
import settingsIconSvg from "@bentley/icons-generic/icons/settings.svg?sprite";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { BackstageItem, BackstageItemUtilities, ConditionalBooleanValue } from "@bentley/ui-abstract";
import { FrontstageManager } from "@bentley/ui-framework";
import { SampleAppIModelApp, SampleAppUiActionId } from "../..";
import { LocalFileOpenFrontstage } from "../frontstages/LocalFileStage";
import { SettingsModalFrontstage } from "../frontstages/Settings";

export class AppBackstageItemProvider {
  public static readonly id = "simple-editor-app.AppBackstageItemProvider";
  private _backstageItems?: BackstageItem[];

  public get backstageItems(): BackstageItem[] {
    if (!this._backstageItems) {
      const imodelIndexHidden = new ConditionalBooleanValue(() => SampleAppIModelApp.isIModelLocal, [SampleAppUiActionId.setIsIModelLocal]);
      this._backstageItems = [
        BackstageItemUtilities.createStageLauncher("IModelOpen", 200, 10, IModelApp.i18n.translate("SampleApp:backstage.imodelopen"), undefined, "icon-folder-opened"),
        BackstageItemUtilities.createStageLauncher("IModelIndex", 200, 20, IModelApp.i18n.translate("SampleApp:backstage.imodelindex"), undefined, "icon-placeholder", { isHidden: imodelIndexHidden }),
        BackstageItemUtilities.createActionItem("SampleApp.open-local-file", 200, 30, () => LocalFileOpenFrontstage.open(), IModelApp.i18n.translate("SampleApp:backstage:fileSelect"), undefined, "icon-placeholder"),
        BackstageItemUtilities.createActionItem("SampleApp.settings", 300, 10, () => FrontstageManager.openModalFrontstage(new SettingsModalFrontstage()), IModelApp.i18n.translate("SampleApp:backstage.testFrontstage6"), undefined, `svg:${settingsIconSvg}`),
        BackstageItemUtilities.createStageLauncher("ViewsFrontstage", 400, 10, IModelApp.i18n.translate("SampleApp:backstage.viewIModel"), IModelApp.i18n.translate("SampleApp:backstage.iModelStage"), `svg:${stageIconSvg}`),
      ];
    }
    return this._backstageItems!;
  }
}
