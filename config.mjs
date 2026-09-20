import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { API_PROTOCOLS, API_PROVIDERS, AGENT_PROVIDERS, CLI_PROVIDERS, PROVIDER_TABLE, isLoopbackUrl } from "./agent-providers.mjs";
import {
  APP_NAME, CONFIG_NAME, ENV, resolveConfigPath, resolveLocalPointer, truthyEnv,
} from "./names.mjs";

function readArg(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

async function readJson(target) {
  try {
    return JSON.parse(await fs.readFile(target, "utf8"));
  } catch (error) {
    throw new Error(`Could not read the Paper Pal configuration at ${target}: ${error.message}`);
  }
}

async function localProjectRoot(appRoot) {
  // paper-pal.local.json, or the pre-rename review.local.json.
  const target = resolveLocalPointer(appRoot);
  if (!target) return null;
  const local = await readJson(target);
  return typeof local.repo === "string" && local.repo.trim()
    ? path.resolve(local.repo)
    : null;
}

// True when `child` is `parent` itself or lives underneath it. Purely lexical:
// callers that must not follow symlinks out of the tree re-check with realpath.
// A name that merely begins with two dots ("..notes.tex") is inside.
export function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative === "") return true;
  if (path.isAbsolute(relative)) return false;
  return relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

export const DEFAULT_PORT = 4317;

// --port wins over PAPER_PAL_PORT; 0 asks the OS for a free port.
function portSetting(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid port "${value}". Use a number between 0 and 65535.`);
  return port;
}

function relativeSetting(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty path.`);
  const normalized = path.posix.normalize(value.replaceAll("\\", "/")).replace(/\/$/, "") || ".";
  if (
    path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized) ||
    normalized === ".." || normalized.startsWith("../")
  ) {
    throw new Error(`${name} must stay inside the configured project.`);
  }
  return normalized;
}

// A project configuration is usually committed with the manuscript, so it must
// never hold a credential. Any field that looks like one stops start-up.
const secretFieldPattern = /^(?:api[-_]?key|key|token|secret|password|authorization|access[-_]?token|auth[-_]?token|bearer)$/i;

function findSecretFields(value, trail = []) {
  if (!value || typeof value !== "object") return [];
  const found = [];
  for (const [name, child] of Object.entries(value)) {
    const here = [...trail, name];
    if (secretFieldPattern.test(name) && child !== null && child !== "" && typeof child !== "object") found.push(here.join("."));
    else found.push(...findSecretFields(child, here));
  }
  return found;
}

export function assertNoSecrets(raw, configPath) {
  const fields = findSecretFields(raw);
  if (!fields.length) return;
  throw new Error([
    `${path.basename(configPath)} contains what looks like a credential: ${fields.join(", ")}.`,
    `${APP_NAME} refuses to start, because this file is normally committed and shared with the manuscript.`,
    "Remove the field and put the key in the .env file next to Paper Pal's package.json instead, for example:",
    "  OPENAI_API_KEY=...",
    "The configuration may only name the variable (\"apiKeyEnv\": \"OPENAI_API_KEY\").",
  ].join("\n"));
}

// Programs the project configuration may name as latex.command. Anything else
// needs PAPER_PAL_ALLOW_CUSTOM_LATEX=1 in the environment or the app's .env,
// which a cloned manuscript repository cannot set.
export const ALLOWED_LATEX_COMMANDS = Object.freeze(["latexmk", "pdflatex", "xelatex", "lualatex", "tectonic", "make"]);

function latexCommand(value, env) {
  const command = String(value || "latexmk");
  if (truthyEnv(env[ENV.allowCustomLatex])) return command;
  const bare = command.replace(/[.](?:exe|cmd|bat)$/i, "");
  if (ALLOWED_LATEX_COMMANDS.includes(bare)) return command;
  throw new Error([
    `latex.command is "${command}". A project configuration may only name one of: ${ALLOWED_LATEX_COMMANDS.join(", ")}.`,
    `To run another program, set ${ENV.allowCustomLatex}=1 in your shell or in Paper Pal's .env (not in the project).`,
  ].join("\n"));
}

function agentCommand(provider, value, env) {
  const fallback = PROVIDER_TABLE[provider].defaultCommand;
  const command = String(value || fallback);
  if (truthyEnv(env[ENV.allowCustomCommands])) return command;
  if (/^[A-Za-z0-9._-]+$/.test(command) && !command.startsWith("-")) return command;
  throw new Error([
    `${provider}.command is "${command}". A project configuration may only give a bare program name (no path, no spaces).`,
    `Point to a specific binary with ${PROVIDER_TABLE[provider].commandEnv}=/path/to/${fallback} in your shell or in Paper Pal's .env,`,
    `or set ${ENV.allowCustomCommands}=1 there to allow any command from the project configuration.`,
  ].join("\n"));
}

function modelFields(block) {
  return {
    ...(block?.model ? { model: String(block.model) } : {}),
    ...(block?.chatModel ? { chatModel: String(block.chatModel) } : {}),
    ...(Array.isArray(block?.models) ? { models: block.models.map(String) } : {}),
  };
}

// An API provider block: model, chatModel, models, baseUrl, apiKeyEnv,
// protocol, maxTokens. Never a key. A base URL that leaves this machine and
// differs from the provider's own would send the user's key to a host chosen
// by whoever wrote the project file, so that needs an explicit opt-in too.
function apiProviderBlock(provider, block, env) {
  const row = PROVIDER_TABLE[provider];
  const result = modelFields(block);
  if (block?.baseUrl !== undefined && block.baseUrl !== null && block.baseUrl !== "") {
    const baseUrl = String(block.baseUrl).replace(/\/+$/, "");
    if (!/^https?:\/\/[^\s]+$/i.test(baseUrl)) throw new Error(`${provider}.baseUrl must be an http(s) URL.`);
    const sameAsPreset = row.baseUrl && baseUrl === row.baseUrl;
    if (!sameAsPreset && !isLoopbackUrl(baseUrl) && !truthyEnv(env.PAPER_PAL_ALLOW_PROJECT_BASE_URL)) {
      throw new Error([
        `${provider}.baseUrl points to ${baseUrl}. A project configuration may only name this machine (127.0.0.1 / localhost)`,
        "as an API endpoint, because the API key is sent there.",
        `Use the "custom" provider with ${ENV.customBaseUrl} in Paper Pal's .env, or set PAPER_PAL_ALLOW_PROJECT_BASE_URL=1 there.`,
      ].join("\n"));
    }
    result.baseUrl = baseUrl;
  }
  if (block?.apiKeyEnv !== undefined && block.apiKeyEnv !== null && block.apiKeyEnv !== "") {
    const name = String(block.apiKeyEnv);
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) {
      throw new Error(`${provider}.apiKeyEnv must be the NAME of an environment variable (for example OPENAI_API_KEY), not a key.`);
    }
    // A project file may not choose WHICH secret is sent: only the provider's
    // own variable, another provider key variable, or a PAPER_PAL_* name.
    // Otherwise a cloned repository could name AWS_SECRET_ACCESS_KEY or
    // GITHUB_TOKEN and have it posted to the API host as a bearer token.
    const knownKeyNames = new Set(Object.values(PROVIDER_TABLE).map((entry) => entry.apiKeyEnv).filter(Boolean));
    const allowed = name === row.apiKeyEnv || knownKeyNames.has(name) || /^PAPER_PAL_[A-Z0-9_]*KEY$/.test(name);
    if (!allowed && !truthyEnv(env.PAPER_PAL_ALLOW_PROJECT_KEY_ENV)) {
      throw new Error([
        `${provider}.apiKeyEnv names ${name}. A project configuration may only name a provider key variable`,
        `(${[...knownKeyNames].join(", ")}) or a PAPER_PAL_*_KEY variable, because that variable's value is sent to the API host.`,
        "Rename the variable in Paper Pal's .env, or set PAPER_PAL_ALLOW_PROJECT_KEY_ENV=1 there.",
      ].join("\n"));
    }
    result.apiKeyEnv = name;
  }
  if (block?.protocol !== undefined && block.protocol !== null && block.protocol !== "") {
    if (!API_PROTOCOLS.includes(String(block.protocol))) {
      throw new Error(`${provider}.protocol must be one of: ${API_PROTOCOLS.join(", ")}.`);
    }
    result.protocol = String(block.protocol);
  }
  if (block?.maxTokens !== undefined && block.maxTokens !== null) {
    const maxTokens = Number(block.maxTokens);
    if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new Error(`${provider}.maxTokens must be a positive integer.`);
    result.maxTokens = maxTokens;
  }
  return result;
}

export async function loadReviewConfig({ appRoot, argv = process.argv.slice(2), cwd = process.cwd(), env = process.env }) {
  const explicitRepo = readArg(argv, "--repo");
  const rememberedRepo = explicitRepo ? null : await localProjectRoot(appRoot);
  const repoRoot = path.resolve(explicitRepo || rememberedRepo || cwd);
  const explicitConfig = readArg(argv, "--config");
  const configPath = explicitConfig
    ? path.resolve(cwd, explicitConfig)
    // .paper-pal.json, or the pre-rename .draft-review.json when only that exists.
    : resolveConfigPath(repoRoot);
  if (!existsSync(configPath)) {
    // Started before any setup, the "project" is just the current folder (usually
    // Paper Pal's own): telling the user to run setup on that would be wrong.
    const namedProject = Boolean(explicitRepo || rememberedRepo || explicitConfig);
    throw new Error([
      `No ${APP_NAME} configuration (${CONFIG_NAME}) was found at ${configPath}.`,
      namedProject
        ? `Run \"npm run setup -- ${repoRoot}\" first, or pass --repo and --config explicitly.`
        : "No paper is set up yet: run \"npm run setup -- /path/to/your/paper\" first, or \"npm run demo\" to try the sample paper.",
    ].join("\n"));
  }

  const raw = await readJson(configPath);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${configPath} must contain a JSON object.`);
  assertNoSecrets(raw, configPath);
  const sourceRoot = relativeSetting(raw.sourceRoot ?? ".", "sourceRoot");
  const defaultDocument = relativeSetting(raw.defaultDocument ?? "main.tex", "defaultDocument");
  const pdf = relativeSetting(raw.pdf ?? defaultDocument.replace(/[.]tex$/i, ".pdf"), "pdf");
  const latex = {
    enabled: raw.latex?.enabled !== false,
    cwd: relativeSetting(raw.latex?.cwd ?? path.posix.dirname(defaultDocument), "latex.cwd"),
    command: latexCommand(raw.latex?.command, env),
    args: Array.isArray(raw.latex?.args)
      ? raw.latex.args.map(String)
      : ["-pdf", "-interaction=nonstopmode", "-halt-on-error", path.posix.basename(defaultDocument)],
  };
  // The run-wide agent knobs (effort, timeouts, prompt mode, review language…)
  // historically lived under "codex" although they apply to every provider.
  // They are now read from "agent" first, with "codex" kept as an alias so
  // existing project files keep working.
  const shared = { ...(raw.codex || {}) };
  for (const [key, value] of Object.entries(raw.agent || {})) {
    if (value !== undefined && value !== null) shared[key] = value;
  }
  const relativeList = (value, name) => (Array.isArray(value)
    ? value.map((item) => relativeSetting(item, `${name}[]`))
    : null);
  const guidanceFiles = relativeList(shared.guidanceFiles, "agent.guidanceFiles")
    ?? ["AGENTS.md", "CLAUDE.md"].filter((name) => existsSync(path.join(repoRoot, name)));
  // "codex.enabled: false" predates the other providers and always meant "no
  // agent at all", so either spelling switches every provider off.
  const agentEnabled = raw.agent?.enabled !== false && raw.codex?.enabled !== false;
  const codex = {
    enabled: agentEnabled,
    command: agentCommand("codex", raw.codex?.command, env),
    autoProcessComments: shared.autoProcessComments !== false,
    reasoningEffort: String(shared.reasoningEffort || "low"),
    promptMode: String(shared.promptMode || "minimal"),
    // Any language name or code: "en", "English", "zh", "Chinese", "German"…
    reviewLanguage: String(shared.reviewLanguage || "en"),
    timeoutMs: Number(shared.timeoutMs) || 90_000,
    projectReasoningEffort: String(shared.projectReasoningEffort || "medium"),
    projectTimeoutMs: Number(shared.projectTimeoutMs) || 180_000,
    chatReasoningEffort: String(shared.chatReasoningEffort || "medium"),
    chatTimeoutMs: Number(shared.chatTimeoutMs) || 300_000,
    chatConcurrency: Math.max(1, Number(shared.chatConcurrency) || 1),
    ...modelFields(raw.codex),
    // Upper bound, in characters, on the project material inlined into a
    // prompt for providers that cannot read the repository themselves.
    contextBudgetChars: Math.max(2000, Number(shared.contextBudgetChars) || 120_000),
    entryPoints: relativeList(shared.entryPoints, "agent.entryPoints") ?? [],
    // Project vocabulary sent with every task. Empty by default: a project
    // without a terminology file simply carries no terminology block.
    terminologyFiles: relativeList(shared.terminologyFiles, "agent.terminologyFiles") ?? [],
    // Agent guidance files offered as entry points when they exist.
    guidanceFiles,
  };
  const claude = {
    command: agentCommand("claude", raw.claude?.command, env),
    permissionMode: raw.claude?.permissionMode ? String(raw.claude.permissionMode) : null,
    allowedTools: Array.isArray(raw.claude?.allowedTools)
      ? raw.claude.allowedTools.map(String)
      : [],
    ...modelFields(raw.claude),
  };
  const apiProviders = Object.fromEntries(API_PROVIDERS.map((id) => [id, apiProviderBlock(id, raw[id], env)]));
  const requestedProvider = String(raw.agent?.provider ?? "").trim().toLowerCase();
  if (requestedProvider && !AGENT_PROVIDERS.includes(requestedProvider)) {
    throw new Error(`agent.provider is "${raw.agent.provider}". Use one of: ${AGENT_PROVIDERS.join(", ")}.`);
  }
  const agent = {
    enabled: agentEnabled,
    provider: requestedProvider || CLI_PROVIDERS[0],
    allowOverride: raw.agent?.allowOverride !== false,
  };
  const ui = {
    hiddenDocuments: Array.isArray(raw.ui?.hiddenDocuments)
      ? raw.ui.hiddenDocuments.map((value) => relativeSetting(value, "ui.hiddenDocuments[]"))
      : [],
    initialDocument: raw.ui?.initialDocument
      ? relativeSetting(raw.ui.initialDocument, "ui.initialDocument")
      : defaultDocument,
  };
  const config = {
    title: String(raw.title || path.basename(repoRoot) || APP_NAME),
    projectLabel: String(raw.projectLabel || "Local manuscript"),
    sourceRoot,
    defaultDocument,
    pdf,
    latex,
    codex,
    claude,
    ...apiProviders,
    agent,
    ui,
    approvedDocuments: Array.isArray(raw.approvedDocuments) ? raw.approvedDocuments.map(String) : [],
  };

  const absoluteSource = path.resolve(repoRoot, sourceRoot);
  const absoluteDocument = path.resolve(repoRoot, defaultDocument);
  if (!isInside(absoluteSource, absoluteDocument)) {
    throw new Error("defaultDocument must be inside sourceRoot.");
  }
  if (!existsSync(absoluteSource)) throw new Error(`Configured sourceRoot does not exist: ${absoluteSource}`);
  if (!existsSync(absoluteDocument)) throw new Error(`Configured defaultDocument does not exist: ${absoluteDocument}`);
  const absoluteInitialDocument = path.resolve(repoRoot, ui.initialDocument);
  if (!isInside(absoluteSource, absoluteInitialDocument)) {
    throw new Error("ui.initialDocument must be inside sourceRoot.");
  }
  if (!existsSync(absoluteInitialDocument)) throw new Error(`ui.initialDocument does not exist: ${absoluteInitialDocument}`);
  if (latex.enabled && !existsSync(path.resolve(repoRoot, latex.cwd))) {
    throw new Error(`Configured latex.cwd does not exist: ${path.resolve(repoRoot, latex.cwd)}`);
  }

  return {
    repoRoot,
    configPath,
    config,
    port: portSetting(readArg(argv, "--port") ?? env[ENV.port]),
  };
}
