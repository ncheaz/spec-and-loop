'use strict';

/**
 * runner.js - Core loop orchestrator for mini-ralph.
 *
 * Responsible for iteratively invoking OpenCode, tracking iteration state,
 * detecting completion/task promises, and coordinating state/history writes.
 *
 * Implementation note: This module is intentionally structured to be testable
 * with mocked OpenCode invocations. The actual child_process execution is
 * isolated in a thin invoker that can be swapped in tests.
 */

const path = require('path');
const state = require('./state');
const history = require('./history');
const context = require('./context');
const tasks = require('./tasks');
const prompt = require('./prompt');
const invoker = require('./invoker');

const DEFAULTS = {
  minIterations: 1,
  maxIterations: 50,
  completionPromise: 'COMPLETE',
  taskPromise: 'READY_FOR_NEXT_TASK',
  tasksMode: false,
  noCommit: false,
  verbose: false,
};

/**
 * Run the iteration loop.
 *
 * @param {object} opts - Loop options (see index.js for full schema)
 * @returns {Promise<object>} { completed, iterations, exitReason }
 */
async function run(opts) {
  const options = Object.assign({}, DEFAULTS, opts);
  _validateOptions(options);

  const ralphDir = options.ralphDir;
  const maxIterations = options.maxIterations;
  const minIterations = options.minIterations;
  const completionPromise = options.completionPromise;
  const taskPromise = options.taskPromise;

  // Initialize state file for this run
  state.init(ralphDir, {
    active: true,
    iteration: 1,
    minIterations,
    maxIterations,
    completionPromise,
    taskPromise,
    tasksMode: options.tasksMode,
    promptFile: options.promptFile || null,
    promptTemplate: options.promptTemplate || null,
    noCommit: options.noCommit,
    model: options.model || '',
    startedAt: new Date().toISOString(),
  });

  let iterationCount = 0;
  let completed = false;
  let exitReason = 'max_iterations';

  while (iterationCount < maxIterations) {
    iterationCount++;

    // Update state with current iteration
    state.update(ralphDir, { iteration: iterationCount, active: true });

    // Build the prompt for this iteration
    const renderedPrompt = await prompt.render(options, iterationCount);

    // Inject any pending context
    const pendingContext = context.consume(ralphDir);
    const finalPrompt = pendingContext
      ? `${renderedPrompt}\n\n## Injected Context\n\n${pendingContext}`
      : renderedPrompt;

    const iterStart = Date.now();

    // Invoke OpenCode
    const result = await invoker.invoke({
      prompt: finalPrompt,
      model: options.model,
      noCommit: options.noCommit,
      verbose: options.verbose,
      ralphDir,
    });

    const duration = Date.now() - iterStart;

    // Detect promises in output
    const outputText = result.stdout || '';
    const hasCompletion = _containsPromise(outputText, completionPromise);
    const hasTask = _containsPromise(outputText, taskPromise);

    // Record iteration in history
    history.append(ralphDir, {
      iteration: iterationCount,
      duration,
      completionDetected: hasCompletion,
      taskDetected: hasTask,
      toolUsage: result.toolUsage || [],
      filesChanged: result.filesChanged || [],
      exitCode: result.exitCode,
    });

    // Check completion condition (must also satisfy minIterations)
    if (hasCompletion && iterationCount >= minIterations) {
      completed = true;
      exitReason = 'completion_promise';
      break;
    }

    // In tasks mode, task promise just continues the loop
    if (options.tasksMode && hasTask) {
      // Continue to next iteration
      continue;
    }
  }

  // Mark loop as inactive
  state.update(ralphDir, { active: false, completedAt: new Date().toISOString() });

  return { completed, iterations: iterationCount, exitReason };
}

/**
 * Check whether a promise tag appears in output text.
 *
 * @param {string} text
 * @param {string} promiseName
 * @returns {boolean}
 */
function _containsPromise(text, promiseName) {
  if (!text || !promiseName) return false;
  return text.includes(`<promise>${promiseName}</promise>`);
}

/**
 * Validate required options and throw descriptive errors.
 *
 * @param {object} options
 */
function _validateOptions(options) {
  if (!options.ralphDir) {
    throw new Error('mini-ralph runner: options.ralphDir is required');
  }
  if (!options.promptFile && !options.promptText) {
    throw new Error('mini-ralph runner: either options.promptFile or options.promptText is required');
  }
  if (options.promptFile && options.promptText) {
    throw new Error('mini-ralph runner: provide either options.promptFile or options.promptText, not both');
  }
  if (typeof options.maxIterations !== 'number' || options.maxIterations < 1) {
    throw new Error('mini-ralph runner: options.maxIterations must be a positive integer');
  }
  if (typeof options.minIterations !== 'number' || options.minIterations < 1) {
    throw new Error('mini-ralph runner: options.minIterations must be a positive integer');
  }
  if (options.minIterations > options.maxIterations) {
    throw new Error('mini-ralph runner: options.minIterations must be <= options.maxIterations');
  }
}

module.exports = { run, _containsPromise, _validateOptions };
