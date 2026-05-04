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
};

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
 * Extract the agent's blocker note from iteration output. The convention is:
 * the line containing `<promise>BLOCKED_HANDOFF</promise>` MAY be preceded by
 * a free-text rationale block (any number of lines up to a sentinel header
 * `## Blocker` / `## Blocker Note` / `Blocker:`), and MAY include `## Why:` /
 * `## Done-When-Will-Be:` / `## Suggested Next Step:` sections. We capture
 * everything from the first sentinel header up to the promise tag, with a
 * fallback to the last 40 non-blank lines preceding the tag if no sentinel
 * is present, so the operator gets *something* useful even when the agent
 * skips the structured format.
 *
 * @param {string} outputText  full iteration stdout
 * @param {string} promiseName configured BLOCKED_HANDOFF promise name
 * @returns {string} the extracted note (empty string if the tag is absent)
 */
function _extractBlockerNote(outputText, promiseName) {
  if (!outputText || !promiseName) return '';
  const tag = `<promise>${promiseName}</promise>`;
  const lines = outputText.split(/\r?\n/);
  let tagIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === tag) {
      tagIdx = i;
      break;
    }
  }
  if (tagIdx === -1) return '';

  // Look backwards for a sentinel header.
  const sentinel = /^\s*(##\s*Blocker(\s+Note)?|Blocker:)/i;
  let startIdx = tagIdx;
  for (let i = tagIdx - 1; i >= 0; i--) {
    if (sentinel.test(lines[i])) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === tagIdx) {
    // No sentinel — fall back to the last 40 non-blank lines before the tag.
    const window = [];
    for (let i = tagIdx - 1; i >= 0 && window.length < 40; i--) {
      const l = lines[i];
      if (l.trim()) window.unshift(l);
    }
    return window.join('\n').trim();
  }

  return lines.slice(startIdx, tagIdx).join('\n').trim();
}

/**
 * Scan well-known locations for blocker / diagnostic artifacts the agent
 * may have written during the most recent iteration, and return their
 * content (truncated) so we can tee it into the next iteration's prompt.
 *
 * The motivation is the failure mode we observed in the wild: the agent
 * writes `<change-baseline>/shared-chrome-invariant-report.txt` with a clear
 * `STATUS=BLOCKED  REASON=...` diagnosis, then on the next iteration starts
 * from a blank slate, re-derives the same diagnosis, and burns another full
 * LLM cycle. By auto-detecting and surfacing the artifact, the agent gets
 * its own prior diagnosis as input on the next turn, freeing it to either
 * (a) act on it, or (b) emit BLOCKED_HANDOFF with a richer note.
 *
 * Probe paths (relative to ralphDir's parent — i.e. the change root):
 *   - <ralphDir>/HANDOFF.md
 *   - <ralphDir>/BLOCKED.md
 *   - <ralphDir>/blocker.md  /  blocker-note.md
 *   - <repoRoot>/.ralph/baselines/<change>/*report*.{txt,md}
 *   - any file under <ralphDir> matching /(blocker|handoff|invariant-report)\.[a-z]+$/i
 *
 * We cap the returned text at 1500 chars per artifact and 3 artifacts total
 * so the feedback block stays bounded. Freshness is required by default to
 * avoid carrying stale diagnostics forever; when a prior run explicitly ended
 * with BLOCKED_HANDOFF, the canonical handoff files may be included even when
 * stale because they are the persisted operator-facing diagnosis.
 *
 * @param {string} ralphDir
 * @param {object} [options] { repoRoot, maxArtifacts = 3, maxCharsEach = 1500, includeStaleHandoff = false }
 * @returns {Array<{ path: string, content: string, truncated: boolean }>}
 */
function _detectBlockerArtifacts(ralphDir, options) {
  const fs = require('fs');
  const fsPath = require('path');
  const opts = Object.assign(
    {
      repoRoot: process.cwd(),
      maxArtifacts: 3,
      maxCharsEach: 1500,
      includeStaleHandoff: false,
    },
    options || {}
  );

  if (!ralphDir || !fs.existsSync(ralphDir)) return [];

  const matches = new Map(); // path -> mtimeMs (dedup by absolute path)
  const isHandoffArtifact = (name) =>
    /^(handoff|blocked|blocker(-note)?)\.(md|txt)$/i.test(name);
  const isInteresting = (name) =>
    isHandoffArtifact(name) ||
    /(invariant|blocker|handoff).*report\.(md|txt)$/i.test(name) ||
    /report\.(md|txt)$/i.test(name);

  const consider = (p) => {
    try {
      const st = fs.statSync(p);
      if (!st.isFile()) return;
      // Files larger than 1MB are almost certainly not human-curated blocker
      // notes; skip them so we don't load logs or screenshots into the prompt.
      if (st.size > 1024 * 1024) return;
      // Only surface artifacts touched within the last ~10 minutes — older
      // files are almost always stale leftovers from prior runs, and the
      // failure mode we care about (repeated diagnosis with no progress)
      // produces fresh writes every iteration.
      const stale = Date.now() - st.mtimeMs > 10 * 60 * 1000;
      if (stale && !(opts.includeStaleHandoff && isHandoffArtifact(fsPath.basename(p)))) {
        return;
      }
      matches.set(fsPath.resolve(p), st.mtimeMs);
    } catch (_) {
      // ENOENT / permission errors: ignore — this is a best-effort probe.
    }
  };

  // 1) Direct ralphDir scan, one level deep. .ralph/ is small, so a flat
  //    listing is cheap and bounded.
  try {
    const entries = fs.readdirSync(ralphDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && isInteresting(ent.name)) {
        consider(fsPath.join(ralphDir, ent.name));
      }
    }
  } catch (_) { /* ignore */ }

  // 2) Convention-based baseline location used by spec-and-loop changes:
  //    <repoRoot>/.ralph/baselines/<change>/*report*.{txt,md}
  //    The change name is the parent directory of ralphDir's parent in the
  //    OpenSpec layout (e.g. .../changes/<name>/.ralph), so we derive it.
  try {
    const changeDir = fsPath.dirname(ralphDir);
    const changeName = fsPath.basename(changeDir);
    const baselinesDir = fsPath.join(opts.repoRoot, '.ralph', 'baselines', changeName);
    if (fs.existsSync(baselinesDir)) {
      const entries = fs.readdirSync(baselinesDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isFile() && isInteresting(ent.name)) {
          consider(fsPath.join(baselinesDir, ent.name));
        }
      }
    }
  } catch (_) { /* ignore */ }

  if (matches.size === 0) return [];

  // Sort by mtime descending so the freshest artifact wins when we cap.
  const sorted = Array.from(matches.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);

  const out = [];
  for (const p of sorted.slice(0, opts.maxArtifacts)) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const truncated = raw.length > opts.maxCharsEach;
      const content = truncated ? raw.slice(0, opts.maxCharsEach) : raw;
      out.push({
        path: fsPath.relative(opts.repoRoot, p) || p,
        content: content.trim(),
        truncated,
      });
    } catch (_) {
      // Ignore unreadable artifacts.
    }
  }

  return out;
}

/**
 * Write the agent's blocker note to <ralphDir>/HANDOFF.md with iteration
 * metadata so an operator can reproduce the context. Appends rather than
 * overwrites: a single change can hit several BLOCKED_HANDOFFs over time
 * (operator unblocks, loop resumes, hits a different blocker), and we want
 * the full audit trail in one file.
 *
 * @param {string} ralphDir
 * @param {object} entry { iteration, task, note, completionPromise, taskPromise }
 * @returns {string} the absolute path to HANDOFF.md
 */
function _writeHandoff(ralphDir, entry) {
  const fs = require('fs');
  const fsPath = require('path');
  if (!fs.existsSync(ralphDir)) {
    fs.mkdirSync(ralphDir, { recursive: true });
  }
  const handoffPath = fsPath.join(ralphDir, 'HANDOFF.md');
  const ts = new Date().toISOString();
  const taskLine = entry.task && entry.task !== 'N/A'
    ? entry.task
    : '(no task in progress)';
  const noteBlock = entry.note && entry.note.trim()
    ? entry.note.trim()
    : '(agent emitted BLOCKED_HANDOFF without a structured blocker note;\n' +
      'check the iteration stdout log for the rationale)';

  const section = [
    '',
    `## Iteration ${entry.iteration} — ${ts}`,
    '',
    `**Task:** ${taskLine}`,
    '',
    '**Agent blocker note:**',
    '',
    noteBlock,
    '',
    '**Operator next step:** investigate the blocker, take one of the actions',
    'the task spec authorizes (revert / isolate / justify / escalate), then',
    'rerun `ralph-run` to resume.',
    '',
    '---',
    '',
  ].join('\n');

  let existing = '';
  if (fs.existsSync(handoffPath)) {
    existing = fs.readFileSync(handoffPath, 'utf8');
  } else {
    existing = '# Ralph Handoff Log\n\nThis file is appended whenever the loop\n' +
      'exits with `BLOCKED_HANDOFF`. Each section is one blocker the\n' +
      'agent surfaced — review newest first.\n';
  }
  fs.writeFileSync(handoffPath, existing + section, 'utf8');
  return handoffPath;
}

function _appendFatalIterationFailure(ralphDir, entry) {
  errors.append(ralphDir, {
    iteration: entry.iteration,
    task: entry.task,
    exitCode: entry.exitCode,
    signal: entry.signal || '',
    failureStage: entry.failureStage || '',
    stderr: entry.stderr || '',
    stdout: entry.stdout || '',
  });

  history.append(ralphDir, {
    iteration: entry.iteration,
    duration: entry.duration,
    completionDetected: false,
    taskDetected: false,
    toolUsage: [],
    filesChanged: [],
    exitCode: entry.exitCode,
    signal: entry.signal || '',
    failureStage: entry.failureStage || '',
    completedTasks: [],
    commitAttempted: false,
    commitCreated: false,
    commitAnomaly: '',
    commitAnomalyType: '',
    protectedArtifacts: [],
    promptBytes: entry.promptBytes || 0,
    promptChars: entry.promptChars || 0,
    promptTokens: entry.promptTokens || 0,
    responseBytes: entry.responseBytes || 0,
    responseChars: entry.responseChars || 0,
    responseTokens: entry.responseTokens || 0,
    truncated: entry.truncated || false,
  });
}

function _summarizeBlockerNote(note, limit = 500) {
  if (!note || typeof note !== 'string') return '';
  const oneLine = note.replace(/\s+/g, ' ').trim();
  if (!oneLine) return '';
  if (oneLine.length <= limit) return oneLine;
  return `${oneLine.slice(0, Math.max(0, limit - 1)).replace(/\s+$/, '')}…`;
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

        try {
          // Build the prompt for this iteration
          let renderedPrompt;
          try {
            renderedPrompt = await prompt.render(options, iterationCount);
          } catch (err) {
            err.failureStage = err.failureStage || 'prompt_render';
            throw err;
          }

          // Emit 3 iterations of Recent Loop Signals — the `_failureFingerprint`
          // dedup collapses identical entries into a single "same failure as
          // iteration N" line, so the 3-entry window is sufficient to surface
          // recurring patterns without bloating the prompt.
          const recentHistory = history.recent(ralphDir, 3);
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

          // Inject any pending context
          const pendingContext = context.consume(ralphDir);
          lessons.rotate(ralphDir, 100);
          const lessonsSection = lessons.inject(ralphDir, { limit: 15 });
          const promptSections = [renderedPrompt];

          if (iterationFeedback) {
            promptSections.push(`## Recent Loop Signals\n\n${iterationFeedback}`);
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
        const tasksAfter = options.tasksMode && options.tasksFile
          ? tasks.parseTasks(options.tasksFile)
          : [];
        const completedTasks = _completedTaskDelta(tasksBefore, tasksAfter);

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
          commitAttempted: commitResult.attempted,
          commitCreated: commitResult.committed,
          commitAnomaly: commitResult.anomaly ? commitResult.anomaly.message : '',
          commitAnomalyType: commitResult.anomaly ? commitResult.anomaly.type : '',
          protectedArtifacts: commitResult.anomaly ? commitResult.anomaly.protectedArtifacts || [] : [],
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
              : `agent emitted ${blockedHandoffPromise}; halting (HANDOFF.md write failed; see stderr).`,
            'warn'
          );
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

function _normalizePendingDirtyPaths(pending) {
  if (!pending || typeof pending !== 'object') return null;
  const files = _mergePathLists(pending.files || pending.paths || []);
  if (files.length === 0) return null;

  return {
    iteration: typeof pending.iteration === 'number' ? pending.iteration : null,
    reason: pending.reason || 'blocked_handoff',
    task: pending.task || '',
    taskNumber: pending.taskNumber || '',
    taskDescription: pending.taskDescription || '',
    files,
    recordedAt: pending.recordedAt || new Date().toISOString(),
  };
}

function _recordPendingDirtyPaths(existing, update) {
  const normalized = _normalizePendingDirtyPaths({
    iteration: update && typeof update.iteration === 'number' ? update.iteration : null,
    reason: update && update.reason ? update.reason : 'blocked_handoff',
    task: update && update.task ? update.task : '',
    taskNumber: update && update.taskNumber ? update.taskNumber : '',
    taskDescription: update && update.taskDescription ? update.taskDescription : '',
    files: _mergePathLists(
      existing && existing.files ? existing.files : [],
      update && update.files ? update.files : []
    ),
    recordedAt: update && update.recordedAt ? update.recordedAt : new Date().toISOString(),
  });

  return normalized;
}

function _remainingPendingDirtyPathsAfterCommit(pending, anomaly) {
  const normalized = _normalizePendingDirtyPaths(pending);
  if (!normalized) return null;

  const ignoredPaths = anomaly && Array.isArray(anomaly.ignoredPaths)
    ? anomaly.ignoredPaths.map(_repoRelativePath).filter(Boolean)
    : [];
  if (ignoredPaths.length === 0) return null;

  const ignoredSet = new Set(ignoredPaths);
  const files = normalized.files.filter((file) => ignoredSet.has(file));
  if (files.length === 0) return null;
  return Object.assign({}, normalized, { files });
}

function _refreshPendingDirtyPaths(pending) {
  const normalized = _normalizePendingDirtyPaths(pending);
  if (!normalized) return null;

  const dirtyPaths = _currentDirtyPathSet();
  if (!dirtyPaths) return normalized;
  const files = normalized.files.filter((file) => dirtyPaths.has(file));
  if (files.length === 0) return null;

  return Object.assign({}, normalized, { files });
}

function _samePendingTask(pending, currentTaskMeta, currentTask) {
  if (!pending) return true;
  const currentNumber = currentTaskMeta && currentTaskMeta.number ? currentTaskMeta.number : '';
  const currentDescription = currentTaskMeta && currentTaskMeta.description ? currentTaskMeta.description : '';
  const currentFull = currentTask || '';

  if (pending.taskNumber && currentNumber) {
    return pending.taskNumber === currentNumber;
  }

  if (pending.taskDescription && currentDescription) {
    return pending.taskDescription === currentDescription;
  }

  return Boolean(pending.task && currentFull && pending.task === currentFull);
}

function _formatPendingDirtyPathsBlock(pending, currentTaskMeta, currentTask) {
  const currentStamp = currentTaskMeta && currentTaskMeta.number
    ? `${currentTaskMeta.number} ${currentTaskMeta.description || ''}`.trim()
    : (currentTask || 'the current task');
  const pendingStamp = pending.taskNumber
    ? `${pending.taskNumber} ${pending.taskDescription || ''}`.trim()
    : (pending.task || 'a prior blocked handoff');
  const files = (pending.files || []).slice(0, 8);
  const extra = (pending.files || []).length - files.length;
  const fileLines = files.map((file) => `  - ${file}`).join('\n');
  const suffix = extra > 0 ? `\n  - (+${extra} more)` : '';

  return [
    `pending dirty paths from ${pending.reason || 'blocked_handoff'} iteration ${pending.iteration || 'unknown'} remain unresolved.`,
    `Prior task: ${pendingStamp}`,
    `Current task: ${currentStamp}`,
    'Resolve the prior patch before Ralph can safely continue: commit it with the same task, revert it, or move it to a separate change.',
    'Pending paths:',
    `${fileLines}${suffix}`,
  ].join('\n');
}

function _currentDirtyPathSet() {
  try {
    const output = childProcess.execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const paths = new Set();
    for (const line of output.split('\n')) {
      for (const file of _parseGitStatusPaths(line)) {
        if (file) paths.add(file);
      }
    }
    return paths;
  } catch (_) {
    return null;
  }
}

function _parseGitStatusPaths(line) {
  if (!line || typeof line !== 'string') return [];
  const rawPath = line.slice(3).trim();
  if (!rawPath) return [];
  if (rawPath.includes(' -> ')) {
    return rawPath.split(' -> ').map(_stripGitStatusQuotes).filter(Boolean);
  }
  return [_stripGitStatusQuotes(rawPath)].filter(Boolean);
}

function _stripGitStatusQuotes(value) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed;
  }
  return trimmed
    .slice(1, -1)
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
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
 * Format the loud direct stderr block for auto-commit ignore-filter events.
 * Emitted via process.stderr.write (bypassing reporter dedup/buffering) on
 * every iteration where paths_ignored_filtered or all_paths_ignored fires.
 * (task 5.1 — surface-autocommit-ignore-warning-and-watchdog)
 *
 * @param {number} iteration
 * @param {{ type: string, ignoredPaths: string[] }} anomaly
 * @returns {string}
 */
function _formatAutoCommitIgnoreBlock(iteration, anomaly) {
  const SEP = '================================================================================\n';
  const pathLines = (anomaly.ignoredPaths || []).map(p => `  - ${p}`).join('\n');
  return (
    SEP +
    `⚠ AUTO-COMMIT IGNORE FILTER FIRED  (iteration ${iteration}, type: ${anomaly.type})\n` +
    `Paths filtered because .gitignore matches:\n` +
    pathLines + '\n' +
    `Consequence: these paths are NOT in the latest commit.\n` +
    `Remediation (pick one):\n` +
    `  1. git add -f <path>   # one-time unblock, if you want it tracked\n` +
    `  2. edit .gitignore     # narrow or remove the matching rule\n` +
    `  3. pass --no-auto-commit on the ralph-run invocation\n` +
    SEP
  );
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
  const { completedTasks = [], filesToStage = [], tasksFile = null, verbose = false, reporter = null } = opts;
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

  const { kept: keptPaths, dropped: droppedPaths } = _filterGitignored(filesToStage, process.cwd());

  if (droppedPaths.length > 0) {
    const pathWord = droppedPaths.length === 1 ? 'path' : 'paths';
    const allIgnored = keptPaths.length === 0;
    const warnLines = allIgnored
      ? [
          `auto-commit iter ${iteration} skipped: all ${droppedPaths.length} ${pathWord} are gitignored`,
          ...droppedPaths.map(p => `  - ${p}`),
          '  hint: `git add -f <path>` once, or adjust .gitignore',
        ].join('\n')
      : [
          `auto-commit iter ${iteration}: filtered ${droppedPaths.length} gitignored ${pathWord}, committing ${keptPaths.length} ${keptPaths.length === 1 ? 'other' : 'others'}`,
          ...droppedPaths.map(p => `  - ${p}`),
        ].join('\n');
    if (reporter) {
      reporter.note(warnLines, 'error');
    } else {
      const fallbackMsg = allIgnored
        ? `Auto-commit skipped: all paths are gitignored: ${droppedPaths.join(', ')}`
        : `Auto-commit filtered gitignored paths: ${droppedPaths.join(', ')}`;
      process.stderr.write(`[mini-ralph] warning: ${fallbackMsg}\n`);
    }
    if (allIgnored) {
      const anomaly = {
        type: 'all_paths_ignored',
        message: `Auto-commit skipped: all paths are gitignored: ${droppedPaths.join(', ')}`,
        ignoredPaths: droppedPaths,
      };
      // task 5.1: emit loud direct stderr block, bypassing reporter dedup/buffering
      process.stderr.write(_formatAutoCommitIgnoreBlock(iteration, anomaly));
      return {
        attempted: true,
        committed: false,
        anomaly,
      };
    }
  }

  const stagePaths = droppedPaths.length > 0 ? keptPaths : filesToStage;

  try {
    // Use `git add -A -- <paths>` (not plain `git add -- <paths>`) so deletions
    // and renames are staged alongside modifications/additions. Tasks that call
    // `git rm` via a shell tool leave the path absent from the working tree but
    // still present in `git status --porcelain`, which means the plain form
    // would error with `fatal: pathspec did not match`. Scoping to the per-path
    // allowlist preserves the protected-artifact guarantee.
    childProcess.execFileSync('git', ['add', '-A', '--', ...stagePaths], {
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
    if (droppedPaths.length > 0) {
      const anomaly = {
        type: 'paths_ignored_filtered',
        message: 'Auto-commit succeeded but filtered gitignored paths: ' + droppedPaths.join(', '),
        ignoredPaths: droppedPaths,
      };
      // task 5.1: emit loud direct stderr block, bypassing reporter dedup/buffering
      process.stderr.write(_formatAutoCommitIgnoreBlock(iteration, anomaly));
      return {
        attempted: true,
        committed: true,
        anomaly,
      };
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
 * Filter gitignored paths out of a list using `git check-ignore --stdin`.
 *
 * Exit-code semantics of `git check-ignore`:
 *   0  – at least one path is ignored; stdout lists the ignored paths.
 *   1  – no paths are ignored (Node's execFileSync throws; we catch status===1).
 *   other / ENOENT / any thrown error – fallback: treat all paths as kept.
 *
 * @param {string[]} paths - Repo-relative paths to test.
 * @param {string}   cwd   - Working directory for the git command.
 * @returns {{ kept: string[], dropped: string[] }}
 */
function _filterGitignored(paths, cwd) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return { kept: [], dropped: [] };
  }

  try {
    const stdout = childProcess.execFileSync(
      'git',
      ['check-ignore', '--stdin'],
      {
        input: paths.join('\n'),
        cwd: cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf8',
      }
    );

    // Exit code 0: stdout lists ignored paths (one per line).
    const dropped = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const droppedSet = new Set(dropped);
    const kept = paths.filter((p) => !droppedSet.has(p));
    return { kept, dropped };
  } catch (err) {
    // exit status 1 means "no paths ignored" — treat as success with no drops.
    if (err && err.status === 1) {
      return { kept: paths.slice(), dropped: [] };
    }
    // Any other error (ENOENT, unexpected exit code, etc.) — fallback, never crash.
    return { kept: paths.slice(), dropped: [] };
  }
}

function _mergePathLists(...lists) {
  const merged = new Set();
  for (const list of lists) {
    for (const file of list || []) {
      const relativeFile = _repoRelativePath(file);
      if (relativeFile) {
        merged.add(relativeFile);
      }
    }
  }
  return Array.from(merged);
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
 * The subject line (first line) is kept short — conventional git tooling
 * assumes ~50–72 characters — so `git log --oneline` stays readable even when
 * the underlying task description is a multi-sentence normative blob. The
 * full, untruncated task descriptions are preserved in the commit body.
 *
 * @param {number} iteration
 * @param {Array<object>} completedTasks
 * @returns {string}
 */
function _formatAutoCommitMessage(iteration, completedTasks) {
  if (!Array.isArray(completedTasks) || completedTasks.length === 0) {
    return '';
  }

  const rawSummary = completedTasks.length === 1
    ? completedTasks[0].description
    : `complete ${completedTasks.length} tasks`;

  const prefix = `Ralph iteration ${iteration}: `;
  const subjectBudget = Math.max(20, SUBJECT_MAX_LENGTH - prefix.length);
  const summary = _truncateSubjectSummary(rawSummary, subjectBudget);

  const taskLines = completedTasks.map(
    (task) => `- [x] ${task.fullDescription || task.description}`
  );

  return `${prefix}${summary}\n\nTasks completed:\n${taskLines.join('\n')}`;
}

const SUBJECT_MAX_LENGTH = 72;

/**
 * Reduce a task description to a short, single-line commit subject.
 *
 * Strategy:
 *   1. Collapse whitespace onto a single line.
 *   2. Prefer the first sentence (up to `.`, `!`, `?`) when it is not itself
 *      longer than the allowed budget.
 *   3. Otherwise hard-truncate at a word boundary and append an ellipsis.
 *
 * @param {string} text
 * @param {number} budget
 * @returns {string}
 */
function _truncateSubjectSummary(text, budget) {
  const oneLine = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (oneLine.length === 0) return '';
  if (oneLine.length <= budget) return oneLine;

  const sentenceMatch = oneLine.match(/^(.+?[.!?])(\s|$)/);
  if (sentenceMatch) {
    const candidate = sentenceMatch[1].trim();
    if (candidate.length > 0 && candidate.length <= budget) {
      return candidate;
    }
  }

  const ellipsis = '…';
  const hardBudget = Math.max(1, budget - ellipsis.length);
  const sliced = oneLine.slice(0, hardBudget);
  const lastSpace = sliced.lastIndexOf(' ');
  const cut = lastSpace > Math.floor(hardBudget / 2) ? sliced.slice(0, lastSpace) : sliced;
  return `${cut.replace(/[\s,;:.!?-]+$/, '')}${ellipsis}`;
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
