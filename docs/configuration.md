# Configuration

Paper Pal is configured by one JSON file per paper and a few environment
variables. `npm run setup -- <paper-dir>` writes a working file; this page
describes every field so you can edit it by hand.

The server reads its configuration once, at start. Restart it after a change.

## Where things live

| What | Path | Commit it? | Contents |
|---|---|---|---|
| Project configuration | `<paper>/.paper-pal.json` | Yes, safe | Entry point, LaTeX command, default backend, model ids. Never a key. |
| Private state | `<paper>/.paper-pal/` | **No** | `state.json` (review marks), `undo.json`, `requests/` (comments and proposals), `runs/` (agent traces), `chat/`, `structure-plan.json`, `cache/`. Holds unpublished text. Setup and the server write a `.gitignore` containing `*` into it. |
| Remembered project | `<app>/paper-pal.local.json` | No (git-ignored) | `{ "repo": "/absolute/path/to/paper" }`, written by setup unless `--no-remember`. |
| Keys and machine settings | `<app>/.env` | No (git-ignored) | API keys, CLI paths, port, trust switches. Copy `.env.example`. |

`<app>` is the folder that contains Paper Pal's `package.json`. `<paper>` is
your manuscript folder.

## Which project and which file are used

Project folder, first match wins:

1. `--repo <dir>` on the command line.
2. The path in `<app>/paper-pal.local.json`.
3. The current working directory.

Configuration file: `--config <file>` if given, otherwise
`<project>/.paper-pal.json`.

Port: `--port <n>`, then `PAPER_PAL_PORT`, then `4317`. `0` means any free
port; the real one is printed.

Environment: a variable set in your shell wins over the same variable in
`<app>/.env`. An empty value counts as unset. A `.env` file inside the paper
folder is never read.

## Minimal example

Every field has a default, so this is a valid configuration for a paper whose
entry point is `main.tex`, using the Codex CLI:

```json
{
  "defaultDocument": "main.tex"
}
```

A small configuration for an API provider:

```json
{
  "title": "My Paper",
  "defaultDocument": "paper.tex",
  "latex": { "enabled": false },
  "agent": { "provider": "openai" },
  "openai": { "model": "<model-id>" }
}
```

Replace `<model-id>` with an id from your provider's model list. Paper Pal
ships no model ids.

## Fields

### Project

| Field | Default | Notes |
|---|---|---|
| `title` | folder name | Shown in the page and the start banner. |
| `projectLabel` | `"Local manuscript"` | Small label under the title. Setup writes `"Local LaTeX project"`. |
| `sourceRoot` | `"."` | Relative to the project. Paper Pal reads and writes `.tex` files only below this folder. Absolute paths and `..` are rejected. |
| `defaultDocument` | `"main.tex"` | The entry point, relative to the project, inside `sourceRoot`. Must exist. `\input` and `\include` are followed from here. |
| `pdf` | `defaultDocument` with `.pdf` | The compiled PDF shown in the page. |
| `ui.initialDocument` | `defaultDocument` | File opened first. Must exist inside `sourceRoot`. |
| `ui.hiddenDocuments` | `[]` | Relative paths left out of the file list. |
| `approvedDocuments` | `[]` | Relative paths of files whose blocks start as "confirmed" instead of "draft". |

### `latex`

| Field | Default | Notes |
|---|---|---|
| `latex.enabled` | `true` | Setup writes `true` only when `latexmk` is on `PATH`. With `false`, nothing is compiled. |
| `latex.cwd` | folder of `defaultDocument` | Working directory of the compile. Must exist when compilation is enabled. The `.aux` file found here supplies reference and citation numbers. |
| `latex.command` | `"latexmk"` | One of `latexmk`, `pdflatex`, `xelatex`, `lualatex`, `tectonic`, `make`. Anything else needs `PAPER_PAL_ALLOW_CUSTOM_LATEX=1`. |
| `latex.args` | `["-pdf", "-interaction=nonstopmode", "-halt-on-error", "<main file name>"]` | Passed as written. |

### `agent` (applies to every backend)

| Field | Default | Notes |
|---|---|---|
| `agent.enabled` | `true` | `false` switches all AI features off. The legacy `codex.enabled: false` does the same. |
| `agent.provider` | `"codex"` | Default backend: `codex`, `claude`, `openai`, `anthropic`, `openrouter`, `deepseek`, `ollama`, `custom`. An unknown id is a start-up error. |
| `agent.allowOverride` | `true` | Lets the page pick another backend or one of its listed models for a single request. |
| `agent.autoProcessComments` | `true` | Send a new comment to the agent immediately. |
| `agent.promptMode` | `"minimal"` | `"full"` sends the longer prompt. |
| `agent.reasoningEffort` | `"low"` | For comments in "local" and "smart" context mode. See [backends](backends.md#reasoning-effort). |
| `agent.timeoutMs` | `90000` | Same scope. |
| `agent.projectReasoningEffort` | `"medium"` | For comments in "project" context mode and for section reviews. |
| `agent.projectTimeoutMs` | `180000` | Same scope. |
| `agent.chatReasoningEffort` | `"medium"` | Project chat. |
| `agent.chatTimeoutMs` | `300000` | Project chat. |
| `agent.chatConcurrency` | `1` | Chat turns that may run at once. Minimum 1. |
| `agent.reviewLanguage` | `"en"` | Language of section reviews. A code or a name: `"zh"`, `"German"`. |
| `agent.contextBudgetChars` | `120000` | Upper bound on project text inlined into one prompt for API providers. Minimum 2000. Not used by CLI agents. |
| `agent.entryPoints` | `[]` | Files a CLI agent is told to start reading from. Setup writes `[defaultDocument]`. |
| `agent.guidanceFiles` | whichever of `AGENTS.md`, `CLAUDE.md` exist in the paper folder | Writing guidance for the agent. Inlined for API providers. |
| `agent.terminologyFiles` | `[]` | Project vocabulary sent with every task. Nothing is loaded implicitly. |

All paths are relative to the project folder.

### CLI backends: `codex`, `claude`

| Field | Default | Notes |
|---|---|---|
| `codex.command`, `claude.command` | `"codex"`, `"claude"` | A bare program name only. For a specific binary set `CODEX_BIN` or `CLAUDE_BIN` in `.env`. A path here needs `PAPER_PAL_ALLOW_CUSTOM_COMMANDS=1`. |
| `<cli>.model` | none | Empty means the CLI's own default model. |
| `<cli>.chatModel` | `<cli>.model` | Model for the project chat. |
| `<cli>.models` | `[]` | Extra ids offered in the page's model menu. |
| `claude.permissionMode` | none | Passed as `--permission-mode`. |
| `claude.allowedTools` | `[]`, meaning `Read`, `Glob`, `Grep` | Passed as `--allowedTools`. `Write`, `Edit`, `NotebookEdit` and `Bash` are always disallowed. |

### API backends: `openai`, `anthropic`, `openrouter`, `deepseek`, `ollama`, `custom`

| Field | Default | Notes |
|---|---|---|
| `<api>.model` | none | **Required.** Without it the backend is "not ready". |
| `<api>.chatModel` | `<api>.model` | Model for the project chat. |
| `<api>.models` | `[]` | Extra ids offered in the page's model menu. |
| `<api>.baseUrl` | the preset | May only be the preset's own URL or a loopback address (`127.0.0.1`, `localhost`, `::1`). Anything else needs `PAPER_PAL_ALLOW_PROJECT_BASE_URL=1`. For other hosts use the `custom` backend. |
| `<api>.apiKeyEnv` | the preset | The **name** of the environment variable that holds the key. |
| `<api>.protocol` | `"openai"` (`"anthropic"` for `anthropic`) | `"openai"` or `"anthropic"`. |
| `<api>.maxTokens` | `anthropic` protocol: 8192. `openai` protocol: not sent. | Positive integer. |

Presets are listed in [backends](backends.md#presets).

### Credentials are refused

A field named `apiKey`, `api_key`, `api-key`, `key`, `token`, `secret`,
`password`, `authorization`, `accessToken`, `authToken` or `bearer` with a
non-empty value, anywhere in the file, stops start-up. The error names the
field, not the value. Put keys in `<app>/.env`.

## Full example

This is `paper-pal.config.example.json` from the repository. Empty strings and
empty lists mean "use the default".

```json
{
  "title": "My Paper",
  "projectLabel": "Local LaTeX project",
  "sourceRoot": ".",
  "defaultDocument": "main.tex",
  "pdf": "main.pdf",
  "latex": {
    "enabled": true,
    "cwd": ".",
    "command": "latexmk",
    "args": ["-pdf", "-interaction=nonstopmode", "-halt-on-error", "main.tex"]
  },
  "agent": {
    "enabled": true,
    "provider": "codex",
    "allowOverride": true,
    "autoProcessComments": true,
    "promptMode": "minimal",
    "reasoningEffort": "low",
    "timeoutMs": 90000,
    "projectReasoningEffort": "medium",
    "projectTimeoutMs": 180000,
    "chatReasoningEffort": "medium",
    "chatTimeoutMs": 300000,
    "chatConcurrency": 1,
    "reviewLanguage": "en",
    "contextBudgetChars": 120000,
    "entryPoints": ["main.tex"],
    "guidanceFiles": ["AGENTS.md", "CLAUDE.md"],
    "terminologyFiles": []
  },
  "codex": { "command": "codex", "model": "", "chatModel": "", "models": [] },
  "claude": {
    "command": "claude", "model": "", "chatModel": "", "models": [],
    "permissionMode": "", "allowedTools": []
  },
  "openai": { "model": "", "chatModel": "", "models": [] },
  "anthropic": { "model": "", "chatModel": "", "models": [], "maxTokens": 8192 },
  "openrouter": { "model": "", "chatModel": "", "models": [] },
  "deepseek": { "model": "", "chatModel": "", "models": [] },
  "ollama": { "model": "", "chatModel": "", "models": [], "baseUrl": "http://127.0.0.1:11434/v1" },
  "custom": { "model": "", "chatModel": "", "models": [], "protocol": "openai", "apiKeyEnv": "PAPER_PAL_API_KEY" },
  "ui": { "initialDocument": "main.tex", "hiddenDocuments": [] },
  "approvedDocuments": []
}
```

## Environment variables

Set them in your shell or in `<app>/.env`.

| Variable | Meaning |
|---|---|
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY` | Key of the backend with the same name. |
| `PAPER_PAL_API_BASE_URL` | Base URL of the `custom` backend: the part before `/chat/completions` (or before `/v1/messages` with `"protocol": "anthropic"`). |
| `PAPER_PAL_API_KEY` | Key of the `custom` backend. Optional. |
| `CODEX_BIN`, `CLAUDE_BIN` | Full path of the CLI when it is not on `PATH`. |
| `PAPER_PAL_HOST` | Bind address. Default `127.0.0.1`. Keep it. A generic `HOST` variable is ignored. |
| `PAPER_PAL_PORT` | Port. Default `4317`. `--port` wins. |
| `PAPER_PAL_ENV_FILE` | Shell only: path of another env file, or `none` to load no file. |

`.env` syntax: `KEY=VALUE`, optional `export` prefix, `'single'` quotes
(literal), `"double"` quotes (`\n`, `\r`, `\t`, `\\`, `\"` are understood),
`#` comment lines, and ` # trailing comments` after an unquoted value.

### Trust switches

`.paper-pal.json` is usually committed with the paper, and you may open a
paper that someone else configured. By default that file therefore cannot make
Paper Pal run an arbitrary program or send your key to another host. Each
switch below lifts one restriction. They are read from your shell or
`<app>/.env`, never from the project. Set one to `1` only for projects you
wrote or trust.

| Switch | Lifts |
|---|---|
| `PAPER_PAL_ALLOW_CUSTOM_LATEX=1` | `latex.command` may be any program. |
| `PAPER_PAL_ALLOW_CUSTOM_COMMANDS=1` | `codex.command` and `claude.command` may be paths or contain spaces. |
| `PAPER_PAL_ALLOW_PROJECT_BASE_URL=1` | `<api>.baseUrl` may name a non-local host other than the preset. |
| `PAPER_PAL_ALLOW_PROJECT_KEY_ENV=1` | `<api>.apiKeyEnv` may name any environment variable. Without it, only a provider key variable (`OPENAI_API_KEY`, ...) or a `PAPER_PAL_*_KEY` name is accepted, because that variable's value is sent to the API host. |

These guards are cheap by design. Compiling LaTeX already runs project-chosen
code (`.latexmkrc`, a Makefile, `latex.args`). Set `latex.enabled` to `false`
for a project you do not trust. See [SECURITY.md](../SECURITY.md).

## Legacy names from "Draft Review"

Paper Pal was a private tool called Draft Review. Old names are still read, so
an existing project keeps working without migration. The new name always wins
when both exist. Setup writes only new names.

| Current | Read as a fallback |
|---|---|
| `<paper>/.paper-pal.json` | `<paper>/.draft-review.json` |
| `<paper>/.paper-pal/` | `<paper>/.draft-review/` (kept in place and used as is; no second folder is created) |
| `<app>/paper-pal.local.json` | `<app>/review.local.json` |
| `PAPER_PAL_HOST` | `DRAFT_REVIEW_HOST` |
| `agent.*` settings | the same names under `codex.*` |
| browser `localStorage` keys `paper-pal.*` | keys starting with `draft-review.` are migrated on first load |

To finish a migration by hand: rename `.draft-review.json` to
`.paper-pal.json` and `.draft-review/` to `.paper-pal/` while the server is
stopped. See the [changelog](../CHANGELOG.md) for behaviour that changed.
