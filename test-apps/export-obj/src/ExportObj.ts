/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2019 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { ExportGraphicsInfo, IModelHost, IModelDb, ECSqlStatement } from "@bentley/imodeljs-backend";
import { OpenMode, DbResult, Id64Array } from "@bentley/bentleyjs-core";
import { ColorDef } from "@bentley/imodeljs-common";
import * as fs from "fs";
import * as Yargs from "yargs";
import * as path from "path";

function doExport(iModelName: string, objName: string, mtlName: string) {
  IModelHost.startup();

  const iModel: IModelDb = IModelDb.openStandalone(iModelName, OpenMode.Readonly);
  process.stdout.write(`Opened ${iModelName} successfully.\n`);

  const objFile = fs.openSync(objName, "w");
  const mtlFile = fs.openSync(mtlName, "w");
  process.stdout.write(`Writing to ${objName} and ${mtlName}.\n`);

  const elementIdArray: Id64Array = [];
  iModel.withPreparedStatement("SELECT ECInstanceId FROM bis.GeometricElement3d", (stmt: ECSqlStatement) => {
    while (stmt.step() === DbResult.BE_SQLITE_ROW) {
      elementIdArray.push(stmt.getValue(0).getId());
    }
  });

  process.stdout.write(`Processing ${elementIdArray.length} elements...\n`);
  if (elementIdArray.length === 0)
    return;

  const materialMap = new Map<number, string>();
  let pointOffset = 1;

  const onGraphics = (info: ExportGraphicsInfo) => {
    let materialName = materialMap.get(info.color);
    if (materialName === undefined) {
      materialName = `Material${materialMap.size}`;
      materialMap.set(info.color, materialName);
    }
    fs.appendFileSync(objFile, `usemtl ${materialName}\n`);

    fs.appendFileSync(objFile, `g ${info.elementId}\n`);

    const p: Float64Array = info.mesh.points;
    for (let i = 0; i < p.length; i += 3)
      fs.appendFileSync(objFile, `v ${p[i].toFixed(3)} ${p[i + 1].toFixed(3)} ${p[i + 2].toFixed(3)}\n`);

    const n: Float32Array = info.mesh.normals;
    for (let i = 0; i < n.length; i += 3)
      fs.appendFileSync(objFile, `vn ${n[i].toFixed(3)} ${n[i + 1].toFixed(3)} ${n[i + 2].toFixed(3)}\n`);

    const uv: Float32Array = info.mesh.params;
    for (let i = 0; i < uv.length; i += 2)
      fs.appendFileSync(objFile, `vt ${uv[i].toFixed(3)} ${uv[i + 1].toFixed(3)}\n`);

    const indices = info.mesh.indices;
    for (let i = 0; i < indices.length; i += 3) {
      const p1 = pointOffset + indices[i];
      const p2 = pointOffset + indices[i + 1];
      const p3 = pointOffset + indices[i + 2];
      fs.appendFileSync(objFile, `f ${p1}/${p1}/${p1} ${p2}/${p2}/${p2} ${p3}/${p3}/${p3}\n`);
    }

    pointOffset += info.mesh.points.length / 3;

    return true;
  };

  fs.appendFileSync(objFile, `mtllib ${mtlName}\n`);
  iModel.exportGraphics(({ onGraphics, elementIdArray, chordTol: 0.01 }));
  process.stdout.write(`Wrote ${pointOffset} vertices.\n`);
  fs.closeSync(objFile);

  materialMap.forEach((materialName: string, color: number) => {
    fs.appendFileSync(mtlFile, `newmtl ${materialName}\n`);
    const rawColors = new ColorDef(color).colors;
    fs.appendFileSync(mtlFile, `Kd ${(rawColors.r / 255).toFixed(2)} ${(rawColors.g / 255).toFixed(2)} ${(rawColors.b / 255).toFixed(2)}\n`);
    if (rawColors.t !== 0)
      fs.appendFileSync(mtlFile, `Tr ${(rawColors.t / 255).toFixed(2)}\n`);
  });
  fs.closeSync(mtlFile);
}

interface ExportObjArgs {
  input: string;
  output: string;
}

try {
  Yargs.usage("Export an OBJ from an existing IBIM file.");
  Yargs.required("input", "The input IBIM");
  Yargs.required("output", "The output OBJ file");
  const args = Yargs.parse() as Yargs.Arguments<ExportObjArgs>;

  const parsedOutput = path.parse(args.output);
  const mtlName = path.join(parsedOutput.dir, `${parsedOutput.name}.mtllib`);

  doExport(args.input, args.output, mtlName);
} catch (error) {
  process.stdout.write(error.message + "\n" + error.stack);
}
