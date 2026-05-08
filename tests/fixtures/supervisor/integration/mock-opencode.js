#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const prompt = args[args.length - 1] || '';
const scenario = process.env.MOCK_OPENCODE_SCENARIO || 'happy_path';
const stateFile = process.env.MOCK_OPENCODE_STATE_FILE || path.join(process.cwd(), '.mock-opencode-state.json');
const promptCaptureFile = process.env.MOCK_OPENCODE_CAPTURE_PROMPT_FILE || '';
const changeName = process.env.MOCK_OPENCODE_CHANGE_NAME || 'supervisor-demo-change';
const tasksFile = path.join(process.cwd(), 'openspec', 'changes', changeName, 'tasks.md');

const state = readState();

if ((args[0] || '') !== 'run') {
  process.stderr.write(`mock-opencode: unsupported args: ${args.join(' ')}\n`);
  process.exit(2);
}

if (isSupervisorPrompt(prompt)) {
  state.supervisorCalls += 1;
  writeState(state);
  process.stdout.write(renderSupervisorResponse(state.supervisorCalls, prompt));
  process.exit(0);
}

state.implementerCalls += 1;
writeState(state);

if (state.implementerCalls === 1) {
  process.stdout.write(blockedHandoffNote());
  process.exit(0);
}

if (promptCaptureFile) {
  fs.writeFileSync(promptCaptureFile, prompt, 'utf8');
}

markCurrentTaskComplete(tasksFile);
process.stdout.write('<promise>COMPLETE</promise>\n');
process.exit(0);

function isSupervisorPrompt(text) {
  return String(text || '').includes('# Supervisor Prompt');
}

function blockedHandoffNote() {
  return [
    '## Blocker Note',
    'The current task is blocked on a mechanical task rewrite that the supervisor can apply safely.',
    '',
    '## Why',
    'The task needs a scoped rewrite before the implementer can complete it without violating the handoff clause.',
    '',
    '## Suggested Next Step',
    '- Let the supervisor patch tasks.md and retry the implementer prompt.',
    '',
    '<promise>BLOCKED_HANDOFF</promise>',
    '',
  ].join('\n');
}

function renderSupervisorResponse(supervisorCalls, promptText) {
  switch (scenario) {
    case 'budget_exhaustion':
      return renderBudgetExhaustionResponse(supervisorCalls);
    case 'hints_round_trip':
      return renderStructuredResponse({
        current_task_patch: {
          task_number: '1.1',
          new_body: patchedTaskBody(),
          rationale: 'Widen the task so the implementer can complete the supervisor integration coverage.',
        },
        downstream_patches: [],
        investigation_hints: [
          { path: `openspec/changes/${changeName}/proposal.md`, rationale: 'Read the change motivation before finalizing the task.' },
          { path: `openspec/changes/${changeName}/design.md`, rationale: 'Read the design notes to confirm the mocked flow stays within scope.' },
          { path: `openspec/changes/${changeName}/tasks.md`, rationale: 'Read the task body after the supervisor patch to confirm the new verifier shape.' },
          { path: '../outside.md', rationale: 'This should be dropped as out of tree.' },
          { path: '/etc/passwd', rationale: 'This absolute path should also be dropped.' },
        ],
        summary: 'Patch the blocked task and point the implementer at the proposal, design, and updated task body.',
        downstream_rationale: '',
      });
    case 'log_read':
      return renderStructuredResponse({
        current_task_patch: {
          task_number: '1.1',
          new_body: patchedTaskBody(),
          rationale: 'Repair the task after consulting the captured stdout log tail.',
        },
        downstream_patches: [],
        investigation_hints: [],
        summary: 'Repair the blocked task after reading the run log tail.',
        downstream_rationale: '',
      }, renderToolUsageBlock(extractLogPath(promptText) || '/tmp/mock-stdout.log'));
    case 'log_read_opt_out':
      return renderStructuredResponse({
        current_task_patch: {
          task_number: '1.1',
          new_body: patchedTaskBody(),
          rationale: 'Repair the task even when log access is opted out.',
        },
        downstream_patches: [],
        investigation_hints: [],
        summary: 'Repair the blocked task while emitting a log-read trace that should be ignored.',
        downstream_rationale: '',
      }, renderToolUsageBlock('/tmp/ignored-stdout.log'));
    case 'happy_path':
    default:
      return renderStructuredResponse({
        current_task_patch: {
          task_number: '1.1',
          new_body: patchedTaskBody(),
          rationale: 'Widen the task so the implementer can complete the supervisor integration flow.',
        },
        downstream_patches: [],
        investigation_hints: [],
        summary: 'Repair the blocked task so the implementer can finish on the next iteration.',
        downstream_rationale: '',
      });
  }
}

function renderBudgetExhaustionResponse(supervisorCalls) {
  if (supervisorCalls === 1) {
    return renderStructuredResponse({
      current_task_patch: {
        task_number: '1.1',
        new_body: [
          '- [ ] 1.1 **Broken patch for budget exhaustion**',
          '  - Scope: `openspec/changes/supervisor-demo-change/tasks.md`',
          '  - Change: Intentionally under-spec the task so the supervisor consumes one try.',
          '  - Done when:',
          '    - one bullet is not enough for this task shape',
          '  - Stop and hand off if:',
          '    - the harness is not exercising the intended failure path',
          '',
        ].join('\n'),
        rationale: 'Consume one try with an under-specified task body.',
      },
      downstream_patches: [],
      investigation_hints: [],
      summary: 'Try 1 intentionally under-specifies Done when bullets.',
      downstream_rationale: '',
    });
  }

  if (supervisorCalls === 2) {
    return renderStructuredResponse({
      current_task_patch: {
        task_number: '1.1',
        new_body: [
          '- [ ] 1.1 **Broken patch missing a stop clause**',
          '  - Scope: `openspec/changes/supervisor-demo-change/tasks.md`',
          '  - Change: Intentionally omit the stop clause so Layer beta rejects the patch.',
          '  - Done when:',
          '    - `npx openspec validate supervisor-demo-change --strict` exits 0',
          '    - `openspec/changes/supervisor-demo-change/tasks.md` remains present',
          '    - the supervisor budget path stays covered by integration tests',
          '',
        ].join('\n'),
        rationale: 'Consume one try with a missing Stop and hand off if clause.',
      },
      downstream_patches: [],
      investigation_hints: [],
      summary: 'Try 2 intentionally omits the stop clause.',
      downstream_rationale: '',
    });
  }

  return renderStructuredResponse({
    current_task_patch: {
      task_number: '9.9',
      new_body: patchedTaskBody(),
      rationale: 'Consume the final try with an unknown task number.',
    },
    downstream_patches: [],
    investigation_hints: [],
    summary: 'Try 3 intentionally targets an unknown task number.',
    downstream_rationale: '',
  });
}

function patchedTaskBody() {
  return [
    '- [ ] 1.1 **Repair the blocked task via supervisor patch**',
    `  - Scope: \`openspec/changes/${changeName}/tasks.md\`, \`tests/integration/supervisor-loop.bats\``,
    '  - Change: Rewrite the task so the mocked implementer can complete the self-heal integration flow after the supervisor patch lands.',
    '  - Done when:',
    '    - `npx openspec validate supervisor-demo-change --strict` exits 0',
    '    - `.ralph/HANDOFF.md` records the supervisor edit summary for the blocker event',
    '    - `.ralph/ralph-history.json` records a `supervisorEdit` entry with `validatorOk: true`',
    '  - Stop and hand off if:',
    '    - the mocked supervisor response no longer produces a strict-valid task body for this fixture',
    '',
  ].join('\n');
}

function renderStructuredResponse(payload, extraBlock = '') {
  return [
    '```supervisor-response',
    JSON.stringify(payload, null, 2),
    '```',
    extraBlock,
    '',
  ].filter(Boolean).join('\n');
}

function renderToolUsageBlock(stdoutLogPath) {
  return [
    '```tool-usage',
    JSON.stringify([
      {
        tool: 'Read',
        input: { filePath: stdoutLogPath, offset: 0, limit: 80 },
        output: { bytes: 256 },
      },
    ], null, 2),
    '```',
  ].join('\n');
}

function extractLogPath(promptText) {
  const match = String(promptText || '').match(/stdout:\s*`([^`]*)`/);
  return match ? match[1].trim() : '';
}

function markCurrentTaskComplete(filePath) {
  const body = fs.readFileSync(filePath, 'utf8');
  const updated = body.replace(/^- \[ \] 1\.1 /m, '- [x] 1.1 ');
  fs.writeFileSync(filePath, updated, 'utf8');
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return { implementerCalls: 0, supervisorCalls: 0 };
  }
}

function writeState(nextState) {
  fs.writeFileSync(stateFile, JSON.stringify(nextState, null, 2), 'utf8');
}
