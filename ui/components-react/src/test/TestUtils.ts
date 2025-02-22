/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  ArrayValue, BasePropertyEditorParams, ButtonGroupEditorParams, CustomFormattedNumberParams, DisplayMessageType, ImageCheckBoxParams,
  MessagePresenter, MessageSeverity, ParseResults, Primitives, PrimitiveValue, PropertyDescription, PropertyEditorInfo, PropertyEditorParamTypes,
  PropertyRecord, PropertyValue, PropertyValueFormat, StandardEditorNames, StandardTypeNames, StructValue, UiAdmin,
} from "@itwin/appui-abstract";
import { ITwinLocalization } from "@itwin/core-i18n";
import {
  AsyncValueProcessingResult, ColumnDescription, CompositeFilterDescriptorCollection, DataControllerBase, FilterableTable, UiComponents,
} from "../components-react";
import { TableFilterDescriptorCollection } from "../components-react/table/columnfiltering/TableFilterDescriptorCollection";

// cSpell:ignore buttongroup

/** @internal */
export class TestUtils {
  private static _i18n?: ITwinLocalization;
  private static _uiComponentsInitialized = false;

  public static get i18n(): ITwinLocalization {
    return TestUtils._i18n!;
  }

  public static async initializeUiComponents() {
    if (!TestUtils._uiComponentsInitialized) {
      TestUtils._i18n = new ITwinLocalization();
      await TestUtils.i18n.initialize(["IModelJs"]);

      await UiComponents.initialize(TestUtils.i18n);
      TestUtils._uiComponentsInitialized = true;

      const mp: MessagePresenter = {
        displayMessage: (_severity: MessageSeverity, _briefMessage: HTMLElement | string, _detailedMessage?: HTMLElement | string, _messageType?: DisplayMessageType.Toast): void => { },
        displayInputFieldMessage: (_inputField: HTMLElement, _severity: MessageSeverity, _briefMessage: HTMLElement | string, _detailedMessage?: HTMLElement | string): void => { },
        closeInputFieldMessage: (): void => { },
      };
      UiAdmin.messagePresenter = mp;
    }
  }

  public static terminateUiComponents() {
    UiComponents.terminate();
    TestUtils._uiComponentsInitialized = false;
  }

  /** Waits until all async operations finish */
  public static async flushAsyncOperations() {
    return new Promise((resolve) => setTimeout(resolve));
  }

  // eslint-disable-next-line deprecation/deprecation
  public static createPropertyRecord(value: any, column: ColumnDescription, typename: string) {
    const v: PrimitiveValue = {
      valueFormat: PropertyValueFormat.Primitive,
      value,
      displayValue: value,
    };
    const pd: PropertyDescription = {
      typename,
      name: column.key,
      displayLabel: column.label,
    };
    column.propertyDescription = pd;
    return new PropertyRecord(v, pd);
  }

  public static createPrimitiveStringProperty(name: string, rawValue: string, displayValue: string = rawValue.toString(), editorInfo?: PropertyEditorInfo, autoExpand?: boolean) {
    const value: PrimitiveValue = {
      displayValue,
      value: rawValue,
      valueFormat: PropertyValueFormat.Primitive,
    };

    const description: PropertyDescription = {
      displayLabel: name,
      name,
      typename: StandardTypeNames.String,
    };

    if (editorInfo)
      description.editor = editorInfo;

    const property = new PropertyRecord(value, description);
    property.isReadonly = false;
    property.autoExpand = autoExpand;
    if (property.autoExpand === undefined)
      delete property.autoExpand;

    return property;
  }

  public static createPrimitiveDoubleProperty(name: string, rawValue: number, displayValue: string = rawValue.toString(), editorInfo?: PropertyEditorInfo) {
    const value: PrimitiveValue = {
      displayValue,
      value: rawValue,
      valueFormat: PropertyValueFormat.Primitive,
    };

    const description: PropertyDescription = {
      displayLabel: name,
      name,
      typename: StandardTypeNames.Double,
    };

    if (editorInfo)
      description.editor = editorInfo;

    const property = new PropertyRecord(value, description);
    property.isReadonly = false;

    return property;
  }

  public static createMultilineTextPropertyRecord(name: string, value: string) {
    const record = TestUtils.createPrimitiveStringProperty(name, value);
    record.property.renderer = { name: "multiline" };
    return record;
  }

  public static createArrayProperty(name: string, items?: PropertyRecord[], autoExpand?: boolean) {
    if (!items)
      items = [];

    const value: ArrayValue = {
      items,
      valueFormat: PropertyValueFormat.Array,
      itemsTypeName: items.length !== 0 ? items[0].property.typename : "string",
    };

    const description: PropertyDescription = {
      displayLabel: name,
      name,
      typename: StandardTypeNames.Array,
    };
    const property = new PropertyRecord(value, description);
    property.isReadonly = false;
    property.autoExpand = autoExpand;
    return property;
  }

  public static createStructProperty(name: string, members?: { [name: string]: PropertyRecord }, autoExpand?: boolean) {
    if (!members)
      members = {};

    const value: StructValue = {
      members,
      valueFormat: PropertyValueFormat.Struct,
    };

    const description: PropertyDescription = {
      displayLabel: name,
      name,
      typename: StandardTypeNames.Struct,
    };
    const property = new PropertyRecord(value, description);
    property.isReadonly = false;
    property.autoExpand = autoExpand;
    return property;
  }

  // eslint-disable-next-line deprecation/deprecation
  public static createEnumStringProperty(name: string, index: string, column?: ColumnDescription) {
    const value: PrimitiveValue = {
      displayValue: "",
      value: index,
      valueFormat: PropertyValueFormat.Primitive,
    };

    const description: PropertyDescription = {
      displayLabel: name,
      name,
      typename: StandardTypeNames.Enum,
    };

    const propertyRecord = new PropertyRecord(value, description);
    propertyRecord.isReadonly = false;
    propertyRecord.property.enum = {
      choices: [
        { label: "Yellow", value: "yellow" },
        { label: "Red", value: "red" },
        { label: "Green", value: "green" },
      ],
      isStrict: false,
    };

    if (column)
      column.propertyDescription = description;

    return propertyRecord;
  }
  // eslint-disable-next-line deprecation/deprecation
  public static createEnumProperty(name: string, index: string | number, column?: ColumnDescription) {
    const value: PrimitiveValue = {
      displayValue: name,
      value: index,
      valueFormat: PropertyValueFormat.Primitive,
    };

    const description: PropertyDescription = {
      displayLabel: name,
      name,
      typename: StandardTypeNames.Enum,
    };

    const getChoices = async () => {
      return [
        { label: "Yellow", value: 0 },
        { label: "Red", value: 1 },
        { label: "Green", value: 2 },
        { label: "Blue", value: 3 },
      ];
    };

    const propertyRecord = new PropertyRecord(value, description);
    propertyRecord.isReadonly = false;
    propertyRecord.property.enum = { choices: getChoices(), isStrict: false };

    if (column)
      column.propertyDescription = description;

    return propertyRecord;
  }

  public static blueEnumValueIsEnabled = true;
  public static toggleBlueEnumValueEnabled() { TestUtils.blueEnumValueIsEnabled = !TestUtils.blueEnumValueIsEnabled; }
  public static addEnumButtonGroupEditorSpecification(propertyRecord: PropertyRecord) {
    propertyRecord.property.editor = {
      name: "enum-buttongroup",
      params: [{
        type: PropertyEditorParamTypes.ButtonGroupData,
        buttons: [
          { iconSpec: "icon-yellow" },
          { iconSpec: "icon-red" },
          { iconSpec: "icon-green" },
          {
            iconSpec: "icon-blue",
            isEnabledFunction: () => TestUtils.blueEnumValueIsEnabled,
          },
        ],
      } as ButtonGroupEditorParams,
      ],
    };
  }

  public static createBooleanProperty(name: string, booleanValue: boolean, editor?: string) {
    const value: PrimitiveValue = {
      displayValue: "",
      value: booleanValue,
      valueFormat: PropertyValueFormat.Primitive,
    };

    const description: PropertyDescription = {
      displayLabel: name,
      name,
      typename: StandardTypeNames.Boolean,
      editor: editor ? { name: editor } : undefined,
    };

    const propertyRecord = new PropertyRecord(value, description);
    propertyRecord.isReadonly = false;

    return propertyRecord;
  }

  public static createImageCheckBoxProperty(name: string, booleanValue: boolean) {
    const value: PrimitiveValue = {
      displayValue: "",
      value: booleanValue,
      valueFormat: PropertyValueFormat.Primitive,
    };

    const description: PropertyDescription = {
      displayLabel: name,
      name,
      typename: StandardTypeNames.Boolean,
    };
    const propertyRecord = new PropertyRecord(value, description);
    propertyRecord.property.editor = {
      name: "image-check-box",
      params: [{
        type: PropertyEditorParamTypes.CheckBoxImages,
        imageOff: "icon-visibility-hide-2",
        imageOn: "icon-visibility",
      } as ImageCheckBoxParams,
      ],
    };
    propertyRecord.isReadonly = false;
    return propertyRecord;
  }

  private static _formatLength = (numberValue: number): string => numberValue.toFixed(2);

  public static createCustomNumberProperty(propertyName: string, numVal: number, displayVal?: string, editorParams?: BasePropertyEditorParams[]) {

    const value: PrimitiveValue = {
      displayValue: displayVal,
      value: numVal,
      valueFormat: PropertyValueFormat.Primitive,
    };

    const description: PropertyDescription = {
      name: propertyName,
      displayLabel: propertyName,
      typename: StandardTypeNames.Number,
      editor: {
        name: StandardEditorNames.NumberCustom,
        params: [
          {
            type: PropertyEditorParamTypes.CustomFormattedNumber,
            formatFunction: TestUtils._formatLength,
            parseFunction: (stringValue: string): ParseResults => {
              const rtnValue = Number.parseFloat(stringValue);
              if (Number.isNaN(rtnValue)) {
                return { parseError: `Unable to parse ${stringValue} into a valid length` };
              } else {
                return { value: rtnValue };
              }
            },
          } as CustomFormattedNumberParams,
        ],
      },
    };

    if (editorParams) {
      editorParams.forEach((params: BasePropertyEditorParams) => {
        description.editor!.params!.push(params);
      });
    }

    const propertyRecord = new PropertyRecord(value, description);
    propertyRecord.isReadonly = false;
    return propertyRecord;
  }

  public static createNumericProperty(propertyName: string, numericValue: number, editorName: string, editorParams?: BasePropertyEditorParams[]) {

    const value: PrimitiveValue = {
      displayValue: "",
      value: numericValue,
      valueFormat: PropertyValueFormat.Primitive,
    };

    const description: PropertyDescription = {
      name: propertyName,
      displayLabel: propertyName,
      typename: StandardTypeNames.Number,
      editor: {
        name: editorName,
        params: editorParams,
      },
    };

    const propertyRecord = new PropertyRecord(value, description);
    propertyRecord.isReadonly = false;
    return propertyRecord;
  }

  public static createNavigationProperty(
    name: string,
    value: Primitives.InstanceKey,
    displayValue?: string,
  ): PropertyRecord {
    const property = TestUtils.createPrimitiveStringProperty(name, "", displayValue);
    property.property.typename = StandardTypeNames.Navigation;
    (property.value as PrimitiveValue).value = value;
    return property;
  }

  public static createURIProperty(
    name: string,
    value: string,
    displayValue?: string,
  ): PropertyRecord {
    const property = TestUtils.createPrimitiveStringProperty(name, value, displayValue);
    property.property.typename = StandardTypeNames.URL;
    return property;
  }
}

/** @internal */
// eslint-disable-next-line deprecation/deprecation
export class TestFilterableTable implements FilterableTable {
  private _filterDescriptors = new TableFilterDescriptorCollection();
  // eslint-disable-next-line deprecation/deprecation
  private _columnDescriptions: ColumnDescription[];

  // eslint-disable-next-line deprecation/deprecation
  constructor(colDescriptions: ColumnDescription[]) {
    this._columnDescriptions = colDescriptions;
  }

  /** Gets the description of a column within the table. */
  // eslint-disable-next-line deprecation/deprecation
  public getColumnDescription(columnKey: string): ColumnDescription | undefined {
    // eslint-disable-next-line deprecation/deprecation
    return this._columnDescriptions.find((v: ColumnDescription) => v.key === columnKey);
  }

  /** Gets the filter descriptors for the table. */
  // eslint-disable-next-line deprecation/deprecation
  public get filterDescriptors(): CompositeFilterDescriptorCollection {
    return this._filterDescriptors;
  }

  /** Gets ECExpression to get property display value. */
  public getPropertyDisplayValueExpression(property: string): string {
    return property;
  }
}

/** @internal */
export class MineDataController extends DataControllerBase {
  public override async validateValue(_newValue: PropertyValue, _record: PropertyRecord): Promise<AsyncValueProcessingResult> {
    return { encounteredError: true, errorMessage: { severity: MessageSeverity.Error, briefMessage: "Test" } };
  }
}

/**
 * Simplified type for `sinon.SinonSpy`.
 * @internal
 */
export type SinonSpy<T extends (...args: any) => any> = sinon.SinonSpy<Parameters<T>, ReturnType<T>>;

export default TestUtils;   // eslint-disable-line: no-default-export
