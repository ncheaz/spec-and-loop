# Writing Ralph-Friendly OpenSpec Artifacts and Task Lists

## Purpose

This note explains how to author OpenSpec changes that run cleanly under
`ralph-run` without getting stuck in a loop. The emphasis is on `tasks.md`, but
safe tasks depend on good upstream artifacts:

- `proposal.md` defines why and boundaries
- `design.md` settles important decisions
- `specs/**/spec.md` defines required behavior
- `tasks.md` translates that into loop-safe increments

Historical note: older Ralph guidance often assumed an external `ralph` CLI. In
this repo the runtime is the internal mini Ralph engine plus `opencode`, but the
core lessons are the same:

- fresh-session execution
- strong backpressure
- one meaningful task per loop
- durable artifacts on disk

## The current execution model in this repo

Before writing tasks, it helps to remember what the loop actually does.

- Each iteration starts with fresh model context.
- `ralph-run` generates `.ralph/PRD.md` once at loop start from `proposal.md`,
  `design.md`, and `specs/**/spec.md`.
- The runtime appends fresh task context and recent loop signals.
- `tasks.md` is the source of truth for execution state.
- `.ralph/ralph-tasks.md` is a symlink back to `tasks.md`.
- `.ralph/` stores transient runtime state, history, pending context, and error
  output. It is not the product source of truth.
- The loop is happiest when one iteration can complete one task and prove it.

Within a single run, treat `.ralph/PRD.md` as an invocation-time snapshot rather
than a live mirror of the OpenSpec artifacts. Freshness during later iterations
comes from the live `tasks.md` read, recent loop signals, and any pending
injected context.

The question to keep asking is:

> Can a fresh-session agent read the artifacts, choose the next safe increment,
> verify it objectively, and either finish honestly or stop honestly?

If the answer is "not really," the change is not Ralph-friendly yet.

## What "Ralph-friendly" means

1. One checkbox equals one coherent slice of behavior.
2. "Done" is defined before execution starts, not negotiated during the loop.
3. Verification is explicit and runnable.
4. The task does not force the loop to invent product policy.
5. Human-only work is durable but kept outside the autonomous checkbox path.
6. If the loop struggles, the answer is usually better artifacts or better
   checks, not more chat history.

## Where the truth should live

### `proposal.md`

Use `proposal.md` for:

- why the change exists
- scope and non-goals
- first-rollout boundaries
- follow-up or deferred work
- operator, reviewer, or stakeholder handoffs

### `design.md`

Use `design.md` for:

- algorithms and decision rules
- config shape and allowed values
- failure semantics and fallback behavior
- compatibility and migration behavior
- ownership boundaries
- exact human handoff flow where needed

### `specs/**/spec.md`

Use specs for:

- MUST/SHALL behavior
- success and failure scenarios
- observable outcomes
- distinctions between first rollout and later follow-up work

### `tasks.md`

Use `tasks.md` for:

- ordered execution plan
- one coherent increment per checkbox
- explicit verification
- no hidden policy decisions

## The main task-sizing rule

Ralph does **not** want the smallest possible tasks.

Ralph wants the **coarsest task that is still unambiguous and objectively
verifiable**.

That usually means:

- one behavior slice
- one main risk
- one validation mode
- one honest stopping point

Too broad:

- the loop has to invent design or rollout policy

Too small:

- the loop burns iterations on bookkeeping, context reload, and commit churn

Best size:

- enough work to matter
- small enough that "done" can still be proven in one focused pass

## Task authoring rules that matter most

### 1. Write outcomes, not editing motions

Bad:

```markdown
- [ ] Update `src/api.py` and tests
```

Better:

```markdown
- [ ] Reject promote requests when required staged rows are missing for the target tenant version.
```

The loop should understand the behavior that must become true, not just where to
type.

### 2. Keep one main concern per checkbox

A task that mixes:

- schema changes
- API semantics
- rollout coordination
- docs
- browser validation

is usually too broad.

A task may touch multiple files, but it should still resolve one main outcome.

### 3. Add explicit verification

If a task can finish without the agent proving anything, it is not loop-safe.

Good tasks usually answer:

- what command to run
- what scenario to exercise
- what state must be observed
- what must remain unchanged

### 4. Remove policy decisions before the loop starts

Bad task:

```markdown
- [ ] Decide whether cleanup is shared or tenant-specific.
```

That is not implementation. That is unresolved design.

Resolve it in `design.md` or explicitly defer it before the loop runs.

### 5. Keep human-only work outside the checkbox path

Do not ask the autonomous loop to do tasks that require:

- manual approval
- stage or prod credentials
- stakeholder signoff
- subjective go/no-go review

Keep these in a `Human Handoff` or `Operator Handoff` section outside the loop's
normal checklist.

### 6. Order tasks by dependency, not by discovery

If you already know the dependency graph, put it in the task list. Do not make
the loop infer obvious ordering from scratch.

### 7. Prefer medium-sized behavior slices over micro-tasks

These are often too small:

- add enum
- rename variable
- add one unit test
- update comment

unless that tiny unit is genuinely the full coherent checkpoint.

Usually the better task is the combined slice:

- implement the behavior change and the validation that proves it

### 8. Use sharp verbs and observables

Weak verbs create loop churn:

- ensure
- support
- handle
- keep
- validate

Use them only when followed by a concrete observable.

Stronger phrasing:

- reject
- return
- persist
- skip
- preserve
- archive
- emit
- leave unchanged

### 9. Give the loop an honest stopping condition

Tasks should make it clear when to stop and hand off instead of improvising.

Examples:

- stop if this requires changing public API semantics not already covered in
  `design.md`
- stop if the only remaining validation requires stage access
- stop if a spec conflict is discovered and no source-of-truth artifact resolves
  it

### 10. Treat repeated loop failure as an artifact bug

If the loop keeps missing, the default conclusion should be:

- task too broad
- verification too weak
- policy unresolved
- specs unclear
- harness missing a needed check

Do not assume the next fresh session will magically infer the missing intent.

## A practical task template

Use a pattern like this inside `tasks.md`:

```markdown
- [ ] Change X behavior in Y area so that Z becomes true.
  Verify by: run C and confirm D.
  Stop and hand off if: E.
```

You do not need this exact wording every time, but the information should exist.

## Good and bad examples

### Example 1: bad task

```markdown
- [ ] Add versioning support.
```

Why it is bad:

- too broad
- unclear scope
- unclear files
- unclear verification
- hides multiple design decisions

### Example 2: better task

```markdown
- [ ] Refuse standalone promote when the target tenant version is missing required staged rows.
  Verify by: run the standalone promote path against a tenant with an incomplete staged version and confirm the command fails while the active version remains unchanged.
```

Why it is better:

- one clear behavior change
- negative case is explicit
- verification is objective
- no hidden policy choice

### Example 3: docs or config task done well

```markdown
- [ ] Document the new promote failure mode and the operator recovery path in the change docs.
  Verify by: confirm `proposal.md` and `design.md` describe the failure condition, the non-goal of auto-recovery, and the manual recovery path consistently.
```

Why it works:

- still outcome-based
- names the artifacts to update
- verification is concrete
- no hidden product decision

## Anti-patterns that create loop churn

Watch for these before running `ralph-run`:

- vague tasks with no observable success condition
- tasks that bundle implementation, rollout, and manual validation together
- tasks that require the loop to decide policy mid-flight
- tasks that are really research spikes disguised as implementation
- tasks that require stage, prod, or manual access but are not marked as handoff work
- proposal or design language that still says "may", "could", or "one option is"
  for core behavior
- checkboxes that split a single same-file mechanical change into many tiny
  increments with no real checkpoint
- checkboxes that say "write tests" separately when those tests are part of
  proving the same behavior slice
- tasks that depend on context injected in chat rather than artifacts on disk

## When to split a task

Split when a single checkbox hides:

- more than one major behavior
- more than one verification mode
- an unresolved design choice
- unrelated files or subsystems
- a likely human handoff in the middle

Typical signs a task is too big:

- it would need "and also" several times
- it needs both design interpretation and implementation
- it changes persistence, API behavior, and operator docs all at once
- it cannot be honestly completed in one focused iteration

## When to merge tasks

Merge when the split creates no meaningful checkpoint.

Typical merge candidates:

- same-file mechanical edits that must land together
- behavior change plus the focused test that proves it
- doc updates that simply record the exact change just implemented
- tiny follow-up edits that cannot stand alone as a validated increment

## What to do with unresolved questions

If something is not settled, do not bury it in a checkbox.

Instead:

- resolve it in `design.md`
- capture it as a non-goal or deferred item in `proposal.md`
- turn it into a named spike or handoff item outside the normal autonomous path

A task list is a poor place to discover product truth.

## How `--add-context` should be used

`ralph-run --add-context` is useful, but it is not a substitute for fixing the
artifacts.

Use `--add-context` for:

- one-off steering
- reminding the next loop about a local preference
- temporary guidance that does not change source-of-truth requirements

Do **not** use `--add-context` as the only place where:

- scope changes
- design decisions are settled
- new failure semantics are defined
- rollout policy is changed

If the truth changed, update `proposal.md`, `design.md`, `specs/**/spec.md`, or
`tasks.md`.

## How `--status` helps when the loop feels stuck

Use `ralph-run --status` to inspect:

- the current task
- recent iteration history
- struggle indicators
- pending injected context

This is useful because it tells you whether the loop is:

- genuinely making progress
- bouncing on the same failure
- blocked by missing context
- working on the wrong task size

## If the loop is already stuck

A simple recovery sequence is:

1. Run `ralph-run --status`.
2. Decide whether the blocker is:
   - missing design decision
   - weak or missing verification
   - bad task size
   - actual code bug
3. If the blocker is missing truth, edit the source artifacts.
4. If the blocker is task size, rewrite `tasks.md`.
5. If the blocker is a small temporary steering issue, use `--add-context`.
6. Re-run the loop.
7. If the same failure repeats again, treat that as proof the artifacts still are
   not good enough.

The key mindset is:

- repeated failure usually means the loop is faithfully exposing missing guidance

## If you still use feature JSON or PRD-style feature lists

This repo is strongest in OpenSpec `tasks.md` mode, but the same ideas apply to
feature JSON:

- keep each feature as one behavior slice
- keep `description` stable
- write `steps` as ordered verification steps
- let the loop update only status fields such as `passes`
- prefer OpenSpec task mode when design and spec context matter heavily

In other words, the feature list should be execution truth, not a place where the
agent renegotiates requirements.

## Pre-flight checklist

Before you call a change "Ralph-friendly," check:

- [ ] `proposal.md` clearly states scope, non-goals, and rollout boundaries.
- [ ] `design.md` settles core policy, fallback behavior, and operator boundaries.
- [ ] `specs/**/spec.md` define success and failure clearly enough that two
      implementers would not diverge materially.
- [ ] Each checkbox is a coherent behavior slice, not a file chore.
- [ ] Each checkbox has an explicit verification path.
- [ ] Human-only work is outside the autonomous checkbox path.
- [ ] No task requires privileged or manual access unless it is clearly a handoff item.
- [ ] The task order reflects dependencies you already know.
- [ ] Critical guidance lives on disk, not only in chat.
- [ ] You would be comfortable giving the change to a fresh-session agent with no
      prior memory.

## Bottom line

A Ralph-friendly OpenSpec change is not the most verbose artifact set. It is the
artifact set that leaves the loop with the fewest judgment calls.

If a fresh-session agent can:

- reload the artifacts
- identify the next safe task
- make the change
- verify it objectively
- stop honestly on blockers

then the change is ready for `ralph-run`.

## Source notes

Repo-local sources used for this update:

- `scripts/ralph-run.sh`
- `README.md`
- `QUICKSTART.md`
- `package.json`
- `scripts/templates/features-template.json`

External references used for this update:

- Geoffrey Huntley, "Ralph Wiggum as a software engineer"
  `https://ghuntley.com/ralph/`
- Geoffrey Huntley, "everything is a ralph loop"
  `https://ghuntley.com/loop/`
- Anthropic, "Effective harnesses for long-running agents"
  `https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents`
