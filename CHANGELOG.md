# Changelog

All notable changes to Paper Pal are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Before
1.0, the local HTTP API and the on-disk state format may change in any release.

## [Unreleased]

### Added

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
