"use strict";
// Config layer — typed getters, defaults, $VAR resolution, validation (Section 6)
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseConfig = parseConfig;
exports.validateConfig = validateConfig;
exports.ensureWorkspaceRoot = ensureWorkspaceRoot;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const errors_1 = require("./errors");
// --- Defaults (Section 6.4) ---
const DEFAULT_TRACKER_ENDPOINT_LINEAR = 'https://api.linear.app/graphql';
const DEFAULT_ACTIVE_STATES = ['Todo', 'In Progress'];
const DEFAULT_TERMINAL_STATES = ['Closed', 'Cancelled', 'Canceled', 'Duplicate', 'Done'];
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_HOOKS_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_CONCURRENT_AGENTS = 10;
const DEFAULT_MAX_TURNS = 20;
const DEFAULT_MAX_RETRY_BACKOFF_MS = 300_000;
const DEFAULT_CODEX_COMMAND = 'codex app-server';
const DEFAULT_TURN_TIMEOUT_MS = 3_600_000;
const DEFAULT_READ_TIMEOUT_MS = 5_000;
const DEFAULT_STALL_TIMEOUT_MS = 300_000;
// --- Helpers ---
function str(raw) {
    return typeof raw === 'string' ? raw : undefined;
}
function num(raw) {
    if (typeof raw === 'number')
        return raw;
    if (typeof raw === 'string') {
        const n = Number(raw);
        return isNaN(n) ? undefined : n;
    }
    return undefined;
}
function strList(raw) {
    if (!Array.isArray(raw))
        return undefined;
    if (raw.every((x) => typeof x === 'string'))
        return raw;
    return undefined;
}
function obj(raw) {
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        return raw;
    }
    return undefined;
}
// Resolve $VAR_NAME env indirection (Section 6.1)
function resolveEnvVar(value, canonicalEnv) {
    if (!value)
        return canonicalEnv ? process.env[canonicalEnv] || undefined : undefined;
    if (value.startsWith('$')) {
        const varName = value.slice(1);
        const resolved = process.env[varName];
        return resolved && resolved.length > 0 ? resolved : undefined;
    }
    return value;
}
// Expand ~ and $VAR in path strings
function resolvePath(value, workflowDir) {
    if (!value)
        return undefined;
    let p = value;
    if (p.startsWith('~')) {
        p = os.homedir() + p.slice(1);
    }
    else if (p.startsWith('$')) {
        const varName = p.slice(1).split('/')[0];
        const rest = p.slice(varName.length + 1);
        const resolved = process.env[varName] ?? '';
        p = resolved + rest;
    }
    if (path.isAbsolute(p))
        return path.normalize(p);
    // Relative paths resolve relative to WORKFLOW.md directory
    if (workflowDir)
        return path.resolve(workflowDir, p);
    return path.resolve(p);
}
function defaultWorkspaceRoot() {
    return path.join(os.tmpdir(), 'symphony_workspaces');
}
// --- Parsing ---
function parseTracker(raw) {
    const t = raw ?? {};
    const kind = str(t['kind']) ?? '';
    const endpoint = str(t['endpoint']) ?? (kind === 'linear' ? DEFAULT_TRACKER_ENDPOINT_LINEAR : '');
    const apiKeyRaw = str(t['api_key']);
    const projectSlug = str(t['project_slug']) ?? '';
    const activeStates = strList(t['active_states']) ?? DEFAULT_ACTIVE_STATES;
    const terminalStates = strList(t['terminal_states']) ?? DEFAULT_TERMINAL_STATES;
    return { kind, endpoint, apiKeyRaw, projectSlug, activeStates, terminalStates };
}
function parsePolling(raw) {
    const p = raw ?? {};
    return { intervalMs: num(p['interval_ms']) ?? DEFAULT_POLL_INTERVAL_MS };
}
function parseWorkspace(raw, workflowDir) {
    const w = raw ?? {};
    const root = resolvePath(str(w['root']), workflowDir) ?? defaultWorkspaceRoot();
    return { root };
}
function parseHooks(raw) {
    const h = raw ?? {};
    const timeoutMs = num(h['timeout_ms']) ?? DEFAULT_HOOKS_TIMEOUT_MS;
    if (typeof timeoutMs !== 'number' || timeoutMs <= 0) {
        throw new errors_1.SymphonyError('workflow_parse_error', `hooks.timeout_ms must be a positive integer, got: ${h['timeout_ms']}`);
    }
    return {
        afterCreate: str(h['after_create']) ?? null,
        beforeRun: str(h['before_run']) ?? null,
        afterRun: str(h['after_run']) ?? null,
        beforeRemove: str(h['before_remove']) ?? null,
        timeoutMs,
    };
}
function parseAgent(raw) {
    const a = raw ?? {};
    const maxTurns = num(a['max_turns']) ?? DEFAULT_MAX_TURNS;
    if (!Number.isInteger(maxTurns) || maxTurns <= 0) {
        throw new errors_1.SymphonyError('workflow_parse_error', `agent.max_turns must be a positive integer, got: ${a['max_turns']}`);
    }
    const byStateRaw = obj(a['max_concurrent_agents_by_state']) ?? {};
    const maxConcurrentAgentsByState = {};
    for (const [k, v] of Object.entries(byStateRaw)) {
        const n = num(v);
        // Ignore non-positive or non-numeric entries
        if (n !== undefined && Number.isInteger(n) && n > 0) {
            maxConcurrentAgentsByState[k.toLowerCase()] = n;
        }
    }
    return {
        maxConcurrentAgents: num(a['max_concurrent_agents']) ?? DEFAULT_MAX_CONCURRENT_AGENTS,
        maxTurns,
        maxRetryBackoffMs: num(a['max_retry_backoff_ms']) ?? DEFAULT_MAX_RETRY_BACKOFF_MS,
        maxConcurrentAgentsByState,
    };
}
function parseCodex(raw) {
    const c = raw ?? {};
    const turnSandboxRaw = c['turn_sandbox_policy'];
    return {
        command: str(c['command']) ?? DEFAULT_CODEX_COMMAND,
        approvalPolicy: str(c['approval_policy']) ?? null,
        threadSandbox: str(c['thread_sandbox']) ?? null,
        turnSandboxPolicy: str(turnSandboxRaw) ?? obj(turnSandboxRaw) ?? null,
        turnTimeoutMs: num(c['turn_timeout_ms']) ?? DEFAULT_TURN_TIMEOUT_MS,
        readTimeoutMs: num(c['read_timeout_ms']) ?? DEFAULT_READ_TIMEOUT_MS,
        stallTimeoutMs: num(c['stall_timeout_ms']) ?? DEFAULT_STALL_TIMEOUT_MS,
    };
}
function parseServer(raw) {
    if (!raw)
        return { port: null };
    const port = num(raw['port']);
    return { port: port !== undefined ? port : null };
}
function parseConfig(rawConfig, workflowDir) {
    const trackerRaw = obj(rawConfig['tracker']);
    const parsed = parseTracker(trackerRaw);
    // Resolve API key from literal or $VAR, with canonical env fallback
    const apiKey = resolveEnvVar(parsed.apiKeyRaw, parsed.kind === 'linear' ? 'LINEAR_API_KEY' : undefined) ?? '';
    const tracker = {
        kind: parsed.kind,
        endpoint: parsed.endpoint,
        apiKey,
        projectSlug: parsed.projectSlug,
        activeStates: parsed.activeStates,
        terminalStates: parsed.terminalStates,
    };
    return {
        tracker,
        polling: parsePolling(obj(rawConfig['polling'])),
        workspace: parseWorkspace(obj(rawConfig['workspace']), workflowDir),
        hooks: parseHooks(obj(rawConfig['hooks'])),
        agent: parseAgent(obj(rawConfig['agent'])),
        codex: parseCodex(obj(rawConfig['codex'])),
        server: parseServer(obj(rawConfig['server'])),
    };
}
function validateConfig(config) {
    const errors = [];
    if (!config.tracker.kind) {
        errors.push('tracker.kind is required');
    }
    else if (config.tracker.kind !== 'linear') {
        errors.push(`unsupported tracker.kind: ${config.tracker.kind}`);
    }
    if (!config.tracker.apiKey) {
        errors.push('tracker.api_key is missing or resolved to empty string');
    }
    if (config.tracker.kind === 'linear' && !config.tracker.projectSlug) {
        errors.push('tracker.project_slug is required when tracker.kind is linear');
    }
    if (!config.codex.command || config.codex.command.trim() === '') {
        errors.push('codex.command is required and must be non-empty');
    }
    return { valid: errors.length === 0, errors };
}
// Ensure the workspace root directory exists
function ensureWorkspaceRoot(config) {
    fs.mkdirSync(config.workspace.root, { recursive: true });
}
//# sourceMappingURL=config.js.map