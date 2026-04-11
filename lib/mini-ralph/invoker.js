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
 * @returns {Promise<{stdout: string, exitCode: number, toolUsage: Array, filesChanged: Array}>}
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
    toolUsage: _extractToolUsage(result.stdout),
    filesChanged,
  };
}

/**
 * Spawn the opencode process and stream output to terminal while capturing.
 *
 * @param {Array<string>} args
 * @param {boolean} verbose
 * @returns {Promise<{stdout: string, exitCode: number}>}
 */
function _spawnOpenCode(args, verbose) {
  return new Promise((resolve, reject) => {
    const child = spawn('opencode', args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(chunk);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(chunk);
    });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('mini-ralph invoker: opencode CLI not found. Please install opencode: npm install -g opencode-ai'));
      } else {
        reject(new Error(`mini-ralph invoker: failed to start opencode: ${err.message}`));
      }
    });

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code || 0 });
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
 * Take a snapshot of modified/untracked files via git status.
 * Returns a Set of file paths relative to the repo root.
 * Returns an empty Set if git is unavailable or not in a repo.
 *
 * @returns {Set<string>}
 */
function _gitSnapshot() {
  try {
    // git status --porcelain outputs modified, added, deleted, untracked files
    const output = execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const files = new Set();
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Format: XY filename  (first two chars are status, then space, then path)
      const filePath = line.slice(3).trim();
      if (filePath) files.add(filePath);
    }
    return files;
  } catch {
    return new Set();
  }
}

/**
 * Return an array of files that appear in postSnapshot but not preSnapshot,
 * or whose presence changed between the two snapshots.
 *
 * @param {Set<string>} preSnapshot
 * @param {Set<string>} postSnapshot
 * @returns {Array<string>}
 */
function _diffSnapshots(preSnapshot, postSnapshot) {
  const changed = [];
  for (const file of postSnapshot) {
    if (!preSnapshot.has(file)) {
      changed.push(file);
    }
  }
  // Also capture files that were in pre but are gone (e.g., deleted)
  for (const file of preSnapshot) {
    if (!postSnapshot.has(file)) {
      changed.push(file);
    }
  }
  return changed;
}

module.exports = {
  invoke,
  _spawnOpenCode,
  _looksLikeCliHelp,
  _extractToolUsage,
  _gitSnapshot,
  _diffSnapshots,
};
