#!/usr/bin/env node
// Runs every tests/*.test.mjs with the built-in node:test runner. A tiny
// launcher instead of `node --test <glob>` because glob and directory handling
// of that flag differs between Node 20 and 22 and between shells.
import { readdirSync } from "node:fs";
import path from "node:path";
import { run } from "node:test";
import { spec } from "node:test/reporters";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const files = readdirSync(here)
  .filter((name) => name.endsWith(".test.mjs"))
  .filter((name) => !only.length || only.some((value) => name.includes(value)))
  .sort()
  .map((name) => path.join(here, name));

const stream = run({ files, concurrency: true, timeout: 180_000 });
stream.on("test:fail", () => { process.exitCode = 1; });
stream.compose(spec).pipe(process.stdout);
