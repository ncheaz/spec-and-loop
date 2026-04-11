'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const errors = require('../../../lib/mini-ralph/errors');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-errors-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('errors.errorsPath()', () => {
  test('returns path to errors.md inside ralphDir', () => {
    expect(errors.errorsPath('/some/dir')).toBe(path.join('/some/dir', 'errors.md'));
  });
});

describe('errors.read()', () => {
  test('returns empty string when errors file does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    expect(errors.read(ralphDir)).toBe('');
  });

  test('returns empty string when errors file is empty', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    fs.writeFileSync(errors.errorsPath(ralphDir), '', 'utf8');
    expect(errors.read(ralphDir)).toBe('');
  });

  test('returns all entries when no limit specified', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    errors.append(ralphDir, { iteration: 1, task: 'task a', exitCode: 1, stderr: 'err1', stdout: '' });
    errors.append(ralphDir, { iteration: 2, task: 'task b', exitCode: 1, stderr: 'err2', stdout: '' });
    const result = errors.read(ralphDir);
    expect(result).toContain('Iteration: 1');
    expect(result).toContain('Iteration: 2');
  });

  test('returns N most recent entries in chronological order', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    errors.append(ralphDir, { iteration: 1, task: 'task a', exitCode: 1, stderr: 'err1', stdout: '' });
    errors.append(ralphDir, { iteration: 2, task: 'task b', exitCode: 1, stderr: 'err2', stdout: '' });
    errors.append(ralphDir, { iteration: 3, task: 'task c', exitCode: 1, stderr: 'err3', stdout: '' });
    const result = errors.read(ralphDir, 2);
    expect(result).not.toContain('Iteration: 1');
    expect(result).toContain('Iteration: 2');
    expect(result).toContain('Iteration: 3');
    const idx2 = result.indexOf('Iteration: 2');
    const idx3 = result.indexOf('Iteration: 3');
    expect(idx2).toBeLessThan(idx3);
  });

  test('returns all entries when limit exceeds count', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    errors.append(ralphDir, { iteration: 1, task: 'task a', exitCode: 1, stderr: 'err1', stdout: '' });
    const result = errors.read(ralphDir, 10);
    expect(result).toContain('Iteration: 1');
  });
});

describe('errors.readEntries()', () => {
  test('returns empty array when errors file does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    expect(errors.readEntries(ralphDir)).toEqual([]);
  });

  test('returns parsed entries in chronological order', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    errors.append(ralphDir, { iteration: 1, task: 'task a', exitCode: 1, stderr: 'err1', stdout: 'out1' });
    errors.append(ralphDir, { iteration: 2, task: 'task b', exitCode: 2, stderr: 'err2', stdout: 'out2' });

    const result = errors.readEntries(ralphDir);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ iteration: 1, task: 'task a', exitCode: 1, stderr: 'err1', stdout: 'out1' });
    expect(result[1]).toMatchObject({ iteration: 2, task: 'task b', exitCode: 2, stderr: 'err2', stdout: 'out2' });
    expect(result[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('returns bounded most recent entries in chronological order', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    for (let i = 1; i <= 5; i++) {
      errors.append(ralphDir, { iteration: i, task: `task ${i}`, exitCode: i, stderr: `err${i}`, stdout: '' });
    }

    const result = errors.readEntries(ralphDir, 3);

    expect(result).toHaveLength(3);
    expect(result.map((entry) => entry.iteration)).toEqual([3, 4, 5]);
  });
});

describe('errors.count()', () => {
  test('returns 0 when errors file does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    expect(errors.count(ralphDir)).toBe(0);
  });

  test('counts all persisted entries', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    for (let i = 1; i <= 5; i++) {
      errors.append(ralphDir, { iteration: i, task: `task ${i}`, exitCode: 1, stderr: `err${i}`, stdout: '' });
    }
    expect(errors.count(ralphDir)).toBe(5);
  });
});

describe('errors.latest()', () => {
  test('returns null when errors file does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    expect(errors.latest(ralphDir)).toBeNull();
  });

  test('returns the most recent parsed entry', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    errors.append(ralphDir, { iteration: 1, task: 'task a', exitCode: 1, stderr: 'err1', stdout: '' });
    errors.append(ralphDir, { iteration: 2, task: 'task b', exitCode: 2, stderr: '', stdout: 'out2' });

    expect(errors.latest(ralphDir)).toMatchObject({
      iteration: 2,
      task: 'task b',
      exitCode: 2,
      stderr: '',
      stdout: 'out2',
    });
  });
});

describe('errors.append()', () => {
  test('creates ralphDir if it does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph-new');
    expect(fs.existsSync(ralphDir)).toBe(false);
    errors.append(ralphDir, { iteration: 1, task: 'test', exitCode: 1, stderr: 'err', stdout: '' });
    expect(fs.existsSync(ralphDir)).toBe(true);
  });

  test('creates errors file with structured markdown entry', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    errors.append(ralphDir, { iteration: 3, task: '2.1 Implement handler', exitCode: 1, stderr: 'stack trace', stdout: 'output' });
    const content = fs.readFileSync(errors.errorsPath(ralphDir), 'utf8');
    expect(content).toMatch(/^---$/m);
    expect(content).toMatch(/Timestamp: \d{4}-\d{2}-\d{2}T/);
    expect(content).toContain('Iteration: 3');
    expect(content).toContain('Task: 2.1 Implement handler');
    expect(content).toContain('Exit Code: 1');
    expect(content).toContain('### stderr');
    expect(content).toContain('stack trace');
    expect(content).toContain('### stdout');
    expect(content).toContain('output');
  });

  test('appends multiple entries with --- delimiter', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    errors.append(ralphDir, { iteration: 1, task: 'task a', exitCode: 1, stderr: 'err1', stdout: '' });
    errors.append(ralphDir, { iteration: 2, task: 'task b', exitCode: 2, stderr: 'err2', stdout: 'out2' });
    const content = fs.readFileSync(errors.errorsPath(ralphDir), 'utf8');
    const delimiters = content.match(/^---$/gm);
    expect(delimiters.length).toBe(2);
  });

  test('handles empty stderr and stdout', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    errors.append(ralphDir, { iteration: 1, task: 'test', exitCode: 1, stderr: '', stdout: '' });
    const content = fs.readFileSync(errors.errorsPath(ralphDir), 'utf8');
    expect(content).toContain('### stderr\n\n');
    expect(content).toContain('### stdout\n\n');
  });

  test('uses ISO 8601 timestamp', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    errors.append(ralphDir, { iteration: 1, task: 'test', exitCode: 1, stderr: 'err', stdout: '' });
    const content = fs.readFileSync(errors.errorsPath(ralphDir), 'utf8');
    const match = content.match(/Timestamp: (\S+)/);
    expect(match).not.toBeNull();
    const date = new Date(match[1]);
    expect(date.getTime()).not.toBeNaN();
  });
});

describe('errors.clear()', () => {
  test('removes the errors file', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    errors.append(ralphDir, { iteration: 1, task: 'test', exitCode: 1, stderr: 'err', stdout: '' });
    expect(fs.existsSync(errors.errorsPath(ralphDir))).toBe(true);
    errors.clear(ralphDir);
    expect(fs.existsSync(errors.errorsPath(ralphDir))).toBe(false);
  });

  test('is a no-op when errors file does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    expect(() => errors.clear(ralphDir)).not.toThrow();
  });
});

describe('errors.archive()', () => {
  test('copies errors file to archive with timestamp suffix', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    errors.append(ralphDir, { iteration: 1, task: 'test', exitCode: 1, stderr: 'err', stdout: '' });
    const archivePath = errors.archive(ralphDir);
    expect(archivePath).not.toBeNull();
    expect(fs.existsSync(archivePath)).toBe(true);
    expect(archivePath).toMatch(/errors_\d{4}-\d{2}-\d{2}T.*\.md$/);
    const original = fs.readFileSync(errors.errorsPath(ralphDir), 'utf8');
    const archived = fs.readFileSync(archivePath, 'utf8');
    expect(archived).toBe(original);
  });

  test('returns null when errors file does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    expect(errors.archive(ralphDir)).toBeNull();
  });

  test('does not delete the original errors file', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    errors.append(ralphDir, { iteration: 1, task: 'test', exitCode: 1, stderr: 'err', stdout: '' });
    errors.archive(ralphDir);
    expect(fs.existsSync(errors.errorsPath(ralphDir))).toBe(true);
  });
});

describe('index.js exports _errors', () => {
  test('mini-ralph index exports _errors module', () => {
    const miniRalph = require('../../../lib/mini-ralph');
    expect(miniRalph._errors).toBeDefined();
    expect(miniRalph._errors.errorsPath).toBeInstanceOf(Function);
    expect(miniRalph._errors.read).toBeInstanceOf(Function);
    expect(miniRalph._errors.readEntries).toBeInstanceOf(Function);
    expect(miniRalph._errors.count).toBeInstanceOf(Function);
    expect(miniRalph._errors.latest).toBeInstanceOf(Function);
    expect(miniRalph._errors.append).toBeInstanceOf(Function);
    expect(miniRalph._errors.clear).toBeInstanceOf(Function);
    expect(miniRalph._errors.archive).toBeInstanceOf(Function);
  });

  test('mini-ralph index context and status wrappers work', () => {
    const miniRalph = require('../../../lib/mini-ralph');
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);

    miniRalph.addContext(ralphDir, 'wrapper context');
    expect(miniRalph._context.read(ralphDir)).toBe('wrapper context');

    miniRalph.clearContext(ralphDir);
    expect(miniRalph._context.read(ralphDir)).toBe('');

    expect(miniRalph.getStatus(ralphDir)).toContain('No active or recent loop state found');
  });

  test('mini-ralph index run delegates to runner', async () => {
    const miniRalph = require('../../../lib/mini-ralph');
    const runSpy = jest.spyOn(miniRalph._runner, 'run').mockResolvedValue({ completed: true });

    try {
      await expect(miniRalph.run({ some: 'option' })).resolves.toEqual({ completed: true });
      expect(runSpy).toHaveBeenCalledWith({ some: 'option' });
    } finally {
      runSpy.mockRestore();
    }
  });
});
