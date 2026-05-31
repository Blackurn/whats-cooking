## Why

The project directory is currently empty — no source files, server, or client exist yet. This change lays the foundational scaffolding for the web and server layers described in CAPABILITIES.md so that subsequent feature work has a runnable base to build on.

## What Changes

- Add `package.json` with dependencies for Express and project scripts
- Create `src/server/index.js` — Express app wiring with static file serving and placeholder routes
- Create `src/server/routes/recipe.js` — POST `/api/recipe` route stub (SSE streaming)
- Create `src/server/routes/rewrite.js` — POST `/api/rewrite` route stub
- Create `src/server/routes/substitute.js` — POST `/api/substitute` route stub
- Create `src/client/index.html` — base HTML shell with layout structure
- Create `src/client/app.js` — minimal JS entry point wiring UI to API
- Create `src/client/style.css` — base stylesheet establishing two-panel layout

## Capabilities

### New Capabilities

- `express-server`: Node.js/Express server that serves the client and exposes `/api/*` routes
- `client-shell`: Static HTML/CSS/JS frontend shell with two-panel layout (input left, output right)

### Modified Capabilities

## Impact

- Introduces `express` and `cors` npm dependencies
- Creates `src/` directory tree matching the folder structure in CAPABILITIES.md
- Establishes the `npm start` entry point
- No breaking changes — this is net-new scaffolding on an empty repo
