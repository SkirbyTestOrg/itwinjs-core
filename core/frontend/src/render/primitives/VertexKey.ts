/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { SortedArray, assert } from "@bentley/bentleyjs-core";
import { Point2d } from "@bentley/geometry-core";
import { QPoint3d, OctEncodedNormal } from "@bentley/imodeljs-common";

function compareWithTolerance(a: number, b: number): number {
  const tolerance = 0.1;
  if (a < b - tolerance)
    return -1;
  else if (a > b + tolerance)
    return 1;
  else
    return 0;
}

export class VertexKey {
  public readonly position: QPoint3d;
  public readonly octEncodedNormal: number = 0;
  public readonly uvParam?: Point2d;
  public readonly fillColor: number;
  public readonly normalValid: boolean = false;

  public constructor(position: QPoint3d, fillColor: number, normal?: OctEncodedNormal, uvParam?: Point2d) {
    this.position = position.clone();
    this.fillColor = fillColor;

    if (undefined !== normal) {
      this.normalValid = true;
      this.octEncodedNormal = normal.value;
    }

    if (undefined !== uvParam)
      this.uvParam = uvParam.clone();
  }

  public equals(rhs: VertexKey): boolean {
    assert(this.normalValid === rhs.normalValid);

    if (!this.position.equals(rhs.position) || this.octEncodedNormal !== rhs.octEncodedNormal || this.fillColor !== rhs.fillColor)
      return false;

    if (undefined === this.uvParam) {
      assert(undefined === rhs.uvParam);
      return true;
    } else {
      assert(undefined !== rhs.uvParam);
      return this.uvParam.isAlmostEqual(rhs.uvParam!, 0.1);
    }
  }

  public compare(rhs: VertexKey): number {
    if (this === rhs)
      return 0;

    let diff = this.position.compare(rhs.position);
    if (0 === diff) {
      diff = this.octEncodedNormal - rhs.octEncodedNormal;
      if (0 === diff ) {
        diff = this.fillColor - rhs.fillColor;
        if (0 === diff && undefined !== this.uvParam) {
          assert(undefined !== rhs.uvParam);
          diff = compareWithTolerance(this.uvParam.x, rhs.uvParam!.x);
          if (0 === diff) {
            diff = compareWithTolerance(this.uvParam.x, rhs.uvParam!.y);
          }
        }
      }
    }

    return diff;
  }
}

function compareVertexKeys(lhs: VertexKey, rhs: VertexKey): number { return lhs.compare(rhs); }

export class VertexMap extends SortedArray<VertexKey> {
  public constructor() { super(compareVertexKeys); }
}
