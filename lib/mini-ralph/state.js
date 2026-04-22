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
const LOCK_FILE = 'ralph-loop.lock.json';

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
 * Return the absolute path to the per-change run lock file.
 *
 * @param {string} ralphDir
 * @returns {string}
 */
function lockPath(ralphDir) {
  return path.join(ralphDir, LOCK_FILE);
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
  // One-shot retry to paper over the vanishingly-rare race where we read the
  // state file between `openSync('wx')` on the temp file and the rename. On
  // POSIX `renameSync` is atomic, so the retry window is only meaningful on
  // filesystems where it is not -- but the cost of retrying is tiny, so we
  // do it uniformly for robustness.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      if (!raw) {
        if (attempt === 0) continue;
        return null;
      }
      return JSON.parse(raw);
    } catch (err) {
      if (attempt === 0 && (err.code === 'ENOENT' || err instanceof SyntaxError)) {
        continue;
      }
      return null;
    }
  }
  return null;
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

/**
 * Acquire the per-change loop lock.
 *
 * If a prior lock exists and still points to a live process, this throws a
 * descriptive error. If the prior lock is stale or unreadable, it is replaced.
 *
 * @param {string} ralphDir
 * @param {object} metadata
 * @returns {object}
 */
function acquireRunLock(ralphDir, metadata = {}) {
  _ensureDir(ralphDir);

  const file = lockPath(ralphDir);
  const lock = Object.assign({}, metadata, {
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
    token: _createLockToken(),
  });

  while (true) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeFileSync(fd, JSON.stringify(lock, null, 2), 'utf8');
      fs.closeSync(fd);
      return lock;
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }

      const existingLock = readRunLock(ralphDir);
      if (_isLiveLock(existingLock)) {
        const liveError = new Error(
          `another loop is already active for this change (pid ${existingLock.pid})`
        );
        liveError.code = 'RALPH_ACTIVE_LOOP_LOCK';
        liveError.lock = existingLock;
        throw liveError;
      }

      _removeLockIfPresent(file);
    }
  }
}

/**
 * Read the current run lock. Returns null when the lock is absent or invalid.
 *
 * @param {string} ralphDir
 * @returns {object|null}
 */
function readRunLock(ralphDir) {
  const file = lockPath(ralphDir);
  if (!fs.existsSync(file)) return null;

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Release the current run lock when it still belongs to the provided owner.
 *
 * @param {string} ralphDir
 * @param {object|null} lock
 */
function releaseRunLock(ralphDir, lock) {
  const file = lockPath(ralphDir);
  if (!fs.existsSync(file)) return;

  if (!lock || !lock.token) {
    _removeLockIfPresent(file);
    return;
  }

  const existingLock = readRunLock(ralphDir);
  if (!existingLock || existingLock.token === lock.token) {
    _removeLockIfPresent(file);
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
  const target = statePath(ralphDir);
  // Atomic write: serialize to a temp file in the same directory, then rename.
  // A concurrent `read()` either sees the fully-written old file or the fully-
  // written new file -- never a partially-written one. This matters because
  // `ralph-run --status` can race with the live loop's per-iteration
  // `state.update()` calls, and a torn read used to surface as JSON.parse
  // errors or the dashboard reporting a stale iteration counter.
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const serialized = JSON.stringify(data, null, 2);

  let handle = null;
  try {
    handle = fs.openSync(tmp, 'wx');
    fs.writeFileSync(handle, serialized, 'utf8');
    fs.fsyncSync(handle);
  } finally {
    if (handle !== null) {
      try {
        fs.closeSync(handle);
      } catch {
        /* best-effort close */
      }
    }
  }

  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    // Clean up the temp file if rename failed, then rethrow so the caller
    // sees the real error (disk full, permissions, etc.).
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* best-effort cleanup */
    }
    throw err;
  }
}

function _createLockToken() {
  return `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function _isLiveLock(lock) {
  if (!lock || typeof lock.pid !== 'number' || lock.pid <= 0) {
    return false;
  }

  try {
    process.kill(lock.pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === 'EPERM') {
      return true;
    }
    return false;
  }
}

function _removeLockIfPresent(file) {
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

module.exports = {
  init,
  read,
  update,
  remove,
  statePath,
  lockPath,
  acquireRunLock,
  readRunLock,
  releaseRunLock,
};
