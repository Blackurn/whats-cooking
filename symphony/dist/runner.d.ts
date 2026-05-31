import { Issue, ServiceConfig, WorkerResult, AgentEventCallback, TrackerClient } from './types';
import { WorkspaceManager } from './workspace';
export interface RunnerOptions {
    issue: Issue;
    attempt: number | null;
    promptTemplate: string;
    workspaceManager: WorkspaceManager;
    trackerClient: TrackerClient;
    config: ServiceConfig;
    onEvent: AgentEventCallback;
    signal: AbortSignal;
}
export declare function runAgent(opts: RunnerOptions): Promise<WorkerResult>;
