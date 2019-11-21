
/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Utilities */

/** A set of Dom helper methods
 * @beta
 */
export class ToolbarButtonHelper {

  public static searchToolbarsByTitle(title: string, horizontal: boolean): HTMLButtonElement | null {
    // first look for simple tool buttons
    const nodeList = document.documentElement.querySelectorAll(`div.nz-toolbar-items.nz-${horizontal ? "horizontal" : "vertical"}.nz-items > button`);
    if (nodeList && nodeList.length > 0) {
      for (const node of nodeList) {
        const button = node as HTMLButtonElement;
        if (button.title === title) {
          return button;
        }
      }
    }

    // next look for expandable buttons

    const expandableNodeList = document.documentElement.querySelectorAll(`div.nz-toolbar-items.nz-${horizontal ? "horizontal" : "vertical"}.nz-items > * > * > * > button`);
    if (expandableNodeList && expandableNodeList.length > 0) {
      for (const node of expandableNodeList) {
        const button = node as HTMLButtonElement;
        if (button.title === title) {
          return button;
        }
      }
    }

    return null;
  }

  /** Search Horizontal Toolbars for button by title. */
  public static searchHorizontalToolbarsByTitle(title: string): HTMLButtonElement | null {
    return ToolbarButtonHelper.searchToolbarsByTitle(title, true);
  }

  /** Search Vertical Toolbars by Title for button by title. */
  public static searchVerticalToolbarsByTitle(title: string): HTMLButtonElement | null {
    return ToolbarButtonHelper.searchToolbarsByTitle(title, false);
  }

  /** Get toolbar button by title. */
  public static getToolbarButtonByTitle(title: string): HTMLButtonElement | null {
    let button = ToolbarButtonHelper.searchHorizontalToolbarsByTitle(title);
    if (button)
      return button;

    button = ToolbarButtonHelper.searchVerticalToolbarsByTitle(title);
    if (button)
      return button;

    return null;
  }

  /** Get App button. */
  public static getAppButton(): HTMLButtonElement | null {
    const node = document.documentElement.querySelector("div.nz-app-button > button");
    if (node)
      return node as HTMLButtonElement;
    return null;
  }
}
