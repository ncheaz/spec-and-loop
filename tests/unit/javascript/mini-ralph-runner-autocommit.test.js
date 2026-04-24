'use strict';

describe('runner._autoCommit()', () => {
  let execFileSync;
  let runner;
  let stderrSpy;
  let cwdSpy;

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
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('/repo');
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
      ['add', '-A', '--', 'tasks.md', 'src/app.js'],
      expect.any(Object)
    );
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['diff', '--cached', '--name-only'],
      expect.any(Object)
    );
    expect(execFileSync).toHaveBeenCalledTimes(3); // check-ignore, add, diff
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

    const result = runner._autoCommit(5, {
      completedTasks: [completedTask],
      filesToStage: ['tasks.md', 'src/app.js'],
      verbose: false,
    });

    expect(execFileSync).toHaveBeenNthCalledWith(
      2,
      'git',
      ['add', '-A', '--', 'tasks.md', 'src/app.js'],
      expect.any(Object)
    );
    expect(execFileSync).toHaveBeenNthCalledWith(
      3,
      'git',
      ['diff', '--cached', '--name-only'],
      expect.any(Object)
    );
    expect(execFileSync.mock.calls[3][0]).toBe('git');
    expect(execFileSync.mock.calls[3][1][0]).toBe('commit');
    expect(execFileSync.mock.calls[3][1][2]).toContain('Ralph iteration 5: Implement feature');
    expect(execFileSync.mock.calls[3][1][2]).toContain('- [x] 1.1 Implement feature');
    expect(result).toEqual({ attempted: true, committed: true, anomaly: null });
  });

  test('returns a commit anomaly when git commit fails', () => {
    execFileSync.mockImplementation((command, args) => {
      if (command === 'git' && args[0] === 'add') {
        return '';
      }
      if (command === 'git' && args[0] === 'diff') {
        return 'tasks.md\n';
      }
      throw new Error('commit failed');
    });

    const result = runner._autoCommit(3, {
      completedTasks: [completedTask],
      filesToStage: ['tasks.md'],
      verbose: true,
    });

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Auto-commit failed: commit failed')
    );
    expect(result).toEqual({
      attempted: true,
      committed: false,
      anomaly: {
        type: 'commit_failed',
        message: 'Auto-commit failed: commit failed',
      },
    });
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
      ['add', '-A', '--', 'tasks.md', 'src/app.js'],
      expect.any(Object)
    );
    // Guard against the unscoped form, which would stage *every* dirty file in
    // the repo (including files unrelated to the current task).
    expect(execFileSync).not.toHaveBeenCalledWith(
      'git',
      ['add', '-A'],
      expect.any(Object)
    );
  });

  test('stages deletions alongside modifications via `git add -A -- <paths>`', () => {
    // Simulate a task that removed a file: the path is in the allowlist but
    // no longer exists on disk. `git add -A -- <path>` must still succeed and
    // record the deletion in the index.
    execFileSync.mockImplementation((command, args) => {
      if (command === 'git' && args[0] === 'diff') {
        return 'deleted/file.webp\ntasks.md\n';
      }
      return '';
    });

    const result = runner._autoCommit(7, {
      completedTasks: [completedTask],
      filesToStage: ['deleted/file.webp', 'tasks.md'],
      verbose: false,
    });

    expect(execFileSync).toHaveBeenNthCalledWith(
      2,
      'git',
      ['add', '-A', '--', 'deleted/file.webp', 'tasks.md'],
      expect.any(Object)
    );
    expect(result).toEqual({ attempted: true, committed: true, anomaly: null });
  });

  test('blocks protected OpenSpec artifacts from loop-managed commits', () => {
    const result = runner._autoCommit(6, {
      completedTasks: [completedTask],
      filesToStage: [
        'openspec/changes/demo/tasks.md',
        'openspec/changes/demo/proposal.md',
        'src/app.js',
      ],
      tasksFile: '/repo/openspec/changes/demo/tasks.md',
      verbose: false,
    });

    expect(execFileSync).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('cannot include protected OpenSpec artifacts')
    );
    expect(result).toEqual({
      attempted: true,
      committed: false,
      anomaly: expect.objectContaining({
        type: 'protected_artifacts',
        protectedArtifacts: ['openspec/changes/demo/proposal.md'],
      }),
    });
  });
});
