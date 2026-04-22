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

const {
  render,
  _elapsed,
  _detectStruggles,
  _formatToolUsage,
  _formatErrorPreview,
  _latestCommitAnomaly,
  _formatHistoryFailure,
  _isFailedHistoryEntry,
} = require('../../../lib/mini-ralph/status');
const state = require('../../../lib/mini-ralph/state');
const history = require('../../../lib/mini-ralph/history');
const context = require('../../../lib/mini-ralph/context');
const errors = require('../../../lib/mini-ralph/errors');
const tasks = require('../../../lib/mini-ralph/tasks');
const prompt = require('../../../lib/mini-ralph/prompt');

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

describe('_formatErrorPreview()', () => {
  test('prefers stderr content', () => {
    expect(_formatErrorPreview({ stderr: 'stderr preview', stdout: 'stdout preview' })).toBe('stderr preview');
  });

  test('falls back to stdout when stderr is empty', () => {
    expect(_formatErrorPreview({ stderr: '', stdout: 'stdout preview' })).toBe('stdout preview');
  });

  test('falls back to task and exit code when streams are empty', () => {
    expect(_formatErrorPreview({ stderr: '', stdout: '', task: '1.1 Task', exitCode: 7 })).toBe('1.1 Task | exit code 7');
  });

  test('bounds preview to 200 characters', () => {
    const preview = _formatErrorPreview({ stderr: 'x'.repeat(300), stdout: '' });
    expect(preview).toHaveLength(200);
  });

  test('includes signal and failure stage metadata in the preview', () => {
    expect(_formatErrorPreview({
      stderr: 'terminated by signal',
      stdout: '',
      signal: 'SIGTERM',
      failureStage: 'invoke_contract',
    })).toBe('signal SIGTERM | stage invoke_contract | terminated by signal');
  });
});

describe('_formatHistoryFailure()', () => {
  test('formats signal, failure stage, and exit code failures', () => {
    expect(_formatHistoryFailure({ signal: 'SIGTERM' })).toBe('signal SIGTERM');
    expect(_formatHistoryFailure({ signal: '', failureStage: 'prompt_render' })).toBe('stage prompt_render');
    expect(_formatHistoryFailure({ signal: '', failureStage: '', exitCode: 7 })).toBe('exit code 7');
    expect(_formatHistoryFailure({ signal: '', failureStage: '', exitCode: 0 })).toBe('');
  });
});

describe('_isFailedHistoryEntry()', () => {
  test('treats signal and failure-stage entries as failures', () => {
    expect(_isFailedHistoryEntry({ exitCode: 0, signal: 'SIGTERM', failureStage: '' })).toBe(true);
    expect(_isFailedHistoryEntry({ exitCode: null, signal: '', failureStage: 'prompt_render' })).toBe(true);
    expect(_isFailedHistoryEntry({ exitCode: 1, signal: '', failureStage: '' })).toBe(true);
    expect(_isFailedHistoryEntry({ exitCode: 0, signal: '', failureStage: '' })).toBe(false);
  });
});

describe('_latestCommitAnomaly()', () => {
  test('returns the newest history entry with a commit anomaly', () => {
    expect(_latestCommitAnomaly([
      { iteration: 1, commitAnomaly: '' },
      { iteration: 2, commitAnomaly: 'older anomaly' },
      { iteration: 3, commitAnomaly: 'newest anomaly' },
    ])).toEqual(expect.objectContaining({ iteration: 3 }));
  });

  test('returns null when recent history has no commit anomaly', () => {
    expect(_latestCommitAnomaly([{ iteration: 1, commitAnomaly: '' }])).toBeNull();
  });
});

describe('tasks helpers', () => {
  test('parseTasks extracts statuses and descriptions', () => {
    const tasksFile = path.join(tmpDir, 'tasks.md');
    fs.writeFileSync(tasksFile, '- [x] 1.1 Done task\n- [/] 1.2 Active task\n- [ ] 1.3 Next task\n');

    expect(tasks.parseTasks(tasksFile)).toEqual([
      expect.objectContaining({ number: '1.1', description: 'Done task', fullDescription: '1.1 Done task', status: 'completed' }),
      expect.objectContaining({ number: '1.2', description: 'Active task', fullDescription: '1.2 Active task', status: 'in_progress' }),
      expect.objectContaining({ number: '1.3', description: 'Next task', fullDescription: '1.3 Next task', status: 'incomplete' }),
    ]);
  });

  test('currentTask prefers in-progress and countTasks summarizes statuses', () => {
    const tasksFile = path.join(tmpDir, 'tasks.md');
    fs.writeFileSync(tasksFile, '- [x] 1.1 Done task\n- [/] 1.2 Active task\n- [ ] 1.3 Next task\n');

    expect(tasks.currentTask(tasksFile)).toEqual(expect.objectContaining({ fullDescription: '1.2 Active task' }));
    expect(tasks.countTasks(tasksFile)).toEqual({ total: 3, completed: 1, inProgress: 1, incomplete: 1 });
    expect(tasks.hashFile(tasksFile)).toMatch(/^[a-f0-9]{32}$/);
  });

  test('taskContext lists current task and progress only', () => {
    const tasksFile = path.join(tmpDir, 'tasks.md');
    fs.writeFileSync(tasksFile, '- [x] 1.1 Done task\n- [ ] 1.2 Next task\n');

    const output = tasks.taskContext(tasksFile);
    expect(output).toContain('## Current Task');
    expect(output).toContain('- 1.2 Next task');
    expect(output).toContain('## Progress');
    expect(output).not.toContain('## Completed Tasks for Git Commit');
    expect(output).not.toContain('- [x] 1.1 Done task');
  });

  test('syncLink creates and replaces the managed symlink', () => {
    const linkedRalphDir = path.join(tmpDir, '.ralph-linked');
    const firstTasksFile = path.join(tmpDir, 'first-tasks.md');
    const secondTasksFile = path.join(tmpDir, 'second-tasks.md');
    fs.writeFileSync(firstTasksFile, '- [ ] 1.1 First\n');
    fs.writeFileSync(secondTasksFile, '- [ ] 1.2 Second\n');

    tasks.syncLink(linkedRalphDir, firstTasksFile);
    expect(fs.realpathSync(tasks.tasksLinkPath(linkedRalphDir))).toBe(fs.realpathSync(firstTasksFile));

    tasks.syncLink(linkedRalphDir, secondTasksFile);
    expect(fs.realpathSync(tasks.tasksLinkPath(linkedRalphDir))).toBe(fs.realpathSync(secondTasksFile));
  });
});

describe('prompt helpers', () => {
  test('loadBase prefers promptText and validates prompt files', () => {
    expect(prompt.loadBase({ promptText: 'Inline prompt' })).toBe('Inline prompt');
    expect(() => prompt.loadBase({ promptText: '   ' })).toThrow(/promptText is empty/);
    expect(() => prompt.loadBase({ promptFile: path.join(tmpDir, 'missing.md') })).toThrow(/prompt file not found/);

    const promptFile = path.join(tmpDir, 'prompt.md');
    fs.writeFileSync(promptFile, 'Prompt from file\n');
    expect(prompt.loadBase({ promptFile })).toBe('Prompt from file\n');
  });

  test('render returns base prompt without a template', () => {
    expect(prompt.render({ promptText: 'Base prompt' }, 2)).toBe('Base prompt');
  });

  test('render applies template variables and task context', () => {
    const tasksFile = path.join(tmpDir, 'tasks.md');
    const templateFile = path.join(tmpDir, 'template.md');
    fs.writeFileSync(tasksFile, '- [x] 1.1 Done task\n- [ ] 1.2 Next task\n');
    fs.writeFileSync(templateFile, 'Iter {{iteration}}/{{max_iterations}}\n{{base_prompt}}\n{{tasks}}\n{{task_context}}\n{{task_promise}} {{completion_promise}} {{change_dir}} {{context}}');

    const rendered = prompt.render({
      promptText: 'Base prompt',
      promptTemplate: templateFile,
      tasksFile,
      maxIterations: 7,
      taskPromise: 'READY',
      completionPromise: 'DONE',
      changeDir: '/tmp/change',
    }, 3);

    expect(rendered).toContain('Iter 3/7');
    expect(rendered).toContain('Base prompt');
    expect(rendered).toContain('- [x] 1.1 Done task');
    expect(rendered).toContain('## Current Task');
    expect(rendered).toContain('READY DONE /tmp/change');
  });

  test('renderTemplate preserves unknown variables', () => {
    expect(prompt._renderTemplate('Hello {{name}} {{unknown}}', { name: 'Ralph' })).toBe('Hello Ralph {{unknown}}');
  });

  test('render validates template path and empty template content', () => {
    expect(() => prompt.render({ promptText: 'Base', promptTemplate: path.join(tmpDir, 'missing-template.md') }, 1)).toThrow(/template file not found/);

    const templateFile = path.join(tmpDir, 'empty-template.md');
    fs.writeFileSync(templateFile, '   ');
    expect(() => prompt.render({ promptText: 'Base', promptTemplate: templateFile }, 1)).toThrow(/template file is empty/);
  });

  test('loadBase throws when no prompt source is configured', () => {
    expect(() => prompt.loadBase({})).toThrow(/no prompt source configured/);
  });
});

describe('state helpers', () => {
  test('read returns null for invalid JSON and remove is a no-op when missing', () => {
    const brokenDir = path.join(tmpDir, '.ralph-broken-state');
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(state.statePath(brokenDir), '{not json', 'utf8');

    expect(state.read(brokenDir)).toBeNull();

    const missingDir = path.join(tmpDir, '.ralph-missing-state');
    fs.mkdirSync(missingDir, { recursive: true });
    expect(() => state.remove(missingDir)).not.toThrow();
  });
});

describe('history helpers', () => {
  test('read returns empty array for invalid JSON and clear resets history', () => {
    const brokenDir = path.join(tmpDir, '.ralph-broken-history');
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(history.historyPath(brokenDir), '{not json', 'utf8');
    expect(history.read(brokenDir)).toEqual([]);

    history.append(ralphDir, {
      iteration: 1,
      duration: 1000,
      completionDetected: false,
      taskDetected: false,
      toolUsage: [],
      filesChanged: [],
      exitCode: 0,
    });
    expect(history.recent(ralphDir)).toHaveLength(1);
    history.clear(ralphDir);
    expect(history.read(ralphDir)).toEqual([]);
  });
});

describe('context helpers', () => {
  test('consume returns null when empty and hasPending reflects content state', () => {
    expect(context.consume(ralphDir)).toBeNull();
    expect(context.hasPending(ralphDir)).toBe(false);

    context.add(ralphDir, 'pending text');
    expect(context.hasPending(ralphDir)).toBe(true);
    expect(context.consume(ralphDir)).toBe('pending text');
    expect(context.hasPending(ralphDir)).toBe(false);
  });

  test('add ignores blank input', () => {
    context.add(ralphDir, '   ');
    expect(context.read(ralphDir)).toBe('');
  });
});

describe('tasks edge cases', () => {
  test('syncLink throws when tasks file is missing and currentTask handles no tasks', () => {
    expect(() => tasks.syncLink(path.join(tmpDir, '.ralph-missing-link'), path.join(tmpDir, 'missing-tasks.md'))).toThrow(/tasks file not found/);
    expect(tasks.currentTask(path.join(tmpDir, 'missing-tasks.md'))).toBeNull();
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

  test('detects repeated errors when recent failures share the same error signature', () => {
    const entries = [
      { iteration: 3, filesChanged: [], exitCode: 1 },
      { iteration: 4, filesChanged: [], exitCode: 1 },
    ];
    const warnings = _detectStruggles(entries, [
      { iteration: 3, stderr: 'TypeError: Cannot read properties of undefined at foo (/tmp/a.js:10:5)', stdout: '' },
      { iteration: 4, stderr: 'TypeError: Cannot read properties of undefined at foo (/tmp/b.js:20:9)', stdout: '' },
    ]);
    expect(warnings.some((w) => w.includes('Repeated error detected'))).toBe(true);
  });

  test('does not flag repeated errors for distinct failures', () => {
    const entries = [
      { iteration: 3, filesChanged: [], exitCode: 1 },
      { iteration: 4, filesChanged: [], exitCode: 1 },
    ];
    const warnings = _detectStruggles(entries, [
      { iteration: 3, stderr: 'TypeError: Cannot read properties of undefined', stdout: '' },
      { iteration: 4, stderr: 'ReferenceError: handler is not defined', stdout: '' },
    ]);
    expect(warnings.some((w) => w.includes('Repeated error detected'))).toBe(false);
  });

  test('does not flag repeated errors for a single non-zero exit code', () => {
    const entries = [
      { iteration: 3, filesChanged: ['x.js'], exitCode: 0 },
      { iteration: 4, filesChanged: [], exitCode: 1 },
    ];
    const warnings = _detectStruggles(entries, [
      { iteration: 4, stderr: 'TypeError: Cannot read properties of undefined', stdout: '' },
    ]);
    expect(warnings.some((w) => w.includes('Repeated error detected'))).toBe(false);
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
    expect(output).toContain('Lifecycle:     completed');
    expect(output).toContain('Completed:');
    expect(output).not.toContain('Stopped:');
  });

  test('shows stopped incomplete lifecycle, stop timestamp, and exit reason', () => {
    state.init(ralphDir, {
      active: false,
      iteration: 5,
      maxIterations: 10,
      startedAt: new Date().toISOString(),
      stoppedAt: '2026-04-11T12:34:56.000Z',
      exitReason: 'max_iterations',
    });

    const output = render(ralphDir);
    expect(output).toContain('INACTIVE');
    expect(output).toContain('Lifecycle:     stopped (incomplete)');
    expect(output).toContain('Stopped:       2026-04-11T12:34:56.000Z');
    expect(output).toContain('Exit reason:   max_iterations');
    expect(output).not.toContain('Completed:');
  });

  test('prefers completed lifecycle over stale stopped metadata', () => {
    state.init(ralphDir, {
      active: false,
      iteration: 7,
      maxIterations: 10,
      startedAt: new Date().toISOString(),
      completedAt: '2026-04-11T12:35:56.000Z',
      stoppedAt: '2026-04-11T12:34:56.000Z',
      exitReason: 'completion_promise',
    });

    const output = render(ralphDir);
    expect(output).toContain('Lifecycle:     completed');
    expect(output).toContain('Completed:     2026-04-11T12:35:56.000Z');
    expect(output).not.toContain('Stopped:       2026-04-11T12:34:56.000Z');
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

  test('shows failure summaries for signal and fatal-stage history entries', () => {
    state.init(ralphDir, {
      active: false,
      iteration: 2,
      maxIterations: 5,
      startedAt: new Date().toISOString(),
    });
    history.append(ralphDir, {
      iteration: 1,
      duration: 1200,
      completionDetected: false,
      taskDetected: false,
      toolUsage: [],
      filesChanged: [],
      exitCode: null,
      signal: 'SIGTERM',
      failureStage: '',
    });
    history.append(ralphDir, {
      iteration: 2,
      duration: 250,
      completionDetected: false,
      taskDetected: false,
      toolUsage: [],
      filesChanged: [],
      exitCode: null,
      signal: '',
      failureStage: 'prompt_render',
    });

    const output = render(ralphDir);
    expect(output).toContain('failure: signal SIGTERM');
    expect(output).toContain('failure: stage prompt_render');
  });

  test('surfaces the latest commit anomaly in status and recent history', () => {
    state.init(ralphDir, {
      active: false,
      iteration: 2,
      maxIterations: 5,
      startedAt: new Date().toISOString(),
    });
    history.append(ralphDir, {
      iteration: 1,
      duration: 1000,
      completionDetected: false,
      taskDetected: true,
      toolUsage: [],
      filesChanged: ['a.js'],
      exitCode: 0,
      commitAnomaly: 'Auto-commit failed: simulated commit failure',
      commitAnomalyType: 'commit_failed',
    });

    const output = render(ralphDir);
    expect(output).toContain('Commit issue:  Auto-commit failed: simulated commit failure');
    expect(output).toContain('commit: Auto-commit failed: simulated commit failure');
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

  test('does not show no-progress warning when a meaningful dirty-file change exists in the recent window', () => {
    state.init(ralphDir, {
      active: true,
      iteration: 3,
      maxIterations: 10,
      startedAt: new Date().toISOString(),
    });

    history.append(ralphDir, {
      iteration: 1,
      duration: 1000,
      completionDetected: false,
      taskDetected: false,
      toolUsage: [],
      filesChanged: [],
      exitCode: 0,
    });
    history.append(ralphDir, {
      iteration: 2,
      duration: 1000,
      completionDetected: false,
      taskDetected: true,
      toolUsage: [],
      filesChanged: ['already-dirty.js'],
      exitCode: 0,
    });
    history.append(ralphDir, {
      iteration: 3,
      duration: 1000,
      completionDetected: false,
      taskDetected: false,
      toolUsage: [],
      filesChanged: [],
      exitCode: 0,
    });

    const output = render(ralphDir);
    expect(output).not.toContain('No file changes detected');
  });

  test('shows error summary when errors exist', () => {
    state.init(ralphDir, {
      active: true,
      iteration: 2,
      maxIterations: 10,
      startedAt: new Date().toISOString(),
    });
    errors.append(ralphDir, {
      iteration: 1,
      task: '1.1 Do something',
      exitCode: 1,
      stderr: 'Error: something went wrong in the test',
      stdout: 'building...',
    });
    const output = render(ralphDir);
    expect(output).toContain('Error History');
    expect(output).toContain('Errors: 1');
    expect(output).toContain('something went wrong');
  });

  test('reports full persisted error count while previewing only the latest entry', () => {
    state.init(ralphDir, {
      active: true,
      iteration: 5,
      maxIterations: 10,
      startedAt: new Date().toISOString(),
    });

    for (let i = 1; i <= 5; i++) {
      errors.append(ralphDir, {
        iteration: i,
        task: `1.${i} Task`,
        exitCode: i,
        stderr: i === 5 ? 'latest stderr content' : `older stderr ${i}`,
        stdout: '',
      });
    }

    const output = render(ralphDir);
    expect(output).toContain('Errors: 5');
    expect(output).toContain('latest stderr content');
    expect(output).not.toContain('older stderr 1');
  });

  test('surfaces fatal abort metadata through recent history and error summary', () => {
    state.init(ralphDir, {
      active: false,
      iteration: 4,
      maxIterations: 10,
      startedAt: new Date().toISOString(),
      stoppedAt: '2026-04-11T12:34:56.000Z',
      exitReason: 'fatal_error',
    });
    history.append(ralphDir, {
      iteration: 4,
      duration: 250,
      completionDetected: false,
      taskDetected: false,
      toolUsage: [],
      filesChanged: [],
      exitCode: null,
      signal: '',
      failureStage: 'prompt_render',
    });
    errors.append(ralphDir, {
      iteration: 4,
      task: '2.2 Persist fatal failures',
      failureStage: 'prompt_render',
      stderr: 'template expansion failed',
      stdout: '',
    });

    const output = render(ralphDir);
    expect(output).toContain('Exit reason:   fatal_error');
    expect(output).toContain('Iteration 4');
    expect(output).toContain('failure: stage prompt_render');
    expect(output).toContain('Most recent: stage prompt_render | template expansion failed');
    expect(output).toContain('template expansion failed');
  });

  test('keeps delimiter-like error text intact while surfacing signal metadata', () => {
    state.init(ralphDir, {
      active: false,
      iteration: 3,
      maxIterations: 10,
      startedAt: new Date().toISOString(),
    });
    history.append(ralphDir, {
      iteration: 3,
      duration: 900,
      completionDetected: false,
      taskDetected: false,
      toolUsage: [],
      filesChanged: [],
      exitCode: null,
      signal: 'SIGTERM',
      failureStage: '',
    });
    errors.append(ralphDir, {
      iteration: 3,
      task: '3.1 Surface signal failures',
      signal: 'SIGTERM',
      stderr: '---\n### stdout\nliteral delimiter',
      stdout: '',
    });

    const output = render(ralphDir);
    expect(output).toContain('Errors: 1');
    expect(output).toContain('Most recent: signal SIGTERM | ---');
    expect(output).toContain('failure: signal SIGTERM');
  });

  test('uses stdout preview when latest stderr is empty', () => {
    state.init(ralphDir, {
      active: true,
      iteration: 2,
      maxIterations: 10,
      startedAt: new Date().toISOString(),
    });

    errors.append(ralphDir, {
      iteration: 1,
      task: '1.1 Task',
      exitCode: 1,
      stderr: '',
      stdout: 'stdout fallback preview',
    });

    const output = render(ralphDir);
    expect(output).toContain('stdout fallback preview');
  });

  test('does not show error section when errors file is absent', () => {
    state.init(ralphDir, {
      active: true,
      iteration: 1,
      maxIterations: 10,
      startedAt: new Date().toISOString(),
    });
    const output = render(ralphDir);
    expect(output).not.toContain('Error History');
  });
});
