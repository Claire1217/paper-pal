# Changelog

All notable changes to Paper Pal are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Before
1.0, the local HTTP API and the on-disk state format may change in any release.

## [Unreleased]

### Fixed

- **Codex runs failed with "the argument '--dangerously-bypass-approvals-and-sandbox'
  cannot be used with '--ask-for-approval'"** when the `codex` on PATH is a
  wrapper that adds that flag. Paper Pal now passes the approval policy as a
  config override (`--config approval_policy="never"`) instead of the global
  `-a never` flag.
- **Codex runs failed with "Not inside a trusted directory and --skip-git-repo-check
  was not specified"** when the paper folder is not a git repository (the demo
  copy never is). Paper Pal now passes `--skip-git-repo-check`; the run is
  read-only either way. Both Codex fixes were checked against the real CLI's
  argument parser (codex-cli 0.155).
- **Codex: the answer schema could be refused by the provider.** `codex exec
  --output-schema` hands the file to strict structured output, which rejects a
  request whose schema uses `minLength`, `maxItems`, `$schema` and similar. The
  API adapter already stripped those; the Codex CLI now gets the same
  simplified copy. Not confirmed against a signed-in Codex.
- **A failed agent run showed the tail of the CLI's trace** (timestamps,
  "Reconnecting… 3/5" five times, a cut-off first word), and on a timeout the
  words "timed out" were pushed out of view. Comments, Review file and Chat now
  show a short message: what happened, the few lines of the CLI's output that
  say why (once each), and what to do (sign in, check the network, update a
  CLI that refuses an option, or which timeout setting to raise).
- **A proposal could double the words around a partial selection.** A model
  asked to rewrite half a sentence sometimes returns the word before it as
  well ("the evidence for it is" + "is weaker…"), the rest of the sentence, or
  the full stop that follows. Such an echo of the text just outside the
  selection is removed before the proposal is shown.
- An agent that answers "this is fine" by returning the text unchanged no
  longer produces the bare error "identical to the selected text": the card
  shows the agent's reason.
- **The compiler's output was never shown.** The "Compilation details" panel
  shipped hidden and nothing revealed it, so a failed compile was two words in
  the footer. It now opens on failure, with the LaTeX error lines (`! …` and
  the `l.<n>` line) ahead of latexmk's output, and a toast says that Undo takes
  the last change back.
- **A comment whose passage no longer exists disappeared** from the list
  without a word (after another proposal rewrote the text, or the file changed
  on disk) and could never be deleted. It stays as an "Anchor changed" card.
- "Retry Codex" on a failed card ran whichever backend is picked in the top
  bar. The button now names the backend that will run.
- A comment that nothing is processing (taken from a review, found by "Find
  linked", or queued when the server restarted) said "Waiting for Claude". It
  says "Not sent yet", next to its Run button.
- Review findings were lost on a page reload, on a look at another file, and
  when the review finished while another file was open. They are kept per file
  for the life of the browser tab.
- A page reload went back to the entry-point file; it reopens the file the tab
  had open.
- `npm start` before any setup printed a Node stack trace and suggested
  running setup on Paper Pal's own folder. It prints two plain lines: run
  setup on your paper, or `npm run demo`.
- `npm run doctor` said "Ready" for a `codex` or `claude` CLI that is installed
  but signed out. It asks the CLI (`codex login status`, `claude auth status`)
  and reports `signin:<id>` with the command to run.
- With the server stopped, actions in the page said "Failed to fetch". They
  say that the local server is not answering.
- A section whose only block begins with a line break (an abstract) stopped at
  99% after its whole text was accepted or confirmed. Progress is measured
  without the white space at a block's edges.
- The backend remembered by the browser (from another paper, or from the demo)
  was used even when it cannot run in this project. The project's own default
  is used then. A comment left while the picked backend is not ready no longer
  answers "Comment sent to …": it says why nothing will happen and what to do.
- The collapsed Options line in the comment composer always read "Selected
  text · paper context", whatever was chosen inside.
- The test suite failed on a machine whose shell exports provider API keys
  (`OPENAI_API_KEY`, ...): test servers now start with those variables blanked.
- Math did not render when Paper Pal was installed as a package, because npm
  hoists `katex` out of Paper Pal's own `node_modules`. The server and
  `doctor` now resolve it the way Node does.
- Windows: a timed-out or cancelled agent run behind a `.cmd` shim is now
  ended with its whole process tree (`taskkill /T`).

### Added

- The card of a running comment counts the seconds ("Codex is drafting… 42 s"),
  so a long run does not look stuck.
- Animated pictures in the READMEs, generated by `npm run animation`: the
  review loop at the top (`docs/images/flow-*.svg`) and, as step 5 of "How it
  works", confirming a read passage and compiling the PDF (`confirm-*.svg`).
  The overview screenshot moves under "What it is".
- A warning, in the start banner and in `npm run doctor` (check id
  `sandbox:<id>`), when the `codex` or `claude` command is a wrapper script
  that passes a flag which switches the agent's sandbox or permission checks
  off. Point `CODEX_BIN` / `CLAUDE_BIN` at the real binary to keep agents
  read-only.
- A proposal that changes LaTeX the prose view does not show (`\label`,
  `\vspace`, `\index`, `\nocite`, comments, ...) carries a warning on its
  card, with a "Show source" toggle for the raw before/after source.
- New brand mark: two nested letters P on a transparent ground (no tile), in the logo, the favicon, the top bar
  and the social preview.
- Every README screenshot has a dark variant; `npm run screenshots` takes every
  scene in both themes.

- `npm run demo` can be stopped in an orderly way by a supervising process:
  the line `stop` on a piped stdin, or the IPC message `"shutdown"`. It also
  handles SIGHUP (and Ctrl+Break on Windows), and removes its copy of the
  sample paper only after the server has exited, retrying while Windows keeps
  the folder locked. A failed removal names the folder that is left.
- CI: the failing tests of a run are reported as annotations on the run summary
  (`scripts/ci-failures.mjs`).
- `package.json` has a `files` whitelist. The npm tarball holds what is needed
  to run (server modules, `bin/`, `public/`, `schemas/`, `examples/`, the
  `setup`, `doctor`, `demo` and `reanchor-confirmations` scripts, the docs as
  Markdown, `.env.example`, `paper-pal.config.example.json`) and no longer the
  tests, fixtures, `.github/`, `docs/images/` or the development scripts:
  52 files and 0.6 MB instead of 110 files and 1.7 MB. A test fails when a new
  root module is missing from the list.

- The prose view copes with other people's LaTeX. It is tested against a
  multi-file torture manuscript (`tests/fixtures/realworld/`) with typical
  `article`, IEEEtran, acmart, llncs, REVTeX, ICML, NeurIPS and ctex preambles.
  The full list is in [docs/latex-conventions.md](docs/latex-conventions.md).
  - Inline styles are shown: `\emph`, `\textbf`, `\texttt`, `\textsc`,
    `\underline`, `{\itshape ...}`; footnotes in place; `\url`, `\href`,
    `\todo`, `\hl`; accents (`\'e`, `\"o`, `\c{c}`, `\ss`, `\o`), curly
    quotes, dashes, `\ldots`, thin spaces.
  - Citations: `\textcite`, `\citeauthor`, `\citeyear`, `\footcite` and the
    other natbib and biblatex commands, several keys, `[see][p.~5]` notes.
    References: `\pageref`, `\vref`, `\nameref`, several keys in `\cref`.
    A `thebibliography` is a read-only reference list and its entries cite
    by number.
  - The author's macros (`\newcommand`, `\renewcommand`, `\providecommand`,
    `\def`, `\DeclareMathOperator`, simple `\NewDocumentCommand`), from the
    main file, the files it includes and local `.sty` files, are expanded in
    prose for display only and handed to KaTeX for math.
  - Math: `\( ... \)`, `\ensuremath`, `align`, `gather`, `multline`,
    `flalign`, `eqnarray`, `subequations`, `\tag`, `\nonumber`. A formula
    KaTeX cannot typeset is shown as tidy source instead of red error text.
  - Theorem-like environments (also those declared with `\newtheorem` in the
    file), `proof`, `quote`, `quotation`, `center`, keywords and
    acknowledgement environments are labelled wrappers around editable prose.
    Enumerated items are numbered; nested lists are indented; `\item[Term]`.
  - Read-only blocks for `verbatim`, `lstlisting`, `minted`, `algorithm` /
    `algorithmic` (as pseudo-code), `tikzpicture`, subfigures, `longtable`
    and `tabularx`.
  - `\subfile`, `\import`, `\subimport` are followed. An include that cannot
    be followed is a read-only note. Include cycles, empty files, a BOM, CRLF
    line endings and a missing final newline are handled.
  - `\subparagraph` is a run-in heading. `\begin{appendices}` switches to
    appendix letters. Labels of `\include`d chapters are read from their
    `.aux` files.
- `npm run doctor` checks whether a keyless local provider (Ollama) answers at
  its base URL: `reach:<id>`, severity `warn`, 1.5 s, loopback only.
- `/api/document` returns `mathMacros`, and per block `styles`, `listDepth`,
  `itemNumber`, `environment`, `environmentStart`, `environmentTitle`,
  `environmentNumber`. New block kinds: `code`, `bibliography`.

### Changed

- When the open file changes on disk and the tab has no unsaved edit, open
  comment, selection or proposal edit, the page reloads it quietly and keeps
  the scroll position. The banner and the merge/conflict flow are unchanged
  when there is local state.
- docs/INSTALL-FOR-AGENTS.md: the background server's process id goes to
  `paper-pal.<port>.pid` in the app folder instead of one global file under
  `$TMPDIR`, and the report gives its full path. An existing `~/paper-pal` is
  checked with `git remote get-url origin` before it is reused. The guide
  explains doctor's `env-file` check (how to confirm a saved key without
  opening `.env`), shows sample provider checks, and says what `next` holds
  with `--no-remember`.
- CI uses `actions/checkout@v7` and `actions/setup-node@v7` (Node 24 runtime;
  the v4 actions printed a deprecation warning).
- A command the parser does not know no longer leaks its name into the prose
  (`footnotex`, `urlhttps...`): the text of its arguments is shown, and a bare
  unknown command is shown as written, in grey monospace.
- Comments, `\begin{comment}`, `\iffalse ... \fi`, `\verb` and verbatim
  environments are respected everywhere: a `%` in `\verb` or `\url` is not a
  comment, a `\section` in a listing is not a heading, a commented-out
  `\begin{equation}` does not start a formula, and a brace in a comment does
  not unbalance a group.
- A paragraph that starts with `\vspace{...}`, `\centering`, `\label{...}` or
  a similar layout command is no longer hidden as a whole; only the command is.
- `--` and `---` are shown as dashes and ` `` `, `''` as curly quotes. `\"o` is
  an umlaut, not a quotation mark. `\,` is a space, not a comma.
- `\end{approvedcontent}` and `\end{draftcontent}` directly under a paragraph
  are split off like the other wrapper lines.
- `npm run setup` writes `agent.promptMode`; `agent.guidanceFiles` stays unset
  on purpose (the default follows the files that exist). `--help` says that
  `paper-pal.config.example.json` shows the full shape.
- `public/fonts/LICENSE-SourceSerif4.txt` and `LICENSE-Inter.txt` carry the
  upstream copyright notices. `.gitignore` ignores `*.pid`.

### Fixed

- Tests on macOS: temporary folders are resolved through the `/var` →
  `/private/var` symlink, so path comparisons hold.
- Tests on Windows (still experimental, the CI jobs do not fail the build):
  the fake agent runs through a `.cmd` shim; the file-mode assertion and the
  SIGTERM → SIGKILL escalation assertion are POSIX-only; symlink tests are
  skipped where the account may not create links; the demo test stops the demo
  over stdin, because `kill()` there ends a process without running its
  handlers; temporary folders are removed with retries.
- `npm run demo` left its temporary copy and its server behind when the demo
  process itself failed, and never removed the copy on SIGHUP.
- Data loss: editing any block of a file that is not valid UTF-8 (Latin-1,
  Windows-1252) rewrote the whole file as UTF-8 and turned every non-ASCII
  byte into U+FFFD, also in untouched blocks. Such a file is now read-only:
  `GET /api/document` reports `readOnly`, `encoding: { valid: false, reason,
  message }` and `editable: false` on every block, the page shows a notice
  with the `iconv` command, and every source write (save, Accept, linked
  change set, tracked change, Undo, structure revert) and every new comment
  on the file is refused with `409`, centrally in `writeSource`. A multi-file
  action is refused as a whole. The UTF-8 files of the same project are not
  affected.
- Text with half of a surrogate pair (a split emoji) is refused with `422`
  instead of being written as U+FFFD.
- A structure revert no longer rewrites files that still hold their snapshot.
- A `table` or a bare `tabular` that is cut off or has no column specification
  made `/api/document` and `/api/outline` answer 500.
- A macro that expands to itself (`\newcommand{\a}{\a}`) made the server run
  out of stack; expansion is now bounded.
- `\\[4pt]` (a line break with a length) was taken for the start of `\[`
  display math.
- The caption of a figure with subfigures was the first subfigure's caption.

### Security

- `<provider>.apiKeyEnv` in a project configuration may only name a provider
  key variable (`OPENAI_API_KEY`, ...) or a `PAPER_PAL_*_KEY` variable, because
  the value of that variable is sent to the API host. A project file could
  otherwise send any environment variable to a host of its choosing.
  `PAPER_PAL_ALLOW_PROJECT_KEY_ENV=1` in the shell or in Paper Pal's `.env`
  lifts the restriction.
- Request ids in API calls are capped in length (`rw_` plus at most 120
  characters); a longer id is rejected before it is used as a file name.

## [0.1.0] - 2026-09-20

First public release. Paper Pal was a private tool named "Draft Review"; see
"Migrating from Draft Review" below if you used it.

### Added

- Review-first workflow: the `.tex` source is shown as readable prose; select
  a passage, comment, get a proposal with a red/green diff; the source changes
  only on Accept. Follow-ups, regenerate, discuss-only and linked
  (cross-file) changes. Undo for edits, accepted proposals and review marks.
- Confirmation marks per passage, with progress per section in the outline.
- Section review, project chat, and a structure view that can turn a confirmed
  restructuring plan into per-section proposals and revert it as a whole.
- LaTeX parser for sections (including `\section[short]{long}`), paragraphs,
  abstract, list items, display and inline math (KaTeX), tables and figures as
  read-only blocks, `\input`/`\include`, citations with `.bib` preview,
  cross-references from the `.aux` file, optional `\chadd`/`\chdel` tracked
  changes.
- Backends: Codex CLI and Claude Code CLI (read-only, prompt over stdin), and a
  generic API adapter with presets for OpenAI, Anthropic, OpenRouter, DeepSeek,
  Ollama and a `custom` OpenAI-compatible endpoint. API providers receive the
  needed project text inline within `agent.contextBudgetChars`. No model ids
  are built in.
- Non-interactive onboarding: `npm run setup` with `--json` and exit codes,
  `npm run doctor` with `--json` and `--ping`, `npm run demo`, the
  `paper-pal` command, `GET /api/health`, and an install guide for AI agents.
- `.env` in the app folder for keys and machine settings; `.env.example`.
- Optional PDF compilation with `latexmk` and an in-page PDF view.

### Security

- Loopback bind by default; Host allow-list (421); Origin or `X-Paper-Pal: 1`
  header and JSON content type on every state-changing request; 2 MB body cap;
  Content-Security-Policy on the page.
- Reads and writes are confined to `sourceRoot` after resolving symlinks;
  writes are atomic and serialised.
- API keys are read from the environment only, refused in project files,
  withheld from CLI agents, LaTeX and git, and redacted from traces and errors.
- A project file may not name arbitrary programs or a non-local API base URL
  unless the user sets a `PAPER_PAL_ALLOW_*` switch outside the project.
- The state folder ignores itself in git.

### Known gaps

- No API provider has been exercised against its live service; they are tested
  against local mock servers. The Codex CLI stdin path follows its
  documentation and was not re-run against the real CLI. See
  [docs/backends.md](docs/backends.md#verification-status).
- Windows is experimental and untested.

### Migrating from Draft Review

Nothing has to be migrated by hand. Old names are read when the new ones are
absent; the new name wins when both exist; setup writes only new names.

- **File names.** `.draft-review.json` is read when `.paper-pal.json` is
  missing. An existing `.draft-review/` state folder is used in place (no
  second folder is created). `review.local.json` is read when
  `paper-pal.local.json` is missing. `DRAFT_REVIEW_HOST` is read when
  `PAPER_PAL_HOST` is unset. UI preferences stored in the browser under
  `draft-review.*` move to `paper-pal.*` on first load. To finish the rename
  yourself, stop the server and rename the file and the folder.
- **`reviewLanguage` now defaults to `"en"`.** Set it explicitly, for example
  `"agent": { "reviewLanguage": "zh" }`, to get findings in another language.
- **`terminologyFiles` is no longer implicit.** No terminology file is loaded
  unless it is listed in `agent.terminologyFiles`.
- **Agent settings moved to `agent.*`.** The same names under `codex.*` still
  work as an alias, and `codex.enabled: false` still switches all agents off.
- **Command guards.** `codex.command` and `claude.command` must be bare
  program names; use `CODEX_BIN` / `CLAUDE_BIN` in `.env` for a path, or set
  `PAPER_PAL_ALLOW_CUSTOM_COMMANDS=1`. `latex.command` must be one of
  `latexmk`, `pdflatex`, `xelatex`, `lualatex`, `tectonic`, `make`, or set
  `PAPER_PAL_ALLOW_CUSTOM_LATEX=1`. A project that breaks these rules does not
  start, and the error says what to set.
- **`baseUrl` guard.** `<provider>.baseUrl` in a project file may only be the
  preset URL or a loopback address. Use the `custom` backend with
  `PAPER_PAL_API_BASE_URL` in `.env`, or set
  `PAPER_PAL_ALLOW_PROJECT_BASE_URL=1`.
- **OpenRouter.** The key now comes from `.env` (`OPENROUTER_API_KEY`), and the
  backend is "not ready" until `openrouter.model` is set. An unknown
  `agent.provider` is an error instead of silently meaning `codex`.
- **Scripted requests.** Every POST needs the `X-Paper-Pal: 1` header (or a
  matching `Origin`) and `Content-Type: application/json`. Opening the app
  under a host name other than `127.0.0.1`, `localhost` or `[::1]` gives 421.
  A generic `HOST` variable no longer changes the bind address.
- **Status codes.** Errors use 400, 403, 404, 405, 409, 413, 415, 421, 422,
  500 and 502 instead of always 400. `/api/bootstrap` returns base names, not
  absolute paths.
- **Block boundaries.** List items, the abstract, prose under a `\label` or a
  comment line, and text inside unknown environments are now separate visible
  blocks. Confirmations are re-found by content; one that sat in a block that
  is now split differently may lapse. With the server running,
  `node scripts/reanchor-confirmations.mjs --repo <paper>` reports what it can
  re-attach; add `--apply` to write the repair.
- **CLI.** Setup exit codes changed (2 to 6, see `npm run setup -- --help`).
  `npm run dev` is now `node --watch server.mjs`.

[Unreleased]: https://github.com/claire1217/paper-pal/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/claire1217/paper-pal/releases/tag/v0.1.0
