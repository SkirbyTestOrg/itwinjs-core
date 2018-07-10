/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
const fs = require("fs");
const path = require("path");

const ensureDirectoryExists = (directoryPath) => {
  const createDirs = [];
  let currDir = directoryPath;
  while (!fs.existsSync(currDir)) {
    createDirs.push(currDir);
    currDir = path.resolve(currDir, "../");
  }
  createDirs.reverse().forEach((dir) => fs.mkdirSync(dir));
};

module.exports = {
  ensureDirectoryExists,
}
