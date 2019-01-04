/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { NavigationValue } from "@bentley/imodeljs-common";
import { Id64String } from "@bentley/bentleyjs-core";
// tslint:disable:no-console

async function executeECSql_SampleMethod(iModel: IModelConnection): Promise<void> {
  {
    // __PUBLISH_EXTRACT_START__ ExecuteECSql_Binding_Positional
    const rows: any[] = await iModel.executeQuery("SELECT ECInstanceId,ECClassId,Parent,LastMod FROM bis.Element WHERE CodeValue=? AND LastMod>=?",
      ["MyCode", "2018-01-01T12:00:00Z"]);
    // ...
    // __PUBLISH_EXTRACT_END__
    console.log(rows);
  }

  {
    // __PUBLISH_EXTRACT_START__ ExecuteECSql_Binding_Named
    const rows: any[] = await iModel.executeQuery("SELECT ECInstanceId,ECClassId,Parent,LastMod FROM bis.Element WHERE CodeValue=:code AND LastMod>=:lastmod",
      { code: "MyCode", lastmod: "2018-01-01T12:00:00Z" });

    // ...
    // __PUBLISH_EXTRACT_END__
    console.log(rows);
  }

  {
    // __PUBLISH_EXTRACT_START__ ExecuteECSql_Binding_Navigation
    const rows: any[] = await iModel.executeQuery("SELECT ECInstanceId FROM bis.Element WHERE Parent=?", [{ id: "0x132" }]);
    // ...
    // __PUBLISH_EXTRACT_END__
    console.log(rows);
  }

  {
    // __PUBLISH_EXTRACT_START__ ExecuteECSql_Binding_NavigationId
    const rows: any[] = await iModel.executeQuery("SELECT ECInstanceId FROM bis.Element WHERE Parent.Id=?", ["0x132"]);
    // ...
    // __PUBLISH_EXTRACT_END__
    console.log(rows);
  }

  {
    // __PUBLISH_EXTRACT_START__ ExecuteECSql_Binding_Struct
    const rows: any[] = await iModel.executeQuery("SELECT Name FROM myschema.Company WHERE Location=?", [{ street: "7123 Main Street", zip: 30211 }]);
    // ...
    // __PUBLISH_EXTRACT_END__
    console.log(rows);
  }

  {
    // __PUBLISH_EXTRACT_START__ ExecuteECSql_Binding_StructMembers
    const rows: any[] = await iModel.executeQuery("SELECT Name FROM myschema.Company WHERE Location.Street=? AND Location.Zip=?", ["7123 Main Street", 32443]);
    // ...
    // __PUBLISH_EXTRACT_END__
    console.log(rows);
  }

  {
    // __PUBLISH_EXTRACT_START__ ExecuteECSql_Binding_Array
    const rows: any[] = await iModel.executeQuery("SELECT Name FROM myschema.Company WHERE PhoneNumbers=?", [["+16134584201", "+16134584202", "+16134584222"]]);
    // ...
    // __PUBLISH_EXTRACT_END__
    console.log(rows);
  }

  {
    // __PUBLISH_EXTRACT_START__ ExecuteECSql_IllustrateRowFormat
    const rows: any[] = await iModel.executeQuery("SELECT ECInstanceId,ECClassId,Parent,LastMod FROM bis.Element WHERE Model.Id=?", ["0x113"]);
    for (const row of rows) {
      console.log(JSON.stringify(row));
    }
    // __PUBLISH_EXTRACT_END__
  }

  {
    // __PUBLISH_EXTRACT_START__ ExecuteECSql_WorkingWithRowFormat
    const rows: any[] = await iModel.executeQuery("SELECT ECInstanceId,ECClassId,Parent,LastMod FROM bis.Element WHERE Model.Id=?", ["0x113"]);
    console.log("ECInstanceId | ClassName | Parent Id | Parent RelClassName | LastMod");
    for (const row of rows) {
      const id: Id64String = row.id;
      const className: string = row.className;
      const parent: NavigationValue = row.parent;
      const lastMod: string = row.lastMod;

      console.log(id + "|" + className + "|" + parent.id + "|" + parent.relClassName + "|" + lastMod);
    }
    // __PUBLISH_EXTRACT_END__
  }
}

const dummyIModel: IModelConnection = {} as IModelConnection;
executeECSql_SampleMethod(dummyIModel).catch(() => { });
