'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '../../../scripts/mini-ralph-cli.js');
const { _parseArgs } = require('../../../scripts/mini-ralph-cli.js');
const { _resolveSupervisorConfig } = require('../../../lib/mini-ralph/runner');

function withEnv(overrides, fn) {
  const original = {};
  for (const [key, value] of Object.entries(overrides)) {
    original[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe('mini-ralph supervisor CLI config', () => {
  test('help advertises each self-heal flag with its env partner', () => {
    const result = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--no-self-heal             Disable supervisor self-heal (env: RALPH_SELF_HEAL=0)');
    expect(result.stdout).toContain('--self-heal-max-tries <n>  Supervisor tries per blocker (env: RALPH_SELF_HEAL_MAX_TRIES)');
    expect(result.stdout).toContain('--no-self-heal-downstream  Disable downstream supervisor patches (env: RALPH_SELF_HEAL_DOWNSTREAM=0)');
    expect(result.stdout).toContain('--no-self-heal-hints       Disable supervisor investigation hints (env: RALPH_SELF_HEAL_HINTS=0)');
    expect(result.stdout).toContain('--no-self-heal-log-access  Disable supervisor log-path injection (env: RALPH_SELF_HEAL_LOG_ACCESS=0)');
    expect(result.stdout).toContain('--self-heal-verbose        Enable supervisor debug logging (env: RALPH_SELF_HEAL_VERBOSE=1)');
    expect(result.stdout).toContain('--no-self-heal-verbose     Disable supervisor debug logging, even with --verbose');
  });

  test('resolveSupervisorConfig uses defaults when CLI and env are absent', () => {
    withEnv({
      RALPH_SELF_HEAL: undefined,
      RALPH_SELF_HEAL_MAX_TRIES: undefined,
      RALPH_SELF_HEAL_DOWNSTREAM: undefined,
      RALPH_SELF_HEAL_HINTS: undefined,
      RALPH_SELF_HEAL_LOG_ACCESS: undefined,
      RALPH_SELF_HEAL_VERBOSE: undefined,
      RALPH_SELF_HEAL_RULE_CACHE: undefined,
      RALPH_SELF_HEAL_VALIDATION_TIMEOUT_MS: undefined,
    }, () => {
      expect(_resolveSupervisorConfig({ verbose: false })).toEqual({
        selfHeal: true,
        selfHealMaxTries: 3,
        selfHealDownstream: true,
        selfHealHints: true,
        selfHealLogAccess: true,
        selfHealVerbose: false,
        ruleCacheEnabled: true,
        validationTimeoutMs: 30000,
      });
    });
  });

  test('resolveSupervisorConfig reads env vars for each self-heal setting', () => {
    withEnv({
      RALPH_SELF_HEAL: '0',
      RALPH_SELF_HEAL_MAX_TRIES: '7',
      RALPH_SELF_HEAL_DOWNSTREAM: 'false',
      RALPH_SELF_HEAL_HINTS: 'off',
      RALPH_SELF_HEAL_LOG_ACCESS: 'no',
      RALPH_SELF_HEAL_VERBOSE: '1',
      RALPH_SELF_HEAL_RULE_CACHE: '0',
      RALPH_SELF_HEAL_VALIDATION_TIMEOUT_MS: '45000',
    }, () => {
      expect(_resolveSupervisorConfig({ verbose: false })).toEqual({
        selfHeal: false,
        selfHealMaxTries: 7,
        selfHealDownstream: false,
        selfHealHints: false,
        selfHealLogAccess: false,
        selfHealVerbose: true,
        ruleCacheEnabled: false,
        validationTimeoutMs: 45000,
      });
    });
  });

  test('CLI flags override env values for each self-heal field', () => {
    withEnv({
      RALPH_SELF_HEAL: '1',
      RALPH_SELF_HEAL_MAX_TRIES: '7',
      RALPH_SELF_HEAL_DOWNSTREAM: '1',
      RALPH_SELF_HEAL_HINTS: '1',
      RALPH_SELF_HEAL_LOG_ACCESS: '1',
      RALPH_SELF_HEAL_VERBOSE: '0',
    }, () => {
      const opts = _parseArgs([
        'node',
        CLI,
        '--no-self-heal',
        '--self-heal-max-tries', '2',
        '--no-self-heal-downstream',
        '--no-self-heal-hints',
        '--no-self-heal-log-access',
        '--self-heal-verbose',
      ]);

      expect(_resolveSupervisorConfig(opts)).toMatchObject({
        selfHeal: false,
        selfHealMaxTries: 2,
        selfHealDownstream: false,
        selfHealHints: false,
        selfHealLogAccess: false,
        selfHealVerbose: true,
      });
    });
  });

  test('--verbose implies selfHealVerbose unless explicitly disabled', () => {
    withEnv({ RALPH_SELF_HEAL_VERBOSE: '0' }, () => {
      expect(_resolveSupervisorConfig(_parseArgs(['node', CLI, '--verbose']))).toMatchObject({
        selfHealVerbose: true,
      });

      expect(
        _resolveSupervisorConfig(_parseArgs(['node', CLI, '--verbose', '--no-self-heal-verbose']))
      ).toMatchObject({
        selfHealVerbose: false,
      });
    });
  });
});
