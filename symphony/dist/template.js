"use strict";
// Prompt template rendering — Section 12 (Liquid strict mode)
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPrompt = renderPrompt;
const liquidjs_1 = require("liquidjs");
const errors_1 = require("./errors");
const FALLBACK_PROMPT = 'You are working on an issue from Linear.';
const engine = new liquidjs_1.Liquid({
    strictVariables: true,
    strictFilters: true,
    greedy: false,
});
// Convert Issue to a plain template-friendly object (Section 12.2)
function issueToTemplateVars(issue) {
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
async function renderPrompt(promptTemplate, issue, attempt) {
    if (!promptTemplate)
        return FALLBACK_PROMPT;
    const vars = {
        issue: issueToTemplateVars(issue),
        attempt: attempt ?? null,
    };
    try {
        return await engine.parseAndRender(promptTemplate, vars);
    }
    catch (e) {
        const msg = String(e);
        // Distinguish parse vs render errors
        if (msg.includes('unknown tag') || msg.includes('unknown filter')) {
            throw new errors_1.SymphonyError('template_parse_error', `Template parse error: ${msg}`, e);
        }
        throw new errors_1.SymphonyError('template_render_error', `Template render error: ${msg}`, e);
    }
}
//# sourceMappingURL=template.js.map