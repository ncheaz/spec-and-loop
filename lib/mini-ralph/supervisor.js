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

module.exports = {
  _distillRalphBP,
  _extractDesignSections,
  _extractProposalSections,
  _loadRuleSources,
  _parseSupervisorResponse,
  _SUPERVISOR_TEMPLATE_VARIABLES,
  _resetRuleSourceCache,
  _summarizeDownstreamTasks,
};
