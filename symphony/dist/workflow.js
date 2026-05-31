"use strict";
// Workflow loader — reads WORKFLOW.md, parses YAML front matter (Section 5)
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowWatcher = void 0;
exports.parseWorkflowFile = parseWorkflowFile;
exports.loadWorkflow = loadWorkflow;
exports.resolveWorkflowPath = resolveWorkflowPath;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const chokidar_1 = __importDefault(require("chokidar"));
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const FRONT_MATTER_DELIMITER = '---';
function parseWorkflowFile(content) {
    let config = {};
    let promptTemplate = content;
    if (content.startsWith(FRONT_MATTER_DELIMITER)) {
        const lines = content.split('\n');
        // Find the closing ---
        let closingIndex = -1;
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trimEnd() === FRONT_MATTER_DELIMITER) {
                closingIndex = i;
                break;
            }
        }
        if (closingIndex === -1) {
            throw new errors_1.SymphonyError('workflow_parse_error', 'Unclosed YAML front matter: no closing ---');
        }
        const frontMatterText = lines.slice(1, closingIndex).join('\n');
        const bodyText = lines.slice(closingIndex + 1).join('\n');
        let parsed;
        try {
            parsed = yaml.load(frontMatterText);
        }
        catch (e) {
            throw new errors_1.SymphonyError('workflow_parse_error', `YAML parse error: ${String(e)}`, e);
        }
        if (parsed !== null && parsed !== undefined) {
            if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new errors_1.SymphonyError('workflow_front_matter_not_a_map', 'WORKFLOW.md front matter must be a YAML map/object');
            }
            config = parsed;
        }
        promptTemplate = bodyText;
    }
    return {
        config,
        promptTemplate: promptTemplate.trim(),
    };
}
function loadWorkflow(workflowPath) {
    let content;
    try {
        content = fs.readFileSync(workflowPath, 'utf-8');
    }
    catch (e) {
        throw new errors_1.SymphonyError('missing_workflow_file', `Cannot read workflow file: ${workflowPath}`, e);
    }
    return parseWorkflowFile(content);
}
class WorkflowWatcher {
    workflowPath;
    onReload;
    onError;
    watcher = null;
    lastGoodDefinition = null;
    constructor(workflowPath, onReload, onError) {
        this.workflowPath = workflowPath;
        this.onReload = onReload;
        this.onError = onError;
    }
    start() {
        this.watcher = chokidar_1.default.watch(this.workflowPath, {
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
        });
        this.watcher.on('change', () => {
            logger_1.logger.info('workflow_file_changed action=reloading', { msg: `workflow_file_changed path=${this.workflowPath}` });
            this.reload();
        });
        this.watcher.on('error', (err) => {
            logger_1.logger.warn(`workflow_watcher_error err=${String(err)}`);
        });
    }
    reload() {
        try {
            const def = loadWorkflow(this.workflowPath);
            this.lastGoodDefinition = def;
            this.onReload(def);
            logger_1.logger.info(`workflow_reloaded action=completed path=${this.workflowPath}`);
        }
        catch (e) {
            const sym = e instanceof errors_1.SymphonyError ? e : new errors_1.SymphonyError('workflow_parse_error', String(e), e);
            logger_1.logger.error(`workflow_reload_failed code=${sym.code} msg=${sym.message}`);
            this.onError(sym);
        }
    }
    stop() {
        void this.watcher?.close();
        this.watcher = null;
    }
    getLastGood() {
        return this.lastGoodDefinition;
    }
}
exports.WorkflowWatcher = WorkflowWatcher;
function resolveWorkflowPath(explicit) {
    if (explicit)
        return path.resolve(explicit);
    return path.resolve(process.cwd(), 'WORKFLOW.md');
}
//# sourceMappingURL=workflow.js.map