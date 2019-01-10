/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

// This script copies the imodeljs modules (and specific others, such as React) that this module depends on
// to the specified directory.
const path = require("path");
const fs = require("fs-extra")
const argv = require("yargs").argv;
// the arguments are --package={packagefile}
//                   --destDir={destination directory}
//                   -- type={dev|prod}

function makeModulePath(localNodeModules, moduleName, relativePath) {
  return path.resolve(localNodeModules, moduleName, relativePath);
}

function makeBentleyModulePath(localNodeModules, moduleName, isDev) {
  return path.resolve(localNodeModules, moduleName, isDev ? "lib/module/dev" : "lib/module/prod");
}

function getBentleyVersionString(localNodeModules, moduleName, buildType) {
  if (buildType !== "prod") {
    return "-latest"
  } else {
    const packageFileName = path.resolve(localNodeModules, moduleName, "./package.json");
    const packageFileContents = fs.readFileSync(packageFileName, "utf8");

    // parse it
    const package = JSON.parse(packageFileContents);
    return package.version;
  }
}


function isFile(fileName) {
  fs.statSync(fileName);
}

function linkRecursive(sourceDirectory, outputDirectory) {
  const entries = fs.readdirSync(sourceDirectory);
  // first go through and link all the files.
  for (thisEntry of entries) {
    sourceFile = path.resolve(sourceDirectory, thisEntry);
    const stats = fs.statSync(sourceFile);
    if (stats.isFile()) {
      outputFile = path.resolve(outputDirectory, thisEntry);
      if (fs.existsSync(outputFile)) {
        console.log("file", outputFile, "already exists, not linking.");
      } else {
        fs.symlinkSync(sourceFile, outputFile);
      }
    }
  }

  // then go through and do all the subdirectories.
  for (thisEntry of entries) {
    sourceSubDirectory = path.resolve(sourceDirectory, thisEntry);
    const stats = fs.statSync(sourceSubDirectory);
    if (stats.isDirectory()) {
      // go through the subdirectory
      outputSubDirectory = path.resolve(outputDirectory, thisEntry);
      if (!fs.existsSync(outputSubDirectory))
        fs.mkdirSync(outputSubDirectory, { recursive: true });
      linkRecursive(sourceSubDirectory, outputSubDirectory);
    }
  }
}

function linkStaticFiles(sourceDirectory, outputDirectory) {
  const sourceStaticDirectory = path.resolve(sourceDirectory, "static");
  if (fs.existsSync(sourceStaticDirectory)) {
    const outStaticDirectory = path.resolve(outputDirectory, "static");
    if (!fs.existsSync(outStaticDirectory))
      fs.mkdirSync(outStaticDirectory);
    linkRecursive(sourceStaticDirectory, outStaticDirectory);
  }
}

function linkPublicStaticFiles(sourcePublicDirectory, outputPublicDirectory) {
  console.log("linkPublicStaticFiles", sourcePublicDirectory, outputPublicDirectory);
  if (fs.existsSync(sourcePublicDirectory)) {
    linkRecursive(sourcePublicDirectory, outputPublicDirectory);
  }
}

function linkModuleFile(moduleSourceFile, outFilePath) {
  if (fs.existsSync(outFilePath)) {
    console.log("file", outFilePath, "already exists, skipping");
  } else {
    console.log("linking .js file", moduleSourceFile, "to", outFilePath);
    fs.symlinkSync(moduleSourceFile, outFilePath);
  }
  // if there's a map file, link that, too.
  const mapFile = moduleSourceFile + ".map";
  const outMapFile = outFilePath + ".map";
  if (fs.existsSync(mapFile) && !fs.existsSync(outMapFile)) {
    fs.symlinkSync(mapFile, outMapFile);
    console.log("linking .js.map file", mapFile, "to", outMapFile);
  }
}

class ModuleInfo {
  constructor(inRushRepo, moduleName, moduleSourceFile, publicResourceDirectory) {
    this.inRushRepo = inRushRepo;
    this.moduleName = moduleName;
    this.moduleSourceFile = moduleSourceFile;
    this.publicResourceDirectory = publicResourceDirectory;
  }
}

// these are the modules that we have specified as externals when we webpack
function main() {
  const packageFileName = (argv.packageFile === undefined) ? "./package.json" : argv.packageFile;
  const buildType = (argv.type == undefined) ? "dev" : argv.type;
  const isDev = buildType === "dev";
  const localNodeModules = path.resolve(process.cwd(), "node_modules");
  if (!fs.existsSync(localNodeModules)) {
    console.log("Local node modules directory", localNodeModules, "does not exist, aborting");
    return;
  }

  const externalModules = [
    new ModuleInfo(true, "@bentley/bentleyjs-core", undefined),
    new ModuleInfo(true, "@bentley/geometry-core", undefined),
    new ModuleInfo(false, "@bentley/bwc", makeModulePath(localNodeModules, "@bentley/bwc", isDev ? "lib/module/dev/bwc.js" : "lib/module/prod/bwc.js")),
    new ModuleInfo(true, "@bentley/imodeljs-i18n", undefined),
    new ModuleInfo(true, "@bentley/imodeljs-clients", undefined),
    new ModuleInfo(true, "@bentley/imodeljs-common", undefined),
    new ModuleInfo(true, "@bentley/imodeljs-quantity", undefined),
    new ModuleInfo(true, "@bentley/imodeljs-frontend", undefined, "lib/public"),
    new ModuleInfo(true, "@bentley/ui-core", undefined, "lib/public"),
    new ModuleInfo(true, "@bentley/ui-components", undefined, "lib/public"),
    new ModuleInfo(true, "@bentley/ui-framework", undefined, "lib/public"),
    new ModuleInfo(true, "@bentley/ui-ninezone", undefined),
    new ModuleInfo(true, "@bentley/presentation-common", undefined),
    new ModuleInfo(true, "@bentley/presentation-components", undefined),
    new ModuleInfo(true, "@bentley/presentation-frontend", undefined),
    new ModuleInfo(false, "react", makeModulePath(localNodeModules, "react", isDev ? "umd/react.development.js" : "umd/react.production.min.js")),
    new ModuleInfo(false, "react-dnd", makeModulePath(localNodeModules, "react-dnd", isDev ? "dist/ReactDnd.js" : "dist/ReactDnD.min.js")),
    new ModuleInfo(false, "react-dnd-html5-backend", makeModulePath(localNodeModules, "react-dnd-html5-backend", isDev ? "dist/ReactDnDHTML5Backend.js" : "dist/ReactDnDHTML5Backend.min.js")),
    new ModuleInfo(false, "react-dom", makeModulePath(localNodeModules, "react-dom", isDev ? "umd/react-dom.development.js" : "umd/react-dom.production.min.js")),
    new ModuleInfo(false, "react-redux", makeModulePath(localNodeModules, "react-redux", isDev ? "dist/react-redux.js" : "dist/react-redux.min.js")),
    new ModuleInfo(false, "redux", makeModulePath(localNodeModules, "redux", isDev ? "dist/redux.js" : "dist/redux.min.js")),
    new ModuleInfo(false, "inspire-tree", makeModulePath(localNodeModules, "inspire-tree", isDev ? "dist/inspire-tree.js" : "dist/inspire-tree.min.js")),
    new ModuleInfo(false, "lodash", makeModulePath(localNodeModules, "lodash", isDev ? "lodash.js" : "lodash.min.js")),
  ];

  try {
    const outputDirectory = path.resolve(process.cwd(), argv.destDir);
    // create the output directory, if it doesn't exist.
    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, { recursive: true });
    }

    // open and read the package.json file.
    const packagePath = path.resolve(process.cwd(), packageFileName);
    const packageFileContents = fs.readFileSync(packagePath, "utf8");

    // parse it
    const package = JSON.parse(packageFileContents);
    for (const dependent in package.dependencies) {
      // see if it matches one of our externals.
      for (const externalModule of externalModules) {
        if (dependent === externalModule.moduleName) {
          // yes, link the file.
          let fileName = "";
          let moduleSourceFile = undefined;
          let versionString = undefined;
          if (externalModule.inRushRepo) {
            // These are our iModelJs modules. Get the version from the package.json file.
            versionString = getBentleyVersionString(localNodeModules, externalModule.moduleName, buildType);
            const modulePath = makeBentleyModulePath(localNodeModules, externalModule.moduleName, isDev);
            fileName = externalModule.moduleName.slice(9) + ".js";
            moduleSourceFile = path.resolve(modulePath, fileName);
          } else {
            moduleSourceFile = externalModule.moduleSourceFile; // we stored the correct source file name in the externalModules object.
            if (0 === externalModule.moduleName.indexOf("@bentley")) {
              // this is for @bentley/bwc -
              fileName = externalModule.moduleName.slice(9) + ".js";
            }
            else {
              fileName = externalModule.moduleName + ".js";
            }
          }
          if (!fs.existsSync(moduleSourceFile)) {
            console.log("problem: File", moduleSourceFile, "does not exist");
          } else {
            let outFilePath = undefined;
            if (versionString) {
              // create subdirectory if needed.
              const outSubDirectory = path.resolve(outputDirectory, "v" + versionString);
              if (!fs.existsSync(outSubDirectory)) {
                fs.mkdirSync(outSubDirectory, { recursive: true });
              }
              outFilePath = path.resolve(outSubDirectory, fileName)
            } else {
              outFilePath = path.resolve(outputDirectory, fileName);
            }
            linkModuleFile(moduleSourceFile, outFilePath);
            if (externalModule.publicResourceDirectory) {
              const publicPath = path.resolve(localNodeModules, externalModule.moduleName, externalModule.publicResourceDirectory);
              linkPublicStaticFiles(publicPath, outputDirectory);
            }
            // found dependent in list of external, no need to look at the rest of the externals.
            break;
          }
        }
      }
    }

    // link the IModelJsLoader.js from imodeljs/frontend also.
    const loaderPath = makeBentleyModulePath(localNodeModules, "@bentley/imodeljs-frontend", isDev);
    const loaderFile = path.resolve(loaderPath, "IModelJsLoader.js");
    const outFilePath = path.resolve(outputDirectory, "IModelJsLoader.js");
    linkModuleFile(loaderFile, outFilePath);
  } catch (e) {
    console.log("Error", e);
  }
}

main();
