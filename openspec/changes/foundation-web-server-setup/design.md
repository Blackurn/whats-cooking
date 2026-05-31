## Context

The repository is empty. CAPABILITIES.md describes a React + Express + Ollama recipe app, but no source files exist yet. This design covers only the foundational layer: the Express server and the static client shell. Ollama integration and full feature logic are deferred to subsequent changes.

## Goals / Non-Goals

**Goals:**
- Runnable Express server on port 3000 that serves the client statically
- Three API route stubs (`/api/recipe`, `/api/rewrite`, `/api/substitute`) returning 501 placeholders
- Two-panel HTML/CSS layout matching the window layout from CAPABILITIES.md
- Minimal JS entry wiring (`app.js`) with no feature logic yet
- `npm start` that boots the server

**Non-Goals:**
- Ollama integration or any real AI calls
- Full React component tree (plain HTML/JS for now; React can be introduced later)
- Playwright tests (separate change)
- Dev container or CI pipeline (separate change)
- History, dietary rewrite, substitution, or serving adjuster feature logic

## Decisions

**Plain HTML/JS instead of bundled React**
CAPABILITIES.md lists React as the frontend technology, but scaffolding a full React/Vite setup before any features exist adds build tooling complexity with no immediate benefit. The client shell will be plain HTML + vanilla JS served statically. React (or a bundler) can be introduced when the first component-heavy feature is added.

*Alternative considered:* Create-React-App / Vite scaffold — rejected because it introduces a build step, `node_modules` bloat, and framework lock-in before any UI logic exists.

**Express serves the client statically**
`express.static('src/client')` from the server means a single `npm start` boots everything with no separate dev server needed for this foundational phase.

*Alternative considered:* Separate frontend dev server (e.g., `live-server`) — rejected to keep the setup to one process and one port for simplicity.

**SSE for streaming (stub only)**
The recipe route will set `Content-Type: text/event-stream` headers even in the stub so the client-side EventSource pattern is exercised end-to-end before Ollama is wired in.

**Route files split by concern**
`recipe.js`, `rewrite.js`, `substitute.js` each in their own file under `src/server/routes/`, matching CAPABILITIES.md's folder structure exactly, to make future feature additions self-contained.

## Risks / Trade-offs

- [Vanilla JS client diverges from React target] → Accepted short-term; migrate to React as the first UI-heavy feature is built
- [SSE stub may mask real streaming complexity] → When Ollama integration lands, the SSE implementation needs a proper backpressure review
- [No error handling in stubs] → Acceptable for foundational scaffolding; error middleware can be added when real logic is introduced
