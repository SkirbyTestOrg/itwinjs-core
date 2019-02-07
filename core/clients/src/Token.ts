/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Authentication */

import * as xpath from "xpath";
import { DOMParser } from "xmldom";
import { UserInfo } from "./UserInfo";
import { Base64 } from "js-base64";
import { BentleyError, BentleyStatus, ActivityLoggingContext } from "@bentley/bentleyjs-core";

export enum IncludePrefix {
  Yes = 0,
  No = 1,
}

/** Token base class */
export abstract class Token {
  protected _samlAssertion: string;

  protected _userInfo?: UserInfo;
  protected _startsAt?: Date;
  protected _expiresAt?: Date;
  protected _x509Certificate?: string;

  protected constructor(samlAssertion: string) {
    this._samlAssertion = samlAssertion;
  }

  public getSamlAssertion(): string | undefined {
    return this._samlAssertion;
  }

  public getUserInfo(): UserInfo | undefined {
    return this._userInfo;
  }

  public getExpiresAt(): Date | undefined {
    return this._expiresAt;
  }

  public getStartsAt(): Date | undefined {
    return this._startsAt;
  }

  protected parseSamlAssertion(): boolean {
    if (!this._samlAssertion)
      return false;

    const select: xpath.XPathSelect = xpath.useNamespaces({
      ds: "http://www.w3.org/2000/09/xmldsig#",
      saml: "urn:oasis:names:tc:SAML:1.0:assertion",
    });
    const dom: Document = (new DOMParser()).parseFromString(this._samlAssertion);

    this._x509Certificate = select("/saml:Assertion/ds:Signature/ds:KeyInfo/ds:X509Data/ds:X509Certificate/text()", dom).toString();

    const startsAtStr: string = select("string(/saml:Assertion/saml:Conditions/@NotBefore)", dom).toString();
    this._startsAt = new Date(startsAtStr);

    const expiresAtStr: string = select("string(/saml:Assertion/saml:Conditions/@NotOnOrAfter)", dom).toString();

    const extractAttribute: (attributeName: string) => string = (attributeName: string) =>
      select("/saml:Assertion/saml:AttributeStatement/saml:Attribute[@AttributeName='" +
        attributeName + "']/saml:AttributeValue/text()", dom).toString();

    const id = extractAttribute("userid");
    const email = {
      id: extractAttribute("emailaddress"),
    };
    const profile = {
      name: extractAttribute("name"),
      firstName: extractAttribute("givenname"),
      lastName: extractAttribute("surname"),
    };
    const organization = {
      id: extractAttribute("organizationid"),
      name: extractAttribute("organization"),
    };
    const featureTracking = {
      ultimateSite: extractAttribute("ultimatesite"),
      usageCountryIso: extractAttribute("usagecountryiso"),
    };

    this._userInfo = new UserInfo(id, email, profile, organization, featureTracking);
    this._startsAt = new Date(startsAtStr);
    this._expiresAt = new Date(expiresAtStr);

    return !!this._x509Certificate && !!this._startsAt && !!this._expiresAt;
  }
}

/** Token issued by Active Secure Token Service or Federated Authentication Service for user authentication/authorization  */
export class AuthorizationToken extends Token {

  public static fromSamlAssertion(samlAssertion: string): AuthorizationToken {
    const token = new AuthorizationToken(samlAssertion);
    if (!token.parseSamlAssertion())
      throw new BentleyError(BentleyStatus.ERROR, "Cannot parse Saml assertion");
    return token;
  }

  public toTokenString(includePrefix: IncludePrefix = IncludePrefix.Yes): string {
    if (!this._x509Certificate)
      throw new BentleyError(BentleyStatus.ERROR, "Invalid access token");

    const prefix = (includePrefix === IncludePrefix.Yes) ? "X509 access_token=" : "";
    return prefix + Buffer.from(this._x509Certificate, "utf8").toString("base64");
  }

  public static clone(unTypedObj: any): AuthorizationToken {
    const authToken = new AuthorizationToken(unTypedObj._samlAssertion);
    Object.assign(authToken, unTypedObj);
    return authToken;
  }
}

/** Token issued by DelegationSecureTokenService for API access  */
export class AccessToken extends Token {
  private _jwt?: string;
  private static _samlTokenPrefix = "Token";
  private static _jwtTokenPrefix = "Bearer";
  public static foreignProjectAccessTokenJsonProperty = "ForeignProjectAccessToken";

  public static fromSamlAssertion(samlAssertion: string): AuthorizationToken {
    const token = new AccessToken(samlAssertion);
    if (!token.parseSamlAssertion())
      throw new BentleyError(BentleyStatus.ERROR, "Cannot parse Saml assertion");
    return token;
  }

  public static fromForeignProjectAccessTokenJson(foreignJsonStr: string): AccessToken | undefined {
    if (!foreignJsonStr.startsWith(`{\"${this.foreignProjectAccessTokenJsonProperty}\":`))
      return undefined;
    const props: any = JSON.parse(foreignJsonStr);
    if (props[this.foreignProjectAccessTokenJsonProperty] === undefined)
      return undefined;
    const tok = new AccessToken(foreignJsonStr);
    tok._userInfo = props[this.foreignProjectAccessTokenJsonProperty].userInfo;
    return tok;
  }

  /** Create an AccessToken from a SAML based accessTokenString for Windows Federated Authentication workflows */
  public static fromSamlTokenString(accessTokenString: string, includesPrefix: IncludePrefix = IncludePrefix.Yes): AccessToken {
    let extractedStr = accessTokenString;
    if (includesPrefix === IncludePrefix.Yes) {
      const index = accessTokenString.toLowerCase().indexOf(AccessToken._samlTokenPrefix.toLowerCase());
      if (index < 0)
        throw new BentleyError(BentleyStatus.ERROR, "Invalid saml token");

      extractedStr = accessTokenString.slice(6);
      if (!extractedStr)
        throw new BentleyError(BentleyStatus.ERROR, "Invalid saml token");
    }

    const samlStr = Base64.decode(extractedStr);
    if (!samlStr)
      throw new BentleyError(BentleyStatus.ERROR, "Invalid saml token");

    return AccessToken.fromSamlAssertion(samlStr);
  }

  /** Create an AccessToken from a JWT token for OIDC workflows */
  public static fromJsonWebTokenString(jwt: string, startsAt: Date, expiresAt: Date, userInfo?: UserInfo): AccessToken {
    const token = new AccessToken("");
    token._jwt = jwt;
    token._startsAt = startsAt;
    token._expiresAt = expiresAt;
    token._userInfo = userInfo;
    return token;
  }

  public toTokenString(includePrefix: IncludePrefix = IncludePrefix.Yes): string {
    if (this._jwt)
      return (includePrefix === IncludePrefix.Yes) ? AccessToken._jwtTokenPrefix + " " + this._jwt : this._jwt;

    if (!this._samlAssertion)
      throw new BentleyError(BentleyStatus.ERROR, "Cannot convert invalid access token to string");

    const tokenStr: string = Base64.encode(this._samlAssertion);
    return (includePrefix === IncludePrefix.Yes) ? AccessToken._samlTokenPrefix + " " + tokenStr : tokenStr;
  }

  public static fromJson(jsonObj: any): AccessToken | undefined {
    if (jsonObj._jwt)
      return AccessToken.fromJsonWebTokenString(jsonObj._jwt, jsonObj._startsAt, jsonObj._expiresAt, jsonObj._userInfo);

    const foreignTok = AccessToken.fromForeignProjectAccessTokenJson(jsonObj._samlAssertion);
    if (foreignTok !== undefined)
      return foreignTok;
    return AccessToken.fromSamlAssertion(jsonObj._samlAssertion);
  }

}

/** Interface to fetch the accessToken for authorization of various API */
export interface IAccessTokenManager {
  /** Returns a promise that resolves to the AccessToken if signed in.
   * The token is refreshed if it's possible and necessary.
   * Rejects with an appropriate error if the access token cannot be obtained.
   */
  getAccessToken(actx: ActivityLoggingContext): Promise<AccessToken>;
}
