/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as moq from "@helpers/Mocks";
import * as faker from "faker";
import { IModelToken } from "@bentley/imodeljs-common";
import { IModelDb } from "@bentley/imodeljs-backend";
import { PageOptions, KeySet, SettingValueTypes, ECPresentationError, InstanceKey, Paged, HierarchyRequestOptions, ContentRequestOptions } from "@common/index";
import { Node } from "@common/hierarchy";
import { Descriptor, Content } from "@common/content";
import {
  createRandomECInstanceKey,
  createRandomECInstanceNodeKey, createRandomECInstanceNode, createRandomNodePathElement,
  createRandomDescriptor,
} from "@helpers/random";
import ECPresentationManager from "@src/ECPresentationManager";
import ECPresentationRpcImpl from "@src/ECPresentationRpcImpl";
import ECPresentation from "@src/ECPresentation";
import UserSettingsManager from "@src/UserSettingsManager";
import "./IModeHostSetup";

describe("ECPresentationRpcImpl", () => {

  afterEach(() => {
    ECPresentation.terminate();
  });

  it("uses default ECPresentationManager implementation if not overridden", () => {
    ECPresentation.initialize();
    const impl = new ECPresentationRpcImpl();
    expect(impl.getManager()).is.instanceof(ECPresentationManager);
  });

  describe("calls forwarding", () => {

    let testData: any;
    const impl = new ECPresentationRpcImpl();
    const presentationManagerMock = moq.Mock.ofType<ECPresentationManager>();
    const settingsMock = moq.Mock.ofType<UserSettingsManager>();

    beforeEach(() => {
      settingsMock.reset();
      presentationManagerMock.reset();
      presentationManagerMock.setup((x) => x.settings).returns(() => settingsMock.object);
      ECPresentation.setManager(presentationManagerMock.object);
      testData = {
        imodelToken: new IModelToken(),
        imodelMock: moq.Mock.ofType<IModelDb>(),
        rulesetId: faker.random.word(),
        pageOptions: { start: 123, size: 456 } as PageOptions,
        displayType: "sample display type",
        keys: new KeySet([createRandomECInstanceKey(), createRandomECInstanceKey(), createRandomECInstanceKey()]),
      };
      testData.imodelMock.setup((x: IModelDb) => x.iModelToken).returns(() => testData.imodelToken);
      IModelDb.find = () => testData.imodelMock.object;
    });

    it("throws when using invalid imodel token", async () => {
      IModelDb.find = () => undefined as any;
      const options: Paged<HierarchyRequestOptions<IModelToken>> = {
        imodel: testData.imodelToken,
        rulesetId: testData.rulesetId,
      };
      const request = impl.getRootNodes(options);
      await expect(request).to.eventually.be.rejectedWith(ECPresentationError);
    });

    describe("addRuleSet", () => {
      it("calls manager", async () => {
        presentationManagerMock.setup((x) => x.addRuleSet(moq.It.isAny())).verifiable();
        await impl.addRuleSet({ ruleSetId: "" });
        presentationManagerMock.verifyAll();
      });
    });

    describe("removeRuleSet", () => {
      it("calls manager", async () => {
        presentationManagerMock.setup((x) => x.removeRuleSet(moq.It.isAny())).verifiable();
        await impl.removeRuleSet("");
        presentationManagerMock.verifyAll();
      });
    });

    describe("clearRuleSets", () => {
      it("calls manager", async () => {
        presentationManagerMock.setup((x) => x.clearRuleSets()).verifiable();
        await impl.clearRuleSets();
        presentationManagerMock.verifyAll();
      });
    });

    describe("getRootNodes", () => {

      it("calls manager", async () => {
        const result: Node[] = [createRandomECInstanceNode(), createRandomECInstanceNode(), createRandomECInstanceNode()];
        const options: Paged<HierarchyRequestOptions<IModelToken>> = {
          imodel: testData.imodelToken,
          rulesetId: testData.rulesetId,
          paging: testData.pageOptions,
        };
        presentationManagerMock.setup((x) => x.getRootNodes({ ...options, imodel: testData.imodelMock.object }))
          .returns(() => Promise.resolve(result))
          .verifiable();
        const actualResult = await impl.getRootNodes(options);
        presentationManagerMock.verifyAll();
        expect(actualResult).to.deep.eq(result);
      });

    });

    describe("getRootNodesCount", () => {

      it("calls manager", async () => {
        const result = 999;
        const options: HierarchyRequestOptions<IModelToken> = {
          imodel: testData.imodelToken,
          rulesetId: testData.rulesetId,
        };
        presentationManagerMock.setup((x) => x.getRootNodesCount({ ...options, imodel: testData.imodelMock.object }))
          .returns(() => Promise.resolve(result))
          .verifiable();
        const actualResult = await impl.getRootNodesCount(options);
        presentationManagerMock.verifyAll();
        expect(actualResult).to.eq(result);
      });

    });

    describe("getChildren", () => {

      it("calls manager", async () => {
        const result: Node[] = [createRandomECInstanceNode(), createRandomECInstanceNode(), createRandomECInstanceNode()];
        const parentNodeKey = createRandomECInstanceNodeKey();
        const options: Paged<HierarchyRequestOptions<IModelToken>> = {
          imodel: testData.imodelToken,
          rulesetId: testData.rulesetId,
          paging: testData.pageOptions,
        };
        presentationManagerMock.setup((x) => x.getChildren({ ...options, imodel: testData.imodelMock.object }, parentNodeKey))
          .returns(() => Promise.resolve(result))
          .verifiable();
        const actualResult = await impl.getChildren(options, parentNodeKey);
        presentationManagerMock.verifyAll();
        expect(actualResult).to.deep.eq(result);
      });

    });

    describe("getChildrenCount", () => {

      it("calls manager", async () => {
        const result = 999;
        const parentNodeKey = createRandomECInstanceNodeKey();
        const options: HierarchyRequestOptions<IModelToken> = {
          imodel: testData.imodelToken,
          rulesetId: testData.rulesetId,
        };
        presentationManagerMock.setup((x) => x.getChildrenCount({ ...options, imodel: testData.imodelMock.object }, parentNodeKey))
          .returns(() => Promise.resolve(result))
          .verifiable();
        const actualResult = await impl.getChildrenCount(options, parentNodeKey);
        presentationManagerMock.verifyAll();
        expect(actualResult).to.eq(result);
      });

    });

    describe("getFilteredNodePaths", () => {

      it("calls manager", async () => {
        const result = [createRandomNodePathElement(0), createRandomNodePathElement(0)];
        const options: HierarchyRequestOptions<IModelToken> = {
          imodel: testData.imodelToken,
          rulesetId: testData.rulesetId,
        };
        presentationManagerMock.setup((x) => x.getFilteredNodePaths({ ...options, imodel: testData.imodelMock.object }, "filter"))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getFilteredNodePaths(options, "filter");
        presentationManagerMock.verifyAll();
        expect(actualResult).to.deep.equal(result);
      });

    });

    describe("getNodePaths", () => {

      it("calls manager", async () => {
        const result = [createRandomNodePathElement(0), createRandomNodePathElement(0)];
        const keyArray: InstanceKey[][] = [[createRandomECInstanceKey(), createRandomECInstanceKey()]];
        const options: HierarchyRequestOptions<IModelToken> = {
          imodel: testData.imodelToken,
          rulesetId: testData.rulesetId,
        };
        presentationManagerMock.setup((x) => x.getNodePaths({ ...options, imodel: testData.imodelMock.object }, keyArray, 1))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getNodePaths(options, keyArray, 1);
        presentationManagerMock.verifyAll();
        expect(actualResult).to.deep.equal(result);
      });

    });

    describe("getContentDescriptor", () => {

      it("calls manager and resets descriptors parentship", async () => {

        const descriptorMock = moq.Mock.ofType<Descriptor>();
        moq.configureForPromiseResult(descriptorMock);
        descriptorMock.setup((x) => x.resetParentship).verifiable();
        const result = descriptorMock.object;

        const options: ContentRequestOptions<IModelToken> = {
          imodel: testData.imodelToken,
          rulesetId: testData.rulesetId,
        };
        presentationManagerMock.setup((x) => x.getContentDescriptor({ ...options, imodel: testData.imodelMock.object }, testData.displayType, testData.inputKeys, undefined))
          .returns(async () => result)
          .verifiable();

        const actualResult = await impl.getContentDescriptor(options, testData.displayType,
          testData.inputKeys, undefined);
        presentationManagerMock.verifyAll();
        descriptorMock.verifyAll();
        expect(actualResult).to.eq(result);
      });

      it("handles undefined descriptor response", async () => {
        const options: ContentRequestOptions<IModelToken> = {
          imodel: testData.imodelToken,
          rulesetId: testData.rulesetId,
        };
        presentationManagerMock.setup((x) => x.getContentDescriptor({ ...options, imodel: testData.imodelMock.object }, testData.displayType, testData.inputKeys, undefined))
          .returns(async () => undefined)
          .verifiable();
        const actualResult = await impl.getContentDescriptor(options, testData.displayType,
          testData.inputKeys, undefined);
        presentationManagerMock.verifyAll();
        expect(actualResult).to.be.undefined;
      });

    });

    describe("getContentSetSize", () => {

      it("calls manager", async () => {
        const result = 789;
        const descriptor: Descriptor = createRandomDescriptor();
        const options: ContentRequestOptions<IModelToken> = {
          imodel: testData.imodelToken,
          rulesetId: testData.rulesetId,
        };
        presentationManagerMock.setup((x) => x.getContentSetSize({ ...options, imodel: testData.imodelMock.object }, descriptor, testData.inputKeys))
          .returns(() => Promise.resolve(result))
          .verifiable();
        const actualResult = await impl.getContentSetSize(options, descriptor, testData.inputKeys);
        presentationManagerMock.verifyAll();
        expect(actualResult).to.deep.eq(result);
      });

    });

    describe("getContent", () => {

      it("calls manager", async () => {
        const descriptorMock = moq.Mock.ofType<Descriptor>();
        descriptorMock.setup((x) => x.resetParentship).verifiable();

        const contentMock = moq.Mock.ofType<Content>();
        moq.configureForPromiseResult(contentMock);
        contentMock.setup((x) => x.descriptor).returns(() => descriptorMock.object);
        contentMock.setup((x) => x.contentSet).returns(() => []);

        const options: Paged<ContentRequestOptions<IModelToken>> = {
          imodel: testData.imodelToken,
          rulesetId: testData.rulesetId,
          paging: testData.pageOptions,
        };

        presentationManagerMock.setup((x) => x.getContent({ ...options, imodel: testData.imodelMock.object }, descriptorMock.object, testData.inputKeys))
          .returns(async () => contentMock.object)
          .verifiable();
        const actualResult = await impl.getContent(options, descriptorMock.object, testData.inputKeys);
        presentationManagerMock.verifyAll();
        descriptorMock.verifyAll();
        expect(actualResult).to.eq(contentMock.object);
      });

    });

    describe("getDistinctValues", () => {

      it("calls manager", async () => {
        const distinctValues = [faker.random.word(), faker.random.word()];
        const descriptor = createRandomDescriptor();
        const fieldName = faker.random.word();
        const maximumValueCount = faker.random.number();
        const options: ContentRequestOptions<IModelToken> = {
          imodel: testData.imodelToken,
          rulesetId: testData.rulesetId,
        };
        presentationManagerMock.setup((x) => x.getDistinctValues({ ...options, imodel: testData.imodelMock.object }, descriptor, testData.inputKeys, fieldName, maximumValueCount))
          .returns(async () => distinctValues)
          .verifiable();
        const actualResult = await impl.getDistinctValues(options, descriptor,
          testData.inputKeys, fieldName, maximumValueCount);
        presentationManagerMock.verifyAll();
        expect(actualResult).to.deep.eq(distinctValues);
      });

    });

    describe("setUserSettingValue", () => {

      it("calls settings manager", async () => {
        settingsMock.setup((x) => x.setValue("rulesetId", "settingId", { value: "", type: SettingValueTypes.String }))
          .verifiable();

        await impl.setUserSettingValue("rulesetId", "settingId", { value: "", type: SettingValueTypes.String });
        settingsMock.verifyAll();
      });

    });

    describe("getUserSettingValue", () => {

      it("calls settings manager", async () => {
        const value = faker.random.word();
        settingsMock.setup((x) => x.getValue("rulesetId", "settingId", SettingValueTypes.String))
          .returns(async () => value)
          .verifiable();

        const result = await impl.getUserSettingValue("rulesetId", "settingId", SettingValueTypes.String);
        expect(result).to.be.equal(value);
        settingsMock.verifyAll();
      });

    });

  });

});
