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

const { loadBase, render, _renderTemplate, _resetWarnNotice } = require('../../../lib/mini-ralph/prompt');

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

  test('regression: {{context}} passes through literally since it was removed from the vars map (D3)', () => {
    // {{context}} was removed from the renderer's vars object in task 4.1.
    // Templates that still contain it must receive it back verbatim rather than
    // being replaced with an empty string or throwing.
    expect(_renderTemplate('head\n{{context}}\ntail', {})).toBe('head\n{{context}}\ntail');
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

// ---------------------------------------------------------------------------
// D5 — Lazy base-prompt loading (spec scenario coverage)
// ---------------------------------------------------------------------------

describe('render() D5 — Lazy base-prompt loading', () => {
  let stderrOutput;
  let originalWrite;

  beforeEach(() => {
    stderrOutput = [];
    originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (msg) => { stderrOutput.push(msg); return true; };
    delete process.env.RALPH_BASE_PROMPT_WARN_BYTES;
    _resetWarnNotice();
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
    delete process.env.RALPH_BASE_PROMPT_WARN_BYTES;
    _resetWarnNotice();
  });

  test('(a) template without {{base_prompt}} renders without throwing even when promptFile points at a nonexistent path', () => {
    const templateFile = path.join(tmpDir, 'no-base.md');
    fs.writeFileSync(templateFile, 'Iteration {{iteration}} — no base here');

    expect(() =>
      render(
        {
          promptFile: '/totally/nonexistent/file.md',
          promptTemplate: templateFile,
        },
        1
      )
    ).not.toThrow();

    const result = render(
      {
        promptFile: '/totally/nonexistent/file.md',
        promptTemplate: templateFile,
      },
      1
    );
    expect(result).toContain('Iteration 1');
    expect(result).not.toContain('{{base_prompt}}');
  });

  test('(b) template with {{base_prompt}} substitutes the file content verbatim', () => {
    const promptFile = path.join(tmpDir, 'base.md');
    fs.writeFileSync(promptFile, 'My exact base content.');
    const templateFile = path.join(tmpDir, 'with-base.md');
    fs.writeFileSync(templateFile, 'START\n{{base_prompt}}\nEND');

    const result = render({ promptFile, promptTemplate: templateFile }, 1);

    expect(result).toBe('START\nMy exact base content.\nEND');
  });

  test('(c) template with {{base_prompt}} and a >4 KB file emits exactly one stderr line containing the file path and byte size', () => {
    const promptFile = path.join(tmpDir, 'large.md');
    // Write > 4096 bytes
    fs.writeFileSync(promptFile, 'x'.repeat(5000));
    const templateFile = path.join(tmpDir, 'with-base.md');
    fs.writeFileSync(templateFile, '{{base_prompt}}');

    render({ promptFile, promptTemplate: templateFile }, 1);

    expect(stderrOutput).toHaveLength(1);
    expect(stderrOutput[0]).toContain('{{base_prompt}}');
    expect(stderrOutput[0]).toContain('5000');
    expect(stderrOutput[0]).toContain(promptFile);
  });

  test('(d) RALPH_BASE_PROMPT_WARN_BYTES=0 silences the warning even for a 100 KB file', () => {
    process.env.RALPH_BASE_PROMPT_WARN_BYTES = '0';
    const promptFile = path.join(tmpDir, 'huge.md');
    fs.writeFileSync(promptFile, 'y'.repeat(102400));
    const templateFile = path.join(tmpDir, 'with-base.md');
    fs.writeFileSync(templateFile, '{{base_prompt}}');

    render({ promptFile, promptTemplate: templateFile }, 1);

    expect(stderrOutput).toHaveLength(0);
  });

  test('(e) an invalid RALPH_BASE_PROMPT_WARN_BYTES falls back to 4096 and emits the fallback notice EXACTLY ONCE across three consecutive render() calls', () => {
    process.env.RALPH_BASE_PROMPT_WARN_BYTES = 'notanumber';
    const promptFile = path.join(tmpDir, 'large2.md');
    fs.writeFileSync(promptFile, 'z'.repeat(5000));
    const templateFile = path.join(tmpDir, 'with-base.md');
    fs.writeFileSync(templateFile, '{{base_prompt}}');

    render({ promptFile, promptTemplate: templateFile }, 1);
    render({ promptFile, promptTemplate: templateFile }, 2);
    render({ promptFile, promptTemplate: templateFile }, 3);

    // One fallback notice + three oversized warnings (one per call, threshold fell back to 4096)
    const fallbackNotices = stderrOutput.filter(m => m.includes('falling back to 4096'));
    const oversizedWarnings = stderrOutput.filter(m => m.includes('{{base_prompt}} resolved to'));
    expect(fallbackNotices).toHaveLength(1);
    expect(oversizedWarnings).toHaveLength(3);
  });
});
