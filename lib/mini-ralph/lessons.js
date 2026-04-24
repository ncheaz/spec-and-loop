'use strict';

const fs = require('fs');
const nodePath = require('path');

const LESSONS_FILENAME = 'LESSONS.md';
const MAX_BULLET_CHARS = 120;
const MAX_INJECT_BULLETS = 15;

/**
 * Returns the absolute path to the LESSONS.md file for the given ralphDir.
 * @param {string} ralphDir - Path to the .ralph directory.
 * @returns {string}
 */
function path(ralphDir) {
  return nodePath.join(ralphDir, LESSONS_FILENAME);
}

/**
 * Reads LESSONS.md from ralphDir, returning an array of bullet strings.
 * Missing file returns []. Blank lines are stripped. Bullets > 120 chars
 * are truncated and prefixed with 'runner-truncated:'.
 * @param {string} ralphDir
 * @returns {string[]}
 */
function read(ralphDir) {
  const filePath = path(ralphDir);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }

  const lines = content.split('\n');
  const bullets = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_BULLET_CHARS) {
      bullets.push('runner-truncated:' + trimmed.slice(0, MAX_BULLET_CHARS));
    } else {
      bullets.push(trimmed);
    }
  }
  return bullets;
}

/**
 * Returns a markdown section string '## Lessons Learned\n\n<bullets>' using
 * the last `limit` (default 50) bullets, or '' if there are none.
 * @param {string} ralphDir
 * @param {{ limit?: number }} [opts]
 * @returns {string}
 */
function inject(ralphDir, opts) {
  const limit = (opts && opts.limit != null) ? opts.limit : MAX_INJECT_BULLETS;
  const bullets = read(ralphDir);
  if (!bullets.length) return '';
  const slice = bullets.slice(-limit);
  return '## Lessons Learned\n\n' + slice.join('\n');
}

/**
 * If LESSONS.md has more than `max` non-empty bullets, rewrites it keeping
 * only the last `max` bullets. Returns the number of bullets dropped (0 if
 * no write occurred).
 * @param {string} ralphDir
 * @param {number} max
 * @returns {number}
 */
function rotate(ralphDir, max) {
  const filePath = path(ralphDir);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return 0;
    throw e;
  }

  const lines = content.split('\n');
  const bullets = lines.filter(l => l.trim() !== '');
  if (bullets.length <= max) return 0;

  const dropped = bullets.length - max;
  const kept = bullets.slice(-max);
  fs.writeFileSync(filePath, kept.join('\n') + '\n', 'utf8');
  return dropped;
}

module.exports = { path, read, inject, rotate };
