/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import classnames from "classnames";
import Select, {
  ClearIndicatorProps, components, ControlProps, DropdownIndicatorProps, GroupBase, MenuProps, MultiValueGenericProps, MultiValueProps,
  MultiValueRemoveProps, OptionProps, Props, ValueContainerProps,
} from "react-select";
import { SvgCaretDown, SvgCheckmarkSmall, SvgCloseSmall } from "@itwin/itwinui-icons-react";

export function MultiTagSelect<Option>(props: Props<Option, true, GroupBase<Option>>) {
  return <Select
    {...props}
    styles={{
      control: () => ({display: "grid", gridTemplateColumns: "auto auto", height: "41px", padding: "0 12px"}),
      menu: () => ({position: "absolute", zIndex: 9999}),
      option: () => ({}),
      input: (style) => ({...style, order: -1, flex: 0}),
      valueContainer: (style) => ({...style, padding: 0, flexWrap: "nowrap"}),
      indicatorsContainer: () => ({marginLeft: "auto", display: "flex"}),
      multiValue: (style) => ({...style, margin: 0}),
    }}
    components={{
      Control: TagSelectControl,
      Menu: TagSelectMenu,
      ValueContainer: TagSelectValueContainer,
      MultiValue: TagMultiValue,
      Option: TagSelectOption,
      DropdownIndicator: TagSelectDropdownIndicator,
      ClearIndicator: TagSelectClearIndicator,
    }}
    isMulti={true}
  />;
}

function TagSelectControl<Option>({children, ...props}: ControlProps<Option, true, GroupBase<Option>>) {
  return <components.Control {...props} className="iui-select-button">
    {children}
  </components.Control>;
}

function TagSelectMenu<Option>({children, ...props}: MenuProps<Option, true, GroupBase<Option>>) {
  return <components.Menu {...props} className="iui-menu">
    {children}
  </components.Menu>;
}

function TagSelectOption<Option>({children: _, ...props}: OptionProps<Option, true, GroupBase<Option>>) {
  const className = classnames("iui-menu-item", {
    "iui-focused": props.isFocused,
    "iui-active": props.isSelected,
  });

  return <components.Option {...props} className={className}>
    {/* <Checkbox checked={props.isSelected} readOnly={true} label={props.selectProps.getOptionLabel(props.data)} /> */}
    <span>{props.selectProps.getOptionLabel(props.data)}</span>
    {props.isSelected && <span className="iui-icon" style={{marginLeft: "auto"}}><SvgCheckmarkSmall /></span>}
  </components.Option>;
}

function TagSelectValueContainer<Option>({children, ...props}: ValueContainerProps<Option, true, GroupBase<Option>>) {
  return <components.ValueContainer {...props} className="iui-content">
    {children}
  </components.ValueContainer>;
}

function TagMultiValue<Option>({children, ...props}: MultiValueProps<Option, true, GroupBase<Option>>) {
  return <components.MultiValue
    {...props}
    components={{
      Container: TagContainer,
      Label: TagLabel,
      Remove: TagRemove,
    }}
  >
    {children}
  </components.MultiValue>;
}

function TagContainer<Option>({children, ...props}: MultiValueGenericProps<Option, true, GroupBase<Option>>) {
  return <components.MultiValueContainer {...props} innerProps={{...props.innerProps, className:"iui-tag"}}>
    {children}
  </components.MultiValueContainer>;
}

function TagLabel<Option>({children, ...props}: MultiValueGenericProps<Option, true, GroupBase<Option>>) {
  return <components.MultiValueLabel {...props} innerProps={{...props.innerProps, className:"iui-label"}}>
    {children}
  </components.MultiValueLabel>;
}

function TagRemove<Option>(props: MultiValueRemoveProps<Option, true, GroupBase<Option>>) {
  return <components.MultiValueRemove {...props} innerProps={{...props.innerProps, className: "iui-button iui-borderless iui-small"}}>
    <SvgCloseSmall className="iui-button-icon" aria-hidden/>
  </components.MultiValueRemove>;
}

function TagSelectDropdownIndicator<Option>({children: _, ...props}: DropdownIndicatorProps<Option, true, GroupBase<Option>>) {
  return <components.DropdownIndicator {...props} >
    <span data-testid="multi-tag-select-dropdownIndicator" className="iui-end-icon iui-actionable" style={{padding: 0}}>
      <SvgCaretDown />
    </span>
  </components.DropdownIndicator>;
}

function TagSelectClearIndicator<Option>({children: _, ...props}: ClearIndicatorProps<Option, true, GroupBase<Option>>) {
  return <components.ClearIndicator {...props} >
    <span data-testid="multi-tag-select-clearIndicator" className="iui-end-icon iui-actionable" style={{padding: 0}}>
      <SvgCloseSmall aria-hidden/>
    </span>
  </components.ClearIndicator>;
}
