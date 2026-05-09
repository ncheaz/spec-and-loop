'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { _normalizeInvestigationHints } = require('../../../lib/mini-ralph/supervisor');
const { render } = require('../../../lib/mini-ralph/prompt');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-supervisor-hints-'));
});

afterEach(() => {
  delete process.env.RALPH_SELF_HEAL_HINTS;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('mini-ralph supervisor investigation hints', () => {
  test('7 hints -> keep first 5 + drop rest with cap_exceeded', () => {
    for (let index = 1; index <= 7; index += 1) {
      const filePath = path.join(tmpDir, `file-${index}.js`);
      fs.writeFileSync(filePath, `module.exports = ${index};\n`, 'utf8');
    }

    const normalized = _normalizeInvestigationHints(
      Array.from({ length: 7 }, (_, index) => ({
        path: `file-${index + 1}.js`,
        rationale: `Inspect file ${index + 1}`,
      })),
      { workspaceRoot: tmpDir }
    );

    expect(normalized.hints).toHaveLength(5);
    expect(normalized.hints.map((hint) => hint.path)).toEqual([
      'file-1.js',
      'file-2.js',
      'file-3.js',
      'file-4.js',
      'file-5.js',
    ]);
    expect(normalized.hintsDropped).toEqual([
      { path: 'file-6.js', rationale: 'Inspect file 6', reason: 'cap_exceeded' },
      { path: 'file-7.js', rationale: 'Inspect file 7', reason: 'cap_exceeded' },
    ]);
  });

  test('out-of-tree path -> drop with out_of_tree', () => {
    fs.writeFileSync(path.join(tmpDir, 'inside.js'), 'ok\n', 'utf8');

    const normalized = _normalizeInvestigationHints([
      { path: '../outside.js', rationale: 'Do not allow this.' },
      { path: 'inside.js', rationale: 'Read the in-tree file.' },
    ], { workspaceRoot: tmpDir });

    expect(normalized.hints).toEqual([
      { path: 'inside.js', rationale: 'Read the in-tree file.' },
    ]);
    expect(normalized.hintsDropped).toEqual([
      { path: '../outside.js', rationale: 'Do not allow this.', reason: 'out_of_tree' },
    ]);
  });

  test('220-char rationale -> truncate to 200 + ellipsis', () => {
    fs.writeFileSync(path.join(tmpDir, 'target.js'), 'ok\n', 'utf8');
    const longRationale = 'r'.repeat(220);

    const normalized = _normalizeInvestigationHints([
      { path: 'target.js', rationale: longRationale },
    ], { workspaceRoot: tmpDir });

    expect(normalized.hints).toHaveLength(1);
    expect(normalized.hints[0].rationale).toHaveLength(201);
    expect(normalized.hints[0].rationale.endsWith('…')).toBe(true);
  });

  test('non-object hints and root-resolution fallbacks are normalized safely', () => {
    const workspaceRoot = path.join(tmpDir, 'workspace');
    const openspecRoot = path.join(workspaceRoot, 'openspec');
    const changeDir = path.join(openspecRoot, 'changes', 'demo-change');
    const ralphDir = path.join(workspaceRoot, '.ralph');
    const fromOpenspec = path.join(workspaceRoot, 'from-openspec.js');
    const fromChangeDir = path.join(openspecRoot, 'from-change.js');
    const fromRalphDir = path.join(workspaceRoot, 'from-ralph.js');
    const currentDirFile = path.join(process.cwd(), 'package.json');
    const nestedDir = path.join(workspaceRoot, 'nested');

    fs.mkdirSync(changeDir, { recursive: true });
    fs.mkdirSync(ralphDir, { recursive: true });
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(fromOpenspec, 'module.exports = true;\n', 'utf8');
    fs.writeFileSync(fromChangeDir, 'module.exports = true;\n', 'utf8');
    fs.writeFileSync(fromRalphDir, 'module.exports = true;\n', 'utf8');

    expect(_normalizeInvestigationHints([
      null,
      'not-an-object',
      { path: 'from-openspec.js', rationale: 'Resolve from openspecRoot.' },
      { path: 'nested', rationale: 'Directories are not valid hint targets.' },
    ], { openspecRoot })).toEqual({
      hints: [
        { path: 'from-openspec.js', rationale: 'Resolve from openspecRoot.' },
      ],
      hintsDropped: [
        { path: 'nested', rationale: 'Directories are not valid hint targets.', reason: 'out_of_tree' },
      ],
    });

    expect(_normalizeInvestigationHints([
      { path: 'from-change.js', rationale: 'Resolve from changeDir.' },
    ], { changeDir })).toEqual({
      hints: [
        { path: 'from-change.js', rationale: 'Resolve from changeDir.' },
      ],
      hintsDropped: [],
    });

    expect(_normalizeInvestigationHints([
      { path: 'from-ralph.js', rationale: 'Resolve from ralphDir.' },
    ], { ralphDir })).toEqual({
      hints: [
        { path: 'from-ralph.js', rationale: 'Resolve from ralphDir.' },
      ],
      hintsDropped: [],
    });

    expect(_normalizeInvestigationHints([
      { path: '', rationale: 'Blank paths are rejected.' },
      { path: 'package.json', rationale: 'Resolve from process.cwd().' },
    ])).toEqual({
      hints: [
        { path: 'package.json', rationale: 'Resolve from process.cwd().' },
      ],
      hintsDropped: [
        { path: '', rationale: 'Blank paths are rejected.', reason: 'out_of_tree' },
      ],
    });

    expect(fs.existsSync(currentDirFile)).toBe(true);
  });

  test('RALPH_SELF_HEAL_HINTS=0 -> no injection', () => {
    const templateFile = path.join(tmpDir, 'template.md');
    fs.writeFileSync(templateFile, 'Base prompt body', 'utf8');
    process.env.RALPH_SELF_HEAL_HINTS = '0';

    const rendered = render({
      promptText: 'ignored',
      promptTemplate: templateFile,
      supervisorHints: [
        { path: 'lib/mini-ralph/supervisor.js', rationale: 'Read this first.' },
      ],
    }, 1);

    expect(rendered).not.toContain('## Supervisor Investigation Hints');
  });

  test('no hints -> no section', () => {
    const templateFile = path.join(tmpDir, 'template.md');
    fs.writeFileSync(templateFile, 'Base prompt body', 'utf8');

    const rendered = render({
      promptText: 'ignored',
      promptTemplate: templateFile,
      supervisorHints: [],
    }, 1);

    expect(rendered).toBe('Base prompt body');
    expect(rendered).not.toContain('## Supervisor Investigation Hints');
  });
});
