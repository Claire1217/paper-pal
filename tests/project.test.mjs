import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { tmpdir } from "node:os";
import { after, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { api, apiOk, appRoot, cleanupAll, configName, getDocument, makeProject, makeTempDir, runSetup, saveBlock, startServer, stateDirectory, trySymlink, waitFor } from "./helpers.mjs";
import { isInside, loadReviewConfig, renameIntoPlace } from "../config.mjs";
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

  it("stores an absolute --main / --source inside the project as a relative path", async () => {
    const root = await makeTempDir();
    await fs.mkdir(path.join(root, "paper"));
    await fs.writeFile(path.join(root, "paper", "main.tex"), "\\section{A}\nText.\n", "utf8");
    const result = runSetup([root, "--main", path.join(root, "paper", "main.tex"), "--source", path.join(root, "paper"), "--no-compile", "--no-remember"]);
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(await fs.readFile(path.join(root, configName), "utf8"));
    assert.equal(config.defaultDocument, "paper/main.tex");
    assert.equal(config.sourceRoot, "paper");
    assert.equal(config.latex.cwd, "paper");
    assert.deepEqual(config.agent.entryPoints, ["paper/main.tex"]);
    // The file setup wrote must also start the server.
    await loadReviewConfig({ appRoot, argv: ["--repo", root], cwd: root, env: {} });
  });

  it("accepts --main / --source that reach the project through a symlinked spelling", async () => {
    // macOS gives /var/... from $PWD and /private/var/... from pwd -P; any
    // symlink to the project folder shows the same mismatch.
    const root = await makeTempDir();
    await fs.mkdir(path.join(root, "paper"));
    await fs.writeFile(path.join(root, "paper", "main.tex"), "\\section{A}\nText.\n", "utf8");
    const link = path.join(await makeTempDir(), "linked project");
    if (!await trySymlink(root, link, "dir")) return;
    for (const [project, spelled] of [[link, root], [root, link]]) {
      const result = runSetup([project, "--main", path.join(spelled, "paper", "main.tex"), "--source", path.join(spelled, "paper"), "--no-compile", "--no-remember", "--force"]);
      assert.equal(result.status, 0, result.stderr);
      const config = JSON.parse(await fs.readFile(path.join(root, configName), "utf8"));
      assert.equal(config.defaultDocument, "paper/main.tex");
      assert.equal(config.sourceRoot, "paper");
      await loadReviewConfig({ appRoot, argv: ["--repo", project], cwd: project, env: {} });
    }
    // A file that really is outside is still refused, and not called missing.
    const outside = path.join(await makeTempDir(), "other.tex");
    await fs.writeFile(outside, "x", "utf8");
    const refused = runSetup([root, "--main", outside, "--no-compile", "--no-remember", "--force"]);
    assert.equal(refused.status, 4);
    assert.match(refused.stderr, /is not inside the project/);
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

  it("rejects the filesystem root, and drive-relative paths on Windows only", async () => {
    await assert.rejects(load({ latex: { enabled: false }, agent: { terminologyFiles: ["/"] } }), /inside the configured project/);
    await assert.rejects(load({ sourceRoot: "/" }), /inside the configured project/);
    // On POSIX "a:b.tex" is an ordinary file name.
    if (process.platform !== "win32") {
      const { config } = await load({ latex: { enabled: false }, agent: { terminologyFiles: ["a:b.tex", "C:main.tex"] } });
      assert.deepEqual(config.codex.terminologyFiles, ["a:b.tex", "C:main.tex"]);
    }
    // The Windows branch, in a child that reports win32 as its platform: the
    // check reads process.platform when it runs, and path.win32/path.posix are
    // used explicitly, so the rest of loading behaves as it would there.
    const root = await makeTempDir();
    await fs.writeFile(path.join(root, "main.tex"), "\\section{A}\nText.\n", "utf8");
    const values = ["C:", "C:main.tex", "C:/", "c:\\"];
    const script = [
      "Object.defineProperty(process, \"platform\", { value: \"win32\" });",
      `const { loadReviewConfig } = await import(${JSON.stringify(pathToFileURL(path.join(appRoot, "config.mjs")).href)});`,
      "const { writeFileSync } = await import(\"node:fs\");",
      `const [root, ...values] = process.argv.slice(1);`,
      "const results = [];",
      "for (const value of [...values, \"a/b.tex\"]) {",
      `  writeFileSync(root + "/${configName}", JSON.stringify({ latex: { enabled: false }, agent: { terminologyFiles: [value] } }));`,
      "  results.push(await loadReviewConfig({ appRoot: root, argv: [\"--repo\", root], cwd: root, env: {} }).then(() => \"ok\", (error) => error.message));",
      "}",
      "console.log(JSON.stringify(results));",
    ].join("\n");
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script, root, ...values], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    const results = JSON.parse(child.stdout);
    for (const [index, value] of values.entries()) assert.match(results[index], /names a Windows drive/, value);
    assert.equal(results.at(-1), "ok");
  });

  it("uses the default timeout for a zero or negative one instead of timing out at once", async () => {
    const { config } = await load({ latex: { enabled: false }, agent: { timeoutMs: -1, projectTimeoutMs: 0, chatTimeoutMs: -300 } });
    assert.equal(config.codex.timeoutMs, 90_000);
    assert.equal(config.codex.projectTimeoutMs, 180_000);
    assert.equal(config.codex.chatTimeoutMs, 300_000);
  });

  it("loads the shipped example configuration", async () => {
    const example = JSON.parse(await fs.readFile(path.join(appRoot, "paper-pal.config.example.json"), "utf8"));
    const { config } = await load(example);
    assert.equal(config.agent.provider, "codex");
    assert.equal(config.codex.reviewLanguage, "en");
    assert.deepEqual(config.codex.entryPoints, ["main.tex"]);
  });

  it("retries a rename that Windows refuses for a moment, and only there", async () => {
    // Real Windows sharing violations cannot be produced on other systems, so
    // this checks the retry rule with a rename that fails a set number of times.
    const flaky = (failures, code) => {
      let calls = 0;
      const rename = async () => {
        calls += 1;
        if (calls <= failures) throw Object.assign(new Error(code), { code });
      };
      return { rename, calls: () => calls };
    };
    const busy = flaky(3, "EPERM");
    await renameIntoPlace("a", "b", { platform: "win32", rename: busy.rename });
    assert.equal(busy.calls(), 4);
    const stuck = flaky(100, "EBUSY");
    await assert.rejects(renameIntoPlace("a", "b", { platform: "win32", rename: stuck.rename }), { code: "EBUSY" });
    assert.equal(stuck.calls(), 6, "gives up after six tries");
    const missing = flaky(1, "ENOENT");
    await assert.rejects(renameIntoPlace("a", "b", { platform: "win32", rename: missing.rename }), { code: "ENOENT" });
    assert.equal(missing.calls(), 1, "other errors are not retried");
    const elsewhere = flaky(1, "EPERM");
    await assert.rejects(renameIntoPlace("a", "b", { platform: "linux", rename: elsewhere.rename }), { code: "EPERM" });
    assert.equal(elsewhere.calls(), 1, "only Windows retries");
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

  it("never turns a claude.allowedTools entry into a Claude CLI option", async () => {
    const invocation = await buildAgentInvocation({ provider: "claude", config: { claude: { allowedTools: ["Read", "WebFetch(domain:example.org)"] } }, prompt: "hi", outputPath: "/tmp/o", repoRoot: "/tmp" });
    const start = invocation.args.indexOf("--allowedTools");
    assert.deepEqual(invocation.args.slice(start, start + 3), ["--allowedTools", "Read", "WebFetch(domain:example.org)"]);
    assert.equal(invocation.args[start + 3], "--disallowedTools");
    // Exactly these four: some CLI versions refuse to start on a tool name they
    // do not know, so the deny list must not grow by accident. The read-only
    // allowlist for project files is what keeps other tools out.
    assert.deepEqual(invocation.args.slice(start + 4), ["Write", "Edit", "NotebookEdit", "Bash"]);
    // A configuration that did not come through loadReviewConfig is checked again here.
    await assert.rejects(
      buildAgentInvocation({ provider: "claude", config: { claude: { allowedTools: ["Read", "--add-dir", "/"] } }, prompt: "hi", outputPath: "/tmp/o", repoRoot: "/tmp" }),
      /claude\.allowedTools may only list tool names/,
    );
    await assert.rejects(
      buildAgentInvocation({ provider: "claude", config: { claude: { permissionMode: "--settings" } }, prompt: "hi", outputPath: "/tmp/o", repoRoot: "/tmp" }),
      /claude\.permissionMode/,
    );
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

  it("resolve only what a shell would run: not a directory, not a file without execute permission", async () => {
    const bin = await makeTempDir();
    await fs.mkdir(path.join(bin, "paper-pal-dir-cmd"));
    assert.equal(resolveExecutable("paper-pal-dir-cmd", [bin]), null);
    assert.equal(resolveExecutable(path.join(bin, "paper-pal-dir-cmd")), null);
    if (process.platform !== "win32") {
      await fs.writeFile(path.join(bin, "paper-pal-plain-cmd"), "#!/bin/sh\n", { mode: 0o644 });
      assert.equal(resolveExecutable("paper-pal-plain-cmd", [bin]), null);
      assert.equal(resolveExecutable(path.join(bin, "paper-pal-plain-cmd")), null);
      await fs.chmod(path.join(bin, "paper-pal-plain-cmd"), 0o755);
      assert.equal(resolveExecutable("paper-pal-plain-cmd", [bin]), path.join(bin, "paper-pal-plain-cmd"));
    }
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

  it("keeps non-ASCII characters intact when LaTeX output splits them across writes", async () => {
    const project = await makeProject();
    const script = path.join(project.root, "fake-latex.mjs");
    // Two writes with a pause, cut between the two bytes of the first "é", so
    // the server receives them as separate chunks.
    await fs.writeFile(script, [
      "const bytes = Buffer.from('! Undefined control sequence.\\nl.3 Caf\\u00e9 r\\u00e9sum\\u00e9 \\\\foo\\n', 'utf8');",
      "const cut = bytes.indexOf(0xc3) + 1;",
      "process.stdout.write(bytes.subarray(0, cut));",
      "setTimeout(() => { process.stdout.write(bytes.subarray(cut)); setTimeout(() => process.exit(1), 50); }, 150);",
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
    assert.doesNotMatch(state.log, /\uFFFD/);
    assert.match(state.log, /l\.3 Caf\u00e9 r\u00e9sum\u00e9 \\foo/);
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

describe("saving a paragraph after the file changed on disk", () => {
  const body = (paragraphs) => `\\documentclass{article}\n\\begin{document}\n\n${paragraphs.join("\n\n")}\n\n\\end{document}\n`;
  // The editor sends the etag, position, text and neighbours it loaded; a
  // co-author's write in between makes that etag stale.
  const staleSave = (server, document, block, text, extra = {}) => api(server, "/api/save", {
    method: "POST",
    body: {
      path: document.path, etag: document.etag, blockIndex: block.index, blockId: block.id, blockKind: block.kind,
      baseText: block.raw, previousText: document.blocks[block.index - 1]?.raw, nextText: document.blocks[block.index + 1]?.raw,
      text, ...extra,
    },
  });
  async function setUp(paragraphs) {
    const project = await makeProject({ files: { "main.tex": body(paragraphs) } });
    const server = await startServer(project.root);
    const file = path.join(project.root, "main.tex");
    return { server, file, document: await getDocument(server, "main.tex") };
  }

  it("writes into the copy of a repeated paragraph that was edited, not the first one", async () => {
    const { server, file, document } = await setUp(["Intro text here.", "TODO.", "Middle paragraph.", "TODO.", "Last paragraph."]);
    const second = document.blocks.filter((block) => block.raw === "TODO.")[1];
    await fs.writeFile(file, body(["Intro text here.", "TODO.", "Middle paragraph.", "TODO.", "Last paragraph, edited."]));
    const result = await staleSave(server, document, second, "Second TODO filled in.");
    assert.equal(result.status, 200, result.value.error);
    assert.equal(await fs.readFile(file, "utf8"), body(["Intro text here.", "TODO.", "Middle paragraph.", "Second TODO filled in.", "Last paragraph, edited."]));
  });

  it("refuses an edit to a paragraph that was deleted on disk instead of merging it into the next one", async () => {
    const { server, file, document } = await setUp(["Alpha beta gamma.", "Delta epsilon zeta.", "Final words."]);
    const alpha = document.blocks.find((block) => block.raw === "Alpha beta gamma.");
    const disk = body(["Delta epsilon zeta.", "Final words."]);
    await fs.writeFile(file, disk);
    const result = await staleSave(server, document, alpha, "Alpha beta gamma. New sentence.");
    assert.equal(result.status, 409);
    assert.match(result.value.error, /no longer exists/);
    assert.equal(await fs.readFile(file, "utf8"), disk);
  });

  it("still merges a co-author's edit elsewhere in the same paragraph", async () => {
    const base = "The first sentence stays. The second sentence is here. The third sentence ends it.";
    const { server, file, document } = await setUp(["Opening paragraph.", base]);
    const block = document.blocks.find((item) => item.raw === base);
    await fs.writeFile(file, body(["Opening paragraph.", base.replace("third sentence", "third sentence, by a co-author,")]));
    const result = await staleSave(server, document, block, base.replace("first sentence", "first sentence, by the author,"));
    assert.equal(result.status, 200, result.value.error);
    assert.equal(result.value.merge.applied, true);
    assert.match(await fs.readFile(file, "utf8"), /first sentence, by the author, stays\. The second sentence is here\. The third sentence, by a co-author, ends it\./);
  });

  it("keeps my edit by replacing only the paragraph that was edited", async () => {
    const { server, file, document } = await setUp(["First paragraph.", "Second paragraph.", "Third paragraph."]);
    const third = document.blocks.find((block) => block.raw === "Third paragraph.");
    await fs.writeFile(file, body(["First paragraph.", "Inserted by co-author.", "Second paragraph.", "Third paragraph."]));
    const result = await staleSave(server, document, third, "Third paragraph, improved.", { force: true });
    assert.equal(result.status, 200, result.value.error);
    assert.equal(await fs.readFile(file, "utf8"), body(["First paragraph.", "Inserted by co-author.", "Second paragraph.", "Third paragraph, improved."]));
  });

  it("keeps my edit over a co-author's version of the same paragraph", async () => {
    const base = "Results improve on every one of the three benchmark datasets we tried.";
    const { server, file, document } = await setUp(["Opening paragraph.", base]);
    const block = document.blocks.find((item) => item.raw === base);
    await fs.writeFile(file, body(["Opening paragraph.", base.replace("three", "four")]));
    const result = await staleSave(server, document, block, base.replace("three", "five"), { force: true });
    assert.equal(result.status, 200, result.value.error);
    assert.equal(await fs.readFile(file, "utf8"), body(["Opening paragraph.", base.replace("three", "five")]));
  });

  it("refuses to keep my edit when the paragraph is gone and another one sits in its place", async () => {
    const { server, file, document } = await setUp(["First paragraph.", "Second paragraph.", "Third paragraph."]);
    const second = document.blocks.find((block) => block.raw === "Second paragraph.");
    const disk = body(["First paragraph.", "An unrelated replacement written by a co-author.", "Third paragraph."]);
    await fs.writeFile(file, disk);
    const result = await staleSave(server, document, second, "Second paragraph, improved.", { force: true });
    assert.equal(result.status, 409);
    assert.equal(await fs.readFile(file, "utf8"), disk);
  });

  it("reports two overlapping changes as a conflict, not as a missing merge tool", async () => {
    const lines = (second, last) => [
      "Line one.", `Line ${second} two.`, ...Array.from({ length: 10 }, (_, index) => `Filler line ${index} stays the same.`), `Line ${last} end.`, "Last line.",
    ].join("\n");
    const { server, file, document } = await setUp([lines("base", "base")]);
    const block = document.blocks.find((item) => item.raw.startsWith("Line one"));
    await fs.writeFile(file, body([lines("disk", "disk")]));
    const result = await staleSave(server, document, block, lines("local", "local"));
    assert.equal(result.status, 409);
    assert.match(result.value.error, /overlapping text/);
  });

  // A co-author both inserts a paragraph above and edits the target, so the
  // target is neither at its old position nor still equal to the base text.
  const experimentOne = "Experiment one used a learning rate of 0.1 with batch size 32.";
  const experimentTwo = "Experiment two used a learning rate of 0.01 with batch size 32.";
  const insertedAndEdited = () => body(["Intro.", "Inserted by co-author.", experimentOne, experimentTwo.replace("size 32", "size 64"), "End."]);

  it("merges into the edited paragraph, not a similar neighbour, after an insertion above", async () => {
    const { server, file, document } = await setUp(["Intro.", experimentOne, experimentTwo, "End."]);
    const target = document.blocks.find((block) => block.raw === experimentTwo);
    await fs.writeFile(file, insertedAndEdited());
    const result = await staleSave(server, document, target, `${experimentTwo} Results in Table 2.`);
    assert.equal(result.status, 200, result.value.error);
    assert.equal(result.value.merge.applied, true);
    assert.equal(await fs.readFile(file, "utf8"), body([
      "Intro.", "Inserted by co-author.", experimentOne, `${experimentTwo.replace("size 32", "size 64")} Results in Table 2.`, "End.",
    ]));
  });

  it("keeps my edit in the edited paragraph, not a similar neighbour, after an insertion above", async () => {
    const { server, file, document } = await setUp(["Intro.", experimentOne, experimentTwo, "End."]);
    const target = document.blocks.find((block) => block.raw === experimentTwo);
    await fs.writeFile(file, insertedAndEdited());
    const result = await staleSave(server, document, target, `${experimentTwo} Results in Table 2.`, { force: true });
    assert.equal(result.status, 200, result.value.error);
    assert.equal(await fs.readFile(file, "utf8"), body(["Intro.", "Inserted by co-author.", experimentOne, `${experimentTwo} Results in Table 2.`, "End."]));
  });

  it("finds an edited paragraph one block lower instead of calling it deleted", async () => {
    const paragraphs = ["First paragraph is here.", "Second paragraph talks about things.", "Third paragraph closes."];
    const disk = body(["New one.", ...paragraphs.slice(0, 2), "Third paragraph closes, tweaked."]);
    for (const force of [false, true]) {
      const { server, file, document } = await setUp(paragraphs);
      const third = document.blocks.find((block) => block.raw === paragraphs[2]);
      await fs.writeFile(file, disk);
      const result = await staleSave(server, document, third, "Third paragraph closes the paper.", { force });
      if (force) {
        assert.equal(result.status, 200, result.value.error);
        assert.equal(await fs.readFile(file, "utf8"), body(["New one.", ...paragraphs.slice(0, 2), "Third paragraph closes the paper."]));
      } else {
        // Both changed the end of the sentence: a conflict the author resolves, not a deleted paragraph.
        assert.equal(result.status, 409);
        assert.match(result.value.error, /overlapping text/);
      }
    }
  });

  it("never takes an unchanged neighbour for the edited paragraph", async () => {
    const { server, file, document } = await setUp(["First thing.", "Second paragraph text.", "Third paragraph text."]);
    const second = document.blocks.find((block) => block.raw === "Second paragraph text.");
    const disk = body(["First thing.", "Unrelated replacement.", "Third paragraph text."]);
    await fs.writeFile(file, disk);
    for (const force of [false, true]) {
      const result = await staleSave(server, document, second, "Second paragraph text, improved.", { force });
      assert.equal(result.status, 409);
      assert.match(result.value.error, /no longer exists/);
    }
    assert.equal(await fs.readFile(file, "utf8"), disk);
  });

  it("refuses to guess between two paragraphs that are equally like the edited one", async () => {
    const { server, file, document } = await setUp(["Intro.", experimentTwo, "End."]);
    const target = document.blocks.find((block) => block.raw === experimentTwo);
    const disk = body(["Intro.", experimentTwo.replace("two", "one"), experimentTwo.replace("size 32", "size 64"), "End."]);
    await fs.writeFile(file, disk);
    for (const force of [false, true]) {
      const result = await staleSave(server, document, target, `${experimentTwo} Results in Table 2.`, { force });
      assert.equal(result.status, 409);
      assert.match(result.value.error, /more than one paragraph/);
    }
    assert.equal(await fs.readFile(file, "utf8"), disk);
  });

  for (const [script, base, from, to, appended] of [
    ["Chinese", "本文提出了一种新的方法来解决这个问题。我们在三个数据集上进行了实验，结果表明该方法有效。", "三个", "四个", "代码已开源。"],
    ["Japanese", "提案手法を三つのデータセットで評価した。結果は良好であり、既存手法を上回った。", "三つ", "四つ", "コードは公開済みである。"],
    ["mixed Chinese and English", "我们使用 BERT 模型，在 GLUE 基准上评估性能，并与 baseline 方法进行比较。", "评估性能", "评估了性能", "代码已开源。"],
  ]) {
    it(`merges and keeps my edit for ${script} text that a co-author edited lightly`, async () => {
      const { server, file, document } = await setUp(["开头。", base, "结尾。"]);
      const block = document.blocks.find((item) => item.raw === base);
      await fs.writeFile(file, body(["开头。", base.replace(from, to), "结尾。"]));
      const merged = await staleSave(server, document, block, `${base}${appended}`);
      assert.equal(merged.status, 200, merged.value.error);
      assert.equal(merged.value.merge.applied, true);
      assert.equal(await fs.readFile(file, "utf8"), body(["开头。", `${base.replace(from, to)}${appended}`, "结尾。"]));
      await fs.writeFile(file, body(["开头。", base.replace(from, to), "结尾。"]));
      const forced = await staleSave(server, document, block, `${base}${appended}`, { force: true });
      assert.equal(forced.status, 200, forced.value.error);
      assert.equal(await fs.readFile(file, "utf8"), body(["开头。", `${base}${appended}`, "结尾。"]));
    });
  }

  it("merges into a two-word paragraph whose punctuation a co-author changed", async () => {
    const { server, file, document } = await setUp(["Intro.", "Results pending.", "End."]);
    const block = document.blocks.find((item) => item.raw === "Results pending.");
    await fs.writeFile(file, body(["Intro.", "Results pending!", "End."]));
    const result = await staleSave(server, document, block, "Our results pending.");
    assert.equal(result.status, 200, result.value.error);
    assert.equal(await fs.readFile(file, "utf8"), body(["Intro.", "Our results pending!", "End."]));
  });
});

describe("confirmations and repeated or split paragraphs", () => {
  const body = (paragraphs) => `\\documentclass{article}\n\\begin{document}\n\n${paragraphs.join("\n\n")}\n\n\\end{document}\n`;
  const confirm = (server, document, block, start, end) => apiOk(server, "/api/confirm", {
    method: "POST",
    body: { path: document.path, etag: document.etag, blockIndex: block.index, blockId: block.id, start, end },
  });

  it("confirms only the copy of a repeated paragraph that was confirmed, and keeps it when the other copy is edited", async () => {
    const repeated = "See the appendix for details.";
    const project = await makeProject({ files: { "main.tex": body([repeated, "Middle paragraph.", repeated]) } });
    const server = await startServer(project.root);
    let document = await getDocument(server, "main.tex");
    const [first, last] = document.blocks.filter((block) => block.raw === repeated);
    await confirm(server, document, last, 0, repeated.length);
    document = await getDocument(server, "main.tex");
    assert.deepEqual(document.blocks[first.index].acceptedRanges, []);
    assert.equal(document.blocks[last.index].acceptedRanges.length, 1);

    await saveBlock(server, document, document.blocks[first.index], `${repeated} Added sentence.`);
    document = await getDocument(server, "main.tex");
    assert.deepEqual(document.blocks[last.index].acceptedRanges.map(({ start, end }) => [start, end]), [[0, repeated.length]]);
    assert.deepEqual(document.blocks[first.index].acceptedRanges, []);
  });

  it("keeps a confirmation on its own copy after a co-author inserts a paragraph between the copies", async () => {
    const repeated = "See the appendix for details.";
    const project = await makeProject({ files: { "main.tex": body([repeated, "Middle paragraph.", repeated]) } });
    const server = await startServer(project.root);
    let document = await getDocument(server, "main.tex");
    const last = document.blocks.filter((block) => block.raw === repeated)[1];
    await confirm(server, document, last, 0, repeated.length);
    await fs.writeFile(path.join(project.root, "main.tex"), body([repeated, "Middle paragraph.", "Inserted later.", repeated]));
    document = await getDocument(server, "main.tex");
    const [firstCopy, lastCopy] = document.blocks.filter((block) => block.raw === repeated);
    assert.deepEqual(firstCopy.acceptedRanges, []);
    assert.equal(lastCopy.acceptedRanges.length, 1);
  });

  it("keeps the confirmation of the text after a split on the new paragraph", async () => {
    const original = "Alpha sentence. Beta sentence is confirmed.";
    const project = await makeProject({ files: { "main.tex": body([original]) } });
    const server = await startServer(project.root);
    let document = await getDocument(server, "main.tex");
    const block = document.blocks.find((item) => item.raw === original);
    await confirm(server, document, block, original.indexOf("Beta"), original.length);
    document = await getDocument(server, "main.tex");
    await saveBlock(server, document, document.blocks[block.index], "Alpha sentence. Gamma.\n\nBeta sentence is confirmed.");
    document = await getDocument(server, "main.tex");
    const before = document.blocks.find((item) => item.raw === "Alpha sentence. Gamma.");
    const after = document.blocks.find((item) => item.raw === "Beta sentence is confirmed.");
    assert.deepEqual(before.acceptedRanges, []);
    assert.deepEqual(after.acceptedRanges.map(({ start, end, quote }) => [start, end, quote]), [[0, after.raw.length, after.raw]]);
  });

  it("keeps the id and time of a confirmation that a save elsewhere only moved", async () => {
    const project = await makeProject({ files: { "main.tex": body(["Edited paragraph.", "Confirmed paragraph."]) } });
    const server = await startServer(project.root);
    let document = await getDocument(server, "main.tex");
    const confirmed = document.blocks.find((item) => item.raw === "Confirmed paragraph.");
    await confirm(server, document, confirmed, 0, confirmed.raw.length);
    const statePath = path.join(project.root, stateDirectory, "state.json");
    const [before] = JSON.parse(await fs.readFile(statePath, "utf8")).selections;
    document = await getDocument(server, "main.tex");
    const edited = document.blocks.find((item) => item.raw === "Edited paragraph.");
    await saveBlock(server, document, edited, "Edited paragraph.\n\nNow split in two.");
    const after = JSON.parse(await fs.readFile(statePath, "utf8")).selections.find((item) => item.status === "accepted");
    assert.equal(after.id, before.id);
    assert.equal(after.acceptedAt, before.acceptedAt);
    assert.equal(after.blockIndex, before.blockIndex + 1);
  });
});
