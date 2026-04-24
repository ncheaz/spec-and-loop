'use strict';

/**
 * progress.js - Human-readable runtime progress reporter for the mini-ralph
 * loop.
 *
 * Responsible only for formatting and emitting a concise, live status stream
 * so an operator watching the loop can see, per iteration:
 *
 *   - iteration number / cap
 *   - current task number + short description
 *   - outcome (ok / stalled / failed / committed)
 *   - wall-clock duration for the iteration
 *   - rolling counters: successes, failures, commits, stall streak
 *   - cumulative + average per-iteration time
 *
 * Design choices:
 *   - Output goes to stderr so piping stdout elsewhere still works.
 *   - ANSI colors are used when the destination is a TTY and `NO_COLOR` is
 *     not set. Respects the de-facto `NO_COLOR` convention
 *     (https://no-color.org/).
 *   - Timestamps are local-time HH:MM:SS so an operator can correlate with
 *     wall-clock events without deciphering ISO strings.
 *   - All helpers are pure (no I/O) except for `emit`, which is the only
 *     function that writes to `stream`. This keeps the module trivially
 *     testable.
 */

const ANSI = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  bold: '\u001b[1m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m',
  cyan: '\u001b[36m',
  gray: '\u001b[90m',
};

/**
 * Build a progress reporter.
 *
 * @param {object} [opts]
 * @param {NodeJS.WritableStream} [opts.stream=process.stderr] Destination.
 * @param {boolean} [opts.enabled=true] Hard switch to silence all output.
 * @param {boolean} [opts.color] Force color on/off; otherwise auto-detect.
 * @param {number} [opts.maxIterations] Optional cap, shown as `i/max`.
 * @param {string} [opts.label='mini-ralph'] Short tag prefix.
 * @param {() => number} [opts.now=Date.now] Clock (injectable for tests).
 * @returns {object} reporter
 */
function create(opts = {}) {
  const stream = opts.stream || process.stderr;
  const enabled = opts.enabled !== false;
  const color = typeof opts.color === 'boolean' ? opts.color : _detectColor(stream);
  const maxIterations =
    typeof opts.maxIterations === 'number' && opts.maxIterations > 0
      ? opts.maxIterations
      : null;
  const label = typeof opts.label === 'string' ? opts.label : 'mini-ralph';
  const now = typeof opts.now === 'function' ? opts.now : Date.now;

  const runStart = now();
  const stats = {
    iterations: 0,
    successes: 0,
    failures: 0,
    stalled: 0,
    commits: 0,
    cumulativeMs: 0,
    completedTasks: 0,
  };

  /**
   * Emit a single formatted line. Always appends a trailing newline.
   */
  function emit(line) {
    if (!enabled) return;
    stream.write(line + '\n');
  }

  /**
   * Announce the loop start. Prints a single header line with the iteration
   * cap and (when provided) the model name.
   */
  function runStarted(meta = {}) {
    if (!enabled) return;
    const parts = [`${_tag(label, color)} ${_kw('run started', color, 'bold')}`];
    if (meta.tasksMode) parts.push(_dim('mode=tasks', color));
    if (meta.model) parts.push(_dim(`model=${meta.model}`, color));
    if (maxIterations) parts.push(_dim(`cap=${maxIterations}`, color));
    if (meta.resumed) parts.push(_dim(`resumed-from=${meta.resumed}`, color));
    parts.push(_dim(_clockStamp(new Date(runStart)), color));
    emit(parts.join(' '));
  }

  /**
   * Report the beginning of a single iteration.
   */
  function iterationStarted(info = {}) {
    if (!enabled) return;
    const iter = _iterLabel(info.iteration, maxIterations, color);
    const task = _taskLabel(info.taskNumber, info.taskDescription, color);
    const line = `${_tag(label, color)} ${_paint('▶', color, 'cyan')} ${iter}${task ? ' ' + task : ''}`;
    emit(line);
  }

  /**
   * Report the outcome of a single iteration and update rolling counters.
   *
   * @param {object} info
   * @param {number} info.iteration
   * @param {number} info.durationMs
   * @param {('success'|'failure'|'stalled')} info.outcome
   * @param {boolean} [info.committed]
   * @param {boolean} [info.hasCompletion]
   * @param {boolean} [info.hasTask]
   * @param {number}  [info.completedTasksCount]
   * @param {number}  [info.filesChangedCount]
   * @param {string}  [info.failureReason]
   * @param {number}  [info.stallStreak]
   */
  function iterationFinished(info = {}) {
    const duration = _coerceInt(info.durationMs, 0);
    stats.iterations += 1;
    stats.cumulativeMs += duration;
    stats.completedTasks += _coerceInt(info.completedTasksCount, 0);
    if (info.committed) stats.commits += 1;

    if (info.outcome === 'failure') stats.failures += 1;
    else if (info.outcome === 'stalled') stats.stalled += 1;
    else stats.successes += 1;

    if (!enabled) return;

    const iter = _iterLabel(info.iteration, maxIterations, color);
    const badge = _outcomeBadge(info.outcome, color);
    const timing = _paint(
      `${_formatDuration(duration)} (avg ${_formatDuration(_average(stats))} · total ${_formatDuration(stats.cumulativeMs)})`,
      color,
      'gray'
    );

    const fragments = [];
    if (info.committed) fragments.push(_paint('committed', color, 'green'));
    if (info.hasCompletion) fragments.push(_paint('COMPLETE', color, 'magenta'));
    else if (info.hasTask) fragments.push(_paint('next-task', color, 'cyan'));
    if (_coerceInt(info.filesChangedCount, 0) > 0) {
      fragments.push(_dim(`files+=${info.filesChangedCount}`, color));
    }
    if (_coerceInt(info.completedTasksCount, 0) > 0) {
      fragments.push(_dim(`tasks+=${info.completedTasksCount}`, color));
    }
    if (info.outcome === 'stalled' && _coerceInt(info.stallStreak, 0) > 0) {
      fragments.push(_dim(`stall-streak=${info.stallStreak}`, color));
    }
    if (info.outcome === 'failure' && info.failureReason) {
      fragments.push(_paint(_truncate(info.failureReason, 80), color, 'red'));
    }

    const counters = _paint(
      `ok=${stats.successes} fail=${stats.failures} stall=${stats.stalled} commits=${stats.commits}`,
      color,
      'gray'
    );

    const line = [
      _tag(label, color),
      badge,
      iter,
      fragments.length > 0 ? fragments.join(' ') : '',
      timing,
      counters,
    ]
      .filter(Boolean)
      .join(' ');
    emit(line);
  }

  /**
   * Emit a single line announcing that the iteration's prompt is ready to
   * be sent to the model, with size telemetry.
   *
   * @param {object} info
   * @param {number} info.iteration
   * @param {number} info.promptBytes
   * @param {number} info.promptChars
   * @param {number} info.promptTokens
   */
  function iterationPromptReady(info = {}) {
    if (!enabled) return;
    const iter = _iterLabel(info.iteration, maxIterations, color);
    const bytes = _coerceInt(info.promptBytes, 0);
    const chars = _coerceInt(info.promptChars, 0);
    const tokens = _coerceInt(info.promptTokens, 0);
    const size = _dim(`prompt=${_formatBytes(bytes)} chars=${chars} tokens≈${tokens}`, color);
    emit(`${_tag(label, color)} ${_paint('↑', color, 'blue')} ${iter} ${size}`);
  }

  /**
   * Emit a single line announcing that the model's response has been received,
   * with size telemetry. Prints a yellow TRUNCATED marker when truncated.
   *
   * @param {object} info
   * @param {number} info.iteration
   * @param {number} info.responseBytes
   * @param {number} info.responseChars
   * @param {number} info.responseTokens
   * @param {boolean} [info.truncated]
   */
  function iterationResponseReceived(info = {}) {
    if (!enabled) return;
    const iter = _iterLabel(info.iteration, maxIterations, color);
    const bytes = _coerceInt(info.responseBytes, 0);
    const chars = _coerceInt(info.responseChars, 0);
    const tokens = _coerceInt(info.responseTokens, 0);
    const size = _dim(`response=${_formatBytes(bytes)} chars=${chars} tokens≈${tokens}`, color);
    const parts = [`${_tag(label, color)} ${_paint('↓', color, 'blue')} ${iter} ${size}`];
    if (info.truncated) parts.push(_paint('TRUNCATED', color, 'yellow'));
    emit(parts.join(' '));
  }

  /**
   * Emit a one-off informational note (e.g. resume detected, stall halted).
   */
  function note(message, level = 'info') {
    if (!enabled || !message) return;
    const glyph =
      level === 'warn' ? _paint('!', color, 'yellow')
      : level === 'error' ? _paint('✖', color, 'red')
      : _paint('•', color, 'blue');
    emit(`${_tag(label, color)} ${glyph} ${message}`);
  }

  /**
   * Print the final summary line for the run.
   *
   * @param {object} outcome
   * @param {boolean} outcome.completed
   * @param {string}  outcome.exitReason
   * @param {number}  [outcome.iterations]
   */
  function runFinished(outcome = {}) {
    if (!enabled) return;
    const wall = now() - runStart;
    const ok = outcome.completed === true;
    const head = ok
      ? _paint('✓ run complete', color, 'green')
      : _paint('✗ run ended', color, 'yellow');
    const reason = outcome.exitReason ? ` reason=${outcome.exitReason}` : '';
    const avg = _average(stats);
    const body = [
      `iterations=${stats.iterations}`,
      `ok=${stats.successes}`,
      `fail=${stats.failures}`,
      `stall=${stats.stalled}`,
      `commits=${stats.commits}`,
      `tasks=${stats.completedTasks}`,
      `avg=${_formatDuration(avg)}`,
      `total=${_formatDuration(stats.cumulativeMs)}`,
      `wall=${_formatDuration(wall)}`,
    ].join(' ');

    emit(`${_tag(label, color)} ${head}${reason} ${_dim(body, color)}`);
  }

  /**
   * Snapshot of rolling stats. Exposed for tests and programmatic callers.
   */
  function snapshot() {
    return Object.assign({}, stats, { averageMs: _average(stats), wallMs: now() - runStart });
  }

  return {
    runStarted,
    iterationStarted,
    iterationPromptReady,
    iterationResponseReceived,
    iterationFinished,
    note,
    runFinished,
    snapshot,
    enabled,
  };
}

// ---------------------------------------------------------------------------
// Pure formatting helpers (exported for unit testing)
// ---------------------------------------------------------------------------

function _detectColor(stream) {
  if (process.env && process.env.NO_COLOR) return false;
  if (process.env && process.env.FORCE_COLOR) return true;
  if (!stream) return false;
  return Boolean(stream.isTTY);
}

function _tag(label, color) {
  return _paint(`[${label}]`, color, 'gray');
}

function _iterLabel(iteration, maxIterations, color) {
  const safeIter = _coerceInt(iteration, 0);
  const body = maxIterations ? `iter ${safeIter}/${maxIterations}` : `iter ${safeIter}`;
  return _paint(body, color, 'bold');
}

function _taskLabel(taskNumber, taskDescription, color) {
  const num = taskNumber && String(taskNumber).trim();
  const desc = taskDescription && String(taskDescription).trim();
  if (!num && !desc) return '';
  const head = num ? `task ${num}` : 'task';
  const tail = desc ? ` ${_truncate(_collapse(desc), 72)}` : '';
  return `${_paint(head, color, 'blue')}${_paint(tail, color, 'gray')}`;
}

function _outcomeBadge(outcome, color) {
  if (outcome === 'failure') return _paint('✖ fail', color, 'red');
  if (outcome === 'stalled') return _paint('∅ stall', color, 'yellow');
  return _paint('✓ ok', color, 'green');
}

function _kw(text, color, style) {
  return _paint(text, color, style);
}

function _dim(text, color) {
  return _paint(text, color, 'dim');
}

function _paint(text, color, style) {
  if (!color || !text) return text || '';
  const code = ANSI[style];
  if (!code) return text;
  return `${code}${text}${ANSI.reset}`;
}

/**
 * Format a millisecond duration as a short human string, e.g.
 *   850ms, 12.3s, 2m 04s, 1h 02m.
 */
function _formatDuration(ms) {
  const n = Math.max(0, _coerceInt(ms, 0));
  if (n < 1000) return `${n}ms`;
  const seconds = n / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const mins = Math.floor(seconds / 60);
  const remSec = Math.floor(seconds - mins * 60);
  if (mins < 60) return `${mins}m ${String(remSec).padStart(2, '0')}s`;
  const hours = Math.floor(mins / 60);
  const remMin = mins - hours * 60;
  return `${hours}h ${String(remMin).padStart(2, '0')}m`;
}

function _average(stats) {
  if (!stats || !stats.iterations) return 0;
  return Math.round(stats.cumulativeMs / stats.iterations);
}

function _truncate(text, budget) {
  const s = String(text == null ? '' : text);
  if (s.length <= budget) return s;
  const hard = Math.max(1, budget - 1);
  return `${s.slice(0, hard)}…`;
}

function _collapse(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function _coerceInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

/**
 * Format a byte count as a short human-readable string, e.g. 512B, 1.5KB, 2.3MB.
 */
function _formatBytes(bytes) {
  const n = Math.max(0, _coerceInt(bytes, 0));
  if (n < 1024) return `${n}B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
}

function _clockStamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

module.exports = {
  create,
  _formatDuration,
  _formatBytes,
  _truncate,
  _collapse,
  _detectColor,
  _average,
};
