'use strict';

/**
 * Unit tests for lib/mini-ralph/status.js
 *
 * Tests the status dashboard renderer output for various combinations of
 * loop state, history, pending context, and task progress.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { render, _elapsed, _detectStruggles, _formatToolUsage } = require('../../../lib/mini-ralph/status');
const state = require('../../../lib/mini-ralph/state');
const history = require('../../../lib/mini-ralph/history');
const context = require('../../../lib/mini-ralph/context');

let tmpDir;
let ralphDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-status-test-'));
  ralphDir = path.join(tmpDir, '.ralph');
  fs.mkdirSync(ralphDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// _elapsed
// ---------------------------------------------------------------------------

describe('_elapsed()', () => {
  test('returns seconds for short durations', () => {
    const start = new Date(Date.now() - 30 * 1000).toISOString();
    expect(_elapsed(start)).toMatch(/^\d+s$/);
  });

  test('returns minutes+seconds for medium durations', () => {
    const start = new Date(Date.now() - 90 * 1000).toISOString();
    expect(_elapsed(start)).toMatch(/^\d+m \d+s$/);
  });

  test('returns hours+minutes for long durations', () => {
    const start = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    expect(_elapsed(start)).toMatch(/^\d+h \d+m$/);
  });

  test('returns "unknown" for invalid ISO string', () => {
    expect(_elapsed('not-a-date')).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// _formatToolUsage
// ---------------------------------------------------------------------------

describe('_formatToolUsage()', () => {
  test('returns empty string for empty array', () => {
    expect(_formatToolUsage([])).toBe('');
  });

  test('returns empty string for null/undefined', () => {
    expect(_formatToolUsage(null)).toBe('');
    expect(_formatToolUsage(undefined)).toBe('');
  });

  test('formats a single tool entry', () => {
    expect(_formatToolUsage([{ tool: 'bash', count: 3 }])).toBe('bash(3)');
  });

  test('formats multiple tool entries', () => {
    const result = _formatToolUsage([
      { tool: 'bash', count: 2 },
      { tool: 'read', count: 5 },
    ]);
    expect(result).toBe('bash(2), read(5)');
  });
});

// ---------------------------------------------------------------------------
// _detectStruggles
// ---------------------------------------------------------------------------

describe('_detectStruggles()', () => {
  test('returns empty when fewer than 2 entries', () => {
    expect(_detectStruggles([])).toEqual([]);
    expect(_detectStruggles([{ filesChanged: [], exitCode: 0 }])).toEqual([]);
  });

  test('detects no-progress when all recent iterations have no file changes', () => {
    const entries = [
      { filesChanged: [], exitCode: 0 },
      { filesChanged: [], exitCode: 0 },
      { filesChanged: [], exitCode: 0 },
    ];
    const warnings = _detectStruggles(entries);
    expect(warnings.some((w) => w.includes('No file changes'))).toBe(true);
  });

  test('does not flag no-progress if at least one iteration had changes', () => {
    const entries = [
      { filesChanged: ['a.js'], exitCode: 0 },
      { filesChanged: [], exitCode: 0 },
    ];
    const warnings = _detectStruggles(entries);
    expect(warnings.some((w) => w.includes('No file changes'))).toBe(false);
  });

  test('detects repeated errors when 2 or more non-zero exit codes', () => {
    const entries = [
      { filesChanged: [], exitCode: 1 },
      { filesChanged: [], exitCode: 1 },
    ];
    const warnings = _detectStruggles(entries);
    expect(warnings.some((w) => w.includes('exited with errors'))).toBe(true);
  });

  test('does not flag errors for a single non-zero exit code', () => {
    const entries = [
      { filesChanged: ['x.js'], exitCode: 0 },
      { filesChanged: [], exitCode: 1 },
    ];
    const warnings = _detectStruggles(entries);
    expect(warnings.some((w) => w.includes('exited with errors'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// render()
// ---------------------------------------------------------------------------

describe('render()', () => {
  test('returns a no-state message when .ralph dir is empty', () => {
    const emptyDir = path.join(tmpDir, '.empty-ralph');
    fs.mkdirSync(emptyDir, { recursive: true });
    const output = render(emptyDir);
    expect(output).toContain('No active or recent loop state found');
  });

  test('includes the header section', () => {
    state.init(ralphDir, {
      active: true,
      iteration: 2,
      maxIterations: 10,
      completionPromise: 'COMPLETE',
      taskPromise: 'READY_FOR_NEXT_TASK',
      tasksMode: false,
      startedAt: new Date().toISOString(),
    });
    const output = render(ralphDir);
    expect(output).toContain('=== mini-ralph status ===');
  });

  test('shows ACTIVE when loop is running', () => {
    state.init(ralphDir, {
      active: true,
      iteration: 3,
      maxIterations: 20,
      startedAt: new Date().toISOString(),
    });
    const output = render(ralphDir);
    expect(output).toContain('ACTIVE');
  });

  test('shows INACTIVE when loop is done', () => {
    state.init(ralphDir, {
      active: false,
      iteration: 5,
      maxIterations: 10,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    const output = render(ralphDir);
    expect(output).toContain('INACTIVE');
    expect(output).toContain('Completed:');
  });

  test('shows iteration and maxIterations', () => {
    state.init(ralphDir, {
      active: true,
      iteration: 4,
      maxIterations: 15,
      startedAt: new Date().toISOString(),
    });
    const output = render(ralphDir);
    expect(output).toContain('4 / 15');
  });

  test('shows prompt file when promptFile is set', () => {
    state.init(ralphDir, {
      active: false,
      iteration: 1,
      maxIterations: 5,
      promptFile: '/path/to/my-prompt.md',
      startedAt: new Date().toISOString(),
    });
    const output = render(ralphDir);
    expect(output).toContain('file: /path/to/my-prompt.md');
  });

  test('includes pending context in output', () => {
    state.init(ralphDir, {
      active: true,
      iteration: 1,
      maxIterations: 5,
      startedAt: new Date().toISOString(),
    });
    context.add(ralphDir, 'Some pending guidance for the next run.');
    const output = render(ralphDir);
    expect(output).toContain('Pending Context');
    expect(output).toContain('Some pending guidance');
  });

  test('does not show pending context section when context is empty', () => {
    state.init(ralphDir, {
      active: true,
      iteration: 1,
      maxIterations: 5,
      startedAt: new Date().toISOString(),
    });
    const output = render(ralphDir);
    expect(output).not.toContain('Pending Context');
  });

  test('shows recent history when entries exist', () => {
    state.init(ralphDir, {
      active: false,
      iteration: 2,
      maxIterations: 5,
      startedAt: new Date().toISOString(),
    });
    history.append(ralphDir, {
      iteration: 1,
      duration: 4200,
      completionDetected: false,
      taskDetected: true,
      toolUsage: [{ tool: 'bash', count: 2 }],
      filesChanged: ['a.js'],
      exitCode: 0,
    });
    history.append(ralphDir, {
      iteration: 2,
      duration: 6100,
      completionDetected: true,
      taskDetected: false,
      toolUsage: [],
      filesChanged: [],
      exitCode: 0,
    });
    const output = render(ralphDir);
    expect(output).toContain('Recent History');
    expect(output).toContain('Iteration 1');
    expect(output).toContain('[TASK]');
    expect(output).toContain('Iteration 2');
    expect(output).toContain('[COMPLETE]');
  });

  test('shows task progress when tasksFile is provided and readable', () => {
    const tasksFile = path.join(tmpDir, 'tasks.md');
    fs.writeFileSync(
      tasksFile,
      '- [x] Task one\n- [/] Task two\n- [ ] Task three\n'
    );
    state.init(ralphDir, {
      active: true,
      iteration: 2,
      maxIterations: 10,
      tasksMode: true,
      tasksFile,
      startedAt: new Date().toISOString(),
    });
    const output = render(ralphDir, tasksFile);
    expect(output).toContain('Tasks:');
    expect(output).toContain('completed');
  });

  test('shows struggle indicators when all iterations have no file changes', () => {
    state.init(ralphDir, {
      active: true,
      iteration: 3,
      maxIterations: 10,
      startedAt: new Date().toISOString(),
    });
    // append several no-progress entries
    for (let i = 1; i <= 3; i++) {
      history.append(ralphDir, {
        iteration: i,
        duration: 1000,
        completionDetected: false,
        taskDetected: false,
        toolUsage: [],
        filesChanged: [],
        exitCode: 0,
      });
    }
    const output = render(ralphDir);
    expect(output).toContain('Struggle Indicators');
    expect(output).toContain('No file changes');
  });
});
