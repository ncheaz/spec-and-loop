'use strict';

/**
 * runner-baseline-gate.js — Strict-clean baseline-gate detection and
 * feedback formatting, split out of runner.js.
 *
 * The baseline-gate engine inspects the current task block for `pnpm
 * typecheck/lint/test exit 0` style strict gates, cross-references the
 * `.ralph/baselines/*` artifacts written by pre-flight tasks, and produces
 * an iteration-feedback paragraph that tells the agent which gate-handling
 * mode the task is in:
 *
 *   - `missing_baseline`        — strict gate but no baseline → handoff
 *   - `authorized_cleanup`      — task explicitly authorizes named-file repair
 *   - `baseline_classification` — task allows classifying baseline failures
 *   - `missing_policy`          — task is silent → ask operator to clarify
 *
 * Everything in this module is a pure helper over filesystem snapshots and
 * the recent-history window — no I/O outside `fs`, no internal runner state.
 * Moved verbatim from runner.js so the existing baseline-gate unit tests in
 * `tests/unit/javascript/mini-ralph-runner-baseline-gate.test.js` keep
 * passing without modification.
 */

const fs = require('fs');
const fsPath = require('path');

function _buildBaselineGateFeedback(ralphDir, tasksFile, currentTaskMeta, recentHistory) {
  return _formatBaselineGateFeedback(
    _analyzeBaselineGateConflict(ralphDir, tasksFile, currentTaskMeta, recentHistory)
  );
}

function _analyzeBaselineGateConflict(ralphDir, tasksFile, currentTaskMeta, recentHistory) {
  if (!ralphDir || !tasksFile || !currentTaskMeta || !currentTaskMeta.description) {
    return null;
  }

  const taskBlock = _extractCurrentTaskBlock(tasksFile, currentTaskMeta);
  if (!taskBlock) return null;

  const strictGates = _detectStrictCleanGates(taskBlock);
  if (strictGates.length === 0) return null;

  const recordedBaselines = _detectRecordedBaselineGates(ralphDir);
  const missingBaselines = _detectMissingBaselineGates(
    strictGates,
    recordedBaselines,
    taskBlock,
    tasksFile
  );

  if (missingBaselines.length > 0) {
    return {
      mode: 'missing_baseline',
      conflicts: [],
      missingBaselines,
      allowedFiles: [],
      budgetUsed: false,
    };
  }

  const failingBaselines = recordedBaselines.filter((gate) => gate.exitCode !== 0);
  if (failingBaselines.length === 0) return null;

  const baselineByGate = new Map(failingBaselines.map((gate) => [gate.name, gate]));
  const conflicts = strictGates
    .map((gate) => ({ gate, baseline: baselineByGate.get(gate.name) }))
    .filter((item) => item.baseline);

  if (conflicts.length === 0) return null;

  const cleanup = _detectAuthorizedBaselineCleanup(taskBlock);
  if (cleanup.allowedFiles.length > 0) {
    return {
      mode: 'authorized_cleanup',
      conflicts,
      allowedFiles: cleanup.allowedFiles,
      budgetUsed: _baselineGateRepairBudgetUsed(recentHistory, currentTaskMeta, cleanup.allowedFiles),
    };
  }

  if (_taskExplicitlyHandlesBaselineFailures(taskBlock)) {
    return {
      mode: 'baseline_classification',
      conflicts,
      allowedFiles: [],
      budgetUsed: false,
    };
  }

  return {
    mode: 'missing_policy',
    conflicts,
    allowedFiles: [],
    budgetUsed: false,
  };
}

function _formatBaselineGateFeedback(conflict) {
  const conflicts = Array.isArray(conflict && conflict.conflicts) ? conflict.conflicts : [];
  const missingBaselines = Array.isArray(conflict && conflict.missingBaselines)
    ? conflict.missingBaselines
    : [];

  if (!conflict || (conflicts.length === 0 && missingBaselines.length === 0)) {
    return '';
  }

  const conflictLines = conflicts.map(({ gate, baseline }) =>
    `- ${gate.command}: baseline ${baseline.file} exits ${baseline.exitCode}.`
  );
  const missingLines = missingBaselines.map((gate) =>
    `- ${gate.command}: no matching baseline artifact found under .ralph/baselines.`
  );

  if (conflict.mode === 'missing_baseline') {
    return [
      'The current task uses a strict clean quality gate and the task plan indicates a pre-flight baseline should exist, but the matching baseline artifact is missing.',
      'Do not classify failures as pre-existing or spend an implementation iteration trying to satisfy an impossible task contract.',
      'emit BLOCKED_HANDOFF and ask the operator to rerun or restore the pre-flight baseline artifact, or update the task spec to authorize a different gate policy.',
      '',
      ...missingLines,
    ].join('\n');
  }

  if (conflict.mode === 'authorized_cleanup') {
    if (conflict.budgetUsed === true) {
      return [
        'The current task explicitly authorized cleanup for baseline gate failures, but its one repair attempt has already been used.',
        'Do not keep iterating on cleanup or broaden the edit scope.',
        'If the gate is still failing, emit BLOCKED_HANDOFF with the remaining failing identifiers and ask for either a broader cleanup task or a task-spec change.',
        '',
        `Authorized cleanup files: ${conflict.allowedFiles.join(', ')}`,
        ...conflictLines,
      ].join('\n');
    }

    return [
      'The current task explicitly authorizes cleanup for baseline gate failures in named files.',
      'You have exactly one repair attempt for this task. Limit edits to compiler/lint-only fixes in the authorized files; do not change behavior or edit other files for this cleanup.',
      'If this attempt does not clear the gate, emit BLOCKED_HANDOFF instead of continuing to retry.',
      '',
      `Authorized cleanup files: ${conflict.allowedFiles.join(', ')}`,
      ...conflictLines,
    ].join('\n');
  }

  if (conflict.mode === 'baseline_classification') {
    return [
      'The current task has strict quality-gate checks, and matching pre-flight baselines are already failing.',
      'The task text appears to authorize baseline classification, so do not repair unrelated baseline failures unless the task explicitly names those files.',
      'Complete the task only if the current run has no new failures beyond the named baseline failures.',
      '',
      ...conflictLines,
    ].join('\n');
  }

  return [
    'The current task requires a clean gate that already has a failing pre-flight baseline, but the task text does not say whether baseline-matching failures may be classified.',
    'Do not spend iterations repairing unrelated files outside the current task scope.',
    'If the only remaining gate failures match the baseline, emit BLOCKED_HANDOFF with a task-spec correction request: either allow baseline classification for this gate, or explicitly authorize the named out-of-scope repair.',
    '',
    ...conflictLines,
  ].join('\n');
}

function _extractCurrentTaskBlock(tasksFile, currentTaskMeta) {
  if (!tasksFile || !fs.existsSync(tasksFile)) return '';

  const lines = fs.readFileSync(tasksFile, 'utf8').split(/\r?\n/);
  const taskHeader = /^-\s+\[[ x/]\]\s+(.+)$/;
  const targetNumber = currentTaskMeta.number || '';
  const targetDescription = (currentTaskMeta.description || '').trim();
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(taskHeader);
    if (!match) continue;

    const fullDescription = match[1].trim();
    const numMatch = fullDescription.match(/^(\d+\.\d+)\s+(.+)$/);
    const number = numMatch ? numMatch[1] : '';
    const description = (numMatch ? numMatch[2] : fullDescription).trim();

    if (
      (targetNumber && number === targetNumber) ||
      (!targetNumber && description === targetDescription) ||
      (targetNumber && description === targetDescription)
    ) {
      start = i;
      break;
    }
  }

  if (start === -1) return '';

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (taskHeader.test(lines[i])) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

function _detectStrictCleanGates(taskBlock) {
  if (!taskBlock) return [];

  const gates = [
    {
      name: 'typecheck',
      command: 'pnpm typecheck',
      pattern: /`?pnpm\s+typecheck`?[^\n]*(?:exits?|returns?)\s+0/i,
    },
    {
      name: 'lint',
      command: 'pnpm lint',
      pattern: /`?pnpm\s+lint`?[^\n]*(?:exits?|returns?)\s+0/i,
    },
    {
      name: 'test',
      command: 'pnpm test',
      pattern: /`?pnpm\s+test`?[^\n]*(?:exits?|returns?)\s+0/i,
    },
  ];

  return gates.filter((gate) => gate.pattern.test(taskBlock));
}

function _detectFailingBaselineGates(ralphDir) {
  return _detectRecordedBaselineGates(ralphDir).filter((gate) => gate.exitCode !== 0);
}

function _detectRecordedBaselineGates(ralphDir) {
  const baselinesDir = fsPath.join(ralphDir, 'baselines');
  if (!fs.existsSync(baselinesDir) || !fs.statSync(baselinesDir).isDirectory()) {
    return [];
  }

  const gates = [];
  for (const name of fs.readdirSync(baselinesDir)) {
    if (!/\.txt$/i.test(name)) continue;

    const gateName = _gateNameFromBaselineFile(name);
    if (!gateName) continue;

    const file = fsPath.join(baselinesDir, name);
    const tail = _readFileTail(file, 16384);
    const exitMatch = tail.match(/(?:^|\n)EXIT=(\d+)(?:\n|$)/);
    if (!exitMatch) continue;

    const exitCode = Number(exitMatch[1]);
    if (!Number.isInteger(exitCode)) continue;

    gates.push({ name: gateName, file: fsPath.join('baselines', name), exitCode });
  }

  const priority = { typecheck: 1, lint: 2, test: 3 };
  return gates.sort((a, b) =>
    (priority[a.name] || 99) - (priority[b.name] || 99) ||
    a.file.localeCompare(b.file)
  );
}

function _detectMissingBaselineGates(strictGates, recordedBaselines, taskBlock, tasksFile) {
  if (!Array.isArray(strictGates) || strictGates.length === 0) return [];

  const expectsBaseline =
    _taskExplicitlyHandlesBaselineFailures(taskBlock) ||
    _completedPreflightBaselineExists(tasksFile);

  if (!expectsBaseline) return [];

  const recordedNames = new Set((recordedBaselines || []).map((gate) => gate.name));
  return strictGates.filter((gate) => !recordedNames.has(gate.name));
}

function _completedPreflightBaselineExists(tasksFile) {
  if (!tasksFile || !fs.existsSync(tasksFile)) return false;

  const lines = fs.readFileSync(tasksFile, 'utf8').split(/\r?\n/);
  return lines.some((line) =>
    /^-\s+\[x\]\s+.*\bpre-?flight\b.*\bbaselines?\b/i.test(line)
  );
}

function _gateNameFromBaselineFile(fileName) {
  const normalized = fileName.toLowerCase();
  if (/(^|[-_.])typecheck([-_.]|\.|$)/.test(normalized)) return 'typecheck';
  if (/(^|[-_.])lint([-_.]|\.|$)/.test(normalized)) return 'lint';
  if (/(^|[-_.])test([-_.]|\.|$)/.test(normalized)) return 'test';
  return '';
}

function _readFileTail(file, maxBytes) {
  let fd = null;
  try {
    const stat = fs.statSync(file);
    const length = Math.min(stat.size, maxBytes);
    const offset = Math.max(0, stat.size - length);
    const buffer = Buffer.alloc(length);
    fd = fs.openSync(file, 'r');
    fs.readSync(fd, buffer, 0, length, offset);
    return buffer.toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close failures while building best-effort feedback.
      }
    }
  }
}

function _taskExplicitlyHandlesBaselineFailures(taskBlock) {
  return /\bbaseline\b/i.test(taskBlock) &&
    /\b(match|matches|matching|classif(?:y|ied|ication)|pre-existing|preexisting|no new failures?)\b/i.test(taskBlock);
}

function _detectAuthorizedBaselineCleanup(taskBlock) {
  if (!taskBlock || !/\b(authori[sz]ed cleanup|after fixing|fixing the named baseline failures?)\b/i.test(taskBlock)) {
    return { allowedFiles: [] };
  }

  const allowedFiles = [];
  const seen = new Set();
  const backtickPattern = /`([^`]+)`/g;
  let match;

  while ((match = backtickPattern.exec(taskBlock)) !== null) {
    const candidate = match[1].trim();
    if (!_looksLikeCleanupPath(candidate)) continue;

    const normalized = candidate.replace(/\\/g, '/');
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    allowedFiles.push(normalized);
  }

  return { allowedFiles };
}

function _looksLikeCleanupPath(value) {
  if (!value || /\s/.test(value)) return false;
  if (/^(pnpm|npm|yarn|node|gtimeout|timeout|rg|git)(\s|$)/i.test(value)) return false;
  if (/^--?/.test(value)) return false;
  if (/[*{}]/.test(value)) return false;
  return value.includes('/') || /\.[A-Za-z0-9]+$/.test(value);
}

function _baselineGateRepairBudgetUsed(recentHistory, currentTaskMeta, allowedFiles) {
  if (!Array.isArray(recentHistory) || recentHistory.length === 0) return false;

  return recentHistory.some((entry) => {
    if (!_historyEntryMatchesTask(entry, currentTaskMeta)) return false;
    if (entry.baselineGateRepairAttempted === true) return true;

    return _baselineGateRepairAttempted(
      { mode: 'authorized_cleanup', allowedFiles },
      entry.filesChanged || []
    );
  });
}

function _baselineGateRepairAttempted(conflict, filesChanged) {
  if (
    !conflict ||
    conflict.mode !== 'authorized_cleanup' ||
    !Array.isArray(conflict.allowedFiles) ||
    conflict.allowedFiles.length === 0 ||
    !Array.isArray(filesChanged) ||
    filesChanged.length === 0
  ) {
    return false;
  }

  return _pathsIntersect(conflict.allowedFiles, filesChanged);
}

function _historyEntryMatchesTask(entry, currentTaskMeta) {
  if (!entry || !currentTaskMeta) return false;

  const currentNumber = currentTaskMeta.number || '';
  const currentDescription = currentTaskMeta.description || '';

  if (currentNumber && entry.taskNumber === currentNumber) return true;
  if (!currentNumber && currentDescription && entry.taskDescription === currentDescription) return true;

  return false;
}

function _pathsIntersect(left, right) {
  const normalizedLeft = new Set((left || []).map(_normalizeComparablePath));
  return (right || []).some((pathValue) => normalizedLeft.has(_normalizeComparablePath(pathValue)));
}

function _normalizeComparablePath(pathValue) {
  return String(pathValue || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

module.exports = {
  _buildBaselineGateFeedback,
  _analyzeBaselineGateConflict,
  _formatBaselineGateFeedback,
  _extractCurrentTaskBlock,
  _detectStrictCleanGates,
  _detectFailingBaselineGates,
  _detectRecordedBaselineGates,
  _detectMissingBaselineGates,
  _completedPreflightBaselineExists,
  _gateNameFromBaselineFile,
  _readFileTail,
  _taskExplicitlyHandlesBaselineFailures,
  _detectAuthorizedBaselineCleanup,
  _looksLikeCleanupPath,
  _baselineGateRepairBudgetUsed,
  _baselineGateRepairAttempted,
  _historyEntryMatchesTask,
  _pathsIntersect,
  _normalizeComparablePath,
};
