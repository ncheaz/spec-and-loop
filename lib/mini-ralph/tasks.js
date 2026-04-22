'use strict';

/**
 * tasks.js - Task file helpers for mini-ralph.
 *
 * Provides utilities to:
 *   - Establish the .ralph/ralph-tasks.md symlink pointing to the OpenSpec tasks.md
 *   - Parse tasks from a tasks.md file (incomplete, in-progress, completed)
 *   - Compute a stable hash of the tasks file for change detection
 *
 * The OpenSpec tasks.md is always the source of truth. The symlink at
 * .ralph/ralph-tasks.md exists only as a convenience reference for the loop
 * engine; both paths resolve to the same inode.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TASKS_LINK_NAME = 'ralph-tasks.md';

/**
 * Return the path to the managed tasks symlink inside ralphDir.
 *
 * @param {string} ralphDir
 * @returns {string}
 */
function tasksLinkPath(ralphDir) {
  return path.join(ralphDir, TASKS_LINK_NAME);
}

/**
 * Create or update the .ralph/ralph-tasks.md symlink to point to tasksFile.
 * Uses an absolute path for the symlink target so it is portable.
 *
 * @param {string} ralphDir   - Absolute path to .ralph/ directory
 * @param {string} tasksFile  - Path to the OpenSpec tasks.md (absolute or resolvable)
 */
function syncLink(ralphDir, tasksFile) {
  _ensureDir(ralphDir);

  const absTasksFile = path.resolve(tasksFile);
  const linkPath = tasksLinkPath(ralphDir);

  if (!fs.existsSync(absTasksFile)) {
    throw new Error(`mini-ralph tasks: tasks file not found: ${absTasksFile}`);
  }

  // Remove existing file or symlink if it already exists
  if (fs.existsSync(linkPath) || _isSymlink(linkPath)) {
    fs.unlinkSync(linkPath);
  }

  fs.symlinkSync(absTasksFile, linkPath);
}

/**
 * Parse all tasks from a tasks.md file.
 * Returns an array of task objects with: { number, description, status }
 * where status is one of: 'incomplete', 'in_progress', 'completed'.
 *
 * Lines are matched by the checkbox prefix:
 *   - [ ]  -> incomplete
 *   - [/]  -> in_progress
 *   - [x]  -> completed
 *
 * Task numbers are extracted from the description (e.g., "1.1 Some task").
 *
 * @param {string} tasksFile
 * @returns {Array<{number: string, description: string, status: string, raw: string}>}
 */
function parseTasks(tasksFile) {
  if (!fs.existsSync(tasksFile)) return [];

  const lines = fs.readFileSync(tasksFile, 'utf8').split('\n');
  const tasks = [];

  for (const line of lines) {
    const match = line.match(/^-\s+\[([ x/])\]\s+(.+)$/);
    if (!match) continue;

    const checkChar = match[1];
    const description = match[2].trim();
    let status;
    if (checkChar === 'x') status = 'completed';
    else if (checkChar === '/') status = 'in_progress';
    else status = 'incomplete';

    // Try to extract a leading task number like "1.1" or "4.2"
    const numMatch = description.match(/^(\d+\.\d+)\s+(.+)$/);
    const number = numMatch ? numMatch[1] : '';
    const text = numMatch ? numMatch[2] : description;

    tasks.push({ number, description: text, fullDescription: description, status, raw: line });
  }

  return tasks;
}

/**
 * Return the first incomplete or in-progress task, or null if all are done.
 *
 * @param {string} tasksFile
 * @returns {object|null}
 */
function currentTask(tasksFile) {
  const all = parseTasks(tasksFile);
  return (
    all.find((t) => t.status === 'in_progress') ||
    all.find((t) => t.status === 'incomplete') ||
    null
  );
}

/**
 * Compute an MD5 hash of the tasks file content for change detection.
 * Returns '0' if the file does not exist.
 *
 * @param {string} tasksFile
 * @returns {string}
 */
function hashFile(tasksFile) {
  if (!fs.existsSync(tasksFile)) return '0';
  const content = fs.readFileSync(tasksFile);
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Count tasks by status.
 *
 * @param {string} tasksFile
 * @returns {{ total: number, completed: number, inProgress: number, incomplete: number }}
 */
function countTasks(tasksFile) {
  const all = parseTasks(tasksFile);
  return {
    total: all.length,
    completed: all.filter((t) => t.status === 'completed').length,
    inProgress: all.filter((t) => t.status === 'in_progress').length,
    incomplete: all.filter((t) => t.status === 'incomplete').length,
  };
}

/**
 * Build a compact task-context block for the current tasks file.
 * Mirrors the shell-side task context format so prompts can render a fresh
 * snapshot on every iteration without regenerating the whole PRD.
 *
 * @param {string} tasksFile
 * @returns {string}
 */
function taskContext(tasksFile) {
  const all = parseTasks(tasksFile);
  if (all.length === 0) return '';

  const current =
    all.find((task) => task.status === 'in_progress') ||
    all.find((task) => task.status === 'incomplete') ||
    null;
  const completedCount = all.filter((task) => task.status === 'completed').length;
  const total = all.length;

  const sections = [];

  if (current) {
    sections.push('## Current Task');
    sections.push(`- ${current.fullDescription || current.description}`);
    sections.push('');
  }

  sections.push('## Progress');
  sections.push(`- ${completedCount} of ${total} tasks complete`);

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function _isSymlink(p) {
  try {
    fs.lstatSync(p);
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

module.exports = {
  syncLink,
  parseTasks,
  currentTask,
  hashFile,
  countTasks,
  taskContext,
  tasksLinkPath,
};
