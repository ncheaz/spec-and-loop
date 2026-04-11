'use strict';

const fs = require('fs');
const path = require('path');

const ERRORS_FILE = 'errors.md';

function errorsPath(ralphDir) {
  return path.join(ralphDir, ERRORS_FILE);
}

function read(ralphDir, limit) {
  const entries = _readRawEntries(ralphDir);
  if (!entries.length) return '';
  if (limit !== undefined && limit < entries.length) {
    return entries.slice(-limit).join('\n---\n');
  }
  return entries.join('\n---\n');
}

function readEntries(ralphDir, limit) {
  const entries = _readRawEntries(ralphDir).map(_parseEntry).filter(Boolean);
  if (limit !== undefined && limit < entries.length) {
    return entries.slice(-limit);
  }
  return entries;
}

function count(ralphDir) {
  return _readRawEntries(ralphDir).length;
}

function latest(ralphDir) {
  const entries = readEntries(ralphDir, 1);
  return entries.length > 0 ? entries[0] : null;
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

function _readRawEntries(ralphDir) {
  const file = errorsPath(ralphDir);
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, 'utf8').trim();
  if (!content) return [];
  return content.split(/^---$/m).filter((entry) => entry.trim());
}

function _parseEntry(entry) {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  const timestampMatch = trimmed.match(/^Timestamp: (.+)$/m);
  const iterationMatch = trimmed.match(/^Iteration: (.+)$/m);
  const taskMatch = trimmed.match(/^Task: (.+)$/m);
  const exitCodeMatch = trimmed.match(/^Exit Code: (.+)$/m);
  const stderrMatch = trimmed.match(/(?:^|\n)### stderr\n([\s\S]*?)(?=\n### stdout\n|$)/);
  const stdoutMatch = trimmed.match(/(?:^|\n)### stdout\n([\s\S]*?)$/);

  return {
    timestamp: timestampMatch ? timestampMatch[1].trim() : '',
    iteration: iterationMatch ? Number(iterationMatch[1].trim()) : NaN,
    task: taskMatch ? taskMatch[1].trim() : '',
    exitCode: exitCodeMatch ? Number(exitCodeMatch[1].trim()) : NaN,
    stderr: stderrMatch ? stderrMatch[1].trim() : '',
    stdout: stdoutMatch ? stdoutMatch[1].trim() : '',
  };
}

module.exports = { errorsPath, read, readEntries, count, latest, append, clear, archive };
