#!/usr/bin/env node
// Prints the failing tests of a captured `npm test` log as GitHub Actions
// error annotations (at most ten, which is what one step may emit).
import { readFileSync } from "node:fs";

const lines = readFileSync(process.argv[2] || "test.log", "utf8").split(/\r?\n/);
const escape = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
let emitted = 0;
for (let index = 0; index < lines.length && emitted < 10; index += 1) {
  if (!/^\s*(✖|not ok\b)/.test(lines[index]) || /^\s*✖ failing tests/.test(lines[index])) continue;
  // A suite line is followed by its own failing children; keep leaf failures only.
  const next = lines[index + 1] || "";
  if (/^\s*(✖|✔|not ok\b|ok\b)/.test(next)) continue;
  const detail = lines.slice(index, index + 28).join("\n");
  console.log(`::error title=${escape(lines[index].trim().slice(0, 120))}::${escape(detail)}`);
  emitted += 1;
}
if (!emitted) console.log(`::error title=Tests failed::${escape(lines.slice(-40).join("\n"))}`);
