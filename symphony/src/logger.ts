// Structured logger — emits key=value lines to stderr (Section 13.1)

export interface LogContext {
  issue_id?: string;
  issue_identifier?: string;
  session_id?: string;
  [key: string]: unknown;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatKV(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
}

function emit(level: LogLevel, message: string, ctx?: LogContext): void {
  const base: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    msg: message,
  };
  if (ctx) {
    Object.assign(base, ctx);
  }
  process.stderr.write(formatKV(base) + '\n');
}

export const logger = {
  info(msg: string, ctx?: LogContext): void {
    emit('info', msg, ctx);
  },
  warn(msg: string, ctx?: LogContext): void {
    emit('warn', msg, ctx);
  },
  error(msg: string, ctx?: LogContext): void {
    emit('error', msg, ctx);
  },
  debug(msg: string, ctx?: LogContext): void {
    if (process.env.SYMPHONY_DEBUG) {
      emit('debug', msg, ctx);
    }
  },
};
