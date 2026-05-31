"use strict";
// Workspace manager — Section 9
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
exports.WorkspaceManager = void 0;
exports.sanitizeWorkspaceKey = sanitizeWorkspaceKey;
exports.assertUnderRoot = assertUnderRoot;
exports.computeWorkspacePath = computeWorkspacePath;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const logger_1 = require("./logger");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
// Section 4.2: replace chars outside [A-Za-z0-9._-] with _
function sanitizeWorkspaceKey(identifier) {
    return identifier.replace(/[^A-Za-z0-9._-]/g, '_');
}
// Section 9.5 Invariant 2: workspace_path must start with workspace_root + sep
function assertUnderRoot(workspaceRoot, workspacePath) {
    const normalizedRoot = path.resolve(workspaceRoot);
    const normalizedPath = path.resolve(workspacePath);
    const prefix = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep;
    if (!normalizedPath.startsWith(prefix)) {
        throw new Error(`Workspace path escapes root: ${normalizedPath} is not under ${normalizedRoot}`);
    }
}
function computeWorkspacePath(workspaceRoot, identifier) {
    const key = sanitizeWorkspaceKey(identifier);
    const workspacePath = path.join(workspaceRoot, key);
    assertUnderRoot(workspaceRoot, workspacePath);
    return workspacePath;
}
// Run a shell hook script in the workspace directory with a timeout
async function runHookScript(name, script, workspacePath, timeoutMs, issueIdentifier) {
    const ctx = { issue_identifier: issueIdentifier };
    logger_1.logger.info(`hook_start hook=${name}`, ctx);
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.execFile)('bash', ['-lc', script], { cwd: workspacePath, timeout: timeoutMs }, (err, stdout, stderr) => {
            if (stdout)
                logger_1.logger.debug(`hook_stdout hook=${name} output=${stdout.trim()}`);
            if (stderr)
                logger_1.logger.debug(`hook_stderr hook=${name} output=${stderr.trim()}`);
            if (err) {
                const anyErr = err;
                if (anyErr.killed || anyErr.signal === 'SIGTERM' || anyErr.signal === 'SIGKILL') {
                    reject(new Error(`Hook ${name} timed out after ${timeoutMs}ms`));
                }
                else {
                    reject(new Error(`Hook ${name} failed: ${err.message}`));
                }
                return;
            }
            resolve();
        });
        void child;
    });
}
class WorkspaceManager {
    config;
    constructor(config) {
        this.config = config;
    }
    // Section 9.2: create or reuse workspace, run after_create hook
    async ensureWorkspace(identifier) {
        const key = sanitizeWorkspaceKey(identifier);
        const workspacePath = path.join(this.config.workspace.root, key);
        assertUnderRoot(this.config.workspace.root, workspacePath);
        const exists = fs.existsSync(workspacePath);
        if (exists && !fs.statSync(workspacePath).isDirectory()) {
            throw new Error(`Workspace path exists but is not a directory: ${workspacePath}`);
        }
        if (!exists) {
            fs.mkdirSync(workspacePath, { recursive: true });
        }
        const createdNow = !exists;
        if (createdNow && this.config.hooks.afterCreate) {
            try {
                await runHookScript('after_create', this.config.hooks.afterCreate, workspacePath, this.config.hooks.timeoutMs, identifier);
                logger_1.logger.info(`hook_completed hook=after_create`, { issue_identifier: identifier });
            }
            catch (e) {
                // after_create failure is fatal to workspace creation
                try {
                    fs.rmdirSync(workspacePath);
                }
                catch { /* ignore */ }
                throw e;
            }
        }
        return { path: workspacePath, workspaceKey: key, createdNow };
    }
    async runBeforeRun(workspacePath, identifier) {
        if (!this.config.hooks.beforeRun)
            return;
        await runHookScript('before_run', this.config.hooks.beforeRun, workspacePath, this.config.hooks.timeoutMs, identifier);
    }
    async runAfterRun(workspacePath, identifier) {
        if (!this.config.hooks.afterRun)
            return;
        if (!fs.existsSync(workspacePath))
            return;
        try {
            await runHookScript('after_run', this.config.hooks.afterRun, workspacePath, this.config.hooks.timeoutMs, identifier);
        }
        catch (e) {
            // after_run failure is logged and ignored
            logger_1.logger.warn(`hook_failed hook=after_run err=${String(e)}`, { issue_identifier: identifier });
        }
    }
    async removeWorkspace(identifier) {
        const workspacePath = computeWorkspacePath(this.config.workspace.root, identifier);
        if (!fs.existsSync(workspacePath))
            return;
        if (this.config.hooks.beforeRemove) {
            try {
                await runHookScript('before_remove', this.config.hooks.beforeRemove, workspacePath, this.config.hooks.timeoutMs, identifier);
            }
            catch (e) {
                // before_remove failure is logged and ignored; cleanup still proceeds
                logger_1.logger.warn(`hook_failed hook=before_remove err=${String(e)}`, { issue_identifier: identifier });
            }
        }
        try {
            fs.rmSync(workspacePath, { recursive: true, force: true });
            logger_1.logger.info(`workspace_removed`, { issue_identifier: identifier });
        }
        catch (e) {
            logger_1.logger.warn(`workspace_remove_failed err=${String(e)}`, { issue_identifier: identifier });
        }
    }
    workspaceExists(identifier) {
        const p = computeWorkspacePath(this.config.workspace.root, identifier);
        return fs.existsSync(p);
    }
}
exports.WorkspaceManager = WorkspaceManager;
//# sourceMappingURL=workspace.js.map