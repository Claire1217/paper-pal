# Contributing to Paper Pal

Thanks for helping. Paper Pal is a small project with a narrow goal: a local,
review-first writing workspace for LaTeX in which the author stays in control
of every change. Bug reports, parser fixes, backend reports ("provider X works
or fails like this") and documentation fixes are all welcome.

## Before you open an issue

**Do not paste unpublished manuscript text, API keys, `.env` contents or
files from `.paper-pal/` into an issue, a pull request or a discussion.**
Reduce a parser bug to a few lines of made-up LaTeX. Issues are public and
permanent.

Include the output of `npm run doctor -- --json`. It contains versions and
paths (your user name may appear in a path; edit it out if you mind) and never
contains key values.

Security problems go to a
[private report](https://github.com/claire1217/paper-pal/security/advisories/new),
not to the issue tracker. See [SECURITY.md](SECURITY.md).

## Development setup

```sh
git clone https://github.com/claire1217/paper-pal.git
cd paper-pal
npm install
npm test          # syntax check + portable smoke test + node:test suite
npm run demo      # server on a throwaway copy of the sample paper
```

You need Node.js 20 or newer. Nothing else: there is no build step, and the
tests use a fake agent and local mock API servers, so they need no LaTeX, no
CLI agent, no key and no network. Linux and macOS are the supported
development platforms; Windows is experimental.

Run one test file with `node tests/run.mjs parser` (any part of the file
name).

## What a change must respect

The invariants are listed in [AGENTS.md](AGENTS.md#invariants-do-not-break-these).
The short version: only an explicit author action writes manuscript source;
writes stay inside `sourceRoot`; the server stays on loopback with its Host
and Origin checks; keys come from the environment only and never reach CLI
agents, logs or the project file; the page makes no third-party requests; no
new runtime dependency and no build step without an issue first.

AGENTS.md also has the code map, the testing conventions and the style rules.
They apply to people as much as to coding agents.

## Pull requests

- One topic per pull request. Keep the diff small; `server.mjs` and
  `public/app.js` are large files, so avoid drive-by reformatting.
- A bug fix includes a test that fails without it.
- Update the documentation that your change makes wrong: `docs/api.md` for
  routes, `docs/configuration.md`, `.env.example` and
  `paper-pal.config.example.json` for settings, `CHANGELOG.md` under
  "Unreleased".
- `npm test` passes.
- Commit subjects are imperative, at most about 72 characters, and say what
  changed: `Reject symlinked assets outside sourceRoot`. Explain why in the
  body when it is not obvious. No issue-number-only subjects.
- By contributing you agree that your contribution is licensed under the
  [MIT License](LICENSE).

## Proposing a new backend

Most OpenAI-compatible services already work through the `custom` backend, so
try that first and tell us how it went. A preset is worth adding when many
users need the same base URL and key variable. The exact steps are in
[AGENTS.md](AGENTS.md#adding-an-api-provider-preset). In the pull request,
say whether you ran it against the live service, with which kind of model
(no need to name your account), and what happened with structured output.
Do not add model ids to code, presets or documentation.

## Conduct

This project follows a short [Code of Conduct](CODE_OF_CONDUCT.md).
