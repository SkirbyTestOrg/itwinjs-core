/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { spy } from "@helpers/Spies";
import { BeEvent } from "@bentley/bentleyjs-core";
import { RpcManager } from "@bentley/imodeljs-common";
import { IModelHost } from "@bentley/imodeljs-backend";
import { ECPresentationError } from "@common/Error";
import ECPresentation from "@src/ECPresentation";
import ECPresentationManager from "@src/ECPresentationManager";
import "./IModeHostSetup";

describe("ECPresentation", () => {

  afterEach(() => {
    ECPresentation.terminate();
  });

  describe("initialize", () => {

    it("registers rpc implementation", () => {
      const registerSpy = spy.on(RpcManager, RpcManager.registerImpl.name);
      ECPresentation.initialize();
      expect(registerSpy).to.be.called();
    });

    it("registers itself as IModelHost shutdown listener", () => {
      const addListenerSpy = spy.on(IModelHost.onBeforeShutdown, BeEvent.prototype.addListener.name);
      ECPresentation.initialize();
      expect(addListenerSpy).to.be.called();
    });

    it("creates a manager instance", () => {
      expect(() => ECPresentation.manager).to.throw(ECPresentationError);
      ECPresentation.initialize();
      expect(ECPresentation.manager).to.be.instanceof(ECPresentationManager);
    });

  });

  describe("terminate", () => {

    it("resets manager instance", () => {
      ECPresentation.initialize();
      expect(ECPresentation.manager).to.be.not.null;
      ECPresentation.terminate();
      expect(() => ECPresentation.manager).to.throw(ECPresentationError);
    });

  });

  describe("setManager", () => {

    it("disposes and overwrites manager instance", () => {
      ECPresentation.initialize();
      const otherManager = new ECPresentationManager();
      const disposeSpy = spy.on(ECPresentation.manager, ECPresentationManager.prototype.dispose.name);
      expect(ECPresentation.manager).to.be.not.null;
      expect(ECPresentation.manager).to.not.eq(otherManager);
      ECPresentation.setManager(otherManager);
      expect(ECPresentation.manager).to.eq(otherManager);
      expect(disposeSpy).to.be.called();
    });

  });

});
