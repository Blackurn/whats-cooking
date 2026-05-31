## 1. Dev Container

- [x] 1.1 Create `.devcontainer/devcontainer.json` using the `node:22` base image with `postCreateCommand: "npm install"` and `forwardPorts: [3000]`
- [ ] 1.2 Verify the Dev Container config is valid by opening the project in a Dev Container host and confirming `npm start` succeeds on port 3000

## 2. Playwright Installation

- [x] 2.1 Add `@playwright/test` as a devDependency in `package.json` and run `npm install`
- [x] 2.2 Install Playwright browser binaries with `npx playwright install --with-deps chromium`
- [x] 2.3 Add `"test:e2e": "playwright test"` to the `scripts` section of `package.json`

## 3. Playwright Configuration

- [x] 3.1 Create `playwright.config.js` at the repository root configuring: `testDir: 'tests/e2e'`, headless Chromium, and a `webServer` block that runs `npm start` and waits for port 3000
- [x] 3.2 Create the `tests/e2e/` directory

## 4. Ollama Stub Helper

- [x] 4.1 Create `tests/e2e/helpers/ollamaStub.js` exporting a `stubOllama(page, responseText)` function that uses `page.route()` to intercept `**/api/generate` and return a minimal Ollama-format streaming body

## 5. Smoke Test

- [x] 5.1 Inspect `src/client/index.html` and `src/client/app.js` to identify the ingredient input selector, generate button selector, and recipe output selector
- [x] 5.2 Create `tests/e2e/recipe.spec.js` with a test that: loads the app, calls `stubOllama`, enters ingredients, clicks generate, and asserts the recipe output element contains text

## 6. Verification

- [x] 6.1 Run `npm run test:e2e` from the project root and confirm all tests pass with exit code 0
- [x] 6.2 Confirm tests pass without any Ollama process running (kill Ollama if active, re-run suite)
