#!/usr/bin/env node
// Try Paper Pal without touching anything: copies the bundled sample paper to
// a temporary folder, configures it there and starts the server. Works with no
// agent installed and no API key (the page loads; agent actions say what is
// missing). The copy is removed when the server stops: Ctrl+C, SIGTERM, SIGHUP,
// or the line "stop" on a piped stdin (the way that also works on Windows).
//
//   npm run demo [-- --port <n>] [--open] [--keep] [--provider <id>] [--model <id>]
import { spawn, spawnSync } from "node:child_process";
import { promises as fs, rmSync } from "node:fs";
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

// The server does not read stdin; this script does (see below).
const server = spawn(process.execPath, [path.join(appRoot, "server.mjs"), "--repo", project, ...argv], {
  cwd: appRoot,
  stdio: ["ignore", "inherit", "inherit"],
});

// The copy is removed only after the server has exited: on Windows a running
// process keeps its working files locked, and a virus scanner or indexer may
// hold one a little longer, hence the retries (EBUSY, EPERM, ENOTEMPTY).
const removal = { recursive: true, force: true, maxRetries: 10, retryDelay: 200 };
let removed = keep;
async function cleanup() {
  if (removed) return;
  removed = true;
  try {
    await fs.rm(workspace, removal);
  } catch (error) {
    console.error(`Could not remove the demo copy (${error?.code || error}). Delete it yourself: ${workspace}`);
  }
}

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  if (server.exitCode === null && !server.signalCode) server.kill(signal);
}

// Ctrl+C in a terminal already reaches the whole foreground process group, so
// SIGINT is forwarded only when there is no terminal; the others always are.
// SIGHUP is a closed terminal (on Windows: a closed console window), SIGBREAK
// is Ctrl+Break on Windows.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", ...(process.platform === "win32" ? ["SIGBREAK"] : [])]) {
  process.on(signal, () => {
    if (signal === "SIGINT" && process.stdin.isTTY) return;
    stop(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
  });
}

// A supervising process cannot always send a signal that runs the handlers
// above: on Windows kill() ends this process at once, and the copy and the
// server would be left behind. So a line "stop" on a piped stdin, or the IPC
// message "shutdown", asks for the same orderly stop on every platform. A
// closed or empty stdin means nothing, so `npm run demo < /dev/null &` keeps running.
try {
  if (!process.stdin.isTTY) {
    let pending = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("error", () => {});
    process.stdin.on("data", (chunk) => {
      const lines = (pending + chunk).split(/\r?\n/);
      pending = lines.pop();
      if (lines.some((line) => /^(stop|shutdown|quit)$/i.test(line.trim()))) stop();
    });
  }
} catch {
  // No usable stdin (a detached Windows process, for one). Signals still work.
}
if (process.send) {
  process.on("message", (message) => {
    if (message === "shutdown" || message?.type === "shutdown") stop();
  });
}

server.on("error", async (error) => {
  console.error(`Could not start the server: ${error.message}`);
  await cleanup();
  process.exit(1);
});
server.on("exit", async (code) => {
  await cleanup();
  process.exit(code ?? 0);
});
// Last resort, for an exit that did not come through the server (an uncaught
// error here): never leave the server or the copy behind.
process.on("exit", () => {
  if (server.exitCode === null && !server.signalCode) server.kill();
  if (removed) return;
  try {
    rmSync(workspace, { ...removal, maxRetries: 3, retryDelay: 100 });
  } catch {
    // Nothing more can be done from an exit handler.
  }
});
