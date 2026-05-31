## ADDED Requirements

### Requirement: Dev Container configuration exists
The repository SHALL include a `.devcontainer/devcontainer.json` that defines a reproducible development environment so any agent or developer can open the project in a container without manual setup.

#### Scenario: Container opens with dependencies installed
- **WHEN** a developer or agent opens the project using a Dev Container host (e.g. VS Code Dev Containers, GitHub Codespaces)
- **THEN** the container starts with Node.js 22 available and `npm install` has been run automatically via `postCreateCommand`

#### Scenario: App starts inside the container
- **WHEN** `npm start` is executed inside the container
- **THEN** the Express server is accessible on port 3000 inside the container and that port is forwarded to the host

### Requirement: Container environment matches project conventions
The Dev Container configuration SHALL not introduce build tools, package managers, or runtime versions that contradict the project's existing conventions (plain JS, CommonJS, no build step).

#### Scenario: No conflicting tooling added
- **WHEN** the container is built
- **THEN** no TypeScript compiler, bundler (Webpack/Vite/esbuild), or incompatible Node version is present as a required tool
