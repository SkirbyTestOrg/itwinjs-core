/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { OpenMode } from "@bentley/bentleyjs-core/lib/BeSQLite";
import { LowAndHighXYZ, XYAndZ, Transform, Point3d } from "@bentley/geometry-core/lib/PointVector";
import { AxisAlignedBox3d } from "./geometry/Primitives";

/** A token that identifies a specific instance of an iModel to be operated on */
export class IModelToken {
  /** Guid of the iModel */
  public iModelId: string;
  /** Id of the last ChangeSet that was applied to the iModel */
  public changeSetId: string;
  /** Mode used to open the iModel */
  public openMode: OpenMode;
  /** Id of the user that's currently editing or viewing the iModel. May not be defined *only* if it's a standalone iModel */
  public userId?: string;
  /** Context (Project or Asset) in which the iModel exists. May not be defined *only* if it's a standalone iModel */
  public contextId?: string;

  /** Constructor */
  public static create(iModelId: string, changeSetId: string, openMode: OpenMode, userId?: string, contextId?: string): IModelToken {
    const token = new IModelToken();
    Object.assign(token, { iModelId, changeSetId, openMode, userId, contextId });
    return token;
  }
}

export interface IModelProps {
  rootSubject?: { name: string, description?: string };
  projectExtents?: LowAndHighXYZ | object;
  globalOrigin?: XYAndZ | object;
  ecefTrans?: Transform | object;
}

/** An abstract class representing an instance of an iModel. */
export abstract class IModel implements IModelProps {
  /** Name of the iModel */
  public readonly name: string;
  public readonly rootSubject?: { name: string, description?: string };
  public readonly projectExtents: AxisAlignedBox3d;
  public readonly globalOrigin: Point3d;
  public readonly ecefTrans?: Transform;

  public toJSON(): any {
    const out: any = {};
    out.name = this.name;
    out.rootSubject = this.rootSubject;
    out.projectExtents = this.projectExtents;
    out.globalOrigin = this.globalOrigin;
    out.ecefTrans = this.ecefTrans;
    return out;
  }

  /** @hidden */
  protected token: IModelToken;

  /** The token that can be used to find this iModel instance. */
  public get iModelToken(): IModelToken { return this.token; }

  /** @hidden */
  protected constructor(iModelToken: IModelToken, name: string, props: IModelProps) {
    this.token = iModelToken;
    this.name = name;
    this.rootSubject = props.rootSubject;
    this.projectExtents = AxisAlignedBox3d.fromJSON(props.projectExtents);
    this.globalOrigin = Point3d.fromJSON(props.globalOrigin);
    if (props.ecefTrans)
      this.ecefTrans = Transform.fromJSON(props.ecefTrans);
  }

  public isReadonly() { return this.token.openMode === OpenMode.Readonly; }
}
