'use strict';

const { EventEmitter } = require('events');

describe('mini-ralph invoker', () => {
  let spawn;
  let execFileSync;
  let invoker;
  let stdoutSpy;
  let stderrSpy;

  function makeChildProcess({ stdout = '', stderr = '', exitCode = 0 }) {
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
      child.emit('close', exitCode);
    });

    return child;
  }

  beforeEach(() => {
    jest.resetModules();

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
  });

  test('_looksLikeCliHelp detects the opencode help banner', () => {
    const helpText = [
      'Commands:',
      '  opencode [project]           start opencode tui',
      '  opencode run [message..]     run opencode with a message',
      '',
      'Options:',
      '  -h, --help',
    ].join('\n');

    expect(invoker._looksLikeCliHelp(helpText)).toBe(true);
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

  test('invoke throws a clear error when opencode prints CLI help', async () => {
    const helpText = [
      'Commands:',
      '  opencode [project]           start opencode tui',
      '  opencode run [message..]     run opencode with a message',
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
});
