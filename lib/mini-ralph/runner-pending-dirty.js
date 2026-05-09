'use strict';

/**
 * runner-pending-dirty.js — Pending-dirty-paths bookkeeping split out of
 * runner.js.
 *
 * When the agent emits BLOCKED_HANDOFF (or pending_dirty_paths) without
 * cleaning up its working-tree edits, the runner persists the affected
 * paths into ralph-loop.state.json so a subsequent iteration can warn the
 * agent rather than silently letting it stack changes onto a different
 * task. This module owns the normalization, merging, refresh-from-git, and
 * task-comparison helpers — all moved verbatim from runner.js.
 */

const childProcess = require('child_process');

const { _mergePathLists, _repoRelativePath } = require('./runner-autocommit');

function _normalizePendingDirtyPaths(pending) {
  if (!pending || typeof pending !== 'object') return null;
  const files = _mergePathLists(pending.files || pending.paths || []);
  if (files.length === 0) return null;

  return {
    iteration: typeof pending.iteration === 'number' ? pending.iteration : null,
    reason: pending.reason || 'blocked_handoff',
    task: pending.task || '',
    taskNumber: pending.taskNumber || '',
    taskDescription: pending.taskDescription || '',
    files,
    recordedAt: pending.recordedAt || new Date().toISOString(),
  };
}

function _recordPendingDirtyPaths(existing, update) {
  const normalized = _normalizePendingDirtyPaths({
    iteration: update && typeof update.iteration === 'number' ? update.iteration : null,
    reason: update && update.reason ? update.reason : 'blocked_handoff',
    task: update && update.task ? update.task : '',
    taskNumber: update && update.taskNumber ? update.taskNumber : '',
    taskDescription: update && update.taskDescription ? update.taskDescription : '',
    files: _mergePathLists(
      existing && existing.files ? existing.files : [],
      update && update.files ? update.files : []
    ),
    recordedAt: update && update.recordedAt ? update.recordedAt : new Date().toISOString(),
  });

  return normalized;
}

function _remainingPendingDirtyPathsAfterCommit(pending, anomaly) {
  const normalized = _normalizePendingDirtyPaths(pending);
  if (!normalized) return null;

  const ignoredPaths = anomaly && Array.isArray(anomaly.ignoredPaths)
    ? anomaly.ignoredPaths.map(_repoRelativePath).filter(Boolean)
    : [];
  if (ignoredPaths.length === 0) return null;

  const ignoredSet = new Set(ignoredPaths);
  const files = normalized.files.filter((file) => ignoredSet.has(file));
  if (files.length === 0) return null;
  return Object.assign({}, normalized, { files });
}

function _refreshPendingDirtyPaths(pending) {
  const normalized = _normalizePendingDirtyPaths(pending);
  if (!normalized) return null;

  const dirtyPaths = _currentDirtyPathSet();
  if (!dirtyPaths) return normalized;
  const files = normalized.files.filter((file) => dirtyPaths.has(file));
  if (files.length === 0) return null;

  return Object.assign({}, normalized, { files });
}

function _samePendingTask(pending, currentTaskMeta, currentTask) {
  if (!pending) return true;
  const currentNumber = currentTaskMeta && currentTaskMeta.number ? currentTaskMeta.number : '';
  const currentDescription = currentTaskMeta && currentTaskMeta.description ? currentTaskMeta.description : '';
  const currentFull = currentTask || '';

  if (pending.taskNumber && currentNumber) {
    return pending.taskNumber === currentNumber;
  }

  if (pending.taskDescription && currentDescription) {
    return pending.taskDescription === currentDescription;
  }

  return Boolean(pending.task && currentFull && pending.task === currentFull);
}

function _formatPendingDirtyPathsBlock(pending, currentTaskMeta, currentTask) {
  const currentStamp = currentTaskMeta && currentTaskMeta.number
    ? `${currentTaskMeta.number} ${currentTaskMeta.description || ''}`.trim()
    : (currentTask || 'the current task');
  const pendingStamp = pending.taskNumber
    ? `${pending.taskNumber} ${pending.taskDescription || ''}`.trim()
    : (pending.task || 'a prior blocked handoff');
  const files = (pending.files || []).slice(0, 8);
  const extra = (pending.files || []).length - files.length;
  const fileLines = files.map((file) => `  - ${file}`).join('\n');
  const suffix = extra > 0 ? `\n  - (+${extra} more)` : '';

  return [
    `pending dirty paths from ${pending.reason || 'blocked_handoff'} iteration ${pending.iteration || 'unknown'} remain unresolved.`,
    `Prior task: ${pendingStamp}`,
    `Current task: ${currentStamp}`,
    'Resolve the prior patch before Ralph can safely continue: commit it with the same task, revert it, or move it to a separate change.',
    'Pending paths:',
    `${fileLines}${suffix}`,
  ].join('\n');
}

function _currentDirtyPathSet() {
  try {
    const output = childProcess.execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const paths = new Set();
    for (const line of output.split('\n')) {
      for (const file of _parseGitStatusPaths(line)) {
        if (file) paths.add(file);
      }
    }
    return paths;
  } catch (_) {
    return null;
  }
}

function _parseGitStatusPaths(line) {
  if (!line || typeof line !== 'string') return [];
  const rawPath = line.slice(3).trim();
  if (!rawPath) return [];
  if (rawPath.includes(' -> ')) {
    return rawPath.split(' -> ').map(_stripGitStatusQuotes).filter(Boolean);
  }
  return [_stripGitStatusQuotes(rawPath)].filter(Boolean);
}

function _stripGitStatusQuotes(value) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed;
  }
  return trimmed
    .slice(1, -1)
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

module.exports = {
  _normalizePendingDirtyPaths,
  _recordPendingDirtyPaths,
  _remainingPendingDirtyPathsAfterCommit,
  _refreshPendingDirtyPaths,
  _samePendingTask,
  _formatPendingDirtyPathsBlock,
  _currentDirtyPathSet,
  _parseGitStatusPaths,
  _stripGitStatusQuotes,
};
