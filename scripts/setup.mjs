#!/usr/bin/env node
// Configure Paper Pal for one LaTeX project. Never prompts: everything is a
// flag, the result can be printed as JSON (--json), and every failure has its
// own exit code, so a person, a script or a coding agent can drive it.
//
// Exit codes: 0 ok · 2 usage · 3 project not found · 4 no main .tex found ·
//             5 several candidates (listed) · 6 configuration already exists
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_PROVIDERS, PROVIDER_TABLE, describeProvider, firstUsableProvider, resolveExecutable,
} from "../agent-providers.mjs";
import { isInside } from "../config.mjs";
import { loadEnvFile } from "../env.mjs";
import { APP_NAME, CONFIG_NAME, LEGACY_CONFIG_NAME, LOCAL_POINTER_NAME, STATE_DIR_NAME, resolveStateDir } from "../names.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const wantsJson = argv.includes("--json");

const EXIT = { ok: 0, usage: 2, projectNotFound: 3, noMain: 4, severalMain: 5, configExists: 6 };

const usageText = [
  "Usage: npm run setup -- /path/to/latex-project [options]",
  "       node scripts/setup.mjs /path/to/latex-project [options]",
  "",
  "Options:",
  "  --repo <dir>              The project directory (same as the positional argument)",
  "  --main <file.tex>         Manuscript entry point, relative to the project",
  "                            (default: main.tex, else the one .tex with \\documentclass)",
  "  --source <dir>            Restrict readable/writable sources (default: .)",
  "  --title <name>            Name shown in the app (default: the folder name)",
  `  --provider <id>           Default agent: ${AGENT_PROVIDERS.join(" | ")}`,
  "                            (default: first of codex, claude that is installed, then the first",
  "                            API provider whose key is set, else codex)",
  "  --model <id>              Model for that provider (required for API providers to be ready)",
  "  --chat-model <id>         Model for project chat (default: --model)",
  "  --review-language <name>  Language section reviews are written in (default: en)",
  "  --compile / --no-compile  Enable or disable PDF compilation (default: enabled when latexmk is on PATH)",
  "  --no-remember             Do not make this the checkout's default project",
  `  --force                   Replace an existing ${CONFIG_NAME}`,
  "  --json                    Print one JSON object instead of text",
  "  --yes                     Accepted for compatibility; setup never asks questions",
  "  --help                    Show this text",
  "",
  `Writes ${CONFIG_NAME} with the settings a project usually changes. Every other field`,
  "has a default; paper-pal.config.example.json and docs/configuration.md show the full shape.",
  "",
  "Exit codes: 0 ok, 2 usage, 3 project not found, 4 no main .tex found,",
  `            5 several candidates, 6 ${CONFIG_NAME} already exists`,
].join("\n");

function finish(code, payload, humanLines) {
  if (wantsJson) console.log(JSON.stringify(payload, null, 2));
  else if (code === EXIT.ok) console.log(humanLines.join("\n"));
  else console.error(`\n${humanLines.join("\n")}\n`);
  process.exit(code);
}

function fail(exitCode, code, message, extra = {}) {
  const lines = [message];
  if (extra.candidates) lines.push(...extra.candidates.map((value) => `  - ${value}`));
  if (exitCode === EXIT.usage) lines.push("", usageText);
  finish(exitCode, { ok: false, error: { code, message, ...extra } }, lines);
}

// Options that consume the next argument. Everything else starting with "--"
// is a plain flag, so "--no-compile /path/to/project" keeps its positional.
const valueOptions = new Set(["--repo", "--main", "--source", "--title", "--provider", "--model", "--chat-model", "--review-language"]);
const flagOptions = new Set(["--yes", "-y", "--json", "--force", "--compile", "--no-compile", "--no-remember", "--help", "-h"]);

const values = {};
const flags = new Set();
const positionals = [];
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (valueOptions.has(arg)) {
    const value = argv[index + 1];
    if (value === undefined || (value.startsWith("--") && (valueOptions.has(value) || flagOptions.has(value)))) {
      fail(EXIT.usage, "usage", `${arg} needs a value.`);
    }
    values[arg] = value;
    index += 1;
  } else if (flagOptions.has(arg)) flags.add(arg);
  else if (arg.startsWith("-")) fail(EXIT.usage, "usage", `Unknown option: ${arg}`);
  else positionals.push(arg);
}

if (flags.has("--help") || flags.has("-h")) {
  console.log(usageText);
  process.exit(0);
}
if (flags.has("--compile") && flags.has("--no-compile")) fail(EXIT.usage, "usage", "Use either --compile or --no-compile, not both.");
if (positionals.length > 1) fail(EXIT.usage, "usage", `Expected one project directory, got ${positionals.length}: ${positionals.join(", ")}`);

loadEnvFile(appRoot);

const projectValue = values["--repo"] || positionals[0];
if (!projectValue) fail(EXIT.usage, "usage", "No project directory given.");
const repoRoot = path.resolve(projectValue);
let projectStat = null;
try {
  projectStat = await fs.stat(repoRoot);
} catch {
  // Reported below.
}
if (!projectStat?.isDirectory()) fail(EXIT.projectNotFound, "project_not_found", `Project directory does not exist: ${repoRoot}`);

const configPath = path.join(repoRoot, CONFIG_NAME);
if (existsSync(configPath) && !flags.has("--force")) {
  fail(EXIT.configExists, "config_exists", `A configuration already exists at ${configPath}. Pass --force to replace it.`, { configPath });
}

const provider = values["--provider"] ? String(values["--provider"]).toLowerCase() : null;
if (provider && !AGENT_PROVIDERS.includes(provider)) {
  fail(EXIT.usage, "usage", `Unknown provider "${values["--provider"]}". Use one of: ${AGENT_PROVIDERS.join(", ")}.`);
}

const skippedDirectories = new Set(["node_modules", "build", "dist", "out", "output", "vendor", "_minted", "__pycache__"]);

// Every .tex that can be compiled on its own: it contains an uncommented
// \documentclass. Depth <= 4; hidden and build directories are skipped.
async function findMainCandidates(root, directory = root, depth = 0) {
  if (depth > 4) return [];
  const matches = [];
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return matches;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name) || /^_minted/.test(entry.name)) continue;
      matches.push(...await findMainCandidates(root, target, depth + 1));
    } else if (entry.isFile() && /[.]tex$/i.test(entry.name)) {
      let head = "";
      try {
        const handle = await fs.open(target, "r");
        try {
          const { bytesRead, buffer } = await handle.read(Buffer.alloc(65536), 0, 65536, 0);
          head = buffer.subarray(0, bytesRead).toString("utf8");
        } finally {
          await handle.close();
        }
      } catch {
        continue;
      }
      if (/^[^%\n]*\\documentclass\b/m.test(head)) matches.push(path.relative(root, target).split(path.sep).join("/"));
    }
  }
  return matches;
}

let main = values["--main"] ? values["--main"].replaceAll("\\", "/").replace(/^\.\//, "") : null;
let mainDetection = "flag";
if (!main) {
  if (existsSync(path.join(repoRoot, "main.tex"))) {
    main = "main.tex";
    mainDetection = "main.tex";
  } else {
    const candidates = await findMainCandidates(repoRoot);
    const named = candidates.filter((value) => path.posix.basename(value).toLowerCase() === "main.tex");
    if (candidates.length === 1) main = candidates[0];
    else if (named.length === 1) main = named[0];
    else if (!candidates.length) {
      fail(EXIT.noMain, "no_main_tex", `No .tex file containing \\documentclass was found under ${repoRoot}. Pass --main <file.tex>.`);
    } else {
      fail(EXIT.severalMain, "several_main_tex", "Several files could be the manuscript entry point. Pass --main <file.tex> to choose one:", { candidates });
    }
    mainDetection = "documentclass";
  }
}
const absoluteMain = path.resolve(repoRoot, main);
if (!isInside(repoRoot, absoluteMain) || !existsSync(absoluteMain)) {
  fail(EXIT.noMain, "no_main_tex", `Manuscript entry point does not exist inside the project: ${main}`);
}
const sourceRoot = (values["--source"] || ".").replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "") || ".";
if (!existsSync(path.resolve(repoRoot, sourceRoot)) || !isInside(repoRoot, path.resolve(repoRoot, sourceRoot))) {
  fail(EXIT.usage, "usage", `--source does not exist inside the project: ${sourceRoot}`);
}
if (!isInside(path.resolve(repoRoot, sourceRoot), absoluteMain)) {
  fail(EXIT.usage, "usage", "The manuscript entry point must be inside --source.");
}

// Compilation: an explicit flag wins; otherwise on when latexmk is installed.
const latexmkFound = Boolean(resolveExecutable("latexmk"));
const compile = flags.has("--no-compile")
  ? { enabled: false, decidedBy: "flag" }
  : flags.has("--compile")
    ? { enabled: true, decidedBy: "flag" }
    : { enabled: latexmkFound, decidedBy: "auto" };
compile.latexmkFound = latexmkFound;

const chosenProvider = provider || firstUsableProvider() || "codex";
const providerDecidedBy = provider ? "flag" : firstUsableProvider() ? "auto" : "fallback";

const mainDirectory = path.posix.dirname(main);
const mainName = path.posix.basename(main);
const providerBlock = {
  ...(values["--model"] ? { model: values["--model"] } : {}),
  ...(values["--chat-model"] ? { chatModel: values["--chat-model"] } : {}),
};
const config = {
  title: values["--title"] || path.basename(repoRoot),
  projectLabel: "Local LaTeX project",
  sourceRoot,
  defaultDocument: main,
  pdf: path.posix.join(mainDirectory, mainName.replace(/[.]tex$/i, ".pdf")),
  latex: {
    enabled: compile.enabled,
    cwd: mainDirectory,
    command: "latexmk",
    args: ["-pdf", "-interaction=nonstopmode", "-halt-on-error", mainName],
  },
  agent: {
    enabled: true,
    provider: chosenProvider,
    allowOverride: true,
    autoProcessComments: true,
    promptMode: "minimal",
    reasoningEffort: "low",
    timeoutMs: 90000,
    projectReasoningEffort: "medium",
    projectTimeoutMs: 180000,
    chatReasoningEffort: "medium",
    chatTimeoutMs: 300000,
    chatConcurrency: 1,
    reviewLanguage: values["--review-language"] || "en",
    contextBudgetChars: 120000,
    entryPoints: [main],
    // agent.guidanceFiles is left out on purpose: unset means "whichever of
    // AGENTS.md and CLAUDE.md exist in the paper folder", which keeps working
    // when the author adds one later. paper-pal.config.example.json shows the
    // full shape with every optional field.
    terminologyFiles: [],
  },
  // Only the chosen provider gets a block; add others by hand when needed.
  // API keys never go in this file: they live in Paper Pal's .env.
  [chosenProvider]: PROVIDER_TABLE[chosenProvider].kind === "cli"
    ? { command: PROVIDER_TABLE[chosenProvider].defaultCommand, ...providerBlock }
    : providerBlock,
  approvedDocuments: [],
};

await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: flags.has("--force") ? "w" : "wx" });
// New projects get .paper-pal/. A project that already has state under the
// pre-rename directory keeps using it, so nothing is lost or duplicated.
const stateRoot = resolveStateDir(repoRoot);
await fs.mkdir(stateRoot, { recursive: true });
await fs.writeFile(path.join(stateRoot, ".gitignore"), "*\n", "utf8");
const remembered = !flags.has("--no-remember");
if (remembered) {
  await fs.writeFile(path.join(appRoot, LOCAL_POINTER_NAME), `${JSON.stringify({ repo: repoRoot }, null, 2)}\n`, "utf8");
}

const providerState = describeProvider(chosenProvider, config);
const quote = (value) => (/[\s"']/.test(value) ? `"${value}"` : value);
const repoFlag = remembered ? "" : ` -- --repo ${quote(repoRoot)}`;
const next = [`npm run doctor${repoFlag}`, `npm start${repoFlag}`];
const notes = [];
if (!providerState.available) notes.push(`${providerState.label} is not ready yet: ${providerState.reason}`);
if (providerDecidedBy === "fallback") {
  notes.push("No agent CLI (codex, claude) and no API key were found, so the default provider is codex. The app still opens; agent actions explain what is missing. Re-run with --provider <id> --model <id> --force to change it.");
}
if (!compile.enabled && compile.decidedBy === "auto") notes.push("latexmk was not found on PATH, so PDF compilation is off. Install a LaTeX distribution and re-run with --compile --force to turn it on.");
if (compile.enabled && !latexmkFound) notes.push("PDF compilation is on, but latexmk was not found on PATH.");
if (existsSync(path.join(repoRoot, LEGACY_CONFIG_NAME))) notes.push(`${LEGACY_CONFIG_NAME} is still present; ${CONFIG_NAME} takes precedence and the old file can be deleted.`);
if (path.basename(stateRoot) !== STATE_DIR_NAME) notes.push(`Existing review state in ${path.basename(stateRoot)}/ is kept and used as is.`);

finish(EXIT.ok, {
  ok: true,
  configPath,
  project: repoRoot,
  defaultDocument: main,
  mainDetectedBy: mainDetection,
  provider: chosenProvider,
  providerStatus: {
    decidedBy: providerDecidedBy,
    model: values["--model"] || null,
    available: providerState.available,
    reason: providerState.reason,
  },
  compile: compile.enabled,
  compileStatus: { decidedBy: compile.decidedBy, latexmkFound },
  stateDirectory: path.basename(stateRoot),
  remembered,
  notes,
  next,
}, [
  `${APP_NAME} is configured for ${repoRoot}`,
  `  Configuration: ${configPath}`,
  `  Manuscript:    ${main}`,
  `  Agent:         ${providerState.label}${values["--model"] ? ` (${values["--model"]})` : ""} - ${providerState.available ? "ready" : "not ready"}`,
  `  PDF compile:   ${compile.enabled ? "on" : "off"}${compile.decidedBy === "auto" ? ` (latexmk ${latexmkFound ? "found" : "not found"})` : ""}`,
  ...notes.map((note) => `  Note: ${note}`),
  "",
  `Next: ${next.join("  then  ")}`,
]);
