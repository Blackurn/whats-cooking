## ADDED Requirements

### Requirement: Playwright is installed and configured
The project SHALL include `@playwright/test` as a dev dependency and a `playwright.config.js` at the repository root that configures the test runner to start the Express server before running tests.

#### Scenario: Test suite runs headlessly with a single command
- **WHEN** `npm run test:e2e` is executed in the project root (inside or outside the Dev Container)
- **THEN** Playwright launches a headless Chromium browser, starts the Express server on an available port, runs all specs in `tests/e2e/`, and exits with code 0 on success or non-zero on failure

#### Scenario: Server startup is automatic
- **WHEN** the Playwright test run begins
- **THEN** the `webServer` config in `playwright.config.js` starts `npm start` and waits for port 3000 to be ready before executing any test

### Requirement: Ollama dependency is eliminated from the test environment
Tests SHALL NOT require a running Ollama instance. All calls to `http://localhost:11434/api/generate` MUST be intercepted and fulfilled with a canned streaming response using Playwright's `page.route()`.

#### Scenario: Recipe generation test completes without Ollama
- **WHEN** the recipe smoke test runs and no Ollama process is listening on port 11434
- **THEN** the test passes because the route intercept provides a valid stub response and the UI renders a recipe

#### Scenario: Stub response conforms to Ollama streaming format
- **WHEN** the route intercept fulfils the Ollama request
- **THEN** the response body is a newline-delimited sequence of JSON objects matching the `{"model":"…","response":"…","done":false}` / `{"done":true}` Ollama stream format

### Requirement: Recipe generation happy path is covered by a smoke test
The E2E suite SHALL include at least one test that exercises the full recipe generation flow from user input to visible output.

#### Scenario: User submits ingredients and sees a recipe
- **WHEN** the app page is loaded, an ingredient list is entered, and the generate button is clicked
- **THEN** the recipe output area becomes visible and contains streamed text content within 10 seconds

#### Scenario: Test fails descriptively when the output never appears
- **WHEN** the recipe output area does not appear within the timeout
- **THEN** Playwright reports a clear timeout error indicating which element was awaited
