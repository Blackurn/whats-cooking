"use strict";
// Orchestrator — Sections 7, 8 (poll loop, state machine, retry, reconciliation)
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
exports.Orchestrator = void 0;
const path = __importStar(require("path"));
const workflow_1 = require("./workflow");
const config_1 = require("./config");
const index_1 = require("./tracker/index");
const workspace_1 = require("./workspace");
const runner_1 = require("./runner");
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const CONTINUATION_RETRY_DELAY_MS = 1_000;
// --- Backoff formula (Section 8.4) ---
function calcRetryDelay(attempt, isFailure, maxBackoffMs) {
    if (!isFailure)
        return CONTINUATION_RETRY_DELAY_MS;
    return Math.min(10_000 * Math.pow(2, attempt - 1), maxBackoffMs);
}
// --- Dispatch priority sort (Section 8.2) ---
function sortCandidates(issues) {
    return [...issues].sort((a, b) => {
        // priority ascending (null/0 sorts last)
        const pa = a.priority ?? 999;
        const pb = b.priority ?? 999;
        if (pa !== pb)
            return pa - pb;
        // oldest created_at first
        const ta = a.createdAt?.getTime() ?? Infinity;
        const tb = b.createdAt?.getTime() ?? Infinity;
        if (ta !== tb)
            return ta - tb;
        // lexicographic tie-breaker
        return a.identifier.localeCompare(b.identifier);
    });
}
class Orchestrator {
    state;
    config = null;
    promptTemplate = '';
    tracker = null;
    workspaceManager = null;
    watcher = null;
    pollTimer = null;
    running = false;
    listeners = [];
    workflowPath;
    endedSessionSeconds = 0;
    constructor(workflowPath) {
        this.workflowPath = (0, workflow_1.resolveWorkflowPath)(workflowPath);
        this.state = {
            pollIntervalMs: 30_000,
            maxConcurrentAgents: 10,
            running: new Map(),
            claimed: new Set(),
            retryAttempts: new Map(),
            completed: new Set(),
            codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
            codexRateLimits: null,
        };
    }
    addListener(l) {
        this.listeners.push(l);
    }
    notify(type, data) {
        for (const l of this.listeners) {
            try {
                l(type, data);
            }
            catch { /* ignore */ }
        }
    }
    getState() {
        return this.state;
    }
    getConfig() {
        return this.config;
    }
    // Section 8.6: startup terminal workspace cleanup
    async startupCleanup() {
        if (!this.tracker || !this.config)
            return;
        try {
            const terminalIssues = await this.tracker.fetchIssuesByStates(this.config.tracker.terminalStates);
            for (const issue of terminalIssues) {
                if (this.workspaceManager?.workspaceExists(issue.identifier)) {
                    logger_1.logger.info(`startup_cleanup_removing_workspace`, { issue_identifier: issue.identifier });
                    await this.workspaceManager.removeWorkspace(issue.identifier);
                }
            }
        }
        catch (e) {
            logger_1.logger.warn(`startup_cleanup_failed err=${String(e)}`);
        }
    }
    applyWorkflow(def) {
        const workflowDir = path.dirname(this.workflowPath);
        const newConfig = (0, config_1.parseConfig)(def.config, workflowDir);
        const validation = (0, config_1.validateConfig)(newConfig);
        if (!validation.valid) {
            throw new errors_1.SymphonyError('workflow_parse_error', `Workflow validation failed: ${validation.errors.join('; ')}`);
        }
        const newTracker = (0, index_1.createTracker)(newConfig.tracker);
        const newWorkspaceManager = new workspace_1.WorkspaceManager(newConfig);
        (0, config_1.ensureWorkspaceRoot)(newConfig);
        this.config = newConfig;
        this.promptTemplate = def.promptTemplate;
        this.tracker = newTracker;
        this.workspaceManager = newWorkspaceManager;
        this.state.pollIntervalMs = newConfig.polling.intervalMs;
        this.state.maxConcurrentAgents = newConfig.agent.maxConcurrentAgents;
    }
    reloadWorkflowKeepingLastGood() {
        try {
            const freshDef = (0, workflow_1.loadWorkflow)(this.workflowPath);
            this.applyWorkflow(freshDef);
            return true;
        }
        catch (e) {
            logger_1.logger.error(`workflow_reload_error msg=${String(e)}`);
            this.notify('error', e);
            return false;
        }
    }
    async start() {
        if (this.running)
            throw new Error('Orchestrator already running');
        this.running = true;
        // Load initial workflow
        let def;
        try {
            def = (0, workflow_1.loadWorkflow)(this.workflowPath);
        }
        catch (e) {
            logger_1.logger.error(`startup_failed err=${String(e)}`);
            throw e;
        }
        this.applyWorkflow(def);
        // Validate before starting
        if (!this.config)
            throw new Error('Config not initialized');
        const v = (0, config_1.validateConfig)(this.config);
        if (!v.valid) {
            const msg = `Startup validation failed: ${v.errors.join('; ')}`;
            logger_1.logger.error(msg);
            throw new errors_1.SymphonyError('missing_tracker_api_key', msg);
        }
        // Watch for WORKFLOW.md changes (Section 6.2)
        this.watcher = new workflow_1.WorkflowWatcher(this.workflowPath, (newDef) => {
            try {
                this.applyWorkflow(newDef);
                this.notify('state_change');
            }
            catch (e) {
                logger_1.logger.error(`workflow_reload_error msg=${String(e)}`);
                this.notify('error', e);
            }
        }, (err) => {
            logger_1.logger.error(`workflow_reload_error code=${err.code} msg=${err.message}`);
            // Keep operating with last known good config
        });
        this.watcher.start();
        await this.startupCleanup();
        // Schedule immediate first tick
        this.scheduleTick(0);
        logger_1.logger.info(`orchestrator_started workflow=${this.workflowPath}`);
    }
    stop() {
        this.running = false;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
        this.watcher?.stop();
        // Abort all running workers
        for (const [issueId, entry] of this.state.running) {
            logger_1.logger.info(`orchestrator_stopping_worker`, { issue_id: issueId, issue_identifier: entry.issue.identifier });
            entry.abort?.();
        }
        // Cancel all retry timers
        for (const [, retry] of this.state.retryAttempts) {
            clearTimeout(retry.timerHandle);
        }
        this.state.retryAttempts.clear();
        logger_1.logger.info('orchestrator_stopped');
    }
    scheduleTick(delayMs) {
        if (!this.running)
            return;
        if (this.pollTimer)
            clearTimeout(this.pollTimer);
        this.pollTimer = setTimeout(() => void this.tick(), delayMs);
    }
    async tick() {
        if (!this.running)
            return;
        const config = this.config;
        if (!config) {
            logger_1.logger.warn('tick_skipped reason=no_config');
            this.scheduleTick(this.state.pollIntervalMs);
            return;
        }
        try {
            // Step 1: Reconcile
            await this.reconcile(config);
            // Step 2: Defensive reload before dispatch; invalid reloads keep the last good config.
            this.reloadWorkflowKeepingLastGood();
            const effectiveConfig = this.config ?? config;
            // Step 3: Validate config before dispatch
            const v = (0, config_1.validateConfig)(effectiveConfig);
            if (!v.valid) {
                logger_1.logger.error(`dispatch_skipped reason=validation_failed errors=${v.errors.join('; ')}`);
                this.notify('error', v);
                this.scheduleTick(effectiveConfig.polling.intervalMs);
                return;
            }
            // Step 4: Fetch candidates
            let candidates;
            try {
                candidates = await this.tracker.fetchCandidateIssues();
            }
            catch (e) {
                logger_1.logger.error(`candidate_fetch_failed err=${String(e)}`);
                this.scheduleTick(effectiveConfig.polling.intervalMs);
                return;
            }
            // Step 5: Sort
            const sorted = sortCandidates(candidates);
            // Step 6: Dispatch
            for (const issue of sorted) {
                if (this.availableSlots(effectiveConfig) <= 0)
                    break;
                if (this.isEligible(issue, effectiveConfig)) {
                    this.dispatch(issue, null, effectiveConfig);
                }
            }
        }
        catch (e) {
            logger_1.logger.error(`tick_error err=${String(e)}`);
        }
        this.notify('tick_complete');
        this.scheduleTick(this.state.pollIntervalMs);
    }
    // Section 8.5: reconciliation
    async reconcile(config) {
        // Part A: Stall detection
        if (config.codex.stallTimeoutMs > 0) {
            const now = Date.now();
            for (const [issueId, entry] of this.state.running) {
                const session = entry.session;
                const lastEventMs = session?.lastCodexTimestamp?.getTime() ?? entry.startedAt.getTime();
                const elapsed = now - lastEventMs;
                if (elapsed > config.codex.stallTimeoutMs) {
                    logger_1.logger.warn(`stall_detected elapsed=${elapsed}ms`, {
                        issue_id: issueId,
                        issue_identifier: entry.issue.identifier,
                    });
                    this.terminateWorker(issueId, 'stall');
                    this.scheduleRetry(issueId, entry.issue.identifier, (entry.session?.turnCount ?? 0) + 1, true, 'stall_timeout', config);
                }
            }
        }
        // Part B: Tracker state refresh
        const runningIds = [...this.state.running.keys()];
        if (runningIds.length === 0)
            return;
        let currentStates;
        try {
            currentStates = await this.tracker.fetchIssueStatesByIds(runningIds);
        }
        catch (e) {
            logger_1.logger.warn(`reconcile_state_refresh_failed err=${String(e)}`);
            return; // Keep workers running, try again next tick
        }
        for (const [issueId, entry] of this.state.running) {
            const currentState = currentStates.get(issueId);
            if (!currentState)
                continue;
            const isTerminal = config.tracker.terminalStates
                .map((s) => s.toLowerCase())
                .includes(currentState.toLowerCase());
            const isActive = config.tracker.activeStates
                .map((s) => s.toLowerCase())
                .includes(currentState.toLowerCase());
            if (isTerminal) {
                logger_1.logger.info(`reconcile_terminating issue_state=${currentState}`, {
                    issue_id: issueId,
                    issue_identifier: entry.issue.identifier,
                });
                this.terminateWorker(issueId, 'terminal_state');
                await this.workspaceManager?.removeWorkspace(entry.issue.identifier);
                this.state.claimed.delete(issueId);
            }
            else if (isActive) {
                // Update in-memory state snapshot
                entry.issue = { ...entry.issue, state: currentState };
            }
            else {
                // Neither active nor terminal — stop without workspace cleanup
                logger_1.logger.info(`reconcile_stopping_non_active issue_state=${currentState}`, {
                    issue_id: issueId,
                    issue_identifier: entry.issue.identifier,
                });
                this.terminateWorker(issueId, 'non_active_state');
                this.state.claimed.delete(issueId);
            }
        }
    }
    terminateWorker(issueId, reason) {
        const entry = this.state.running.get(issueId);
        if (!entry)
            return;
        logger_1.logger.info(`worker_terminating reason=${reason}`, {
            issue_id: issueId,
            issue_identifier: entry.issue.identifier,
        });
        entry.abort?.();
        this.endedSessionSeconds += (Date.now() - entry.startedAt.getTime()) / 1000;
        this.state.running.delete(issueId);
    }
    availableSlots(config) {
        return Math.max(config.agent.maxConcurrentAgents - this.state.running.size, 0);
    }
    perStateSlots(state, config) {
        const key = state.toLowerCase();
        const cap = config.agent.maxConcurrentAgentsByState[key];
        if (cap === undefined)
            return this.availableSlots(config);
        const runningInState = [...this.state.running.values()].filter((e) => e.issue.state.toLowerCase() === key).length;
        return Math.max(cap - runningInState, 0);
    }
    isEligible(issue, config) {
        if (!issue.id || !issue.identifier || !issue.title || !issue.state)
            return false;
        const stateNorm = issue.state.toLowerCase();
        const activeNorm = config.tracker.activeStates.map((s) => s.toLowerCase());
        const terminalNorm = config.tracker.terminalStates.map((s) => s.toLowerCase());
        if (!activeNorm.includes(stateNorm))
            return false;
        if (terminalNorm.includes(stateNorm))
            return false;
        if (this.state.running.has(issue.id))
            return false;
        if (this.state.claimed.has(issue.id))
            return false;
        if (this.availableSlots(config) <= 0)
            return false;
        if (this.perStateSlots(issue.state, config) <= 0)
            return false;
        // Blocker rule: Todo issues blocked by non-terminal issues don't dispatch
        if (stateNorm === 'todo') {
            for (const blocker of issue.blockedBy) {
                const bState = blocker.state?.toLowerCase() ?? '';
                if (!terminalNorm.includes(bState))
                    return false;
            }
        }
        return true;
    }
    dispatch(issue, attempt, config) {
        this.state.claimed.add(issue.id);
        const controller = new AbortController();
        const startedAt = new Date();
        const entry = {
            issue,
            attempt,
            workspacePath: '',
            startedAt,
            session: null,
            abort: () => controller.abort(),
        };
        this.state.running.set(issue.id, entry);
        logger_1.logger.info(`dispatching attempt=${attempt ?? 0}`, {
            issue_id: issue.id,
            issue_identifier: issue.identifier,
        });
        void this.runWorker(issue, attempt, config, controller.signal);
    }
    async runWorker(issue, attempt, config, signal) {
        const ctx = { issue_id: issue.id, issue_identifier: issue.identifier };
        const result = await (0, runner_1.runAgent)({
            issue,
            attempt,
            promptTemplate: this.promptTemplate,
            workspaceManager: this.workspaceManager,
            trackerClient: this.tracker,
            config,
            signal,
            onEvent: (event) => {
                const entry = this.state.running.get(issue.id);
                if (!entry)
                    return;
                // Update session on the running entry from event data
                if (event.threadId && event.turnId) {
                    entry.session ??= {
                        sessionId: `${event.threadId}-${event.turnId}`,
                        threadId: event.threadId,
                        turnId: event.turnId,
                        codexAppServerPid: event.codexAppServerPid,
                        lastCodexEvent: event.event,
                        lastCodexTimestamp: event.timestamp,
                        lastCodexMessage: null,
                        codexInputTokens: 0,
                        codexOutputTokens: 0,
                        codexTotalTokens: 0,
                        lastReportedInputTokens: 0,
                        lastReportedOutputTokens: 0,
                        lastReportedTotalTokens: 0,
                        turnCount: 0,
                    };
                    entry.session.lastCodexEvent = event.event;
                    entry.session.lastCodexTimestamp = event.timestamp;
                    if (typeof event.payload?.['turnCount'] === 'number') {
                        entry.session.turnCount = event.payload['turnCount'];
                    }
                }
                // Rate limit tracking
                const params = event.payload?.['params'];
                const rateLimits = event.payload?.['rateLimits'] ??
                    (typeof params === 'object' && params !== null
                        ? params['rateLimits']
                        : undefined);
                if (rateLimits) {
                    this.state.codexRateLimits = rateLimits;
                }
                this.notify('state_change');
            },
        });
        // Worker exited. If reconciliation already removed this entry, it also made
        // the scheduling decision, so do not enqueue a second retry here.
        const runningEntry = this.state.running.get(issue.id);
        if (!runningEntry) {
            this.state.codexTotals.inputTokens += result.inputTokens;
            this.state.codexTotals.outputTokens += result.outputTokens;
            this.state.codexTotals.totalTokens += result.totalTokens;
            this.state.codexTotals.secondsRunning = this.endedSessionSeconds;
            this.notify('state_change');
            return;
        }
        const elapsed = (Date.now() - runningEntry.startedAt.getTime()) / 1000;
        this.endedSessionSeconds += elapsed;
        this.state.running.delete(issue.id);
        // Accumulate token totals
        this.state.codexTotals.inputTokens += result.inputTokens;
        this.state.codexTotals.outputTokens += result.outputTokens;
        this.state.codexTotals.totalTokens += result.totalTokens;
        this.state.codexTotals.secondsRunning = this.endedSessionSeconds;
        if (result.success) {
            logger_1.logger.info(`worker_succeeded turns=${result.finalTurnCount}`, ctx);
            this.state.completed.add(issue.id);
            // Schedule continuation retry (Section 7.1)
            if (this.running)
                this.scheduleRetry(issue.id, issue.identifier, 1, false, null, config);
        }
        else {
            logger_1.logger.warn(`worker_failed err=${result.error ?? 'unknown'}`, ctx);
            const currentAttempt = (attempt ?? 0) + 1;
            if (this.running)
                this.scheduleRetry(issue.id, issue.identifier, currentAttempt, true, result.error ?? 'worker_failed', config);
        }
        this.notify('state_change');
    }
    scheduleRetry(issueId, identifier, attempt, isFailure, error, config) {
        // Cancel any existing retry for this issue
        const existing = this.state.retryAttempts.get(issueId);
        if (existing) {
            clearTimeout(existing.timerHandle);
        }
        const delay = calcRetryDelay(attempt, isFailure, config.agent.maxRetryBackoffMs);
        const dueAtMs = Date.now() + delay;
        logger_1.logger.info(`retry_scheduled attempt=${attempt} delay=${delay}ms`, {
            issue_identifier: identifier,
        });
        const timerHandle = setTimeout(() => void this.handleRetryFired(issueId, identifier, attempt, config), delay);
        this.state.retryAttempts.set(issueId, {
            issueId,
            identifier,
            attempt,
            dueAtMs,
            timerHandle,
            error,
        });
    }
    async handleRetryFired(issueId, identifier, attempt, config) {
        if (!this.running)
            return;
        this.state.retryAttempts.delete(issueId);
        const ctx = { issue_identifier: identifier };
        // Re-fetch active candidates to find this issue (Section 8.4)
        let candidates;
        try {
            candidates = await this.tracker.fetchCandidateIssues();
        }
        catch (e) {
            logger_1.logger.error(`retry_fetch_failed err=${String(e)}`, ctx);
            this.scheduleRetry(issueId, identifier, attempt + 1, true, 'retry poll failed', config);
            return;
        }
        const issue = candidates.find((i) => i.id === issueId);
        if (!issue) {
            logger_1.logger.info(`retry_release reason=not_found_in_active_candidates`, ctx);
            this.state.claimed.delete(issueId);
            return;
        }
        const stateNorm = issue.state.toLowerCase();
        const activeNorm = config.tracker.activeStates.map((s) => s.toLowerCase());
        if (!activeNorm.includes(stateNorm)) {
            logger_1.logger.info(`retry_release reason=no_longer_active issue_state=${issue.state}`, ctx);
            this.state.claimed.delete(issueId);
            return;
        }
        // Check slots
        if (this.availableSlots(config) <= 0 || this.perStateSlots(issue.state, config) <= 0) {
            const errMsg = 'no available orchestrator slots';
            logger_1.logger.warn(`retry_requeued reason=${errMsg}`, ctx);
            this.scheduleRetry(issueId, identifier, attempt + 1, true, errMsg, config);
            return;
        }
        this.dispatch(issue, attempt, config);
    }
    // Snapshot for HTTP API / status surface (Section 13.3)
    snapshot() {
        const now = Date.now();
        const activeSeconds = [...this.state.running.values()].reduce((acc, e) => acc + (now - e.startedAt.getTime()) / 1000, 0);
        return {
            running: [...this.state.running.entries()].map(([id, e]) => ({
                issueId: id,
                identifier: e.issue.identifier,
                state: e.issue.state,
                attempt: e.attempt,
                startedAt: e.startedAt.toISOString(),
                sessionId: e.session?.sessionId ?? null,
                turnCount: e.session?.turnCount ?? 0,
            })),
            retrying: [...this.state.retryAttempts.values()].map((r) => ({
                issueId: r.issueId,
                identifier: r.identifier,
                attempt: r.attempt,
                dueAtMs: r.dueAtMs,
                error: r.error,
            })),
            codexTotals: {
                ...this.state.codexTotals,
                secondsRunning: this.endedSessionSeconds + activeSeconds,
            },
            rateLimits: this.state.codexRateLimits,
        };
    }
    triggerImmediatePoll() {
        if (this.pollTimer)
            clearTimeout(this.pollTimer);
        this.scheduleTick(0);
    }
}
exports.Orchestrator = Orchestrator;
//# sourceMappingURL=orchestrator.js.map