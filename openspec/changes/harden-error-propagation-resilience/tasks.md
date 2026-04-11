## 1. Error Record Hardening

- [x] 1.1 Make `lib/mini-ralph/errors.js` write and read a delimiter-safe `.ralph/errors.md` entry shape that preserves raw stderr/stdout lines containing `---`, `### stderr`, or `### stdout`.
  - Verify by: run `npx jest --runInBand tests/unit/javascript/mini-ralph-errors.test.js` with new cases for literal delimiter lines, section-marker lines, blank lines, and mixed legacy/new entries.
  - Stop and hand off if: a safe persistence format would require moving away from `.ralph/errors.md` or adding a non-Node built-in dependency.

- [x] 1.2 Update structured error helpers and iteration-to-error matching so prompt/status consumers resolve the correct parsed entry for an iteration without substring-based ambiguity.
  - Verify by: run `npx jest --runInBand tests/unit/javascript/mini-ralph-errors.test.js tests/unit/javascript/mini-ralph-runner.test.js tests/unit/javascript/mini-ralph-status.test.js`.
  - Stop and hand off if: exact iteration matching exposes a spec conflict between prompt feedback and status expectations that the current design does not resolve.

## 2. Failure Classification and Persistence

- [x] 2.1 Preserve child-process `signal` metadata in `lib/mini-ralph/invoker.js` and treat signal-terminated `opencode` invocations as failed iterations instead of exit code `0`.
  - Verify by: run `npx jest --runInBand tests/unit/javascript/mini-ralph-invoker.test.js tests/unit/javascript/mini-ralph-runner.test.js` with signal-exit coverage.
  - Stop and hand off if: supported macOS/Linux signal behavior diverges in a way the current design does not already settle.

- [x] 2.2 Record fatal prompt-render and invoker-abort failures as iteration-aligned error/history entries while preserving the existing run-level `fatal_error` outcome and inactive final state.
  - Verify by: run `npx jest --runInBand tests/unit/javascript/mini-ralph-runner.test.js tests/unit/javascript/mini-ralph-status.test.js` with prompt-render and invoker-rejection cases that assert persisted failure metadata.
  - Stop and hand off if: preserving fatal aborts in history would require changing the documented loop result contract rather than tightening the current one.

## 3. Observability and Regression Validation

- [ ] 3.1 Update `lib/mini-ralph/status.js` and runner feedback assembly to surface signal- and failure-stage-aware parsed error data without regressing the current bounded previews and struggle indicators.
  - Verify by: run `npx jest --runInBand tests/unit/javascript/mini-ralph-runner.test.js tests/unit/javascript/mini-ralph-status.test.js` with cases for delimiter-like error text, signal failures, and fatal aborts.
  - Stop and hand off if: trustworthy status output requires changing the documented `ralph-run --status` sections instead of tightening the current sections.

- [ ] 3.2 Run the focused JS suites for touched modules and then `npm test` to confirm the hardening pass preserves the documented public surface.
  - Verify by: run `npx jest --runInBand tests/unit/javascript/mini-ralph-errors.test.js tests/unit/javascript/mini-ralph-invoker.test.js tests/unit/javascript/mini-ralph-runner.test.js tests/unit/javascript/mini-ralph-status.test.js`, then run `npm test`.
  - Stop and hand off if: full regression failures expose unrelated pre-existing breakage outside this change's scope.
