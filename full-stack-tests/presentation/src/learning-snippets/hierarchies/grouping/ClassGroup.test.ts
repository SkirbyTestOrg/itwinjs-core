/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { IModelConnection, SnapshotConnection } from "@itwin/core-frontend";
import { ChildNodeSpecificationTypes, GroupingSpecificationTypes, Ruleset, RuleTypes, StandardNodeTypes } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { initialize, terminate } from "../../../IntegrationTests";
import { printRuleset } from "../../Utils";

describe("Learning Snippets", () => {

  let imodel: IModelConnection;

  beforeEach(async () => {
    await initialize();
    imodel = await SnapshotConnection.openFile("assets/datasets/Properties_60InstancesWithUrl2.ibim");
  });

  afterEach(async () => {
    await imodel.close();
    await terminate();
  });

  describe("Hierarchy Grouping", () => {

    describe("ClassGroup", () => {

      it("uses `baseClass` attribute", async () => {
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Grouping.ClassGroup.BaseClass.Ruleset
        // The ruleset contains a root nodes rule for `bis.Element` instances and a grouping rule that puts
        // all `bis.PhysicalElement` instances into a class group.
        const ruleset: Ruleset = {
          id: "example",
          rules: [{
            ruleType: RuleTypes.RootNodes,
            specifications: [{
              specType: ChildNodeSpecificationTypes.InstanceNodesOfSpecificClasses,
              classes: { schemaName: "BisCore", classNames: ["Element"], arePolymorphic: true },
              groupByClass: false,
              groupByLabel: false,
            }],
            customizationRules: [{
              ruleType: RuleTypes.Grouping,
              class: { schemaName: "BisCore", className: "Element" },
              groups: [{
                specType: GroupingSpecificationTypes.Class,
                baseClass: { schemaName: "BisCore", className: "PhysicalElement" },
              }],
            }],
          }],
        };
        // __PUBLISH_EXTRACT_END__
        printRuleset(ruleset);

        // Confirm there's a class grouping node for PhysicalElement
        const nodes = await Presentation.presentation.getNodes({ imodel, rulesetOrId: ruleset });
        expect(nodes).to.have.lengthOf(43).and.to.containSubset([{
          key: {
            type: StandardNodeTypes.ECClassGroupingNode,
            className: "BisCore:PhysicalElement",
            groupedInstancesCount: 62,
          },
        }]);
      });

    });

  });

});
