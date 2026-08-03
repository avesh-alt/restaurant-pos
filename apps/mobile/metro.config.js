const path = require("path");

const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, "node_modules"),
  path.join(workspaceRoot, "node_modules"),
];
config.resolver.extraNodeModules = {
  buffer: path.join(workspaceRoot, "node_modules", "buffer"),
  events: path.join(workspaceRoot, "node_modules", "events"),
  "path-browserify": path.join(workspaceRoot, "node_modules", "path-browserify"),
  querystring: path.join(workspaceRoot, "node_modules", "querystring"),
  "stream-browserify": path.join(workspaceRoot, "node_modules", "stream-browserify"),
  process: path.join(workspaceRoot, "node_modules", "process"),
  punycode: path.join(workspaceRoot, "node_modules", "punycode"),
  url: path.join(workspaceRoot, "node_modules", "url"),
  util: path.join(workspaceRoot, "node_modules", "util"),
};

module.exports = config;
