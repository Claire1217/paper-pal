#!/usr/bin/env node
// Check that Paper Pal can run for the configured project. Human-readable by
// default; --json prints { ok, checks: [{ id, ok, severity, detail, fix }] }.
// Exit code 0 when no check of severity "error" failed, 1 otherwise.
//
//   node scripts/doctor.mjs [--repo <dir>] [--config <file>] [--port <n>] [--json] [--ping]
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_PROVIDERS,
  PROVIDER_TABLE,
  apiSettings,
  buildAgentInvocation,
  childEnvironment,
  describeProvider,
  isLoopbackUrl,
  providerCommand,
  providerModel,
  redactSecrets,
  rememberConfig,
  resolveExecutable,
  spawnPlan,
} from "../agent-providers.mjs";
import { loadReviewConfig } from "../config.mjs";
import { loadEnvFile } from "../env.mjs";
import { APP_NAME, CONFIG_NAME, LEGACY_CONFIG_NAME, appVersion, hostFromEnvironment } from "../names.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const wantsJson = argv.includes("--json");
const wantsPing = argv.includes("--ping");

if (argv.includes("--help") || argv.includes("-h")) {
  console.log([
    "Usage: npm run doctor [-- options]",
    "",
    "  --repo <dir>     Project to check (default: the one remembered by setup)",
    "  --config <file>  Configuration file (default: <project>/.paper-pal.json)",
    "  --port <n>       Port mentioned in the final hint (default 4317)",
    "  --ping           Also send a one-token request to each ready API provider",
    "  --json           Print { ok, checks: [...] } instead of text",
  ].join("\n"));
  process.exit(0);
}

const envReport = loadEnvFile(appRoot);
const checks = [];
// severity says how much a FAILED check matters: "error" fails the run,
// "warn" and "info" do not.
function check(id, ok, severity, detail, fix = null) {
  checks.push({ id, ok: Boolean(ok), severity, detail: redactSecrets(detail), fix: ok ? null : fix });
}

function commandVersion(command, args = ["--version"], cwd = appRoot) {
  return new Promise((resolve) => {
    const plan = spawnPlan(command, args);
    execFile(plan.command, plan.args, { cwd, timeout: 15000, env: childEnvironment(), ...plan.options }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        value: String(stdout || stderr || error?.message || "").trim().split("\n")[0],
      });
    });
  });
}

function ping(provider, config) {
  return new Promise((resolve) => {
    buildAgentInvocation({
      provider, config, prompt: "ping", outputPath: "", repoRoot: appRoot, model: providerModel(provider, config), timeoutMs: 30_000,
    }).then((invocation) => {
      const child = spawn(invocation.command, [...invocation.args, "--ping"], {
        cwd: appRoot, env: childEnvironment({ provider, config }), stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000); });
      child.on("error", (error) => resolve({ ok: false, detail: error.message }));
      child.on("close", (code) => resolve({ ok: code === 0, detail: code === 0 ? "the endpoint answered" : stderr.trim() || `exit code ${code}` }));
    }, (error) => resolve({ ok: false, detail: error.message }));
  });
}

// Everything a short status subcommand prints. stdin is closed so a CLI that
// reads it cannot wait; any failure is just an empty answer.
function commandOutput(command, args) {
  return new Promise((resolve) => {
    const plan = spawnPlan(command, args);
    const child = execFile(plan.command, plan.args, { cwd: appRoot, timeout: 10000, env: childEnvironment(), ...plan.options }, (error, stdout, stderr) => {
      resolve(`${stdout || ""}\n${stderr || ""}`);
    });
    child.stdin?.end();
  });
}

// Is anything listening at a local, keyless endpoint (Ollama, a local
// OpenAI-compatible server)? Any HTTP answer counts; no key and no prompt is
// sent, and only loopback addresses are probed, so this stays offline.
async function reachable(baseUrl, timeoutMs = 1500) {
  try {
    const response = await fetch(`${baseUrl}/models`, { method: "GET", signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    await response.body?.cancel().catch(() => {});
    return { ok: true, detail: `answered with HTTP ${response.status}` };
  } catch (error) {
    const cause = error?.cause?.code || error?.name || "error";
    return { ok: false, detail: cause === "TimeoutError" ? `no answer within ${timeoutMs} ms` : `connection failed (${cause})` };
  }
}

// 1. Node.js
const nodeMajor = Number(process.versions.node.split(".")[0]);
check("node", nodeMajor >= 20, "error", `Node.js ${process.versions.node}`, "Install Node.js 20 or newer (https://nodejs.org).");

// 2. KaTeX (the only runtime dependency; renders math in the page)
let katexDist = path.join(appRoot, "node_modules", "katex", "dist");
try {
  katexDist = path.join(path.dirname(createRequire(import.meta.url).resolve("katex/package.json")), "dist");
} catch {
  // Not resolvable: the check below reports it.
}
const katexFound = existsSync(path.join(katexDist, "katex.min.js"));
check("katex", katexFound, "error", katexFound ? "katex is installed" : "node_modules/katex is missing", "Run \"npm install\" in the Paper Pal folder.");

// 3. .env (informational)
check("env-file", true, "info", envReport.exists
  ? `.env found (${envReport.loaded.length} variable(s) loaded${envReport.skipped.length ? `, ${envReport.skipped.length} already set in the shell` : ""})`
  : "no .env file (only needed for API providers; copy .env.example to .env)");

// 4. Project configuration
let loaded = null;
try {
  loaded = await loadReviewConfig({ appRoot, argv });
  rememberConfig(loaded.config);
  const legacy = path.basename(loaded.configPath) === LEGACY_CONFIG_NAME;
  check("config", true, "error", `${loaded.configPath}${legacy ? ` (pre-rename name; ${CONFIG_NAME} is preferred)` : ""}`);
  check("main-document", true, "error", `${loaded.config.defaultDocument} in ${loaded.repoRoot}`);
} catch (error) {
  const message = String(error.message || error);
  const aboutDocument = /defaultDocument|sourceRoot|initialDocument/.test(message);
  if (aboutDocument) {
    check("config", true, "error", "configuration file found and readable");
    check("main-document", false, "error", message, `Fix defaultDocument/sourceRoot in ${CONFIG_NAME}, or re-run "npm run setup -- <project> --main <file.tex> --force".`);
  } else {
    check("config", false, "error", message, /No Paper Pal configuration/.test(message)
      ? "Run \"npm run setup -- /path/to/latex-project\"."
      : `Fix ${CONFIG_NAME} as described above.`);
  }
}

if (loaded) {
  const { config, repoRoot } = loaded;

  // 5. LaTeX: only matters when compilation is enabled.
  if (config.latex.enabled) {
    const found = resolveExecutable(config.latex.command);
    const version = found ? await commandVersion(config.latex.command, ["--version"], path.resolve(repoRoot, config.latex.cwd)) : null;
    check("latex", Boolean(found), "error", found ? `${config.latex.command}: ${version?.value || "found"}` : `${config.latex.command} was not found on PATH`,
      `Install a LaTeX distribution that provides ${config.latex.command} (TeX Live, MacTeX, MiKTeX), or set latex.enabled to false in ${CONFIG_NAME}.`);
  } else {
    const found = Boolean(resolveExecutable(config.latex.command));
    check("latex", true, found ? "info" : "warn", `PDF compilation is disabled${found ? ` (${config.latex.command} is installed; set latex.enabled to true to use it)` : ` and ${config.latex.command} is not installed`}`);
  }

  // 6. Agent providers. Only the default one is required.
  const defaultProvider = config.agent.provider;
  for (const id of AGENT_PROVIDERS) {
    const state = describeProvider(id, config);
    const isDefault = id === defaultProvider;
    let detail;
    if (state.available && state.kind === "cli") {
      const version = await commandVersion(providerCommand(id, config));
      detail = version.ok ? version.value : `found, but "--version" failed: ${version.value}`;
    } else if (state.available) {
      detail = `ready (model ${providerModel(id, config)})`;
    } else {
      detail = isDefault ? `not ready. ${state.reason}` : `not set up (optional). ${state.reason}`;
    }
    const agentOff = config.agent.enabled === false;
    check(
      `provider:${id}`,
      state.available,
      isDefault && !agentOff ? "error" : "info",
      `${state.label}${isDefault ? " (default)" : ""}: ${detail}`,
      state.reason,
    );
    // An installed CLI that is signed out looks "ready" and then fails every run.
    // Asked only of the real binaries (a wrapper or test double is left alone),
    // and reported only when the CLI says so in as many words.
    const signIn = PROVIDER_TABLE[id].signIn;
    const executable = state.available && signIn ? path.basename(String(resolveExecutable(providerCommand(id, config)) || "")) : "";
    if (executable.replace(/\.(exe|cmd)$/i, "") === PROVIDER_TABLE[id].defaultCommand) {
      const status = await commandOutput(providerCommand(id, config), signIn.args);
      if (signIn.signedOut.test(status)) {
        check(`signin:${id}`, false, isDefault && !agentOff ? "error" : "info", `${state.label}: installed, but not signed in`, signIn.fix);
      }
    }
    if (state.warning) {
      check(`sandbox:${id}`, false, isDefault && !agentOff ? "warn" : "info", `${state.label}: ${state.warning}`, `Set ${PROVIDER_TABLE[id].commandEnv}=/path/to/the/real/binary in .env.`);
    }
    // "Ready" for a keyless local provider only means a model is configured.
    // Say so when nothing is listening; a warning, because the app still opens.
    if (state.available && PROVIDER_TABLE[id].kind === "api" && !PROVIDER_TABLE[id].keyRequired) {
      const { baseUrl } = apiSettings(id, config);
      if (baseUrl && isLoopbackUrl(baseUrl)) {
        const probe = await reachable(baseUrl);
        check(
          `reach:${id}`,
          probe.ok,
          "warn",
          `${state.label} at ${baseUrl}: ${probe.detail}`,
          id === "ollama"
            ? `Start Ollama ("ollama serve", or open the Ollama app), or set ${id}.baseUrl in ${CONFIG_NAME} to where it listens.`
            : `Start the local server, or fix the base URL (${id}.baseUrl in ${CONFIG_NAME}, or the variable named in .env.example).`,
        );
      }
    }
    if (wantsPing && state.available && PROVIDER_TABLE[id].kind === "api") {
      const result = await ping(id, config);
      check(`ping:${id}`, result.ok, isDefault ? "error" : "warn", `${state.label} live request: ${result.detail}`, "Check the key, the base URL and the model id.");
    }
  }
}

const ok = !checks.some((item) => !item.ok && item.severity === "error");
if (wantsJson) {
  console.log(JSON.stringify({ ok, name: "paper-pal", version: appVersion(), checks }, null, 2));
} else {
  console.log(`${APP_NAME} ${appVersion()} doctor\n`);
  for (const item of checks) {
    const mark = item.ok ? "✓" : item.severity === "error" ? "✗" : item.severity === "warn" ? "!" : "-";
    console.log(`${mark} ${item.id}: ${item.detail}`);
    if (!item.ok && item.fix && item.fix !== item.detail && item.severity !== "info") console.log(`    fix: ${item.fix}`);
  }
  if (ok) {
    const host = hostFromEnvironment();
    const repoIndex = argv.indexOf("--repo");
    const repoHint = repoIndex >= 0 && argv[repoIndex + 1] ? ` -- --repo ${/\s/.test(argv[repoIndex + 1]) ? `"${argv[repoIndex + 1]}"` : argv[repoIndex + 1]}` : "";
    console.log(`\nReady. Run "npm start${repoHint}" and open http://${host}:${loaded?.port || 4317}`);
  } else {
    console.log("\nNot ready: fix the lines marked ✗, then run \"npm run doctor\" again.");
  }
}
process.exit(ok ? 0 : 1);
