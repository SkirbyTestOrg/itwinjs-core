/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/* tslint:disable:no-direct-imports */

import { expect } from "chai";
import * as sinon from "sinon";
import * as faker from "faker";
import { createRandomRuleset } from "@bentley/presentation-common/lib/test/_helpers/random";
import RulesetManager from "../RulesetManager";

describe("RulesetManager", () => {

  let manager: RulesetManager;

  beforeEach(() => {
    manager = new RulesetManager();
  });

  describe("[get] state", () => {

    beforeEach(() => {
      manager = new RulesetManager();
    });

    it("returns empty list when manager has no rulesets", async () => {
      expect(manager.state).to.deep.eq([]);
    });

    it("returns a list of registered rulesets", async () => {
      const rulesets = await Promise.all([createRandomRuleset(), createRandomRuleset()]);
      await Promise.all(rulesets.map((r) => manager.add(r)));
      expect(manager.state).to.deep.eq(rulesets);
    });

  });

  describe("get", () => {

    it("returns undefined when ruleset is not registered", async () => {
      expect(await manager.get(faker.random.word())).to.be.undefined;
    });

    it("returns registered ruleset", async () => {
      const ruleset = await createRandomRuleset();
      const added = await manager.add(ruleset);
      const result = await manager.get(ruleset.id);
      expect(result).to.not.be.undefined;
      expect(result!.toJSON()).to.deep.eq(ruleset);
      expect(result!.uniqueIdentifier).to.eq(added.uniqueIdentifier);
    });

  });

  describe("add", () => {

    it("registers a ruleset and raises onStateChanged event", async () => {
      const eventSpy = sinon.spy(manager.onStateChanged, "raiseEvent");
      const ruleset = await createRandomRuleset();
      await manager.add(ruleset);
      expect((await manager.get(ruleset.id))!.toJSON()).to.deep.eq(ruleset);
      expect(eventSpy).to.be.calledOnce;
    });

    it("allows registering 2 rulesets with the same id", async () => {
      const eventSpy = sinon.spy(manager.onStateChanged, "raiseEvent");
      const rulesetId = faker.random.uuid();
      const rulesets = [await createRandomRuleset(), await createRandomRuleset()];
      await Promise.all(rulesets.map((r) => {
        r.id = rulesetId;
        return manager.add(r);
      }));
      expect(eventSpy).to.be.calledTwice;
    });

  });

  describe("remove", () => {

    it("does nothing if ruleset with the specified id is not registered", async () => {
      const eventSpy = sinon.spy(manager.onStateChanged, "raiseEvent");
      expect(await manager.remove([faker.random.uuid(), faker.random.uuid()])).to.be.false;
      expect(eventSpy).to.not.be.called;
    });

    it("does nothing if ruleset with the specified uniqueIdentifier is not registered", async () => {
      const ruleset = await createRandomRuleset();
      await manager.add(ruleset);
      const eventSpy = sinon.spy(manager.onStateChanged, "raiseEvent");
      expect(await manager.remove([ruleset.id, faker.random.uuid()])).to.be.false;
      expect(eventSpy).to.not.be.called;
    });

    it("removes ruleset with [id, uniqueIdentifier] argument", async () => {
      const ruleset = await createRandomRuleset();
      const registered = await manager.add(ruleset);
      const eventSpy = sinon.spy(manager.onStateChanged, "raiseEvent");
      expect(await manager.get(ruleset.id)).to.not.be.undefined;
      expect(await manager.remove([ruleset.id, registered.uniqueIdentifier])).to.be.true;
      expect(await manager.get(ruleset.id)).to.be.undefined;
      expect(eventSpy).to.be.calledOnce;
    });

    it("removes ruleset with RegisteredRuleset argument", async () => {
      const ruleset = await createRandomRuleset();
      const registered = await manager.add(ruleset);
      const eventSpy = sinon.spy(manager.onStateChanged, "raiseEvent");
      expect(await manager.get(ruleset.id)).to.not.be.undefined;
      expect(await manager.remove(registered)).to.be.true;
      expect(await manager.get(ruleset.id)).to.be.undefined;
      expect(eventSpy).to.be.calledOnce;
    });

  });

  describe("clear", () => {

    it("clears only if there are rulesets", async () => {
      const eventSpy = sinon.spy(manager.onStateChanged, "raiseEvent");
      await manager.clear();
      expect(eventSpy).to.not.be.called;
    });

    it("clears rulesets", async () => {
      const ruleset = await createRandomRuleset();
      await manager.add(ruleset);
      const eventSpy = sinon.spy(manager.onStateChanged, "raiseEvent");
      await manager.clear();
      expect(eventSpy).to.be.calledOnce;
    });

  });

  describe("dispose", () => {

    it("disposes registered ruleset for add result", async () => {
      const ruleset = await createRandomRuleset();
      const result = await manager.add(ruleset);
      const eventSpy = sinon.spy(manager, "remove");

      result.dispose();
      expect(eventSpy).to.have.been.calledOnce;
    });
  });
});
