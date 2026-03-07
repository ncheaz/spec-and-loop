'use strict';

/**
 * Unit tests for lib/mini-ralph/history.js
 *
 * Tests iteration history persistence: reading, appending, recent slicing,
 * and clearing history under the .ralph/ directory.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const history = require('../../../lib/mini-ralph/history');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-history-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('history.historyPath()', () => {
  test('returns path to ralph-history.json inside ralphDir', () => {
    const p = history.historyPath('/some/dir');
    expect(p).toBe(path.join('/some/dir', 'ralph-history.json'));
  });
});

describe('history.read()', () => {
  test('returns empty array when history file does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    expect(history.read(ralphDir)).toEqual([]);
  });

  test('returns empty array when history file contains invalid JSON', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    fs.writeFileSync(history.historyPath(ralphDir), 'not-json', 'utf8');
    expect(history.read(ralphDir)).toEqual([]);
  });

  test('returns empty array when history file contains a non-array JSON value', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    fs.writeFileSync(history.historyPath(ralphDir), JSON.stringify({ foo: 'bar' }), 'utf8');
    expect(history.read(ralphDir)).toEqual([]);
  });

  test('returns the stored array of entries', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    const entries = [
      { iteration: 1, duration: 1000, completionDetected: false },
      { iteration: 2, duration: 2000, completionDetected: true },
    ];
    fs.writeFileSync(history.historyPath(ralphDir), JSON.stringify(entries), 'utf8');
    const result = history.read(ralphDir);
    expect(result).toHaveLength(2);
    expect(result[0].iteration).toBe(1);
    expect(result[1].completionDetected).toBe(true);
  });
});

describe('history.append()', () => {
  test('creates ralphDir if it does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph-new');
    expect(fs.existsSync(ralphDir)).toBe(false);
    history.append(ralphDir, { iteration: 1, duration: 500 });
    expect(fs.existsSync(ralphDir)).toBe(true);
  });

  test('creates history file if it does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    history.append(ralphDir, { iteration: 1, duration: 500 });
    expect(fs.existsSync(history.historyPath(ralphDir))).toBe(true);
  });

  test('appends an entry to empty history', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    history.append(ralphDir, { iteration: 1, duration: 1000, completionDetected: false });
    const entries = history.read(ralphDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].iteration).toBe(1);
    expect(entries[0].duration).toBe(1000);
  });

  test('appends multiple entries in order', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    history.append(ralphDir, { iteration: 1, duration: 1000 });
    history.append(ralphDir, { iteration: 2, duration: 2000 });
    history.append(ralphDir, { iteration: 3, duration: 3000 });
    const entries = history.read(ralphDir);
    expect(entries).toHaveLength(3);
    expect(entries[2].iteration).toBe(3);
  });

  test('adds a timestamp to each appended entry', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    history.append(ralphDir, { iteration: 1, duration: 500 });
    const entries = history.read(ralphDir);
    expect(entries[0].timestamp).toBeDefined();
    // Should be a valid ISO string
    expect(() => new Date(entries[0].timestamp).toISOString()).not.toThrow();
  });

  test('stores all required iteration fields', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    history.append(ralphDir, {
      iteration: 1,
      duration: 12345,
      completionDetected: true,
      taskDetected: false,
      toolUsage: [{ tool: 'Read', count: 3 }],
      filesChanged: ['src/foo.js'],
      exitCode: 0,
    });
    const entries = history.read(ralphDir);
    expect(entries[0].completionDetected).toBe(true);
    expect(entries[0].taskDetected).toBe(false);
    expect(entries[0].toolUsage).toEqual([{ tool: 'Read', count: 3 }]);
    expect(entries[0].filesChanged).toEqual(['src/foo.js']);
    expect(entries[0].exitCode).toBe(0);
  });
});

describe('history.recent()', () => {
  test('returns empty array when no history exists', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    expect(history.recent(ralphDir, 5)).toEqual([]);
  });

  test('returns the last N entries', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    for (let i = 1; i <= 8; i++) {
      history.append(ralphDir, { iteration: i });
    }
    const result = history.recent(ralphDir, 3);
    expect(result).toHaveLength(3);
    expect(result[0].iteration).toBe(6);
    expect(result[2].iteration).toBe(8);
  });

  test('returns all entries when count exceeds history length', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    history.append(ralphDir, { iteration: 1 });
    history.append(ralphDir, { iteration: 2 });
    const result = history.recent(ralphDir, 10);
    expect(result).toHaveLength(2);
  });

  test('defaults to 5 most recent entries', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    for (let i = 1; i <= 7; i++) {
      history.append(ralphDir, { iteration: i });
    }
    const result = history.recent(ralphDir);
    expect(result).toHaveLength(5);
    expect(result[result.length - 1].iteration).toBe(7);
  });
});

describe('history.clear()', () => {
  test('empties the history file', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    history.append(ralphDir, { iteration: 1 });
    history.append(ralphDir, { iteration: 2 });
    history.clear(ralphDir);
    expect(history.read(ralphDir)).toEqual([]);
  });

  test('creates the history file even when nothing existed', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    history.clear(ralphDir);
    expect(fs.existsSync(history.historyPath(ralphDir))).toBe(true);
    expect(history.read(ralphDir)).toEqual([]);
  });
});
