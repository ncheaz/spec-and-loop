## 1. Commit Contract Hardening

- [x] 1.1 Remove commit instructions from the default prompt contract and make `--no-commit` explicitly forbid git commits in rendered prompts.
  - Done when: the generated prompt no longer asks the agent to create commits, and `--no-commit` produces an explicit no-commit contract instead of relying only on runner-side suppression.
  - Verify by: targeted prompt-template and runner-path tests for default and `--no-commit` flows.
  - Stop and hand off if: fully honoring `--no-commit` would require changing documented promise names or adding new public `ralph-run` flags.

- [x] 1.2 Make the runner the sole auto-commit path and stage only current-iteration files plus the matching task-state update instead of `git add -A`.
  - Done when: `_autoCommit()` consumes a per-iteration allowlist, excludes unrelated dirty-worktree files, and preserves the current external `ralph-run` behavior when auto-commit is enabled.
  - Verify by: `tests/unit/javascript/mini-ralph-runner-autocommit.test.js` plus new dirty-worktree coverage.
  - Stop and hand off if: safe per-iteration staging cannot be implemented without destructive git operations or widening the documented CLI surface.

- [x] 1.3 Protect OpenSpec source-of-truth artifacts from loop-managed commits and surface commit failures as operator-visible anomalies.
  - Done when: loop-managed commits warn or fail instead of silently including `proposal.md`, `design.md`, or `specs/**/spec.md`, and failed auto-commit attempts are visible in recent history and status.
  - Verify by: targeted runner/status tests for protected-artifact and commit-failure scenarios.
  - Stop and hand off if: artifact protection would block non-loop manual documentation edits outside the loop-managed commit path.

## 2. Loop Lifecycle and Concurrency

- [x] 2.1 Add a single-active-run lock for each change's `.ralph/` directory with stale-lock recovery on Linux and macOS.
  - Done when: a second live loop targeting the same change fails before mutating state, while stale locks are detected and replaced cleanly.
  - Verify by: unit coverage for live-lock rejection and stale-lock recovery behavior.
  - Stop and hand off if: reliable stale-lock detection requires unsupported OS-specific process inspection beyond documented Linux/macOS semantics.

- [x] 2.2 Separate completed and stopped state metadata so max-iteration and fatal-error exits clear `active` without writing false completion timestamps.
  - Done when: successful runs record completion metadata, incomplete runs record stop metadata and exit reason, and thrown prompt/invoker failures still leave the loop inactive.
  - Verify by: targeted runner/state/status tests for completion, max-iteration, and thrown-failure exits.
  - Stop and hand off if: existing validated behavior depends on incomplete runs retaining `completedAt` or staying marked active.

- [x] 2.3 Tighten promise parsing to standalone control lines and add negative coverage for quoted, explanatory, or diff-like promise-tag mentions.
  - Done when: only valid control-line promise output advances or completes the loop, without changing the existing promise names.
  - Verify by: `tests/unit/javascript/mini-ralph-runner.test.js` coverage for positive and negative promise parsing cases.
  - Stop and hand off if: stricter parsing would require a new public control protocol instead of the existing promise tags.

## 3. Progress and Status Fidelity

- [x] 3.1 Replace dirty-path presence snapshots with per-path fingerprints so edits to already-dirty files count as real progress.
  - Done when: the runtime records a file as changed when its contents change during the iteration even if it was already dirty beforehand, and untouched dirty files do not count as new progress.
  - Verify by: new invoker/runner tests for already-dirty file edits, untouched dirty files, and deleted/untracked path cases.
  - Stop and hand off if: accurate dirty-worktree detection requires whole-repo hashing or temporary staging that risks user worktree state.

- [x] 3.2 Update status and struggle detection to use the improved exit metadata and meaningful file-change signals.
  - Done when: `--status` distinguishes active, completed, and stopped-incomplete runs correctly, and no-progress warnings do not trigger when a dirty file truly changed during the recent window.
  - Verify by: `tests/unit/javascript/mini-ralph-status.test.js` plus new status render cases.
  - Stop and hand off if: the necessary status changes would break a documented stable interface beyond this repository's own maintained surfaces.

- [x] 3.3 Make template-mode prompt rendering explicitly include the base prompt content and document the invocation-time PRD snapshot contract.
  - Done when: template rendering has an explicit base-prompt variable/section, tests prove the combined prompt contract, and docs stop claiming freshness guarantees the runtime does not actually provide.
  - Verify by: `tests/unit/javascript/mini-ralph-prompt.test.js`, `tests/unit/bash/test-create-prompt-template.bats`, and related documentation assertions.
  - Stop and hand off if: including the base prompt correctly requires per-iteration PRD regeneration or a broader prompt architecture redesign.

## 4. Documentation and Regression Validation

- [ ] 4.1 Align README, QUICKSTART, setup output, BP/BOTW, and assessment docs with the hardened runtime contract, supported OpenSpec commands, and Linux/macOS behavior.
  - Done when: all operator-facing docs describe the same `ralph-run` workflow, promise-tag expectations, `--no-commit` semantics, and prompt/PRD freshness model, and published docs link to deeper methodology notes consistently.
  - Verify by: manual doc review plus targeted assertions for setup/help output where automated coverage already exists.
  - Stop and hand off if: doc alignment uncovers a required CLI or platform support change beyond preserving the current Linux/macOS contract.

- [ ] 4.2 Run focused JavaScript/Bash suites and the full regression pass needed to prove the change preserves the documented public surface on the current OS and across existing Linux/macOS-oriented paths.
  - Done when: targeted new tests pass, `npm test` stays green, and the change introduces no intentional breaking changes to the documented `ralph-run` interface.
  - Verify by: focused Jest/Bats commands during development, then final `npm test`.
  - Stop and hand off if: regression failures reveal unrelated pre-existing breakage outside this change's scope.
