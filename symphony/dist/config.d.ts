import { ServiceConfig } from './types';
export declare function parseConfig(rawConfig: Record<string, unknown>, workflowDir?: string): ServiceConfig;
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
export declare function validateConfig(config: ServiceConfig): ValidationResult;
export declare function ensureWorkspaceRoot(config: ServiceConfig): void;
