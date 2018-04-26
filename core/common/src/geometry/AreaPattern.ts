/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Geometry */

import { Point2d, Point3d, YawPitchRollAngles, RotMatrix, Transform, YawPitchRollProps, XYZProps, AngleProps, XYProps, Angle, Geometry } from "@bentley/geometry-core";
import { ColorDef } from "../ColorDef";
import { Id64, Id64Props } from "@bentley/bentleyjs-core";

export namespace AreaPattern {
  /** Single hatch line definition */
  export interface HatchDefLineProps {
    /** Angle of hatch line */
    angle?: AngleProps;
    /** Origin point (relative to placement) the hatch passes through */
    through?: XYProps;
    /** Offset of successive lines. X offset staggers dashes (ignored for solid lines) and Y offset controls the distance between both solid and dashed lines */
    offset?: XYProps;
    /** Array of gap and dash lengths for creating non-solid hatch lines, max of 20. A positive value denotes dash, a negative value a gap */
    dashes?: number[];
  }

  export class HatchDefLine implements HatchDefLineProps {
    public angle?: Angle;
    public through?: Point2d;
    public offset?: Point2d;
    public dashes?: number[];

    public constructor(json: HatchDefLineProps) {
      this.angle = json.angle ? Angle.fromJSON(json.angle) : undefined;
      this.through = json.through ? Point2d.fromJSON(json.through) : undefined;
      this.offset = json.offset ? Point2d.fromJSON(json.offset) : undefined;
      if (json.dashes) {
        const dashes: number[] = [];
        json.dashes.forEach((dash) => dashes.push(dash));
        this.dashes = dashes;
      }
    }
  }

  /** GeometryStream entry for adding a hatch, cross-hatch, or area pattern to a planar region */
  export interface ParamsProps {
    /** Pattern offset (relative to placement) */
    origin?: XYZProps;
    /** Pattern orientation (relative to placement) */
    rotation?: YawPitchRollProps;
    /** Spacing of first set of parallel lines in a hatch pattern, or row spacing between area pattern tiles */
    space1?: number;
    /** Spacing of second set of parallel lines in a cross-hatch (leave undefined or 0 for a hatch), or column spacing between area pattern tiles */
    space2?: number;
    /** Angle of first set of parallel lines in a hatch pattern or area pattern tile direction */
    angle1?: AngleProps;
    /** Angle of second set of parallel lines in a cross-hatch */
    angle2?: AngleProps;
    /** Scale to apply to area pattern symbol */
    scale?: number;
    /** Pattern color, leave undefined to inherit color from parent element. For area patterns, does not override explicit colors stored in symbol */
    color?: ColorDef;
    /** Pattern weight, leave undefined to inherit weight from parent element. For area patterns, does not override explicit weights stored in symbol */
    weight?: number;
    /** Set to inhibit display of pattern boundary, not applicable when boundary is also filled */
    invisibleBoundary?: boolean;
    /** Set to allow snapping to pattern geometry */
    snappable?: boolean;
    /** GeometryPart id to use for tiled area pattern display */
    symbolId?: Id64Props;
    /** Define an area pattern by supplying hatch line definitions instead of using a GeometryPart */
    defLines?: HatchDefLineProps[];
  }

  /** Defines a hatch, cross hatch, or area pattern. */
  export class Params implements ParamsProps {
    public origin?: Point3d;
    public rotation?: YawPitchRollAngles;
    public space1?: number;
    public space2?: number;
    public angle1?: Angle;
    public angle2?: Angle;
    public scale?: number;
    public color?: ColorDef;
    public weight?: number;
    public invisibleBoundary?: boolean;
    public snappable?: boolean;
    public symbolId?: Id64;
    public defLines?: HatchDefLine[];

    /** create an AreaPattern.Params from a json object. */
    public static fromJSON(json?: ParamsProps) {
      const result = new Params();
      if (!json)
        return result;
      result.origin = json.origin ? Point3d.fromJSON(json.origin) : undefined;
      result.rotation = json.rotation ? YawPitchRollAngles.fromJSON(json.rotation) : undefined;
      result.space1 = json.space1;
      result.space2 = json.space2;
      result.angle1 = json.angle1 ? Angle.fromJSON(json.angle1) : undefined;
      result.angle2 = json.angle2 ? Angle.fromJSON(json.angle2) : undefined;
      result.scale = json.scale;
      result.color = json.color;
      result.weight = json.weight;
      result.invisibleBoundary = json.invisibleBoundary;
      result.snappable = json.snappable;
      result.symbolId = json.symbolId ? new Id64(json.symbolId) : undefined;
      if (!json.defLines)
        return result;
      const defLines: HatchDefLine[] = [];
      json.defLines.forEach((defLine) => defLines.push(new HatchDefLine(defLine)));
      result.defLines = defLines;
      return result;
    }

    /** Add properties to an object for serializing to JSON */
    public toJSON(): ParamsProps {
      return this.toJSON() as ParamsProps;
    }

    public clone(): Params {
      const retVal = new Params();
      retVal.origin = this.origin ? Point3d.createFrom(this.origin) : undefined;
      retVal.rotation = this.rotation ? this.rotation.clone() : undefined;
      retVal.space1 = this.space1;
      retVal.space2 = this.space2;
      retVal.angle1 = this.angle1;
      retVal.angle2 = this.angle2;
      retVal.scale = this.scale;
      retVal.color = this.color;
      retVal.weight = this.weight;
      retVal.invisibleBoundary = this.invisibleBoundary;
      retVal.snappable = this.snappable;
      retVal.symbolId = this.symbolId;
      if (this.defLines) {
        const defLines: HatchDefLine[] = [];
        this.defLines.forEach((defLine) => defLines.push(new HatchDefLine(defLine)));
        retVal.defLines = defLines;
      }
      return retVal;
    }

    public isEqualTo(other: Params): boolean {
      if (this === other)
        return true;    // Same pointer

      if (this.scale !== other.scale ||
          this.space1 !== other.space1 ||
          this.space2 !== other.space2 ||
          this.weight !== other.weight ||
          this.invisibleBoundary !== other.invisibleBoundary ||
          this.snappable !== other.snappable)
        return false;

      if ((this.color === undefined) !== (other.color === undefined))
        return false;
      if (this.color && !this.color.equals(other.color!))
        return false;

      if ((this.angle1 === undefined) !== (other.angle1 === undefined))
        return false;
      if (this.angle1 && !this.angle1.isAlmostEqualNoPeriodShift(other.angle1!))
        return false;

      if ((this.angle2 === undefined) !== (other.angle2 === undefined))
        return false;
      if (this.angle2 && !this.angle2.isAlmostEqualNoPeriodShift(other.angle2!))
        return false;

      if ((this.origin === undefined) !== (other.origin === undefined))
        return false;
      if (this.origin && !this.origin.isAlmostEqual(other.origin!))
        return false;

      if ((this.rotation === undefined) !== (other.rotation === undefined))
        return false;
      if (this.rotation && !this.rotation.isAlmostEqual(other.rotation!))
        return false;

      if ((this.symbolId === undefined) !== (other.symbolId === undefined))
        return false;
      if (this.symbolId && !this.symbolId.equals(other.symbolId!))
        return false;

      if ((this.defLines === undefined) !== (other.defLines === undefined))
        return false;
      if (this.defLines) {
        if (this.defLines.length !== other.defLines!.length)
          return false;

        for (let i = 0; i < this.defLines.length; ++i) {
          const otherLine = other.defLines![i];
          const thisLine = this.defLines[i];

          if ((thisLine.angle === undefined) !== (otherLine.angle === undefined))
            return false;
          if (thisLine.angle && !thisLine.angle.isAlmostEqualNoPeriodShift(otherLine.angle!))
            return false;

          if ((thisLine.through === undefined) !== (otherLine.through === undefined))
            return false;
          if (thisLine.through && !thisLine.through.isAlmostEqual(otherLine.through!))
            return false;

          if ((thisLine.offset === undefined) !== (otherLine.offset === undefined))
            return false;
          if (thisLine.offset && !thisLine.offset.isAlmostEqual(otherLine.offset!))
            return false;

          if ((thisLine.dashes === undefined) !== (otherLine.dashes === undefined))
            return false;
          if (thisLine.dashes && thisLine.dashes.length !== otherLine.dashes!.length)
            return false;
          if (thisLine.dashes) {
            for (let dash = 0; dash < thisLine.dashes.length; ++dash) {
              if (!Geometry.isSameCoordinate(thisLine.dashes[dash], otherLine.dashes![dash]))
                return false;
            }
          }
        }
      }
      return true;
    }

    public static transformPatternSpace(transform: Transform, oldSpace: number, patRot: RotMatrix, angle?: Angle): number {
      let tmpRot: RotMatrix;
      if (angle && !angle.isAlmostZero()) {
        const yprTriple = new YawPitchRollAngles(angle);
        const angRot = yprTriple.toRotMatrix();
        tmpRot = patRot.multiplyMatrixMatrix(angRot);
      } else {
        tmpRot = patRot;
      }
      const yDir = tmpRot.getColumn(1);
      yDir.scale(oldSpace, yDir);
      transform.multiplyVector(yDir, yDir);
      return yDir.magnitude();
    }

    public static getTransformPatternScale(transform: Transform): number {
      const xDir = transform.matrix.getColumn(0);
      const mag = xDir.magnitude();
      return (mag > 1.0e-10) ? mag : 1.0;
    }

    public applyTransform(transform: Transform): boolean {
      if (transform.isIdentity())
        return true;
      const origin = this.origin ? this.origin : Point3d.createZero();
      const rMatrix = this.rotation ? this.rotation.toRotMatrix() : RotMatrix.createIdentity();
      if (this.symbolId !== undefined) {
         this.space1 = Params.transformPatternSpace(transform, this.space1 ? this.space1 : 0.0, rMatrix, this.angle1);
         this.space2 = Params.transformPatternSpace(transform, this.space2 ? this.space2 : 0.0, rMatrix, this.angle2);
         const scale = Params.getTransformPatternScale(transform);
         this.scale = this.scale ? this.scale *= scale : scale;
      } else if (this.defLines) {
        const scale = Params.getTransformPatternScale(transform);
        if (!Geometry.isSameCoordinate(scale, 1.0)) {
          this.scale = this.scale ? this.scale *= scale : scale;
          for (const line of this.defLines) {
            if (line.through) {
              line.through.x *= scale;
              line.through.y *= scale;
            }
            if (line.offset) {
              line.offset.x *= scale;
              line.offset.y *= scale;
            }
            if (line.dashes) {
              for (let iDash = 0; iDash < line.dashes.length; iDash++)
                line.dashes[iDash] *= scale;
            }
          }
        }
      } else {
        this.space1 = Params.transformPatternSpace(transform, this.space1 ? this.space1 : 0.0, rMatrix, this.angle1);
        if (this.space2 && 0 !== this.space2)
          this.space2 = Params.transformPatternSpace(transform, this.space2, rMatrix, this.angle2);
      }

      transform.multiplyPoint(origin);
      rMatrix.multiplyMatrixMatrix(transform.matrix, rMatrix);
      const normalized = RotMatrix.createRigidFromRotMatrix(rMatrix);
      if (!normalized)
        return false;
      const newRotation = YawPitchRollAngles.createFromRotMatrix(normalized);
      if (undefined === newRotation)
        return false;
      this.origin = origin;
      this.rotation = newRotation;
      return true;
    }
  }
}
