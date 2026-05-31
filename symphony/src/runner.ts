// Agent runner — Section 10
//
// Launches the Codex app-server subprocess via `bash -lc <command>` in the workspace
// directory, drives it through one or more turns, and reports events back to the orchestrator.
//
// Protocol adapter for Codex app-server JSON-RPC v2. The request shapes here are
// based on `codex app-server generate-json-schema` for the installed CLI.

import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import {
  Issue,
  ServiceConfig,
  WorkerResult,
  AgentEvent,
  AgentEventCallback,
  LiveSession,
  TrackerClient,
} from './types';
import { WorkspaceManager } from './workspace';
import { renderPrompt } from './template';
import { logger } from './logger';
import { SymphonyError } from './errors';

// Continuation guidance sent for turns after the first (Section 7.1)
const CONTINUATION_GUIDANCE =
  'Continue working on the issue. Check the current state and take the next appropriate step.';

// --- Codex app-server protocol adapter ---
// Adapt these message shapes to the actual Codex app-server v2 protocol.

interface CodexRequest {
  method: string;
  id?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CodexResponse {
  method?: string;
  result?: Record<string, unknown>;
  params?: Record<string, unknown>;
  error?: string | Record<string, unknown>;
  id?: string;
  threadId?: string;
  turnId?: string;
  pid?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    // thread-level cumulative totals (preferred for accounting)
    threadInputTokens?: number;
    threadOutputTokens?: number;
    threadTotalTokens?: number;
  };
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  toolName?: string;
  toolCallId?: string;
  [key: string]: unknown;
}

function responsePayload(resp: CodexResponse): Record<string, unknown> {
  return (resp.result ?? resp.params ?? resp) as Record<string, unknown>;
}

function extractThreadId(resp: CodexResponse): string | null {
  const payload = responsePayload(resp);
  if (typeof payload['threadId'] === 'string') return payload['threadId'];
  const thread = payload['thread'];
  if (typeof thread === 'object' && thread !== null) {
    const id = (thread as Record<string, unknown>)['id'];
    if (typeof id === 'string') return id;
  }
  return null;
}

function extractTurnId(resp: CodexResponse): string | null {
  const payload = responsePayload(resp);
  if (typeof payload['turnId'] === 'string') return payload['turnId'];
  const turn = payload['turn'];
  if (typeof turn === 'object' && turn !== null) {
    const id = (turn as Record<string, unknown>)['id'];
    if (typeof id === 'string') return id;
  }
  return null;
}

function userInput(text: string): Array<Record<string, unknown>> {
  return [{ type: 'text', text }];
}

function buildInitializeRequest(): CodexRequest {
  return {
    method: 'initialize',
    params: {
      clientInfo: {
        name: 'symphony',
        title: 'Symphony',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: false,
      },
    },
  };
}

function buildThreadStartRequest(
  workspacePath: string,
  prompt: string,
  issueIdentifier: string,
  issueTitle: string,
  config: ServiceConfig,
): CodexRequest {
  return {
    method: 'thread/start',
    params: {
      cwd: workspacePath,
      serviceName: 'symphony',
      threadSource: 'user',
      sessionStartSource: 'startup',
      developerInstructions: `Symphony issue ${issueIdentifier}: ${issueTitle}`,
      baseInstructions: null,
      ...(config.codex.approvalPolicy ? { approvalPolicy: config.codex.approvalPolicy } : {}),
      ...(config.codex.threadSandbox ? { sandbox: config.codex.threadSandbox } : {}),
    },
  };
}

function buildTurnStartRequest(
  threadId: string,
  workspacePath: string,
  input: string,
  issueIdentifier: string,
  issueTitle: string,
  config: ServiceConfig,
): CodexRequest {
  return {
    method: 'turn/start',
    params: {
      threadId,
      cwd: workspacePath,
      input: userInput(input),
      ...(config.codex.turnSandboxPolicy ? { sandboxPolicy: config.codex.turnSandboxPolicy } : {}),
    },
  };
}

// --- CodexProcess — wraps subprocess I/O ---

class CodexProcess {
  private proc: ChildProcess;
  private rl: readline.Interface;
  private pendingResolvers: Map<string, (r: CodexResponse) => void> = new Map();
  private pendingRejectors: Map<string, (e: Error) => void> = new Map();
  eventListeners: Array<(r: CodexResponse) => void> = [];
  private reqCounter = 0;
  private closed = false;

  constructor(command: string, workspacePath: string) {
    // Section 9.5 Invariant 1: cwd must equal workspace_path
    this.proc = spawn('bash', ['-lc', command], {
      cwd: workspacePath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Separate stderr from protocol stdout (Section 10.3)
    this.proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) logger.debug(`codex_stderr output=${text}`);
    });

    this.rl = readline.createInterface({ input: this.proc.stdout! });
    this.rl.on('line', (line) => this.handleLine(line));
    this.proc.on('close', () => {
      this.closed = true;
      this.emit({ method: 'process/exited' });
      // Reject all pending
      for (const [id, reject] of this.pendingRejectors) {
        reject(new Error('Codex process exited'));
        this.pendingResolvers.delete(id);
        this.pendingRejectors.delete(id);
      }
    });
  }

  get pid(): number | undefined {
    return this.proc.pid;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  writeLine(line: string): void {
    this.proc.stdin?.write(line);
  }

  respond(id: string | number, result: Record<string, unknown>): void {
    this.writeLine(JSON.stringify({ id, result }) + '\n');
  }

  respondError(id: string | number, code: string, message: string): void {
    this.writeLine(JSON.stringify({ id, error: { code, message } }) + '\n');
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    let msg: CodexResponse;
    try {
      msg = JSON.parse(line) as CodexResponse;
    } catch {
      logger.debug(`codex_malformed_line line=${line}`);
      this.emit({ type: 'malformed', payload: { raw: line } } as unknown as CodexResponse);
      return;
    }

    if (msg.id && this.pendingResolvers.has(String(msg.id))) {
      const id = String(msg.id);
      const resolve = this.pendingResolvers.get(id)!;
      const reject = this.pendingRejectors.get(id)!;
      this.pendingResolvers.delete(id);
      this.pendingRejectors.delete(id);
      if (msg.error) {
        reject(new SymphonyError('response_error', `Codex returned error: ${JSON.stringify(msg.error)}`));
        return;
      }
      resolve(msg);
    } else {
      this.emit(msg);
    }
  }

  private emit(msg: CodexResponse): void {
    for (const listener of this.eventListeners) {
      try { listener(msg); } catch { /* ignore listener errors */ }
    }
  }

  onEvent(listener: (r: CodexResponse) => void): void {
    this.eventListeners.push(listener);
  }

  async send(req: CodexRequest, timeoutMs: number): Promise<CodexResponse> {
    if (this.closed) throw new Error('Codex process is closed');
    const id = String(++this.reqCounter);
    req = { ...req, id };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResolvers.delete(id);
        this.pendingRejectors.delete(id);
        reject(new SymphonyError('response_timeout', `Codex response timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingResolvers.set(id, (r) => { clearTimeout(timer); resolve(r); });
      this.pendingRejectors.set(id, (e) => { clearTimeout(timer); reject(e); });

      const line = JSON.stringify(req) + '\n';
      this.proc.stdin?.write(line);
    });
  }

  stop(): void {
    if (!this.closed) {
      this.proc.kill('SIGTERM');
      setTimeout(() => {
        if (!this.closed) this.proc.kill('SIGKILL');
      }, 2000).unref();
    }
  }
}

// --- AgentRunner ---

export interface RunnerOptions {
  issue: Issue;
  attempt: number | null;
  promptTemplate: string;
  workspaceManager: WorkspaceManager;
  trackerClient: TrackerClient;
  config: ServiceConfig;
  onEvent: AgentEventCallback;
  signal: AbortSignal;
}

export async function runAgent(opts: RunnerOptions): Promise<WorkerResult> {
  const { issue, attempt, promptTemplate, workspaceManager, trackerClient, config, onEvent, signal } = opts;
  const ctx = { issue_id: issue.id, issue_identifier: issue.identifier };
  const startTime = Date.now();
  let currentIssue = issue;
  let codexProc: CodexProcess | null = null;
  let session: LiveSession | null = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTotalTokens = 0;

  function emit(eventName: string, extra?: Partial<AgentEvent>): void {
    const ev: AgentEvent = {
      event: eventName,
      timestamp: new Date(),
      codexAppServerPid: codexProc?.pid ?? null,
      ...extra,
    };
    if (session) {
      session.lastCodexEvent = eventName;
      session.lastCodexTimestamp = ev.timestamp;
      session.lastCodexMessage = extra?.payload ? JSON.stringify(extra.payload).slice(0, 200) : null;
    }
    onEvent(ev);
  }

  function updateTokens(usage: CodexResponse['usage']): void {
    if (!usage) return;
    // Prefer thread-level cumulative totals (Section 13.5)
    if (usage.threadTotalTokens !== undefined) {
      const delta = usage.threadTotalTokens - (session?.lastReportedTotalTokens ?? 0);
      if (delta > 0 && session) {
        totalInputTokens += (usage.threadInputTokens ?? 0) - session.lastReportedInputTokens;
        totalOutputTokens += (usage.threadOutputTokens ?? 0) - session.lastReportedOutputTokens;
        totalTotalTokens += delta;
        session.lastReportedInputTokens = usage.threadInputTokens ?? 0;
        session.lastReportedOutputTokens = usage.threadOutputTokens ?? 0;
        session.lastReportedTotalTokens = usage.threadTotalTokens;
        session.codexInputTokens = totalInputTokens;
        session.codexOutputTokens = totalOutputTokens;
        session.codexTotalTokens = totalTotalTokens;
      }
    } else if (usage.totalTokens !== undefined) {
      totalInputTokens += usage.inputTokens ?? 0;
      totalOutputTokens += usage.outputTokens ?? 0;
      totalTotalTokens += usage.totalTokens;
      if (session) {
        session.codexInputTokens = totalInputTokens;
        session.codexOutputTokens = totalOutputTokens;
        session.codexTotalTokens = totalTotalTokens;
      }
    }
  }

  function updateTokensFromPayload(payload: Record<string, unknown>): void {
    const tokenUsage = payload['tokenUsage'];
    if (typeof tokenUsage === 'object' && tokenUsage !== null) {
      const total = (tokenUsage as Record<string, unknown>)['total'];
      if (typeof total === 'object' && total !== null) {
        updateTokens({
          threadInputTokens: (total as Record<string, number>)['inputTokens'],
          threadOutputTokens: (total as Record<string, number>)['outputTokens'],
          threadTotalTokens: (total as Record<string, number>)['totalTokens'],
        });
      }
    }
  }

  function isActiveState(state: string): boolean {
    const active = config.tracker.activeStates.map((s) => s.toLowerCase());
    return active.includes(state.toLowerCase());
  }

  let workspace: Awaited<ReturnType<typeof workspaceManager.ensureWorkspace>> | undefined;

  try {
    // 1. Prepare workspace
    workspace = await workspaceManager.ensureWorkspace(issue.identifier);
    logger.info(`workspace_ready created=${workspace.createdNow}`, ctx);

    // 2. Run before_run hook
    await workspaceManager.runBeforeRun(workspace.path, issue.identifier);

    // 3. Build first prompt
    const firstPrompt = await renderPrompt(promptTemplate, currentIssue, attempt);

    // 4. Launch codex app-server
    logger.info(`launching_agent command=${config.codex.command}`, ctx);
    codexProc = new CodexProcess(config.codex.command, workspace.path);
    emit('session_started');

    if (signal.aborted) throw new Error('Cancelled before session start');

    await codexProc.send(buildInitializeRequest(), config.codex.readTimeoutMs);

    // 5. Start thread
    const threadReq = buildThreadStartRequest(
      workspace.path,
      firstPrompt,
      issue.identifier,
      issue.title,
      config,
    );
    let threadResp: CodexResponse;
    try {
      threadResp = await codexProc.send(threadReq, config.codex.readTimeoutMs);
    } catch (e) {
      emit('startup_failed', { error: String(e) });
      throw new SymphonyError('response_timeout', `Thread start failed: ${String(e)}`, e);
    }

    const threadId = extractThreadId(threadResp);
    if (!threadId) {
      emit('startup_failed', { error: 'No threadId in response' });
      throw new SymphonyError('response_error', 'Codex did not return a threadId');
    }

    session = {
      sessionId: `${threadId}-init`,
      threadId,
      turnId: 'init',
      codexAppServerPid: codexProc.pid ?? null,
      lastCodexEvent: 'session_started',
      lastCodexTimestamp: new Date(),
      lastCodexMessage: null,
      codexInputTokens: 0,
      codexOutputTokens: 0,
      codexTotalTokens: 0,
      lastReportedInputTokens: 0,
      lastReportedOutputTokens: 0,
      lastReportedTotalTokens: 0,
      turnCount: 0,
    };

    emit('session_started', { threadId });

    // 6. Turn loop (up to max_turns)
    let turnCount = 0;
    let turnInput = firstPrompt;
    let isFirstTurn = true;

    while (turnCount < config.agent.maxTurns) {
      if (signal.aborted) {
        emit('turn_cancelled', { error: 'Cancelled by reconciliation' });
        break;
      }
      if (codexProc.isClosed) {
        emit('turn_ended_with_error', { error: 'Codex process exited unexpectedly' });
        throw new SymphonyError('port_exit', 'Codex process exited unexpectedly');
      }

      turnCount++;
      session.turnCount = turnCount;

      // First turn uses full rendered prompt; continuation turns use guidance (Section 7.1)
      const turnContent = isFirstTurn ? turnInput : CONTINUATION_GUIDANCE;
      isFirstTurn = false;

      const turnReq = buildTurnStartRequest(
        threadId,
        workspace.path,
        turnContent,
        currentIssue.identifier,
        currentIssue.title,
        config,
      );

      let turnResp: CodexResponse;
      try {
        turnResp = await codexProc.send(turnReq, config.codex.readTimeoutMs);
      } catch (e) {
        throw new SymphonyError('response_error', `Turn start failed: ${String(e)}`, e);
      }

      const turnId = extractTurnId(turnResp);
      if (!turnId) {
        throw new SymphonyError('response_error', 'Codex did not return a turnId');
      }
      session.turnId = turnId;
      session.sessionId = `${threadId}-${turnId}`;
      emit('session_started', { threadId, turnId, payload: { turnCount } });

      // 7. Stream turn until completion
      const turnResult = await streamTurn(
        codexProc,
        threadId,
        turnId,
        config,
        signal,
        (resp) => {
          const payload = responsePayload(resp);
          if (resp.usage) updateTokens(resp.usage);
          if (resp.tokenUsage) updateTokens(resp.tokenUsage as CodexResponse['usage']);
          updateTokensFromPayload(payload);
          const eventName = resp.method ?? (typeof resp.type === 'string' ? resp.type : 'other_message');
          emit(eventName, { threadId, turnId, payload: resp as unknown as Record<string, unknown> });

          // Handle tool calls (Section 10.5)
          if (resp.method === 'item/tool/call') {
            const params = (resp.params ?? {}) as Record<string, unknown>;
            const toolName = params['tool'] as string | undefined;
            if (resp.id) {
              codexProc?.respond(resp.id, {
                success: false,
                contentItems: [{
                  type: 'inputText',
                  text: `Unsupported tool: ${toolName ?? 'unknown'}`,
                }],
              });
            }
            emit('unsupported_tool_call', { payload: { toolName } });
          }

          // Auto-approve approval requests (high-trust policy, Section 10.5)
          if (
            resp.method === 'item/commandExecution/requestApproval' ||
            resp.method === 'item/fileChange/requestApproval'
          ) {
            if (resp.id) codexProc?.respond(resp.id, { decision: 'accept' });
            emit('approval_auto_approved', { payload: resp as unknown as Record<string, unknown> });
          }

          if (resp.method === 'item/permissions/requestApproval') {
            if (resp.id) {
              codexProc?.respondError(
                resp.id,
                'permissions_request_unsupported',
                'Symphony does not grant additional permissions dynamically.',
              );
            }
            emit('turn_input_required', { error: 'permissions_request_unsupported' });
          }

          // User-input-required is a hard failure in high-trust mode (Section 10.5)
          if (
            resp.method === 'item/tool/requestUserInput' ||
            resp.method === 'mcpServer/elicitation/request' ||
            resp.type === 'turn/input_required'
          ) {
            if (resp.id) {
              codexProc?.respondError(
                resp.id,
                'user_input_unsupported',
                'Symphony high-trust mode does not wait for operator input.',
              );
            }
            emit('turn_input_required', { error: 'turn_input_required' });
          }
        },
      );

      if (turnResult.status === 'completed') {
        emit('turn_completed', { threadId, turnId });
        const currentStates = await trackerClient.fetchIssueStatesByIds([currentIssue.id]);
        const refreshedState = currentStates.get(currentIssue.id);
        if (refreshedState) {
          currentIssue = { ...currentIssue, state: refreshedState };
        }
        if (!refreshedState || !isActiveState(refreshedState) || turnCount >= config.agent.maxTurns) {
          break;
        }
      } else if (turnResult.status === 'input_required') {
        throw new SymphonyError('turn_input_required', 'Turn required user input (high-trust: hard failure)');
      } else if (turnResult.status === 'timed_out') {
        throw new SymphonyError('turn_timeout', `Turn timed out after ${config.codex.turnTimeoutMs}ms`);
      } else {
        throw new SymphonyError('turn_failed', turnResult.error ?? 'Turn failed');
      }
    }

    const elapsed = (Date.now() - startTime) / 1000;
    await workspaceManager.runAfterRun(workspace.path, issue.identifier);

    return {
      success: true,
      finalTurnCount: turnCount,
      sessionSeconds: elapsed,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalTotalTokens,
    };
  } catch (e) {
    const elapsed = (Date.now() - startTime) / 1000;
    const errMsg = String(e instanceof Error ? e.message : e);
    emit('turn_ended_with_error', { error: errMsg });
    logger.error(`agent_run_failed err=${errMsg}`, ctx);

    if (workspace !== undefined) {
      await workspaceManager.runAfterRun(
        (await workspaceManager.ensureWorkspace(issue.identifier)).path,
        issue.identifier,
      ).catch(() => { /* after_run failure ignored */ });
    }

    return {
      success: false,
      error: errMsg,
      finalTurnCount: session?.turnCount ?? 0,
      sessionSeconds: elapsed,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalTotalTokens,
    };
  } finally {
    codexProc?.stop();
  }
}

// --- Turn streaming ---

interface TurnStreamResult {
  status: 'completed' | 'failed' | 'cancelled' | 'timed_out' | 'input_required';
  error?: string;
}

function streamTurn(
  proc: CodexProcess,
  threadId: string,
  turnId: string,
  config: ServiceConfig,
  signal: AbortSignal,
  onMsg: (r: CodexResponse) => void,
): Promise<TurnStreamResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve({ status: 'timed_out' });
    }, config.codex.turnTimeoutMs);

    const abortHandler = () => {
      cleanup();
      resolve({ status: 'cancelled', error: 'Aborted by signal' });
    };
    signal.addEventListener('abort', abortHandler);

    function cleanup() {
      clearTimeout(timer);
      signal.removeEventListener('abort', abortHandler);
      listenerRemoved = true;
    }

    let listenerRemoved = false;
    proc.onEvent((msg) => {
      if (listenerRemoved) return;
      const payload = responsePayload(msg);
      const msgThreadId = typeof payload['threadId'] === 'string' ? payload['threadId'] : msg.threadId;
      const msgTurnId = typeof payload['turnId'] === 'string'
        ? payload['turnId']
        : extractTurnId(msg) ?? msg.turnId;
      if (msgThreadId && msgThreadId !== threadId) return;
      if (msgTurnId && msgTurnId !== turnId) return;

      onMsg(msg);

      switch (msg.method ?? msg.type) {
        case 'turn/completed':
          cleanup();
          {
            const turn = payload['turn'];
            const status = typeof turn === 'object' && turn !== null
              ? (turn as Record<string, unknown>)['status']
              : undefined;
            const error = typeof turn === 'object' && turn !== null
              ? (turn as Record<string, unknown>)['error']
              : undefined;
            if (status === 'failed') {
              resolve({ status: 'failed', error: JSON.stringify(error ?? 'turn failed') });
            } else if (status === 'interrupted') {
              resolve({ status: 'cancelled', error: 'turn interrupted' });
            } else {
              resolve({ status: 'completed' });
            }
          }
          break;
        case 'turn/failed':
          cleanup();
          resolve({ status: 'failed', error: typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error ?? 'turn/failed') });
          break;
        case 'turn/cancelled':
          cleanup();
          resolve({ status: 'cancelled', error: 'turn/cancelled' });
          break;
        case 'process/exited':
          cleanup();
          resolve({ status: 'failed', error: 'Codex process exited' });
          break;
        case 'item/permissions/requestApproval':
          cleanup();
          resolve({ status: 'failed', error: 'permissions request unsupported' });
          break;
        case 'mcpServer/elicitation/request':
        case 'item/tool/requestUserInput':
        case 'turn/input_required':
          cleanup();
          resolve({ status: 'input_required' });
          break;
      }
    });
  });
}
