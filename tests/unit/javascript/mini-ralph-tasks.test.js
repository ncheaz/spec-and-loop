'use strict';

/**
 * Unit tests for lib/mini-ralph/tasks.js
 *
 * Tests task file helpers: symlink creation, task parsing, current task
 * selection, file hashing, and task counting.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const tasks = require('../../../lib/mini-ralph/tasks');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-tasks-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function writeTasks(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// tasks.tasksLinkPath()
// ---------------------------------------------------------------------------

describe('tasks.tasksLinkPath()', () => {
  test('returns path to ralph-tasks.md inside ralphDir', () => {
    const p = tasks.tasksLinkPath('/some/dir');
    expect(p).toBe(path.join('/some/dir', 'ralph-tasks.md'));
  });
});

// ---------------------------------------------------------------------------
// tasks.syncLink()
// ---------------------------------------------------------------------------

describe('tasks.syncLink()', () => {
  test('creates ralphDir if it does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph-new');
    const tasksFile = path.join(tmpDir, 'tasks.md');
    writeTasks(tasksFile, '- [ ] 1.1 Task one\n');
    expect(fs.existsSync(ralphDir)).toBe(false);
    tasks.syncLink(ralphDir, tasksFile);
    expect(fs.existsSync(ralphDir)).toBe(true);
  });

  test('creates a symlink at .ralph/ralph-tasks.md pointing to the tasks file', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    const tasksFile = path.join(tmpDir, 'tasks.md');
    writeTasks(tasksFile, '- [ ] 1.1 Task one\n');
    tasks.syncLink(ralphDir, tasksFile);
    const linkPath = tasks.tasksLinkPath(ralphDir);
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    // Symlink target resolves to the tasks file
    const resolved = fs.realpathSync(linkPath);
    expect(resolved).toBe(fs.realpathSync(tasksFile));
  });

  test('replaces an existing symlink', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    const tasksFile1 = path.join(tmpDir, 'tasks1.md');
    const tasksFile2 = path.join(tmpDir, 'tasks2.md');
    writeTasks(tasksFile1, '- [ ] 1.1 Old task\n');
    writeTasks(tasksFile2, '- [ ] 2.1 New task\n');
    tasks.syncLink(ralphDir, tasksFile1);
    tasks.syncLink(ralphDir, tasksFile2);
    const linkPath = tasks.tasksLinkPath(ralphDir);
    const resolved = fs.realpathSync(linkPath);
    expect(resolved).toBe(fs.realpathSync(tasksFile2));
  });

  test('throws a clear error when tasks file does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    expect(() => tasks.syncLink(ralphDir, '/does/not/exist.md')).toThrow(
      /tasks file not found/
    );
  });
});

// ---------------------------------------------------------------------------
// tasks.parseTasks()
// ---------------------------------------------------------------------------

describe('tasks.parseTasks()', () => {
  test('returns empty array when file does not exist', () => {
    expect(tasks.parseTasks('/does/not/exist.md')).toEqual([]);
  });

  test('parses incomplete tasks', () => {
    const file = path.join(tmpDir, 'tasks.md');
    writeTasks(file, '- [ ] 1.1 First task\n- [ ] 1.2 Second task\n');
    const result = tasks.parseTasks(file);
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('incomplete');
    expect(result[0].number).toBe('1.1');
    expect(result[0].description).toBe('First task');
  });

  test('parses in-progress tasks', () => {
    const file = path.join(tmpDir, 'tasks.md');
    writeTasks(file, '- [/] 2.3 In progress task\n');
    const result = tasks.parseTasks(file);
    expect(result[0].status).toBe('in_progress');
    expect(result[0].number).toBe('2.3');
  });

  test('parses completed tasks', () => {
    const file = path.join(tmpDir, 'tasks.md');
    writeTasks(file, '- [x] 3.1 Done task\n');
    const result = tasks.parseTasks(file);
    expect(result[0].status).toBe('completed');
    expect(result[0].number).toBe('3.1');
  });

  test('handles mixed task statuses', () => {
    const content = [
      '## Section 1',
      '',
      '- [x] 1.1 Completed one',
      '- [/] 1.2 In progress one',
      '- [ ] 1.3 Incomplete one',
      '',
    ].join('\n');
    const file = path.join(tmpDir, 'tasks.md');
    writeTasks(file, content);
    const result = tasks.parseTasks(file);
    expect(result).toHaveLength(3);
    expect(result[0].status).toBe('completed');
    expect(result[1].status).toBe('in_progress');
    expect(result[2].status).toBe('incomplete');
  });

  test('ignores heading lines and blank lines', () => {
    const content = '## Section\n\n- [x] 1.1 Task A\n\nSome prose text\n- [ ] 1.2 Task B\n';
    const file = path.join(tmpDir, 'tasks.md');
    writeTasks(file, content);
    const result = tasks.parseTasks(file);
    expect(result).toHaveLength(2);
  });

  test('stores raw line in each task object', () => {
    const file = path.join(tmpDir, 'tasks.md');
    writeTasks(file, '- [x] 1.1 Completed task\n');
    const result = tasks.parseTasks(file);
    expect(result[0].raw).toBe('- [x] 1.1 Completed task');
  });

  test('handles tasks without a numeric prefix', () => {
    const file = path.join(tmpDir, 'tasks.md');
    writeTasks(file, '- [ ] No number here\n');
    const result = tasks.parseTasks(file);
    expect(result[0].number).toBe('');
    expect(result[0].description).toBe('No number here');
  });

  test('stores fullDescription with the leading number', () => {
    const file = path.join(tmpDir, 'tasks.md');
    writeTasks(file, '- [x] 1.2 Task description\n');
    const result = tasks.parseTasks(file);
    expect(result[0].fullDescription).toBe('1.2 Task description');
  });
});

// ---------------------------------------------------------------------------
// tasks.currentTask()
// ---------------------------------------------------------------------------

describe('tasks.currentTask()', () => {
  test('returns null when file does not exist', () => {
    expect(tasks.currentTask('/does/not/exist.md')).toBeNull();
  });

  test('returns null when all tasks are completed', () => {
    const file = path.join(tmpDir, 'tasks.md');
    writeTasks(file, '- [x] 1.1 Done\n- [x] 1.2 Also done\n');
    expect(tasks.currentTask(file)).toBeNull();
  });

  test('returns in-progress task before incomplete tasks', () => {
    const content = '- [ ] 1.1 Todo\n- [/] 1.2 In progress\n- [ ] 1.3 Another todo\n';
    const file = path.join(tmpDir, 'tasks.md');
    writeTasks(file, content);
    const result = tasks.currentTask(file);
    expect(result).not.toBeNull();
    expect(result.status).toBe('in_progress');
    expect(result.number).toBe('1.2');
  });

  test('returns first incomplete task when none are in-progress', () => {
    const content = '- [x] 1.1 Done\n- [ ] 1.2 Todo\n- [ ] 1.3 Todo 2\n';
    const file = path.join(tmpDir, 'tasks.md');
    writeTasks(file, content);
    const result = tasks.currentTask(file);
    expect(result).not.toBeNull();
    expect(result.number).toBe('1.2');
  });
});

// ---------------------------------------------------------------------------
// tasks.hashFile()
// ---------------------------------------------------------------------------

describe('tasks.hashFile()', () => {
  test('returns "0" when file does not exist', () => {
    expect(tasks.hashFile('/does/not/exist.md')).toBe('0');
  });

  test('returns a non-zero hex string for an existing file', () => {
    const file = path.join(tmpDir, 'tasks.md');
    writeTasks(file, '- [ ] 1.1 Task\n');
    const hash = tasks.hashFile(file);
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  test('returns different hashes for different file contents', () => {
    const file1 = path.join(tmpDir, 'tasks1.md');
    const file2 = path.join(tmpDir, 'tasks2.md');
    writeTasks(file1, '- [ ] 1.1 Task A\n');
    writeTasks(file2, '- [x] 1.1 Task A\n');
    expect(tasks.hashFile(file1)).not.toBe(tasks.hashFile(file2));
  });

  test('returns the same hash for identical file contents', () => {
    const file1 = path.join(tmpDir, 'tasks1.md');
    const file2 = path.join(tmpDir, 'tasks2.md');
    const content = '- [ ] 1.1 Task A\n';
    writeTasks(file1, content);
    writeTasks(file2, content);
    expect(tasks.hashFile(file1)).toBe(tasks.hashFile(file2));
  });
});

// ---------------------------------------------------------------------------
// tasks.countTasks()
// ---------------------------------------------------------------------------

describe('tasks.countTasks()', () => {
  test('returns zeros for a file with no tasks', () => {
    const file = path.join(tmpDir, 'tasks.md');
    writeTasks(file, '## No tasks yet\n');
    const counts = tasks.countTasks(file);
    expect(counts.total).toBe(0);
    expect(counts.completed).toBe(0);
    expect(counts.inProgress).toBe(0);
    expect(counts.incomplete).toBe(0);
  });

  test('counts tasks by status correctly', () => {
    const content = [
      '- [x] 1.1 Done',
      '- [x] 1.2 Also done',
      '- [/] 1.3 In progress',
      '- [ ] 1.4 Todo',
      '- [ ] 1.5 Todo 2',
    ].join('\n');
    const file = path.join(tmpDir, 'tasks.md');
    writeTasks(file, content);
    const counts = tasks.countTasks(file);
    expect(counts.total).toBe(5);
    expect(counts.completed).toBe(2);
    expect(counts.inProgress).toBe(1);
    expect(counts.incomplete).toBe(2);
  });

  test('returns zeros for non-existent file', () => {
    const counts = tasks.countTasks('/does/not/exist.md');
    expect(counts.total).toBe(0);
    expect(counts.completed).toBe(0);
  });
});

