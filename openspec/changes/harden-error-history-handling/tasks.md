## 1. Shared Error History Queries

- [x] 1.1 Implement shared parsed-entry helpers in `lib/mini-ralph/errors.js` and migrate runtime consumers to them so status and prompt/error lookups stop reparsing markdown independently.
  - Done when: `errors.readEntries()`, `errors.count()`, and `errors.latest()` preserve the existing `.ralph/errors.md` format and `read()` compatibility while `status.js` and runner-side error lookups use the shared helper path.
  - Done when: the status dashboard reports the true persisted error count even when more than three entries exist, and the preview remains bounded to the most recent entry.
  - Verify by: `npx jest tests/unit/javascript/mini-ralph-errors.test.js tests/unit/javascript/mini-ralph-status.test.js tests/unit/javascript/mini-ralph-runner.test.js --runInBand`

## 2. Completion Cleanup Hardening

- [ ] 2.1 Harden `lib/mini-ralph/runner.js` completion cleanup so archive/clear failures are best-effort warnings that never leave a genuinely completed loop marked active.
  - Done when: the happy path still archives then clears error history, archive failure preserves the original error file and skips clear, clear failure leaves the active file in place, and all completed runs still end with inactive loop state.
  - Done when: cleanup failures emit operator-visible warnings without changing the completion outcome or the existing archive filename convention.
  - Verify by: `npx jest tests/unit/javascript/mini-ralph-runner.test.js --runInBand`

## 3. Regression Validation

- [ ] 3.1 Run the full regression suite and confirm the hardening pass preserves the documented external surface.
  - Done when: `npm test` passes and the change introduces no new dependencies, CLI flags, or `.ralph/errors.md` format changes.
