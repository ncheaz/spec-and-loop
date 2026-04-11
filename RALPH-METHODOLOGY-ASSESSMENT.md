# Ralph Wiggum Methodology Assessment

**Repository:** `spec-and-loop`
**Change:** `evaluate-ralph-wiggum-methodology`
**Assessment date:** 2026-03-08
**Status:** Complete — all findings written and reviewed; path accuracy, verdict language, and follow-up recommendations verified (tasks 3.1–3.3 complete)

---

## 1. Scope

This report evaluates whether `spec-and-loop` correctly implements the Ralph
Wiggum methodology principles it documents and specifies.  The assessment covers
the eighteen principles enumerated in
`openspec/changes/evaluate-ralph-wiggum-methodology/methodology-principles-enumeration.md`
(P1–P18).

Evidence is drawn from the following repository paths:

| Layer | Paths |
|-------|-------|
| Documentation | `README.md`, `QUICKSTART.md`, `OPENSPEC-RALPH-WIGGUM-BOTW.md` |
| OpenSpec specs | `openspec/specs/embedded-loop-engine/spec.md`, `openspec/specs/loop-observability-controls/spec.md`, `openspec/specs/openspec-native-ralph-flow/spec.md` |
| Implementation | `scripts/ralph-run.sh`, `scripts/mini-ralph-cli.js`, `lib/mini-ralph/` |
| Tests | `tests/unit/javascript/`, `tests/unit/bash/`, integration tests |

**Out of scope:**
- Upstream Ralph Wiggum features that `spec-and-loop` explicitly treats as out
  of scope (full Bun runtime, external `@th0rgal/ralph-wiggum` feature set).
- Any runtime behavior not exercised by the above repository paths.
- Follow-up corrective changes; those are queued separately.

---

## 2. Evaluation Rubric

Verdicts and confidence weighting are defined in full in
`openspec/changes/evaluate-ralph-wiggum-methodology/assessment-rubric.md`.
The short form used in this report:

| Verdict | Meaning |
|---------|---------|
| `verified` | Implementation + passing tests; no contradicting evidence |
| `partially-verified` | Implementation exists; test coverage absent or shallow |
| `unverified` | No Tier 1 or Tier 2 evidence located |
| `contradicted` | Active conflict between documented claim and repository evidence |

Evidence tiers (strongest → weakest): automated tests → implementation code →
OpenSpec specs → docs (README/QUICKSTART/BOTW) → archived artifacts.

---

## 3. Principle Matrix

*Verdicts assigned during task 2.3.  See Section 5 for full per-principle evidence records.*

| ID  | Principle (short label)               | Verdict | Confidence |
|-----|---------------------------------------|---------|------------|
| P1  | Self-contained runtime (no ext. Ralph)| verified | high |
| P2  | Iterative loop with limits            | verified | high |
| P3  | tasks.md as single source of truth    | verified | high |
| P4  | Symlink architecture for task sharing | verified | high |
| P5  | Fresh context per iteration (PRD snapshot + live task context)| verified | high |
| P6  | Iteration numbering aligned with tasks| partially-verified | medium |
| P7  | Structured git commit format          | verified | high |
| P8  | Auto-resume on restart                | verified | high |
| P9  | State and history persistence         | verified | high |
| P10 | Context injection (--add-context)     | verified | high |
| P11 | Status dashboard (--status)           | verified | high |
| P12 | Struggle indicators                   | verified | high |
| P13 | Auto-commit with --no-commit opt-out  | verified | high |
| P14 | OpenSpec artifact immutability        | partially-verified | medium |
| P15 | OpenSpec-native PRD generation        | verified | high |
| P16 | macOS and Linux compatibility         | verified | high |
| P17 | Prompt sources and templating         | verified | high |
| P18 | ralph-run as sole documented interface| verified | high |

---

## 4. Findings

### 4.1 Confirmed Alignments

*Populated during task 3.1 — principles that are strongly supported by
implementation and test evidence.*

<!-- BEGIN confirmed-alignments -->

The following sixteen principles carry a `verified` verdict with **high**
confidence.  Each is supported by Tier 1 (automated tests) and Tier 2
(implementation code) evidence, and no contradicting repository evidence was
found.

#### P1 — Self-contained runtime (no external Ralph dependency)

`scripts/ralph-run.sh:268-292` — `validate_dependencies()` requires only `node`,
`opencode`, and `jq`.  `lib/mini-ralph/index.js` is a fully self-contained
Node.js module; `lib/mini-ralph/invoker.js:39-43` invokes `opencode` (not an
external `ralph` binary).  Three separate test assertions in
`tests/unit/bash/test-validate-dependencies.bats` (lines 231, 240, 249)
explicitly confirm that `@th0rgal/ralph-wiggum`, `bun`, and `RALPH_CMD` are
absent from dependency output.  The integration test
`tests/integration/test-simple-workflow.bats:67` confirms self-containment
end-to-end.

#### P2 — Iterative loop execution with configurable completion and iteration limits

`lib/mini-ralph/runner.js:88-175` implements the core `while (iterationCount <
maxIterations)` loop with completion-promise exit (`runner.js:164-168`) and
max-iterations fallback (`runner.js:86`).  `scripts/ralph-run.sh:195-204`
exposes `--max-iterations` with a default of 50.  Unit tests in
`tests/unit/javascript/mini-ralph-runner.test.js` (lines 328–392) cover the
completion-promise exit, the max-iterations exit, and minimum-iterations
enforcement.  Integration tests in `tests/integration/test-max-iterations.bats`
(lines 74, 107) confirm flag propagation and default value.

#### P3 — tasks.md as the single source of truth for task state

`lib/mini-ralph/tasks.js:72-98` reads `tasks.md` from disk on every
`parseTasks()` call with no in-memory cache.  `lib/mini-ralph/runner.js:113-115`
and `runner.js:132-134` take fresh before/after snapshots from disk around each
invocation.  `scripts/ralph-run.sh:446-477` mirrors the same disk-read pattern
in bash.  The `parseTasks()` unit test suite in
`tests/unit/javascript/mini-ralph-tasks.test.js` (lines 100–182) and the bash
tests in `tests/unit/bash/test-parse-tasks.bats` both confirm live-file
derivation with no caching.

#### P4 — Symlink architecture for task file shared access

`lib/mini-ralph/tasks.js:39-55` — `syncLink()` creates an absolute-path symlink
via `fs.symlinkSync(absTasksFile, linkPath)`.  `scripts/ralph-run.sh:679-733` —
`sync_tasks_to_ralph()` uses `ln -sf` on both macOS and Linux.
`tests/unit/javascript/mini-ralph-tasks.test.js` — `syncLink()` suite (lines
50–99) confirms creation, replacement, and directory creation.
`tests/unit/bash/test-symlink-architecture.bats:123` — "both systems see same
file state simultaneously" confirms the shared-access invariant holds at
runtime.  `tests/integration/test-symlink-macos.bats` provides platform-specific
end-to-end coverage.

#### P5 — Fresh context per iteration (PRD snapshot + live task context)

`lib/mini-ralph/runner.js:95` calls `prompt.render(options, iterationCount)`
inside the loop on every iteration. `lib/mini-ralph/prompt.js:82-89` reads
`tasksFile` content fresh on every call and exposes the loop-start prompt body as
`{{base_prompt}}`; `lib/mini-ralph/tasks.js:152-180` — `taskContext()` always
reads live `tasks.md`. The bash side generates the PRD once at loop start in
`scripts/ralph-run.sh:968-979`, then reuses it for the rest of the run.
`tests/unit/javascript/mini-ralph-prompt.test.js:149` — "injects fresh
task_context when tasksFile is present" and
`tests/unit/bash/test-prd-task-context-injection.bats` confirm that each
iteration receives up-to-date task state with no stale context carry-over.

#### P7 — Structured git commit format with task numbers

`lib/mini-ralph/runner.js:302-315` — `_formatAutoCommitMessage()` produces the
exact documented format: `Ralph iteration ${iteration}: ${summary}\n\nTasks
completed:\n${taskLines}` with each task line formatted as `- [x]
${task.fullDescription || task.description}`.
`tests/unit/javascript/mini-ralph-runner.test.js` — `_formatAutoCommitMessage()`
suite (lines 232–276) covers single-task, multi-task, and empty-task cases.
`tests/unit/javascript/mini-ralph-runner-autocommit.test.js:65` confirms the
format is used in live commit calls.
`tests/unit/bash/test-create-prompt-template.bats:219` confirms the same format
is embedded in the AI prompt template to guide agent-generated commits.

#### P8 — Auto-resume on restart

`lib/mini-ralph/runner.js:50-51` reads existing state on startup; `runner.js:387-403`
— `_resolveStartIteration()` resumes at `priorIteration + 1` when the tasks
file matches, or treats a differing tasks file as a fresh run.
`scripts/ralph-run.sh:846-882` — `restore_ralph_state_from_tasks()` preserves
the existing state-file iteration on restart.
`tests/unit/javascript/mini-ralph-runner.test.js:573` — "sets resumedAt in
state when resuming from prior iteration" and
`tests/integration/test-interrupted-execution.bats:194` — "can be restarted
after interruption" confirm correct end-to-end resume behavior.

#### P9 — Loop state and history persistence in `.ralph/`

`lib/mini-ralph/state.js:33-36` — `init()` writes `ralph-loop.state.json`;
`state.js:61-64` — `update()` merges fields.  `lib/mini-ralph/history.js:56-61`
— `append()` pushes each iteration entry; `history.js:43-49` records `duration`,
`completionDetected`, `taskDetected`, `toolUsage`, `filesChanged`, and
`exitCode`.  `tests/unit/javascript/mini-ralph-state.test.js` (lines 34–155) and
`tests/unit/javascript/mini-ralph-history.test.js` (lines 69–175) provide
comprehensive coverage for all documented fields across init, update, and append
operations.

#### P10 — Context injection (`--add-context` / `--clear-context`)

`lib/mini-ralph/context.js` implements `add()` (appends to `ralph-context.md`),
`clear()` (deletes the file), and `consume()` (reads then clears in one shot).
`lib/mini-ralph/runner.js:99` calls `context.consume(ralphDir)` on every
iteration.  `scripts/ralph-run.sh:1106-1122` routes `--add-context` and
`--clear-context` correctly.  `tests/unit/javascript/mini-ralph-context.test.js:128`
— "context is not re-injected after consumption" confirms the one-shot injection
contract.  `tests/unit/javascript/mini-ralph-runner.test.js:488` — "consumes
context after first iteration" confirms runner-level behavior.

#### P11 — Status dashboard (`--status`)

`lib/mini-ralph/status.js:23-115` — `render()` outputs loop state (active /
inactive, iteration, started time), prompt summary, pending context, task
progress (via `tasks.countTasks()` and `tasks.currentTask()`), recent history
(last 5 entries), and struggle indicators.  `scripts/ralph-run.sh:1097-1104`
routes `--status` to `run_observability_command("status")`.
`tests/unit/javascript/mini-ralph-status.test.js` — `render()` suite (lines
136–300) independently tests each output section: header, active/inactive state,
iteration display, pending context, task progress, recent history, and struggle
indicators.

#### P12 — Struggle indicators (no-progress and repeated-error warnings)

`lib/mini-ralph/status.js:185-208` — `_detectStruggles()` flags no-progress
when `noProgressCount >= 2 && noProgressCount === recentHistory.length` and
repeated errors when `errorCount >= 2`.  `status.js:102-112` surfaces warnings
with a `--add-context` tip.  `tests/unit/javascript/mini-ralph-status.test.js`
— `_detectStruggles()` suite (lines 88–134) covers both positive-detection cases
(all-no-progress, multiple errors) and negative cases (single error, at least
one iteration with changes), confirming threshold accuracy.

#### P13 — Auto-commit with `--no-commit` opt-out

`lib/mini-ralph/runner.js:168-181` gates auto-commit on
`!options.noCommit && exitCode === 0 && filesChanged.length > 0 && (hasCompletion || (options.tasksMode && hasTask))`.
`runner.js:307-380` — `_autoCommit()` stages only the current iteration allowlist,
blocks protected OpenSpec artifacts, and records operator-visible anomalies when
staging or commit creation fails.
`scripts/mini-ralph-cli.js:97-99` and `scripts/ralph-run.sh:203-206` thread
`--no-commit` through both layers.
`tests/unit/javascript/mini-ralph-runner-autocommit.test.js` covers the commit
path (line 65), no-task skip (line 30), empty-staged-files skip (line 39), and
commit-failure handling (line 93).
`tests/unit/bash/test-execute-ralph-loop.bats:349,373` confirm `--no-commit` is
passed when the flag is set and absent when it is not.

#### P15 — OpenSpec-native loop preparation (PRD generation from artifacts)

`scripts/ralph-run.sh:371-444` reads `proposal.md`, `design.md`, and all
`specs/*/spec.md` files, assembles them into a structured PRD under a
`# Product Requirements Document` header, and writes it to `.ralph/PRD.md`.
`scripts/mini-ralph-cli.js:192-194` passes `--prompt-file PRD.md` to the
mini-ralph runner on every invocation.
`tests/unit/bash/test-generate-prd.bats` (lines 16–286) tests section presence,
proposal/design/spec content, and multi-spec handling.
`tests/integration/test-simple-workflow.bats:90` confirms PRD generation in a
real end-to-end run.

#### P16 — macOS and Linux cross-platform compatibility

`scripts/ralph-run.sh:6-98` implements OS detection (`detect_os()` via
`uname -s`), platform-specific `stat` calls (`get_file_mtime()`), `mktemp`
fallbacks, and `realpath` / `readlink -f` fallbacks.
`lib/mini-ralph/` uses only Node.js built-ins (`fs`, `path`, `crypto`) and is
platform-agnostic by construction.
`tests/unit/bash/test-detect-os.bats` and `tests/unit/bash/test-get-file-mtime.bats`
cover both platform branches and unknown-OS handling.
`tests/integration/test-symlink-macos.bats` and
`tests/integration/test-symlink-linux.bats` provide platform-specific
integration coverage.

#### P17 — Prompt sources and templating

`lib/mini-ralph/prompt.js:33-53` — `loadBase()` supports both inline
`promptText` and file-based `promptFile` loading. `prompt.js` now exposes that
underlying content explicitly as `{{base_prompt}}` when a prompt template is
used, so template-mode output includes the wrapped prompt body rather than
silently dropping it. `render()` also applies `promptTemplate` substitution for
`{{iteration}}`, `{{max_iterations}}`, `{{tasks}}`, `{{task_context}}`,
`{{task_promise}}`, `{{completion_promise}}`, and `{{context}}`.
`scripts/ralph-run.sh:735-843` — `create_prompt_template()` writes
`prompt-template.md` embedding all template variables, including an explicit
invocation-time PRD snapshot section.
`tests/unit/javascript/mini-ralph-prompt.test.js` — `_renderTemplate()` suite
(lines 30–69) and `render()` suite (lines 104–217) cover all variables.
`tests/unit/bash/test-create-prompt-template.bats` confirms each placeholder is
present in the generated template.

The freshness contract is intentionally narrower than a full per-iteration PRD
rebuild: `scripts/ralph-run.sh:968-979` writes `.ralph/PRD.md` before the loop
starts, while `lib/mini-ralph/prompt.js` and `lib/mini-ralph/tasks.js` refresh
task-derived context on each iteration. Documentation should therefore describe
`.ralph/PRD.md` as an invocation-time snapshot, not as a file regenerated on
every pass.

#### P18 — `ralph-run` as the sole documented end-user interface

`scripts/mini-ralph-cli.js:5-10` contains an explicit developer comment
identifying the file as internal; `mini-ralph-cli.js:130-153` echoes this in
help output with "This is an internal script. Use ralph-run as the documented
interface."  `scripts/ralph-run.sh:153-187` — `usage()` is the only
public-facing help surface.
`tests/unit/javascript/ralph-run-wrapper.test.js` (lines 46–73) confirms the
wrapper exists, is executable, and delegates correctly to the bash script.
`tests/unit/bash/test-validate-dependencies.bats:249` — "does not reference
RALPH_CMD in output" confirms no external Ralph interface is surfaced.

<!-- END confirmed-alignments -->

### 4.2 Mismatches and Stale Claims

*Populated during task 3.2 — principles where docs or specs outrun the
implementation, or where evidence is contradictory.*

<!-- BEGIN mismatches-and-stale-claims -->

Two principles received a `partially-verified` verdict because documented claims
outrun what the implementation or test suite can fully substantiate: **P6**
(iteration numbering) and **P14** (OpenSpec artifact immutability).  No principle
was assessed as `contradicted` or `unverified`.

---

#### P6 — Iteration numbering aligned with task progress (`partially-verified`)

**Documented claim (stale):**
Documentation and the methodology enumeration state that the iteration counter is
derived at runtime from the count of completed tasks (`iteration = completed_count + 1`),
ensuring that numbers always reflect actual progress and survive restarts without
drift.

**What the implementation actually does:**
The JS runner persists the last iteration number in `.ralph/ralph-loop.state.json`
and resumes from `priorIteration + 1` on restart (`lib/mini-ralph/runner.js:387-403`).
The bash wrapper (`scripts/ralph-run.sh:846-882` — `restore_ralph_state_from_tasks()`)
reads the iteration from the state file rather than recalculating from the
completed-task count; a comment at `ralph-run.sh:855-861` explicitly confirms
this: _"don't use completed task count"_.

As a result, the `iteration = completed_count + 1` invariant holds only on a
clean first run.  On any restart it is maintained by state-file continuity, not
by recounting tasks.  If the state file is deleted or becomes inconsistent with
`tasks.md`, the counter resets to 1 even if tasks are already marked complete.

**Affected files:**
- `openspec/changes/evaluate-ralph-wiggum-methodology/methodology-principles-enumeration.md`
  — P6 description should be updated to reflect state-file-based resumption rather
  than live task-count derivation.
- `scripts/ralph-run.sh:846-882` — `restore_ralph_state_from_tasks()` does not
  derive iteration from completed-task count.
- `lib/mini-ralph/runner.js:387-403` — `_resolveStartIteration()` resumes from
  `priorIteration + 1` (state file) not from a live task count.

**Gap / follow-up needed:**
Either (a) update the documented claim to match the state-file-persistence model
that is actually implemented, or (b) add a fallback in `_resolveStartIteration()`
that cross-checks the persisted iteration against the live completed-task count
and emits a warning when they diverge.  No test currently asserts that
`iteration === completedCount + 1` holds at any point in a run.

---

#### P14 — OpenSpec artifact immutability during loop execution (`partially-verified`)

**Documented claim (stale):**
`proposal.md`, `design.md`, and `specs/*/spec.md` are read-only during loop
execution; only `tasks.md` is modified.  The implication is that the runtime
actively enforces or validates this constraint.

**What the implementation actually does:**
Immutability is enforced solely by convention — no write paths to artifact files
exist in the traced code (`scripts/ralph-run.sh:371-401` reads only;
`lib/mini-ralph/runner.js` writes only to `tasks.md`, state, history, and context
files).  There are no `chmod`, file-lock, or explicit guard mechanisms preventing
a write, and no test asserts that writing to `proposal.md`, `design.md`, or a
spec file is rejected or even absent after a loop run.

**Affected files:**
- `scripts/ralph-run.sh:371-401` (`read_openspec_artifacts`) — reads only, no
  write guard.
- `lib/mini-ralph/runner.js:80-161` — write calls are limited to `tasks.syncLink`,
  `state.update`, `history.append`, `context.consume`, and `_autoCommit`; no
  explicit assertion that artifact paths are excluded.
- `tests/unit/bash/test-read-openspec-artifacts.bats` — tests confirm read access
  but include no negative assertion that artifact files remain unmodified after
  execution.
- `tests/unit/javascript/mini-ralph-runner.test.js` — auto-commit and file-change
  detection tests do not assert that artifact file paths are excluded from the
  staged changeset.

**Gap / follow-up needed:**
Either (a) acknowledge in documentation that immutability is by convention and
not enforced, or (b) add a post-execution assertion (or a `git diff --name-only`
check in `_autoCommit`) that warns when artifact files appear in the staged
changeset.  A dedicated negative test in `test-read-openspec-artifacts.bats` (or
a new `test-artifact-immutability.bats`) that verifies artifact files are
unmodified after a loop run would also raise confidence to `verified`.

<!-- END mismatches-and-stale-claims -->

---

## 5. Detailed Evidence Records

*One sub-section per principle.  Filled in during tasks 2.1–2.3.*

### P1 — Self-contained loop runtime (no external Ralph dependency)

**Full claim:** The package provides an internal mini Ralph loop engine that
executes without any external `ralph` CLI, `@th0rgal/ralph-wiggum` package, or
Bun runtime.

| Field | Value |
|-------|-------|
| Verdict | `verified` — Implementation fully avoids any external `ralph` binary or `@th0rgal/ralph-wiggum` dependency; `validate_dependencies()` only requires `node`, `opencode`, and `jq`; automated tests confirm absence of external references. Confidence: **high** (Tier 1 tests + Tier 2 implementation + Tier 3 specs all consistent). |
| Implementation evidence | `scripts/ralph-run.sh:100-105` — `resolve_ralph_command()` checks only for `node` + `$MINI_RALPH_CLI` (no external ralph binary); `scripts/ralph-run.sh:268-292` — `validate_dependencies()` requires only `node`, `opencode`, and `jq`; `lib/mini-ralph/index.js:1-91` — entire runtime is a self-contained Node.js module; `lib/mini-ralph/invoker.js:39-43` — invokes `opencode` (not an external `ralph` CLI) |
| Test evidence | `tests/unit/bash/test-validate-dependencies.bats` — `validate_dependencies: does not reference @th0rgal/ralph-wiggum in output` (line 231), `validate_dependencies: does not reference bun in output` (line 240), `validate_dependencies: does not reference RALPH_CMD in output` (line 249), `validate_dependencies: succeeds when all dependencies are present` (line 63); `tests/unit/javascript/mini-ralph-invoker.test.js` — `invoke uses "opencode run" with the prompt as the message` (line 63) confirms only `opencode` is invoked; `tests/integration/test-simple-workflow.bats` — `simple workflow: validates dependencies` (line 67) confirms runtime self-containment end-to-end |

---

### P2 — Iterative loop execution with configurable completion and iteration limits

**Full claim:** The loop repeatedly invokes OpenCode until a completion promise
is detected or the maximum iteration count is reached.

| Field | Value |
|-------|-------|
| Verdict | `verified` — Loop structure, max-iterations guard, and completion-promise detection are all implemented in `runner.js` and independently tested by unit and integration tests. Confidence: **high**. |
| Implementation evidence | `lib/mini-ralph/runner.js:88-175` — `while (iterationCount < maxIterations)` loop; `runner.js:130-131` — `_containsPromise()` detects `<promise>COMPLETE</promise>` in output; `runner.js:164-168` — breaks on completion with `exitReason = 'completion_promise'`; `runner.js:86` — `exitReason = 'max_iterations'` default; `scripts/mini-ralph-cli.js:89-90` — `--max-iterations` flag parsed and forwarded; `scripts/ralph-run.sh:195-204` — `--max-iterations` flag accepted, default 50 |
| Test evidence | `tests/unit/javascript/mini-ralph-runner.test.js` — `runs until max iterations when no completion promise is emitted` (line 328), `exits early when completion promise is detected` (line 346), `respects minIterations — does not complete before min` (line 368); `_containsPromise()` suite (lines 43–81) verifies promise detection logic; `tests/unit/bash/test-execute-ralph-loop.bats` — `execute_ralph_loop: passes --max-iterations to the CLI` (line 275); `tests/integration/test-max-iterations.bats` — `max-iterations: default value is 50` (line 107), `max-iterations: flag value passed to Ralph CLI` (line 74) |

---

### P3 — tasks.md as the single source of truth for task state

**Full claim:** `tasks.md` is the only file that tracks task state via `[ ]`,
`[/]`, and `[x]` checkboxes.  No duplicate or separate in-memory task tracking
is maintained.

| Field | Value |
|-------|-------|
| Verdict | `verified` — `parseTasks()` and `currentTask()` both read from disk on every call with no in-memory cache; bash `parse_tasks()` mirrors this pattern. Confirmed by unit tests for both JS and bash layers. Confidence: **high**. |
| Implementation evidence | `lib/mini-ralph/tasks.js:72-98` — `parseTasks()` reads `tasks.md` directly on every call (no in-memory cache); `lib/mini-ralph/runner.js:113-115` — `tasksBefore` snapshot read fresh from disk; `runner.js:132-134` — `tasksAfter` read fresh from disk after each invocation; `scripts/ralph-run.sh:446-477` — `parse_tasks()` reads `tasks.md` via file I/O each time; `lib/mini-ralph/tasks.js:106-113` — `currentTask()` derives state from file on each call |
| Test evidence | `tests/unit/javascript/mini-ralph-tasks.test.js` — `parseTasks()` suite (lines 100–182) tests file-based reads with no caching: `parses incomplete tasks` (line 105), `parses in-progress tasks` (line 115), `parses completed tasks` (line 123), `handles mixed task statuses` (line 131); `currentTask()` suite (lines 184–218) tests live-file derivation; `tests/unit/bash/test-parse-tasks.bats` — `parse_tasks: parses incomplete tasks [ ] correctly` (line 17), `parse_tasks: handles non-existent tasks file gracefully` (line 241), `parse_tasks: handles mixed checkbox states` (line 76) |

---

### P4 — Symlink architecture for task file shared access

**Full claim:** `.ralph/ralph-tasks.md` is a symlink pointing to the change's
`tasks.md`, so both the loop engine and the execution skill operate on the exact
same file.

| Field | Value |
|-------|-------|
| Verdict | `verified` — `syncLink()` (JS) and `sync_tasks_to_ralph()` (bash) both create an absolute-path symlink; tests confirm symlink creation, replacement, and simultaneous visibility from both layers. Confidence: **high**. |
| Implementation evidence | `lib/mini-ralph/tasks.js:39-55` — `syncLink()` creates absolute-path symlink via `fs.symlinkSync(absTasksFile, linkPath)`; `lib/mini-ralph/runner.js:80-82` — calls `tasks.syncLink(ralphDir, options.tasksFile)` when in tasks mode; `scripts/ralph-run.sh:679-733` — `sync_tasks_to_ralph()` establishes symlink using `ln -sf` on both macOS and Linux; `ralph-run.sh:991` — `sync_tasks_to_ralph` called from `execute_ralph_loop()` before each run |
| Test evidence | `tests/unit/javascript/mini-ralph-tasks.test.js` — `syncLink()` suite (lines 50–99): `creates ralphDir if it does not exist` (line 51), `creates a symlink at .ralph/ralph-tasks.md pointing to the tasks file` (line 60), `replaces an existing symlink` (line 73); `tests/unit/bash/test-symlink-architecture.bats` — `symlink architecture: .ralph/ralph-tasks.md exists as symlink after initialization` (line 17), `symlink architecture: both systems see same file state simultaneously` (line 123), `symlink architecture: task state changes propagate immediately` (line 319); `tests/unit/bash/test-sync-tasks-to-ralph.bats` — `sync_tasks_to_ralph: creates symlink when no file exists` (line 15), `sync_tasks_to_ralph: updates existing symlink if pointing to wrong location` (line 76); `tests/integration/test-symlink-macos.bats` — macOS symlink creation and update tests (lines 64–242) |

---

### P5 — Fresh context per iteration via PRD snapshot + live task context

**Full claim:** The loop re-renders prompt context every iteration from a
loop-start PRD snapshot plus live `tasks.md`, current-task context, recent loop
signals, and pending injected context.

| Field | Value |
|-------|-------|
| Verdict | `verified` — `prompt.render()` is called inside the runner loop on every iteration and reads live `tasks.md` content each time, while `PRD.md` is generated once at loop start and then reused. Confirmed by unit tests for prompt rendering and PRD generation. Confidence: **high**. |
| Implementation evidence | `scripts/ralph-run.sh:404-444` — `generate_prd()` reads proposal, specs, and design and writes `$ralph_dir/PRD.md`; `ralph-run.sh:968-979` — PRD is generated before the loop starts; `lib/mini-ralph/prompt.js:83-107` — `render()` reads `tasksFile` content and `taskContext` fresh on every iteration call, exposes `{{base_prompt}}`, and injects commit-contract text; `lib/mini-ralph/tasks.js:152-180` — `taskContext()` always reads live `tasks.md`; `lib/mini-ralph/runner.js:95` — `prompt.render(options, iterationCount)` called inside the while loop |
| Test evidence | `tests/unit/javascript/mini-ralph-prompt.test.js` — `render()` suite (lines 104–217): `renders template with iteration variables` (line 110), `injects tasks content when tasksFile is present` (line 131), `injects fresh task_context when tasksFile is present` (line 149); `tests/unit/bash/test-generate-prd.bats` — `generate_prd: generates PRD with all required sections` (line 16), `generate_prd: includes current task context when available` (line 162), `generate_prd: includes completed tasks in context` (line 377); `tests/unit/bash/test-prd-task-context-injection.bats` — validates task context is injected per-call |

---

### P6 — Iteration numbering aligned with task progress

**Full claim:** The loop iteration counter is derived from the count of
completed tasks (`iteration = completed_count + 1`), so iteration numbers always
reflect actual progress and survive restarts.

| Field | Value |
|-------|-------|
| Verdict | `partially-verified` — The JS runner resumes from `priorIteration + 1` using a persisted state file (not a live completed-task count), and the bash wrapper explicitly avoids recalculating from task counts. The claimed invariant (`iteration = completed_count + 1`) is therefore only a soft property: it holds on a clean first run but is maintained by persisted state on resume rather than by deriving the count at runtime. Tests confirm resume correctness but not strict alignment between completed count and iteration number. Confidence: **medium**. |
| Implementation evidence | `lib/mini-ralph/runner.js:387-403` — `_resolveStartIteration()` resumes from `priorIteration + 1` when a prior state file exists; `runner.js:50-58` — reads existing state and passes to `_resolveStartIteration`; `scripts/ralph-run.sh:846-882` — `restore_ralph_state_from_tasks()` reads current iteration from state JSON (does NOT recalculate from completed-task count); `ralph-run.sh:855-861` — comment explicitly says "don't use completed task count" |
| Test evidence | `tests/unit/javascript/mini-ralph-runner.test.js` — `_resolveStartIteration()` suite (lines 152–198): `returns 1 when existingState is null` (line 153), `returns priorIteration + 1 for a basic resume` (line 165), `resumes correctly in tasks mode when tasksFile matches` (line 169), `returns 1 when in tasks mode but tasksFile differs` (line 175); `tests/unit/bash/test-restore-ralph-state-from-tasks.bats` — `restore_ralph_state_from_tasks: preserves iteration when state file has iteration > 0` (line 111), `restore_ralph_state_from_tasks: sets initial iteration to 1 when state file has iteration 0` (line 72) |

---

### P7 — Structured git commit format with task numbers

**Full claim:** Every commit follows the `Ralph iteration <N>: <summary>\n\nTasks
completed:\n- [x] <task.number> <description>` format.

| Field | Value |
|-------|-------|
| Verdict | `verified` — `_formatAutoCommitMessage()` produces the exact documented format; unit and integration tests exercise single-task, multi-task, and no-task cases. Prompt template also encodes the format for the AI agent. Confidence: **high**. |
| Implementation evidence | `lib/mini-ralph/runner.js:302-315` — `_formatAutoCommitMessage()` produces `Ralph iteration ${iteration}: ${summary}\n\nTasks completed:\n${taskLines}`; `runner.js:310-312` — each task line formatted as `- [x] ${task.fullDescription \|\| task.description}`; `runner.js:149-161` — auto-commit only fires when `hasCompletion \|\| hasTask` is true, `filesChanged.length > 0`, and `exitCode === 0`; `scripts/ralph-run.sh:799-833` — prompt template instructs the AI agent on the same commit format |
| Test evidence | `tests/unit/javascript/mini-ralph-runner.test.js` — `_formatAutoCommitMessage()` suite (lines 232–276): `formats a single-task Ralph commit message` (line 233), `formats a multi-task Ralph commit message` (line 248), `returns empty string when there are no completed tasks` (line 269); `tests/unit/javascript/mini-ralph-runner-autocommit.test.js` — `commits with a Ralph-formatted message when tasks were completed` (line 65); `tests/unit/bash/test-create-prompt-template.bats` — `create_prompt_template: includes git commit format section` (line 219) confirms the commit format is embedded in the prompt |

---

### P8 — Auto-resume on restart

**Full claim:** When `ralph-run` is restarted after an interruption it picks up
from the correct task, recalculating state from `tasks.md`, without losing
progress or duplicating completed tasks.

| Field | Value |
|-------|-------|
| Verdict | `verified` — State file is read on startup; `_resolveStartIteration()` handles same-project resume and cross-project reset; integration test `can be restarted after interruption` confirms end-to-end correctness. Confidence: **high**. |
| Implementation evidence | `lib/mini-ralph/runner.js:50-51` — `state.read(ralphDir)` retrieves existing state on startup; `runner.js:387-403` — `_resolveStartIteration()`: if prior state exists and `tasksFile` matches, resumes at `priorIteration + 1`; `runner.js:394-399` — if tasks file differs, treats as fresh run; `scripts/ralph-run.sh:846-882` — `restore_ralph_state_from_tasks()` preserves existing state-file iteration on restart |
| Test evidence | `tests/unit/javascript/mini-ralph-runner.test.js` — `sets resumedAt in state when resuming from prior iteration` (line 573), `logs a resume message in verbose mode` (line 596), `_resolveStartIteration()` resume tests (lines 165–198); `tests/unit/bash/test-restore-ralph-state-from-tasks.bats` — `restore_ralph_state_from_tasks: preserves existing state when iteration is already set` (line 368), `restore_ralph_state_from_tasks: reads maxIterations from state file` (line 219); `tests/integration/test-interrupted-execution.bats` — `interrupted execution: can be restarted after interruption` (line 194) |

---

### P9 — Loop state and history persistence in `.ralph/`

**Full claim:** The loop engine writes `ralph-loop.state.json` and appends
iteration history to `.ralph/` so users can inspect state, duration, tool usage,
and completion across runs.

| Field | Value |
|-------|-------|
| Verdict | `verified` — `state.js` and `history.js` both write to `.ralph/`; each iteration entry includes all documented fields. Confirmed by comprehensive unit test suites for both modules. Confidence: **high**. |
| Implementation evidence | `lib/mini-ralph/state.js:33-36` — `init()` writes `ralph-loop.state.json`; `state.js:61-64` — `update()` merges fields into state file; `lib/mini-ralph/history.js:56-61` — `append()` pushes iteration entry to `ralph-history.json`; `history.js:43-49` — each entry includes `duration`, `completionDetected`, `taskDetected`, `toolUsage`, `filesChanged`, `exitCode`; `lib/mini-ralph/runner.js:138-147` — `history.append()` called after every iteration; `runner.js:91-92` — `state.update()` called at start of each iteration |
| Test evidence | `tests/unit/javascript/mini-ralph-state.test.js` — `state.init()` suite (lines 34–62): `writes a JSON state file` (line 42), `overwrites existing state file on re-init` (line 53); `state.update()` suite (lines 88–114); `state fields include required loop metadata` (lines 131–155); `tests/unit/javascript/mini-ralph-history.test.js` — `history.append()` suite (lines 69–135): `appends multiple entries in order` (line 94), `stores all required iteration fields` (line 115); `history.recent()` suite (lines 136–175) |

---

### P10 — Context injection (`--add-context` / `--clear-context`)

**Full claim:** Users can inject guidance text that is included in the next
iteration and can clear it afterward; context is persisted in
`.ralph/ralph-context.md`.

| Field | Value |
|-------|-------|
| Verdict | `verified` — `context.add()`, `clear()`, and `consume()` are all implemented and tested; runner calls `consume()` every iteration; bash wrapper routes `--add-context`/`--clear-context` correctly. Confidence: **high**. |
| Implementation evidence | `lib/mini-ralph/context.js:14` — `CONTEXT_FILE = 'ralph-context.md'`; `context.js:44-51` — `add()` appends text to `ralph-context.md`; `context.js:58-63` — `clear()` deletes the file; `context.js:72-77` — `consume()` reads then clears (one-shot injection); `lib/mini-ralph/runner.js:99` — `context.consume(ralphDir)` called each iteration; `scripts/mini-ralph-cli.js:109-113` — `--add-context` and `--clear-context` flags parsed; `scripts/ralph-run.sh:1106-1122` — `--add-context` / `--clear-context` routed to `run_observability_command()` |
| Test evidence | `tests/unit/javascript/mini-ralph-context.test.js` — `context.add()` suite (lines 48–94): `creates context file with the provided text` (line 56), `appends to existing context with separator` (line 63); `context.clear()` suite (lines 95–110); `context.consume()` suite (lines 111–137): `returns context text and clears the file` (line 112), `context is not re-injected after consumption` (line 128); `tests/unit/javascript/mini-ralph-runner.test.js` — `injects pending context into prompt` (line 468), `consumes context after first iteration (not re-injected)` (line 488); `tests/unit/bash/test-handle-context-injection.bats` — `handle_context_injection: removes injection file after reading` (line 68) |

---

### P11 — Status dashboard (`--status`)

**Full claim:** `ralph-run --status` displays the active loop state, current
task, prompt summary, pending context, recent iteration history, and struggle
indicators.

| Field | Value |
|-------|-------|
| Verdict | `verified` — `status.js render()` surfaces all documented fields (loop state, iteration, pending context, task progress, history, struggle indicators). Unit test suite covers each output section independently. Confidence: **high**. |
| Implementation evidence | `lib/mini-ralph/status.js:23-115` — `render()` outputs: loop state (active/inactive, iteration, started time); prompt summary; pending context; task progress (via `tasks.countTasks()` and `tasks.currentTask()`); recent history (last 5 entries); struggle indicators; `scripts/ralph-run.sh:1097-1104` — `--status` routes to `run_observability_command("status")`; `scripts/mini-ralph-cli.js:171-175` — `--status` calls `miniRalph.getStatus()` |
| Test evidence | `tests/unit/javascript/mini-ralph-status.test.js` — `render()` suite (lines 136–300): `includes the header section` (line 144), `shows ACTIVE when loop is running` (line 158), `shows INACTIVE when loop is done` (line 169), `shows iteration and maxIterations` (line 182), `includes pending context in output` (line 205), `shows recent history when entries exist` (line 229), `shows task progress when tasksFile is provided and readable` (line 262), `shows struggle indicators when all iterations have no file changes` (line 281) |

---

### P12 — Struggle indicators (no-progress and repeated-error warnings)

**Full claim:** When the loop appears stuck, the status output surfaces
no-progress and repeated-error warnings to guide user intervention.

| Field | Value |
|-------|-------|
| Verdict | `verified` — `_detectStruggles()` implements both no-progress and repeated-error detection with clear thresholds; tests confirm positive and negative cases for both indicators. Confidence: **high**. |
| Implementation evidence | `lib/mini-ralph/status.js:185-208` — `_detectStruggles()`: no-progress warning when `noProgressCount >= 2 && noProgressCount === recentHistory.length`; repeated-error warning when `errorCount >= 2`; `status.js:102-112` — struggles surfaced in `render()` output with `--- Struggle Indicators ---` header and `--add-context` tip; `lib/mini-ralph/runner.js:96` — `_buildIterationFeedback()` (separate from status) surfaces recent problem signals into the next iteration prompt |
| Test evidence | `tests/unit/javascript/mini-ralph-status.test.js` — `_detectStruggles()` suite (lines 88–134): `detects no-progress when all recent iterations have no file changes` (line 94), `does not flag no-progress if at least one iteration had changes` (line 104), `detects repeated errors when 2 or more non-zero exit codes` (line 113), `does not flag errors for a single non-zero exit code` (line 122); `render()` test `shows struggle indicators when all iterations have no file changes` (line 281) |

---

### P13 — Automatic commit behavior with opt-out (`--no-commit`)

**Full claim:** The loop creates git commits automatically after each task
unless `--no-commit` is passed.

| Field | Value |
|-------|-------|
| Verdict | `verified` — Auto-commit is gated on `!options.noCommit`, success exit code, staged files, and detected task/completion; `--no-commit` passes through both bash and JS layers, and the prompt contract explicitly forbids model-authored commits in that mode. Auto-commit stages only current-iteration files plus the matching `tasks.md` update and surfaces anomalies when commit creation fails. Confidence: **high**. |
| Implementation evidence | `lib/mini-ralph/runner.js:168-181` — auto-commit conditional: `!options.noCommit && exitCode === 0 && filesChanged.length > 0 && (hasCompletion \|\| (options.tasksMode && hasTask))`; `runner.js:391-408` — `_buildAutoCommitAllowlist()` stages only iteration-attributed files plus the matching task-state update; `runner.js:325-379` — `_autoCommit()` blocks protected OpenSpec artifacts, reports `nothing_staged` / `commit_failed` anomalies, and creates commits with `git add -- <allowlist>` followed by `git commit -m <message>`; `lib/mini-ralph/prompt.js:101-106` — prompt contract forbids git commits entirely when `noCommit` is active; `scripts/mini-ralph-cli.js:97-99` — `--no-commit` flag parsed and forwarded via `noCommit: true`; `scripts/ralph-run.sh:203-206` — `--no-commit` sets `NO_COMMIT=true` and passed to `execute_ralph_loop()` |
| Test evidence | `tests/unit/javascript/mini-ralph-runner-autocommit.test.js` — `commits with a Ralph-formatted message when tasks were completed` (line 65), `skips when no completed tasks were detected` (line 30), `skips when nothing is staged after git add` (line 39), `logs and swallows commit failures` (line 93); `tests/unit/javascript/mini-ralph-runner.test.js` — `_completedTaskDelta()` suite (lines 200–231); `tests/unit/bash/test-execute-ralph-loop.bats` — `execute_ralph_loop: passes --no-commit when no_commit=true` (line 349), `execute_ralph_loop: does NOT pass --no-commit by default` (line 373) |

---

### P14 — OpenSpec artifact immutability during loop execution

**Full claim:** `proposal.md`, `design.md`, and `specs/*/spec.md` are read-only
during loop execution; only `tasks.md` is modified by the loop.

| Field | Value |
|-------|-------|
| Verdict | `partially-verified` — Implementation evidence shows no write paths to `proposal.md`, `design.md`, or spec files; tests confirm read-only access patterns. However, immutability is enforced by convention (no writes in the code paths traced) rather than by file-system permissions or explicit guards, and no negative test asserts that writing is rejected. Confidence: **medium**. |
| Implementation evidence | `scripts/ralph-run.sh:371-401` — `read_openspec_artifacts()` reads proposal, specs, and design into variables (no writes); `ralph-run.sh:294-320` — `validate_openspec_artifacts()` checks for presence but does not write; `lib/mini-ralph/runner.js:80-82` — only `tasks.syncLink()` and `state`/`history`/`context` writes occur — no writes to proposal/design/specs; `lib/mini-ralph/prompt.js:82-87` — reads `tasksFile` and artifact files but never writes them |
| Test evidence | `tests/unit/bash/test-read-openspec-artifacts.bats` — `read_openspec_artifacts: reads proposal.md content correctly` (line 16), `read_openspec_artifacts: reads design.md content correctly` (line 53), `read_openspec_artifacts: reads single spec.md file correctly` (line 89) — all tests confirm read-only access with no writes; `tests/unit/bash/test-validate-openspec-artifacts.bats` — `validate_openspec_artifacts: succeeds with all required artifacts` (line 16) confirms presence checks only; no test writes to proposal/design/spec files |

---

### P15 — OpenSpec-native loop preparation (PRD generation from artifacts)

**Full claim:** `ralph-run` reads `proposal.md`, `design.md`, and all
`specs/*/spec.md` files and generates a PRD (`.ralph/PRD.md`) that serves as
the context input for every iteration.

| Field | Value |
|-------|-------|
| Verdict | `verified` — `ralph-run.sh` reads all three artifact types, generates a structured PRD, and writes it to `.ralph/PRD.md`; mini-ralph CLI receives it via `--prompt-file`. Full pipeline confirmed by unit and integration tests. Confidence: **high**. |
| Implementation evidence | `scripts/ralph-run.sh:371-401` — `read_openspec_artifacts()` reads `proposal.md`, `design.md`, and all `specs/*/spec.md` via `find … -name "spec.md"`; `ralph-run.sh:404-432` — `generate_prd()` assembles content into `# Product Requirements Document` with Proposal/Specifications/Design sections; `ralph-run.sh:435-444` — `write_prd()` writes to `$ralph_dir/PRD.md`; `ralph-run.sh:994-997` — `generate_prd` + `write_prd` called before loop; `scripts/mini-ralph-cli.js:192-194` — `--prompt-file` passed as `PRD.md` path to mini-ralph runner |
| Test evidence | `tests/unit/bash/test-generate-prd.bats` — `generate_prd: generates PRD with all required sections` (line 16), `generate_prd: includes proposal content in PRD` (line 42), `generate_prd: includes specifications content in PRD` (line 76), `generate_prd: includes design content in PRD` (line 108), `generate_prd: includes multiple specifications` (line 286); `tests/unit/bash/test-execute-ralph-loop.bats` — `execute_ralph_loop: creates PRD.md in ralph_dir` (line 155), `execute_ralph_loop: passes --prompt-file to the CLI` (line 226); `tests/integration/test-simple-workflow.bats` — `simple workflow: with complete fixture generates PRD` (line 90) |

---

### P16 — macOS and Linux cross-platform compatibility

**Full claim:** The loop runtime and wrapper support both macOS and Linux for
state files, history, task sync, temp paths, and cleanup.

| Field | Value |
|-------|-------|
| Verdict | `verified` — OS detection, platform-specific `stat`, `mktemp`, and `realpath` fallbacks are all implemented; macOS and Linux integration test suites exercise symlink behavior on each platform. The JS layer uses only Node.js built-ins and is platform-agnostic. Confidence: **high**. |
| Implementation evidence | `scripts/ralph-run.sh:6-12` — `detect_os()` distinguishes `Linux` and `macOS` via `uname -s`; `ralph-run.sh:17-24` — `get_file_mtime()` uses `stat -f %m` (macOS) vs `stat -c %Y` (Linux); `ralph-run.sh:69-98` — `get_temp_root()` and `make_temp_dir()` use `TMPDIR` with fallback to `/tmp`, `mktemp -d` with macOS `-t` fallback; `ralph-run.sh:39-55` — `get_realpath()` uses `realpath` with `readlink -f` fallback; `lib/mini-ralph/` — pure Node.js `fs`/`path`/`crypto` (platform-agnostic by design) |
| Test evidence | `tests/unit/bash/test-detect-os.bats` — `detect_os: detects Linux OS` (line 16), `detect_os: detects macOS OS` (line 29), `detect_os: handles unknown OS` (line 42); `tests/unit/bash/test-get-file-mtime.bats` — `get_file_mtime: returns Unix timestamp on Linux` (line 16), `get_file_mtime: returns Unix timestamp on macOS` (line 44), `get_file_mtime: returns 0 for non-existent file on Linux` (line 67), `get_file_mtime: returns 0 for non-existent file on macOS` (line 79); `tests/integration/test-symlink-macos.bats` — full macOS-specific symlink test suite; `tests/integration/test-symlink-linux.bats` — Linux-specific symlink test suite |

---

### P17 — Prompt sources and templating (prompt file + template rendering)

**Full claim:** The loop runtime supports prompt-file input and prompt-template
rendering that injects iteration-specific values before invoking OpenCode.

| Field | Value |
|-------|-------|
| Verdict | `verified` — `prompt.js` supports both inline text and file-based prompt loading, and applies full template variable substitution on every iteration. `ralph-run.sh` creates a dedicated `prompt-template.md` and passes both files to the CLI. Confirmed by unit tests for all template variables and bash tests for template construction. Confidence: **high**. |
| Implementation evidence | `lib/mini-ralph/prompt.js:33-53` — `loadBase()` supports both `promptText` (inline) and `promptFile` (file read); `prompt.js:64-101` — `render()` applies `promptTemplate` when present, replacing `{{iteration}}`, `{{max_iterations}}`, `{{tasks}}`, `{{task_context}}`, `{{task_promise}}`, `{{completion_promise}}`, `{{context}}`; `prompt.js:110-113` — `_renderTemplate()` does `{{key}}` replacement; `scripts/ralph-run.sh:735-843` — `create_prompt_template()` writes `prompt-template.md` with all template variables; `ralph-run.sh:1007-1013` — `--prompt-file PRD.md --prompt-template prompt-template.md` passed to mini-ralph |
| Test evidence | `tests/unit/javascript/mini-ralph-prompt.test.js` — `_renderTemplate()` suite (lines 30–69): `replaces a single variable` (line 31), `replaces multiple variables` (line 35), `replaces repeated occurrences of the same variable` (line 40), `handles empty string as variable value` (line 56); `render()` suite — `renders template with iteration variables` (line 110), `injects tasks content when tasksFile is present` (line 131), `includes task_promise and completion_promise in template` (line 185); `tests/unit/bash/test-create-prompt-template.bats` — `create_prompt_template: includes Ralph iteration placeholders` (line 57), `create_prompt_template: includes task list placeholder` (line 78), `create_prompt_template: includes context placeholder` (line 98), `create_prompt_template: includes promise placeholders` (line 138); `tests/unit/bash/test-execute-ralph-loop.bats` — `execute_ralph_loop: passes --prompt-template to the CLI` (line 251) |

---

### P18 — `ralph-run` as the sole documented end-user interface

**Full claim:** All supported loop operations are exposed through `ralph-run`;
no separate end-user CLI is introduced.

| Field | Value |
|-------|-------|
| Verdict | `verified` — `mini-ralph-cli.js` explicitly self-identifies as an internal script in both code comments and help text; `ralph-run.sh`'s `usage()` is the only public-facing documentation. Tests confirm the wrapper exists, is executable, and delegates to the bash script. Confidence: **high**. |
| Implementation evidence | `scripts/mini-ralph-cli.js:5-10` — explicit comment: "This script is invoked by scripts/ralph-run.sh … It is NOT a documented end-user interface. Users should use ralph-run."; `mini-ralph-cli.js:130-153` — help text states "This is an internal script. Use ralph-run as the documented interface."; `scripts/ralph-run.sh:153-187` — `usage()` is the only public-facing help; all flags (`--status`, `--add-context`, `--clear-context`, `--no-commit`, `--max-iterations`) exposed through `ralph-run` |
| Test evidence | `tests/unit/javascript/ralph-run-wrapper.test.js` — `wrapper file exists` (line 46), `wrapper is executable` (line 50), `wrapper invokes bash script` (line 64), `wrapper passes command line arguments to bash script` (line 73); `tests/unit/javascript/mini-ralph-invoker.test.js` — `invoke uses "opencode run"` test confirms `mini-ralph-cli.js` is internal only; `tests/unit/bash/test-validate-dependencies.bats` — `validate_dependencies: does not reference RALPH_CMD in output` (line 249) confirms no external ralph interface |

---

## 6. Follow-up Recommendations

*Populated during task 3.2 and reviewed in task 3.3.*

<!-- BEGIN follow-up-recommendations -->

The two `partially-verified` principles each surface a concrete action item:

**REC-1 (P6 — iteration numbering):** Update `methodology-principles-enumeration.md`
to document that iteration numbering is maintained via state-file persistence
(`ralph-loop.state.json`) rather than live task-count derivation.  Optionally, add
a cross-check in `lib/mini-ralph/runner.js:_resolveStartIteration()` that warns
when the persisted iteration and the live completed-task count diverge.

**REC-2 (P14 — artifact immutability):** Document that immutability of
`proposal.md`, `design.md`, and `specs/*/spec.md` is enforced by convention.
To raise confidence to `verified`, add either (a) a post-run negative assertion
in `tests/unit/bash/test-read-openspec-artifacts.bats` confirming artifact files
are unmodified, or (b) a guard in `_autoCommit` (or `execute_ralph_loop`) that
emits a warning when an artifact file appears in the staged changeset.

<!-- END follow-up-recommendations -->

---

## 7. Assessment Notes

- Evidence collection performed via static analysis of the repository at the
  commit active during the `evaluate-ralph-wiggum-methodology` change.
- Live execution of `ralph-run` and `mini-ralph-cli.js` is not included in this
  static assessment; any behavior that requires runtime execution is marked at
  most `partially-verified`.
- This report should be re-evaluated after substantial changes to the loop
  engine, PRD generation logic, or test suite.
