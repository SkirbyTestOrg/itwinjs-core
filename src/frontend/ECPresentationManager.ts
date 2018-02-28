/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { NavNode, NavNodeKeyPath, NavNodePathElement } from "@bentley/ecpresentation-common/lib/Hierarchy";
import { SelectionInfo, Descriptor, Content } from "@bentley/ecpresentation-common/lib/content";
import { rebuildParentship } from "@bentley/ecpresentation-common/lib/content/Descriptor";
import { ChangedECInstanceInfo, ECInstanceChangeResult } from "@bentley/ecpresentation-common/lib/Changes";
import { InstanceKeysList } from "@bentley/ecpresentation-common/lib/EC";
import { PageOptions, ECPresentationManager as ECPInterface } from "@bentley/ecpresentation-common/lib/ECPresentationManager";
import ECPresentationGateway from "./ECPresentationGateway";
import { IModelToken } from "@bentley/imodeljs-common/lib/IModel";

class ECPresentationManager implements ECPInterface {
  public async getRootNodes(token: IModelToken, pageOptions: PageOptions, options: object): Promise<Array<Readonly<NavNode>>> {
    return await ECPresentationGateway.getProxy().getRootNodes(token, pageOptions, options);
  }

  public async getRootNodesCount(token: IModelToken, options: object): Promise<number> {
    return await ECPresentationGateway.getProxy().getRootNodesCount(token, options);
  }

  public async getChildren(token: IModelToken, parent: NavNode, pageOptions: PageOptions, options: object): Promise<Array<Readonly<NavNode>>> {
    return await ECPresentationGateway.getProxy().getChildren(token, parent, pageOptions, options);
  }

  public async getChildrenCount(token: IModelToken, parent: NavNode, options: object): Promise<number> {
    return await ECPresentationGateway.getProxy().getChildrenCount(token, parent, options);
  }

  public async getNodePaths(token: IModelToken, paths: NavNodeKeyPath[], markedIndex: number, options: object): Promise<Array<Readonly<NavNodePathElement>>> {
    return await ECPresentationGateway.getProxy().getNodePaths(token, paths, markedIndex, options);
  }

  public async getFilteredNodesPaths(token: IModelToken, filterText: string, options: object): Promise<Array<Readonly<NavNodePathElement>>> {
    return await ECPresentationGateway.getProxy().getFilteredNodesPaths(token, filterText, options);
  }

  public async getContentDescriptor(token: IModelToken, displayType: string, keys: InstanceKeysList, selection: SelectionInfo | undefined, options: object): Promise<Readonly<Descriptor>> {
    const descriptor = await ECPresentationGateway.getProxy().getContentDescriptor(token, displayType, keys, selection, options);
    if (descriptor)
      rebuildParentship(descriptor);
    return descriptor;
  }

  private getStrippedDescriptor(descriptor: Descriptor): Descriptor {
    // strips unnecessary data from the descriptor so it's less heavy for transportation
    // over the gateway
    return { ...descriptor, fields: [], selectClasses: [] };
  }

  public async getContentSetSize(token: IModelToken, descriptor: Descriptor, keys: InstanceKeysList, options: object): Promise<number> {
    return await ECPresentationGateway.getProxy().getContentSetSize(token, this.getStrippedDescriptor(descriptor), keys, options);
  }

  public async getContent(token: IModelToken, descriptor: Descriptor, keys: InstanceKeysList, pageOptions: PageOptions, options: object): Promise<Readonly<Content>> {
    const content = await ECPresentationGateway.getProxy().getContent(token, this.getStrippedDescriptor(descriptor), keys, pageOptions, options);
    rebuildParentship(content.descriptor);
    return content;
  }

  public async getDistinctValues(token: IModelToken, displayType: string, fieldName: string, maximumValueCount: number, options: object): Promise<string[]> {
    return await ECPresentationGateway.getProxy().getDistinctValues(token, displayType, fieldName, maximumValueCount, options);
  }

  public async saveValueChange(token: IModelToken, instancesInfo: ChangedECInstanceInfo[], propertyAccessor: string, value: any, options: object): Promise<Array<Readonly<ECInstanceChangeResult>>> {
    return await ECPresentationGateway.getProxy().saveValueChange(token, instancesInfo, propertyAccessor, value, options);
  }
}

export default ECPresentationManager;
