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
  _completedTaskDelta,
  _buildAutoCommitAllowlist,
  _formatAutoCommitMessage,
  _buildIterationFeedback,
  _extractErrorForIteration,
  _getCurrentTaskDescription,
  run,
} = require('../../../lib/mini-ralph/runner');

const state = require('../../../lib/mini-ralph/state');
const history = require('../../../lib/mini-ralph/history');
const context = require('../../../lib/mini-ralph/context');
const errors = require('../../../lib/mini-ralph/errors');
const invokerHelpers = require('../../../lib/mini-ralph/invoker');

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

describe('invoker helpers', () => {
  test('_looksLikeCliHelp detects CLI help output', () => {
    expect(
      invokerHelpers._looksLikeCliHelp(
        'opencode run [message..]\n\nrun opencode with a message\n\nPositionals:\n  message  message to send\n\nOptions:\n  -h, --help'
      )
    ).toBe(true);
    expect(invokerHelpers._looksLikeCliHelp('normal output')).toBe(false);
  });

  test('_looksLikeCliHelp ignores help-like diff text later in output', () => {
    const output = [
      'Reviewing the current task first.',
      ...Array.from({ length: 45 }, (_, i) => `progress line ${i + 1}`),
      'diff --git a/tests/unit/javascript/mini-ralph-runner.test.js b/tests/unit/javascript/mini-ralph-runner.test.js',
      "+ expect(invokerHelpers._looksLikeCliHelp('Commands:\\nrun opencode with a message\\nOptions:\\nopencode run [message..]')).toBe(true);",
      '+ Positionals:',
      '<promise>READY_FOR_NEXT_TASK</promise>',
    ].join('\n');

    expect(invokerHelpers._looksLikeCliHelp(output)).toBe(false);
  });

  test('_extractToolUsage summarizes known tool names', () => {
    expect(invokerHelpers._extractToolUsage('Read\nBash\nRead\nTask')).toEqual([
      { tool: 'Read', count: 2 },
      { tool: 'Bash', count: 1 },
      { tool: 'Task', count: 1 },
    ]);
    expect(invokerHelpers._extractToolUsage('')).toEqual([]);
  });

  test('_diffSnapshots reports added and removed files', () => {
    const pre = new Set(['a.js', 'b.js']);
    const post = new Set(['b.js', 'c.js']);
    expect(invokerHelpers._diffSnapshots(pre, post).sort()).toEqual(['a.js', 'c.js']);
  });

  test('_gitSnapshot returns tracked changes and falls back to empty set on git errors', () => {
    jest.resetModules();
    jest.doMock('child_process', () => ({
      spawn: jest.fn(),
      execFileSync: jest.fn()
        .mockReturnValueOnce(' M lib/file.js\n?? new-file.js\n')
        .mockImplementationOnce(() => { throw new Error('git failed'); }),
    }));

    const isolatedInvoker = require('../../../lib/mini-ralph/invoker');

    expect(Array.from(isolatedInvoker._gitSnapshot()).sort()).toEqual(['lib/file.js', 'new-file.js']);
    expect(Array.from(isolatedInvoker._gitSnapshot())).toEqual([]);

    jest.dontMock('child_process');
  });

  test('_spawnOpenCode streams output and resolves exit code', async () => {
    jest.resetModules();
    const events = require('events');
    const stdout = new events.EventEmitter();
    const stderr = new events.EventEmitter();
    const child = new events.EventEmitter();
    child.stdout = stdout;
    child.stderr = stderr;

    const mockSpawn = jest.fn(() => child);
    jest.doMock('child_process', () => ({ spawn: mockSpawn, execFileSync: jest.fn() }));

    const isolatedInvoker = require('../../../lib/mini-ralph/invoker');
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      const pending = isolatedInvoker._spawnOpenCode(['run', 'prompt'], false);
      stdout.emit('data', Buffer.from('hello'));
      stderr.emit('data', Buffer.from('warn'));
      child.emit('close', 2);

      await expect(pending).resolves.toEqual({ stdout: 'hello', stderr: 'warn', exitCode: 2 });
      expect(mockSpawn).toHaveBeenCalledWith('opencode', ['run', 'prompt'], expect.any(Object));
      expect(stdoutSpy).toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      jest.dontMock('child_process');
    }
  });

  test('_spawnOpenCode wraps startup errors', async () => {
    jest.resetModules();
    const events = require('events');
    const child = new events.EventEmitter();
    child.stdout = new events.EventEmitter();
    child.stderr = new events.EventEmitter();

    jest.doMock('child_process', () => ({ spawn: jest.fn(() => child), execFileSync: jest.fn() }));

    const isolatedInvoker = require('../../../lib/mini-ralph/invoker');

    try {
      const pending = isolatedInvoker._spawnOpenCode(['run', 'prompt'], false);
      child.emit('error', Object.assign(new Error('missing'), { code: 'ENOENT' }));
      await expect(pending).rejects.toThrow(/opencode CLI not found/);

      const child2 = new events.EventEmitter();
      child2.stdout = new events.EventEmitter();
      child2.stderr = new events.EventEmitter();
      jest.resetModules();
      jest.doMock('child_process', () => ({ spawn: jest.fn(() => child2), execFileSync: jest.fn() }));
      const isolatedInvoker2 = require('../../../lib/mini-ralph/invoker');
      const pending2 = isolatedInvoker2._spawnOpenCode(['run', 'prompt'], false);
      child2.emit('error', new Error('boom'));
      await expect(pending2).rejects.toThrow(/failed to start opencode: boom/);
    } finally {
      jest.dontMock('child_process');
    }
  });

  test('invoke validates prompt, handles verbose logging, help output, and returns tool usage', async () => {
    await expect(invokerHelpers.invoke({ prompt: '   ' })).rejects.toThrow(/prompt is empty/);

    jest.resetModules();
    const events = require('events');
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const child = new events.EventEmitter();
    child.stdout = new events.EventEmitter();
    child.stderr = new events.EventEmitter();
    const mockExec = jest.fn()
      .mockReturnValueOnce(' M a.js\n')
      .mockReturnValueOnce(' M a.js\n?? b.js\n');
    const mockSpawn = jest.fn(() => child);
    jest.doMock('child_process', () => ({ spawn: mockSpawn, execFileSync: mockExec }));
    const isolatedInvoker = require('../../../lib/mini-ralph/invoker');

    try {
      const pending = isolatedInvoker.invoke({ prompt: 'Hello', model: 'gpt', verbose: true });
      child.stdout.emit('data', Buffer.from('Read\n<promise>COMPLETE</promise>'));
      child.emit('close', 0);

      await expect(pending).resolves.toEqual({
        stdout: 'Read\n<promise>COMPLETE</promise>',
        stderr: '',
        exitCode: 0,
        toolUsage: [{ tool: 'Read', count: 1 }],
        filesChanged: ['b.js'],
      });
      expect(mockSpawn).toHaveBeenCalledWith('opencode', ['run', '--model', 'gpt', 'Hello'], expect.any(Object));
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('invoking: opencode run --model gpt <prompt>'));

      jest.resetModules();
      const helpChild = new events.EventEmitter();
      helpChild.stdout = new events.EventEmitter();
      helpChild.stderr = new events.EventEmitter();
      jest.doMock('child_process', () => ({
        spawn: jest.fn(() => helpChild),
        execFileSync: jest.fn().mockReturnValue(''),
      }));
      const helpInvoker = require('../../../lib/mini-ralph/invoker');
      const helpPending = helpInvoker.invoke({ prompt: 'Hello' });
      helpChild.stdout.emit(
        'data',
        Buffer.from('opencode run [message..]\n\nrun opencode with a message\n\nPositionals:\n  message  message to send\n\nOptions:\n  -h, --help')
      );
      helpChild.emit('close', 0);
      await expect(helpPending).rejects.toThrow(/printed CLI help/);
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      jest.dontMock('child_process');
    }
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
// _completedTaskDelta
// ---------------------------------------------------------------------------

describe('_completedTaskDelta()', () => {
  test('returns tasks that became completed during the iteration', () => {
    const before = [
      { number: '1.1', description: 'First task', fullDescription: '1.1 First task', status: 'incomplete' },
      { number: '1.2', description: 'Done already', fullDescription: '1.2 Done already', status: 'completed' },
    ];
    const after = [
      { number: '1.1', description: 'First task', fullDescription: '1.1 First task', status: 'completed' },
      { number: '1.2', description: 'Done already', fullDescription: '1.2 Done already', status: 'completed' },
    ];

    expect(_completedTaskDelta(before, after)).toEqual([
      { number: '1.1', description: 'First task', fullDescription: '1.1 First task', status: 'completed' },
    ]);
  });

  test('returns empty array when no new tasks were completed', () => {
    const before = [
      { number: '1.1', description: 'Done already', fullDescription: '1.1 Done already', status: 'completed' },
    ];
    const after = [
      { number: '1.1', description: 'Done already', fullDescription: '1.1 Done already', status: 'completed' },
    ];

    expect(_completedTaskDelta(before, after)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// _buildAutoCommitAllowlist
// ---------------------------------------------------------------------------

describe('_buildAutoCommitAllowlist()', () => {
  test('includes current iteration files and the completed task-state update', () => {
    const tasksFile = path.join(process.cwd(), 'openspec/change/tasks.md');

    expect(
      _buildAutoCommitAllowlist(
        ['src/app.js', 'openspec/change/tasks.md'],
        [{ number: '1.2', description: 'Task', fullDescription: '1.2 Task', status: 'completed' }],
        tasksFile
      ).sort()
    ).toEqual(['openspec/change/tasks.md', 'src/app.js']);
  });

  test('adds tasks file even if invoker did not report it in filesChanged', () => {
    const tasksFile = path.join(process.cwd(), 'openspec/change/tasks.md');

    expect(
      _buildAutoCommitAllowlist(
        ['src/app.js'],
        [{ number: '1.2', description: 'Task', fullDescription: '1.2 Task', status: 'completed' }],
        tasksFile
      ).sort()
    ).toEqual(['openspec/change/tasks.md', 'src/app.js']);
  });

  test('ignores files outside the current repo', () => {
    expect(
      _buildAutoCommitAllowlist(
        ['/tmp/outside.txt', 'src/app.js'],
        [{ number: '1.2', description: 'Task', fullDescription: '1.2 Task', status: 'completed' }],
        '/tmp/outside-tasks.md'
      )
    ).toEqual(['src/app.js']);
  });

  test('excludes unrelated dirty worktree files not attributed to the iteration', () => {
    const tasksFile = path.join(process.cwd(), 'openspec/change/tasks.md');

    expect(
      _buildAutoCommitAllowlist(
        ['src/current.js'],
        [{ number: '1.2', description: 'Task', fullDescription: '1.2 Task', status: 'completed' }],
        tasksFile
      ).sort()
    ).toEqual(['openspec/change/tasks.md', 'src/current.js']);
  });
});

// ---------------------------------------------------------------------------
// _formatAutoCommitMessage
// ---------------------------------------------------------------------------

describe('_formatAutoCommitMessage()', () => {
  test('formats a single-task Ralph commit message', () => {
    const message = _formatAutoCommitMessage(7, [
      {
        number: '2.1',
        description: 'Implement status dashboard',
        fullDescription: '2.1 Implement status dashboard',
        status: 'completed',
      },
    ]);

    expect(message).toContain('Ralph iteration 7: Implement status dashboard');
    expect(message).toContain('Tasks completed:');
    expect(message).toContain('- [x] 2.1 Implement status dashboard');
  });

  test('formats a multi-task Ralph commit message', () => {
    const message = _formatAutoCommitMessage(3, [
      {
        number: '1.1',
        description: 'Implement feature A',
        fullDescription: '1.1 Implement feature A',
        status: 'completed',
      },
      {
        number: '1.2',
        description: 'Add tests',
        fullDescription: '1.2 Add tests',
        status: 'completed',
      },
    ]);

    expect(message).toContain('Ralph iteration 3: complete 2 tasks');
    expect(message).toContain('- [x] 1.1 Implement feature A');
    expect(message).toContain('- [x] 1.2 Add tests');
  });

  test('returns empty string when there are no completed tasks', () => {
    expect(_formatAutoCommitMessage(2, [])).toBe('');
  });
});

// ---------------------------------------------------------------------------
// _buildIterationFeedback
// ---------------------------------------------------------------------------

describe('_buildIterationFeedback()', () => {
  test('summarizes recent failed or no-progress iterations', () => {
    const feedback = _buildIterationFeedback([
      { iteration: 2, exitCode: 1, filesChanged: [], completionDetected: false, taskDetected: false },
      { iteration: 3, exitCode: 0, filesChanged: [], completionDetected: false, taskDetected: false },
    ]);

    expect(feedback).toContain('Use these signals to avoid repeating the same failed approach');
    expect(feedback).toContain('Iteration 2: opencode exited with code 1');
    expect(feedback).toContain('Iteration 3: no files changed');
  });

  test('returns empty string when recent history looks healthy', () => {
    const feedback = _buildIterationFeedback([
      { iteration: 1, exitCode: 0, filesChanged: ['file.js'], completionDetected: false, taskDetected: true },
    ]);

    expect(feedback).toBe('');
  });

  test('includes error output when errorContent matches a failed iteration', () => {
    const errorContent = [{
      timestamp: '2026-04-11T16:30:00Z',
      iteration: 2,
      task: '1.1 Do something',
      exitCode: 1,
      stderr: 'TypeError: Cannot read property of undefined\n  at foo (bar.js:10:5)',
      stdout: 'some output',
    }];

    const feedback = _buildIterationFeedback([
      { iteration: 2, exitCode: 1, filesChanged: [], completionDetected: false, taskDetected: false },
    ], errorContent);

    expect(feedback).toContain('Iteration 2: opencode exited with code 1');
    expect(feedback).toContain('Error output:');
    expect(feedback).toContain('TypeError: Cannot read property of undefined');
    expect(feedback).toContain('stdout: some output');
  });

  test('does not include error output when no matching error entry exists', () => {
    const feedback = _buildIterationFeedback([
      { iteration: 5, exitCode: 1, filesChanged: [], completionDetected: false, taskDetected: false },
    ], '');

    expect(feedback).toContain('Iteration 5: opencode exited with code 1');
    expect(feedback).not.toContain('Error output:');
  });

  test('truncates stderr to 2000 chars and stdout to 500 chars', () => {
    const longStderr = 'x'.repeat(2500);
    const longStdout = 'y'.repeat(800);

    const errorContent = [{
      timestamp: '2026-04-11T16:30:00Z',
      iteration: 1,
      task: 'test',
      exitCode: 1,
      stderr: longStderr,
      stdout: longStdout,
    }];

    const feedback = _buildIterationFeedback([
      { iteration: 1, exitCode: 1, filesChanged: [], completionDetected: false, taskDetected: false },
    ], errorContent);

    expect(feedback).toContain('Error output:');
    const stderrPart = feedback.match(/Error output:\n  (.*)\n  stdout:/s);
    expect(stderrPart).toBeTruthy();
    expect(stderrPart[1].length).toBeLessThanOrEqual(2003);
  });

  test('backward compat: no errorContent = existing behavior', () => {
    const feedback = _buildIterationFeedback([
      { iteration: 2, exitCode: 1, filesChanged: [], completionDetected: false, taskDetected: false },
    ]);

    expect(feedback).toContain('Iteration 2: opencode exited with code 1');
    expect(feedback).not.toContain('Error output:');
  });
});

// ---------------------------------------------------------------------------
// _extractErrorForIteration
// ---------------------------------------------------------------------------

describe('_extractErrorForIteration()', () => {
  test('extracts stderr and stdout for a matching iteration', () => {
    const errorContent = [{
      timestamp: '2026-04-11T16:30:00Z',
      iteration: 3,
      task: 'test task',
      exitCode: 1,
      stderr: 'some error text',
      stdout: 'some output text',
    }];

    const result = _extractErrorForIteration(errorContent, 3);
    expect(result).not.toBeNull();
    expect(result.stderr).toBe('some error text');
    expect(result.stdout).toBe('some output text');
  });

  test('returns null when no matching iteration', () => {
    const errorContent = [{
      iteration: 2,
      exitCode: 1,
      stderr: 'error',
      stdout: '',
    }];

    expect(_extractErrorForIteration(errorContent, 5)).toBeNull();
  });

  test('returns null for empty errorContent', () => {
    expect(_extractErrorForIteration('', 1)).toBeNull();
    expect(_extractErrorForIteration(null, 1)).toBeNull();
  });

  test('truncates stderr to 2000 chars', () => {
    const longStderr = 'e'.repeat(2500);
    const errorContent = [{
      iteration: 1,
      exitCode: 1,
      stderr: longStderr,
      stdout: '',
    }];

    const result = _extractErrorForIteration(errorContent, 1);
    expect(result.stderr.length).toBe(2003);
    expect(result.stderr.endsWith('...')).toBe(true);
  });

  test('truncates stdout to 500 chars', () => {
    const longStdout = 'o'.repeat(800);
    const errorContent = [{
      iteration: 1,
      exitCode: 1,
      stderr: '',
      stdout: longStdout,
    }];

    const result = _extractErrorForIteration(errorContent, 1);
    expect(result.stdout.length).toBe(503);
    expect(result.stdout.endsWith('...')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// _getCurrentTaskDescription
// ---------------------------------------------------------------------------

describe('_getCurrentTaskDescription()', () => {
  test('returns first incomplete task description', () => {
    const tasks = [
      { description: 'Done', fullDescription: '1.1 Done', status: 'completed' },
      { description: 'Pending', fullDescription: '1.2 Pending', status: 'incomplete' },
    ];
    expect(_getCurrentTaskDescription(tasks)).toBe('1.2 Pending');
  });

  test('returns N/A for empty array', () => {
    expect(_getCurrentTaskDescription([])).toBe('N/A');
  });

  test('returns N/A for non-array', () => {
    expect(_getCurrentTaskDescription(null)).toBe('N/A');
  });

  test('returns N/A when all tasks are completed', () => {
    const tasks = [
      { description: 'Done', fullDescription: '1.1 Done', status: 'completed' },
    ];
    expect(_getCurrentTaskDescription(tasks)).toBe('N/A');
  });

  test('falls back to description when fullDescription absent', () => {
    const tasks = [
      { description: 'Pending task', status: 'incomplete' },
    ];
    expect(_getCurrentTaskDescription(tasks)).toBe('Pending task');
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

  test('syncs the managed tasks symlink in tasks mode', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const tasksFile = path.join(tmpDir, 'tasks.md');
    fs.writeFileSync(tasksFile, '- [ ] 1.1 Task one\n', 'utf8');
    const restore = mockInvoker(invoker, async () => ({
      stdout: '<promise>COMPLETE</promise>',
      exitCode: 0,
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      await run(makeOptions({ ralphDir, tasksMode: true, tasksFile, maxIterations: 1 }));
      const linkPath = path.join(ralphDir, 'ralph-tasks.md');
      expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
      expect(fs.realpathSync(linkPath)).toBe(fs.realpathSync(tasksFile));
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

  test('records completed task descriptions in history entries', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const tasksFile = path.join(tmpDir, 'tasks.md');
    fs.writeFileSync(tasksFile, '- [ ] 1.1 Task one\n', 'utf8');

    const restore = mockInvoker(invoker, async () => {
      fs.writeFileSync(tasksFile, '- [x] 1.1 Task one\n', 'utf8');
      return {
        stdout: '<promise>COMPLETE</promise>',
        exitCode: 0,
        filesChanged: [],
        toolUsage: [],
      };
    });

    try {
      await run(makeOptions({ ralphDir, tasksMode: true, tasksFile, maxIterations: 1 }));
      const entries = history.recent(ralphDir, 1);
      expect(entries[0].completedTasks).toEqual(['1.1 Task one']);
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

  test('renders the default runner-owned commit contract into the invoked prompt', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const templateFile = path.join(tmpDir, 'template.md');
    fs.writeFileSync(templateFile, '{{commit_contract}}', 'utf8');

    const prompts = [];
    const restore = mockInvoker(invoker, async (opts) => {
      prompts.push(opts.prompt);
      return { stdout: '<promise>COMPLETE</promise>', exitCode: 0, filesChanged: [], toolUsage: [] };
    });

    try {
      await run(makeOptions({ ralphDir, promptTemplate: templateFile, maxIterations: 1 }));
      expect(prompts[0]).toContain('Do not create git commits yourself');
      expect(prompts[0]).toContain('Ralph runner manages automatic task commits');
      expect(prompts[0]).not.toContain('Create a git commit');
    } finally {
      restore();
    }
  });

  test('renders an explicit no-commit contract into the invoked prompt', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const templateFile = path.join(tmpDir, 'template.md');
    fs.writeFileSync(templateFile, '{{commit_contract}}', 'utf8');

    const prompts = [];
    const restore = mockInvoker(invoker, async (opts) => {
      prompts.push(opts.prompt);
      return { stdout: '<promise>COMPLETE</promise>', exitCode: 0, filesChanged: [], toolUsage: [] };
    });

    try {
      await run(makeOptions({ ralphDir, promptTemplate: templateFile, maxIterations: 1, noCommit: true }));
      expect(prompts[0]).toContain('Do not create, amend, or finalize git commits in this run');
      expect(prompts[0]).toContain('`--no-commit` is active');
      expect(prompts[0]).toContain('Do not run `git add` or `git commit`');
      expect(prompts[0]).not.toContain('The Ralph runner manages automatic task commits');
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

  test('continues to the next iteration on task promise in tasks mode', async () => {
    const tasksFile = path.join(tmpDir, 'tasks.md');
    fs.writeFileSync(tasksFile, '- [ ] 1.1 Task one\n- [ ] 1.2 Task two\n', 'utf8');

    let callCount = 0;
    const restore = mockInvoker(invoker, async () => {
      callCount++;
      return {
        stdout: callCount === 1
          ? '<promise>READY_FOR_NEXT_TASK</promise>'
          : '<promise>COMPLETE</promise>',
        exitCode: 0,
        filesChanged: [],
        toolUsage: [],
      };
    });

    try {
      const result = await run(makeOptions({
        tasksMode: true,
        tasksFile,
        maxIterations: 2,
      }));
      expect(result.completed).toBe(true);
      expect(result.iterations).toBe(2);
    } finally {
      restore();
    }
  });

  test('injects recent loop signals into follow-up iterations', async () => {
    const prompts = [];
    let callCount = 0;
    const restore = mockInvoker(invoker, async (opts) => {
      callCount++;
      prompts.push(opts.prompt);

      if (callCount === 1) {
        return {
          stdout: 'no promise yet',
          exitCode: 1,
          filesChanged: [],
          toolUsage: [],
        };
      }

      return {
        stdout: '<promise>COMPLETE</promise>',
        exitCode: 0,
        filesChanged: ['done.js'],
        toolUsage: [],
      };
    });

    try {
      await run(makeOptions({ maxIterations: 2, noCommit: true }));
      expect(prompts[1]).toContain('## Recent Loop Signals');
      expect(prompts[1]).toContain('Iteration 1: opencode exited with code 1');
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

  test('logs a resume message in verbose mode', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir, { recursive: true });
    state.init(ralphDir, { active: false, iteration: 2 });

    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const restore = mockInvoker(invoker, async () => ({
      stdout: '<promise>COMPLETE</promise>',
      exitCode: 0,
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      await run(makeOptions({ ralphDir, maxIterations: 3, verbose: true }));
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('resuming from iteration 3'));
    } finally {
      restore();
      stderrSpy.mockRestore();
    }
  });

  test('writes error entry on non-zero exit code', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const restore = mockInvoker(invoker, async () => ({
      stdout: 'no promise',
      stderr: 'some error happened',
      exitCode: 1,
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      await run(makeOptions({ ralphDir, maxIterations: 1 }));
      const errorContent = errors.read(ralphDir, 3);
      expect(errorContent).toContain('Iteration: 1');
      expect(errorContent).toContain('Exit Code: 1');
      expect(errorContent).toContain('some error happened');
    } finally {
      restore();
    }
  });

  test('error content injected into next iteration prompt', async () => {
    const prompts = [];
    let callCount = 0;
    const restore = mockInvoker(invoker, async (opts) => {
      callCount++;
      prompts.push(opts.prompt);
      if (callCount === 1) {
        return {
          stdout: 'no promise',
          stderr: 'critical failure',
          exitCode: 1,
          filesChanged: [],
          toolUsage: [],
        };
      }
      return {
        stdout: '<promise>COMPLETE</promise>',
        exitCode: 0,
        filesChanged: ['done.js'],
        toolUsage: [],
      };
    });

    try {
      await run(makeOptions({ maxIterations: 2, noCommit: true }));
      expect(prompts[1]).toContain('## Recent Loop Signals');
      expect(prompts[1]).toContain('Error output:');
      expect(prompts[1]).toContain('critical failure');
    } finally {
      restore();
    }
  });

  test('errors archived and cleared on successful completion', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    let callCount = 0;
    const restore = mockInvoker(invoker, async () => {
      callCount++;
      if (callCount === 1) {
        return {
          stdout: 'no promise',
          stderr: 'some error',
          exitCode: 1,
          filesChanged: [],
          toolUsage: [],
        };
      }
      return {
        stdout: '<promise>COMPLETE</promise>',
        exitCode: 0,
        filesChanged: ['done.js'],
        toolUsage: [],
      };
    });

    try {
      await run(makeOptions({ ralphDir, maxIterations: 2, noCommit: true }));
      expect(fs.existsSync(errors.errorsPath(ralphDir))).toBe(false);
      const archiveFiles = fs.readdirSync(ralphDir).filter((f) => f.startsWith('errors_') && f.endsWith('.md'));
      expect(archiveFiles.length).toBe(1);
    } finally {
      restore();
    }
  });

  test('archive failure warns, preserves active errors, and still marks loop inactive', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    let callCount = 0;
    const archiveSpy = jest.spyOn(errors, 'archive').mockImplementation(() => {
      throw new Error('disk full');
    });
    const clearSpy = jest.spyOn(errors, 'clear');
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const restore = mockInvoker(invoker, async () => {
      callCount++;
      if (callCount === 1) {
        return {
          stdout: 'no promise',
          stderr: 'some error',
          exitCode: 1,
          filesChanged: [],
          toolUsage: [],
        };
      }
      return {
        stdout: '<promise>COMPLETE</promise>',
        exitCode: 0,
        filesChanged: ['done.js'],
        toolUsage: [],
      };
    });

    try {
      const result = await run(makeOptions({ ralphDir, maxIterations: 2, noCommit: true }));
      expect(result.completed).toBe(true);
      expect(clearSpy).not.toHaveBeenCalled();
      expect(fs.existsSync(errors.errorsPath(ralphDir))).toBe(true);
      expect(fs.readdirSync(ralphDir).filter((f) => f.startsWith('errors_') && f.endsWith('.md'))).toEqual([]);
      expect(state.read(ralphDir).active).toBe(false);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('warning: failed to archive error history: disk full'));
    } finally {
      restore();
      archiveSpy.mockRestore();
      clearSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  test('clear failure warns, keeps active errors, preserves archive, and still marks loop inactive', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    let callCount = 0;
    const clearSpy = jest.spyOn(errors, 'clear').mockImplementation(() => {
      throw new Error('permission denied');
    });
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const restore = mockInvoker(invoker, async () => {
      callCount++;
      if (callCount === 1) {
        return {
          stdout: 'no promise',
          stderr: 'some error',
          exitCode: 1,
          filesChanged: [],
          toolUsage: [],
        };
      }
      return {
        stdout: '<promise>COMPLETE</promise>',
        exitCode: 0,
        filesChanged: ['done.js'],
        toolUsage: [],
      };
    });

    try {
      const result = await run(makeOptions({ ralphDir, maxIterations: 2, noCommit: true }));
      expect(result.completed).toBe(true);
      expect(fs.existsSync(errors.errorsPath(ralphDir))).toBe(true);
      const archiveFiles = fs.readdirSync(ralphDir).filter((f) => f.startsWith('errors_') && f.endsWith('.md'));
      expect(archiveFiles.length).toBe(1);
      expect(state.read(ralphDir).active).toBe(false);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('warning: failed to clear active error history: permission denied'));
    } finally {
      restore();
      clearSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  test('errors preserved on incomplete exit', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const restore = mockInvoker(invoker, async () => ({
      stdout: 'no promise',
      stderr: 'some error',
      exitCode: 1,
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      const result = await run(makeOptions({ ralphDir, maxIterations: 2 }));
      expect(result.completed).toBe(false);
      expect(fs.existsSync(errors.errorsPath(ralphDir))).toBe(true);
      const errorContent = errors.read(ralphDir, 10);
      expect(errorContent).toContain('Iteration: 1');
    } finally {
      restore();
    }
  });

  test('backward compat: no errors file when all iterations succeed', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const restore = mockInvoker(invoker, async () => ({
      stdout: 'no promise',
      exitCode: 0,
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      await run(makeOptions({ ralphDir, maxIterations: 2 }));
      expect(fs.existsSync(errors.errorsPath(ralphDir))).toBe(false);
    } finally {
      restore();
    }
  });

  test('uses N/A as task description in non-tasks mode', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const restore = mockInvoker(invoker, async () => ({
      stdout: 'no promise',
      stderr: 'err',
      exitCode: 1,
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      await run(makeOptions({ ralphDir, maxIterations: 1 }));
      const errorContent = errors.read(ralphDir, 3);
      expect(errorContent).toContain('Task: N/A');
    } finally {
      restore();
    }
  });

  test('uses current task description in tasks mode', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const tasksFile = path.join(tmpDir, 'tasks.md');
    fs.writeFileSync(tasksFile, '- [ ] 1.1 Task one\n', 'utf8');
    const restore = mockInvoker(invoker, async () => ({
      stdout: 'no promise',
      stderr: 'err',
      exitCode: 1,
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      await run(makeOptions({ ralphDir, tasksMode: true, tasksFile, maxIterations: 1 }));
      const errorContent = errors.read(ralphDir, 3);
      expect(errorContent).toContain('Task: 1.1 Task one');
    } finally {
      restore();
    }
  });

  test('uses only recent parsed error entries for prompt feedback lookup', async () => {
    const prompts = [];
    let callCount = 0;
    const restore = mockInvoker(invoker, async (opts) => {
      callCount++;
      prompts.push(opts.prompt);
      if (callCount <= 4) {
        return {
          stdout: 'no promise',
          stderr: `critical failure ${callCount}`,
          exitCode: 1,
          filesChanged: [],
          toolUsage: [],
        };
      }
      return {
        stdout: '<promise>COMPLETE</promise>',
        exitCode: 0,
        filesChanged: ['done.js'],
        toolUsage: [],
      };
    });

    try {
      await run(makeOptions({ maxIterations: 5, noCommit: true }));
      expect(prompts[4]).toContain('critical failure 4');
      expect(prompts[4]).not.toContain('critical failure 1');
    } finally {
      restore();
    }
  });
});
