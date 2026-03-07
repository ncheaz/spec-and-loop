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

const { spawn } = require('child_process');
const path = require('path');

/**
 * Invoke OpenCode with the given prompt and return a result object.
 *
 * @param {object} opts
 * @param {string} opts.prompt      - Rendered prompt text to send to OpenCode
 * @param {string} [opts.model]     - Optional model override
 * @param {boolean} [opts.noCommit] - Skip git commit if true
 * @param {boolean} [opts.verbose]  - Enable verbose output
 * @param {string}  opts.ralphDir   - .ralph/ directory (used for temp prompt file)
 * @returns {Promise<{stdout: string, exitCode: number, toolUsage: Array, filesChanged: Array}>}
 */
async function invoke(opts) {
  const {
    prompt,
    model,
    noCommit = false,
    verbose = false,
    ralphDir,
  } = opts;

  // Write the prompt to a temp file to avoid shell escaping issues
  const fs = require('fs');
  const os = require('os');
  const tmpPromptFile = path.join(
    os.tmpdir(),
    `ralph-prompt-${Date.now()}-${process.pid}.md`
  );

  try {
    fs.writeFileSync(tmpPromptFile, prompt, 'utf8');

    const args = ['--print', tmpPromptFile];
    if (model) {
      args.push('--model', model);
    }

    if (verbose) {
      process.stderr.write(`[mini-ralph] invoking: opencode ${args.join(' ')}\n`);
    }

    const result = await _spawnOpenCode(args, verbose);

    return {
      stdout: result.stdout,
      exitCode: result.exitCode,
      toolUsage: _extractToolUsage(result.stdout),
      filesChanged: [],  // File-change tracking implemented in task 2.2
    };
  } finally {
    // Clean up temp prompt file
    try {
      fs.unlinkSync(tmpPromptFile);
    } catch {
      // ignore cleanup errors
    }
  }
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

module.exports = { invoke, _spawnOpenCode, _extractToolUsage };
