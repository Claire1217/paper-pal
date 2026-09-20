import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { tmpdir } from "node:os";
import { after, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { api, apiOk, appRoot, cleanupAll, configName, getDocument, makeProject, makeTempDir, runSetup, saveBlock, startServer, stateDirectory, trySymlink, waitFor } from "./helpers.mjs";
import { isInside, loadReviewConfig } from "../config.mjs";
import { AGENT_PROVIDERS, buildAgentInvocation, childEnvironment, inspectAgentCommand, providerAvailability, redactSecrets, resolveExecutable } from "../agent-providers.mjs";

after(cleanupAll);

describe("setup script", () => {
  it("accepts the project path after a flag (--no-compile /path)", async () => {
    const root = await makeTempDir();
    await fs.writeFile(path.join(root, "main.tex"), "\\section{A}\nText.\n", "utf8");
    const result = runSetup(["--no-compile", root, "--no-remember", "--title", "Flag First"]);
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(await fs.readFile(path.join(root, configName), "utf8"));
    assert.equal(config.title, "Flag First");
    assert.equal(config.latex.enabled, false);
    assert.equal(config.agent.reviewLanguage, "en");
    assert.deepEqual(config.agent.terminologyFiles, []);
    assert.match(await fs.readFile(path.join(root, stateDirectory, ".gitignore"), "utf8"), /^\*$/m);
  });

  it("does not mistake an option value for the project path", async () => {
    const root = await makeTempDir();
    await fs.mkdir(path.join(root, "paper"));
    await fs.writeFile(path.join(root, "paper", "main.tex"), "\\section{A}\nText.\n", "utf8");
    const result = runSetup(["--title", "Some Title", "--main", "paper/main.tex", root, "--no-remember"]);
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(await fs.readFile(path.join(root, configName), "utf8"));
    assert.equal(config.defaultDocument, "paper/main.tex");
  });
});

describe("configuration", () => {
  async function load(raw, files = { "main.tex": "\\section{A}\nText.\n" }) {
    const root = await makeTempDir();
    for (const [name, contents] of Object.entries(files)) await fs.writeFile(path.join(root, name), contents, "utf8");
    await fs.writeFile(path.join(root, configName), JSON.stringify(raw), "utf8");
    return loadReviewConfig({ appRoot, argv: ["--repo", root], cwd: root });
  }

  it("has neutral defaults", async () => {
    const { config } = await load({ latex: { enabled: false } });
    assert.equal(config.codex.reviewLanguage, "en");
    assert.deepEqual(config.codex.terminologyFiles, []);
    assert.deepEqual(config.codex.guidanceFiles, []);
    assert.equal(config.codex.model, undefined, "no hard-coded model: the CLI default is used");
    assert.equal(config.codex.chatReasoningEffort, "medium");
    assert.equal(config.agent.enabled, true);
  });

  it("reads agent.* first, codex.* as an alias, and copies terminologyFiles", async () => {
    const { config } = await load({
      latex: { enabled: false },
      codex: { reviewLanguage: "zh", timeoutMs: 1234, terminologyFiles: ["old.md"] },
      agent: { reviewLanguage: "Chinese", terminologyFiles: ["docs/glossary.md"] },
    });
    assert.equal(config.codex.reviewLanguage, "Chinese");
    assert.equal(config.codex.timeoutMs, 1234);
    assert.deepEqual(config.codex.terminologyFiles, ["docs/glossary.md"]);
  });

  it("offers AGENTS.md / CLAUDE.md as guidance only when they exist", async () => {
    const { config } = await load({ latex: { enabled: false } }, { "main.tex": "x", "CLAUDE.md": "guidance" });
    assert.deepEqual(config.codex.guidanceFiles, ["CLAUDE.md"]);
    const explicit = await load({ latex: { enabled: false }, agent: { guidanceFiles: ["docs/STYLE.md"] } });
    assert.deepEqual(explicit.config.codex.guidanceFiles, ["docs/STYLE.md"]);
  });

  it("rejects settings that leave the project and a missing latex.cwd", async () => {
    await assert.rejects(load({ sourceRoot: "../elsewhere" }), /inside the configured project/);
    await assert.rejects(load({ latex: { enabled: false }, agent: { terminologyFiles: ["C:/secrets.txt"] } }), /inside the configured project/);
    await assert.rejects(load({ latex: { cwd: "missing-dir" } }), /latex\.cwd does not exist/);
  });

  it("loads the shipped example configuration", async () => {
    const example = JSON.parse(await fs.readFile(path.join(appRoot, "paper-pal.config.example.json"), "utf8"));
    const { config } = await load(example);
    assert.equal(config.agent.provider, "codex");
    assert.equal(config.codex.reviewLanguage, "en");
    assert.deepEqual(config.codex.entryPoints, ["main.tex"]);
  });

  it("isInside handles names that merely start with two dots", () => {
    assert.equal(isInside("/a/b", "/a/b/..notes.tex"), true);
    assert.equal(isInside("/a/b", "/a/b"), true);
    assert.equal(isInside("/a/b", "/a/b/c/d.tex"), true);
    assert.equal(isInside("/a/b", "/a/bc/d.tex"), false);
    assert.equal(isInside("/a/b", "/a/c.tex"), false);
    assert.equal(isInside("/a/b", "/a"), false);
  });
});

describe("agent adapters", () => {
  it("put the prompt on stdin for every provider", async () => {
    const prompt = "PROMPT ".repeat(100);
    const schemaPath = path.join(appRoot, "schemas", "proposal-output.schema.json");
    // Codex gets a simplified copy of the schema written next to the output file.
    const scratch = await fs.mkdtemp(path.join(tmpdir(), "paper-pal-argv-"));
    after(() => fs.rm(scratch, { recursive: true, force: true }));
    for (const provider of AGENT_PROVIDERS) {
      const invocation = await buildAgentInvocation({
        provider, config: { custom: { baseUrl: "http://127.0.0.1:9/v1" } }, prompt, schemaPath, outputPath: path.join(scratch, "out.json"), repoRoot: "/tmp", model: "m", reasoningEffort: "low",
      });
      assert.ok(invocation.input.startsWith(prompt), provider);
      assert.ok(!invocation.args.some((value) => value.includes("PROMPT")), `${provider}: prompt leaked into argv`);
    }
    const codex = await buildAgentInvocation({ provider: "codex", config: { codex: {} }, prompt, outputPath: "/tmp/o", repoRoot: "/tmp" });
    assert.equal(codex.args.at(-1), "-");
    const claude = await buildAgentInvocation({ provider: "claude", config: { claude: {} }, prompt, outputPath: "/tmp/o", repoRoot: "/tmp" });
    assert.equal(claude.args[0], "-p");
    assert.equal(claude.args[1], "--output-format");
  });

  it("gives Codex a schema that strict structured output accepts", async () => {
    // The CLI passes --output-schema to the provider's strict mode, which refuses
    // the request outright over minLength, maxItems or $schema.
    const root = await fs.mkdtemp(path.join(tmpdir(), "paper-pal-schema-"));
    try {
      for (const name of ["proposal", "discussion", "link", "review"]) {
        const schemaPath = path.join(appRoot, "schemas", `${name}-output.schema.json`);
        const outputPath = path.join(root, `${name}.json`);
        const invocation = await buildAgentInvocation({ provider: "codex", config: {}, prompt: "hi", schemaPath, outputPath, repoRoot: root });
        const passed = invocation.args[invocation.args.indexOf("--output-schema") + 1];
        assert.equal(path.dirname(passed), root, "the copy lives in the run's temporary folder");
        const text = await fs.readFile(passed, "utf8");
        assert.doesNotMatch(text, /"(?:\$schema|minLength|maxLength|minItems|maxItems|pattern|format)"/, name);
        const check = (node) => {
          if (!node || typeof node !== "object") return;
          if (node.type === "object") {
            assert.equal(node.additionalProperties, false, name);
            assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort(), `${name}: every property is required`);
          }
          Object.values(node).forEach(check);
        };
        check(JSON.parse(text));
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("asks Codex for a read-only, never-asking run without the global approval flag", async () => {
    // "-a never" clashes with a wrapper that adds --dangerously-bypass-approvals-and-sandbox:
    // the CLI then refuses to start. The policy travels as a config override instead.
    const invocation = await buildAgentInvocation({ provider: "codex", config: {}, prompt: "hi", outputPath: "/tmp/o", repoRoot: "/tmp" });
    assert.ok(!invocation.args.includes("-a") && !invocation.args.includes("--ask-for-approval"));
    assert.equal(invocation.args[0], "exec");
    assert.ok(invocation.args.includes('approval_policy="never"'));
    assert.equal(invocation.args[invocation.args.indexOf("--sandbox") + 1], "read-only");
    assert.ok(invocation.args.includes("--skip-git-repo-check"), "a paper folder need not be a git repository");
    assert.equal(invocation.args.at(-1), "-", "the prompt is read from stdin");
  });

  it("warns when the agent command is a wrapper that switches the sandbox off", { skip: process.platform === "win32" }, async () => {
    const bin = await makeTempDir();
    const wrapper = path.join(bin, "codex");
    await fs.writeFile(wrapper, '#!/bin/sh\nexec /opt/real/codex --dangerously-bypass-approvals-and-sandbox "$@"\n', { mode: 0o755 });
    assert.equal(inspectAgentCommand(wrapper), "--dangerously-bypass-approvals-and-sandbox");
    const state = providerAvailability("codex", {}, { CODEX_BIN: wrapper });
    assert.equal(state.available, true);
    assert.match(state.warning, /wrapper script .* read-only sandbox off.*CODEX_BIN/s);
    const plain = path.join(bin, "claude");
    await fs.writeFile(plain, '#!/bin/sh\nexec /opt/real/claude "$@"\n', { mode: 0o755 });
    assert.equal(inspectAgentCommand(plain), null);
    assert.equal(providerAvailability("claude", {}, { CLAUDE_BIN: plain }).warning, undefined);
  });

  it("locate the bundled API adapter when the checkout path contains a space", async () => {
    const parent = await makeTempDir();
    const checkout = path.join(parent, "app dir with space");
    await fs.mkdir(checkout);
    for (const name of ["agent-providers.mjs", "api-adapter.mjs", "names.mjs", "package.json"]) await fs.copyFile(path.join(appRoot, name), path.join(checkout, name));
    const copy = await import(pathToFileURL(path.join(checkout, "agent-providers.mjs")).href);
    const invocation = await copy.buildAgentInvocation({ provider: "openrouter", config: {}, prompt: "hi", outputPath: "/tmp/o", repoRoot: "/tmp", model: "some/model" });
    assert.equal(invocation.args[0], path.join(checkout, "api-adapter.mjs"));
    await fs.access(invocation.args[0]);
    const run = spawnSync(invocation.command, invocation.args, { input: invocation.input, encoding: "utf8", env: { ...process.env, OPENROUTER_API_KEY: "" } });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /OPENROUTER_API_KEY is not set/, "the adapter itself ran (no MODULE_NOT_FOUND)");
  });

  it("keep API keys for the API adapter only and redact them from text", () => {
    process.env.OPENROUTER_API_KEY = "sk-unit-test-secret";
    try {
      assert.equal(childEnvironment({ provider: "codex" }).OPENROUTER_API_KEY, undefined);
      assert.equal(childEnvironment().OPENROUTER_API_KEY, undefined);
      assert.equal(childEnvironment({ provider: "openrouter" }).OPENROUTER_API_KEY, "sk-unit-test-secret");
      assert.equal(redactSecrets("x sk-unit-test-secret y"), "x [redacted] y");
    } finally {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  it("resolve executables through PATH", () => {
    assert.ok(path.isAbsolute(resolveExecutable("node") || ""));
    assert.equal(resolveExecutable("surely-not-a-real-command-xyz"), null);
  });
});

describe("running project", () => {
  it("reports a non-git project as such, not as one dirty file", async () => {
    const project = await makeProject();
    const server = await startServer(project.root, { env: { GIT_CEILING_DIRECTORIES: path.dirname(project.root) } });
    const git = await apiOk(server, "/api/git");
    assert.deepEqual(git, { available: false, clean: true, count: 0, lines: [] });
  });

  it("reports external edits with the same path the document list uses (sourceRoot \".\")", async () => {
    const project = await makeProject({
      files: { "main.tex": "\\section{A}\n\\input{chapters/method}\n", "chapters/method.tex": "\\section{Method}\nOriginal text.\n" },
    });
    const server = await startServer(project.root);
    const events = [];
    const request = http.get({ host: "127.0.0.1", port: server.port, path: "/api/events" }, (response) => {
      response.setEncoding("utf8");
      response.on("data", (chunk) => events.push(chunk));
    });
    try {
      await waitFor(() => events.join("").includes("event: ready"), { label: "SSE ready" });
      // An edit made through the app is not an external change…
      const document = await getDocument(server, "chapters/method.tex");
      const block = document.blocks.find((item) => item.kind === "paragraph");
      await saveBlock(server, document, block, block.raw.replace("Original", "Edited"));
      // …but one made behind its back is, under the listed path.
      await new Promise((resolve) => setTimeout(resolve, 2200));
      events.length = 0;
      await fs.appendFile(path.join(project.root, "chapters", "method.tex"), "\nAppended outside the app.\n");
      await waitFor(() => /"reason":"external-change"/.test(events.join("")), { label: "external-change event" });
      const payloads = [...events.join("").matchAll(/data: (\{.*"external-change".*\})/g)].map((match) => JSON.parse(match[1]));
      assert.ok(payloads.every((payload) => payload.path === "chapters/method.tex"), JSON.stringify(payloads));
    } finally {
      request.destroy();
    }
  });

  it("explains a missing LaTeX command instead of failing with an empty log", async () => {
    const project = await makeProject({ config: { latex: { enabled: true, cwd: ".", command: "surely-not-latexmk-xyz", args: ["main.tex"] } } });
    const server = await startServer(project.root, { env: { PAPER_PAL_ALLOW_CUSTOM_LATEX: "1" } });
    await apiOk(server, "/api/compile", { method: "POST" });
    const state = await waitFor(async () => {
      const value = await apiOk(server, "/api/compile");
      return value.status === "failed" ? value : null;
    }, { label: "compile failure" });
    assert.match(state.log, /was not found/);
    assert.match(state.log, /TeX/);
  });

  it("puts the LaTeX error lines first in a failed compile's log", async () => {
    const project = await makeProject();
    const script = path.join(project.root, "fake-latex.mjs");
    await fs.writeFile(script, [
      "console.log('This is pdfTeX');",
      "console.log('! Undefined control sequence.');",
      "console.log('<recently read> \\\\undefinedmacro');",
      "console.log('l.18 ...sites \\\\undefinedmacro');",
      "console.log('Latexmk: boilerplate\\n'.repeat(40));",
      "process.exit(12);",
    ].join("\n"), "utf8");
    const config = JSON.parse(await fs.readFile(project.configPath, "utf8"));
    config.latex = { enabled: true, cwd: ".", command: process.execPath, args: [script] };
    await fs.writeFile(project.configPath, JSON.stringify(config), "utf8");
    const server = await startServer(project.root, { env: { PAPER_PAL_ALLOW_CUSTOM_LATEX: "1" } });
    await apiOk(server, "/api/compile", { method: "POST" });
    const state = await waitFor(async () => {
      const value = await apiOk(server, "/api/compile");
      return value.status === "failed" ? value : null;
    }, { label: "compile failure" });
    assert.match(state.log, /^LaTeX errors:\n! Undefined control sequence\.\n {4}l\.18 /);
    assert.match(state.log, /Full compiler output:\nThis is pdfTeX/);
  });

  it("compiles again when a compile was requested while one was running", async () => {
    const project = await makeProject();
    const script = path.join(project.root, "fake-latex.mjs");
    await fs.writeFile(script, [
      "import { appendFileSync } from 'node:fs';",
      "await new Promise((resolve) => setTimeout(resolve, 500));",
      "appendFileSync('compile-count.txt', `${process.env.OPENROUTER_API_KEY ? 'KEY' : 'run'}\\n`);",
    ].join("\n"), "utf8");
    const config = JSON.parse(await fs.readFile(project.configPath, "utf8"));
    config.latex = { enabled: true, cwd: ".", command: process.execPath, args: [script] };
    await fs.writeFile(project.configPath, JSON.stringify(config), "utf8");
    const server = await startServer(project.root, { env: { OPENROUTER_API_KEY: "sk-must-not-reach-latex", PAPER_PAL_ALLOW_CUSTOM_LATEX: "1" } });
    await apiOk(server, "/api/compile", { method: "POST" });
    const second = await apiOk(server, "/api/compile", { method: "POST" });
    assert.equal(second.status, "running");
    const counter = path.join(project.root, "compile-count.txt");
    await waitFor(async () => (await fs.readFile(counter, "utf8").catch(() => "")).trim().split("\n").length === 2, { label: "second compile" });
    assert.equal((await fs.readFile(counter, "utf8")).trim(), "run\nrun", "LaTeX children never see the API key");
  });

  it("keeps a symlinked manuscript file a symlink and preserves the file mode", async () => {
    const project = await makeProject({ files: { "main.tex": "\\section{A}\nLinked text here.\n", "real/body.tex": "\\section{B}\nBody text here.\n" } });
    const linkPath = path.join(project.root, "alias.tex");
    // False where Windows refuses to create links; the rest of the test still runs.
    const linked = await trySymlink(path.join("real", "body.tex"), linkPath, "file");
    // Windows has no permission bits: chmod only toggles read-only and stat reports 0o666.
    const posixModes = process.platform !== "win32";
    if (posixModes) await fs.chmod(path.join(project.root, "main.tex"), 0o640);
    const server = await startServer(project.root);
    if (linked) {
      // A link that stays inside the source root may be opened by path.
      const aliased = await getDocument(server, "alias.tex");
      const block = aliased.blocks.find((item) => item.kind === "paragraph");
      await saveBlock(server, aliased, block, block.raw.replace("Body", "Changed body"));
      assert.ok((await fs.lstat(linkPath)).isSymbolicLink(), "the link survives the save");
      assert.match(await fs.readFile(path.join(project.root, "real", "body.tex"), "utf8"), /Changed body text/);
    }
    const main = await getDocument(server, "main.tex");
    const paragraph = main.blocks.find((item) => item.kind === "paragraph");
    await saveBlock(server, main, paragraph, paragraph.raw.replace("Linked", "Plain"));
    assert.match(await fs.readFile(path.join(project.root, "main.tex"), "utf8"), /Plain text here/);
    if (posixModes) assert.equal((await fs.stat(path.join(project.root, "main.tex"))).mode & 0o777, 0o640);
  });

  it("warns loudly when bound to a non-loopback host, and still checks Host", async () => {
    const project = await makeProject();
    const server = await startServer(project.root, { env: { PAPER_PAL_HOST: "0.0.0.0", HOST: "should-be-ignored.example" } });
    await waitFor(() => /WARNING: listening on 0\.0\.0\.0/.test(server.output()), { label: "warning" });
    assert.equal((await api(server, "/api/bootstrap")).status, 200);
  });

  it("ignores the generic HOST variable", async () => {
    const project = await makeProject();
    const server = await startServer(project.root, { env: { HOST: "192.0.2.1" } });
    assert.match(server.output(), /running at http:\/\/127\.0\.0\.1:/);
    assert.doesNotMatch(server.output(), /WARNING/);
  });
});
