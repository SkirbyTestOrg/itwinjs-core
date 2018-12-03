# Change Log - @bentley/imodeljs-clients

This log was last generated on Mon, 03 Dec 2018 18:52:58 GMT and should not be manually modified.

## 0.171.0
Mon, 03 Dec 2018 18:52:58 GMT

### Updates

- Use property getters instead of methods for IModelClient

## 0.170.0
Mon, 26 Nov 2018 19:38:42 GMT

### Updates

- Fixed floating promises in iModelHub client
- Fix for integration tests
- Use property getters instead of methods for IModelClient

## 0.169.0
Tue, 20 Nov 2018 16:17:15 GMT

*Version update only*

## 0.168.0
Sat, 17 Nov 2018 14:20:11 GMT

*Version update only*

## 0.167.0
Fri, 16 Nov 2018 21:45:44 GMT

### Updates

- Updated iModel Hub Client so iModel Base Handler is injectable. Now Http Request Options can be sepecified for the iModelHubClient
- Added IModelHubClient.IModel, removed IModelQuery.primary(), use IModelHubClient.IModel.Get instead
- Simplified download stream

## 0.166.0
Mon, 12 Nov 2018 16:42:10 GMT

*Version update only*

## 0.165.0
Mon, 12 Nov 2018 15:47:00 GMT

*Version update only*

## 0.164.0
Thu, 08 Nov 2018 17:59:20 GMT

### Updates

- Deprecated dev-cors-proxy-server and use of it. 
- Removed PropertySerializer used by ECJsonTypeMap.
- OIDC related enhancments (WIP).
- Fixed more integration tests. 
- Updated to TypeScript 3.1

## 0.163.0
Wed, 31 Oct 2018 20:55:37 GMT

### Updates

- Fix issue where buddi require full url from config instead of just the base without /GetUrl
- Cleanup clients. Removed unused clients and methods.

## 0.162.0
Wed, 24 Oct 2018 19:20:06 GMT

### Updates

- BIM Review Share WsgClient and tests
- Updated docs to change URL that were used as example but pointed to actuall internal server
- SettingsClient now accepts AccessToken (from SAML and OIDC) rather than (SAML-only) AuthorizationToken.
- it.only fix for BIM review share

## 0.161.0
Fri, 19 Oct 2018 13:04:14 GMT

### Updates

- Allow case-insensitive lookup of keys from Config.App

## 0.160.0
Wed, 17 Oct 2018 18:18:38 GMT

*Version update only*

## 0.159.0
Tue, 16 Oct 2018 14:09:09 GMT

### Updates

- Removed KnownRegions Enum

## 0.158.0
Mon, 15 Oct 2018 19:36:09 GMT

### Updates

- Cleaned up frontend configuration. 
- add default Buddi URL and region and a added docs for region id

## 0.157.0
Sun, 14 Oct 2018 17:20:06 GMT

### Updates

- Fixing scripts for linux

## 0.156.0
Fri, 12 Oct 2018 23:00:10 GMT

### Updates

- Initial release

