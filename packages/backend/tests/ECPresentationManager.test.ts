/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as moq from "typemoq";
import * as faker from "faker";
import * as path from "path";
import { using } from "@bentley/bentleyjs-core";
import { IModelToken } from "@bentley/imodeljs-common";
import { NativePlatformRegistry, IModelHost, IModelDb } from "@bentley/imodeljs-backend";
import { NativeECPresentationManager, NativeECPresentationStatus } from "@bentley/imodeljs-native-platform-api";
import { PageOptions, SelectionInfo, KeySet, ECPresentationError, SettingValueTypes, PropertyInfoJSON } from "@common/index";
import { Node, NodeKey, ECInstanceNodeKey } from "@common/index";
import ECPresentationManager, { NodeAddonDefinition, NodeAddonRequestTypes } from "@src/ECPresentationManager";
import UserSettingsManager from "@src/UserSettingsManager";
import { createRandomECInstanceNodeKey, createRandomNodePathElement } from "@helpers/random/Hierarchy";
import { createRandomECInstanceKey, createRandomECClassInfoJSON, createRandomRelationshipPathJSON, createRandomECInstanceKeyJSON } from "@helpers/random/EC";
import { createRandomDescriptor, createRandomCategory } from "@helpers/random/Content";
import { ContentJSON } from "@common/content/Content";
import { DescriptorJSON, SelectClassInfoJSON } from "@common/content/Descriptor";
import { PrimitiveTypeDescription, ArrayTypeDescription, StructTypeDescription } from "@common/index";
import { PropertiesFieldJSON, NestedContentFieldJSON, FieldJSON } from "@common/content/Fields";
import { KindOfQuantityInfo } from "@common/index";
import { PropertyJSON } from "@common/content/Property";
import { ItemJSON } from "@common/content/Item";
import "@helpers/Snapshots";
import "@helpers/Promises";
import "./IModeHostSetup";

describe("ECPresentationManager", () => {

  beforeEach(() => {
    IModelHost.shutdown();
    try {
      IModelHost.startup();
    } catch (e) {
      let isLoaded = false;
      try {
        NativePlatformRegistry.getNativePlatform();
        isLoaded = true;
      } catch (_e) { }
      if (!isLoaded)
        throw e; // re-throw if startup() failed to set up NativePlatform
    }
  });

  describe("constructor", () => {

    it("uses default native library implementation if not overridden", () => {
      using(new ECPresentationManager(), (manager) => {
        expect((manager.getNativePlatform() as any)._nativeAddon).instanceOf(NativePlatformRegistry.getNativePlatform().NativeECPresentationManager);
      });
    });

    it("uses addon implementation supplied through props", () => {
      const mock = moq.Mock.ofType<NodeAddonDefinition>();
      using(new ECPresentationManager({ addon: mock.object }), (manager) => {
        expect(manager.getNativePlatform()).eq(mock.object);
      });
    });

    describe("addon setup based on props", () => {

      const addon = moq.Mock.ofType<NodeAddonDefinition>();
      beforeEach(() => {
        addon.reset();
      });

      it("sets up ruleset directories if supplied", () => {
        const dirs = ["test1", "test2"];
        addon.setup((x) => x.setupRulesetDirectories(dirs)).verifiable();
        using(new ECPresentationManager({ addon: addon.object, rulesetDirectories: dirs }), () => { });
        addon.verifyAll();
      });

      it("sets up locale directories if supplied", () => {
        const suppliedDirs = ["test1", "test2", "test2"];
        const addonDirs = [path.resolve(__dirname, "../src/assets/locales"), "test1", "test2"];
        addon.setup((x) => x.setupLocaleDirectories(addonDirs)).verifiable();
        using(new ECPresentationManager({ addon: addon.object, localeDirectories: suppliedDirs }), () => { });
        addon.verifyAll();
      });

      it("sets up active locale if supplied", () => {
        const locale = faker.locale;
        addon.setup((x) => x.setActiveLocale(locale)).verifiable();
        using(new ECPresentationManager({ addon: addon.object, activeLocale: locale }), (manager) => {
          expect(manager.activeLocale).to.eq(locale);
        });
        addon.verifyAll();
      });

    });

  });

  describe("settings", () => {

    const addon = moq.Mock.ofType<NodeAddonDefinition>();
    const manager: ECPresentationManager = new ECPresentationManager({ addon: addon.object });

    it("returns settings manager", () => {
      expect(manager.settings).to.be.instanceOf(UserSettingsManager);
    });

  });

  describe("dispose", () => {

    it("calls native platform dispose when manager is disposed", () => {
      const mock = moq.Mock.ofType<NodeAddonDefinition>();
      const manager = new ECPresentationManager({ addon: mock.object });
      manager.dispose();
      manager.dispose();
      // note: verify native platform's `dispose` called only once
      mock.verify((x) => x.dispose(), moq.Times.once());
    });

    it("throws when attempting to use native platform after disposal", () => {
      const mock = moq.Mock.ofType<NodeAddonDefinition>();
      const manager = new ECPresentationManager({ addon: mock.object });
      manager.dispose();
      expect(() => manager.getNativePlatform()).to.throw(ECPresentationError);
    });

  });

  describe("calling default addon implementation", () => {

    let manager: ECPresentationManager;
    const addonMock = moq.Mock.ofType<NativeECPresentationManager>();
    beforeEach(() => {
      manager = new ECPresentationManager();
      addonMock.reset();
      // we're replacing the native addon with our mock - make sure the original
      // one gets terminated
      (manager.getNativePlatform() as any)._nativeAddon.dispose();
      (manager.getNativePlatform() as any)._nativeAddon = addonMock.object;
    });
    afterEach(() => {
      manager.dispose();
    });

    it("calls addon's dispose", async () => {
      addonMock.setup((x) => x.dispose()).verifiable();
      manager.getNativePlatform().dispose();
      addonMock.verifyAll();
    });

    it("calls addon's handleRequest", (done) => {
      addonMock
        .setup((x) => x.handleRequest(moq.It.isAny(), "", moq.It.isAny()))
        .returns((_db, _options, cb) => cb({ result: "0" }))
        .verifiable();
      expect(manager.getNativePlatform().handleRequest(undefined, "")).eventually.to.be.equal("0").notify(done);
      addonMock.verifyAll();
    });

    it("throws on invalid handleRequest response", async () => {
      addonMock
        .setup((x) => x.handleRequest(moq.It.isAny(), "", moq.It.isAny()))
        .returns((_db, _options, cb) => cb(undefined as any));
      return expect(manager.getNativePlatform().handleRequest(undefined, "")).eventually.to.be.rejectedWith(ECPresentationError);
    });

    it("throws on handleRequest error response", async () => {
      addonMock
        .setup((x) => x.handleRequest(moq.It.isAny(), "", moq.It.isAny()))
        .returns((_db, _options, cb) => cb({ error: { status: NativeECPresentationStatus.Error, message: "test" } }));
      return expect(manager.getNativePlatform().handleRequest(undefined, "")).eventually.to.be.rejectedWith(ECPresentationError, "test");
    });

    it("throws on handleRequest success response without result", async () => {
      addonMock
        .setup((x) => x.handleRequest(moq.It.isAny(), "", moq.It.isAny()))
        .returns((_db, _options, cb) => cb({ result: undefined }));
      return expect(manager.getNativePlatform().handleRequest(undefined, "")).eventually.to.be.rejectedWith(ECPresentationError);
    });

    it("calls addon's setupRulesetDirectories", async () => {
      addonMock
        .setup((x) => x.setupRulesetDirectories(moq.It.isAny()))
        .returns(() => ({}))
        .verifiable();
      manager.getNativePlatform().setupRulesetDirectories([]);
      addonMock.verifyAll();
    });

    it("calls addon's setupLocaleDirectories", async () => {
      addonMock.setup((x) => x.setupLocaleDirectories(moq.It.isAny())).returns(() => ({})).verifiable();
      manager.getNativePlatform().setupLocaleDirectories([]);
      addonMock.verifyAll();
    });

    it("calls addon's setActiveLocale", async () => {
      const locale = faker.locale;
      addonMock.setup((x) => x.setActiveLocale(moq.It.isAnyString())).returns(() => ({})).verifiable();
      manager.activeLocale = locale;
      addonMock.verify((x) => x.setActiveLocale(locale), moq.Times.once());
      manager.activeLocale = undefined;
      addonMock.verify((x) => x.setActiveLocale(""), moq.Times.once());
    });

    it("throws on invalid void response", async () => {
      addonMock
        .setup((x) => x.setupRulesetDirectories(moq.It.isAny()))
        .returns(() => (undefined as any));
      expect(() => manager.getNativePlatform().setupRulesetDirectories([])).to.throw(ECPresentationError);
    });

    it("throws on void error response", async () => {
      addonMock
        .setup((x) => x.setupRulesetDirectories(moq.It.isAny()))
        .returns(() => ({ error: { status: NativeECPresentationStatus.InvalidArgument, message: "test" } }));
      expect(() => manager.getNativePlatform().setupRulesetDirectories([])).to.throw(ECPresentationError, "test");
    });

    it("calls addon's addRuleSet", async () => {
      const ruleset = { ruleSetId: "" };
      addonMock.setup((x) => x.addRuleSet(JSON.stringify(ruleset))).returns(() => ({})).verifiable();
      await manager.addRuleSet(ruleset);
      addonMock.verifyAll();
    });

    it("calls addon's removeRuleSet", async () => {
      addonMock.setup((x) => x.removeRuleSet("test id")).returns(() => ({})).verifiable();
      await manager.removeRuleSet("test id");
      addonMock.verifyAll();
    });

    it("calls addon's clearRuleSets", async () => {
      addonMock.setup((x) => x.clearRuleSets()).returns(() => ({})).verifiable();
      await manager.clearRuleSets();
      addonMock.verifyAll();
    });

    it("calls addon's setUserSetting", async () => {
      const value = JSON.stringify({ value: "", type: SettingValueTypes.String });
      addonMock.setup((x) => x.setUserSetting("rulesetId", "settingId", value))
        .returns(() => ({}))
        .verifiable();
      await manager.getNativePlatform().setUserSetting("rulesetId", "settingId", value);
      addonMock.verifyAll();
    });

    it("calls addon's getUserSetting", async () => {
      const value = faker.random.word();
      addonMock.setup((x) => x.getUserSetting("rulesetId", "settingId", SettingValueTypes.String))
        .returns(() => ({ result: value }))
        .verifiable();
      const result = await manager.getNativePlatform().getUserSetting("rulesetId", "settingId", SettingValueTypes.String);
      expect(result).to.be.equal(value);
      addonMock.verifyAll();
    });

    it("returns imodel addon from IModelDb", () => {
      const mock = moq.Mock.ofType<IModelDb>();
      mock.setup((x) => x.nativeDb).returns(() => ({})).verifiable(moq.Times.atLeastOnce());
      expect(manager.getNativePlatform().getImodelAddon(mock.object)).be.instanceOf(Object);
      mock.verifyAll();
    });

    it("throws when fails to find imodel using IModelDb", () => {
      const mock = moq.Mock.ofType<IModelDb>();
      mock.setup((x) => x.nativeDb).returns(() => undefined).verifiable(moq.Times.atLeastOnce());
      expect(() => manager.getNativePlatform().getImodelAddon(mock.object)).to.throw(ECPresentationError);
      mock.verifyAll();
    });

  });

  describe("addon results conversion to ECPresentation objects", () => {

    let testData: any;
    const mock = moq.Mock.ofType<NodeAddonDefinition>();
    let manager: ECPresentationManager;
    beforeEach(() => {
      testData = {
        imodelToken: new IModelToken("key path", "context id", "imodel id", "changeset id"),
        pageOptions: { pageStart: 123, pageSize: 456 } as PageOptions,
        displayType: faker.random.word(),
        keys: (new KeySet([createRandomECInstanceNodeKey()])).add(createRandomECInstanceKey()),
        selectionInfo: {
          providerName: faker.random.word(),
          level: faker.random.number(),
        } as SelectionInfo,
        extendedOptions: {
          rulesetId: faker.random.word(),
          someOtherOption: faker.random.number(),
        },
      };
      mock.reset();
      mock.setup((x) => x.getImodelAddon(testData.imodelToken)).verifiable(moq.Times.atLeastOnce());
      manager = new ECPresentationManager({ addon: mock.object });
    });
    afterEach(() => {
      manager.dispose();
      mock.verifyAll();
    });

    const setup = (addonResponse: any) => {
      // mock the handleRequest function
      mock.setup((x) => x.handleRequest(moq.It.isAny(), moq.It.isAnyString()))
        .returns(async () => JSON.stringify(addonResponse));
    };
    const verifyWithSnapshot = (result: any, expectedParams: any, recreateSnapshot: boolean = false) => {
      // verify the addon was called with correct params
      mock.verify((x) => x.handleRequest(moq.It.isAny(), JSON.stringify(expectedParams)), moq.Times.once());
      // verify the manager correctly used addonResponse to create its result
      expect(result).to.matchSnapshot(recreateSnapshot);
    };
    const verifyWithExpectedResult = (actualResult: any, expectedResult: any, expectedParams: any) => {
      // verify the addon was called with correct params
      mock.verify((x) => x.handleRequest(moq.It.isAny(), JSON.stringify(expectedParams)), moq.Times.once());
      // verify the manager correctly used addonResponse to create its result
      expect(actualResult).to.deep.eq(expectedResult);
    };

    it("returns root nodes", async () => {
      // what the addon receives
      const expectedParams = {
        requestId: NodeAddonRequestTypes.GetRootNodes,
        params: {
          pageOptions: testData.pageOptions,
          options: testData.extendedOptions,
        },
      };
      // what the addon returns
      const addonResponse: Node[] = [{
        key: {
          type: "type1",
          pathFromRoot: ["p1", "p2", "p3"],
        } as NodeKey,
        label: "test1",
        description: "description1",
        imageId: "img_1",
        foreColor: "foreColor1",
        backColor: "backColor1",
        fontStyle: "fontStyle1",
        hasChildren: true,
        isSelectable: true,
        isEditable: true,
        isChecked: true,
        isCheckboxVisible: true,
        isCheckboxEnabled: true,
        isExpanded: true,
      }, {
        key: {
          type: "ECInstanceNode",
          pathFromRoot: ["p1"],
          instanceKey: createRandomECInstanceKey(),
        } as ECInstanceNodeKey,
        label: "test2",
        description: "description2",
        imageId: "",
        foreColor: "",
        backColor: "",
        fontStyle: "",
        hasChildren: false,
        isSelectable: false,
        isEditable: false,
        isChecked: false,
        isCheckboxVisible: false,
        isCheckboxEnabled: false,
        isExpanded: false,
      }, {
        key: {
          type: "some node",
          pathFromRoot: ["p1", "p3"],
        } as NodeKey,
        label: "test2",
      }];
      // test
      setup(addonResponse);
      const result = await manager.getRootNodes(testData.imodelToken, testData.pageOptions, testData.extendedOptions);
      verifyWithSnapshot(result, expectedParams);
    });

    it("returns root nodes count", async () => {
      // what the addon receives
      const expectedParams = {
        requestId: NodeAddonRequestTypes.GetRootNodesCount,
        params: {
          options: testData.extendedOptions,
        },
      };
      // what the addon returns
      const addonResponse = 456;
      // test
      setup(addonResponse);
      const result = await manager.getRootNodesCount(testData.imodelToken, testData.extendedOptions);
      verifyWithExpectedResult(result, addonResponse, expectedParams);
    });

    it("returns child nodes", async () => {
      // what the addon receives
      const parentNodeKey = createRandomECInstanceNodeKey();
      const expectedParams = {
        requestId: NodeAddonRequestTypes.GetChildren,
        params: {
          nodeKey: parentNodeKey,
          pageOptions: testData.pageOptions,
          options: testData.extendedOptions,
        },
      };
      // what the addon returns
      const addonResponse: Node[] = [{
        key: {
          type: "ECInstanceNode",
          pathFromRoot: ["p1"],
          instanceKey: createRandomECInstanceKey(),
        } as ECInstanceNodeKey,
        label: "test2",
      }, {
        key: {
          type: "type 2",
          pathFromRoot: ["p1", "p3"],
        } as NodeKey,
        label: "test3",
      }];
      // test
      setup(addonResponse);
      const result = await manager.getChildren(testData.imodelToken, parentNodeKey, testData.pageOptions, testData.extendedOptions);
      verifyWithSnapshot(result, expectedParams);
    });

    it("returns child nodes count", async () => {
      // what the addon receives
      const parentNodeKey = createRandomECInstanceNodeKey();
      const expectedParams = {
        requestId: NodeAddonRequestTypes.GetChildrenCount,
        params: {
          nodeKey: parentNodeKey,
          options: testData.extendedOptions,
        },
      };
      // what the addon returns
      const addonResponse = 789;
      // test
      setup(addonResponse);
      const result = await manager.getChildrenCount(testData.imodelToken, parentNodeKey, testData.extendedOptions);
      verifyWithExpectedResult(result, addonResponse, expectedParams);
    });

    it("returns filtered node paths", async () => {
      // what the addon receives
      const expectedParams = {
        requestId: NodeAddonRequestTypes.GetFilteredNodePaths,
        params: {
          filterText: "filter",
          options: testData.extendedOptions,
        },
      };

      // what addon returns
      const addonResponse = createRandomNodePathElement(0);

      setup(addonResponse);
      const result = await manager.getFilteredNodePaths(testData.imodelToken, "filter", testData.extendedOptions);
      verifyWithSnapshot(result, expectedParams);
    });

    it("returns node paths", async () => {
      // what the addon receives
      const keyArray = [[createRandomECInstanceKey(), createRandomECInstanceKey()]];
      const markedIndex = faker.random.number();
      const expectedParams = {
        requestId: NodeAddonRequestTypes.GetNodePaths,
        params: {
          paths: keyArray,
          markedIndex,
          options: testData.extendedOptions,
        },
      };

      // what addon returns
      const addonResponse = createRandomNodePathElement(0);

      setup(addonResponse);
      const result = await manager.getNodePaths(testData.imodelToken, keyArray, markedIndex, testData.extendedOptions);
      verifyWithSnapshot(result, expectedParams);
    });

    it("returns content descriptor", async () => {
      // what the addon receives
      const expectedParams = {
        requestId: NodeAddonRequestTypes.GetContentDescriptor,
        params: {
          displayType: testData.displayType,
          keys: testData.keys,
          selection: testData.selectionInfo,
          options: testData.extendedOptions,
        },
      };
      const addonResponse: DescriptorJSON = {
        connectionId: faker.random.uuid(),
        inputKeysHash: faker.random.uuid(),
        contentOptions: faker.random.objectElement(),
        displayType: testData.displayType,
        selectClasses: [{
          selectClassInfo: createRandomECClassInfoJSON(),
          isSelectPolymorphic: true,
          pathToPrimaryClass: createRandomRelationshipPathJSON(1),
          relatedPropertyPaths: [createRandomRelationshipPathJSON(1)],
        }],
        fields: [{
          name: "Primitive property field with editor",
          category: createRandomCategory(),
          label: faker.random.words(),
          type: {
            typeName: "string",
            valueFormat: "Primitive",
          } as PrimitiveTypeDescription,
          isReadonly: faker.random.boolean(),
          priority: faker.random.number(),
          editor: {
            name: faker.random.word(),
            params: {
              some_param: faker.random.number(),
            },
          },
          properties: [{
            property: {
              classInfo: createRandomECClassInfoJSON(),
              name: faker.random.word(),
              type: "string",
              enumerationInfo: {
                choices: [{
                  label: faker.random.words(),
                  value: faker.random.uuid(),
                }, {
                  label: faker.random.words(),
                  value: faker.random.uuid(),
                }],
                isStrict: faker.random.boolean(),
              },
            } as PropertyInfoJSON,
            relatedClassPath: [],
          } as PropertyJSON],
        } as PropertiesFieldJSON, {
          name: "Complex array of structs property field",
          category: createRandomCategory(),
          label: faker.random.words(),
          type: {
            typeName: "string[]",
            valueFormat: "Array",
            memberType: {
              typeName: "SomeClass",
              valueFormat: "Struct",
              members: [{
                name: faker.random.word(),
                label: faker.random.words(),
                type: {
                  typeName: "string",
                  valueFormat: "Primitive",
                },
              }, {
                name: faker.random.word(),
                label: faker.random.words(),
                type: {
                  typeName: "string[]",
                  valueFormat: "Array",
                  memberType: {
                    typeName: "string",
                    valueFormat: "Primitive",
                  },
                } as ArrayTypeDescription,
              }],
            } as StructTypeDescription,
          } as ArrayTypeDescription,
          isReadonly: faker.random.boolean(),
          priority: faker.random.number(),
          properties: [{
            property: {
              classInfo: createRandomECClassInfoJSON(),
              name: faker.random.word(),
              type: "double",
              kindOfQuantity: {
                name: faker.random.word(),
                label: faker.random.words(),
                persistenceUnit: faker.random.word(),
                currentFusId: faker.random.uuid(),
              } as KindOfQuantityInfo,
            } as PropertyInfoJSON,
            relatedClassPath: [],
          } as PropertyJSON],
        } as PropertiesFieldJSON, {
          name: "Nested content field",
          category: createRandomCategory(),
          label: faker.random.words(),
          type: {
            typeName: faker.random.word(),
            valueFormat: "Struct",
            members: [{
              name: faker.random.word(),
              label: faker.random.words(),
              type: {
                typeName: "string",
                valueFormat: "Primitive",
              },
            }],
          } as StructTypeDescription,
          contentClassInfo: createRandomECClassInfoJSON(),
          pathToPrimaryClass: createRandomRelationshipPathJSON(1),
          nestedFields: [{
            name: "Simple property field",
            category: createRandomCategory(),
            label: faker.random.words(),
            type: {
              typeName: "string",
              valueFormat: "Primitive",
            },
            isReadonly: faker.random.boolean(),
            priority: faker.random.number(),
          } as FieldJSON],
          isReadonly: faker.random.boolean(),
          priority: faker.random.number(),
        } as NestedContentFieldJSON],
        contentFlags: 0,
      };
      // test
      setup(addonResponse);
      const result = await manager.getContentDescriptor(testData.imodelToken, testData.displayType,
        testData.keys, testData.selectionInfo, testData.extendedOptions);
      verifyWithSnapshot(result, expectedParams);
    });

    it("returns content set size", async () => {
      // what the addon receives
      const descriptor = createRandomDescriptor() as any; // wip: why is casting to any required?
      const expectedParams = {
        requestId: NodeAddonRequestTypes.GetContentSetSize,
        params: {
          keys: testData.keys,
          descriptorOverrides: descriptor.createDescriptorOverrides(),
          options: testData.extendedOptions,
        },
      };
      // what the addon returns
      const addonResponse = faker.random.number();
      // test
      setup(addonResponse);
      const result = await manager.getContentSetSize(testData.imodelToken, descriptor,
        testData.keys, testData.extendedOptions);
      verifyWithExpectedResult(result, addonResponse, expectedParams);
    });

    it("returns content", async () => {
      // what the addon receives
      const descriptor = createRandomDescriptor() as any; // wip: why is casting to any required?
      const expectedParams = {
        requestId: NodeAddonRequestTypes.GetContent,
        params: {
          keys: testData.keys,
          descriptorOverrides: descriptor.createDescriptorOverrides(),
          pageOptions: testData.pageOptions,
          options: testData.extendedOptions,
        },
      };
      // what the addon returns
      const fieldName = faker.random.word();
      const addonResponse = {
        descriptor: {
          displayType: descriptor.displayType,
          selectClasses: [{
            selectClassInfo: createRandomECClassInfoJSON(),
            isSelectPolymorphic: true,
            pathToPrimaryClass: [],
            relatedPropertyPaths: [],
          } as SelectClassInfoJSON],
          fields: [{
            name: fieldName,
            category: createRandomCategory(),
            label: faker.random.words(),
            type: {
              typeName: "string",
              valueFormat: "Primitive",
            } as PrimitiveTypeDescription,
            isReadonly: faker.random.boolean(),
            priority: faker.random.number(),
            properties: [{
              property: {
                classInfo: createRandomECClassInfoJSON(),
                name: faker.random.word(),
                type: "string",
              } as PropertyInfoJSON,
              relatedClassPath: [],
            } as PropertyJSON],
          } as PropertiesFieldJSON],
          contentFlags: 0,
        } as DescriptorJSON,
        contentSet: [{
          primaryKeys: [createRandomECInstanceKeyJSON()],
          classInfo: createRandomECClassInfoJSON(),
          label: faker.random.words(),
          imageId: faker.random.uuid(),
          values: {
            [fieldName]: faker.random.words(),
          },
          displayValues: {
            [fieldName]: faker.random.words(),
          },
          mergedFieldNames: [],
        } as ItemJSON],
      } as ContentJSON;
      // test
      setup(addonResponse);
      const result = await manager.getContent(testData.imodelToken, descriptor,
        testData.keys, testData.pageOptions, testData.extendedOptions);
      verifyWithSnapshot(result, expectedParams);
    });

    it("throws on invalid addon response", async () => {
      mock.setup((x) => x.handleRequest(moq.It.isAny(), moq.It.isAnyString())).returns(() => (undefined as any));
      return expect(manager.getRootNodes(testData.imodelToken, testData.pageOptions, testData.extendedOptions)).to.eventually.be.rejectedWith(Error);
    });

  });

});
