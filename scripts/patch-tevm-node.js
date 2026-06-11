#!/usr/bin/env node
// Patches @tevm/node/dist/index.js to replace the top-level `import { existsSync, readFileSync } from 'fs'`
// with no-op stubs. The real fs functions are only used for the
// `persistedCheckpointPath` option which is never exercised in the browser.
const { readFileSync, writeFileSync } = require("fs");
const { resolve } = require("path");

const target = resolve(__dirname, "../node_modules/@tevm/node/dist/index.js");

const ORIGINAL = `import { existsSync, readFileSync } from 'fs';`;
const REPLACEMENT = `// patched by scripts/patch-tevm-node.js — browser-safe no-ops for fs
const existsSync = () => false;
const readFileSync = () => '';`;

let src = readFileSync(target, "utf8");
if (src.includes(ORIGINAL)) {
  src = src.replace(ORIGINAL, REPLACEMENT);
  writeFileSync(target, src, "utf8");
  console.log("✓ Patched @tevm/node/dist/index.js");
} else if (src.includes("patched by scripts/patch-tevm-node.js")) {
  console.log("✓ @tevm/node already patched, skipping");
} else {
  console.warn("⚠ Could not find expected import in @tevm/node/dist/index.js — patch may be outdated");
}
