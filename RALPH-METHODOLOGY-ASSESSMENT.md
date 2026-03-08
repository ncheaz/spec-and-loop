# Ralph Wiggum Methodology Assessment

**Repository:** `spec-and-loop`
**Change:** `evaluate-ralph-wiggum-methodology`
**Assessment date:** 2026-03-08
**Status:** In progress — implementation evidence collected (task 2.1 complete); test evidence and verdicts pending (tasks 2.2–2.3)

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
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW §7, embedded-loop-engine spec |
| Gaps or contradictions | No Bun runtime is used anywhere; zero references to `@th0rgal/ralph-wiggum` in scripts or lib |

---

### P2 — Iterative loop execution with configurable completion and iteration limits

**Full claim:** The loop repeatedly invokes OpenCode until a completion promise
is detected or the maximum iteration count is reached.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/runner.js:88-175` — `while (iterationCount < maxIterations)` loop; `runner.js:130-131` — `_containsPromise()` detects `<promise>COMPLETE</promise>` in output; `runner.js:164-168` — breaks on completion with `exitReason = 'completion_promise'`; `runner.js:86` — `exitReason = 'max_iterations'` default; `scripts/mini-ralph-cli.js:89-90` — `--max-iterations` flag parsed and forwarded; `scripts/ralph-run.sh:195-204` — `--max-iterations` flag accepted, default 50 |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW §5, embedded-loop-engine spec |
| Gaps or contradictions | None identified in implementation |

---

### P3 — tasks.md as the single source of truth for task state

**Full claim:** `tasks.md` is the only file that tracks task state via `[ ]`,
`[/]`, and `[x]` checkboxes.  No duplicate or separate in-memory task tracking
is maintained.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/tasks.js:72-98` — `parseTasks()` reads `tasks.md` directly on every call (no in-memory cache); `lib/mini-ralph/runner.js:113-115` — `tasksBefore` snapshot read fresh from disk; `runner.js:132-134` — `tasksAfter` read fresh from disk after each invocation; `scripts/ralph-run.sh:446-477` — `parse_tasks()` reads `tasks.md` via file I/O each time; `lib/mini-ralph/tasks.js:106-113` — `currentTask()` derives state from file on each call |
| Test evidence | — |
| Doc/spec alignment | README.md, BOTW Key Invariant 1, openspec-native-ralph-flow spec |
| Gaps or contradictions | No in-memory state duplication found; every task-state read goes to disk |

---

### P4 — Symlink architecture for task file shared access

**Full claim:** `.ralph/ralph-tasks.md` is a symlink pointing to the change's
`tasks.md`, so both the loop engine and the execution skill operate on the exact
same file.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/tasks.js:39-55` — `syncLink()` creates absolute-path symlink via `fs.symlinkSync(absTasksFile, linkPath)`; `lib/mini-ralph/runner.js:80-82` — calls `tasks.syncLink(ralphDir, options.tasksFile)` when in tasks mode; `scripts/ralph-run.sh:679-733` — `sync_tasks_to_ralph()` establishes symlink using `ln -sf` on both macOS and Linux; `ralph-run.sh:991` — `sync_tasks_to_ralph` called from `execute_ralph_loop()` before each run |
| Test evidence | — |
| Doc/spec alignment | README.md, BOTW §4, openspec-native-ralph-flow spec |
| Gaps or contradictions | Both shell and Node layers independently establish the symlink, which is redundant but not contradictory |

---

### P5 — Fresh context per iteration via PRD regeneration

**Full claim:** The PRD is regenerated before each iteration so the AI always
receives the latest completed-task list, current-task context, and all OpenSpec
artifacts with no stale information.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `scripts/ralph-run.sh:404-433` — `generate_prd()` reads proposal, specs, and design fresh; `ralph-run.sh:994-997` — PRD written to `$ralph_dir/PRD.md` before loop starts; `lib/mini-ralph/prompt.js:82-87` — `render()` reads `tasksFile` content and `taskContext` fresh on every iteration call; `lib/mini-ralph/tasks.js:152-180` — `taskContext()` always reads live `tasks.md`; `lib/mini-ralph/runner.js:95` — `prompt.render(options, iterationCount)` called inside the while loop |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW Key Invariant 5, openspec-native-ralph-flow spec |
| Gaps or contradictions | PRD file (proposal+specs+design) is written once before the loop, not re-written each iteration; however `tasks` and `task_context` template variables are rendered fresh per iteration. This means OpenSpec artifacts are static-per-run while task state is live. |

---

### P6 — Iteration numbering aligned with task progress

**Full claim:** The loop iteration counter is derived from the count of
completed tasks (`iteration = completed_count + 1`), so iteration numbers always
reflect actual progress and survive restarts.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/runner.js:387-403` — `_resolveStartIteration()` resumes from `priorIteration + 1` when a prior state file exists; `runner.js:50-58` — reads existing state and passes to `_resolveStartIteration`; `scripts/ralph-run.sh:846-882` — `restore_ralph_state_from_tasks()` reads current iteration from state JSON (does NOT recalculate from completed-task count); `ralph-run.sh:855-861` — comment explicitly says "don't use completed task count" |
| Test evidence | — |
| Doc/spec alignment | BOTW §5 and §6, openspec-native-ralph-flow spec |
| Gaps or contradictions | **Partial mismatch:** BOTW §6 and the spec claim `iteration = completed_tasks_count + 1`. The shell-side `restore_ralph_state_from_tasks()` explicitly does NOT derive iteration from task count — it preserves the state-file value. The Node runner resumes from `priorIteration + 1` (state-file-based), not `completedCount + 1`. After an interruption mid-iteration the iteration number may not equal `completedCount + 1`. |

---

### P7 — Structured git commit format with task numbers

**Full claim:** Every commit follows the `Ralph iteration <N>: <summary>\n\nTasks
completed:\n- [x] <task.number> <description>` format.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/runner.js:302-315` — `_formatAutoCommitMessage()` produces `Ralph iteration ${iteration}: ${summary}\n\nTasks completed:\n${taskLines}`; `runner.js:310-312` — each task line formatted as `- [x] ${task.fullDescription \|\| task.description}`; `runner.js:149-161` — auto-commit only fires when `hasCompletion \|\| hasTask` is true, `filesChanged.length > 0`, and `exitCode === 0`; `scripts/ralph-run.sh:799-833` — prompt template instructs the AI agent on the same commit format |
| Test evidence | — |
| Doc/spec alignment | README.md, BOTW §5 and §4 |
| Gaps or contradictions | None; format is consistent between implementation and docs |

---

### P8 — Auto-resume on restart

**Full claim:** When `ralph-run` is restarted after an interruption it picks up
from the correct task, recalculating state from `tasks.md`, without losing
progress or duplicating completed tasks.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/runner.js:50-51` — `state.read(ralphDir)` retrieves existing state on startup; `runner.js:387-403` — `_resolveStartIteration()`: if prior state exists and `tasksFile` matches, resumes at `priorIteration + 1`; `runner.js:394-399` — if tasks file differs, treats as fresh run; `scripts/ralph-run.sh:846-882` — `restore_ralph_state_from_tasks()` preserves existing state-file iteration on restart |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW §3, openspec-native-ralph-flow spec |
| Gaps or contradictions | Resume is state-file-based (not task-count-based); the loop resumes from the last recorded iteration + 1, which correctly skips already-counted iterations. If the state file is absent or the process is killed before the state file is written, the loop restarts at iteration 1 — correct for a clean start but could repeat an iteration if interrupted mid-write. |

---

### P9 — Loop state and history persistence in `.ralph/`

**Full claim:** The loop engine writes `ralph-loop.state.json` and appends
iteration history to `.ralph/` so users can inspect state, duration, tool usage,
and completion across runs.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/state.js:33-36` — `init()` writes `ralph-loop.state.json`; `state.js:61-64` — `update()` merges fields into state file; `lib/mini-ralph/history.js:56-61` — `append()` pushes iteration entry to `ralph-history.json`; `history.js:43-49` — each entry includes `duration`, `completionDetected`, `taskDetected`, `toolUsage`, `filesChanged`, `exitCode`; `lib/mini-ralph/runner.js:138-147` — `history.append()` called after every iteration; `runner.js:91-92` — `state.update()` called at start of each iteration |
| Test evidence | — |
| Doc/spec alignment | README.md, BOTW §5, embedded-loop-engine spec |
| Gaps or contradictions | State file is named `ralph-loop.state.json` (matches spec); history file is `ralph-history.json` (spec says "appends iteration history" — consistent). No discrepancy found. |

---

### P10 — Context injection (`--add-context` / `--clear-context`)

**Full claim:** Users can inject guidance text that is included in the next
iteration and can clear it afterward; context is persisted in
`.ralph/ralph-context.md`.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/context.js:14` — `CONTEXT_FILE = 'ralph-context.md'`; `context.js:44-51` — `add()` appends text to `ralph-context.md`; `context.js:58-63` — `clear()` deletes the file; `context.js:72-77` — `consume()` reads then clears (one-shot injection); `lib/mini-ralph/runner.js:99` — `context.consume(ralphDir)` called each iteration; `scripts/mini-ralph-cli.js:109-113` — `--add-context` and `--clear-context` flags parsed; `scripts/ralph-run.sh:1106-1122` — `--add-context` / `--clear-context` routed to `run_observability_command()` |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW §4, loop-observability-controls spec |
| Gaps or contradictions | None; context file name, add/clear/consume behavior all align with claims |

---

### P11 — Status dashboard (`--status`)

**Full claim:** `ralph-run --status` displays the active loop state, current
task, prompt summary, pending context, recent iteration history, and struggle
indicators.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/status.js:23-115` — `render()` outputs: loop state (active/inactive, iteration, started time); prompt summary; pending context; task progress (via `tasks.countTasks()` and `tasks.currentTask()`); recent history (last 5 entries); struggle indicators; `scripts/ralph-run.sh:1097-1104` — `--status` routes to `run_observability_command("status")`; `scripts/mini-ralph-cli.js:171-175` — `--status` calls `miniRalph.getStatus()` |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW §4, loop-observability-controls spec |
| Gaps or contradictions | None; all four claimed display elements (state, task progress, pending context, history) are implemented |

---

### P12 — Struggle indicators (no-progress and repeated-error warnings)

**Full claim:** When the loop appears stuck, the status output surfaces
no-progress and repeated-error warnings to guide user intervention.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/status.js:185-208` — `_detectStruggles()`: no-progress warning when `noProgressCount >= 2 && noProgressCount === recentHistory.length`; repeated-error warning when `errorCount >= 2`; `status.js:102-112` — struggles surfaced in `render()` output with `--- Struggle Indicators ---` header and `--add-context` tip; `lib/mini-ralph/runner.js:96` — `_buildIterationFeedback()` (separate from status) surfaces recent problem signals into the next iteration prompt |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, loop-observability-controls spec |
| Gaps or contradictions | None; both no-progress and repeated-error paths are implemented |

---

### P13 — Automatic commit behavior with opt-out (`--no-commit`)

**Full claim:** The loop creates git commits automatically after each task
unless `--no-commit` is passed.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/runner.js:150-161` — auto-commit conditional: `!options.noCommit && exitCode === 0 && filesChanged.length > 0 && (hasCompletion \|\| hasTask)`; `runner.js:231-274` — `_autoCommit()` runs `git add -A` then `git commit -m <message>`; `scripts/mini-ralph-cli.js:97-99` — `--no-commit` flag parsed and forwarded via `noCommit: true`; `scripts/ralph-run.sh:203-206` — `--no-commit` sets `NO_COMMIT=true` and passed to `execute_ralph_loop()` |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW §4, embedded-loop-engine spec |
| Gaps or contradictions | None; auto-commit and `--no-commit` both clearly implemented |

---

### P14 — OpenSpec artifact immutability during loop execution

**Full claim:** `proposal.md`, `design.md`, and `specs/*/spec.md` are read-only
during loop execution; only `tasks.md` is modified by the loop.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `scripts/ralph-run.sh:371-401` — `read_openspec_artifacts()` reads proposal, specs, and design into variables (no writes); `ralph-run.sh:294-320` — `validate_openspec_artifacts()` checks for presence but does not write; `lib/mini-ralph/runner.js:80-82` — only `tasks.syncLink()` and `state`/`history`/`context` writes occur — no writes to proposal/design/specs; `lib/mini-ralph/prompt.js:82-87` — reads `tasksFile` and artifact files but never writes them |
| Test evidence | — |
| Doc/spec alignment | BOTW Key Invariant 2 |
| Gaps or contradictions | No enforcement mechanism (file permissions, read-only flags) prevents writes — immutability is behavioral rather than enforced. The loop engine does not attempt writes to artifact files, but nothing technically prevents the AI agent from doing so. |

---

### P15 — OpenSpec-native loop preparation (PRD generation from artifacts)

**Full claim:** `ralph-run` reads `proposal.md`, `design.md`, and all
`specs/*/spec.md` files and generates a PRD (`.ralph/PRD.md`) that serves as
the context input for every iteration.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `scripts/ralph-run.sh:371-401` — `read_openspec_artifacts()` reads `proposal.md`, `design.md`, and all `specs/*/spec.md` via `find … -name "spec.md"`; `ralph-run.sh:404-432` — `generate_prd()` assembles content into `# Product Requirements Document` with Proposal/Specifications/Design sections; `ralph-run.sh:435-444` — `write_prd()` writes to `$ralph_dir/PRD.md`; `ralph-run.sh:994-997` — `generate_prd` + `write_prd` called before loop; `scripts/mini-ralph-cli.js:192-194` — `--prompt-file` passed as `PRD.md` path to mini-ralph runner |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW §1 and §6, openspec-native-ralph-flow spec |
| Gaps or contradictions | None; all three artifact types are read and assembled into the PRD |

---

### P16 — macOS and Linux cross-platform compatibility

**Full claim:** The loop runtime and wrapper support both macOS and Linux for
state files, history, task sync, temp paths, and cleanup.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `scripts/ralph-run.sh:6-12` — `detect_os()` distinguishes `Linux` and `macOS` via `uname -s`; `ralph-run.sh:17-24` — `get_file_mtime()` uses `stat -f %m` (macOS) vs `stat -c %Y` (Linux); `ralph-run.sh:69-98` — `get_temp_root()` and `make_temp_dir()` use `TMPDIR` with fallback to `/tmp`, `mktemp -d` with macOS `-t` fallback; `ralph-run.sh:39-55` — `get_realpath()` uses `realpath` with `readlink -f` fallback; `lib/mini-ralph/` — pure Node.js `fs`/`path`/`crypto` (platform-agnostic by design) |
| Test evidence | — |
| Doc/spec alignment | README.md CI/CD section, embedded-loop-engine spec |
| Gaps or contradictions | None; explicit cross-platform guards present in shell layer; Node layer is platform-agnostic |

---

### P17 — Prompt sources and templating (prompt file + template rendering)

**Full claim:** The loop runtime supports prompt-file input and prompt-template
rendering that injects iteration-specific values before invoking OpenCode.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `lib/mini-ralph/prompt.js:33-53` — `loadBase()` supports both `promptText` (inline) and `promptFile` (file read); `prompt.js:64-101` — `render()` applies `promptTemplate` when present, replacing `{{iteration}}`, `{{max_iterations}}`, `{{tasks}}`, `{{task_context}}`, `{{task_promise}}`, `{{completion_promise}}`, `{{context}}`; `prompt.js:110-113` — `_renderTemplate()` does `{{key}}` replacement; `scripts/ralph-run.sh:735-843` — `create_prompt_template()` writes `prompt-template.md` with all template variables; `ralph-run.sh:1007-1013` — `--prompt-file PRD.md --prompt-template prompt-template.md` passed to mini-ralph |
| Test evidence | — |
| Doc/spec alignment | README.md, embedded-loop-engine spec |
| Gaps or contradictions | None; prompt file + template rendering fully implemented |

---

### P18 — `ralph-run` as the sole documented end-user interface

**Full claim:** All supported loop operations are exposed through `ralph-run`;
no separate end-user CLI is introduced.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | `scripts/mini-ralph-cli.js:5-10` — explicit comment: "This script is invoked by scripts/ralph-run.sh … It is NOT a documented end-user interface. Users should use ralph-run."; `mini-ralph-cli.js:130-153` — help text states "This is an internal script. Use ralph-run as the documented interface."; `scripts/ralph-run.sh:153-187` — `usage()` is the only public-facing help; all flags (`--status`, `--add-context`, `--clear-context`, `--no-commit`, `--max-iterations`) exposed through `ralph-run` |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, openspec-native-ralph-flow spec |
| Gaps or contradictions | None; `mini-ralph-cli.js` is clearly marked as internal in both its header and help output |

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
