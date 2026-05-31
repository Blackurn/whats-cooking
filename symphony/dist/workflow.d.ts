import { WorkflowDefinition } from './types';
import { SymphonyError } from './errors';
export declare function parseWorkflowFile(content: string): WorkflowDefinition;
export declare function loadWorkflow(workflowPath: string): WorkflowDefinition;
export declare class WorkflowWatcher {
    private readonly workflowPath;
    private readonly onReload;
    private readonly onError;
    private watcher;
    private lastGoodDefinition;
    constructor(workflowPath: string, onReload: (def: WorkflowDefinition) => void, onError: (err: SymphonyError) => void);
    start(): void;
    reload(): void;
    stop(): void;
    getLastGood(): WorkflowDefinition | null;
}
export declare function resolveWorkflowPath(explicit?: string): string;
