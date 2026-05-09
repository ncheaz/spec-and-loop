'use strict';

/**
 * runner-autocommit.js — Auto-commit pipeline split out of runner.js.
 *
 * Responsible for assembling the per-iteration staging allowlist, filtering
 * gitignored paths, building the task-aware commit message, detecting
 * protected OpenSpec artifacts (proposal.md / design.md / specs/**), and
 * shelling out to `git add` / `git commit`. Every helper here was moved
 * verbatim from runner.js — no behavior change.
 *
 * Conventional git tooling renders the first commit-message line in ~50–72
 * columns, so we cap the subject line accordingly and preserve the full
 * task descriptions in the commit body.
 */

const path = require('path');
const childProcess = require('child_process');

const SUBJECT_MAX_LENGTH = 72;

function _formatAutoCommitIgnoreBlock(iteration, anomaly) {
  const SEP = '================================================================================\n';
  const pathLines = (anomaly.ignoredPaths || []).map(p => `  - ${p}`).join('\n');
  return (
    SEP +
    `⚠ AUTO-COMMIT IGNORE FILTER FIRED  (iteration ${iteration}, type: ${anomaly.type})\n` +
    `Paths filtered because .gitignore matches:\n` +
    pathLines + '\n' +
    `Consequence: these paths are NOT in the latest commit.\n` +
    `Remediation (pick one):\n` +
    `  1. git add -f <path>   # one-time unblock, if you want it tracked\n` +
    `  2. edit .gitignore     # narrow or remove the matching rule\n` +
    `  3. pass --no-auto-commit on the ralph-run invocation\n` +
    SEP
  );
}

/**
 * Auto-commit changed files after a successful iteration.
 * Silently skips if git is unavailable, there is nothing to commit, or the
 * iteration did not complete any tasks.
 *
 * @param {number} iteration
 * @param {object} opts
 * @param {Array<object>} [opts.completedTasks]
 * @param {Array<string>} [opts.filesToStage]
 * @param {boolean} [opts.verbose]
 */
function _autoCommit(iteration, opts = {}) {
  const { completedTasks = [], filesToStage = [], tasksFile = null, verbose = false, reporter = null } = opts;
  const message = _formatAutoCommitMessage(iteration, completedTasks);

  if (!message) {
    if (verbose) {
      process.stderr.write('[mini-ralph] auto-commit skipped: no completed tasks detected\n');
    }
    return { attempted: false, committed: false, anomaly: null };
  }

  if (!Array.isArray(filesToStage) || filesToStage.length === 0) {
    if (verbose) {
      process.stderr.write('[mini-ralph] auto-commit skipped: no iteration files to stage\n');
    }
    return { attempted: false, committed: false, anomaly: null };
  }

  const protectedArtifacts = _detectProtectedCommitArtifacts(filesToStage, tasksFile);
  if (protectedArtifacts.length > 0) {
    const anomaly = {
      type: 'protected_artifacts',
      message:
        'Auto-commit blocked: loop-managed commits cannot include protected OpenSpec artifacts: ' +
        protectedArtifacts.join(', '),
      protectedArtifacts,
    };

    process.stderr.write(`[mini-ralph] warning: ${anomaly.message}\n`);
    return { attempted: true, committed: false, anomaly };
  }

  const { kept: keptPaths, dropped: droppedPaths } = _filterGitignored(filesToStage, process.cwd());

  if (droppedPaths.length > 0) {
    const pathWord = droppedPaths.length === 1 ? 'path' : 'paths';
    const allIgnored = keptPaths.length === 0;
    const warnLines = allIgnored
      ? [
          `auto-commit iter ${iteration} skipped: all ${droppedPaths.length} ${pathWord} are gitignored`,
          ...droppedPaths.map(p => `  - ${p}`),
          '  hint: `git add -f <path>` once, or adjust .gitignore',
        ].join('\n')
      : [
          `auto-commit iter ${iteration}: filtered ${droppedPaths.length} gitignored ${pathWord}, committing ${keptPaths.length} ${keptPaths.length === 1 ? 'other' : 'others'}`,
          ...droppedPaths.map(p => `  - ${p}`),
        ].join('\n');
    if (reporter) {
      reporter.note(warnLines, 'error');
    } else {
      const fallbackMsg = allIgnored
        ? `Auto-commit skipped: all paths are gitignored: ${droppedPaths.join(', ')}`
        : `Auto-commit filtered gitignored paths: ${droppedPaths.join(', ')}`;
      process.stderr.write(`[mini-ralph] warning: ${fallbackMsg}\n`);
    }
    if (allIgnored) {
      const anomaly = {
        type: 'all_paths_ignored',
        message: `Auto-commit skipped: all paths are gitignored: ${droppedPaths.join(', ')}`,
        ignoredPaths: droppedPaths,
      };
      // task 5.1: emit loud direct stderr block, bypassing reporter dedup/buffering
      process.stderr.write(_formatAutoCommitIgnoreBlock(iteration, anomaly));
      return {
        attempted: true,
        committed: false,
        anomaly,
      };
    }
  }

  const stagePaths = droppedPaths.length > 0 ? keptPaths : filesToStage;

  try {
    // Use `git add -A -- <paths>` (not plain `git add -- <paths>`) so deletions
    // and renames are staged alongside modifications/additions. Tasks that call
    // `git rm` via a shell tool leave the path absent from the working tree but
    // still present in `git status --porcelain`, which means the plain form
    // would error with `fatal: pathspec did not match`. Scoping to the per-path
    // allowlist preserves the protected-artifact guarantee.
    childProcess.execFileSync('git', ['add', '-A', '--', ...stagePaths], {
      stdio: verbose ? 'inherit' : ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });

    const stagedFiles = childProcess.execFileSync('git', ['diff', '--cached', '--name-only'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });

    if (!stagedFiles.trim()) {
      const anomaly = {
        type: 'nothing_staged',
        message: 'Auto-commit failed: nothing was staged after git add',
      };

      process.stderr.write(`[mini-ralph] warning: ${anomaly.message}\n`);
      if (verbose) {
        process.stderr.write('[mini-ralph] auto-commit skipped: nothing staged\n');
      }
      return { attempted: true, committed: false, anomaly };
    }

    childProcess.execFileSync('git', ['commit', '-m', message], {
      stdio: verbose ? 'inherit' : ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });

    if (verbose) {
      process.stderr.write(`[mini-ralph] auto-committed: ${message}\n`);
    }
    if (droppedPaths.length > 0) {
      const anomaly = {
        type: 'paths_ignored_filtered',
        message: 'Auto-commit succeeded but filtered gitignored paths: ' + droppedPaths.join(', '),
        ignoredPaths: droppedPaths,
      };
      // task 5.1: emit loud direct stderr block, bypassing reporter dedup/buffering
      process.stderr.write(_formatAutoCommitIgnoreBlock(iteration, anomaly));
      return {
        attempted: true,
        committed: true,
        anomaly,
      };
    }
    return { attempted: true, committed: true, anomaly: null };
  } catch (err) {
    const anomaly = {
      type: 'commit_failed',
      message: `Auto-commit failed: ${_gitErrorMessage(err)}`,
    };

    process.stderr.write(`[mini-ralph] warning: ${anomaly.message}\n`);
    return { attempted: true, committed: false, anomaly };
  }
}

/**
 * Filter gitignored paths out of a list using `git check-ignore --stdin`.
 *
 * Exit-code semantics of `git check-ignore`:
 *   0  – at least one path is ignored; stdout lists the ignored paths.
 *   1  – no paths are ignored (Node's execFileSync throws; we catch status===1).
 *   other / ENOENT / any thrown error – fallback: treat all paths as kept.
 *
 * @param {string[]} paths - Repo-relative paths to test.
 * @param {string}   cwd   - Working directory for the git command.
 * @returns {{ kept: string[], dropped: string[] }}
 */
function _filterGitignored(paths, cwd) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return { kept: [], dropped: [] };
  }

  try {
    const stdout = childProcess.execFileSync(
      'git',
      ['check-ignore', '--stdin'],
      {
        input: paths.join('\n'),
        cwd: cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf8',
      }
    );

    const dropped = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const droppedSet = new Set(dropped);
    const kept = paths.filter((p) => !droppedSet.has(p));
    return { kept, dropped };
  } catch (err) {
    if (err && err.status === 1) {
      return { kept: paths.slice(), dropped: [] };
    }
    return { kept: paths.slice(), dropped: [] };
  }
}

function _mergePathLists(...lists) {
  const merged = new Set();
  for (const list of lists) {
    for (const file of list || []) {
      const relativeFile = _repoRelativePath(file);
      if (relativeFile) {
        merged.add(relativeFile);
      }
    }
  }
  return Array.from(merged);
}

/**
 * Build the explicit per-iteration git staging allowlist.
 *
 * @param {Array<string>} filesChanged
 * @param {Array<object>} completedTasks
 * @param {string|null|undefined} tasksFile
 * @returns {Array<string>}
 */
function _buildAutoCommitAllowlist(filesChanged, completedTasks, tasksFile) {
  const allowlist = new Set();

  for (const file of filesChanged || []) {
    const relativeFile = _repoRelativePath(file);
    if (relativeFile) {
      allowlist.add(relativeFile);
    }
  }

  if (Array.isArray(completedTasks) && completedTasks.length > 0 && tasksFile) {
    const relativeTasksFile = _repoRelativePath(tasksFile);
    if (relativeTasksFile) {
      allowlist.add(relativeTasksFile);
    }
  }

  return Array.from(allowlist);
}

/**
 * Return tasks that became completed during the current iteration.
 *
 * @param {Array<object>} beforeTasks
 * @param {Array<object>} afterTasks
 * @returns {Array<object>}
 */
function _completedTaskDelta(beforeTasks, afterTasks) {
  const beforeCompleted = new Set(
    (beforeTasks || [])
      .filter((task) => task.status === 'completed')
      .map(_taskIdentity)
  );

  return (afterTasks || []).filter(
    (task) => task.status === 'completed' && !beforeCompleted.has(_taskIdentity(task))
  );
}

/**
 * Build a task-aware commit message for an iteration.
 *
 * The subject line (first line) is kept short — conventional git tooling
 * assumes ~50–72 characters — so `git log --oneline` stays readable even when
 * the underlying task description is a multi-sentence normative blob. The
 * full, untruncated task descriptions are preserved in the commit body.
 *
 * @param {number} iteration
 * @param {Array<object>} completedTasks
 * @returns {string}
 */
function _formatAutoCommitMessage(iteration, completedTasks) {
  if (!Array.isArray(completedTasks) || completedTasks.length === 0) {
    return '';
  }

  const rawSummary = completedTasks.length === 1
    ? completedTasks[0].description
    : `complete ${completedTasks.length} tasks`;

  const prefix = `Ralph iteration ${iteration}: `;
  const subjectBudget = Math.max(20, SUBJECT_MAX_LENGTH - prefix.length);
  const summary = _truncateSubjectSummary(rawSummary, subjectBudget);

  const taskLines = completedTasks.map(
    (task) => `- [x] ${task.fullDescription || task.description}`
  );

  return `${prefix}${summary}\n\nTasks completed:\n${taskLines.join('\n')}`;
}

/**
 * Reduce a task description to a short, single-line commit subject.
 *
 * Strategy:
 *   1. Collapse whitespace onto a single line.
 *   2. Prefer the first sentence (up to `.`, `!`, `?`) when it is not itself
 *      longer than the allowed budget.
 *   3. Otherwise hard-truncate at a word boundary and append an ellipsis.
 *
 * @param {string} text
 * @param {number} budget
 * @returns {string}
 */
function _truncateSubjectSummary(text, budget) {
  const oneLine = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (oneLine.length === 0) return '';
  if (oneLine.length <= budget) return oneLine;

  const sentenceMatch = oneLine.match(/^(.+?[.!?])(\s|$)/);
  if (sentenceMatch) {
    const candidate = sentenceMatch[1].trim();
    if (candidate.length > 0 && candidate.length <= budget) {
      return candidate;
    }
  }

  const ellipsis = '…';
  const hardBudget = Math.max(1, budget - ellipsis.length);
  const sliced = oneLine.slice(0, hardBudget);
  const lastSpace = sliced.lastIndexOf(' ');
  const cut = lastSpace > Math.floor(hardBudget / 2) ? sliced.slice(0, lastSpace) : sliced;
  return `${cut.replace(/[\s,;:.!?-]+$/, '')}${ellipsis}`;
}

function _taskIdentity(task) {
  return task.number
    ? `${task.number}|${task.fullDescription || task.description}`
    : (task.fullDescription || task.description);
}

function _repoRelativePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const normalized = path.normalize(filePath);
  if (!normalized || normalized === '.') return '';
  const relative = path.isAbsolute(normalized)
    ? path.relative(process.cwd(), normalized)
    : normalized;

  if (!relative || relative.startsWith('..')) {
    return '';
  }

  return relative.split(path.sep).join('/');
}

function _detectProtectedCommitArtifacts(filesToStage, tasksFile) {
  if (!Array.isArray(filesToStage) || filesToStage.length === 0 || !tasksFile) {
    return [];
  }

  const relativeTasksFile = _repoRelativePath(tasksFile);
  if (!relativeTasksFile) {
    return [];
  }

  const changeRoot = path.posix.dirname(relativeTasksFile);
  const protectedArtifacts = [];

  for (const file of filesToStage) {
    const normalized = _repoRelativePath(file);
    if (!normalized) continue;

    const isProposal = normalized === `${changeRoot}/proposal.md`;
    const isDesign = normalized === `${changeRoot}/design.md`;
    const isSpec = normalized.startsWith(`${changeRoot}/specs/`) && normalized.endsWith('/spec.md');

    if (isProposal || isDesign || isSpec) {
      protectedArtifacts.push(normalized);
    }
  }

  return protectedArtifacts;
}

function _gitErrorMessage(err) {
  if (!err) return 'unknown git error';

  const stderr = _coerceGitErrorStream(err.stderr);
  const stdout = _coerceGitErrorStream(err.stdout);

  if (stderr) return stderr;
  if (stdout) return stdout;
  if (err.message) return err.message;
  return 'unknown git error';
}

function _coerceGitErrorStream(stream) {
  if (!stream) return '';
  if (Buffer.isBuffer(stream)) return stream.toString('utf8').trim();
  if (typeof stream === 'string') return stream.trim();
  return '';
}

module.exports = {
  _autoCommit,
  _formatAutoCommitIgnoreBlock,
  _filterGitignored,
  _mergePathLists,
  _buildAutoCommitAllowlist,
  _completedTaskDelta,
  _formatAutoCommitMessage,
  _truncateSubjectSummary,
  _taskIdentity,
  _repoRelativePath,
  _detectProtectedCommitArtifacts,
  _gitErrorMessage,
  _coerceGitErrorStream,
};
