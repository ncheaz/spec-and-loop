## Why

The project has a fully specified but unimplemented error-context-propagation feature. Two existing specs (`error-context-propagation` and `ralph-task-orchestrator`) require that when opencode exits with a non-zero code, the full stderr/stdout output is captured, persisted to `.ralph/errors.md`, and injected into subsequent iteration prompts so the AI agent can learn from failures. Currently, only the numeric exit code is fed back — the AI knows *that* something failed but not *what*. The bash wrapper contains vestigial dead code (`append_error()`, `read_errors()`, `clear_errors()`, `archive_errors()` at `ralph-run.sh:499-572`) that was never wired into the loop. This undermines the core Ralph Wiggum methodology principle of iterative improvement through feedback.

## What Changes

- **Return `stderr` from `invoker.invoke()`** — currently captured in `_spawnOpenCode()` but discarded before the result object is returned. The field will be added to the return value alongside `stdout`, `exitCode`, `toolUsage`, and `filesChanged`.
- **Create `lib/mini-ralph/errors.js` module** — a new module following the established pattern of `context.js` that manages `.ralph/errors.md`. Provides `append(ralphDir, entry)`, `read(ralphDir, limit)`, `clear(ralphDir)`, and `archive(ralphDir)` functions. Error entries include ISO 8601 timestamp, iteration number, task identifier/description, stderr, and stdout.
- **Wire error capture into `runner.js`** — after each iteration with a non-zero exit code, call `errors.append()` with the full output. Enhance `_buildIterationFeedback()` to include the actual error content (not just exit codes) by reading from `.ralph/errors.md`.
- **Clear error history on successful loop completion** — when all tasks complete successfully, call `errors.clear()` (optionally `errors.archive()` first) to reset error state for the next run.
- **Update status dashboard** — add error summary to `status.js render()` output when errors exist, so `ralph-run --status` shows recent failures.
- **Deprecate bash dead code** — add deprecation comments to the unused error functions in `scripts/ralph-run.sh` (lines 499–572: `format_error_entry`, `append_error`, `read_errors`, `clear_errors`, `archive_errors`) noting they are superseded by `lib/mini-ralph/errors.js`. The JS mini-ralph runner is the canonical execution path; the bash wrapper delegates to it.

## Capabilities

### New Capabilities
- `error-capture`: Captures full stderr/stdout from failed opencode executions and persists structured error entries to `.ralph/errors.md` with timestamps, iteration numbers, and task context.

### Modified Capabilities
- `error-context-propagation`: Delta spec updates existing requirements to reference the new `errors.js` module, structured markdown entry format, truncation limits, and the `## Recent Loop Signals` injection path (replacing the previous underspecified `.ralph/errors.md` references).
- `ralph-task-orchestrator`: Delta spec updates existing requirements to specify that error output is captured via `errors.append()` and injected through `_buildIterationFeedback()` with the actual stderr/stdout content (not just exit codes).

## Impact

- **`lib/mini-ralph/invoker.js`**: Add `stderr` field to the return value of `invoke()`. This is an additive change — existing consumers that ignore the field are unaffected.
- **`lib/mini-ralph/runner.js`**: Call `errors.append()` on non-zero exits, enhance `_buildIterationFeedback()` to include error content, and call `errors.clear()` on successful completion. The function signature of `_buildIterationFeedback()` changes to accept an optional `errorContent` parameter.
- **`lib/mini-ralph/errors.js`**: New file. Follows the `context.js` module pattern (file-based, no caching, platform-agnostic Node.js `fs` calls).
- **`lib/mini-ralph/status.js`**: Add error summary section to `render()`.
- **`lib/mini-ralph/index.js`**: Expose the new `errors` module for internal use.
- **`scripts/ralph-run.sh`**: Add deprecation comments to the dead code error functions at lines 499–572, noting they are superseded by `lib/mini-ralph/errors.js`.
- **Tests**: New test file `tests/unit/javascript/mini-ralph-errors.test.js` covering all error module operations. Updated tests in `mini-ralph-runner.test.js`, `mini-ralph-invoker.test.js`, and `mini-ralph-status.test.js` to cover the new behavior.
- **No breaking changes**: All changes are additive. Existing APIs, function signatures (except internal `_buildIterationFeedback`), and behaviors are preserved.
