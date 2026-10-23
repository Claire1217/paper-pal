# Changelog

All notable changes to Paper Pal are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Before
1.0, the local HTTP API and the on-disk state format may change in any release.

## [Unreleased]

### Documentation

- FAQ entry (both READMEs) and a line in `llms.txt` saying that Paper Pal is not
  Paperpal or one of the other "PaperPal" repositories, and how to find this one.

### Added

- Previous and next comment buttons stay above the comment list, follow the
  manuscript's order and highlight the matching passage and card. Navigation
  wraps at either end and continues after a comment is resolved.

### Fixed

- Clicking a paragraph with a proposal hid its red/green: the paragraph
  switched to source editing and showed the old text until it lost focus, so
  the proposal looked gone. The red/green now stays until Accept (the paragraph
  then shows the new text) or Reject (the original text), and the paragraph is
  editable again after either; after Reject or Delete the paragraph is redrawn
  at once even while the rest of the page waits for a selection to end. A
  click or double-click there no longer starts editing. Typing, Enter,
  Backspace or paste there shows a short note to Accept or Reject first, or to
  edit the proposal in its card. Screen readers hear the paragraph as
  read-only while the proposal waits. Selecting text to comment or confirm
  works as before. A paragraph left in editing without the focus is now
  released when the focus leaves the manuscript.
- The selection toolbar (Confirm / Comment) appeared while a selection was
  still being dragged and moved along with it. It now appears once, when the
  mouse button is released (also over the sidebar), or shortly after the key
  that extended a keyboard selection is released. Starting a new drag in the
  manuscript hides it.
- A failed agent run could show a piece of the CLI's own instructions and the
  advice to sign in, when the real error was elsewhere in the trace (for
  example Codex saying the model needs a newer version of the CLI). The card now
  shows the CLI's own error lines first (`ERROR:`, `error:`), once each, with the
  message taken out of a JSON error. Timestamped log lines and reconnect notices
  only fill in when there are none, and very long lines and the cut-off start of
  a long trace are ignored. The advice is chosen from the lines shown only, and
  a "requires a newer version" error now says to update the CLI or choose
  another model or backend, and a 5xx or "overloaded" error from the service
  says to wait a minute and retry.
- **Accept could rewrite a paragraph the author never commented on.** When a
  commented sentence also appears elsewhere in the file and the commented copy
  was edited away, the comment moved to the other copy, and Accept rewrote that
  paragraph. Comments no longer search for their text: every write Paper Pal
  makes (a save, Accept, a linked change set, a tracked-change resolve, Undo,
  a structure revert) moves the stored position of the other open comments
  with the edit, and an edit in another program is followed by comparing the
  file with the last version Paper Pal saw (also across a CRLF/LF conversion,
  and to a paragraph moved by cut and paste). A comment whose own text was
  edited is refused with "The commented text was edited, so select the passage
  again and leave a new comment." Undo brings it back.
- A comment on repeated text stopped working after a small edit nearby in its
  paragraph ("matched 2 current locations"), or after another comment in that
  paragraph was accepted (409 on every Accept). Such comments now stay on
  their text. "Generate reviewable edit" from Chat now checks the discussed
  text itself: it no longer refuses after edits around the passage, and it
  refuses when the passage was edited, which it never did before.
- **A macro that passes an argument to `\ref` or `\cite` was shown garbled,
  and deleting text a macro adds could delete its argument.**
  `\newcommand{\figref}[1]{Figure~\ref{#1}}` showed `\figref{fig:a}` as
  "Figure \reffig:a", a macro around `\citet` showed `\citetacl`, and one
  around `\href{#1}{#2}` ran the address into the link text. Paper Pal now puts
  the arguments into the macro's body and shows the result: "Figure 3", the
  citation, the link text. Argument text that is shown as written stays
  editable in place, as before. Text that the macro adds or builds from a key
  ("Figure 3", "TODO: ") is shown but not editable, in the manuscript and in a
  proposal unit, and edits next to it keep the call. Deleting only the ")" of
  `\paren{word}` used to delete "word" from the source too; such an edit is
  now refused with a message that names the macro, and so is deleting only the
  "[" or "]" of a `\footnote` or the "TODO: " of `\todo`, which left an
  unbalanced brace. A letter typed right after a macro without arguments
  joined its name (`\eg` plus "s" saved `\egs`); it now follows an empty
  group. A text or formatting command you define yourself, such as
  `\newcommand{\todo}`, is now shown with your definition instead of the
  built-in one; `\renewcommand{\todo}[1]{}` therefore hides every `\todo`
  from the page, as from the PDF. A copy made with `\let` (`\let\x\y`,
  `\let\x=\y`, `\LetLtxMacro`) works like the command it copies, so
  redefining `\footnote` to call `\oldfootnote` still shows the footnote. A
  macro whose body calls itself is shown like an unknown command instead of
  repeating.
- **Applying a linked change set with two changes in one file kept only the
  last one.** Each change was written from the file as it was before the set,
  so the others were lost, and Undo then failed with "changed after this
  action". This happened when a related change named the commented file
  through a symlink or in another letter case. All changes to one file are now
  applied together and the file is written once, so Undo restores it. Changes
  in one file that overlap refuse the set, and the agent can no longer attach a
  related change to a file that already has one under another spelling.
- **"Keep my edit" could overwrite a different paragraph.** After a co-author
  added or removed a paragraph above the one being edited, the forced save
  replaced whatever paragraph now sat at the old position. It now finds the
  edited paragraph by its place between the paragraphs around it, also when
  the co-author edited it, and never takes a look-alike elsewhere for it. When
  the place is unclear, the save is refused rather than guessed.
- **An edit to a paragraph that was deleted on disk was merged into the next
  paragraph.** The save now fails, and the page says that the paragraph was
  removed or rewritten on disk. It keeps the typed text on screen, offers
  "Copy my text" instead of "Keep my edit", and asks before Reload, another
  file, "Use disk version" or "Revert structure" discards the text.
- A save after a change on disk wrote into the first paragraph with the same
  text when a paragraph appears more than once. It now writes into the copy
  that was being edited.
- Confirming one copy of a repeated paragraph showed every copy as confirmed,
  and editing one copy removed the confirmation of the other. A confirmation
  now belongs to one copy only.
- Splitting a paragraph with a blank line dropped the confirmation of the text
  after the split. It now stays on the new paragraph. Confirmations that a
  save only moves keep their id and the time they were made.
- A merge with two or more conflicting places failed with "Automatic merge is
  unavailable." It is now reported as a conflict, like a single one.
- **Editing words across inline formatting could delete a closing brace.**
  Changing "big dog" to "small cat" in `The \textbf{big} dog` saved
  `The \textbf{small cat`, whose open group ran to the end of the file. Markup
  inside the edited stretch is now kept (`The \textbf{small} cat`), new text
  starts inside the group where the replaced words started, a formatting
  command whose text was all deleted is removed instead of left as
  `\textbf{}`, and an edit next to a `% comment` no longer writes text into
  the comment. An edit that crosses markup rewrites whole words, so a word is
  not split across formatting, and a typed blank line never ends up inside a
  group, where it split the paragraph into two blocks with unclosed braces.
- **Typing inside `\verb|...|` deleted the command.** `\verb` (and
  `\lstinline`, `\mintinline`) text is now shown but not editable, like math
  and citations. An edit next to it keeps it, and new text that only reuses
  some of its letters no longer brings deleted text back.
- **Typing `%` turned the rest of the line into a LaTeX comment.** "50% of
  sites" was written as is, so everything after the `%` disappeared from the
  PDF; a typed `&` or `#` stopped the compile. Paper Pal now writes `\%`, `\&`
  and `\#`, except inside `\url`, `\href`, `\path` and `\verb`.
- **A comment could be sent for the wrong passage.** Selecting other text
  while the composer was open (to copy it, say) made Comment send that
  selection instead of the quoted one. The composer's passage is now sent.
- **Ask in Chat sent no selection after a drag that started at the very end of
  a paragraph** (or a triple-click), so the reply and "Generate reviewable
  edit" were tied to the previous passage. The selection now carries the ids of
  the paragraphs it was moved into.
- **Comments and edits made while the tab was in the background did not show
  when coming back to it.** The card kept saying "drafting…". Paper Pal now
  re-reads the comments, the undo state and the open file on every reconnect.
- Comment cards were numbered differently from the badges in the text once a
  comment lost its anchor, and the "Anchor changed" card sorted first. Both now
  use the same numbers, and that card is listed last.
- An older comment list could replace a newer one when several updates arrived
  during an agent run. Only the newest answer is used now.
- Typing on while a save was in flight showed a false "The paragraph changed"
  conflict. The next save now continues from the saved paragraph.
- After one text selection, every outside change to the open file showed the
  "source changed" banner instead of reloading quietly.
- "Confirm section" in a file the main file does not `\input` confirmed up to
  the end of the file. It now stops at the next heading of the same or a higher
  level.
- Enter that picks a Chinese or Japanese IME candidate inserted a paragraph
  break in the source, or was swallowed in a proposal unit. It is now left to
  the input method.
- A proposal-unit edit left while another unit was still saving was never
  saved, and the manuscript stopped repainting. It is now saved once the first
  save finishes, and edits whose saves failed are kept and tried again in turn.
- **✓/✕ on a tracked change could resolve a different change than the one
  clicked.** This happened when changes were joined by `~` or a comment line,
  or when a commented-out `\chadd`/`\chdel` stood earlier in the paragraph,
  which was then edited instead. The server now sends each group's
  source range with the document, the page sends it back with the group's
  text, and the server refuses (409) a range that is not a current group.
- A `\\` at the end of a `\chadd{...}` or `\chdel{...}` made that change and
  every later one in the paragraph impossible to resolve ("This tracked change
  no longer exists"). Such a change now closes at its brace.
- Accept or Reject on a tracked change while typing in the same paragraph
  dropped the typing or brought the resolved macro back after a save
  conflict. The typing is now saved first, then the change is resolved.
- Clicking into a paragraph with tracked changes put the caret two characters
  early for each change before the click point. The ✓/✕ buttons no longer
  count as text.
- With the page out of date and a paragraph that appears more than once in
  the file, ✓/✕ could change another copy after a paragraph above was removed
  on disk. The page now sends the document's etag, and the server refuses
  (409) when it is stale and the paragraph's text is not unique.
- **A follow-up sent while the agent was still answering a comment was
  dropped**, and the answer to the earlier instruction was shown as if it
  replied to the follow-up. The comment now runs again with the follow-up once
  the current run ends, and the earlier answer is discarded.
- **A chat message sent right after Stop could fail with the stopped run's
  output, or get the stopped run's reply.** Stop now frees the chat at once,
  the new message gets a run of its own, and nothing from the stopped run is
  written to the chat.
- A proposal dropped a word that the replacement meant to double ("He argued
  that" + "that claim…", "we had" + "had to…"), taking it for an echo of the
  word before the selection. A repeated "that" or "had" is now kept unless the
  other edge of the replacement echoes too; other echoed words are still
  removed.
- Running a link search again (a follow-up on a "Find linked" comment) placed a
  second linked comment at every location it had already found. A linked
  comment the agent has not worked on yet now takes the new instruction; one
  that already has a reply or a follow-up keeps it, and the new instruction
  gets its own comment beside it.
- A plain follow-up sent while the agent was revising one unit of a grouped
  proposal was answered with only that unit changed. It now gets a whole new
  answer.
- A chat that finished after it was selected from the list showed as
  "interrupted" with an old message count. The leftover archive copy is
  removed when a chat is selected, and is not listed.
- An agent run that failed before the agent started (for example because the
  commented passage was gone) left a temporary folder behind.
- **A heading whose title ends in `\\` swallowed the paragraph below it**
  (`\section{Results\\}`), and the section was missing from the outline. The
  `}` after `\\` is no longer read as an escaped brace.
- **A paragraph with an inline image or tabular disappeared.** A logo in
  `\raisebox{...}{\includegraphics{...}}` inside a sentence made the whole
  paragraph a read-only figure. A picture or tabular inside a sentence (after
  words on its line, inside `\raisebox` and similar, or an icon followed by
  words at the start of a wrapped line) now leaves the block prose. One that
  starts its own line, with a caption, a panel label or a note around it, is
  still a figure or table.
- **A paragraph directly below a one-line `\newcommand`, `\renewcommand` or
  `\def` was hidden** as part of the definition. A definition that is complete
  on its line is now a block of its own.
- Inline math right after a `\\` line break (`First line\\$x+1$`) showed as
  text with a stray `$`. It is now math.
- `\texorpdfstring{...}{...}` showed both arguments. It now shows the first one;
  the second is only for PDF bookmarks.
- On Windows, an agent run or another save could fail with "EPERM: operation
  not permitted, rename" when the page read the same state file at that moment.
  Paper Pal now retries the rename a few times before it reports an error.
- **A project file could widen what the Claude agent may do.** Entries of
  `claude.allowedTools` were handed to `claude` as separate arguments, so an
  entry that starts with `-` became an option of its own; a listed tool such as
  `Monitor` could run commands, because only `Write`, `Edit`, `NotebookEdit`
  and `Bash` were disallowed; and `claude.permissionMode` was passed through
  unchecked. Start-up now refuses an entry that is not a tool name, a tool
  other than `Read`, `Glob`, `Grep`, `LS`, `WebFetch` and `WebSearch`, and a
  permission mode other than `default` or `plan`; the last two are allowed
  with `PAPER_PAL_ALLOW_CUSTOM_COMMANDS=1` set outside the project.
- **A project file could send one provider's key to another provider.**
  `<provider>.apiKeyEnv` accepted any provider's key variable, so for example
  `deepseek` could be told to use `OPENAI_API_KEY`. It now accepts only the
  provider's own variable or a `PAPER_PAL_*_KEY` name; another provider's key
  variable only when the base URL is on this machine. Anything else still needs
  `PAPER_PAL_ALLOW_PROJECT_KEY_ENV=1`. A project that relied on the old
  behaviour stops at start-up with a message that says which variable to use.
- The API adapter followed HTTP redirects, and with the Anthropic protocol that
  resent the `x-api-key` header to the redirect target. Redirects are no longer
  followed: the run fails with the new address (when the endpoint gives one)
  and asks you to set the base URL to it if the move is expected.
- A base URL with a user name and password in it failed with an error that
  repeated the whole URL, password included, and was retried. Such a URL is now
  refused (in `.paper-pal.json` and by the adapter), `user:password@` is masked
  in adapter messages, and only failures on the network are retried.
- The check for credentials in `.paper-pal.json` missed names such as
  `openaiApiKey`, `OPENAI_API_KEY`, `x-api-key`, `clientSecret` and `apiKeys`,
  and keys given as a list or an object. Any field whose name ends in `key`,
  `token`, `secret`, `password` and similar (singular or plural) now stops
  start-up when it holds a value; names that end in `Env` (`apiKeyEnv`) and
  counts such as `maxTokens` are still allowed.
- **Reverting a structure plan discarded every edit made after the plan was
  approved, and Undo could not bring them back.** Paper Pal now asks the author
  to confirm when a file's text or confirmations changed after the plan was
  approved (or its text changed after it was applied), and names the files. A
  confirmed revert is an undo entry: Undo restores the text and confirmations
  from before the revert and makes the plan active again. A revert that fails
  partway, for example on a read-only folder, puts back the files it already
  wrote.
- A `null` entry in `proposal.sections` (`/api/structure/confirm`) or in
  `segments` (`/api/confirm`, `/api/unconfirm`, `/api/rewrite`) answered 500
  "Internal error". It now answers 400.
- **A caption edit could be written into a commented-out caption.** With
  `% \caption{Old}` above the real `\caption` of a table, the page showed the
  old caption, and an accepted caption rewrite changed the comment line while
  the compiled caption stayed the same. A commented-out `% \label{...}` above
  the real one likewise gave a figure, table, equation or theorem the wrong
  number from the `.aux` file. Paper Pal now ignores captions and labels inside
  comments. A table with subtables also showed the first subtable's caption as
  its own; it now shows the table's caption.
- A table showed a commented-out row (`% A & B \\`) as a real row, and an `&`
  in a trailing comment as an extra cell. Rows, cells, `\multicolumn` and
  `\multirow` are now read outside comments only.
- Rule widths and colours leaked into table cells: `\toprule[1.5pt]`,
  `\midrule[..]`, `\bottomrule[..]`, `\cmidrule[..](lr){2-3}`,
  `\specialrule{..}{..}{..}`, `\Xhline{..}`, `\hhline{..}`, `\morecmidrules`,
  `\rowcolor{..}`, `\cellcolor{..}` and `\arrayrulecolor{..}` showed as
  text, and a rule after the last row added an extra row. These commands and
  their arguments are now dropped.
- `curl -I` and uptime probes got `404` from `/api/health` and every other
  GET route, because `HEAD` matched no route. GET routes (except
  `/api/events`) now answer `HEAD` with the same status and headers and no body.
- An accented or other non-ASCII character in the compile log or an agent's
  trace could show as two replacement characters when the program's output
  arrived split inside that character. Output is now decoded per stream.
- **Reverting a structure plan discarded every edit made after the plan was
  approved, and Undo could not bring them back.** Paper Pal now refuses the
  revert when a file of the plan changed after it was approved (or after it was
  applied) and asks the author to confirm. A confirmed revert is an undo entry:
  Undo restores the text from before the revert and makes the plan active again.
- A `null` entry in `proposal.sections` (`/api/structure/confirm`) or in
  `segments` (`/api/confirm`, `/api/unconfirm`, `/api/rewrite`) answered 500
  "Internal error". It now answers 400.
- **Editing words across inline formatting could delete a closing brace.**
  Changing "big dog" to "small cat" in `The \textbf{big} dog` saved
  `The \textbf{small cat`, whose open group ran to the end of the file. Markup
  inside the edited stretch is now kept (`The \textbf{small} cat`), and an edit
  next to a `% comment` no longer writes text into the comment.
- **A comment could be sent for the wrong passage.** Selecting other text
  while the composer was open (to copy it, say) made Comment send that
  selection instead of the quoted one. The composer's passage is now sent.
- **Ask in Chat sent no selection after a drag that started at the very end of
  a paragraph** (or a triple-click), so the reply and "Generate reviewable
  edit" were tied to the previous passage. The selection now carries the ids of
  the paragraphs it was moved into.
- **Comments and edits made while the tab was in the background did not show
  when coming back to it.** The card kept saying "drafting…". Paper Pal now
  re-reads the comments, the undo state and the open file on every reconnect.
- Comment cards were numbered differently from the badges in the text once a
  comment lost its anchor, and the "Anchor changed" card sorted first. Both now
  use the same numbers, and that card is listed last.
- An older comment list could replace a newer one when several updates arrived
  during an agent run. Only the newest answer is used now.
- Typing on while a save was in flight showed a false "The paragraph changed"
  conflict. The next save now continues from the saved paragraph.
- After one text selection, every outside change to the open file showed the
  "source changed" banner instead of reloading quietly.
- "Confirm section" in a file the main file does not `\input` confirmed up to
  the end of the file. It now stops at the next heading of the same or a higher
  level.
- Enter that picks a Chinese or Japanese IME candidate inserted a paragraph
  break in the source, or was swallowed in a proposal unit. It is now left to
  the input method.
- A proposal-unit edit left while another unit was still saving was never
  saved, and the manuscript stopped repainting. It is now saved once the first
  save finishes.
- **Citations showed "key (n.d.)" for entries exported by the ACL Anthology,
  JabRef and many hand-kept `.bib` files.** Values in double quotes
  (`title = "..."`), bare numbers (`year = 2019`), `@string` names
  (`journal = jcp`, joined with `#`) and entries written `@article( ... )` were
  ignored. Paper Pal now reads all of these, and skips `@comment` and
  `@preamble`.
- An IEEE Xplore export that lists `booktitle` before `title` showed the
  conference name as the paper title, and a DBLP entry without `url` linked to
  its `biburl`. Field names are now matched whole.
- A corporate author written `{{Open Data Collective}}` showed only its last
  word. A wholly braced name is now shown whole, and `and` inside braces no
  longer splits a name.
- A `.bib` link with a `%` in it (`url = {https://example.org/a%20b.pdf}`) was
  cut at the `%`, and its PDF link was lost. `url` and `doi` are now read
  verbatim, as BibTeX reads them.
- A `.env` line such as `OPENAI_API_KEY=   # paste your key here` set the
  variable to the comment text. Paper Pal now reads it as an empty value.
- Setup with an absolute `--main` or `--source` inside the paper folder exited
  with 0 but wrote a configuration the server refused to load. Setup now stores
  those paths relative to the project. A path that reaches the project through
  another spelling of a symlink (`/var` and `/private/var` on macOS) is accepted
  too, and an entry point outside the project is no longer reported as missing.
- `scripts/reanchor-confirmations.mjs` ignored Paper Pal's `.env`, so it used
  the wrong port and stopped with a stack trace on a project that needs a
  `PAPER_PAL_ALLOW_*` switch. It now loads `.env` like the server and prints a
  plain message when the configuration cannot be loaded.
- A directory or a file without execute permission on `PATH` counted as an
  installed agent CLI or LaTeX program. Paper Pal now accepts only executable
  files, as a shell does.
- A configured path of `/` was accepted as the project folder itself, and on
  Windows `C:`, `C:main.tex` and `C:/` were accepted too. These are now refused
  as paths outside the project.
- `--repo=<dir>`, `--config=<file>` and `--port=<n>` were ignored, and
  `--repo --port 0` used `--port` as the project folder. Both forms are now
  read, and an option without a value is reported as an error.
- A zero or negative `agent.timeoutMs`, `agent.projectTimeoutMs` or
  `agent.chatTimeoutMs` ended every agent run at once. Such values now use the
  default.
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
- When an agent run finished, the page could briefly show the proposal without
  the agent's reply or its linked changes, because the comment was saved twice:
  first as "proposed", then with the reply and the linked changes. The result
  is now saved in one write, and the run is reported complete at the same
  moment. A discussion answer and a link search are also reported complete
  together with their answer, not after it. The comments a link search adds
  are saved after their source comment lists them. The run's own status file
  says "finished" only after all of that, so a run cut off before its answer
  was saved is shown as interrupted after a restart, never as "Not sent yet".
- Rejecting a grouped proposal while the agent was revising one of its units
  brought the proposal back when the revision failed. It now stays rejected.

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

- `POST /api/tracked-change/resolve` takes `etag`, `start`, `end` and `text`
  instead of `groupIndex`. `start` and `end` come from the block's new
  `trackedChanges` list in `/api/document`, and `text` is the raw text in that
  range. A request with only `groupIndex` gets 400.
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
