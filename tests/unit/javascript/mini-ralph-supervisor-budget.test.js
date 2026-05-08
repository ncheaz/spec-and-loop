'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const state = require('../../../lib/mini-ralph/state');
const { runSupervisor } = require('../../../lib/mini-ralph/supervisor');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-supervisor-budget-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('mini-ralph supervisor budget orchestrator', () => {
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

function blockerHash(note) {
  return crypto.createHash('sha256').update(String(note).trim()).digest('hex').slice(0, 16);
}
