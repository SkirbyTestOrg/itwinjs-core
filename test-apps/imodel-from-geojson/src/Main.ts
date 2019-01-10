/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import * as yargs from "yargs";
import { Logger } from "@bentley/bentleyjs-core";
import { IModelHost } from "@bentley/imodeljs-backend";
import { GeoJson } from "./GeoJson";
import { GeoJsonImporter } from "./GeoJsonImporter";

interface Args {
  input: string;
  output: string;
}

/** Use [yargs](https://www.npmjs.com/package/yargs) to validate and extract command line options. */
const argv: yargs.Arguments<Args> = yargs
  .usage("Usage: $0 --input [GeomJsonFileName] --output [iModelFileName]")
  .describe("input", "Input GeoJSON file name")
  .string("input")
  .alias("input", "i")
  .describe("output", "Output iModel file name")
  .string("output")
  .alias("output", "o")
  .demandOption(["input", "output"])
  .argv;

IModelHost.startup();
Logger.initializeToConsole();

const geoJson = new GeoJson(argv.input as string);
const importer = new GeoJsonImporter(argv.output as string, geoJson);
importer.import();

IModelHost.shutdown();
