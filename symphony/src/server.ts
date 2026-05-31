// Optional HTTP observability server — Section 13.7

import * as http from 'http';
import express, { Request, Response } from 'express';
import { Orchestrator } from './orchestrator';
import { logger } from './logger';

export interface HttpServer {
  address(): string;
  close(): void;
}

function buildDashboardHtml(snap: ReturnType<Orchestrator['snapshot']>): string {
  const escapeHtml = (value: unknown): string => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const runningRows = snap.running.map((r) =>
    `<tr>
      <td>${escapeHtml(r.identifier)}</td>
      <td>${escapeHtml(r.state)}</td>
      <td>${r.attempt ?? 0}</td>
      <td>${r.turnCount}</td>
      <td>${escapeHtml(r.sessionId ?? '-')}</td>
      <td>${new Date(r.startedAt).toISOString()}</td>
    </tr>`,
  ).join('\n');

  const retryRows = snap.retrying.map((r) =>
    `<tr>
      <td>${escapeHtml(r.identifier)}</td>
      <td>${r.attempt}</td>
      <td>${new Date(r.dueAtMs).toISOString()}</td>
      <td>${escapeHtml(r.error ?? '-')}</td>
    </tr>`,
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Symphony Dashboard</title>
<meta http-equiv="refresh" content="10">
<style>
  body { font-family: monospace; padding: 1rem; background:#111; color:#eee; }
  h2 { color:#7df; }
  table { border-collapse:collapse; margin-bottom:2rem; width:100%; }
  th,td { border:1px solid #444; padding:4px 8px; text-align:left; }
  th { background:#222; }
  .totals { margin-bottom:1rem; }
</style>
</head>
<body>
<h1>Symphony</h1>
<div class="totals">
  <strong>Tokens:</strong>
  in=${snap.codexTotals.inputTokens}
  out=${snap.codexTotals.outputTokens}
  total=${snap.codexTotals.totalTokens}
  &nbsp;|&nbsp;
  <strong>Runtime:</strong> ${snap.codexTotals.secondsRunning.toFixed(1)}s
</div>
<h2>Running (${snap.running.length})</h2>
<table>
  <thead><tr><th>Issue</th><th>State</th><th>Attempt</th><th>Turns</th><th>Session</th><th>Started</th></tr></thead>
  <tbody>${runningRows || '<tr><td colspan="6">-</td></tr>'}</tbody>
</table>
<h2>Retrying (${snap.retrying.length})</h2>
<table>
  <thead><tr><th>Issue</th><th>Attempt</th><th>Due</th><th>Error</th></tr></thead>
  <tbody>${retryRows || '<tr><td colspan="4">-</td></tr>'}</tbody>
</table>
</body>
</html>`;
}

export function startHttpServer(
  orchestrator: Orchestrator,
  port: number,
): Promise<HttpServer> {
  const app = express();
  app.use(express.json());

  // GET / — human-readable dashboard
  app.get('/', (_req: Request, res: Response) => {
    const snap = orchestrator.snapshot();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildDashboardHtml(snap));
  });

  // GET /api/v1/state — runtime state snapshot
  app.get('/api/v1/state', (_req: Request, res: Response) => {
    res.json(orchestrator.snapshot());
  });

  // GET /api/v1/:identifier — issue-specific debug
  app.get('/api/v1/:identifier', (req: Request, res: Response) => {
    const identifier = req.params['identifier'];
    const snap = orchestrator.snapshot();
    const runEntry = snap.running.find((r) => r.identifier === identifier);
    const retryEntry = snap.retrying.find((r) => r.identifier === identifier);
    if (!runEntry && !retryEntry) {
      res.status(404).json({
        error: {
          code: 'issue_not_found',
          message: `No runtime state found for issue identifier: ${identifier}`,
        },
      });
      return;
    }
    res.json({ identifier, running: runEntry ?? null, retrying: retryEntry ?? null });
  });

  // POST /api/v1/refresh — trigger immediate poll
  app.post('/api/v1/refresh', (_req: Request, res: Response) => {
    orchestrator.triggerImmediatePoll();
    res.status(202).json({
      queued: true,
      coalesced: false,
      requested_at: new Date().toISOString(),
      operations: ['poll', 'reconcile'],
    });
  });

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const addrStr = typeof addr === 'object' && addr ? `127.0.0.1:${addr.port}` : String(addr);
      logger.info(`http_server_started address=${addrStr}`);
      resolve({
        address: () => addrStr,
        close: () => server.close(),
      });
    });
    server.on('error', reject);
  });
}
