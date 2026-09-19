# AGENTS.md

## If you are an AI agent installing Paper Pal for a user

1. Ask the user: the paper folder, the AI backend (an installed CLI, or an API provider plus a model id), and whether to compile PDFs. Never guess a model id.
2. `git clone https://github.com/claire1217/paper-pal.git ~/paper-pal && cd ~/paper-pal && npm install` (Node 20 or newer; not inside the paper's repository).
3. API providers only: `cp .env.example .env`, then the **user** pastes the key into `.env`. Never echo, log or commit a key.
4. `npm run --silent setup -- "<paper>" --json`, then `npm run --silent doctor -- --json`. Both never prompt and have documented exit codes.
5. Start with `npm start`, then verify with `curl -s http://127.0.0.1:4317/api/health`.
6. Report the URL, the backend status and what was written where.

The full procedure, with expected output and the reaction to every exit code, is in
[docs/INSTALL-FOR-AGENTS.md](docs/INSTALL-FOR-AGENTS.md). Follow that file, not this summary.

The rest of this file is for agents (and people) changing the code.

## Project overview

Paper Pal is a local, review-first writing workspace for LaTeX manuscripts. A Node (>= 20)
HTTP server with no framework listens on `127.0.0.1:4317`, parses `.tex` files into blocks and
serves a single-page app that shows them as prose. The author selects a passage and comments.
An agent backend (Codex CLI, Claude Code CLI, or an HTTP API through `api-adapter.mjs`) returns
a proposal. The page shows a diff. The source file is written only when the author accepts.

- Runtime dependency: `katex` only. No bundler, no transpiler, no build step. `public/` is served as is.
- ES modules everywhere (`"type": "module"`, `.mjs` on the server side).
- Formerly a private tool named "Draft Review". Old on-disk names are still read; see `names.mjs`.

## Invariants (do not break these)

1. **Only explicit author actions write manuscript source**: a manual block edit (`/api/save`),
   Accept on a proposal, applying a confirmed linked change set, resolving a tracked change,
   Undo, and reverting a structure plan. An agent run never writes the manuscript. CLI agents
   run read-only (`codex --sandbox read-only`; `claude` with write tools disallowed).
2. **Writes stay inside `sourceRoot`**, checked after resolving symlinks (`realPathInside`,
   `insideSourceRoot`). Writes are atomic (`atomicWrite`) and serialised (`withProjectLock`).
3. **The server binds loopback by default.** Only `PAPER_PAL_HOST` changes that, and a
   non-loopback bind prints a warning. A generic `HOST` variable is ignored.
4. **Every request passes the `Host` allow-list** (421 otherwise). Every non-GET request needs a
   matching `Origin` or the `X-Paper-Pal: 1` header (403), and a JSON content type (415).
5. **API keys come from the environment or `<app>/.env` only.** Never from the project
   configuration (start-up refuses credential-like fields), never passed to CLI agents, LaTeX or
   git children (`childEnvironment`), never in argv, and redacted from traces, status files and
   error messages (`redactSecrets`, `redact`).
6. **A project file cannot choose programs or key destinations.** `latex.command`,
   `codex.command`, `claude.command` and `<provider>.baseUrl` are restricted unless the user sets
   a `PAPER_PAL_ALLOW_*` switch outside the project.
7. **The page makes no third-party requests.** Scripts, styles and fonts are served locally under
   a strict CSP. The only external content is a cited paper's own URL, opened on the author's click.
8. **No model ids in code or presets.** They go stale. An API provider without a configured model
   is "not ready".
9. **No new runtime dependency and no build step without discussion in an issue first.**
10. Prompts go to children on stdin, never in argv. Absolute machine paths and key values never
    reach a model or the browser.

## Commands

```sh
npm install            # once
npm test               # check + portable + suite; must pass before every PR
npm run check          # node --check on every shipped .mjs and public/app.js
npm run test:portable  # end-to-end smoke test in one plain script
npm run test:suite     # all tests/*.test.mjs; filter: node tests/run.mjs parser
npm run demo           # server on a throwaway copy of examples/sample-paper
npm run dev            # node --watch server.mjs (needs a configured project)
npm run setup -- <paper-dir> [--json]   # writes <paper>/.paper-pal.json, never prompts
npm run doctor -- [--json] [--ping]     # environment and provider checks
npm run screenshots    # regenerates docs/images/*.png (see below)
```

## Code map

| Path | What lives there |
|---|---|
| `server.mjs` | The server, about 6,700 lines in one file: LaTeX block parser and display conversion, references and `.bib` reading, outline and structure, review state, comments/proposals/linked changes, chat, prompts, agent queue and process handling, LaTeX compile, undo, security checks, the route table (near the end), SSE, start-up banner. |
| `public/app.js` | The whole front end, about 6,200 lines of plain DOM code. No framework. `public/index.html`, `public/styles.css`, `public/fonts/` complete it. |
| `config.mjs` | Loads and validates `.paper-pal.json`; defaults; credential refusal; command and base-URL guards; `isInside`. |
| `agent-providers.mjs` | `PROVIDER_TABLE` (the single source of truth for backends), availability, child environments, redaction, executable lookup, `buildAgentInvocation`. |
| `api-adapter.mjs` | Stand-alone HTTP client for OpenAI-compatible and Anthropic-style endpoints: prompt on stdin, answer on stdout, retry, timeout, JSON extraction, redaction. |
| `agent-context.mjs` | Selects the related open comments that accompany an agent run. |
| `names.mjs` | Every on-disk and environment name, plus the pre-rename fallbacks. |
| `env.mjs` | `.env` parser and loader (app folder only). |
| `schemas/` | JSON Schemas of the four agent outputs. |
| `scripts/` | `setup`, `doctor`, `demo`, `check`, `reanchor-confirmations`, `screenshots`. |
| `bin/paper-pal.mjs` | `paper-pal <setup\|doctor\|start\|demo>` dispatcher. |
| `examples/sample-paper/` | Fictional manuscript used by the demo, the tests and the screenshots. |
| `tests/` | `*.test.mjs` suites, `helpers.mjs`, `portable.mjs`, `run.mjs`, `fixtures/fake-agent.mjs`. |
| `docs/` | User and reference documentation. `docs/api.md` must match the route table. |

`server.mjs` and `public/app.js` are monoliths. Do not split them as a side effect of another
change. Make the smallest edit that works, next to the related code, and search for an existing
helper before adding one.

## Testing conventions

- `node:test` and `node:assert/strict` only. No test framework, no mocking library.
- Tests start the real server on an ephemeral port (`startServer()` passes `--port 0`) against a
  temporary project (`makeProject()`), and call it over HTTP with `api()`, which sends
  `X-Paper-Pal: 1`. Never hard-code a port.
- Agent runs use `tests/fixtures/fake-agent.mjs`, a Codex-shaped CLI that upper-cases the
  selection. It needs `PAPER_PAL_ALLOW_CUSTOM_COMMANDS=1`, which the helpers set.
- API providers are tested against `startMockApi()`, a local HTTP server. No test may call a real
  provider or need a real key. Tests run with `PAPER_PAL_ENV_FILE=none`.
- Temporary files use the `paper-pal-` prefix and are removed by `cleanupAll()`.
- A bug fix comes with a test that fails without it. Parser changes need a round-trip test: the
  blocks must tile the source exactly and an edit must change only the edited construct.
- The suite runs test files concurrently. Do not share state between files.

## Style

- Plain modern JavaScript, 2 spaces, double quotes, semicolons, trailing commas in multi-line
  literals. Match the surrounding code. No TypeScript, no JSX, no decorators.
- Comments explain why, not what. Keep them current when you change the code below them.
- User-facing messages: one plain sentence that says what to do next. Say "the agent", not a
  vendor name, unless the message is about one backend.
- Errors that reach the browser go through `HttpError` or `errorResponse()`.
- Documentation: short sentences, no marketing language, every command copy-pasteable and tested.

## Adding an API provider preset

1. Add one row to `PROVIDER_TABLE` in `agent-providers.mjs`: `label`, `kind: "api"`,
   `capabilities: { readRepo: false }`, `protocol` (`openai` or `anthropic`), `baseUrl`,
   `apiKeyEnv`, `keyRequired`, and `effortStyle` only if the endpoint accepts a reasoning
   parameter. No model id. Nothing else in the app switches on a provider id.
2. Add the key variable to `.env.example` with the base URL in the comment.
3. Add an empty block to `paper-pal.config.example.json` (a test loads that file).
4. Update the "provider table" test in `tests/api.test.mjs` (the id list and the preset summary).
5. Add a section to `docs/backends.md`, and the id to the lists in `docs/configuration.md`,
   `docs/INSTALL-FOR-AGENTS.md` and `README.md`.
6. Run `npm test`. State in the PR whether you tried the provider against the live service.

An endpoint that already speaks the OpenAI protocol needs no preset: the `custom` provider covers it.

## Regenerating screenshots

`npm run screenshots` runs `scripts/screenshots.mjs` and rewrites `docs/images/*.png`: every scene
as `<name>-light.png` and `<name>-dark.png` (the READMEs pair them in `<picture>` elements), plus
`social-preview.png` from `docs/images/src/social-preview.html`. It works on
a temporary copy of the sample paper, calls no model (agent-dependent state is injected in the
browser), and cleans up after itself. The brand mark is hand-written SVG in two drawings:
`docs/images/logo.svg` (with `logo-dark.svg` for dark backgrounds), and a 32-unit version for the favicon and `.brand-mark` in
`public/index.html`. Change them together, then regenerate the images. Playwright is deliberately
not a dependency; install it for one run:

```sh
npm install --no-save playwright && npx playwright install chromium
npm run screenshots        # flags: --only <names> --theme light|dark|both --no-compile --keep
```

Run it after a visible UI change and commit the images with the change. Never take screenshots
of a real manuscript.

## PR checklist

- [ ] `npm test` passes on Node 20 or 22.
- [ ] No invariant above is weakened. If one is touched, the PR description says how and why.
- [ ] No new dependency, no build step.
- [ ] New or changed route, flag, config field or env variable is documented (`docs/api.md`,
      `docs/configuration.md`, `.env.example`, `paper-pal.config.example.json`, setup `--help`).
- [ ] `CHANGELOG.md` has an entry under "Unreleased".
- [ ] No manuscript text, keys, `.paper-pal/` content or machine-specific paths in code, tests,
      fixtures, screenshots or the PR text.
- [ ] Commit subjects are imperative and say what changed ("Reject symlinked assets outside sourceRoot").

## Security

Read [SECURITY.md](SECURITY.md) before touching request handling, child processes, path
resolution or configuration loading. Report vulnerabilities privately at
https://github.com/claire1217/paper-pal/security/advisories/new, not in a public issue.
