// Tracker factory — Section 11

import { TrackerClient } from '../types';
import { TrackerConfig } from '../types';
import { SymphonyError } from '../errors';
import { LinearClient } from './linear';

export function createTracker(config: TrackerConfig): TrackerClient {
  if (config.kind !== 'linear') {
    throw new SymphonyError(
      'unsupported_tracker_kind',
      `Unsupported tracker kind: ${config.kind}. Only "linear" is supported.`,
    );
  }
  if (!config.apiKey) {
    throw new SymphonyError('missing_tracker_api_key', 'tracker.api_key is missing or empty');
  }
  if (!config.projectSlug) {
    throw new SymphonyError('missing_tracker_project_slug', 'tracker.project_slug is required for Linear');
  }
  return new LinearClient(config);
}
