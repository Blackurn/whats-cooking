## Context

The app has no containerised dev environment and no automated test suite. This makes it impossible for an agent (or a new developer) to reliably boot the stack and confirm behaviour without manual intervention. The stack is: Node.js/Express on port 3000 serving static files, with all AI inference delegated to Ollama on port 11434.

## Goals / Non-Goals

**Goals:**
- Provide a `.devcontainer/` configuration that launches the app in a reproducible environment
- Add Playwright and a `test:e2e` script so an agent can run E2E smoke tests headlessly
- Cover the recipe-generation happy path in at least one test

**Non-Goals:**
- Setting up GitHub Actions CI (follow-on change)
- Running Ollama inside the container — tests will mock or stub AI responses so no GPU/model dependency is needed for the test suite
- Achieving full coverage — smoke tests only

## Decisions

### Dev Container: `devcontainer.json` + Node image (no custom Dockerfile)

Use the Microsoft-maintained `node:22` Dev Container base image via `devcontainer.json` with a `postCreateCommand` of `npm install`. A custom Dockerfile adds complexity for no benefit at this stage.

**Alternative considered:** Multi-stage Dockerfile bundling Ollama — rejected because E2E tests will stub the AI layer, so Ollama inside the container is unnecessary overhead.

### AI stubbing for tests: mock the Ollama HTTP endpoint

Playwright tests will intercept `POST http://localhost:11434/api/generate` using Playwright's `page.route()` API and return a canned streaming SSE response. This removes the model dependency entirely.

**Alternative considered:** Run a real Ollama instance inside the container with a tiny quantised model — rejected because model download time (~hundreds of MB) makes tests slow and brittle in agent contexts.

**Alternative considered:** Add a test mode flag to the Express server that returns canned responses — rejected because it leaks test concerns into production code.

### New npm dependency: `@playwright/test`

Added as a `devDependency`. No runtime impact. New script: `"test:e2e": "playwright test"`.

## Risks / Trade-offs

- **SSE stream stubbing complexity** → Playwright's `page.route()` can fulfil a streaming body using `request.fulfill({ body })`. The stub must emit chunked JSON lines matching Ollama's `api/generate` format. Mitigation: write a small helper fixture that constructs the fake stream body.
- **Port conflicts in Dev Container** → If another process holds port 3000 the server won't start. Mitigation: `devcontainer.json` forward port 3000 and document the expected state; the Playwright `webServer` config will fail fast with a clear error.
- **Dev Container not tested on all host OS/CPU combos** → Docker on Apple Silicon vs x86 behaves differently for image pulls. Mitigation: use a multi-arch base image (`node:22`).
