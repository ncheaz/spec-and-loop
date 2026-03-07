'use strict';

/**
 * state.js - Loop state persistence for mini-ralph.
 *
 * Manages reading and writing ralph-loop.state.json under the .ralph/ directory.
 * This file tracks active loop metadata so status commands and resume logic
 * can read the current loop condition without rerunning.
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = 'ralph-loop.state.json';

/**
 * Return the absolute path to the state file.
 *
 * @param {string} ralphDir
 * @returns {string}
 */
function statePath(ralphDir) {
  return path.join(ralphDir, STATE_FILE);
}

/**
 * Initialize the state file with the provided data.
 * Creates ralphDir if it does not exist.
 *
 * @param {string} ralphDir
 * @param {object} data
 */
function init(ralphDir, data) {
  _ensureDir(ralphDir);
  _write(ralphDir, data);
}

/**
 * Read the current state. Returns null if the state file does not exist.
 *
 * @param {string} ralphDir
 * @returns {object|null}
 */
function read(ralphDir) {
  const file = statePath(ralphDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Merge the provided fields into the existing state.
 * If no state file exists, creates one.
 *
 * @param {string} ralphDir
 * @param {object} updates
 */
function update(ralphDir, updates) {
  const current = read(ralphDir) || {};
  _write(ralphDir, Object.assign({}, current, updates));
}

/**
 * Delete the state file.
 *
 * @param {string} ralphDir
 */
function remove(ralphDir) {
  const file = statePath(ralphDir);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
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
  fs.writeFileSync(statePath(ralphDir), JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { init, read, update, remove, statePath };
