#!/usr/bin/env node
// Try Paper Pal without touching anything: copies the bundled sample paper to
// a temporary folder, configures it there and starts the server. Works with no
// agent installed and no API key (the page loads; agent actions say what is
// missing). The copy is removed when the server stops.
//
//   npm run demo [-- --port <n>] [--open] [--keep] [--provider <id>] [--model <id>]
import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NAME, TEMP_PREFIX } from "../names.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const take = (name) => {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  const [, value] = argv.splice(index, 2);
  return value ?? null;
};
const takeFlag = (name) => {
  const index = argv.indexOf(name);
  if (index < 0) return false;
  argv.splice(index, 1);
  return true;
};
const keep = takeFlag("--keep");
const provider = take("--provider");
const model = take("--model");

const sample = path.join(appRoot, "examples", "sample-paper");
const workspace = await fs.mkdtemp(path.join(tmpdir(), `${TEMP_PREFIX}demo-`));
const project = path.join(workspace, "sample-paper");
await fs.cp(sample, project, { recursive: true });

// Setup decides by itself whether PDF compilation can be on (latexmk on PATH).
const setup = spawnSync(process.execPath, [
  path.join(appRoot, "scripts", "setup.mjs"), project, "--no-remember", "--title", "Sample paper (demo copy)",
  ...(provider ? ["--provider", provider] : []),
  ...(model ? ["--model", model] : []),
], { cwd: appRoot, encoding: "utf8" });
if (setup.status !== 0) {
  process.stderr.write(setup.stderr || setup.stdout);
  await fs.rm(workspace, { recursive: true, force: true });
  process.exit(setup.status || 1);
}

console.log(`${APP_NAME} demo: working on a throwaway copy in ${project}`);
console.log(keep ? "The copy is kept when you stop the server (--keep).\n" : "The copy is deleted when you stop the server (pass --keep to keep it).\n");

const server = spawn(process.execPath, [path.join(appRoot, "server.mjs"), "--repo", project, ...argv], { cwd: appRoot, stdio: "inherit" });
let cleaned = false;
async function cleanup() {
  if (cleaned || keep) return;
  cleaned = true;
  await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
}
// Ctrl+C in a terminal already reaches the whole foreground process group, so
// SIGINT is forwarded only when there is no terminal; SIGTERM always is.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (signal === "SIGINT" && process.stdin.isTTY) return;
    if (server.exitCode === null && !server.signalCode) server.kill(signal);
  });
}
server.on("exit", async (code) => {
  await cleanup();
  process.exit(code ?? 0);
});
