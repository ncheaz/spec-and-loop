'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const state = require('../../../lib/mini-ralph/state');
const {
  _consumeBoundedBudget,
  _decideBoundedBudget,
  runSupervisor,
} = require('../../../lib/mini-ralph/supervisor');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-supervisor-budget-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('mini-ralph supervisor budget orchestrator', () => {
  test('bounded-budget helpers allow unbounded use, then block exhausted keys and totals', () => {
    expect(_decideBoundedBudget({})).toEqual({ allowed: true, reason: 'unbounded' });

    const consumed = _consumeBoundedBudget({
      state: { totalAttempts: 2, attempts: { other: { reason: 'seen' } } },
      budgetKey: 'current',
      entry: { reason: 'recorded' },
    });

    expect(consumed).toEqual({
      totalAttempts: 3,
      attempts: {
        other: { reason: 'seen' },
        current: { reason: 'recorded' },
      },
    });
    expect(_consumeBoundedBudget({ state: consumed })).toBe(consumed);
    expect(_decideBoundedBudget({
      budgetKey: 'current',
      attempts: consumed.attempts,
      totalAttempts: consumed.totalAttempts,
      maxTotalAttempts: 10,
    })).toEqual({ allowed: false, reason: 'task_class_budget_exhausted' });
    expect(_decideBoundedBudget({
      budgetKey: 'fresh',
      attempts: consumed.attempts,
      totalAttempts: 3,
      maxTotalAttempts: 3,
    })).toEqual({ allowed: false, reason: 'global_budget_exhausted' });
  });

  test('3-try budget exhaustion', async () => {
    const fixture = writeFixture();
    const invoke = jest.fn().mockResolvedValue({ stdout: 'ok', toolUsage: [] });
    const parseResponse = jest.fn().mockReturnValue({
      current_task_patch: {
        task_number: '4.7',
        new_body: buildTaskBody('4.7', 'Patched current task', '`current.js`'),
        rationale: 'Try to repair the current task.',
      },
      downstream_patches: [],
      investigation_hints: [],
      summary: 'Attempt a structural repair.',
      downstream_rationale: '',
    });
    const validateTaskStructure = jest.fn().mockReturnValue({
      ok: false,
      errors: ['bold_title_missing: missing bold task title'],
      warnings: [],
    });

    const result = await runSupervisor({
      blockerNote: 'Current task failed structural validation.',
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 3 },
      iteration: 12,
      invoke,
      renderPrompt: () => 'prompt',
      parseResponse,
      validateTaskStructure,
      applyTaskPatch: jest.fn(),
    });

    expect(result.outcome).toBe('blocked_handoff');
    expect(result.summary).toContain('exhausted the configured self-heal try budget');
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(validateTaskStructure).toHaveBeenCalledTimes(3);
    expect(state.read(fixture.ralphDir).supervisor).toEqual({
      currentBlockerHash: blockerHash('Current task failed structural validation.'),
      triesUsedForCurrentBlocker: 3,
      totalAttemptsForCurrentBlocker: 3,
      lastOutcome: 'patch_rejected_structural',
    });
  });

  test('infra failure does not consume a try and counts toward 5-attempt cap', async () => {
    const fixture = writeFixture();
    const invoke = jest.fn().mockRejectedValue(new Error('network dropped'));

    const result = await runSupervisor({
      blockerNote: 'Supervisor transport is flaky.',
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 3 },
      iteration: 3,
      invoke,
      renderPrompt: () => 'prompt',
    });

    expect(result.outcome).toBe('blocked_handoff');
    expect(result.summary).toContain('infrastructure-attempt cap');
    expect(invoke).toHaveBeenCalledTimes(5);
    expect(state.read(fixture.ralphDir).supervisor).toEqual({
      currentBlockerHash: blockerHash('Supervisor transport is flaky.'),
      triesUsedForCurrentBlocker: 0,
      totalAttemptsForCurrentBlocker: 5,
      lastOutcome: 'infra_failure',
    });
  });

  test('same-hash oscillation exits immediately', async () => {
    const fixture = writeFixture();
    const note = 'The same blocker came back unchanged.';
    state.update(fixture.ralphDir, {
      supervisor: {
        currentBlockerHash: blockerHash(note),
        triesUsedForCurrentBlocker: 1,
        totalAttemptsForCurrentBlocker: 1,
        lastOutcome: 'patch_applied',
      },
    });
    const invoke = jest.fn();

    const result = await runSupervisor({
      blockerNote: note,
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 3 },
      iteration: 7,
      invoke,
      renderPrompt: () => 'prompt',
    });

    expect(result.outcome).toBe('blocked_handoff');
    expect(result.summary).toContain('same blocker hash reappeared');
    expect(invoke).not.toHaveBeenCalled();
    expect(state.read(fixture.ralphDir).supervisor).toEqual({
      currentBlockerHash: blockerHash(note),
      triesUsedForCurrentBlocker: 1,
      totalAttemptsForCurrentBlocker: 1,
      lastOutcome: 'oscillation',
    });
  });

  test('single-downstream-patch failure does not revert other downstream patches', async () => {
    const fixture = writeFixture();
    const invoke = jest.fn().mockResolvedValue({ stdout: 'ok', toolUsage: [] });
    const parseResponse = jest.fn().mockReturnValue({
      current_task_patch: {
        task_number: '4.7',
        new_body: buildTaskBody('4.7', 'Current patched', '`current.js`'),
        rationale: 'Repair the current blocker.',
      },
      downstream_patches: [
        {
          task_number: '4.8',
          operation: 'modify',
          new_body: buildTaskBody('4.8', 'Downstream one patched', '`downstream-one.js`'),
          rationale: 'Same structural fix applies here.',
        },
        {
          task_number: '4.9',
          operation: 'modify',
          new_body: buildTaskBody('4.9', 'Downstream two patched', '`downstream-two.js`'),
          rationale: 'Try the same patch here too.',
        },
      ],
      investigation_hints: [],
      summary: 'Patched the blocker and one downstream task.',
      downstream_rationale: 'Shared structural cause.',
    });
    const validateTaskStructure = jest.fn().mockReturnValue({
      ok: true,
      errors: [],
      warnings: [],
    });
    const applyTaskPatch = jest.fn().mockImplementation(({ tasksFile, patchedContent }) => {
      if (patchedContent.includes('Downstream two patched')) {
        return {
          ok: false,
          reason: 'validation_failed',
          stderr: 'strict validation failed for downstream two\n',
          stdout: '',
        };
      }
      fs.writeFileSync(tasksFile, patchedContent, 'utf8');
      return { ok: true, activeChangeId: 'demo-change' };
    });

    const result = await runSupervisor({
      blockerNote: 'Downstream tasks share the same structural problem.',
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 3, selfHealDownstream: true },
      iteration: 14,
      invoke,
      renderPrompt: () => 'prompt',
      parseResponse,
      validateTaskStructure,
      applyTaskPatch,
    });

    const writtenTasks = fs.readFileSync(fixture.tasksFile, 'utf8');
    expect(result.outcome).toBe('patch_applied');
    expect(result.patchedTasks).toEqual(['4.7', '4.8']);
    expect(result.summary).toContain('Downstream patch failures: 4.9:patch_rejected_validation');
    expect(writtenTasks).toContain('Current patched');
    expect(writtenTasks).toContain('Downstream one patched');
    expect(writtenTasks).not.toContain('Downstream two patched');
    expect(applyTaskPatch).toHaveBeenCalledTimes(3);
    expect(state.read(fixture.ralphDir).supervisor).toEqual({
      currentBlockerHash: blockerHash('Downstream tasks share the same structural problem.'),
      triesUsedForCurrentBlocker: 0,
      totalAttemptsForCurrentBlocker: 1,
      lastOutcome: 'patch_applied',
    });
  });

  test('explicit current_task_patch null decline consumes one try and exits', async () => {
    const fixture = writeFixture();
    const invoke = jest.fn().mockResolvedValue({ stdout: 'ok', toolUsage: [] });
    const parseResponse = jest.fn().mockReturnValue({
      current_task_patch: null,
      downstream_patches: [],
      investigation_hints: [],
      summary: 'I cannot safely rewrite this task without human guidance.',
      downstream_rationale: '',
    });

    const result = await runSupervisor({
      blockerNote: 'External product decision required.',
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 3 },
      iteration: 9,
      invoke,
      renderPrompt: () => 'prompt',
      parseResponse,
    });

    expect(result.outcome).toBe('blocked_handoff');
    expect(result.summary).toBe('I cannot safely rewrite this task without human guidance.');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(state.read(fixture.ralphDir).supervisor).toEqual({
      currentBlockerHash: blockerHash('External product decision required.'),
      triesUsedForCurrentBlocker: 1,
      totalAttemptsForCurrentBlocker: 1,
      lastOutcome: 'declined',
    });
  });

  test('runSupervisor rejects missing required paths before work starts', async () => {
    const fixture = writeFixture();

    await expect(runSupervisor({
      blockerNote: 'Need context.',
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      iteration: 1,
    })).rejects.toThrow('mini-ralph supervisor: ralphDir is required');

    await expect(runSupervisor({
      blockerNote: 'Need context.',
      ralphDir: fixture.ralphDir,
      openspecRoot: fixture.openspecRoot,
      iteration: 1,
    })).rejects.toThrow('mini-ralph supervisor: changeDir is required');

    await expect(runSupervisor({
      blockerNote: 'Need context.',
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      tasksFile: path.join(fixture.changeDir, 'missing-tasks.md'),
      iteration: 1,
    })).rejects.toThrow(`mini-ralph supervisor: tasks file not found: ${path.join(fixture.changeDir, 'missing-tasks.md')}`);
  });

  test('runSupervisor returns blocked handoff when no pending task remains', async () => {
    const fixture = writeFixture();
    fs.writeFileSync(fixture.tasksFile, [
      '# Tasks',
      '',
      '## 4. Supervisor Module',
      '',
      completedTaskBody('4.7', 'Implement the supervisor invocation orchestrator'),
      '',
      completedTaskBody('4.8', 'Implement investigation hints normalization and persistence'),
      '',
    ].join('\n'), 'utf8');
    const invoke = jest.fn();

    const result = await runSupervisor({
      blockerNote: 'All tasks are already complete.',
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 3 },
      iteration: 4,
      invoke,
    });

    expect(result).toEqual(expect.objectContaining({
      outcome: 'blocked_handoff',
      summary: 'Supervisor could not find a pending task to patch.',
      readLogs: false,
      readLogsBytes: 0,
    }));
    expect(invoke).not.toHaveBeenCalled();
    expect(state.read(fixture.ralphDir).supervisor.lastOutcome).toBe('no_pending_task');
  });

  test('runSupervisor treats invalid, missing, and mismatched patch responses as rejection paths', async () => {
    const fixture = writeFixture();
    const invoke = jest.fn().mockResolvedValue({ stdout: 'ok', toolUsage: [] });

    const invalidResponse = await runSupervisor({
      blockerNote: 'Supervisor returned nonsense.',
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 1 },
      iteration: 6,
      invoke,
      renderPrompt: () => 'prompt',
      parseResponse: () => 'nope',
    });

    expect(invalidResponse).toEqual(expect.objectContaining({
      outcome: 'blocked_handoff',
      summary: 'Supervisor exhausted the infrastructure-attempt cap before producing a valid patch.',
      readLogs: false,
      readLogsBytes: 0,
    }));
    expect(invoke).toHaveBeenCalledTimes(5);
    expect(state.read(fixture.ralphDir).supervisor).toEqual(expect.objectContaining({
      triesUsedForCurrentBlocker: 0,
      totalAttemptsForCurrentBlocker: 5,
      lastOutcome: 'infra_failure',
    }));

    const missingPatch = await runSupervisor({
      blockerNote: 'Supervisor omitted current_task_patch.',
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 1 },
      iteration: 7,
      invoke,
      renderPrompt: () => 'prompt',
      parseResponse: () => ({
        downstream_patches: [],
        investigation_hints: [],
        summary: 'Missing current_task_patch.',
        downstream_rationale: '',
      }),
    });

    expect(missingPatch).toEqual(expect.objectContaining({
      outcome: 'blocked_handoff',
      attemptsExhausted: true,
      attempts: ['try 1: patch_rejected_structural missing current_task_patch'],
    }));
    expect(state.read(fixture.ralphDir).supervisor).toEqual(expect.objectContaining({
      triesUsedForCurrentBlocker: 1,
      totalAttemptsForCurrentBlocker: 1,
      lastOutcome: 'patch_rejected_structural',
    }));

    const currentTaskMismatch = await runSupervisor({
      blockerNote: 'Supervisor patched the wrong task.',
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 1 },
      iteration: 8,
      invoke,
      renderPrompt: () => 'prompt',
      parseResponse: () => ({
        current_task_patch: {
          task_number: '9.9',
          new_body: buildTaskBody('9.9', 'Wrong task', '`wrong.js`'),
          rationale: 'Patch the wrong task on purpose.',
        },
        downstream_patches: [],
        investigation_hints: [],
        summary: 'Wrong task number.',
        downstream_rationale: '',
      }),
    });

    expect(currentTaskMismatch).toEqual(expect.objectContaining({
      outcome: 'blocked_handoff',
      attemptsExhausted: true,
      attempts: ['try 1: patch_rejected_structural current task mismatch (9.9)'],
    }));
    expect(state.read(fixture.ralphDir).supervisor).toEqual(expect.objectContaining({
      triesUsedForCurrentBlocker: 1,
      totalAttemptsForCurrentBlocker: 1,
      lastOutcome: 'patch_rejected_structural',
    }));
  });

  test('runSupervisor handles parser infra failures and missing log-audit fields without consuming tries', async () => {
    const fixture = writeFixture();
    const invoke = jest.fn().mockResolvedValue({});

    const result = await runSupervisor({
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 1, selfHealLogAccess: false },
      iteration: 10,
      invoke,
      renderPrompt: () => 'prompt',
      detectSupervisorLogReads: () => ({}),
    });

    expect(result).toEqual(expect.objectContaining({
      outcome: 'blocked_handoff',
      summary: 'Supervisor exhausted the infrastructure-attempt cap before producing a valid patch.',
      attempts: [],
      readLogs: false,
      readLogsBytes: 0,
    }));
    expect(invoke).toHaveBeenCalledTimes(5);
    expect(state.read(fixture.ralphDir).supervisor).toEqual(expect.objectContaining({
      triesUsedForCurrentBlocker: 0,
      totalAttemptsForCurrentBlocker: 5,
      lastOutcome: 'infra_failure',
    }));
  });

  test('runSupervisor records structural rejections and fallback summaries for missing task numbers and declines', async () => {
    const fixture = writeFixture();
    const invoke = jest.fn().mockResolvedValue({ stdout: 'ok', toolUsage: [] });

    const structuralRejection = await runSupervisor({
      blockerNote: 'Supervisor named an unknown task.',
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 1 },
      iteration: 11,
      invoke,
      renderPrompt: () => 'prompt',
      parseResponse: () => ({ kind: 'structural_rejection', reason: 'unknown_task_number' }),
    });

    expect(structuralRejection).toEqual(expect.objectContaining({
      outcome: 'blocked_handoff',
      attemptsExhausted: true,
      attempts: ['try 1: patch_rejected_structural unknown_task_number'],
    }));

    const declined = await runSupervisor({
      blockerNote: 'Supervisor has no safe patch.',
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 1, selfHealHints: false, selfHealLogAccess: false },
      iteration: 12,
      invoke,
      renderPrompt: () => 'prompt',
      parseResponse: () => ({
        current_task_patch: null,
        downstream_patches: [],
        investigation_hints: [{ path: 'lib/mini-ralph/supervisor.js', rationale: 'ignored while hints are disabled' }],
        summary: '',
        downstream_rationale: '',
      }),
    });

    expect(declined).toEqual(expect.objectContaining({
      outcome: 'blocked_handoff',
      summary: 'Supervisor declined to patch the current task.',
      hints: [],
      hintsDropped: [],
      attempts: ['try 1: declined Supervisor declined to patch the current task.'],
      readLogs: null,
      readLogsBytes: null,
    }));

    const missingTaskNumber = await runSupervisor({
      blockerNote: 'Supervisor omitted the current task number.',
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 1 },
      iteration: 13,
      invoke,
      renderPrompt: () => 'prompt',
      parseResponse: () => ({
        current_task_patch: {
          new_body: buildTaskBody('4.7', 'Patched current task', '`current.js`'),
          rationale: 'Deliberately omit the task number.',
        },
        downstream_patches: [],
        investigation_hints: [],
        summary: 'Missing task number.',
        downstream_rationale: '',
      }),
    });

    expect(missingTaskNumber).toEqual(expect.objectContaining({
      outcome: 'blocked_handoff',
      attemptsExhausted: true,
      attempts: ['try 1: patch_rejected_structural current task mismatch (missing)'],
    }));
  });

  test('runSupervisor applies insert patches, preserves existing audit comments, and reports downstream failures without a summary prefix', async () => {
    const fixture = writeFixture();
    const invoke = jest.fn().mockResolvedValue({ stdout: 'ok', toolUsage: [] });
    const existingAuditTask = [
      '- [ ] 4.6 **Inserted task with preserved audit comment**',
      '  - Scope: `inserted.js`',
      '  - Change: Exercise insert-before task patching.',
      '  - Done when:',
      '    - inserted coverage exists',
      '    - the inserted task remains pending',
      '    - spacing around the inserted task is preserved',
      '  - Stop and hand off if:',
      '    - insertion ordering becomes ambiguous',
      '  <!-- supervised-edit: iter=2 reason="keep original" hash=feedbeef -->',
    ].join('\n');
    const insertedAfterTask = [
      '- [ ] 4.85 **Inserted task after the anchor**',
      '  - Scope: `after.js`',
      '  - Change: Exercise insert-after spacing.',
      '  - Done when:',
      '    - inserted coverage exists',
      '    - spacing after the anchor is preserved',
      '    - downstream insertions stay pending',
      '  - Stop and hand off if:',
      '    - downstream insertion order is ambiguous',
    ].join('\n');
    const parseResponse = jest.fn().mockReturnValue({
      current_task_patch: {
        task_number: '4.7',
        new_body: buildTaskBody('4.7', 'Current patched', '`current.js`'),
      },
      downstream_patches: [
        {
          task_number: '4.6',
          anchor_task_number: '4.7',
          operation: 'insert_before',
          new_body: existingAuditTask,
        },
        {
          task_number: '4.85',
          anchor_task_number: '4.8',
          operation: 'insert_after',
          new_body: insertedAfterTask,
          rationale: 'Place a follow-up task after the next anchor.',
        },
        null,
        {
          task_number: '9.9',
          operation: 'modify',
          new_body: buildTaskBody('9.9', 'Missing downstream task', '`missing.js`'),
          rationale: 'Target a missing task to force a structural failure.',
        },
        {
          task_number: '4.95',
          anchor_task_number: '9.9',
          operation: 'insert_after',
          new_body: insertedAfterTask,
          rationale: 'Anchor a task after a missing target.',
        },
      ],
      investigation_hints: [],
      summary: '',
      downstream_rationale: '',
    });
    const validateTaskStructure = jest.fn().mockReturnValue({ ok: true, errors: [] });
    const applyTaskPatch = jest.fn().mockImplementation(({ tasksFile, patchedContent }) => {
      fs.writeFileSync(tasksFile, patchedContent, 'utf8');
      return { ok: true, activeChangeId: 'demo-change' };
    });

    const result = await runSupervisor({
      blockerNote: 'Downstream inserts should be applied mechanically.',
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 1, selfHealDownstream: true },
      iteration: 14,
      invoke,
      renderPrompt: () => 'prompt',
      parseResponse,
      validateTaskStructure,
      applyTaskPatch,
    });

    const writtenTasks = fs.readFileSync(fixture.tasksFile, 'utf8');
    expect(result).toEqual(expect.objectContaining({
      outcome: 'patch_applied',
      patchedTasks: ['4.7', '4.6', '4.85'],
      summary: 'Downstream patch failures: unknown:patch_rejected_structural, 9.9:patch_rejected_structural, 4.95:patch_rejected_structural',
    }));
    expect(writtenTasks).toContain('4.6 **Inserted task with preserved audit comment**');
    expect(writtenTasks).toContain('4.85 **Inserted task after the anchor**');
    expect(writtenTasks).toContain('<!-- supervised-edit: iter=2 reason="keep original" hash=feedbeef -->');
    expect(validateTaskStructure).toHaveBeenCalled();
    expect(applyTaskPatch).toHaveBeenCalledTimes(3);
  });
});

function writeFixture() {
  const workspaceRoot = path.join(tmpDir, 'workspace');
  const openspecRoot = path.join(workspaceRoot, 'openspec');
  const changeDir = path.join(openspecRoot, 'changes', 'demo-change');
  const ralphDir = path.join(workspaceRoot, '.ralph');
  const tasksFile = path.join(changeDir, 'tasks.md');
  fs.mkdirSync(changeDir, { recursive: true });
  fs.mkdirSync(ralphDir, { recursive: true });
  fs.writeFileSync(path.join(openspecRoot, 'config.yaml'), 'strict: true\n', 'utf8');
  fs.writeFileSync(path.join(openspecRoot, 'OPENSPEC-RALPH-BP.md'), '## Task template\n', 'utf8');
  fs.writeFileSync(path.join(changeDir, 'proposal.md'), '## Why\nNeed supervisor orchestration.\n', 'utf8');
  fs.writeFileSync(path.join(changeDir, 'design.md'), '## Scope\nPatch tasks only.\n', 'utf8');
  fs.writeFileSync(tasksFile, [
    '# Tasks',
    '',
    '## 4. Supervisor Module',
    '',
    buildTaskBody('4.7', 'Implement the supervisor invocation orchestrator', '`lib/mini-ralph/supervisor.js`'),
    '',
    buildTaskBody('4.8', 'Implement investigation hints normalization and persistence', '`lib/mini-ralph/prompt.js`'),
    '',
    buildTaskBody('4.9', 'Implement on-demand log-tail access plumbing and audit detection', '`lib/mini-ralph/supervisor.js`'),
    '',
  ].join('\n'), 'utf8');
  return { workspaceRoot, openspecRoot, changeDir, ralphDir, tasksFile };
}

function buildTaskBody(number, title, scopePath) {
  return [
    `- [ ] ${number} **${title}**`,
    `  - Scope: ${scopePath}`,
    '  - Change: Keep the repair mechanical and scoped.',
    '  - Done when:',
    '    - focused unit coverage exists',
    '    - the task body stays structurally valid',
    '    - the relevant verifier exits 0',
    '  - Stop and hand off if:',
    '    - an external policy decision is required',
  ].join('\n');
}

function completedTaskBody(number, title) {
  return `- [x] ${number} **${title}**`;
}

function blockerHash(note) {
  return crypto.createHash('sha256').update(String(note).trim()).digest('hex').slice(0, 16);
}
