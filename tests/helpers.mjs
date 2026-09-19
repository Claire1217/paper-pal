// Shared plumbing for the test suite: throwaway projects, a server on a free
// port, and a small API client that sends the headers the server requires.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const samplePaper = path.join(appRoot, "examples", "sample-paper");
export const fakeAgentSource = path.join(appRoot, "tests", "fixtures", "fake-agent.mjs");
import { CONFIG_NAME, ENV, STATE_DIR_NAME, TEMP_PREFIX } from "../names.mjs";

export const configName = CONFIG_NAME;
export const stateDirectory = STATE_DIR_NAME;

// Every child the suite starts gets this on top of the caller's environment:
// no .env file from the developer's checkout, no inherited bind address, and
// the switch that lets a project file name the fake agent by absolute path.
export const testEnvironment = {
  PAPER_PAL_ENV_FILE: "none",
  [ENV.host]: "",
  [ENV.legacyHost]: "",
  [ENV.port]: "",
  HOST: "",
  [ENV.allowCustomCommands]: "1",
};

const cleanups = [];

export async function makeTempDir(prefix = `${TEMP_PREFIX}test-`) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), prefix));
  cleanups.push(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

export function runSetup(args, options = {}) {
  return spawnSync(process.execPath, [path.join(appRoot, "scripts", "setup.mjs"), ...args], {
    cwd: appRoot,
    encoding: "utf8",
    ...options,
    env: { ...process.env, ...testEnvironment, ...(options.env || {}) },
  });
}

export function runDoctor(args, options = {}) {
  return spawnSync(process.execPath, [path.join(appRoot, "scripts", "doctor.mjs"), ...args], {
    cwd: appRoot,
    encoding: "utf8",
    ...options,
    env: { ...process.env, ...testEnvironment, ...(options.env || {}) },
  });
}

/**
 * Create a project in a fresh temp dir. `files` maps relative paths to text;
 * `from` copies a folder (both may be given); with neither the bundled sample
 * paper is copied. `directoryName` lets a test
 * put the project under a name with a space in it.
 */
export async function makeProject({ files = null, from = null, directoryName = "project", config = {}, fakeAgent = false, setupArgs = [] } = {}) {
  const parent = await makeTempDir();
  const root = path.join(parent, directoryName);
  await fs.mkdir(root, { recursive: true });
  // `from` copies a fixture folder first; `files` then adds to it or replaces files in it.
  if (from) await fs.cp(from, root, { recursive: true });
  if (files) {
    for (const [relative, contents] of Object.entries(files)) {
      const target = path.join(root, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, contents, "utf8");
    }
  } else if (!from) {
    await fs.cp(samplePaper, root, { recursive: true });
  }
  const setup = runSetup([root, "--no-compile", "--no-remember", ...setupArgs]);
  if (setup.status !== 0) throw new Error(`setup failed: ${setup.stderr || setup.stdout}`);
  const configPath = path.join(root, configName);
  const generated = JSON.parse(await fs.readFile(configPath, "utf8"));
  const merged = { ...generated, ...config, agent: { ...generated.agent, autoProcessComments: false, ...(config.agent || {}) } };
  if (fakeAgent) {
    const agentPath = path.join(root, "fake-agent.mjs");
    await fs.copyFile(fakeAgentSource, agentPath);
    await fs.chmod(agentPath, 0o755);
    merged.codex = { ...(merged.codex || {}), command: agentPath };
    merged.agent.provider = "codex";
  } else if (!config.agent || config.agent.enabled === undefined) {
    merged.agent.enabled = false;
  }
  await fs.writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return { root, configPath, config: merged };
}

export async function startServer(projectRoot, { env = {}, args = [], privateTmp = false } = {}) {
  // A temp directory of its own lets a test assert that the server cleaned up
  // after itself without seeing what other test files are doing in parallel.
  const tmpDir = privateTmp ? await makeTempDir(`${TEMP_PREFIX}tmp-`) : null;
  if (tmpDir) env = { TMPDIR: tmpDir, TMP: tmpDir, TEMP: tmpDir, ...env };
  const child = spawn(process.execPath, [path.join(appRoot, "server.mjs"), "--repo", projectRoot, "--port", "0", ...args], {
    cwd: appRoot,
    env: { ...process.env, ...testEnvironment, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${output}`)), 15_000);
    const onData = (chunk) => {
      output += chunk;
      const match = output.match(/running at http:\/\/[^\s:]+:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}:\n${output}`));
    });
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode) return;
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  };
  cleanups.push(stop);
  return {
    child,
    tmpDir,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    output: () => output,
    alive: () => child.exitCode === null && !child.signalCode,
    stop,
  };
}

/** JSON API call with the headers a well-behaved client sends. */
export async function api(server, endpoint, { method = "GET", body, headers = {} } = {}) {
  const mutating = method !== "GET" && method !== "HEAD";
  const response = await fetch(`${server.baseUrl}${endpoint}`, {
    method,
    headers: {
      ...(mutating ? { "Content-Type": "application/json", "X-Paper-Pal": "1" } : {}),
      ...headers,
    },
    body: mutating ? JSON.stringify(body ?? {}) : undefined,
  });
  const value = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, headers: response.headers, value };
}

export async function apiOk(server, endpoint, options) {
  const result = await api(server, endpoint, options);
  if (!result.ok) throw new Error(`${endpoint} -> ${result.status}: ${JSON.stringify(result.value)}`);
  return result.value;
}

/** A raw request: fetch() normalises paths and forbids some headers. */
export function rawRequest(server, { method = "GET", path: requestPath = "/", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port: server.port, method, path: requestPath, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end(body ?? undefined);
  });
}

export async function getDocument(server, relativePath) {
  return apiOk(server, `/api/document?path=${encodeURIComponent(relativePath)}`);
}

export async function waitFor(check, { timeoutMs = 20_000, intervalMs = 100, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}.`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Save a block the way the editor does and return the new document. */
export async function saveBlock(server, document, block, text) {
  return apiOk(server, "/api/save", {
    method: "POST",
    body: {
      path: document.path,
      etag: document.etag,
      blockIndex: block.index,
      blockId: block.id,
      blockKind: block.kind,
      baseText: block.raw,
      text,
    },
  });
}

export async function commentOn(server, relativePath, needle, comment, extra = {}) {
  const document = await getDocument(server, relativePath);
  const block = document.blocks.find((item) => item.raw.includes(needle));
  assert.ok(block, `no block contains ${needle}`);
  const start = block.raw.indexOf(needle);
  return apiOk(server, "/api/rewrite", {
    method: "POST",
    body: {
      path: relativePath,
      etag: document.etag,
      blockIndex: block.index,
      blockId: block.id,
      start,
      end: start + needle.length,
      comment,
      ...extra,
    },
  });
}

export async function waitForRequest(server, id, predicate, label) {
  return waitFor(async () => {
    const requests = await apiOk(server, "/api/requests");
    const request = requests.find((item) => item.id === id);
    if (request?.agentStatus === "failed") throw new Error(`agent run failed: ${request.agentError}`);
    return request && predicate(request) ? request : null;
  }, { label });
}

export async function cleanupAll() {
  while (cleanups.length) {
    const cleanup = cleanups.pop();
    try {
      await cleanup();
    } catch {
      // Best effort.
    }
  }
}

/**
 * A local stand-in for an LLM HTTP API. Records every request. `respond`
 * receives ({ method, url, headers, body, index }) and returns
 * { status?, headers?, body?, json?, hang? }; the default answers like the
 * provider the URL belongs to, "rewriting" by upper-casing the selection and
 * wrapping the JSON in prose and a code fence the way chat models tend to.
 */
export async function startMockApi(respond = null) {
  const requests = [];
  const sockets = new Set();
  const taskFrom = (prompt) => {
    const line = String(prompt).split("\n").find((value) => value.startsWith('{"version":1'));
    try {
      return line ? JSON.parse(line) : null;
    } catch {
      return null;
    }
  };
  const defaultAnswer = (record) => {
    const prompt = record.body?.messages?.[0]?.content ?? "";
    const task = taskFrom(prompt);
    let text;
    if (!task) text = `mock chat answer (${prompt.length} prompt characters)`;
    else if (task.taskType === "paper_section_review") text = JSON.stringify({ summary: "mock review", findings: [] });
    else {
      const object = JSON.stringify({
        replacementText: String(task.target?.selectedText ?? "").toUpperCase(),
        summary: "mock rewrite with a brace } in the summary",
        relatedChanges: [],
      }, null, 2);
      text = `Here is the revision you asked for:\n\n\`\`\`json\n${object}\n\`\`\`\n\nLet me know if you want another pass.`;
    }
    if (record.url.endsWith("/v1/messages")) {
      return { json: { id: "msg_mock", type: "message", role: "assistant", content: [{ type: "text", text: text.slice(0, 20) }, { type: "text", text: text.slice(20) }], stop_reason: "end_turn" } };
    }
    return { json: { id: "cmpl_mock", choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }] } };
  };
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", async () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
      const record = { method: request.method, url: request.url, headers: request.headers, body, index: requests.length };
      requests.push(record);
      const reply = (respond ? await respond(record) : null) ?? defaultAnswer(record);
      if (reply.hang) return;
      response.writeHead(reply.status || 200, { "Content-Type": "application/json", ...(reply.headers || {}) });
      response.end(reply.json !== undefined ? JSON.stringify(reply.json) : String(reply.body ?? ""));
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const close = async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  };
  cleanups.push(close);
  const { port } = server.address();
  return { requests, port, origin: `http://127.0.0.1:${port}`, taskFrom, defaultAnswer, close };
}

/** Run the bundled API adapter as the server does: prompt on stdin. */
export function runAdapter(args, { input = "prompt", env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(appRoot, "api-adapter.mjs"), ...args], {
      env: { PATH: process.env.PATH, PAPER_PAL_ADAPTER_BACKOFF_MS: "30", ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}
