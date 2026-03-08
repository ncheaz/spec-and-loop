# Ralph Wiggum Methodology Principles — Enumeration

This file records the methodology principles currently claimed across the four
primary evidence sources for task 1.1 of the evaluate-ralph-wiggum-methodology
change.  It is a working input for subsequent assessment tasks.

---

## Sources Reviewed

1. `README.md`
2. `QUICKSTART.md`
3. `OPENSPEC-RALPH-WIGGUM-BOTW.md`
4. `openspec/specs/` (three main specs):
   - `openspec/specs/embedded-loop-engine/spec.md`
   - `openspec/specs/loop-observability-controls/spec.md`
   - `openspec/specs/openspec-native-ralph-flow/spec.md`

---

## Enumerated Principles

### P1 — Self-contained loop runtime (no external Ralph dependency)

**Claim:** The package provides an internal mini Ralph loop engine that executes
without any external `ralph` CLI, `@th0rgal/ralph-wiggum` package, or Bun
runtime.

**Sources:**
- `README.md` — "No External Ralph" row in features table; "includes a
  first-party mini Ralph implementation (`lib/mini-ralph/`)"
- `QUICKSTART.md` — "No external `ralph` CLI needed"; "runtime prompt is
  self-contained"
- `OPENSPEC-RALPH-WIGGUM-BOTW.md` — historical note on line 7 explicitly
  flags the shift away from external-Ralph/Cursor-skill era
- `openspec/specs/embedded-loop-engine/spec.md` — Requirement: Self-contained
  loop runtime; SHALL NOT require external `ralph` executable or Bun

---

### P2 — Iterative loop execution with configurable completion and iteration limits

**Claim:** The loop repeatedly invokes OpenCode until a completion promise is
detected or the maximum iteration count is reached.

**Sources:**
- `README.md` — "Iterative Loop: Each task builds on previous commits";
  `--max-iterations <n>` flag; "loop runs until all tasks complete"
- `QUICKSTART.md` — "Iterates until all tasks done"
- `OPENSPEC-RALPH-WIGGUM-BOTW.md` — §5 Iteration Management: iteration
  boundaries and max-iterations logic; §Ideal Behaviors checklist items 1 and 6
- `openspec/specs/embedded-loop-engine/spec.md` — Requirement: Iterative loop
  execution; Scenarios: completion promise, maximum iterations, task promise
  advances tasks-mode loop

---

### P3 — tasks.md as the single source of truth for task state

**Claim:** `tasks.md` is the only file that tracks task state via `[ ]`, `[/]`,
and `[x]` checkboxes.  No duplicate or separate in-memory task tracking is
maintained.

**Sources:**
- `README.md` — "Task Tracking" section; "tasks.md: Human-readable checkboxes
  `[ ]` → `[x]` (source of truth)"
- `QUICKSTART.md` — feature table row "Granular History / One git commit per
  task"
- `OPENSPEC-RALPH-WIGGUM-BOTW.md` — Key Invariant 1: "tasks.md is Source of
  Truth"; §2 Task Tracking Behavior; Anti-Pattern 1: Don't Maintain Separate
  Task State; Critical Success Criterion 1
- `openspec/specs/openspec-native-ralph-flow/spec.md` — Requirement: Task file
  synchronization; "tasks.md SHALL be the durable source of truth"

---

### P4 — Symlink architecture for task file shared access

**Claim:** `.ralph/ralph-tasks.md` is a symlink pointing to the change's
`tasks.md`, so both the loop engine and the execution skill operate on the
exact same file.

**Sources:**
- `README.md` — `.ralph/ralph-tasks.md` listed in file structure; described as
  "Symlink to `tasks.md` for the loop engine"
- `OPENSPEC-RALPH-WIGGUM-BOTW.md` — §4 Symlink Architecture; Key Invariant 3:
  "Symlink Must Point to Correct File"; Anti-Pattern 4: Don't Break the Symlink
- `openspec/specs/openspec-native-ralph-flow/spec.md` — Requirement: Task file
  synchronization Scenario: "`.ralph/ralph-tasks.md` SHALL reference the
  change's `tasks.md`"

---

### P5 — Fresh context per iteration via PRD regeneration

**Claim:** The PRD is regenerated before each iteration so the AI always
receives the latest completed-task list, current-task context, and all OpenSpec
artifacts with no stale information.

**Sources:**
- `README.md` — "Context Propagation" section; "Fresh task snapshot: Raw
  `tasks.md` content … rendered each iteration"
- `QUICKSTART.md` — "Recent failures or no-progress iterations inform
  subsequent tasks; Each task builds on the previous commit"
- `OPENSPEC-RALPH-WIGGUM-BOTW.md` — Key Invariant 5: "Each Iteration Gets
  Fresh Context"; §6 PRD Generation and Refresh; §Critical Feature on PRD
  regeneration; Anti-Pattern 3: Don't Use Stale Context; Critical Success
  Criterion 3
- `openspec/specs/openspec-native-ralph-flow/spec.md` — Requirement: OpenSpec
  context generation; "SHALL generate a PRD or equivalent prompt input …
  SHALL provide current-task context derived from `tasks.md`"

---

### P6 — Iteration numbering aligned with task progress

**Claim:** The loop iteration counter is persisted in `.ralph/ralph-loop.state.json`
and resumes from `priorIteration + 1` on restart, ensuring iteration numbers
reflect actual progress. On a clean first run, the iteration starts at 1 while the
completed count starts at 0, so the relationship `iteration = completed_count + 1`
emerges from initial conditions. On subsequent restarts, this relationship is
maintained by state-file continuity rather than live task-count derivation.

Restart behavior: The JS runner (`_resolveStartIteration` at `lib/mini-ralph/runner.js:387-403`) returns 1 if no
existing state file exists, if the persisted iteration is invalid (not a number
or < 1), or if in tasks mode the prior tasks file differs from the current one
(treating this as a fresh run). Otherwise it resumes from `priorIteration + 1`.
The bash wrapper (`restore_ralph_state_from_tasks` at `scripts/ralph-run.sh:846-882`) preserves the existing
iteration from the state file when restarting; it only sets iteration to 1 if
the state file has iteration 0 or is missing. State file continuity ensures the
iteration counter persists across restarts without drift, even if the tasks
file has been modified, except in the explicit case of a different tasks file.

**Sources:**
- `OPENSPEC-RALPH-WIGGUM-BOTW.md` — §6 State Synchronization;
  `restore_ralph_state_from_tasks()`; Key Invariant 4; §5 Iteration Management:
  "Iteration N = completed tasks count + 1"; Anti-Pattern 2: Don't Hardcode
  Iteration Numbers; Critical Success Criterion 4
- `openspec/specs/openspec-native-ralph-flow/spec.md` — Requirement: Loop
  resumption aligns with task progress; "prepared loop state SHALL align with
  the current task progress"
- `lib/mini-ralph/runner.js:387-403` — `_resolveStartIteration()` resumes from
  `priorIteration + 1` when state file exists and tasks file matches
- `scripts/ralph-run.sh:846-882` — `restore_ralph_state_from_tasks()` reads
  iteration from state JSON (comment: "don't use completed task count")

---

### P7 — Structured git commit format with task numbers

**Claim:** Every commit follows the `Ralph iteration <N>: <summary>\n\nTasks
completed:\n- [x] <task.number> <description>` format, providing traceability
between iteration, task numbers, and implementation.

**Sources:**
- `README.md` — git commit format shown in example workflow
- `OPENSPEC-RALPH-WIGGUM-BOTW.md` — §5 Git Commit Format; §4 Git Integration
  Behavior; Anti-Pattern 5: Don't Ignore Task Numbers in Commits; Critical
  Success Criterion 5
- (Implied in `QUICKSTART.md` via "one commit per task" feature row)

---

### P8 — Auto-resume on restart

**Claim:** When `ralph-run` is restarted after an interruption it picks up from
the correct task, recalculating state from `tasks.md`, without losing progress
or duplicating completed tasks.

**Sources:**
- `README.md` — "Auto-Resume: Interrupted? Run again — picks up where left off"
  (features table and script features section)
- `QUICKSTART.md` — "Auto-Resume" feature row
- `OPENSPEC-RALPH-WIGGUM-BOTW.md` — §What Should Happen on
  Interruption/Restart; §3 Task Retry Logic; §Iteration Recovery; Critical
  Success Criterion / Error Recovery and Retry
- `openspec/specs/openspec-native-ralph-flow/spec.md` — Requirement: Loop
  resumption aligns with task progress

---

### P9 — Loop state and history persistence in `.ralph/`

**Claim:** The loop engine writes `ralph-loop.state.json` and appends iteration
history to `.ralph/` so users can inspect state, duration, tool usage, and
completion across runs.

**Sources:**
- `README.md` — file structure listing `.ralph/` contents;
  "State and history: Loop state, iteration history, and struggle indicators
  stored in each change's `.ralph/`"
- `OPENSPEC-RALPH-WIGGUM-BOTW.md` — §5 Iteration State File with field
  descriptions
- `openspec/specs/embedded-loop-engine/spec.md` — Requirement: Loop state and
  history persistence; Scenarios: active loop writes state, completed iterations
  recorded in history

---

### P10 — Context injection (`--add-context` / `--clear-context`)

**Claim:** Users can inject guidance text that is included in the next iteration
and can clear it afterward; context is persisted in `.ralph/ralph-context.md`.

**Sources:**
- `README.md` — "Context Injection" advanced usage section; `--add-context` /
  `--clear-context` flags; "Pending context: Any `--add-context` injection" in
  Context Propagation section
- `QUICKSTART.md` — feature table row; `ralph-run --add-context` command
  example
- `OPENSPEC-RALPH-WIGGUM-BOTW.md` — §4 Human-in-the-Loop; referenced in
  context-injection scenario
- `openspec/specs/loop-observability-controls/spec.md` — Requirement: Pending
  context controls; Scenarios: Add context, Clear pending context

---

### P11 — Status dashboard (`--status`)

**Claim:** `ralph-run --status` displays the active loop state, current task,
prompt summary, pending context, recent iteration history, and struggle
indicators.

**Sources:**
- `README.md` — "Loop Status" feature row; "Loop Status Dashboard" advanced
  usage section
- `QUICKSTART.md` — `ralph-run --status` command example
- `OPENSPEC-RALPH-WIGGUM-BOTW.md` — §4 Human-in-the-Loop; `--status` in
  troubleshooting sections
- `openspec/specs/loop-observability-controls/spec.md` — Requirement: Status
  dashboard; all four Scenarios (active loop, pending context, task progress,
  recent history)

---

### P12 — Struggle indicators (no-progress and repeated-error warnings)

**Claim:** When the loop appears stuck (multiple iterations without file changes
or with the same error), the status output surfaces no-progress and
repeated-error warnings to guide user intervention.

**Sources:**
- `README.md` — "Iteration Feedback: Recent failures and no-progress iterations
  inform the next pass" (features table); "struggle indicators" in mini Ralph
  description
- `QUICKSTART.md` — "Error Propagation: Failures inform subsequent tasks"
  feature row
- `openspec/specs/loop-observability-controls/spec.md` — Requirement: Struggle
  indicators; Scenarios: no-progress warning, repeated-error warning

---

### P13 — Automatic commit behavior with opt-out (`--no-commit`)

**Claim:** The loop creates git commits automatically after each task unless
`--no-commit` is passed.

**Sources:**
- `README.md` — "Granular History: One git commit per task" feature row;
  "Creates git commit with task description (unless `--no-commit`)"
- `QUICKSTART.md` — `ralph-run --no-commit` command example
- `OPENSPEC-RALPH-WIGGUM-BOTW.md` — §4 Git Integration Behavior; §Ideal
  Behaviors checklist item 6
- `openspec/specs/embedded-loop-engine/spec.md` — Requirement: Commit behavior
  can be controlled; Scenario: Auto-commit is disabled

---

### P14 — OpenSpec artifact immutability during loop execution

**Claim:** `proposal.md`, `design.md`, and `specs/*/spec.md` are read-only
during loop execution by convention; only `tasks.md` is modified by the loop.
Immutability is maintained through code path design rather than runtime
enforcement or file-system permissions.

Implementation evidence: The loop engine does not have any write paths to
artifact files. `scripts/ralph-run.sh:371-401` — `read_openspec_artifacts()`
reads proposal, specs, and design into variables (no writes); `ralph-run.sh:294-320`
— `validate_openspec_artifacts()` checks for presence but does not write;
`lib/mini-ralph/runner.js:80-82` — only `tasks.syncLink()` and state/history/context
writes occur — no writes to proposal/design/specs; `lib/mini-ralph/prompt.js:82-87`
— reads `tasksFile` and artifact files but never writes them. Tests confirm
read-only access patterns (`tests/unit/bash/test-read-openspec-artifacts.bats`).
However, immutability is not enforced by runtime guards, file-system permissions,
or negative assertions in tests — it is maintained by convention.

**Sources:**
- `OPENSPEC-RALPH-WIGGUM-BOTW.md` — Key Invariant 2: "OpenSpec Artifacts are
  Immutable During Loop"; Critical Success Criterion 2

---

### P15 — OpenSpec-native loop preparation (PRD generation from artifacts)

**Claim:** `ralph-run` reads `proposal.md`, `design.md`, and all
`specs/*/spec.md` files and generates a PRD (`.ralph/PRD.md`) that serves as
the context input for every iteration.

**Sources:**
- `README.md` — "PRD Generation: Converts proposal + specs + design → PRD
  format for internal use"; `cat openspec/changes/my-feature/.ralph/PRD.md`
  example
- `QUICKSTART.md` — "View the generated PRD" example
- `OPENSPEC-RALPH-WIGGUM-BOTW.md` — §1 Initialization Flow; §6 PRD Generation
  and Refresh; Integration Point 1: OpenSpec → Script
- `openspec/specs/openspec-native-ralph-flow/spec.md` — Requirement:
  OpenSpec-native loop preparation; Requirement: OpenSpec context generation

---

### P16 — macOS and Linux cross-platform compatibility

**Claim:** The loop runtime and wrapper support both macOS and Linux for state
files, history, task sync, temp paths, and cleanup.

**Sources:**
- `README.md` — CI/CD section: "Linux: Ubuntu (latest), macOS: macOS (latest)"
- `openspec/specs/embedded-loop-engine/spec.md` — Requirement: macOS and Linux
  compatibility; both platform Scenarios

---

### P17 — Prompt sources and templating (prompt file + template rendering)

**Claim:** The loop runtime supports prompt-file input and prompt-template
rendering that injects iteration-specific values (e.g., loop signals, pending
context) before invoking OpenCode.

**Sources:**
- `README.md` — "Prompt templates: Context-aware prompts generated from OpenSpec
  artifacts" in mini Ralph description; `.ralph/prompt-template.md` in file
  structure
- `openspec/specs/embedded-loop-engine/spec.md` — Requirement: Prompt sources
  and templating; Scenarios: prompt file as task source, template renders
  iteration context

---

### P18 — `ralph-run` as the sole documented end-user interface

**Claim:** All supported loop operations (status, context, loop control) are
exposed through `ralph-run`; no separate end-user CLI is introduced.

**Sources:**
- `README.md` — "Ralph Loop Commands" section lists only `ralph-run` flags
- `QUICKSTART.md` — all example commands use `ralph-run`
- `openspec/specs/openspec-native-ralph-flow/spec.md` — Requirement:
  `ralph-run` is the documented interface; Scenario: "supported control flags
  are surfaced through `ralph-run`"

---

## Summary Table

| ID  | Principle (short label)                  | Primary Sources                                      |
|-----|------------------------------------------|------------------------------------------------------|
| P1  | Self-contained runtime (no ext. Ralph)   | README, QUICKSTART, BOTW, embedded-loop-engine spec  |
| P2  | Iterative loop with limits               | README, QUICKSTART, BOTW, embedded-loop-engine spec  |
| P3  | tasks.md as single source of truth       | README, BOTW, openspec-native-ralph-flow spec        |
| P4  | Symlink architecture for task sharing    | README, BOTW, openspec-native-ralph-flow spec        |
| P5  | Fresh context per iteration (PRD regen)  | README, QUICKSTART, BOTW, openspec-native-ralph-flow |
| P6  | Iteration numbering aligned with tasks   | BOTW, openspec-native-ralph-flow spec                |
| P7  | Structured git commit format             | README, BOTW                                         |
| P8  | Auto-resume on restart                   | README, QUICKSTART, BOTW, openspec-native-ralph-flow |
| P9  | State and history persistence in .ralph  | README, BOTW, embedded-loop-engine spec              |
| P10 | Context injection (--add-context)        | README, QUICKSTART, BOTW, loop-observability spec    |
| P11 | Status dashboard (--status)              | README, QUICKSTART, BOTW, loop-observability spec    |
| P12 | Struggle indicators                      | README, QUICKSTART, loop-observability spec          |
| P13 | Auto-commit with --no-commit opt-out     | README, QUICKSTART, BOTW, embedded-loop-engine spec  |
| P14 | OpenSpec artifact immutability           | BOTW                                                 |
| P15 | OpenSpec-native PRD generation           | README, QUICKSTART, BOTW, openspec-native-ralph-flow |
| P16 | macOS and Linux compatibility            | README, embedded-loop-engine spec                    |
| P17 | Prompt sources and templating            | README, embedded-loop-engine spec                    |
| P18 | ralph-run as sole documented interface   | README, QUICKSTART, openspec-native-ralph-flow spec  |
