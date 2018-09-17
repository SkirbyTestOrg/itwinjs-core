
/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Authentication */

/** Profile of the authenticated user. */
export class UserProfile {
  constructor(
    public firstName: string,
    public lastName: string,
    public email: string,
    public userId: string,
    public organization: string,
    public organizationId: string,
    public ultimateSite: string,
    public usageCountryIso: string,
  ) { }

}
