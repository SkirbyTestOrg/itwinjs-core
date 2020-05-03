/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/* tslint:disable:no-direct-imports */

import { expect } from "chai";
import * as faker from "faker";
import sinon from "sinon";
import { BeDuration, BeEvent, using } from "@bentley/bentleyjs-core";
import { IModelRpcProps } from "@bentley/imodeljs-common";
import { EventSource, IModelApp, IModelConnection } from "@bentley/imodeljs-frontend";
import { I18N, I18NNamespace } from "@bentley/imodeljs-i18n";
import {
  Content, ContentRequestOptions, ContentUpdateInfo, Descriptor, HierarchyRequestOptions, HierarchyUpdateInfo, InstanceKey, KeySet,
  LabelRequestOptions, Node, NodeKey, NodePathElement, Paged, PartialHierarchyModification, PartialHierarchyModificationJSON,
  PresentationDataCompareOptions, PresentationError, PresentationRpcEvents, PresentationRpcInterface, PresentationStatus, PresentationUnitSystem,
  RegisteredRuleset, RequestPriority, RpcRequestsHandler, Ruleset, RulesetVariable, UpdateInfo, VariableValueTypes,
} from "@bentley/presentation-common";
import * as moq from "@bentley/presentation-common/lib/test/_helpers/Mocks";
import {
  createRandomDescriptor, createRandomECInstanceKey, createRandomECInstancesNode, createRandomECInstancesNodeJSON, createRandomECInstancesNodeKey,
  createRandomLabelDefinition, createRandomNodePathElement, createRandomRuleset,
} from "@bentley/presentation-common/lib/test/_helpers/random";
import { Presentation } from "../presentation-frontend/Presentation";
import { PresentationManager } from "../presentation-frontend/PresentationManager";
import { RulesetManagerImpl, RulesetManagerImplProps } from "../presentation-frontend/RulesetManager";
import { RulesetVariablesManagerImpl } from "../presentation-frontend/RulesetVariablesManager";

describe("PresentationManager", () => {

  const rulesetsManagerMock = moq.Mock.ofType<RulesetManagerImpl>();
  const rpcRequestsHandlerMock = moq.Mock.ofType<RpcRequestsHandler>();
  let manager: PresentationManager;
  const i18nMock = moq.Mock.ofType<I18N>();
  const testData = {
    imodelToken: moq.Mock.ofType<IModelRpcProps>().object,
    imodelMock: moq.Mock.ofType<IModelConnection>(),
    pageOptions: { start: 0, size: 0 },
    rulesetId: "",
  };
  let rulesetManagerCreateStub: sinon.SinonSpy<[RulesetManagerImplProps?], RulesetManagerImpl>;

  beforeEach(() => {
    mockI18N();
    testData.imodelMock.reset();
    testData.imodelMock.setup((x) => x.getRpcProps()).returns(() => testData.imodelToken);
    testData.imodelMock.setup((x) => x.onClose).returns(() => new BeEvent());
    testData.pageOptions = { start: faker.random.number(), size: faker.random.number() };
    testData.rulesetId = faker.random.uuid();
    rulesetsManagerMock.reset();
    rulesetManagerCreateStub = sinon.stub(RulesetManagerImpl, "create").returns(rulesetsManagerMock.object);
    rpcRequestsHandlerMock.reset();
    manager = PresentationManager.create({
      rpcRequestsHandler: rpcRequestsHandlerMock.object,
    });
  });

  afterEach(() => {
    manager.dispose();
    Presentation.terminate();
  });

  const mockI18N = () => {
    i18nMock.reset();
    Presentation.setI18nManager(i18nMock.object);
    const resolvedPromise = new Promise<void>((resolve) => resolve());
    i18nMock.setup((x) => x.registerNamespace(moq.It.isAny())).returns((name: string) => new I18NNamespace(name, resolvedPromise));
    i18nMock.setup((x) => x.translate(moq.It.isAny(), moq.It.isAny())).returns((stringId) => stringId);
  };

  const toIModelTokenOptions = <TOptions extends { imodel: IModelConnection, locale?: string, unitSystem?: PresentationUnitSystem }>(requestOptions: TOptions) => {
    return {
      ...requestOptions,
      imodel: requestOptions.imodel.getRpcProps(),
    };
  };

  const addRulesetAndVariablesToOptions = <TOptions extends { rulesetId?: string, rulesetOrId?: Ruleset | string }>(options: TOptions) => {
    const { rulesetId, rulesetOrId } = options;

    let foundRulesetOrId;
    if (rulesetOrId && typeof rulesetOrId === "object") {
      foundRulesetOrId = rulesetOrId;
    } else {
      foundRulesetOrId = rulesetOrId || rulesetId || "";
    }

    return { ...options, rulesetOrId: foundRulesetOrId, rulesetVariables: [] };
  };

  const prepareOptions = <TOptions extends { imodel: IModelConnection, locale?: string, unitSystem?: PresentationUnitSystem, rulesetId?: string, rulesetOrId?: Ruleset | string }>(options: TOptions) => {
    return toIModelTokenOptions(addRulesetAndVariablesToOptions(options));
  };

  describe("constructor", () => {

    it("sets active locale if supplied with props", async () => {
      const props = { activeLocale: faker.locale };
      const mgr = PresentationManager.create(props);
      expect(mgr.activeLocale).to.eq(props.activeLocale);
    });

    it("sets active unit system if supplied with props", async () => {
      const props = { activeUnitSystem: PresentationUnitSystem.UsSurvey };
      const mgr = PresentationManager.create(props);
      expect(mgr.activeUnitSystem).to.eq(props.activeUnitSystem);
    });

    it("sets custom RpcRequestsHandler if supplied with props", async () => {
      const handler = moq.Mock.ofType<RpcRequestsHandler>();
      const props = { rpcRequestsHandler: handler.object };
      const mgr = PresentationManager.create(props);
      expect(mgr.rpcRequestsHandler).to.eq(handler.object);
    });

    it("sets RpcRequestsHandler clientId if supplied with props", async () => {
      const props = { clientId: faker.random.uuid() };
      const mgr = PresentationManager.create(props);
      expect(mgr.rpcRequestsHandler.clientId).to.eq(props.clientId);
    });

    it("starts listening to update events", async () => {
      sinon.stub(IModelApp, "isNativeApp").get(() => true);
      const eventSource = sinon.createStubInstance(EventSource) as unknown as EventSource;
      PresentationManager.create({ eventSource });
      expect(eventSource.on).to.be.calledOnceWith(PresentationRpcInterface.interfaceName, PresentationRpcEvents.Update, sinon.match((arg) => typeof arg === "function"));
    });

  });

  describe("dispose", () => {

    it("disposes RPC requests handler", () => {
      manager.dispose();
      rpcRequestsHandlerMock.verify((x) => x.dispose(), moq.Times.once());
    });

    it("stops listening to update events", async () => {
      sinon.stub(IModelApp, "isNativeApp").get(() => true);
      const eventSource = sinon.createStubInstance(EventSource) as unknown as EventSource;
      using(PresentationManager.create({ eventSource }), (_) => { });
      expect(eventSource.off).to.be.calledOnceWith(PresentationRpcInterface.interfaceName, PresentationRpcEvents.Update, sinon.match((arg) => typeof arg === "function"));
    });

  });

  describe("onConnection", () => {

    it("caches IModelConnection and calls `onNewiModelConnection` for the first time", async () => {
      const spy = sinon.stub(manager, "onNewiModelConnection");
      const onCloseEvent = new BeEvent();
      const imodelMock = moq.Mock.ofType<IModelConnection>();
      imodelMock.setup((x) => x.onClose).returns(() => onCloseEvent);
      rpcRequestsHandlerMock.setup((x) => x.getNodesCount(moq.It.isAny(), undefined)).returns(async () => 0);

      // expect the spy to be called on first imodel use
      await manager.getNodesCount({
        imodel: imodelMock.object,
        rulesetOrId: testData.rulesetId,
      });
      expect(spy).to.be.calledOnceWith(imodelMock.object);
      spy.resetHistory();

      // expect the spy to not be called second time
      await manager.getNodesCount({
        imodel: imodelMock.object,
        rulesetOrId: testData.rulesetId,
      });
      expect(spy).to.not.be.called;
      spy.resetHistory();

      // simulate imodel close
      onCloseEvent.raiseEvent();

      // expect the spy to be called again
      await manager.getNodesCount({
        imodel: imodelMock.object,
        rulesetOrId: testData.rulesetId,
      });
      expect(spy).to.be.calledOnceWith(imodelMock.object);
    });

  });

  describe("onRulesetModified", () => {

    const triggerRulesetModification = async (curr: RegisteredRuleset, prev: Ruleset) => {
      const rulesetManagerCreateProps: RulesetManagerImplProps | undefined = rulesetManagerCreateStub.firstCall.args[0];
      expect(rulesetManagerCreateProps?.onRulesetModified).to.not.be.undefined;
      await (rulesetManagerCreateProps!.onRulesetModified!(curr, prev) as any as Promise<void>);
    };

    it("compares hierarchies and triggers hierarchy update event for each imodel", async () => {
      // setup a second imodel connection
      const imodelToken2 = moq.Mock.ofType<IModelRpcProps>().object;
      const imodelMock2 = moq.Mock.ofType<IModelConnection>();
      imodelMock2.setup((x) => x.getRpcProps()).returns(() => imodelToken2);
      imodelMock2.setup((x) => x.onClose).returns(() => new BeEvent());

      // init both imodel connections
      rpcRequestsHandlerMock.setup((x) => x.getNodesCount(moq.It.isAny(), undefined)).returns(async () => 0);
      await manager.getNodesCount({ imodel: testData.imodelMock.object, rulesetOrId: "1" });
      await manager.getNodesCount({ imodel: imodelMock2.object, rulesetOrId: "2" });

      // set up prev and new rulesets
      const prevRuleset = await createRandomRuleset();
      const newRuleset = { ...await createRandomRuleset(), id: prevRuleset.id };
      const newRegisteredRuleset = new RegisteredRuleset(newRuleset, "", () => { });
      rulesetsManagerMock.setup((x) => x.get(newRuleset.id)).returns(async () => newRegisteredRuleset);

      // set up rpc requests handler
      const compareOptions1: PresentationDataCompareOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        prev: {
          rulesetOrId: prevRuleset,
        },
        rulesetOrId: newRuleset,
      };
      const compareOptions2: PresentationDataCompareOptions<IModelConnection> = {
        imodel: imodelMock2.object,
        prev: {
          rulesetOrId: prevRuleset,
        },
        rulesetOrId: newRuleset,
      };
      const compareResult1: PartialHierarchyModificationJSON[] = [{
        type: "Delete",
        node: createRandomECInstancesNodeJSON(),
      }, {
        type: "Insert",
        node: createRandomECInstancesNodeJSON(),
        position: 123,
      }, {
        type: "Update",
        node: createRandomECInstancesNodeJSON(),
        changes: [],
      }];
      const compareResult2: PartialHierarchyModificationJSON[] = [];
      rpcRequestsHandlerMock.setup((x) => x.compareHierarchies(prepareOptions(compareOptions1))).returns(async () => compareResult1).verifiable(moq.Times.once());
      rpcRequestsHandlerMock.setup((x) => x.compareHierarchies(prepareOptions(compareOptions2))).returns(async () => compareResult2).verifiable(moq.Times.once());

      // add hierarchy modification listener
      const onHierarchyUpdateSpy = sinon.spy();
      manager.onHierarchyUpdate.addListener(onHierarchyUpdateSpy);

      // trigger ruleset modification
      await triggerRulesetModification(newRegisteredRuleset, prevRuleset);

      // confirm hierarchies got compared and appropriate events raised
      rpcRequestsHandlerMock.verifyAll();
      expect(onHierarchyUpdateSpy).to.be.calledTwice;
      expect(onHierarchyUpdateSpy.firstCall).to.be.calledWith(newRegisteredRuleset, compareResult1.map(PartialHierarchyModification.fromJSON));
      expect(onHierarchyUpdateSpy.secondCall).to.be.calledWith(newRegisteredRuleset, compareResult2.map(PartialHierarchyModification.fromJSON));
    });

    it("ignores cancelled comparison exceptions", async () => {
      // init imodel connection
      rpcRequestsHandlerMock.setup((x) => x.getNodesCount(moq.It.isAny(), undefined)).returns(async () => 0);
      await manager.getNodesCount({ imodel: testData.imodelMock.object, rulesetOrId: "1" });

      // set up prev and new rulesets
      const prevRuleset = await createRandomRuleset();
      const newRuleset = { ...await createRandomRuleset(), id: prevRuleset.id };
      const newRegisteredRuleset = new RegisteredRuleset(newRuleset, "", () => { });
      rulesetsManagerMock.setup((x) => x.get(newRuleset.id)).returns(async () => newRegisteredRuleset);

      // set up rpc requests handler
      rpcRequestsHandlerMock.setup((x) => x.compareHierarchies(moq.It.isAny())).returns(() => Promise.reject(new PresentationError(PresentationStatus.Canceled)));

      // add hierarchy modification listener
      const onHierarchyUpdateSpy = sinon.spy();
      manager.onHierarchyUpdate.addListener(onHierarchyUpdateSpy);

      // trigger ruleset modification
      await triggerRulesetModification(newRegisteredRuleset, prevRuleset);

      // confirm hierarchies got compared and no events were raised
      rpcRequestsHandlerMock.verifyAll();
      expect(onHierarchyUpdateSpy).to.not.be.called;
    });

    it("throws on comparison exception", async () => {
      // init imodel connection
      rpcRequestsHandlerMock.setup((x) => x.getNodesCount(moq.It.isAny(), undefined)).returns(async () => 0);
      await manager.getNodesCount({ imodel: testData.imodelMock.object, rulesetOrId: "1" });

      // set up prev and new rulesets
      const prevRuleset = await createRandomRuleset();
      const newRuleset = { ...await createRandomRuleset(), id: prevRuleset.id };
      const newRegisteredRuleset = new RegisteredRuleset(newRuleset, "", () => { });
      rulesetsManagerMock.setup((x) => x.get(newRuleset.id)).returns(async () => newRegisteredRuleset);

      // set up rpc requests handler
      rpcRequestsHandlerMock.setup((x) => x.compareHierarchies(moq.It.isAny())).returns(() => Promise.reject(new PresentationError(PresentationStatus.Error)));

      // add hierarchy modification listener
      const onHierarchyUpdateSpy = sinon.spy();
      manager.onHierarchyUpdate.addListener(onHierarchyUpdateSpy);

      // trigger ruleset modification
      expect(triggerRulesetModification(newRegisteredRuleset, prevRuleset)).to.eventually.be.rejectedWith(PresentationError);

      // confirm hierarchies got compared and no events were raised
      rpcRequestsHandlerMock.verifyAll();
      expect(onHierarchyUpdateSpy).to.not.be.called;
    });

  });

  describe("activeLocale", () => {

    it("requests with manager's locale if not set in request options", async () => {
      const locale = faker.random.locale();
      manager.activeLocale = locale;
      await manager.getNodesCount({
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      });
      rpcRequestsHandlerMock.verify((x) => x.getNodesCount({
        imodel: testData.imodelToken,
        rulesetOrId: testData.rulesetId,
        locale,
        rulesetVariables: [],
      }, undefined), moq.Times.once());
    });

    it("requests with request's locale if set", async () => {
      const locale = faker.random.locale();
      manager.activeLocale = faker.random.locale();
      expect(manager.activeLocale).to.not.eq(locale);
      await manager.getNodesCount({
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        locale,
      });
      rpcRequestsHandlerMock.verify((x) => x.getNodesCount({
        imodel: testData.imodelToken,
        rulesetOrId: testData.rulesetId,
        locale,
        rulesetVariables: [],
      }, undefined), moq.Times.once());
    });

  });

  describe("activeUnitSystem", () => {

    it("requests with manager's unit system if not set in request options", async () => {
      const keys = new KeySet();
      const unitSystem = PresentationUnitSystem.UsSurvey;
      manager.activeUnitSystem = unitSystem;
      await manager.getContentDescriptor({
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      }, "", keys, undefined);
      rpcRequestsHandlerMock.verify((x) => x.getContentDescriptor({
        imodel: testData.imodelToken,
        rulesetOrId: testData.rulesetId,
        unitSystem,
        rulesetVariables: [],
      }, "", keys.toJSON(), undefined), moq.Times.once());
    });

    it("requests with request's locale if set", async () => {
      const keys = new KeySet();
      const unitSystem = PresentationUnitSystem.UsSurvey;
      manager.activeUnitSystem = PresentationUnitSystem.Metric;
      await manager.getContentDescriptor({
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        unitSystem,
      }, "", keys, undefined);
      rpcRequestsHandlerMock.verify((x) => x.getContentDescriptor({
        imodel: testData.imodelToken,
        rulesetOrId: testData.rulesetId,
        unitSystem,
        rulesetVariables: [],
      }, "", keys.toJSON(), undefined), moq.Times.once());
    });

  });

  describe("rulesets", () => {

    it("returns rulesets manager provided through props", () => {
      const rulesets = manager.rulesets();
      expect(rulesets).to.eq(rulesetsManagerMock.object);
    });

    it("returns an instance of `RulesetManagerImpl` if not provided through props", () => {
      rulesetManagerCreateStub.restore();
      manager = PresentationManager.create();
      const rulesets = manager.rulesets();
      expect(rulesets).to.be.instanceOf(RulesetManagerImpl);
    });

  });

  describe("vars", () => {

    it("returns ruleset variables manager", () => {
      const vars = manager.vars(testData.rulesetId);
      expect(vars).to.be.instanceOf(RulesetVariablesManagerImpl);

      const vars2 = manager.vars(testData.rulesetId);
      expect(vars2).to.equal(vars);
    });

  });

  describe("getNodesAndCount", () => {

    it("requests root nodes from proxy", async () => {
      const result = { nodes: [createRandomECInstancesNode(), createRandomECInstancesNode()], count: 2 };
      const options: Paged<HierarchyRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      rpcRequestsHandlerMock
        .setup((x) => x.getNodesAndCount(prepareOptions(options), undefined))
        .returns(async () => ({ ...result, nodes: result.nodes.map(Node.toJSON) }))
        .verifiable();
      const actualResult = await manager.getNodesAndCount(options);
      expect(actualResult).to.deep.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests child nodes from proxy", async () => {
      const parentNodeKey = createRandomECInstancesNodeKey();
      const result = { nodes: [createRandomECInstancesNode(), createRandomECInstancesNode()], count: 2 };
      const options: Paged<HierarchyRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      rpcRequestsHandlerMock
        .setup((x) => x.getNodesAndCount(prepareOptions(options), NodeKey.toJSON(parentNodeKey)))
        .returns(async () => ({ ...result, nodes: result.nodes.map(Node.toJSON) }))
        .verifiable();
      const actualResult = await manager.getNodesAndCount(options, parentNodeKey);
      expect(actualResult).to.deep.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getNodes", () => {

    it("requests root nodes from proxy", async () => {
      const result = [createRandomECInstancesNode(), createRandomECInstancesNode()];
      const options: Paged<HierarchyRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      rpcRequestsHandlerMock
        .setup((x) => x.getNodes(prepareOptions(options), undefined))
        .returns(async () => result.map(Node.toJSON))
        .verifiable();
      const actualResult = await manager.getNodes(options);
      expect(actualResult).to.deep.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests child nodes from proxy", async () => {
      const parentNodeKey = createRandomECInstancesNodeKey();
      const result = [createRandomECInstancesNode(), createRandomECInstancesNode()];
      const options: Paged<HierarchyRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      rpcRequestsHandlerMock
        .setup((x) => x.getNodes(prepareOptions(options), NodeKey.toJSON(parentNodeKey)))
        .returns(async () => result.map(Node.toJSON))
        .verifiable();
      const actualResult = await manager.getNodes(options, parentNodeKey);
      expect(actualResult).to.deep.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getNodesCount", () => {

    it("requests root nodes count from proxy", async () => {
      const result = faker.random.number();
      const options: HierarchyRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock
        .setup((x) => x.getNodesCount(prepareOptions(options), undefined))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getNodesCount(options);
      expect(actualResult).to.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests child nodes count from proxy", async () => {
      const parentNodeKey = createRandomECInstancesNodeKey();
      const result = faker.random.number();
      const options: HierarchyRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock
        .setup((x) => x.getNodesCount(prepareOptions(options), NodeKey.toJSON(parentNodeKey)))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getNodesCount(options, parentNodeKey);
      expect(actualResult).to.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getFilteredNodePaths", () => {

    it("calls getFilteredNodePaths through proxy", async () => {
      const value = [createRandomNodePathElement(0), createRandomNodePathElement(0)];
      const options: HierarchyRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock.setup((x) => x.getFilteredNodePaths(prepareOptions(options), "filter"))
        .returns(async () => value.map(NodePathElement.toJSON))
        .verifiable();
      const result = await manager.getFilteredNodePaths(options, "filter");
      expect(result).to.be.deep.equal(value);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getNodePaths", () => {

    it("calls getNodePaths through proxy", async () => {
      const value = [createRandomNodePathElement(0), createRandomNodePathElement(0)];
      const keyArray = [[createRandomECInstanceKey(), createRandomECInstanceKey()]];
      const options: HierarchyRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock.setup((x) => x.getNodePaths(prepareOptions(options), keyArray.map((k) => k.map(InstanceKey.toJSON)), 1))
        .returns(async () => value.map(NodePathElement.toJSON))
        .verifiable();
      const result = await manager.getNodePaths(options, keyArray, 1);
      expect(result).to.be.deep.equal(value);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("loadHierarchy", () => {

    it("calls loadHierarchy through proxy with default 'preload' priority", async () => {
      const options: HierarchyRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock.setup((x) => x.loadHierarchy({ ...prepareOptions(options), priority: RequestPriority.Preload }))
        .returns(() => Promise.resolve())
        .verifiable();
      await manager.loadHierarchy(options);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("calls loadHierarchy through proxy with specified priority", async () => {
      const options: HierarchyRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        priority: 999,
      };
      rpcRequestsHandlerMock.setup((x) => x.loadHierarchy({ ...prepareOptions(options), priority: 999 }))
        .returns(() => Promise.resolve())
        .verifiable();
      await manager.loadHierarchy(options);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getContentDescriptor", () => {

    it("requests descriptor from proxy and rebuilds parentship", async () => {
      const keyset = new KeySet();
      const result = createRandomDescriptor();
      const options: ContentRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock
        .setup((x) => x.getContentDescriptor(prepareOptions(options), "test", keyset.toJSON(), undefined))
        .returns(async () => result.toJSON())
        .verifiable();
      const actualResult = await manager.getContentDescriptor(options, "test", keyset, undefined);
      expect(actualResult).to.be.instanceOf(Descriptor);
      expect(actualResult!.toJSON()).to.deep.eq(result.toJSON());
      rpcRequestsHandlerMock.verifyAll();
    });

    it("handles undefined descriptor", async () => {
      const keyset = new KeySet();
      const options: ContentRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock
        .setup((x) => x.getContentDescriptor(prepareOptions(options), "test", keyset.toJSON(), undefined))
        .returns(async () => undefined)
        .verifiable();
      const actualResult = await manager.getContentDescriptor(options, "test", keyset, undefined);
      rpcRequestsHandlerMock.verifyAll();
      expect(actualResult).to.be.undefined;
    });

  });

  describe("getContentSetSize", () => {

    it("requests content set size from proxy", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const result = faker.random.number();
      const options: ContentRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock
        .setup((x) => x.getContentSetSize(prepareOptions(options), moq.deepEquals(descriptor.createStrippedDescriptor()), keyset.toJSON()))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getContentSetSize(options, descriptor, keyset);
      expect(actualResult).to.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests content set size from proxy when descriptor overrides are passed instead of descriptor", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const overrides = descriptor.createDescriptorOverrides();
      const result = faker.random.number();
      const options: ContentRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getContentSetSize(prepareOptions(options), overrides, keyset.toJSON()))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getContentSetSize(options, overrides, keyset);
      expect(actualResult).to.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getContent", () => {

    it("requests content from proxy", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const result = new Content(descriptor, []);
      const options: Paged<ContentRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getContent(prepareOptions(options), moq.deepEquals(descriptor.createStrippedDescriptor()), keyset.toJSON()))
        .returns(async () => result.toJSON())
        .verifiable();
      const actualResult = await manager.getContent(options, descriptor, keyset);
      expect(actualResult).to.be.instanceOf(Content);
      expect(actualResult!.descriptor).to.be.instanceOf(Descriptor);
      expect(actualResult!.toJSON()).to.deep.eq(result.toJSON());
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests content from proxy when descriptor overrides are passed instead of descriptor", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const overrides = descriptor.createDescriptorOverrides();
      const result = new Content(descriptor, []);
      const options: Paged<ContentRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getContent(prepareOptions(options), overrides, keyset.toJSON()))
        .returns(async () => result.toJSON())
        .verifiable();
      const actualResult = await manager.getContent(options, overrides, keyset);
      expect(actualResult).to.be.instanceOf(Content);
      expect(actualResult!.descriptor).to.be.instanceOf(Descriptor);
      expect(actualResult!.toJSON()).to.deep.eq(result.toJSON());
      rpcRequestsHandlerMock.verifyAll();
    });

    it("handles case when response has no content", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const options: Paged<ContentRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getContent(prepareOptions(options), moq.deepEquals(descriptor.createStrippedDescriptor()), keyset.toJSON()))
        .returns(async () => undefined)
        .verifiable();
      const actualResult = await manager.getContent(options, descriptor, keyset);
      expect(actualResult).to.be.undefined;
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getContentAndContentSize", () => {

    it("requests content and contentSize from proxy", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const result = {
        content: new Content(descriptor, []),
        size: 0,
      };
      const options: Paged<ContentRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getContentAndSize(prepareOptions(options), moq.deepEquals(descriptor.createStrippedDescriptor()), keyset.toJSON()))
        .returns(async () => ({ ...result, content: result.content.toJSON() }))
        .verifiable();
      const actualResult = await manager.getContentAndSize(options, descriptor, keyset);
      expect(actualResult).to.deep.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests content and content set size from proxy when descriptor overrides are passed instead of descriptor", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const overrides = descriptor.createDescriptorOverrides();
      const result = {
        content: new Content(descriptor, []),
        size: 0,
      };
      const options: Paged<ContentRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getContentAndSize(prepareOptions(options), overrides, keyset.toJSON()))
        .returns(async () => ({ ...result, content: result.content.toJSON() }))
        .verifiable();
      const actualResult = await manager.getContentAndSize(options, overrides, keyset);
      expect(actualResult).to.deep.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("handles case when response has no content", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const result = {
        content: undefined,
        size: 0,
      };
      const options: Paged<ContentRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getContentAndSize(prepareOptions(options), moq.deepEquals(descriptor.createStrippedDescriptor()), keyset.toJSON()))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getContentAndSize(options, descriptor, keyset);
      expect(actualResult).to.be.undefined;
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getDistinctValues", () => {

    it("requests distinct values", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const fieldName = faker.random.word();
      const maximumValueCount = faker.random.number();
      const result = [faker.random.word(), faker.random.word()];
      const options: ContentRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock
        .setup((x) => x.getDistinctValues(prepareOptions(options),
          moq.deepEquals(descriptor.createStrippedDescriptor().toJSON()),
          moq.deepEquals(keyset.toJSON()), fieldName, maximumValueCount))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getDistinctValues(options, descriptor, keyset, fieldName, maximumValueCount);
      rpcRequestsHandlerMock.verifyAll();
      expect(actualResult).to.deep.eq(result);
    });

    it("passes 0 for maximumValueCount by default", async () => {
      const options: ContentRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock
        .setup((x) => x.getDistinctValues(moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAnyString(), 0))
        .verifiable();
      await manager.getDistinctValues(options, createRandomDescriptor(), new KeySet(), "");
      rpcRequestsHandlerMock.verifyAll();
    });
  });

  describe("getDisplayLabelDefinition", () => {

    it("requests display label definition", async () => {
      const key = createRandomECInstanceKey();
      const result = createRandomLabelDefinition();
      const options: LabelRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getDisplayLabelDefinition(toIModelTokenOptions(options), key))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getDisplayLabelDefinition(options, key);
      expect(actualResult).to.deep.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getDisplayLabelDefinitions", () => {

    it("requests display labels definitions", async () => {
      const keys = [createRandomECInstanceKey(), createRandomECInstanceKey()];
      const result = [createRandomLabelDefinition(), createRandomLabelDefinition()];
      const options: LabelRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getDisplayLabelDefinitions(toIModelTokenOptions(options), keys))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getDisplayLabelDefinitions(options, keys);
      expect(actualResult).to.deep.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("options handling", () => {

    let testRuleset: Ruleset;
    let testRulesetVariable: RulesetVariable;

    beforeEach(async () => {
      testRuleset = await createRandomRuleset();
      rulesetsManagerMock.setup((x) => x.get(testRuleset.id)).returns(async () => new RegisteredRuleset(testRuleset, "", () => { }));
      testRulesetVariable = { id: faker.random.word(), type: VariableValueTypes.String, value: faker.random.word() };
      await manager.vars(testRuleset.id).setString(testRulesetVariable.id, testRulesetVariable.value as string);
    });

    it("adds ruleset to the options", async () => {
      const options: Paged<HierarchyRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        paging: testData.pageOptions,
        rulesetOrId: testRuleset.id,
      };
      const expectedOptions = { ...options, rulesetOrId: testRuleset, rulesetVariables: [testRulesetVariable] };
      rpcRequestsHandlerMock
        .setup((x) => x.getNodesCount(toIModelTokenOptions(expectedOptions), undefined))
        .returns(async () => 0)
        .verifiable();
      await manager.getNodesCount(options);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("leaves ruleset in the options if already provided", async () => {
      const options: Paged<HierarchyRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testRuleset,
        paging: testData.pageOptions,
      };

      const expectedOptions = { ...options, rulesetOrId: testRuleset, rulesetVariables: [testRulesetVariable] };

      rpcRequestsHandlerMock
        .setup((x) => x.getNodesCount(toIModelTokenOptions(expectedOptions), undefined))
        .returns(async () => 0)
        .verifiable();
      await manager.getNodesCount(options);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("adds empty values if ruleset and rulesetId is not provided", async () => {
      const options: Paged<HierarchyRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        paging: testData.pageOptions,
        rulesetOrId: "",
      };
      const expectedOptions = { ...options, rulesetVariables: [] };
      rpcRequestsHandlerMock
        .setup((x) => x.getNodesCount(toIModelTokenOptions(expectedOptions), undefined))
        .returns(async () => 0)
        .verifiable();
      await manager.getNodesCount(options);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("appends ruleset variables from ruleset variables manager", async () => {
      const rulesetVariable = { id: faker.random.word(), type: VariableValueTypes.String, value: faker.random.word() };
      const options: Paged<HierarchyRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        paging: testData.pageOptions,
        rulesetOrId: testRuleset,
        rulesetVariables: [rulesetVariable],
      };

      const expectedOptions = { ...options, rulesetOrId: testRuleset, rulesetVariables: [rulesetVariable, testRulesetVariable] };

      rpcRequestsHandlerMock
        .setup((x) => x.getNodesCount(toIModelTokenOptions(expectedOptions), undefined))
        .returns(async () => 0)
        .verifiable();
      await manager.getNodesCount(options);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("listening to updates", () => {

    let eventSourceListener: (report: UpdateInfo) => void;
    let hierarchyUpdatesSpy: sinon.SinonSpy<[Ruleset, HierarchyUpdateInfo], void>;
    let contentUpdatesSpy: sinon.SinonSpy<[Ruleset, ContentUpdateInfo], void>;

    beforeEach(() => {
      sinon.stub(IModelApp, "isNativeApp").get(() => true);

      const eventSource = sinon.createStubInstance(EventSource);
      manager = PresentationManager.create({ eventSource: eventSource as unknown as EventSource });

      eventSourceListener = eventSource.on.args[0][2];
      expect(eventSourceListener).to.not.be.undefined;

      hierarchyUpdatesSpy = sinon.spy() as any;
      manager.onHierarchyUpdate.addListener(hierarchyUpdatesSpy);

      contentUpdatesSpy = sinon.spy() as any;
      manager.onContentUpdate.addListener(contentUpdatesSpy);
    });

    it("triggers appropriate hierarchy and content events on update event", async () => {
      const ruleset1: Ruleset = { id: "1", rules: [] };
      const ruleset2: Ruleset = { id: "2", rules: [] };
      const ruleset3: Ruleset = { id: "3", rules: [] };
      const ruleset4: Ruleset = { id: "4", rules: [] };
      rulesetsManagerMock.setup((x) => x.get(ruleset1.id)).returns(async () => new RegisteredRuleset(ruleset1, "", () => { }));
      rulesetsManagerMock.setup((x) => x.get(ruleset2.id)).returns(async () => new RegisteredRuleset(ruleset2, "", () => { }));
      rulesetsManagerMock.setup((x) => x.get(ruleset3.id)).returns(async () => new RegisteredRuleset(ruleset3, "", () => { }));
      rulesetsManagerMock.setup((x) => x.get(ruleset4.id)).returns(async () => undefined);

      const report: UpdateInfo = {
        [ruleset1.id]: {
          hierarchy: "FULL",
          content: "FULL",
        },
        [ruleset2.id]: {
          hierarchy: [],
        },
        [ruleset3.id]: {
          content: "FULL",
        },
        [ruleset4.id]: {},
      };
      eventSourceListener(report);

      // workaround for a floating promise...
      await BeDuration.wait(1);

      expect(hierarchyUpdatesSpy).to.be.calledTwice;
      expect(hierarchyUpdatesSpy.firstCall).to.be.calledWith(sinon.match((r) => r.id === ruleset1.id), "FULL");
      expect(hierarchyUpdatesSpy.secondCall).to.be.calledWith(sinon.match((r) => r.id === ruleset2.id), []);

      expect(contentUpdatesSpy).to.be.calledTwice;
      expect(contentUpdatesSpy.firstCall).to.be.calledWith(sinon.match((r) => r.id === ruleset1.id), "FULL");
      expect(contentUpdatesSpy.secondCall).to.be.calledWith(sinon.match((r) => r.id === ruleset3.id), "FULL");
    });

  });

});
