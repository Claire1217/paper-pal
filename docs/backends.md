# AI backends

Paper Pal does not contain a model. It hands each task (a comment on a passage,
a section review, a chat turn) to a backend you choose and shows you the
answer as a proposal. No backend can write to your `.tex` files: CLI agents
run read-only, API providers only return text, and the source changes when
you click Accept.

There are two kinds of backend.

| Kind | Backends | Can read your files by itself | Needs |
|---|---|---|---|
| CLI agent | `codex`, `claude` | Yes, read-only, inside the paper folder | The CLI installed and signed in. No API key in Paper Pal. |
| API provider | `openai`, `anthropic`, `openrouter`, `deepseek`, `ollama`, `custom` | No. Paper Pal puts the needed text into the prompt. | A model id in `.paper-pal.json`, and for most a key in `.env`. |

Choose the default backend with `npm run setup -- <paper> --provider <id>` or
`"agent": { "provider": "<id>" }` in `.paper-pal.json`. With
`agent.allowOverride` (default `true`) the page can pick any other ready
backend for a single request.

Paper Pal ships **no model ids**. They go stale quickly. Wherever this page
says `<model-id>`, use an id from your provider's current model list. An API
backend without a model is reported as "not ready".

A backend is "ready" when its requirements are present. That is a
configuration check. It does not prove that a key or a model id is accepted.
`npm run doctor -- --ping` sends one real one-token request to each ready API
provider to check that.

## What is sent, and where

Every task carries: your comment, the selected passage, **the whole source
file the passage sits in**, related open comments on it, and the contents of
`agent.terminologyFiles` if you configured any.

**CLI agents** run as a child process with the paper folder as working
directory. In "smart" and "project" context mode the prompt allows them to
open other files in that folder (starting from `agent.entryPoints` and your
`AGENTS.md`/`CLAUDE.md`). In "local" mode the prompt tells them not to. The
process is started read-only: Codex with `--sandbox read-only`, Claude Code
with only `Read`, `Glob`, `Grep` allowed and `Write`, `Edit`, `NotebookEdit`,
`Bash` disallowed. What the CLI then sends to its vendor is decided by the
CLI, under your account and its privacy terms.

**API providers** cannot open files, so Paper Pal inlines the material:

- the current file, always;
- guidance files (`agent.guidanceFiles`) and terminology files;
- in "smart" and "project" context mode, the other manuscript files: the main
  file first, then the rest of the file list;
- for chat: the visible document, the compiled outline, guidance,
  terminology, then the rest of the manuscript.

All of this shares one budget, `agent.contextBudgetChars` (default 120000
characters, minimum 2000). Text that does not fit is cut, and the prompt says
so: `[... truncated by Paper Pal: N of M characters shown; raise
agent.contextBudgetChars to send more ...]`.

**Privacy.** With every backend except `ollama` (or a `custom` endpoint on
your own machine), text of your unpublished manuscript leaves your computer
and goes to that provider. Check the provider's data-retention and training
terms, your co-authors' expectations and any venue or funder rules before you
use it. Choose "local" context mode to send only the current file.

**Keys.** A key is read from the environment or `<app>/.env` and given to one
child process only, the bundled `api-adapter.mjs`. It is never written to
disk by Paper Pal, never passed to CLI agents, LaTeX or git, and is removed
from traces and error messages.

**A CLI that signs in with a key from your shell.** Paper Pal removes
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and the other provider keys from the
environment of the CLI agents on purpose. If your `claude` or `codex` works in
the terminal only because such a variable is exported there, it is signed out
inside Paper Pal and every run fails with an authentication error. Sign the
CLI in with its own login (`codex login`, or `claude` and `/login`), or use
the matching API backend with the key in `.env`. `npm run doctor` checks the
sign-in state the same way, without those variables.

## Codex CLI (`codex`)

- What it is: OpenAI's Codex command-line agent, run as `codex exec` in a
  read-only sandbox.
- You need: the `codex` CLI installed and signed in. Check with
  `codex --version` and `codex login status`; `npm run doctor` runs the second
  one for you and reports a signed-out CLI.
- Setup: `npm run setup -- <paper> --provider codex`
- Optional, in `.paper-pal.json`:

  ```json
  { "agent": { "provider": "codex" }, "codex": { "model": "<model-id>" } }
  ```

  Without `model`, the CLI's own default is used.
- Binary not on `PATH`: put `CODEX_BIN=/full/path/to/codex` in `.env`.
- The answer format is enforced with `--output-schema`. The CLI hands that
  file to the provider's strict structured-output mode, so it gets a copy of
  the schema without the keywords that mode rejects (`minLength`, `maxItems`,
  `$schema` and similar), the same simplification the API adapter applies.
- A run that reads other files can take longer than a minute. The comment card
  counts the seconds; if runs end in "timed out", raise `agent.timeoutMs`
  (default 90000) in `.paper-pal.json` and restart.

## Claude Code CLI (`claude`)

- What it is: Anthropic's Claude Code, run in print mode (`claude -p`) with
  read-only tools.
- You need: the `claude` CLI installed and signed in. Check with
  `claude --version` and `claude auth status` (`npm run doctor` does both).
- Setup: `npm run setup -- <paper> --provider claude`
- Optional, in `.paper-pal.json`:

  ```json
  { "agent": { "provider": "claude" }, "claude": { "model": "<model-id>" } }
  ```

- Binary not on `PATH`: put `CLAUDE_BIN=/full/path/to/claude` in `.env`.
- `claude.allowedTools` replaces the default `Read`, `Glob`, `Grep` list. The
  write tools stay disallowed whatever you put there.
- The CLI has no schema option, so the JSON Schema is appended to the prompt
  and the JSON object is extracted from the reply.

## OpenAI API (`openai`)

- `.env`: `OPENAI_API_KEY=...`
- Setup: `npm run setup -- <paper> --provider openai --model "<model-id>"`
- Or in `.paper-pal.json`:

  ```json
  { "agent": { "provider": "openai" }, "openai": { "model": "<model-id>" } }
  ```

- Request: `POST https://api.openai.com/v1/chat/completions` with
  `response_format: { type: "json_schema", strict: true }`.

## Anthropic API (`anthropic`)

- `.env`: `ANTHROPIC_API_KEY=...`
- Setup: `npm run setup -- <paper> --provider anthropic --model "<model-id>"`
- Or in `.paper-pal.json`:

  ```json
  { "agent": { "provider": "anthropic" }, "anthropic": { "model": "<model-id>", "maxTokens": 8192 } }
  ```

- Request: `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`
  and `anthropic-version: 2023-06-01`. `max_tokens` is `maxTokens` (default
  8192). The schema travels in the prompt. Reasoning effort is not mapped.

## OpenRouter (`openrouter`)

- `.env`: `OPENROUTER_API_KEY=...`
- Setup: `npm run setup -- <paper> --provider openrouter --model "<model-id>"`
- Or in `.paper-pal.json`:

  ```json
  { "agent": { "provider": "openrouter" }, "openrouter": { "model": "<model-id>" } }
  ```

- Request: `POST https://openrouter.ai/api/v1/chat/completions`. Paper Pal adds
  OpenRouter's attribution headers (`HTTP-Referer:
  https://github.com/claire1217/paper-pal`, `X-Title: Paper Pal`) for this host
  only. OpenRouter forwards your text to the model's upstream provider.

## DeepSeek API (`deepseek`)

- `.env`: `DEEPSEEK_API_KEY=...`
- Setup: `npm run setup -- <paper> --provider deepseek --model "<model-id>"`
- Or in `.paper-pal.json`:

  ```json
  { "agent": { "provider": "deepseek" }, "deepseek": { "model": "<model-id>" } }
  ```

- Request: `POST https://api.deepseek.com/v1/chat/completions`.

## Ollama (`ollama`)

- What it is: a model server on your own machine. Nothing leaves it.
- You need: Ollama running, and a model pulled (`ollama pull <model-name>`,
  list with `ollama list`). No key.
- Setup: `npm run setup -- <paper> --provider ollama --model "<model-name>"`
- Or in `.paper-pal.json`:

  ```json
  { "agent": { "provider": "ollama" }, "ollama": { "model": "<model-name>" } }
  ```

- Request: `POST http://127.0.0.1:11434/v1/chat/completions`. Another port or
  another loopback address: `"ollama": { "baseUrl": "http://127.0.0.1:<port>/v1" }`.
- "Ready" only means a model name is configured. `npm run doctor` also looks
  for a server at the base URL (1.5 s, loopback only, nothing is sent) and
  prints a `reach:ollama` warning when nothing answers. `npm run doctor --
  --ping` sends a real one-token request, and costs nothing here.
- A small local model may return something that is not the requested JSON.
  The comment then shows an error instead of a proposal. Raise
  `agent.timeoutMs` if your machine is slow.

## Any OpenAI-compatible endpoint (`custom`)

Use this for LM Studio, vLLM, llama.cpp's server, Groq, Together, a university
gateway, an Azure-style proxy that exposes `/chat/completions`, and similar.

- `.env`:

  ```sh
  PAPER_PAL_API_BASE_URL=https://host.example/v1
  PAPER_PAL_API_KEY=...        # leave empty if the endpoint needs no key
  ```

  The base URL is everything before `/chat/completions`.
- Setup: `npm run setup -- <paper> --provider custom --model "<model-id>"`
- Or in `.paper-pal.json`:

  ```json
  { "agent": { "provider": "custom" }, "custom": { "model": "<model-id>" } }
  ```

- An endpoint that speaks Anthropic's Messages protocol instead:
  `"custom": { "model": "<model-id>", "protocol": "anthropic" }`. The base URL
  is then the part before `/v1/messages`.
- The key is sent as `Authorization: Bearer <key>` (`x-api-key` for the
  `anthropic` protocol). Endpoints that want the key in another header or in
  the query string, such as Azure OpenAI's native `api-key` header with
  `?api-version=`, are not supported directly. Put a compatible gateway in
  front of them.
- The URL comes from your `.env`, not from the project file, on purpose: a
  project you cloned cannot redirect your key. See
  [trust switches](configuration.md#trust-switches).

## Presets

| id | Label | Protocol | Base URL | Key variable | Key required |
|---|---|---|---|---|---|
| `codex` | Codex | CLI | - | - | - |
| `claude` | Claude | CLI | - | - | - |
| `openai` | OpenAI API | openai | `https://api.openai.com/v1` | `OPENAI_API_KEY` | yes |
| `anthropic` | Anthropic API | anthropic | `https://api.anthropic.com` | `ANTHROPIC_API_KEY` | yes |
| `openrouter` | OpenRouter | openai | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | yes |
| `deepseek` | DeepSeek API | openai | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY` | yes |
| `ollama` | Ollama (local) | openai | `http://127.0.0.1:11434/v1` | - | no |
| `custom` | Custom API | openai, or `custom.protocol` | `PAPER_PAL_API_BASE_URL` | `PAPER_PAL_API_KEY` | no |

`<api>.apiKeyEnv` in `.paper-pal.json` can name another variable, for example
when two projects use different keys for the same provider.

## Reasoning effort

`agent.reasoningEffort` (comments in "local" and "smart" mode),
`agent.projectReasoningEffort` ("project" mode and section reviews) and
`agent.chatReasoningEffort` (chat) are passed on like this:

| Backend | How the value is sent |
|---|---|
| `codex` | `--config model_reasoning_effort="<value>"` |
| `claude` | `--effort <value>` |
| `openai` | `reasoning_effort: "<value>"` in the request body |
| `openrouter` | `reasoning: { "effort": "<value>" }` in the request body |
| `anthropic`, `deepseek`, `ollama`, `custom` | not sent |

The value is passed through unchanged; which values a model accepts is up to
the backend. For the two API styles, if the endpoint answers 400 or 422 and
the error text mentions the parameter, the request is repeated once without
it. The same fallback exists for `response_format` and `max_tokens`.

## How an API request behaves

- Every backend that uses the `openai` protocol gets the strict
  `response_format: json_schema` parameter for tasks with a structured answer
  (keywords the strict mode rejects, such as `minLength`, are removed from
  that copy). The schema is also written into the prompt, for endpoints that
  ignore the parameter.
- One request per task, no streaming. With a schema, the reply is accepted as
  bare JSON, a fenced `json` block, or the outermost `{...}` in the text.
- One retry after 1.5 s on HTTP 429, 5xx or a network error. A timeout is not
  retried. All attempts share one deadline (`agent.timeoutMs` and its
  siblings).
- An error shown in the page contains the HTTP status and the start of the
  provider's own message, with key values removed. A 401 or 403 adds a hint to
  check the key, a 404 to check the base URL and the model id.

## Verification status

Read this before relying on a backend.

| Path | Status |
|---|---|
| API adapter, both protocols: request shape, headers, schema handling, JSON extraction, retry, timeout, parameter fallback, key redaction, one-key-only child environment, and end-to-end comment, review and chat flows through the real server | Covered by automated tests against **local mock servers**. |
| OpenAI, Anthropic, OpenRouter, DeepSeek, Ollama and third-party OpenAI-compatible services | **Not exercised against the live services**, neither in CI nor before release. In particular, acceptance of the strict `json_schema` format by each vendor, and the wording of their 400 errors (which the parameter fallback depends on), are untested. |
| Claude Code CLI, prompt over stdin | Verified by hand against the real CLI, including one full comment-to-proposal run. Not part of CI. |
| Codex CLI, `codex exec -` reading the prompt from stdin | Implemented from the Codex documentation. The stdin path was not run against the real CLI before release. Not part of CI. |
| Agent runs in CI | Use a fake CLI (`tests/fixtures/fake-agent.mjs`). |
| Windows | `.cmd` shim handling is written but untested. |

If a backend fails for you, open an issue with the output of
`npm run doctor -- --json` and the error text. Remove manuscript text and keys
first.
