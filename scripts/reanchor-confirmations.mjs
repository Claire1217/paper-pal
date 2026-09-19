#!/usr/bin/env node
// Re-anchor review confirmations whose block moved or was edited around them.
//
// A block id is "<position>-<content hash>", and confirmations are matched by
// that id, so editing a paragraph orphans every confirmation inside it even
// when the reviewed sentence itself is untouched. The server now falls back to
// the content hash, which covers pure reordering. This script handles the
// remaining case: the reviewed quote still exists verbatim, but the block
// around it changed.
//
// Only unambiguous matches are repaired. A quote that occurs more than once, or
// no longer occurs at all, is left alone and reported.
//
// Usage: node scripts/reanchor-confirmations.mjs [--repo <project>] [--config <file>] [--apply] [--port 4317]
// Without --apply it reports what it would change and writes nothing. The
// server for the same project must be running on --port.

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadReviewConfig } from "../config.mjs";
import { resolveStateDir } from "../names.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const { repoRoot, port } = await loadReviewConfig({ appRoot, argv });
const statePath = path.join(resolveStateDir(repoRoot), "state.json");

function contentHash(blockId) {
  const [, hash] = String(blockId || "").split("-");
  return hash || null;
}

async function documentPayload(relativePath) {
  const url = `http://127.0.0.1:${port}/api/document?path=${encodeURIComponent(relativePath)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${relativePath}: ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`${relativePath}: ${payload.error}`);
  return payload;
}

let state;
try {
  state = JSON.parse(await fs.readFile(statePath, "utf8"));
} catch (error) {
  if (error?.code === "ENOENT") {
    console.log(`No review state found for ${repoRoot}; nothing to re-anchor.`);
    process.exit(0);
  }
  throw error;
}
const selections = Array.isArray(state.selections) ? state.selections : [];
const reviewed = selections.filter((item) => ["accepted", "human"].includes(item.status));
const paths = [...new Set(reviewed.map((item) => item.path))].sort();

const repaired = [];
const ambiguous = [];
const missing = [];

for (const relativePath of paths) {
  let payload;
  try {
    payload = await documentPayload(relativePath);
  } catch (error) {
    console.error(`  skipped ${relativePath}: ${error.message}`);
    continue;
  }
  const ids = new Set(payload.blocks.map((block) => block.id));
  const hashes = new Set(payload.blocks.map((block) => contentHash(block.id)));

  for (const selection of reviewed.filter((item) => item.path === relativePath)) {
    if (!selection.blockId) continue;
    if (ids.has(selection.blockId)) continue;
    if (hashes.has(contentHash(selection.blockId))) continue;

    const quote = String(selection.quote || "");
    if (!quote.trim()) {
      missing.push({ selection, reason: "no stored quote" });
      continue;
    }
    const hits = [];
    for (const block of payload.blocks) {
      const raw = payload.source.slice(block.start, block.end);
      let from = 0;
      for (;;) {
        const at = raw.indexOf(quote, from);
        if (at < 0) break;
        hits.push({ block, start: at, end: at + quote.length, raw });
        from = at + 1;
      }
    }
    if (!hits.length) {
      missing.push({ selection, reason: "quote no longer in the file" });
      continue;
    }
    if (hits.length > 1) {
      ambiguous.push({ selection, count: hits.length });
      continue;
    }
    const [hit] = hits;
    repaired.push({
      selection,
      from: selection.blockId,
      to: hit.block.id,
      quote: quote.slice(0, 60),
      next: {
        blockId: hit.block.id,
        blockIndex: hit.block.index,
        start: hit.start,
        end: hit.end,
        prefix: hit.raw.slice(Math.max(0, hit.start - 48), hit.start),
        suffix: hit.raw.slice(hit.end, Math.min(hit.raw.length, hit.end + 48)),
      },
    });
  }
}

console.log(`${reviewed.length} confirmations examined across ${paths.length} files`);
console.log(`  re-anchorable: ${repaired.length}`);
console.log(`  ambiguous (quote occurs more than once, left alone): ${ambiguous.length}`);
console.log(`  unrecoverable (text genuinely changed, correctly lapsed): ${missing.length}`);
for (const item of repaired) {
  console.log(`    ${item.from} -> ${item.to}  ${JSON.stringify(item.quote)}`);
}

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write the changes.");
  process.exit(0);
}
if (!repaired.length) {
  console.log("\nNothing to write.");
  process.exit(0);
}

const backup = `${statePath}.backup-before-reanchor`;
await fs.copyFile(statePath, backup);
for (const item of repaired) Object.assign(item.selection, item.next);
// Same write-temp-then-rename as the server, so a reader never sees half a file.
const temporary = `${statePath}.reanchor-${process.pid}-${randomBytes(6).toString("hex")}.tmp`;
await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
await fs.rename(temporary, statePath);
console.log(`\nRewrote ${repaired.length} anchors. Previous state saved to ${path.basename(backup)}.`);
console.log("Restart the server so it reloads the review state.");
