'use strict';

/**
 * CLI-flag tests for scripts/mini-ralph-cli.js.
 *
 * The CLI is spawned as a subprocess with --help to verify that newly added
 * flags (currently --blocked-handoff-promise) are advertised, and with
 * --blocked-handoff-promise + a stub --add-context to verify that an unknown
 * flag would crash so this test catches accidental wiring regressions
 * without spinning up the full loop.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '../../../scripts/mini-ralph-cli.js');

describe('mini-ralph-cli flag parsing', () => {
  test('--help advertises --blocked-handoff-promise', () => {
    const result = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--blocked-handoff-promise');
    expect(result.stdout).toContain('BLOCKED_HANDOFF');
  });

  test('--blocked-handoff-promise is accepted (no "unknown option" crash)', () => {
    // Use --status with a non-existent ralph-dir so the CLI exits early but
    // only AFTER successfully parsing its arguments. Any unknown-flag error
    // would happen during parseArgs() and surface on stderr with exit 1.
    const result = spawnSync(
      'node',
      [
        CLI,
        '--blocked-handoff-promise', 'CUSTOM_HANDOFF',
        '--status',
        '--ralph-dir', path.join(__dirname, 'no-such-dir-for-cli-test'),
      ],
      { encoding: 'utf8' }
    );

    expect(result.stderr).not.toContain('unknown option');
    // --status path always exits 0 with a "no run yet" message even when the
    // dir is missing.
    expect(result.status).toBe(0);
  });

  test('rejects an actually-unknown flag with exit 1', () => {
    const result = spawnSync(
      'node',
      [CLI, '--this-flag-does-not-exist'],
      { encoding: 'utf8' }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown option');
  });
});
