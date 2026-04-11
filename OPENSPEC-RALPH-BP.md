# Writing Ralph-Friendly OpenSpec Proposals

## Purpose

This note distills:

- prior Ralph-loop review work done in this repo
- repo-local Ralph/OpenSpec guidance
- external Ralph-style loop guidance from Anthropic, Geoffrey Huntley, and Ralph TUI docs

The goal is practical:

- help write OpenSpec changes that are usable, thorough, and actionable
- help those changes turn into good Ralph tasks and good loop instructions
- reduce the chance that a fresh-session loop gets stuck on ambiguity, hidden policy, or missing verification

The original need behind this writeup was not just "make the spec better." It was:

- make an OpenSpec change safe for a fresh-session autonomous loop
- prevent the loop from getting stuck on ambiguity, rollout gates, or hidden policy choices
- shape work into atomic but still worthwhile increments
- preserve human/operator judgment where needed, but document it explicitly outside the loop

In short, a "Ralph-friendly OpenSpec proposal" means the durable artifacts on disk, not chat history, carry enough intent and enough boundaries that a loop can make steady progress without inventing requirements.

## The core idea

Ralph loops work because each iteration starts fresh, re-reads the prompt and repo state, and uses objective backpressure such as tests, typechecks, render checks, browser checks, or other validators.

That means the loop is only as good as the artifacts it reloads every time.

The most important principle from that prior review work is this:

**Ralph does not want the smallest tasks. Ralph wants the coarsest task that is still unambiguous and objectively verifiable.**

Another way to say it:

- too broad: the agent has to make hidden design decisions and will thrash
- too granular: the loop wastes iterations on bookkeeping and repeated context reload
- best size: one coherent behavior slice, one main risk, one clear completion check

## The authoring target

When people say "proposal" in a Ralph/OpenSpec workflow, the loop usually depends on a package of artifacts, not one file.

A good package looks like this:

- `proposal.md`: why this change exists, what is in scope, what is out of scope
- `design.md`: the important decisions the agent should not have to invent
- `specs/**/spec.md`: the required behaviors and scenarios
- `tasks.md`: the ordered execution plan
- loop instructions or wrapper prompt: how Ralph loads context, verifies work, marks progress, and stops on blockers

The right question is not "is the proposal detailed?" It is:

**Can a fresh-session agent read the artifact set, pick the next safe increment, verify it, and either finish honestly or stop honestly?**

## Lessons from prior Ralph-loop reviews

The `tenant-scoped-content-versioning` example clarified several practical rules.

### 1. Medium atomic tasks beat both vague tasks and micro-tasks

The earlier task list had the worst of both worlds:

- tiny mechanical subtasks that should have been done together
- broad ambiguous tasks that still required design decisions

The better version merged obvious same-file mechanical work and split only the tasks that still hid policy or control-flow decisions.

### 2. Human handoffs must be documented, but not executed by the loop

Stage rollout validation, signoff, or production-only checks are not good autonomous loop tasks.

Best practice:

- keep them in the artifacts
- put them in a dedicated `Human Handoff` or `Operator Handoff` section
- keep them outside the checkbox path the loop consumes

Do not rely on "we discussed this in chat." The handoff must live in `proposal.md`, `design.md`, or a clearly marked non-loop section of `tasks.md`.

### 3. Unresolved policy questions become loop churn

Those prior reviews repeatedly found the same failure mode:

- design says "reuse the current staged version for the same release cycle"
- task says "validate critical failures"
- deployment says something "may be shared or tenant-specific"

Those phrases are acceptable in human planning, but bad for a Ralph loop. A fresh-session agent will treat them as missing decisions.

Before running the loop, resolve or explicitly defer:

- algorithms
- fallback behavior
- retention math
- config shape
- exact failure taxonomy
- compatibility-window behavior

### 4. Every wide task needs explicit "done when" signals

Tasks became safer once wider items gained acceptance bullets such as:

- what behavior changed
- what file or artifact was updated
- what command or check proves the task is done

Verbs like `ensure`, `validate`, `keep`, or `support` are too soft on their own.

### 5. Full OpenSpec context is better than raw task-file mode

Repo guidance strongly favors `./scripts/ralph-run.sh tasks <change>` over raw `tasks.md` mode because `opsx-apply` reloads:

- proposal
- design
- specs
- tasks

This is important: a task list can be shorter when the design/specs fully resolve the tricky decisions, but only if the loop actually reloads those artifacts each iteration.

If you run raw `prd.json` or raw `tasks.md` mode, more detail must be pushed down into each item.

## What "Ralph-friendly" means in practice

A Ralph-friendly spec or task set has these properties:

1. One loop item equals one coherent slice of behavior.
2. "Done" is frozen up front and not negotiated mid-run.
3. Verification is explicit and runnable.
4. The agent is not asked to choose product or rollout policy.
5. Human-only checks are durable but excluded from autonomous execution.
6. Repeated failure patterns can be corrected by editing the artifact, not by hoping the next session "remembers."
7. The loop can stop honestly with a blocker rather than improvise.

## A complete Ralph-friendly OpenSpec package

To be genuinely usable in a loop, the artifact set should answer five different questions:

### 1. Why are we doing this?

Handled in `proposal.md`:

- business or operator value
- problem statement
- scope
- non-goals
- rollout boundaries

### 2. What exactly must be true when we are done?

Handled in `specs/**/spec.md`:

- required behaviors
- failure cases
- scenarios
- first-rollout versus deferred behavior

### 3. How should the system behave internally?

Handled in `design.md`:

- algorithms
- config shapes
- ownership boundaries
- compatibility behavior
- retention and cleanup semantics
- handoff flow

### 4. What is the next safe increment?

Handled in `tasks.md`:

- one coherent increment at a time
- explicit ordering
- objective completion checks
- no hidden policy choice

### 5. How should the loop operate?

Handled in the prompt or wrapper instructions:

- reload context every iteration
- implement one task only
- run the relevant checks
- keep task state in sync
- stop on blockers instead of guessing

If any one of those five questions is under-specified, the loop tends to compensate by making assumptions.

## Best practices for a Ralph-friendly `prd.json`

In this repo, the local JSON template is intentionally minimal:

```json
{
  "features": [
    {
      "category": "functional",
      "description": "Description of the feature requirement",
      "steps": [
        "Step 1 to verify",
        "Step 2 to verify"
      ],
      "passes": false
    }
  ]
}
```

That minimalism matters. Because the schema is small, most of the real quality comes from how `description` and `steps` are written.

### The local contract

Based on `scripts/RALPHY-OPENSPEC-RUNNING.md`, the intended usage is:

- the JSON defines the feature list
- the loop works through each feature
- the agent changes only `passes`
- the agent must **not** rewrite `description` or `steps`

That is consistent with Anthropic's long-running harness guidance:

- keep a structured feature list
- mark items as passing only after real verification
- use JSON because models are less likely to casually rewrite it than markdown

### Strong rules for `prd.json`

#### 1. Treat `description` and `steps` as immutable truth

The loop should update only:

- `passes: false -> true`

Do not let the agent redefine the requirement while implementing it. If the requirement is wrong, a human should edit it deliberately.

#### 2. Make each feature a behavior slice, not a file chore

Good:

- "Tenant-scoped promotion refuses to activate a staged version when same-command ingest produced errors"

Bad:

- "Edit `src/ingestion/run.py`"
- "Add one field to model"

The feature should describe the user-visible or system-visible outcome, not the editing motion.

#### 3. Write `steps` as verification steps

In a Ralph-friendly JSON, `steps` should answer:

- how to observe the behavior
- what to run
- what to compare
- what must be true for `passes` to become `true`

Good `steps` are ordered, observable, and testable.

Bad `steps` are vague:

- "make sure it works"
- "confirm behavior"

#### 4. Keep each feature completable in one session

External guidance from Ralph TUI and Anthropic converges on the same rule:

- one story or feature should fit in one focused session or one context window

If a feature needs multiple unrelated edits, multiple policy decisions, and several different verification modes, split it.

#### 5. Include real quality gates in the feature itself or its companion prompt

If the schema is too small to carry separate quality-gate fields, encode them in `steps` or in the loop prompt:

- run the relevant test selector
- run lint/typecheck
- run build if needed
- run browser verification for UI work

Broader Ralph ecosystems often append quality gates to every story automatically. The local schema does not, so you must compensate in authoring.

#### 6. Prefer end-to-end verification over code-only verification

Anthropic's harness guidance highlights a common failure mode:

- the agent changes code
- unit tests pass
- the real feature still does not work end-to-end

For UI or workflow changes, include steps that simulate a real user path or at least a realistic system check.

#### 7. Put manual or operator-only items elsewhere

Do not put stage validation, approvals, or privileged rollout steps into the same autonomous JSON list unless they are clearly marked as manual and excluded from execution.

If the loop cannot honestly complete the item without a human or a protected environment, it should not be a normal `passes` item.

#### 8. Order items by dependency and implementation readiness

Even with the simple local schema, ordering matters:

- schema and primitives first
- then behavior
- then integration
- then docs

Do not make the agent infer the dependency graph from scratch if you already know it.

#### 9. Do not encode unresolved design choices as feature items

Bad:

- "Decide whether cleanup is shared or tenant-specific"

That is a design question, not an implementation feature for Ralph.

Resolve it in the design or explicitly defer it before the JSON is generated.

#### 10. Keep JSON concise and move rationale to companion docs

The JSON should carry execution truth, not every design nuance.

Use companion artifacts for:

- motivation
- scope and non-goals
- architecture
- follow-up work
- handoff instructions

## A good local `prd.json` item

```json
{
  "category": "ingestion",
  "description": "Standalone promote refuses to activate a staged tenant version when required staged rows are missing",
  "steps": [
    "Create or identify a tenant with a staged target version but missing required staged rows",
    "Run the standalone promote path for that tenant",
    "Verify the command exits non-zero or returns the documented failure outcome",
    "Verify tenant active version is unchanged",
    "Run the relevant test selector and confirm it passes"
  ],
  "passes": false
}
```

Why this is good:

- outcome-based description
- deterministic steps
- explicit negative behavior
- includes verification
- no hidden product decision

## What this means for OpenSpec

The best OpenSpec artifacts are the ones that can be flattened into a stable `prd.json` or task list without losing important intent.

### Proposal best practices

Use `proposal.md` to lock down the "why" and the boundaries.

A Ralph-friendly proposal should clearly state:

- the problem being solved
- the intended user or operator value
- the in-scope first rollout
- explicit non-goals
- operational impact
- deferred work and follow-up changes
- human handoff summary when needed

Avoid proposal language like:

- "may be either"
- "one option is"
- "could support later"

Those phrases are fine while exploring, but once the proposal becomes loop input, they create ambiguity.

### Design best practices

Use `design.md` to remove interpretation work from the loop.

The design should settle:

- algorithms and resolution rules
- config keys and allowed values
- failure semantics
- compatibility-window behavior
- retention or cleanup math
- ownership boundaries
- exact human/operator handoff flow

If a task would otherwise force the agent to choose a policy, the design has not done enough work yet.

### Spec best practices

Use delta specs to express objective behavior with scenario-level precision.

Good Ralph-friendly specs:

- use clear MUST/SHALL language
- define failure and success conditions explicitly
- distinguish first rollout from deferred improvements
- provide scenarios that imply runnable tests

If multiple good implementers could read the spec and make materially different choices, the spec is not loop-safe yet.

### Task-list best practices

`tasks.md` is where the OpenSpec work most directly maps to a loop.

Best practices:

- one checkbox equals one coherent loop increment
- use the coarsest atomic unit, not the smallest possible edit
- prefer one main behavior slice or one tightly related same-file cluster
- include `Done when:` or `Verify by:` bullets for wider tasks
- name concrete files for docs/config tasks
- keep operator-only steps in a separate non-checkbox section
- split tasks that hide design or rollout decisions
- merge tasks that create no meaningful checkpoint between them

### Instruction and prompt best practices

Even a good task list can fail if the loop instructions are weak.

A Ralph-friendly prompt or wrapper should tell the agent to:

- load the full OpenSpec context, not just the task list, when that context matters
- inspect prior iteration state before starting new work
- implement one task per iteration
- run the exact validators relevant to that task
- mark progress only after verification succeeds
- stop and request help on ambiguity, contradictions, missing dependencies, or unresolved failures
- avoid inventing new requirements or silently redefining "done"

At minimum, the loop instructions should make these rules explicit:

- read `proposal.md`, `design.md`, `specs/**`, and `tasks.md`
- do not guess when the artifacts are unclear
- do not mix multiple tasks into one iteration
- do not mark a task complete until the stated checks pass
- preserve human handoff items as handoff items

### A useful task formula

Write tasks like this:

> Change X behavior in Y area so that Z becomes true.  
> Verify by running C and confirming D.  
> Stop and hand off if E occurs.

That is much better than:

> Ensure support for X.

## Mapping `prd.json` concepts to OpenSpec artifacts

| Ralph/JSON need | Best OpenSpec home | What to write |
| --- | --- | --- |
| Stable statement of what must be true | `specs/**/spec.md` | Requirement and scenario with clear behavior |
| Why this work exists | `proposal.md` | Problem, value, scope, non-goals |
| One loop-safe increment | `tasks.md` | One checkbox with one outcome and one verification target |
| Frozen success definition | `tasks.md` plus specs | `Done when:` bullets tied to observable checks |
| Quality gates | `tasks.md`, project test docs, or prompt | Exact test, lint, typecheck, build, browser, or query commands |
| Human-only validation | `proposal.md` or `design.md` | Explicit `Human Handoff` section outside loop tasks |
| Deferred work | `proposal.md` and `design.md` | Named follow-up change or explicitly deferred item |
| Dependency order | `tasks.md` and design | Put prerequisites earlier; do not rely on the agent to invent ordering |
| Rationale for tricky checks | `design.md` or spec notes | Explain why the behavior matters so future fresh sessions do not undo it |

## Anti-patterns to avoid

- Using vague verbs with no observable output.
- Asking the loop to decide policy mid-implementation.
- Mixing implementation, rollout, and manual validation in one checkbox.
- Splitting one migration or one tightly related refactor into many tiny loop iterations with no independent verification point.
- Hiding critical instructions only in chat history.
- Letting the agent rewrite feature definitions instead of only updating status.
- Declaring done from unit tests alone when the real behavior is end-to-end.
- Leaving "maybe this, maybe that" wording in design or proposal once implementation is about to start.

## Recommended workflow for Ralph-safe OpenSpec authoring

1. Explore first. Do not start the loop while major policy questions are still open.
2. Write the proposal to define value, scope, non-goals, and handoff boundaries.
3. Write the design to settle algorithms, config shapes, failure semantics, and retention math.
4. Write specs with scenario-level, testable behavior.
5. Translate specs into medium-sized tasks with explicit verification.
6. If you also want a `prd.json`, derive it from those same requirements and keep it immutable except for `passes`.
7. Prefer `./scripts/ralph-run.sh tasks <change>` when the design/spec context matters.
8. Watch the loop, and when repeated failures appear, update the artifacts with a better "sign" rather than hoping the next run will infer the missing intent.

## Practical checklist

Before calling an OpenSpec change "Ralph-friendly," check all of these:

- [ ] The proposal clearly states scope, non-goals, and first-rollout boundaries.
- [ ] The design does not leave core policy choices unresolved.
- [ ] Specs are specific enough that two implementers would not make materially different choices.
- [ ] Each task is atomic in the semantic sense, not merely tiny.
- [ ] Each task has an explicit verification target.
- [ ] Human/operator work is documented outside the autonomous checkbox path.
- [ ] No task depends on stage/prod/manual access unless it is explicitly a handoff item.
- [ ] If using `prd.json`, the loop is instructed to modify only `passes`.
- [ ] The artifacts on disk contain all critical guidance that a fresh session needs.
- [ ] The loop instructions explicitly say to reload context, do one task, verify it, and stop on blockers.

## Source notes

Durable repo-local sources used:

- `scripts/RALPHY-OPENSPEC-RUNNING.md`
- `scripts/templates/features-template.json`
- `scripts/templates/prd-template.md`
- `scripts/ralph-run.sh`
- `hidden/RALPH-WIGGUM-OPENSPEC.md`
- `hidden/RALPH-WIGGUM-CURSOR.md`

Prior internal Ralph-loop review conversations also informed this note, but their temporary exports are intentionally not cited by file path here.

External references consulted:

- Anthropic, "Effective harnesses for long-running agents"  
  `https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents`
- Geoffrey Huntley, "Ralph Wiggum as a software engineer"  
  `https://ghuntley.com/ralph/`
- Geoffrey Huntley, "everything is a ralph loop"  
  `https://ghuntley.com/loop/`
- Ralph TUI docs: `create-prd` and `convert`  
  `https://ralph-tui.com/docs/cli/create-prd`  
  `https://ralph-tui.com/docs/cli/convert`

## Bottom line

The best Ralph-friendly OpenSpec proposal is not the most detailed artifact in the abstract. It is the artifact set that leaves the loop with the fewest judgment calls.

If a fresh-session agent can:

- read the artifacts
- pick one coherent increment
- verify it objectively
- stop honestly on blockers
- leave the repo in a clean state

then the proposal is Ralph-friendly.
