'use strict';

/**
 * Unit tests for lib/mini-ralph/runner.js
 *
 * Tests the helper functions exported by runner.js using dependency injection
 * for the invoker so no real OpenCode process is spawned.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// We require runner internals directly
const {
  _containsPromise,
  _validateOptions,
  _resolveStartIteration,
  run,
} = require('../../../lib/mini-ralph/runner');

const state = require('../../../lib/mini-ralph/state');
const history = require('../../../lib/mini-ralph/history');
const context = require('../../../lib/mini-ralph/context');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-runner-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// _containsPromise
// ---------------------------------------------------------------------------

describe('_containsPromise()', () => {
  test('returns true when the exact promise tag is present', () => {
    expect(_containsPromise('<promise>COMPLETE</promise>', 'COMPLETE')).toBe(true);
  });

  test('returns true for task promise', () => {
    expect(
      _containsPromise('some output\n<promise>READY_FOR_NEXT_TASK</promise>\nmore', 'READY_FOR_NEXT_TASK')
    ).toBe(true);
  });

  test('returns false when promise tag is absent', () => {
    expect(_containsPromise('no promise here', 'COMPLETE')).toBe(false);
  });

  test('returns false for partial match without closing tag', () => {
    expect(_containsPromise('<promise>COMPLETE', 'COMPLETE')).toBe(false);
  });

  test('returns false when text is empty', () => {
    expect(_containsPromise('', 'COMPLETE')).toBe(false);
  });

  test('returns false when text is null', () => {
    expect(_containsPromise(null, 'COMPLETE')).toBe(false);
  });

  test('returns false when promiseName is empty', () => {
    expect(_containsPromise('<promise>COMPLETE</promise>', '')).toBe(false);
  });

  test('is case-sensitive', () => {
    expect(_containsPromise('<promise>complete</promise>', 'COMPLETE')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _validateOptions
// ---------------------------------------------------------------------------

describe('_validateOptions()', () => {
  function baseOptions() {
    return {
      ralphDir: '/some/dir',
      promptText: 'do the thing',
      maxIterations: 5,
      minIterations: 1,
    };
  }

  test('does not throw for valid options', () => {
    expect(() => _validateOptions(baseOptions())).not.toThrow();
  });

  test('throws when ralphDir is missing', () => {
    const opts = baseOptions();
    delete opts.ralphDir;
    expect(() => _validateOptions(opts)).toThrow(/ralphDir is required/);
  });

  test('throws when neither promptFile nor promptText is provided', () => {
    const opts = baseOptions();
    delete opts.promptText;
    expect(() => _validateOptions(opts)).toThrow(/promptFile or options.promptText is required/);
  });

  test('throws when both promptFile and promptText are provided', () => {
    const opts = baseOptions();
    opts.promptFile = '/path/to/file.md';
    expect(() => _validateOptions(opts)).toThrow(/not both/);
  });

  test('throws when maxIterations is not a positive integer', () => {
    const opts = baseOptions();
    opts.maxIterations = 0;
    expect(() => _validateOptions(opts)).toThrow(/maxIterations must be a positive integer/);
  });

  test('throws when maxIterations is negative', () => {
    const opts = baseOptions();
    opts.maxIterations = -3;
    expect(() => _validateOptions(opts)).toThrow(/maxIterations must be a positive integer/);
  });

  test('throws when minIterations is not a positive integer', () => {
    const opts = baseOptions();
    opts.minIterations = 0;
    expect(() => _validateOptions(opts)).toThrow(/minIterations must be a positive integer/);
  });

  test('throws when minIterations > maxIterations', () => {
    const opts = baseOptions();
    opts.minIterations = 10;
    opts.maxIterations = 5;
    expect(() => _validateOptions(opts)).toThrow(/minIterations must be <= options.maxIterations/);
  });

  test('accepts equal min and max iterations', () => {
    const opts = baseOptions();
    opts.minIterations = 3;
    opts.maxIterations = 3;
    expect(() => _validateOptions(opts)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// _resolveStartIteration
// ---------------------------------------------------------------------------

describe('_resolveStartIteration()', () => {
  test('returns 1 when existingState is null', () => {
    expect(_resolveStartIteration(null, {})).toBe(1);
  });

  test('returns 1 when existingState has no iteration', () => {
    expect(_resolveStartIteration({}, {})).toBe(1);
  });

  test('returns 1 when existingState.iteration is 0', () => {
    expect(_resolveStartIteration({ iteration: 0 }, {})).toBe(1);
  });

  test('returns priorIteration + 1 for a basic resume', () => {
    expect(_resolveStartIteration({ iteration: 4 }, {})).toBe(5);
  });

  test('resumes correctly in tasks mode when tasksFile matches', () => {
    const existingState = { iteration: 3, tasksFile: '/path/to/tasks.md' };
    const options = { tasksMode: true, tasksFile: '/path/to/tasks.md' };
    expect(_resolveStartIteration(existingState, options)).toBe(4);
  });

  test('returns 1 when in tasks mode but tasksFile differs', () => {
    const existingState = { iteration: 7, tasksFile: '/old/tasks.md' };
    const options = { tasksMode: true, tasksFile: '/new/tasks.md' };
    expect(_resolveStartIteration(existingState, options)).toBe(1);
  });

  test('resumes in tasks mode when prior state has no tasksFile (permissive)', () => {
    // priorTasksFile is null — no conflict to detect, resume is allowed
    const existingState = { iteration: 2, tasksFile: null };
    const options = { tasksMode: true, tasksFile: '/path/to/tasks.md' };
    expect(_resolveStartIteration(existingState, options)).toBe(3);
  });

  test('ignores tasksFile check when not in tasks mode', () => {
    const existingState = { iteration: 5, tasksFile: '/some/tasks.md' };
    const options = { tasksMode: false, tasksFile: '/different/tasks.md' };
    // Without tasksMode the file comparison is skipped, resume proceeds
    expect(_resolveStartIteration(existingState, options)).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// run() — with mocked invoker
// ---------------------------------------------------------------------------

describe('run() with mocked invoker', () => {
  /**
   * Temporarily replace the invoker module's invoke function.
   * Returns a restore function.
   */
  function mockInvoker(invokerModule, mockFn) {
    const original = invokerModule.invoke;
    invokerModule.invoke = mockFn;
    return () => { invokerModule.invoke = original; };
  }

  const invoker = require('../../../lib/mini-ralph/invoker');

  function makeOptions(overrides = {}) {
    return Object.assign(
      {
        ralphDir: path.join(tmpDir, '.ralph'),
        promptText: 'Do the thing.',
        maxIterations: 3,
        minIterations: 1,
      },
      overrides
    );
  }

  test('runs until max iterations when no completion promise is emitted', async () => {
    const restore = mockInvoker(invoker, async () => ({
      stdout: 'no promise here',
      exitCode: 0,
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      const result = await run(makeOptions());
      expect(result.completed).toBe(false);
      expect(result.iterations).toBe(3);
      expect(result.exitReason).toBe('max_iterations');
    } finally {
      restore();
    }
  });

  test('exits early when completion promise is detected', async () => {
    let callCount = 0;
    const restore = mockInvoker(invoker, async () => {
      callCount++;
      return {
        stdout: callCount >= 2 ? '<promise>COMPLETE</promise>' : 'not done',
        exitCode: 0,
        filesChanged: [],
        toolUsage: [],
      };
    });

    try {
      const result = await run(makeOptions({ maxIterations: 10 }));
      expect(result.completed).toBe(true);
      expect(result.iterations).toBe(2);
      expect(result.exitReason).toBe('completion_promise');
    } finally {
      restore();
    }
  });

  test('respects minIterations — does not complete before min', async () => {
    const restore = mockInvoker(invoker, async () => ({
      stdout: '<promise>COMPLETE</promise>',
      exitCode: 0,
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      const result = await run(makeOptions({ minIterations: 3, maxIterations: 5 }));
      // completion detected every iteration, but must run at least 3
      expect(result.completed).toBe(true);
      expect(result.iterations).toBe(3);
    } finally {
      restore();
    }
  });

  test('writes state file in ralphDir', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const restore = mockInvoker(invoker, async () => ({
      stdout: '',
      exitCode: 0,
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      await run(makeOptions({ ralphDir, maxIterations: 1 }));
      const stateFile = state.statePath(ralphDir);
      expect(fs.existsSync(stateFile)).toBe(true);
      const parsed = state.read(ralphDir);
      expect(parsed.active).toBe(false); // inactive after loop ends
    } finally {
      restore();
    }
  });

  test('appends history entries for each iteration', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    let iter = 0;
    const restore = mockInvoker(invoker, async () => {
      iter++;
      return { stdout: '', exitCode: 0, filesChanged: [], toolUsage: [] };
    });

    try {
      await run(makeOptions({ ralphDir, maxIterations: 3 }));
      const entries = history.recent(ralphDir, 10);
      expect(entries.length).toBe(3);
    } finally {
      restore();
    }
  });

  test('injects pending context into prompt', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir, { recursive: true });
    context.add(ralphDir, 'extra guidance here');

    const prompts = [];
    const restore = mockInvoker(invoker, async (opts) => {
      prompts.push(opts.prompt);
      return { stdout: '<promise>COMPLETE</promise>', exitCode: 0, filesChanged: [], toolUsage: [] };
    });

    try {
      await run(makeOptions({ ralphDir, maxIterations: 1 }));
      expect(prompts[0]).toContain('extra guidance here');
      expect(prompts[0]).toContain('Injected Context');
    } finally {
      restore();
    }
  });

  test('consumes context after first iteration (not re-injected)', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir, { recursive: true });
    context.add(ralphDir, 'one-shot context');

    const prompts = [];
    let iter = 0;
    const restore = mockInvoker(invoker, async (opts) => {
      iter++;
      prompts.push(opts.prompt);
      return { stdout: '', exitCode: 0, filesChanged: [], toolUsage: [] };
    });

    try {
      await run(makeOptions({ ralphDir, maxIterations: 2 }));
      expect(prompts[0]).toContain('one-shot context');
      expect(prompts[1]).not.toContain('one-shot context');
    } finally {
      restore();
    }
  });

  test('sets resumedAt in state when resuming from prior iteration', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    // Seed a prior state simulating iteration 2 having completed
    fs.mkdirSync(ralphDir, { recursive: true });
    state.init(ralphDir, { active: false, iteration: 2 });

    const restore = mockInvoker(invoker, async () => ({
      stdout: '',
      exitCode: 0,
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      await run(makeOptions({ ralphDir, maxIterations: 5 }));
      const s = state.read(ralphDir);
      expect(s.resumedAt).not.toBeNull();
      expect(s.resumedAt).toBeDefined();
    } finally {
      restore();
    }
  });
});
