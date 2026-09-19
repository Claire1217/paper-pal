# Installing Paper Pal for a user (instructions for an AI agent)

You are an AI coding agent. A user asked you to install Paper Pal and point it
at their LaTeX paper. Follow the steps in order. Every command here is
non-interactive. Each step says what to expect and what to do when it fails.

Paper Pal is a local web app. A small Node server on `127.0.0.1:4317` shows the
`.tex` source as readable prose. The author selects text and comments, an AI
backend proposes a rewrite, and the `.tex` file changes only when the author
clicks Accept. Nothing is installed globally. Two places are written to: the
clone of this repository (the "app folder") and the paper folder.

Shell: the commands assume a POSIX shell (macOS, Linux, WSL). On Windows use
WSL. Native Windows is experimental and untested.

## Step 0. Ask the user

Ask whichever of these three questions the user has not already answered (the
paper path is often in their first message). Wait for the answers before
running anything.

1. **Where is the paper?** The absolute path of the folder that holds the main
   `.tex` file.
2. **Which AI backend?** One of:
   - `codex` or `claude`: a CLI that is already installed and signed in on this
     machine (Codex CLI or Claude Code). No API key is needed. This is the
     simplest choice.
   - `openai`, `anthropic`, `openrouter`, `deepseek`: an API provider. The user
     needs an API key **and a model id**.
   - `ollama`: a local Ollama server. No key. Needs the name of a model the
     user has already pulled.
   - `custom`: any other OpenAI-compatible endpoint. Needs a base URL and a
     model id, and a key if the endpoint wants one.

   **Never invent or guess a model id.** Ask the user for it, or ask them to
   look it up in their provider's model list. A wrong id fails at the first
   request, not at setup.
3. **Compile PDFs inside Paper Pal?** This needs `latexmk` on the machine and
   writes LaTeX build files (`.aux`, `.log`, `.pdf`, ...) into the paper folder.

If the user said "just do it": use the paper path they gave, pass no
`--provider` flag (setup picks the first backend that is available, in the
order `codex`, `claude`, then the first API provider whose key is set), and
pass no compile flag (compilation is switched on only when `latexmk` is found).
The same applies when the user answers "whichever agent is installed": omit
`--provider`. If no backend is available at all, setup still exits 0, writes
`codex` as the default and reports `providerStatus.available: false` with the
reason; the app opens and works for reading and editing. Once the user has a
backend, run setup again with `--provider <id> [--model <id>] --force`.

## Step 1. Prerequisites

```sh
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' && echo "node ok: $(node -v)"
git --version
command -v latexmk || echo "latexmk not found (optional)"
```

- Expected: `node ok: v20.x` or newer, and a git version.
- `node` missing or older than 20: stop. Ask the user to install Node.js 20 or
  newer (https://nodejs.org). Do not install a system package without asking.
- `latexmk` missing: not an error. Paper Pal works without PDF compilation.
  Only ask the user to install a TeX distribution (TeX Live, MacTeX, MiKTeX)
  if they answered yes to question 3.

## Step 2. Clone and install

Clone into the user's home folder or a tools folder. **Do not clone inside the
paper's repository.**

```sh
git clone https://github.com/claire1217/paper-pal.git ~/paper-pal
cd ~/paper-pal
npm install
```

- Expected: `npm install` exits 0 and `node_modules/katex` exists. `katex` is
  the only runtime dependency, so this takes a few seconds.
- `~/paper-pal` already exists: do not delete it. Run
  `git -C ~/paper-pal pull --ff-only && npm --prefix ~/paper-pal install`
  instead, or ask the user for another folder.
- Run every later command from the app folder (`cd ~/paper-pal`).

## Step 3. API key (API providers only)

Skip this step for `codex`, `claude` and `ollama`.

```sh
cd ~/paper-pal
[ -f .env ] || cp .env.example .env
```

Then tell the user, in these words or similar:

> Open `~/paper-pal/.env` in your editor and paste your key after the matching
> name, for example `OPENAI_API_KEY=...`. Save the file and tell me when you
> are done. Do not paste the key into this chat.

Variable names: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`,
`DEEPSEEK_API_KEY`. For `custom`: `PAPER_PAL_API_BASE_URL` (the part of the URL
before `/chat/completions`, for example `https://host/v1`) and, if the endpoint
needs one, `PAPER_PAL_API_KEY`.

Rules for you:

- The user types the key. You do not ask for it, echo it, `cat` the `.env`
  file, or write it into a command line, a log, a commit or this conversation.
- A key never goes into the paper's `.paper-pal.json`. Paper Pal refuses to
  start if it finds a field named `apiKey`, `key`, `token`, `secret` or similar
  there.
- `.env` is git-ignored in the app folder. Do not force-add it.
- To check that the key is in place without reading it, use Step 5.

## Step 4. Configure the paper

Run setup with `--json`. Use `npm run --silent` (or call the script with
`node`): without `--silent`, npm prints two banner lines before the JSON.

```sh
cd ~/paper-pal
npm run --silent setup -- "/absolute/path/to/paper" --json
```

Add flags according to the answers from Step 0:

| Flag | When |
|---|---|
| `--provider <id>` | The user chose a backend: `codex`, `claude`, `openai`, `anthropic`, `openrouter`, `deepseek`, `ollama`, `custom`. |
| `--model <model-id>` | Required for every API provider, `ollama` and `custom`. Optional for `codex` and `claude` (the CLI default is used). |
| `--chat-model <model-id>` | Optional: a different model for the project chat. |
| `--main <file.tex>` | The entry point, relative to the paper folder. Usually not needed: setup uses `main.tex`, or else the one `.tex` file that has `\documentclass`. Pass it after exit code 4 or 5, or when the user named a file. |
| `--no-compile` | The user does not want PDFs. `--compile` forces it on. |
| `--review-language <name>` | Language of section reviews. Default `en`. |
| `--no-remember` | Do not make this paper the default project of the app folder. You must then pass `--repo "<paper>"` to doctor and start. |
| `--force` | Replace an existing `.paper-pal.json`. See exit code 6. |

Example with an API provider:

```sh
npm run --silent setup -- "/absolute/path/to/paper" --json --provider openai --model "<model-id>" --no-compile
```

`node scripts/setup.mjs "/absolute/path/to/paper" --json` is equivalent.

Expected result, exit code 0 (shortened):

```json
{
  "ok": true,
  "configPath": "/absolute/path/to/paper/.paper-pal.json",
  "project": "/absolute/path/to/paper",
  "defaultDocument": "main.tex",
  "mainDetectedBy": "main.tex",
  "provider": "claude",
  "providerStatus": { "decidedBy": "auto", "model": null, "available": true, "reason": null },
  "compile": true,
  "compileStatus": { "decidedBy": "auto", "latexmkFound": true },
  "stateDirectory": ".paper-pal",
  "remembered": true,
  "notes": [],
  "next": ["npm run doctor", "npm start"]
}
```

Read `providerStatus.available`. When it is `false`, `providerStatus.reason`
says what is missing (see Troubleshooting). Setup still exits 0 in that case:
the app opens, but AI actions will not work until the reason is fixed. Show
every string in `notes` to the user.

Exit codes. On failure the JSON is `{"ok": false, "error": {"code", "message", ...}}`.

| Exit | `error.code` | Meaning | What to do |
|---|---|---|---|
| 0 | - | Configuration written. | Continue with Step 5. |
| 2 | `usage` | Bad or missing flag, unknown provider id, `--source` outside the project. | Read `error.message`, fix the command, run it again. |
| 3 | `project_not_found` | The paper folder does not exist. | Ask the user for the correct path. Do not create the folder. |
| 4 | `no_main_tex` | No `.tex` file with `\documentclass` was found (searched four levels deep), or the `--main` file does not exist. | Ask the user which file is the entry point. Run again with `--main <file.tex>`. |
| 5 | `several_main_tex` | Several files could be the entry point. | Show `error.candidates` to the user, let them pick, run again with `--main <their choice>`. Do not pick for them unless they said "just do it" and one candidate is obviously the paper. |
| 6 | `config_exists` | The paper already has a `.paper-pal.json`. | Do not overwrite silently. Usually the paper is already set up: go to Step 5. Add `--force` only when the user agrees to replace the file. Comments and history in `.paper-pal/` are kept either way. |

What setup writes:

- `<paper>/.paper-pal.json`: the project configuration. No secrets. Safe to commit.
- `<paper>/.paper-pal/` with a `.gitignore` containing `*`: private state
  (comments, proposals, chat, agent traces). Never commit it.
- `~/paper-pal/paper-pal.local.json`: remembers the paper path (git-ignored).
  Not written with `--no-remember`.

## Step 5. Doctor

```sh
cd ~/paper-pal
npm run --silent doctor -- --json
```

Exit code 0 means ready. Exit code 1 means at least one required check failed.
The output is `{ "ok", "name", "version", "checks": [ { "id", "ok", "severity", "detail", "fix" } ] }`.

How to read a check:

- `severity` says how much a **failure** of that check matters. It is set even
  when the check passed.
- `ok: false` with `severity: "error"`: must be fixed. `fix` says how. These
  are the only checks that make the exit code 1.
- `ok: false` with `severity: "warn"`: worth telling the user, not blocking.
- `ok: false` with `severity: "info"`: an optional backend that is not set up.
  Ignore it. A normal run has several of these.

Check ids, in order: `node`, `katex`, `env-file`, `config`, `main-document`,
`latex`, then `provider:<id>` for each of the eight backends. Only the default
backend is required (`severity: "error"`).

Typical failures:

| Check | Fix |
|---|---|
| `katex` | Run `npm install` in the app folder. |
| `config` | The message says why. No configuration: run Step 4. A credential-like field, a custom `latex.command`, or a non-local `baseUrl` in `.paper-pal.json`: show the message to the user; do not set a `PAPER_PAL_ALLOW_*` switch on your own. |
| `latex` | `latexmk` is missing but compilation is on. Ask the user: install a TeX distribution, or run Step 4 again with `--no-compile --force`. |
| `provider:<default>` | `fix` holds the reason. See "Not ready" in Troubleshooting. |

Optional: `npm run --silent doctor -- --json --ping` also sends one real
request (one output token) to each API provider that is ready, and adds
`ping:<id>` checks. It catches a wrong key, base URL or model id. It costs a
small amount of money on a paid provider, so ask the user first. For `ollama`
it is free. The plain doctor already adds a `reach:ollama` check (severity
`warn`, never fails the run) that says whether anything answers at the local
base URL; `--ping` also confirms that the model can be loaded.

If you used `--no-remember`, add `--repo "/absolute/path/to/paper"` after `--`.

## Step 6. Start the server

The server runs in the foreground until it is stopped. Pick one:

**A. Tell the user to run it** (preferred when you cannot keep a background
process alive):

```sh
cd ~/paper-pal && npm start -- --open
```

**B. Start it in the background yourself.** Call `node` directly so that the
process id is the server's, not npm's:

```sh
cd ~/paper-pal
nohup node server.mjs > paper-pal.log 2>&1 &
echo $! > "${TMPDIR:-/tmp}/paper-pal.pid"
sleep 2
cat paper-pal.log
```

Expected log:

```text
Paper Pal 0.1.0 is running at http://127.0.0.1:4317
  Project:  <title> (main.tex)
  Folder:   /absolute/path/to/paper
  Agent:    <backend> - ready
  PDF:      latexmk found
  Press Ctrl+C to stop.
```

- `Port 4317 is already in use...` (exit code 1): another instance or another
  program has the port. Check `curl -s http://127.0.0.1:4317/api/health`. If
  it answers with `"name":"paper-pal"` and the right project title, Paper Pal
  is already running. Otherwise add a port to the start command
  (`npm start -- --port 4318`, or `node server.mjs --port 4318`; `--port 0`
  picks any free port and prints it) and use that port everywhere below.
- If you ran setup with `--no-remember`, also add
  `--repo "/absolute/path/to/paper"` to the start command.
- If the log is still empty after two seconds, keep retrying the health check
  in Step 7 for about 10 seconds before treating the start as failed.
- A configuration error is printed and the process exits: run Step 5.
- Flags: `--port <n>`, `--repo <dir>`, `--config <file>`, `--open`.

## Step 7. Verify

```sh
curl -s http://127.0.0.1:4317/api/health
```

Expected (shortened):

```json
{
  "ok": true,
  "name": "paper-pal",
  "version": "0.1.0",
  "project": { "title": "my-paper", "defaultDocument": "main.tex" },
  "latex": { "enabled": true, "available": true },
  "providers": [
    { "id": "codex", "label": "Codex", "kind": "cli", "available": false, "reason": "codex CLI not found on PATH. Install it, or set CODEX_BIN in .env." },
    { "id": "claude", "label": "Claude", "kind": "cli", "available": true, "reason": null }
  ],
  "defaultProvider": "claude"
}
```

Pass criteria, all four:

1. `ok` is `true` and `name` is `"paper-pal"`.
2. `project.defaultDocument` is the file the user expects.
3. The entry of `providers` whose `id` equals `defaultProvider` has
   `"available": true`.
4. If the user wants PDFs: `latex.enabled` and `latex.available` are both `true`.

Other providers with `"available": false` are normal.

No answer (curl exit code 7): the server is not running; read `paper-pal.log`.
`{"error":"This server only answers requests addressed to its own local address."}`
(HTTP 421): use `127.0.0.1` or `localhost` in the URL, nothing else.

`available: true` means "configured". For an API provider it does not prove
that the key and the model id are accepted. Only `doctor --ping` or the first
real comment does.

## Step 8. Report back to the user

Fill in and send this:

```text
Paper Pal is running at http://127.0.0.1:<port>      (or: is installed; start it with the command below)
Project: <title> (<defaultDocument>) in <paper folder>
AI backend: <label>[, model <id>] - ready            (or: not ready - <reason>, and what you need to do;
                                                      for an API provider say "configured, not yet tried with a real request")
PDF compilation: on / off

Written to your paper folder:
  .paper-pal.json   project settings, no secrets, safe to commit
  .paper-pal/       private review state (comments, chat, traces); it ignores itself in git, do not commit or share it
App folder: ~/paper-pal   (your API key, if any, is in ~/paper-pal/.env and nowhere else)

Your .tex files change only on your own action in the page: Accept on a proposal, your own edit of a paragraph, resolving a tracked change, or Undo/Revert.

Stop:      Ctrl+C in the terminal that runs it      (or: kill "$(cat "${TMPDIR:-/tmp}/paper-pal.pid")")
Start:     cd ~/paper-pal && npm start [-- <the same --port / --repo flags you used>]
Update:    cd ~/paper-pal && git pull && npm install
Uninstall: stop the server, delete ~/paper-pal; to remove all traces from the paper also delete .paper-pal.json and .paper-pal/ (this deletes your comments and chat history)
```

Also tell the user which text leaves their machine: with an API provider or a
CLI agent, the passages they comment on and surrounding manuscript text are
sent to that provider. With `ollama` everything stays local.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Port 4317 is already in use. Stop the existing Paper Pal instance or start with --port <number>.` | Start with `--port <n>` (or set `PAPER_PAL_PORT` in `.env`). `--port 0` picks a free port and prints it. |
| HTTP 421, `This server only answers requests addressed to its own local address.` | The URL used a host name other than `127.0.0.1`, `localhost` or `[::1]`. Use `http://127.0.0.1:<port>`. |
| HTTP 403, `State-changing requests must carry the X-Paper-Pal: 1 header.` | A scripted POST needs `-H 'X-Paper-Pal: 1'` and a JSON body with `Content-Type: application/json`. The page does this by itself. |
| `No Paper Pal configuration (.paper-pal.json) was found at ...` | Run Step 4, or pass `--repo "<paper>"`. |
| Setup exit 5, several main files | Show `error.candidates`, rerun with `--main <file.tex>`. |
| `latexmk was not found on PATH` | Install a TeX distribution, or rerun setup with `--no-compile --force`. |
| PDF figures show no inline preview | Inline previews of `.pdf` figures need `pdftoppm` (poppler) or macOS `sips`. The figure still opens on click. |
| The paper has `.draft-review.json` or `.draft-review/` | Files from before the rename. They are read automatically. Setup writes a new `.paper-pal.json`, which takes precedence, and keeps using the existing state folder. |
| Windows | Experimental and untested. Prefer WSL. |

"Not ready" reasons (exact strings from setup, doctor, the start banner and
`/api/health`) and their fixes:

| Reason | Fix |
|---|---|
| `codex CLI not found on PATH. Install it, or set CODEX_BIN in .env.` | The user installs and signs in to Codex CLI, or puts the full path of the binary in `CODEX_BIN` in `~/paper-pal/.env`. Or choose another backend: rerun setup with `--provider <id> --force`. |
| `claude CLI not found on PATH. Install it, or set CLAUDE_BIN in .env.` | Same, with Claude Code and `CLAUDE_BIN`. |
| `Set OPENAI_API_KEY in .env.` (same for `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`) | Step 3. Restart the server afterwards: `.env` is read at start. |
| `Set <provider>.model in .paper-pal.json.` | Ask the user for the model id. Rerun setup with `--provider <id> --model "<model-id>" --force`, or add `"<provider>": { "model": "<model-id>" }` to `.paper-pal.json`. Restart the server. |
| `Set PAPER_PAL_API_BASE_URL in .env.` | Provider `custom` needs its base URL in `~/paper-pal/.env`. |
| `Agent features are switched off (agent.enabled is false in .paper-pal.json).` | Set `agent.enabled` to `true` if the user wants AI features. |

The server reads `.env` and `.paper-pal.json` once, at start. Restart it after
changing either.

## Trying it without a paper

```sh
cd ~/paper-pal
npm run demo
```

This copies the bundled sample paper to a temporary folder, configures it
there and starts the server on port 4317 (`npm run demo -- --port 4318 --open`
to change that). The copy is deleted when the server stops; `--keep` keeps it.
It works with no backend at all: the page loads and AI actions say what is
missing.

## Safety rules for you, the agent

- Keep the server on loopback. Do not set `PAPER_PAL_HOST=0.0.0.0` or any
  other non-loopback address, do not open the port in a firewall, and do not
  put a public tunnel or reverse proxy in front of it. The app has no login,
  and whoever reaches it can edit the manuscript and spend the user's API
  credit.
- Do not commit `.env`, `paper-pal.local.json` or anything under `.paper-pal/`.
- Do not set `PAPER_PAL_ALLOW_CUSTOM_LATEX`, `PAPER_PAL_ALLOW_CUSTOM_COMMANDS`
  or `PAPER_PAL_ALLOW_PROJECT_BASE_URL` unless the user asks for it and
  understands that the switch lets a project file choose which program runs
  or where the API key is sent.
- Do not paste manuscript text, keys or files from `.paper-pal/` into issues,
  logs or chats outside this session.
- Do not edit the user's `.tex` files as part of installation.
- Do not run `doctor --ping` against a paid provider without asking.

More detail: [configuration](configuration.md), [backends](backends.md),
[local HTTP API](api.md), [LaTeX conventions](latex-conventions.md),
[security](../SECURITY.md).
