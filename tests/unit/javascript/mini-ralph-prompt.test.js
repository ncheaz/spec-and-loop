'use strict';

/**
 * Unit tests for lib/mini-ralph/prompt.js
 *
 * Tests base prompt loading from inline text and prompt files,
 * template rendering with variable substitution, and error paths.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { loadBase, render, _renderTemplate } = require('../../../lib/mini-ralph/prompt');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-prompt-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// _renderTemplate
// ---------------------------------------------------------------------------

describe('_renderTemplate()', () => {
  test('replaces a single variable', () => {
    expect(_renderTemplate('Hello {{name}}!', { name: 'world' })).toBe('Hello world!');
  });

  test('replaces multiple variables', () => {
    const result = _renderTemplate('{{a}} and {{b}}', { a: 'foo', b: 'bar' });
    expect(result).toBe('foo and bar');
  });

  test('replaces repeated occurrences of the same variable', () => {
    expect(_renderTemplate('{{x}} {{x}}', { x: 'hi' })).toBe('hi hi');
  });

  test('leaves unknown variables intact', () => {
    expect(_renderTemplate('{{unknown}}', {})).toBe('{{unknown}}');
  });

  test('handles empty template string', () => {
    expect(_renderTemplate('', { x: 'y' })).toBe('');
  });

  test('handles template with no variables', () => {
    expect(_renderTemplate('plain text', { x: 'y' })).toBe('plain text');
  });

  test('handles empty string as variable value', () => {
    expect(_renderTemplate('before{{x}}after', { x: '' })).toBe('beforeafter');
  });

  test('handles multi-line templates', () => {
    const tpl = 'Line 1: {{a}}\nLine 2: {{b}}';
    expect(_renderTemplate(tpl, { a: 'alpha', b: 'beta' })).toBe('Line 1: alpha\nLine 2: beta');
  });
});

// ---------------------------------------------------------------------------
// loadBase
// ---------------------------------------------------------------------------

describe('loadBase()', () => {
  test('returns promptText when provided', () => {
    expect(loadBase({ promptText: 'hello world' })).toBe('hello world');
  });

  test('throws when promptText is whitespace-only', () => {
    expect(() => loadBase({ promptText: '   ' })).toThrow(/promptText is empty/);
  });

  test('reads content from promptFile', () => {
    const file = path.join(tmpDir, 'prompt.md');
    fs.writeFileSync(file, 'Do the task.');
    expect(loadBase({ promptFile: file })).toBe('Do the task.');
  });

  test('throws when promptFile does not exist', () => {
    expect(() => loadBase({ promptFile: '/nonexistent/prompt.md' })).toThrow(/prompt file not found/);
  });

  test('throws when promptFile is empty', () => {
    const file = path.join(tmpDir, 'empty.md');
    fs.writeFileSync(file, '');
    expect(() => loadBase({ promptFile: file })).toThrow(/prompt file is empty/);
  });

  test('throws when neither promptText nor promptFile is provided', () => {
    expect(() => loadBase({})).toThrow(/no prompt source configured/);
  });
});

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

describe('render()', () => {
  test('returns base prompt when no template is specified', () => {
    const result = render({ promptText: 'Do stuff.' }, 3);
    expect(result).toBe('Do stuff.');
  });

  test('renders template with iteration variables', () => {
    const templateFile = path.join(tmpDir, 'template.md');
    fs.writeFileSync(
      templateFile,
      'Iteration {{iteration}} of {{max_iterations}}. Base: {{base_prompt}}. Prompt: {{prompt}}'
    );
    const result = render(
      {
        promptText: 'Do the task.',
        promptTemplate: templateFile,
        maxIterations: 10,
        taskPromise: 'READY_FOR_NEXT_TASK',
        completionPromise: 'COMPLETE',
      },
      2
    );
    expect(result).toContain('Iteration 2 of 10');
    expect(result).toContain('Base: Do the task.');
    expect(result).toContain('{{prompt}}'); // unknown var stays intact
  });

  test('includes the base prompt content when rendering a template around promptFile input', () => {
    const promptFile = path.join(tmpDir, 'prompt.md');
    const templateFile = path.join(tmpDir, 'template.md');
    fs.writeFileSync(promptFile, '# Product Requirements Document\n\nSnapshot body');
    fs.writeFileSync(templateFile, 'Snapshot:\n{{base_prompt}}');

    const result = render(
      {
        promptFile,
        promptTemplate: templateFile,
      },
      1
    );

    expect(result).toContain('# Product Requirements Document');
    expect(result).toContain('Snapshot body');
  });

  test('injects tasks content when tasksFile is present', () => {
    const templateFile = path.join(tmpDir, 'template.md');
    fs.writeFileSync(templateFile, 'Tasks:\n{{tasks}}');
    const tasksFile = path.join(tmpDir, 'tasks.md');
    fs.writeFileSync(tasksFile, '- [ ] Task A\n- [x] Task B');

    const result = render(
      {
        promptText: 'prompt',
        promptTemplate: templateFile,
        tasksFile,
      },
      1
    );
    expect(result).toContain('Task A');
    expect(result).toContain('Task B');
  });

  test('injects fresh task_context when tasksFile is present', () => {
    const templateFile = path.join(tmpDir, 'template.md');
    fs.writeFileSync(templateFile, '{{task_context}}');
    const tasksFile = path.join(tmpDir, 'tasks.md');
    fs.writeFileSync(tasksFile, '- [/] 1.1 Active task\n- [x] 1.2 Done task\n');

    const result = render(
      {
        promptText: 'prompt',
        promptTemplate: templateFile,
        tasksFile,
      },
      1
    );

    expect(result).toContain('## Current Task');
    expect(result).toContain('1.1 Active task');
    expect(result).toContain('## Progress');
    expect(result).not.toContain('## Completed Tasks for Git Commit');
    expect(result).not.toContain('1.2 Done task');
  });

  test('leaves {{tasks}} empty when tasksFile does not exist', () => {
    const templateFile = path.join(tmpDir, 'template.md');
    fs.writeFileSync(templateFile, 'Tasks: {{tasks}}end');

    const result = render(
      {
        promptText: 'prompt',
        promptTemplate: templateFile,
        tasksFile: '/nonexistent/tasks.md',
      },
      1
    );
    expect(result).toBe('Tasks: end');
  });

  test('includes task_promise and completion_promise in template', () => {
    const templateFile = path.join(tmpDir, 'template.md');
    fs.writeFileSync(
      templateFile,
      'task={{task_promise}} done={{completion_promise}}'
    );
    const result = render(
      {
        promptText: 'p',
        promptTemplate: templateFile,
        taskPromise: 'READY_FOR_NEXT_TASK',
        completionPromise: 'COMPLETE',
      },
      1
    );
    expect(result).toBe('task=READY_FOR_NEXT_TASK done=COMPLETE');
  });

  test('renders the default runner-owned commit contract', () => {
    const templateFile = path.join(tmpDir, 'template.md');
    fs.writeFileSync(templateFile, '{{commit_contract}}');

    const result = render(
      {
        promptText: 'p',
        promptTemplate: templateFile,
      },
      1
    );

    expect(result).toContain('Do not create git commits yourself');
    expect(result).toContain('Ralph runner manages automatic task commits');
    expect(result).not.toContain('Create a git commit');
  });

  test('renders an explicit no-commit contract when noCommit is enabled', () => {
    const templateFile = path.join(tmpDir, 'template.md');
    fs.writeFileSync(templateFile, '{{commit_contract}}');

    const result = render(
      {
        promptText: 'p',
        promptTemplate: templateFile,
        noCommit: true,
      },
      1
    );

    expect(result).toContain('Do not create, amend, or finalize git commits in this run');
    expect(result).toContain('`--no-commit` is active');
    expect(result).toContain('Do not run `git add` or `git commit`');
  });

  test('throws when template file does not exist', () => {
    expect(() =>
      render({ promptText: 'p', promptTemplate: '/nonexistent/template.md' }, 1)
    ).toThrow(/template file not found/);
  });

  test('throws when template file is empty', () => {
    const templateFile = path.join(tmpDir, 'empty-template.md');
    fs.writeFileSync(templateFile, '');
    expect(() =>
      render({ promptText: 'p', promptTemplate: templateFile }, 1)
    ).toThrow(/template file is empty/);
  });

  test('includes changeDir in template', () => {
    const templateFile = path.join(tmpDir, 'template.md');
    fs.writeFileSync(templateFile, 'dir={{change_dir}}');
    const result = render(
      {
        promptText: 'p',
        promptTemplate: templateFile,
        changeDir: '/path/to/change',
      },
      1
    );
    expect(result).toBe('dir=/path/to/change');
  });
});
