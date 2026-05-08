'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  _parseSupervisorResponse,
  _SUPERVISOR_TEMPLATE_VARIABLES,
} = require('../../../lib/mini-ralph/supervisor');

let tmpDir;
let priorTasksEnv;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-supervisor-test-'));
  priorTasksEnv = process.env.RALPH_TASKS_FILE;
});

afterEach(() => {
  if (priorTasksEnv === undefined) {
    delete process.env.RALPH_TASKS_FILE;
  } else {
    process.env.RALPH_TASKS_FILE = priorTasksEnv;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
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
