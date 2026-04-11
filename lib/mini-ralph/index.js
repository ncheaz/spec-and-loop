'use strict';

/**
 * mini-ralph: Internal Ralph-style iteration engine for spec-and-loop.
 *
 * This module provides a self-contained loop runtime that replaces the
 * external @th0rgal/ralph-wiggum dependency. It supports the critical
 * OpenSpec-first subset: iterative OpenCode invocation, task-mode
 * progression, prompt file/template support, completion/task promises,
 * loop state/history persistence, status dashboard, add/clear context,
 * and --no-commit.
 *
 * This is an internal implementation detail. The documented user-facing
 * interface is ralph-run.
 */

const runner = require('./runner');
const state = require('./state');
const history = require('./history');
const context = require('./context');
const errors = require('./errors');
const tasks = require('./tasks');
const status = require('./status');
const prompt = require('./prompt');

/**
 * Run the mini Ralph loop with the provided options.
 *
 * @param {object} options
 * @param {string} options.promptFile        - Path to the prompt file (required unless promptText given)
 * @param {string} [options.promptText]      - Inline prompt text
 * @param {string} [options.promptTemplate]  - Path to a prompt template file
 * @param {string} options.ralphDir          - Path to the .ralph/ working directory
 * @param {number} [options.minIterations]   - Minimum iterations before completion (default: 1)
 * @param {number} [options.maxIterations]   - Maximum iterations (default: 50)
 * @param {string} [options.completionPromise] - Promise string signaling loop completion (default: "COMPLETE")
 * @param {string} [options.taskPromise]     - Promise string signaling task completion (default: "READY_FOR_NEXT_TASK")
 * @param {boolean} [options.tasksMode]      - Enable tasks mode (default: false)
 * @param {string} [options.tasksFile]       - Path to tasks file when tasksMode is true
 * @param {boolean} [options.noCommit]       - Suppress auto-commit (default: false)
 * @param {string} [options.model]           - Optional model override
 * @param {boolean} [options.verbose]        - Enable verbose output (default: false)
 * @returns {Promise<object>} Result object with { completed, iterations, exitReason }
 */
async function run(options) {
  return runner.run(options);
}

/**
 * Print the status dashboard for the current loop state.
 *
 * @param {string} ralphDir - Path to the .ralph/ working directory
 * @param {string} [tasksFile] - Optional path to the tasks.md file for task progress
 * @returns {string} Formatted status output
 */
function getStatus(ralphDir, tasksFile) {
  return status.render(ralphDir, tasksFile || null);
}

/**
 * Add pending context to be injected into the next iteration.
 *
 * @param {string} ralphDir  - Path to the .ralph/ working directory
 * @param {string} text      - Context text to add
 */
function addContext(ralphDir, text) {
  context.add(ralphDir, text);
}

/**
 * Clear all pending context.
 *
 * @param {string} ralphDir - Path to the .ralph/ working directory
 */
function clearContext(ralphDir) {
  context.clear(ralphDir);
}

module.exports = {
  run,
  getStatus,
  addContext,
  clearContext,
  // Expose sub-modules for internal use and testing
  _state: state,
  _history: history,
  _context: context,
  _errors: errors,
  _tasks: tasks,
  _prompt: prompt,
  _runner: runner,
  _status: status,
};
