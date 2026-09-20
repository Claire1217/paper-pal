import { existsSync, promises as fs, openSync, readSync, closeSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NAME, CONFIG_NAME, ENV } from "./names.mjs";

// Paper Pal talks to an agent through one narrow contract: write the prompt to
// the child's stdin, run it read-only inside the repository, and end up with
// the agent's final message in a file. Codex satisfies that contract natively
// (`codex exec -` reads the prompt from stdin). Claude Code has no
// --output-schema or --output-last-message, so its adapter carries the schema
// in the prompt and writes stdout to the same output file; `claude -p` with no
// prompt argument reads stdin. API providers go through the bundled
// api-adapter.mjs, which has the same shape: prompt on stdin, answer on stdout.
//
// The prompt never travels in argv: it embeds whole source files, and a single
// argument is capped at ~128 KB on Linux and the whole command line at ~32 KB
// on Windows.

// One table describes every provider. Nothing else in the app switches on a
// provider id: add a row here (and, for an API, nothing else) to add a provider.
//
//   kind          "cli"  = a local agent CLI that can read the repository itself
//                 "api"  = an HTTP endpoint reached through api-adapter.mjs; it
//                          sees only what the prompt carries
//   capabilities  readRepo: whether prompts may tell the agent to open files
//   protocol      "openai" (POST {baseUrl}/chat/completions) or
//                 "anthropic" (POST {baseUrl}/v1/messages)
//   apiKeyEnv     name of the environment variable holding the key. The key
//                 itself is never stored in a configuration file.
//   keyRequired   false for endpoints that work without a key (local servers)
//   effortStyle   how a reasoning effort is expressed in the request body
//
// No model ids are listed on purpose: they go stale. An API provider without a
// configured model is reported as "not ready" instead of guessing one.
export const PROVIDER_TABLE = Object.freeze({
  codex: {
    label: "Codex", kind: "cli", capabilities: { readRepo: true },
    defaultCommand: "codex", commandEnv: "CODEX_BIN",
  },
  claude: {
    label: "Claude", kind: "cli", capabilities: { readRepo: true },
    defaultCommand: "claude", commandEnv: "CLAUDE_BIN",
  },
  openai: {
    label: "OpenAI API", kind: "api", capabilities: { readRepo: false },
    protocol: "openai", baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY", keyRequired: true,
    effortStyle: "openai",
  },
  anthropic: {
    label: "Anthropic API", kind: "api", capabilities: { readRepo: false },
    protocol: "anthropic", baseUrl: "https://api.anthropic.com", apiKeyEnv: "ANTHROPIC_API_KEY", keyRequired: true,
  },
  openrouter: {
    label: "OpenRouter", kind: "api", capabilities: { readRepo: false },
    protocol: "openai", baseUrl: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY", keyRequired: true,
    effortStyle: "openrouter",
  },
  deepseek: {
    label: "DeepSeek API", kind: "api", capabilities: { readRepo: false },
    protocol: "openai", baseUrl: "https://api.deepseek.com/v1", apiKeyEnv: "DEEPSEEK_API_KEY", keyRequired: true,
  },
  ollama: {
    label: "Ollama (local)", kind: "api", capabilities: { readRepo: false },
    protocol: "openai", baseUrl: "http://127.0.0.1:11434/v1", apiKeyEnv: null, keyRequired: false,
  },
  custom: {
    label: "Custom API", kind: "api", capabilities: { readRepo: false },
    protocol: "openai", baseUrl: null, baseUrlEnv: ENV.customBaseUrl, apiKeyEnv: ENV.customKey, keyRequired: false,
  },
});

export const AGENT_PROVIDERS = Object.freeze(Object.keys(PROVIDER_TABLE));
export const API_PROVIDERS = Object.freeze(AGENT_PROVIDERS.filter((id) => PROVIDER_TABLE[id].kind === "api"));
export const CLI_PROVIDERS = Object.freeze(AGENT_PROVIDERS.filter((id) => PROVIDER_TABLE[id].kind === "cli"));
export const API_PROTOCOLS = Object.freeze(["openai", "anthropic"]);

// Read-only floor for Claude. Anything outside this list is denied in print
// mode, which is how the adapter matches the Codex read-only sandbox.
const CLAUDE_READ_ONLY_TOOLS = ["Read", "Glob", "Grep"];
// Every name here must exist in the installed CLI: an unknown one is a hard
// error, not a warning, so a retired tool name takes the whole run down.
// MultiEdit was removed from the CLI and is deliberately absent; Edit already
// covers what it did.
const CLAUDE_WRITE_TOOLS = ["Write", "Edit", "NotebookEdit", "Bash"];

export function normalizeProvider(value, fallback = "codex") {
  const candidate = String(value || "").trim().toLowerCase();
  return AGENT_PROVIDERS.includes(candidate) ? candidate : fallback;
}

export function providerLabel(provider) {
  return PROVIDER_TABLE[normalizeProvider(provider)].label;
}

export function providerKind(provider) {
  return PROVIDER_TABLE[normalizeProvider(provider)].kind;
}

export function providerCapabilities(provider) {
  return { ...PROVIDER_TABLE[normalizeProvider(provider)].capabilities };
}

// A server started from a desktop launcher often has a shorter PATH than the
// user's shell, so a CLI that works in the terminal is "not found" here. When
// the command is not on PATH, look in the places these CLIs are usually
// installed before giving up. Entries that do not exist are simply skipped.
function fallbackDirectories() {
  const home = homedir();
  return [
    path.join(home, ".local", "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".claude", "local"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    // The ChatGPT desktop app for macOS bundles a codex binary.
    "/Applications/ChatGPT.app/Contents/Resources",
  ];
}

// The API adapter ships with Paper Pal and runs on this Node.
const API_ADAPTER = fileURLToPath(new URL("./api-adapter.mjs", import.meta.url));

function executableNames(command) {
  if (process.platform !== "win32" || path.extname(command)) return [command];
  const extensions = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  return [...extensions.map((extension) => `${command}${extension}`), command];
}

/**
 * Resolve a command name to an absolute executable path the way a shell would:
 * PATH lookup, honouring PATHEXT on Windows. Returns null when nothing matches.
 */
export function resolveExecutable(command, extraDirectories = []) {
  const value = String(command || "");
  if (!value) return null;
  if (value.includes("/") || value.includes(path.sep) || path.isAbsolute(value)) {
    return executableNames(value).find((candidate) => existsSync(candidate)) || null;
  }
  const directories = [
    ...(process.env.PATH || process.env.Path || "").split(path.delimiter).filter(Boolean),
    ...extraDirectories,
  ];
  for (const directory of directories) {
    for (const name of executableNames(value)) {
      const candidate = path.join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

// cmd.exe quoting for one argument (same rules cross-spawn applies): escape
// embedded quotes for the C runtime, wrap in quotes, then caret-escape every
// cmd metacharacter so nothing is interpreted by the shell.
function escapeCmdArgument(argument) {
  const quoted = `"${String(argument)
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\*)$/, "$1$1")}"`;
  return quoted.replace(/([()\][%!^"`<>&|;, *?])/g, "^$1");
}

/**
 * Turn (command, args) into something child_process.spawn can run without
 * `shell: true`. On POSIX this is the identity. On Windows, npm installs CLIs
 * as .cmd shims, which CreateProcess cannot launch directly (Node >= 20.12
 * rejects them with EINVAL), so those are run through `cmd.exe /d /s /c` with
 * every argument escaped. NOTE: the Windows path is untested.
 */
export function spawnPlan(command, args = []) {
  if (process.platform !== "win32") return { command, args, options: {} };
  const resolved = resolveExecutable(command) || command;
  if (!/[.](?:cmd|bat)$/i.test(resolved)) return { command: resolved, args, options: {} };
  const line = [resolved.replace(/([()\][%!^"`<>&|;, *?])/g, "^$1"), ...args.map(escapeCmdArgument)].join(" ");
  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    options: { windowsVerbatimArguments: true },
  };
}

function resolveCommand(command) {
  return resolveExecutable(command, fallbackDirectories()) || command;
}

export function providerCommand(provider, config) {
  const resolved = normalizeProvider(provider);
  const row = PROVIDER_TABLE[resolved];
  if (row.kind === "api") return process.execPath;
  return resolveCommand(process.env[row.commandEnv] || config?.[resolved]?.command || row.defaultCommand);
}

/**
 * A `codex` or `claude` on PATH is sometimes a small wrapper script that adds
 * flags which switch the agent's sandbox or permission checks off. Paper Pal
 * asks for a read-only agent, and such a wrapper can silently undo that, so
 * say so. Only small text files are inspected; a real binary is never read.
 */
const UNSAFE_WRAPPER_FLAGS = ["--dangerously-bypass-approvals-and-sandbox", "--yolo", "--dangerously-skip-permissions", "danger-full-access"];

export function inspectAgentCommand(executablePath) {
  try {
    const stats = statSync(executablePath);
    if (!stats.isFile() || stats.size > 65536) return null;
    const buffer = Buffer.alloc(stats.size);
    const handle = openSync(executablePath, "r");
    try {
      readSync(handle, buffer, 0, stats.size, 0);
    } finally {
      closeSync(handle);
    }
    if (buffer.includes(0)) return null;
    const flag = UNSAFE_WRAPPER_FLAGS.find((candidate) => buffer.includes(candidate));
    return flag ? flag : null;
  } catch {
    return null;
  }
}

const loopbackNames = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLoopbackUrl(value) {
  try {
    return loopbackNames.has(new URL(String(value)).hostname);
  } catch {
    return false;
  }
}

/**
 * Effective settings of an API provider: the preset, overlaid with the
 * provider's block in the project configuration and, for "custom", the base
 * URL from the environment. Never contains a key, only the NAME of the
 * environment variable that holds it.
 */
export function apiSettings(provider, config, env = process.env) {
  const resolved = normalizeProvider(provider);
  const row = PROVIDER_TABLE[resolved];
  if (row.kind !== "api") return null;
  const block = config?.[resolved] || {};
  const baseUrl = String(block.baseUrl || (row.baseUrlEnv ? env[row.baseUrlEnv] : "") || row.baseUrl || "").replace(/\/+$/, "");
  const protocol = API_PROTOCOLS.includes(block.protocol) ? block.protocol : row.protocol;
  const apiKeyEnv = block.apiKeyEnv || row.apiKeyEnv || null;
  return {
    provider: resolved,
    protocol,
    baseUrl,
    apiKeyEnv,
    keyRequired: row.keyRequired,
    hasKey: Boolean(apiKeyEnv && env[apiKeyEnv]),
    maxTokens: Number(block.maxTokens) > 0 ? Math.floor(Number(block.maxTokens)) : null,
    effortStyle: row.effortStyle || "none",
  };
}

/** Names of every environment variable that may hold an API key for the adapter. */
export function apiKeyVariableNames(config = null, env = process.env) {
  const names = new Set();
  for (const id of API_PROVIDERS) {
    if (PROVIDER_TABLE[id].apiKeyEnv) names.add(PROVIDER_TABLE[id].apiKeyEnv);
    const configured = config?.[id]?.apiKeyEnv;
    if (configured) names.add(String(configured));
  }
  for (const name of Object.keys(env)) {
    if (/^PAPER_PAL_.*_KEY$/.test(name)) names.add(name);
  }
  return names;
}

// The last configuration handed to childEnvironment()/redactSecrets(), so that
// callers which have no configuration in scope (LaTeX, git, doctor probes)
// still strip a key variable that only the project configuration names.
let knownConfig = null;
export function rememberConfig(config) {
  knownConfig = config || null;
}

/**
 * Environment for a child process.
 *  - CLI agents, LaTeX, git: every API key variable in the provider table (and
 *    any `apiKeyEnv` the configuration names) is removed.
 *  - The API adapter: the same, except for the ONE key variable it needs.
 */
export function childEnvironment({ provider = null, config = knownConfig } = {}) {
  const env = { ...process.env };
  const keep = provider && PROVIDER_TABLE[provider]?.kind === "api"
    ? apiSettings(provider, config, process.env).apiKeyEnv
    : null;
  for (const name of apiKeyVariableNames(config, env)) {
    if (name !== keep) delete env[name];
  }
  return env;
}

/** Replace the literal value of every API key with "[redacted]". */
export function redactSecrets(value, { config = knownConfig } = {}) {
  let text = String(value ?? "");
  for (const name of apiKeyVariableNames(config, process.env)) {
    const secret = process.env[name];
    if (!secret || secret.length < 6) continue;
    text = text.split(secret).join("[redacted]");
  }
  return text;
}

export function providerModel(provider, config, { chat = false } = {}) {
  const settings = config?.[normalizeProvider(provider)];
  if (chat) return settings?.chatModel || settings?.model || null;
  return settings?.model || null;
}

/** Models the UI may switch to: the configured default plus `models`. */
export function providerModelChoices(provider, config) {
  const settings = config?.[normalizeProvider(provider)];
  const listed = Array.isArray(settings?.models) ? settings.models.map(String) : [];
  const fallback = providerModel(provider, config);
  return [...new Set([...(fallback ? [fallback] : []), ...listed])];
}

/**
 * Can this provider run right now? `reason` is one human sentence saying what
 * to do when it cannot. The same function backs /api/bootstrap, /api/health,
 * doctor and setup, so they never disagree.
 */
export function providerAvailability(provider, config, env = process.env) {
  const resolved = normalizeProvider(provider);
  const row = PROVIDER_TABLE[resolved];
  if (config?.agent?.enabled === false) {
    return { available: false, reason: `Agent features are switched off (agent.enabled is false in ${CONFIG_NAME}).` };
  }
  if (row.kind === "cli") {
    const command = env[row.commandEnv] || config?.[resolved]?.command || row.defaultCommand;
    const found = resolveExecutable(command, fallbackDirectories());
    if (found) {
      const flag = inspectAgentCommand(found);
      return flag
        ? {
            available: true,
            reason: null,
            warning: `The ${path.basename(String(command))} command on PATH is a wrapper script that passes ${flag}, which turns the agent's read-only sandbox off. Point ${row.commandEnv} in .env at the real binary to keep agents read-only.`,
          }
        : { available: true, reason: null };
    }
    return { available: false, reason: `${path.basename(String(command))} CLI not found on PATH. Install it, or set ${row.commandEnv} in .env.` };
  }
  const settings = apiSettings(resolved, config, env);
  if (!settings.baseUrl) {
    return { available: false, reason: `Set ${row.baseUrlEnv || `${resolved}.baseUrl`} in .env.` };
  }
  if (settings.keyRequired && !settings.hasKey) {
    return { available: false, reason: `Set ${settings.apiKeyEnv} in .env.` };
  }
  if (!providerModel(resolved, config)) {
    return { available: false, reason: `Set ${resolved}.model in ${CONFIG_NAME}.` };
  }
  return { available: true, reason: null };
}

/** Public description of one provider: no paths, no secrets. */
export function describeProvider(provider, config, env = process.env) {
  const resolved = normalizeProvider(provider);
  const row = PROVIDER_TABLE[resolved];
  return {
    id: resolved,
    label: row.label,
    kind: row.kind,
    capabilities: { ...row.capabilities },
    ...providerAvailability(resolved, config, env),
  };
}

/**
 * Provider to start with when none was chosen: the first CLI that is installed,
 * then the first API provider whose key (or base URL) is present, else null.
 * A model cannot be guessed, so an API provider counts as soon as it has a key.
 */
export function firstUsableProvider(env = process.env) {
  for (const id of CLI_PROVIDERS) {
    const row = PROVIDER_TABLE[id];
    if (resolveExecutable(env[row.commandEnv] || row.defaultCommand, fallbackDirectories())) return id;
  }
  for (const id of API_PROVIDERS) {
    const row = PROVIDER_TABLE[id];
    if (row.keyRequired ? env[row.apiKeyEnv] : (row.baseUrlEnv && env[row.baseUrlEnv])) return id;
  }
  return null;
}

function schemaInstructions(schemaText) {
  return [
    "Return exactly one JSON object and nothing else. No preamble, no explanation,",
    "no commentary after the object. A fenced ```json block is acceptable.",
    "The object must validate against this JSON Schema:",
    schemaText,
  ].join("\n");
}

/**
 * Build the command and arguments for one agent run.
 *
 * `schemaPath` is the JSON Schema the reply must satisfy. Codex enforces it
 * with --output-schema; the Claude adapter appends it to the prompt instead,
 * so callers do not need to know which provider is active.
 *
 * Returns `input`, the text the caller must write to the child's stdin, and
 * `capturesStdout: true` when the caller must persist stdout itself via
 * captureAgentOutput().
 */
export async function buildAgentInvocation({
  provider,
  config,
  prompt,
  schemaPath = null,
  outputPath,
  repoRoot,
  model = null,
  reasoningEffort = null,
  timeoutMs = null,
}) {
  const resolved = normalizeProvider(provider);
  const command = providerCommand(resolved, config);

  if (PROVIDER_TABLE[resolved].kind === "api") {
    const settings = apiSettings(resolved, config);
    // The schema is always spelled out in the prompt as well: not every
    // endpoint honours response_format, and the Anthropic protocol has none.
    const fullPrompt = schemaPath
      ? `${prompt}\n\n${schemaInstructions(await fs.readFile(schemaPath, "utf8"))}`
      : prompt;
    const args = [API_ADAPTER, "--protocol", settings.protocol, "--base-url", settings.baseUrl, "--title", APP_NAME];
    if (model) args.push("--model", String(model));
    if (settings.apiKeyEnv) args.push("--key-env", settings.apiKeyEnv);
    if (!settings.keyRequired) args.push("--key-optional");
    if (schemaPath) args.push("--schema", schemaPath);
    if (settings.maxTokens) args.push("--max-tokens", String(settings.maxTokens));
    if (reasoningEffort && settings.effortStyle !== "none") {
      args.push("--effort", String(reasoningEffort), "--effort-style", settings.effortStyle);
    }
    // Leave the adapter a little less than the caller's own deadline so its
    // error message, not a bare "timed out", is what the user sees.
    if (Number(timeoutMs) > 0) args.push("--timeout", String(Math.max(1000, Math.floor(Number(timeoutMs) * 0.95))));
    return { command, args, input: fullPrompt, capturesStdout: true, provider: resolved };
  }

  if (resolved === "claude") {
    const allowedTools = Array.isArray(config.claude?.allowedTools) && config.claude.allowedTools.length
      ? config.claude.allowedTools.map(String)
      : CLAUDE_READ_ONLY_TOOLS;
    const fullPrompt = schemaPath
      ? `${prompt}\n\n${schemaInstructions(await fs.readFile(schemaPath, "utf8"))}`
      : prompt;
    // No prompt argument: print mode then reads the prompt from stdin. (A
    // trailing prompt argument would also be swallowed by the variadic
    // --allowedTools / --disallowedTools options.)
    const args = ["-p", "--output-format", "text"];
    if (model) args.push("--model", String(model));
    // Without this the configured reasoning effort reached Codex only and was
    // silently dropped on this backend. The CLI accepts low|medium|high|xhigh|max
    // and warns rather than failing on anything else.
    if (reasoningEffort) args.push("--effort", String(reasoningEffort));
    args.push("--allowedTools", ...allowedTools);
    args.push("--disallowedTools", ...CLAUDE_WRITE_TOOLS);
    if (config.claude?.permissionMode) {
      args.push("--permission-mode", String(config.claude.permissionMode));
    }
    return { command, args, input: fullPrompt, capturesStdout: true, provider: resolved };
  }

  // The approval policy goes in as a config override, not as the global
  // "-a never" flag: some setups put a wrapper named `codex` on PATH that adds
  // --dangerously-bypass-approvals-and-sandbox, and the CLI refuses that flag
  // together with --ask-for-approval before it runs anything.
  // --skip-git-repo-check: `codex exec` refuses to run outside a git repository
  // ("Not inside a trusted directory"), and a paper folder often is not one.
  // The run is read-only, so the check protects nothing here.
  const args = ["exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", "--config", 'approval_policy="never"', "--color", "never"];
  if (model) args.push("--model", String(model));
  if (reasoningEffort) args.push("--config", `model_reasoning_effort="${reasoningEffort}"`);
  if (schemaPath) args.push("--output-schema", schemaPath);
  // "-" as the prompt makes `codex exec` read the instructions from stdin.
  args.push("--output-last-message", outputPath, "-C", repoRoot, "-");
  return { command, args, input: prompt, capturesStdout: false, provider: resolved };
}

/**
 * Persist the agent's final message when the provider does not write it itself.
 * Codex has already written outputPath; Claude printed to stdout.
 */
export async function captureAgentOutput({ invocation, result, outputPath }) {
  if (!invocation?.capturesStdout) return;
  await fs.writeFile(outputPath, String(result?.stdout || "").trim(), "utf8");
}
