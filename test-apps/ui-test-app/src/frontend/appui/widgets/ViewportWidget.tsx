/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as React from "react";
import { Id64String } from "@itwin/core-bentley";
import { IModelApp, IModelConnection, ScreenViewport } from "@itwin/core-frontend";
import { ViewportComponent } from "@itwin/imodel-components-react";
import { LoadingSpinner } from "@itwin/core-react";
import { ConfigurableCreateInfo, ViewSelector, ViewSelectorChangedEventArgs, WidgetControl } from "@itwin/appui-react";
import { ExternalIModel } from "../ExternalIModel";

/** Viewport Widget Control */
export class ViewportWidgetControl extends WidgetControl {

  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this.reactNode = <ViewportWidget iTwinName={options.projectName} imodelName={options.imodelName} />;
  }
}

export interface ViewportWidgetProps {
  iTwinName: string;
  imodelName: string;
}

interface ViewportWidgetState {
  viewId?: Id64String;
  iModelConnection?: IModelConnection;
}

/** Widget that displays a ViewportComponent or Loading message */
export class ViewportWidget extends React.Component<ViewportWidgetProps, ViewportWidgetState> {
  private _loading = IModelApp.localization.getLocalizedString("SampleApp:Test.loading");
  private _viewport: ScreenViewport | undefined;

  public override readonly state: Readonly<ViewportWidgetState> = {
    viewId: undefined,
    iModelConnection: undefined,
  };

  public override async componentDidMount() {
    const externalIModel = await ExternalIModel.create({iTwinName: this.props.iTwinName, iModelName: this.props.imodelName});
    await externalIModel.openIModel();

    if (externalIModel.viewId && externalIModel.iModelConnection) {
      this.setState({
        viewId: externalIModel.viewId,
        iModelConnection: externalIModel.iModelConnection,
      });
    }

    ViewSelector.onViewSelectorChangedEvent.addListener(this._handleViewSelectorChangedEvent);
  }

  public override componentWillUnmount() {
    ViewSelector.onViewSelectorChangedEvent.removeListener(this._handleViewSelectorChangedEvent);
  }

  private _handleViewSelectorChangedEvent = (args: ViewSelectorChangedEventArgs) => {
    if (this._viewport === IModelApp.viewManager.selectedView) {
      this.setState({
        viewId: args.viewDefinitionId,
        iModelConnection: args.iModelConnection,
      });
    }
  };

  public override render() {
    const divStyle: React.CSSProperties = {
      height: "100%",
    };
    let content: React.ReactNode;

    if (this.state.viewId === undefined || this.state.iModelConnection === undefined)
      content = (
        <div className="uifw-centered" style={divStyle}> <LoadingSpinner message={this._loading} /> </div>
      );
    else
      content = (
        <ViewportComponent
          viewDefinitionId={this.state.viewId}
          imodel={this.state.iModelConnection}
          viewportRef={(v: ScreenViewport) => { this._viewport = v; }} />
      );

    return content;
  }
}

/** Widget that displays a ViewportComponent or Loading message */
export class IModelViewport extends React.Component<ViewportWidgetProps, ViewportWidgetState> {
  private _loading = IModelApp.localization.getLocalizedString("SampleApp:Test.loading");
  private _viewport: ScreenViewport | undefined;

  public override readonly state: Readonly<ViewportWidgetState> = {
    viewId: undefined,
    iModelConnection: undefined,
  };

  public override async componentDidMount() {
    const externalIModel = await ExternalIModel.create({iTwinName: this.props.iTwinName, iModelName: this.props.imodelName});
    await externalIModel.openIModel();

    if (externalIModel.viewId && externalIModel.iModelConnection) {
      this.setState({
        viewId: externalIModel.viewId,
        iModelConnection: externalIModel.iModelConnection,
      });
    }

    ViewSelector.onViewSelectorChangedEvent.addListener(this._handleViewSelectorChangedEvent);
  }

  public override componentWillUnmount() {
    ViewSelector.onViewSelectorChangedEvent.removeListener(this._handleViewSelectorChangedEvent);
  }

  private _handleViewSelectorChangedEvent = (args: ViewSelectorChangedEventArgs) => {
    if (this._viewport === IModelApp.viewManager.selectedView) {
      this.setState({
        viewId: args.viewDefinitionId,
        iModelConnection: args.iModelConnection,
      });
    }
  };

  public override render() {
    const divStyle: React.CSSProperties = {
      height: "100%",
    };
    let content: React.ReactNode;

    if (this.state.viewId === undefined || this.state.iModelConnection === undefined)
      content = (
        <div className="uifw-centered" style={divStyle}> <LoadingSpinner message={this._loading} /> </div>
      );
    else
      content = (
        <ViewportComponent
          viewDefinitionId={this.state.viewId}
          imodel={this.state.iModelConnection}
          viewportRef={(v: ScreenViewport) => { this._viewport = v; }} />
      );

    return content;
  }
}
