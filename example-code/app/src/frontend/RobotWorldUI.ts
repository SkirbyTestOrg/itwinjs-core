/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, IModelConnection, ViewState, SpatialViewState, ScreenViewport } from "@bentley/imodeljs-frontend";

export class RobotWorldApp extends IModelApp {

  private static _robotIModel: IModelConnection;

  // __PUBLISH_EXTRACT_START__ IModelConnection.Views.getViewList
  /** Get the list of Spatial views from the robot iModel. */
  public static async getSpatialViews(): Promise<IModelConnection.ViewSpec[]> {
    return this._robotIModel.views.getViewList({ from: SpatialViewState.sqlName });
  }
  // __PUBLISH_EXTRACT_END__

  // __PUBLISH_EXTRACT_START__ IModelConnection.Views.load
  /** Stub for a real UI that would present the user with the list and choose one entry */
  public static async pickView(views: IModelConnection.ViewSpec[]): Promise<string> {
    // ...real ui code here showing view[].name list, returning chosenView...
    const chosenView = 0;

    // return the id of the chosen view
    return views[chosenView].id;
  }

  /** Load the list of spatial views from our iModel, let the user pick one, and return a Promise for the ViewState of the selected view. */
  public static async loadOneView(): Promise<ViewState> {
    // first get the list of spatial views
    const views: IModelConnection.ViewSpec[] = await this.getSpatialViews();

    // ask the user to pick one from the list, returning its Id
    const viewId: string = await this.pickView(views);

    // return a promise for the ViewState of the selected view. Note that caller will have to await this method
    return this._robotIModel.views.load(viewId);
  }
  // __PUBLISH_EXTRACT_END__

  // __PUBLISH_EXTRACT_START__ ViewManager.addViewport
  /** Open a Viewport on the supplied div element. */
  public static async openView(viewDiv: HTMLDivElement) {
    const viewState = await this.loadOneView();
    const viewPort = ScreenViewport.create(viewDiv, viewState);
    this.viewManager.addViewport(viewPort);
  }
  // __PUBLISH_EXTRACT_END__

}
