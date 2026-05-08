'use strict';

/**
 * supervisor.js - Supervisor-loop helpers for mini-ralph.
 *
 * This initial slice freezes the prompt-template variable list and the
 * response-parser contract before orchestration and patch application land.
 */

const fs = require('fs');
const path = require('path');

const tasks = require('./tasks');

const _RULE_SOURCE_MAX_BYTES = 32 * 1024;
const _ruleSourceCache = new Map();

const _SUPERVISOR_TEMPLATE_VARIABLES = Object.freeze([
  'blocker_note',
  'current_task_number',
  'current_task_body',
  'downstream_tasks',
  'handoff_history',
  'recent_iterations',
  'try_index',
  'previous_supervisor_attempts',
  'openspec_config_rules',
  'ralph_authoring_rules',
  'change_proposal',
  'change_design',
  'run_stdout_log_path',
  'run_stderr_log_path',
]);

/**
 * Parse the supervisor's fenced JSON response.
 *
 * Missing fences and malformed JSON are infrastructure failures. Unknown task
 * numbers are structural rejections when a tasks file is available via
 * `RALPH_TASKS_FILE`.
 *
 * @param {string} stdout
 * @returns {object}
 */
function _parseSupervisorResponse(stdout) {
  const match = String(stdout || '').match(/```supervisor-response\s*([\s\S]*?)```/);
  if (!match) {
    return { kind: 'infra_failure', reason: 'missing_fence' };
  }

  let parsed;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return { kind: 'infra_failure', reason: 'malformed_json' };
  }

  const unknownTaskNumber = _findUnknownTaskNumber(parsed);
  if (unknownTaskNumber) {
    return {
      kind: 'structural_rejection',
      reason: 'unknown_task_number',
      taskNumber: unknownTaskNumber,
    };
  }

  return {
    current_task_patch: Object.prototype.hasOwnProperty.call(parsed, 'current_task_patch')
      ? parsed.current_task_patch
      : null,
    downstream_patches: Array.isArray(parsed.downstream_patches) ? parsed.downstream_patches : [],
    investigation_hints: Array.isArray(parsed.investigation_hints) ? parsed.investigation_hints : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    downstream_rationale: typeof parsed.downstream_rationale === 'string'
      ? parsed.downstream_rationale
      : '',
  };
}

function _findUnknownTaskNumber(parsed) {
  const knownTaskNumbers = _readKnownTaskNumbers();
  if (!knownTaskNumbers || knownTaskNumbers.size === 0) {
    return '';
  }

  const candidateNumbers = [];
  if (parsed && parsed.current_task_patch && typeof parsed.current_task_patch === 'object') {
    candidateNumbers.push(parsed.current_task_patch.task_number);
  }

  if (parsed && Array.isArray(parsed.downstream_patches)) {
    for (const patch of parsed.downstream_patches) {
      if (!patch || typeof patch !== 'object') continue;
      candidateNumbers.push(patch.task_number);
      candidateNumbers.push(patch.anchor_task_number);
    }
  }

  for (const taskNumber of candidateNumbers) {
    if (typeof taskNumber === 'string' && taskNumber.trim() && !knownTaskNumbers.has(taskNumber.trim())) {
      return taskNumber.trim();
    }
  }

  return '';
}

function _readKnownTaskNumbers() {
  const tasksFile = process.env.RALPH_TASKS_FILE;
  if (!tasksFile) {
    return null;
  }

  return new Set(
    tasks.parseTasks(tasksFile)
      .map((task) => task.number)
      .filter(Boolean)
  );
}

/**
 * Load the four Layer alpha rule sources used by the supervisor prompt.
 *
 * @param {{ tasksFile?: string, changeDir?: string, openspecRoot?: string }} [options]
 * @returns {object}
 */
function _loadRuleSources(options = {}) {
  const tasksFile = options.tasksFile ? path.resolve(options.tasksFile) : '';
  const changeDir = options.changeDir
    ? path.resolve(options.changeDir)
    : (tasksFile ? path.dirname(tasksFile) : '');
  const openspecRoot = options.openspecRoot
    ? path.resolve(options.openspecRoot)
    : _resolveOpenspecRootFromTasks(tasksFile);

  if (!openspecRoot) {
    throw new Error('mini-ralph supervisor: unable to resolve openspec root from tasks.md');
  }

  const cacheEnabled = process.env.RALPH_SELF_HEAL_RULE_CACHE !== '0';
  const rulePaths = {
    openspec_config_rules: path.join(openspecRoot, 'config.yaml'),
    ralph_authoring_rules: path.join(openspecRoot, 'OPENSPEC-RALPH-BP.md'),
    change_proposal: path.join(changeDir, 'proposal.md'),
    change_design: path.join(changeDir, 'design.md'),
  };

  const loaded = {};
  for (const [name, filePath] of Object.entries(rulePaths)) {
    loaded[name] = {
      path: filePath,
      content: _readRuleSource(filePath, { cacheEnabled }),
    };
  }

  return loaded;
}

function _readRuleSource(filePath, options = {}) {
  const cacheEnabled = options.cacheEnabled !== false;

  if (!fs.existsSync(filePath)) {
    _ruleSourceCache.delete(filePath);
    return '';
  }

  const stat = fs.statSync(filePath);
  const cached = cacheEnabled ? _ruleSourceCache.get(filePath) : null;
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.content;
  }

  const content = _truncateRuleSource(fs.readFileSync(filePath, 'utf8'), filePath);
  if (cacheEnabled) {
    if (cached) {
      process.stderr.write(`[mini-ralph] warning: supervisor rule cache refreshed for ${filePath}\n`);
    }
    _ruleSourceCache.set(filePath, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      content,
    });
  }

  return content;
}

function _truncateRuleSource(content, filePath) {
  const buffer = Buffer.from(String(content || ''), 'utf8');
  if (buffer.byteLength <= _RULE_SOURCE_MAX_BYTES) {
    return String(content || '');
  }

  const sentinel = `... [truncated, ${buffer.byteLength} total]`;
  const keepBytes = Math.max(0, _RULE_SOURCE_MAX_BYTES - Buffer.byteLength(sentinel));
  process.stderr.write(`[mini-ralph] warning: supervisor rule source truncated: ${filePath}\n`);
  return buffer.subarray(0, keepBytes).toString('utf8') + sentinel;
}

function _resolveOpenspecRootFromTasks(tasksFile) {
  let current = tasksFile ? path.resolve(path.dirname(tasksFile)) : '';
  while (current) {
    if (path.basename(current) === 'openspec') {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return '';
}

function _resetRuleSourceCache() {
  _ruleSourceCache.clear();
}

module.exports = {
  _loadRuleSources,
  _parseSupervisorResponse,
  _SUPERVISOR_TEMPLATE_VARIABLES,
  _resetRuleSourceCache,
};
