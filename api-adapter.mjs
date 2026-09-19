#!/usr/bin/env node
/**
 * Paper Pal's API adapter: one HTTP request shaped like the agent CLIs the
 * server already spawns. The prompt arrives on stdin, the assistant's answer is
 * printed on stdout, errors go to stderr with a non-zero exit code.
 *
 *   echo "prompt" | OPENAI_API_KEY=... node api-adapter.mjs \
 *     --protocol openai --base-url https://api.openai.com/v1 \
 *     --model <id> --key-env OPENAI_API_KEY [--schema file.json] [--timeout ms]
 *
 * Options
 *   --protocol openai|anthropic   request shape (default openai)
 *   --base-url URL                openai: POST {base}/chat/completions
 *                                 anthropic: POST {base}/v1/messages
 *   --model ID                    required
 *   --key-env NAME                environment variable that holds the key
 *   --key-optional                do not fail when that variable is empty
 *   --schema FILE                 JSON Schema of the expected answer
 *   --timeout MS                  overall budget, retries included (default 120000)
 *   --max-tokens N                anthropic: max_tokens (default 8192); openai: only sent when given
 *   --effort LEVEL --effort-style openai|openrouter|none
 *   --ping                        ignore stdin, ask for a one-token reply (used by doctor --ping)
 *
 * The key is read from the named environment variable only. It is never
 * written anywhere, and its literal value is removed from every error message.
 *
 * Exit codes: 0 ok, 1 request failed, 2 usage / missing key or model.
 */
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const APP_URL = "https://github.com/claire1217/paper-pal";
// Keywords OpenAI's strict structured-output mode rejects. They stay in the
// prompt-embedded schema; only the response_format copy is simplified.
const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "$schema", "minLength", "maxLength", "pattern", "format", "minimum", "maximum",
  "multipleOf", "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties",
]);

export function parseArgs(argv) {
  const options = {
    protocol: "openai", baseUrl: null, model: null, keyEnv: null, keyOptional: false, schema: null,
    timeoutMs: 120_000, maxTokens: null, effort: null, effortStyle: "none", title: "Paper Pal", ping: false,
  };
  const valueOptions = {
    "--protocol": "protocol", "--base-url": "baseUrl", "--model": "model", "--key-env": "keyEnv",
    "--schema": "schema", "--timeout": "timeoutMs", "--max-tokens": "maxTokens", "--effort": "effort",
    "--effort-style": "effortStyle", "--title": "title",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--key-optional") options.keyOptional = true;
    else if (arg === "--ping") options.ping = true;
    else if (valueOptions[arg]) {
      if (argv[index + 1] === undefined) throw new UsageError(`${arg} needs a value.`);
      options[valueOptions[arg]] = argv[++index];
    } else throw new UsageError(`Unknown option: ${arg}`);
  }
  options.timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 120_000;
  options.maxTokens = Number(options.maxTokens) > 0 ? Math.floor(Number(options.maxTokens)) : null;
  return options;
}

class UsageError extends Error {}

export function redact(text, key) {
  let value = String(text ?? "");
  if (key && key.length >= 4) value = value.split(key).join("[redacted]");
  // Belt and braces: anything that looks like a bearer token or a vendor key.
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[redacted]");
}

/**
 * Pull the JSON object out of a model reply: the reply itself, a fenced
 * ```json block, or the outermost {...} found in surrounding prose.
 * Returns the JSON text, or null when nothing parses to an object.
 */
export function extractJsonObject(text) {
  const value = String(text ?? "").trim();
  const accept = (candidate) => {
    try {
      const parsed = JSON.parse(candidate);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? candidate : null;
    } catch {
      return null;
    }
  };
  if (accept(value)) return value;
  for (const match of value.matchAll(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/g)) {
    const inner = match[1].trim();
    if (accept(inner)) return inner;
  }
  // Outermost balanced object, string-aware; try each top-level "{" in turn.
  for (let start = value.indexOf("{"); start >= 0; start = value.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < value.length; index += 1) {
      const character = value[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = value.slice(start, index + 1);
          if (accept(candidate)) return candidate;
          break;
        }
      }
    }
  }
  return null;
}

export function schemaForResponseFormat(schema) {
  if (Array.isArray(schema)) return schema.map(schemaForResponseFormat);
  if (!schema || typeof schema !== "object") return schema;
  const result = {};
  for (const [name, value] of Object.entries(schema)) {
    if (UNSUPPORTED_SCHEMA_KEYWORDS.has(name)) continue;
    // "properties" maps arbitrary names to schemas: keep every name.
    result[name] = name === "properties" && value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, schemaForResponseFormat(child)]))
      : schemaForResponseFormat(value);
  }
  return result;
}

export function buildRequest(options, prompt, key, schema) {
  const base = String(options.baseUrl || "").replace(/\/+$/, "");
  if (options.protocol === "anthropic") {
    return {
      url: /\/v1$/.test(base) ? `${base}/messages` : `${base}/v1/messages`,
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        ...(key ? { "x-api-key": key } : {}),
      },
      body: {
        model: options.model,
        max_tokens: options.ping ? 1 : (options.maxTokens || 8192),
        messages: [{ role: "user", content: prompt }],
      },
      optional: [],
    };
  }
  const body = { model: options.model, messages: [{ role: "user", content: prompt }], stream: false };
  // Parameters an endpoint may not know. Each is dropped (once) when the
  // endpoint rejects the request and names it.
  const optional = [];
  if (options.ping) {
    body.max_tokens = 1;
    optional.push({ name: "max_tokens", mentions: /max_tokens/i });
  } else if (options.maxTokens) {
    body.max_tokens = options.maxTokens;
    optional.push({ name: "max_tokens", mentions: /max_tokens/i });
  }
  if (schema && !options.ping) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "paper_pal_output", strict: true, schema: schemaForResponseFormat(schema) },
    };
    optional.push({ name: "response_format", mentions: /response_format|json_schema|structured|schema/i });
  }
  if (options.effort && !options.ping) {
    if (options.effortStyle === "openai") {
      body.reasoning_effort = options.effort;
      optional.push({ name: "reasoning_effort", mentions: /reasoning/i });
    } else if (options.effortStyle === "openrouter") {
      body.reasoning = { effort: options.effort };
      optional.push({ name: "reasoning", mentions: /reasoning/i });
    }
  }
  const headers = {
    "Content-Type": "application/json",
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
  // OpenRouter attributes traffic by these two headers; other hosts ignore them.
  if (/(^|[.])openrouter[.]ai$/i.test(hostOf(base))) {
    headers["HTTP-Referer"] = APP_URL;
    headers["X-Title"] = options.title || "Paper Pal";
  }
  return { url: `${base}/chat/completions`, headers, body, optional };
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function answerText(protocol, payload) {
  if (protocol === "anthropic") {
    const parts = Array.isArray(payload?.content) ? payload.content : [];
    return parts.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("");
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("");
  return "";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class RequestFailure extends Error {
  constructor(message, { retryable = false, status = null, body = "" } = {}) {
    super(message);
    this.retryable = retryable;
    this.status = status;
    this.body = body;
  }
}

async function attempt(request, remainingMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, remainingMs));
  try {
    let response;
    try {
      response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new RequestFailure("timeout", { retryable: false });
      const cause = error?.cause?.code || error?.cause?.message || "";
      throw new RequestFailure(`network error: ${error.message}${cause ? ` (${cause})` : ""}`, { retryable: true });
    }
    let text;
    try {
      text = await response.text();
    } catch (error) {
      if (controller.signal.aborted) throw new RequestFailure("timeout", { retryable: false });
      throw new RequestFailure(`network error while reading the reply: ${error.message}`, { retryable: true });
    }
    if (!response.ok) {
      throw new RequestFailure(`HTTP ${response.status}`, {
        retryable: response.status === 429 || response.status >= 500,
        status: response.status,
        body: text,
      });
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send the request. At most one retry for 429 / 5xx / network errors (with a
 * short backoff), plus at most one resend per optional parameter the endpoint
 * rejects. Everything shares one overall deadline.
 */
export async function send(request, { timeoutMs, backoffMs = 1500, log = () => {} }) {
  const deadline = Date.now() + timeoutMs;
  let retried = false;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new RequestFailure("timeout");
    try {
      return await attempt(request, remaining);
    } catch (error) {
      if (!(error instanceof RequestFailure)) throw error;
      if (error.status === 400 || error.status === 422) {
        const rejected = request.optional.find((item) => item.name in request.body && item.mentions.test(error.body));
        if (rejected) {
          log(`The endpoint rejected "${rejected.name}"; sending the request again without it.`);
          delete request.body[rejected.name];
          continue;
        }
      }
      if (error.retryable && !retried && deadline - Date.now() > backoffMs) {
        retried = true;
        log(`${error.message}; retrying once in ${backoffMs} ms.`);
        await sleep(backoffMs);
        continue;
      }
      throw error;
    }
  }
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  let options;
  let key = "";
  const fail = (code, message) => {
    process.stderr.write(`${redact(message, key)}\n`);
    process.exitCode = code;
  };
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    return fail(2, error.message);
  }
  key = options.keyEnv ? String(process.env[options.keyEnv] || "") : "";
  if (!["openai", "anthropic"].includes(options.protocol)) return fail(2, `Unknown protocol "${options.protocol}". Use openai or anthropic.`);
  if (!options.baseUrl) return fail(2, "No base URL given (--base-url).");
  if (!/^https?:\/\//i.test(options.baseUrl)) return fail(2, "The base URL must start with http:// or https://.");
  if (!options.model) return fail(2, "No model configured. Set <provider>.model in .paper-pal.json.");
  if (!key && !options.keyOptional) {
    return fail(2, `${options.keyEnv || "The API key variable"} is not set. Put it in the .env file next to Paper Pal's package.json (never in .paper-pal.json).`);
  }
  const prompt = options.ping ? "Reply with the single word: ok" : await readStdin();
  if (!prompt) return fail(2, "No prompt was received on stdin.");

  let schema = null;
  if (options.schema) {
    try {
      schema = JSON.parse(readFileSync(options.schema, "utf8"));
    } catch (error) {
      return fail(2, `Could not read the schema file: ${error.message}`);
    }
  }

  const request = buildRequest(options, prompt, key, schema);
  const where = `${options.protocol} endpoint ${hostOf(request.url) || request.url}`;
  let text;
  try {
    text = await send(request, {
      timeoutMs: options.timeoutMs,
      backoffMs: Number(process.env.PAPER_PAL_ADAPTER_BACKOFF_MS) || 1500,
      log: (message) => process.stderr.write(`[api-adapter] ${redact(message, key)}\n`),
    });
  } catch (error) {
    if (error?.message === "timeout") {
      return fail(1, `The ${where} did not answer within ${Math.round(options.timeoutMs / 1000)} s.`);
    }
    const detail = error?.body ? `: ${String(error.body).replace(/\s+/g, " ").slice(0, 800)}` : "";
    const hint = error?.status === 401 || error?.status === 403
      ? ` Check ${options.keyEnv || "the API key"} in .env.`
      : error?.status === 404 ? " Check the base URL and the model id." : "";
    return fail(1, `The ${where} request failed (${error?.message || error})${detail}${hint}`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return fail(1, `The ${where} returned something that is not JSON: ${text.slice(0, 400)}`);
  }
  if (options.ping) {
    process.stdout.write("ok");
    return undefined;
  }
  const content = answerText(options.protocol, payload).trim();
  if (!content) {
    const reason = payload?.stop_reason || payload?.choices?.[0]?.finish_reason || "unknown";
    return fail(1, `The ${where} returned no text (finish reason: ${reason}). ${JSON.stringify(payload).slice(0, 400)}`);
  }
  const stopReason = payload?.stop_reason || payload?.choices?.[0]?.finish_reason || "";
  if (/^(length|max_tokens)$/.test(stopReason)) {
    process.stderr.write("[api-adapter] The reply was cut off at the token limit; raise <provider>.maxTokens if the result is incomplete.\n");
  }
  if (schema) {
    // The caller parses JSON; hand it the object alone when one can be found.
    process.stdout.write(extractJsonObject(content) ?? content);
  } else {
    process.stdout.write(content);
  }
  return undefined;
}

// Run only when executed, so the helpers above can be imported by tests.
function executedDirectly() {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}
if (executedDirectly()) {
  main().catch((error) => {
    process.stderr.write(`${redact(error?.stack || error, null)}\n`);
    process.exitCode = 1;
  });
}
