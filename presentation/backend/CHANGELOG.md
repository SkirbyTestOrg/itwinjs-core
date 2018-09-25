# Change Log - @bentley/presentation-backend

This log was last generated on Tue, 25 Sep 2018 16:41:02 GMT and should not be manually modified.

## 0.133.0
Tue, 25 Sep 2018 16:41:02 GMT

*Version update only*

## 0.132.0
Mon, 24 Sep 2018 18:55:46 GMT

*Version update only*

## 0.131.0
Sun, 23 Sep 2018 17:07:30 GMT

*Version update only*

## 0.130.0
Sun, 23 Sep 2018 01:19:16 GMT

*Version update only*

## 0.129.0
Fri, 21 Sep 2018 23:16:13 GMT

### Updates

- ActivityIdLoggingContext.current is no longer undefinable

## 0.128.0
Fri, 14 Sep 2018 17:08:05 GMT

### Updates

- Fixed invalid documentation reference
- Fix module names and visibility

## 0.127.0
Thu, 13 Sep 2018 17:07:11 GMT

*Version update only*

## 0.126.0
Wed, 12 Sep 2018 19:12:10 GMT

*Version update only*

## 0.125.0
Wed, 12 Sep 2018 13:35:50 GMT

*Version update only*

## 0.124.0
Tue, 11 Sep 2018 13:52:59 GMT

### Updates

- RPC API fixes for web use cases

## 0.123.0
Wed, 05 Sep 2018 17:14:50 GMT

*Version update only*

## 0.122.0
Tue, 28 Aug 2018 12:25:19 GMT

### Updates

- Handle cases when frontend is connected to unknown backend by syncing client state with the new backend

## 0.121.0
Fri, 24 Aug 2018 12:49:09 GMT

*Version update only*

## 0.120.0
Thu, 23 Aug 2018 20:51:32 GMT

*Version update only*

## 0.119.0
Thu, 23 Aug 2018 15:25:49 GMT

*Version update only*

## 0.118.0
Tue, 21 Aug 2018 17:20:41 GMT

### Updates

- TSLint New Rule Enforcements
- Updated to use TypeScript 3.0

## 0.117.0
Wed, 15 Aug 2018 17:08:54 GMT

*Version update only*

## 0.116.0
Wed, 15 Aug 2018 15:13:19 GMT

*Version update only*

## 0.115.0
Tue, 14 Aug 2018 15:21:27 GMT

*Version update only*

## 0.114.0
Tue, 14 Aug 2018 12:04:18 GMT

*Version update only*

## 0.113.0
Fri, 10 Aug 2018 05:06:20 GMT

### Minor changes

- Rename `ECPresentation` to `Presentation`
- React to Ruleset data structure changes
- React to IRulesetManager API changes
- User Settings rename to Ruleset Variables and related API changes

## 0.5.1
Thu, 02 Aug 2018 17:56:36 GMT

### Patches

- Update imodeljs-core dependency versions to 0.109.0

## 0.5.0
Tue, 24 Jul 2018 13:20:35 GMT

### Minor changes

- Added api for getting distinct values.
- Added api for getting node paths and filtered node paths.
- Moved ruleset management functions from ECPresentationManager to RulesetManager which is accessible from ECPresentationManager through `rulesets` property
- Change the format of request options.
- Change the meaning of `ECPresentationManager.activeLocale`. Now it means the default locale if request options doesn't specify one.
- Rename ECPresentationManager to SingleClientECPresentationManager

### Patches

- Extract native platform into a separate module
- Create MultiClientECPresentationManager
- Change ECPresentation API to use MultiClientECPresentationManager
- Dispose client presentation managers after they're unused for more than 1 hour
- Updated dependencies.

## 0.4.1
Fri, 22 Jun 2018 10:25:30 GMT

### Patches

- Update package dependencies

## 0.4.0
Thu, 14 Jun 2018 12:12:59 GMT

### Minor changes

- Change ECPresentation manager to work with IModelDb instead of IModelToken
- ECPresentationManager now has property settings, which can be used to access and set user setting values.

### Patches

- ECPresentationManager now uses asynchronous requests to get content and nodes.
- Fix nodes' deserialization

## 0.3.1
Wed, 23 May 2018 10:15:48 GMT

### Patches

- Update imodeljs-core dependencies to 0.88

## 0.3.0
Fri, 18 May 2018 14:15:29 GMT

### Minor changes

- Implemented functionality to create presentation ruleset at runtime.
- ECPresentationManager.getContentDescriptor may return no descriptor if there is none with the specified parameters.

### Patches

- Add missing documentation
- Localization: add ability to set locale directories and active locale.
- Use ECPresentationError instead of generic Error.

## 0.2.0
Fri, 11 May 2018 06:57:38 GMT

### Minor changes

- React to Gateway's API changes: renamed ECPresentationGateway to ECPresentationRpcImpl.
- Make ECPresentationManager IDisposable to properly terminate native resources.

## 0.1.2
Tue, 08 May 2018 07:05:52 GMT

### Patches

- 100% unit test coverage
- Update imodeljs-core dependencies to 0.80
- Update bentleyjs-core dependency to 8

## 0.1.1
Sun, 29 Apr 2018 08:07:40 GMT

### Patches

- Fixed packaging.

## 0.1.0
Thu, 26 Apr 2018 09:27:06 GMT

### Patches

- Ids are now Id64. InstanceKey now stores class name instead of id.
- PresentationManager now accepts keys as KeySets
- Added a static ECPresentation class which provides access to singleton ECPresentationManager
- Readonly-ness fixes
- React to ecpresentation-common API changes

## 0.0.32
Fri, 20 Apr 2018 13:57:47 GMT

### Patches

- Updated package dependencies
- Created compound index.ts file that exports package contents so consumers don't have to import each package piece individually through "lib" directory.
- Setup test coverage

## 0.0.28
Wed, 28 Feb 2018 13:44:55 GMT

### Patches

- Use undefined instead of null
- Return read-only objects
- Use async/await instead of pure promises
- Update imodeljs-backend dependency to v.0.57.0

## 0.0.27
Tue, 20 Feb 2018 12:06:04 GMT

### Patches

- Update dependencies: bentleyjs-core@5.2.0, imodeljs-frontend@0.44.2
- Fixed content descriptor customization.
- Change content-related classes to interfaces.
- Implemented support for complex properties

## 0.0.26
Fri, 19 Jan 2018 11:51:55 GMT

### Patches

- Some renaming and moving of EC-types
- Added ability to configure presentation manager to use an app-supplied assets directory for finding app's presentation rulesets.
- Use node addon v3.1.0 and imodeljs-backend v0.24.0

## 0.0.25
Mon, 08 Jan 2018 14:51:31 GMT

### Patches

- Some restructuring to make the code more maintainable.
- Use imodeljs-backend@0.15.0

