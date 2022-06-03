/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Draft, produce } from "immer";
import * as React from "react";
import { PropertyDescription, PropertyValue } from "@itwin/appui-abstract";
import { Guid } from "@itwin/core-bentley";
import { propertyFilterOperatorNeedsValue, PropertyFilterRuleGroupOperator, PropertyFilterRuleOperator } from "./Operators";

/** @alpha */
export interface PropertyFilterBuilderState {
  rootGroup: PropertyFilterBuilderRuleGroup;
}

/** @alpha */
export type PropertyFilterBuilderRuleGroupItem = PropertyFilterBuilderRuleGroup | PropertyFilterBuilderRule;

/** @alpha */
export interface PropertyFilterBuilderRuleGroup {
  id: string;
  groupId?: string;
  operator: PropertyFilterRuleGroupOperator;
  items: PropertyFilterBuilderRuleGroupItem[];
}

/** @alpha */
export interface PropertyFilterBuilderRule {
  id: string;
  groupId: string;
  property?: PropertyDescription;
  operator?: PropertyFilterRuleOperator;
  value?: PropertyValue;
}

/** @alpha */
export class PropertyFilterBuilderActions {
  constructor(private setState: (setter: (prevState: PropertyFilterBuilderState) => PropertyFilterBuilderState) => void) {}

  private updateState(updater: (state: Draft<PropertyFilterBuilderState>) => void) {
    this.setState(produce(updater));
  }

  public addItem(path: string[], itemType: "RULE_GROUP" | "RULE") {
    this.updateState((state) => {
      const parentGroup = findRuleGroup(state.rootGroup, path);
      if (!parentGroup)
        return;
      const item = itemType === "RULE_GROUP" ? createEmptyRuleGroup(parentGroup.id) : createEmptyRule(parentGroup.id);
      parentGroup.items.push(item);
    });
  }

  public removeItem(path: string[]) {
    function removeItemFromGroup(state: Draft<PropertyFilterBuilderState>, pathToItem: string[]) {
      const itemId = pathToItem.pop();
      const parentGroup = findRuleGroup(state.rootGroup, pathToItem);
      if (!parentGroup)
        return;
      const itemIndex = parentGroup.items.findIndex((item) => item.id === itemId);
      if (itemIndex === -1)
        return;
      parentGroup.items.splice(itemIndex, 1);
      if (parentGroup.items.length === 0)
        removeItemFromGroup(state, pathToItem);
    }

    this.updateState((state) => {
      removeItemFromGroup(state, path);
    });
  }

  public setRuleGroupOperator(path: string[], operator: PropertyFilterRuleGroupOperator) {
    this.updateState((state) => {
      const group = findRuleGroup(state.rootGroup, path);
      if (!group)
        return;
      group.operator = operator;
    });
  }

  public setRuleProperty(path: string[], property?: PropertyDescription) {
    this.updateState((state) => {
      const rule = findRule(state.rootGroup, path);
      if (!rule)
        return;
      rule.property = property;
      rule.operator = undefined;
      rule.value = undefined;
    });
  }

  public setRuleOperator(path: string[], operator: PropertyFilterRuleOperator) {
    this.updateState((state) => {
      const rule = findRule(state.rootGroup, path);
      if (!rule)
        return;
      if (!propertyFilterOperatorNeedsValue(operator))
        rule.value = undefined;
      rule.operator = operator;
    });
  }

  public setRuleValue(path: string[], value: PropertyValue) {
    this.updateState((state) => {
      const rule = findRule(state.rootGroup, path);
      if (!rule)
        return;
      rule.value = value;
    });
  }
}

/** @alpha */
export function isPropertyFilterBuilderRuleGroup(item: PropertyFilterBuilderRuleGroupItem): item is PropertyFilterBuilderRuleGroup {
  return (item as any).items !== undefined;
}

/** @alpha */
export function usePropertyFilterBuilderState() {
  const [state, setState] = React.useState<PropertyFilterBuilderState>(() => ({
    rootGroup: createEmptyRuleGroup(),
  }));
  const [actions] = React.useState(() => new PropertyFilterBuilderActions(setState));

  return { state, actions };
}

function createEmptyRule(groupId: string): PropertyFilterBuilderRule {
  return {
    id: Guid.createValue(),
    groupId,
  };
}

function createEmptyRuleGroup(groupId?: string): PropertyFilterBuilderRuleGroup {
  const id = Guid.createValue();
  return {
    id,
    groupId,
    operator: PropertyFilterRuleGroupOperator.And,
    items: [createEmptyRule(id)],
  };
}

function findRuleGroup(rootGroup: PropertyFilterBuilderRuleGroup, path: string[]): PropertyFilterBuilderRuleGroup | undefined {
  if (path.length === 0)
    return rootGroup;

  const [currentItemId, ...rest] = path;
  const currentItem = rootGroup.items.find((item) => item.id === currentItemId);
  if (!currentItem || !isPropertyFilterBuilderRuleGroup(currentItem))
    return undefined;

  return findRuleGroup(currentItem, rest);
}

function findRule(rootGroup: PropertyFilterBuilderRuleGroup, path: string[]): PropertyFilterBuilderRule | undefined {
  if (path.length === 0)
    return undefined;

  const [currentItemId, ...rest] = path;
  const currentItem = rootGroup.items.find((item) => item.id === currentItemId);
  if (!currentItem)
    return undefined;

  if (isPropertyFilterBuilderRuleGroup(currentItem))
    return findRule(currentItem, rest);

  return currentItem;
}
