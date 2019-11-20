/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import * as faker from "faker";
import { Id64 } from "@bentley/bentleyjs-core";
import { EntityProps } from "@bentley/imodeljs-common";
import { createRandomId } from "./Misc";

interface RandomEntityProps extends EntityProps {
  type: string;
}

export const createRandomEntityProps = (): EntityProps => {
  const props: RandomEntityProps = {
    classFullName: faker.random.word(),
    id: createRandomId(),
    type: faker.random.word(),
  };
  return props;
};

export const createRandomTransientId = () => Id64.fromLocalAndBriefcaseIds(123, 0xffffff);
