/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { Guid, GuidString } from "@bentley/bentleyjs-core";
import { UsageLogEntry, FeatureLogEntry, FeatureStartedLogEntry, FeatureEndedLogEntry, ProductVersion, UsageType, UsageUserInfo } from "./UlasClient";

/** @hidden */
/** Specifies the JSON format for a UsageLogEntry as expected by the ULAS REST API
 *  (see https://qa-connect-ulastm.bentley.com/Bentley.ULAS.SwaggerUI/SwaggerWebApp/?urls.primaryName=ULAS%20Posting%20Service%20v1)
 */
export interface UsageLogEntryJson {
  /** Ultimate ID, i.e. company ID in SAP */
  ultID: number | undefined;
  /** The ID of the Principal that was granted access to the application */
  pid: GuidString | undefined;
  /** The GUID of the IMS user accessing the product, maybe the same as the Principal. */
  imsID: GuidString | undefined;
  /** The client’s machine name excluding domain information. */
  hID: string;
  /** The client’s login name excluding domain information */
  uID: string | undefined;
  /** The GUID embedded in the policy file that allows us to track the entitlement history. */
  polID: GuidString;
  /** The ID of the securable. */
  secID: string;
  /** The product ID for which usage is being submitted. It is a 4-digit Product ID from the GPR. */
  prdid: number | undefined;
  /** A feature string further identifying the product for which available usage is being submitted. Not to be confused with feature IDs. */
  fstr: string;
  /** The version of the application producing the usage.
   *  Format: Pad all sections out to 4 digits padding is with zeros, e.g. 9.10.2.113 becomes 9001000020113.
   */
  ver: number | undefined;
  /** The GUID of the project that the usage should be associated with.
   *  If no project is selected, omit the field.
   */
  projID: GuidString | undefined;
  /** The GUID that identifies a unique usage session, used to correlate data between feature usage and usage logs. */
  corID: GuidString;
  /** The UTC time of the event. */
  evTimeZ: string;
  /** The version of the schema which this log entry represents. */
  lVer: number;
  /** Identifies the source of the usage log entry: RealTime, Offline, Checkout */
  lSrc: string;
  /** Identifies the country where the client reporting the usage belongs to. */
  country: string | undefined;
  /** The type of usage that occurred on the client. It is acting as a filter to eliminate records from log processing that
   *  should not count towards a customer’s peak processing. One of: Production, Trial, Beta, HomeUse, PreActivation
   */
  uType: string;
}

export interface FeatureLogEntryAttributeJson {
  name: string;
  value: string;
}

/** Specifies the JSON format for a FeatureLogEntry as expected by the ULAS REST API
 *  (see https://qa-connect-ulastm.bentley.com/Bentley.ULAS.SwaggerUI/SwaggerWebApp/?urls.primaryName=ULAS%20Posting%20Service%20v1)
 */
export interface FeatureLogEntryJson extends UsageLogEntryJson {
  /** Gets the ID of the feature used (from the Global Feature Registry) */
  ftrID: GuidString;
  /** The start date in UTC when feature usage has started (for duration feature log entries) */
  sDateZ: string;
  /** The end date in UTC when feature usage has started (for duration feature log entries) */
  eDateZ: string;
  /** Additional user-defined metadata for the feature usage */
  uData: FeatureLogEntryAttributeJson[];
}

export class LogEntryConverter {
  // for now this is always 1
  private static readonly _logEntryVersion: number = 1;
  // this is a realtime client, i.e. it sends the requests right away without caching or aggregating.
  private static readonly _logPostingSource: string = "RealTime";
  // fStr argument is empty for now
  private static readonly _featureString: string = "";
  private static readonly _policyFileId: GuidString = Guid.createValue();
  private static readonly _securableId: string = Guid.createValue();
  private static readonly _correlationId: GuidString = Guid.createValue();

  public static toUsageLogJson(entry: UsageLogEntry): UsageLogEntryJson {
    const userInfo: UsageUserInfo | undefined = entry.userInfo;
    const imsID: GuidString | undefined = !!userInfo ? userInfo.imsId : undefined;
    const ultID: number | undefined = !!userInfo ? userInfo.ultimateSite : undefined;
    const usageCountry: string | undefined = !!userInfo ? userInfo.usageCountryIso : undefined;

    const hID: string = LogEntryConverter.prepareMachineName(entry.hostName);
    const uID: string | undefined = !userInfo || !userInfo.hostUserName ? imsID : LogEntryConverter.prepareUserName(userInfo.hostUserName, entry.hostName);

    const ver: number | undefined = LogEntryConverter.toVersionNumber(entry.productVersion);
    const uType: string = LogEntryConverter.usageTypeToString(entry.usageType);

    return {
      ultID, pid: imsID, // Principal ID for now is IMS Id (eventually should be pulled from policy files)
      imsID, hID, uID, polID: LogEntryConverter._policyFileId, secID: LogEntryConverter._securableId, prdid: entry.productId,
      fstr: LogEntryConverter._featureString, ver, projID: entry.projectId, corID: LogEntryConverter._correlationId,
      evTimeZ: entry.timestamp, lVer: LogEntryConverter._logEntryVersion, lSrc: LogEntryConverter._logPostingSource,
      country: usageCountry, uType,
    };
  }

  public static toFeatureLogJson(entries: FeatureLogEntry[]): FeatureLogEntryJson[] {
    const json: FeatureLogEntryJson[] = [];
    for (const entry of entries) {
      const userInfo: UsageUserInfo | undefined = entry.userInfo;
      const imsID: GuidString | undefined = !!userInfo ? userInfo.imsId : undefined;
      const ultID: number | undefined = !!userInfo ? userInfo.ultimateSite : undefined;
      const usageCountry: string | undefined = !!userInfo ? userInfo.usageCountryIso : undefined;

      const hID: string = LogEntryConverter.prepareMachineName(entry.hostName);
      const uID: string | undefined = !userInfo || !userInfo.hostUserName ? imsID : LogEntryConverter.prepareUserName(userInfo.hostUserName, entry.hostName);

      const ver: number | undefined = LogEntryConverter.toVersionNumber(entry.productVersion);

      const evTimeZ: string = entry.timestamp;
      let sDateZ: string;
      let eDateZ: string;
      let corID: GuidString;
      const startEntry: FeatureStartedLogEntry = entry as FeatureStartedLogEntry;
      const endEntry: FeatureEndedLogEntry = entry as FeatureEndedLogEntry;
      const defaultDate: string = "0001-01-01T00:00:00Z";
      if (!!startEntry.entryId) {
        sDateZ = evTimeZ;
        eDateZ = defaultDate;
        corID = startEntry.entryId;
      } else if (!!endEntry.startEntryId) {
        sDateZ = defaultDate;
        eDateZ = evTimeZ;
        corID = endEntry.startEntryId;
      } else {
        sDateZ = evTimeZ;
        eDateZ = evTimeZ;
        corID = LogEntryConverter._correlationId;
      }

      const uType: string = LogEntryConverter.usageTypeToString(entry.usageType);

      const uData: FeatureLogEntryAttributeJson[] = [];
      for (const att of entry.usageData) {
        uData.push({ name: att.name, value: att.value.toString() });
      }

      const entryJson: FeatureLogEntryJson = {
        ultID, pid: imsID, // Principal ID for now is IMS Id (eventually should be pulled from policy files)
        imsID, hID, uID, polID: LogEntryConverter._policyFileId, secID: LogEntryConverter._securableId,
        prdid: entry.productId, fstr: LogEntryConverter._featureString, ver, projID: entry.projectId, corID,
        evTimeZ, lVer: LogEntryConverter._logEntryVersion, lSrc: LogEntryConverter._logPostingSource,
        country: usageCountry, uType, ftrID: entry.featureId, sDateZ, eDateZ, uData,
      };

      json.push(entryJson);
    }
    return json;
  }

  private static toVersionNumber(version?: ProductVersion): number | undefined {
    if (!version)
      return undefined;

    // version must be encoded into a single number where each version digit is padded out to 4 digits
    // and the version is always considered to have 4 digits.
    // Ex: 3.99.4 -> 3.99.4.0 -> 3009900040000
    let verNumber: number = !!version.sub2 ? version.sub2 : 0;
    verNumber += 10000 * (!!version.sub1 ? version.sub1 : 0);
    verNumber += Math.pow(10000, 2) * version.minor;
    verNumber += Math.pow(10000, 3) * version.major;
    return verNumber;
  }

  private static prepareMachineName(machineName: string): string {
    if (!machineName || machineName.length === 0)
      return "";

    if (machineName === "::1" || machineName === "127.0.0.1")
      return "localhost";

    return machineName.toLowerCase();
  }

  private static prepareUserName(userName: string, machineName: string): string {
    if (!userName || userName.length === 0)
      return "";

    let preparedUserName: string = userName;

    const backslashPos: number = userName.indexOf("\\");
    if (backslashPos >= 0)
      preparedUserName = userName.substr(backslashPos + 1);
    else {
      const slashPos: number = userName.indexOf("/");
      if (slashPos >= 0)
        preparedUserName = userName.substr(slashPos + 1);
    }

    preparedUserName = preparedUserName.toLowerCase();
    if (!!machineName && machineName.length > 0 && (preparedUserName.includes("administrator") || preparedUserName.includes("system")))
      preparedUserName = `${machineName.toLowerCase()}\\${preparedUserName}`;

    return preparedUserName;
  }

  private static usageTypeToString(val: UsageType): string {
    switch (val) {
      case UsageType.Beta:
        return "Beta";
      case UsageType.HomeUse:
        return "HomeUse";
      case UsageType.PreActivation:
        return "PreActivation";
      case UsageType.Production:
        return "Production";
      case UsageType.Trial:
        return "Trial";
      default:
        throw new Error("Unhandled UsageType enum value");
    }
  }
}
