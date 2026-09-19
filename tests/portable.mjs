import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_NAME, TEMP_PREFIX } from "../names.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = await fs.mkdtemp(path.join(tmpdir(), `${TEMP_PREFIX}portable-`));
let baseUrl = null;
const mainPath = path.join(fixtureRoot, "main.tex");
let server;

async function api(endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    // State-changing requests must be JSON and carry the app's custom header.
    headers: options.body ? { "Content-Type": "application/json", "X-Paper-Pal": "1" } : undefined,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      return await api("/api/bootstrap");
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Portable test server did not start in time.");
}

try {
  await fs.writeFile(mainPath, "\\section{Introduction}\nA portable manuscript paragraph.\n", "utf8");
  const setup = spawnSync(process.execPath, [
    path.join(appRoot, "scripts/setup.mjs"),
    fixtureRoot,
    "--title", "Portable Fixture",
    "--no-compile",
    "--no-remember",
  ], { cwd: appRoot, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stderr);
  const generatedConfigPath = path.join(fixtureRoot, CONFIG_NAME);
  const generatedConfig = JSON.parse(await fs.readFile(generatedConfigPath, "utf8"));
  assert.equal(generatedConfig.defaultDocument, "main.tex");
  assert.equal(generatedConfig.latex.enabled, false);
  assert.equal(generatedConfig.agent.enabled, true);
  generatedConfig.agent.enabled = false;
  generatedConfig.agent.autoProcessComments = false;
  await fs.writeFile(generatedConfigPath, `${JSON.stringify(generatedConfig, null, 2)}\n`, "utf8");
  // Port 0 asks the OS for a free port; the server prints the one it got.
  server = spawn(process.execPath, [path.join(appRoot, "server.mjs"), "--repo", fixtureRoot, "--port", "0"], {
    cwd: appRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  const listening = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Portable test server did not start in time.\n${diagnostics}`)), 10_000);
    server.stdout.on("data", (chunk) => {
      diagnostics += chunk;
      const match = diagnostics.match(/running at (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  server.stderr.on("data", (chunk) => { diagnostics += chunk; });
  server.on("exit", (code) => {
    if (code && diagnostics) process.stderr.write(diagnostics);
  });

  baseUrl = await listening;
  const bootstrap = await waitForServer();
  assert.equal(bootstrap.title, "Portable Fixture");
  assert.equal(bootstrap.defaultDocument, "main.tex");
  assert.equal(bootstrap.chat.enabled, false);
  assert.ok(bootstrap.documents.some((item) => item.path === "main.tex"));

  const document = await api("/api/document?path=main.tex");
  const paragraph = document.blocks.find((block) => block.raw.includes("portable manuscript"));
  assert.ok(paragraph);
  await api("/api/save", {
    method: "POST",
    body: JSON.stringify({
      path: "main.tex",
      etag: document.etag,
      blockIndex: paragraph.index,
      blockId: paragraph.id,
      blockKind: paragraph.kind,
      baseText: paragraph.raw,
      text: paragraph.raw.replace("portable", "independent"),
    }),
  });
  assert.match(await fs.readFile(mainPath, "utf8"), /independent manuscript paragraph/);

  const outside = await fetch(`${baseUrl}/api/document?path=${encodeURIComponent("../outside.tex")}`);
  assert.equal(outside.status, 403);

  const withoutHeader = await fetch(`${baseUrl}/api/undo`, { method: "POST" });
  assert.equal(withoutHeader.status, 403, "state-changing requests need the X-Paper-Pal header or a matching Origin");
  console.log("Portable configuration, editing, and source-root confinement passed.");
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  await fs.rm(fixtureRoot, { recursive: true, force: true });
}
