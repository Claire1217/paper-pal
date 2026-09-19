# Local HTTP API

**Status: internal and unstable before 1.0.** This is the API between Paper
Pal's server and its own page. It is documented so that contributors, tests
and local scripts can use it. Routes, fields and status codes may change in
any release without a deprecation period. The one endpoint meant for outside
use is `GET /api/health`.

Base URL: `http://127.0.0.1:4317` (or the port you started with).

## Security model

The API has **no authentication**. It relies on being reachable only from
your own machine, and on these checks, applied in this order:

1. **Loopback bind.** The server listens on `127.0.0.1` unless
   `PAPER_PAL_HOST` says otherwise (a non-loopback bind prints a warning).
2. **Host allow-list.** The `Host` header must be `127.0.0.1:<port>`,
   `localhost:<port>` or `[::1]:<port>` with the port the server listens on
   (plus an explicitly configured non-loopback `PAPER_PAL_HOST`). Anything
   else gets `421`. This blocks DNS rebinding.
3. **Origin check on every request that is not GET or HEAD.** If the request
   has an `Origin` header, it must be `http://` plus an allowed host, otherwise
   `403`. If it has no `Origin` (curl, scripts), it must carry the header
   `X-Paper-Pal: 1`, otherwise `403`. A cross-site form cannot set that header.
4. **JSON only.** A request with a body must have
   `Content-Type: application/json`, otherwise `415`. The body must be a JSON
   object. The server never answers CORS preflights, so a cross-origin page
   cannot send such a request.
5. **Body cap.** Bodies larger than 2 MB (2,000,000 bytes) get `413`.

Responses carry `X-Content-Type-Options: nosniff`. The page is served with a
Content-Security-Policy (`default-src 'none'`, scripts from `'self'` only),
`X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`. Files under
`/api/asset` are served with a sandboxing CSP.

Absolute paths of your machine and API key values are removed from every
error message and never appear in `/api/health` or `/api/bootstrap`.

Example of a scripted write:

```sh
curl -s -X POST http://127.0.0.1:4317/api/compile -H 'X-Paper-Pal: 1'

curl -s -X POST http://127.0.0.1:4317/api/chat/stop \
  -H 'X-Paper-Pal: 1' -H 'Content-Type: application/json' -d '{}'
```

## Errors

Every error is JSON: `{ "error": "One sentence." }`. Static-file errors are
plain text.

| Status | Meaning |
|---|---|
| 400 | Invalid input: missing field, malformed JSON or URL, validation message. |
| 403 | Origin not allowed, `X-Paper-Pal` header missing, or a path outside `sourceRoot` / the project. |
| 404 | Unknown `/api/*` route, or the file does not exist. |
| 405 | Non-GET request to a static path. |
| 409 | Conflict: the file or passage changed since it was read, something is already running, the backend is not ready, agents are disabled, or the target file is not UTF-8 (read-only). |
| 413 | Body too large. |
| 415 | Body is not `application/json`. |
| 421 | `Host` header not allowed. |
| 422 | A PDF figure could not be rasterised (no `pdftoppm` or `sips`), or the text to write contains half of a surrogate pair. |
| 500 | Internal error. Details are in the server log, not in the response. |
| 502 | The agent failed or returned an unusable answer (section review). |

Writes use optimistic concurrency: send the `etag` you got from
`GET /api/document`. A stale `etag` gives `409`.

A source file that is not valid UTF-8 is read-only. `GET /api/document` still
returns it (decoded with U+FFFD in place of the bad bytes) with
`readOnly: true`, `encoding: { valid: false, reason, message }` and
`editable: false` on every block. Every route marked "Writes source", and
every route that creates a comment or proposal for that file, answers `409`
with the conversion hint and leaves the file untouched. A linked change set,
an undo or a structure revert that includes such a file is refused as a whole.
A write changes only the bytes of the edited span: BOM, line endings, final
newline and Unicode normalisation form are kept.

## Routes

"Writes source" marks the only routes that can modify manuscript files.
Relative paths are relative to the project folder.

### Status and project

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/api/health` | Is the app up, and what can it do. | See below. No paths, no secrets. |
| GET | `/api/bootstrap` | Everything the page needs at load: title, document list, PDF presence, LaTeX and compile state, undo status, git status, chat and agent settings with the provider list, current structure plan. | `configPath` and `repoRoot` are base names only. |
| GET | `/api/git` | `git status --short` summary. | `{ available, clean, count, lines }`. |
| GET | `/api/events` | Server-Sent Events stream. | See "Events". |

`GET /api/health`:

```json
{
  "ok": true,
  "name": "paper-pal",
  "version": "0.1.0",
  "project": { "title": "my-paper", "defaultDocument": "main.tex" },
  "latex": { "enabled": true, "available": true },
  "providers": [
    { "id": "codex", "label": "Codex", "kind": "cli", "available": false, "reason": "codex CLI not found on PATH. Install it, or set CODEX_BIN in .env." },
    { "id": "claude", "label": "Claude", "kind": "cli", "available": true, "reason": null },
    { "id": "openai", "label": "OpenAI API", "kind": "api", "available": false, "reason": "Set OPENAI_API_KEY in .env." }
  ],
  "defaultProvider": "claude"
}
```

`providers` always lists all eight backends (three shown here).
`latex.available` is `false` whenever `latex.enabled` is `false`. In
`/api/bootstrap`, each entry of `agent.providers` also has `model`, `models`
and `capabilities: { readRepo }`.

### Documents

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/api/document?path=` | One parsed file: `source`, `etag`, `blocks` (kind, raw text, display text, offsets, inline `styles`, list and environment hints, review status), `mathMacros` (the author's macros for KaTeX), `frontMatter`, `references` (labels, citations, unresolved keys), `encoding` (`{ valid: true }`, or `{ valid: false, reason, message }`), `readOnly`; each block has `editable` (`false` when the file is read-only). | `path` must be a `.tex`, `.md` or `.bib` file inside `sourceRoot`. |
| GET | `/api/outline` | Outline compiled from the main file through `\input`/`\include`, with numbering and review progress. | |
| GET | `/api/structure` | Section tree with source ranges and snapshot hashes. | |
| GET | `/api/pdf` | The compiled PDF (`pdf` in the configuration). | |
| GET | `/api/asset?path=` | An image or PDF inside `sourceRoot` (`pdf png jpg jpeg gif webp svg`). | Sandboxed by CSP. |
| GET | `/api/asset-preview?path=` | PNG rendering of a PDF figure, cached in the state folder. | Needs `pdftoppm` or macOS `sips`; else `422`. |
| POST | `/api/save` | Save the author's edit of one block. **Writes source.** | `path`, `etag`, `blockIndex`, `blockId`, `blockKind`, `baseText`, `text`, `force`. Three-way merge when the file changed elsewhere. |
| POST | `/api/tracked-change/resolve` | Accept or reject one `\chadd`/`\chdel` group. **Writes source.** | `path`, `blockIndex`, `blockId`, `groupIndex`, `action` (`"accept"`; anything else rejects). |
| POST | `/api/confirm` | Mark a selection as confirmed. State only. | `path`, `etag`, and `segments: [{ blockIndex, blockId, start, end }]` or the same four fields at top level. Offsets index the block's raw text. |
| POST | `/api/unconfirm` | Remove confirmation. State only. | Same body. |
| GET | `/api/undo` | Undo status: `available`, `label`, `kind`, `path`, `createdAt`, `depth`. | |
| POST | `/api/undo` | Undo the last action (edit, confirm, unconfirm, accepted proposal, linked change set). **Writes source** when the action did. | No body. |

### Comments and proposals

A "request" is one comment with its conversation, proposal and history.

| Method | Path | Purpose | Body |
|---|---|---|---|
| GET | `/api/requests` | All requests with proposals, renderings, anchor validity and agent status. | |
| POST | `/api/rewrite` | Create a comment on a selection and, by default, queue the agent. `201`. | `path`, `etag`, `segments` (as for confirm), `comment`, `responseMode` (`rewrite` default, `discuss`, `link`), `contextMode` (`local`, `smart` default, `project`), `rewriteScope` (`selection` default, `paragraph`), `provider`, `model`, `autoProcess`, `origin`. |
| POST | `/api/request/process` | Queue a pending request. `202`. | `id`, `provider` |
| POST | `/api/request/followup` | Add an instruction (optionally for one unit) and queue again. `202`. | `id`, `message`, `unitId` |
| POST | `/api/request/regenerate` | Move the current answer to history and queue again. `202`. | `id`, `provider`, `model`, `autoProcess` |
| POST | `/api/request/generate-proposal` | Turn a finished discussion into a rewrite run. `202`. | `id`, `autoProcess` |
| POST | `/api/request/accept` | Apply the proposal to the file and push an undo entry. **Writes source.** | `id` |
| POST | `/api/request/reject` | Reject the proposal. | `id` |
| POST | `/api/request/delete` | Delete the comment; cancels a queued or running agent job. | `id` |
| POST | `/api/request/review-unit` | Set the status of one unit of a grouped proposal. | `id`, `unitId`, `status` |
| POST | `/api/request/edit-unit` | Hand-edit one unit of a grouped proposal. | `id`, `unitId`, `baseText`, `text` |
| POST | `/api/request/restore-unit-revision` | Restore the previous proposal after an interrupted unit revision. | `id` |
| POST | `/api/request/review-linked-change` | Set the status of the primary or one linked (cross-file) change. | `id`, `changeId`, `status` |
| POST | `/api/request/confirm-all-linked` | Confirm the primary and all linked changes. | `id` |
| POST | `/api/request/apply-linked` | Apply the confirmed linked change set across files in one step. **Writes source.** | `id` |

### Section review

| Method | Path | Purpose | Body |
|---|---|---|---|
| POST | `/api/document/review` | Run an AI review of one file. Synchronous: the response arrives when the agent finishes. One at a time (`409`). | `path`, `provider`, `model` |
| POST | `/api/document/review/accept` | Turn one finding into a comment. | `path`, `selectedText`, `comment`, `level`, `principle`, `provider`, `model` |

### Structure plan

| Method | Path | Purpose | Body |
|---|---|---|---|
| GET | `/api/structure/plan` | The confirmed restructuring plan, public view. | |
| POST | `/api/structure/confirm` | Confirm a structure proposal from chat as the plan; snapshots sources and review state. `201`. | `sessionId`, `proposal`, `force` |
| POST | `/api/structure/section-rewrite` | Create rewrite requests for one section of the plan. `202`. | `sectionId`, `autoProcess` |
| POST | `/api/structure/mark-applied` | Mark plan sections as applied. | `sectionIds` |
| POST | `/api/structure/revert` | Restore every source file and the review state captured by the plan. **Writes source.** | none |

### Chat

| Method | Path | Purpose | Body |
|---|---|---|---|
| GET | `/api/chat?id=` | The current chat session, or the one with `id`. | |
| GET | `/api/chats` | Session summaries. | |
| POST | `/api/chat/message` | Append a user message and queue a turn. `202`. | `message`, `sessionId`, `provider`, `activePath`, `selectionContext`, `structureContext`, `newSessionIfBusy`, `newSessionForNewSelection`, `autoProcess` |
| POST | `/api/chat/new` | Archive the current chat and start a new one. `201`. | none |
| POST | `/api/chat/select` | Make an archived chat current. | `id` |
| POST | `/api/chat/stop` | Cancel the queued or running turn. | `sessionId` |
| POST | `/api/chat/create-proposal` | Turn a chat reply tied to a selection into a rewrite request. `202`. | `sessionId`, `assistantMessageId`, `autoProcess` |

### Compile

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/compile` | Start a LaTeX compile. `202` with the compile state. A request during a running compile triggers one more compile afterwards. |
| GET | `/api/compile` | `{ status, startedAt, finishedAt, exitCode, log, pdfVersion }`. |

### Static files

| Method | Path | Purpose |
|---|---|---|
| GET | `/vendor/katex/*` | KaTeX files from `node_modules/katex/dist` (`.js .css .woff .woff2 .ttf`). |
| GET | `/*` | Files from `public/`. `/` is `index.html`. |

## Events

`GET /api/events` is a Server-Sent Events stream. The payloads are small
hints; the page reacts by fetching the matching GET route again.

| Event | Sent when | Payload |
|---|---|---|
| `ready` | The stream opens. | `{ "ok": true }` |
| `document` | A file was saved, changed by an accepted proposal or an undo, or changed outside Paper Pal (detected by a file watcher and a 1.5 s poll). | `{ path, reason }`, for example `"saved"` or `"external-change"` |
| `state` | Review marks changed. | `{ path, reason }` |
| `request` | A comment was created or changed, or its agent status changed. | `{ id, reason }`, sometimes with status fields |
| `chat` | A chat session changed. | `{ id, status, updatedAt, isCurrent }` |
| `chats` | Another session became current. | `{ currentId, reason }` |
| `compile` | Compile state changed. | the compile state |
| `undo` | The undo stack changed. | the undo status |
| `structure-plan` | The structure plan changed. | the public plan |

## Keeping this page current

The route table is the `if (request.method === ... && url.pathname === ...)`
chain near the end of `server.mjs`. A pull request that adds or changes a
route updates this page in the same change.
