import { Issue } from './types';
export declare function renderPrompt(promptTemplate: string, issue: Issue, attempt: number | null): Promise<string>;
