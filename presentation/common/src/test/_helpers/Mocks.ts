/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import KeySet, { Keys } from "../../KeySet";
import * as moq from "typemoq";
export * from "typemoq";

/**
 * Should be called if mock.object is used to resolve a Promise. Otherwise
 * typemoq tries to handle 'then' method of the mocked object and the promise
 * never resolves. See https://github.com/florinn/typemoq/issues/70.
 */
export const configureForPromiseResult = <T>(mock: moq.IMock<T>): void => {
  mock.setup((x: any) => x.then).returns(() => undefined);
};

/** typemoq matcher for KeySet */
export const isKeySet = (expectedKeys: Keys) => {
  const expected = new KeySet(expectedKeys);
  return moq.It.is<KeySet>((actual: KeySet) => (actual.size === expected.size && actual.hasAll(expected)));
};
