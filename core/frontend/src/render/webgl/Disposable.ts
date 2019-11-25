/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { IDisposable } from "@bentley/bentleyjs-core";

/** Interface implemented by any type that potentially owns WebGL resources that must be explicitly freed.
 * Resources are freed in the inherited `dispose` method.
 * @internal
 */
export interface WebGlDisposable extends IDisposable {
  /** Test whether the object currently holds any unreleased WebGL resources.
   * This property should *always* return false after `dispose` has been called.
   * @returns true if the object has released any and all WebGL resources it may have previously owned.
   */
  isDisposed: boolean;
}
