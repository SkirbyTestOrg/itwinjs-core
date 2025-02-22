/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/* eslint-disable deprecation/deprecation */
/** @packageDocumentation
 * @module Form
 */

import * as React from "react";
import { Checkbox, Input, Select, SelectOption, Textarea } from "@itwin/itwinui-react";
import { FieldDef, FormContext, FormContextState } from "./Form";

// cSpell:ignore multilinetextbox

/** Properties used to create a [[Field]] in a [[Form]]
 * @public @deprecated
 */
export interface FieldProps extends FieldDef {
  /* The unique field name */
  id: string;
}

type FieldDefOptions = FieldDef["options"];

/** Component that represents a single field in an input form. Only four type of editors are supported. Field gets/sets state data from/to the context control by the form.
 * @public @deprecated
 */
export class Field extends React.Component<FieldProps> {
  constructor(props: FieldProps) {
    super(props);
  }

  private _generateSelectOptions = (propOptions: FieldDefOptions): SelectOption<string>[] => {
    let selectOptions: SelectOption<string>[] = [];

    if (propOptions instanceof Array) {
      selectOptions = propOptions.map((option: string) => (
        { value: option, label: option }
      ));
    } else if (propOptions !== undefined) {
      selectOptions = Object.keys(propOptions).map((key) => (
        { value: key, label: propOptions[key] }
      ));
    }

    return selectOptions;
  };

  public override render() {
    const selectOptions = this._generateSelectOptions(this.props.options);

    return (
      <FormContext.Consumer>
        {(context: FormContextState | undefined) => (
          <div className="core-form-group">
            {this.props.editor!.toLowerCase() !== "checkbox" && this.props.label && <label className="core-form-label" htmlFor={this.props.id}>{this.props.label}</label>}

            {this.props.editor!.toLowerCase() === "textbox" && (
              <Input
                id={this.props.id}
                value={context!.values[this.props.id]}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => context!.setValues({ [this.props.id]: event.currentTarget.value })}
                className="core-form-input"
                size="small"
              />
            )}
            {this.props.editor!.toLowerCase() === "checkbox" && (
              <Checkbox
                label={this.props.label}
                id={this.props.id}
                checked={context!.values[this.props.id]}
                onChange={() => context!.setValues({ [this.props.id]: !context!.values[this.props.id] })}
              />
            )}
            {this.props.editor!.toLowerCase() === "multilinetextbox" && (
              <Textarea
                id={this.props.id}
                value={context!.values[this.props.id]}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => context!.setValues({ [this.props.id]: event.currentTarget.value })}
                className="core-form-textarea"
              />
            )}
            {this.props.editor!.toLowerCase() === "dropdown" && this.props.options && (
              <Select
                id={this.props.id}
                // name={this.props.id}
                value={context!.values[this.props.id]}
                onChange={(newValue: any) => context!.setValues({ [this.props.id]: newValue })}
                options={selectOptions}
                className="core-form-select"
                size="small"
              />
            )}
          </div>
        )}
      </FormContext.Consumer>
    );
  }
}
