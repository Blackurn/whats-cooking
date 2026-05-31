import { Orchestrator } from './orchestrator';
export interface HttpServer {
    address(): string;
    close(): void;
}
export declare function startHttpServer(orchestrator: Orchestrator, port: number): Promise<HttpServer>;
