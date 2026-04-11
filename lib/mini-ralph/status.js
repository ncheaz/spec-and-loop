'use strict';

/**
 * status.js - Status dashboard renderer for mini-ralph.
 *
 * Reads the current loop state, history, context, and tasks to produce
 * a human-readable status report. Also surfaces struggle indicators when
 * the loop appears stuck (no-progress or repeated errors).
 */

const state = require('./state');
const history = require('./history');
const context = require('./context');
const tasks = require('./tasks');
const errors = require('./errors');

/**
 * Render a status dashboard string for the given .ralph/ directory.
 *
 * @param {string} ralphDir
 * @param {string} [tasksFile]  - Optional path to the tasks.md file for task progress
 * @returns {string}
 */
function render(ralphDir, tasksFile) {
  const lines = [];

  const loopState = state.read(ralphDir);
  if (!loopState) {
    lines.push('No active or recent loop state found.');
    lines.push(`(Looking in: ${ralphDir})`);
    return lines.join('\n');
  }

  // Header
  lines.push('=== mini-ralph status ===');
  lines.push('');

  // Loop state
  const active = loopState.active ? 'ACTIVE' : 'INACTIVE';
  lines.push(`Status:        ${active}`);
  lines.push(`Iteration:     ${loopState.iteration || '?'} / ${loopState.maxIterations || '?'}`);

  const lifecycle = loopState.active
    ? 'running'
    : (loopState.completedAt ? 'completed' : 'stopped (incomplete)');
  lines.push(`Lifecycle:     ${lifecycle}`);

  if (loopState.startedAt) {
    const elapsed = _elapsed(loopState.startedAt);
    lines.push(`Started:       ${loopState.startedAt}  (${elapsed} ago)`);
  }

  if (loopState.completedAt) {
    lines.push(`Completed:     ${loopState.completedAt}`);
  } else if (loopState.stoppedAt) {
    lines.push(`Stopped:       ${loopState.stoppedAt}`);
  }

  if (loopState.exitReason) {
    lines.push(`Exit reason:   ${loopState.exitReason}`);
  }

  const latestCommitAnomaly = _latestCommitAnomaly(history.recent(ralphDir, 20));
  if (latestCommitAnomaly) {
    lines.push(`Commit issue:  ${latestCommitAnomaly.commitAnomaly}`);
  }

  lines.push(`Tasks mode:    ${loopState.tasksMode ? 'yes' : 'no'}`);
  lines.push(`Completion:    <promise>${loopState.completionPromise || 'COMPLETE'}</promise>`);
  lines.push(`Task promise:  <promise>${loopState.taskPromise || 'READY_FOR_NEXT_TASK'}</promise>`);

  // Prompt summary
  const promptSummary = _promptSummary(loopState);
  if (promptSummary) {
    lines.push('');
    lines.push(`Prompt:        ${promptSummary}`);
  }

  // Pending context
  const pendingCtx = context.read(ralphDir);
  if (pendingCtx) {
    lines.push('');
    lines.push('--- Pending Context (injected next iteration) ---');
    lines.push(pendingCtx.substring(0, 500) + (pendingCtx.length > 500 ? '\n...(truncated)' : ''));
    lines.push('-'.repeat(50));
  }

  // Task progress
  const resolvedTasksFile = tasksFile || _findTasksFile(loopState);
  if (resolvedTasksFile) {
    try {
      const counts = tasks.countTasks(resolvedTasksFile);
      lines.push('');
      lines.push(`Tasks:         ${counts.completed} completed, ${counts.inProgress} in-progress, ${counts.incomplete} incomplete (${counts.total} total)`);
      const current = tasks.currentTask(resolvedTasksFile);
      if (current) {
        const num = current.number ? `${current.number} ` : '';
        lines.push(`Current task:  ${num}${current.description}`);
      }
    } catch {
      // tasks file unreadable - skip
    }
  }

  // Recent history
  const recentHistory = history.recent(ralphDir, 5);
  if (recentHistory.length > 0) {
    lines.push('');
    lines.push('--- Recent History ---');
    for (const entry of recentHistory) {
      const durationSec = entry.duration ? `${(entry.duration / 1000).toFixed(1)}s` : '?';
      const completed = entry.completionDetected ? ' [COMPLETE]' : (entry.taskDetected ? ' [TASK]' : '');
      const toolSummary = _formatToolUsage(entry.toolUsage);
      const failureSummary = _formatHistoryFailure(entry);
      const commitSuffix = entry.commitAnomaly ? `  commit: ${entry.commitAnomaly}` : '';
      lines.push(`  Iteration ${entry.iteration}: ${durationSec}${completed}${toolSummary ? `  tools: ${toolSummary}` : ''}${failureSummary ? `  failure: ${failureSummary}` : ''}${commitSuffix}`);
    }
    lines.push('-'.repeat(50));
  }

  // Error history
  const recentErrors = errors.readEntries(ralphDir, 5);
  const errorCount = errors.count(ralphDir);
  if (errorCount > 0) {
    const latestError = recentErrors.length > 0 ? recentErrors[recentErrors.length - 1] : errors.latest(ralphDir);
    const preview = _formatErrorPreview(latestError);
    lines.push('');
    lines.push('--- Error History ---');
    lines.push(`  Errors: ${errorCount}`);
    lines.push(`  Most recent: ${preview}`);
    lines.push('-'.repeat(50));
  }

  // Struggle indicators
  const struggles = _detectStruggles(recentHistory, recentErrors);
  if (struggles.length > 0) {
    lines.push('');
    lines.push('--- Struggle Indicators ---');
    for (const s of struggles) {
      lines.push(`  WARNING: ${s}`);
    }
    lines.push('Tip: Use `ralph-run --add-context "..."` to provide guidance for the next iteration.');
    lines.push('-'.repeat(50));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Format elapsed time from an ISO timestamp to a human-readable string.
 *
 * @param {string} isoString
 * @returns {string}
 */
function _elapsed(isoString) {
  const start = new Date(isoString);
  const now = new Date();
  const ms = now - start;
  if (isNaN(ms) || ms < 0) return 'unknown';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

/**
 * Extract a brief prompt summary from loop state.
 *
 * @param {object} loopState
 * @returns {string}
 */
function _promptSummary(loopState) {
  if (loopState.promptFile) {
    return `file: ${loopState.promptFile}`;
  }
  if (loopState.prompt) {
    const firstLine = loopState.prompt.split('\n')[0].substring(0, 80);
    return `"${firstLine}${firstLine.length >= 80 ? '...' : ''}"`;
  }
  return '';
}

/**
 * Try to find a tasks file path from loop state.
 *
 * @param {object} loopState
 * @returns {string|null}
 */
function _findTasksFile(loopState) {
  if (loopState.tasksFile) return loopState.tasksFile;
  return null;
}

/**
 * Format tool usage array to a short string.
 *
 * @param {Array} toolUsage
 * @returns {string}
 */
function _formatToolUsage(toolUsage) {
  if (!Array.isArray(toolUsage) || toolUsage.length === 0) return '';
  return toolUsage.map((t) => `${t.tool}(${t.count})`).join(', ');
}

function _isFailedHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.signal) return true;
  if (entry.failureStage) return true;
  return entry.exitCode !== 0;
}

function _formatHistoryFailure(entry) {
  if (!entry || typeof entry !== 'object') return '';

  if (entry.signal) return `signal ${entry.signal}`;
  if (entry.failureStage) return `stage ${entry.failureStage}`;

  if (entry.exitCode !== null && entry.exitCode !== undefined && entry.exitCode !== 0) {
    return `exit code ${entry.exitCode}`;
  }

  return '';
}

/**
 * Detect struggle indicators from recent history.
 *
 * @param {Array<object>} recentHistory
 * @returns {Array<string>} Warning messages
 */
function _detectStruggles(recentHistory, errorEntries = []) {
  const warnings = [];
  if (recentHistory.length < 2) return warnings;

  // No-progress: multiple iterations with no files changed
  const noProgressCount = recentHistory.filter(
    (e) => !e.filesChanged || e.filesChanged.length === 0
  ).length;

  if (noProgressCount >= 2 && noProgressCount === recentHistory.length) {
    warnings.push(
      `No file changes detected in the last ${noProgressCount} iterations. The loop may be stuck.`
    );
  }

  const repeatedError = _detectRepeatedError(recentHistory, errorEntries);
  if (repeatedError) {
    warnings.push(
      `Repeated error detected in ${repeatedError.count} of the last ${recentHistory.length} iterations: ${repeatedError.preview}`
    );
  }

  return warnings;
}

function _detectRepeatedError(recentHistory, errorEntries) {
  if (!Array.isArray(errorEntries) || errorEntries.length < 2) {
    return null;
  }

  const recentFailedIterations = new Set(
    recentHistory
      .filter((entry) => _isFailedHistoryEntry(entry))
      .map((entry) => entry.iteration)
  );

  if (recentFailedIterations.size < 2) {
    return null;
  }

  const signatureCounts = new Map();

  for (const entry of errorEntries) {
    if (!entry || !recentFailedIterations.has(entry.iteration)) {
      continue;
    }

    const preview = _formatErrorPreview(entry);
    const signature = _normalizeErrorSignature(preview);
    if (!signature) {
      continue;
    }

    const existing = signatureCounts.get(signature) || { count: 0, preview };
    existing.count += 1;
    if (!existing.preview && preview) {
      existing.preview = preview;
    }
    signatureCounts.set(signature, existing);
  }

  let bestMatch = null;
  for (const candidate of signatureCounts.values()) {
    if (!bestMatch || candidate.count > bestMatch.count) {
      bestMatch = candidate;
    }
  }

  if (!bestMatch || bestMatch.count < 2) {
    return null;
  }

  return bestMatch;
}

function _normalizeErrorSignature(text) {
  if (!text) return '';

  return text
    .toLowerCase()
    .replace(/\b0x[0-9a-f]+\b/g, '<hex>')
    .replace(/[A-Z]:\\[^\s]+/g, '<path>')
    .replace(/(?:\/[^\s:]+)+/g, '<path>')
    .replace(/:\d+:\d+/g, ':<n>:<n>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}

function _formatErrorPreview(entry) {
  if (!entry) return '';

  const source = entry.stderr || entry.stdout || _fallbackErrorPreview(entry);
  const metadata = [];

  if (entry.signal) metadata.push(`signal ${entry.signal}`);
  if (entry.failureStage) metadata.push(`stage ${entry.failureStage}`);

  const preview = metadata.length > 0
    ? `${metadata.join(' | ')} | ${source}`
    : source;

  return preview.substring(0, 200).trim();
}

function _fallbackErrorPreview(entry) {
  const parts = [];
  if (entry.task) parts.push(entry.task);
  if (!Number.isNaN(entry.exitCode)) parts.push(`exit code ${entry.exitCode}`);
  return parts.join(' | ');
}

function _latestCommitAnomaly(recentHistory) {
  if (!Array.isArray(recentHistory) || recentHistory.length === 0) return null;

  for (let idx = recentHistory.length - 1; idx >= 0; idx--) {
    if (recentHistory[idx] && recentHistory[idx].commitAnomaly) {
      return recentHistory[idx];
    }
  }

  return null;
}

module.exports = {
  render,
  _elapsed,
  _detectStruggles,
  _formatToolUsage,
  _formatErrorPreview,
  _latestCommitAnomaly,
  _formatHistoryFailure,
  _isFailedHistoryEntry,
};
