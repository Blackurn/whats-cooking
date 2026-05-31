import { Workspace, ServiceConfig } from './types';
export declare function sanitizeWorkspaceKey(identifier: string): string;
export declare function assertUnderRoot(workspaceRoot: string, workspacePath: string): void;
export declare function computeWorkspacePath(workspaceRoot: string, identifier: string): string;
export declare class WorkspaceManager {
    private readonly config;
    constructor(config: ServiceConfig);
    ensureWorkspace(identifier: string): Promise<Workspace>;
    runBeforeRun(workspacePath: string, identifier: string): Promise<void>;
    runAfterRun(workspacePath: string, identifier: string): Promise<void>;
    removeWorkspace(identifier: string): Promise<void>;
    workspaceExists(identifier: string): boolean;
}
