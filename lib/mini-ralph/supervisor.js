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
const { _renderTemplate } = require('./prompt');

const _RULE_SOURCE_MAX_BYTES = 32 * 1024;
const _SECTION_FALLBACK_MAX_BYTES = 4 * 1024;
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

module.exports = {
  _detectSizingProfile,
   _distillRalphBP,
   _extractDesignSections,
   _extractProposalSections,
   _loadRuleSources,
   _parseSupervisorResponse,
   _renderSupervisorPrompt,
   _SUPERVISOR_TEMPLATE_VARIABLES,
   _validateTaskStructure,
   _resetRuleSourceCache,
   _summarizeDownstreamTasks,
 };
