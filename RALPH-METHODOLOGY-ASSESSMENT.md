# Ralph Wiggum Methodology Assessment

**Repository:** `spec-and-loop`
**Change:** `evaluate-ralph-wiggum-methodology`
**Assessment date:** 2026-03-08
**Status:** In progress — evidence collection pending (tasks 2.1–2.3)

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
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW §7, embedded-loop-engine spec |
| Gaps or contradictions | — |

---

### P2 — Iterative loop execution with configurable completion and iteration limits

**Full claim:** The loop repeatedly invokes OpenCode until a completion promise
is detected or the maximum iteration count is reached.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW §5, embedded-loop-engine spec |
| Gaps or contradictions | — |

---

### P3 — tasks.md as the single source of truth for task state

**Full claim:** `tasks.md` is the only file that tracks task state via `[ ]`,
`[/]`, and `[x]` checkboxes.  No duplicate or separate in-memory task tracking
is maintained.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, BOTW Key Invariant 1, openspec-native-ralph-flow spec |
| Gaps or contradictions | — |

---

### P4 — Symlink architecture for task file shared access

**Full claim:** `.ralph/ralph-tasks.md` is a symlink pointing to the change's
`tasks.md`, so both the loop engine and the execution skill operate on the exact
same file.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, BOTW §4, openspec-native-ralph-flow spec |
| Gaps or contradictions | — |

---

### P5 — Fresh context per iteration via PRD regeneration

**Full claim:** The PRD is regenerated before each iteration so the AI always
receives the latest completed-task list, current-task context, and all OpenSpec
artifacts with no stale information.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW Key Invariant 5, openspec-native-ralph-flow spec |
| Gaps or contradictions | — |

---

### P6 — Iteration numbering aligned with task progress

**Full claim:** The loop iteration counter is derived from the count of
completed tasks (`iteration = completed_count + 1`), so iteration numbers always
reflect actual progress and survive restarts.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | BOTW §5 and §6, openspec-native-ralph-flow spec |
| Gaps or contradictions | — |

---

### P7 — Structured git commit format with task numbers

**Full claim:** Every commit follows the `Ralph iteration <N>: <summary>\n\nTasks
completed:\n- [x] <task.number> <description>` format.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, BOTW §5 and §4 |
| Gaps or contradictions | — |

---

### P8 — Auto-resume on restart

**Full claim:** When `ralph-run` is restarted after an interruption it picks up
from the correct task, recalculating state from `tasks.md`, without losing
progress or duplicating completed tasks.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW §3, openspec-native-ralph-flow spec |
| Gaps or contradictions | — |

---

### P9 — Loop state and history persistence in `.ralph/`

**Full claim:** The loop engine writes `ralph-loop.state.json` and appends
iteration history to `.ralph/` so users can inspect state, duration, tool usage,
and completion across runs.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, BOTW §5, embedded-loop-engine spec |
| Gaps or contradictions | — |

---

### P10 — Context injection (`--add-context` / `--clear-context`)

**Full claim:** Users can inject guidance text that is included in the next
iteration and can clear it afterward; context is persisted in
`.ralph/ralph-context.md`.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW §4, loop-observability-controls spec |
| Gaps or contradictions | — |

---

### P11 — Status dashboard (`--status`)

**Full claim:** `ralph-run --status` displays the active loop state, current
task, prompt summary, pending context, recent iteration history, and struggle
indicators.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW §4, loop-observability-controls spec |
| Gaps or contradictions | — |

---

### P12 — Struggle indicators (no-progress and repeated-error warnings)

**Full claim:** When the loop appears stuck, the status output surfaces
no-progress and repeated-error warnings to guide user intervention.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, loop-observability-controls spec |
| Gaps or contradictions | — |

---

### P13 — Automatic commit behavior with opt-out (`--no-commit`)

**Full claim:** The loop creates git commits automatically after each task
unless `--no-commit` is passed.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW §4, embedded-loop-engine spec |
| Gaps or contradictions | — |

---

### P14 — OpenSpec artifact immutability during loop execution

**Full claim:** `proposal.md`, `design.md`, and `specs/*/spec.md` are read-only
during loop execution; only `tasks.md` is modified by the loop.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | BOTW Key Invariant 2 |
| Gaps or contradictions | — |

---

### P15 — OpenSpec-native loop preparation (PRD generation from artifacts)

**Full claim:** `ralph-run` reads `proposal.md`, `design.md`, and all
`specs/*/spec.md` files and generates a PRD (`.ralph/PRD.md`) that serves as
the context input for every iteration.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, BOTW §1 and §6, openspec-native-ralph-flow spec |
| Gaps or contradictions | — |

---

### P16 — macOS and Linux cross-platform compatibility

**Full claim:** The loop runtime and wrapper support both macOS and Linux for
state files, history, task sync, temp paths, and cleanup.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md CI/CD section, embedded-loop-engine spec |
| Gaps or contradictions | — |

---

### P17 — Prompt sources and templating

**Full claim:** The loop runtime supports prompt-file input and prompt-template
rendering that injects iteration-specific values before invoking OpenCode.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, embedded-loop-engine spec |
| Gaps or contradictions | — |

---

### P18 — `ralph-run` as the sole documented end-user interface

**Full claim:** All supported loop operations are exposed through `ralph-run`;
no separate end-user CLI is introduced.

| Field | Value |
|-------|-------|
| Verdict | — |
| Implementation evidence | — |
| Test evidence | — |
| Doc/spec alignment | README.md, QUICKSTART.md, openspec-native-ralph-flow spec |
| Gaps or contradictions | — |

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
