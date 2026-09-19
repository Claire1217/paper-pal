import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  apiOk, appRoot, cleanupAll, configName, getDocument, makeProject, makeTempDir, runDoctor, runSetup, saveBlock, startServer,
  stateDirectory, testEnvironment,
} from "./helpers.mjs";
import { loadReviewConfig } from "../config.mjs";
import {
  CONFIG_NAME, LEGACY_CONFIG_NAME, LEGACY_LOCAL_POINTER_NAME, LEGACY_STATE_DIR_NAME, LOCAL_POINTER_NAME, STATE_DIR_NAME,
  hostFromEnvironment, resolveConfigPath, resolveLocalPointer, resolveStateDir,
} from "../names.mjs";

after(cleanupAll);

const noAgents = { CODEX_BIN: "/nonexistent/codex", CLAUDE_BIN: "/nonexistent/claude", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", OPENROUTER_API_KEY: "", DEEPSEEK_API_KEY: "", PAPER_PAL_API_BASE_URL: "" };
const json = (result) => JSON.parse(result.stdout);

async function texProject(files) {
  const root = await makeTempDir();
  for (const [relative, contents] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await fs.writeFile(path.join(root, relative), contents, "utf8");
  }
  return root;
}
const article = "\\documentclass{article}\n\\begin{document}\n\\section{A}\nText here.\n\\end{document}\n";

describe("names: new first, pre-rename names as a fallback", () => {
  it("uses the new names, and the old ones only when the new ones are absent", async () => {
    assert.equal(CONFIG_NAME, ".paper-pal.json");
    assert.equal(STATE_DIR_NAME, ".paper-pal");
    assert.equal(LOCAL_POINTER_NAME, "paper-pal.local.json");
    const root = await makeTempDir();
    assert.equal(resolveConfigPath(root), path.join(root, CONFIG_NAME));
    assert.equal(resolveStateDir(root), path.join(root, STATE_DIR_NAME));
    assert.equal(resolveLocalPointer(root), null);
    await fs.writeFile(path.join(root, LEGACY_CONFIG_NAME), "{}");
    await fs.mkdir(path.join(root, LEGACY_STATE_DIR_NAME));
    await fs.writeFile(path.join(root, LEGACY_LOCAL_POINTER_NAME), "{}");
    assert.equal(resolveConfigPath(root), path.join(root, LEGACY_CONFIG_NAME));
    assert.equal(resolveStateDir(root), path.join(root, LEGACY_STATE_DIR_NAME));
    assert.equal(resolveLocalPointer(root), path.join(root, LEGACY_LOCAL_POINTER_NAME));
    await fs.writeFile(path.join(root, CONFIG_NAME), "{}");
    await fs.mkdir(path.join(root, STATE_DIR_NAME));
    await fs.writeFile(path.join(root, LOCAL_POINTER_NAME), "{}");
    assert.equal(resolveConfigPath(root), path.join(root, CONFIG_NAME));
    assert.equal(resolveStateDir(root), path.join(root, STATE_DIR_NAME));
    assert.equal(resolveLocalPointer(root), path.join(root, LOCAL_POINTER_NAME));
  });

  it("reads PAPER_PAL_HOST, then DRAFT_REVIEW_HOST, and never HOST", () => {
    assert.equal(hostFromEnvironment({}), "127.0.0.1");
    assert.equal(hostFromEnvironment({ HOST: "example.org" }), "127.0.0.1");
    assert.equal(hostFromEnvironment({ DRAFT_REVIEW_HOST: "0.0.0.0" }), "0.0.0.0");
    assert.equal(hostFromEnvironment({ DRAFT_REVIEW_HOST: "0.0.0.0", PAPER_PAL_HOST: "::1" }), "::1");
  });

  it("keeps an existing project working: old config name, old state directory, old state", async () => {
    const project = await makeProject();
    // Turn the freshly set-up project into a pre-rename one.
    await fs.rename(path.join(project.root, configName), path.join(project.root, LEGACY_CONFIG_NAME));
    await fs.rename(path.join(project.root, stateDirectory), path.join(project.root, LEGACY_STATE_DIR_NAME));
    let server = await startServer(project.root);
    const bootstrap = await apiOk(server, "/api/bootstrap");
    assert.equal(bootstrap.configPath, LEGACY_CONFIG_NAME);
    const document = await getDocument(server, "sections/01_introduction.tex");
    const block = document.blocks.find((item) => item.kind === "paragraph");
    await apiOk(server, "/api/confirm", { method: "POST", body: { path: document.path, etag: document.etag, blockIndex: block.index, blockId: block.id, start: 0, end: 12 } });
    await server.stop();
    assert.ok(existsSync(path.join(project.root, LEGACY_STATE_DIR_NAME, "state.json")), "state stays in the old directory");
    assert.ok(!existsSync(path.join(project.root, STATE_DIR_NAME)), "no second state directory appears");
    // A restart still sees the confirmation.
    server = await startServer(project.root);
    const again = await getDocument(server, "sections/01_introduction.tex");
    const confirmed = again.blocks.find((item) => item.index === block.index);
    assert.equal([...(confirmed.humanRanges || []), ...(confirmed.acceptedRanges || [])].length, 1, "the confirmation survived the restart");
    await server.stop();
    // Once a new-style configuration exists it wins over the old one.
    const legacy = JSON.parse(await fs.readFile(path.join(project.root, LEGACY_CONFIG_NAME), "utf8"));
    await fs.writeFile(path.join(project.root, CONFIG_NAME), JSON.stringify({ ...legacy, title: "New name wins" }), "utf8");
    server = await startServer(project.root);
    assert.equal((await apiOk(server, "/api/bootstrap")).title, "New name wins");
  });

  it("falls back to the old remembered-project file and the old host variable", async () => {
    const project = await makeProject();
    const fakeApp = await makeTempDir();
    await fs.writeFile(path.join(fakeApp, LEGACY_LOCAL_POINTER_NAME), JSON.stringify({ repo: project.root }), "utf8");
    const loaded = await loadReviewConfig({ appRoot: fakeApp, argv: [], cwd: fakeApp, env: {} });
    assert.equal(loaded.repoRoot, project.root);
    const other = await makeProject();
    await fs.writeFile(path.join(fakeApp, LOCAL_POINTER_NAME), JSON.stringify({ repo: other.root }), "utf8");
    assert.equal((await loadReviewConfig({ appRoot: fakeApp, argv: [], cwd: fakeApp, env: {} })).repoRoot, other.root);

    const server = await startServer(project.root, { env: { DRAFT_REVIEW_HOST: "localhost" } });
    assert.match(server.output(), /running at http:\/\/localhost:/);
  });

  it("setup writes only the new names", async () => {
    const root = await texProject({ "main.tex": article });
    assert.equal(runSetup([root, "--no-remember"]).status, 0);
    assert.deepEqual((await fs.readdir(root)).sort(), [STATE_DIR_NAME, CONFIG_NAME, "main.tex"].sort());
  });

  it("honours PAPER_PAL_PORT and lets --port win", async () => {
    const project = await makeProject();
    assert.equal((await loadReviewConfig({ appRoot, argv: ["--repo", project.root], env: { PAPER_PAL_PORT: "4439" } })).port, 4439);
    assert.equal((await loadReviewConfig({ appRoot, argv: ["--repo", project.root, "--port", "0"], env: { PAPER_PAL_PORT: "4439" } })).port, 0);
    assert.equal((await loadReviewConfig({ appRoot, argv: ["--repo", project.root], env: {} })).port, 4317);
    await assert.rejects(loadReviewConfig({ appRoot, argv: ["--repo", project.root, "--port", "99999"], env: {} }), /Invalid port/);
  });
});

describe("setup: non-interactive, JSON, exit codes", () => {
  it("prints one JSON object describing what it did", async () => {
    const root = await texProject({ "main.tex": article });
    const result = runSetup([root, "--json", "--yes", "--no-remember", "--no-compile", "--provider", "anthropic", "--model", "some-model", "--chat-model", "chat-model", "--review-language", "German"], { env: { ...noAgents } });
    assert.equal(result.status, 0, result.stderr);
    const output = json(result);
    assert.equal(output.ok, true);
    assert.equal(output.configPath, path.join(root, CONFIG_NAME));
    assert.equal(output.project, root);
    assert.equal(output.defaultDocument, "main.tex");
    assert.equal(output.provider, "anthropic");
    assert.deepEqual(output.providerStatus, { decidedBy: "flag", model: "some-model", available: false, reason: "Set ANTHROPIC_API_KEY in .env." });
    assert.equal(output.compile, false);
    assert.equal(output.compileStatus.decidedBy, "flag");
    assert.deepEqual(output.next, [`npm run doctor -- --repo ${root}`, `npm start -- --repo ${root}`]);
    const config = JSON.parse(await fs.readFile(output.configPath, "utf8"));
    assert.equal(config.agent.provider, "anthropic");
    assert.deepEqual(config.anthropic, { model: "some-model", chatModel: "chat-model" });
    assert.equal(config.agent.reviewLanguage, "German");
    assert.equal(config.codex, undefined);
    assert.ok(!JSON.stringify(config).match(/apiKey"|"key"|token/i));
    // The file it wrote loads.
    await loadReviewConfig({ appRoot, argv: ["--repo", root], env: {} });
    // Setup writes a subset of the example configuration: every agent field
    // it writes is in the example, and the only one it leaves to its default
    // is guidanceFiles (unset means "AGENTS.md / CLAUDE.md when they exist").
    const example = JSON.parse(await fs.readFile(path.join(appRoot, "paper-pal.config.example.json"), "utf8"));
    assert.deepEqual(Object.keys(example.agent).filter((key) => !(key in config.agent)), ["guidanceFiles"]);
    assert.deepEqual(Object.keys(config.agent).filter((key) => !(key in example.agent)), []);
    assert.equal(config.agent.promptMode, example.agent.promptMode);
  });

  it("chooses the provider by itself: an installed CLI, else a provider with a key, else codex with a note", async () => {
    const cli = json(runSetup([await texProject({ "main.tex": article }), "--json", "--no-remember"], { env: { ...noAgents, CLAUDE_BIN: process.execPath } }));
    assert.equal(cli.provider, "claude");
    assert.equal(cli.providerStatus.decidedBy, "auto");
    const keyed = json(runSetup([await texProject({ "main.tex": article }), "--json", "--no-remember"], { env: { ...noAgents, DEEPSEEK_API_KEY: "sk-anything-123456" } }));
    assert.equal(keyed.provider, "deepseek");
    assert.equal(keyed.providerStatus.reason, `Set deepseek.model in ${CONFIG_NAME}.`);
    const none = json(runSetup([await texProject({ "main.tex": article }), "--json", "--no-remember"], { env: { ...noAgents } }));
    assert.equal(none.provider, "codex");
    assert.equal(none.providerStatus.decidedBy, "fallback");
    assert.equal(none.providerStatus.available, false);
    assert.ok(none.notes.some((note) => /No agent CLI/.test(note)));
  });

  it("turns compilation on only when latexmk is installed, unless told otherwise", async () => {
    const without = json(runSetup([await texProject({ "main.tex": article }), "--json", "--no-remember"], { env: { ...noAgents, PATH: "/nonexistent" } }));
    assert.equal(without.compile, false);
    assert.deepEqual(without.compileStatus, { decidedBy: "auto", latexmkFound: false });
    const bin = await makeTempDir();
    await fs.writeFile(path.join(bin, "latexmk"), "#!/bin/sh\necho Latexmk\n", { mode: 0o755 });
    const withLatexmk = json(runSetup([await texProject({ "main.tex": article }), "--json", "--no-remember"], { env: { ...noAgents, PATH: bin } }));
    assert.equal(withLatexmk.compile, true);
    assert.deepEqual(withLatexmk.compileStatus, { decidedBy: "auto", latexmkFound: true });
    const forced = json(runSetup([await texProject({ "main.tex": article }), "--json", "--no-remember", "--compile"], { env: { ...noAgents, PATH: "/nonexistent" } }));
    assert.equal(forced.compile, true);
    assert.equal(forced.compileStatus.decidedBy, "flag");
  });

  it("finds the entry point by \\documentclass when there is no main.tex", async () => {
    const root = await texProject({
      "paper/thesis.tex": article,
      "paper/chapters/one.tex": "\\section{One}\nText.\n",
      "paper/notes.tex": "% \\documentclass{article} is only mentioned in a comment\nNotes.\n",
      ".hidden/other.tex": article,
      "build/copy.tex": article,
      "node_modules/pkg/x.tex": article,
    });
    const output = json(runSetup([root, "--json", "--no-remember", "--no-compile"]));
    assert.equal(output.defaultDocument, "paper/thesis.tex");
    assert.equal(output.mainDetectedBy, "documentclass");
  });

  it("exit 2: usage errors", async () => {
    const root = await texProject({ "main.tex": article });
    for (const args of [[], [root, "--bogus"], [root, "--provider", "nope"], [root, "--main"], [root, "--compile", "--no-compile"]]) {
      const result = runSetup([...args, "--json"]);
      assert.equal(result.status, 2, args.join(" "));
      assert.equal(json(result).ok, false);
      assert.equal(json(result).error.code, "usage");
    }
    const human = runSetup([]);
    assert.equal(human.status, 2);
    assert.match(human.stderr, /Usage: npm run setup/);
  });

  it("exit 3: the project directory does not exist", async () => {
    const result = runSetup([path.join(await makeTempDir(), "missing"), "--json"]);
    assert.equal(result.status, 3);
    assert.equal(json(result).error.code, "project_not_found");
  });

  it("exit 4: no .tex with \\documentclass", async () => {
    const result = runSetup([await texProject({ "notes.tex": "Just notes.\n" }), "--json"]);
    assert.equal(result.status, 4);
    assert.equal(json(result).error.code, "no_main_tex");
    const missing = runSetup([await texProject({ "main.tex": article }), "--json", "--main", "other.tex"]);
    assert.equal(missing.status, 4);
  });

  it("exit 5: several candidates, listed", async () => {
    const root = await texProject({ "a/paper.tex": article, "b/poster.tex": article });
    const result = runSetup([root, "--json"]);
    assert.equal(result.status, 5);
    assert.deepEqual(json(result).error, {
      code: "several_main_tex",
      message: "Several files could be the manuscript entry point. Pass --main <file.tex> to choose one:",
      candidates: ["a/paper.tex", "b/poster.tex"],
    });
    assert.ok(!existsSync(path.join(root, CONFIG_NAME)));
    const chosen = runSetup([root, "--json", "--no-remember", "--main", "b/poster.tex"]);
    assert.equal(chosen.status, 0);
    assert.equal(json(chosen).defaultDocument, "b/poster.tex");
  });

  it("exit 6: a configuration already exists (unless --force)", async () => {
    const root = await texProject({ "main.tex": article });
    assert.equal(runSetup([root, "--no-remember"]).status, 0);
    const again = runSetup([root, "--no-remember", "--json"]);
    assert.equal(again.status, 6);
    assert.equal(json(again).error.code, "config_exists");
    assert.equal(runSetup([root, "--no-remember", "--force", "--title", "Replaced"]).status, 0);
    assert.equal(JSON.parse(await fs.readFile(path.join(root, CONFIG_NAME), "utf8")).title, "Replaced");
  });

  it("never waits for input", async () => {
    const root = await texProject({ "main.tex": article });
    const result = spawnSync(process.execPath, [path.join(appRoot, "scripts", "setup.mjs"), root, "--no-remember"], {
      encoding: "utf8", timeout: 20_000, stdio: ["inherit", "pipe", "pipe"], env: { ...process.env, ...testEnvironment },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Paper Pal is configured for/);
  });
});

describe("doctor", () => {
  it("--json lists every check; only the default provider being unavailable is an error", async () => {
    const project = await makeProject({ config: { agent: { enabled: true, provider: "openai" }, openai: { model: "m" } } });
    const broken = runDoctor(["--repo", project.root, "--json"], { env: { ...noAgents } });
    assert.equal(broken.status, 1);
    const report = json(broken);
    assert.equal(report.ok, false);
    const byId = Object.fromEntries(report.checks.map((item) => [item.id, item]));
    for (const item of report.checks) assert.deepEqual(Object.keys(item).sort(), ["detail", "fix", "id", "ok", "severity"]);
    assert.equal(byId.node.ok, true);
    assert.equal(byId.katex.ok, true);
    assert.equal(byId.config.ok, true);
    assert.equal(byId["main-document"].ok, true);
    assert.equal(byId.latex.ok, true, "compilation is disabled in this project, so a missing latexmk is not a failure");
    assert.deepEqual(
      { ok: byId["provider:openai"].ok, severity: byId["provider:openai"].severity, fix: byId["provider:openai"].fix },
      { ok: false, severity: "error", fix: "Set OPENAI_API_KEY in .env." },
    );
    assert.deepEqual({ ok: byId["provider:codex"].ok, severity: byId["provider:codex"].severity }, { ok: false, severity: "info" });
    assert.deepEqual(report.checks.filter((item) => !item.ok && item.severity === "error").map((item) => item.id), ["provider:openai"]);

    const fixed = runDoctor(["--repo", project.root, "--json"], { env: { ...noAgents, OPENAI_API_KEY: "sk-doctor-test-0123456789" } });
    assert.equal(fixed.status, 0, fixed.stdout);
    assert.equal(json(fixed).ok, true);
    assert.ok(!fixed.stdout.includes("sk-doctor-test-0123456789"));
  });

  it("a missing LaTeX program is an error only when compilation is enabled", async () => {
    const project = await makeProject({ fakeAgent: true, config: { latex: { enabled: true, cwd: ".", command: "latexmk", args: ["main.tex"] } } });
    const result = runDoctor(["--repo", project.root, "--json"], { env: { PATH: "/nonexistent" } });
    assert.equal(result.status, 1);
    const latex = json(result).checks.find((item) => item.id === "latex");
    assert.deepEqual({ ok: latex.ok, severity: latex.severity }, { ok: false, severity: "error" });
    assert.match(latex.fix, /Install a LaTeX distribution/);
  });

  it("reports a missing or broken configuration as JSON too", async () => {
    const empty = await makeTempDir();
    const result = runDoctor(["--repo", empty, "--json"]);
    assert.equal(result.status, 1);
    const config = json(result).checks.find((item) => item.id === "config");
    assert.equal(config.ok, false);
    assert.match(config.fix, /npm run setup/);
    const human = runDoctor(["--repo", empty]);
    assert.equal(human.status, 1);
    assert.match(human.stdout, /✗ config:/);
  });

  it("--ping sends a one-token request through the adapter", async () => {
    const { startMockApi } = await import("./helpers.mjs");
    const mock = await startMockApi();
    const project = await makeProject({ config: { agent: { enabled: true, provider: "ollama" }, ollama: { model: "local", baseUrl: `${mock.origin}/v1` } } });
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(appRoot, "scripts", "doctor.mjs"), "--repo", project.root, "--json", "--ping"], { env: { ...process.env, ...testEnvironment, ...noAgents } });
      let stdout = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.on("close", (status) => resolve({ status, stdout }));
    });
    assert.equal(result.status, 0, result.stdout);
    const checks = JSON.parse(result.stdout).checks;
    const ping = checks.find((item) => item.id === "ping:ollama");
    assert.equal(ping.ok, true);
    const posts = mock.requests.filter((request) => request.body?.max_tokens !== undefined);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].body.max_tokens, 1);
    // The keyless local endpoint was probed and answered.
    const reach = checks.find((item) => item.id === "reach:ollama");
    assert.deepEqual({ ok: reach.ok, severity: reach.severity, fix: reach.fix }, { ok: true, severity: "warn", fix: null });
  });

  it("warns, without failing, when a model is set for Ollama but nothing is listening", async () => {
    const project = await makeProject({ config: { agent: { enabled: true, provider: "ollama" }, ollama: { model: "local", baseUrl: "http://127.0.0.1:1/v1" } } });
    const started = Date.now();
    const result = runDoctor(["--repo", project.root, "--json"], { env: { ...noAgents } });
    assert.equal(result.status, 0, result.stdout);
    assert.ok(Date.now() - started < 8000, "the probe has a short timeout");
    const byId = Object.fromEntries(json(result).checks.map((item) => [item.id, item]));
    assert.equal(byId["provider:ollama"].ok, true, "a configured model still counts as ready");
    assert.deepEqual({ ok: byId["reach:ollama"].ok, severity: byId["reach:ollama"].severity }, { ok: false, severity: "warn" });
    assert.match(byId["reach:ollama"].fix, /Start Ollama/);
    assert.match(byId["reach:ollama"].detail, /127\.0\.0\.1:1/);
    const human = runDoctor(["--repo", project.root], { env: { ...noAgents } });
    assert.match(human.stdout, /! reach:ollama:/);
    // Providers that need a key, and ones that are not set up, are never probed.
    assert.deepEqual(Object.keys(byId).filter((id) => id.startsWith("reach:")), ["reach:ollama"]);
  });
});

describe("what a project configuration may name", () => {
  async function load(raw, env = {}) {
    const root = await texProject({ "main.tex": article });
    await fs.writeFile(path.join(root, CONFIG_NAME), JSON.stringify({ latex: { enabled: false }, ...raw }), "utf8");
    return loadReviewConfig({ appRoot, argv: ["--repo", root], cwd: root, env });
  }

  it("refuses to start when the file holds something that looks like a key", async () => {
    for (const raw of [
      { openai: { model: "m", apiKey: "sk-live-0123456789" } },
      { anthropic: { api_key: "sk-ant-0123456789" } },
      { custom: { key: "abc" } },
      { agent: { token: "abc" } },
      { openrouter: { nested: { secret: "abc" } } },
    ]) {
      await assert.rejects(load(raw), (error) => {
        assert.match(error.message, /looks like a credential/);
        assert.match(error.message, /\.env/);
        assert.ok(!/sk-live-0123456789|sk-ant-0123456789/.test(error.message), "the message does not repeat the key");
        return true;
      });
    }
    // Naming the variable is fine; so is an empty placeholder.
    const { config } = await load({ openai: { model: "m", apiKeyEnv: "PAPER_PAL_LAB_KEY", apiKey: "" } });
    assert.equal(config.openai.apiKeyEnv, "PAPER_PAL_LAB_KEY");
  });

  it("the server exits with that message instead of starting", async () => {
    const project = await makeProject({ config: { openai: { apiKey: "sk-live-0123456789" } } });
    await assert.rejects(startServer(project.root), /looks like a credential: openai\.apiKey/);
  });

  it("limits latex.command to known programs unless PAPER_PAL_ALLOW_CUSTOM_LATEX=1", async () => {
    for (const command of ["latexmk", "pdflatex", "xelatex", "lualatex", "tectonic", "make"]) {
      assert.equal((await load({ latex: { enabled: false, command } })).config.latex.command, command);
    }
    for (const command of ["sh", "/usr/bin/latexmk", "./latexmk", "latexmk; rm -rf ~", "node"]) {
      await assert.rejects(load({ latex: { enabled: false, command } }), /may only name one of: latexmk, pdflatex/);
    }
    assert.equal((await load({ latex: { enabled: false, command: "/opt/tex/bin/latexmk" } }, { PAPER_PAL_ALLOW_CUSTOM_LATEX: "1" })).config.latex.command, "/opt/tex/bin/latexmk");
  });

  it("limits codex.command / claude.command to a bare name unless PAPER_PAL_ALLOW_CUSTOM_COMMANDS=1", async () => {
    assert.equal((await load({ codex: { command: "codex-nightly" } })).config.codex.command, "codex-nightly");
    for (const raw of [{ codex: { command: "/tmp/evil" } }, { claude: { command: "claude --dangerously-skip-permissions" } }, { codex: { command: "..\\evil.cmd" } }, { claude: { command: "-p" } }]) {
      await assert.rejects(load(raw), /may only give a bare program name/);
    }
    const allowed = await load({ codex: { command: "/opt/tools/my codex" } }, { PAPER_PAL_ALLOW_CUSTOM_COMMANDS: "1" });
    assert.equal(allowed.config.codex.command, "/opt/tools/my codex");
  });

  it("does not let a project file send a key to a host of its choosing", async () => {
    await assert.rejects(load({ openai: { model: "m", baseUrl: "https://collector.example/v1" } }), /may only name this machine/);
    await assert.rejects(load({ openai: { baseUrl: "ftp://x" } }), /http\(s\) URL/);
    assert.equal((await load({ openai: { baseUrl: "http://localhost:8080/v1/" } })).config.openai.baseUrl, "http://localhost:8080/v1");
    assert.equal((await load({ openai: { baseUrl: "https://api.openai.com/v1" } })).config.openai.baseUrl, "https://api.openai.com/v1");
    assert.equal((await load({ openai: { baseUrl: "https://proxy.example/v1" } }, { PAPER_PAL_ALLOW_PROJECT_BASE_URL: "1" })).config.openai.baseUrl, "https://proxy.example/v1");
    await assert.rejects(load({ custom: { protocol: "grpc" } }), /protocol must be one of/);
    await assert.rejects(load({ custom: { apiKeyEnv: "sk-this-is-a-key-not-a-name" } }), /NAME of an environment variable/);
    // A project file may not pick an unrelated secret to send to the API host.
    await assert.rejects(load({ openai: { model: "m", apiKeyEnv: "AWS_SECRET_ACCESS_KEY" } }), /may only name a provider key variable/);
    await assert.rejects(load({ openai: { model: "m", apiKeyEnv: "GITHUB_TOKEN" } }), /may only name a provider key variable/);
    assert.equal((await load({ openai: { model: "m", apiKeyEnv: "OPENROUTER_API_KEY" } })).config.openai.apiKeyEnv, "OPENROUTER_API_KEY");
    assert.equal((await load({ openai: { model: "m", apiKeyEnv: "MY_LAB_KEY" } }, { PAPER_PAL_ALLOW_PROJECT_KEY_ENV: "1" })).config.openai.apiKeyEnv, "MY_LAB_KEY");
    await assert.rejects(load({ anthropic: { maxTokens: -5 } }), /positive integer/);
    await assert.rejects(load({ agent: { provider: "gemini" } }), /agent\.provider is "gemini"/);
  });
});

describe("command line entry points", () => {
  it("paper-pal dispatches to the scripts", async () => {
    const bin = path.join(appRoot, "bin", "paper-pal.mjs");
    const run = (args, options = {}) => spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", env: { ...process.env, ...testEnvironment }, ...options });
    assert.equal(run(["--version"]).stdout.trim(), JSON.parse(await fs.readFile(path.join(appRoot, "package.json"), "utf8")).version);
    assert.match(run(["--help"]).stdout, /setup .*doctor .*start .*demo/s);
    assert.equal(run(["frobnicate"]).status, 2);
    // Relative project paths resolve against the caller's directory.
    const parent = await makeTempDir();
    await fs.mkdir(path.join(parent, "my paper"));
    await fs.writeFile(path.join(parent, "my paper", "main.tex"), article, "utf8");
    const setup = run(["setup", "my paper", "--json", "--no-remember"], { cwd: parent });
    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(JSON.parse(setup.stdout).project, path.join(parent, "my paper"));
    assert.equal(run(["setup", "my paper", "--json"], { cwd: parent }).status, 6, "exit codes pass through");
    const doctor = run(["doctor", "--repo", path.join(parent, "my paper"), "--json"]);
    assert.equal(JSON.parse(doctor.stdout).checks.find((item) => item.id === "config").ok, true);
  });

  it("package.json exposes the documented scripts and the bin", async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(appRoot, "package.json"), "utf8"));
    assert.equal(pkg.name, "paper-pal");
    assert.equal(pkg.private, undefined);
    assert.equal(pkg.license, "MIT");
    assert.deepEqual(pkg.bin, { "paper-pal": "bin/paper-pal.mjs" });
    for (const name of ["setup", "doctor", "start", "dev", "demo", "check", "test"]) assert.ok(pkg.scripts[name], name);
    assert.deepEqual(Object.keys(pkg.dependencies), ["katex"]);
  });

  it("the published package lists every module it needs and nothing for development", async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(appRoot, "package.json"), "utf8"));
    // `files` is a whitelist, so a new root module that is not listed would be missing from the tarball.
    const rootModules = (await fs.readdir(appRoot)).filter((name) => name.endsWith(".mjs"));
    for (const name of rootModules) assert.ok(pkg.files.includes(name), `${name} is not in package.json "files"`);
    for (const entry of ["bin/", "public/", "schemas/", "examples/", "scripts/setup.mjs", "scripts/doctor.mjs", "scripts/demo.mjs", ".env.example", "paper-pal.config.example.json"]) {
      assert.ok(pkg.files.includes(entry), entry);
    }
    for (const entry of pkg.files.filter((value) => !value.includes("*"))) assert.ok(existsSync(path.join(appRoot, entry)), `${entry} does not exist`);
    assert.deepEqual(pkg.files.filter((entry) => /^(tests|[.]github|docs\/images|node_modules)\b/.test(entry)), []);
    assert.match(pkg.repository.url, /github[.]com\/claire1217\/paper-pal/i);
  });

  // Starts the demo and resolves once the banner shows the port and the copy.
  async function startDemo(stdin) {
    const child = spawn(process.execPath, [path.join(appRoot, "scripts", "demo.mjs"), "--port", "0"], {
      cwd: appRoot, env: { ...process.env, ...testEnvironment, ...noAgents, PATH: "/nonexistent" }, stdio: [stdin, "pipe", "pipe"],
    });
    const demo = { child, output: "" };
    child.stdout.on("data", (chunk) => { demo.output += chunk; });
    child.stderr.on("data", (chunk) => { demo.output += chunk; });
    const deadline = Date.now() + 20_000;
    while (!/running at http:\/\/127\.0\.0\.1:(\d+)/.test(demo.output)) {
      if (Date.now() > deadline || child.exitCode !== null) {
        child.kill("SIGKILL");
        throw new Error(`demo did not start:\n${demo.output}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    demo.port = demo.output.match(/running at http:\/\/127\.0\.0\.1:(\d+)/)[1];
    demo.copy = demo.output.match(/throwaway copy in (.+)/)[1].trim();
    return demo;
  }

  async function assertStoppedAndClean(demo) {
    const code = await new Promise((resolve) => (demo.child.exitCode !== null ? resolve(demo.child.exitCode) : demo.child.once("exit", resolve)));
    assert.equal(code, 0, demo.output);
    assert.ok(!existsSync(path.dirname(demo.copy)), `the copy is removed\n${demo.output}`);
    await assert.rejects(fetch(`http://127.0.0.1:${demo.port}/api/health`), "the server is gone too");
  }

  // Stopped by the line "stop" on stdin: the one orderly stop that exists on
  // every platform. On Windows kill() ends the demo at once, without running
  // its handlers, so a signal can never show the clean-up there.
  it("npm run demo serves a throwaway copy with no agent and no key, and cleans up", async () => {
    const demo = await startDemo("pipe");
    try {
      const { port, copy } = demo;
      assert.ok(!copy.startsWith(appRoot), "the repository stays clean");
      assert.ok(existsSync(path.join(copy, CONFIG_NAME)));
      const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
      assert.equal(health.ok, true);
      assert.equal(health.defaultProvider, "codex");
      assert.equal(health.providers.find((item) => item.id === "codex").available, false);
      assert.equal(health.latex.enabled, false);
      assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
      assert.match(demo.output, /Agent:\s+Codex - not ready\./);
      assert.match(demo.output, /Press Ctrl\+C to stop/);
      demo.child.stdin.write("stop\n");
      await assertStoppedAndClean(demo);
    } finally {
      if (demo.child.exitCode === null) demo.child.kill("SIGKILL");
    }
  });

  it("npm run demo cleans up after SIGTERM", { skip: process.platform === "win32" && "Windows has no SIGTERM; kill() ends the process without running handlers" }, async () => {
    const demo = await startDemo("ignore");
    try {
      demo.child.kill("SIGTERM");
      await assertStoppedAndClean(demo);
    } finally {
      if (demo.child.exitCode === null) demo.child.kill("SIGKILL");
    }
  });
});

describe("start banner", () => {
  it("names the app, version, URL, project and the default provider's readiness", async () => {
    const project = await makeProject({ config: { title: "Banner Paper", agent: { enabled: true, provider: "deepseek" } } });
    const server = await startServer(project.root, { env: { DEEPSEEK_API_KEY: "" } });
    const output = server.output();
    assert.match(output, /^Paper Pal \d+\.\d+\.\d+ is running at http:\/\/127\.0\.0\.1:\d+$/m);
    assert.match(output, /Project:\s+Banner Paper \(main\.tex\)/);
    assert.match(output, /Agent:\s+DeepSeek API - not ready\. Set DEEPSEEK_API_KEY in \.env\./);
    assert.match(output, /Press Ctrl\+C to stop\./);
    assert.doesNotMatch(output, new RegExp(`:0\\b.*running|running at http://127\\.0\\.0\\.1:0\\b`), "--port 0 prints the real port");
  });
});
