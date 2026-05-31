// Named error codes from the spec (Sections 5.5, 10.6, 11.4)

export type WorkflowErrorCode =
  | 'missing_workflow_file'
  | 'workflow_parse_error'
  | 'workflow_front_matter_not_a_map'
  | 'template_parse_error'
  | 'template_render_error';

export type TrackerErrorCode =
  | 'unsupported_tracker_kind'
  | 'missing_tracker_api_key'
  | 'missing_tracker_project_slug'
  | 'linear_api_request'
  | 'linear_api_status'
  | 'linear_graphql_errors'
  | 'linear_unknown_payload'
  | 'linear_missing_end_cursor';

export type AgentErrorCode =
  | 'codex_not_found'
  | 'invalid_workspace_cwd'
  | 'response_timeout'
  | 'turn_timeout'
  | 'port_exit'
  | 'response_error'
  | 'turn_failed'
  | 'turn_cancelled'
  | 'turn_input_required';

export type SymphonyErrorCode = WorkflowErrorCode | TrackerErrorCode | AgentErrorCode;

export class SymphonyError extends Error {
  constructor(
    public readonly code: SymphonyErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SymphonyError';
  }
}

export function isTrackerError(e: unknown): e is SymphonyError {
  return e instanceof SymphonyError && (e.code.startsWith('linear_') || e.code.startsWith('missing_tracker') || e.code === 'unsupported_tracker_kind');
}
