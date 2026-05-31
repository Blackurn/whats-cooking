# Architecture

## Components

```
Browser (HTML/CSS/JS)
    │
    │  HTTP  /  Server-Sent Events
    ▼
Express  (Node.js · port 3000)
    │  serves /src/client statically
    │  routes /api/recipe
    │         /api/rewrite
    │         /api/substitute
    ▼
Ollama  (local LLM · port 11434)
    └─ model: tinyllama / phi3.5
```

## Request Flow

```
User submits ingredients
    → POST /api/recipe
        → Express route handler
            → Ollama stream (token-by-token)
                → Server-Sent Events back to browser
                    → recipe text appears progressively
```

## Key Decisions

| Decision | Rationale |
|---|---|
| Plain HTML/JS client | No build step at foundation phase — migrates to React when first component-heavy feature lands |
| Single Express process | Serves both the API and static client files; one port, one process |
| Ollama (local LLM) | All inference runs on-device — no API keys, no data egress |
| Route-per-concern | `recipe.js`, `rewrite.js`, `substitute.js` each own their endpoint for clean future expansion |

## Folder Structure

```
src/
├── server/
│   ├── index.js          # Express app entry point
│   └── routes/
│       ├── recipe.js     # POST /api/recipe
│       ├── rewrite.js    # POST /api/rewrite
│       └── substitute.js # POST /api/substitute
└── client/
    ├── index.html
    ├── app.js
    └── style.css
```

> This document grows with the project. New capabilities add sections here when their architecture is non-obvious.
