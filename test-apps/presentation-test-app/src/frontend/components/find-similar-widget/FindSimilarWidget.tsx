/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import "./FindSimilarWidget.css";
import * as React from "react";
import { IModelApp } from "@itwin/core-frontend";
import { IPresentationTableDataProvider, tableWithUnifiedSelection } from "@itwin/presentation-components";
import { SelectionMode, Table } from "@itwin/components-react";

// eslint-disable-next-line deprecation/deprecation
const SampleTable = tableWithUnifiedSelection(Table);

export interface Props {
  dataProvider: IPresentationTableDataProvider & { dispose?: () => void };
  onDismissed?: () => void;
}

export default class FindSimilarWidget extends React.PureComponent<Props> {
  constructor(props: Props, context?: any) {
    super(props, context);
    this.state = { prevProps: props };
  }
  public override componentWillUnmount() {
    if (this.props.dataProvider.dispose)
      this.props.dataProvider.dispose();
  }
  public override componentDidUpdate(prevProps: Props) {
    if (this.props.dataProvider !== prevProps.dataProvider && prevProps.dataProvider.dispose)
      prevProps.dataProvider.dispose();
  }
  private _onDismissClicked = () => {
    if (this.props.onDismissed)
      this.props.onDismissed();
  };
  public override render() {
    return (
      <div className="find-similar-widget">
        <div className="find-similar-header">
          <h3>{IModelApp.localization.getLocalizedString("Sample:controls.find-similar.results")}</h3>
          <button onClick={this._onDismissClicked}>
            {IModelApp.localization.getLocalizedString("Sample:controls.find-similar.dismiss-button.label")}
          </button>
        </div>
        <div className="find-similar-widget-content">
          <SampleTable dataProvider={this.props.dataProvider} selectionLevel={0} selectionMode={SelectionMode.Extended} />
        </div>
      </div>
    );
  }
}
