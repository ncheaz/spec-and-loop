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

const _RULE_SOURCE_MAX_BYTES = 32 * 1024;
const _SECTION_FALLBACK_MAX_BYTES = 4 * 1024;
const _SUPERVISOR_TMP_SUFFIX = '.supervisor-tmp';
const _SUPERVISOR_ORIG_SUFFIX = '.supervisor-orig';
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

function _summarizeDownstreamTasks(rawInput, config = {}) {
  const input = String(rawInput || '');
  if (_isEnabled(config.fullDownstream, 'RALPH_SELF_HEAL_FULL_DOWNSTREAM')) {
    return input;
  }

  const taskBlocks = _splitTaskBlocks(input);
  const summaries = [];
  for (const block of taskBlocks) {
    const lines = block.split('\n');
    const firstLine = lines[0] || '';
    const match = firstLine.match(/^-\s+\[(?: |\/)\]\s+(.+)$/);
    if (!match) {
      continue;
    }

    const scopeLine = lines.find((line) => /^\s+-\s+Scope:/.test(line));
    const summaryLines = [`- ${match[1].trim()}`];
    if (scopeLine) {
      summaryLines.push(scopeLine);
    }
    summaries.push(summaryLines.join('\n'));
  }

  return summaries.join('\n\n');
}

function _extractDesignSections(rawInput, config = {}) {
  const input = String(rawInput || '');
  if (_isEnabled(config.fullDesign, 'RALPH_SELF_HEAL_FULL_DESIGN')) {
    return input;
  }

  return _extractNamedSections(input, [
    'Scope',
    'Non-goals',
    'Policy decisions',
    'Policy choices',
    'Decisions',
  ]);
}

function _extractProposalSections(rawInput, config = {}) {
  const input = String(rawInput || '');
  if (_isEnabled(config.fullProposal, 'RALPH_SELF_HEAL_FULL_PROPOSAL')) {
    return input;
  }

  return _extractNamedSections(input, [
    'Why',
    'What Changes',
    'Goals',
    'Non-goals',
  ]);
}

function _distillRalphBP(rawInput, config = {}) {
  const input = String(rawInput || '');
  if (_isEnabled(config.fullBpContext, 'RALPH_SELF_HEAL_FULL_BP_CONTEXT')) {
    return input;
  }

  const parts = [];
  const taskTemplateFence = _extractFirstFenceFromSection(input, 'Task template');
  if (taskTemplateFence) {
    parts.push(['## Task template', '', taskTemplateFence].join('\n'));
  }

  const sizingLines = input
    .split('\n')
    .filter((line) => /^\*\*(?:Medium|Lightweight) profile\*\*/.test(line.trim()));
  if (sizingLines.length > 0) {
    parts.push(['## Sizing profiles', '', ...sizingLines].join('\n'));
  }

  const verifierRules = _extractBulletLinesFromSection(input, 'Surgical validation', [
    /Start every task with the cheapest verifier/i,
    /Verify command routing before writing it into `tasks\.md`/i,
    /Use broad gates .* only when/i,
    /Prefer one focused verifier per task/i,
  ]);
  if (verifierRules.length > 0) {
    parts.push(['## Verifier cluster rule', '', ...verifierRules].join('\n'));
  }

  const distilled = parts.filter(Boolean).join('\n\n').trim();
  if (!distilled) {
    return _fallbackSectionContent(input);
  }

  if (Buffer.byteLength(distilled, 'utf8') <= _SECTION_FALLBACK_MAX_BYTES) {
    return distilled;
  }

  const trimmed = [];
  if (taskTemplateFence) {
    trimmed.push(['## Task template', '', taskTemplateFence].join('\n'));
  }
  if (sizingLines.length > 0) {
    trimmed.push(['## Sizing profiles', '', ...sizingLines].join('\n'));
  }
  const minimal = trimmed.filter(Boolean).join('\n\n').trim();
  if (minimal && Buffer.byteLength(minimal, 'utf8') <= _SECTION_FALLBACK_MAX_BYTES) {
    return minimal;
  }

  return _truncateBytes(minimal || distilled, _SECTION_FALLBACK_MAX_BYTES);
}

function _extractNamedSections(input, headings) {
  const matchedSections = [];
  for (const heading of headings) {
    const section = _extractSectionByHeading(input, heading);
    if (section) {
      matchedSections.push(section);
    }
  }

  if (matchedSections.length === 0) {
    return _fallbackSectionContent(input);
  }

  return matchedSections.join('\n\n').trim();
}

function _extractSectionByHeading(input, heading) {
  const lines = String(input || '').split('\n');
  const headingRegex = new RegExp(`^##\\s+${_escapeRegExp(heading)}\\s*$`, 'i');
  let startIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (headingRegex.test(lines[index])) {
      startIndex = index;
      break;
    }
  }

  if (startIndex === -1) {
    return '';
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join('\n').trim();
}

function _extractFirstFenceFromSection(input, heading) {
  const section = _extractSectionByHeading(input, heading);
  if (!section) {
    return '';
  }

  const match = section.match(/```[\s\S]*?```/);
  return match ? match[0] : '';
}

function _extractBulletLinesFromSection(input, heading, patterns) {
  const section = _extractSectionByHeading(input, heading);
  if (!section) {
    return [];
  }

  return section
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('- ')) {
        return false;
      }
      return patterns.some((pattern) => pattern.test(trimmed));
    });
}

function _splitTaskBlocks(input) {
  const lines = String(input || '').split('\n');
  const blocks = [];
  let current = [];

  for (const line of lines) {
    if (/^-\s+\[(?: |\/)\]\s+/.test(line)) {
      if (current.length > 0) {
        blocks.push(current.join('\n').trimEnd());
      }
      current = [line];
      continue;
    }

    if (current.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current.join('\n').trimEnd());
  }

  return blocks;
}

function _fallbackSectionContent(input) {
  const sentinel = '[fallback: first 4KB; no recognized sections found]';
  const truncated = _truncateBytes(String(input || ''), _SECTION_FALLBACK_MAX_BYTES, sentinel);
  return truncated.includes(sentinel) ? truncated : `${sentinel}\n${truncated}`.trim();
}

function _truncateBytes(content, maxBytes, sentinel = '') {
  const buffer = Buffer.from(String(content || ''), 'utf8');
  if (buffer.byteLength <= maxBytes) {
    return String(content || '');
  }

  const suffix = sentinel ? `\n${sentinel}` : '';
  const keepBytes = Math.max(0, maxBytes - Buffer.byteLength(suffix, 'utf8'));
  return buffer.subarray(0, keepBytes).toString('utf8') + suffix;
}

function _isEnabled(configValue, envName) {
  if (configValue === true || configValue === false) {
    return configValue;
  }
  return process.env[envName] === '1';
}

function _escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      previousSupervisorAttempts.push(`try ${triesUsed}: patch_rejected_structural ${parsed.reason}`);
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
        readLogs,
        readLogsBytes,
      });
    }

    if (!parsed.current_task_patch || typeof parsed.current_task_patch !== 'object') {
      triesUsed += 1;
      lastOutcome = 'patch_rejected_structural';
      previousSupervisorAttempts.push(`try ${triesUsed}: patch_rejected_structural missing current_task_patch`);
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
      previousSupervisorAttempts.push(
        `try ${triesUsed}: patch_rejected_structural current task mismatch (${parsed.current_task_patch.task_number || 'missing'})`
      );
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
      previousSupervisorAttempts.push(`try ${triesUsed}: ${currentPatchResult.reason} ${currentPatchResult.detail}`.trim());
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
    readLogs: options.readLogs === undefined ? null : options.readLogs,
    readLogsBytes: options.readLogsBytes === undefined ? null : options.readLogsBytes,
    softWarnings: Array.isArray(options.softWarnings) ? options.softWarnings : [],
    summary: String(options.summary || ''),
    blockerHash: String(options.blockerHash || ''),
  };
}

module.exports = {
  _applyTaskPatch,
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
