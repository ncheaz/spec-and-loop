'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  _applyTaskPatch,
  _distillRalphBP,
  _extractDesignSections,
  _extractProposalSections,
  _loadRuleSources,
  _parseSupervisorResponse,
  _recoverSupervisorTmpFiles,
  _renderSupervisorPrompt,
  _SUPERVISOR_TEMPLATE_VARIABLES,
  _resetRuleSourceCache,
  _summarizeDownstreamTasks,
} = require('../../../lib/mini-ralph/supervisor');

let tmpDir;
let priorTasksEnv;
let priorRuleCacheEnv;
let retryEnvSnapshot;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-supervisor-test-'));
  priorTasksEnv = process.env.RALPH_TASKS_FILE;
  priorRuleCacheEnv = process.env.RALPH_SELF_HEAL_RULE_CACHE;
  retryEnvSnapshot = {
    keepDownstream: process.env.RALPH_SELF_HEAL_KEEP_DOWNSTREAM_ON_RETRY,
    keepHandoffHistory: process.env.RALPH_SELF_HEAL_KEEP_HANDOFF_HISTORY_ON_RETRY,
    fullDownstream: process.env.RALPH_SELF_HEAL_FULL_DOWNSTREAM,
    fullDesign: process.env.RALPH_SELF_HEAL_FULL_DESIGN,
    fullProposal: process.env.RALPH_SELF_HEAL_FULL_PROPOSAL,
    fullBpContext: process.env.RALPH_SELF_HEAL_FULL_BP_CONTEXT,
  };
  _resetRuleSourceCache();
});

afterEach(() => {
  if (priorTasksEnv === undefined) {
    delete process.env.RALPH_TASKS_FILE;
  } else {
    process.env.RALPH_TASKS_FILE = priorTasksEnv;
  }
  if (priorRuleCacheEnv === undefined) {
    delete process.env.RALPH_SELF_HEAL_RULE_CACHE;
  } else {
    process.env.RALPH_SELF_HEAL_RULE_CACHE = priorRuleCacheEnv;
  }
  if (retryEnvSnapshot.keepDownstream === undefined) {
    delete process.env.RALPH_SELF_HEAL_KEEP_DOWNSTREAM_ON_RETRY;
  } else {
    process.env.RALPH_SELF_HEAL_KEEP_DOWNSTREAM_ON_RETRY = retryEnvSnapshot.keepDownstream;
  }
  if (retryEnvSnapshot.keepHandoffHistory === undefined) {
    delete process.env.RALPH_SELF_HEAL_KEEP_HANDOFF_HISTORY_ON_RETRY;
  } else {
    process.env.RALPH_SELF_HEAL_KEEP_HANDOFF_HISTORY_ON_RETRY = retryEnvSnapshot.keepHandoffHistory;
  }
  if (retryEnvSnapshot.fullDownstream === undefined) {
    delete process.env.RALPH_SELF_HEAL_FULL_DOWNSTREAM;
  } else {
    process.env.RALPH_SELF_HEAL_FULL_DOWNSTREAM = retryEnvSnapshot.fullDownstream;
  }
  if (retryEnvSnapshot.fullDesign === undefined) {
    delete process.env.RALPH_SELF_HEAL_FULL_DESIGN;
  } else {
    process.env.RALPH_SELF_HEAL_FULL_DESIGN = retryEnvSnapshot.fullDesign;
  }
  if (retryEnvSnapshot.fullProposal === undefined) {
    delete process.env.RALPH_SELF_HEAL_FULL_PROPOSAL;
  } else {
    process.env.RALPH_SELF_HEAL_FULL_PROPOSAL = retryEnvSnapshot.fullProposal;
  }
  if (retryEnvSnapshot.fullBpContext === undefined) {
    delete process.env.RALPH_SELF_HEAL_FULL_BP_CONTEXT;
  } else {
    process.env.RALPH_SELF_HEAL_FULL_BP_CONTEXT = retryEnvSnapshot.fullBpContext;
  }
  _resetRuleSourceCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('mini-ralph supervisor rule loading', () => {
  test('loadRuleSources returns four entries with cache hit semantics', () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'demo-change');
    const openspecRoot = path.join(tmpDir, 'openspec');
    const tasksFile = path.join(changeDir, 'tasks.md');
    const configPath = path.join(openspecRoot, 'config.yaml');
    const bpPath = path.join(openspecRoot, 'OPENSPEC-RALPH-BP.md');
    const proposalPath = path.join(changeDir, 'proposal.md');
    const designPath = path.join(changeDir, 'design.md');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(tasksFile, '# Tasks\n\n- [ ] 4.1 Add rule-source loader\n', 'utf8');
    fs.writeFileSync(configPath, 'rules: alpha\n', 'utf8');
    fs.writeFileSync(bpPath, '## Ralph\nUse canonical tasks.\n', 'utf8');
    fs.writeFileSync(proposalPath, '## Why\nShip supervisor loop.\n', 'utf8');
    fs.writeFileSync(designPath, '## Scope\nKeep edits minimal.\n', 'utf8');

    const first = _loadRuleSources({ tasksFile });
    expect(Object.keys(first)).toEqual([
      'openspec_config_rules',
      'ralph_authoring_rules',
      'change_proposal',
      'change_design',
    ]);
    expect(first.openspec_config_rules).toEqual({
      path: configPath,
      content: 'rules: alpha\n',
    });
    expect(first.ralph_authoring_rules.content).toContain('Use canonical tasks.');
    expect(first.change_proposal.content).toContain('Ship supervisor loop.');
    expect(first.change_design.content).toContain('Keep edits minimal.');

    const second = _loadRuleSources({ tasksFile });
    expect(second.openspec_config_rules.content).toBe('rules: alpha\n');
    expect(stderrSpy).not.toHaveBeenCalledWith(
      `[mini-ralph] warning: supervisor rule cache refreshed for ${configPath}\n`
    );

    const updated = 'rules: gamma\n';
    fs.writeFileSync(configPath, updated, 'utf8');
    const future = new Date(Date.now() + 2000);
    fs.utimesSync(configPath, future, future);

    const third = _loadRuleSources({ tasksFile });
    expect(third.openspec_config_rules.content).toBe(updated);
    expect(stderrSpy).toHaveBeenCalledWith(
      `[mini-ralph] warning: supervisor rule cache refreshed for ${configPath}\n`
    );

    fs.rmSync(bpPath);
    const missing = _loadRuleSources({ tasksFile });
    expect(missing.ralph_authoring_rules).toEqual({ path: bpPath, content: '' });

    const oversized = 'x'.repeat((32 * 1024) + 128);
    fs.writeFileSync(designPath, oversized, 'utf8');
    const futureDesign = new Date(Date.now() + 4000);
    fs.utimesSync(designPath, futureDesign, futureDesign);

    const truncated = _loadRuleSources({ tasksFile });
    expect(truncated.change_design.content.length).toBeLessThan(oversized.length);
    expect(truncated.change_design.content).toContain(`... [truncated, ${Buffer.byteLength(oversized)} total]`);
    expect(Buffer.byteLength(truncated.change_design.content, 'utf8')).toBeLessThanOrEqual(32 * 1024);
    expect(stderrSpy).toHaveBeenCalledWith(
      `[mini-ralph] warning: supervisor rule source truncated: ${designPath}\n`
    );

    process.env.RALPH_SELF_HEAL_RULE_CACHE = '0';
    fs.writeFileSync(proposalPath, '## Why\nBypass cache.\n', 'utf8');
    const uncached = _loadRuleSources({ tasksFile });
    expect(uncached.change_proposal.content).toBe('## Why\nBypass cache.\n');

    stderrSpy.mockRestore();
  });
});

describe('mini-ralph supervisor parser', () => {
  test('parser distinguishes infra failure from structural rejection', () => {
    const tasksFile = path.join(tmpDir, 'tasks.md');
    fs.writeFileSync(
      tasksFile,
      [
        '# Tasks',
        '',
        '- [ ] 2.3 Define and document the supervisor I/O contract',
        '- [ ] 4.1 Add rule-source loader',
        '',
      ].join('\n'),
      'utf8'
    );
    process.env.RALPH_TASKS_FILE = tasksFile;

    expect(_parseSupervisorResponse('plain stdout with no fence')).toEqual({
      kind: 'infra_failure',
      reason: 'missing_fence',
    });

    expect(_parseSupervisorResponse('```supervisor-response\n{not json}\n```')).toEqual({
      kind: 'infra_failure',
      reason: 'malformed_json',
    });

    expect(
      _parseSupervisorResponse([
        '```supervisor-response',
        JSON.stringify({
          current_task_patch: {
            task_number: '9.9',
            new_body: '- [ ] 9.9 Unknown task',
            rationale: 'This should be rejected.',
          },
          downstream_patches: [],
          investigation_hints: [],
          summary: 'Reject unknown task numbers.',
          downstream_rationale: '',
        }),
        '```',
      ].join('\n'))
    ).toEqual({
      kind: 'structural_rejection',
      reason: 'unknown_task_number',
      taskNumber: '9.9',
    });

    expect(
      _parseSupervisorResponse([
        '```supervisor-response',
        JSON.stringify({
          current_task_patch: {
            task_number: '2.3',
            new_body: '- [ ] 2.3 Define the supervisor contract',
            rationale: 'Freeze the parser shape.',
          },
          downstream_patches: [
            {
              task_number: '4.1',
              operation: 'modify',
              new_body: '- [ ] 4.1 Add rule-source loader',
              rationale: 'Align downstream parser expectations.',
            },
          ],
          investigation_hints: [
            {
              path: 'lib/mini-ralph/tasks.js',
              rationale: 'Read task parsing before wiring validation.',
            },
          ],
          summary: 'Freeze the supervisor response contract.',
          downstream_rationale: 'Downstream parsing will reuse the same numbered-task contract.',
        }),
        '```',
      ].join('\n'))
    ).toEqual({
      current_task_patch: {
        task_number: '2.3',
        new_body: '- [ ] 2.3 Define the supervisor contract',
        rationale: 'Freeze the parser shape.',
      },
      downstream_patches: [
        {
          task_number: '4.1',
          operation: 'modify',
          new_body: '- [ ] 4.1 Add rule-source loader',
          rationale: 'Align downstream parser expectations.',
        },
      ],
      investigation_hints: [
        {
          path: 'lib/mini-ralph/tasks.js',
          rationale: 'Read task parsing before wiring validation.',
        },
      ],
      summary: 'Freeze the supervisor response contract.',
      downstream_rationale: 'Downstream parsing will reuse the same numbered-task contract.',
    });

    expect(_SUPERVISOR_TEMPLATE_VARIABLES).toEqual([
      'blocker_note',
      'current_task_number',
      'current_task_body',
      'downstream_tasks',
      'handoff_history',
      'recent_iterations',
      'try_index',
      'previous_supervisor_attempts',
      'openspec_config_rules',
      'ralph_authoring_rules',
      'change_proposal',
      'change_design',
      'run_stdout_log_path',
      'run_stderr_log_path',
    ]);
  });
});

describe('mini-ralph supervisor token economy preprocessors', () => {
  test('summarizeDownstreamTasks compacts to title + scope only', () => {
    const downstreamTasks = [
      '- [ ] 4.3 **Implement the prompt renderer with retry suppression**',
      '  - Scope: `lib/mini-ralph/supervisor.js`, `tests/unit/javascript/mini-ralph-supervisor.test.js`',
      '  - Change: Render the supervisor prompt from all variables.',
      '  - Done when:',
      '    - prompt rendering test passes',
      '  - Stop and hand off if: a template variable is missing',
      '',
      '- [ ] 4.4 **Implement the token-budget regression test**',
      '  - Scope: `tests/unit/javascript/mini-ralph-supervisor-token-budget.test.js`',
      '  - Change: Lock prompt size against the UXEP fixture.',
      '  - Done when:',
      '    - budget test passes',
      '  - Stop and hand off if: the UXEP fixture is unavailable',
      '',
    ].join('\n');

    expect(_summarizeDownstreamTasks(downstreamTasks)).toBe([
      '- 4.3 **Implement the prompt renderer with retry suppression**',
      '  - Scope: `lib/mini-ralph/supervisor.js`, `tests/unit/javascript/mini-ralph-supervisor.test.js`',
      '',
      '- 4.4 **Implement the token-budget regression test**',
      '  - Scope: `tests/unit/javascript/mini-ralph-supervisor-token-budget.test.js`',
    ].join('\n'));

    process.env.RALPH_SELF_HEAL_FULL_DOWNSTREAM = '1';
    expect(_summarizeDownstreamTasks(downstreamTasks)).toBe(downstreamTasks);
    delete process.env.RALPH_SELF_HEAL_FULL_DOWNSTREAM;
  });

  test('extractDesignSections falls back to 4KB on no recognized headings', () => {
    const design = ['## Context', '', 'alpha '.repeat(1200)].join('\n');
    const extracted = _extractDesignSections(design);

    expect(extracted).toContain('[fallback: first 4KB; no recognized sections found]');
    expect(Buffer.byteLength(extracted, 'utf8')).toBeLessThanOrEqual(4 * 1024 + 64);

    process.env.RALPH_SELF_HEAL_FULL_DESIGN = '1';
    expect(_extractDesignSections(design)).toBe(design);
    delete process.env.RALPH_SELF_HEAL_FULL_DESIGN;
  });

  test('extractProposalSections keeps why and goals headings', () => {
    const proposal = [
      '## Why',
      '',
      'Need a supervisor loop.',
      '',
      '## What Changes',
      '',
      'Add a second LLM pass.',
      '',
      '## Goals',
      '',
      'Reduce operator handoff churn.',
      '',
      '## Non-goals',
      '',
      'Do not edit app code.',
      '',
      '## Rollout',
      '',
      'Out of scope for extraction.',
      '',
    ].join('\n');

    const extracted = _extractProposalSections(proposal);
    expect(extracted).toContain('## Why');
    expect(extracted).toContain('## What Changes');
    expect(extracted).toContain('## Goals');
    expect(extracted).toContain('## Non-goals');
    expect(extracted).not.toContain('## Rollout');

    process.env.RALPH_SELF_HEAL_FULL_PROPOSAL = '1';
    expect(_extractProposalSections(proposal)).toBe(proposal);
    delete process.env.RALPH_SELF_HEAL_FULL_PROPOSAL;
  });

  test('distillRalphBP fits in 4KB on canonical fixture', () => {
    const bp = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'openspec', 'OPENSPEC-RALPH-BP.md'),
      'utf8'
    );

    const distilled = _distillRalphBP(bp);
    expect(Buffer.byteLength(distilled, 'utf8')).toBeLessThanOrEqual(4 * 1024);
    expect(distilled).toContain('## Task template');
    expect(distilled).toContain('```markdown');
    expect(distilled).toContain('**Medium profile**');
    expect(distilled).toContain('**Lightweight profile**');
    expect(distilled).toContain('Start every task with the cheapest verifier');

    process.env.RALPH_SELF_HEAL_FULL_BP_CONTEXT = '1';
    expect(_distillRalphBP(bp)).toBe(bp);
    delete process.env.RALPH_SELF_HEAL_FULL_BP_CONTEXT;
  });
});

describe('mini-ralph supervisor prompt rendering', () => {
  function writePromptFixture() {
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'demo-change');
    const openspecRoot = path.join(tmpDir, 'openspec');
    const tasksFile = path.join(changeDir, 'tasks.md');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(openspecRoot, 'config.yaml'), 'strict: true\n', 'utf8');
    fs.writeFileSync(
      path.join(openspecRoot, 'OPENSPEC-RALPH-BP.md'),
      [
        '## Task template',
        '',
        '```markdown',
        '- [ ] Task',
        '```',
        '',
        '**Medium profile** 3-7 bullets.',
        '**Lightweight profile** 2-5 bullets.',
        '',
        '## Surgical validation',
        '',
        '- Start every task with the cheapest verifier.',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '## Why\nNeed a supervisor.\n', 'utf8');
    fs.writeFileSync(path.join(changeDir, 'design.md'), '## Scope\nKeep prompts small.\n', 'utf8');
    fs.writeFileSync(tasksFile, '# Tasks\n', 'utf8');
    return { changeDir, openspecRoot, tasksFile };
  }

  test('renderSupervisorPrompt suppresses downstream and handoff_history on try 2', () => {
    const fixture = writePromptFixture();

    const rendered = _renderSupervisorPrompt({
      ...fixture,
      blockerNote: 'Task body is missing a scoped verifier.',
      currentTaskNumber: '4.3',
      currentTaskBody: '- [ ] 4.3 **Implement the prompt renderer with try-aware suppression**',
      downstreamTasks: [
        '- [ ] 4.4 **Implement the token-budget regression test**',
        '  - Scope: `tests/unit/javascript/mini-ralph-supervisor-token-budget.test.js`',
      ].join('\n'),
      handoffHistory: 'Iteration 8: validation failed.',
      recentIterations: 'Iteration 8 -> BLOCKED_HANDOFF',
      tryIndex: 2,
      previousSupervisorAttempts: 'Try 1 failed structural validation.',
      runStdoutLogPath: '/tmp/ralph-stdout.log',
      runStderrLogPath: '/tmp/ralph-stderr.log',
    });

    expect(rendered).toContain('[suppressed on retry; see try 1]');
    expect(rendered).not.toContain('Implement the token-budget regression test');
    expect(rendered).not.toContain('Iteration 8: validation failed.');

    process.env.RALPH_SELF_HEAL_KEEP_DOWNSTREAM_ON_RETRY = '1';
    process.env.RALPH_SELF_HEAL_KEEP_HANDOFF_HISTORY_ON_RETRY = '1';
    const kept = _renderSupervisorPrompt({
      ...fixture,
      blockerNote: 'Task body is missing a scoped verifier.',
      currentTaskNumber: '4.3',
      currentTaskBody: '- [ ] 4.3 **Implement the prompt renderer with try-aware suppression**',
      downstreamTasks: [
        '- [ ] 4.4 **Implement the token-budget regression test**',
        '  - Scope: `tests/unit/javascript/mini-ralph-supervisor-token-budget.test.js`',
      ].join('\n'),
      handoffHistory: 'Iteration 8: validation failed.',
      recentIterations: 'Iteration 8 -> BLOCKED_HANDOFF',
      tryIndex: 2,
      previousSupervisorAttempts: 'Try 1 failed structural validation.',
      runStdoutLogPath: '/tmp/ralph-stdout.log',
      runStderrLogPath: '/tmp/ralph-stderr.log',
    });

    expect(kept).toContain('Implement the token-budget regression test');
    expect(kept).toContain('Iteration 8: validation failed.');
  });

  test('renderSupervisorPrompt does not include tasks_md_path or blocker_hash literals', () => {
    const fixture = writePromptFixture();

    const rendered = _renderSupervisorPrompt({
      ...fixture,
      blockerNote: 'Blocked on current task structure.',
      currentTaskNumber: '4.3',
      currentTaskBody: '- [ ] 4.3 **Implement the prompt renderer with try-aware suppression**',
      downstreamTasks: '',
      handoffHistory: '',
      recentIterations: 'Iteration 8 -> BLOCKED_HANDOFF',
      tryIndex: 1,
      previousSupervisorAttempts: '',
      runStdoutLogPath: '',
      runStderrLogPath: '',
      tasksMdPath: fixture.tasksFile,
      blockerHash: 'deadbeefdeadbeef',
    });

    expect(rendered).not.toContain('{{tasks_md_path}}');
    expect(rendered).not.toContain('{{blocker_hash}}');
    expect(rendered).not.toContain(fixture.tasksFile);
    expect(rendered).not.toContain('deadbeefdeadbeef');
    expect(rendered).toContain('Blocked on current task structure.');
  });
});

describe('mini-ralph supervisor patch application', () => {
  function writePatchFixture() {
    const workspaceRoot = path.join(tmpDir, 'workspace');
    const changeDir = path.join(workspaceRoot, 'openspec', 'changes', 'demo-change');
    const tasksFile = path.join(changeDir, 'tasks.md');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(tasksFile, '# Tasks\n\n- [ ] 4.6 **Apply supervisor patch**\n', 'utf8');
    return {
      workspaceRoot,
      changeDir,
      tasksFile,
      patchedContent: '# Tasks\n\n- [ ] 4.6 **Apply supervisor patch**\n  - Scope: `lib/mini-ralph/supervisor.js`\n',
    };
  }

  test('applyTaskPatch leaves no residue on validation success', () => {
    const fixture = writePatchFixture();
    const execSpy = jest.spyOn(childProcess, 'execFileSync').mockImplementation(() => Buffer.from('ok'));

    const result = _applyTaskPatch({
      tasksFile: fixture.tasksFile,
      patchedContent: fixture.patchedContent,
      cwd: fixture.workspaceRoot,
    });

    expect(result).toEqual({
      ok: true,
      activeChangeId: 'demo-change',
    });
    expect(fs.readFileSync(fixture.tasksFile, 'utf8')).toBe(fixture.patchedContent);
    expect(fs.existsSync(`${fixture.tasksFile}.supervisor-orig`)).toBe(false);
    expect(fs.existsSync(`${fixture.tasksFile}.supervisor-tmp`)).toBe(false);
    expect(execSpy).toHaveBeenCalledWith(
      'npx',
      ['openspec', 'validate', 'demo-change', '--strict'],
      expect.objectContaining({
        cwd: fixture.workspaceRoot,
        timeout: 30000,
      })
    );

    execSpy.mockRestore();
  });

  test('applyTaskPatch rolls back on validation failure and leaves no residue', () => {
    const fixture = writePatchFixture();
    const originalContent = fs.readFileSync(fixture.tasksFile, 'utf8');
    const error = new Error('validation failed');
    error.stderr = Buffer.from('strict validation failed\n');
    error.stdout = Buffer.from('stdout details\n');
    const execSpy = jest.spyOn(childProcess, 'execFileSync').mockImplementation(() => {
      throw error;
    });

    const result = _applyTaskPatch({
      tasksFile: fixture.tasksFile,
      patchedContent: fixture.patchedContent,
      cwd: fixture.workspaceRoot,
      validationTimeoutMs: 1234,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('validation_failed');
    expect(result.activeChangeId).toBe('demo-change');
    expect(result.stderr).toBe('strict validation failed\n');
    expect(result.stdout).toBe('stdout details\n');
    expect(fs.readFileSync(fixture.tasksFile, 'utf8')).toBe(originalContent);
    expect(fs.existsSync(`${fixture.tasksFile}.supervisor-orig`)).toBe(false);
    expect(fs.existsSync(`${fixture.tasksFile}.supervisor-tmp`)).toBe(false);
    expect(execSpy).toHaveBeenCalledWith(
      'npx',
      ['openspec', 'validate', 'demo-change', '--strict'],
      expect.objectContaining({
        cwd: fixture.workspaceRoot,
        timeout: 1234,
      })
    );

    execSpy.mockRestore();
  });

  test('recoverSupervisorTmpFiles restores tasks.md from .supervisor-orig residue', () => {
    const fixture = writePatchFixture();
    fs.renameSync(fixture.tasksFile, `${fixture.tasksFile}.supervisor-orig`);

    const result = _recoverSupervisorTmpFiles({ tasksFile: fixture.tasksFile });

    expect(result.recovered).toBe(true);
    expect(result.actions).toEqual([
      `restored tasks file from rollback: ${fixture.tasksFile}.supervisor-orig -> ${fixture.tasksFile}`,
    ]);
    expect(fs.readFileSync(fixture.tasksFile, 'utf8')).toContain('Apply supervisor patch');
    expect(fs.existsSync(`${fixture.tasksFile}.supervisor-orig`)).toBe(false);
  });

  test('recoverSupervisorTmpFiles recovers orphaned .supervisor-tmp residue', () => {
    const fixture = writePatchFixture();
    fs.writeFileSync(`${fixture.tasksFile}.supervisor-tmp`, fixture.patchedContent, 'utf8');
    fs.rmSync(fixture.tasksFile, { force: true });

    const result = _recoverSupervisorTmpFiles({ tasksFile: fixture.tasksFile });

    expect(result.recovered).toBe(true);
    expect(result.actions).toEqual([
      `restored tasks file from staged supervisor tmp: ${fixture.tasksFile}.supervisor-tmp -> ${fixture.tasksFile}`,
    ]);
    expect(fs.readFileSync(fixture.tasksFile, 'utf8')).toBe(fixture.patchedContent);
    expect(fs.existsSync(`${fixture.tasksFile}.supervisor-tmp`)).toBe(false);
  });
});
