'use strict';

/**
 * supervisor.js - Supervisor-loop helpers for mini-ralph.
 *
 * This initial slice freezes the prompt-template variable list and the
 * response-parser contract before orchestration and patch application land.
 */

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const crypto = require('crypto');

const tasks = require('./tasks');
const state = require('./state');
const invoker = require('./invoker');
const { _renderTemplate } = require('./prompt');
const rules = require('./supervisor-rules');
const stateHelpers = require('./supervisor-state');

const _SUPERVISOR_TMP_SUFFIX = '.supervisor-tmp';
const _SUPERVISOR_ORIG_SUFFIX = '.supervisor-orig';

const _loadRuleSources = rules._loadRuleSources;
const _resetRuleSourceCache = rules._resetRuleSourceCache;
const _summarizeDownstreamTasks = rules._summarizeDownstreamTasks;
const _extractDesignSections = rules._extractDesignSections;
const _extractProposalSections = rules._extractProposalSections;
const _distillRalphBP = rules._distillRalphBP;
const _isEnabled = rules._isEnabled;
const _escapeRegExp = rules._escapeRegExp;
const _resolveOpenspecRootFromTasks = rules._resolveOpenspecRootFromTasks;

const _computeBlockerHash = stateHelpers._computeBlockerHash;
const _readSupervisorState = stateHelpers._readSupervisorState;
const _writeSupervisorState = stateHelpers._writeSupervisorState;
const _nonNegativeInteger = stateHelpers._nonNegativeInteger;
const _decideBoundedBudget = stateHelpers._decideBoundedBudget;
const _consumeBoundedBudget = stateHelpers._consumeBoundedBudget;
const _normalizeInvestigationHints = stateHelpers._normalizeInvestigationHints;
const _formatPreviousSupervisorAttempts = stateHelpers._formatPreviousSupervisorAttempts;
const _joinSummaryParts = stateHelpers._joinSummaryParts;
const _firstNonEmptyText = stateHelpers._firstNonEmptyText;
const _buildSupervisorReturn = stateHelpers._buildSupervisorReturn;

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

function _renderSupervisorPrompt(options = {}) {
  const templatePath = options.templatePath
    ? path.resolve(options.templatePath)
    : path.join(path.resolve(__dirname, '..', '..'), 'scripts', 'supervisor-prompt.md');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`mini-ralph supervisor: template file not found: ${templatePath}`);
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  if (!template.trim()) {
    throw new Error(`mini-ralph supervisor: template file is empty: ${templatePath}`);
  }

  const renderedVars = _buildSupervisorTemplateVars(options);
  return _renderTemplate(template, renderedVars)
    .replace(/\{\{tasks_md_path\}\}/g, '')
    .replace(/\{\{blocker_hash\}\}/g, '');
}

function _buildSupervisorTemplateVars(options) {
  const requiredInputs = [
    'blockerNote',
    'currentTaskNumber',
    'currentTaskBody',
    'downstreamTasks',
    'handoffHistory',
    'recentIterations',
    'tryIndex',
    'previousSupervisorAttempts',
  ];

  for (const key of requiredInputs) {
    if (options[key] === undefined || options[key] === null) {
      throw new Error(`mini-ralph supervisor: missing renderer input for ${key}`);
    }
  }

  const tryIndex = Number(options.tryIndex);
  if (!Number.isInteger(tryIndex) || tryIndex < 1) {
    throw new Error('mini-ralph supervisor: tryIndex must be a positive integer');
  }

  const ruleSources = _loadRuleSources(options);
  const retrySuppressed = tryIndex >= 2;
  const suppressDownstream = retrySuppressed && !_isEnabled(options.keepDownstreamOnRetry, 'RALPH_SELF_HEAL_KEEP_DOWNSTREAM_ON_RETRY');
  const suppressHandoffHistory = retrySuppressed && !_isEnabled(options.keepHandoffHistoryOnRetry, 'RALPH_SELF_HEAL_KEEP_HANDOFF_HISTORY_ON_RETRY');

  return {
    blocker_note: String(options.blockerNote),
    current_task_number: String(options.currentTaskNumber),
    current_task_body: String(options.currentTaskBody),
    downstream_tasks: suppressDownstream
      ? '[suppressed on retry; see try 1]'
      : _summarizeDownstreamTasks(options.downstreamTasks, options),
    handoff_history: suppressHandoffHistory
      ? '[suppressed on retry; see try 1]'
      : String(options.handoffHistory),
    recent_iterations: String(options.recentIterations),
    try_index: String(tryIndex),
    previous_supervisor_attempts: String(options.previousSupervisorAttempts),
    openspec_config_rules: ruleSources.openspec_config_rules.content,
    ralph_authoring_rules: _distillRalphBP(ruleSources.ralph_authoring_rules.content, options),
    change_proposal: _extractProposalSections(ruleSources.change_proposal.content, options),
    change_design: _extractDesignSections(ruleSources.change_design.content, options),
    run_stdout_log_path: String(options.runStdoutLogPath || ''),
    run_stderr_log_path: String(options.runStderrLogPath || ''),
  };
}

function _detectSizingProfile(ralphAuthoringRules) {
  const defaultProfile = {
    name: 'medium',
    minDoneWhen: 3,
    maxDoneWhen: 7,
    source: 'default_medium',
  };
  const input = String(ralphAuthoringRules || '');

  const lightweightRange = _extractSizingRange(input, 'Lightweight');
  if (lightweightRange) {
    return {
      name: 'lightweight',
      minDoneWhen: lightweightRange.min,
      maxDoneWhen: lightweightRange.max,
      source: 'bp_lightweight',
    };
  }

  const mediumRange = _extractSizingRange(input, 'Medium');
  if (mediumRange) {
    return {
      name: 'medium',
      minDoneWhen: mediumRange.min,
      maxDoneWhen: mediumRange.max,
      source: 'bp_medium',
    };
  }

  return defaultProfile;
}

function _extractSizingRange(input, profileName) {
  const lines = String(input || '').split('\n');
  const heading = `**${profileName} profile**`;

  for (const line of lines) {
    if (!line.includes(heading)) {
      continue;
    }

    const match = line.match(/(\d+)\s*[–-]\s*(\d+)\s+`?Done when`?\s+bullets/i);
    if (!match) {
      continue;
    }

    return {
      min: Number(match[1]),
      max: Number(match[2]),
    };
  }

  return null;
}

function _validateTaskStructure(taskBody, options = {}) {
  const body = String(taskBody || '').replace(/\r\n/g, '\n');
  const lines = body.split('\n');
  const errors = [];
  const warnings = [];
  const sizingProfile = options.sizingProfile || _detectSizingProfile(options.ralphAuthoringRules || '');
  const titleLine = lines.find((line) => line.trim()) || '';

  if (!/^\s*-\s+\[ \]\s+(?:\d+(?:\.\d+)*\s+)?\*\*.+\*\*/.test(titleLine)) {
    errors.push('bold_title_missing: task body must start with a pending checkbox line containing a bold title');
  }

  const scopeIndex = _findTaskBulletIndex(lines, 'Scope:');
  if (scopeIndex === -1) {
    errors.push('scope_missing: task body must include a `Scope:` bullet');
  }

  const changeIndex = _findTaskBulletIndex(lines, 'Change:');
  if (changeIndex === -1) {
    errors.push('change_missing: task body must include a `Change:` bullet');
  }

  const doneWhenIndex = _findTaskBulletIndex(lines, 'Done when:');
  const doneWhenBullets = doneWhenIndex === -1 ? [] : _collectNestedBulletLines(lines, doneWhenIndex);
  if (doneWhenIndex === -1) {
    errors.push('done_when_missing: task body must include a `Done when:` bullet');
  } else if (doneWhenBullets.length < sizingProfile.minDoneWhen) {
    errors.push(
      `done_when_count_under_spec: expected ${sizingProfile.minDoneWhen}-${sizingProfile.maxDoneWhen} nested bullets under \`Done when:\`, found ${doneWhenBullets.length}`
    );
  } else if (doneWhenBullets.length > sizingProfile.maxDoneWhen) {
    errors.push(
      `done_when_count_over_spec: expected ${sizingProfile.minDoneWhen}-${sizingProfile.maxDoneWhen} nested bullets under \`Done when:\`, found ${doneWhenBullets.length}`
    );
  }

  const stopIndex = _findTaskBulletIndex(lines, 'Stop and hand off if:');
  const stopBullets = stopIndex === -1 ? [] : _collectNestedBulletLines(lines, stopIndex);
  if (stopIndex === -1) {
    errors.push('stop_and_hand_off_missing: task body must include a `Stop and hand off if:` bullet');
  } else if (stopBullets.length < 1) {
    errors.push('stop_and_hand_off_subbullet_missing: `Stop and hand off if:` must include at least one nested sub-bullet');
  }

  if (!/<!--\s*supervised-edit:/i.test(body)) {
    errors.push('audit_comment_missing: task body must include a `<!-- supervised-edit: ... -->` audit comment');
  }

  for (const line of doneWhenBullets) {
    const trimmed = line.trim();
    if (!/\b(ensure|support|validate|keep|maintain)\b/i.test(trimmed)) {
      continue;
    }
    if (/`[^`]+`/.test(trimmed)) {
      continue;
    }
    warnings.push(`soft_verb_without_verifier: ${trimmed}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    sizingProfile,
  };
}

function _findTaskBulletIndex(lines, label) {
  return lines.findIndex((line) => new RegExp(`^\\s+-\\s+${_escapeRegExp(label)}`).test(line));
}

function _collectNestedBulletLines(lines, parentIndex) {
  if (parentIndex < 0 || parentIndex >= lines.length) {
    return [];
  }

  const parentMatch = lines[parentIndex].match(/^(\s*)-\s+/);
  const parentIndent = parentMatch ? parentMatch[1].length : 0;
  const nested = [];

  for (let index = parentIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const bulletMatch = line.match(/^(\s*)-\s+/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      if (indent <= parentIndent) {
        break;
      }
      nested.push(line);
      continue;
    }

    if (line.trim() && line.match(/^\s*[^-]/) && line.search(/\S/) <= parentIndent) {
      break;
    }
  }

  return nested;
}

function _applyTaskPatch(options = {}) {
  const tasksFile = options.tasksFile ? path.resolve(options.tasksFile) : '';
  const patchedContent = String(options.patchedContent || '');
  const timeout = Number.isInteger(options.validationTimeoutMs) && options.validationTimeoutMs > 0
    ? options.validationTimeoutMs
    : 30000;

  if (!tasksFile) {
    throw new Error('mini-ralph supervisor: tasksFile is required for patch application');
  }
  if (!fs.existsSync(tasksFile)) {
    throw new Error(`mini-ralph supervisor: tasks file not found: ${tasksFile}`);
  }

  const tmpPath = `${tasksFile}${_SUPERVISOR_TMP_SUFFIX}`;
  const origPath = `${tasksFile}${_SUPERVISOR_ORIG_SUFFIX}`;
  const changeDir = path.dirname(tasksFile);
  const activeChangeId = path.basename(changeDir);
  const cwd = options.cwd
    ? path.resolve(options.cwd)
    : _resolveWorkspaceRootFromTasks(tasksFile);

  if (!cwd) {
    throw new Error(`mini-ralph supervisor: unable to resolve workspace root from tasks file: ${tasksFile}`);
  }

  fs.writeFileSync(tmpPath, patchedContent, 'utf8');
  fs.renameSync(tasksFile, origPath);
  fs.renameSync(tmpPath, tasksFile);

  try {
    childProcess.execFileSync('npx', ['openspec', 'validate', activeChangeId, '--strict'], {
      cwd,
      timeout,
    });
    fs.rmSync(origPath, { force: true });
    fs.rmSync(tmpPath, { force: true });
    return {
      ok: true,
      activeChangeId,
    };
  } catch (error) {
    _restoreOriginalTasksFile(tasksFile, origPath, tmpPath);
    return {
      ok: false,
      reason: 'validation_failed',
      activeChangeId,
      stderr: _readExecErrorStream(error, 'stderr'),
      stdout: _readExecErrorStream(error, 'stdout'),
      error,
    };
  }
}

function _recoverSupervisorTmpFiles(options = {}) {
  const tasksFile = options.tasksFile
    ? path.resolve(options.tasksFile)
    : (options.changeDir ? path.join(path.resolve(options.changeDir), 'tasks.md') : '');

  if (!tasksFile) {
    throw new Error('mini-ralph supervisor: tasksFile or changeDir is required for recovery');
  }

  const tmpPath = `${tasksFile}${_SUPERVISOR_TMP_SUFFIX}`;
  const origPath = `${tasksFile}${_SUPERVISOR_ORIG_SUFFIX}`;
  const actions = [];

  if (fs.existsSync(origPath)) {
    if (fs.existsSync(tasksFile)) {
      fs.rmSync(tasksFile, { force: true });
      actions.push(`removed stale tasks file: ${tasksFile}`);
    }
    fs.renameSync(origPath, tasksFile);
    actions.push(`restored tasks file from rollback: ${origPath} -> ${tasksFile}`);
    if (fs.existsSync(tmpPath)) {
      fs.rmSync(tmpPath, { force: true });
      actions.push(`discarded staged supervisor tmp: ${tmpPath}`);
    }
    return {
      recovered: true,
      actions,
    };
  }

  if (fs.existsSync(tmpPath)) {
    if (!fs.existsSync(tasksFile)) {
      fs.renameSync(tmpPath, tasksFile);
      actions.push(`restored tasks file from staged supervisor tmp: ${tmpPath} -> ${tasksFile}`);
    } else {
      fs.rmSync(tmpPath, { force: true });
      actions.push(`discarded orphaned supervisor tmp: ${tmpPath}`);
    }
  }

  return {
    recovered: actions.length > 0,
    actions,
  };
}

function _resolveWorkspaceRootFromTasks(tasksFile) {
  const openspecRoot = _resolveOpenspecRootFromTasks(tasksFile);
  if (!openspecRoot) {
    return '';
  }
  return path.dirname(openspecRoot);
}

function _resolveRunLogPaths(options = {}) {
  if (process.env.RALPH_SELF_HEAL_LOG_ACCESS === '0') {
    return { stdoutLog: '', stderrLog: '' };
  }

  const ralphDir = options.ralphDir ? path.resolve(options.ralphDir) : '';
  if (!ralphDir) {
    return { stdoutLog: '', stderrLog: '' };
  }

  const outputDirFile = path.join(ralphDir, '.output_dir');
  if (!fs.existsSync(outputDirFile)) {
    return { stdoutLog: '', stderrLog: '' };
  }

  let outputDir = '';
  try {
    outputDir = String(fs.readFileSync(outputDirFile, 'utf8') || '').trim();
  } catch {
    return { stdoutLog: '', stderrLog: '' };
  }

  if (!outputDir) {
    return { stdoutLog: '', stderrLog: '' };
  }

  const resolvedOutputDir = path.isAbsolute(outputDir)
    ? path.resolve(outputDir)
    : path.resolve(ralphDir, outputDir);

  return {
    stdoutLog: _resolveExistingLogPath(path.join(resolvedOutputDir, 'ralph-stdout.log')),
    stderrLog: _resolveExistingLogPath(path.join(resolvedOutputDir, 'ralph-stderr.log')),
  };
}

function _resolveExistingLogPath(filePath) {
  if (!filePath) {
    return '';
  }

  const resolved = path.resolve(filePath);
  try {
    return fs.statSync(resolved).isFile() ? resolved : '';
  } catch {
    return '';
  }
}

function _detectSupervisorLogReads(options = {}) {
  const result = options.result || {};
  const stdoutLog = String(options.stdoutLog || '');
  const stderrLog = String(options.stderrLog || '');
  const toolUsage = Array.isArray(result.toolUsage) ? result.toolUsage : null;

  if (!toolUsage || toolUsage.length === 0) {
    return {
      supervisorReadLogs: null,
      supervisorReadLogsBytes: null,
    };
  }

  const targetPaths = [stdoutLog, stderrLog].filter(Boolean).map((value) => path.resolve(value));
  let sawDetailedUsage = false;
  let matchedRead = false;
  let bytesRead = 0;

  for (const entry of toolUsage) {
    const analysis = _scanToolUsageEntry(entry, targetPaths);
    if (!analysis.hasDetails) {
      continue;
    }

    sawDetailedUsage = true;
    if (analysis.matched) {
      matchedRead = true;
      bytesRead += analysis.bytes;
    }
  }

  if (!sawDetailedUsage) {
    return {
      supervisorReadLogs: null,
      supervisorReadLogsBytes: null,
    };
  }

  return {
    supervisorReadLogs: matchedRead,
    supervisorReadLogsBytes: matchedRead ? bytesRead : 0,
  };
}

function _scanToolUsageEntry(value, targetPaths) {
  if (Array.isArray(value)) {
    return value.reduce((acc, item) => _mergeToolUsageAnalysis(acc, _scanToolUsageEntry(item, targetPaths)), {
      hasDetails: false,
      matched: false,
      bytes: 0,
    });
  }

  if (!value || typeof value !== 'object') {
    return { hasDetails: false, matched: false, bytes: 0 };
  }

  const keys = Object.keys(value);
  const hasDetails = keys.some((key) => !['tool', 'count'].includes(key));
  let matched = false;
  let bytes = 0;

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && _matchesLogPath(child, targetPaths)) {
      matched = true;
      const inferredBytes = _inferReadBytes(value, key);
      if (inferredBytes > 0) {
        bytes += inferredBytes;
      }
    }

    if (Array.isArray(child) || (child && typeof child === 'object')) {
      const nested = _scanToolUsageEntry(child, targetPaths);
      matched = matched || nested.matched;
      bytes += nested.bytes;
    }
  }

  if (matched && bytes === 0) {
    bytes = _inferReadBytesDeep(value);
  }

  return { hasDetails, matched, bytes };
}

function _mergeToolUsageAnalysis(current, next) {
  return {
    hasDetails: current.hasDetails || next.hasDetails,
    matched: current.matched || next.matched,
    bytes: current.bytes + next.bytes,
  };
}

function _matchesLogPath(candidate, targetPaths) {
  const text = String(candidate || '').trim();
  if (!text || targetPaths.length === 0) {
    return false;
  }

  const normalized = path.isAbsolute(text) ? path.resolve(text) : '';
  if (normalized && targetPaths.includes(normalized)) {
    return true;
  }

  return targetPaths.some((targetPath) => text.includes(targetPath));
}

function _inferReadBytes(source, matchedKey) {
  const directKeys = [
    'bytes',
    'byteCount',
    'bytesRead',
    'readBytes',
    'size',
    'length',
  ];
  for (const key of directKeys) {
    const value = _toFiniteNonNegativeNumber(source[key]);
    if (value !== null) {
      return value;
    }
  }

  if (typeof source.content === 'string') {
    return Buffer.byteLength(source.content, 'utf8');
  }

  if (typeof source.preview === 'string') {
    return Buffer.byteLength(source.preview, 'utf8');
  }

  if (typeof source.text === 'string' && matchedKey !== 'text') {
    return Buffer.byteLength(source.text, 'utf8');
  }

  return 0;
}

function _inferReadBytesDeep(value) {
  if (!value || typeof value !== 'object') {
    return 0;
  }

  const direct = _inferReadBytes(value, '');
  if (direct > 0) {
    return direct;
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const nested = _inferReadBytesDeep(item);
        if (nested > 0) {
          return nested;
        }
      }
      continue;
    }

    if (child && typeof child === 'object') {
      const nested = _inferReadBytesDeep(child);
      if (nested > 0) {
        return nested;
      }
    }
  }

  return 0;
}

function _toFiniteNonNegativeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return null;
}

function _restoreOriginalTasksFile(tasksFile, origPath, tmpPath) {
  if (fs.existsSync(origPath)) {
    if (fs.existsSync(tasksFile)) {
      fs.rmSync(tasksFile, { force: true });
    }
    fs.renameSync(origPath, tasksFile);
  }
  if (fs.existsSync(tmpPath)) {
    fs.rmSync(tmpPath, { force: true });
  }
}

function _readExecErrorStream(error, streamName) {
  if (!error || !error[streamName]) {
    return '';
  }

  const value = error[streamName];
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  return String(value);
}

async function runSupervisor(options = {}) {
  const blockerNote = String(options.blockerNote || '');
  const ralphDir = options.ralphDir ? path.resolve(options.ralphDir) : '';
  const changeDir = options.changeDir ? path.resolve(options.changeDir) : '';
  const openspecRoot = options.openspecRoot ? path.resolve(options.openspecRoot) : '';
  const config = Object.assign({
    selfHealMaxTries: 3,
    selfHealDownstream: true,
    selfHealHints: true,
    selfHealLogAccess: true,
    selfHealVerbose: false,
    validationTimeoutMs: 30000,
  }, options.config || {});
  const tasksFile = options.tasksFile
    ? path.resolve(options.tasksFile)
    : path.join(changeDir, 'tasks.md');

  if (!ralphDir) {
    throw new Error('mini-ralph supervisor: ralphDir is required');
  }
  if (!changeDir) {
    throw new Error('mini-ralph supervisor: changeDir is required');
  }
  if (!fs.existsSync(tasksFile)) {
    throw new Error(`mini-ralph supervisor: tasks file not found: ${tasksFile}`);
  }

  const invokeSupervisor = options.invoke || invoker.invoke;
  const renderSupervisorPrompt = options.renderPrompt || _renderSupervisorPrompt;
  const parseSupervisorResponse = options.parseResponse || _parseSupervisorResponse;
  const validateTaskStructure = options.validateTaskStructure || _validateTaskStructure;
  const applyTaskPatch = options.applyTaskPatch || _applyTaskPatch;
  const resolveRunLogPaths = options.resolveRunLogPaths || _resolveRunLogPaths;
  const detectSupervisorLogReads = options.detectSupervisorLogReads || _detectSupervisorLogReads;

  const blockerHash = _computeBlockerHash(blockerNote);
  const supervisorState = _readSupervisorState(ralphDir);
  const sameEvent = supervisorState.currentBlockerHash === blockerHash;
  let triesUsed = sameEvent ? _nonNegativeInteger(supervisorState.triesUsedForCurrentBlocker) : 0;
  let totalAttempts = sameEvent ? _nonNegativeInteger(supervisorState.totalAttemptsForCurrentBlocker) : 0;
  let lastOutcome = sameEvent ? String(supervisorState.lastOutcome || '') : '';
  const maxTries = Number.isInteger(config.selfHealMaxTries) && config.selfHealMaxTries > 0
    ? config.selfHealMaxTries
    : 3;
  const hardAttemptCap = 5;
  const previousSupervisorAttempts = [];
  const supervisorAttempts = [];

  if (sameEvent && lastOutcome === 'patch_applied') {
    _writeSupervisorState(ralphDir, {
      currentBlockerHash: blockerHash,
      triesUsedForCurrentBlocker: triesUsed,
      totalAttemptsForCurrentBlocker: totalAttempts,
      lastOutcome: 'oscillation',
    });
    return _buildSupervisorReturn({
      outcome: 'blocked_handoff',
      summary: 'Supervisor stopped after the same blocker hash reappeared for the current blocker event.',
      blockerHash,
      readLogs: false,
      readLogsBytes: 0,
    });
  }

  while (triesUsed < maxTries && totalAttempts < hardAttemptCap) {
    const taskSnapshot = _readTaskSnapshot(tasksFile);
    const currentTask = taskSnapshot.currentTask;
    if (!currentTask) {
      _writeSupervisorState(ralphDir, {
        currentBlockerHash: blockerHash,
        triesUsedForCurrentBlocker: triesUsed,
        totalAttemptsForCurrentBlocker: totalAttempts,
        lastOutcome: 'no_pending_task',
      });
      return _buildSupervisorReturn({
        outcome: 'blocked_handoff',
        summary: 'Supervisor could not find a pending task to patch.',
        blockerHash,
        readLogs: false,
        readLogsBytes: 0,
      });
    }

    const tryIndex = triesUsed + 1;
    const logPaths = config.selfHealLogAccess
      ? resolveRunLogPaths({ ralphDir, changeDir })
      : { stdoutLog: '', stderrLog: '' };
    const prompt = renderSupervisorPrompt({
      blockerNote,
      changeDir,
      openspecRoot,
      tasksFile,
      currentTaskNumber: currentTask.number,
      currentTaskBody: currentTask.body,
      downstreamTasks: taskSnapshot.downstreamTasks,
      handoffHistory: '',
      recentIterations: '',
      tryIndex,
      previousSupervisorAttempts: _formatPreviousSupervisorAttempts(previousSupervisorAttempts),
      runStdoutLogPath: logPaths.stdoutLog || '',
      runStderrLogPath: logPaths.stderrLog || '',
    });

    let result;
    try {
      result = await invokeSupervisor({
        prompt,
        model: options.model,
        noCommit: true,
        verbose: config.selfHealVerbose,
        ralphDir,
      });
    } catch (error) {
      totalAttempts += 1;
      lastOutcome = 'infra_failure';
      previousSupervisorAttempts.push(`attempt ${totalAttempts}: infra_failure ${error.message}`);
      _writeSupervisorState(ralphDir, {
        currentBlockerHash: blockerHash,
        triesUsedForCurrentBlocker: triesUsed,
        totalAttemptsForCurrentBlocker: totalAttempts,
        lastOutcome,
      });
      continue;
    }

    totalAttempts += 1;
    const logAudit = detectSupervisorLogReads({
      result,
      stdoutLog: logPaths.stdoutLog || '',
      stderrLog: logPaths.stderrLog || '',
    }) || {};
    const readLogs = Object.prototype.hasOwnProperty.call(logAudit, 'supervisorReadLogs')
      ? logAudit.supervisorReadLogs
      : null;
    const readLogsBytes = Object.prototype.hasOwnProperty.call(logAudit, 'supervisorReadLogsBytes')
      ? logAudit.supervisorReadLogsBytes
      : null;

    const parsed = parseSupervisorResponse(result.stdout || '');
    if (parsed && parsed.kind === 'infra_failure') {
      lastOutcome = 'infra_failure';
      previousSupervisorAttempts.push(`attempt ${totalAttempts}: infra_failure ${parsed.reason}`);
      _writeSupervisorState(ralphDir, {
        currentBlockerHash: blockerHash,
        triesUsedForCurrentBlocker: triesUsed,
        totalAttemptsForCurrentBlocker: totalAttempts,
        lastOutcome,
      });
      continue;
    }

    if (parsed && parsed.kind === 'structural_rejection') {
      triesUsed += 1;
      lastOutcome = 'patch_rejected_structural';
      const attemptLine = `try ${triesUsed}: patch_rejected_structural ${parsed.reason}`;
      previousSupervisorAttempts.push(attemptLine);
      supervisorAttempts.push(attemptLine);
      _writeSupervisorState(ralphDir, {
        currentBlockerHash: blockerHash,
        triesUsedForCurrentBlocker: triesUsed,
        totalAttemptsForCurrentBlocker: totalAttempts,
        lastOutcome,
      });
      continue;
    }

    if (!parsed || typeof parsed !== 'object') {
      lastOutcome = 'infra_failure';
      previousSupervisorAttempts.push(`attempt ${totalAttempts}: infra_failure invalid response object`);
      _writeSupervisorState(ralphDir, {
        currentBlockerHash: blockerHash,
        triesUsedForCurrentBlocker: triesUsed,
        totalAttemptsForCurrentBlocker: totalAttempts,
        lastOutcome,
      });
      continue;
    }

    const normalizedHints = config.selfHealHints
      ? _normalizeInvestigationHints(parsed.investigation_hints, { openspecRoot, changeDir, ralphDir })
      : { hints: [], hintsDropped: [] };

    if (parsed.current_task_patch === null) {
      triesUsed += 1;
      lastOutcome = 'declined';
      supervisorAttempts.push(`try ${triesUsed}: declined ${parsed.summary || 'Supervisor declined to patch the current task.'}`);
      _writeSupervisorState(ralphDir, {
        currentBlockerHash: blockerHash,
        triesUsedForCurrentBlocker: triesUsed,
        totalAttemptsForCurrentBlocker: totalAttempts,
        lastOutcome,
      });
      return _buildSupervisorReturn({
        outcome: 'blocked_handoff',
        summary: parsed.summary || 'Supervisor declined to patch the current task.',
        blockerHash,
        hints: normalizedHints.hints,
        hintsDropped: normalizedHints.hintsDropped,
        attempts: supervisorAttempts,
        readLogs,
        readLogsBytes,
      });
    }

    if (!parsed.current_task_patch || typeof parsed.current_task_patch !== 'object') {
      triesUsed += 1;
      lastOutcome = 'patch_rejected_structural';
      const attemptLine = `try ${triesUsed}: patch_rejected_structural missing current_task_patch`;
      previousSupervisorAttempts.push(attemptLine);
      supervisorAttempts.push(attemptLine);
      _writeSupervisorState(ralphDir, {
        currentBlockerHash: blockerHash,
        triesUsedForCurrentBlocker: triesUsed,
        totalAttemptsForCurrentBlocker: totalAttempts,
        lastOutcome,
      });
      continue;
    }

    if (String(parsed.current_task_patch.task_number || '').trim() !== currentTask.number) {
      triesUsed += 1;
      lastOutcome = 'patch_rejected_structural';
      const attemptLine = `try ${triesUsed}: patch_rejected_structural current task mismatch (${parsed.current_task_patch.task_number || 'missing'})`;
      previousSupervisorAttempts.push(attemptLine);
      supervisorAttempts.push(attemptLine);
      _writeSupervisorState(ralphDir, {
        currentBlockerHash: blockerHash,
        triesUsedForCurrentBlocker: triesUsed,
        totalAttemptsForCurrentBlocker: totalAttempts,
        lastOutcome,
      });
      continue;
    }

    const currentPatchResult = _attemptStructuredTaskPatch({
      content: taskSnapshot.content,
      taskSnapshot,
      patch: parsed.current_task_patch,
      blockerHash,
      iteration: options.iteration,
      tasksFile,
      applyTaskPatch,
      validateTaskStructure,
      validationTimeoutMs: config.validationTimeoutMs,
      currentTaskNumber: currentTask.number,
    });
    if (!currentPatchResult.ok) {
      triesUsed += 1;
      lastOutcome = currentPatchResult.reason;
      const attemptLine = `try ${triesUsed}: ${currentPatchResult.reason} ${currentPatchResult.detail}`.trim();
      previousSupervisorAttempts.push(attemptLine);
      supervisorAttempts.push(attemptLine);
      _writeSupervisorState(ralphDir, {
        currentBlockerHash: blockerHash,
        triesUsedForCurrentBlocker: triesUsed,
        totalAttemptsForCurrentBlocker: totalAttempts,
        lastOutcome,
      });
      continue;
    }

    const patchedTasks = [currentTask.number];
    const softWarnings = currentPatchResult.warnings.slice();
    const downstreamPatches = config.selfHealDownstream && Array.isArray(parsed.downstream_patches)
      ? parsed.downstream_patches
      : [];
    const downstreamFailures = [];
    for (const downstreamPatch of downstreamPatches) {
      const downstreamResult = _attemptStructuredTaskPatch({
        content: fs.readFileSync(tasksFile, 'utf8'),
        taskSnapshot: _readTaskSnapshot(tasksFile),
        patch: downstreamPatch,
        blockerHash,
        iteration: options.iteration,
        tasksFile,
        applyTaskPatch,
        validateTaskStructure,
        validationTimeoutMs: config.validationTimeoutMs,
        currentTaskNumber: currentTask.number,
        allowInsert: true,
      });
      if (downstreamResult.ok) {
        patchedTasks.push(downstreamResult.taskNumber);
        softWarnings.push(...downstreamResult.warnings);
      } else {
        downstreamFailures.push(`${downstreamResult.taskNumber || 'unknown'}:${downstreamResult.reason}`);
      }
    }

    lastOutcome = 'patch_applied';
    _writeSupervisorState(ralphDir, {
      currentBlockerHash: blockerHash,
      triesUsedForCurrentBlocker: triesUsed,
      totalAttemptsForCurrentBlocker: totalAttempts,
      lastOutcome,
    });
    return _buildSupervisorReturn({
      outcome: 'patch_applied',
      patchedTasks,
      hints: normalizedHints.hints,
      hintsDropped: normalizedHints.hintsDropped,
      attempts: supervisorAttempts,
      readLogs,
      readLogsBytes,
      softWarnings,
      summary: _joinSummaryParts(parsed.summary, downstreamFailures),
      blockerHash,
    });
  }

  _writeSupervisorState(ralphDir, {
    currentBlockerHash: blockerHash,
    triesUsedForCurrentBlocker: triesUsed,
    totalAttemptsForCurrentBlocker: totalAttempts,
    lastOutcome: lastOutcome || (triesUsed >= maxTries ? 'budget_exhausted' : 'infra_failure'),
  });
  return _buildSupervisorReturn({
    outcome: 'blocked_handoff',
    summary: triesUsed >= maxTries
      ? 'Supervisor exhausted the configured self-heal try budget.'
      : 'Supervisor exhausted the infrastructure-attempt cap before producing a valid patch.',
    blockerHash,
    hints: [],
    hintsDropped: [],
    attempts: supervisorAttempts,
    attemptsExhausted: triesUsed >= maxTries,
    readLogs: false,
    readLogsBytes: 0,
  });
}

function _readTaskSnapshot(tasksFile) {
  const content = fs.readFileSync(tasksFile, 'utf8');
  const taskBlocks = _listTaskBlocks(content);
  const currentTask = taskBlocks.find((task) => task.status === 'incomplete') || null;
  const downstreamTasks = currentTask
    ? taskBlocks
      .filter((task) => task.status === 'incomplete' && task.index > currentTask.index)
      .map((task) => task.body)
      .join('\n\n')
    : '';
  return {
    content,
    taskBlocks,
    currentTask,
    downstreamTasks,
  };
}

function _listTaskBlocks(content) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let current = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const startMatch = line.match(/^-\s+\[([ x/])\]\s+(.+)$/);
    if (startMatch) {
      if (current) {
        current.endLine = index;
        current.body = lines.slice(current.startLine, current.endLine).join('\n').trimEnd();
        blocks.push(current);
      }
      const description = startMatch[2].trim();
      const numberMatch = description.match(/^(\d+(?:\.\d+)*)\b/);
      current = {
        index: blocks.length,
        number: numberMatch ? numberMatch[1] : '',
        status: _taskStatusFromCheck(startMatch[1]),
        startLine: index,
        endLine: lines.length,
        body: '',
      };
      continue;
    }

    if (current && /^##\s+/.test(line)) {
      current.endLine = index;
      current.body = lines.slice(current.startLine, current.endLine).join('\n').trimEnd();
      blocks.push(current);
      current = null;
    }
  }

  if (current) {
    current.endLine = lines.length;
    current.body = lines.slice(current.startLine, current.endLine).join('\n').trimEnd();
    blocks.push(current);
  }

  return blocks;
}

function _taskStatusFromCheck(checkChar) {
  if (checkChar === 'x') return 'completed';
  if (checkChar === '/') return 'in_progress';
  return 'incomplete';
}

function _attemptStructuredTaskPatch(options = {}) {
  const patch = options.patch;
  const patchTaskNumber = patch && typeof patch.task_number === 'string'
    ? patch.task_number.trim()
    : '';
  const nextContent = _applyPatchInstructionToTasksContent(options.content, patch, {
    iteration: options.iteration,
    blockerHash: options.blockerHash,
  });
  if (!nextContent.ok) {
    return nextContent;
  }

  const taskSnapshot = _readTaskSnapshotFromContent(nextContent.content);
  const patchedTask = taskSnapshot.taskBlocks.find((task) => task.number === nextContent.taskNumber);
  if (!patchedTask) {
    return {
      ok: false,
      reason: 'patch_rejected_structural',
      detail: 'patched task not found after rewrite',
      taskNumber: patchTaskNumber,
    };
  }
  if (patchedTask.status !== 'incomplete') {
    return {
      ok: false,
      reason: 'patch_rejected_structural',
      detail: 'supervisor may only patch incomplete tasks',
      taskNumber: patchedTask.number,
    };
  }

  const validation = options.validateTaskStructure(patchedTask.body, {
    ralphAuthoringRules: _loadRuleSources({ tasksFile: options.tasksFile }).ralph_authoring_rules.content,
  });
  if (!validation.ok) {
    return {
      ok: false,
      reason: 'patch_rejected_structural',
      detail: validation.errors.join('; '),
      warnings: validation.warnings || [],
      taskNumber: patchedTask.number,
    };
  }

  const applyResult = options.applyTaskPatch({
    tasksFile: options.tasksFile,
    patchedContent: nextContent.content,
    validationTimeoutMs: options.validationTimeoutMs,
  });
  if (!applyResult.ok) {
    return {
      ok: false,
      reason: 'patch_rejected_validation',
      detail: _firstNonEmptyText(applyResult.stderr, applyResult.stdout, applyResult.reason),
      warnings: validation.warnings || [],
      taskNumber: patchedTask.number,
    };
  }

  return {
    ok: true,
    taskNumber: patchedTask.number,
    warnings: validation.warnings || [],
  };
}

function _readTaskSnapshotFromContent(content) {
  const taskBlocks = _listTaskBlocks(content);
  return { content, taskBlocks };
}

function _applyPatchInstructionToTasksContent(content, patch, auditOptions = {}) {
  if (!patch || typeof patch !== 'object') {
    return {
      ok: false,
      reason: 'patch_rejected_structural',
      detail: 'patch must be an object',
      taskNumber: '',
    };
  }

  const taskBlocks = _listTaskBlocks(content);
  const operation = String(patch.operation || 'modify');
  const newBody = _ensureAuditComment(String(patch.new_body || ''), {
    iteration: auditOptions.iteration,
    blockerHash: auditOptions.blockerHash,
    rationale: typeof patch.rationale === 'string' ? patch.rationale : '',
  });
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');

  if (operation === 'modify') {
    const target = taskBlocks.find((task) => task.number === String(patch.task_number || '').trim());
    if (!target) {
      return {
        ok: false,
        reason: 'patch_rejected_structural',
        detail: 'target task not found',
        taskNumber: String(patch.task_number || '').trim(),
      };
    }
    const replacedLines = _replaceLineRange(lines, target.startLine, target.endLine, newBody.split('\n'));
    return {
      ok: true,
      content: replacedLines.join('\n'),
      taskNumber: target.number,
    };
  }

  if (operation === 'insert_before' || operation === 'insert_after') {
    const anchor = taskBlocks.find((task) => task.number === String(patch.anchor_task_number || '').trim());
    if (!anchor) {
      return {
        ok: false,
        reason: 'patch_rejected_structural',
        detail: 'anchor task not found',
        taskNumber: String(patch.task_number || '').trim(),
      };
    }
    const insertAt = operation === 'insert_before' ? anchor.startLine : anchor.endLine;
    const insertion = newBody.split('\n');
    const normalizedInsertion = _withTaskSpacing(lines, insertAt, insertion);
    const insertedLines = _replaceLineRange(lines, insertAt, insertAt, normalizedInsertion);
    return {
      ok: true,
      content: insertedLines.join('\n'),
      taskNumber: String(patch.task_number || '').trim(),
    };
  }

  return {
    ok: false,
    reason: 'patch_rejected_structural',
    detail: `unsupported downstream patch operation: ${operation}`,
    taskNumber: String(patch.task_number || '').trim(),
  };
}

function _replaceLineRange(lines, start, end, replacementLines) {
  return [
    ...lines.slice(0, start),
    ...replacementLines,
    ...lines.slice(end),
  ];
}

function _withTaskSpacing(lines, insertAt, insertionLines) {
  const normalized = insertionLines.slice();
  if (insertAt > 0 && lines[insertAt - 1] && lines[insertAt - 1].trim() !== '') {
    normalized.unshift('');
  }
  if (insertAt < lines.length && lines[insertAt] && lines[insertAt].trim() !== '') {
    normalized.push('');
  }
  return normalized;
}

function _ensureAuditComment(body, options = {}) {
  if (/<!--\s*supervised-edit:/i.test(body)) {
    return body;
  }
  const rationale = String(options.rationale || '').replace(/"/g, '\'').trim() || 'supervisor patch';
  const hash = String(options.blockerHash || '').slice(0, 8) || '00000000';
  const iteration = Number.isInteger(options.iteration) ? options.iteration : 0;
  const comment = `<!-- supervised-edit: iter=${iteration} reason="${rationale.slice(0, 120)}" hash=${hash} -->`;
  return `${String(body || '').trimEnd()}\n  ${comment}`;
}

module.exports = {
  _applyTaskPatch,
  _consumeBoundedBudget,
  _decideBoundedBudget,
  _detectSupervisorLogReads,
  _detectSizingProfile,
  _distillRalphBP,
  _extractDesignSections,
  _extractProposalSections,
  _loadRuleSources,
  _normalizeInvestigationHints,
  _parseSupervisorResponse,
  _recoverSupervisorTmpFiles,
  _renderSupervisorPrompt,
  _resolveRunLogPaths,
  _SUPERVISOR_TEMPLATE_VARIABLES,
  _validateTaskStructure,
  _resetRuleSourceCache,
  _summarizeDownstreamTasks,
  runSupervisor,
};
