'use strict';

/**
 * runner-handoff.js — Handoff and blocker-artifact helpers split out of
 * runner.js to keep that module digestible.
 *
 * Responsible for:
 *   - extracting the agent's `BLOCKED_HANDOFF` blocker note from stdout
 *   - probing for diagnostic artifacts written into `.ralph/` so the next
 *     iteration sees the prior diagnosis without re-deriving it
 *   - appending blocker entries (and supervisor sub-sections) to HANDOFF.md
 *   - persisting fatal-iteration history rows
 *
 * These helpers were moved verbatim — no behavior change. Implementation
 * details are unchanged so existing tests in
 * `tests/unit/javascript/mini-ralph-runner.test.js` keep passing.
 */

const fs = require('fs');
const fsPath = require('path');

const errors = require('./errors');
const history = require('./history');

/**
 * Pull the agent's structured blocker note out of an iteration's stdout.
 *
 * Looks for the explicit `<promise>BLOCKED_HANDOFF</promise>` tag emitted by
 * the agent and walks back up to the nearest `## Blocker Note` (or
 * `Blocker:`) sentinel. Falls back to the last 40 non-blank lines when the
 * agent emitted the promise without a sentinel header.
 *
 * @param {string} outputText  full iteration stdout
 * @param {string} promiseName configured BLOCKED_HANDOFF promise name
 * @returns {string} the extracted note (empty string if the tag is absent)
 */
function _extractBlockerNote(outputText, promiseName) {
  if (!outputText || !promiseName) return '';
  const tag = `<promise>${promiseName}</promise>`;
  const lines = outputText.split(/\r?\n/);
  let tagIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === tag) {
      tagIdx = i;
      break;
    }
  }
  if (tagIdx === -1) return '';

  const sentinel = /^\s*(##\s*Blocker(\s+Note)?|Blocker:)/i;
  let startIdx = tagIdx;
  for (let i = tagIdx - 1; i >= 0; i--) {
    if (sentinel.test(lines[i])) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === tagIdx) {
    const window = [];
    for (let i = tagIdx - 1; i >= 0 && window.length < 40; i--) {
      const l = lines[i];
      if (l.trim()) window.unshift(l);
    }
    return window.join('\n').trim();
  }

  return lines.slice(startIdx, tagIdx).join('\n').trim();
}

/**
 * Scan well-known locations for blocker / diagnostic artifacts the agent
 * may have written during the most recent iteration, and return their
 * content (truncated) so we can tee it into the next iteration's prompt.
 *
 * The motivation is the failure mode we observed in the wild: the agent
 * writes `<change-baseline>/shared-chrome-invariant-report.txt` with a clear
 * `STATUS=BLOCKED  REASON=...` diagnosis, then on the next iteration starts
 * from a blank slate, re-derives the same diagnosis, and burns another full
 * LLM cycle. By auto-detecting and surfacing the artifact, the agent gets
 * its own prior diagnosis as input on the next turn, freeing it to either
 * (a) act on it, or (b) emit BLOCKED_HANDOFF with a richer note.
 *
 * Probe paths (relative to ralphDir's parent — i.e. the change root):
 *   - <ralphDir>/HANDOFF.md
 *   - <ralphDir>/BLOCKED.md
 *   - <ralphDir>/blocker.md  /  blocker-note.md
 *   - <repoRoot>/.ralph/baselines/<change>/*report*.{txt,md}
 *   - any file under <ralphDir> matching /(blocker|handoff|invariant-report)\.[a-z]+$/i
 *
 * We cap the returned text at 1500 chars per artifact and 3 artifacts total
 * so the feedback block stays bounded. Freshness is required by default to
 * avoid carrying stale diagnostics forever; when a prior run explicitly ended
 * with BLOCKED_HANDOFF, the canonical handoff files may be included even when
 * stale because they are the persisted operator-facing diagnosis.
 *
 * @param {string} ralphDir
 * @param {object} [options] { repoRoot, maxArtifacts = 3, maxCharsEach = 1500, includeStaleHandoff = false }
 * @returns {Array<{ path: string, content: string, truncated: boolean }>}
 */
function _detectBlockerArtifacts(ralphDir, options) {
  const opts = Object.assign(
    {
      repoRoot: process.cwd(),
      maxArtifacts: 3,
      maxCharsEach: 1500,
      includeStaleHandoff: false,
    },
    options || {}
  );

  if (!ralphDir || !fs.existsSync(ralphDir)) return [];

  const matches = new Map();
  const isHandoffArtifact = (name) =>
    /^(handoff|blocked|blocker(-note)?)\.(md|txt)$/i.test(name);
  const isInteresting = (name) =>
    isHandoffArtifact(name) ||
    /(invariant|blocker|handoff).*report\.(md|txt)$/i.test(name) ||
    /report\.(md|txt)$/i.test(name);

  const consider = (p) => {
    try {
      const st = fs.statSync(p);
      if (!st.isFile()) return;
      if (st.size > 1024 * 1024) return;
      const stale = Date.now() - st.mtimeMs > 10 * 60 * 1000;
      if (stale && !(opts.includeStaleHandoff && isHandoffArtifact(fsPath.basename(p)))) {
        return;
      }
      matches.set(fsPath.resolve(p), st.mtimeMs);
    } catch (_) {
      // ENOENT / permission errors: ignore — this is a best-effort probe.
    }
  };

  try {
    const entries = fs.readdirSync(ralphDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && isInteresting(ent.name)) {
        consider(fsPath.join(ralphDir, ent.name));
      }
    }
  } catch (_) { /* ignore */ }

  try {
    const changeDir = fsPath.dirname(ralphDir);
    const changeName = fsPath.basename(changeDir);
    const baselinesDir = fsPath.join(opts.repoRoot, '.ralph', 'baselines', changeName);
    if (fs.existsSync(baselinesDir)) {
      const entries = fs.readdirSync(baselinesDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isFile() && isInteresting(ent.name)) {
          consider(fsPath.join(baselinesDir, ent.name));
        }
      }
    }
  } catch (_) { /* ignore */ }

  if (matches.size === 0) return [];

  const sorted = Array.from(matches.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);

  const out = [];
  for (const p of sorted.slice(0, opts.maxArtifacts)) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const truncated = raw.length > opts.maxCharsEach;
      const content = truncated ? raw.slice(0, opts.maxCharsEach) : raw;
      out.push({
        path: fsPath.relative(opts.repoRoot, p) || p,
        content: content.trim(),
        truncated,
      });
    } catch (_) {
      // Ignore unreadable artifacts.
    }
  }

  return out;
}

/**
 * Write the agent's blocker note to <ralphDir>/HANDOFF.md with iteration
 * metadata so an operator can reproduce the context. Appends rather than
 * overwrites: a single change can hit several BLOCKED_HANDOFFs over time
 * (operator unblocks, loop resumes, hits a different blocker), and we want
 * the full audit trail in one file.
 *
 * @param {string} ralphDir
 * @param {object} entry { iteration, task, note, completionPromise, taskPromise, supervisor }
 * @returns {string} the absolute path to HANDOFF.md
 */
function _writeHandoff(ralphDir, entry) {
  if (!fs.existsSync(ralphDir)) {
    fs.mkdirSync(ralphDir, { recursive: true });
  }
  const handoffPath = fsPath.join(ralphDir, 'HANDOFF.md');
  const ts = new Date().toISOString();
  const taskLine = entry.task && entry.task !== 'N/A'
    ? entry.task
    : '(no task in progress)';
  const noteBlock = entry.note && entry.note.trim()
    ? entry.note.trim()
    : '(agent emitted BLOCKED_HANDOFF without a structured blocker note;\n' +
      'check the iteration stdout log for the rationale)';
  const supervisorBlock = _formatSupervisorHandoffSections(entry.supervisor);

  const section = [
    '',
    `## Iteration ${entry.iteration} — ${ts}`,
    '',
    `**Task:** ${taskLine}`,
    '',
    '**Agent blocker note:**',
    '',
    noteBlock,
    '',
    '**Operator next step:** investigate the blocker, take one of the actions',
    'the task spec authorizes (revert / isolate / justify / escalate), then',
    'rerun `ralph-run` to resume.',
    supervisorBlock,
    '',
    '---',
    '',
  ].join('\n');

  let existing = '';
  if (fs.existsSync(handoffPath)) {
    existing = fs.readFileSync(handoffPath, 'utf8');
  } else {
    existing = '# Ralph Handoff Log\n\nThis file is appended whenever the loop\n' +
      'exits with `BLOCKED_HANDOFF`. Each section is one blocker the\n' +
      'agent surfaced — review newest first.\n';
  }
  fs.writeFileSync(handoffPath, existing + section, 'utf8');
  return handoffPath;
}

function _formatSupervisorHandoffSections(supervisorEntry) {
  if (!supervisorEntry || typeof supervisorEntry !== 'object') {
    return '';
  }

  const sections = [];
  const patchedTasks = Array.isArray(supervisorEntry.patchedTasks)
    ? supervisorEntry.patchedTasks.filter((taskNumber) => String(taskNumber || '').trim())
    : [];
  if (patchedTasks.length > 0) {
    sections.push(
      '## Supervisor edits',
      '',
      `- Iteration: ${supervisorEntry.iteration || 'N/A'}`,
      `- Try index: ${supervisorEntry.tryIndex || 'N/A'}`,
      `- Blocker hash: ${supervisorEntry.blockerHash || 'N/A'}`,
      `- Patched tasks: ${patchedTasks.join(', ')}`,
      `- Soft warnings: ${_formatSupervisorList(supervisorEntry.softWarnings, 'none')}`,
      `- Summary: ${String(supervisorEntry.summary || '').trim() || 'none'}`,
    );
  }

  const attempts = Array.isArray(supervisorEntry.attempts)
    ? supervisorEntry.attempts.filter((attempt) => String(attempt || '').trim())
    : [];
  if (supervisorEntry.attemptsExhausted === true && attempts.length > 0) {
    sections.push(
      '### Supervisor attempts',
      '',
      ...attempts.map((attempt) => `- ${attempt}`),
    );
  }

  return sections.length > 0 ? ['', ...sections].join('\n') : '';
}

function _formatSupervisorList(values, fallback) {
  const items = Array.isArray(values)
    ? values.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  return items.length > 0 ? items.join('; ') : fallback;
}

function _appendFatalIterationFailure(ralphDir, entry) {
  errors.append(ralphDir, {
    iteration: entry.iteration,
    task: entry.task,
    exitCode: entry.exitCode,
    signal: entry.signal || '',
    failureStage: entry.failureStage || '',
    stderr: entry.stderr || '',
    stdout: entry.stdout || '',
  });

  history.append(ralphDir, {
    iteration: entry.iteration,
    duration: entry.duration,
    completionDetected: false,
    taskDetected: false,
    toolUsage: [],
    filesChanged: [],
    exitCode: entry.exitCode,
    signal: entry.signal || '',
    failureStage: entry.failureStage || '',
    completedTasks: [],
    commitAttempted: false,
    commitCreated: false,
    commitAnomaly: '',
    commitAnomalyType: '',
    protectedArtifacts: [],
    promptBytes: entry.promptBytes || 0,
    promptChars: entry.promptChars || 0,
    promptTokens: entry.promptTokens || 0,
    responseBytes: entry.responseBytes || 0,
    responseChars: entry.responseChars || 0,
    responseTokens: entry.responseTokens || 0,
    truncated: entry.truncated || false,
  });
}

function _summarizeBlockerNote(note, limit = 500) {
  if (!note || typeof note !== 'string') return '';
  const oneLine = note.replace(/\s+/g, ' ').trim();
  if (!oneLine) return '';
  if (oneLine.length <= limit) return oneLine;
  return `${oneLine.slice(0, Math.max(0, limit - 1)).replace(/\s+$/, '')}…`;
}

module.exports = {
  _extractBlockerNote,
  _detectBlockerArtifacts,
  _writeHandoff,
  _formatSupervisorHandoffSections,
  _formatSupervisorList,
  _appendFatalIterationFailure,
  _summarizeBlockerNote,
};
