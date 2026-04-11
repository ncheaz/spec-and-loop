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

const childProcess = require('child_process');
const path = require('path');
const state = require('./state');
const history = require('./history');
const context = require('./context');
const tasks = require('./tasks');
const prompt = require('./prompt');
const invoker = require('./invoker');
const errors = require('./errors');

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

  // Determine starting iteration — resume from prior state if it exists,
  // otherwise start fresh at 1.
  const existingState = state.read(ralphDir);
  const resumeIteration = _resolveStartIteration(existingState, options);

  if (options.verbose && resumeIteration > 1) {
    process.stderr.write(
      `[mini-ralph] resuming from iteration ${resumeIteration} ` +
      `(${resumeIteration - 1} prior iteration(s) preserved)\n`
    );
  }

  // Initialize state file for this run, preserving history count if resuming.
  state.init(ralphDir, {
    active: true,
    iteration: resumeIteration,
    minIterations,
    maxIterations,
    completionPromise,
    taskPromise,
    tasksMode: options.tasksMode,
    tasksFile: options.tasksFile || null,
    promptFile: options.promptFile || null,
    promptTemplate: options.promptTemplate || null,
    noCommit: options.noCommit,
    model: options.model || '',
    startedAt: new Date().toISOString(),
    resumedAt: resumeIteration > 1 ? new Date().toISOString() : null,
  });

  // Synchronize .ralph/ralph-tasks.md symlink to the OpenSpec tasks.md so the
  // loop engine always operates on the source-of-truth task file.
  if (options.tasksMode && options.tasksFile) {
    tasks.syncLink(ralphDir, options.tasksFile);
  }

  let iterationCount = resumeIteration - 1;
  let completed = false;
  let exitReason = 'max_iterations';

  while (iterationCount < maxIterations) {
    iterationCount++;

    // Update state with current iteration
    state.update(ralphDir, { iteration: iterationCount, active: true });

    // Build the prompt for this iteration
    const renderedPrompt = await prompt.render(options, iterationCount);
    const errorEntries = errors.readEntries(ralphDir, 3);
    const iterationFeedback = _buildIterationFeedback(history.recent(ralphDir, 3), errorEntries);

    // Inject any pending context
    const pendingContext = context.consume(ralphDir);
    const promptSections = [renderedPrompt];

    if (iterationFeedback) {
      promptSections.push(`## Recent Loop Signals\n\n${iterationFeedback}`);
    }

    if (pendingContext) {
      promptSections.push(`## Injected Context\n\n${pendingContext}`);
    }

    const finalPrompt = promptSections.join('\n\n');

    const iterStart = Date.now();
    const tasksBefore = options.tasksMode && options.tasksFile
      ? tasks.parseTasks(options.tasksFile)
      : [];

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
    const tasksAfter = options.tasksMode && options.tasksFile
      ? tasks.parseTasks(options.tasksFile)
      : [];
    const completedTasks = _completedTaskDelta(tasksBefore, tasksAfter);

    let commitResult = { attempted: false, committed: false, anomaly: null };

    if (result.exitCode !== 0) {
      const currentTask = _getCurrentTaskDescription(tasksBefore);
      errors.append(ralphDir, {
        iteration: iterationCount,
        task: currentTask,
        exitCode: result.exitCode,
        stderr: result.stderr || '',
        stdout: result.stdout || '',
      });
    }

    // Auto-commit only for successful task/completion iterations.
    if (
      !options.noCommit &&
      result.exitCode === 0 &&
      result.filesChanged &&
      result.filesChanged.length > 0 &&
      (hasCompletion || (options.tasksMode && hasTask))
    ) {
      commitResult = _autoCommit(iterationCount, {
        completedTasks,
        filesToStage: _buildAutoCommitAllowlist(result.filesChanged, completedTasks, options.tasksFile),
        tasksFile: options.tasksFile,
        verbose: options.verbose,
      });
    }

    // Record iteration in history after commit handling so operator-visible
    // anomalies are captured alongside the task/completion signal.
    history.append(ralphDir, {
      iteration: iterationCount,
      duration,
      completionDetected: hasCompletion,
      taskDetected: hasTask,
      toolUsage: result.toolUsage || [],
      filesChanged: result.filesChanged || [],
      exitCode: result.exitCode,
      completedTasks: completedTasks.map((task) => task.fullDescription || task.description),
      commitAttempted: commitResult.attempted,
      commitCreated: commitResult.committed,
      commitAnomaly: commitResult.anomaly ? commitResult.anomaly.message : '',
      commitAnomalyType: commitResult.anomaly ? commitResult.anomaly.type : '',
      protectedArtifacts: commitResult.anomaly ? commitResult.anomaly.protectedArtifacts || [] : [],
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

  try {
    if (completed) {
      _cleanupCompletedErrors(ralphDir, options.verbose);
    }
  } finally {
    // A completed loop must not remain marked active because post-completion
    // cleanup failed.
    state.update(ralphDir, { active: false, completedAt: new Date().toISOString() });
  }

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

/**
 * Auto-commit changed files after a successful iteration.
 * Silently skips if git is unavailable, there is nothing to commit, or the
 * iteration did not complete any tasks.
 *
 * @param {number} iteration
 * @param {object} opts
 * @param {Array<object>} [opts.completedTasks]
 * @param {Array<string>} [opts.filesToStage]
 * @param {boolean} [opts.verbose]
 */
function _autoCommit(iteration, opts = {}) {
  const { completedTasks = [], filesToStage = [], tasksFile = null, verbose = false } = opts;
  const message = _formatAutoCommitMessage(iteration, completedTasks);

  if (!message) {
    if (verbose) {
      process.stderr.write('[mini-ralph] auto-commit skipped: no completed tasks detected\n');
    }
    return { attempted: false, committed: false, anomaly: null };
  }

  if (!Array.isArray(filesToStage) || filesToStage.length === 0) {
    if (verbose) {
      process.stderr.write('[mini-ralph] auto-commit skipped: no iteration files to stage\n');
    }
    return { attempted: false, committed: false, anomaly: null };
  }

  const protectedArtifacts = _detectProtectedCommitArtifacts(filesToStage, tasksFile);
  if (protectedArtifacts.length > 0) {
    const anomaly = {
      type: 'protected_artifacts',
      message:
        'Auto-commit blocked: loop-managed commits cannot include protected OpenSpec artifacts: ' +
        protectedArtifacts.join(', '),
      protectedArtifacts,
    };

    process.stderr.write(`[mini-ralph] warning: ${anomaly.message}\n`);
    return { attempted: true, committed: false, anomaly };
  }

  try {
    childProcess.execFileSync('git', ['add', '--', ...filesToStage], {
      stdio: verbose ? 'inherit' : ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });

    const stagedFiles = childProcess.execFileSync('git', ['diff', '--cached', '--name-only'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });

    if (!stagedFiles.trim()) {
      const anomaly = {
        type: 'nothing_staged',
        message: 'Auto-commit failed: nothing was staged after git add',
      };

      process.stderr.write(`[mini-ralph] warning: ${anomaly.message}\n`);
      if (verbose) {
        process.stderr.write('[mini-ralph] auto-commit skipped: nothing staged\n');
      }
      return { attempted: true, committed: false, anomaly };
    }

    childProcess.execFileSync('git', ['commit', '-m', message], {
      stdio: verbose ? 'inherit' : ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });

    if (verbose) {
      process.stderr.write(`[mini-ralph] auto-committed: ${message}\n`);
    }
    return { attempted: true, committed: true, anomaly: null };
  } catch (err) {
    const anomaly = {
      type: 'commit_failed',
      message: `Auto-commit failed: ${_gitErrorMessage(err)}`,
    };

    process.stderr.write(`[mini-ralph] warning: ${anomaly.message}\n`);
    return { attempted: true, committed: false, anomaly };
  }
}

/**
 * Build the explicit per-iteration git staging allowlist.
 *
 * @param {Array<string>} filesChanged
 * @param {Array<object>} completedTasks
 * @param {string|null|undefined} tasksFile
 * @returns {Array<string>}
 */
function _buildAutoCommitAllowlist(filesChanged, completedTasks, tasksFile) {
  const allowlist = new Set();

  for (const file of filesChanged || []) {
    const relativeFile = _repoRelativePath(file);
    if (relativeFile) {
      allowlist.add(relativeFile);
    }
  }

  if (Array.isArray(completedTasks) && completedTasks.length > 0 && tasksFile) {
    const relativeTasksFile = _repoRelativePath(tasksFile);
    if (relativeTasksFile) {
      allowlist.add(relativeTasksFile);
    }
  }

  return Array.from(allowlist);
}

/**
 * Return tasks that became completed during the current iteration.
 *
 * @param {Array<object>} beforeTasks
 * @param {Array<object>} afterTasks
 * @returns {Array<object>}
 */
function _completedTaskDelta(beforeTasks, afterTasks) {
  const beforeCompleted = new Set(
    (beforeTasks || [])
      .filter((task) => task.status === 'completed')
      .map(_taskIdentity)
  );

  return (afterTasks || []).filter(
    (task) => task.status === 'completed' && !beforeCompleted.has(_taskIdentity(task))
  );
}

/**
 * Build a task-aware commit message for an iteration.
 *
 * @param {number} iteration
 * @param {Array<object>} completedTasks
 * @returns {string}
 */
function _formatAutoCommitMessage(iteration, completedTasks) {
  if (!Array.isArray(completedTasks) || completedTasks.length === 0) {
    return '';
  }

  const summary = completedTasks.length === 1
    ? completedTasks[0].description
    : `complete ${completedTasks.length} tasks`;
  const taskLines = completedTasks.map(
    (task) => `- [x] ${task.fullDescription || task.description}`
  );

  return `Ralph iteration ${iteration}: ${summary}\n\nTasks completed:\n${taskLines.join('\n')}`;
}

/**
 * Summarize recent problem signals so the next iteration can avoid repeating
 * the same failed approach.
 *
 * @param {Array<object>} recentHistory
 * @returns {string}
 */
function _buildIterationFeedback(recentHistory, errorEntries) {
  if (!Array.isArray(recentHistory) || recentHistory.length === 0) {
    return '';
  }

  const problemLines = [];

  for (const entry of recentHistory) {
    const issues = [];

    if (entry.exitCode !== 0) {
      issues.push(`opencode exited with code ${entry.exitCode}`);
    }

    if (entry.commitAnomaly) {
      issues.push(`commit anomaly: ${entry.commitAnomaly}`);
    }

    if (!entry.filesChanged || entry.filesChanged.length === 0) {
      issues.push('no files changed');
    }

    if (!entry.completionDetected && !entry.taskDetected) {
      issues.push('no loop promise emitted');
    }

    if (issues.length > 0) {
      let line = `- Iteration ${entry.iteration}: ${issues.join('; ')}.`;

      if (entry.exitCode !== 0 && errorEntries) {
        const errorDetails = _extractErrorForIteration(errorEntries, entry.iteration);
        if (errorDetails) {
          line += '\n  Error output:';
          if (errorDetails.stderr) {
            line += `\n  ${errorDetails.stderr}`;
          }
          if (errorDetails.stdout) {
            line += `\n  stdout: ${errorDetails.stdout}`;
          }
        }
      }

      problemLines.push(line);
    }
  }

  if (problemLines.length === 0) {
    return '';
  }

  return [
    'Use these signals to avoid repeating the same failed approach:',
    ...problemLines,
  ].join('\n');
}

function _extractErrorForIteration(errorEntries, iteration) {
  if (!Array.isArray(errorEntries) || errorEntries.length === 0) return null;

  const match = errorEntries.find((entry) => entry.iteration === iteration);
  if (!match) return null;

  let stderr = match.stderr || '';
  let stdout = match.stdout || '';

  if (stderr.length > 2000) stderr = stderr.substring(0, 2000) + '...';
  if (stdout.length > 500) stdout = stdout.substring(0, 500) + '...';

  return { stderr, stdout };
}

function _getCurrentTaskDescription(tasksBefore) {
  if (!Array.isArray(tasksBefore) || tasksBefore.length === 0) return 'N/A';
  const incomplete = tasksBefore.find((t) => t.status !== 'completed');
  if (incomplete) return incomplete.fullDescription || incomplete.description || 'N/A';
  return 'N/A';
}

function _cleanupCompletedErrors(ralphDir, verbose) {
  let archivePath = null;

  try {
    archivePath = errors.archive(ralphDir);
    if (archivePath && verbose) {
      process.stderr.write(`[mini-ralph] errors archived to ${archivePath}\n`);
    }
  } catch (err) {
    process.stderr.write(`[mini-ralph] warning: failed to archive error history: ${err.message}\n`);
    return;
  }

  try {
    errors.clear(ralphDir);
  } catch (err) {
    process.stderr.write(`[mini-ralph] warning: failed to clear active error history: ${err.message}\n`);
  }
}

function _taskIdentity(task) {
  return task.number
    ? `${task.number}|${task.fullDescription || task.description}`
    : (task.fullDescription || task.description);
}

function _repoRelativePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const normalized = path.normalize(filePath);
  if (!normalized || normalized === '.') return '';
  const relative = path.isAbsolute(normalized)
    ? path.relative(process.cwd(), normalized)
    : normalized;

  if (!relative || relative.startsWith('..')) {
    return '';
  }

  return relative.split(path.sep).join('/');
}

function _detectProtectedCommitArtifacts(filesToStage, tasksFile) {
  if (!Array.isArray(filesToStage) || filesToStage.length === 0 || !tasksFile) {
    return [];
  }

  const relativeTasksFile = _repoRelativePath(tasksFile);
  if (!relativeTasksFile) {
    return [];
  }

  const changeRoot = path.posix.dirname(relativeTasksFile);
  const protectedArtifacts = [];

  for (const file of filesToStage) {
    const normalized = _repoRelativePath(file);
    if (!normalized) continue;

    const isProposal = normalized === `${changeRoot}/proposal.md`;
    const isDesign = normalized === `${changeRoot}/design.md`;
    const isSpec = normalized.startsWith(`${changeRoot}/specs/`) && normalized.endsWith('/spec.md');

    if (isProposal || isDesign || isSpec) {
      protectedArtifacts.push(normalized);
    }
  }

  return protectedArtifacts;
}

function _gitErrorMessage(err) {
  if (!err) return 'unknown git error';

  const stderr = _coerceGitErrorStream(err.stderr);
  const stdout = _coerceGitErrorStream(err.stdout);

  if (stderr) return stderr;
  if (stdout) return stdout;
  if (err.message) return err.message;
  return 'unknown git error';
}

function _coerceGitErrorStream(stream) {
  if (!stream) return '';
  if (Buffer.isBuffer(stream)) return stream.toString('utf8').trim();
  if (typeof stream === 'string') return stream.trim();
  return '';
}

/**
 * Determine the starting iteration for a new run.
 *
 * If a previous state exists for the same tasks file (or the same ralphDir when
 * not in tasks mode), resume from the next iteration after the last recorded one.
 * Otherwise start fresh at 1.
 *
 * Resume conditions:
 *   - There is a prior state file with a recorded iteration > 0
 *   - The prior run used the same tasksFile (when in tasks mode) — this prevents
 *     resuming across different changes that happen to share a .ralph/ directory.
 *   - The prior run was not marked as active (i.e. it ended cleanly or was interrupted)
 *
 * When resuming, the iteration counter starts at (priorIteration + 1), which
 * preserves the loop budget while aligning the displayed number with task progress.
 *
 * @param {object|null} existingState
 * @param {object}      options
 * @returns {number}  1-based starting iteration
 */
function _resolveStartIteration(existingState, options) {
  if (!existingState) return 1;

  const priorIteration = existingState.iteration;
  if (typeof priorIteration !== 'number' || priorIteration < 1) return 1;

  // In tasks mode, only resume if the prior run used the same tasks file.
  if (options.tasksMode && options.tasksFile) {
    const priorTasksFile = existingState.tasksFile || null;
    if (priorTasksFile && priorTasksFile !== options.tasksFile) {
      // Different tasks file — treat as a fresh run.
      return 1;
    }
  }

  // Resume from the iteration after the last recorded one.
  return priorIteration + 1;
}

module.exports = {
  run,
  _containsPromise,
  _validateOptions,
  _autoCommit,
  _buildAutoCommitAllowlist,
  _resolveStartIteration,
  _completedTaskDelta,
  _formatAutoCommitMessage,
  _buildIterationFeedback,
  _extractErrorForIteration,
  _getCurrentTaskDescription,
  _cleanupCompletedErrors,
  _detectProtectedCommitArtifacts,
  _gitErrorMessage,
};
