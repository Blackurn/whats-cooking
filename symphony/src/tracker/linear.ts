// Linear GraphQL tracker implementation — Section 11.2

import { TrackerClient, Issue, BlockerRef, TrackerConfig } from '../types';
import { SymphonyError } from '../errors';
import { logger } from '../logger';

const PAGE_SIZE = 50;
const NETWORK_TIMEOUT_MS = 30_000;

// --- GraphQL query fragments ---

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  priority
  state { name }
  branchName
  url
  labels { nodes { name } }
  inverseRelations(filter: { type: { eq: "blocks" } }) {
    nodes {
      issue {
        id
        identifier
        state { name }
      }
    }
  }
  createdAt
  updatedAt
`;

const CANDIDATE_ISSUES_QUERY = `
  query CandidateIssues($projectSlug: String!, $states: [String!]!, $after: String) {
    issues(
      filter: {
        project: { slugId: { eq: $projectSlug } }
        state: { name: { in: $states } }
      }
      first: ${PAGE_SIZE}
      after: $after
    ) {
      nodes { ${ISSUE_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ISSUES_BY_STATES_QUERY = `
  query IssuesByStates($states: [String!]!, $after: String) {
    issues(
      filter: { state: { name: { in: $states } } }
      first: ${PAGE_SIZE}
      after: $after
    ) {
      nodes { ${ISSUE_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ISSUE_STATES_BY_IDS_QUERY = `
  query IssueStatesByIds($ids: [ID!]!) {
    issues(filter: { id: { in: $ids } }, first: 250) {
      nodes {
        id
        state { name }
      }
    }
  }
`;

// --- HTTP helper ---

async function graphqlRequest(
  endpoint: string,
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new SymphonyError('linear_api_request', `Linear API request failed: ${String(e)}`, e);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new SymphonyError(
      'linear_api_status',
      `Linear API returned HTTP ${response.status} ${response.statusText}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (e) {
    throw new SymphonyError('linear_unknown_payload', `Failed to parse Linear JSON response: ${String(e)}`, e);
  }

  if (typeof body !== 'object' || body === null) {
    throw new SymphonyError('linear_unknown_payload', 'Linear response is not a JSON object');
  }

  const b = body as Record<string, unknown>;
  if (Array.isArray(b['errors']) && b['errors'].length > 0) {
    const msg = (b['errors'] as Array<{ message?: string }>)
      .map((e) => e.message ?? JSON.stringify(e))
      .join('; ');
    throw new SymphonyError('linear_graphql_errors', `Linear GraphQL errors: ${msg}`);
  }

  return b;
}

// --- Normalization (Section 11.3) ---

interface RawState { name?: unknown }
interface RawLabel { name?: unknown }
interface RawBlockerIssue { id?: unknown; identifier?: unknown; state?: RawState }
interface RawInverseRelation { issue?: RawBlockerIssue }
interface RawIssue {
  id?: unknown;
  identifier?: unknown;
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  state?: RawState;
  branchName?: unknown;
  url?: unknown;
  labels?: { nodes?: RawLabel[] };
  inverseRelations?: { nodes?: RawInverseRelation[] };
  createdAt?: unknown;
  updatedAt?: unknown;
}

function normalizeIssue(raw: RawIssue): Issue | null {
  const id = typeof raw.id === 'string' ? raw.id : null;
  const identifier = typeof raw.identifier === 'string' ? raw.identifier : null;
  const title = typeof raw.title === 'string' ? raw.title : null;
  const state = typeof raw.state?.name === 'string' ? raw.state.name : null;

  if (!id || !identifier || !title || !state) return null;

  const priority = typeof raw.priority === 'number' && Number.isInteger(raw.priority)
    ? raw.priority
    : null;

  const labels: string[] = (raw.labels?.nodes ?? [])
    .filter((l) => typeof l.name === 'string')
    .map((l) => (l.name as string).toLowerCase());

  const blockedBy: BlockerRef[] = (raw.inverseRelations?.nodes ?? []).map((rel) => ({
    id: typeof rel.issue?.id === 'string' ? rel.issue.id : null,
    identifier: typeof rel.issue?.identifier === 'string' ? rel.issue.identifier : null,
    state: typeof rel.issue?.state?.name === 'string' ? rel.issue.state.name : null,
  }));

  const parseDate = (v: unknown): Date | null => {
    if (typeof v === 'string') {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  return {
    id,
    identifier,
    title,
    description: typeof raw.description === 'string' ? raw.description : null,
    priority,
    state,
    branchName: typeof raw.branchName === 'string' ? raw.branchName : null,
    url: typeof raw.url === 'string' ? raw.url : null,
    labels,
    blockedBy,
    createdAt: parseDate(raw.createdAt),
    updatedAt: parseDate(raw.updatedAt),
  };
}

// --- LinearClient ---

export class LinearClient implements TrackerClient {
  constructor(private readonly config: TrackerConfig) {}

  async fetchCandidateIssues(): Promise<Issue[]> {
    const issues: Issue[] = [];
    let cursor: string | undefined;

    for (;;) {
      const body = await graphqlRequest(
        this.config.endpoint,
        this.config.apiKey,
        CANDIDATE_ISSUES_QUERY,
        {
          projectSlug: this.config.projectSlug,
          states: this.config.activeStates,
          after: cursor ?? null,
        },
      );

      const data = (body['data'] as Record<string, unknown> | undefined) ?? {};
      const issuesData = data['issues'] as { nodes?: unknown[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string } } | undefined;

      if (!issuesData) {
        throw new SymphonyError('linear_unknown_payload', 'Unexpected shape from Linear issues query');
      }

      for (const raw of issuesData.nodes ?? []) {
        const issue = normalizeIssue(raw as RawIssue);
        if (issue) issues.push(issue);
      }

      if (!issuesData.pageInfo?.hasNextPage) break;

      const endCursor = issuesData.pageInfo?.endCursor;
      if (!endCursor) {
        throw new SymphonyError('linear_missing_end_cursor', 'Linear pagination: hasNextPage=true but no endCursor');
      }
      cursor = endCursor;
    }

    logger.debug(`tracker_fetch_candidate_issues count=${issues.length}`);
    return issues;
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<Issue[]> {
    if (stateNames.length === 0) return [];

    const issues: Issue[] = [];
    let cursor: string | undefined;

    for (;;) {
      const body = await graphqlRequest(
        this.config.endpoint,
        this.config.apiKey,
        ISSUES_BY_STATES_QUERY,
        { states: stateNames, after: cursor ?? null },
      );

      const data = (body['data'] as Record<string, unknown> | undefined) ?? {};
      const issuesData = data['issues'] as { nodes?: unknown[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string } } | undefined;

      if (!issuesData) {
        throw new SymphonyError('linear_unknown_payload', 'Unexpected shape from Linear issues-by-states query');
      }

      for (const raw of issuesData.nodes ?? []) {
        const issue = normalizeIssue(raw as RawIssue);
        if (issue) issues.push(issue);
      }

      if (!issuesData.pageInfo?.hasNextPage) break;

      const endCursor = issuesData.pageInfo?.endCursor;
      if (!endCursor) {
        throw new SymphonyError('linear_missing_end_cursor', 'Linear pagination: hasNextPage=true but no endCursor');
      }
      cursor = endCursor;
    }

    return issues;
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<Map<string, string>> {
    if (issueIds.length === 0) return new Map();

    const body = await graphqlRequest(
      this.config.endpoint,
      this.config.apiKey,
      ISSUE_STATES_BY_IDS_QUERY,
      { ids: issueIds },
    );

    const data = (body['data'] as Record<string, unknown> | undefined) ?? {};
    const issuesData = data['issues'] as { nodes?: unknown[] } | undefined;

    if (!issuesData) {
      throw new SymphonyError('linear_unknown_payload', 'Unexpected shape from Linear issue-states-by-ids query');
    }

    const result = new Map<string, string>();
    for (const raw of issuesData.nodes ?? []) {
      const r = raw as { id?: unknown; state?: { name?: unknown } };
      if (typeof r.id === 'string' && typeof r.state?.name === 'string') {
        result.set(r.id, r.state.name);
      }
    }
    return result;
  }
}
