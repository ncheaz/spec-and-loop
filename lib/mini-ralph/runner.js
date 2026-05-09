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
const progress = require('./progress');
const lessons = require('./lessons');
const supervisor = require('./supervisor');
const handoff = require('./runner-handoff');
const baselineGate = require('./runner-baseline-gate');
const autoCommit = require('./runner-autocommit');
const pendingDirty = require('./runner-pending-dirty');

const _extractBlockerNote = handoff._extractBlockerNote;
const _detectBlockerArtifacts = handoff._detectBlockerArtifacts;
const _writeHandoff = handoff._writeHandoff;
const _formatSupervisorHandoffSections = handoff._formatSupervisorHandoffSections;
const _formatSupervisorList = handoff._formatSupervisorList;
const _appendFatalIterationFailure = handoff._appendFatalIterationFailure;
const _summarizeBlockerNote = handoff._summarizeBlockerNote;

const _buildBaselineGateFeedback = baselineGate._buildBaselineGateFeedback;
const _analyzeBaselineGateConflict = baselineGate._analyzeBaselineGateConflict;
const _formatBaselineGateFeedback = baselineGate._formatBaselineGateFeedback;
const _extractCurrentTaskBlock = baselineGate._extractCurrentTaskBlock;
const _detectStrictCleanGates = baselineGate._detectStrictCleanGates;
const _detectFailingBaselineGates = baselineGate._detectFailingBaselineGates;
const _detectRecordedBaselineGates = baselineGate._detectRecordedBaselineGates;
const _detectMissingBaselineGates = baselineGate._detectMissingBaselineGates;
const _detectAuthorizedBaselineCleanup = baselineGate._detectAuthorizedBaselineCleanup;
const _baselineGateRepairBudgetUsed = baselineGate._baselineGateRepairBudgetUsed;
const _baselineGateRepairAttempted = baselineGate._baselineGateRepairAttempted;

const _autoCommit = autoCommit._autoCommit;
const _formatAutoCommitIgnoreBlock = autoCommit._formatAutoCommitIgnoreBlock;
const _filterGitignored = autoCommit._filterGitignored;
const _mergePathLists = autoCommit._mergePathLists;
const _buildAutoCommitAllowlist = autoCommit._buildAutoCommitAllowlist;
const _completedTaskDelta = autoCommit._completedTaskDelta;
const _formatAutoCommitMessage = autoCommit._formatAutoCommitMessage;
const _truncateSubjectSummary = autoCommit._truncateSubjectSummary;
const _taskIdentity = autoCommit._taskIdentity;
const _repoRelativePath = autoCommit._repoRelativePath;
const _detectProtectedCommitArtifacts = autoCommit._detectProtectedCommitArtifacts;
const _gitErrorMessage = autoCommit._gitErrorMessage;
const _coerceGitErrorStream = autoCommit._coerceGitErrorStream;

const _normalizePendingDirtyPaths = pendingDirty._normalizePendingDirtyPaths;
const _recordPendingDirtyPaths = pendingDirty._recordPendingDirtyPaths;
const _remainingPendingDirtyPathsAfterCommit = pendingDirty._remainingPendingDirtyPathsAfterCommit;
const _refreshPendingDirtyPaths = pendingDirty._refreshPendingDirtyPaths;
const _samePendingTask = pendingDirty._samePendingTask;
const _formatPendingDirtyPathsBlock = pendingDirty._formatPendingDirtyPathsBlock;
const _currentDirtyPathSet = pendingDirty._currentDirtyPathSet;

const DEFAULTS = {
  minIterations: 1,
  maxIterations: 50,
  completionPromise: 'COMPLETE',
  taskPromise: 'READY_FOR_NEXT_TASK',
  // Emitted by the agent when a task's `Stop and hand off if:` clause fires
  // (i.e. external decision required: revert protected drift, file an
  // out-of-scope refactor, escalate to a human reviewer, etc). The runner
  // recognizes this as a *clean* exit distinct from `stalled` — it preserves
  // the agent's diagnosis under `<ralphDir>/HANDOFF.md` and surfaces
  // `exitReason='blocked_handoff'` so operators can tell "this task is
  // genuinely blocked on me" apart from "the loop livelocked."
  blockedHandoffPromise: 'BLOCKED_HANDOFF',
  tasksMode: false,
  noCommit: false,
  verbose: false,
  // Emits a per-iteration runtime status line (task #, ok/fail/stall badge,
  // duration, rolling counters, cumulative + average time) to stderr. Enabled
  // by default because "what is the loop doing right now?" is the single most
  // common operator question. Pass `quiet: true` to suppress.
  quiet: false,
  // Stall detector: break the loop after N *consecutive* iterations that
  // succeeded but produced no progress (no promise, no completed tasks, no
  // files changed). 0 disables the detector. Failed iterations do not count
  // toward the streak because their signal is already surfaced via the
  // `Recent Loop Signals` feedback block.
  stallThreshold: 3,
  // Opt-in continuation after a BLOCKED_HANDOFF only when the handoff note has
  // explicit evidence for a safe, bounded resolution class.
  autoResolveHandoffs: true,
  autoResolveHandoffMaxPerRun: 6,
  selfHeal: true,
  selfHealMaxTries: 3,
  selfHealDownstream: true,
  selfHealHints: true,
  selfHealLogAccess: true,
  selfHealVerbose: false,
  ruleCacheEnabled: true,
  validationTimeoutMs: 30000,
};

function _envFlag(value) {
  if (value === undefined) return null;
  return !/^(0|false|no|off)$/i.test(String(value || '').trim());
}

function _envPositiveInteger(value) {
  if (value === undefined) return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function _resolveSupervisorConfig(options) {
  const env = process.env;
  const readBoolean = (cliValue, envName, fallback) => {
    if (typeof cliValue === 'boolean') return cliValue;
    const envValue = _envFlag(env[envName]);
    if (envValue !== null) return envValue;
    return fallback;
  };
  const readPositiveInteger = (cliValue, envName, fallback) => {
    if (Number.isInteger(cliValue) && cliValue > 0) return cliValue;
    const envValue = _envPositiveInteger(env[envName]);
    if (envValue !== null) return envValue;
    return fallback;
  };

  let selfHealVerbose;
  if (typeof options.selfHealVerbose === 'boolean') {
    selfHealVerbose = options.selfHealVerbose;
  } else if (options.verbose === true) {
    selfHealVerbose = true;
  } else {
    selfHealVerbose = readBoolean(undefined, 'RALPH_SELF_HEAL_VERBOSE', DEFAULTS.selfHealVerbose);
  }

  return {
    selfHeal: readBoolean(options.selfHeal, 'RALPH_SELF_HEAL', DEFAULTS.selfHeal),
    selfHealMaxTries: readPositiveInteger(
      options.selfHealMaxTries,
      'RALPH_SELF_HEAL_MAX_TRIES',
      DEFAULTS.selfHealMaxTries,
    ),
    selfHealDownstream: readBoolean(
      options.selfHealDownstream,
      'RALPH_SELF_HEAL_DOWNSTREAM',
      DEFAULTS.selfHealDownstream,
    ),
    selfHealHints: readBoolean(
      options.selfHealHints,
      'RALPH_SELF_HEAL_HINTS',
      DEFAULTS.selfHealHints,
    ),
    selfHealLogAccess: readBoolean(
      options.selfHealLogAccess,
      'RALPH_SELF_HEAL_LOG_ACCESS',
      DEFAULTS.selfHealLogAccess,
    ),
    selfHealVerbose,
    ruleCacheEnabled: readBoolean(
      undefined,
      'RALPH_SELF_HEAL_RULE_CACHE',
      DEFAULTS.ruleCacheEnabled,
    ),
    validationTimeoutMs: readPositiveInteger(
      undefined,
      'RALPH_SELF_HEAL_VALIDATION_TIMEOUT_MS',
      DEFAULTS.validationTimeoutMs,
    ),
  };
}

/**
 * Determine whether an iteration made any forward progress.
 *
 * An iteration is considered productive if any of the following are true:
 *   - OpenCode emitted the task, completion, or blocked-handoff promise
 *   - One or more tasks transitioned to "completed" during the iteration
 *   - At least one repo-tracked file was observed to have changed
 *   - The iteration failed outright (its signal is handled separately)
 *
 * Note: a blocked-handoff iteration is intentionally excluded from "stalled"
 * because the agent followed protocol — it surfaced a structured exit, the
 * runner caught it, and the loop will break this iteration. We never want
 * to penalize the agent (or the operator) for the canonical hand-off path.
 *
 * @param {object} iterationSignals
 * @returns {boolean}
 */
function _iterationIsStalled(iterationSignals) {
  if (!iterationSignals) return false;
  if (iterationSignals.iterationFailed) return false;
  if (iterationSignals.hasCompletion) return false;
  if (iterationSignals.hasTask) return false;
  if (iterationSignals.hasBlockedHandoff) return false;
  if (iterationSignals.completedTasksCount > 0) return false;
  if (iterationSignals.filesChangedCount > 0) return false;
  return true;
}

function _resolveAutoResolveHandoffConfig(options, existingState) {
  const enabled = options.autoResolveHandoffs === true;
  const maxPerRun =
    Number.isInteger(options.autoResolveHandoffMaxPerRun) &&
    options.autoResolveHandoffMaxPerRun > 0
      ? options.autoResolveHandoffMaxPerRun
      : DEFAULTS.autoResolveHandoffMaxPerRun;
  const previous =
    existingState &&
    existingState.autoResolveHandoffs &&
    typeof existingState.autoResolveHandoffs === 'object'
      ? existingState.autoResolveHandoffs
      : {};
  const previousAttempts =
    previous.attempts && typeof previous.attempts === 'object'
      ? previous.attempts
      : {};
  const previousTotal = Number.isInteger(previous.totalAttempts)
    ? previous.totalAttempts
    : 0;

  return {
    enabled,
    maxPerRun,
    state: {
      enabled,
      maxPerRun,
      totalAttempts: previousTotal,
      attempts: Object.assign({}, previousAttempts),
      lastDecision: previous.lastDecision || null,
    },
  };
}

function _handoffHasFocusedVerifierEvidence(note) {
  if (!note) return false;
  const text = String(note);
  const mentionsFocusedVerifier =
    /\bfocused\b[\s\S]{0,500}\b(verifier|command|test|spec|vitest)\b/i.test(text) ||
    /\b(verifier|command|test|spec|vitest)\b[\s\S]{0,500}\bfocused\b/i.test(text);
  const saysFocusedPasses =
    /\b(passes?|passed|exits?\s+0|exit(?:ed)?\s+0|green)\b/i.test(text);
  const saysBroadFails =
    /\b(broad|full|required|suite|repo-wide)\b[\s\S]{0,500}\b(fails?|failed|red|non[-\s]?zero)\b/i.test(text) ||
    /\b(fails?|failed|red|non[-\s]?zero)\b[\s\S]{0,500}\b(broad|full|required|suite|repo-wide)\b/i.test(text);
  const saysFailuresAreUnrelated =
    /\b(unrelated|pre[-\s]?existing|out[-\s]?of[-\s]?scope|known failures?|not introduced|baseline)\b/i.test(text);

  return mentionsFocusedVerifier && saysFocusedPasses && saysBroadFails && saysFailuresAreUnrelated;
}

function _classifyAutoResolvableHandoff(blockerNote, baselineGateConflict) {
  if (_handoffHasFocusedVerifierEvidence(blockerNote)) {
    return {
      className: 'verifier_narrowing',
      summary: 'focused verifier passes while the broad verifier fails on unrelated/pre-existing failures',
      allowedFiles: [],
    };
  }

  if (
    baselineGateConflict &&
    baselineGateConflict.mode === 'authorized_cleanup' &&
    baselineGateConflict.budgetUsed !== true &&
    Array.isArray(baselineGateConflict.allowedFiles) &&
    baselineGateConflict.allowedFiles.length > 0
  ) {
    return {
      className: 'authorized_cleanup',
      summary: 'task text explicitly authorizes one cleanup attempt for named files',
      allowedFiles: baselineGateConflict.allowedFiles.slice(),
    };
  }

  return null;
}

function _autoResolveHandoffBudgetKey(currentTaskMeta, className) {
  const taskId =
    currentTaskMeta && currentTaskMeta.number
      ? currentTaskMeta.number
      : currentTaskMeta && currentTaskMeta.description
        ? currentTaskMeta.description
        : 'unknown-task';
  return `${taskId}:${className || 'unknown'}`;
}

function _decideAutoResolveHandoff(config, blockerNote, currentTaskMeta, baselineGateConflict) {
  const disabledDecision = { allowed: false, reason: 'disabled', className: '', budgetKey: '' };
  if (!config || config.enabled !== true) return disabledDecision;

  const classification = _classifyAutoResolvableHandoff(blockerNote, baselineGateConflict);
  if (!classification) {
    return {
      allowed: false,
      reason: 'ambiguous_or_unsupported_handoff',
      className: '',
      budgetKey: '',
    };
  }

  const budgetKey = _autoResolveHandoffBudgetKey(currentTaskMeta, classification.className);
  const budgetDecision = supervisor._decideBoundedBudget({
    totalAttempts: config.state && config.state.totalAttempts,
    maxTotalAttempts: Number.isInteger(config.maxPerRun)
      ? config.maxPerRun
      : DEFAULTS.autoResolveHandoffMaxPerRun,
    attempts: config.state && config.state.attempts,
    budgetKey,
  });

  if (!budgetDecision.allowed) {
    return Object.assign({}, classification, budgetDecision, { budgetKey });
  }

  return Object.assign({}, classification, {
    allowed: budgetDecision.allowed,
    reason: budgetDecision.reason,
    budgetKey,
  });
}

function _consumeAutoResolveHandoffBudget(config, decision, iteration) {
  if (!config || !config.state || !decision || decision.allowed !== true || !decision.budgetKey) {
    return null;
  }

  const nextState = supervisor._consumeBoundedBudget({
    state: config.state,
    budgetKey: decision.budgetKey,
    entry: {
      className: decision.className,
      iteration,
      attemptedAt: new Date().toISOString(),
    },
  });

  config.state = Object.assign({}, nextState, {
    lastDecision: {
      className: decision.className,
      reason: decision.reason,
      budgetKey: decision.budgetKey,
      iteration,
      allowedFiles: decision.allowedFiles || [],
    },
  });

  return config.state;
}

function _isFailedIteration(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.signal !== null && result.signal !== undefined && result.signal !== '') {
    return true;
  }
  return result.exitCode !== 0;
}

function _wasSuccessfulIteration(result) {
  return !_isFailedIteration(result);
}

/**
 * Measure the size of a text string for telemetry purposes.
 *
 * @param {string} str
 * @returns {{ bytes: number, chars: number, tokens: number }}
 */
function _measureText(str) {
  if (typeof str !== 'string') str = '';
  const bytes = Buffer.byteLength(str, 'utf8');
  const chars = str.length;
  const tokens = Math.round(chars / 4);
  return { bytes, chars, tokens };
}

function _failureStageForError(err) {
  if (!err || typeof err !== 'object') {
    return 'invoke_contract';
  }

  if (err.failureStage) {
    return err.failureStage;
  }

  return 'invoke_contract';
}

function _errorText(err) {
  if (!err) return 'Unknown fatal iteration failure';

  if (err.stack && typeof err.stack === 'string' && err.stack.trim()) {
    return err.stack;
  }

  if (err.message && typeof err.message === 'string' && err.message.trim()) {
    return err.message;
  }

  return String(err);
}

/**
 * Wrapper around `supervisor._recoverSupervisorTmpFiles` that streams a stderr
 * notice for each recovery action and is invoked at runner startup so a
 * crashed prior loop's `tasks.md.supervisor-tmp` / `.supervisor-orig` residue
 * is reconciled before the next iteration runs. This wrapper intentionally
 * lives on the runner side (not in supervisor.js) because the stderr
 * narration is a runner-loop concern; the underlying atomic-rollback semantics
 * are unit-tested in `mini-ralph-supervisor.test.js`.
 */
function _recoverSupervisorStartupResidue(options = {}) {
  const tasksFile = options.tasksFile ? path.resolve(options.tasksFile) : '';
  const changeDir = options.changeDir
    ? path.resolve(options.changeDir)
    : (tasksFile ? path.dirname(tasksFile) : '');

  if (!changeDir) {
    return { recovered: false, actions: [] };
  }

  const recovery = supervisor._recoverSupervisorTmpFiles({
    tasksFile: tasksFile || path.join(changeDir, 'tasks.md'),
  });

  if (recovery.recovered && Array.isArray(recovery.actions)) {
    for (const action of recovery.actions) {
      process.stderr.write(`[mini-ralph] supervisor recovery: ${action}\n`);
    }
  }

  return recovery;
}

function _resolveChangeDirFromTasksFile(tasksFile) {
  if (!tasksFile) return '';
  return path.dirname(path.resolve(tasksFile));
}

function _resolveOpenspecRootFromTasksFile(tasksFile) {
  if (!tasksFile) return '';

  let current = path.dirname(path.resolve(tasksFile));
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

/**
 * Run the iteration loop.
 *
 * @param {object} opts - Loop options (see index.js for full schema)
 * @returns {Promise<object>} { completed, iterations, exitReason }
 */
async function run(opts) {
  const options = Object.assign({}, DEFAULTS, opts);
  _validateOptions(options);
  const supervisorConfig = _resolveSupervisorConfig(options);
  const changeDir = options.changeDir || _resolveChangeDirFromTasksFile(options.tasksFile);
  const openspecRoot = _resolveOpenspecRootFromTasksFile(options.tasksFile);

  if (options.tasksFile) {
    _recoverSupervisorStartupResidue({ tasksFile: options.tasksFile });
  }

  const ralphDir = options.ralphDir;
  const runLock = state.acquireRunLock(ralphDir, {
    tasksFile: options.tasksFile || null,
    promptFile: options.promptFile || null,
    tasksMode: options.tasksMode,
  });
  const maxIterations = options.maxIterations;
  const minIterations = options.minIterations;
  const completionPromise = options.completionPromise;
  const taskPromise = options.taskPromise;
  const blockedHandoffPromise = options.blockedHandoffPromise;
  const stallThreshold =
    typeof options.stallThreshold === 'number' && options.stallThreshold >= 0
      ? Math.floor(options.stallThreshold)
      : DEFAULTS.stallThreshold;

  const reporter = options.reporter || progress.create({
    enabled: !options.quiet,
    maxIterations,
  });

  let stateInitialized = false;
  let iterationCount = 0;
  let completed = false;
  let exitReason = 'max_iterations';
  let pendingSupervisorHints = [];
  // Consecutive iterations that succeeded but produced no progress signal.
  // Reset whenever any progress is detected (or when the iteration failed, so
  // transient infra errors don't trip the stall detector).
  let stallStreak = 0;

  try {

    // Determine starting iteration — resume from prior state if it exists,
    // otherwise start fresh at 1.
    const existingState = state.read(ralphDir);
    const resumeIteration = _resolveStartIteration(existingState, options);
    const priorRunWasBlockedHandoff =
      existingState && existingState.exitReason === 'blocked_handoff';
    const autoResolveHandoffs = _resolveAutoResolveHandoffConfig(options, existingState);

    if (options.verbose && resumeIteration > 1) {
      process.stderr.write(
        `[mini-ralph] resuming from iteration ${resumeIteration} ` +
        `(${resumeIteration - 1} prior iteration(s) preserved)\n`
      );
    }

    reporter.runStarted({
      tasksMode: Boolean(options.tasksMode),
      model: options.model || '',
      resumed: resumeIteration > 1 ? resumeIteration - 1 : null,
    });

    // Initialize state file for this run, preserving history count if resuming.
    //
    // `startedAt` semantics: this field marks the first time *this change* was
    // put through a Ralph loop. On a resume we must preserve the original
    // timestamp, not overwrite it with the current time -- previously, every
    // resume reset `startedAt` and the status dashboard lost the true wall-
    // clock duration. `resumedAt` tracks the most recent resume.
    const nowIso = new Date().toISOString();
    const preservedStartedAt =
      resumeIteration > 1 && existingState && existingState.startedAt
        ? existingState.startedAt
        : nowIso;
    let pendingDirtyPaths = _normalizePendingDirtyPaths(
      existingState && existingState.pendingDirtyPaths
    );

    state.init(ralphDir, {
      active: true,
      iteration: resumeIteration,
      minIterations,
      maxIterations,
      completionPromise,
      taskPromise,
      blockedHandoffPromise,
      tasksMode: options.tasksMode,
      tasksFile: options.tasksFile || null,
      promptFile: options.promptFile || null,
      promptTemplate: options.promptTemplate || null,
      noCommit: options.noCommit,
      model: options.model || '',
      startedAt: preservedStartedAt,
      resumedAt: resumeIteration > 1 ? nowIso : null,
      completedAt: null,
      stoppedAt: null,
      exitReason: null,
      pendingDirtyPaths,
      autoResolveHandoffs: autoResolveHandoffs.state,
    });
    stateInitialized = true;

    // Synchronize .ralph/ralph-tasks.md symlink to the OpenSpec tasks.md so the
    // loop engine always operates on the source-of-truth task file.
    if (options.tasksMode && options.tasksFile) {
      tasks.syncLink(ralphDir, options.tasksFile);
    }

    iterationCount = resumeIteration - 1;

    try {
      while (iterationCount < maxIterations) {
        iterationCount++;

        // Update state with current iteration
        state.update(ralphDir, { iteration: iterationCount, active: true });

        const iterStart = Date.now();
        const tasksBefore = options.tasksMode && options.tasksFile
          ? tasks.parseTasks(options.tasksFile)
          : [];
        const currentTask = _getCurrentTaskDescription(tasksBefore);
        const currentTaskMeta = _getCurrentTaskMeta(tasksBefore);
        pendingDirtyPaths = _refreshPendingDirtyPaths(pendingDirtyPaths);
        state.update(ralphDir, { pendingDirtyPaths });

        if (
          pendingDirtyPaths &&
          !_samePendingTask(pendingDirtyPaths, currentTaskMeta, currentTask)
        ) {
          reporter.note(
            _formatPendingDirtyPathsBlock(pendingDirtyPaths, currentTaskMeta, currentTask),
            'error'
          );
          exitReason = 'pending_dirty_paths';
          break;
        }

        reporter.iterationStarted({
          iteration: iterationCount,
          taskNumber: currentTaskMeta.number,
          taskDescription: currentTaskMeta.description,
        });

        let result;
        let promptSize = null;
        let responseSize = { bytes: 0, chars: 0, tokens: 0 };
        let baselineGateConflict = null;

        try {
          // Build the prompt for this iteration
          let renderedPrompt;
          try {
            renderedPrompt = await prompt.render(Object.assign({}, options, {
              changeDir,
              selfHealHints: supervisorConfig.selfHealHints,
              supervisorHints: pendingSupervisorHints,
            }), iterationCount);
            pendingSupervisorHints = [];
          } catch (err) {
            err.failureStage = err.failureStage || 'prompt_render';
            throw err;
          }

          // Emit 3 iterations of Recent Loop Signals — the `_failureFingerprint`
          // dedup collapses identical entries into a single "same failure as
          // iteration N" line, so the 3-entry window is sufficient to surface
          // recurring patterns without bloating the prompt.
          const recentHistory = history.recent(ralphDir, 3);
          const fullHistory = history.read(ralphDir);
          const errorEntries = errors.readEntries(ralphDir, 3);
          const blockerArtifacts = _detectBlockerArtifacts(ralphDir, {
            repoRoot: process.cwd(),
            includeStaleHandoff:
              priorRunWasBlockedHandoff ||
              recentHistory.some((entry) => entry && entry.blockedHandoffDetected),
          });
          const iterationFeedback = _buildIterationFeedback(
            recentHistory,
            errorEntries,
            blockerArtifacts,
          );
          baselineGateConflict = _analyzeBaselineGateConflict(
            ralphDir,
            options.tasksFile,
            currentTaskMeta,
            fullHistory,
          );
          const baselineGateFeedback = _formatBaselineGateFeedback(baselineGateConflict);
          const autoResolveHandoffFeedback = _buildAutoResolveHandoffFeedback(recentHistory);

          // Inject any pending context
          const pendingContext = context.consume(ralphDir);
          lessons.rotate(ralphDir, 100);
          const lessonsSection = lessons.inject(ralphDir, { limit: 15 });
          const promptSections = [renderedPrompt];

          if (baselineGateFeedback) {
            promptSections.push(`## Baseline Gate Conflict\n\n${baselineGateFeedback}`);
          }

          if (iterationFeedback) {
            promptSections.push(`## Recent Loop Signals\n\n${iterationFeedback}`);
          }

          if (autoResolveHandoffFeedback) {
            promptSections.push(`## Auto-Resolve Handoff\n\n${autoResolveHandoffFeedback}`);
          }

          if (lessonsSection) {
            promptSections.push(lessonsSection);
          }

          if (pendingContext) {
            promptSections.push(`## Injected Context\n\n${pendingContext}`);
          }

          const finalPrompt = promptSections.join('\n\n');

          // Measure and report prompt size
          promptSize = _measureText(finalPrompt);
          reporter.iterationPromptReady({
            iteration: iterationCount,
            promptBytes: promptSize.bytes,
            promptChars: promptSize.chars,
            promptTokens: promptSize.tokens,
          });

          // Invoke OpenCode
          try {
            result = await invoker.invoke({
              prompt: finalPrompt,
              model: options.model,
              noCommit: options.noCommit,
              verbose: options.verbose,
              ralphDir,
            });
            // Measure and report response size
            const rawOutput = result.rawOutput || result.output || result.stdout || '';
            responseSize = _measureText(rawOutput);
            reporter.iterationResponseReceived({
              iteration: iterationCount,
              responseBytes: responseSize.bytes,
              responseChars: responseSize.chars,
              responseTokens: responseSize.tokens,
              truncated: result.truncated || false,
            });
          } catch (err) {
            err.failureStage = err.failureStage || 'invoke_start';
            throw err;
          }
        } catch (err) {
          const fatalDuration = Date.now() - iterStart;
          _appendFatalIterationFailure(ralphDir, {
            iteration: iterationCount,
            task: currentTask,
            duration: fatalDuration,
            exitCode: null,
            signal: '',
            failureStage: _failureStageForError(err),
            stderr: _errorText(err),
            stdout: '',
            promptBytes: promptSize ? promptSize.bytes : 0,
            promptChars: promptSize ? promptSize.chars : 0,
            promptTokens: promptSize ? promptSize.tokens : 0,
            responseBytes: 0,
            responseChars: 0,
            responseTokens: 0,
            truncated: false,
          });
          reporter.iterationFinished({
            iteration: iterationCount,
            durationMs: fatalDuration,
            outcome: 'failure',
            committed: false,
            hasCompletion: false,
            hasTask: false,
            completedTasksCount: 0,
            filesChangedCount: 0,
            stallStreak,
            failureReason: `${_failureStageForError(err)}: ${_firstNonEmptyLine(_errorText(err), 120)}`,
            taskNumber: currentTaskMeta.number,
            taskDescription: currentTaskMeta.description,
          });
          throw err;
        }

        const duration = Date.now() - iterStart;

        // Detect promises in output
        const outputText = result.stdout || '';
        const iterationSucceeded = _wasSuccessfulIteration(result);
        const hasCompletion = iterationSucceeded && _containsPromise(outputText, completionPromise);
        const hasTask = iterationSucceeded && _containsPromise(outputText, taskPromise);
        // Blocked-handoff is also a successful-iteration signal (the agent
        // followed protocol and explicitly emitted a structured exit). We
        // treat it as a third top-level outcome alongside completion/task.
        const hasBlockedHandoff = iterationSucceeded
          && _containsPromise(outputText, blockedHandoffPromise);
        const blockerNote = hasBlockedHandoff
          ? _extractBlockerNote(outputText, blockedHandoffPromise)
          : '';
        const autoResolveHandoffClassification = hasBlockedHandoff
          ? _classifyAutoResolvableHandoff(blockerNote, baselineGateConflict)
          : null;
        const autoResolveHandoffDecision = hasBlockedHandoff
          ? _decideAutoResolveHandoff(
              autoResolveHandoffs,
              blockerNote,
              currentTaskMeta,
              baselineGateConflict,
            )
          : null;
        let supervisorResult = null;
        if (
          hasBlockedHandoff &&
          !autoResolveHandoffClassification &&
          supervisorConfig.selfHeal === true &&
          options.tasksFile
        ) {
          const previousTasksFileEnv = process.env.RALPH_TASKS_FILE;
          try {
            process.env.RALPH_TASKS_FILE = options.tasksFile;
            supervisorResult = await supervisor.runSupervisor({
              blockerNote,
              ralphDir,
              changeDir,
              openspecRoot,
              tasksFile: options.tasksFile,
              config: supervisorConfig,
              iteration: iterationCount,
              model: options.model,
            });
          } catch (error) {
            process.stderr.write(
              `[mini-ralph] warning: supervisor invocation failed: ${error.message}\n`
            );
          } finally {
            if (previousTasksFileEnv === undefined) {
              delete process.env.RALPH_TASKS_FILE;
            } else {
              process.env.RALPH_TASKS_FILE = previousTasksFileEnv;
            }
          }
        }
        if (autoResolveHandoffDecision && autoResolveHandoffDecision.allowed) {
          const nextAutoResolveState = _consumeAutoResolveHandoffBudget(
            autoResolveHandoffs,
            autoResolveHandoffDecision,
            iterationCount,
          );
          if (nextAutoResolveState) {
            state.update(ralphDir, { autoResolveHandoffs: nextAutoResolveState });
          }
        }
        const tasksAfter = options.tasksMode && options.tasksFile
          ? tasks.parseTasks(options.tasksFile)
          : [];
        const completedTasks = _completedTaskDelta(tasksBefore, tasksAfter);
        const supervisorState = supervisorResult ? state.read(ralphDir) : null;
        const supervisorTryIndex = supervisorState && supervisorState.supervisor &&
          Number.isInteger(supervisorState.supervisor.totalAttemptsForCurrentBlocker)
          ? supervisorState.supervisor.totalAttemptsForCurrentBlocker
          : undefined;

        let commitResult = { attempted: false, committed: false, anomaly: null };

        if (_isFailedIteration(result)) {
          errors.append(ralphDir, {
            iteration: iterationCount,
            task: currentTask,
            exitCode: result.exitCode,
            signal: result.signal || '',
            failureStage: result.failureStage || '',
            stderr: result.stderr || '',
            stdout: result.stdout || '',
          });
        }

        // Auto-commit only for successful task/completion iterations.
        if (
          !options.noCommit &&
          _wasSuccessfulIteration(result) &&
          result.filesChanged &&
          result.filesChanged.length > 0 &&
          (hasCompletion || (options.tasksMode && hasTask))
        ) {
          const filesToStage = _buildAutoCommitAllowlist(
            _mergePathLists(result.filesChanged, pendingDirtyPaths ? pendingDirtyPaths.files : []),
            completedTasks,
            options.tasksFile
          );
          commitResult = _autoCommit(iterationCount, {
            completedTasks,
            filesToStage,
            tasksFile: options.tasksFile,
            verbose: options.verbose,
            reporter,
          });
          if (commitResult.committed && pendingDirtyPaths) {
            pendingDirtyPaths = _remainingPendingDirtyPathsAfterCommit(
              pendingDirtyPaths,
              commitResult.anomaly
            );
            state.update(ralphDir, { pendingDirtyPaths });
          }
        }

        if (
          !commitResult.committed &&
          Array.isArray(result.filesChanged) &&
          result.filesChanged.length > 0 &&
          (_isFailedIteration(result) || hasBlockedHandoff)
        ) {
          pendingDirtyPaths = _recordPendingDirtyPaths(pendingDirtyPaths, {
            iteration: iterationCount,
            reason: hasBlockedHandoff ? 'blocked_handoff' : 'failed_iteration',
            task: currentTask,
            taskNumber: currentTaskMeta.number,
            taskDescription: currentTaskMeta.description,
            files: result.filesChanged,
          });
          state.update(ralphDir, { pendingDirtyPaths });
        }

        // Record iteration in history after commit handling so operator-visible
        // anomalies are captured alongside the task/completion signal.
        history.append(ralphDir, {
          iteration: iterationCount,
          duration,
          completionDetected: hasCompletion,
          taskDetected: hasTask,
          blockedHandoffDetected: hasBlockedHandoff,
          ...(blockerNote ? { blockedHandoffNote: _summarizeBlockerNote(blockerNote) } : {}),
          taskNumber: currentTaskMeta.number,
          taskDescription: currentTaskMeta.description,
          toolUsage: result.toolUsage || [],
          filesChanged: result.filesChanged || [],
          exitCode: result.exitCode,
          signal: result.signal || '',
          failureStage: result.failureStage || '',
          completedTasks: completedTasks.map((task) => task.fullDescription || task.description),
          ...(autoResolveHandoffDecision
            ? {
                autoResolveHandoffAttempted: autoResolveHandoffDecision.allowed === true,
                autoResolveHandoffClass: autoResolveHandoffDecision.className || '',
                autoResolveHandoffReason: autoResolveHandoffDecision.reason || '',
                autoResolveHandoffBudgetKey: autoResolveHandoffDecision.budgetKey || '',
                autoResolveHandoffAllowedFiles: autoResolveHandoffDecision.allowedFiles || [],
              }
            : {}),
          ...(supervisorResult
            ? {
                supervisorInvoked: true,
                ...(supervisorTryIndex !== undefined ? { supervisorTryIndex } : {}),
                supervisorOutcome: supervisorResult.outcome || '',
                supervisorPatchedTasks: supervisorResult.patchedTasks || [],
                supervisorBlockerHash: supervisorResult.blockerHash || '',
                supervisorSoftWarnings: supervisorResult.softWarnings || [],
                supervisorHints: supervisorResult.hints || [],
                supervisorHintsDropped: supervisorResult.hintsDropped || [],
                supervisorReadLogs: Object.prototype.hasOwnProperty.call(supervisorResult, 'readLogs')
                  ? supervisorResult.readLogs
                  : null,
                supervisorReadLogsBytes: Object.prototype.hasOwnProperty.call(supervisorResult, 'readLogsBytes')
                  ? supervisorResult.readLogsBytes
                  : null,
              }
            : {}),
          commitAttempted: commitResult.attempted,
          commitCreated: commitResult.committed,
          commitAnomaly: commitResult.anomaly ? commitResult.anomaly.message : '',
          commitAnomalyType: commitResult.anomaly ? commitResult.anomaly.type : '',
          protectedArtifacts: commitResult.anomaly ? commitResult.anomaly.protectedArtifacts || [] : [],
          ...(baselineGateConflict
            ? {
                baselineGateConflictMode: baselineGateConflict.mode,
                baselineGateRepairAllowedFiles: baselineGateConflict.allowedFiles || [],
                baselineGateRepairAttempted: _baselineGateRepairAttempted(
                  baselineGateConflict,
                  result.filesChanged || []
                ),
              }
            : {}),
          ...(commitResult.anomaly && commitResult.anomaly.ignoredPaths && commitResult.anomaly.ignoredPaths.length > 0
            ? { ignoredPaths: commitResult.anomaly.ignoredPaths }
            : {}),
          promptBytes: promptSize ? promptSize.bytes : 0,
          promptChars: promptSize ? promptSize.chars : 0,
          promptTokens: promptSize ? promptSize.tokens : 0,
          responseBytes: responseSize.bytes,
          responseChars: responseSize.chars,
          responseTokens: responseSize.tokens,
          truncated: result.truncated || false,
          // Pass through watchdog failure fields when the invoker returns them (task 3.1).
          ...(result.failureReason !== undefined ? { failureReason: result.failureReason } : {}),
          ...(result.idleMs !== undefined ? { idleMs: result.idleMs } : {}),
          ...(result.lastStdoutBytes !== undefined ? { lastStdoutBytes: result.lastStdoutBytes } : {}),
          ...(result.lastStderrBytes !== undefined ? { lastStderrBytes: result.lastStderrBytes } : {}),
        });
        if (supervisorResult && supervisorResult.outcome === 'patch_applied') {
          for (const taskNumber of supervisorResult.patchedTasks || []) {
            history.append(ralphDir, {
              type: 'supervisorEdit',
              iteration: iterationCount,
              blockerHash: supervisorResult.blockerHash || '',
              tryIndex: supervisorTryIndex === undefined ? null : supervisorTryIndex,
              taskNumber,
              rationaleSummary: supervisorResult.summary || '',
              validatorOk: true,
              softWarnings: supervisorResult.softWarnings || [],
            });
          }
        }
        if (supervisorResult && supervisorResult.outcome === 'patch_applied') {
          pendingSupervisorHints = Array.isArray(supervisorResult.hints)
            ? supervisorResult.hints.slice()
            : [];
        }

        // Stall detection is computed *before* the progress event so the
        // reporter can show the live streak alongside the badge. We still
        // enforce the stall halt after the event so the operator sees the
        // final (stalled) iteration line before the "halting" note.
        const iterationFailed = _isFailedIteration(result);
        const stalledThisIteration = _iterationIsStalled({
          iterationFailed,
          hasCompletion,
          hasTask,
          hasBlockedHandoff,
          completedTasksCount: completedTasks.length,
          filesChangedCount: Array.isArray(result.filesChanged) ? result.filesChanged.length : 0,
        });

        if (stalledThisIteration) {
          stallStreak++;
        } else {
          stallStreak = 0;
        }

        reporter.iterationFinished({
          iteration: iterationCount,
          durationMs: duration,
          outcome: iterationFailed
            ? 'failure'
            : hasBlockedHandoff
              ? 'blocked'
              : stalledThisIteration
                ? 'stalled'
                : 'success',
          committed: commitResult.committed === true,
          hasCompletion,
          hasTask,
          hasBlockedHandoff,
          completedTasksCount: completedTasks.length,
          filesChangedCount: Array.isArray(result.filesChanged) ? result.filesChanged.length : 0,
          stallStreak,
          failureReason: iterationFailed ? _summarizeFailure(result) : '',
          taskNumber: currentTaskMeta.number,
          taskDescription: currentTaskMeta.description,
        });

        // Check completion condition (must also satisfy minIterations)
        if (hasCompletion && iterationCount >= minIterations) {
          completed = true;
          exitReason = 'completion_promise';
          break;
        }

        // Blocked-handoff exits the loop *immediately* (no minIterations
        // floor). The agent has signaled an external decision is required;
        // we want the operator unblocked as fast as possible. We persist the
        // agent's note before breaking so it survives even a hard-kill on
        // the parent process (e.g. the operator hits Ctrl-C right after).
        if (hasBlockedHandoff) {
          let handoffPath = '';
          try {
            handoffPath = _writeHandoff(ralphDir, {
              iteration: iterationCount,
              task: currentTask,
              note: blockerNote,
              supervisor: supervisorResult
                ? {
                    iteration: iterationCount,
                    tryIndex: supervisorTryIndex,
                    blockerHash: supervisorResult.blockerHash || '',
                    patchedTasks: supervisorResult.patchedTasks || [],
                    softWarnings: supervisorResult.softWarnings || [],
                    summary: supervisorResult.summary || '',
                    attempts: supervisorResult.attempts || [],
                    attemptsExhausted: supervisorResult.attemptsExhausted === true,
                  }
                : null,
              completionPromise,
              taskPromise,
            });
          } catch (writeErr) {
            // Don't let a HANDOFF.md write failure mask the original signal —
            // we still want to exit cleanly with `blocked_handoff`. Surface
            // the write error to stderr so it's diagnosable.
            process.stderr.write(
              `[mini-ralph] warning: failed to write HANDOFF.md: ${writeErr.message}\n`
            );
          }
          reporter.note(
            handoffPath
              ? `agent emitted ${blockedHandoffPromise}; blocker note saved to ${handoffPath}.`
              : `agent emitted ${blockedHandoffPromise}; HANDOFF.md write failed (see stderr).`,
            'warn'
          );
          if (autoResolveHandoffDecision && autoResolveHandoffDecision.allowed) {
            reporter.note(
              `auto-resolve handoffs: continuing once for ${autoResolveHandoffDecision.className} (${autoResolveHandoffDecision.budgetKey}).`,
              'warn'
            );
            if (options.verbose) {
              process.stderr.write(
                `[mini-ralph] auto-resolve handoff consumed budget key ${autoResolveHandoffDecision.budgetKey}; continuing.\n`
              );
            }
            continue;
          }
          if (supervisorResult && supervisorResult.outcome === 'patch_applied') {
            reporter.note('supervisor applied a tasks.md patch; continuing.', 'warn');
            if (options.verbose) {
              process.stderr.write(
                `[mini-ralph] supervisor applied a tasks.md patch at iteration ${iterationCount}; continuing.\n`
              );
            }
            continue;
          }
          if (options.verbose) {
            process.stderr.write(
              `[mini-ralph] ${blockedHandoffPromise} detected at iteration ${iterationCount}; halting.\n`
            );
          }
          exitReason = 'blocked_handoff';
          break;
        }

        if (stallThreshold > 0 && stallStreak >= stallThreshold) {
          reporter.note(
            `stall detector: ${stallStreak} consecutive no-op iteration(s); halting.`,
            'warn'
          );
          if (options.verbose) {
            process.stderr.write(
              `[mini-ralph] stall detector: ${stallStreak} consecutive no-op iteration(s); halting.\n`
            );
          }
          exitReason = 'stalled';
          break;
        }

        // In tasks mode, task promise just continues the loop
        if (options.tasksMode && hasTask) {
          // Continue to next iteration
          continue;
        }
      }
    } catch (err) {
      exitReason = 'fatal_error';
      reporter.note(`fatal error: ${_firstNonEmptyLine(err && err.message, 120) || 'unknown'}`, 'error');
      reporter.runFinished({ completed: false, exitReason, iterations: iterationCount });
      throw err;
    }

    if (completed) {
      _cleanupCompletedErrors(ralphDir, options.verbose);
    }

    reporter.runFinished({ completed, exitReason, iterations: iterationCount });

    return { completed, iterations: iterationCount, exitReason };
  } finally {
    if (stateInitialized) {
      _finalizeRunState(ralphDir, { completed, exitReason });
    }
    state.releaseRunLock(ralphDir, runLock);
  }
}

function _finalizeRunState(ralphDir, outcome) {
  const now = new Date().toISOString();

  if (outcome && outcome.completed) {
    state.update(ralphDir, {
      active: false,
      completedAt: now,
      stoppedAt: null,
      exitReason: outcome.exitReason || 'completion_promise',
    });
    return;
  }

  state.update(ralphDir, {
    active: false,
    completedAt: null,
    stoppedAt: now,
    exitReason: outcome && outcome.exitReason ? outcome.exitReason : 'stopped',
  });
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

  const expectedTag = `<promise>${promiseName}</promise>`;
  return text
    .split(/\r?\n/)
    .some((line) => line.trim() === expectedTag);
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
  if (!options.promptFile && !options.promptText && !options.promptTemplate) {
    throw new Error('mini-ralph runner: at least one of options.promptFile, options.promptText, or options.promptTemplate is required');
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
 * Summarize recent problem signals so the next iteration can avoid repeating
 * the same failed approach.
 *
 * @param {Array<object>} recentHistory
 * @returns {string}
 */
function _firstNonEmptyLine(text, limit) {
  if (!text) return '';
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed.slice(0, limit);
    }
  }
  return '';
}

function _failureFingerprint(entry, errorEntries) {
  let stderrHead = '';
  if (errorEntries) {
    const match = errors.matchIteration(errorEntries, entry.iteration);
    stderrHead = _firstNonEmptyLine(match && match.stderr, 120);
  }
  // A "no promise emitted" iteration is also a distinguishable failure mode
  // even when exitCode===0 and there's no stderr (e.g. the agent refuses to
  // continue without using the control protocol). Encoding it separately keeps
  // no-progress stalls distinct from explicit BLOCKED_HANDOFF stops.
  const noPromise =
    !entry.completionDetected &&
    !entry.taskDetected &&
    !entry.blockedHandoffDetected;
  return JSON.stringify({
    failureStage: entry.failureStage || '',
    exitCode: entry.exitCode,
    stderrHead,
    noPromise,
    blockedHandoff: Boolean(entry.blockedHandoffDetected),
    commitAnomalyType: entry.commitAnomalyType || '',
  });
}

function _isEmptyFingerprint(fingerprint) {
  try {
    const obj = JSON.parse(fingerprint);
    return (
      !obj.failureStage &&
      obj.exitCode === 0 &&
      !obj.stderrHead &&
      !obj.noPromise &&
      !obj.blockedHandoff &&
      !obj.commitAnomalyType
    );
  } catch {
    return false;
  }
}

function _buildIterationFeedback(recentHistory, errorEntries, blockerArtifacts) {
  const hasArtifacts = Array.isArray(blockerArtifacts) && blockerArtifacts.length > 0;
  if ((!Array.isArray(recentHistory) || recentHistory.length === 0) && !hasArtifacts) {
    return '';
  }
  if (!Array.isArray(recentHistory)) recentHistory = [];

  const problemLines = [];
  // Track fingerprint -> first iteration number for dedup
  const fingerprintSeen = new Map();
  // Track which task each *problematic* iteration was working when it failed
  // / produced no progress. The same `taskNumber|taskDescription` repeating
  // across the recent window is the strongest livelock signal we have — the
  // agent is hitting the same wall with no new information. Persist the run
  // length so we can emit a HARD prefix above the per-iteration list when
  // the streak crosses the noise floor (3+ consecutive on the same task).
  const recentTasks = [];

  for (const entry of recentHistory) {
    const issues = [];

    if (entry.signal) {
      issues.push(`opencode exited via signal ${entry.signal}`);
    } else if (entry.failureStage) {
      issues.push(`iteration aborted during ${entry.failureStage}`);
    } else if (entry.exitCode !== 0) {
      issues.push(`opencode exited with code ${entry.exitCode}`);
    }

    if (entry.commitAnomaly) {
      issues.push(`commit anomaly: ${entry.commitAnomaly}`);
    }

    if (entry.blockedHandoffDetected) {
      issues.push('agent emitted BLOCKED_HANDOFF and requested operator handoff');
    } else if (!entry.completionDetected && !entry.taskDetected) {
      issues.push('no loop promise emitted');
    }

    if (issues.length > 0) {
      // Build the task-identity stamp (used both for the per-line prefix and
      // for streak detection). Empty when the runner had no task context for
      // the iteration (non-tasks-mode, or pre-resume entries written by an
      // older runner version).
      const rawTaskId = entry.taskNumber
        ? `${entry.taskNumber}|${entry.taskDescription || ''}`
        : (entry.taskDescription || '');
      const taskStamp = entry.taskNumber
        ? `Task ${entry.taskNumber}` +
          (entry.taskDescription ? ` (${entry.taskDescription})` : '')
        : (entry.taskDescription
          ? `Task ${entry.taskDescription}`
          : '');
      if (rawTaskId) recentTasks.push(rawTaskId);

      // Compute fingerprint for dedup
      const fp = _failureFingerprint(entry, errorEntries);
      const isRealFailure = !_isEmptyFingerprint(fp);

      // paths_ignored_filtered and all_paths_ignored are exempt from dedup:
      // every occurrence must produce its own distinct line so the agent
      // sees the full per-iteration history of gitignore filtering events.
      const isIgnoreFilterAnomaly =
        entry.commitAnomalyType === 'paths_ignored_filtered' ||
        entry.commitAnomalyType === 'all_paths_ignored';

      if (isRealFailure && fingerprintSeen.has(fp) && !isIgnoreFilterAnomaly) {
        const firstIteration = fingerprintSeen.get(fp);
        const stampSuffix = taskStamp ? ` [${taskStamp}]` : '';
        problemLines.push(
          `- Iteration ${entry.iteration}${stampSuffix}: same failure as iteration ${firstIteration} (see above).`
        );
      } else {
        if (isRealFailure && !isIgnoreFilterAnomaly) fingerprintSeen.set(fp, entry.iteration);

        const stampPrefix = taskStamp ? ` [${taskStamp}]` : '';
        let line = `- Iteration ${entry.iteration}${stampPrefix}: ${issues.join('; ')}.`;

        if (entry.blockedHandoffDetected && entry.blockedHandoffNote) {
          line += ` Blocker note: ${entry.blockedHandoffNote}`;
        }

        // For paths_ignored_filtered / all_paths_ignored, append the first two
        // ignored paths inline (with a (+N more) suffix) so the agent can see
        // the exact files without diving into history. This replaces the
        // generic commit-anomaly text with a richer per-iteration signal.
        if (isIgnoreFilterAnomaly && Array.isArray(entry.ignoredPaths) && entry.ignoredPaths.length > 0) {
          const paths = entry.ignoredPaths;
          const shown = paths.slice(0, 2);
          const remaining = paths.length - shown.length;
          const pathStr = shown.join(', ') + (remaining > 0 ? ` (+${remaining} more)` : '');
          line += ` Ignored paths: ${pathStr}.`;
        }

        // When the only issue is "no loop promise emitted" (no signal, no
        // failureStage, exitCode 0, no commit anomaly), append a compact
        // suffix with tool-usage and duration to give the agent more context.
        const isNoPromiseOnly =
          issues.length === 1 &&
          issues[0] === 'no loop promise emitted' &&
          !entry.signal &&
          !entry.failureStage &&
          entry.exitCode === 0 &&
          !entry.commitAnomaly;

        if (isNoPromiseOnly) {
          const toolParts = Array.isArray(entry.toolUsage) && entry.toolUsage.length > 0
            ? entry.toolUsage.map(t => `${t.tool}\u00d7${t.count}`).join(', ')
            : null;
          const durationMs = entry.duration != null ? entry.duration : 0;
          const durationStr = durationMs > 0 ? progress._formatDuration(durationMs) : null;
          if (toolParts || durationStr) {
            const suffixParts = [];
            if (toolParts) suffixParts.push(`Tools used: ${toolParts}.`);
            if (durationStr) suffixParts.push(`Duration: ${durationStr}.`);
            line += ` ${suffixParts.join(' ')}`;
          }
        }

        if (_isFailedIteration(entry) && errorEntries) {
          const errorDetails = _extractErrorForIteration(errorEntries, entry.iteration);
          if (errorDetails) {
            line += '\n  Error output:';
            if (errorDetails.signal) {
              line += `\n  signal: ${errorDetails.signal}`;
            }
            if (errorDetails.failureStage) {
              line += `\n  failure stage: ${errorDetails.failureStage}`;
            }
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
  }

  if (problemLines.length === 0 && !hasArtifacts) {
    return '';
  }

  // Detect the longest *trailing* run of the same task identity in the
  // problematic-iteration window. Trailing because the only thing that
  // matters is "is the most recent stretch still the same task?" — a stale
  // streak from earlier in the window is irrelevant once the task changed.
  let sameTaskStreak = 0;
  let stuckTaskId = '';
  if (recentTasks.length > 0) {
    const last = recentTasks[recentTasks.length - 1];
    if (last) {
      stuckTaskId = last;
      for (let i = recentTasks.length - 1; i >= 0; i--) {
        if (recentTasks[i] === last) {
          sameTaskStreak++;
        } else {
          break;
        }
      }
    }
  }

  const sections = [];
  // The 3-iteration threshold matches the default `stallThreshold` so the
  // hard-prefix and the eventual stall halt are aligned: the agent sees the
  // warning one iteration before the stall detector fires, giving it a final
  // chance to hand off cleanly via BLOCKED_HANDOFF rather than livelock.
  if (sameTaskStreak >= 3 && stuckTaskId) {
    const display = stuckTaskId.includes('|')
      ? stuckTaskId.replace('|', ' — ')
      : stuckTaskId;
    sections.push(
      [
        '⚠ STUCK ON SAME TASK',
        `You have failed to make progress on the same task ${sameTaskStreak} iterations in a row: ${display}.`,
        'Stop retrying the same approach. Re-read the task spec, then either:',
        '  1. Pick a materially different approach (different files, different invariant).',
        '  2. If the task spec authorizes it (e.g. a "Stop and hand off if:" clause fired), emit <promise>BLOCKED_HANDOFF</promise> with a structured Blocker Note and stop. The runner will save it to .ralph/HANDOFF.md.',
        '',
      ].join('\n')
    );
  }

  if (problemLines.length > 0) {
    sections.push(
      [
        'Use these signals to avoid repeating the same failed approach:',
        ...problemLines,
      ].join('\n')
    );
  }

  if (hasArtifacts) {
    const artifactBlocks = blockerArtifacts.map((art) => {
      const header = `### ${art.path}${art.truncated ? '  (truncated)' : ''}`;
      // Code-fence the body so MDX-y artifacts (` ` `, `<promise>`) don't
      // collide with the surrounding prompt markdown.
      return [
        header,
        '```',
        art.content,
        '```',
      ].join('\n');
    });

    sections.push(
      [
        'Prior-iteration blocker artifacts (read these BEFORE re-deriving the same diagnosis):',
        ...artifactBlocks,
      ].join('\n\n')
    );
  }

  return sections.join('\n');
}

function _buildAutoResolveHandoffFeedback(recentHistory) {
  if (!Array.isArray(recentHistory) || recentHistory.length === 0) return '';

  const entry = recentHistory
    .slice()
    .reverse()
    .find((item) => item && item.autoResolveHandoffAttempted === true);

  if (!entry) return '';

  const className = entry.autoResolveHandoffClass || 'unknown';
  const spentBudget = supervisor._decideBoundedBudget({
    totalAttempts: 0,
    maxTotalAttempts: DEFAULTS.autoResolveHandoffMaxPerRun,
    attempts: { spent: { className } },
    budgetKey: 'spent',
  });
  const lines = [
    `The previous iteration emitted BLOCKED_HANDOFF, but auto-resolution is enabled and ${spentBudget.allowed ? 'reserved' : 'spent'} its bounded attempt for ${className}.`,
    'You have exactly one continuation attempt for this task/blocker class. Do not broaden task scope, do not repair unrelated snapshots or UI behavior, and do not keep retrying if the evidence does not hold.',
  ];

  if (className === 'verifier_narrowing') {
    lines.push(
      'Allowed action: if the handoff explicitly names a focused verifier that passes and a broad verifier that fails only on unrelated/pre-existing failures, update only the current task verifier from the broad command to that focused command, run the focused command once, and complete the task only if it passes. If the focused command is absent, ambiguous, or fails, emit BLOCKED_HANDOFF instead of retrying.'
    );
  } else if (className === 'authorized_cleanup') {
    const files = Array.isArray(entry.autoResolveHandoffAllowedFiles)
      ? entry.autoResolveHandoffAllowedFiles.filter(Boolean)
      : [];
    lines.push(
      `Allowed action: make one cleanup attempt only in the task-authorized file list${files.length > 0 ? ` (${files.join(', ')})` : ''}. If the gate still fails, emit BLOCKED_HANDOFF instead of continuing.`
    );
  } else {
    lines.push(
      'Allowed action: continue only if the blocker evidence remains explicit and within the runner-approved safe class; otherwise emit BLOCKED_HANDOFF.'
    );
  }

  return lines.join('\n');
}

function _extractErrorForIteration(errorEntries, iteration) {
  if (!Array.isArray(errorEntries) || errorEntries.length === 0) return null;

  const match = errors.matchIteration(errorEntries, iteration);
  if (!match) return null;

  let stderr = match.stderr || '';
  let stdout = match.stdout || '';

  if (stderr.length > 500) stderr = stderr.substring(0, 500) + '...';
  if (stdout.length > 200) stdout = stdout.substring(0, 200) + '...';

  return {
    stderr,
    stdout,
    signal: match.signal || '',
    failureStage: match.failureStage || '',
  };
}

function _getCurrentTaskDescription(tasksBefore) {
  if (!Array.isArray(tasksBefore) || tasksBefore.length === 0) return 'N/A';
  const incomplete = tasksBefore.find((t) => t.status !== 'completed');
  if (incomplete) return incomplete.fullDescription || incomplete.description || 'N/A';
  return 'N/A';
}

/**
 * Return the structured { number, description } of the current task for the
 * progress reporter. Unlike `_getCurrentTaskDescription` this preserves the
 * task number separately so the status line can render "task 4.7" even when
 * the description is later truncated.
 *
 * @param {Array<object>} tasksBefore
 * @returns {{ number: string, description: string }}
 */
/**
 * Produce a short one-line reason for a failed iteration, suitable for the
 * progress reporter. Prefers the stderr first line; falls back to the exit
 * code / signal / failure stage so the operator always sees *something*.
 *
 * @param {object} result
 * @returns {string}
 */
function _summarizeFailure(result) {
  if (!result || typeof result !== 'object') return 'unknown failure';

  const stderrHead = _firstNonEmptyLine(result.stderr, 120);
  if (stderrHead) return stderrHead;

  const parts = [];
  if (result.failureStage) parts.push(result.failureStage);
  if (result.signal) parts.push(`signal=${result.signal}`);
  if (
    typeof result.exitCode === 'number' &&
    result.exitCode !== 0
  ) {
    parts.push(`exit=${result.exitCode}`);
  }
  return parts.length > 0 ? parts.join(' ') : 'iteration failed';
}

function _getCurrentTaskMeta(tasksBefore) {
  if (!Array.isArray(tasksBefore) || tasksBefore.length === 0) {
    return { number: '', description: '' };
  }
  const incomplete = tasksBefore.find(
    (task) => task && task.status !== 'completed'
  );
  if (!incomplete) return { number: '', description: '' };
  return {
    number: incomplete.number ? String(incomplete.number) : '',
    description: incomplete.description || incomplete.fullDescription || '',
  };
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
  _recoverSupervisorStartupResidue,
  _finalizeRunState,
  _containsPromise,
  _validateOptions,
  _autoCommit,
  _buildAutoCommitAllowlist,
  _mergePathLists,
  _normalizePendingDirtyPaths,
  _recordPendingDirtyPaths,
  _remainingPendingDirtyPathsAfterCommit,
  _refreshPendingDirtyPaths,
  _samePendingTask,
  _currentDirtyPathSet,
  _filterGitignored,
  _resolveStartIteration,
  _completedTaskDelta,
  _formatAutoCommitMessage,
  _truncateSubjectSummary,
  _buildIterationFeedback,
  _buildAutoResolveHandoffFeedback,
  _resolveAutoResolveHandoffConfig,
  _resolveSupervisorConfig,
  _handoffHasFocusedVerifierEvidence,
  _classifyAutoResolvableHandoff,
  _decideAutoResolveHandoff,
  _consumeAutoResolveHandoffBudget,
  _buildBaselineGateFeedback,
  _analyzeBaselineGateConflict,
  _formatBaselineGateFeedback,
  _extractCurrentTaskBlock,
  _detectStrictCleanGates,
  _detectFailingBaselineGates,
  _detectRecordedBaselineGates,
  _detectMissingBaselineGates,
  _detectAuthorizedBaselineCleanup,
  _baselineGateRepairBudgetUsed,
  _baselineGateRepairAttempted,
  _extractErrorForIteration,
  _getCurrentTaskDescription,
  _getCurrentTaskMeta,
  _summarizeFailure,
  _cleanupCompletedErrors,
  _detectProtectedCommitArtifacts,
  _gitErrorMessage,
  _isFailedIteration,
  _wasSuccessfulIteration,
  _failureStageForError,
  _errorText,
  _appendFatalIterationFailure,
  _failureFingerprint,
  _firstNonEmptyLine,
  _iterationIsStalled,
  _extractBlockerNote,
  _writeHandoff,
  _detectBlockerArtifacts,
};
