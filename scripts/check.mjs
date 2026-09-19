#!/usr/bin/env node
// Syntax-check every JavaScript file that ships: all *.mjs in the app root,
// bin/, scripts/ and tests/ (recursively), plus the browser bundle. New files are
// picked up automatically, so none can be forgotten.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function collect(directory, recursive) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (recursive && entry.name !== "node_modules") found.push(...collect(absolute, true));
    } else if (/[.]mjs$/.test(entry.name)) found.push(absolute);
  }
  return found;
}

const files = [
  ...collect(appRoot, false),
  ...collect(path.join(appRoot, "bin"), true),
  ...collect(path.join(appRoot, "scripts"), true),
  ...collect(path.join(appRoot, "tests"), true),
  ...[path.join(appRoot, "public", "app.js")].filter((file) => existsSync(file)),
].sort();

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed += 1;
    console.error(`✗ ${path.relative(appRoot, file)}\n${result.stderr}`);
  }
}
console.log(`${files.length - failed}/${files.length} files pass node --check`);
process.exit(failed ? 1 : 0);
