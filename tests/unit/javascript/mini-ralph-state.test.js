'use strict';

/**
 * Unit tests for lib/mini-ralph/state.js
 *
 * Tests state file persistence, reading, updating, and removal
 * for the .ralph/ working directory.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const state = require('../../../lib/mini-ralph/state');

// Create an isolated temp directory for each test
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-state-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('state.statePath()', () => {
  test('returns path to ralph-loop.state.json inside ralphDir', () => {
    const p = state.statePath('/some/dir');
    expect(p).toBe(path.join('/some/dir', 'ralph-loop.state.json'));
  });
});

describe('state.lockPath()', () => {
  test('returns path to ralph-loop.lock.json inside ralphDir', () => {
    const p = state.lockPath('/some/dir');
    expect(p).toBe(path.join('/some/dir', 'ralph-loop.lock.json'));
  });
});

describe('state.init()', () => {
  test('creates the ralphDir if it does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph-new');
    expect(fs.existsSync(ralphDir)).toBe(false);
    state.init(ralphDir, { active: true, iteration: 1 });
    expect(fs.existsSync(ralphDir)).toBe(true);
  });

  test('writes a JSON state file', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    state.init(ralphDir, { active: true, iteration: 1, maxIterations: 10 });
    const filePath = state.statePath(ralphDir);
    expect(fs.existsSync(filePath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(parsed.active).toBe(true);
    expect(parsed.iteration).toBe(1);
    expect(parsed.maxIterations).toBe(10);
  });

  test('overwrites existing state file on re-init', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    state.init(ralphDir, { active: true, iteration: 1 });
    state.init(ralphDir, { active: false, iteration: 5 });
    const parsed = state.read(ralphDir);
    expect(parsed.iteration).toBe(5);
    expect(parsed.active).toBe(false);
  });
});

describe('state.read()', () => {
  test('returns null when state file does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    expect(state.read(ralphDir)).toBeNull();
  });

  test('returns null when state file contains invalid JSON', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    fs.writeFileSync(state.statePath(ralphDir), 'not-json', 'utf8');
    expect(state.read(ralphDir)).toBeNull();
  });

  test('returns parsed state object', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const data = { active: true, iteration: 3, tasksMode: true };
    state.init(ralphDir, data);
    const result = state.read(ralphDir);
    expect(result.active).toBe(true);
    expect(result.iteration).toBe(3);
    expect(result.tasksMode).toBe(true);
  });
});

describe('state.update()', () => {
  test('merges fields into existing state', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    state.init(ralphDir, { active: true, iteration: 1, maxIterations: 50 });
    state.update(ralphDir, { iteration: 2, active: false });
    const result = state.read(ralphDir);
    expect(result.iteration).toBe(2);
    expect(result.active).toBe(false);
    // Original field preserved
    expect(result.maxIterations).toBe(50);
  });

  test('creates state file if none exists', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    state.update(ralphDir, { active: true });
    const result = state.read(ralphDir);
    expect(result.active).toBe(true);
  });

  test('creates ralphDir if it does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph-missing');
    state.update(ralphDir, { foo: 'bar' });
    expect(fs.existsSync(ralphDir)).toBe(true);
  });

  test('preserves explicit stopped and completion lifecycle fields', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    state.init(ralphDir, {
      active: true,
      iteration: 1,
      completedAt: '2026-04-11T00:00:00.000Z',
      stoppedAt: null,
      exitReason: null,
    });

    state.update(ralphDir, {
      active: false,
      completedAt: null,
      stoppedAt: '2026-04-11T01:00:00.000Z',
      exitReason: 'max_iterations',
    });

    const result = state.read(ralphDir);
    expect(result.active).toBe(false);
    expect(result.completedAt).toBeNull();
    expect(result.stoppedAt).toBe('2026-04-11T01:00:00.000Z');
    expect(result.exitReason).toBe('max_iterations');
  });
});

describe('state.remove()', () => {
  test('deletes the state file', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    state.init(ralphDir, { active: true });
    state.remove(ralphDir);
    expect(fs.existsSync(state.statePath(ralphDir))).toBe(false);
  });

  test('is a no-op when state file does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    // Should not throw
    expect(() => state.remove(ralphDir)).not.toThrow();
  });
});

describe('run lock lifecycle', () => {
  test('acquireRunLock writes a lock file and releaseRunLock removes it', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const lock = state.acquireRunLock(ralphDir, { tasksMode: true });

    expect(fs.existsSync(state.lockPath(ralphDir))).toBe(true);
    expect(state.readRunLock(ralphDir)).toMatchObject({
      pid: process.pid,
      tasksMode: true,
    });

    state.releaseRunLock(ralphDir, lock);
    expect(fs.existsSync(state.lockPath(ralphDir))).toBe(false);
  });

  test('acquireRunLock rejects when an existing live lock is present', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      fs.mkdirSync(ralphDir, { recursive: true });
      fs.writeFileSync(
        state.lockPath(ralphDir),
        JSON.stringify({ pid: 43210, acquiredAt: '2026-01-01T00:00:00.000Z' }, null, 2),
        'utf8'
      );

      expect(() => state.acquireRunLock(ralphDir)).toThrow(/already active/);
      expect(state.readRunLock(ralphDir)).toMatchObject({ pid: 43210 });
    } finally {
      killSpy.mockRestore();
    }
  });

  test('acquireRunLock replaces a stale lock', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('no such process');
      err.code = 'ESRCH';
      throw err;
    });

    try {
      fs.mkdirSync(ralphDir, { recursive: true });
      fs.writeFileSync(
        state.lockPath(ralphDir),
        JSON.stringify({ pid: 43210, acquiredAt: '2026-01-01T00:00:00.000Z' }, null, 2),
        'utf8'
      );

      const lock = state.acquireRunLock(ralphDir, { tasksFile: '/tmp/tasks.md' });
      expect(lock.pid).toBe(process.pid);
      expect(state.readRunLock(ralphDir)).toMatchObject({
        pid: process.pid,
        tasksFile: '/tmp/tasks.md',
      });
      state.releaseRunLock(ralphDir, lock);
    } finally {
      killSpy.mockRestore();
    }
  });
});

describe('atomic writes', () => {
  test('does not leave a temp file behind on a successful write', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    state.init(ralphDir, { active: true, iteration: 1 });
    state.update(ralphDir, { iteration: 2 });
    state.update(ralphDir, { iteration: 3 });

    const entries = fs.readdirSync(ralphDir);
    const tmpFiles = entries.filter((name) => name.includes('.tmp-'));
    expect(tmpFiles).toEqual([]);
    expect(state.read(ralphDir).iteration).toBe(3);
  });

  test('read() tolerates a missing state file and returns null', () => {
    const ralphDir = path.join(tmpDir, '.ralph-empty');
    // Directory does not exist yet.
    expect(state.read(ralphDir)).toBeNull();
    // Directory exists but file does not.
    fs.mkdirSync(ralphDir, { recursive: true });
    expect(state.read(ralphDir)).toBeNull();
  });

  test('read() returns null rather than throwing on a corrupted state file', () => {
    const ralphDir = path.join(tmpDir, '.ralph-corrupt');
    fs.mkdirSync(ralphDir, { recursive: true });
    fs.writeFileSync(state.statePath(ralphDir), '{not valid json', 'utf8');
    expect(state.read(ralphDir)).toBeNull();
  });
});

describe('state fields include required loop metadata', () => {
  test('stores all required loop startup fields', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    const data = {
      active: true,
      iteration: 1,
      minIterations: 1,
      maxIterations: 50,
      completionPromise: 'COMPLETE',
      taskPromise: 'READY_FOR_NEXT_TASK',
      tasksMode: true,
      promptFile: '/some/prompt.md',
      noCommit: false,
      model: '',
      startedAt: new Date().toISOString(),
    };
    state.init(ralphDir, data);
    const result = state.read(ralphDir);
    expect(result.active).toBe(true);
    expect(result.minIterations).toBe(1);
    expect(result.maxIterations).toBe(50);
    expect(result.completionPromise).toBe('COMPLETE');
    expect(result.taskPromise).toBe('READY_FOR_NEXT_TASK');
    expect(result.tasksMode).toBe(true);
    expect(result.promptFile).toBe('/some/prompt.md');
    expect(result.noCommit).toBe(false);
    expect(result.startedAt).toBeDefined();
  });
});
