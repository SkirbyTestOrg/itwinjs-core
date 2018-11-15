/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Tree */

import { CheckBoxState } from "@bentley/ui-core";
import { PageOptions } from "../common/PageOptions";
import { BeEvent } from "@bentley/bentleyjs-core";

/**
 * A node item which can be displayed in a tree.
 */
export interface TreeNodeItem {
  id: string;
  parentId?: string;
  label: string;
  description?: string;
  autoExpand?: boolean;
  labelForeColor?: number;
  labelBackColor?: number;
  labelBold?: boolean;
  labelItalic?: boolean;
  icon?: string;
  displayCheckBox?: boolean;
  checkBoxState?: CheckBoxState;
  isCheckBoxEnabled?: boolean;
  extendedData?: any;
  isEditable?: boolean;
}

/** A [[TreeNodeItem]] for immediately loaded trees */
export interface ImmediatelyLoadedTreeNodeItem extends TreeNodeItem {
  children?: TreeNodeItem[];
}

/** A [[TreeNodeItem]] for delay-loaded trees */
export interface DelayLoadedTreeNodeItem extends TreeNodeItem {
  hasChildren?: boolean;
}

/** Array of tree node data elements */
export type TreeDataProviderRaw = ImmediatelyLoadedTreeNodeItem[];

/** A Promise for TreeDataProviderRaw */
export type TreeDataProviderPromise = Promise<TreeDataProviderRaw>;

/** Signature for a method that returns TreeDataProviderPromise for supplied parent node */
export type TreeDataProviderMethod = (node?: TreeNodeItem, options?: PageOptions) => Promise<DelayLoadedTreeNodeItem[]>;

/** Interface for a tree data provider class */
export interface ITreeDataProvider {
  onTreeNodeChanged?: BeEvent<TreeDataChangesListener>;
  getNodesCount(parent?: TreeNodeItem): Promise<number>;
  getNodes(parent?: TreeNodeItem, options?: PageOptions): Promise<DelayLoadedTreeNodeItem[]>;
}

/** Type definition for all BeInspireTree data providers */
export type TreeDataProvider = TreeDataProviderRaw | TreeDataProviderPromise | TreeDataProviderMethod | ITreeDataProvider;

/** checks if [[TreeDataProvider]] is a [[TreeDataProviderRaw]] */
export const isTreeDataProviderRaw = (provider: TreeDataProvider): provider is TreeDataProviderRaw => {
  return Array.isArray(provider);
};
/** checks if [[TreeDataProvider]] is a [[TreeDataProviderPromise]] */
export const isTreeDataProviderPromise = (provider: TreeDataProvider): provider is TreeDataProviderPromise => {
  return (undefined !== (provider as TreeDataProviderPromise).then);
};
/** checks if [[TreeDataProvider]] is a [[TreeDataProviderMethod]] */
export const isTreeDataProviderMethod = (provider: TreeDataProvider): provider is TreeDataProviderMethod => {
  return (typeof provider === "function");
};
/** checks if [[TreeDataProvider]] is a [[ITreeDataProvider]] */
export const isTreeDataProviderInterface = (provider: TreeDataProvider): provider is ITreeDataProvider => {
  const candidate = provider as ITreeDataProvider;
  return undefined !== candidate.getNodes && undefined !== candidate.getNodesCount;
};

/** An interface tree data change listeners */
export type TreeDataChangesListener = (node?: TreeNodeItem[]) => void;

/**
 * EditableTreeDataProvider provides cell editing processing for the Tree.
 */
export interface EditableTreeDataProvider extends ITreeDataProvider {
  updateLabel(nodeItem: TreeNodeItem, newLabel: string): void;
}

/**
 * MutableTreeDataProvider provides manipulation processing for the Tree.
 * Useful for Drag & Drop processing.
 */
export interface MutableTreeDataProvider extends ITreeDataProvider {
  insertNode(parent: TreeNodeItem | undefined, child: TreeNodeItem, index?: number): void;
  removeNode(parent: TreeNodeItem | undefined, child: TreeNodeItem): void;
  moveNode(parent: TreeNodeItem | undefined, newParent: TreeNodeItem | undefined, child: TreeNodeItem, index?: number): void;

  isDescendent(parent: TreeNodeItem | undefined, nodeItem: TreeNodeItem): boolean;
  getNodeIndex(parent: TreeNodeItem | undefined, child: TreeNodeItem): number;
}
