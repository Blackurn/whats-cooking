// Workspace manager — Section 9

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Workspace, ServiceConfig } from './types';
import { logger } from './logger';

const execFileAsync = promisify(execFile);

// Section 4.2: replace chars outside [A-Za-z0-9._-] with _
export function sanitizeWorkspaceKey(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9._-]/g, '_');
}

// Section 9.5 Invariant 2: workspace_path must start with workspace_root + sep
export function assertUnderRoot(workspaceRoot: string, workspacePath: string): void {
  const normalizedRoot = path.resolve(workspaceRoot);
  const normalizedPath = path.resolve(workspacePath);
  const prefix = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep;
  if (!normalizedPath.startsWith(prefix)) {
    throw new Error(
      `Workspace path escapes root: ${normalizedPath} is not under ${normalizedRoot}`,
    );
  }
}

export function computeWorkspacePath(workspaceRoot: string, identifier: string): string {
  const key = sanitizeWorkspaceKey(identifier);
  const workspacePath = path.join(workspaceRoot, key);
  assertUnderRoot(workspaceRoot, workspacePath);
  return workspacePath;
}

// Run a shell hook script in the workspace directory with a timeout
async function runHookScript(
  name: string,
  script: string,
  workspacePath: string,
  timeoutMs: number,
  issueIdentifier?: string,
): Promise<void> {
  const ctx = { issue_identifier: issueIdentifier };
  logger.info(`hook_start hook=${name}`, ctx);

  return new Promise((resolve, reject) => {
    const child = execFile(
      'bash',
      ['-lc', script],
      { cwd: workspacePath, timeout: timeoutMs },
      (err, stdout, stderr) => {
        if (stdout) logger.debug(`hook_stdout hook=${name} output=${stdout.trim()}`);
        if (stderr) logger.debug(`hook_stderr hook=${name} output=${stderr.trim()}`);

        if (err) {
          const anyErr = err as NodeJS.ErrnoException & { signal?: string; killed?: boolean };
          if (anyErr.killed || anyErr.signal === 'SIGTERM' || anyErr.signal === 'SIGKILL') {
            reject(new Error(`Hook ${name} timed out after ${timeoutMs}ms`));
          } else {
            reject(new Error(`Hook ${name} failed: ${err.message}`));
          }
          return;
        }
        resolve();
      },
    );
    void child;
  });
}

export class WorkspaceManager {
  constructor(private readonly config: ServiceConfig) {}

  // Section 9.2: create or reuse workspace, run after_create hook
  async ensureWorkspace(identifier: string): Promise<Workspace> {
    const key = sanitizeWorkspaceKey(identifier);
    const workspacePath = path.join(this.config.workspace.root, key);
    assertUnderRoot(this.config.workspace.root, workspacePath);

    const exists = fs.existsSync(workspacePath);
    if (exists && !fs.statSync(workspacePath).isDirectory()) {
      throw new Error(`Workspace path exists but is not a directory: ${workspacePath}`);
    }
    if (!exists) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }
    const createdNow = !exists;

    if (createdNow && this.config.hooks.afterCreate) {
      try {
        await runHookScript(
          'after_create',
          this.config.hooks.afterCreate,
          workspacePath,
          this.config.hooks.timeoutMs,
          identifier,
        );
        logger.info(`hook_completed hook=after_create`, { issue_identifier: identifier });
      } catch (e) {
        // after_create failure is fatal to workspace creation
        try { fs.rmdirSync(workspacePath); } catch { /* ignore */ }
        throw e;
      }
    }

    return { path: workspacePath, workspaceKey: key, createdNow };
  }

  async runBeforeRun(workspacePath: string, identifier: string): Promise<void> {
    if (!this.config.hooks.beforeRun) return;
    await runHookScript(
      'before_run',
      this.config.hooks.beforeRun,
      workspacePath,
      this.config.hooks.timeoutMs,
      identifier,
    );
  }

  async runAfterRun(workspacePath: string, identifier: string): Promise<void> {
    if (!this.config.hooks.afterRun) return;
    if (!fs.existsSync(workspacePath)) return;
    try {
      await runHookScript(
        'after_run',
        this.config.hooks.afterRun,
        workspacePath,
        this.config.hooks.timeoutMs,
        identifier,
      );
    } catch (e) {
      // after_run failure is logged and ignored
      logger.warn(`hook_failed hook=after_run err=${String(e)}`, { issue_identifier: identifier });
    }
  }

  async removeWorkspace(identifier: string): Promise<void> {
    const workspacePath = computeWorkspacePath(this.config.workspace.root, identifier);
    if (!fs.existsSync(workspacePath)) return;

    if (this.config.hooks.beforeRemove) {
      try {
        await runHookScript(
          'before_remove',
          this.config.hooks.beforeRemove,
          workspacePath,
          this.config.hooks.timeoutMs,
          identifier,
        );
      } catch (e) {
        // before_remove failure is logged and ignored; cleanup still proceeds
        logger.warn(`hook_failed hook=before_remove err=${String(e)}`, { issue_identifier: identifier });
      }
    }

    try {
      fs.rmSync(workspacePath, { recursive: true, force: true });
      logger.info(`workspace_removed`, { issue_identifier: identifier });
    } catch (e) {
      logger.warn(`workspace_remove_failed err=${String(e)}`, { issue_identifier: identifier });
    }
  }

  workspaceExists(identifier: string): boolean {
    const p = computeWorkspacePath(this.config.workspace.root, identifier);
    return fs.existsSync(p);
  }
}
