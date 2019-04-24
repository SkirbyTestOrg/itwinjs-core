/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Widget */

import * as classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";
import { Edge, RectangleProps, Rectangle } from "../utilities/Rectangle";
import { ResizeGrip, ResizeDirection } from "./rectangular/ResizeGrip";
import { ResizeHandle } from "./rectangular/ResizeHandle";
import { NoChildrenProps } from "../utilities/Props";
import "./Stacked.scss";

/** Available [[Stacked]] widget horizontal anchors.
 * @alpha
 */
export enum HorizontalAnchor {
  Left,
  Right,
}

/** Available [[Stacked]] widget vertical anchors.
 * @alpha
 */
export enum VerticalAnchor {
  Middle,
  Bottom,
}

/** Helpers for [[HorizontalAnchor]].
 * @alpha
 */
export class HorizontalAnchorHelpers {
  /** Class name of [[HorizontalAnchor.Left]] */
  public static readonly LEFT_CLASS_NAME = "nz-left-anchor";
  /** Class name of [[HorizontalAnchor.Right]] */
  public static readonly RIGHT_CLASS_NAME = "nz-right-anchor";

  /** @returns Class name of specified [[HorizontalAnchor]] */
  public static getCssClassName(anchor: HorizontalAnchor): string {
    switch (anchor) {
      case HorizontalAnchor.Left:
        return HorizontalAnchorHelpers.LEFT_CLASS_NAME;
      case HorizontalAnchor.Right:
        return HorizontalAnchorHelpers.RIGHT_CLASS_NAME;
    }
  }
}

/** Helpers for [[VerticalAnchor]].
 * @alpha
 */
export class VerticalAnchorHelpers {
  /** Class name of [[VerticalAnchor.Middle]] */
  public static readonly MIDDLE_CLASS_NAME = "nz-middle-anchor";
  /** Class name of [[VerticalAnchor.Bottom]] */
  public static readonly BOTTOM_CLASS_NAME = "nz-bottom-anchor";

  /** @returns Class name of specified [[VerticalAnchor]] */
  public static getCssClassName(anchor: VerticalAnchor): string {
    switch (anchor) {
      case VerticalAnchor.Middle:
        return VerticalAnchorHelpers.MIDDLE_CLASS_NAME;
      case VerticalAnchor.Bottom:
        return VerticalAnchorHelpers.BOTTOM_CLASS_NAME;
    }
  }
}

/** Properties of [[Stacked]] component.
 * @alpha
 */
export interface StackedProps extends CommonProps, NoChildrenProps {
  /** Content of this widget. I.e. [[WidgetContent]] */
  content?: React.ReactNode;
  /** Content ref of this widget. */
  contentRef?: React.Ref<HTMLDivElement>;
  /** Describes if the widget should fill the zone. */
  fillZone?: boolean;
  /** Describes to which side the widget is horizontally anchored. */
  horizontalAnchor: HorizontalAnchor;
  /** Describes if the widget is being dragged. */
  isDragged?: boolean;
  /** Describes if the widget is floating. */
  isFloating?: boolean;
  /** True if widget is open, false otherwise. */
  isOpen?: boolean;
  /** Function called when resize action is performed. */
  onResize?: (x: number, y: number, handle: ResizeHandle, filledHeightDiff: number) => void;
  /** Widget tabs. See: [[Tab]], [[TabSeparator]], [[Group]] */
  tabs?: React.ReactNode;
  /** Describes to which side the widget is vertically anchored. */
  verticalAnchor: VerticalAnchor;
}

/** Stacked widget is used to display multiple tabs and some content.
 * @note Should be placed in [[Zone]] component.
 * @alpha
 */
export class Stacked extends React.PureComponent<StackedProps> {
  private _widget = React.createRef<HTMLDivElement>();

  public getBounds(): RectangleProps {
    if (!this._widget.current)
      return new Rectangle();
    return this._widget.current.getBoundingClientRect();
  }

  public render() {
    const className = classnames(
      "nz-widget-stacked",
      HorizontalAnchorHelpers.getCssClassName(this.props.horizontalAnchor),
      VerticalAnchorHelpers.getCssClassName(this.props.verticalAnchor),
      !this.props.isOpen && "nz-closed",
      this.props.isDragged && "nz-dragged",
      this.props.isFloating && "nz-floating",
      this.props.fillZone && "nz-fill-zone",
      this.props.className);

    return (
      <div
        className={className}
        style={this.props.style}
        ref={this._widget}
      >
        <div className="nz-content-container">
          <div
            className="nz-content"
            ref={this.props.contentRef}
          >
            {this.props.content}
          </div>
          <ResizeGrip
            className="nz-bottom-grip"
            direction={ResizeDirection.NorthSouth}
            onResize={this._handleBottomGripResize}
          />
          <ResizeGrip
            className="nz-content-grip"
            direction={ResizeDirection.EastWest}
            onResize={this._handleContentGripResize}
          />
        </div>
        <div className="nz-tabs-column">
          <div className="nz-tabs">
            {this.props.tabs}
          </div>
          <div className="nz-tabs-grip-container">
            <ResizeGrip
              className="nz-tabs-grip"
              direction={ResizeDirection.EastWest}
              onResize={this._handleTabsGripResize}
            />
          </div>
        </div>
        <div className="nz-height-expander" />
        <ResizeGrip
          className="nz-top-grip"
          direction={ResizeDirection.NorthSouth}
          onResize={this._handleTopGripResize}
        />
      </div>
    );
  }

  private _getFilledHeightDiff(): number {
    const widget = this._widget.current;
    if (!widget)
      return 0;

    const heightStyle = widget.style.height;
    const height = widget.clientHeight;

    widget.style.height = "100%";
    const filledHeight = widget.clientHeight;

    widget.style.height = heightStyle;

    const offset = filledHeight - height;
    return offset;
  }

  private _handleTabsGripResize = (x: number) => {
    const filledHeightDiff = this._getFilledHeightDiff();
    switch (this.props.horizontalAnchor) {
      case HorizontalAnchor.Left: {
        this.props.onResize && this.props.onResize(x, 0, Edge.Right, filledHeightDiff);
        break;
      }
      case HorizontalAnchor.Right: {
        this.props.onResize && this.props.onResize(x, 0, Edge.Left, filledHeightDiff);
        break;
      }
    }
  }

  private _handleContentGripResize = (x: number) => {
    const filledHeightDiff = this._getFilledHeightDiff();
    switch (this.props.horizontalAnchor) {
      case HorizontalAnchor.Left: {
        this.props.onResize && this.props.onResize(x, 0, Edge.Left, filledHeightDiff);
        break;
      }
      case HorizontalAnchor.Right: {
        this.props.onResize && this.props.onResize(x, 0, Edge.Right, filledHeightDiff);
        break;
      }
    }
  }

  private _handleTopGripResize = (_x: number, y: number) => {
    const filledHeightDiff = this._getFilledHeightDiff();
    this.props.onResize && this.props.onResize(0, y, Edge.Top, filledHeightDiff);
  }

  private _handleBottomGripResize = (_x: number, y: number) => {
    const filledHeightDiff = this._getFilledHeightDiff();
    this.props.onResize && this.props.onResize(0, y, Edge.Bottom, filledHeightDiff);
  }
}
