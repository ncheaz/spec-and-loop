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
