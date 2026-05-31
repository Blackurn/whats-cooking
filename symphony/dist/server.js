"use strict";
// Optional HTTP observability server — Section 13.7
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHttpServer = startHttpServer;
const http = __importStar(require("http"));
const express_1 = __importDefault(require("express"));
const logger_1 = require("./logger");
function buildDashboardHtml(snap) {
    const escapeHtml = (value) => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const runningRows = snap.running.map((r) => `<tr>
      <td>${escapeHtml(r.identifier)}</td>
      <td>${escapeHtml(r.state)}</td>
      <td>${r.attempt ?? 0}</td>
      <td>${r.turnCount}</td>
      <td>${escapeHtml(r.sessionId ?? '-')}</td>
      <td>${new Date(r.startedAt).toISOString()}</td>
    </tr>`).join('\n');
    const retryRows = snap.retrying.map((r) => `<tr>
      <td>${escapeHtml(r.identifier)}</td>
      <td>${r.attempt}</td>
      <td>${new Date(r.dueAtMs).toISOString()}</td>
      <td>${escapeHtml(r.error ?? '-')}</td>
    </tr>`).join('\n');
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
function startHttpServer(orchestrator, port) {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    // GET / — human-readable dashboard
    app.get('/', (_req, res) => {
        const snap = orchestrator.snapshot();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(buildDashboardHtml(snap));
    });
    // GET /api/v1/state — runtime state snapshot
    app.get('/api/v1/state', (_req, res) => {
        res.json(orchestrator.snapshot());
    });
    // GET /api/v1/:identifier — issue-specific debug
    app.get('/api/v1/:identifier', (req, res) => {
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
    app.post('/api/v1/refresh', (_req, res) => {
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
            logger_1.logger.info(`http_server_started address=${addrStr}`);
            resolve({
                address: () => addrStr,
                close: () => server.close(),
            });
        });
        server.on('error', reject);
    });
}
//# sourceMappingURL=server.js.map