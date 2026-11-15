// Metro, the app's bundler. The standalone mode (task T8, src/local/) runs the API's own code from ../server/src inside the
// app, so Metro must be able to see that folder and the few packages the API uses (listed in server/test/portable-core.test.ts).
// Only these are watched, not the whole of server/node_modules. Nothing in the app imports src/local yet, so the website and
// the phone app bundles are unchanged.
const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const server = path.resolve(__dirname, "../server");

config.watchFolders = [
  ...(config.watchFolders ?? []),
  // skipped when missing (a checkout without `npm ci` in server/): only src/local needs them
  ...[
    path.join(server, "src"),
    ...["hono", "zod", "chess.js", "js-chess-engine", "@noble"].map((pkg) => path.join(server, "node_modules", pkg)),
    // the lessons and other content, bundled for standalone mode (src/local/content-files.generated.ts)
    path.resolve(__dirname, "../content"),
  ].filter((p) => fs.existsSync(p)),
];

module.exports = config;
