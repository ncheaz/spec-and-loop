'use strict';

/**
 * history.js - Iteration history persistence for mini-ralph.
 *
 * Manages reading and writing ralph-history.json under the .ralph/ directory.
 * Each completed iteration appends an entry with duration, completion
 * detection, tool usage summaries, and file-change information.
 */

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = 'ralph-history.json';

/**
 * Return the absolute path to the history file.
 *
 * @param {string} ralphDir
 * @returns {string}
 */
function historyPath(ralphDir) {
  return path.join(ralphDir, HISTORY_FILE);
}

/**
 * Read history entries. Returns an empty array if the file does not exist.
 *
 * @param {string} ralphDir
 * @returns {Array<object>}
 */
function read(ralphDir) {
  const file = historyPath(ralphDir);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Append an iteration result entry to history.
 *
 * @param {string} ralphDir
 * @param {object} entry
 * @param {number} entry.iteration         - Iteration number
 * @param {number} entry.duration          - Duration in milliseconds
 * @param {boolean} entry.completionDetected
 * @param {boolean} entry.taskDetected
 * @param {Array}  entry.toolUsage         - Tool usage summary array
 * @param {Array}  entry.filesChanged      - Files changed in this iteration
 * @param {number} entry.exitCode          - OpenCode exit code
 * @param {number} [entry.promptBytes]     - UTF-8 byte length of the assembled prompt
 * @param {number} [entry.promptChars]     - Character length of the assembled prompt
 * @param {number} [entry.promptTokens]    - Estimated token count for the prompt (chars/4, rounded)
 * @param {number} [entry.responseBytes]   - UTF-8 byte length of the raw response
 * @param {number} [entry.responseChars]   - Character length of the raw response
 * @param {number} [entry.responseTokens]  - Estimated token count for the response (chars/4, rounded)
 * @param {boolean} [entry.truncated]      - Whether the response was truncated by the invoker
 */
function append(ralphDir, entry) {
  _ensureDir(ralphDir);
  const entries = read(ralphDir);
  entries.push(Object.assign({ timestamp: new Date().toISOString() }, entry));
  _write(ralphDir, entries);
}

/**
 * Return the N most recent history entries.
 *
 * @param {string} ralphDir
 * @param {number} [n=5]
 * @returns {Array<object>}
 */
function recent(ralphDir, n = 5) {
  const entries = read(ralphDir);
  return entries.slice(-n);
}

/**
 * Clear all history.
 *
 * @param {string} ralphDir
 */
function clear(ralphDir) {
  _write(ralphDir, []);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _ensureDir(ralphDir) {
  if (!fs.existsSync(ralphDir)) {
    fs.mkdirSync(ralphDir, { recursive: true });
  }
}

function _write(ralphDir, data) {
  _ensureDir(ralphDir);
  fs.writeFileSync(historyPath(ralphDir), JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { read, append, recent, clear, historyPath };
