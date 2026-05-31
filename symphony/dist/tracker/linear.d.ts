import { TrackerClient, Issue, TrackerConfig } from '../types';
export declare class LinearClient implements TrackerClient {
    private readonly config;
    constructor(config: TrackerConfig);
    fetchCandidateIssues(): Promise<Issue[]>;
    fetchIssuesByStates(stateNames: string[]): Promise<Issue[]>;
    fetchIssueStatesByIds(issueIds: string[]): Promise<Map<string, string>>;
}
