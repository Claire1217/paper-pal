# Security

## Reporting a vulnerability

Report it privately through GitHub's private vulnerability reporting:
https://github.com/claire1217/paper-pal/security/advisories/new

Please do not open a public issue for a suspected vulnerability, and do not
put unpublished manuscript content, credentials, `.env` contents or files from
`.paper-pal/` in any report, public or private. A minimal made-up project that
shows the problem is the most useful thing you can send.

This is a volunteer project without a guaranteed response time. The aim is to
acknowledge a report within a week and to fix confirmed problems in the next
release, with credit to the reporter unless you prefer otherwise.

## Supported versions

| Version | Supported |
|---|---|
| latest release (0.1.x) and `main` | yes |
| anything older | no |

Before 1.0 only the latest release gets security fixes. Update with
`git pull && npm install`.

## Supported use

Paper Pal is designed for one author on one trusted computer. Keep the default
`127.0.0.1` binding. Do not expose port 4317 directly to a LAN or the public
internet: the application has no authentication and accepted proposals modify
the configured manuscript files. Setting `PAPER_PAL_HOST` to a non-loopback
address prints a loud warning for that reason.

Requests are accepted only when the `Host` header names the loopback address
the server listens on, and state-changing requests must come from the page
itself (matching `Origin`) or carry the `X-Paper-Pal: 1` header with a JSON
body. This blocks DNS-rebinding and cross-site form posts from other pages in
your browser.

## API keys

- Keys are read from environment variables only. Put them in the `.env` file
  next to Paper Pal's `package.json` (git-ignored) or export them in your shell.
  See `.env.example`.
- Paper Pal never reads `.env` from the manuscript project, and refuses to
  start when the project's `.paper-pal.json` contains a field that looks like
  a credential (`apiKey`, `key`, `token`, `secret`, `password`, ...). That file
  may only name the variable (`"apiKeyEnv": "OPENAI_API_KEY"`).
- A key is handed to exactly one child process: the bundled `api-adapter.mjs`,
  and only the one variable the selected provider needs. Agent CLIs (`codex`,
  `claude`), LaTeX and git are started with every known key variable removed.
- Key values are stripped from traces, run status files, chat errors and HTTP
  error messages before anything is written or returned. `/api/health` and
  `/api/bootstrap` report only whether a provider is ready.
- A key is sent only to the provider's own endpoint, to this machine
  (`127.0.0.1`/`localhost`), or to the URL you put in `PAPER_PAL_API_BASE_URL`.
  A project file that points `baseUrl` anywhere else is rejected unless you set
  `PAPER_PAL_ALLOW_PROJECT_BASE_URL=1` yourself.
- A project file also cannot choose which secret is sent: `apiKeyEnv` may only
  name a provider key variable or a `PAPER_PAL_*_KEY` name, unless you set
  `PAPER_PAL_ALLOW_PROJECT_KEY_ENV=1` yourself.

## What a project configuration can make the app run

`.paper-pal.json` travels with the manuscript, so treat a project you did not
write like any other code you are about to run.

- `latex.command` must be one of `latexmk`, `pdflatex`, `xelatex`, `lualatex`,
  `tectonic`, `make`, unless `PAPER_PAL_ALLOW_CUSTOM_LATEX=1` is set in your
  shell or in Paper Pal's own `.env`.
- `codex.command` / `claude.command` must be a bare program name (no path, no
  spaces) unless `PAPER_PAL_ALLOW_CUSTOM_COMMANDS=1` is set the same way. Use
  `CODEX_BIN` / `CLAUDE_BIN` to point at a specific binary.
- These guards are deliberately cheap. Compiling LaTeX is itself code
  execution: `latexmk` reads a `.latexmkrc` from the project, `make` runs the
  project's Makefile, and `latex.args` are passed through as written. Set
  `latex.enabled` to `false` for a project you do not trust.

## Sensitive local data

The project's `.paper-pal/` directory (`.draft-review/` in projects created
before the rename) can contain unpublished text, comments, chat history,
proposal JSON and agent traces. Setup and the server install an inner
`.gitignore` that ignores everything, but inspect repository status before
committing or sharing a project archive.

Agent CLIs keep their own authentication; Paper Pal does not read or copy it.
With an API provider, the text of the passage, the file it sits in and the
configured guidance, terminology and (outside "local" context mode) manuscript
files are sent to that provider, up to `agent.contextBudgetChars` characters
per request.

## Sharing access

For temporary collaboration, keep the server loopback-only and use an
authenticated SSH tunnel or trusted private-network tunnel. Everyone connected
to the same running instance operates on the same files and undo stack, so only
one person should edit at a time.

Public or multi-user hosting requires a separate security design: HTTPS,
authentication, per-user workspaces and credentials, resource limits, audit
logs and backups.

## What Paper Pal does not protect against

- Another local user or process on the same machine. Anything that can reach
  `127.0.0.1:4317` and send the `X-Paper-Pal` header can use the API. There is
  no login.
- A malicious project. The guards above limit what `.paper-pal.json` can do,
  but compiling an untrusted LaTeX project runs its code.
- The backend you chose. Text you send to an API provider or through an agent
  CLI is handled under that provider's terms. A CLI agent runs with a
  read-only sandbox or tool list that Paper Pal requests, and enforcing it is
  up to that CLI.
- Prompt injection from the manuscript or its `.bib` files. A proposal is only
  text, and nothing is written until you accept it, so read the diff.

The local HTTP API and its checks are described in [docs/api.md](docs/api.md).
