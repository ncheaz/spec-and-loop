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
 * @param {boolean} [entry.commitAttempted]  - Whether an auto-commit was attempted this iteration
 * @param {boolean} [entry.commitCreated]    - Whether a git commit was successfully created
 * @param {string}  [entry.commitSha]        - The SHA of the created commit (if commitCreated is true)
 * @param {string}  [entry.commitMessage]    - The commit message used (if commitCreated is true)
 * @param {string}  [entry.commitAnomaly]    - Human-readable description of any commit anomaly
 * @param {string}  [entry.commitAnomalyType] - Machine-readable anomaly type string. Known values:
 *   - `'nothing_staged'`          - No files were staged for commit.
 *   - `'commit_failed'`           - The git commit command failed.
 *   - `'paths_ignored_filtered'`  - Some staged paths were gitignored and filtered out;
 *                                   the remaining paths were committed successfully.
 *   - `'all_paths_ignored'`       - Every staged path was gitignored; no commit was made.
 * @param {string[]} [entry.ignoredPaths]    - Paths that were dropped by the gitignore filter.
 *   Present only when `commitAnomalyType` is `'paths_ignored_filtered'` or `'all_paths_ignored'`.
 *   Omitted entirely when no paths were filtered.
 * @param {string}  [entry.failureReason]    - Human-readable reason for iteration failure.
 *   Known values include:
 *   - `'iteration_timeout_idle'`  - The iteration subprocess was terminated by the idle watchdog
 *                                   because no bytes were written to stdout or stderr for longer
 *                                   than `RALPH_ITERATION_IDLE_TIMEOUT_MS`. When this value is
 *                                   present, `idleMs`, `lastStdoutBytes`, and `lastStderrBytes`
 *                                   are also present on the entry.
 *   Omitted entirely when the iteration succeeded or failed for another reason.
 * @param {number}  [entry.idleMs]           - Observed idle duration in milliseconds when the
 *   watchdog fired. Present only when `failureReason === 'iteration_timeout_idle'`.
 * @param {string}  [entry.lastStdoutBytes]  - Tail of the iteration subprocess stdout at the
 *   moment the watchdog fired, capped at 200 bytes. Present only when
 *   `failureReason === 'iteration_timeout_idle'`.
 * @param {string}  [entry.lastStderrBytes]  - Tail of the iteration subprocess stderr at the
 *   moment the watchdog fired, capped at 200 bytes. Present only when
 *   `failureReason === 'iteration_timeout_idle'`.
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
