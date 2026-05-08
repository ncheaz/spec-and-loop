'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  _detectSupervisorLogReads,
  _resolveRunLogPaths,
  runSupervisor,
} = require('../../../lib/mini-ralph/supervisor');

let tmpDir;
let priorLogAccessEnv;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-supervisor-logaccess-'));
  priorLogAccessEnv = process.env.RALPH_SELF_HEAL_LOG_ACCESS;
});

afterEach(() => {
  if (priorLogAccessEnv === undefined) {
    delete process.env.RALPH_SELF_HEAL_LOG_ACCESS;
  } else {
    process.env.RALPH_SELF_HEAL_LOG_ACCESS = priorLogAccessEnv;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('mini-ralph supervisor log access', () => {
  test('.output_dir present + log files exist -> paths resolved', () => {
    const fixture = writeFixture();
    const outputDir = path.join(fixture.workspaceRoot, 'run-output');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(fixture.ralphDir, '.output_dir'), `${outputDir}\n`, 'utf8');
    fs.writeFileSync(path.join(outputDir, 'ralph-stdout.log'), 'stdout\n', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'ralph-stderr.log'), 'stderr\n', 'utf8');

    expect(_resolveRunLogPaths({ ralphDir: fixture.ralphDir })).toEqual({
      stdoutLog: path.join(outputDir, 'ralph-stdout.log'),
      stderrLog: path.join(outputDir, 'ralph-stderr.log'),
    });
  });

  test('.output_dir missing -> empty strings', () => {
    const fixture = writeFixture();

    expect(_resolveRunLogPaths({ ralphDir: fixture.ralphDir })).toEqual({
      stdoutLog: '',
      stderrLog: '',
    });
  });

  test('tool-use trace shows stdout-log read -> true + bytes recorded', () => {
    const stdoutLog = path.join(tmpDir, 'ralph-stdout.log');
    const stderrLog = path.join(tmpDir, 'ralph-stderr.log');

    const audit = _detectSupervisorLogReads({
      stdoutLog,
      stderrLog,
      result: {
        toolUsage: [
          {
            tool: 'Read',
            input: { filePath: stdoutLog, offset: 1200, limit: 80 },
            output: { bytes: 321 },
          },
        ],
      },
    });

    expect(audit).toEqual({
      supervisorReadLogs: true,
      supervisorReadLogsBytes: 321,
    });
  });

  test('no tool-use details surfaced -> null', () => {
    const audit = _detectSupervisorLogReads({
      stdoutLog: path.join(tmpDir, 'ralph-stdout.log'),
      stderrLog: path.join(tmpDir, 'ralph-stderr.log'),
      result: {
        toolUsage: [
          { tool: 'Read', count: 2 },
        ],
      },
    });

    expect(audit).toEqual({
      supervisorReadLogs: null,
      supervisorReadLogsBytes: null,
    });
  });

  test('opt-out env var -> empty strings regardless of .output_dir', async () => {
    const fixture = writeFixture();
    const outputDir = path.join(fixture.workspaceRoot, 'run-output');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(fixture.ralphDir, '.output_dir'), `${outputDir}\n`, 'utf8');
    fs.writeFileSync(path.join(outputDir, 'ralph-stdout.log'), 'stdout\n', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'ralph-stderr.log'), 'stderr\n', 'utf8');
    process.env.RALPH_SELF_HEAL_LOG_ACCESS = '0';

    expect(_resolveRunLogPaths({ ralphDir: fixture.ralphDir })).toEqual({
      stdoutLog: '',
      stderrLog: '',
    });

    const renderPrompt = jest.fn(() => 'prompt');
    const invoke = jest.fn().mockResolvedValue({ stdout: 'ok', toolUsage: [] });

    await runSupervisor({
      blockerNote: 'Need to inspect logs.',
      ralphDir: fixture.ralphDir,
      changeDir: fixture.changeDir,
      openspecRoot: fixture.openspecRoot,
      config: { selfHealMaxTries: 1, selfHealLogAccess: true },
      iteration: 5,
      renderPrompt,
      invoke,
      parseResponse: () => ({
        current_task_patch: null,
        downstream_patches: [],
        investigation_hints: [],
        summary: 'Decline after prompt render.',
        downstream_rationale: '',
      }),
    });

    expect(renderPrompt).toHaveBeenCalledWith(expect.objectContaining({
      runStdoutLogPath: '',
      runStderrLogPath: '',
    }));
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
  fs.writeFileSync(path.join(changeDir, 'proposal.md'), '## Why\nNeed supervisor log access.\n', 'utf8');
  fs.writeFileSync(path.join(changeDir, 'design.md'), '## Scope\nPatch tasks only.\n', 'utf8');
  fs.writeFileSync(tasksFile, [
    '# Tasks',
    '',
    '## 4. Supervisor Module',
    '',
    '- [ ] 4.9 **Implement on-demand log-tail access plumbing and audit detection**',
    '  - Scope: `lib/mini-ralph/supervisor.js` (`_resolveRunLogPaths`, `_detectSupervisorLogReads`), `tests/unit/javascript/mini-ralph-supervisor-logaccess.test.js`',
    '  - Change: resolve run logs from `.output_dir` and audit log reads from supervisor tool usage.',
    '  - Done when:',
    '    - focused log-access tests pass',
    '    - prompt rendering receives empty log paths when access is disabled',
    '    - no files outside `.ralph/` and `tasks.md` are written during the flow',
    '  - Stop and hand off if:',
    '    - the OpenCode build only exposes aggregate tool counts and the operator requires strict audit semantics',
    '',
  ].join('\n'), 'utf8');

  return {
    workspaceRoot,
    openspecRoot,
    changeDir,
    ralphDir,
    tasksFile,
  };
}
