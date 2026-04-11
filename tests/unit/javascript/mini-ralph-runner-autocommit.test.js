'use strict';

describe('runner._autoCommit()', () => {
  let execFileSync;
  let runner;
  let stderrSpy;

  const completedTask = {
    number: '1.1',
    description: 'Implement feature',
    fullDescription: '1.1 Implement feature',
    status: 'completed',
  };

  beforeEach(() => {
    jest.resetModules();
    execFileSync = jest.fn();
    jest.doMock('child_process', () => ({
      execFileSync,
    }));

    runner = require('../../../lib/mini-ralph/runner');
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('skips when no completed tasks were detected', () => {
    runner._autoCommit(1, { completedTasks: [], verbose: true });

    expect(execFileSync).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('no completed tasks detected')
    );
  });

  test('skips when there are no iteration files to stage', () => {
    runner._autoCommit(2, {
      completedTasks: [completedTask],
      filesToStage: [],
      verbose: true,
    });

    expect(execFileSync).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('no iteration files to stage')
    );
  });

  test('skips when nothing is staged after git add', () => {
    execFileSync.mockImplementation((command, args) => {
      if (command === 'git' && args[0] === 'diff') {
        return '';
      }
      return '';
    });

    runner._autoCommit(2, {
      completedTasks: [completedTask],
      filesToStage: ['tasks.md', 'src/app.js'],
      verbose: true,
    });

    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['add', '--', 'tasks.md', 'src/app.js'],
      expect.any(Object)
    );
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['diff', '--cached', '--name-only'],
      expect.any(Object)
    );
    expect(execFileSync).toHaveBeenCalledTimes(2);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('nothing staged')
    );
  });

  test('commits with a Ralph-formatted message when tasks were completed', () => {
    execFileSync.mockImplementation((command, args) => {
      if (command === 'git' && args[0] === 'diff') {
        return 'tasks.md\nsrc/app.js\n';
      }
      return '';
    });

    runner._autoCommit(5, {
      completedTasks: [completedTask],
      filesToStage: ['tasks.md', 'src/app.js'],
      verbose: false,
    });

    expect(execFileSync).toHaveBeenNthCalledWith(
      1,
      'git',
      ['add', '--', 'tasks.md', 'src/app.js'],
      expect.any(Object)
    );
    expect(execFileSync).toHaveBeenNthCalledWith(
      2,
      'git',
      ['diff', '--cached', '--name-only'],
      expect.any(Object)
    );
    expect(execFileSync.mock.calls[2][0]).toBe('git');
    expect(execFileSync.mock.calls[2][1][0]).toBe('commit');
    expect(execFileSync.mock.calls[2][1][2]).toContain('Ralph iteration 5: Implement feature');
    expect(execFileSync.mock.calls[2][1][2]).toContain('- [x] 1.1 Implement feature');
  });

  test('logs and swallows commit failures', () => {
    execFileSync.mockImplementation((command, args) => {
      if (command === 'git' && args[0] === 'add') {
        return '';
      }
      if (command === 'git' && args[0] === 'diff') {
        return 'tasks.md\n';
      }
      throw new Error('commit failed');
    });

    expect(() => {
      runner._autoCommit(3, {
        completedTasks: [completedTask],
        filesToStage: ['tasks.md'],
        verbose: true,
      });
    }).not.toThrow();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('commit failed')
    );
  });

  test('stages only the provided allowlist', () => {
    execFileSync.mockImplementation((command, args) => {
      if (command === 'git' && args[0] === 'diff') {
        return 'tasks.md\nsrc/app.js\n';
      }
      return '';
    });

    runner._autoCommit(6, {
      completedTasks: [completedTask],
      filesToStage: ['tasks.md', 'src/app.js'],
      verbose: false,
    });

    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['add', '--', 'tasks.md', 'src/app.js'],
      expect.any(Object)
    );
    expect(execFileSync).not.toHaveBeenCalledWith(
      'git',
      ['add', '-A'],
      expect.any(Object)
    );
  });
});
