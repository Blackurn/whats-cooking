export interface LogContext {
    issue_id?: string;
    issue_identifier?: string;
    session_id?: string;
    [key: string]: unknown;
}
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export declare const logger: {
    info(msg: string, ctx?: LogContext): void;
    warn(msg: string, ctx?: LogContext): void;
    error(msg: string, ctx?: LogContext): void;
    debug(msg: string, ctx?: LogContext): void;
};
