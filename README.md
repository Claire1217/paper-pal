<div align="center">

<img src="docs/images/logo.svg" width="64" alt="Paper Pal logo">

# Paper Pal

**Review every AI edit before it touches your LaTeX.**

A local web app for writing papers. Comment on a passage, get a proposed rewrite as a word-level diff,<br>
and nothing is written to your `.tex` files until you click **Accept**.

[![License: MIT](https://img.shields.io/badge/license-MIT-2d6a4f?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/github/actions/workflow/status/claire1217/paper-pal/ci.yml?branch=main&style=flat-square&label=tests)](https://github.com/claire1217/paper-pal/actions/workflows/ci.yml)
[![Node 20+](https://img.shields.io/badge/node-%E2%89%A5%2020-2d6a4f?style=flat-square)](https://nodejs.org)
[![Local first](https://img.shields.io/badge/local--first-no%20telemetry-2d6a4f?style=flat-square)](#privacy-and-safety)

<strong>English</strong> · <a href="./README.zh-CN.md">简体中文</a> &nbsp;|&nbsp; [How it works](#how-it-works) · [Quick start](#quick-start) · [Agent install](#let-your-ai-agent-install-it) · [Backends](#choose-your-ai-backend) · [Privacy](#privacy-and-safety) · [FAQ](#faq)

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-dark.png">
  <img src="docs/images/hero-light.png" alt="Paper Pal. Left: the paper's outline with review progress. Middle: the manuscript shown as prose, with a proposed edit inline as a red and green diff. Right: the comment that asked for it, with Accept and Reject buttons.">
</picture>

<p align="center"><sub>The manuscript in the screenshots is fictional. It ships in <a href="examples/sample-paper">examples/sample-paper</a>, and <code>npm run demo</code> opens it.</sub></p>


## What it is

Paper Pal opens your LaTeX project in the browser and shows the source as readable prose, with math, citations and cross-references rendered. You select a passage and say what is wrong with it; the AI you already use answers with a rewrite, shown as a diff against your words. Every write to a `.tex` file is a click of yours.

<table>
<tr>
<th width="50%">Pasting into a chat window, or letting an editor agent loose</th>
<th width="50%">Paper Pal</th>
</tr>
<tr>
<td valign="top">

- Paste a paragraph out, paste the answer back, hope no `\cite` or `\ref` got lost
- The model rewrites sentences you never asked about
- You read a line diff of raw markup to find the one clause that changed
- No record of which passages you have actually checked

</td>
<td valign="top">

- Comment on the exact words; the edit maps back to that exact span of source
- Each change arrives as a red/green word diff that you accept or reject
- You read prose, and the `.tex` stays the source of truth
- Text you have confirmed turns full-contrast, unread text stays grey, and the outline shows progress per section

</td>
</tr>
</table>

## How it works

**1. Select and comment.** Pick anything from two words to several paragraphs and write what you want: tighten this, soften that claim, is this consistent with Section 4? The selection maps to exact source offsets, through math, citations and macros.

<p><img src="docs/images/comment-light.png" alt="Two sentences selected in the abstract, with the comment composer open and a half-typed comment."></p>

**2. Review the diff.** The proposal appears inline in the manuscript and in the comment card, with a one-line rationale. Accept it, reject it, regenerate it, or reply to steer it.

<p>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/diff-dark.png">
  <img src="docs/images/diff-light.png" alt="A proposed rewrite shown twice: inline in the manuscript as struck-through red and underlined green text, and as before and after rows in the comment card, above Reject and Accept buttons.">
</picture>
</p>

<table>
<tr>
<td width="50%" valign="top">
<p><b>3. Ask for a review.</b> <i>Review file</i> reads the file like a referee. You triage the findings; the ones you keep become ordinary comments.</p>
<img src="docs/images/review-light.png" width="380" alt="Findings from a whole-file review, each of which can be kept as a comment.">
</td>
<td width="50%" valign="top">
<p><b>4. Ask about the paper.</b> Chat answers questions about the project. A reply can become a proposal; chat itself never edits.</p>
<img src="docs/images/chat-light.png" width="380" alt="Project chat answering a question about the paper.">
</td>
</tr>
</table>

## Quick start

Clone it anywhere outside your paper's repository. You need [Node.js](https://nodejs.org) 20 or newer, a current desktop browser, and macOS or Linux (Windows: see the [FAQ](#faq)). `latexmk` is optional: it drives the PDF pane and supplies `\ref` numbers.

```bash
git clone https://github.com/claire1217/paper-pal.git ~/paper-pal && cd ~/paper-pal && npm install
npm run setup -- /path/to/your/paper      # finds your main .tex, writes .paper-pal.json
npm start                                 # then open http://127.0.0.1:4317
```

No paper at hand? `npm run demo -- --open` serves a throwaway copy of the sample paper at the same address and deletes it when you stop. It needs no LaTeX, no AI backend and no key.

`npm run doctor` lists what is ready and what is missing, with the fix for each item.

<details>
<summary>Updating, switching papers, uninstalling</summary>

- **Update:** `git pull && npm install` in the Paper Pal folder.
- **Another paper:** run `npm run setup -- /path/to/other/paper` once, or start on it directly with `npm start -- --repo /path/to/other/paper`. Another port: `npm start -- --port 4400`.
- **Uninstall:** delete the Paper Pal folder. In each paper, `.paper-pal.json` (settings, no secrets) and `.paper-pal/` (your comments and chats) can be deleted too. Nothing is installed elsewhere.

</details>

## Let your AI agent install it

Prefer to delegate? Paste this into Claude Code, Codex, Cursor or any coding agent. Setup never prompts, prints JSON and uses documented exit codes, and the server has a health endpoint, so the agent can check its own work.

```text
Install and set up Paper Pal for my LaTeX paper by following
https://raw.githubusercontent.com/claire1217/paper-pal/main/docs/INSTALL-FOR-AGENTS.md
My paper is at: <path to your paper folder>
Ask me before choosing an AI backend, and never ask me to paste an API key into this chat.
```

<details>
<summary>For agents: what that guide contains</summary>

[docs/INSTALL-FOR-AGENTS.md](docs/INSTALL-FOR-AGENTS.md) is a numbered procedure: what to ask the user first, prerequisites, clone and install, where the user puts an API key (`.env`; never the chat, never the project config), `setup --json` and the reaction to every exit code, `doctor --json`, starting the server, verifying with `GET /api/health`, and a report template. [AGENTS.md](AGENTS.md) covers working on the codebase. [llms.txt](llms.txt) indexes the docs.

</details>

## Choose your AI backend

Use a command-line agent you are already signed in to (it comes with your Claude or ChatGPT plan, no key needed), or an API key. You can pick the backend per comment.

<table><tr><td valign="top">

| Backend | You need |
|---|---|
| **Claude Code** `claude` | the CLI, signed in |
| **Codex CLI** `codex` | the CLI, signed in |
| **OpenAI** `openai` | `OPENAI_API_KEY` + model id |
| **Anthropic** `anthropic` | `ANTHROPIC_API_KEY` + model id |
| **OpenRouter** `openrouter` | `OPENROUTER_API_KEY` + model id |
| **DeepSeek** `deepseek` | `DEEPSEEK_API_KEY` + model id |
| **Ollama** `ollama` | Ollama running + model name |
| **Custom** `custom` | any OpenAI-compatible URL |

</td>
<td width="300" valign="top"><img src="docs/images/backends-light.png" width="280" alt="The backend picker: command-line agents and API providers, with backends that are not ready saying what is missing."></td>
</tr></table>

> [!NOTE]
> **Status: 0.1, first public release.** Paper Pal has been the author's daily writing tool on macOS with Claude Code, so that path is the well-trodden one. The other backends follow each vendor's documentation and pass the automated suite against mock servers; they have not been run against the live services yet, and reports are welcome. `custom` covers LM Studio, vLLM, Groq and similar gateways.

The two CLI agents run read-only inside your paper's folder and can look at your notes, data or code when a comment needs it. API providers cannot open files, so Paper Pal sends them the file you are editing, your guidance files, and the rest of the manuscript up to a size budget.

Keys live in one place, a git-ignored `.env` in the Paper Pal folder:

```bash
[ -f .env ] || cp .env.example .env   # then put your key after OPENAI_API_KEY=
npm run setup -- /path/to/paper --provider openai --model <model-id> --force
# --force replaces the existing .paper-pal.json
```

No default model ids ship with Paper Pal, because they go stale; take one from your provider's model list. Keys are never read from a project's config file, never passed to the CLI agents or to LaTeX, and are redacted from run traces and error messages. What exactly is sent to each backend: [docs/backends.md](docs/backends.md).

## Privacy and safety

- The server binds to `127.0.0.1`, checks the `Host` header against DNS rebinding, and refuses state-changing requests from any other origin. No accounts, no analytics.
- The page loads its scripts, styles and fonts from your machine. The one exception is a cited paper's PDF, fetched from its own URL when you click *Load PDF preview*.
- Your text goes only to the backend you pick, under your own account and that provider's terms. With Ollama nothing leaves your machine.
- Agents run read-only. Source files change through your own edits, the proposals you accept, and Undo, and only inside the project's `sourceRoot`.
- Comments, chats and run traces live in `<paper>/.paper-pal/`, which ignores itself in git. `.paper-pal.json` holds no secrets and is safe to commit.
- Other people's LaTeX can run code when compiled, with or without Paper Pal. Read [SECURITY.md](SECURITY.md) before opening a project you did not write.

## Features

- **Prose view of real LaTeX.** Multi-file projects (`\input`, `\include`, `\subfile`, `\import`), sections, lists, theorems, footnotes, KaTeX math with your own macros, natbib and biblatex citations with a `.bib` preview, `\ref` numbers from the `.aux` file. Figures, tables, code listings and TikZ are shown as read-only blocks.
- **Exact source mapping.** Each block maps to a character range in a `.tex` file. An accepted edit replaces that range and nothing else; CRLF line endings and a byte-order mark are kept as they are. Files must be UTF-8; anything else opens read-only.
- **Direct editing** with autosave and undo. If the file also changed on disk (your editor, git, a co-author's sync), the two edits are merged, and you are asked when they overlap.
- **Linked changes.** When a rewrite would leave another passage inconsistent, the agent can propose those edits too, and you confirm them as a set.
- **Review progress.** Confirm paragraphs or whole sections as you read them; the outline shows how much of each section is done.
- **Structure mode** for reorganising a section: agree on a paragraph plan first, then rewrite paragraph by paragraph.
- **PDF pane** that recompiles with `latexmk` after accepted changes. Light and dark themes.

Reference: [configuration](docs/configuration.md) · [LaTeX support and limits](docs/latex-conventions.md) · [backends](docs/backends.md) · [local HTTP API](docs/api.md) · [changelog](CHANGELOG.md)

## FAQ

<details open>
<summary><b>Will it mangle my source?</b></summary>

An accepted proposal replaces one mapped range and leaves everything else alone. The test suite edits every editable block of a multi-file test manuscript, more than 120 edits, and checks that nothing else changed; a fuzz test feeds the parser truncated and mutated files. Keep your paper in git anyway. Paper Pal never commits for you, so `git diff` always shows exactly what changed.
</details>

<details>
<summary><b>How is this different from Cursor or Copilot on a <code>.tex</code> file, Overleaf's AI features, or pasting into a chat?</b></summary>

An editor agent writes to the file first and shows you a line diff of markup afterwards. Hosted writing assistants run in someone else's cloud with their choice of model. A chat window knows nothing about your files. Paper Pal shows prose instead of markup, gives word-level diffs, writes nothing before you accept, runs locally with the model you choose, and remembers which passages you have read.
</details>

<details>
<summary><b>Can I use it on my thesis?</b></summary>

With a caveat: `\chapter` and `\part` are shown as text and do not enter the outline yet, so navigation is per file rather than per chapter. Everything else works on book-length projects.
</details>

<details>
<summary><b>Does it work with Overleaf?</b></summary>

Paper Pal works on local files. With Overleaf's Git integration or GitHub sync you can keep a local clone, run Paper Pal on it, and push. Both are paid Overleaf features; on a free plan, download the project, work locally, and upload the changed files.
</details>

<details>
<summary><b>Do I need LaTeX installed?</b></summary>

No. Reading, commenting, diffs and editing work without it. `latexmk` is needed for the PDF pane and for `\ref` numbers, which come from the `.aux` file.
</details>

<details>
<summary><b>What does it cost?</b></summary>

Paper Pal is free. The backend is billed by its provider under your account. With an API provider, a comment sends the instructions, the file you are editing, and by default the rest of the manuscript up to `agent.contextBudgetChars` (120,000 characters). To spend less, choose *Current paragraph only* in the composer's options or lower the budget. Ollama costs nothing.
</details>

<details>
<summary><b>Papers that are not in English?</b></summary>

Files must be UTF-8. CJK manuscripts render, and `agent.reviewLanguage` sets the language the reviewer writes in (`"en"`, `"Chinese"`, `"German"`, ...) independently of the manuscript's language.
</details>

<details>
<summary><b>Windows?</b></summary>

Experimental and untested by the maintainer. CI runs the suite on Windows, but those jobs are allowed to fail without failing the build. WSL is the safer choice for now.
</details>

<details>
<summary><b>My template renders oddly.</b></summary>

Unknown macros fall back to their argument text and unusual environments to read-only blocks, so the worst case should look plain, not broken. If something is hidden or shown as junk, please open an issue with a minimal snippet, not your unpublished text.
</details>

## Roadmap

Splitting the two large source files into modules, `\chapter` support, an editable title block, footnote numbering, a settings screen for backends, and a packaged release so installing does not need git.

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has the development setup, and [AGENTS.md](AGENTS.md) lists the invariants a change must not break, whether a person or an agent writes it. Please never paste unpublished manuscript text or API keys into an issue.

## Credits and citation

Math is typeset by [KaTeX](https://katex.org). The interface uses [Inter](https://rsms.me/inter/) and [Source Serif 4](https://github.com/adobe-fonts/source-serif) under the SIL Open Font License; see [THIRD_PARTY.md](THIRD_PARTY.md). If Paper Pal helped with a paper, a mention is appreciated: [CITATION.cff](CITATION.cff) feeds GitHub's "Cite this repository" button.

## License

[MIT](LICENSE)
