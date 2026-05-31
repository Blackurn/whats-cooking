"use strict";
// Named error codes from the spec (Sections 5.5, 10.6, 11.4)
Object.defineProperty(exports, "__esModule", { value: true });
exports.SymphonyError = void 0;
exports.isTrackerError = isTrackerError;
class SymphonyError extends Error {
    code;
    cause;
    constructor(code, message, cause) {
        super(message);
        this.code = code;
        this.cause = cause;
        this.name = 'SymphonyError';
    }
}
exports.SymphonyError = SymphonyError;
function isTrackerError(e) {
    return e instanceof SymphonyError && (e.code.startsWith('linear_') || e.code.startsWith('missing_tracker') || e.code === 'unsupported_tracker_kind');
}
//# sourceMappingURL=errors.js.map