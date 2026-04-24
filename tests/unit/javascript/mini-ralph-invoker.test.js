'use strict';

const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('mini-ralph invoker', () => {
  let spawn;
  let execFileSync;
  let invoker;
  let stdoutSpy;
  let stderrSpy;
  let tmpDir;

  function makeChildProcess({ stdout = '', stderr = '', exitCode = 0, signal = null }) {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    process.nextTick(() => {
      if (stdout) {
        child.stdout.emit('data', Buffer.from(stdout));
      }
      if (stderr) {
        child.stderr.emit('data', Buffer.from(stderr));
      }
      child.emit('close', exitCode, signal);
    });

    return child;
  }

  beforeEach(() => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-ralph-invoker-'));

    spawn = jest.fn();
    execFileSync = jest.fn().mockReturnValue('');

    jest.doMock('child_process', () => ({
      spawn,
      execFileSync,
    }));

    invoker = require('../../../lib/mini-ralph/invoker');
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('_looksLikeCliHelp detects the opencode help banner', () => {
    const helpText = [
      'opencode run [message..]',
      '',
      'run opencode with a message',
      '',
      'Positionals:',
      '  message  message to send',
      '',
      'Options:',
      '  -h, --help',
    ].join('\n');

    expect(invoker._looksLikeCliHelp(helpText)).toBe(true);
  });

  test('_looksLikeCliHelp ignores help-like strings printed later in normal output', () => {
    const output = [
      'Reviewing the current task first.',
      'Running focused tests next.',
      ...Array.from({ length: 45 }, (_, i) => `progress line ${i + 1}`),
      'diff --git a/tests/unit/javascript/mini-ralph-runner.test.js b/tests/unit/javascript/mini-ralph-runner.test.js',
      "+ expect(invokerHelpers._looksLikeCliHelp('Commands:\\nrun opencode with a message\\nOptions:\\nopencode run [message..]')).toBe(true);",
      '+ Positionals:',
      '<promise>READY_FOR_NEXT_TASK</promise>',
    ].join('\n');

    expect(invoker._looksLikeCliHelp(output)).toBe(false);
  });

  test('invoke uses "opencode run" with the prompt as the message', async () => {
    spawn.mockReturnValue(
      makeChildProcess({
        stdout: '<promise>READY_FOR_NEXT_TASK</promise>\n',
        exitCode: 0,
      })
    );

    const result = await invoker.invoke({
      prompt: 'Implement the task and emit the task promise when done.',
      model: 'anthropic/claude-sonnet-4',
      verbose: true,
      ralphDir: '/tmp/ralph',
    });

    expect(spawn).toHaveBeenCalledWith(
      'opencode',
      [
        'run',
        '--model',
        'anthropic/claude-sonnet-4',
        'Implement the task and emit the task promise when done.',
      ],
      expect.objectContaining({
        stdio: ['inherit', 'pipe', 'pipe'],
        env: process.env,
      })
    );
    expect(result.stdout).toContain('READY_FOR_NEXT_TASK');
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('invoking: opencode run --model anthropic/claude-sonnet-4 <prompt>')
    );
  });

  test('invoke returns stderr in the result object', async () => {
    spawn.mockReturnValue(
      makeChildProcess({
        stdout: '<promise>READY_FOR_NEXT_TASK</promise>\n',
        stderr: 'some warning message\n',
        exitCode: 0,
      })
    );

    const result = await invoker.invoke({
      prompt: 'Do the work.',
      ralphDir: '/tmp/ralph',
    });

    expect(result.stderr).toBe('some warning message\n');
  });

  test('invoke preserves signal metadata when opencode is terminated by signal', async () => {
    spawn.mockReturnValue(
      makeChildProcess({
        stdout: 'partial output\n',
        stderr: 'terminated\n',
        exitCode: null,
        signal: 'SIGTERM',
      })
    );

    const result = await invoker.invoke({
      prompt: 'Do the work.',
      ralphDir: '/tmp/ralph',
    });

    expect(result).toMatchObject({
      stdout: 'partial output\n',
      stderr: 'terminated\n',
      exitCode: null,
      signal: 'SIGTERM',
    });
  });

  test('invoke throws a clear error when opencode prints CLI help', async () => {
    const helpText = [
      'opencode run [message..]',
      '',
      'run opencode with a message',
      '',
      'Positionals:',
      '  message  message to send',
      '',
      'Options:',
      '  -h, --help',
    ].join('\n');

    spawn.mockReturnValue(
      makeChildProcess({
        stdout: helpText,
        exitCode: 0,
      })
    );

    await expect(
      invoker.invoke({
        prompt: 'Do the work in the prompt.',
        ralphDir: '/tmp/ralph',
      })
    ).rejects.toThrow(/printed CLI help instead of running the prompt/i);
  });

  test('invoke ignores later diff output that mentions CLI help strings', async () => {
    const stdout = [
      'Reviewing the current task first.',
      ...Array.from({ length: 45 }, (_, i) => `progress line ${i + 1}`),
      'diff --git a/tests/unit/javascript/mini-ralph-runner.test.js b/tests/unit/javascript/mini-ralph-runner.test.js',
      "+ expect(invokerHelpers._looksLikeCliHelp('Commands:\\nrun opencode with a message\\nOptions:\\nopencode run [message..]')).toBe(true);",
      '+ Positionals:',
      '<promise>READY_FOR_NEXT_TASK</promise>',
    ].join('\n');

    spawn.mockReturnValue(
      makeChildProcess({
      stdout,
      exitCode: 0,
    })
  );

    await expect(
      invoker.invoke({
        prompt: 'Do the work in the prompt.',
        ralphDir: '/tmp/ralph',
      })
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout,
    });
  });

  test('invoke fingerprints already-dirty, untouched dirty, deleted, and new untracked paths', async () => {
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const dirtyPath = path.join(tmpDir, 'dirty.js');
    const untouchedPath = path.join(tmpDir, 'untouched.js');
    const deletedPath = path.join(tmpDir, 'deleted.js');
    const newPath = path.join(tmpDir, 'new.js');

    fs.writeFileSync(dirtyPath, 'before\n', 'utf8');
    fs.writeFileSync(untouchedPath, 'same\n', 'utf8');
    fs.writeFileSync(deletedPath, 'remove me\n', 'utf8');

    execFileSync
      .mockReturnValueOnce(' M dirty.js\n M untouched.js\n M deleted.js\n')
      .mockReturnValueOnce(' M dirty.js\n M untouched.js\n D deleted.js\n?? new.js\n');

    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    spawn.mockReturnValue(child);

    try {
      const pending = invoker.invoke({
        prompt: 'Do the work.',
        ralphDir: path.join(tmpDir, '.ralph'),
      });

      fs.writeFileSync(dirtyPath, 'after\n', 'utf8');
      fs.rmSync(deletedPath);
      fs.writeFileSync(newPath, 'brand new\n', 'utf8');
      child.emit('close', 0);

      await expect(pending).resolves.toMatchObject({
        exitCode: 0,
        filesChanged: ['deleted.js', 'dirty.js', 'new.js'],
      });
    } finally {
      cwdSpy.mockRestore();
    }
  });

  // --- Watchdog tests (task 2.1: surface-autocommit-ignore-warning-and-watchdog) ---

  test('watchdog fires SIGTERM after idle threshold and result has iteration_timeout_idle', async () => {
    const TEST_IDLE_MS = 100;
    const originalIdleEnv = process.env.RALPH_ITERATION_IDLE_TIMEOUT_MS;
    const originalGraceEnv = process.env.RALPH_ITERATION_KILL_GRACE_MS;
    process.env.RALPH_ITERATION_IDLE_TIMEOUT_MS = String(TEST_IDLE_MS);
    process.env.RALPH_ITERATION_KILL_GRACE_MS = '5000';

    // Build a child that writes one chunk then goes silent
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn((sig) => {
      // Simulate the child exiting when it receives SIGTERM
      if (sig === 'SIGTERM') {
        setTimeout(() => child.emit('close', null, 'SIGTERM'), 10);
      }
    });
    spawn.mockReturnValue(child);

    execFileSync.mockReturnValue('');

    const pending = invoker.invoke({ prompt: 'Do the work.' });

    // Emit one chunk, then go silent — the idle timer should fire after TEST_IDLE_MS
    child.stdout.emit('data', Buffer.from('some output'));

    const result = await pending;

    // Restore env
    if (originalIdleEnv === undefined) delete process.env.RALPH_ITERATION_IDLE_TIMEOUT_MS;
    else process.env.RALPH_ITERATION_IDLE_TIMEOUT_MS = originalIdleEnv;
    if (originalGraceEnv === undefined) delete process.env.RALPH_ITERATION_KILL_GRACE_MS;
    else process.env.RALPH_ITERATION_KILL_GRACE_MS = originalGraceEnv;

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(result.failureReason).toBe('iteration_timeout_idle');
    expect(typeof result.idleMs).toBe('number');
    expect(result.lastStdoutBytes.length).toBeLessThanOrEqual(200);
  }, 10000);

  test('watchdog disabled when RALPH_ITERATION_IDLE_TIMEOUT_MS=0, silent child is not killed', async () => {
    const originalIdleEnv = process.env.RALPH_ITERATION_IDLE_TIMEOUT_MS;
    process.env.RALPH_ITERATION_IDLE_TIMEOUT_MS = '0';

    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn();
    spawn.mockReturnValue(child);

    execFileSync.mockReturnValue('');

    const pending = invoker.invoke({ prompt: 'Do the work.' });

    // Let 150ms pass with no output — watchdog should NOT fire because it's disabled
    await new Promise((res) => setTimeout(res, 150));
    // Then close the child normally
    child.emit('close', 0, null);

    const result = await pending;

    if (originalIdleEnv === undefined) delete process.env.RALPH_ITERATION_IDLE_TIMEOUT_MS;
    else process.env.RALPH_ITERATION_IDLE_TIMEOUT_MS = originalIdleEnv;

    expect(child.kill).not.toHaveBeenCalled();
    expect(result.failureReason).toBeUndefined();
  }, 10000);

  test('child that keeps writing within idle window completes normally without iteration_timeout_idle', async () => {
    const TEST_IDLE_MS = 200;
    const originalIdleEnv = process.env.RALPH_ITERATION_IDLE_TIMEOUT_MS;
    process.env.RALPH_ITERATION_IDLE_TIMEOUT_MS = String(TEST_IDLE_MS);

    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn();
    spawn.mockReturnValue(child);

    execFileSync.mockReturnValue('');

    const pending = invoker.invoke({ prompt: 'Do the work.' });

    // Write output every 80ms for 3 times (well within 200ms idle threshold each time)
    for (let i = 0; i < 3; i++) {
      await new Promise((res) => setTimeout(res, 80));
      child.stdout.emit('data', Buffer.from(`chunk ${i}`));
    }
    // Now close normally
    child.emit('close', 0, null);

    const result = await pending;

    if (originalIdleEnv === undefined) delete process.env.RALPH_ITERATION_IDLE_TIMEOUT_MS;
    else process.env.RALPH_ITERATION_IDLE_TIMEOUT_MS = originalIdleEnv;

    expect(child.kill).not.toHaveBeenCalled();
    expect(result.failureReason).toBeUndefined();
    expect(result.exitCode).toBe(0);
  }, 10000);
});
