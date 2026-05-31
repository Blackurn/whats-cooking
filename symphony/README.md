# Symphony

Symphony is a long-running issue orchestration service for Codex app-server worker sessions.

## Startup

From the repository root:

```sh
set -a
source .env
set +a
npm --prefix symphony start -- --workflow ../WORKFLOW.md
```

The committed `WORKFLOW.md` is safe to version because it references `$LINEAR_API_KEY` instead of storing a token. Keep `.env`, `WORKFLOW.local.md`, and `.symphony/` untracked.

To use local-only overrides:

```sh
npm --prefix symphony start -- --workflow ../WORKFLOW.local.md
```

The default workflow starts the optional dashboard on:

```text
http://127.0.0.1:3766
```

## Trust and Safety Posture

This implementation is intended for trusted local or controlled automation environments.

- Codex approval requests for command execution and file changes are auto-approved for the active session.
- `codex.approval_policy`, `codex.thread_sandbox`, and `codex.turn_sandbox_policy` are passed through from `WORKFLOW.md` when configured.
- User-input-required tool requests are treated as hard run failures so a worker cannot stall indefinitely.
- Workspace isolation is filesystem-scoped: each run launches Codex with the per-issue workspace as `cwd`, and workspace paths are checked to remain under `workspace.root`.

Deployments that run untrusted tracker input or broad credentials should tighten Codex sandbox/approval settings and add host-level isolation appropriate to their risk profile.
