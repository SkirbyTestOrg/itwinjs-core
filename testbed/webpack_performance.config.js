const path = require("path");
const glob = require("glob");

module.exports = {
  entry: glob.sync(path.resolve(__dirname, "lib/frontend/performance/*.test.js")),
  output: {
    path: path.resolve(__dirname, "lib/dist"),
    filename: "testbed.js",
    devtoolModuleFilenameTemplate: "file:///[absolute-resource-path]"
  },
  devtool: "nosources-source-map",
  module: {
    rules: [
      {
        test: /\.js$/,
        use: "source-map-loader",
        enforce: "pre"
      },
      {
        test: /azure-storage|AzureFileHandler/,
        use: "null-loader"
      }
    ]
  },
  stats: "errors-only"
};
