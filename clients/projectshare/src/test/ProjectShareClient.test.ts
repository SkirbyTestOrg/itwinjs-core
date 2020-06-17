/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as chai from "chai";
import { Guid, GuidString } from "@bentley/bentleyjs-core";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { ProjectShareClient, ProjectShareFile, ProjectShareFileQuery, ProjectShareFolder, ProjectShareFolderQuery } from "../ProjectShareClient";
import { TestConfig } from "./TestConfig";

chai.should();

/**
 * Project Share Client API TODOs:
 * + Add an id field, and replace all wsgIds with ids - including parentFolderWsgId
 */

describe("ProjectShareClient (#integration)", () => {
  const projectShareClient: ProjectShareClient = new ProjectShareClient();
  let projectId: GuidString;

  let requestContext: AuthorizedClientRequestContext;

  before(async () => {
    requestContext = await TestConfig.getAuthorizedClientRequestContext();

    const project = await TestConfig.queryProject(requestContext, "iModelJsIntegrationTest");
    projectId = project.wsgId;
  });

  it("should be able to query folders with different options", async () => {
    // inRootFolder
    let folders: ProjectShareFolder[] = await projectShareClient.getFolders(requestContext, projectId, new ProjectShareFolderQuery().inRootFolder(projectId));
    chai.assert.strictEqual(2, folders.length);
    const folder360Images = folders[0];
    chai.assert.strictEqual(folder360Images.name, "360-Images");

    // inFolder
    folders = await projectShareClient.getFolders(requestContext, projectId, new ProjectShareFolderQuery().inFolder(folder360Images.wsgId));
    chai.assert.strictEqual(2, folders.length);
    let folder2A = folders[0];
    let folder2B = folders[1];
    chai.assert.strictEqual(folder2B.name, "2B");
    chai.assert.strictEqual(folder2A.name, "2A");

    // byWsgIds
    folders = await projectShareClient.getFolders(requestContext, projectId, new ProjectShareFolderQuery().byWsgIds(folder2B.wsgId, folder2A.wsgId));
    chai.assert.strictEqual(2, folders.length);
    chai.assert.strictEqual(folder2B.wsgId, folders[0].wsgId);
    chai.assert.strictEqual(folder2A.wsgId, folders[1].wsgId);

    // inPath
    folders = await projectShareClient.getFolders(requestContext, projectId, new ProjectShareFolderQuery().inPath(projectId, "360-Images"));
    chai.assert.strictEqual(2, folders.length);
    folder2A = folders[0];
    folder2B = folders[1];
    chai.assert.strictEqual(folder2B.name, "2B");
    chai.assert.strictEqual(folder2A.name, "2A");

    // inFolderWithNameLike
    folders = await projectShareClient.getFolders(requestContext, projectId, new ProjectShareFolderQuery().inFolderWithNameLike(folder360Images.wsgId, "2*"));
    chai.assert.strictEqual(2, folders.length);
    folder2A = folders[0];
    folder2B = folders[1];
    chai.assert.strictEqual(folder2B.name, "2B");
    chai.assert.strictEqual(folder2A.name, "2A");

    // startsWithPathAndNameLike
    folders = await projectShareClient.getFolders(requestContext, projectId, new ProjectShareFolderQuery().startsWithPathAndNameLike(projectId, "360-Images", "2A"));
    chai.assert.strictEqual(1, folders.length);
    folder2A = folders[0];
    chai.assert.strictEqual(folder2A.name, "2A");
    folders = await projectShareClient.getFolders(requestContext, projectId, new ProjectShareFolderQuery().startsWithPathAndNameLike(projectId, "360-Images", "*"));
    chai.assert.strictEqual(3, folders.length);
  });

  it("should be able to query files with different options", async () => {
    const folder360Images = (await projectShareClient.getFolders(requestContext, projectId, new ProjectShareFolderQuery().inRootFolder(projectId)))[0];
    const subFolders = await projectShareClient.getFolders(requestContext, projectId, new ProjectShareFolderQuery().inFolder(folder360Images.wsgId));
    const folder2A = subFolders[0];
    const folder2B = subFolders[1];

    // inRootFolder
    let files: ProjectShareFile[] = await projectShareClient.getFiles(requestContext, projectId, new ProjectShareFileQuery().inRootFolder(projectId));
    chai.assert(files);
    chai.assert.strictEqual(0, files.length);

    // inFolder
    files = await projectShareClient.getFiles(requestContext, projectId, new ProjectShareFileQuery().inFolder(folder2A.wsgId));
    chai.assert(files);
    chai.assert.strictEqual(files.length, 18);
    files = await projectShareClient.getFiles(requestContext, projectId, new ProjectShareFileQuery().inFolder(folder2B.wsgId));
    chai.assert(files);
    chai.assert.strictEqual(files.length, 0);

    // startsWithPath
    files = await projectShareClient.getFiles(requestContext, projectId, new ProjectShareFileQuery().startsWithPath(projectId, "360-Images/2A"));
    chai.assert(files);
    chai.assert.isAtLeast(files.length, 28);

    // inFolderWithNameLike
    files = await projectShareClient.getFiles(requestContext, projectId, new ProjectShareFileQuery().inFolderWithNameLike(folder2A.wsgId, "2A_v0410462"));
    chai.assert(files);
    chai.assert.strictEqual(files.length, 1);
    let firstImage = files[0];
    chai.assert.strictEqual(firstImage.name, "2A_v0410462.jpg");

    // startsWithPathAndNameLike
    files = await projectShareClient.getFiles(requestContext, projectId, new ProjectShareFileQuery().startsWithPathAndNameLike(projectId, "360-Images/2A", "2A_v0410470"));
    chai.assert(files);
    chai.assert.strictEqual(files.length, 1);
    let secondImage = files[0];
    chai.assert.strictEqual(secondImage.name, "2A_v0410470.jpg");

    // byWsgIds
    files = await projectShareClient.getFiles(requestContext, projectId, new ProjectShareFileQuery().byWsgIds(firstImage.wsgId, secondImage.wsgId));
    chai.assert.strictEqual(2, files.length);
    firstImage = files[0];
    chai.assert.strictEqual(firstImage.name, "2A_v0410462.jpg");
    secondImage = files[1];
    chai.assert.strictEqual(secondImage.name, "2A_v0410470.jpg");
  });

  // Gets the custom property object based on the 'Name' property
  function grabCustomProperty(file: ProjectShareFile, name: string): any {
    return file.customProperties.find((customProp: any) => customProp.Name === name);
  }

  it("should be able to CRUD custom properties", async () => {
    const firstImageFile = (await projectShareClient.getFiles(requestContext, projectId, new ProjectShareFileQuery().startsWithPathAndNameLike(projectId, "360-Images/2A", "2A_v0410470")))[0];

    // Create custom properties and validate returned file
    const createCustomProperties = [
      {
        Name: `TestKey${Guid.createValue()}`,
        Value: "TestValue1",
      },
      {
        Name: `TestKey${Guid.createValue()}`,
        Value: "TestValue2",
      },
    ];
    const retFile: ProjectShareFile = await projectShareClient.updateCustomProperties(requestContext, projectId, firstImageFile, createCustomProperties);
    chai.assert.isDefined(retFile.customProperties);
    chai.assert.isAtLeast(retFile.customProperties.length, 2);
    const firstPropFile = grabCustomProperty(retFile, createCustomProperties[0].Name);
    chai.assert.isDefined(firstPropFile);
    chai.assert.strictEqual(firstPropFile.Value, createCustomProperties[0].Value);
    const secondPropFile = grabCustomProperty(retFile, createCustomProperties[1].Name);
    chai.assert.isDefined(secondPropFile);
    chai.assert.strictEqual(secondPropFile.Value, createCustomProperties[1].Value);

    // Get the updated file again and validate it
    const retFile2: ProjectShareFile = (await projectShareClient.getFiles(requestContext, projectId, new ProjectShareFileQuery().byWsgIds(firstImageFile.wsgId)))[0];
    chai.assert.isAtLeast(retFile2.customProperties.length, 2);
    const firstPropFile2 = grabCustomProperty(retFile2, createCustomProperties[0].Name);
    chai.assert.isDefined(firstPropFile2, `The ${createCustomProperties[0].Name} does not exist on the server but it should`);
    chai.assert.strictEqual(firstPropFile2.Value, createCustomProperties[0].Value);
    const secondPropFile2 = grabCustomProperty(retFile2, createCustomProperties[1].Name);
    chai.assert.isDefined(secondPropFile2, `The ${createCustomProperties[1].Name} does not exist on the server but it should`);
    chai.assert.strictEqual(secondPropFile2.Value, createCustomProperties[1].Value);

    // Update a custom property and validate
    const updateCustomProperties = [
      {
        Name: createCustomProperties[0].Name,
        Value: "TestUpdatedValue1",
      },
    ];
    const retFile3: ProjectShareFile = await projectShareClient.updateCustomProperties(requestContext, projectId, firstImageFile, updateCustomProperties);
    chai.assert.isAtLeast(retFile3.customProperties.length, 2);
    const firstPropFile3 = grabCustomProperty(retFile3, createCustomProperties[0].Name);
    chai.assert.isDefined(firstPropFile3);
    chai.assert.strictEqual(firstPropFile3.Value, updateCustomProperties[0].Value);
    const secondPropFile3 = grabCustomProperty(retFile3, createCustomProperties[1].Name);
    chai.assert.isDefined(secondPropFile3);
    chai.assert.strictEqual(secondPropFile3.Value, createCustomProperties[1].Value);

    // Get the updated file again and validate it
    const retFile4: ProjectShareFile = (await projectShareClient.getFiles(requestContext, projectId, new ProjectShareFileQuery().byWsgIds(firstImageFile.wsgId)))[0];
    chai.assert.isAtLeast(retFile4.customProperties.length, 2);
    const firstPropFile4 = grabCustomProperty(retFile4, createCustomProperties[0].Name);
    chai.assert.isDefined(firstPropFile4);
    chai.assert.strictEqual(firstPropFile4.Value, updateCustomProperties[0].Value);
    const secondPropFile4 = grabCustomProperty(retFile4, createCustomProperties[1].Name);
    chai.assert.isDefined(secondPropFile4);
    chai.assert.strictEqual(secondPropFile4.Value, createCustomProperties[1].Value);

    // Delete a custom property and validate
    const deleteProperties = [createCustomProperties[0].Name, createCustomProperties[1].Name];
    const retFile5: ProjectShareFile = await projectShareClient.updateCustomProperties(requestContext, projectId, firstImageFile, undefined, deleteProperties);
    // Ensure the two properties no longer exist
    chai.assert.isUndefined(grabCustomProperty(retFile5, createCustomProperties[0].Name));
    chai.assert.isUndefined(grabCustomProperty(retFile5, createCustomProperties[1].Name));

    // Get the updated file again and validate it
    const retFile6: ProjectShareFile = (await projectShareClient.getFiles(requestContext, projectId, new ProjectShareFileQuery().byWsgIds(firstImageFile.wsgId)))[0];
    chai.assert.isUndefined(grabCustomProperty(retFile6, createCustomProperties[0].Name));
    chai.assert.isUndefined(grabCustomProperty(retFile6, createCustomProperties[1].Name));
  });

});
