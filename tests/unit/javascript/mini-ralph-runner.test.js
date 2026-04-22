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
  _detectProtectedCommitArtifacts,
  _gitErrorMessage,
  _isFailedIteration,
  _wasSuccessfulIteration,
  _failureFingerprint,
  _firstNonEmptyLine,
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
  jest.restoreAllMocks();
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

  test('returns true for a standalone promise line with surrounding whitespace', () => {
    expect(_containsPromise('  \t<promise>COMPLETE</promise>  ', 'COMPLETE')).toBe(true);
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

  test('returns false when the promise tag is quoted in prose', () => {
    expect(_containsPromise('Write `<promise>COMPLETE</promise>` when you finish.', 'COMPLETE')).toBe(false);
  });

  test('returns false when the promise tag appears in explanatory text', () => {
    expect(
      _containsPromise('The control line is <promise>COMPLETE</promise> once all tasks are done.', 'COMPLETE')
    ).toBe(false);
  });

  test('returns false when the promise tag appears in diff-like output', () => {
    expect(
      _containsPromise('+ <promise>COMPLETE</promise>\n- <promise>READY_FOR_NEXT_TASK</promise>', 'COMPLETE')
    ).toBe(false);
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

  test('_diffSnapshots reports added, removed, and re-fingerprinted files', () => {
    const pre = new Map([
      ['a.js', 'file:before-a'],
      ['b.js', 'file:before-b'],
    ]);
    const post = new Map([
      ['b.js', 'file:after-b'],
      ['c.js', 'file:new-c'],
    ]);
    expect(invokerHelpers._diffSnapshots(pre, post)).toEqual(['a.js', 'b.js', 'c.js']);
  });

  test('_gitSnapshot returns tracked changes with fingerprints and falls back to empty map on git errors', () => {
    jest.resetModules();
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'lib', 'file.js'), 'tracked change\n', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'new-file.js'), 'new file\n', 'utf8');
    jest.doMock('child_process', () => ({
      spawn: jest.fn(),
      execFileSync: jest.fn()
        .mockReturnValueOnce(' M lib/file.js\n?? new-file.js\n')
        .mockImplementationOnce(() => { throw new Error('git failed'); }),
    }));

    const isolatedInvoker = require('../../../lib/mini-ralph/invoker');

    expect(Array.from(isolatedInvoker._gitSnapshot().keys()).sort()).toEqual(['lib/file.js', 'new-file.js']);
    expect(Array.from(isolatedInvoker._gitSnapshot())).toEqual([]);

    cwdSpy.mockRestore();
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

      await expect(pending).resolves.toEqual({ stdout: 'hello', stderr: 'warn', exitCode: 2, signal: null });
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
        signal: null,
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

describe('_detectProtectedCommitArtifacts()', () => {
  test('detects protected proposal, design, and spec artifacts for the active change', () => {
    const tasksFile = path.join(process.cwd(), 'openspec/changes/demo/tasks.md');

    expect(
      _detectProtectedCommitArtifacts([
        'openspec/changes/demo/tasks.md',
        'openspec/changes/demo/proposal.md',
        'openspec/changes/demo/design.md',
        'openspec/changes/demo/specs/demo/spec.md',
        'src/app.js',
      ], tasksFile)
    ).toEqual([
      'openspec/changes/demo/proposal.md',
      'openspec/changes/demo/design.md',
      'openspec/changes/demo/specs/demo/spec.md',
    ]);
  });

  test('returns empty for unrelated paths or missing tasks file context', () => {
    expect(
      _detectProtectedCommitArtifacts(['openspec/changes/demo/proposal.md'], null)
    ).toEqual([]);

    expect(
      _detectProtectedCommitArtifacts([
        'openspec/changes/other/specs/demo/spec.md',
        'src/app.js',
      ], path.join(process.cwd(), 'openspec/changes/demo/tasks.md'))
    ).toEqual([]);
  });
});

describe('_gitErrorMessage()', () => {
  test('prefers stderr, then stdout, then message', () => {
    expect(_gitErrorMessage({ stderr: Buffer.from('stderr detail\n'), stdout: 'stdout detail', message: 'fallback' })).toBe('stderr detail');
    expect(_gitErrorMessage({ stderr: '', stdout: 'stdout detail', message: 'fallback' })).toBe('stdout detail');
    expect(_gitErrorMessage(new Error('fallback'))).toBe('fallback');
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
  test('summarizes recent failed iterations', () => {
    const feedback = _buildIterationFeedback([
      { iteration: 2, exitCode: 1, filesChanged: [], completionDetected: false, taskDetected: false },
      { iteration: 3, exitCode: 0, filesChanged: [], completionDetected: false, taskDetected: true },
    ]);

    expect(feedback).toContain('Use these signals to avoid repeating the same failed approach');
    expect(feedback).toContain('Iteration 2: opencode exited with code 1');
    // Iteration 3 had a task promise and exit 0 — no "no files changed" issue
    expect(feedback).not.toContain('Iteration 3: no files changed');
  });

  test('returns empty string for clean task-promise iteration with no files changed', () => {
    const feedback = _buildIterationFeedback([
      { iteration: 1, exitCode: 0, filesChanged: [], completionDetected: false, taskDetected: true },
    ]);

    expect(feedback).toBe('');
  });

  test('still returns feedback for failed iteration with no files changed', () => {
    const feedback = _buildIterationFeedback([
      { iteration: 1, exitCode: 1, signal: '', failureStage: 'invoke_contract', filesChanged: [], completionDetected: false, taskDetected: false },
    ]);

    expect(feedback).not.toBe('');
    expect(feedback).toContain('Iteration 1');
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

  test('includes signal and failure-stage metadata in failed iteration feedback', () => {
    const feedback = _buildIterationFeedback([
      { iteration: 2, exitCode: null, signal: 'SIGTERM', filesChanged: [], completionDetected: false, taskDetected: false },
      { iteration: 3, exitCode: null, signal: '', failureStage: 'prompt_render', filesChanged: [], completionDetected: false, taskDetected: false },
    ], [
      { iteration: 2, stderr: '---\n### stdout\nterminated by signal', stdout: 'partial output', signal: 'SIGTERM', failureStage: '' },
      { iteration: 3, stderr: 'template expansion failed', stdout: '', signal: '', failureStage: 'prompt_render' },
    ]);

    expect(feedback).toContain('Iteration 2: opencode exited via signal SIGTERM');
    expect(feedback).toContain('signal: SIGTERM');
    expect(feedback).toContain('---');
    expect(feedback).toContain('stdout: partial output');
    expect(feedback).toContain('Iteration 3: iteration aborted during prompt_render');
    expect(feedback).toContain('failure stage: prompt_render');
    expect(feedback).toContain('template expansion failed');
  });

  test('does not include error output when no matching error entry exists', () => {
    const feedback = _buildIterationFeedback([
      { iteration: 5, exitCode: 1, filesChanged: [], completionDetected: false, taskDetected: false },
    ], '');

    expect(feedback).toContain('Iteration 5: opencode exited with code 1');
    expect(feedback).not.toContain('Error output:');
  });

  test('truncates stderr to 500 chars and stdout to 200 chars in feedback', () => {
    const longStderr = 'x'.repeat(800);
    const longStdout = 'y'.repeat(400);

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
    expect(stderrPart[1].length).toBeLessThanOrEqual(503);
  });

  test('backward compat: no errorContent = existing behavior', () => {
    const feedback = _buildIterationFeedback([
      { iteration: 2, exitCode: 1, filesChanged: [], completionDetected: false, taskDetected: false },
    ]);

    expect(feedback).toContain('Iteration 2: opencode exited with code 1');
    expect(feedback).not.toContain('Error output:');
  });

  test('describes signal-terminated iterations as failures', () => {
    const feedback = _buildIterationFeedback([
      { iteration: 2, exitCode: null, signal: 'SIGTERM', filesChanged: [], completionDetected: false, taskDetected: false },
    ]);

    expect(feedback).toContain('Iteration 2: opencode exited via signal SIGTERM');
  });
});

describe('iteration outcome helpers', () => {
  test('_isFailedIteration returns true for non-zero exits and signal exits', () => {
    expect(_isFailedIteration({ exitCode: 1, signal: '' })).toBe(true);
    expect(_isFailedIteration({ exitCode: null, signal: 'SIGTERM' })).toBe(true);
    expect(_isFailedIteration({ exitCode: 0, signal: '' })).toBe(false);
  });

  test('_wasSuccessfulIteration only returns true for clean exits', () => {
    expect(_wasSuccessfulIteration({ exitCode: 0, signal: '' })).toBe(true);
    expect(_wasSuccessfulIteration({ exitCode: 1, signal: '' })).toBe(false);
    expect(_wasSuccessfulIteration({ exitCode: null, signal: 'SIGINT' })).toBe(false);
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

  test('uses the newest exact iteration match when duplicates exist', () => {
    const errorContent = [
      {
        iteration: 12,
        exitCode: 1,
        stderr: 'iteration twelve',
        stdout: '',
      },
      {
        iteration: 1,
        exitCode: 1,
        stderr: 'older iteration one',
        stdout: '',
      },
      {
        iteration: 1,
        exitCode: 2,
        stderr: 'newer iteration one',
        stdout: 'latest stdout',
      },
    ];

    expect(_extractErrorForIteration(errorContent, 1)).toEqual({
      stderr: 'newer iteration one',
      stdout: 'latest stdout',
      signal: '',
      failureStage: '',
    });
    expect(_extractErrorForIteration(errorContent, 12)).toEqual({
      stderr: 'iteration twelve',
      stdout: '',
      signal: '',
      failureStage: '',
    });
  });

  test('returns null for empty errorContent', () => {
    expect(_extractErrorForIteration('', 1)).toBeNull();
    expect(_extractErrorForIteration(null, 1)).toBeNull();
  });

  test('truncates stderr to 500 chars', () => {
    const longStderr = 'e'.repeat(1200);
    const errorContent = [{
      iteration: 1,
      exitCode: 1,
      stderr: longStderr,
      stdout: '',
    }];

    const result = _extractErrorForIteration(errorContent, 1);
    expect(result.stderr.length).toBe(503);
    expect(result.stderr.endsWith('...')).toBe(true);
  });

  test('preserves stderr when shorter than 500 chars', () => {
    const shortStderr = 'e'.repeat(400);
    const errorContent = [{
      iteration: 1,
      exitCode: 1,
      stderr: shortStderr,
      stdout: '',
    }];

    const result = _extractErrorForIteration(errorContent, 1);
    expect(result.stderr.length).toBe(400);
    expect(result.stderr.endsWith('...')).toBe(false);
  });

  test('truncates stdout to 200 chars', () => {
    const longStdout = 'o'.repeat(400);
    const errorContent = [{
      iteration: 1,
      exitCode: 1,
      stderr: '',
      stdout: longStdout,
    }];

    const result = _extractErrorForIteration(errorContent, 1);
    expect(result.stdout.length).toBe(203);
    expect(result.stdout.endsWith('...')).toBe(true);
  });

  test('preserves signal and failure stage metadata for matching iteration entries', () => {
    const result = _extractErrorForIteration([
      {
        iteration: 4,
        exitCode: null,
        signal: 'SIGTERM',
        failureStage: 'invoke_contract',
        stderr: 'signal failure',
        stdout: 'partial output',
      },
    ], 4);

    expect(result).toEqual({
      stderr: 'signal failure',
      stdout: 'partial output',
      signal: 'SIGTERM',
      failureStage: 'invoke_contract',
    });
  });
});

// ---------------------------------------------------------------------------
// _failureFingerprint / _firstNonEmptyLine / fingerprint dedup
// ---------------------------------------------------------------------------

describe('_firstNonEmptyLine()', () => {
  test('returns the first non-whitespace line trimmed to limit', () => {
    expect(_firstNonEmptyLine('  \n  hello world  \nother line', 5)).toBe('hello');
    expect(_firstNonEmptyLine('  \n  hello world  \nother line', 100)).toBe('hello world');
  });

  test('returns empty string for null/undefined/empty input', () => {
    expect(_firstNonEmptyLine(null, 120)).toBe('');
    expect(_firstNonEmptyLine('', 120)).toBe('');
    expect(_firstNonEmptyLine('   \n   \n', 120)).toBe('');
  });
});

describe('_buildIterationFeedback() - fingerprint dedup', () => {
  test('three same-fingerprint failures: one full detail, two back-references', () => {
    const errorContent = [
      { iteration: 1, exitCode: 1, stderr: 'SameError: problem\nline2', stdout: '', signal: '', failureStage: 'invoke_contract' },
      { iteration: 2, exitCode: 1, stderr: 'SameError: problem\nline2', stdout: '', signal: '', failureStage: 'invoke_contract' },
      { iteration: 3, exitCode: 1, stderr: 'SameError: problem\nline2', stdout: '', signal: '', failureStage: 'invoke_contract' },
    ];
    const history = [
      { iteration: 1, exitCode: 1, signal: '', failureStage: 'invoke_contract', filesChanged: [], completionDetected: false, taskDetected: false },
      { iteration: 2, exitCode: 1, signal: '', failureStage: 'invoke_contract', filesChanged: [], completionDetected: false, taskDetected: false },
      { iteration: 3, exitCode: 1, signal: '', failureStage: 'invoke_contract', filesChanged: [], completionDetected: false, taskDetected: false },
    ];

    const feedback = _buildIterationFeedback(history, errorContent);

    // Full detail on first occurrence
    expect(feedback).toContain('Iteration 1:');
    expect(feedback).toContain('SameError: problem');

    // Back-references for 2 and 3
    expect(feedback).toContain('same failure as iteration 1 (see above).');
    const backRefCount = (feedback.match(/same failure as iteration/g) || []).length;
    expect(backRefCount).toBe(2);

    // Stderr head appears only once
    const stderrHeadCount = (feedback.match(/SameError: problem/g) || []).length;
    expect(stderrHeadCount).toBe(1);
  });

  test('repeated no-promise (clean-exit) iterations dedupe into a single detailed line', () => {
    // Regression for a stuck-loop symptom: when the agent hits a blocker it
    // cannot clear, it keeps exiting cleanly with no promise. The feedback
    // used to render N identical bullets (e.g. "no loop promise emitted")
    // which bloated the prompt without helping the agent. The fingerprint
    // now covers the `noPromise` state so repeats collapse to a back-reference.
    const history = [
      { iteration: 23, exitCode: 0, signal: '', failureStage: '', filesChanged: [], completionDetected: false, taskDetected: false },
      { iteration: 24, exitCode: 0, signal: '', failureStage: '', filesChanged: [], completionDetected: false, taskDetected: false },
      { iteration: 25, exitCode: 0, signal: '', failureStage: '', filesChanged: [], completionDetected: false, taskDetected: false },
    ];

    const feedback = _buildIterationFeedback(history);

    expect(feedback).toContain('Iteration 23:');
    // Only the first occurrence gets the full "no loop promise emitted" line;
    // the next two are back-references.
    const noPromiseCount = (feedback.match(/no loop promise emitted/g) || []).length;
    expect(noPromiseCount).toBe(1);
    expect(feedback).toContain('Iteration 24: same failure as iteration 23 (see above).');
    expect(feedback).toContain('Iteration 25: same failure as iteration 23 (see above).');
  });

  test('commit anomaly iterations are deduped by anomaly type', () => {
    // Two iterations that failed to commit with the same anomaly type should
    // collapse to one detailed line + one back-reference, rather than two
    // duplicate bullets.
    const history = [
      {
        iteration: 22,
        exitCode: 0,
        signal: '',
        failureStage: '',
        filesChanged: ['tasks.md'],
        completionDetected: false,
        taskDetected: true,
        commitAnomaly: 'Auto-commit failed: pathspec did not match',
        commitAnomalyType: 'commit_failed',
      },
      {
        iteration: 23,
        exitCode: 0,
        signal: '',
        failureStage: '',
        filesChanged: ['tasks.md'],
        completionDetected: false,
        taskDetected: true,
        commitAnomaly: 'Auto-commit failed: pathspec did not match',
        commitAnomalyType: 'commit_failed',
      },
    ];

    const feedback = _buildIterationFeedback(history);
    expect(feedback).toContain('Iteration 22: commit anomaly');
    expect(feedback).toContain('Iteration 23: same failure as iteration 22');
  });

  test('three distinct-fingerprint failures: three full detail entries', () => {
    const errorContent = [
      { iteration: 1, exitCode: 1, stderr: 'ErrorA', stdout: '', signal: '', failureStage: 'stageA' },
      { iteration: 2, exitCode: 1, stderr: 'ErrorB', stdout: '', signal: '', failureStage: 'stageB' },
      { iteration: 3, exitCode: 1, stderr: 'ErrorC', stdout: '', signal: '', failureStage: 'stageC' },
    ];
    const historyEntries = [
      { iteration: 1, exitCode: 1, signal: '', failureStage: 'stageA', filesChanged: [], completionDetected: false, taskDetected: false },
      { iteration: 2, exitCode: 1, signal: '', failureStage: 'stageB', filesChanged: [], completionDetected: false, taskDetected: false },
      { iteration: 3, exitCode: 1, signal: '', failureStage: 'stageC', filesChanged: [], completionDetected: false, taskDetected: false },
    ];

    const feedback = _buildIterationFeedback(historyEntries, errorContent);

    expect(feedback).toContain('Iteration 1:');
    expect(feedback).toContain('Iteration 2:');
    expect(feedback).toContain('Iteration 3:');
    expect(feedback).not.toContain('same failure as iteration');
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
      // Disable the stall detector here so we can verify the pure
      // `max_iterations` exit path independently of the stall logic.
      const result = await run(makeOptions({ stallThreshold: 0 }));
      expect(result.completed).toBe(false);
      expect(result.iterations).toBe(3);
      expect(result.exitReason).toBe('max_iterations');
      const persistedState = state.read(path.join(tmpDir, '.ralph'));
      expect(persistedState.active).toBe(false);
      expect(persistedState.completedAt).toBeNull();
      expect(persistedState.stoppedAt).toBeTruthy();
      expect(persistedState.exitReason).toBe('max_iterations');
    } finally {
      restore();
    }
  });

  test('stall detector halts the loop after N consecutive no-op iterations', async () => {
    let callCount = 0;
    const restore = mockInvoker(invoker, async () => {
      callCount++;
      return {
        // No promise, no files changed, no tasks completed -> stalled.
        stdout: 'HAND OFF REQUIRED: cannot make progress',
        exitCode: 0,
        filesChanged: [],
        toolUsage: [],
      };
    });

    try {
      const result = await run(
        makeOptions({ maxIterations: 20, stallThreshold: 3 })
      );
      expect(result.completed).toBe(false);
      expect(result.iterations).toBe(3);
      expect(result.exitReason).toBe('stalled');
      expect(callCount).toBe(3);
      const persistedState = state.read(path.join(tmpDir, '.ralph'));
      expect(persistedState.active).toBe(false);
      expect(persistedState.stoppedAt).toBeTruthy();
      expect(persistedState.exitReason).toBe('stalled');
    } finally {
      restore();
    }
  });

  test('stall streak resets when the iteration makes any progress', async () => {
    let callCount = 0;
    const restore = mockInvoker(invoker, async () => {
      callCount++;
      // Stalled, stalled, progress, stalled, stalled -> streak resets on
      // iteration 3 and 2 subsequent stalls (threshold=3) should NOT halt.
      if (callCount === 3) {
        return {
          stdout: 'changed something',
          exitCode: 0,
          filesChanged: ['src/app.js'],
          toolUsage: [],
        };
      }
      return {
        stdout: 'no progress',
        exitCode: 0,
        filesChanged: [],
        toolUsage: [],
      };
    });

    try {
      const result = await run(
        makeOptions({ maxIterations: 5, stallThreshold: 3 })
      );
      // We should reach max_iterations because the streak resets on iter 3.
      expect(result.iterations).toBe(5);
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
      const persistedState = state.read(path.join(tmpDir, '.ralph'));
      expect(persistedState.active).toBe(false);
      expect(persistedState.completedAt).toBeTruthy();
      expect(persistedState.stoppedAt).toBeNull();
      expect(persistedState.exitReason).toBe('completion_promise');
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

  test('fatal invoker failure clears active state and records incomplete exit metadata', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const invokeSpy = jest.spyOn(invoker, 'invoke').mockRejectedValue(new Error('invoke exploded'));

    await expect(run(makeOptions({ ralphDir, maxIterations: 1 }))).rejects.toThrow('invoke exploded');
    const persistedState = state.read(ralphDir);
    expect(persistedState.active).toBe(false);
    expect(persistedState.completedAt).toBeNull();
    expect(persistedState.stoppedAt).toBeTruthy();
    expect(persistedState.exitReason).toBe('fatal_error');
    expect(invokeSpy).toHaveBeenCalledTimes(1);
  });

  test('persists prompt render failures as iteration-aligned error and history entries', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const invokeSpy = jest.spyOn(invoker, 'invoke');

    try {
      await expect(run(makeOptions({
        ralphDir,
        promptText: undefined,
        promptFile: path.join(tmpDir, 'missing-prompt.md'),
        maxIterations: 1,
      }))).rejects.toThrow('prompt file not found');

      const persistedState = state.read(ralphDir);
      const errorEntries = errors.readEntries(ralphDir);
      const historyEntries = history.recent(ralphDir, 1);

      expect(persistedState.active).toBe(false);
      expect(persistedState.exitReason).toBe('fatal_error');
      expect(invokeSpy).not.toHaveBeenCalled();
      expect(errorEntries).toHaveLength(1);
      expect(errorEntries[0]).toMatchObject({
        iteration: 1,
        task: 'N/A',
        signal: '',
        failureStage: 'prompt_render',
        stdout: '',
      });
      expect(errorEntries[0].stderr).toContain('prompt file not found');
      expect(Number.isNaN(errorEntries[0].exitCode)).toBe(true);
      expect(historyEntries[0]).toMatchObject({
        iteration: 1,
        completionDetected: false,
        taskDetected: false,
        exitCode: null,
        signal: '',
        failureStage: 'prompt_render',
        completedTasks: [],
      });
    } finally {
      invokeSpy.mockRestore();
    }
  });

  test('persists invoker abort failures as iteration-aligned error and history entries', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const invokeSpy = jest.spyOn(invoker, 'invoke').mockRejectedValue(
      Object.assign(new Error('opencode printed CLI help'), { failureStage: 'invoke_contract' })
    );

    try {
      await expect(run(makeOptions({ ralphDir, maxIterations: 1 }))).rejects.toThrow('opencode printed CLI help');

      const persistedState = state.read(ralphDir);
      const errorEntries = errors.readEntries(ralphDir);
      const historyEntries = history.recent(ralphDir, 1);

      expect(persistedState.active).toBe(false);
      expect(persistedState.exitReason).toBe('fatal_error');
      expect(invokeSpy).toHaveBeenCalledTimes(1);
      expect(errorEntries).toHaveLength(1);
      expect(errorEntries[0]).toMatchObject({
        iteration: 1,
        task: 'N/A',
        signal: '',
        failureStage: 'invoke_contract',
        stdout: '',
      });
      expect(errorEntries[0].stderr).toContain('opencode printed CLI help');
      expect(Number.isNaN(errorEntries[0].exitCode)).toBe(true);
      expect(historyEntries[0]).toMatchObject({
        iteration: 1,
        completionDetected: false,
        taskDetected: false,
        exitCode: null,
        signal: '',
        failureStage: 'invoke_contract',
        completedTasks: [],
      });
    } finally {
      invokeSpy.mockRestore();
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

  test('records meaningful changes when an already-dirty file changes during the iteration', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const tasksFile = path.join(tmpDir, 'tasks.md');
    fs.writeFileSync(tasksFile, '- [ ] 3.1 Track dirty file fingerprints\n', 'utf8');

    const restore = mockInvoker(invoker, async () => {
      fs.writeFileSync(tasksFile, '- [x] 3.1 Track dirty file fingerprints\n', 'utf8');
      return {
        stdout: '<promise>READY_FOR_NEXT_TASK</promise>',
        exitCode: 0,
        filesChanged: ['src/already-dirty.js', 'src/new-file.js', 'src/deleted-file.js'],
        toolUsage: [],
      };
    });

    try {
      await run(makeOptions({ ralphDir, tasksMode: true, tasksFile, maxIterations: 1, noCommit: true }));
      const entries = history.recent(ralphDir, 1);
      expect(entries).toHaveLength(1);
      expect(entries[0].filesChanged).toEqual([
        'src/already-dirty.js',
        'src/new-file.js',
        'src/deleted-file.js',
      ]);
      expect(entries[0].completedTasks).toEqual(['3.1 Track dirty file fingerprints']);
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
    fs.writeFileSync(templateFile, '{{base_prompt}}\n{{commit_contract}}', 'utf8');

    const prompts = [];
    const restore = mockInvoker(invoker, async (opts) => {
      prompts.push(opts.prompt);
      return { stdout: '<promise>COMPLETE</promise>', exitCode: 0, filesChanged: [], toolUsage: [] };
    });

    try {
      await run(makeOptions({ ralphDir, promptTemplate: templateFile, maxIterations: 1 }));
      expect(prompts[0]).toContain('Do the thing.');
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
    fs.writeFileSync(templateFile, '{{base_prompt}}\n{{commit_contract}}', 'utf8');

    const prompts = [];
    const restore = mockInvoker(invoker, async (opts) => {
      prompts.push(opts.prompt);
      return { stdout: '<promise>COMPLETE</promise>', exitCode: 0, filesChanged: [], toolUsage: [] };
    });

    try {
      await run(makeOptions({ ralphDir, promptTemplate: templateFile, maxIterations: 1, noCommit: true }));
      expect(prompts[0]).toContain('Do the thing.');
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

  test('ignores quoted and diff-like promise mentions until a standalone control line appears', async () => {
    let callCount = 0;
    const restore = mockInvoker(invoker, async () => {
      callCount++;

      if (callCount === 1) {
        return {
          stdout: [
            'Document the promise tag `<promise>COMPLETE</promise>` in the README.',
            'diff --git a/file b/file',
            '+ <promise>COMPLETE</promise>',
            'The completion line is <promise>COMPLETE</promise> when all work is done.',
          ].join('\n'),
          exitCode: 0,
          filesChanged: [],
          toolUsage: [],
        };
      }

      return {
        stdout: '  <promise>COMPLETE</promise>  ',
        exitCode: 0,
        filesChanged: [],
        toolUsage: [],
      };
    });

    try {
      const result = await run(makeOptions({ maxIterations: 5 }));
      expect(result.completed).toBe(true);
      expect(result.iterations).toBe(2);
      expect(result.exitReason).toBe('completion_promise');
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

  test('injects signal and fatal-stage diagnostics into follow-up iterations', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const prompts = [];
    let callCount = 0;
    const restore = mockInvoker(invoker, async (opts) => {
      callCount++;
      prompts.push(opts.prompt);

      if (callCount === 1) {
        return {
          stdout: 'partial output',
          stderr: '---\n### stdout\nterminated by signal',
          exitCode: null,
          signal: 'SIGTERM',
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
      expect(prompts[1]).toContain('Iteration 1: opencode exited via signal SIGTERM');
      expect(prompts[1]).toContain('signal: SIGTERM');
      expect(prompts[1]).toContain('---');
      expect(prompts[1]).toContain('stdout: partial output');
    } finally {
      restore();
    }
  });

  test('records protected-artifact auto-commit anomalies in history', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const tasksFile = path.join(tmpDir, 'openspec', 'changes', 'demo', 'tasks.md');
    fs.mkdirSync(path.dirname(tasksFile), { recursive: true });
    fs.writeFileSync(tasksFile, '- [ ] 1.1 Task one\n', 'utf8');

    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const restore = mockInvoker(invoker, async () => {
      fs.writeFileSync(tasksFile, '- [x] 1.1 Task one\n', 'utf8');
      return {
        stdout: '<promise>READY_FOR_NEXT_TASK</promise>',
        exitCode: 0,
        filesChanged: [
          path.join(tmpDir, 'openspec', 'changes', 'demo', 'proposal.md'),
          path.join(tmpDir, 'src', 'app.js'),
        ],
        toolUsage: [],
      };
    });

    try {
      await run(makeOptions({ ralphDir, tasksMode: true, tasksFile, maxIterations: 1 }));
      const entries = history.recent(ralphDir, 1);
      expect(entries[0].commitAnomalyType).toBe('protected_artifacts');
      expect(entries[0].commitAnomaly).toContain('protected OpenSpec artifacts');
      expect(entries[0].protectedArtifacts).toEqual(['openspec/changes/demo/proposal.md']);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('protected OpenSpec artifacts'));
    } finally {
      restore();
      cwdSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  test('records failed auto-commit anomalies in history', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const tasksFile = path.join(tmpDir, 'tasks.md');
    fs.writeFileSync(tasksFile, '- [ ] 1.1 Task one\n', 'utf8');

    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const execSpy = jest.spyOn(require('child_process'), 'execFileSync').mockImplementation((command, args) => {
      if (command === 'git' && args[0] === 'add') return '';
      if (command === 'git' && args[0] === 'diff') return 'tasks.md\nsrc/app.js\n';
      if (command === 'git' && args[0] === 'commit') throw new Error('simulated commit failure');
      return '';
    });

    const restore = mockInvoker(invoker, async () => {
      fs.writeFileSync(tasksFile, '- [x] 1.1 Task one\n', 'utf8');
      return {
        stdout: '<promise>READY_FOR_NEXT_TASK</promise>',
        exitCode: 0,
        filesChanged: [path.join(tmpDir, 'src', 'app.js')],
        toolUsage: [],
      };
    });

    try {
      await run(makeOptions({ ralphDir, tasksMode: true, tasksFile, maxIterations: 1 }));
      const entries = history.recent(ralphDir, 1);
      expect(entries[0].commitAttempted).toBe(true);
      expect(entries[0].commitCreated).toBe(false);
      expect(entries[0].commitAnomalyType).toBe('commit_failed');
      expect(entries[0].commitAnomaly).toContain('simulated commit failure');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('simulated commit failure'));
    } finally {
      restore();
      execSpy.mockRestore();
      cwdSpy.mockRestore();
      stderrSpy.mockRestore();
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
      await run(makeOptions({ ralphDir, maxIterations: 5, stallThreshold: 0 }));
      const s = state.read(ralphDir);
      expect(s.resumedAt).not.toBeNull();
      expect(s.resumedAt).toBeDefined();
    } finally {
      restore();
    }
  });

  test('preserves the original startedAt timestamp across resumes', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir, { recursive: true });
    // Seed a prior state whose startedAt is the "true" original run start.
    const originalStartedAt = '2026-04-20T12:00:00.000Z';
    state.init(ralphDir, {
      active: false,
      iteration: 4,
      startedAt: originalStartedAt,
      completedAt: null,
      stoppedAt: '2026-04-20T13:00:00.000Z',
    });

    const restore = mockInvoker(invoker, async () => ({
      stdout: '<promise>COMPLETE</promise>',
      exitCode: 0,
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      await run(makeOptions({ ralphDir, maxIterations: 6 }));
      const s = state.read(ralphDir);
      // startedAt must not be overwritten on resume.
      expect(s.startedAt).toBe(originalStartedAt);
      // resumedAt should be fresh (a new ISO timestamp, different from startedAt).
      expect(s.resumedAt).toBeTruthy();
      expect(s.resumedAt).not.toBe(originalStartedAt);
    } finally {
      restore();
    }
  });

  test('sets startedAt on a fresh run when no prior state exists', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir, { recursive: true });
    // No prior state -> startedAt is set to "now" and resumedAt stays null.

    const restore = mockInvoker(invoker, async () => ({
      stdout: '<promise>COMPLETE</promise>',
      exitCode: 0,
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      const before = Date.now();
      await run(makeOptions({ ralphDir, maxIterations: 2 }));
      const after = Date.now();
      const s = state.read(ralphDir);
      expect(s.resumedAt).toBeNull();
      expect(s.startedAt).toBeTruthy();
      const startedAtMs = Date.parse(s.startedAt);
      expect(startedAtMs).toBeGreaterThanOrEqual(before);
      expect(startedAtMs).toBeLessThanOrEqual(after);
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

  test('rejects a second live loop before mutating state', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir, { recursive: true });
    fs.writeFileSync(
      state.lockPath(ralphDir),
      JSON.stringify({ pid: 42424, acquiredAt: '2026-01-01T00:00:00.000Z' }, null, 2),
      'utf8'
    );

    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
    const promptSpy = jest.spyOn(require('../../../lib/mini-ralph/prompt'), 'render');
    const invokeSpy = jest.spyOn(invoker, 'invoke');

    try {
      await expect(run(makeOptions({ ralphDir, maxIterations: 1 }))).rejects.toThrow(/already active/);
      expect(state.read(ralphDir)).toBeNull();
      expect(promptSpy).not.toHaveBeenCalled();
      expect(invokeSpy).not.toHaveBeenCalled();
      expect(state.readRunLock(ralphDir)).toMatchObject({ pid: 42424 });
    } finally {
      killSpy.mockRestore();
      promptSpy.mockRestore();
      invokeSpy.mockRestore();
    }
  });

  test('recovers a stale lock and releases the replacement after the run', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir, { recursive: true });
    fs.writeFileSync(
      state.lockPath(ralphDir),
      JSON.stringify({ pid: 42424, acquiredAt: '2026-01-01T00:00:00.000Z' }, null, 2),
      'utf8'
    );

    const killSpy = jest.spyOn(process, 'kill').mockImplementation((pid) => {
      if (pid === 42424) {
        const err = new Error('no such process');
        err.code = 'ESRCH';
        throw err;
      }
      return true;
    });
    const restore = mockInvoker(invoker, async () => ({
      stdout: '<promise>COMPLETE</promise>',
      exitCode: 0,
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      const result = await run(makeOptions({ ralphDir, maxIterations: 1, noCommit: true }));
      expect(result.completed).toBe(true);
      expect(state.read(ralphDir).active).toBe(false);
      expect(fs.existsSync(state.lockPath(ralphDir))).toBe(false);
    } finally {
      restore();
      killSpy.mockRestore();
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

  test('records signal-terminated invocations as failed iterations', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const restore = mockInvoker(invoker, async () => ({
      stdout: 'partial output',
      stderr: 'terminated by signal',
      exitCode: null,
      signal: 'SIGTERM',
      filesChanged: [],
      toolUsage: [],
    }));

    try {
      await run(makeOptions({ ralphDir, maxIterations: 1, noCommit: true }));
      const errorEntries = errors.readEntries(ralphDir);
      const historyEntries = history.recent(ralphDir, 1);

      expect(errorEntries).toHaveLength(1);
      expect(errorEntries[0]).toMatchObject({
        iteration: 1,
        exitCode: NaN,
        signal: 'SIGTERM',
        stderr: 'terminated by signal',
        stdout: 'partial output',
      });
      expect(historyEntries[0]).toMatchObject({
        iteration: 1,
        exitCode: null,
        signal: 'SIGTERM',
      });
    } finally {
      restore();
    }
  });

  test('does not auto-commit or complete signal-terminated iterations even with completion output', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const execSpy = jest.spyOn(require('child_process'), 'execFileSync');
    const restore = mockInvoker(invoker, async () => ({
      stdout: '<promise>COMPLETE</promise>',
      stderr: 'terminated by signal',
      exitCode: null,
      signal: 'SIGTERM',
      filesChanged: ['src/app.js'],
      toolUsage: [],
    }));

    try {
      const result = await run(makeOptions({ ralphDir, maxIterations: 1, noCommit: false }));
      expect(result.completed).toBe(false);
      expect(result.exitReason).toBe('max_iterations');
      expect(execSpy).not.toHaveBeenCalled();
      expect(history.recent(ralphDir, 1)[0]).toMatchObject({
        commitAttempted: false,
        completionDetected: false,
        signal: 'SIGTERM',
      });
    } finally {
      restore();
      execSpy.mockRestore();
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
    // Feedback window is 5 iterations. After 6 consecutive failing
    // iterations, iter 1's error should have aged out of the window when
    // iter 7 starts, while iter 6's error should still be visible.
    const prompts = [];
    let callCount = 0;
    const restore = mockInvoker(invoker, async (opts) => {
      callCount++;
      prompts.push(opts.prompt);
      if (callCount <= 6) {
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
      await run(makeOptions({ maxIterations: 7, noCommit: true }));
      // prompts[6] is the prompt passed into the 7th invocation.
      expect(prompts[6]).toContain('critical failure 6');
      expect(prompts[6]).not.toContain('critical failure 1');
    } finally {
      restore();
    }
  });

  test('uses the newest exact iteration error entry in prompt feedback when duplicates exist', async () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const prompts = [];
    let callCount = 0;
    const restore = mockInvoker(invoker, async (opts) => {
      callCount++;
      prompts.push(opts.prompt);

      if (callCount === 1) {
        errors.append(ralphDir, {
          iteration: 1,
          task: 'seeded duplicate',
          exitCode: 9,
          stderr: 'older duplicate error',
          stdout: '',
        });

        return {
          stdout: 'no promise',
          stderr: 'new exact iteration error',
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
      expect(prompts[1]).toContain('new exact iteration error');
      expect(prompts[1]).not.toContain('older duplicate error');
    } finally {
      restore();
    }
  });
});
