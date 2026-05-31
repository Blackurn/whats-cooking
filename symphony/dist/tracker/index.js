"use strict";
// Tracker factory — Section 11
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTracker = createTracker;
const errors_1 = require("../errors");
const linear_1 = require("./linear");
function createTracker(config) {
    if (config.kind !== 'linear') {
        throw new errors_1.SymphonyError('unsupported_tracker_kind', `Unsupported tracker kind: ${config.kind}. Only "linear" is supported.`);
    }
    if (!config.apiKey) {
        throw new errors_1.SymphonyError('missing_tracker_api_key', 'tracker.api_key is missing or empty');
    }
    if (!config.projectSlug) {
        throw new errors_1.SymphonyError('missing_tracker_project_slug', 'tracker.project_slug is required for Linear');
    }
    return new linear_1.LinearClient(config);
}
//# sourceMappingURL=index.js.map