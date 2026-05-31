"use strict";
// Linear GraphQL tracker implementation — Section 11.2
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinearClient = void 0;
const errors_1 = require("../errors");
const logger_1 = require("../logger");
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
  inverseRelations {
    nodes {
      type
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
async function graphqlRequest(endpoint, apiKey, query, variables) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
    let response;
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
    }
    catch (e) {
        throw new errors_1.SymphonyError('linear_api_request', `Linear API request failed: ${String(e)}`, e);
    }
    finally {
        clearTimeout(timer);
    }
    if (!response.ok) {
        throw new errors_1.SymphonyError('linear_api_status', `Linear API returned HTTP ${response.status} ${response.statusText}`);
    }
    let body;
    try {
        body = await response.json();
    }
    catch (e) {
        throw new errors_1.SymphonyError('linear_unknown_payload', `Failed to parse Linear JSON response: ${String(e)}`, e);
    }
    if (typeof body !== 'object' || body === null) {
        throw new errors_1.SymphonyError('linear_unknown_payload', 'Linear response is not a JSON object');
    }
    const b = body;
    if (Array.isArray(b['errors']) && b['errors'].length > 0) {
        const msg = b['errors']
            .map((e) => e.message ?? JSON.stringify(e))
            .join('; ');
        throw new errors_1.SymphonyError('linear_graphql_errors', `Linear GraphQL errors: ${msg}`);
    }
    return b;
}
function normalizeIssue(raw) {
    const id = typeof raw.id === 'string' ? raw.id : null;
    const identifier = typeof raw.identifier === 'string' ? raw.identifier : null;
    const title = typeof raw.title === 'string' ? raw.title : null;
    const state = typeof raw.state?.name === 'string' ? raw.state.name : null;
    if (!id || !identifier || !title || !state)
        return null;
    const priority = typeof raw.priority === 'number' && Number.isInteger(raw.priority)
        ? raw.priority
        : null;
    const labels = (raw.labels?.nodes ?? [])
        .filter((l) => typeof l.name === 'string')
        .map((l) => l.name.toLowerCase());
    const blockedBy = (raw.inverseRelations?.nodes ?? [])
        .filter((rel) => typeof rel.type !== 'string' || rel.type.toLowerCase() === 'blocks')
        .map((rel) => ({
        id: typeof rel.issue?.id === 'string' ? rel.issue.id : null,
        identifier: typeof rel.issue?.identifier === 'string' ? rel.issue.identifier : null,
        state: typeof rel.issue?.state?.name === 'string' ? rel.issue.state.name : null,
    }));
    const parseDate = (v) => {
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
class LinearClient {
    config;
    constructor(config) {
        this.config = config;
    }
    async fetchCandidateIssues() {
        const issues = [];
        let cursor;
        for (;;) {
            const body = await graphqlRequest(this.config.endpoint, this.config.apiKey, CANDIDATE_ISSUES_QUERY, {
                projectSlug: this.config.projectSlug,
                states: this.config.activeStates,
                after: cursor ?? null,
            });
            const data = body['data'] ?? {};
            const issuesData = data['issues'];
            if (!issuesData) {
                throw new errors_1.SymphonyError('linear_unknown_payload', 'Unexpected shape from Linear issues query');
            }
            for (const raw of issuesData.nodes ?? []) {
                const issue = normalizeIssue(raw);
                if (issue)
                    issues.push(issue);
            }
            if (!issuesData.pageInfo?.hasNextPage)
                break;
            const endCursor = issuesData.pageInfo?.endCursor;
            if (!endCursor) {
                throw new errors_1.SymphonyError('linear_missing_end_cursor', 'Linear pagination: hasNextPage=true but no endCursor');
            }
            cursor = endCursor;
        }
        logger_1.logger.debug(`tracker_fetch_candidate_issues count=${issues.length}`);
        return issues;
    }
    async fetchIssuesByStates(stateNames) {
        if (stateNames.length === 0)
            return [];
        const issues = [];
        let cursor;
        for (;;) {
            const body = await graphqlRequest(this.config.endpoint, this.config.apiKey, ISSUES_BY_STATES_QUERY, { states: stateNames, after: cursor ?? null });
            const data = body['data'] ?? {};
            const issuesData = data['issues'];
            if (!issuesData) {
                throw new errors_1.SymphonyError('linear_unknown_payload', 'Unexpected shape from Linear issues-by-states query');
            }
            for (const raw of issuesData.nodes ?? []) {
                const issue = normalizeIssue(raw);
                if (issue)
                    issues.push(issue);
            }
            if (!issuesData.pageInfo?.hasNextPage)
                break;
            const endCursor = issuesData.pageInfo?.endCursor;
            if (!endCursor) {
                throw new errors_1.SymphonyError('linear_missing_end_cursor', 'Linear pagination: hasNextPage=true but no endCursor');
            }
            cursor = endCursor;
        }
        return issues;
    }
    async fetchIssueStatesByIds(issueIds) {
        if (issueIds.length === 0)
            return new Map();
        const body = await graphqlRequest(this.config.endpoint, this.config.apiKey, ISSUE_STATES_BY_IDS_QUERY, { ids: issueIds });
        const data = body['data'] ?? {};
        const issuesData = data['issues'];
        if (!issuesData) {
            throw new errors_1.SymphonyError('linear_unknown_payload', 'Unexpected shape from Linear issue-states-by-ids query');
        }
        const result = new Map();
        for (const raw of issuesData.nodes ?? []) {
            const r = raw;
            if (typeof r.id === 'string' && typeof r.state?.name === 'string') {
                result.set(r.id, r.state.name);
            }
        }
        return result;
    }
}
exports.LinearClient = LinearClient;
//# sourceMappingURL=linear.js.map