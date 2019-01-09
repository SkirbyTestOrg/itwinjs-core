/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { Id64, Id64String, JsonUtils } from "@bentley/bentleyjs-core";
import { StandardViewIndex, Transform, Range3d, Vector3d, Point3d, Matrix3d } from "@bentley/geometry-core";
import { AxisAlignedBox3d, ViewFlags, Cartographic, EcefLocation, ContextRealityModelProps, RenderMode } from "@bentley/imodeljs-common";
import { CategorySelector, DefinitionModel, DisplayStyle3d, IModelDb, ModelSelector, OrthographicViewDefinition, PhysicalModel } from "@bentley/imodeljs-backend";
import * as requestPromise from "request-promise-native";
import * as fs from "fs";

class RealityModelTileUtils {
    public static rangeFromBoundingVolume(boundingVolume: any): Range3d | undefined {
        if (undefined === boundingVolume || !Array.isArray(boundingVolume.box))
            return undefined;
        const box: number[] = boundingVolume.box;
        const center = Point3d.create(box[0], box[1], box[2]);
        const ux = Vector3d.create(box[3], box[4], box[5]);
        const uy = Vector3d.create(box[6], box[7], box[8]);
        const uz = Vector3d.create(box[9], box[10], box[11]);
        const corners: Point3d[] = [];
        for (let j = 0; j < 2; j++) {
            for (let k = 0; k < 2; k++) {
                for (let l = 0; l < 2; l++) {
                    corners.push(center.plus3Scaled(ux, (j ? -1.0 : 1.0), uy, (k ? -1.0 : 1.0), uz, (l ? -1.0 : 1.0)));
                }
            }
        }
        return Range3d.createArray(corners);
    }

    public static maximumSizeFromGeometricTolerance(range: Range3d, geometricError: number): number {
        const minToleranceRatio = .5;   // Nominally the error on screen size of a tile.  Increasing generally increases performance (fewer draw calls) at expense of higher load times.
        return minToleranceRatio * range.diagonal().magnitude() / geometricError;
    }
    public static transformFromJson(jTrans: number[] | undefined): Transform | undefined {
        return (jTrans === undefined) ? undefined : Transform.createOriginAndMatrix(Point3d.create(jTrans[12], jTrans[13], jTrans[14]), Matrix3d.createRowValues(jTrans[0], jTrans[4], jTrans[8], jTrans[1], jTrans[5], jTrans[9], jTrans[2], jTrans[6], jTrans[10]));
    }
}

/** */
export class RealityModelContextIModelCreator {
    public iModelDb: IModelDb;
    public url: string;
    public definitionModelId: Id64String = Id64.invalid;
    public physicalModelId: Id64String = Id64.invalid;

    /**
     * Constructor
     * @param iModelFileName the output iModel file name
     * @param url the reality model URL
     */
    public constructor(iModelFileName: string, url: string) {
        fs.unlink(iModelFileName, ((_err) => { }));
        this.iModelDb = IModelDb.createStandalone(iModelFileName, { rootSubject: { name: "Reality Model Context" } });
        this.url = url;
    }

    /** Perform the import */
    public async create(): Promise<void> {
        this.definitionModelId = DefinitionModel.insert(this.iModelDb, IModelDb.rootSubjectId, "Definitions");
        this.physicalModelId = PhysicalModel.insert(this.iModelDb, IModelDb.rootSubjectId, "Empty Model");

        requestPromise(this.url, { json: true }).then((json: any) => {
            const rootTransform = RealityModelTileUtils.transformFromJson(json.root.transform);
            let geoLocated = true;
            let worldRange: AxisAlignedBox3d;
            if (undefined === rootTransform) {
                const region = JsonUtils.asArray(json.root.boundingVolume.region);
                if (undefined === region)
                    throw new TypeError("Unable to determine GeoLocation - no root Transform or Region on root.");
                const ecefLow = (new Cartographic(region[0], region[1], region[4])).toEcef();
                const ecefHigh = (new Cartographic(region[2], region[3], region[5])).toEcef();
                const ecefRange = Range3d.create(ecefLow, ecefHigh);
                const cartoCenter = new Cartographic((region[0] + region[2]) / 2.0, (region[1] + region[3]) / 2.0, (region[4] + region[5]) / 2.0);
                const ecefLocation = EcefLocation.createFromCartographicOrigin(cartoCenter!);
                this.iModelDb.setEcefLocation(ecefLocation);
                const ecefToWorld = ecefLocation.getTransform().inverse()!;
                worldRange = AxisAlignedBox3d.fromJSON(ecefToWorld.multiplyRange(ecefRange));
            } else {
                const range = RealityModelTileUtils.rangeFromBoundingVolume(json.root.boundingVolume);
                if (undefined === rootTransform || undefined === range)
                    return;

                const tileRange = rootTransform.multiplyRange(range);
                if (rootTransform.matrix.isIdentity) {
                    geoLocated = false;
                    worldRange = AxisAlignedBox3d.fromJSON(tileRange);
                } else {
                    const ecefCenter = tileRange.localXYZToWorld(.5, .5, .5)!;
                    const cartoCenter = Cartographic.fromEcef(ecefCenter);
                    const ecefLocation = EcefLocation.createFromCartographicOrigin(cartoCenter!);
                    this.iModelDb.setEcefLocation(ecefLocation);
                    const ecefToWorld = ecefLocation.getTransform().inverse()!;
                    worldRange = AxisAlignedBox3d.fromJSON(ecefToWorld.multiplyRange(tileRange));
                }
            }

            this.insertSpatialView("Reality Model View", worldRange, { tilesetUrl: this.url, name: this.url }, geoLocated);
            this.iModelDb.updateProjectExtents(worldRange);
            this.iModelDb.saveChanges();
        })
            .catch(() => { });

    }

    /** Insert a SpatialView configured to display the GeoJSON data that was converted/imported. */
    protected insertSpatialView(viewName: string, range: AxisAlignedBox3d, realityModel: ContextRealityModelProps, geoLocated: boolean): Id64String {
        const modelSelectorId: Id64String = ModelSelector.insert(this.iModelDb, this.definitionModelId, viewName, [this.physicalModelId]);
        const categorySelectorId: Id64String = CategorySelector.insert(this.iModelDb, this.definitionModelId, viewName, []);
        const vf = new ViewFlags();
        vf.backgroundMap = geoLocated;
        vf.renderMode = RenderMode.SmoothShade;
        vf.cameraLights = true;
        const displayStyleId: Id64String = DisplayStyle3d.insert(this.iModelDb, this.definitionModelId, viewName, { viewFlags: vf, contextRealityModels: [realityModel] });
        return OrthographicViewDefinition.insert(this.iModelDb, this.definitionModelId, viewName, modelSelectorId, categorySelectorId, displayStyleId, range, StandardViewIndex.Iso);
    }
}
