# Changelog
All notable changes to this project will be documented in this file.  
The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Changed
- Removed Composite from Format and merged the properties into the Format class
- Added basic Custom Attribute deserialization support

### Fixed
- Property iteration now follows the same sorting rules that EC native has.

## [0.8.0]  -  2018-07-17
### Added
- Iterator for properties of a class
- Added needed methods to support lazy loading

### Changed
- Updated enumeration logic to separate the creation and addition of an enumerator
- Updated SchemaItemTypeToString for new EC3.2 item types

### Fixed
- Loading a relationship constraint with multiple constraint classes
- Fixed sync 3.1 kind of quantity loading
- Loading EC3.1 Enumerators will automatically upgrade to EC3.2 with a name
  - If the Enumeration's type is string, the name will be the value of the Enumerator
  - If the Enumeration's type is number, the name will be the Enumeration's name and value concatenated
    - i.e. `MyEnumeration6`, where Enumeration's name is `MyEnumeration` and the Enumerator's value is `6`.
- Fixed KoQ presentation formats that have no overrides to be the Format in the Schema, not a copy of the Format.

## [0.7.0]  -  2018-07-13
### Added
- Added EC3.2 support
  - Hidden behind a feature flag on Schema
    - Schema.ec32
  - Details about the EC3.2 specification are available here, http://builds.bentley.com/prgbuilds/AzureBuilds/ECDocs/latest/public/proposals/spec-proposals/#ec-32-proposals.
  - Adds 6 new SchemaItem types
    - Unit
    - InvertedUnit
    - Constant
    - Phenomenon
    - UnitSystem
    - Format

### Changed
- Updated KindOfQuantity to support both the EC3.1 and EC3.2 spec.
  - EC3.2 enables references to Units and Formats which are now defined within the Schema.
- Added EC3.2 support to ECEnumerator.

### Fixed
- Getting inherited properties that are in mixins works in synchronous code, too. There were some missing sync methods.

### Removed
- Removed SchemaReadHelper.to() and SchemaReadHelper.toSync() as public callers should go through Schema.fromJson() instead. SchemaReadHelper can still be constructed publicly to mimic the to() methods.
- Removed some unused internal code

## [0.6.1]  -  2018-06-21
### Fixed

- Navigation Properties in Mixin classes should now load correctly when loading them synchronously

## [0.6.0]  -  2018-06-20
### Added
- Synchronous methods for most things.

### Fixed
- Json SchemaLocater now loads the contents of a schema, not just an empty shell

### Changed
- Schema locaters now do not load a full graph of schemas, but only a single one, they call back through SchemaContext for loading references
- Moved caching from schema locaters into SchemaContext only
- Classes now hold a collection of properties instead of LazyLoadedProperty

[Unreleased]: https://tfs.bentley.com/tfs/ProductLine/Platform%20Technology/ECSchema%20Editor/_git/ec-js/branches?_a=commits&baseVersion=GT0.8.0&targetVersion=GBmaster
[0.8.0]: https://tfs.bentley.com/tfs/ProductLine/Platform%20Technology/ECSchema%20Editor/_git/ec-js/branches?_a=commits&baseVersion=GT0.7.0&targetVersion=GT0.8.0
[0.7.0]: https://tfs.bentley.com/tfs/ProductLine/Platform%20Technology/ECSchema%20Editor/_git/ec-js/branches?_a=commits&baseVersion=GT0.6.1&targetVersion=GT0.7.0
[0.6.1]: https://tfs.bentley.com/tfs/ProductLine/Platform%20Technology/ECSchema%20Editor/_git/ec-js/branches?_a=commits&baseVersion=GT0.6.0&targetVersion=GT0.6.1
[0.6.0]: https://tfs.bentley.com/tfs/ProductLine/Platform%20Technology/ECSchema%20Editor/_git/ec-js/branches?_a=commits&baseVersion=GT0.5.3&targetVersion=GT0.6.0
[0.5.3]: https://tfs.bentley.com/tfs/ProductLine/Platform%20Technology/ECSchema%20Editor/_git/ec-js/branches?_a=commits&baseVersion=GT0.5.2&targetVersion=GT0.5.3
[0.5.2]: https://tfs.bentley.com/tfs/ProductLine/Platform%20Technology/ECSchema%20Editor/_git/ec-js/branches?_a=commits&baseVersion=GT0.5.1&targetVersion=GT0.5.2
[0.5.1]: https://tfs.bentley.com/tfs/ProductLine/Platform%20Technology/ECSchema%20Editor/_git/ec-js/branches?_a=commits&baseVersion=GT0.5.0&targetVersion=GT0.5.1
[0.5.0]: https://tfs.bentley.com/tfs/ProductLine/Platform%20Technology/ECSchema%20Editor/_git/ec-js/branches?_a=commits&baseVersion=GT0.0.1&targetVersion=GT0.5.0

<!-- This is a slightly better formatting in the VSCode markdown preview: -->
<style>
  h2 > a { font-weight: 600; }
  h2::after { content:''; display: block; border-bottom: 1px solid currentColor; opacity: .25 }
</style>
