// Workflow loader — reads WORKFLOW.md, parses YAML front matter (Section 5)

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import chokidar from 'chokidar';
import { WorkflowDefinition } from './types';
import { SymphonyError } from './errors';
import { logger } from './logger';

const FRONT_MATTER_DELIMITER = '---';

export function parseWorkflowFile(content: string): WorkflowDefinition {
  let config: Record<string, unknown> = {};
  let promptTemplate = content;

  if (content.startsWith(FRONT_MATTER_DELIMITER)) {
    const lines = content.split('\n');
    // Find the closing ---
    let closingIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trimEnd() === FRONT_MATTER_DELIMITER) {
        closingIndex = i;
        break;
      }
    }

    if (closingIndex === -1) {
      throw new SymphonyError('workflow_parse_error', 'Unclosed YAML front matter: no closing ---');
    }

    const frontMatterText = lines.slice(1, closingIndex).join('\n');
    const bodyText = lines.slice(closingIndex + 1).join('\n');

    let parsed: unknown;
    try {
      parsed = yaml.load(frontMatterText);
    } catch (e) {
      throw new SymphonyError('workflow_parse_error', `YAML parse error: ${String(e)}`, e);
    }

    if (parsed !== null && parsed !== undefined) {
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new SymphonyError('workflow_front_matter_not_a_map', 'WORKFLOW.md front matter must be a YAML map/object');
      }
      config = parsed as Record<string, unknown>;
    }

    promptTemplate = bodyText;
  }

  return {
    config,
    promptTemplate: promptTemplate.trim(),
  };
}

export function loadWorkflow(workflowPath: string): WorkflowDefinition {
  let content: string;
  try {
    content = fs.readFileSync(workflowPath, 'utf-8');
  } catch (e) {
    throw new SymphonyError('missing_workflow_file', `Cannot read workflow file: ${workflowPath}`, e);
  }
  return parseWorkflowFile(content);
}

export class WorkflowWatcher {
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private lastGoodDefinition: WorkflowDefinition | null = null;

  constructor(
    private readonly workflowPath: string,
    private readonly onReload: (def: WorkflowDefinition) => void,
    private readonly onError: (err: SymphonyError) => void,
  ) {}

  start(): void {
    this.watcher = chokidar.watch(this.workflowPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    });

    this.watcher.on('change', () => {
      logger.info('workflow_file_changed action=reloading', { msg: `workflow_file_changed path=${this.workflowPath}` });
      this.reload();
    });

    this.watcher.on('error', (err) => {
      logger.warn(`workflow_watcher_error err=${String(err)}`);
    });
  }

  reload(): void {
    try {
      const def = loadWorkflow(this.workflowPath);
      this.lastGoodDefinition = def;
      this.onReload(def);
      logger.info(`workflow_reloaded action=completed path=${this.workflowPath}`);
    } catch (e) {
      const sym = e instanceof SymphonyError ? e : new SymphonyError('workflow_parse_error', String(e), e);
      logger.error(`workflow_reload_failed code=${sym.code} msg=${sym.message}`);
      this.onError(sym);
    }
  }

  stop(): void {
    void this.watcher?.close();
    this.watcher = null;
  }

  getLastGood(): WorkflowDefinition | null {
    return this.lastGoodDefinition;
  }
}

export function resolveWorkflowPath(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  return path.resolve(process.cwd(), 'WORKFLOW.md');
}
