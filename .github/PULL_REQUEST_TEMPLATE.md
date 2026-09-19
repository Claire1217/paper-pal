## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Why

## How it was tested

<!-- Commands you ran and what you saw. For a backend change: did you run it against the live service? -->

## Checklist

- [ ] `npm test` passes (Node 20 or 22).
- [ ] A bug fix has a test that fails without it.
- [ ] No invariant in `AGENTS.md` is weakened: only explicit author actions write source; writes stay inside `sourceRoot`; loopback bind, Host and Origin checks unchanged; keys only from the environment and never in logs, argv or project files; no third-party requests from the page.
- [ ] No new runtime dependency and no build step (or: discussed in issue #___).
- [ ] Docs updated where behaviour changed: `docs/api.md`, `docs/configuration.md`, `docs/backends.md`, `.env.example`, `paper-pal.config.example.json`, setup `--help`.
- [ ] `CHANGELOG.md` has an entry under "Unreleased".
- [ ] No unpublished manuscript text, keys, `.paper-pal/` content or machine-specific paths in code, tests, screenshots or this description.
