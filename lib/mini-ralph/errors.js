'use strict';

const fs = require('fs');
const path = require('path');

const ERRORS_FILE = 'errors.md';

function errorsPath(ralphDir) {
  return path.join(ralphDir, ERRORS_FILE);
}

function read(ralphDir, limit) {
  const file = errorsPath(ralphDir);
  if (!fs.existsSync(file)) return '';
  const content = fs.readFileSync(file, 'utf8').trim();
  if (!content) return '';
  const entries = content.split(/^---$/m).filter(e => e.trim());
  if (!entries.length) return '';
  if (limit !== undefined && limit < entries.length) {
    return entries.slice(-limit).join('\n---\n');
  }
  return entries.join('\n---\n');
}

function append(ralphDir, entry) {
  _ensureDir(ralphDir);
  const file = errorsPath(ralphDir);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const separator = existing && !existing.endsWith('\n') ? '\n' : '';
  const timestamp = new Date().toISOString();
  const text = [
    '---',
    `Timestamp: ${timestamp}`,
    `Iteration: ${entry.iteration}`,
    `Task: ${entry.task}`,
    `Exit Code: ${entry.exitCode}`,
    '',
    '### stderr',
    entry.stderr || '',
    '',
    '### stdout',
    entry.stdout || '',
    '',
  ].join('\n');
  fs.writeFileSync(file, `${existing}${separator}${text}`, 'utf8');
}

function clear(ralphDir) {
  const file = errorsPath(ralphDir);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

function archive(ralphDir) {
  const file = errorsPath(ralphDir);
  if (!fs.existsSync(file)) return null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveFile = path.join(ralphDir, `errors_${timestamp}.md`);
  fs.copyFileSync(file, archiveFile);
  return archiveFile;
}

function _ensureDir(ralphDir) {
  if (!fs.existsSync(ralphDir)) {
    fs.mkdirSync(ralphDir, { recursive: true });
  }
}

module.exports = { errorsPath, read, append, clear, archive };
