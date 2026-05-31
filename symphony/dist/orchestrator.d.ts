import { OrchestratorRuntimeState, ServiceConfig } from './types';
export type OrchestratorEventType = 'state_change' | 'tick_complete' | 'error';
export type OrchestratorListener = (type: OrchestratorEventType, data?: unknown) => void;
export declare class Orchestrator {
    private state;
    private config;
    private promptTemplate;
    private tracker;
    private workspaceManager;
    private watcher;
    private pollTimer;
    private running;
    private listeners;
    private workflowPath;
    private endedSessionSeconds;
    constructor(workflowPath?: string);
    addListener(l: OrchestratorListener): void;
    private notify;
    getState(): OrchestratorRuntimeState;
    getConfig(): ServiceConfig | null;
    private startupCleanup;
    private applyWorkflow;
    private reloadWorkflowKeepingLastGood;
    start(): Promise<void>;
    stop(): void;
    private scheduleTick;
    private tick;
    private reconcile;
    private terminateWorker;
    private availableSlots;
    private perStateSlots;
    private isEligible;
    private dispatch;
    private runWorker;
    private scheduleRetry;
    private handleRetryFired;
    snapshot(): {
        running: Array<{
            issueId: string;
            identifier: string;
            state: string;
            attempt: number | null;
            startedAt: string;
            sessionId: string | null;
            turnCount: number;
        }>;
        retrying: Array<{
            issueId: string;
            identifier: string;
            attempt: number;
            dueAtMs: number;
            error: string | null;
        }>;
        codexTotals: {
            inputTokens: number;
            outputTokens: number;
            totalTokens: number;
            secondsRunning: number;
        };
        rateLimits: Record<string, unknown> | null;
    };
    triggerImmediatePoll(): void;
}
