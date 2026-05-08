'use strict';

const fs = require('fs');
const path = require('path');

const { _renderSupervisorPrompt, _resetRuleSourceCache } = require('../../../lib/mini-ralph/supervisor');

const FIXTURE_ROOT = path.resolve(__dirname, '../../fixtures/supervisor/uxep');
const OPENSPEC_ROOT = path.resolve(FIXTURE_ROOT, 'openspec');
const CHANGE_DIR = path.resolve(
  OPENSPEC_ROOT,
  'changes',
  'docs-ia-and-nextra-theme-restoration'
);
const TASKS_FILE = path.resolve(CHANGE_DIR, 'tasks.md');
const BLOCKER_NOTE_FILE = path.resolve(FIXTURE_ROOT, 'blocker-note.md');

const ENV_KEYS = [
  'RALPH_SELF_HEAL_FULL_PROPOSAL',
  'RALPH_SELF_HEAL_FULL_DESIGN',
  'RALPH_SELF_HEAL_FULL_BP_CONTEXT',
  'RALPH_SELF_HEAL_FULL_DOWNSTREAM',
  'RALPH_SELF_HEAL_KEEP_DOWNSTREAM_ON_RETRY',
];

const savedEnv = new Map();

beforeAll(() => {
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  _resetRuleSourceCache();
});

function readFixture(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function getPromptInputs() {
  const blockerNote = readFixture(BLOCKER_NOTE_FILE).trim();
  const tasksMd = readFixture(TASKS_FILE);
  const parsedTasks = scanTaskBlocks(tasksMd);
  const currentIndex = parsedTasks.findIndex((task) => task.status === 'incomplete');

  if (currentIndex === -1) {
    throw new Error('mini-ralph supervisor token budget: no incomplete task found in fixture');
  }

  const currentTask = parsedTasks[currentIndex];
  const downstreamTaskNumbers = parsedTasks
    .slice(currentIndex + 1)
    .filter((task) => task.status !== 'completed')
    .map((task) => task.body);
  const downstreamTasks = downstreamTaskNumbers
    .join('\n\n');

  return {
    changeDir: CHANGE_DIR,
    openspecRoot: OPENSPEC_ROOT,
    tasksFile: TASKS_FILE,
    blockerNote,
    currentTaskNumber: currentTask.number,
    currentTaskBody: currentTask.body,
    downstreamTasks,
    handoffHistory: [
      '## Iteration 11',
      '',
      'Blocked on proving the supervisor prompt byte budget against a checked-in UXEP fixture.',
    ].join('\n'),
    recentIterations: [
      'Iteration 9 -> READY_FOR_NEXT_TASK',
      'Iteration 10 -> READY_FOR_NEXT_TASK',
      'Iteration 11 -> BLOCKED_HANDOFF',
    ].join('\n'),
    previousSupervisorAttempts: [
      'Try 1 measured bytes against a placeholder task stream and could not prove the retry threshold.',
    ].join('\n'),
    runStdoutLogPath: '/tmp/ralph-stdout.log',
    runStderrLogPath: '/tmp/ralph-stderr.log',
  };
}

function scanTaskBlocks(tasksMd) {
  const lines = String(tasksMd).split('\n');
  const taskStarts = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (/^-\s+\[(?: |x|\/)\]\s+/.test(lines[index])) {
      taskStarts.push(index);
    }
  }

  return taskStarts.map((startIndex, index) => {
    const endIndex = index + 1 < taskStarts.length ? taskStarts[index + 1] : lines.length;
    const firstLine = lines[startIndex];
    const body = lines.slice(startIndex, endIndex).join('\n').trim();
    const numberMatch = firstLine.match(/\*\*(\d+(?:\.\d+)+)\b/) || firstLine.match(/^-\s+\[(?: |x|\/)\]\s+(\d+(?:\.\d+)+)\b/);
    return {
      number: numberMatch ? numberMatch[1] : '',
      status: firstLine.includes('[x]') ? 'completed' : firstLine.includes('[/]') ? 'in_progress' : 'incomplete',
      body,
    };
  });
}

function renderPrompt(tryIndex, env = {}) {
  const previous = new Map();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    return _renderSupervisorPrompt({
      ...getPromptInputs(),
      tryIndex,
    });
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function renderBytes(tryIndex, env = {}) {
  return Buffer.byteLength(renderPrompt(tryIndex, env), 'utf8');
}

describe('mini-ralph supervisor token budget', () => {
  test('try-1 rendered prompt is at most 55 KiB on the UXEP fixture', () => {
    expect(renderBytes(1)).toBeLessThanOrEqual(55 * 1024);
  });

  test('try-2 rendered prompt is at most 54 KiB on the UXEP fixture', () => {
    expect(renderBytes(2)).toBeLessThanOrEqual(54 * 1024);
  });

  test('try-3 rendered prompt is at most 54 KiB on the UXEP fixture', () => {
    expect(renderBytes(3)).toBeLessThanOrEqual(54 * 1024);
  });

  test('try-1 exceeds 55 KiB when fullProposal is disabled', () => {
    expect(renderBytes(1, { RALPH_SELF_HEAL_FULL_PROPOSAL: '1' })).toBeGreaterThan(55 * 1024);
  });

  test('try-1 exceeds 55 KiB when fullDesign is disabled', () => {
    expect(renderBytes(1, { RALPH_SELF_HEAL_FULL_DESIGN: '1' })).toBeGreaterThan(55 * 1024);
  });

  test('try-1 exceeds 55 KiB when fullBpContext is disabled', () => {
    expect(renderBytes(1, { RALPH_SELF_HEAL_FULL_BP_CONTEXT: '1' })).toBeGreaterThan(55 * 1024);
  });

  test('try-1 exceeds 55 KiB when fullDownstream is disabled', () => {
    expect(renderBytes(1, { RALPH_SELF_HEAL_FULL_DOWNSTREAM: '1' })).toBeGreaterThan(55 * 1024);
  });

  test('try-2 grows when keepDownstreamOnRetry is enabled', () => {
    const defaultBytes = renderBytes(2);
    const keepOnBytes = renderBytes(2, { RALPH_SELF_HEAL_KEEP_DOWNSTREAM_ON_RETRY: '1' });
    expect(keepOnBytes).toBeGreaterThan(defaultBytes);
  });
});
