/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Zone
 */

import * as React from "react";
import { RectangleProps } from "@itwin/core-react";
import { Outline as NZ_Outline } from "@itwin/appui-layout-react";

/** @internal */
export interface OutlineProps {
  bounds?: RectangleProps;
}

/** @internal */
export class Outline extends React.PureComponent<OutlineProps> {
  public override render(): React.ReactNode {
    if (!this.props.bounds)
      return null;
    return (
      <NZ_Outline bounds={this.props.bounds} />
    );
  }
}
