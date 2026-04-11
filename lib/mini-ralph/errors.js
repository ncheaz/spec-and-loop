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

function matchIteration(entries, iteration) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  if (!Number.isFinite(iteration)) return null;

  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry && entry.iteration === iteration) {
      return entry;
    }
  }

  return null;
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
    ...(entry.exitCode === null || entry.exitCode === undefined ? [] : [`Exit Code: ${entry.exitCode}`]),
    ...(entry.signal ? [`Signal: ${entry.signal}`] : []),
    '',
    '### stderr',
    _serializeStream(entry.stderr),
    '',
    '### stdout',
    _serializeStream(entry.stdout),
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
   const content = fs.readFileSync(file, 'utf8');
   if (!content.trim()) return [];

   const lines = content.replace(/\r\n/g, '\n').split('\n');
   const entries = [];
   let current = [];

   for (const line of lines) {
     if (line === '---') {
       if (current.length > 0 && current.join('').trim()) {
         entries.push(current.join('\n'));
       }
       current = [];
       continue;
     }

     if (current.length === 0 && line === '') {
       continue;
     }

     current.push(line);
   }

   if (current.length > 0 && current.join('').trim()) {
     entries.push(current.join('\n'));
   }

   return entries;
}

function _parseEntry(entry) {
   const normalized = entry.replace(/\r\n/g, '\n');
   if (!normalized.trim()) return null;

   const lines = normalized.split('\n');
   const metadata = new Map();
   const sections = { stderr: [], stdout: [] };
   let currentSection = null;

   for (const line of lines) {
     if (line === '### stderr') {
       currentSection = 'stderr';
       continue;
     }

     if (line === '### stdout') {
       currentSection = 'stdout';
       continue;
     }

     if (currentSection) {
       sections[currentSection].push(line);
       continue;
     }

     const separatorIndex = line.indexOf(': ');
     if (separatorIndex !== -1) {
       metadata.set(line.slice(0, separatorIndex), line.slice(separatorIndex + 2));
     }
   }

   const stderr = _parseSectionLines(sections.stderr);
   const stdout = _parseSectionLines(sections.stdout);

    return {
      timestamp: (metadata.get('Timestamp') || '').trim(),
      iteration: metadata.has('Iteration') ? Number(metadata.get('Iteration').trim()) : NaN,
      task: (metadata.get('Task') || '').trim(),
      exitCode: metadata.has('Exit Code') ? Number(metadata.get('Exit Code').trim()) : NaN,
      signal: metadata.has('Signal') ? (metadata.get('Signal') || '').trim() : '',
      stderr,
      stdout,
    };
}

function _serializeStream(value) {
   if (value === undefined || value === null || value === '') return '';
   return String(value)
     .replace(/\r\n/g, '\n')
     .split('\n')
     .map((line) => `    ${line}`)
     .join('\n');
}

function _parseSectionLines(lines) {
   if (!lines.length) return '';

   const sectionLines = [...lines];
   while (sectionLines.length > 0 && sectionLines[sectionLines.length - 1] === '') {
     sectionLines.pop();
   }

   if (!sectionLines.length) return '';

   const isIndentedBlock = sectionLines.every((line) => line.startsWith('    '));
   if (isIndentedBlock) {
     return sectionLines.map((line) => line.slice(4)).join('\n');
   }

   return sectionLines.join('\n');
}

module.exports = { errorsPath, read, readEntries, count, latest, matchIteration, append, clear, archive };
