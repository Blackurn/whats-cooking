// Prompt template rendering — Section 12 (Liquid strict mode)

import { Liquid } from 'liquidjs';
import { Issue } from './types';
import { SymphonyError } from './errors';

const FALLBACK_PROMPT = 'You are working on an issue from Linear.';

const engine = new Liquid({
  strictVariables: true,
  strictFilters: true,
  greedy: false,
});

// Convert Issue to a plain template-friendly object (Section 12.2)
function issueToTemplateVars(issue: Issue): Record<string, unknown> {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? '',
    priority: issue.priority ?? null,
    state: issue.state,
    branch_name: issue.branchName ?? null,
    url: issue.url ?? null,
    labels: issue.labels,
    blocked_by: issue.blockedBy.map((b) => ({
      id: b.id,
      identifier: b.identifier,
      state: b.state,
    })),
    created_at: issue.createdAt?.toISOString() ?? null,
    updated_at: issue.updatedAt?.toISOString() ?? null,
  };
}

export async function renderPrompt(
  promptTemplate: string,
  issue: Issue,
  attempt: number | null,
): Promise<string> {
  if (!promptTemplate) return FALLBACK_PROMPT;

  const vars: Record<string, unknown> = {
    issue: issueToTemplateVars(issue),
    attempt: attempt ?? null,
  };

  try {
    return await engine.parseAndRender(promptTemplate, vars);
  } catch (e) {
    const msg = String(e);
    // Distinguish parse vs render errors
    if (msg.includes('unknown tag') || msg.includes('unknown filter')) {
      throw new SymphonyError('template_parse_error', `Template parse error: ${msg}`, e);
    }
    throw new SymphonyError('template_render_error', `Template render error: ${msg}`, e);
  }
}
