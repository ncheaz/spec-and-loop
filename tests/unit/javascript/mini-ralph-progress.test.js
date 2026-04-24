'use strict';

/**
 * Unit tests for lib/mini-ralph/progress.js
 *
 * Covers the pure formatting helpers and the reporter's event-driven output.
 * Uses an in-memory stream so assertions can inspect exactly what would be
 * written to stderr, and uses NO_COLOR to keep the formatted output stable.
 */

const progress = require('../../../lib/mini-ralph/progress');

/**
 * Build a minimal writable stream that buffers every write for inspection.
 */
function makeBuffer() {
  const chunks = [];
  return {
    isTTY: false,
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    },
    lines() {
      return chunks.join('').split('\n').filter(Boolean);
    },
    text() {
      return chunks.join('');
    },
  };
}

const savedNoColor = process.env.NO_COLOR;
const savedForceColor = process.env.FORCE_COLOR;

beforeEach(() => {
  process.env.NO_COLOR = '1';
  delete process.env.FORCE_COLOR;
});

afterEach(() => {
  if (savedNoColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = savedNoColor;
  if (savedForceColor === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = savedForceColor;
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('progress helpers', () => {
  test('_formatDuration spans ms / s / m / h correctly', () => {
    expect(progress._formatDuration(0)).toBe('0ms');
    expect(progress._formatDuration(999)).toBe('999ms');
    expect(progress._formatDuration(1500)).toBe('1.5s');
    expect(progress._formatDuration(12345)).toBe('12s');
    expect(progress._formatDuration(95000)).toBe('1m 35s');
    expect(progress._formatDuration(60 * 60 * 1000 + 120 * 1000)).toBe('1h 02m');
  });

  test('_formatDuration coerces invalid input to 0ms', () => {
    expect(progress._formatDuration(null)).toBe('0ms');
    expect(progress._formatDuration(undefined)).toBe('0ms');
    expect(progress._formatDuration('not a number')).toBe('0ms');
    expect(progress._formatDuration(-500)).toBe('0ms');
  });

  test('_truncate shortens and adds a single ellipsis', () => {
    expect(progress._truncate('short', 20)).toBe('short');
    expect(progress._truncate('a'.repeat(30), 10)).toBe(`${'a'.repeat(9)}…`);
    expect(progress._truncate('', 10)).toBe('');
    expect(progress._truncate(null, 10)).toBe('');
  });

  test('_collapse flattens internal whitespace', () => {
    expect(progress._collapse('foo   bar\n\nbaz')).toBe('foo bar baz');
    expect(progress._collapse('   already   ')).toBe('already');
  });

  test('_detectColor respects NO_COLOR and TTY', () => {
    const noTty = { isTTY: false };
    const tty = { isTTY: true };
    process.env.NO_COLOR = '1';
    expect(progress._detectColor(tty)).toBe(false);
    delete process.env.NO_COLOR;
    expect(progress._detectColor(noTty)).toBe(false);
    expect(progress._detectColor(tty)).toBe(true);
  });

  test('_average handles zero iterations', () => {
    expect(progress._average({ iterations: 0, cumulativeMs: 999 })).toBe(0);
    expect(progress._average({ iterations: 4, cumulativeMs: 1000 })).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// Reporter behavior
// ---------------------------------------------------------------------------

describe('progress.create()', () => {
  test('emits a run header, per-iteration lines, and a run summary', () => {
    const buf = makeBuffer();
    let fakeNow = 1_000_000;
    const reporter = progress.create({
      stream: buf,
      maxIterations: 5,
      color: false,
      now: () => fakeNow,
    });

    reporter.runStarted({ tasksMode: true, model: 'composer-2-fast' });
    fakeNow += 1200;
    reporter.iterationStarted({
      iteration: 1,
      taskNumber: '1.1',
      taskDescription: 'Seed the harness',
    });
    fakeNow += 300;
    reporter.iterationFinished({
      iteration: 1,
      durationMs: 1500,
      outcome: 'success',
      committed: true,
      hasTask: true,
      completedTasksCount: 1,
      filesChangedCount: 3,
    });
    fakeNow += 800;
    reporter.iterationStarted({
      iteration: 2,
      taskNumber: '1.2',
      taskDescription: 'Run the probe',
    });
    fakeNow += 200;
    reporter.iterationFinished({
      iteration: 2,
      durationMs: 800,
      outcome: 'failure',
      failureReason: 'exit=1',
      stallStreak: 0,
    });
    fakeNow += 500;
    reporter.runFinished({ completed: false, exitReason: 'max_iterations' });

    const lines = buf.lines();

    expect(lines[0]).toMatch(/run started/);
    expect(lines[0]).toMatch(/mode=tasks/);
    expect(lines[0]).toMatch(/model=composer-2-fast/);
    expect(lines[0]).toMatch(/cap=5/);

    expect(lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/▶ iter 1\/5.*task 1\.1 Seed the harness/),
        expect.stringMatching(/✓ ok.*iter 1\/5.*committed.*next-task.*files\+=3.*tasks\+=1.*ok=1 fail=0/),
        expect.stringMatching(/▶ iter 2\/5.*task 1\.2 Run the probe/),
        expect.stringMatching(/✖ fail.*iter 2\/5.*exit=1.*ok=1 fail=1/),
        expect.stringMatching(/✗ run ended.*reason=max_iterations.*iterations=2.*ok=1.*fail=1.*tasks=1/),
      ])
    );
  });

  test('tracks stalled iterations separately from successes and failures', () => {
    const buf = makeBuffer();
    const reporter = progress.create({ stream: buf, color: false, maxIterations: 3 });

    reporter.iterationFinished({ iteration: 1, durationMs: 1000, outcome: 'stalled', stallStreak: 1 });
    reporter.iterationFinished({ iteration: 2, durationMs: 1000, outcome: 'stalled', stallStreak: 2 });
    reporter.iterationFinished({ iteration: 3, durationMs: 1000, outcome: 'success' });

    const snap = reporter.snapshot();
    expect(snap.iterations).toBe(3);
    expect(snap.stalled).toBe(2);
    expect(snap.successes).toBe(1);
    expect(snap.failures).toBe(0);
    expect(snap.averageMs).toBe(1000);

    const lines = buf.lines();
    expect(lines[0]).toMatch(/∅ stall.*stall-streak=1/);
    expect(lines[1]).toMatch(/∅ stall.*stall-streak=2/);
    expect(lines[2]).toMatch(/✓ ok/);
  });

  test('note() prefixes with the expected glyph per level', () => {
    const buf = makeBuffer();
    const reporter = progress.create({ stream: buf, color: false });

    reporter.note('regular info');
    reporter.note('heads up', 'warn');
    reporter.note('uh oh', 'error');

    const lines = buf.lines();
    expect(lines[0]).toMatch(/• regular info/);
    expect(lines[1]).toMatch(/! heads up/);
    expect(lines[2]).toMatch(/✖ uh oh/);
  });

  test('enabled=false silences every method', () => {
    const buf = makeBuffer();
    const reporter = progress.create({ stream: buf, enabled: false, color: false });

    reporter.runStarted({});
    reporter.iterationStarted({ iteration: 1 });
    reporter.iterationFinished({ iteration: 1, durationMs: 10, outcome: 'success' });
    reporter.note('hidden');
    reporter.runFinished({ completed: true, exitReason: 'completion_promise' });

    expect(buf.text()).toBe('');
    expect(reporter.snapshot().iterations).toBe(1);
  });

  test('FORCE_COLOR emits ANSI escape codes even without a TTY', () => {
    process.env.FORCE_COLOR = '1';
    delete process.env.NO_COLOR;
    const buf = makeBuffer();
    const reporter = progress.create({ stream: buf, maxIterations: 1 });
    reporter.iterationFinished({ iteration: 1, durationMs: 5, outcome: 'success' });
    expect(buf.text()).toMatch(/\u001b\[/);
  });

  test('counters increment even for malformed numeric input', () => {
    const buf = makeBuffer();
    const reporter = progress.create({ stream: buf, color: false });
    reporter.iterationFinished({
      iteration: 'x',
      durationMs: 'nope',
      outcome: 'success',
      completedTasksCount: 'zzz',
      filesChangedCount: null,
    });
    const snap = reporter.snapshot();
    expect(snap.iterations).toBe(1);
    expect(snap.cumulativeMs).toBe(0);
    expect(snap.completedTasks).toBe(0);
  });

  // -------------------------------------------------------------------------
  // iterationPromptReady and iterationResponseReceived
  // -------------------------------------------------------------------------

  test('iterationPromptReady and iterationResponseReceived exist on the reporter', () => {
    const reporter = progress.create({ stream: makeBuffer(), color: false });
    expect(typeof reporter.iterationPromptReady).toBe('function');
    expect(typeof reporter.iterationResponseReceived).toBe('function');
  });

  test('iterationPromptReady emits a line containing prompt= and a unit suffix for a 180 KB prompt', () => {
    const buf = makeBuffer();
    const reporter = progress.create({ stream: buf, color: false });
    const promptBytes = 180 * 1024; // 184320 bytes → should format as KB
    reporter.iterationPromptReady({
      iteration: 3,
      promptBytes,
      promptChars: promptBytes,
      promptTokens: Math.round(promptBytes / 4),
    });
    const line = buf.lines()[0];
    expect(line).toMatch(/prompt=/);
    expect(line).toMatch(/KB|MB/);
  });

  test('iterationResponseReceived emits a line containing response= without TRUNCATED when truncated is false', () => {
    const buf = makeBuffer();
    const reporter = progress.create({ stream: buf, color: false });
    reporter.iterationResponseReceived({
      iteration: 1,
      responseBytes: 4096,
      responseChars: 4096,
      responseTokens: 1024,
      truncated: false,
    });
    const line = buf.lines()[0];
    expect(line).toMatch(/response=/);
    expect(line).not.toMatch(/TRUNCATED/);
  });

  test('iterationResponseReceived prints TRUNCATED marker when truncated is true', () => {
    const buf = makeBuffer();
    const reporter = progress.create({ stream: buf, color: false });
    reporter.iterationResponseReceived({
      iteration: 2,
      responseBytes: 8192,
      responseChars: 8192,
      responseTokens: 2048,
      truncated: true,
    });
    const line = buf.lines()[0];
    expect(line).toMatch(/TRUNCATED/);
  });

  test('enabled=false silences iterationPromptReady and iterationResponseReceived', () => {
    const buf = makeBuffer();
    const reporter = progress.create({ stream: buf, enabled: false, color: false });
    reporter.iterationPromptReady({ iteration: 1, promptBytes: 1000, promptChars: 1000, promptTokens: 250 });
    reporter.iterationResponseReceived({ iteration: 1, responseBytes: 500, responseChars: 500, responseTokens: 125 });
    expect(buf.text()).toBe('');
  });
});
