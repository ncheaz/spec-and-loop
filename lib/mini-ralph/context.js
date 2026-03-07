'use strict';

/**
 * context.js - Pending context management for mini-ralph.
 *
 * Manages reading, writing, adding, clearing, and consuming pending context
 * from .ralph/ralph-context.md. Context is injected into the next iteration's
 * prompt and then consumed (removed) so it does not carry forward indefinitely.
 */

const fs = require('fs');
const path = require('path');

const CONTEXT_FILE = 'ralph-context.md';

/**
 * Return the absolute path to the context file.
 *
 * @param {string} ralphDir
 * @returns {string}
 */
function contextPath(ralphDir) {
  return path.join(ralphDir, CONTEXT_FILE);
}

/**
 * Read the current pending context. Returns empty string if none.
 *
 * @param {string} ralphDir
 * @returns {string}
 */
function read(ralphDir) {
  const file = contextPath(ralphDir);
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').trim();
}

/**
 * Append text to the pending context file.
 *
 * @param {string} ralphDir
 * @param {string} text
 */
function add(ralphDir, text) {
  if (!text || !text.trim()) return;
  _ensureDir(ralphDir);
  const file = contextPath(ralphDir);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const separator = existing && !existing.endsWith('\n') ? '\n\n' : (existing ? '\n' : '');
  fs.writeFileSync(file, `${existing}${separator}${text.trim()}`, 'utf8');
}

/**
 * Clear all pending context.
 *
 * @param {string} ralphDir
 */
function clear(ralphDir) {
  const file = contextPath(ralphDir);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

/**
 * Read pending context and then clear it (consume it for one iteration).
 * Returns the context string, or null if there was nothing pending.
 *
 * @param {string} ralphDir
 * @returns {string|null}
 */
function consume(ralphDir) {
  const text = read(ralphDir);
  if (!text) return null;
  clear(ralphDir);
  return text;
}

/**
 * Check whether there is pending context.
 *
 * @param {string} ralphDir
 * @returns {boolean}
 */
function hasPending(ralphDir) {
  return !!read(ralphDir);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _ensureDir(ralphDir) {
  if (!fs.existsSync(ralphDir)) {
    fs.mkdirSync(ralphDir, { recursive: true });
  }
}

module.exports = { read, add, clear, consume, hasPending, contextPath };
