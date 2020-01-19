/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ContentView
 */

import * as React from "react";

import { ScreenViewport, IModelConnection, ViewState } from "@bentley/imodeljs-frontend";
import { Id64String } from "@bentley/bentleyjs-core";
import { UiEvent } from "@bentley/ui-core";

import { ConfigurableUiControlType, ConfigurableCreateInfo, ConfigurableUiControl } from "../configurableui/ConfigurableUiControl";

/** ControlControl Activated Event Args interface.
 * @public
 */
export interface ContentControlActivatedEventArgs {
  activeContentControl: ContentControl;
  oldContentControl?: ContentControl;
}

/** ContentControl Activated Event class.
 * @public
 */
export class ContentControlActivatedEvent extends UiEvent<ContentControlActivatedEventArgs> { }

/** Interface to be implemented when the ContentControl supports ViewSelector changes
 * @public
 */
export interface SupportsViewSelectorChange {
  /** Returns true if this control supports reacting to ViewSelector changes. */
  supportsViewSelectorChange: boolean;
  /** Process a ViewSelector change. */
  processViewSelectorChange(iModel: IModelConnection, viewDefinitionId: Id64String, viewState: ViewState, name: string): Promise<void>;
}

/** The base class for Frontstage content controls.
 * @public
 */
export class ContentControl extends ConfigurableUiControl {
  private _reactElement: React.ReactNode;
  private _keyAdded = false;

  /** Creates an instance of ContentControl.
   * @param info         An object that the subclass must pass to this base class.
   * @param options      Options provided via the applicationData in a [[ContentProps]].
   */
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);
  }

  /** Called when this ContentControl is activated */
  public onActivated(): void {
  }

  /** Called when this ContentControl is deactivated */
  public onDeactivated(): void {
  }

  /** Gets the type of ConfigurableUiControl, which is 'Content' in this case */
  public getType(): ConfigurableUiControlType { return ConfigurableUiControlType.Content; }

  /** Returns true if this control is a Viewport control. */
  public get isViewport(): boolean { return false; }
  /** Returns the ScreenViewport if isViewport is true */
  public get viewport(): ScreenViewport | undefined { return undefined; }

  /** The React element associated with this control. */
  public get reactElement(): React.ReactNode {
    if (!this._keyAdded && React.isValidElement(this._reactElement)) {
      if (!(this._reactElement as React.ReactElement<any>).key)
        this._reactElement = React.cloneElement(this._reactElement, { key: this.controlId });
      this._keyAdded = true;
    }

    return this._reactElement;
  }
  public set reactElement(r: React.ReactNode) { this._reactElement = r; }

  /** Get the NavigationAidControl associated with this ContentControl */
  public get navigationAidControl(): string {
    return "";
  }

}
