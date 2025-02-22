/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { useResizeDetector } from "react-resize-detector";
import { PropertyRecord } from "@itwin/appui-abstract";
import {
  ControlledTree, DelayLoadedTreeNodeItem, EditableTreeDataProvider, SelectionMode, SimpleTreeDataProvider, SimpleTreeDataProviderHierarchy,
  TreeModelNode, TreeNodeItem, useTreeEventsHandler, useTreeModel, useTreeModelSource, useTreeNodeLoader,
} from "@itwin/components-react";
import { ConfigurableCreateInfo, ConfigurableUiManager, ContentControl } from "@itwin/appui-react";
import { Select, SelectOption } from "@itwin/itwinui-react";

export class TreeExampleContentControl extends ContentControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this.reactNode = <TreeExampleContent />;
  }
}

class EditableSimpleTreeDataProvider extends SimpleTreeDataProvider implements EditableTreeDataProvider {
  public updateLabel(nodeItem: TreeNodeItem, newLabel: string): void {
    nodeItem.label = PropertyRecord.fromString(newLabel);
    this.onTreeNodeChanged.raiseEvent([nodeItem]);
  }
}

function TreeExampleContent() {
  const [selectionMode, setSelectionMode] = React.useState(SelectionMode.Single);
  const onChangeSelectionMode = React.useCallback((newValue: SelectionMode) => {
    setSelectionMode(newValue);
  }, []);

  const dataProvider = React.useMemo(() => {
    const hierarchy = new Map();
    createNodes(5, "A", 3, hierarchy);
    return new EditableSimpleTreeDataProvider(hierarchy);
  }, []);
  const modelSource = useTreeModelSource(dataProvider);
  const nodeLoader = useTreeNodeLoader(dataProvider, modelSource);
  const treeModel = useTreeModel(modelSource);
  const nodeUpdatedCallback = React.useCallback((node: TreeModelNode, newValue: string) => {
    modelSource.modifyModel((model) => {
      const modelNode = model.getNode(node.id);
      if (modelNode) {
        modelNode.label = modelNode.item.label = PropertyRecord.fromString(newValue);
      }
    });
  }, [modelSource]);
  const eventsHandler = useTreeEventsHandler(React.useMemo(() => ({
    modelSource,
    nodeLoader,
    editingParams: {
      onNodeUpdated: nodeUpdatedCallback,
    },
  }), [modelSource, nodeLoader, nodeUpdatedCallback]));
  const selectionModes = React.useMemo<SelectOption<SelectionMode>[]>(() => {
    return [
      { value: SelectionMode.Single, label: "Single" },
      { value: SelectionMode.SingleAllowDeselect, label: "Single Allow Deselect" },
      { value: SelectionMode.Multiple, label: "Multiple" },
      { value: SelectionMode.Extended, label: "Extended" },
    ];
  }, []);
  const { width, height, ref } = useResizeDetector();

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexFlow: "column" }}>
      <div style={{ marginBottom: "4px", width: "200px" }}>
        <Select onChange={onChangeSelectionMode} value={selectionMode} title="Selection Mode" options={selectionModes} size="small" />
      </div>
      <div ref={ref} style={{ flex: "1", height: "calc(100% - 22px)", width: "100%" }}>
        {width && height ? <ControlledTree
          nodeLoader={nodeLoader}
          model={treeModel}
          selectionMode={selectionMode}
          eventsHandler={eventsHandler}
          width={width}
          height={height}
        /> : null}
      </div>
    </div >
  );
}

const createNodes = (n: number, label: string, levels: number, hierarchy: SimpleTreeDataProviderHierarchy, parentId?: string) => {
  if (levels < 0)
    return;
  const nodes: DelayLoadedTreeNodeItem[] = [];
  for (let i = 0; i < n; i++) {
    const nodeLabel = `${label}-${i.toString()}`;
    nodes[i] = {
      id: nodeLabel,
      label: PropertyRecord.fromString(nodeLabel),
      hasChildren: levels > 1,
      description: `${nodeLabel} description`,
      parentId,
      isEditable: true,
    };
    createNodes(n, nodeLabel, levels - 1, hierarchy, nodeLabel);
  }
  hierarchy.set(parentId, nodes);
};

ConfigurableUiManager.registerControl("TreeExampleContent", TreeExampleContentControl);
