# Change Log - @bentley/ecschema-metadata

This log was last generated on Wed, 31 Oct 2018 20:55:37 GMT and should not be manually modified.

## 0.163.0
Wed, 31 Oct 2018 20:55:37 GMT

### Updates

- rename CustomAttributeInstance to CustomAttribute
- Refactored parsing of JSON data to happen in a new dedicated class JsonParser instead of fromJson methods. The fromJson methods have been replaced with deserialize methods which work in conjunction with JsonParser to ensure type safety and objects are created with required properties.
- Update barrel module to include missing types.

## 0.162.0
Wed, 24 Oct 2018 19:20:06 GMT

### Updates

- Test added, exports are imported from Index and tested against explicitly imported modules to ensure equality.
- Updated how default values are set. They are now all set within the constructor.

## 0.161.0
Fri, 19 Oct 2018 13:04:14 GMT

*Version update only*

## 0.160.0
Wed, 17 Oct 2018 18:18:38 GMT

*Version update only*

## 0.159.0
Tue, 16 Oct 2018 14:09:09 GMT

*Version update only*

## 0.158.0
Mon, 15 Oct 2018 19:36:09 GMT

*Version update only*

## 0.157.0
Sun, 14 Oct 2018 17:20:06 GMT

*Version update only*

## 0.156.0
Fri, 12 Oct 2018 23:00:10 GMT

### Updates

- Initial release

