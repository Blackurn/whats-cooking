---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: whats-cooking-43624bd1540e
  active_states:
    - Todo
  terminal_states:
    - Done

polling:
  interval_ms: 30000

workspace:
  root: .symphony/workspaces

hooks:
  timeout_ms: 60000

agent:
  max_concurrent_agents: 1
  max_turns: 20
  max_retry_backoff_ms: 300000

codex:
  command: codex app-server
  approval_policy: on-request
  thread_sandbox: workspace-write
  turn_sandbox_policy: workspace-write

server:
  port: 3766
---

You are working on Linear issue {{ issue.identifier }}: {{ issue.title }}.

Issue URL: {{ issue.url }}

Description:
{{ issue.description }}

Work in the repository workspace. Make focused changes, run relevant checks, and move the issue toward the next appropriate handoff state.
