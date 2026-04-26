'use strict';

/**
 * prompt.js - Prompt loading and template rendering for mini-ralph.
 *
 * Supports three prompt sources:
 *   1. Inline prompt text (options.promptText)
 *   2. Prompt file (options.promptFile)
 *   3. Prompt template file (options.promptTemplate) which wraps sources 1 or 2
 *
 * Template variables (mustache-style double-braces):
 *   {{iteration}}          - Current iteration number
 *   {{max_iterations}}     - Configured max iterations
 *   {{change_dir}}         - Change directory path (from options.changeDir)
 *   {{base_prompt}}        - Underlying prompt text from promptText/promptFile.
 *                            Lazy-loaded: loadBase() is called ONLY when the
 *                            template contains the literal substring
 *                            {{base_prompt}}. If the template omits it, no
 *                            prompt source is required and the prompt-source
 *                            errors ("no prompt source configured", "prompt file
 *                            not found", "prompt file is empty") do not fire.
 *   {{tasks}}              - Raw tasks file content
 *   {{task_promise}}       - Configured task promise string
 *   {{completion_promise}} - Configured completion promise string
 *   {{commit_contract}}    - Commit instructions derived from options.noCommit
 *
 * Oversized-substitution warning:
 *   When {{base_prompt}} is used and the resolved substitution exceeds
 *   RALPH_BASE_PROMPT_WARN_BYTES (default 4096, 0 disables, invalid values fall
 *   back to 4096 with a one-time fallback notice), process.stderr receives one
 *   line:
 *     [mini-ralph] warning: {{base_prompt}} resolved to N bytes from <path>;
 *     consider migrating to the manifest-style template
 *     (see scripts/ralph-run.sh::create_prompt_template).
 */

const fs = require('fs');
const path = require('path');

// One-time fallback notice flag for invalid RALPH_BASE_PROMPT_WARN_BYTES
let _warnBytesInvalidNoticed = false;

/**
 * Return the active byte threshold for the oversized-substitution warning.
 * Reads RALPH_BASE_PROMPT_WARN_BYTES each call so tests can set it per-case.
 * - 0            → disabled (returns 0)
 * - positive int → threshold
 * - invalid      → 4096 + emits one fallback notice per process
 *
 * @returns {number}
 */
function _warnThreshold() {
  const raw = process.env.RALPH_BASE_PROMPT_WARN_BYTES;
  if (raw === undefined || raw === null) return 4096;
  const n = Number(raw);
  if (raw.trim() === '0') return 0;
  if (Number.isInteger(n) && n > 0) return n;
  // invalid
  if (!_warnBytesInvalidNoticed) {
    _warnBytesInvalidNoticed = true;
    process.stderr.write(
      `[mini-ralph] notice: RALPH_BASE_PROMPT_WARN_BYTES="${raw}" is not a valid non-negative integer; falling back to 4096.\n`
    );
  }
  return 4096;
}

/**
 * Reset the one-time invalid-notice flag. Exposed for test isolation only.
 */
function _resetWarnNotice() {
  _warnBytesInvalidNoticed = false;
}

/**
 * Load the base prompt text from the configured source.
 * Throws a clear error if the prompt file is missing or empty.
 *
 * @param {object} options
 * @returns {string}
 */
function loadBase(options) {
  if (options.promptText) {
    if (!options.promptText.trim()) {
      throw new Error('mini-ralph prompt: promptText is empty');
    }
    return options.promptText;
  }

  if (options.promptFile) {
    if (!fs.existsSync(options.promptFile)) {
      throw new Error(`mini-ralph prompt: prompt file not found: ${options.promptFile}`);
    }
    const text = fs.readFileSync(options.promptFile, 'utf8');
    if (!text.trim()) {
      throw new Error(`mini-ralph prompt: prompt file is empty: ${options.promptFile}`);
    }
    return text;
  }

  throw new Error('mini-ralph prompt: no prompt source configured');
}

/**
 * Render the prompt for a given iteration.
 * If a promptTemplate is specified, renders the template with iteration variables.
 * Otherwise returns the base prompt as-is.
 *
 * loadBase() is called ONLY when the template contains {{base_prompt}}.
 * When no template is used, loadBase() is always called to produce the
 * raw prompt.
 *
 * @param {object}  options
 * @param {number}  iteration  - Current 1-based iteration number
 * @returns {string}
 */
function render(options, iteration) {
  if (!options.promptTemplate) {
    // No template — base prompt is the whole output
    const base = loadBase(options);
    return base;
  }

  const templatePath = options.promptTemplate;
  if (!fs.existsSync(templatePath)) {
    throw new Error(`mini-ralph prompt: template file not found: ${templatePath}`);
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  if (!template.trim()) {
    throw new Error(`mini-ralph prompt: template file is empty: ${templatePath}`);
  }

  // Determine whether the template actually uses {{base_prompt}}
  const templateUsesBase = template.indexOf('{{base_prompt}}') !== -1;

  let base = '';
  if (templateUsesBase) {
    base = loadBase(options);

    // Oversized-substitution warning
    const threshold = _warnThreshold();
    if (threshold > 0) {
      const byteLen = Buffer.byteLength(base, 'utf8');
      if (byteLen > threshold) {
        const src = options.promptFile || '(inline text)';
        process.stderr.write(
          `[mini-ralph] warning: {{base_prompt}} resolved to ${byteLen} bytes from ${src}; consider migrating to the manifest-style template (see scripts/ralph-run.sh::create_prompt_template).\n`
        );
      }
    }
  }

  // Load tasks content if a tasksFile is configured
  let tasksContent = '';
  if (options.tasksFile && fs.existsSync(options.tasksFile)) {
    tasksContent = fs.readFileSync(options.tasksFile, 'utf8');
  }

  const vars = {
    iteration: String(iteration),
    max_iterations: String(options.maxIterations || 50),
    change_dir: options.changeDir || '',
    base_prompt: base,
    tasks: tasksContent,
    task_promise: options.taskPromise || 'READY_FOR_NEXT_TASK',
    completion_promise: options.completionPromise || 'COMPLETE',
    commit_contract: options.noCommit
      ? [
          '- Do not create, amend, or finalize git commits in this run.',
          '- `--no-commit` is active. Do not run `git add` or `git commit`; leave task changes uncommitted.',
        ].join('\n')
      : '- Do not create git commits yourself. The Ralph runner manages automatic task commits when auto-commit is enabled.',
  };

  return _renderTemplate(template, vars);
}

/**
 * Replace all {{key}} occurrences in a template string with the provided values.
 *
 * @param {string} template
 * @param {object} vars  - Map of variable name -> value
 * @returns {string}
 */
function _renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

module.exports = { loadBase, render, _renderTemplate, _warnThreshold, _resetWarnNotice };
