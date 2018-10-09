/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import React from "react";
import { PropertyRecord } from "../../properties";
import { PropertyCategory } from "../PropertyDataProvider";
import { PropertyCategoryBlock, PropertyCategoryBlockProps } from "./PropertyCategoryBlock";
import { PropertyRenderer } from "./PropertyRenderer";
import { Orientation } from "@bentley/ui-core";

/** @hidden */
export interface SelectablePropertyBlockProps extends PropertyCategoryBlockProps, PropertyListProps {
  properties: PropertyRecord[];
  selectedPropertyKey?: string;
  onPropertyClicked?: (property: PropertyRecord, key?: string) => void;
}

/** @hidden */
export interface SelectablePropertyBlockState {
  keyMatched: boolean;
}

/**
 * Wrapped PropertyCategoryBlock React component with list of properties and render optimization
 * @hidden
 */
export class SelectablePropertyBlock extends React.Component<SelectablePropertyBlockProps, SelectablePropertyBlockState> {
  public state: SelectablePropertyBlockState = { keyMatched: false };
  public shouldComponentUpdate(nextProps: SelectablePropertyBlockProps, nextState: SelectablePropertyBlockState): boolean {
    if (this.props.category !== nextProps.category
      || this.props.properties !== nextProps.properties
      || this.props.orientation !== nextProps.orientation
      || this.props.onExpansionToggled !== nextProps.onExpansionToggled
      || this.props.onPropertyClicked !== nextProps.onPropertyClicked)
      return true;

    // If keys are not the same it means component might need an update, but that's not enough.
    // Keys must EITHER both match now and before (when a different property is selected in the same category)
    // OR match now, but not before/don't match now, but match before (when a property in a different category is selected)
    return this.props.selectedPropertyKey !== nextProps.selectedPropertyKey
      && ((nextState.keyMatched !== this.state.keyMatched) || (!!nextState.keyMatched && !!this.state.keyMatched));
  }

  public static getPropertyKey(propertyCategory: PropertyCategory, propertyRecord: PropertyRecord) {
    return propertyCategory.name + propertyRecord.property.name;
  }

  public static doesKeyMatchAnyProperty(props: SelectablePropertyBlockProps, key?: string) {
    if (!key)
      return false;
    for (const propertyRecord of props.properties) {
      if (SelectablePropertyBlock.getPropertyKey(props.category, propertyRecord) === key)
        return true;
    }
    return false;
  }

  public static getDerivedStateFromProps(props: SelectablePropertyBlockProps) {
    return { keyMatched: SelectablePropertyBlock.doesKeyMatchAnyProperty(props, props.selectedPropertyKey) };
  }

  public render() {
    return (<PropertyCategoryBlock category={this.props.category} onExpansionToggled={this.props.onExpansionToggled}>
      <PropertyList orientation={this.props.orientation}>
        {this.props.properties.map((propertyRecord: PropertyRecord) => {
          const key = this.props.category.name + propertyRecord.property.name;
          return (
            <PropertyRenderer
              key={key}
              uniqueKey={key}
              isSelected={key === this.props.selectedPropertyKey}
              propertyRecord={propertyRecord}
              orientation={this.props.orientation}
              onClick={this.props.onPropertyClicked}
            />);
        })}
      </PropertyList>
    </PropertyCategoryBlock>);
  }
}

interface PropertyListProps {
  orientation: Orientation;
}

/** Container component for properties within a category.
 */
class PropertyList extends React.PureComponent<PropertyListProps> {
  public render() {
    const propertyListClassName = this.props.orientation === Orientation.Horizontal ? "components-property-list--horizontal" : "components-property-list--vertical";

    return (
      <div className={propertyListClassName}>
        {this.props.children}
      </div>
    );
  }
}
