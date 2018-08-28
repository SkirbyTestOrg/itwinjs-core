/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as moq from "@helpers/Mocks";
import * as faker from "faker";
import { IModelToken } from "@bentley/imodeljs-common";
import { IModelDb } from "@bentley/imodeljs-backend";
import {
  PageOptions, KeySet, PresentationError, InstanceKey,
  Paged, IRulesetManager, RegisteredRuleset,
  HierarchyRequestOptions, ContentRequestOptions,
} from "@bentley/presentation-common";
import { Node } from "@common/hierarchy";
import { Descriptor, Content } from "@common/content";
import { VariableValueTypes, VariableValue } from "@bentley/presentation-common/lib/IRulesetVariablesManager";
import { RpcRequestOptions, HierarchyRpcRequestOptions } from "@bentley/presentation-common/lib/PresentationRpcInterface";
import {
  createRandomECInstanceKey,
  createRandomECInstanceNodeKey, createRandomECInstanceNode, createRandomNodePathElement,
  createRandomDescriptor,
  createRandomRuleset,
} from "@helpers/random";
import RulesetVariablesManager from "@src/RulesetVariablesManager";
import PresentationManager from "@src/PresentationManager";
import PresentationRpcImpl from "@src/PresentationRpcImpl";
import Presentation from "@src/Presentation";
import "./IModelHostSetup";

describe("PresentationRpcImpl", () => {

  afterEach(() => {
    Presentation.terminate();
  });

  it("uses default PresentationManager implementation if not overridden", () => {
    Presentation.initialize();
    const impl = new PresentationRpcImpl();
    expect(impl.getManager()).is.instanceof(PresentationManager);
  });

  describe("calls forwarding", () => {

    let testData: any;
    let rpcImplId: string;
    let defaultRpcParams: RpcRequestOptions;
    let impl: PresentationRpcImpl;
    const presentationManagerMock = moq.Mock.ofType<PresentationManager>();
    const rulesetsMock = moq.Mock.ofType<IRulesetManager>();
    const variablesMock = moq.Mock.ofType<RulesetVariablesManager>();

    beforeEach(() => {
      rulesetsMock.reset();
      variablesMock.reset();
      presentationManagerMock.reset();
      presentationManagerMock.setup((x) => x.vars(moq.It.isAnyString())).returns(() => variablesMock.object);
      presentationManagerMock.setup((x) => x.rulesets()).returns(() => rulesetsMock.object);
      Presentation.initialize({
        clientManagerFactory: () => presentationManagerMock.object,
      });
      rpcImplId = faker.random.uuid();
      defaultRpcParams = { knownBackendIds: [rpcImplId], clientId: faker.random.uuid() };
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
      impl = new PresentationRpcImpl(rpcImplId);
    });

    it("throws when request's knownBackendIds doesn't contain impl id", async () => {
      const options: HierarchyRequestOptions<IModelToken> = {
        imodel: testData.imodelToken,
        rulesetId: testData.rulesetId,
      };
      const request = impl.getRootNodesCount({ knownBackendIds: [], ...options });
      await expect(request).to.eventually.be.rejectedWith(PresentationError, rpcImplId);
    });

    it("throws when using invalid imodel token", async () => {
      IModelDb.find = () => undefined as any;
      const options: Paged<HierarchyRpcRequestOptions> = {
        ...defaultRpcParams,
        imodel: testData.imodelToken,
        rulesetId: testData.rulesetId,
      };
      const request = impl.getRootNodes(options);
      await expect(request).to.eventually.be.rejectedWith(PresentationError);
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
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getRootNodes({ ...defaultRpcParams, ...options });
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
        const actualResult = await impl.getRootNodesCount({ ...defaultRpcParams, ...options });
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
        const actualResult = await impl.getChildren({ ...defaultRpcParams, ...options }, parentNodeKey);
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
        const actualResult = await impl.getChildrenCount({ ...defaultRpcParams, ...options }, parentNodeKey);
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
        const actualResult = await impl.getFilteredNodePaths({ ...defaultRpcParams, ...options }, "filter");
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
        const actualResult = await impl.getNodePaths({ ...defaultRpcParams, ...options }, keyArray, 1);
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

        const actualResult = await impl.getContentDescriptor({ ...defaultRpcParams, ...options },
          testData.displayType, testData.inputKeys, undefined);
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
        const actualResult = await impl.getContentDescriptor({ ...defaultRpcParams, ...options },
          testData.displayType, testData.inputKeys, undefined);
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
        const actualResult = await impl.getContentSetSize({ ...defaultRpcParams, ...options }, descriptor, testData.inputKeys);
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
        const actualResult = await impl.getContent({ ...defaultRpcParams, ...options }, descriptorMock.object, testData.inputKeys);
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
        const actualResult = await impl.getDistinctValues({ ...defaultRpcParams, ...options }, descriptor,
          testData.inputKeys, fieldName, maximumValueCount);
        presentationManagerMock.verifyAll();
        expect(actualResult).to.deep.eq(distinctValues);
      });

    });

    describe("getRuleset", () => {

      it("calls manager", async () => {
        const rulesetDefinition = { id: "", rules: [] };
        const hash = faker.random.uuid();
        rulesetsMock.setup((x) => x.get(rulesetDefinition.id)).returns(async () => new RegisteredRuleset(rulesetsMock.object, rulesetDefinition, hash)).verifiable();
        const resultTuple = await impl.getRuleset({ ...defaultRpcParams }, rulesetDefinition.id);
        presentationManagerMock.verifyAll();
        expect(resultTuple![0]).to.deep.eq(rulesetDefinition);
        expect(resultTuple![1]).to.eq(hash);
      });

      it("handles undefined response", async () => {
        const rulesetId = faker.random.uuid();
        rulesetsMock.setup((x) => x.get(rulesetId)).returns(async () => undefined).verifiable();
        const resultsTuple = await impl.getRuleset({ ...defaultRpcParams }, rulesetId);
        presentationManagerMock.verifyAll();
        expect(resultsTuple).to.be.undefined;
      });

    });

    describe("addRuleset", () => {

      it("calls manager", async () => {
        const rulesetDefinition = { id: "", rules: [] };
        const hash = faker.random.uuid();
        rulesetsMock.setup((x) => x.add(rulesetDefinition)).returns(async () => new RegisteredRuleset(rulesetsMock.object, rulesetDefinition, hash)).verifiable();
        const resultHash = await impl.addRuleset({ ...defaultRpcParams }, rulesetDefinition);
        presentationManagerMock.verifyAll();
        expect(resultHash).to.eq(hash);
      });

    });

    describe("addRulesets", () => {

      it("calls manager", async () => {
        const rulesets = await Promise.all([createRandomRuleset(), createRandomRuleset()]);
        const hashes = [faker.random.uuid(), faker.random.uuid()];
        rulesets.forEach((ruleset, index) => {
          rulesetsMock.setup((x) => x.add(ruleset))
            .returns(async () => new RegisteredRuleset(rulesetsMock.object, ruleset, hashes[index]))
            .verifiable();
        });
        const resultHashes = await impl.addRulesets({ ...defaultRpcParams }, rulesets);
        presentationManagerMock.verifyAll();
        expect(resultHashes).to.deep.eq(hashes);
      });

    });

    describe("removeRuleset", () => {

      it("calls manager", async () => {
        const rulesetId = faker.random.uuid();
        const hash = faker.random.uuid();
        rulesetsMock.setup((x) => x.remove([rulesetId, hash])).returns(async () => true).verifiable();
        const result = await impl.removeRuleset({ ...defaultRpcParams }, rulesetId, hash);
        presentationManagerMock.verifyAll();
        expect(result).to.be.true;
      });

    });

    describe("clearRulesets", () => {

      it("calls manager", async () => {
        rulesetsMock.setup((x) => x.clear()).verifiable();
        await impl.clearRulesets({ ...defaultRpcParams });
        presentationManagerMock.verifyAll();
      });

    });

    describe("getRulesetVariableValue", () => {

      it("calls variables manager", async () => {
        const rulesetId = faker.random.word();
        const varId = faker.random.word();
        const value = faker.random.word();
        variablesMock.setup((x) => x.getValue(varId, VariableValueTypes.String))
          .returns(async () => value)
          .verifiable();
        const result = await impl.getRulesetVariableValue({ ...defaultRpcParams, rulesetId }, varId, VariableValueTypes.String);
        variablesMock.verifyAll();
        expect(result).to.equal(value);
      });

    });

    describe("setRulesetVariableValue", () => {

      it("calls variables manager", async () => {
        const rulesetId = faker.random.word();
        const varId = faker.random.word();
        const value = faker.random.word();
        await impl.setRulesetVariableValue({ ...defaultRpcParams, rulesetId }, varId, VariableValueTypes.String, value);
        variablesMock.verify((x) => x.setValue(varId, VariableValueTypes.String, value), moq.Times.once());
      });

    });

    describe("setRulesetVariableValues", () => {

      it("calls variables manager", async () => {
        const rulesetId = faker.random.word();
        const values: Array<[string, VariableValueTypes, VariableValue]> = [
          [faker.random.word(), VariableValueTypes.String, faker.random.words()],
          [faker.random.word(), VariableValueTypes.Int, faker.random.number()],
        ];
        variablesMock.setup((x) => x.setValue(values[0][0], values[0][1], values[0][2] as string)).returns(() => Promise.resolve()).verifiable();
        variablesMock.setup((x) => x.setValue(values[1][0], values[1][1], values[1][2] as number)).returns(() => Promise.resolve()).verifiable();
        await impl.setRulesetVariableValues({ ...defaultRpcParams, rulesetId }, values);
        variablesMock.verifyAll();
      });

    });

  });

});
