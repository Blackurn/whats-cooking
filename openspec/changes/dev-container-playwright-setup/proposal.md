## Why

There is no reproducible local dev environment and no automated E2E test suite, which means an agent (or a new contributor) cannot reliably spin up the app and verify it works. Adding a Dev Container and Playwright test harness closes that gap.

## What Changes

- Add a `.devcontainer/` configuration so the full stack (Node.js app + Ollama) can be launched in a single container environment
- Add Playwright as a dev dependency and wire up a `test:e2e` npm script
- Write smoke-test specs that start the server, load the app, and assert the core recipe-generation flow reaches a visible result

## Capabilities

### New Capabilities

- `dev-container`: Defines the Dev Container setup (Dockerfile or `devcontainer.json`) so any agent or developer can `devcontainer open` and have a working environment
- `playwright-e2e`: Playwright configuration, helper utilities, and smoke tests covering the happy path for recipe generation

### Modified Capabilities

<!-- None — no existing spec-level behaviour is changing -->

## Impact

- **New files**: `.devcontainer/devcontainer.json` (and optional Dockerfile), `playwright.config.js`, `tests/e2e/`
- **package.json**: adds `@playwright/test` dev dependency, adds `test:e2e` script
- **CI**: not in scope for this change — GitHub Actions setup is a follow-on
- **No breaking changes** to existing server or client behaviour
