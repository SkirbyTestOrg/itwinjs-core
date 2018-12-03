/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import * as React from "react";
import { IModelApp, IModelConnection } from "@bentley/imodeljs-frontend";
import { PresentationTreeDataProvider, withFilteringSupport, withUnifiedSelection } from "@bentley/presentation-components/lib/tree";
import { Tree, FilteringInput } from "@bentley/ui-components";
import "./TreeWidget.css";

// tslint:disable-next-line:variable-name naming-convention
const SampleTree = withFilteringSupport(withUnifiedSelection(Tree));

export interface Props {
  imodel: IModelConnection;
  rulesetId: string;
}

export interface State {
  dataProvider: PresentationTreeDataProvider;
  prevProps: Props;
  filter: string;
  isFiltering: boolean;
  matchesCount: number;
  activeMatchIndex: number;
}

export default class TreeWidget extends React.Component<Props, State> {

  constructor(props: Props) {
    super(props);
    this.state = {
      dataProvider: new PresentationTreeDataProvider(props.imodel, props.rulesetId),
      prevProps: props,
      filter: "",
      isFiltering: false,
      matchesCount: 0,
      activeMatchIndex: 0,
    };
  }

  public static getDerivedStateFromProps(nextProps: Props, state: State) {
    const base = { ...state, prevProps: nextProps };
    if (nextProps.imodel !== state.prevProps.imodel || nextProps.rulesetId !== state.prevProps.rulesetId)
      return { ...base, dataProvider: new PresentationTreeDataProvider(nextProps.imodel, nextProps.rulesetId) };
    return base;
  }

  // tslint:disable-next-line:naming-convention
  private onFilterApplied = (_filter?: string): void => {
    if (this.state.isFiltering)
      this.setState({ isFiltering: false });
  }

  private _onFilterStart = (filter: string) => {
    this.setState({ filter, isFiltering: true });
  }

  private _onFilterCancel = () => {
    this.setState({ filter: "", isFiltering: false });
  }

  private _onFilterClear = () => {
    this.setState({ filter: "", isFiltering: false });
  }

  private _onMatchesCounted = (count: number) => {
    if (count !== this.state.matchesCount)
      this.setState({ matchesCount: count });
  }

  private _onActiveMatchChanged = (index: number) => {
    this.setState({ activeMatchIndex: index });
  }

  public render() {
    return (
      <div className="treewidget">
        <div className="treewidget-header">
          <h3>{IModelApp.i18n.translate("Sample:controls.tree")}</h3>
          <FilteringInput
            filteringInProgress={this.state.isFiltering}
            onFilterCancel={this._onFilterCancel}
            onFilterClear={this._onFilterClear}
            onFilterStart={this._onFilterStart}
            resultSelectorProps={{
              onSelectedChanged: this._onActiveMatchChanged,
              resultCount: this.state.matchesCount,
            }} />
        </div>
        <SampleTree dataProvider={this.state.dataProvider}
          pageSize={5} disposeChildrenOnCollapse={true}
          filter={this.state.filter}
          onFilterApplied={this.onFilterApplied}
          onMatchesCounted={this._onMatchesCounted}
          activeMatchIndex={this.state.activeMatchIndex} />
      </div>
    );
  }
}
