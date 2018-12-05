/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";

import { ToolAssistanceDialog } from "../../../ui-ninezone";

describe("<ToolAssistanceDialog />", () => {
  it("should render", () => {
    mount(<ToolAssistanceDialog />);
  });

  it("renders correctly", () => {
    shallow(<ToolAssistanceDialog />).should.matchSnapshot();
  });
});
