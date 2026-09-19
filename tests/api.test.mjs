import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  api, apiOk, appRoot, cleanupAll, commentOn, configName, makeProject, makeTempDir, runAdapter, startMockApi, startServer,
  stateDirectory, waitFor, waitForRequest,
} from "./helpers.mjs";
import {
  AGENT_PROVIDERS, API_PROVIDERS, PROVIDER_TABLE, apiSettings, buildAgentInvocation, childEnvironment, describeProvider,
  firstUsableProvider, providerAvailability,
} from "../agent-providers.mjs";
import { answerText, buildRequest, extractJsonObject, redact, schemaForResponseFormat } from "../api-adapter.mjs";
import { loadEnvFile, parseEnv } from "../env.mjs";

const KEY = "sk-mock-DO-NOT-LEAK-abcdef0123456789";
const schemaPath = path.join(appRoot, "schemas", "proposal-output.schema.json");

after(cleanupAll);

describe("API adapter: OpenAI-compatible protocol", () => {
  it("posts to {baseUrl}/chat/completions with a bearer key and a json_schema response_format", async () => {
    const mock = await startMockApi(() => ({ json: { choices: [{ message: { content: "{\"replacementText\":\"X\",\"summary\":\"s\",\"relatedChanges\":[]}" }, finish_reason: "stop" }] } }));
    const run = await runAdapter(
      ["--protocol", "openai", "--base-url", `${mock.origin}/v1/`, "--model", "mock-model", "--key-env", "MOCK_KEY", "--schema", schemaPath],
      { input: "the prompt text", env: { MOCK_KEY: KEY } },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), { replacementText: "X", summary: "s", relatedChanges: [] });
    assert.equal(mock.requests.length, 1);
    const [request] = mock.requests;
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/chat/completions");
    assert.equal(request.headers.authorization, `Bearer ${KEY}`);
    assert.match(request.headers["content-type"], /^application\/json/);
    assert.equal(request.headers["x-api-key"], undefined);
    assert.equal(request.body.model, "mock-model");
    assert.equal(request.body.stream, false);
    assert.deepEqual(request.body.messages, [{ role: "user", content: "the prompt text" }]);
    const format = request.body.response_format;
    assert.equal(format.type, "json_schema");
    assert.equal(format.json_schema.strict, true);
    assert.deepEqual(format.json_schema.schema.required, ["replacementText", "summary", "relatedChanges"]);
    assert.equal(format.json_schema.schema.additionalProperties, false);
    // Keywords strict mode rejects are dropped from this copy only.
    assert.equal(format.json_schema.schema.properties.relatedChanges.maxItems, undefined);
    assert.equal(format.json_schema.schema.$schema, undefined);
    assert.ok(format.json_schema.schema.properties.relatedChanges.items.properties.required, "a property that happens to be called \"required\" survives");
  });

  it("sends no response_format without a schema and returns plain text untouched", async () => {
    const mock = await startMockApi(() => ({ json: { choices: [{ message: { content: "  A plain {not json} answer.  " } }] } }));
    const run = await runAdapter(["--base-url", `${mock.origin}/v1`, "--model", "m", "--key-env", "MOCK_KEY"], { env: { MOCK_KEY: KEY } });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "A plain {not json} answer.");
    assert.equal(mock.requests[0].body.response_format, undefined);
  });

  it("retries once without response_format when the endpoint rejects it, then extracts fenced JSON", async () => {
    const mock = await startMockApi((record) => (record.body.response_format
      ? { status: 400, json: { error: { message: "Unknown parameter: 'response_format.json_schema'." } } }
      : null));
    const run = await runAdapter(
      ["--base-url", `${mock.origin}/v1`, "--model", "m", "--key-env", "MOCK_KEY", "--schema", schemaPath],
      { input: `Rewrite.\n${JSON.stringify({ version: 1, target: { selectedText: "quiet text" } })}\n\nschema follows`, env: { MOCK_KEY: KEY } },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.equal(mock.requests.length, 2);
    assert.ok(mock.requests[0].body.response_format);
    assert.equal(mock.requests[1].body.response_format, undefined);
    assert.equal(JSON.parse(run.stdout).replacementText, "QUIET TEXT", "prose and the code fence around the object are stripped");
    assert.match(run.stderr, /rejected "response_format"/);
  });

  it("does not retry a 400 that has nothing to do with an optional parameter", async () => {
    const mock = await startMockApi(() => ({ status: 400, json: { error: { message: "model not found" } } }));
    const run = await runAdapter(["--base-url", `${mock.origin}/v1`, "--model", "m", "--key-env", "MOCK_KEY"], { env: { MOCK_KEY: KEY } });
    assert.equal(run.status, 1);
    assert.equal(mock.requests.length, 1);
    assert.match(run.stderr, /HTTP 400/);
    assert.match(run.stderr, /model not found/);
  });

  it("retries exactly once after 429 and after 5xx", async () => {
    for (const status of [429, 503]) {
      const mock = await startMockApi((record) => (record.index === 0 ? { status, json: { error: { message: "slow down" } } } : null));
      const run = await runAdapter(["--base-url", `${mock.origin}/v1`, "--model", "m", "--key-env", "MOCK_KEY"], { env: { MOCK_KEY: KEY } });
      assert.equal(run.status, 0, run.stderr);
      assert.equal(mock.requests.length, 2, `status ${status}`);
      assert.match(run.stdout, /^mock chat answer/);
    }
    const always = await startMockApi(() => ({ status: 429, json: { error: { message: "slow down" } } }));
    const run = await runAdapter(["--base-url", `${always.origin}/v1`, "--model", "m", "--key-env", "MOCK_KEY"], { env: { MOCK_KEY: KEY } });
    assert.equal(run.status, 1);
    assert.equal(always.requests.length, 2, "one retry, not more");
  });

  it("retries once after a network error and reports it without the key", async () => {
    const run = await runAdapter(["--base-url", "http://127.0.0.1:9/v1", "--model", "m", "--key-env", "MOCK_KEY"], { env: { MOCK_KEY: KEY } });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /retrying once/);
    assert.match(run.stderr, /network error/);
    assert.ok(!run.stderr.includes(KEY));
  });

  it("gives up when the endpoint does not answer within --timeout", async () => {
    const mock = await startMockApi(() => ({ hang: true }));
    const started = Date.now();
    const run = await runAdapter(["--base-url", `${mock.origin}/v1`, "--model", "m", "--key-env", "MOCK_KEY", "--timeout", "500"], { env: { MOCK_KEY: KEY } });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /did not answer within/);
    assert.ok(Date.now() - started < 5000);
    assert.equal(mock.requests.length, 1, "a timeout is not retried: the budget is spent");
  });

  it("never prints the key, even when the endpoint echoes it back", async () => {
    const mock = await startMockApi((record) => ({ status: 401, json: { error: { message: `Incorrect API key provided: ${record.headers.authorization}` } } }));
    const run = await runAdapter(["--base-url", `${mock.origin}/v1`, "--model", "m", "--key-env", "MOCK_KEY"], { env: { MOCK_KEY: KEY } });
    assert.equal(run.status, 1);
    assert.ok(!run.stderr.includes(KEY), run.stderr);
    assert.ok(!run.stdout.includes(KEY));
    assert.match(run.stderr, /\[redacted\]/);
    assert.match(run.stderr, /Check MOCK_KEY in \.env/);
  });

  it("refuses to run without a key unless the provider needs none", async () => {
    const mock = await startMockApi();
    const refused = await runAdapter(["--base-url", `${mock.origin}/v1`, "--model", "m", "--key-env", "MOCK_KEY"], { env: {} });
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /MOCK_KEY is not set/);
    assert.equal(mock.requests.length, 0);
    const local = await runAdapter(["--base-url", `${mock.origin}/v1`, "--model", "m", "--key-optional"], { env: {} });
    assert.equal(local.status, 0, local.stderr);
    assert.equal(mock.requests[0].headers.authorization, undefined);
    const noModel = await runAdapter(["--base-url", `${mock.origin}/v1`, "--key-optional"], { env: {} });
    assert.equal(noModel.status, 2);
    assert.match(noModel.stderr, /No model configured/);
  });

  it("drops a reasoning parameter the endpoint does not know", async () => {
    const mock = await startMockApi((record) => (record.body.reasoning_effort ? { status: 400, json: { error: { message: "Unrecognized request argument supplied: reasoning_effort" } } } : null));
    const run = await runAdapter(["--base-url", `${mock.origin}/v1`, "--model", "m", "--key-optional", "--effort", "low", "--effort-style", "openai"]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(mock.requests[0].body.reasoning_effort, "low");
    assert.equal(mock.requests[1].body.reasoning_effort, undefined);
  });

  it("identifies itself to OpenRouter as Paper Pal and to nobody else", () => {
    const openrouter = buildRequest({ protocol: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "m", title: "Paper Pal", effort: "low", effortStyle: "openrouter" }, "p", KEY, null);
    assert.equal(openrouter.url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(openrouter.headers["X-Title"], "Paper Pal");
    assert.equal(openrouter.headers["HTTP-Referer"], "https://github.com/claire1217/paper-pal");
    assert.deepEqual(openrouter.body.reasoning, { effort: "low" });
    const openai = buildRequest({ protocol: "openai", baseUrl: "https://api.openai.com/v1", model: "m" }, "p", KEY, null);
    assert.equal(openai.headers["X-Title"], undefined);
    assert.equal(openai.headers["HTTP-Referer"], undefined);
  });
});

describe("API adapter: Anthropic protocol", () => {
  it("posts to {baseUrl}/v1/messages with x-api-key, the version header and max_tokens", async () => {
    const mock = await startMockApi();
    const prompt = `Rewrite.\n${JSON.stringify({ version: 1, target: { selectedText: "soft words" } })}\n\nschema`;
    const run = await runAdapter(
      ["--protocol", "anthropic", "--base-url", mock.origin, "--model", "mock-claude", "--key-env", "MOCK_KEY", "--schema", schemaPath],
      { input: prompt, env: { MOCK_KEY: KEY } },
    );
    assert.equal(run.status, 0, run.stderr);
    const [request] = mock.requests;
    assert.equal(request.url, "/v1/messages");
    assert.equal(request.headers["x-api-key"], KEY);
    assert.equal(request.headers["anthropic-version"], "2023-06-01");
    assert.equal(request.headers.authorization, undefined);
    assert.equal(request.body.model, "mock-claude");
    assert.equal(request.body.max_tokens, 8192);
    assert.deepEqual(request.body.messages, [{ role: "user", content: prompt }]);
    assert.equal(request.body.response_format, undefined, "the Messages API has no response_format");
    assert.equal(JSON.parse(run.stdout).replacementText, "SOFT WORDS", "text blocks are joined, then the JSON is extracted");
  });

  it("honours --max-tokens and a base URL that already ends in /v1", async () => {
    const mock = await startMockApi();
    const run = await runAdapter(["--protocol", "anthropic", "--base-url", `${mock.origin}/v1`, "--model", "m", "--key-env", "MOCK_KEY", "--max-tokens", "1234"], { env: { MOCK_KEY: KEY } });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(mock.requests[0].url, "/v1/messages");
    assert.equal(mock.requests[0].body.max_tokens, 1234);
  });

  it("ignores non-text content blocks", () => {
    assert.equal(answerText("anthropic", { content: [{ type: "thinking", thinking: "hmm" }, { type: "text", text: "A" }, { type: "text", text: "B" }] }), "AB");
    assert.equal(answerText("openai", { choices: [{ message: { content: [{ type: "text", text: "A" }, { type: "text", text: "B" }] } }] }), "AB");
  });
});

describe("JSON extraction and redaction", () => {
  it("finds the object in bare, fenced and chatty replies", () => {
    assert.equal(extractJsonObject("{\"a\":1}"), "{\"a\":1}");
    assert.equal(extractJsonObject("```json\n{\"a\":1}\n```"), "{\"a\":1}");
    assert.equal(extractJsonObject("```\n{\"a\":1}\n```"), "{\"a\":1}");
    assert.equal(extractJsonObject("Sure! Here it is: {\"a\":{\"b\":\"} not the end {\"}} Hope that helps."), "{\"a\":{\"b\":\"} not the end {\"}}");
    assert.equal(extractJsonObject("Use {braces} like this. Result: {\"ok\":true}"), "{\"ok\":true}");
    assert.equal(extractJsonObject("no json here"), null);
    assert.equal(extractJsonObject("[1,2,3]"), null);
  });

  it("redacts the key and bearer tokens", () => {
    assert.equal(redact(`key=${KEY}`, KEY), "key=[redacted]");
    assert.equal(redact("Authorization: Bearer abcdefghijklmnop", null), "Authorization: Bearer [redacted]");
  });

  it("simplifies only schema keywords, not property names", () => {
    const cleaned = schemaForResponseFormat({ type: "object", properties: { pattern: { type: "string", minLength: 2 } }, maxProperties: 3 });
    assert.deepEqual(cleaned, { type: "object", properties: { pattern: { type: "string" } } });
  });
});

describe(".env loading", () => {
  it("parses the usual .env syntax", () => {
    const parsed = parseEnv([
      "# a comment",
      "",
      "PLAIN=value",
      "export EXPORTED=yes",
      "  SPACED  =  padded value  ",
      "DOUBLE=\"two words # not a comment\\nnext line\"",
      "SINGLE='literal \\n $HOME'",
      "TRAILING=abc # comment",
      "HASH_INSIDE=abc#def",
      "EMPTY=",
      "URL=https://example.org/v1?x=1",
      "not a valid line",
      "1BAD=nope",
    ].join("\r\n"));
    assert.deepEqual(parsed, {
      PLAIN: "value",
      EXPORTED: "yes",
      SPACED: "padded value",
      DOUBLE: "two words # not a comment\nnext line",
      SINGLE: "literal \\n $HOME",
      TRAILING: "abc",
      HASH_INSIDE: "abc#def",
      EMPTY: "",
      URL: "https://example.org/v1?x=1",
    });
  });

  it("loads <appRoot>/.env without overriding the shell", async () => {
    const root = await makeTempDir();
    await fs.writeFile(path.join(root, ".env"), "FROM_FILE=file\nALREADY_SET=file\nBLANK=\n", "utf8");
    const env = { ALREADY_SET: "shell" };
    const report = loadEnvFile(root, env);
    assert.deepEqual(env, { ALREADY_SET: "shell", FROM_FILE: "file" });
    assert.deepEqual(report.loaded, ["FROM_FILE"]);
    assert.deepEqual(report.skipped, ["ALREADY_SET"]);
    assert.equal(loadEnvFile(await makeTempDir(), {}).exists, false, "a missing file is fine");
    const disabled = { PAPER_PAL_ENV_FILE: "none" };
    loadEnvFile(root, disabled);
    assert.equal(disabled.FROM_FILE, undefined);
  });

  it("is read by the server from the app folder only, never from the project", async () => {
    const mock = await startMockApi();
    const project = await makeProject({ config: { agent: { enabled: true, provider: "openai" }, openai: { model: "mock-model", baseUrl: `${mock.origin}/v1` } } });
    // A .env inside the manuscript project must be ignored...
    await fs.writeFile(path.join(project.root, ".env"), "OPENAI_API_KEY=from-the-project\n", "utf8");
    let server = await startServer(project.root);
    let health = await apiOk(server, "/api/health");
    assert.equal(health.providers.find((item) => item.id === "openai").available, false);
    await server.stop();
    // ...while the app's own env file is honoured.
    const envFile = path.join(await makeTempDir(), "app.env");
    await fs.writeFile(envFile, `export OPENAI_API_KEY="${KEY}"\n`, "utf8");
    server = await startServer(project.root, { env: { PAPER_PAL_ENV_FILE: envFile } });
    health = await apiOk(server, "/api/health");
    assert.equal(health.providers.find((item) => item.id === "openai").available, true);
    assert.ok(!JSON.stringify(health).includes(KEY));
  });
});

describe("provider table", () => {
  it("lists the presets with their endpoints and key variables, and no model ids", () => {
    assert.deepEqual([...AGENT_PROVIDERS], ["codex", "claude", "openai", "anthropic", "openrouter", "deepseek", "ollama", "custom"]);
    const summary = Object.fromEntries(API_PROVIDERS.map((id) => {
      const settings = apiSettings(id, {}, { PAPER_PAL_API_BASE_URL: "https://llm.example/v1" });
      return [id, [settings.protocol, settings.baseUrl, settings.apiKeyEnv, settings.keyRequired]];
    }));
    assert.deepEqual(summary, {
      openai: ["openai", "https://api.openai.com/v1", "OPENAI_API_KEY", true],
      anthropic: ["anthropic", "https://api.anthropic.com", "ANTHROPIC_API_KEY", true],
      openrouter: ["openai", "https://openrouter.ai/api/v1", "OPENROUTER_API_KEY", true],
      deepseek: ["openai", "https://api.deepseek.com/v1", "DEEPSEEK_API_KEY", true],
      ollama: ["openai", "http://127.0.0.1:11434/v1", null, false],
      custom: ["openai", "https://llm.example/v1", "PAPER_PAL_API_KEY", false],
    });
    for (const id of AGENT_PROVIDERS) {
      assert.equal(PROVIDER_TABLE[id].capabilities.readRepo, PROVIDER_TABLE[id].kind === "cli", id);
      assert.equal(PROVIDER_TABLE[id].model, undefined, "model ids go stale and are never built in");
    }
  });

  it("explains in one sentence why a provider is not ready", () => {
    const env = { PATH: "/nonexistent" };
    assert.deepEqual(providerAvailability("openai", {}, env), { available: false, reason: "Set OPENAI_API_KEY in .env." });
    assert.deepEqual(providerAvailability("openai", {}, { ...env, OPENAI_API_KEY: "x" }), { available: false, reason: `Set openai.model in ${configName}.` });
    assert.deepEqual(providerAvailability("openai", { openai: { model: "m" } }, { ...env, OPENAI_API_KEY: "x" }), { available: true, reason: null });
    assert.deepEqual(providerAvailability("ollama", { ollama: { model: "m" } }, env), { available: true, reason: null });
    assert.deepEqual(providerAvailability("custom", { custom: { model: "m" } }, env), { available: false, reason: "Set PAPER_PAL_API_BASE_URL in .env." });
    assert.equal(providerAvailability("custom", { custom: { model: "m" } }, { ...env, PAPER_PAL_API_BASE_URL: "https://x/v1" }).available, true);
    assert.match(providerAvailability("openai", { agent: { enabled: false } }, env).reason, /agent\.enabled is false/);
    const described = describeProvider("anthropic", {}, env);
    assert.deepEqual(described, { id: "anthropic", label: "Anthropic API", kind: "api", capabilities: { readRepo: false }, available: false, reason: "Set ANTHROPIC_API_KEY in .env." });
  });

  it("picks the first installed CLI, else the first API provider with a key, else nothing", () => {
    const noCli = { PATH: "/nonexistent", CODEX_BIN: "/nonexistent/codex", CLAUDE_BIN: "/nonexistent/claude" };
    assert.equal(firstUsableProvider(noCli), null);
    assert.equal(firstUsableProvider({ ...noCli, DEEPSEEK_API_KEY: "x" }), "deepseek");
    assert.equal(firstUsableProvider({ ...noCli, DEEPSEEK_API_KEY: "x", OPENAI_API_KEY: "x" }), "openai");
    assert.equal(firstUsableProvider({ ...noCli, PAPER_PAL_API_BASE_URL: "http://127.0.0.1:1/v1" }), "custom");
    assert.equal(firstUsableProvider({ ...noCli, CLAUDE_BIN: process.execPath, OPENAI_API_KEY: "x" }), "claude");
  });

  it("gives the adapter one key and the CLIs none", () => {
    const names = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "DEEPSEEK_API_KEY", "PAPER_PAL_API_KEY", "MY_LAB_KEY"];
    const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    for (const name of names) process.env[name] = `${name}-value`;
    const config = { deepseek: { apiKeyEnv: "MY_LAB_KEY" } };
    try {
      const visible = (env) => names.filter((name) => env[name] !== undefined);
      assert.deepEqual(visible(childEnvironment({ config })), []);
      assert.deepEqual(visible(childEnvironment({ provider: "codex", config })), []);
      assert.deepEqual(visible(childEnvironment({ provider: "claude", config })), []);
      assert.deepEqual(visible(childEnvironment({ provider: "openai", config })), ["OPENAI_API_KEY"]);
      assert.deepEqual(visible(childEnvironment({ provider: "anthropic", config })), ["ANTHROPIC_API_KEY"]);
      assert.deepEqual(visible(childEnvironment({ provider: "deepseek", config })), ["MY_LAB_KEY"]);
      assert.deepEqual(visible(childEnvironment({ provider: "ollama", config })), []);
      assert.deepEqual(visible(childEnvironment({ provider: "custom", config })), ["PAPER_PAL_API_KEY"]);
    } finally {
      for (const name of names) {
        if (saved[name] === undefined) delete process.env[name];
        else process.env[name] = saved[name];
      }
    }
  });

  it("builds adapter arguments from the table and never puts a key in argv", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    try {
      const invocation = await buildAgentInvocation({
        provider: "anthropic", config: { anthropic: { model: "m", maxTokens: 4096 } }, prompt: "hello", schemaPath, outputPath: "/tmp/o", repoRoot: "/tmp", model: "m", reasoningEffort: "low", timeoutMs: 100000,
      });
      assert.equal(invocation.command, process.execPath);
      assert.equal(invocation.capturesStdout, true);
      const args = invocation.args.slice(1);
      const value = (name) => args[args.indexOf(name) + 1];
      assert.equal(value("--protocol"), "anthropic");
      assert.equal(value("--base-url"), "https://api.anthropic.com");
      assert.equal(value("--key-env"), "ANTHROPIC_API_KEY");
      assert.equal(value("--max-tokens"), "4096");
      assert.equal(value("--schema"), schemaPath);
      assert.equal(value("--timeout"), "95000");
      assert.ok(!invocation.args.join(" ").includes(KEY));
      assert.ok(invocation.input.includes("JSON Schema"), "the schema is also embedded in the prompt");
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });
});

describe("end to end through the API adapter", () => {
  it("comment → proposal → accept with the OpenAI protocol, with project files inlined", async () => {
    const mock = await startMockApi();
    const project = await makeProject({
      config: {
        agent: { enabled: true, provider: "openai", terminologyFiles: ["GLOSSARY.md"] },
        openai: { model: "mock-model", baseUrl: `${mock.origin}/v1` },
      },
    });
    await fs.writeFile(path.join(project.root, "GLOSSARY.md"), "Say \"dawn chorus\".\n", "utf8");
    await fs.writeFile(path.join(project.root, "AGENTS.md"), "House style: British spelling.\n", "utf8");
    // guidanceFiles defaults to the AGENTS.md/CLAUDE.md that exist at load time.
    const server = await startServer(project.root, { env: { OPENAI_API_KEY: KEY, ANTHROPIC_API_KEY: "sk-other-provider-key-123456" } });
    const file = path.join(project.root, "sections", "05_discussion.tex");
    const before = await fs.readFile(file, "utf8");
    const needle = "The saturation result matters for policy.";
    const created = await commentOn(server, "sections/05_discussion.tex", needle, "Make this louder.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const proposed = await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");
    assert.equal(proposed.proposal.replacementText, needle.toUpperCase());
    const accepted = await apiOk(server, "/api/request/accept", { method: "POST", body: { id: created.id } });
    assert.equal(accepted.status, "resolved");
    assert.equal(await fs.readFile(file, "utf8"), before.replace(needle, needle.toUpperCase()));

    const [request] = mock.requests;
    assert.equal(request.url, "/v1/chat/completions");
    assert.equal(request.headers.authorization, `Bearer ${KEY}`);
    assert.equal(request.body.model, "mock-model");
    assert.equal(request.body.response_format.type, "json_schema");
    const prompt = request.body.messages[0].content;
    assert.match(prompt, /You cannot open files/);
    assert.doesNotMatch(prompt, /You may read the repository/);
    assert.ok(!prompt.includes(project.root), "no absolute path reaches the model");
    assert.ok(!prompt.includes(KEY));
    const task = mock.taskFrom(prompt);
    assert.equal(task.repository.readAllowed, false);
    assert.deepEqual(task.repository.entryPoints, []);
    assert.equal(task.document.path, "sections/05_discussion.tex");
    assert.ok(task.document.source.includes(needle), "the file being edited is inlined in full");
    assert.equal(task.terminology[0].path, "GLOSSARY.md");
    const inlined = Object.fromEntries(task.projectContext.files.map((item) => [item.path, item]));
    assert.equal(inlined["AGENTS.md"].role, "guidance");
    assert.match(inlined["AGENTS.md"].source, /British spelling/);
    assert.equal(inlined["main.tex"].role, "manuscript");
    assert.ok(inlined["sections/01_introduction.tex"], "smart context mode inlines the other manuscript files");
    assert.equal(inlined["sections/05_discussion.tex"], undefined, "the edited file is not sent twice");

    // The key is in no file the run left behind.
    const runsRoot = path.join(project.root, stateDirectory, "runs");
    for (const directory of await fs.readdir(runsRoot)) {
      for (const name of await fs.readdir(path.join(runsRoot, directory))) {
        assert.ok(!(await fs.readFile(path.join(runsRoot, directory, name), "utf8")).includes(KEY), `${name} contains the key`);
      }
    }
  });

  it("keeps inlined context inside agent.contextBudgetChars and marks the cut", async () => {
    const mock = await startMockApi();
    const project = await makeProject({
      config: { agent: { enabled: true, provider: "ollama", contextBudgetChars: 6000 }, ollama: { model: "local-model", baseUrl: `${mock.origin}/v1` } },
    });
    const server = await startServer(project.root);
    const created = await commentOn(server, "sections/05_discussion.tex", "The saturation result matters for policy.", "Tighten.", { contextMode: "project" });
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");
    const [request] = mock.requests;
    assert.equal(request.headers.authorization, undefined, "Ollama needs no key");
    const task = mock.taskFrom(request.body.messages[0].content);
    const files = task.projectContext.files;
    const shown = task.document.source.length + files.reduce((sum, item) => sum + Math.min(item.source.length, item.chars), 0);
    assert.ok(shown <= 6000 + 400, `inlined ${shown} characters`);
    const cut = files.find((item) => item.truncated);
    assert.ok(cut, "one file is cut at the budget");
    assert.match(cut.source, /\[\.\.\. truncated by Paper Pal: \d+ of \d+ characters shown/);
    assert.ok(task.projectContext.omittedForSpace?.length > 0, "files that did not fit are named");
  });

  it("local context mode inlines no other manuscript files", async () => {
    const mock = await startMockApi();
    const project = await makeProject({ config: { agent: { enabled: true, provider: "ollama" }, ollama: { model: "local-model", baseUrl: `${mock.origin}/v1` } } });
    const server = await startServer(project.root);
    const created = await commentOn(server, "sections/05_discussion.tex", "The saturation result matters for policy.", "Tighten.", { contextMode: "local" });
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");
    const task = mock.taskFrom(mock.requests[0].body.messages[0].content);
    assert.ok(!task.projectContext || task.projectContext.files.every((item) => item.role !== "manuscript"));
  });

  it("chat and section review over the Anthropic protocol see the document and the outline", async () => {
    const mock = await startMockApi();
    const project = await makeProject({ config: { agent: { enabled: true, provider: "anthropic" }, anthropic: { model: "mock-claude", baseUrl: mock.origin, maxTokens: 2048 } } });
    const server = await startServer(project.root, { env: { ANTHROPIC_API_KEY: KEY } });
    const session = await apiOk(server, "/api/chat/message", { method: "POST", body: { message: "What is this paper about?", activePath: "sections/03_method.tex" } });
    const answered = await waitFor(async () => {
      const current = await apiOk(server, `/api/chat?id=${session.id}`);
      if (current.status === "failed") throw new Error(current.error);
      return current.status === "idle" && current.messages.length === 2 ? current : null;
    }, { label: "chat answer" });
    assert.match(answered.messages[1].content, /^mock chat answer/);
    const [chat] = mock.requests;
    assert.equal(chat.url, "/v1/messages");
    assert.equal(chat.headers["x-api-key"], KEY);
    assert.equal(chat.body.max_tokens, 2048);
    const prompt = chat.body.messages[0].content;
    assert.match(prompt, /you cannot open files/i);
    assert.doesNotMatch(prompt, /Repository root|Useful entry points|inspect the repository/);
    const context = JSON.parse(prompt.split("\n").find((line) => line.startsWith("{\"note\"")));
    assert.match(context.outline, /Introduction/);
    assert.ok(context.files.some((item) => item.role === "active-document"));
    assert.ok(context.files.some((item) => item.path === "main.tex"));

    const review = await apiOk(server, "/api/document/review", { method: "POST", body: { path: "sections/02_related_work.tex" } });
    assert.equal(review.summary, "mock review");
    const reviewPrompt = mock.requests.at(-1).body.messages[0].content;
    assert.match(reviewPrompt, /You cannot open files/);
    assert.equal(mock.taskFrom(reviewPrompt).repository.readAllowed, false);
  });

  it("says what is missing instead of running an unconfigured provider", async () => {
    const project = await makeProject({ config: { agent: { enabled: true, provider: "openai" } } });
    const server = await startServer(project.root, { env: { OPENAI_API_KEY: "" }, privateTmp: true });
    const created = await commentOn(server, "sections/05_discussion.tex", "The saturation result matters for policy.", "Tighten.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const failed = await waitFor(async () => {
      const request = (await apiOk(server, "/api/requests")).find((item) => item.id === created.id);
      return request?.agentStatus === "failed" ? request : null;
    }, { label: "failure" });
    assert.match(failed.agentError, /OpenAI API is not ready\. Set OPENAI_API_KEY in \.env\./);
    assert.deepEqual(await fs.readdir(server.tmpDir), [], "the failed run leaves no temp directory behind");
    const review = await api(server, "/api/document/review", { method: "POST", body: { path: "sections/02_related_work.tex" } });
    assert.equal(review.status, 409);
    assert.match(review.value.error, /Set OPENAI_API_KEY in \.env/);
  });
});

describe("health and bootstrap", () => {
  it("GET /api/health describes the app without paths or secrets", async () => {
    const project = await makeProject({ directoryName: "secret-folder-name", config: { agent: { enabled: true, provider: "openrouter" }, openrouter: { model: "vendor/model" } } });
    const server = await startServer(project.root, { env: { OPENROUTER_API_KEY: KEY, CODEX_BIN: "/nonexistent/codex", OPENAI_API_KEY: "" } });
    const result = await api(server, "/api/health");
    assert.equal(result.status, 200);
    const health = result.value;
    assert.deepEqual(Object.keys(health).sort(), ["defaultProvider", "latex", "name", "ok", "project", "providers", "version"]);
    assert.equal(health.ok, true);
    assert.equal(health.name, "paper-pal");
    assert.equal(health.version, JSON.parse(await fs.readFile(path.join(appRoot, "package.json"), "utf8")).version);
    assert.deepEqual(health.project, { title: "secret-folder-name", defaultDocument: "main.tex" });
    assert.deepEqual(health.latex, { enabled: false, available: false });
    assert.equal(health.defaultProvider, "openrouter");
    assert.deepEqual(health.providers.map((item) => item.id), [...AGENT_PROVIDERS]);
    for (const item of health.providers) assert.deepEqual(Object.keys(item).sort(), ["available", "id", "kind", "label", "reason"]);
    const byId = Object.fromEntries(health.providers.map((item) => [item.id, item]));
    assert.deepEqual(byId.openrouter, { id: "openrouter", label: "OpenRouter", kind: "api", available: true, reason: null });
    assert.deepEqual(byId.codex, { id: "codex", label: "Codex", kind: "cli", available: false, reason: "codex CLI not found on PATH. Install it, or set CODEX_BIN in .env." });
    assert.equal(byId.openai.reason, "Set OPENAI_API_KEY in .env.");
    const text = JSON.stringify(health);
    assert.ok(!text.includes(KEY));
    assert.ok(!text.includes(path.dirname(project.root)), "no absolute path");
  });

  it("bootstrap keeps the old provider fields and adds kind, available, reason, capabilities", async () => {
    const project = await makeProject({ config: { agent: { enabled: true, provider: "codex" }, codex: { command: "codex", model: "cfg-model", models: ["other-model"] } } });
    const server = await startServer(project.root);
    const bootstrap = await apiOk(server, "/api/bootstrap");
    assert.equal(bootstrap.agent.provider, "codex");
    assert.equal(typeof bootstrap.latex.available, "boolean");
    const codex = bootstrap.agent.providers.find((item) => item.id === "codex");
    assert.equal(codex.label, "Codex");
    assert.equal(codex.model, "cfg-model");
    assert.deepEqual(codex.models, ["cfg-model", "other-model"]);
    assert.equal(codex.kind, "cli");
    assert.equal(typeof codex.available, "boolean");
    assert.deepEqual(codex.capabilities, { readRepo: true });
    const openai = bootstrap.agent.providers.find((item) => item.id === "openai");
    assert.equal(openai.kind, "api");
    assert.deepEqual(openai.capabilities, { readRepo: false });
    assert.equal(openai.available, false);
    assert.equal(typeof openai.reason, "string");
    assert.equal(openai.model, "OpenAI API default");
    assert.deepEqual(openai.models, []);
  });
});
