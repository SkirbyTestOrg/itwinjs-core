/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module BaseClients */
// import { stringify, IStringifyOptions } from "qs";
import * as sarequest from "superagent";
import * as deepAssign from "deep-assign";
import { stringify, IStringifyOptions } from "qs";
import { Logger, LogLevel, BentleyError, HttpStatus, GetMetaDataFunction, ActivityLoggingContext } from "@bentley/bentleyjs-core";
import { Config } from "./Config";
import * as https from "https";

export const loggingCategory = "imodeljs-clients.Request";
export const loggingCategoryFullUrl = "imodeljs-clients.Url";

export const requestIdHeaderName = "X-Correlation-Id";

export interface RequestBasicCredentials { // axios: AxiosBasicCredentials
  user: string; // axios: username
  password: string; // axios: password
  // sendImmediately deprecated, user -> userName
}

/** Typical option to query REST API. Note that services may not quite support these fields,
 * and the interface is only provided as a hint.
 */
export interface RequestQueryOptions {
  /**
   * Select string used by the query (use the mapped EC property names, and not TypeScript property names)
   * Example: "Name,Size,Description"
   */
  $select?: string;

  /**
   * Filter string used by the query (use the mapped EC property names, and not TypeScript property names)
   *  Example: "Name like '*.pdf' and Size lt 1000"
   */
  $filter?: string;

  /** Sets the limit on the number of entries to be returned by the query */
  $top?: number;

  /** Sets the number of entries to be skipped */
  $skip?: number;

  /**
   * Orders the return values (use the mapped EC property names, and not TypeScript property names)
   * Example: "Size desc"
   */
  $orderby?: string;
}

export interface RequestQueryStringifyOptions {
  delimiter?: string;
  encode?: boolean;
  // sep -> delimiter, eq deprecated, encode -> encode
}

export interface RequestOptions {
  method: string;
  headers?: any; // {Mas-App-Guid, Mas-UUid, User-Agent}
  auth?: RequestBasicCredentials;
  body?: any;
  qs?: any | RequestQueryOptions;
  responseType?: string;
  timeout?: number | { deadline?: number, response?: number }; // Optional timeout in milliseconds. If unspecified, an arbitrary default is setup.
  stream?: any; // Optional stream to read the response to/from (only for NodeJs applications)
  readStream?: any; // Optional stream to read input from (only for NodeJs applications)
  buffer?: any;
  parser?: any;
  accept?: string;
  redirects?: number;
  errorCallback?: (response: any) => ResponseError;
  retryCallback?: (error: any, response: any) => boolean;
  progressCallback?: (progress: ProgressInfo) => void;
  agent?: https.Agent;
  retries?: number;
  useCorsProxy?: boolean;
}

/** Response object if the request was successful. Note that the status within the range of 200-299
 * are considered as a success.
 */
export interface Response {
  body: any; // Parsed body of response
  header: any; // Parsed headers of response
  status: number; // Status code of response
}

export interface ProgressInfo {
  percent?: number;
  total?: number;
  loaded: number;
}

export class RequestGlobalOptions {
  public static HTTPS_PROXY?: https.Agent = undefined;
}

/** Error object that's thrown/rejected if the Request fails due to a network error, or
 * if the status is *not* in the range of 200-299 (inclusive)
 */
export class ResponseError extends BentleyError {
  protected _data?: any;
  public status?: number;
  public description?: string;
  public constructor(errorNumber: number | HttpStatus, message?: string, getMetaData?: GetMetaDataFunction) {
    super(errorNumber, message, undefined, undefined, getMetaData);
  }

  /**
   * Parses error from server's response
   * @param response Http response from the server.
   * @returns Parsed error.
   */
  public static parse(response: any, log = true): ResponseError {
    const error = new ResponseError(ResponseError.parseHttpStatus(response.status / 100));
    if (!response) {
      error.message = "Couldn't get response object.";
      return error;
    }

    if (response.response) {
      if (response.response.error) {
        error.name = response.response.error.name || error.name;
        error.description = response.response.error.message;
      }
      if (response.response.res) {
        error.message = response.response.res.statusMessage;
      }
      if (response.response.body && Object.keys(response.response.body).length > 0) {
        error._data = {};
        deepAssign(error._data, response.response.body);
      } else {
        error._data = response.response.text;
      }
    }

    error.status = response.status || response.statusCode;
    error.name = response.code || response.name || error.name;
    error.message = error.message || response.message || response.statusMessage;

    if (log)
      error.log();

    return error;
  }

  /**
   * Decides whether request should be retried or not
   * @param error Error returned by request
   * @param response Response returned by request
   */
  public static shouldRetry(error: any, response: any): boolean {
    if (error !== undefined && error !== null) {
      if ((error.status === undefined || error.status === null) && (error.res === undefined || error.res === null)) {
        return true;
      }
    }
    return (response !== undefined && response.statusType === HttpStatus.ServerError);
  }

  public static parseHttpStatus(status: number): HttpStatus {
    switch (status) {
      case 1:
        return HttpStatus.Info;
      case 2:
        return HttpStatus.Success;
      case 3:
        return HttpStatus.Redirection;
      case 4:
        return HttpStatus.ClientError;
      case 5:
        return HttpStatus.ServerError;
      default:
        return HttpStatus.Success;
    }
  }

  public logMessage(): string {
    return `${this.status} ${this.name}: ${this.message}`;
  }

  /**
   * Logs this error
   */
  public log(): void {
    Logger.logError(loggingCategory, this.logMessage(), this.getMetaData());
  }
}

const logResponse = (req: sarequest.SuperAgentRequest, startTime: number) => (res: sarequest.Response) => {
  const elapsed = new Date().getTime() - startTime;
  const elapsedTime = elapsed + "ms";
  Logger.logTrace(loggingCategory, `${req.method.toUpperCase()} ${res.status} ${req.url} (${elapsedTime})`);
};

const logRequest = (req: sarequest.SuperAgentRequest) => {
  const startTime = new Date().getTime();
  req.on("response", logResponse(req, startTime));
  return req;
};

// @todo The purpose of this wrapper is to allow us to easily replace this with another
// module that will rid us of NodeJs dependency.The alternate HTTP module is currently
// being written and allow working in desktop environments also.
/**
 * Wrapper around HTTP request utility
 * @param url Server URL to address the request
 * @param options Options to pass to the request
 * @returns Resolves to the response from the server
 * @throws ResponseError if the request fails due to network issues, or if the
 * returned status is *outside* the range of 200-299 (inclusive)
 */
export async function request(alctx: ActivityLoggingContext, url: string, options: RequestOptions): Promise<Response> {
  alctx.enter();
  let proxyUrl = "";
  if (options.useCorsProxy === true) {
    proxyUrl = Config.App.get("imjs_dev_cors_proxy_server", "");
    if (proxyUrl === "")
      proxyUrl = url;
    else
      proxyUrl = proxyUrl.replace(/\/$/, "") + "/" + url;
  } else {
    proxyUrl = url;
  }
  const retries = typeof options.retries === "undefined" ? 4 : options.retries;
  let sareq: sarequest.SuperAgentRequest = sarequest(options.method, proxyUrl).retry(retries, options.retryCallback);

  if (Logger.isEnabled(loggingCategory, LogLevel.Trace))
    sareq = sareq.use(logRequest);

  if (options.headers)
    sareq = sareq.set(options.headers);

  if (alctx.activityId !== "")
    sareq.set(requestIdHeaderName, alctx.activityId);

  let queryStr: string = "";
  let fullUrl: string = "";
  if (options.qs && Object.keys(options.qs).length > 0) {
    const stringifyOptions: IStringifyOptions = { delimiter: "&", encode: false };
    queryStr = stringify(options.qs, stringifyOptions);
    sareq = sareq.query(queryStr);
    fullUrl = url + "?" + queryStr;
  } else {
    fullUrl = url;
  }

  Logger.logInfo(loggingCategoryFullUrl, fullUrl);

  if (options.auth) {
    sareq = sareq.auth(options.auth.user, options.auth.password);
  }

  if (options.accept) {
    sareq = sareq.accept(options.accept);
  }

  if (options.body) {
    sareq = sareq.send(options.body);
  }

  if (options.timeout) {
    sareq = sareq.timeout(options.timeout);
  } else {
    sareq = sareq.timeout(10000);
  }

  if (options.responseType) {
    sareq = sareq.responseType(options.responseType);
  }

  if (options.redirects) {
    sareq = sareq.redirects(options.redirects);
  } else {
    sareq = sareq.redirects(0);
  }

  if (options.buffer) {
    sareq.buffer(options.buffer);
  }

  if (options.parser) {
    sareq.parse(options.parser);
  }

  if (options.agent) {
    sareq.agent(options.agent);
  } else if (RequestGlobalOptions.HTTPS_PROXY) {
    sareq.agent(RequestGlobalOptions.HTTPS_PROXY);
  }

  if (options.progressCallback) {
    sareq.on("progress", (event: sarequest.ProgressEvent) => {
      if (event) {
        options.progressCallback!({
          loaded: event.loaded,
          total: event.total,
          percent: event.percent,
        });
      }
    });
  }

  const errorCallback = options.errorCallback ? options.errorCallback : ResponseError.parse;

  if (options.readStream) {
    if (typeof window !== "undefined") {
      throw new Error("This option is not supported on browsers");
    }

    return new Promise<Response>((resolve, reject) => {
      sareq = sareq.type("blob");
      options
        .readStream
        .pipe(sareq)
        .on("error", (error: any) => {
          const parsedError = errorCallback(error);
          reject(parsedError);
        })
        .on("end", () => {
          const retResponse: Response = {
            status: 201,
            header: undefined,
            body: undefined,
          };
          resolve(retResponse);
        });
    });
  }

  if (options.stream) {
    if (typeof window !== "undefined") {
      throw new Error("This option is not supported on browsers");
    }

    return new Promise<Response>((resolve, reject) => {
      sareq
        .on("response", (res: any) => {
          if (res.statusCode !== 200) {
            const parsedError = errorCallback(res);
            reject(parsedError);
            return;
          }
        })
        .pipe(options.stream)
        .on("error", (error: any) => {
          const parsedError = errorCallback(error);
          reject(parsedError);
        })
        .on("finish", () => {
          const retResponse: Response = {
            status: 200,
            header: undefined,
            body: undefined,
          };
          resolve(retResponse);
        });
    });
  }

  // console.log("%s %s %s", url, options.method, queryStr);

  /*
  * Note:
  * Javascript's fetch returns status.OK if error is between 200-299 inclusive, and doesn't reject in this case.
  * Fetch only rejects if there's some network issue (permissions issue or similar)
  * Superagent rejects network issues, and errors outside the range of 200-299. We are currently using
  * superagent, but may eventually switch to JavaScript's fetch library.
  */
  return sareq
    .then(async (response: sarequest.Response) => {
      const retResponse: Response = {
        body: response.body,
        header: response.header,
        status: response.status,
      };
      return Promise.resolve(retResponse);
    })
    .catch(async (error: any) => {
      const parsedError = errorCallback(error);
      return Promise.reject(parsedError);
    });
}

/**
 * fetch array buffer from HTTP request
 * @param url server URL to address the request
 */
export async function getArrayBuffer(alctx: ActivityLoggingContext, url: string): Promise<any> {
  const options: RequestOptions = {
    method: "GET",
    responseType: "arraybuffer",
  };
  const data = await request(alctx, url, options);
  return data.body;
}

/**
 * fetch json from HTTP request
 * @param url server URL to address the request
 */
export async function getJson(alctx: ActivityLoggingContext, url: string): Promise<any> {
  const options: RequestOptions = {
    method: "GET",
    responseType: "json",
  };
  const data = await request(alctx, url, options);
  return data.body;
}
