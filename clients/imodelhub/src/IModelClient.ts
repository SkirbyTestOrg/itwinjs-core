/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModelHubClient
 */
import { FileHandler } from "@bentley/itwin-client";
import { IModelBaseHandler } from "./imodelhub/BaseHandler";
import { BriefcaseHandler } from "./imodelhub/Briefcases";
import { ChangeSetHandler } from "./imodelhub/ChangeSets";
import { CheckpointHandler } from "./imodelhub/Checkpoints";
import { CodeHandler } from "./imodelhub/Codes";
import { CustomRequestOptions } from "./imodelhub/CustomRequestOptions";
import { EventHandler } from "./imodelhub/Events";
import { GlobalEventHandler } from "./imodelhub/GlobalEvents";
import { IModelHandler, IModelsHandler } from "./imodelhub/iModels";
import { LockHandler } from "./imodelhub/Locks";
import { ThumbnailHandler } from "./imodelhub/Thumbnails";
import { UserInfoHandler } from "./imodelhub/Users";
import { VersionHandler } from "./imodelhub/Versions";

/**
 * Base class that allows access to different iModel related Class handlers. Handlers should be accessed through an instance of this class, rather than constructed directly.
 * @beta
 */
export abstract class IModelClient {
  protected _handler: IModelBaseHandler;
  private _fileHandler?: FileHandler;
  /**
   * Creates an instance of [[IModelClient]].
   * @param fileHandler File handler to handle file upload/download and file system operations.
   */
  public constructor(baseHandler: IModelBaseHandler, fileHandler?: FileHandler) {
    this._handler = baseHandler;
    this._fileHandler = fileHandler || this._handler.getFileHandler();
    if (this._fileHandler)
      this._fileHandler.agent = this._handler.getAgent();
  }

  /**
   * Sets file handler for file upload/download.
   * @param fileHandler File handler to handle file upload/download and file system operations.
   */
  public setFileHandler(fileHandler: FileHandler) {
    this._fileHandler = fileHandler;
    this._fileHandler.agent = this._handler.getAgent();
  }

  /**
   * Gets file handler for file upload/download.
   * @returns File handler to handle file upload/download and file system operations.
   */
  public get fileHandler() {
    return this._fileHandler;
  }

  /**
   * Get the handler for [[HubIModel]] instances.
   * @note Use [[IModelHubClient.IModel]] for the preferred single iModel per [[Project]] workflow.
   */
  public get iModels(): IModelsHandler {
    return new IModelsHandler(this._handler, this._fileHandler);
  }

  /**
   * Get the handler for [[HubIModel]].
   */
  public get iModel(): IModelHandler {
    return new IModelHandler(new IModelsHandler(this._handler, this._fileHandler));
  }

  /**
   * Get the handler for [[Briefcase]]s.
   * @internal
   */
  public get briefcases(): BriefcaseHandler {
    return new BriefcaseHandler(this._handler, this._fileHandler);
  }

  /**
   * Get the handler for [[ChangeSet]]s.
   * @beta
   */
  public get changeSets(): ChangeSetHandler {
    return new ChangeSetHandler(this._handler, this._fileHandler);
  }

  /**
   * Get the handler for [[Checkpoint]]s.
   * @alpha
   */
  public get checkpoints(): CheckpointHandler {
    return new CheckpointHandler(this._handler, this._fileHandler);
  }

  /**
   * Get the handler for [[Lock]]s.
   * @alpha
   */
  public get locks(): LockHandler {
    return new LockHandler(this._handler);
  }

  /**
   * Get the handler for [Code]($common)s.
   * @alpha
   */
  public get codes(): CodeHandler {
    return new CodeHandler(this._handler);
  }

  /**
   * Get the handler for [[UserInfo]].
   * @alpha
   */
  public get users(): UserInfoHandler {
    return new UserInfoHandler(this._handler);
  }

  /**
   * Get the handler for [[Version]]s.
   * @beta
   */
  public get versions(): VersionHandler {
    return new VersionHandler(this._handler);
  }

  /**
   * Get the handler for [[Thumbnail]]s.
   * @alpha
   */
  public get thumbnails(): ThumbnailHandler {
    return new ThumbnailHandler(this._handler);
  }

  /**
   * Get the handler for [[IModelHubEvent]]s.
   */
  public get events(): EventHandler {
    return new EventHandler(this._handler);
  }

  /**
   * Get the handler for [[IModelHubGlobalEvent]]s.
   * @internal
   */
  public get globalEvents(): GlobalEventHandler {
    return new GlobalEventHandler(this._handler);
  }

  /**
   * Get the [CustomRequestOptions]($clients) object for controlling future request options.
   * @internal
   */
  public get requestOptions(): CustomRequestOptions {
    return this._handler.getCustomRequestOptions();
  }
}
