export interface BlockerRef {
    id: string | null;
    identifier: string | null;
    state: string | null;
}
export interface Issue {
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    priority: number | null;
    state: string;
    branchName: string | null;
    url: string | null;
    labels: string[];
    blockedBy: BlockerRef[];
    createdAt: Date | null;
    updatedAt: Date | null;
}
export interface WorkflowDefinition {
    config: Record<string, unknown>;
    promptTemplate: string;
}
export interface TrackerConfig {
    kind: string;
    endpoint: string;
    apiKey: string;
    projectSlug: string;
    activeStates: string[];
    terminalStates: string[];
}
export interface PollingConfig {
    intervalMs: number;
}
export interface WorkspaceConfig {
    root: string;
}
export interface HooksConfig {
    afterCreate: string | null;
    beforeRun: string | null;
    afterRun: string | null;
    beforeRemove: string | null;
    timeoutMs: number;
}
export interface AgentConfig {
    maxConcurrentAgents: number;
    maxTurns: number;
    maxRetryBackoffMs: number;
    maxConcurrentAgentsByState: Record<string, number>;
}
export interface CodexConfig {
    command: string;
    approvalPolicy: string | null;
    threadSandbox: string | null;
    turnSandboxPolicy: string | null;
    turnTimeoutMs: number;
    readTimeoutMs: number;
    stallTimeoutMs: number;
}
export interface ServerConfig {
    port: number | null;
}
export interface ServiceConfig {
    tracker: TrackerConfig;
    polling: PollingConfig;
    workspace: WorkspaceConfig;
    hooks: HooksConfig;
    agent: AgentConfig;
    codex: CodexConfig;
    server: ServerConfig;
}
export interface Workspace {
    path: string;
    workspaceKey: string;
    createdNow: boolean;
}
export type RunAttemptStatus = 'PreparingWorkspace' | 'BuildingPrompt' | 'LaunchingAgentProcess' | 'InitializingSession' | 'StreamingTurn' | 'Finishing' | 'Succeeded' | 'Failed' | 'TimedOut' | 'Stalled' | 'CanceledByReconciliation';
export interface RunAttempt {
    issueId: string;
    issueIdentifier: string;
    attempt: number | null;
    workspacePath: string;
    startedAt: Date;
    status: RunAttemptStatus;
    error?: string;
}
export interface LiveSession {
    sessionId: string;
    threadId: string;
    turnId: string;
    codexAppServerPid: number | null;
    lastCodexEvent: string | null;
    lastCodexTimestamp: Date | null;
    lastCodexMessage: string | null;
    codexInputTokens: number;
    codexOutputTokens: number;
    codexTotalTokens: number;
    lastReportedInputTokens: number;
    lastReportedOutputTokens: number;
    lastReportedTotalTokens: number;
    turnCount: number;
}
export interface RunningEntry {
    issue: Issue;
    attempt: number | null;
    workspacePath: string;
    startedAt: Date;
    session: LiveSession | null;
    abort: (() => void) | null;
}
export interface RetryEntry {
    issueId: string;
    identifier: string;
    attempt: number;
    dueAtMs: number;
    timerHandle: ReturnType<typeof setTimeout>;
    error: string | null;
}
export interface CodexTotals {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    secondsRunning: number;
}
export interface OrchestratorRuntimeState {
    pollIntervalMs: number;
    maxConcurrentAgents: number;
    running: Map<string, RunningEntry>;
    claimed: Set<string>;
    retryAttempts: Map<string, RetryEntry>;
    completed: Set<string>;
    codexTotals: CodexTotals;
    codexRateLimits: Record<string, unknown> | null;
}
export interface TokenUsage {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
}
export interface AgentEvent {
    event: string;
    timestamp: Date;
    codexAppServerPid: number | null;
    usage?: TokenUsage;
    threadId?: string;
    turnId?: string;
    error?: string;
    payload?: Record<string, unknown>;
}
export type AgentEventCallback = (event: AgentEvent) => void;
export interface TrackerClient {
    fetchCandidateIssues(): Promise<Issue[]>;
    fetchIssuesByStates(stateNames: string[]): Promise<Issue[]>;
    fetchIssueStatesByIds(issueIds: string[]): Promise<Map<string, string>>;
}
export interface WorkerResult {
    success: boolean;
    error?: string;
    finalTurnCount: number;
    sessionSeconds: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}
