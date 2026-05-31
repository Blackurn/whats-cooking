"use strict";
// Structured logger — emits key=value lines to stderr (Section 13.1)
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
function formatKV(obj) {
    return Object.entries(obj)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(' ');
}
function emit(level, message, ctx) {
    const base = {
        time: new Date().toISOString(),
        level,
        msg: message,
    };
    if (ctx) {
        Object.assign(base, ctx);
    }
    process.stderr.write(formatKV(base) + '\n');
}
exports.logger = {
    info(msg, ctx) {
        emit('info', msg, ctx);
    },
    warn(msg, ctx) {
        emit('warn', msg, ctx);
    },
    error(msg, ctx) {
        emit('error', msg, ctx);
    },
    debug(msg, ctx) {
        if (process.env.SYMPHONY_DEBUG) {
            emit('debug', msg, ctx);
        }
    },
};
//# sourceMappingURL=logger.js.map