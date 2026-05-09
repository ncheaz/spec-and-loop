'use strict';

/**
 * supervisor-state.js — Budget bookkeeping, blocker hashing, hint
 * normalization, and small return-shape helpers for the supervisor loop.
 *
 * These helpers are intentionally side-effect-light: each takes plain
 * options/state objects and returns plain objects. The only functions that
 * touch durable state are `_readSupervisorState` and `_writeSupervisorState`,
 * which proxy to `state.read` / `state.update` (the same store the runner
 * uses) so all supervisor budget-tracking shares one ralph-loop.state.json
 * record. Moved verbatim from supervisor.js so existing tests keep passing.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const state = require('./state');

function _computeBlockerHash(blockerNote) {
  return crypto
    .createHash('sha256')
    .update(String(blockerNote || '').trim())
    .digest('hex')
    .slice(0, 16);
}

function _readSupervisorState(ralphDir) {
  const current = state.read(ralphDir) || {};
  return current.supervisor && typeof current.supervisor === 'object'
    ? current.supervisor
    : {};
}

function _writeSupervisorState(ralphDir, supervisorUpdate) {
  const current = state.read(ralphDir) || {};
  state.update(ralphDir, {
    supervisor: Object.assign({}, current.supervisor || {}, supervisorUpdate),
  });
}

function _nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function _decideBoundedBudget(options = {}) {
  const totalAttempts = _nonNegativeInteger(options.totalAttempts);
  const maxTotalAttempts = _nonNegativeInteger(options.maxTotalAttempts);
  const attempts = options.attempts && typeof options.attempts === 'object' ? options.attempts : {};
  const budgetKey = String(options.budgetKey || '');

  if (!budgetKey) {
    return { allowed: true, reason: 'unbounded' };
  }

  if (maxTotalAttempts > 0 && totalAttempts >= maxTotalAttempts) {
    return { allowed: false, reason: 'global_budget_exhausted' };
  }

  if (Object.prototype.hasOwnProperty.call(attempts, budgetKey)) {
    return { allowed: false, reason: 'task_class_budget_exhausted' };
  }

  return { allowed: true, reason: 'authorized' };
}

function _consumeBoundedBudget(options = {}) {
  const priorState = options.state && typeof options.state === 'object' ? options.state : {};
  const budgetKey = String(options.budgetKey || '');
  if (!budgetKey) {
    return priorState;
  }

  const attempts = Object.assign({}, priorState.attempts || {});
  attempts[budgetKey] = Object.assign({}, options.entry || {});

  return Object.assign({}, priorState, {
    totalAttempts: _nonNegativeInteger(priorState.totalAttempts) + 1,
    attempts,
  });
}

function _normalizeInvestigationHints(rawHints, options = {}) {
  const workspaceRoot = _resolveHintWorkspaceRoot(options);
  const hints = [];
  const hintsDropped = [];

  for (const rawHint of Array.isArray(rawHints) ? rawHints : []) {
    if (!rawHint || typeof rawHint !== 'object') {
      continue;
    }

    const originalPath = String(rawHint.path || '').trim();
    const rationale = _truncateHintRationale(rawHint.rationale);
    const normalizedPath = _normalizeHintPath(originalPath, workspaceRoot);

    if (!normalizedPath) {
      hintsDropped.push({ path: originalPath, rationale, reason: 'out_of_tree' });
      continue;
    }

    if (hints.length >= 5) {
      hintsDropped.push({ path: normalizedPath, rationale, reason: 'cap_exceeded' });
      continue;
    }

    hints.push({ path: normalizedPath, rationale });
  }

  return { hints, hintsDropped };
}

function _resolveHintWorkspaceRoot(options = {}) {
  if (options.workspaceRoot) {
    return path.resolve(options.workspaceRoot);
  }
  if (options.openspecRoot) {
    return path.resolve(options.openspecRoot, '..');
  }
  if (options.changeDir) {
    return path.resolve(options.changeDir, '..', '..');
  }
  if (options.ralphDir) {
    return path.resolve(options.ralphDir, '..');
  }
  return process.cwd();
}

function _normalizeHintPath(rawPath, workspaceRoot) {
  if (!rawPath) {
    return '';
  }

  const resolved = path.resolve(workspaceRoot, rawPath);
  const relative = path.relative(workspaceRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(resolved)) {
    return '';
  }

  try {
    if (!fs.statSync(resolved).isFile()) {
      return '';
    }
  } catch {
    return '';
  }

  return relative.split(path.sep).join('/');
}

function _truncateHintRationale(rationale) {
  const text = String(rationale || '').trim();
  if (text.length <= 200) {
    return text;
  }
  return `${text.slice(0, 200)}…`;
}

function _formatPreviousSupervisorAttempts(attempts) {
  return Array.isArray(attempts) && attempts.length > 0
    ? attempts.join('\n')
    : '';
}

function _joinSummaryParts(summary, downstreamFailures) {
  const parts = [];
  if (summary) {
    parts.push(String(summary));
  }
  if (Array.isArray(downstreamFailures) && downstreamFailures.length > 0) {
    parts.push(`Downstream patch failures: ${downstreamFailures.join(', ')}`);
  }
  return parts.join(' ');
}

function _firstNonEmptyText() {
  for (const part of arguments) {
    const text = String(part || '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function _buildSupervisorReturn(options = {}) {
  return {
    outcome: options.outcome,
    patchedTasks: Array.isArray(options.patchedTasks) ? options.patchedTasks : [],
    hints: Array.isArray(options.hints) ? options.hints : [],
    hintsDropped: Array.isArray(options.hintsDropped) ? options.hintsDropped : [],
    attempts: Array.isArray(options.attempts) ? options.attempts : [],
    attemptsExhausted: options.attemptsExhausted === true,
    readLogs: options.readLogs === undefined ? null : options.readLogs,
    readLogsBytes: options.readLogsBytes === undefined ? null : options.readLogsBytes,
    softWarnings: Array.isArray(options.softWarnings) ? options.softWarnings : [],
    summary: String(options.summary || ''),
    blockerHash: String(options.blockerHash || ''),
  };
}

module.exports = {
  _computeBlockerHash,
  _readSupervisorState,
  _writeSupervisorState,
  _nonNegativeInteger,
  _decideBoundedBudget,
  _consumeBoundedBudget,
  _normalizeInvestigationHints,
  _resolveHintWorkspaceRoot,
  _normalizeHintPath,
  _truncateHintRationale,
  _formatPreviousSupervisorAttempts,
  _joinSummaryParts,
  _firstNonEmptyText,
  _buildSupervisorReturn,
};
