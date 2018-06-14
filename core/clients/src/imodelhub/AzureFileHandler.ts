/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { request, RequestOptions, ProgressInfo, ResponseError } from "../Request";
import { Logger } from "@bentley/bentleyjs-core";
import { FileHandler } from "../FileHandler";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { Writable } from "stream";
import * as sareq from "superagent";

const loggingCategory = "imodeljs-clients.imodelhub";

/**
 * Stream that buffers writing to file.
 */
class BufferedStream extends Writable {
  private _buffer?: Buffer;
  private _highWaterMark: number;
  private _stream: fs.WriteStream;
  public constructor(outputPath: string, highWaterMark: number) {
    super();
    this._stream = fs.createWriteStream(outputPath, { encoding: "binary" });
    this._highWaterMark = highWaterMark;
  }

  private flush(callback: (err?: Error) => void) {
    if (this._buffer) {
      this._stream.write(this._buffer, () => {
        this._buffer = undefined;
        callback();
      });
    } else {
      callback();
    }
  }

  public _write(chunk: any, chunkEncoding: string, callback: (err?: Error) => void) {
    if (chunkEncoding !== "buffer" && chunkEncoding !== "binary")
      throw new TypeError(`Encoding '${chunkEncoding}' is not supported.`);
    if (!this._buffer) {
      this._buffer = new Buffer("", "binary");
    }
    this._buffer = Buffer.concat([this._buffer, chunk]);
    if (this._buffer.length > this._highWaterMark) {
      this.flush(callback);
      return;
    }
    callback();
  }

  public _final(callback: (err?: Error) => void) {
    this.flush(callback);
  }

  get bytesWritten(): number {
    return this._stream.bytesWritten;
  }
}

/**
 * Provides methods to work with the file system and azure storage.
 */
export class AzureFileHandler implements FileHandler {
  public agent: https.Agent;
  private _bufferedDownload = false;
  private _highWaterMark: number;

  /**
   * Constructor for AzureFileHandler.
   * @param bufferedDownload Set true, if writing to files should be buffered.
   * @param highWaterMark Threshold in bytes to start writing to file.
   */
  constructor(bufferedDownload = true, highWaterMark = 1000000) {
    this._bufferedDownload = bufferedDownload;
    this._highWaterMark = highWaterMark;
  }

  /** Create a directory, recursively setting up the path as necessary */
  private static makeDirectoryRecursive(dirPath: string) {
    if (fs.existsSync(dirPath))
      return;

    AzureFileHandler.makeDirectoryRecursive(path.dirname(dirPath));

    fs.mkdirSync(dirPath);
  }

  /**
   * Downloads a file from AzureBlobStorage for the iModelHub
   * Creates the directory containing the file if necessary.
   * If there is a error in the operation any incomplete file is deleted from disk.
   * @param downloadUrl URL to download file from.
   * @param downloadToPathname Pathname to download the file to.
   * @param fileSize Size of the file that's being downloaded.
   * @param progressCallback Callback for tracking progress.
   * @throws [[ConcurrencyControl.RequestError]] if the file cannot be downloaded.
   * @throws [[IModelHubRequestError]] if this method is used incorrectly.
   */
  public async downloadFile(downloadUrl: string, downloadToPathname: string, fileSize?: number,
    progressCallback?: (progress: ProgressInfo) => void): Promise<void> {
    Logger.logInfo(loggingCategory, `Downloading file from ${downloadUrl}`);

    if (fs.existsSync(downloadToPathname))
      fs.unlinkSync(downloadToPathname);

    AzureFileHandler.makeDirectoryRecursive(path.dirname(downloadToPathname));

    let outputStream: Writable;
    let bytesWritten: () => number;
    if (this._bufferedDownload) {
      const bufferedStream = new BufferedStream(downloadToPathname, this._highWaterMark);
      outputStream = bufferedStream;
      bytesWritten = () => bufferedStream.bytesWritten;
    } else {
      const fileStream = fs.createWriteStream(downloadToPathname, "binary");
      outputStream = fileStream;
      bytesWritten = () => fileStream.bytesWritten;
    }
    if (progressCallback) {
      outputStream.on("drain", () => {
        progressCallback({ loaded: bytesWritten(), total: fileSize, percent: fileSize ? bytesWritten() / fileSize : 0 });
      });
      outputStream.on("finish", () => {
        progressCallback({ loaded: bytesWritten(), total: fileSize, percent: fileSize ? bytesWritten() / fileSize : 0 });
      });
    }

    try {
      await new Promise((resolve, reject) => {
        sareq
          .get(downloadUrl)
          .agent(this.agent)
          .pipe(outputStream)
          .on("error", (error: any) => {
            const parsedError = ResponseError.parse(error);
            reject(parsedError);
          })
          .on("finish", () => {
            resolve();
          });
      });
    } catch (err) {
      if (fs.existsSync(downloadToPathname))
        fs.unlinkSync(downloadToPathname); // Just in case there was a partial download, delete the file
      Logger.logError(loggingCategory, `Error downloading file`);
      return Promise.reject(err);
    }

    Logger.logTrace(loggingCategory, `Downloaded file from ${downloadUrl}`);
  }

  /** Get encoded block id from its number */
  private getBlockId(blockId: number) {
    return Base64.encode(blockId.toString(16).padStart(5, "0"));
  }

  private async uploadChunk(uploadUrlString: string, fileDescriptor: number, blockId: number, callback?: (progress: ProgressInfo) => void) {
    const chunkSize = 4 * 1024 * 1024;
    let buffer = new Buffer(chunkSize);
    const bytesRead = fs.readSync(fileDescriptor, buffer, 0, chunkSize, chunkSize * blockId);
    buffer = buffer.slice(0, bytesRead);

    const options: RequestOptions = {
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": "application/octet-stream",
        "Content-Length": buffer.length,
      },
      body: buffer,
      progressCallback: callback,
      agent: this.agent,
    };

    const uploadUrl = `${uploadUrlString}&comp=block&blockid=${this.getBlockId(blockId)}`;
    await request(uploadUrl, options);
  }

  /**
   * Uploads a file to AzureBlobStorage for the iModelHub
   * @param uploadUrl URL to upload the fille to.
   * @param uploadFromPathname Pathname to upload the file from.
   * @param progressCallback Callback for tracking progress.
   * @throws [[IModelHubRequestError]] if this method is used incorrectly.
   */
  public async uploadFile(uploadUrlString: string, uploadFromPathname: string, progressCallback?: (progress: ProgressInfo) => void): Promise<void> {
    Logger.logTrace(loggingCategory, `Uploading file to ${uploadUrlString}`);

    const fileSize = this.getFileSize(uploadFromPathname);
    const file = fs.openSync(uploadFromPathname, "r");
    const chunkSize = 4 * 1024 * 1024;

    let blockList = '<?xml version=\"1.0\" encoding=\"utf-8\"?><BlockList>';
    let i = 0;
    const callback = (progress: ProgressInfo) => {
      const uploaded = i * chunkSize + progress.loaded;
      progressCallback!({ loaded: uploaded, percent: uploaded / fileSize, total: fileSize });
    };
    for (; i * chunkSize < fileSize; ++i) {
      await this.uploadChunk(uploadUrlString, file, i, progressCallback ? callback : undefined);
      blockList += `<Latest>${this.getBlockId(i)}</Latest>`;
    }
    blockList += "</BlockList>";

    const options: RequestOptions = {
      method: "PUT",
      headers: {
        "Content-Type": "application/xml",
        "Content-Length": blockList.length,
      },
      body: blockList,
      agent: this.agent,
    };

    const uploadUrl = `${uploadUrlString}&comp=blocklist`;
    await request(uploadUrl, options);
  }

  /**
   * Gets size of a file.
   * @param filePath Path of the file.
   * @returns Size of the file.
   */
  public getFileSize(filePath: string): number {
    return fs.statSync(filePath).size;
  }

  /**
   * Gets size of a file.
   * @param filePath Path of the file.
   * @returns Size of the file.
   */
  public isDirectory(filePath: string): boolean {
    return fs.statSync(filePath).isDirectory();
  }

  /**
   * Checks if path exists.
   * @param filePath Path of the file.
   * @returns True if path exists.
   */
  public exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  /**
   * Get file name from the path.
   * @param filePath Path of the file.
   * @returns File name.
   */
  public basename(filePath: string): string {
    return path.basename(filePath);
  }

  /**
   * Joins multiple string into a single path.
   * @param paths Strings to join.
   * @returns Joined path.
   */
  public join(...paths: string[]): string {
    return path.join(...paths);
  }
}
