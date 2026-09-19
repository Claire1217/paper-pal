#!/usr/bin/env node
// paper-pal <command> [args]: a thin dispatcher over the scripts, so the app
// can be driven without npm ("npx github:claire1217/paper-pal demo").
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commands = {
  setup: "scripts/setup.mjs",
  doctor: "scripts/doctor.mjs",
  start: "server.mjs",
  demo: "scripts/demo.mjs",
};
const usage = [
  "Usage: paper-pal <command> [options]",
  "",
  "  setup <project-dir> [options]   Write .paper-pal.json for a LaTeX project (never prompts; --help for flags)",
  "  doctor [--json] [--ping]        Check Node, LaTeX, the project and the agent providers",
  "  start [--repo dir] [--port n] [--open]   Start the local server",
  "  demo [--port n] [--open]        Run on a throwaway copy of the bundled sample paper",
  "",
  "  paper-pal --version | --help",
].join("\n");

const [command, ...rest] = process.argv.slice(2);
if (command === "--version" || command === "-v") {
  console.log(JSON.parse(readFileSync(path.join(appRoot, "package.json"), "utf8")).version);
  process.exit(0);
}
if (!command || command === "--help" || command === "-h" || command === "help") {
  console.log(usage);
  process.exit(command ? 0 : 2);
}
if (!Object.hasOwn(commands, command)) {
  console.error(`Unknown command "${command}".\n\n${usage}`);
  process.exit(2);
}
// The user's working directory is kept, so relative project paths resolve as typed.
const child = spawn(process.execPath, [path.join(appRoot, commands[command]), ...rest], { stdio: "inherit" });
// Ctrl+C in a terminal already reaches the whole foreground process group, so
// SIGINT is forwarded only when there is no terminal; SIGTERM always is.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (signal === "SIGINT" && process.stdin.isTTY) return;
    if (child.exitCode === null && !child.signalCode) child.kill(signal);
  });
}
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
