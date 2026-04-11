## 1. Errors Module

- [x] 1.1 Create `lib/mini-ralph/errors.js` with all functions (`errorsPath`, `read`, `append`, `clear`, `archive`) and comprehensive test coverage in `tests/unit/javascript/mini-ralph-errors.test.js`. The module follows the `context.js` pattern: file-based persistence under `.ralph/errors.md`, no caching, Node.js built-in `fs`/`path` only. `append()` writes structured markdown entries with `---` delimiter, ISO 8601 timestamp, iteration number, task description, exit code, `### stderr` section, `### stdout` section. `read(ralphDir, limit)` returns the N most recent entries in chronological order (empty string if absent). `clear()` deletes the file (no-op if absent). `archive()` copies to `.ralph/errors_<timestamp>.md` (no-op if absent). Expose the module via `lib/mini-ralph/index.js` as `_errors`.
  - Done when: `npx jest tests/unit/javascript/mini-ralph-errors.test.js --verbose` passes with tests for every function, and `lib/mini-ralph/index.js` exports `_errors`.

## 2. Invoker Enhancement

- [x] 2.1 Add `stderr` field to `invoker.invoke()` return value (add `stderr: result.stderr` to the return object at `lib/mini-ralph/invoker.js:68-73`), add a test verifying `stderr` is present in the result, and confirm all existing invoker tests still pass. The field is additive — no existing consumer breaks because nothing currently reads `stderr` from the result.
  - Done when: `npx jest tests/unit/javascript/mini-ralph-invoker.test.js --verbose` passes with a new `stderr` assertion and all existing tests unchanged.

## 3. Runner Integration

- [ ] 3.1 Wire error capture, enhanced feedback, and completion cleanup into `runner.js`. (a) Import `errors` module. (b) After each iteration where `result.exitCode !== 0`, call `errors.append()` with `{ iteration, task description from current task or 'N/A', exitCode, stderr: result.stderr, stdout: result.stdout }`. (c) Enhance `_buildIterationFeedback()` to accept an optional second parameter `errorContent` (string); when provided, for each history entry with `exitCode !== 0`, look for a matching error entry (by iteration number substring) in the errorContent and include truncated error output (max 2000 chars stderr, 500 chars stdout per entry) alongside the existing exit-code signals. (d) At the top of each iteration, read errors via `errors.read(ralphDir, 3)` and pass the result to `_buildIterationFeedback()`. (e) On successful loop completion (`completed === true`), call `errors.archive(ralphDir)` then `errors.clear(ralphDir)`; log the archive path when verbose. On incomplete exit (`completed === false`), do NOT clear errors — they persist for the next run. Write tests in `tests/unit/javascript/mini-ralph-runner.test.js` for: error entry written on non-zero exit, error content injected into next iteration prompt, errors archived/cleared on successful completion, errors preserved on incomplete exit, backward compatibility (no errors file = existing behavior). All existing runner tests must pass unchanged.
  - Done when: `npx jest tests/unit/javascript/mini-ralph-runner.test.js --verbose` passes with all new tests green and all existing tests green.

## 4. Status Dashboard Enhancement

- [ ] 4.1 Add error summary to `status.js render()`. Import `errors` module. Between the recent history and struggle indicators sections, add an `--- Error History ---` section that appears only when `.ralph/errors.md` exists: show the count of error entries and a preview (first 200 characters) of the most recent error. Write tests in `tests/unit/javascript/mini-ralph-status.test.js` for: error summary shown when errors exist, no error section when errors file absent. All existing status tests must pass unchanged.
  - Done when: `npx jest tests/unit/javascript/mini-ralph-status.test.js --verbose` passes with new tests green and all existing tests green.

## 5. Final Integration

- [ ] 5.1 Add deprecation comments to bash dead code in `scripts/ralph-run.sh` (lines 499–572: `format_error_entry`, `append_error`, `read_errors`, `clear_errors`, `archive_errors`) noting these functions are superseded by `lib/mini-ralph/errors.js`. Then run the full test suite to verify zero regressions across all unit and integration tests.
  - Done when: `npm test` passes with zero failures. No existing test changed or removed.
