/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import { ExtensionStatus, Guid, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { ContextRegistryClient } from "@bentley/context-registry-client";
import { AuthorizedClientRequestContext, request, RequestOptions } from "@bentley/itwin-client";
import { getAccessTokenFromBackend, TestUsers } from "@bentley/oidc-signin-tool/lib/frontend";
import { ExtensionClient } from "../ExtensionClient";
import { ExtensionProps } from "../ExtensionProps";

const assert = chai.assert;

describe("ExtensionClient (#integration)", () => {
  let teamId: string;
  let extensionClient: ExtensionClient;
  let requestContext: AuthorizedClientRequestContext;

  before(async () => {
    Logger.initializeToConsole();
    Logger.setLevelDefault(LogLevel.Error);

    extensionClient = new ExtensionClient();

    const oidcConfig = {
      clientId: "imodeljs-extension-publisher",
      redirectUri: "http://localhost:5001/signin-oidc",
      scope: "openid imodel-extension-service-api context-registry-service:read-only",
    };

    const token = await getAccessTokenFromBackend(TestUsers.regular, oidcConfig);
    requestContext = new AuthorizedClientRequestContext(token);

    const contextRegistry = new ContextRegistryClient();

    const options: RequestOptions = { method: "GET" };
    options.headers = { authorization: requestContext.accessToken.toTokenString() };

    teamId =
      (await request(
        requestContext,
        new URL("v2.5/Repositories/BentleyCONNECT--Main/CONNECTEDContext/Team?isDefault=true", await contextRegistry.getUrl(requestContext, true)).toString(),
        options,
      )).body.instances[0].properties.TeamId;
  });

  after(async () => {
    const availableExtensions = await extensionClient.getExtensions(requestContext, teamId);

    for (const extension of availableExtensions) {
      if (extension.extensionName.length === 48 && extension.extensionName.startsWith("tempTestExt-"))
        try {
          await extensionClient.deleteExtension(requestContext, teamId, extension.extensionName, extension.version);
        } catch (e) { }
    }
  });

  it("gets extensions", async () => {
    const expectedExtensions = [
      {
        extensionName: "testExt1",
        version: "1.0.0",
        files: [
          "testFile1.txt",
          "testFile2",
          "testDir1/testDir2/test file3.txt",
        ].sort(),
        uploadedBy: TestUsers.regular.email,
      },
      {
        extensionName: "testExt1",
        version: "2.0.0",
        files: [
          "testFile1_1.txt",
          "testFile2",
          "testDir1/testDir2/test file3.txt",
        ].sort(),
        uploadedBy: TestUsers.regular.email,
      },
      {
        extensionName: "testExt 2",
        version: "1.0.0",
        files: [
          "testFile",
          "testDir1/testFile.txt",
        ].sort(),
        uploadedBy: TestUsers.regular.email,
      },
    ];

    const foundExtensions = await extensionClient.getExtensions(requestContext, teamId);
    assert.exists(foundExtensions);
    assert.isAbove(foundExtensions.length, 2);

    for (const expected of expectedExtensions) {
      const found = foundExtensions.find((props: ExtensionProps) => props.extensionName === expected.extensionName && props.version === expected.version);
      assert.isDefined(found, `Could not find extension with name ${expected.extensionName} and version ${expected.version}`);

      // comment out until we come up with a better way to handle the difference between who uploaded and the test user used.
      // assert.strictEqual(found!.uploadedBy, expected.uploadedBy, "UploadedBy does not match");
      assert.strictEqual(found!.contextId, teamId, "ContextId does not match");
      assert.strictEqual(found!.files.length, expected.files.length, "Returned file count does not match");

      const sortedUris = found!.files.sort((a, b) => a.url.localeCompare(b.url));
      const firstUri = sortedUris[0].url;
      const lastUri = sortedUris[sortedUris.length - 1].url;
      let relativePathStart = 0;
      while (relativePathStart < firstUri.length && firstUri[relativePathStart] === lastUri[relativePathStart]) relativePathStart++;
      while (relativePathStart > 0 && firstUri[relativePathStart] !== "/") relativePathStart--;

      for (let i = 0; i < expected.files.length; i++) {
        assert.isTrue(sortedUris[i].url.startsWith(`${expected.files[i]}?`, relativePathStart + 1), `File name does not match - expected ${expected.files[i]}, found ${sortedUris[i].url.substr(relativePathStart)}`);
      }
    }
  });

  it("gets extensions with name", async () => {
    const expectedExtensions = [
      {
        extensionName: "testExt1",
        version: "1.0.0",
        files: [
          "testFile1.txt",
          "testFile2",
          "testDir1/testDir2/test file3.txt",
        ].sort(),
        uploadedBy: TestUsers.regular.email,
      },
      {
        extensionName: "testExt1",
        version: "2.0.0",
        files: [
          "testFile1_1.txt",
          "testFile2",
          "testDir1/testDir2/test file3.txt",
        ].sort(),
        uploadedBy: TestUsers.regular.email,
      },
    ];

    const foundExtensions = await extensionClient.getExtensions(requestContext, teamId, "testExt1");
    assert.exists(foundExtensions);
    assert.strictEqual(foundExtensions.length, 2);

    for (const expected of expectedExtensions) {
      const found = foundExtensions.find((props: ExtensionProps) => props.extensionName === expected.extensionName && props.version === expected.version);
      assert.isDefined(found, `Could not find extension with name ${expected.extensionName} and version ${expected.version}`);

      assert.strictEqual(found!.contextId, teamId, "ContextId does not match");
      assert.strictEqual(found!.files.length, expected.files.length, "Returned file count does not match");

      const sortedUris = found!.files.sort((a, b) => a.url.localeCompare(b.url));
      const firstUri = sortedUris[0].url;
      const lastUri = sortedUris[sortedUris.length - 1].url;
      let relativePathStart = 0;
      while (relativePathStart < firstUri.length && firstUri[relativePathStart] === lastUri[relativePathStart]) relativePathStart++;
      while (relativePathStart > 0 && firstUri[relativePathStart] !== "/") relativePathStart--;

      for (let i = 0; i < expected.files.length; i++) {
        assert.isTrue(sortedUris[i].url.startsWith(`${expected.files[i]}?`, relativePathStart + 1), `File name does not match - expected ${expected.files[i]}, found ${sortedUris[i].url.substr(relativePathStart)}`);
      }
    }
  });

  [{
    name: "testExt1",
    version: "1.0.0",
    files: [
      { name: "testFile1.txt", content: "test file content 1" },
      { name: "testFile2", content: "test file content 2" },
      { name: "testDir1/testDir2/test file3.txt", content: "test file content 3" },
    ],
  },
  {
    name: "testExt1",
    version: "2.0.0",
    files: [
      { name: "testFile1_1.txt", content: "test file content 1 ++" },
      { name: "testFile2", content: "test file content 2 ++" },
      { name: "testDir1/testDir2/test file3.txt", content: "test file content 3 ++" },
    ],
  },
  {
    name: "testExt 2",
    version: "1.0.0",
    files: [
      { name: "testFile", content: "test file content 1" },
      { name: "testDir1/testFile.txt", content: "test file content 2" },
    ],
  }].forEach((testCase) => {
    it(`downloads extension ${testCase.name}, version ${testCase.version}`, async () => {
      const files = await extensionClient.downloadExtension(requestContext, teamId, testCase.name, testCase.version);

      assert.strictEqual(files.length, testCase.files.length, "Returned file count does not match");

      for (const file of testCase.files) {
        const foundFile = files.find((f) => f.fileName === file.name);
        assert.isDefined(foundFile, `File not downloaded: ${file.name}`);
        const content = Buffer.from(foundFile!.content).toString();
        assert.strictEqual(content, file.content, `Incorrect file content downloaded: ${file.name}`);
      }
      assert.isTrue(true);
    });
  });

  [
    { name: "testExt1", version: "3.0.0" },
    { name: "testExt that doesn't exist", version: "1.0.0" },
  ].forEach((testCase) => {
    it(`fails to download extension '${testCase.name}', version '${testCase.version}' that doesn't exist`, async () => {
      let thrown = false;
      try {
        await extensionClient.downloadExtension(requestContext, teamId, testCase.name, testCase.version);
      } catch (error) {
        thrown = true;
        assert.isDefined(error.errorNumber);
        assert.isDefined(error.message);
        assert.strictEqual(error.errorNumber, ExtensionStatus.BadRequest);
        assert.strictEqual(error.message, "The requested extension does not exist");
      }
      assert.isTrue(thrown, "Exception not thrown");
    });
  });

  it("uploads and deletes extension with specific version", async () => {
    const extensionName = `tempTestExt-${Guid.createValue()}`;
    const currentTime = new Date().getTime();
    await extensionClient.createExtension(requestContext, teamId, extensionName, "1.0.0", "f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b", Buffer.alloc(64));
    await extensionClient.createExtension(requestContext, teamId, extensionName, "2.0.0", "f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b", Buffer.alloc(64));

    let extensions = await extensionClient.getExtensions(requestContext, teamId);
    let created = extensions.find((props) => props.extensionName === extensionName && props.version === "1.0.0");
    assert.isDefined(created);
    assert.strictEqual(created!.contextId, teamId, "Incorrect contextId");
    assert.approximately(created!.timestamp.getTime(), currentTime, 60 * 1000, "Incorrect timestamp");

    created = extensions.find((props) => props.extensionName === extensionName && props.version === "2.0.0");
    assert.isDefined(created);
    assert.strictEqual(created!.contextId, teamId, "Incorrect contextId");
    assert.approximately(created!.timestamp.getTime(), currentTime, 60 * 1000, "Incorrect timestamp");

    await extensionClient.deleteExtension(requestContext, teamId, extensionName, "1.0.0");
    extensions = await extensionClient.getExtensions(requestContext, teamId);
    const deleted = extensions.find((props) => props.extensionName === extensionName && props.version === "1.0.0");
    assert.isUndefined(deleted);
    const notDeleted = extensions.find((props) => props.extensionName === extensionName && props.version === "2.0.0");
    assert.isDefined(notDeleted);

    await extensionClient.deleteExtension(requestContext, teamId, extensionName, "2.0.0");
  });

  it("uploads and deletes all versions of extension", async () => {
    const extensionName = `tempTestExt-${Guid.createValue()}`;
    await extensionClient.createExtension(requestContext, teamId, extensionName, "1.0.0", "f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b", Buffer.alloc(64));
    await extensionClient.createExtension(requestContext, teamId, extensionName, "2.0.0", "f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b", Buffer.alloc(64));

    let extensions = await extensionClient.getExtensions(requestContext, teamId);
    let created = extensions.find((props) => props.extensionName === extensionName && props.version === "1.0.0");
    assert.isDefined(created);
    created = extensions.find((props) => props.extensionName === extensionName && props.version === "2.0.0");
    assert.isDefined(created);

    await extensionClient.deleteExtension(requestContext, teamId, extensionName);
    extensions = await extensionClient.getExtensions(requestContext, teamId);
    const deleted = extensions.find((props) => props.extensionName === extensionName);
    assert.isUndefined(deleted);
  });

  it("fails to upload already existing extension", async () => {
    let thrown = false;
    try {
      await extensionClient.createExtension(requestContext, teamId, "testExt1", "1.0.0", "f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b", Buffer.alloc(64));
    } catch (error) {
      thrown = true;
      assert.isDefined(error.errorNumber);
      assert.isDefined(error.message);
      assert.strictEqual(error.errorNumber, ExtensionStatus.ExtensionAlreadyExists);
      assert.strictEqual(error.message, "An extension with this name and version already exists");
    }
    assert.isTrue(thrown, "Exception not thrown");
  });

  it("fails to get extensions with invalid context id", async () => {
    let thrown = false;
    try {
      await extensionClient.getExtensions(requestContext, "not a guid");
    } catch (error) {
      thrown = true;
      assert.isDefined(error.errorNumber);
      assert.isDefined(error.message);
      assert.strictEqual(error.errorNumber, ExtensionStatus.BadRequest);
      assert.strictEqual(error.message, "Please Enter valid Context Id. Invalid GUID");
    }
    assert.isTrue(thrown, "Exception not thrown");
  });
});
