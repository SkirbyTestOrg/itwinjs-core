/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Draft, produce } from "immer";
import * as React from "react";
import { PropertyDescription, PropertyValue } from "@itwin/appui-abstract";
import { Guid } from "@itwin/core-bentley";
import { FilterRuleGroupOperator, FilterRuleOperator, filterRuleOperatorNeedsValue } from "./Operators";

/** @alpha */
export interface FilterBuilderState {
  rootGroup: FilterRuleGroup;
}

/** @alpha */
export type FilterRuleGroupItem = FilterRuleGroup | FilterRule;

/** @alpha */
export interface FilterRuleGroup {
  id: string;
  groupId?: string;
  operator: FilterRuleGroupOperator;
  items: FilterRuleGroupItem[];
}

/** @alpha */
export interface FilterRule {
  id: string;
  groupId: string;
  property?: PropertyDescription;
  operator?: FilterRuleOperator;
  value?: PropertyValue;
}

/** @alpha */
export interface AddItemAction {
  type: "ADD_ITEM";
  path: string[];
  itemType: "RULE" | "RULE_GROUP";
}

/** @alpha */
export interface RemoveItemAction {
  type: "REMOVE_ITEM";
  path: string[];
}

/** @alpha */
export interface SetRuleGroupOperatorAction {
  type: "SET_RULE_GROUP_OPERATOR";
  path: string[];
  operator: FilterRuleGroupOperator;
}

/** @alpha */
export interface SetRulePropertyAction {
  type: "SET_RULE_PROPERTY";
  path: string[];
  property?: PropertyDescription;
}

/** @alpha */
export interface SetRuleOperatorAction {
  type: "SET_RULE_OPERATOR";
  path: string[];
  operator: FilterRuleOperator;
}

/** @alpha */
export interface SetRuleValueAction {
  type: "SET_RULE_VALUE";
  path: string[];
  value: PropertyValue;
}

/** @alpha */
export interface ResetPropertiesAction {
  type: "RESET_PROPERTIES";
}

/** @alpha */
export type FilterBuilderAction =
  AddItemAction |
  RemoveItemAction |
  SetRuleGroupOperatorAction |
  SetRulePropertyAction |
  SetRuleOperatorAction |
  SetRuleValueAction;

/** @alpha */
export const filterBuilderStateReducer: (state: FilterBuilderState, action: FilterBuilderAction) => FilterBuilderState = produce(
  (state: Draft<FilterBuilderState>, action: FilterBuilderAction) => {
    switch (action.type) {
      case "ADD_ITEM": {
        const parentGroup = findRuleGroup(state.rootGroup, action.path);
        if (!parentGroup)
          return;
        const item = action.itemType === "RULE_GROUP" ? createEmptyRuleGroup(parentGroup.id) : createEmptyRule(parentGroup.id);
        parentGroup.items.push(item);
        return;
      }
      case "REMOVE_ITEM": {
        const itemId = action.path.pop();
        const parentGroup = findRuleGroup(state.rootGroup, action.path);
        if (!parentGroup)
          return;
        const itemIndex = parentGroup.items.findIndex((item) => item.id === itemId);
        if (itemIndex === -1)
          return;
        parentGroup.items.splice(itemIndex, 1);
        return;
      }
      case "SET_RULE_GROUP_OPERATOR": {
        const group = findRuleGroup(state.rootGroup, action.path);
        if (!group)
          return;
        group.operator = action.operator;
        return;
      }
      case "SET_RULE_PROPERTY": {
        const rule = findRule(state.rootGroup, action.path);
        if (!rule)
          return;
        rule.property = action.property;
        rule.operator = undefined;
        rule.value = undefined;
        return;
      }
      case "SET_RULE_OPERATOR": {
        const rule = findRule(state.rootGroup, action.path);
        if (!rule)
          return;
        if (!filterRuleOperatorNeedsValue(action.operator))
          rule.value = undefined;
        rule.operator = action.operator;
        return;
      }
      case "SET_RULE_VALUE": {
        const rule = findRule(state.rootGroup, action.path);
        if (!rule)
          return;
        rule.value = action.value;
        return;
      }
    }
  });

/** @alpha */
export function isFilterRuleGroup(item: FilterRuleGroupItem): item is FilterRuleGroup {
  return (item as any).items !== undefined;
}

/** @alpha */
export function useFilterBuilderState() {
  return React.useReducer(filterBuilderStateReducer, {
    rootGroup: createEmptyRuleGroup(),
  });
}

function createEmptyRule(groupId: string): FilterRule {
  return {
    id: Guid.createValue(),
    groupId,
  };
}

function createEmptyRuleGroup(groupId?: string): FilterRuleGroup {
  const id = Guid.createValue();
  return {
    id,
    groupId,
    operator: FilterRuleGroupOperator.And,
    items: [createEmptyRule(id)],
  };
}

function findRuleGroup(rootGroup: FilterRuleGroup, path: string[]): FilterRuleGroup | undefined {
  if (path.length === 0)
    return rootGroup;

  const [currentItemId, ...rest] = path;
  const currentItem = rootGroup.items.find((item) => item.id === currentItemId);
  if (!currentItem || !isFilterRuleGroup(currentItem))
    return undefined;

  return findRuleGroup(currentItem, rest);
}

function findRule(rootGroup: FilterRuleGroup, path: string[]): FilterRule | undefined {
  if (path.length === 0)
    return undefined;

  const [currentItemId, ...rest] = path;
  const currentItem = rootGroup.items.find((item) => item.id === currentItemId);
  if (!currentItem)
    return undefined;

  if (isFilterRuleGroup(currentItem))
    return findRule(currentItem, rest);

  return currentItem;
}
