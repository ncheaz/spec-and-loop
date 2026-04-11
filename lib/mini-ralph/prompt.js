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
 *   {{base_prompt}}        - Underlying prompt text from promptText/promptFile
 *   {{tasks}}              - Raw tasks file content
 *   {{task_context}}       - Fresh current-task and completed-task summary
 *   {{task_promise}}       - Configured task promise string
 *   {{completion_promise}} - Configured completion promise string
 *   {{context}}            - Pending context (passed in, already consumed)
 *   {{commit_contract}}    - Commit instructions derived from options.noCommit
 */

const fs = require('fs');
const path = require('path');
const tasks = require('./tasks');

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
 * @param {object}  options
 * @param {number}  iteration  - Current 1-based iteration number
 * @returns {string}
 */
function render(options, iteration) {
  const base = loadBase(options);

  if (!options.promptTemplate) {
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

  // Load tasks content if a tasksFile is configured
  let tasksContent = '';
  if (options.tasksFile && fs.existsSync(options.tasksFile)) {
    tasksContent = fs.readFileSync(options.tasksFile, 'utf8');
  }

  const taskContext = options.tasksFile ? tasks.taskContext(options.tasksFile) : '';

  const vars = {
    iteration: String(iteration),
    max_iterations: String(options.maxIterations || 50),
    change_dir: options.changeDir || '',
    base_prompt: base,
    tasks: tasksContent,
    task_context: taskContext,
    task_promise: options.taskPromise || 'READY_FOR_NEXT_TASK',
    completion_promise: options.completionPromise || 'COMPLETE',
    context: '',  // Pending context is injected by runner after rendering
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

module.exports = { loadBase, render, _renderTemplate };
