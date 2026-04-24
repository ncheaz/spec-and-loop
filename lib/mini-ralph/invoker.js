'use strict';

/**
 * invoker.js - OpenCode process invocation for mini-ralph.
 *
 * Isolates child_process.spawn() calls so the runner module can be tested
 * with a mocked invoker. Streams stdout/stderr to the terminal while also
 * capturing output for promise detection and history recording.
 *
 * This module focuses on a single agent: opencode. Multi-agent support is
 * explicitly out of scope for the first-pass mini Ralph subset.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

/**
 * Invoke OpenCode with the given prompt and return a result object.
 *
 * @param {object} opts
 * @param {string} opts.prompt      - Rendered prompt text to send to OpenCode
 * @param {string} [opts.model]     - Optional model override
 * @param {boolean} [opts.noCommit] - Skip git commit if true
 * @param {boolean} [opts.verbose]  - Enable verbose output
 * @param {string}  [opts.ralphDir] - Reserved for caller compatibility
 * @returns {Promise<{stdout: string, stderr: string, exitCode: ?number, signal: ?string, toolUsage: Array, filesChanged: Array}>}
 */
async function invoke(opts) {
  const {
    prompt,
    model,
    noCommit = false,
    verbose = false,
  } = opts;

  if (!prompt || !prompt.trim()) {
    throw new Error('mini-ralph invoker: prompt is empty');
  }

  const args = ['run'];
  if (model) {
    args.push('--model', model);
  }
  args.push(prompt);

  if (verbose) {
    process.stderr.write(
      `[mini-ralph] invoking: opencode ${args.slice(0, -1).join(' ')} <prompt>\n`
    );
  }

  // Snapshot git-tracked files before invocation for file-change detection
  const preSnapshot = _gitSnapshot();

  const result = await _spawnOpenCode(args, verbose);
  const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');

  if (_looksLikeCliHelp(combinedOutput)) {
    throw new Error(
      'mini-ralph invoker: opencode printed CLI help instead of running the prompt. ' +
      'The installed opencode CLI is likely incompatible with this version of spec-and-loop.'
    );
  }

  // Detect which files changed during this iteration
  const postSnapshot = _gitSnapshot();
  const filesChanged = _diffSnapshots(preSnapshot, postSnapshot);

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    signal: result.signal,
    toolUsage: _extractToolUsage(result.stdout),
    filesChanged,
    // Pass through watchdog fields when present (task 2.1)
    ...(result.failureReason !== undefined && {
      failureReason: result.failureReason,
      idleMs: result.idleMs,
      lastStdoutBytes: result.lastStdoutBytes,
      lastStderrBytes: result.lastStderrBytes,
    }),
  };
}

/**
 * Spawn the opencode process and stream output to terminal while capturing.
 * Wraps the subprocess with a per-iteration stream-idle watchdog controlled
 * by RALPH_ITERATION_IDLE_TIMEOUT_MS (default 300000 ms; 0 = disabled) and
 * RALPH_ITERATION_KILL_GRACE_MS (default 10000 ms).
 *
 * When the watchdog fires the returned result gains:
 *   failureReason: 'iteration_timeout_idle'
 *   idleMs: <number>          — observed idle duration in ms
 *   lastStdoutBytes: <string> — tail of stdout, capped at 200 bytes
 *   lastStderrBytes: <string> — tail of stderr, capped at 200 bytes
 *
 * When the watchdog is disabled or does not fire, the return shape is
 * unchanged from the pre-watchdog contract.
 *
 * @param {Array<string>} args
 * @param {boolean} verbose
 * @returns {Promise<{stdout: string, stderr: string, exitCode: ?number, signal: ?string, failureReason?: string, idleMs?: number, lastStdoutBytes?: string, lastStderrBytes?: string}>}
 */
function _spawnOpenCode(args, verbose) {
  // Parse watchdog knobs from environment. task 2.1 (surface-autocommit-ignore-warning-and-watchdog)
  const idleTimeoutRaw = process.env.RALPH_ITERATION_IDLE_TIMEOUT_MS;
  const killGraceRaw   = process.env.RALPH_ITERATION_KILL_GRACE_MS;
  const idleTimeoutMs  = idleTimeoutRaw !== undefined ? Number(idleTimeoutRaw) : 300000;
  const killGraceMs    = killGraceRaw   !== undefined ? Number(killGraceRaw)   : 10000;
  const watchdogEnabled = idleTimeoutMs !== 0;

  return new Promise((resolve, reject) => {
    const child = spawn('opencode', args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    let watchdogFired = false;
    let idleTimer = null;
    let idleStart = Date.now();

    // Tail buffers — keep only the most recent 200 bytes of each stream
    const TAIL_CAP = 200;
    let stdoutTail = '';
    let stderrTail = '';

    function _appendTail(current, chunk) {
      const combined = current + chunk;
      return combined.length > TAIL_CAP ? combined.slice(-TAIL_CAP) : combined;
    }

    function _resetIdleTimer() {
      if (!watchdogEnabled || watchdogFired) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleStart = Date.now();
      idleTimer = setTimeout(_onIdleTimeout, idleTimeoutMs);
    }

    function _onIdleTimeout() {
      if (watchdogFired) return;
      watchdogFired = true;
      const observedIdleMs = Date.now() - idleStart;

      // Send SIGTERM first; after killGraceMs escalate to SIGKILL if still alive.
      // Use process.kill(-pid, signal) with detached:true when process group
      // kill is needed; for a direct child process.kill() is sufficient on macOS.
      try {
        child.kill('SIGTERM');
      } catch (_) { /* child may have already exited */ }

      const killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch (_) { /* child may have already exited */ }
      }, killGraceMs);

      // Prevent killTimer from keeping the event loop alive
      if (killTimer && typeof killTimer.unref === 'function') {
        killTimer.unref();
      }

      // Stash metadata on the child so the close handler can read it
      child._watchdogMeta = {
        idleMs: observedIdleMs,
        lastStdoutBytes: stdoutTail,
        lastStderrBytes: stderrTail,
      };
    }

    if (watchdogEnabled) {
      _resetIdleTimer();
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      stdoutTail = _appendTail(stdoutTail, text);
      process.stdout.write(chunk);
      _resetIdleTimer();
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      stderrTail = _appendTail(stderrTail, text);
      process.stderr.write(chunk);
      _resetIdleTimer();
    });

    child.on('error', (err) => {
      if (idleTimer) clearTimeout(idleTimer);
      if (err.code === 'ENOENT') {
        reject(new Error('mini-ralph invoker: opencode CLI not found. Please install opencode: npm install -g opencode-ai'));
      } else {
        reject(new Error(`mini-ralph invoker: failed to start opencode: ${err.message}`));
      }
    });

    child.on('close', (code, signal) => {
      if (idleTimer) clearTimeout(idleTimer);

      if (watchdogFired && child._watchdogMeta) {
        resolve({
          stdout,
          stderr,
          exitCode: typeof code === 'number' ? code : null,
          signal: signal || null,
          failureReason: 'iteration_timeout_idle',
          idleMs: child._watchdogMeta.idleMs,
          lastStdoutBytes: child._watchdogMeta.lastStdoutBytes,
          lastStderrBytes: child._watchdogMeta.lastStderrBytes,
        });
      } else {
        resolve({
          stdout,
          stderr,
          exitCode: typeof code === 'number' ? code : null,
          signal: signal || null,
        });
      }
    });
  });
}

/**
 * Detect whether OpenCode printed its CLI help banner instead of executing the
 * requested prompt. This usually means the invocation contract drifted.
 *
 * @param {string} text
 * @returns {boolean}
 */
function _looksLikeCliHelp(text) {
  if (!text) return false;

  // Only inspect the opening portion of the transcript so help-like strings
  // echoed later in diffs or test output do not masquerade as a CLI banner.
  const normalized = text
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '');
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const openingText = lines.slice(0, 40).join('\n');

  const looksLikeRunHelp =
    openingText.includes('opencode run [message..]') &&
    openingText.includes('run opencode with a message') &&
    openingText.includes('Positionals:') &&
    openingText.includes('Options:');

  const looksLikeTopLevelHelp =
    openingText.includes('Commands:') &&
    openingText.includes('Options:') &&
    openingText.includes('opencode [project]') &&
    openingText.includes('opencode run [message..]');

  return looksLikeRunHelp || looksLikeTopLevelHelp;
}

/**
 * Extract a compact tool usage summary from OpenCode output.
 * Returns an array of { tool, count } objects.
 *
 * @param {string} text
 * @returns {Array<{tool: string, count: number}>}
 */
function _extractToolUsage(text) {
  if (!text) return [];

  // Heuristic: count occurrences of common tool call patterns in output
  const toolPatterns = [
    'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task',
    'TodoWrite', 'WebFetch',
  ];

  const usage = [];
  for (const tool of toolPatterns) {
    const regex = new RegExp(`\\b${tool}\\b`, 'g');
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      usage.push({ tool, count: matches.length });
    }
  }

  return usage;
}

/**
 * Take a snapshot of dirty/untracked paths via git status.
 * Returns a Map of repo-relative file paths to existence/content fingerprints.
 * Returns an empty Map if git is unavailable or not in a repo.
 *
 * @returns {Map<string, string>}
 */
function _gitSnapshot() {
  try {
    // git status --porcelain outputs modified, added, deleted, untracked files
    const output = execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const files = new Map();
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      for (const filePath of _parsePorcelainPaths(line)) {
        if (!filePath) continue;
        files.set(filePath, _fingerprintPath(filePath));
      }
    }
    return files;
  } catch {
    return new Map();
  }
}

/**
 * Return an array of files whose per-path fingerprint changed between the two
 * snapshots. A file can count as changed because it became dirty, stopped being
 * dirty, was deleted, was created, or changed content while staying dirty.
 *
 * @param {Map<string, string>} preSnapshot
 * @param {Map<string, string>} postSnapshot
 * @returns {Array<string>}
 */
function _diffSnapshots(preSnapshot, postSnapshot) {
  const changed = new Set();
  const allPaths = new Set([
    ...Array.from((preSnapshot || new Map()).keys()),
    ...Array.from((postSnapshot || new Map()).keys()),
  ]);

  // Compare per-path fingerprints so already-dirty files still count when the
  // iteration mutates their contents again.
  for (const file of allPaths) {
    if (preSnapshot.get(file) !== postSnapshot.get(file)) {
      changed.add(file);
    }
  }

  return Array.from(changed).sort();
}

function _parsePorcelainPaths(line) {
  const rawPath = line.slice(3).trim();
  if (!rawPath) return [];

  if (rawPath.includes(' -> ')) {
    return rawPath.split(' -> ').map(_stripGitQuotes).filter(Boolean);
  }

  return [_stripGitQuotes(rawPath)];
}

function _stripGitQuotes(value) {
  if (!value) return '';

  const trimmed = value.trim();
  if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed;
  }

  return trimmed
    .slice(1, -1)
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function _fingerprintPath(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);

  try {
    const stats = fs.lstatSync(absolutePath);

    if (stats.isSymbolicLink()) {
      return `symlink:${fs.readlinkSync(absolutePath)}`;
    }

    if (stats.isDirectory()) {
      return `directory:${_hashDirectory(absolutePath)}`;
    }

    if (stats.isFile()) {
      const content = fs.readFileSync(absolutePath);
      const digest = crypto.createHash('sha1').update(content).digest('hex');
      return `file:${stats.size}:${digest}`;
    }

    return `other:${stats.mode}`;
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return 'missing';
    }

    return `error:${err && err.code ? err.code : 'unknown'}`;
  }
}

function _hashDirectory(directoryPath) {
  const hash = crypto.createHash('sha1');
  _walkDirectory(hash, directoryPath, '');
  return hash.digest('hex');
}

function _walkDirectory(hash, directoryPath, relativePrefix) {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      hash.update(`dir:${relativePath}\n`);
      _walkDirectory(hash, absolutePath, relativePath);
      continue;
    }

    if (entry.isSymbolicLink()) {
      hash.update(`symlink:${relativePath}:${fs.readlinkSync(absolutePath)}\n`);
      continue;
    }

    if (entry.isFile()) {
      hash.update(`file:${relativePath}\n`);
      hash.update(fs.readFileSync(absolutePath));
      continue;
    }

    const stats = fs.lstatSync(absolutePath);
    hash.update(`other:${relativePath}:${stats.mode}\n`);
  }
}

module.exports = {
  invoke,
  _spawnOpenCode,
  _looksLikeCliHelp,
  _extractToolUsage,
  _gitSnapshot,
  _diffSnapshots,
};
