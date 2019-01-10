/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import * as React from "react";
import { IModelApp, IModelConnection } from "@bentley/imodeljs-frontend";
import { PresentationPropertyDataProvider, propertyGridWithUnifiedSelection } from "@bentley/presentation-components";
import { PropertyGrid, PropertyData, PropertyCategory } from "@bentley/ui-components";
import "./PropertiesWidget.css";

// tslint:disable-next-line:variable-name naming-convention
const SamplePropertyGrid = propertyGridWithUnifiedSelection(PropertyGrid);

export interface Props {
  imodel: IModelConnection;
  rulesetId: string;
}
export interface State {
  dataProvider: PresentationPropertyDataProvider;
}
export default class PropertiesWidget extends React.Component<Props, State> {
  constructor(props: Props, context?: any) {
    super(props, context);
    this.state = {
      dataProvider: createDataProvider(this.props.imodel, this.props.rulesetId),
    };
  }
  public static getDerivedStateFromProps(props: Props, state: State) {
    if (props.imodel !== state.dataProvider.imodel || props.rulesetId !== state.dataProvider.rulesetId)
      return { ...state, dataProvider: createDataProvider(props.imodel, props.rulesetId) };
    return null;
  }
  public render() {
    return (
      <div className="PropertiesWidget">
        <h3>{IModelApp.i18n.translate("Sample:controls.properties")}</h3>
        <div className="ContentContainer">
          <SamplePropertyGrid
            dataProvider={this.state.dataProvider}
          />
        </div>
      </div>
    );
  }
}

class AutoExpandingPropertyDataProvider extends PresentationPropertyDataProvider {
  public async getData(): Promise<PropertyData> {
    const result = await super.getData();
    result.categories.forEach((category: PropertyCategory) => {
      category.expand = true;
    });
    return result;
  }
}

function createDataProvider(imodel: IModelConnection, rulesetId: string): PresentationPropertyDataProvider {
  return new AutoExpandingPropertyDataProvider(imodel, rulesetId);
}
