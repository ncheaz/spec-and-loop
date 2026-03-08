# Ralph Wiggum Methodology Assessment

**Repository:** `spec-and-loop`
**Change:** `evaluate-ralph-wiggum-methodology`
**Assessment date:** 2026-03-08
**Status:** In progress — implementation and test evidence collected (tasks 2.1–2.2 complete); verdicts pending (task 2.3)

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

*Verdicts are filled in during tasks 2.1–2.3.  Placeholders are shown as `—`.*

| ID  | Principle (short label)               | Verdict | Confidence |
|-----|---------------------------------------|---------|------------|
| P1  | Self-contained runtime (no ext. Ralph)| —       | —          |
| P2  | Iterative loop with limits            | —       | —          |
| P3  | tasks.md as single source of truth    | —       | —          |
| P4  | Symlink architecture for task sharing | —       | —          |
| P5  | Fresh context per iteration (PRD regen)| —      | —          |
| P6  | Iteration numbering aligned with tasks| —       | —          |
| P7  | Structured git commit format          | —       | —          |
| P8  | Auto-resume on restart                | —       | —          |
| P9  | State and history persistence         | —       | —          |
| P10 | Context injection (--add-context)     | —       | —          |
| P11 | Status dashboard (--status)           | —       | —          |
| P12 | Struggle indicators                   | —       | —          |
| P13 | Auto-commit with --no-commit opt-out  | —       | —          |
| P14 | OpenSpec artifact immutability        | —       | —          |
| P15 | OpenSpec-native PRD generation        | —       | —          |
| P16 | macOS and Linux compatibility         | —       | —          |
| P17 | Prompt sources and templating         | —       | —          |
| P18 | ralph-run as sole documented interface| —       | —          |

---

## 4. Findings

### 4.1 Confirmed Alignments

*Populated during task 3.1 — principles that are strongly supported by
implementation and test evidence.*

<!-- BEGIN confirmed-alignments -->
<!-- END confirmed-alignments -->

### 4.2 Mismatches and Stale Claims

*Populated during task 3.2 — principles where docs or specs outrun the
implementation, or where evidence is contradictory.*

<!-- BEGIN mismatches-and-stale-claims -->
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
| Verdict | — |
| Implementation evidence | `scripts/ralph-run.sh:100-105` — `resolve_ralph_command()` checks only for `node` + `$MINI_RALPH_CLI` (no external ralph binary); `scripts/ralph-run.sh:268-292` — `validate_dependencies()` requires only `node`, `opencode`, and `jq`; `lib/mini-ralph/index.js:1-91` — entire runtime is a self-contained Node.js module; `lib/mini-ralph/invoker.js:39-43` — invokes `opencode` (not an external `ralph` CLI) |
| Test evidence | `tests/unit/bash/test-validate-dependencies.bats` — `validate_dependencies: does not reference @th0rgal/ralph-wiggum in output` (line 231), `validate_dependencies: does not reference bun in output` (line 240), `validate_dependencies: does not reference RALPH_CMD in output` (line 249), `validate_dependencies: succeeds when all dependencies are present` (line 63); `tests/unit/javascript/mini-ralph-invoker.test.js` — `invoke uses "opencode run" with the prompt as the message` (line 63) confirms only `opencode` is invoked; `tests/integration/test-simple-workflow.bats` — `simple workflow: validates dependencies` (line 67) confirms runtime self-containment end-to-end |

---

### P2 — Iterative loop execution with configurable completion and iteration limits

**Full claim:** The loop repeatedly invokes OpenCode until a completion promise
is detected or the maximum iteration count is reached.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/runner.js:88-175` — `while (iterationCount < maxIterations)` loop; `runner.js:130-131` — `_containsPromise()` detects `<promise>COMPLETE</promise>` in output; `runner.js:164-168` — breaks on completion with `exitReason = 'completion_promise'`; `runner.js:86` — `exitReason = 'max_iterations'` default; `scripts/mini-ralph-cli.js:89-90` — `--max-iterations` flag parsed and forwarded; `scripts/ralph-run.sh:195-204` — `--max-iterations` flag accepted, default 50 |
| Test evidence | `tests/unit/javascript/mini-ralph-runner.test.js` — `runs until max iterations when no completion promise is emitted` (line 328), `exits early when completion promise is detected` (line 346), `respects minIterations — does not complete before min` (line 368); `_containsPromise()` suite (lines 43–81) verifies promise detection logic; `tests/unit/bash/test-execute-ralph-loop.bats` — `execute_ralph_loop: passes --max-iterations to the CLI` (line 275); `tests/integration/test-max-iterations.bats` — `max-iterations: default value is 50` (line 107), `max-iterations: flag value passed to Ralph CLI` (line 74) |

---

### P3 — tasks.md as the single source of truth for task state

**Full claim:** `tasks.md` is the only file that tracks task state via `[ ]`,
`[/]`, and `[x]` checkboxes.  No duplicate or separate in-memory task tracking
is maintained.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/tasks.js:72-98` — `parseTasks()` reads `tasks.md` directly on every call (no in-memory cache); `lib/mini-ralph/runner.js:113-115` — `tasksBefore` snapshot read fresh from disk; `runner.js:132-134` — `tasksAfter` read fresh from disk after each invocation; `scripts/ralph-run.sh:446-477` — `parse_tasks()` reads `tasks.md` via file I/O each time; `lib/mini-ralph/tasks.js:106-113` — `currentTask()` derives state from file on each call |
| Test evidence | `tests/unit/javascript/mini-ralph-tasks.test.js` — `parseTasks()` suite (lines 100–182) tests file-based reads with no caching: `parses incomplete tasks` (line 105), `parses in-progress tasks` (line 115), `parses completed tasks` (line 123), `handles mixed task statuses` (line 131); `currentTask()` suite (lines 184–218) tests live-file derivation; `tests/unit/bash/test-parse-tasks.bats` — `parse_tasks: parses incomplete tasks [ ] correctly` (line 17), `parse_tasks: handles non-existent tasks file gracefully` (line 241), `parse_tasks: handles mixed checkbox states` (line 76) |

---

### P4 — Symlink architecture for task file shared access

**Full claim:** `.ralph/ralph-tasks.md` is a symlink pointing to the change's
`tasks.md`, so both the loop engine and the execution skill operate on the exact
same file.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/tasks.js:39-55` — `syncLink()` creates absolute-path symlink via `fs.symlinkSync(absTasksFile, linkPath)`; `lib/mini-ralph/runner.js:80-82` — calls `tasks.syncLink(ralphDir, options.tasksFile)` when in tasks mode; `scripts/ralph-run.sh:679-733` — `sync_tasks_to_ralph()` establishes symlink using `ln -sf` on both macOS and Linux; `ralph-run.sh:991` — `sync_tasks_to_ralph` called from `execute_ralph_loop()` before each run |
| Test evidence | `tests/unit/javascript/mini-ralph-tasks.test.js` — `syncLink()` suite (lines 50–99): `creates ralphDir if it does not exist` (line 51), `creates a symlink at .ralph/ralph-tasks.md pointing to the tasks file` (line 60), `replaces an existing symlink` (line 73); `tests/unit/bash/test-symlink-architecture.bats` — `symlink architecture: .ralph/ralph-tasks.md exists as symlink after initialization` (line 17), `symlink architecture: both systems see same file state simultaneously` (line 123), `symlink architecture: task state changes propagate immediately` (line 319); `tests/unit/bash/test-sync-tasks-to-ralph.bats` — `sync_tasks_to_ralph: creates symlink when no file exists` (line 15), `sync_tasks_to_ralph: updates existing symlink if pointing to wrong location` (line 76); `tests/integration/test-symlink-macos.bats` — macOS symlink creation and update tests (lines 64–242) |

---

### P5 — Fresh context per iteration via PRD regeneration

**Full claim:** The PRD is regenerated before each iteration so the AI always
receives the latest completed-task list, current-task context, and all OpenSpec
artifacts with no stale information.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `scripts/ralph-run.sh:404-433` — `generate_prd()` reads proposal, specs, and design fresh; `ralph-run.sh:994-997` — PRD written to `$ralph_dir/PRD.md` before loop starts; `lib/mini-ralph/prompt.js:82-87` — `render()` reads `tasksFile` content and `taskContext` fresh on every iteration call; `lib/mini-ralph/tasks.js:152-180` — `taskContext()` always reads live `tasks.md`; `lib/mini-ralph/runner.js:95` — `prompt.render(options, iterationCount)` called inside the while loop |
| Test evidence | `tests/unit/javascript/mini-ralph-prompt.test.js` — `render()` suite (lines 104–217): `renders template with iteration variables` (line 110), `injects tasks content when tasksFile is present` (line 131), `injects fresh task_context when tasksFile is present` (line 149); `tests/unit/bash/test-generate-prd.bats` — `generate_prd: generates PRD with all required sections` (line 16), `generate_prd: includes current task context when available` (line 162), `generate_prd: includes completed tasks in context` (line 377); `tests/unit/bash/test-prd-task-context-injection.bats` — validates task context is injected per-call |

---

### P6 — Iteration numbering aligned with task progress

**Full claim:** The loop iteration counter is derived from the count of
completed tasks (`iteration = completed_count + 1`), so iteration numbers always
reflect actual progress and survive restarts.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/runner.js:387-403` — `_resolveStartIteration()` resumes from `priorIteration + 1` when a prior state file exists; `runner.js:50-58` — reads existing state and passes to `_resolveStartIteration`; `scripts/ralph-run.sh:846-882` — `restore_ralph_state_from_tasks()` reads current iteration from state JSON (does NOT recalculate from completed-task count); `ralph-run.sh:855-861` — comment explicitly says "don't use completed task count" |
| Test evidence | `tests/unit/javascript/mini-ralph-runner.test.js` — `_resolveStartIteration()` suite (lines 152–198): `returns 1 when existingState is null` (line 153), `returns priorIteration + 1 for a basic resume` (line 165), `resumes correctly in tasks mode when tasksFile matches` (line 169), `returns 1 when in tasks mode but tasksFile differs` (line 175); `tests/unit/bash/test-restore-ralph-state-from-tasks.bats` — `restore_ralph_state_from_tasks: preserves iteration when state file has iteration > 0` (line 111), `restore_ralph_state_from_tasks: sets initial iteration to 1 when state file has iteration 0` (line 72) |

---

### P7 — Structured git commit format with task numbers

**Full claim:** Every commit follows the `Ralph iteration <N>: <summary>\n\nTasks
completed:\n- [x] <task.number> <description>` format.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/runner.js:302-315` — `_formatAutoCommitMessage()` produces `Ralph iteration ${iteration}: ${summary}\n\nTasks completed:\n${taskLines}`; `runner.js:310-312` — each task line formatted as `- [x] ${task.fullDescription \|\| task.description}`; `runner.js:149-161` — auto-commit only fires when `hasCompletion \|\| hasTask` is true, `filesChanged.length > 0`, and `exitCode === 0`; `scripts/ralph-run.sh:799-833` — prompt template instructs the AI agent on the same commit format |
| Test evidence | `tests/unit/javascript/mini-ralph-runner.test.js` — `_formatAutoCommitMessage()` suite (lines 232–276): `formats a single-task Ralph commit message` (line 233), `formats a multi-task Ralph commit message` (line 248), `returns empty string when there are no completed tasks` (line 269); `tests/unit/javascript/mini-ralph-runner-autocommit.test.js` — `commits with a Ralph-formatted message when tasks were completed` (line 65); `tests/unit/bash/test-create-prompt-template.bats` — `create_prompt_template: includes git commit format section` (line 219) confirms the commit format is embedded in the prompt |

---

### P8 — Auto-resume on restart

**Full claim:** When `ralph-run` is restarted after an interruption it picks up
from the correct task, recalculating state from `tasks.md`, without losing
progress or duplicating completed tasks.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/runner.js:50-51` — `state.read(ralphDir)` retrieves existing state on startup; `runner.js:387-403` — `_resolveStartIteration()`: if prior state exists and `tasksFile` matches, resumes at `priorIteration + 1`; `runner.js:394-399` — if tasks file differs, treats as fresh run; `scripts/ralph-run.sh:846-882` — `restore_ralph_state_from_tasks()` preserves existing state-file iteration on restart |
| Test evidence | `tests/unit/javascript/mini-ralph-runner.test.js` — `sets resumedAt in state when resuming from prior iteration` (line 573), `logs a resume message in verbose mode` (line 596), `_resolveStartIteration()` resume tests (lines 165–198); `tests/unit/bash/test-restore-ralph-state-from-tasks.bats` — `restore_ralph_state_from_tasks: preserves existing state when iteration is already set` (line 368), `restore_ralph_state_from_tasks: reads maxIterations from state file` (line 219); `tests/integration/test-interrupted-execution.bats` — `interrupted execution: can be restarted after interruption` (line 194) |

---

### P9 — Loop state and history persistence in `.ralph/`

**Full claim:** The loop engine writes `ralph-loop.state.json` and appends
iteration history to `.ralph/` so users can inspect state, duration, tool usage,
and completion across runs.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/state.js:33-36` — `init()` writes `ralph-loop.state.json`; `state.js:61-64` — `update()` merges fields into state file; `lib/mini-ralph/history.js:56-61` — `append()` pushes iteration entry to `ralph-history.json`; `history.js:43-49` — each entry includes `duration`, `completionDetected`, `taskDetected`, `toolUsage`, `filesChanged`, `exitCode`; `lib/mini-ralph/runner.js:138-147` — `history.append()` called after every iteration; `runner.js:91-92` — `state.update()` called at start of each iteration |
| Test evidence | `tests/unit/javascript/mini-ralph-state.test.js` — `state.init()` suite (lines 34–62): `writes a JSON state file` (line 42), `overwrites existing state file on re-init` (line 53); `state.update()` suite (lines 88–114); `state fields include required loop metadata` (lines 131–155); `tests/unit/javascript/mini-ralph-history.test.js` — `history.append()` suite (lines 69–135): `appends multiple entries in order` (line 94), `stores all required iteration fields` (line 115); `history.recent()` suite (lines 136–175) |

---

### P10 — Context injection (`--add-context` / `--clear-context`)

**Full claim:** Users can inject guidance text that is included in the next
iteration and can clear it afterward; context is persisted in
`.ralph/ralph-context.md`.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/context.js:14` — `CONTEXT_FILE = 'ralph-context.md'`; `context.js:44-51` — `add()` appends text to `ralph-context.md`; `context.js:58-63` — `clear()` deletes the file; `context.js:72-77` — `consume()` reads then clears (one-shot injection); `lib/mini-ralph/runner.js:99` — `context.consume(ralphDir)` called each iteration; `scripts/mini-ralph-cli.js:109-113` — `--add-context` and `--clear-context` flags parsed; `scripts/ralph-run.sh:1106-1122` — `--add-context` / `--clear-context` routed to `run_observability_command()` |
| Test evidence | `tests/unit/javascript/mini-ralph-context.test.js` — `context.add()` suite (lines 48–94): `creates context file with the provided text` (line 56), `appends to existing context with separator` (line 63); `context.clear()` suite (lines 95–110); `context.consume()` suite (lines 111–137): `returns context text and clears the file` (line 112), `context is not re-injected after consumption` (line 128); `tests/unit/javascript/mini-ralph-runner.test.js` — `injects pending context into prompt` (line 468), `consumes context after first iteration (not re-injected)` (line 488); `tests/unit/bash/test-handle-context-injection.bats` — `handle_context_injection: removes injection file after reading` (line 68) |

---

### P11 — Status dashboard (`--status`)

**Full claim:** `ralph-run --status` displays the active loop state, current
task, prompt summary, pending context, recent iteration history, and struggle
indicators.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/status.js:23-115` — `render()` outputs: loop state (active/inactive, iteration, started time); prompt summary; pending context; task progress (via `tasks.countTasks()` and `tasks.currentTask()`); recent history (last 5 entries); struggle indicators; `scripts/ralph-run.sh:1097-1104` — `--status` routes to `run_observability_command("status")`; `scripts/mini-ralph-cli.js:171-175` — `--status` calls `miniRalph.getStatus()` |
| Test evidence | `tests/unit/javascript/mini-ralph-status.test.js` — `render()` suite (lines 136–300): `includes the header section` (line 144), `shows ACTIVE when loop is running` (line 158), `shows INACTIVE when loop is done` (line 169), `shows iteration and maxIterations` (line 182), `includes pending context in output` (line 205), `shows recent history when entries exist` (line 229), `shows task progress when tasksFile is provided and readable` (line 262), `shows struggle indicators when all iterations have no file changes` (line 281) |

---

### P12 — Struggle indicators (no-progress and repeated-error warnings)

**Full claim:** When the loop appears stuck, the status output surfaces
no-progress and repeated-error warnings to guide user intervention.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/status.js:185-208` — `_detectStruggles()`: no-progress warning when `noProgressCount >= 2 && noProgressCount === recentHistory.length`; repeated-error warning when `errorCount >= 2`; `status.js:102-112` — struggles surfaced in `render()` output with `--- Struggle Indicators ---` header and `--add-context` tip; `lib/mini-ralph/runner.js:96` — `_buildIterationFeedback()` (separate from status) surfaces recent problem signals into the next iteration prompt |
| Test evidence | `tests/unit/javascript/mini-ralph-status.test.js` — `_detectStruggles()` suite (lines 88–134): `detects no-progress when all recent iterations have no file changes` (line 94), `does not flag no-progress if at least one iteration had changes` (line 104), `detects repeated errors when 2 or more non-zero exit codes` (line 113), `does not flag errors for a single non-zero exit code` (line 122); `render()` test `shows struggle indicators when all iterations have no file changes` (line 281) |

---

### P13 — Automatic commit behavior with opt-out (`--no-commit`)

**Full claim:** The loop creates git commits automatically after each task
unless `--no-commit` is passed.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/runner.js:150-161` — auto-commit conditional: `!options.noCommit && exitCode === 0 && filesChanged.length > 0 && (hasCompletion \|\| hasTask)`; `runner.js:231-274` — `_autoCommit()` runs `git add -A` then `git commit -m <message>`; `scripts/mini-ralph-cli.js:97-99` — `--no-commit` flag parsed and forwarded via `noCommit: true`; `scripts/ralph-run.sh:203-206` — `--no-commit` sets `NO_COMMIT=true` and passed to `execute_ralph_loop()` |
| Test evidence | `tests/unit/javascript/mini-ralph-runner-autocommit.test.js` — `commits with a Ralph-formatted message when tasks were completed` (line 65), `skips when no completed tasks were detected` (line 30), `skips when nothing is staged after git add` (line 39), `logs and swallows commit failures` (line 93); `tests/unit/javascript/mini-ralph-runner.test.js` — `_completedTaskDelta()` suite (lines 200–231); `tests/unit/bash/test-execute-ralph-loop.bats` — `execute_ralph_loop: passes --no-commit when no_commit=true` (line 349), `execute_ralph_loop: does NOT pass --no-commit by default` (line 373) |

---

### P14 — OpenSpec artifact immutability during loop execution

**Full claim:** `proposal.md`, `design.md`, and `specs/*/spec.md` are read-only
during loop execution; only `tasks.md` is modified by the loop.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `scripts/ralph-run.sh:371-401` — `read_openspec_artifacts()` reads proposal, specs, and design into variables (no writes); `ralph-run.sh:294-320` — `validate_openspec_artifacts()` checks for presence but does not write; `lib/mini-ralph/runner.js:80-82` — only `tasks.syncLink()` and `state`/`history`/`context` writes occur — no writes to proposal/design/specs; `lib/mini-ralph/prompt.js:82-87` — reads `tasksFile` and artifact files but never writes them |
| Test evidence | `tests/unit/bash/test-read-openspec-artifacts.bats` — `read_openspec_artifacts: reads proposal.md content correctly` (line 16), `read_openspec_artifacts: reads design.md content correctly` (line 53), `read_openspec_artifacts: reads single spec.md file correctly` (line 89) — all tests confirm read-only access with no writes; `tests/unit/bash/test-validate-openspec-artifacts.bats` — `validate_openspec_artifacts: succeeds with all required artifacts` (line 16) confirms presence checks only; no test writes to proposal/design/spec files |

---

### P15 — OpenSpec-native loop preparation (PRD generation from artifacts)

**Full claim:** `ralph-run` reads `proposal.md`, `design.md`, and all
`specs/*/spec.md` files and generates a PRD (`.ralph/PRD.md`) that serves as
the context input for every iteration.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `scripts/ralph-run.sh:371-401` — `read_openspec_artifacts()` reads `proposal.md`, `design.md`, and all `specs/*/spec.md` via `find … -name "spec.md"`; `ralph-run.sh:404-432` — `generate_prd()` assembles content into `# Product Requirements Document` with Proposal/Specifications/Design sections; `ralph-run.sh:435-444` — `write_prd()` writes to `$ralph_dir/PRD.md`; `ralph-run.sh:994-997` — `generate_prd` + `write_prd` called before loop; `scripts/mini-ralph-cli.js:192-194` — `--prompt-file` passed as `PRD.md` path to mini-ralph runner |
| Test evidence | `tests/unit/bash/test-generate-prd.bats` — `generate_prd: generates PRD with all required sections` (line 16), `generate_prd: includes proposal content in PRD` (line 42), `generate_prd: includes specifications content in PRD` (line 76), `generate_prd: includes design content in PRD` (line 108), `generate_prd: includes multiple specifications` (line 286); `tests/unit/bash/test-execute-ralph-loop.bats` — `execute_ralph_loop: creates PRD.md in ralph_dir` (line 155), `execute_ralph_loop: passes --prompt-file to the CLI` (line 226); `tests/integration/test-simple-workflow.bats` — `simple workflow: with complete fixture generates PRD` (line 90) |

---

### P16 — macOS and Linux cross-platform compatibility

**Full claim:** The loop runtime and wrapper support both macOS and Linux for
state files, history, task sync, temp paths, and cleanup.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `scripts/ralph-run.sh:6-12` — `detect_os()` distinguishes `Linux` and `macOS` via `uname -s`; `ralph-run.sh:17-24` — `get_file_mtime()` uses `stat -f %m` (macOS) vs `stat -c %Y` (Linux); `ralph-run.sh:69-98` — `get_temp_root()` and `make_temp_dir()` use `TMPDIR` with fallback to `/tmp`, `mktemp -d` with macOS `-t` fallback; `ralph-run.sh:39-55` — `get_realpath()` uses `realpath` with `readlink -f` fallback; `lib/mini-ralph/` — pure Node.js `fs`/`path`/`crypto` (platform-agnostic by design) |
| Test evidence | `tests/unit/bash/test-detect-os.bats` — `detect_os: detects Linux OS` (line 16), `detect_os: detects macOS OS` (line 29), `detect_os: handles unknown OS` (line 42); `tests/unit/bash/test-get-file-mtime.bats` — `get_file_mtime: returns Unix timestamp on Linux` (line 16), `get_file_mtime: returns Unix timestamp on macOS` (line 44), `get_file_mtime: returns 0 for non-existent file on Linux` (line 67), `get_file_mtime: returns 0 for non-existent file on macOS` (line 79); `tests/integration/test-symlink-macos.bats` — full macOS-specific symlink test suite; `tests/integration/test-symlink-linux.bats` — Linux-specific symlink test suite |

---

### P17 — Prompt sources and templating (prompt file + template rendering)

**Full claim:** The loop runtime supports prompt-file input and prompt-template
rendering that injects iteration-specific values before invoking OpenCode.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/prompt.js:33-53` — `loadBase()` supports both `promptText` (inline) and `promptFile` (file read); `prompt.js:64-101` — `render()` applies `promptTemplate` when present, replacing `{{iteration}}`, `{{max_iterations}}`, `{{tasks}}`, `{{task_context}}`, `{{task_promise}}`, `{{completion_promise}}`, `{{context}}`; `prompt.js:110-113` — `_renderTemplate()` does `{{key}}` replacement; `scripts/ralph-run.sh:735-843` — `create_prompt_template()` writes `prompt-template.md` with all template variables; `ralph-run.sh:1007-1013` — `--prompt-file PRD.md --prompt-template prompt-template.md` passed to mini-ralph |
| Test evidence | `tests/unit/javascript/mini-ralph-prompt.test.js` — `_renderTemplate()` suite (lines 30–69): `replaces a single variable` (line 31), `replaces multiple variables` (line 35), `replaces repeated occurrences of the same variable` (line 40), `handles empty string as variable value` (line 56); `render()` suite — `renders template with iteration variables` (line 110), `injects tasks content when tasksFile is present` (line 131), `includes task_promise and completion_promise in template` (line 185); `tests/unit/bash/test-create-prompt-template.bats` — `create_prompt_template: includes Ralph iteration placeholders` (line 57), `create_prompt_template: includes task list placeholder` (line 78), `create_prompt_template: includes context placeholder` (line 98), `create_prompt_template: includes promise placeholders` (line 138); `tests/unit/bash/test-execute-ralph-loop.bats` — `execute_ralph_loop: passes --prompt-template to the CLI` (line 251) |

---

### P18 — `ralph-run` as the sole documented end-user interface

**Full claim:** All supported loop operations are exposed through `ralph-run`;
no separate end-user CLI is introduced.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `scripts/mini-ralph-cli.js:5-10` — explicit comment: "This script is invoked by scripts/ralph-run.sh … It is NOT a documented end-user interface. Users should use ralph-run."; `mini-ralph-cli.js:130-153` — help text states "This is an internal script. Use ralph-run as the documented interface."; `scripts/ralph-run.sh:153-187` — `usage()` is the only public-facing help; all flags (`--status`, `--add-context`, `--clear-context`, `--no-commit`, `--max-iterations`) exposed through `ralph-run` |
| Test evidence | `tests/unit/javascript/ralph-run-wrapper.test.js` — `wrapper file exists` (line 46), `wrapper is executable` (line 50), `wrapper invokes bash script` (line 64), `wrapper passes command line arguments to bash script` (line 73); `tests/unit/javascript/mini-ralph-invoker.test.js` — `invoke uses "opencode run"` test confirms `mini-ralph-cli.js` is internal only; `tests/unit/bash/test-validate-dependencies.bats` — `validate_dependencies: does not reference RALPH_CMD in output` (line 249) confirms no external ralph interface |

---

## 6. Follow-up Recommendations

*Populated during task 3.2 and reviewed in task 3.3.*

<!-- BEGIN follow-up-recommendations -->
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
