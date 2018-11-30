/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import { Logger, OpenMode, Id64, Id64String, IDisposable, ActivityLoggingContext, BeEvent } from "@bentley/bentleyjs-core";
import { AccessToken, Config, ChangeSet } from "@bentley/imodeljs-clients";
import { SubCategoryAppearance, Code, CreateIModelProps, ElementProps, RpcManager, GeometricElementProps, IModel, IModelReadRpcInterface, RelatedElement, RpcConfiguration, CodeProps } from "@bentley/imodeljs-common";
import {
  IModelHostConfiguration, IModelHost, BriefcaseManager, IModelDb, DefinitionModel, Model, Element,
  InformationPartitionElement, SpatialCategory, IModelJsFs, IModelJsFsStats, PhysicalPartition, PhysicalModel, NativePlatformRegistry, SubjectOwnsPartitionElements,
} from "../backend";
import { DisableNativeAssertions as NativeDisableNativeAssertions } from "../imodeljs-native-platform-api";
import { KnownTestLocations } from "./KnownTestLocations";
import { HubUtility, UserCredentials } from "./integration/HubUtility";
import * as path from "path";
import { Schema, Schemas } from "../Schema";
import { ElementDrivesElement, RelationshipProps } from "../Relationship";
import { PhysicalElement } from "../Element";
import { ClassRegistry } from "../ClassRegistry";

const actx = new ActivityLoggingContext("");

/** Class for simple test timing */
export class Timer {
  private _label: string;
  constructor(label: string) {
    // tslint:disable-next-line:no-console
    console.time(this._label = "\t" + label);
  }

  public end() {
    // tslint:disable-next-line:no-console
    console.timeEnd(this._label);
  }
}

export class TestIModelInfo {
  private _name: string;
  private _id: string;
  private _localReadonlyPath: string;
  private _localReadWritePath: string;
  private _changeSets: ChangeSet[];

  constructor(name: string) {
    this._name = name;
    this._id = "";
    this._localReadonlyPath = "";
    this._localReadWritePath = "";
    this._changeSets = [];
  }

  get name(): string { return this._name; }
  set name(name: string) { this._name = name; }
  get id(): string { return this._id; }
  set id(id: string) { this._id = id; }
  get localReadonlyPath(): string { return this._localReadonlyPath; }
  set localReadonlyPath(localReadonlyPath: string) { this._localReadonlyPath = localReadonlyPath; }
  get localReadWritePath(): string { return this._localReadWritePath; }
  set localReadWritePath(localReadWritePath: string) { this._localReadWritePath = localReadWritePath; }
  get changeSets(): ChangeSet[] { return this._changeSets; }
  set changeSets(changeSets: ChangeSet[]) { this._changeSets = changeSets; }
}

RpcConfiguration.developmentMode = true;

Logger.initializeToConsole();
if (process.env.imjs_test_logging_config === undefined) {
  // tslint:disable-next-line:no-console
  console.log("FYI You can set the environment variable imjs_test_logging_config to point to a logging configuration json file.");
}

const loggingConfigFile: string = process.env.imjs_test_logging_config || path.join(__dirname, "logging.config.json");
if (IModelJsFs.existsSync(loggingConfigFile)) {
  // tslint:disable-next-line:no-var-requires
  Logger.configureLevels(require(loggingConfigFile));
}

// Initialize the RPC interface classes used by tests
RpcManager.initializeInterface(IModelReadRpcInterface);

export interface IModelTestUtilsOpenOptions {
  copyFilename?: string;
  enableTransactions?: boolean;
  openMode?: OpenMode;
}

/** Test users with various permissions */
export class TestUsers {
  /** User with the typical permissions of the regular/average user - Co-Admin: No, Connect-Services-Admin: No */
  public static get regular(): UserCredentials {
    return {
      email: Config.App.getString("imjs_test_regular_user_name"),
      password: Config.App.getString("imjs_test_regular_user_password"),
    };
  }

  /** User with typical permissions of the project administrator - Co-Admin: Yes, Connect-Services-Admin: No */
  public static get manager(): UserCredentials {
    return {
      email: Config.App.getString("imjs_test_manager_user_name"),
      password: Config.App.getString("imjs_test_manager_user_password"),
    };
  }

  /** User with the typical permissions of the connected services administrator - Co-Admin: No, Connect-Services-Admin: Yes */
  public static get super(): UserCredentials {
    return {
      email: Config.App.getString("imjs_test_super_user_name"),
      password: Config.App.getString("imjs_test_super_user_password"),
    };
  }

  /** User with the typical permissions of the connected services administrator - Co-Admin: Yes, Connect-Services-Admin: Yes */
  public static get superManager(): UserCredentials {
    return {
      email: Config.App.getString("imjs_test_super_manager_user_name"),
      password: Config.App.getString("imjs_test_super_manager_user_password"),
    };
  }
  /** Just another user */
  public static get user1(): UserCredentials {
    return {
      email: Config.App.getString("imjs_test_user1_user_name"),
      password: Config.App.getString("imjs_test_user1_user_password"),
    };
  }
}

/**
 * Disables native code assertions from firing. This can be used by tests that intentionally
 * test failing operations. If those failing operations raise assertions in native code, the test
 * would fail unexpectedly in a debug build. In that case the native code assertions can be disabled with
 * this class.
 */
export class DisableNativeAssertions implements IDisposable {
  private _native: NativeDisableNativeAssertions | undefined;

  constructor() {
    this._native = new (NativePlatformRegistry.getNativePlatform()).DisableNativeAssertions();
  }

  public dispose(): void {
    if (!this._native)
      return;

    this._native!.dispose();
    this._native = undefined;
  }
}

export class TestBim extends Schema { }
export interface TestRelationshipProps extends RelationshipProps {
  property1: string;
}
export class TestElementDrivesElement extends ElementDrivesElement implements TestRelationshipProps {
  public property1!: string;
  public static rootChanged = new BeEvent<(props: RelationshipProps, imodel: IModelDb) => void>();
  public static validateOutput = new BeEvent<(props: RelationshipProps, imodel: IModelDb) => void>();
  public static deletedDependency = new BeEvent<(props: RelationshipProps, imodel: IModelDb) => void>();
  public static onRootChanged(props: RelationshipProps, imodel: IModelDb): void { this.rootChanged.raiseEvent(props, imodel); }
  public static onValidateOutput(props: RelationshipProps, imodel: IModelDb): void { this.validateOutput.raiseEvent(props, imodel); }
  public static onDeletedDependency(props: RelationshipProps, imodel: IModelDb): void { this.deletedDependency.raiseEvent(props, imodel); }
}
export interface TestPhysicalObjectProps extends GeometricElementProps {
  intProperty: number;
}
export class TestPhysicalObject extends PhysicalElement implements TestPhysicalObjectProps {
  public intProperty!: number;
  public static beforeOutputsHandled = new BeEvent<(id: Id64String, imodel: IModelDb) => void>();
  public static allInputsHandled = new BeEvent<(id: Id64String, imodel: IModelDb) => void>();
  public static onBeforeOutputsHandled(id: Id64String, imodel: IModelDb): void { this.beforeOutputsHandled.raiseEvent(id, imodel); }
  public static onAllInputsHandled(id: Id64String, imodel: IModelDb): void { this.allInputsHandled.raiseEvent(id, imodel); }
}

export class IModelTestUtils {
  public static async getTestModelInfo(accessToken: AccessToken, testProjectId: string, iModelName: string): Promise<TestIModelInfo> {
    const iModelInfo = new TestIModelInfo(iModelName);
    iModelInfo.id = await HubUtility.queryIModelIdByName(accessToken, testProjectId, iModelInfo.name);

    const cacheDir = IModelHost.configuration!.briefcaseCacheDir;
    iModelInfo.localReadonlyPath = path.join(cacheDir, iModelInfo.id, "readOnly");
    iModelInfo.localReadWritePath = path.join(cacheDir, iModelInfo.id, "readWrite");

    iModelInfo.changeSets = await BriefcaseManager.imodelClient.changeSets.get(actx, accessToken, iModelInfo.id);
    return iModelInfo;
  }

  public static async getTestUserAccessToken(userCredentials: any = TestUsers.regular): Promise<AccessToken> {
    return HubUtility.login(userCredentials);
  }

  private static getStat(name: string) {
    let stat: IModelJsFsStats | undefined;
    try {
      stat = IModelJsFs.lstatSync(name);
    } catch (err) {
      stat = undefined;
    }
    return stat;
  }

  public static createStandaloneIModel(fileName: string, args: CreateIModelProps): IModelDb {
    const destPath = KnownTestLocations.outputDir;
    if (!IModelJsFs.existsSync(destPath))
      IModelJsFs.mkdirSync(destPath);

    const pathname = path.join(destPath, fileName);
    if (IModelJsFs.existsSync(pathname))
      IModelJsFs.unlinkSync(pathname);

    const iModel: IModelDb = IModelDb.createStandalone(pathname, args);

    assert.isNotNull(iModel);
    assert.isTrue(IModelJsFs.existsSync(pathname));
    return iModel!;
  }

  public static openIModel(filename: string, opts?: IModelTestUtilsOpenOptions): IModelDb {
    const destPath = KnownTestLocations.outputDir;
    if (!IModelJsFs.existsSync(destPath))
      IModelJsFs.mkdirSync(destPath);

    if (opts === undefined)
      opts = {};

    const srcName = path.join(KnownTestLocations.assetsDir, filename);
    const dbName = path.join(destPath, (opts.copyFilename ? opts.copyFilename! : filename));
    const srcStat = IModelTestUtils.getStat(srcName);
    const destStat = IModelTestUtils.getStat(dbName);
    if (!srcStat || !destStat || srcStat.mtimeMs !== destStat.mtimeMs) {
      IModelJsFs.copySync(srcName, dbName, { preserveTimestamps: true });
    }

    const iModel: IModelDb = IModelDb.openStandalone(dbName, opts.openMode, opts.enableTransactions); // could throw Error
    assert.exists(iModel);
    return iModel!;
  }

  public static openIModelFromOut(filename: string, opts?: IModelTestUtilsOpenOptions): IModelDb {
    const destPath = KnownTestLocations.outputDir;
    if (!IModelJsFs.existsSync(destPath))
      IModelJsFs.mkdirSync(destPath);

    if (opts === undefined)
      opts = {};

    const srcName = path.join(KnownTestLocations.outputDir, filename);
    const dbName = path.join(destPath, (opts.copyFilename ? opts.copyFilename! : filename));
    const srcStat = IModelTestUtils.getStat(srcName);
    const destStat = IModelTestUtils.getStat(dbName);
    if (!srcStat || !destStat || srcStat.mtimeMs !== destStat.mtimeMs) {
      IModelJsFs.copySync(srcName, dbName, { preserveTimestamps: true });
    }

    const iModel: IModelDb = IModelDb.openStandalone(dbName, opts.openMode, opts.enableTransactions); // could throw Error
    assert.exists(iModel);
    return iModel!;
  }

  public static closeIModel(iModel: IModelDb) {
    iModel.closeStandalone();
  }

  public static getUniqueModelCode(testIModel: IModelDb, newModelCodeBase: string): Code {
    let newModelCode: string = newModelCodeBase;
    let iter: number = 0;
    while (true) {
      const modelCode = InformationPartitionElement.createCode(testIModel, IModel.rootSubjectId, newModelCode);
      if (testIModel.elements.queryElementIdByCode(modelCode) === undefined)
        return modelCode;

      newModelCode = newModelCodeBase + iter;
      ++iter;
    }
  }

  // Create and insert a PhysicalPartition element (in the repositoryModel) and an associated PhysicalModel.
  public static createAndInsertPhysicalPartition(testImodel: IModelDb, newModelCode: CodeProps): Id64String {
    const modeledElementProps: ElementProps = {
      classFullName: PhysicalPartition.classFullName,
      iModel: testImodel,
      parent: new SubjectOwnsPartitionElements(IModel.rootSubjectId),
      model: IModel.repositoryModelId,
      code: newModelCode,
    };
    const modeledElement: Element = testImodel.elements.createElement(modeledElementProps);
    return testImodel.elements.insertElement(modeledElement);
  }

  // Create and insert a PhysicalPartition element (in the repositoryModel) and an associated PhysicalModel.
  public static createAndInsertPhysicalModel(testImodel: IModelDb, modeledElementRef: RelatedElement, privateModel: boolean = false): Id64String {

    const newModel = testImodel.models.createModel({ modeledElement: modeledElementRef, classFullName: PhysicalModel.classFullName, isPrivate: privateModel });
    const newModelId = testImodel.models.insertModel(newModel);

    assert.isTrue(Id64.isValidId64(newModelId));
    assert.isTrue(Id64.isValidId64(newModel.id));
    assert.deepEqual(newModelId, newModel.id);

    return newModelId;
  }

  //
  // Create and insert a PhysicalPartition element (in the repositoryModel) and an associated PhysicalModel.
  // @return [modeledElementId, modelId]
  //
  public static createAndInsertPhysicalPartitionAndModel(testImodel: IModelDb, newModelCode: CodeProps, privateModel: boolean = false): Id64String[] {
    const eid = IModelTestUtils.createAndInsertPhysicalPartition(testImodel, newModelCode);
    const modeledElementRef = new RelatedElement({ id: eid });
    const mid = IModelTestUtils.createAndInsertPhysicalModel(testImodel, modeledElementRef, privateModel);
    return [eid, mid];
  }

  public static getUniqueSpatialCategoryCode(scopeModel: Model, newCodeBaseValue: string): Code {
    let newCodeValue: string = newCodeBaseValue;
    let iter: number = 0;
    while (true) {
      if (SpatialCategory.queryCategoryIdByName(scopeModel.iModel, scopeModel.id, newCodeValue) === undefined)
        return SpatialCategory.createCode(scopeModel.iModel, scopeModel.id, newCodeValue);

      newCodeValue = newCodeBaseValue + iter;
      ++iter;
    }
  }

  // Create a SpatialCategory, insert it, and set its default appearance
  public static createAndInsertSpatialCategory(definitionModel: DefinitionModel, categoryName: string, appearance: SubCategoryAppearance): Id64String {
    const cat: SpatialCategory = SpatialCategory.create(definitionModel, categoryName);
    cat.id = definitionModel.iModel.elements.insertElement(cat);
    cat.setDefaultAppearance(appearance);
    return cat.id;
  }

  // Create a PhysicalObject. (Does not insert it.)
  public static createPhysicalObject(testImodel: IModelDb, modelId: Id64String, categoryId: Id64String, elemCode?: Code): Element {
    const elementProps: GeometricElementProps = {
      classFullName: "Generic:PhysicalObject",
      iModel: testImodel,
      model: modelId,
      category: categoryId,
      code: elemCode ? elemCode : Code.createEmpty(),
    };
    return testImodel.elements.createElement(elementProps);
  }

  public static startBackend() {
    const config = new IModelHostConfiguration();
    IModelHost.startup(config);
    Schemas.registerSchema(TestBim);
    ClassRegistry.register(TestPhysicalObject, TestBim);
    ClassRegistry.register(TestElementDrivesElement, TestBim);
  }

  public static shutdownBackend() {
    Schemas.unregisterSchema(TestBim.name);
    IModelHost.shutdown();
  }
}

// Start the backend
IModelTestUtils.startBackend();
