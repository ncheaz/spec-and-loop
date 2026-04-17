# Writing Ralph-Friendly OpenSpec Tasks

An actionable guide to shaping tasks so a Ralph Wiggum–style loop (fresh-session, re-reads prompt and repo state each iteration, uses objective backpressure) can make steady progress without getting stuck on ambiguity, hidden policy, or missing verification.

This guide is organized so you can act first and read rationale second:

1. [Quick reference: the task template](#quick-reference-the-task-template)
2. [Quick reference: how to order tasks](#quick-reference-how-to-order-tasks)
3. [Quick reference: authoring recipe](#quick-reference-authoring-recipe)
4. [Task sizing and splitting](#task-sizing-and-splitting)
5. [Worked examples: good vs. bad tasks](#worked-examples-good-vs-bad-tasks)
6. [Quality gates and baselines](#quality-gates-and-baselines)
7. [Human handoffs and operator-only work](#human-handoffs-and-operator-only-work)
8. [The surrounding artifact package](#the-surrounding-artifact-package)
9. [`prd.json` specifics](#prdjson-specifics)
10. [Authoring checklist](#authoring-checklist)
11. [Background and rationale](#background-and-rationale)
12. [Source notes](#source-notes)

---

## Quick reference: the task template

Every Ralph-friendly task checkbox in `tasks.md` should fit this shape:

```markdown
- [ ] **<short imperative outcome>**
  - Scope: <1 subsystem or tightly related file cluster; name the primary files>
  - Change: <what behavior, data, or contract becomes true after this task>
  - Done when:
    - <observable change 1, tied to code/data/doc>
    - <verifier command or selector with expected result>
    - <optional second verifier if it is in the same cluster>
  - Stop and hand off if:
    - <concrete blocker condition, e.g. "a required-clean gate regresses">
    - <concrete ambiguity condition, e.g. "spec disagrees with design">
```

Rules this template enforces:

- **One dominant outcome.** The bold title is a single behavior slice, not a list.
- **One file cluster.** Scope names the area so the loop does not go hunting.
- **Objective "done".** Every `Done when` bullet is either an observable artifact change or a runnable check with a named expected result. No soft verbs (`ensure`, `validate`, `support`, `keep`) without an attached observable.
- **Explicit stop conditions.** The loop has written permission to halt, so it does not improvise.

A one-line prose version for the title and change, useful when drafting:

> Change X behavior in Y area so that Z becomes true. Verify by running C and confirming D. Stop and hand off if E.

If you need "and" twice in that first sentence, you are probably hiding a split point.

---

## Quick reference: how to order tasks

When in doubt, arrange tasks from shared contract outward to user-facing surfaces:

1. **Pre-flight baseline.** Run every quality gate a later task requires to pass. Record the output. This is the only way later iterations can distinguish regressions from pre-existing failures. See [quality gates](#quality-gates-and-baselines).
2. **Freeze shared contracts and prerequisites.** Types, interfaces, registration points, ownership boundaries.
3. **Freeze typed data, config, schemas.** Centralize the data a later surface task would otherwise have to rediscover.
4. **Implement one user-facing surface at a time.** One route, one component family, or one workflow per task.
5. **Wire shared emitters and cross-links.** Navigation, shared shells, cross-references, anything that spans surfaces.
6. **Run final integrated quality gates.** A dedicated task that runs the full suite and is allowed to be a hard stop.

Why this ordering: early tasks reduce ambiguity for later ones. A route task that can trust a frozen typed-data contract is dramatically smaller and safer than one that must invent the contract while rendering the page.

Do **not** make the agent infer the dependency graph. Order the checkboxes in `tasks.md` as written, and if two tasks are independent, say so explicitly.

---

## Quick reference: authoring recipe

1. **Draft behavior slices, not file edits.** "Freeze X contract," "centralize Y data," "implement Z surface." Never "edit `file-a`."
2. **Size against the smallest model you expect to run the loop.** If you expect a smaller model or heavy context reload, bias one size smaller than your strongest-model plan. See [sizing profiles](#two-sizing-profiles).
3. **For each candidate task, count `V`, `S`, `C`, `P`:**
   - `V` = independent verification clusters
   - `S` = independent subsystems or file clusters
   - `C` = clean stopping points that would leave the repo reviewable
   - `P` = unresolved policy or design questions
4. **If `P > 0`, stop.** Fix the design or spec first. Do not encode unresolved policy as a task.
5. **If `V`, `S`, or `C` is meaningfully `> 1`, split.** Default lightweight split target: `recommended subtasks = max(V, C)`, `+1` if the task mixes foundation with feature work, `+1` if it mixes a user-facing surface with shared cross-surface wiring.
6. **Stop splitting before tasks become file chores.** A child task that has no standalone verifier or clean stopping point has been split too far.
7. **Apply the [task template](#quick-reference-the-task-template) to each final checkbox.**
8. **Order the final list** using the [contract-to-surface pattern](#quick-reference-how-to-order-tasks), with a pre-flight baseline task at the top if any later task requires a gate to be clean.

One-line rule of thumb:

**Keep splitting until each checkbox has one dominant verifier and one clean stop point, then stop.**

---

## Task sizing and splitting

Task size is **harness-relative**. The correct unit is the largest coherent slice that still fits the actual context budget of the loop you plan to run.

- Too broad: agent makes hidden design decisions and thrashes.
- Too granular: loop wastes iterations on bookkeeping and repeated context reload.
- Too context-heavy: task is semantically valid, but the model spends the iteration reloading unrelated facts.
- Right: one coherent behavior slice, one main risk, one main verification cluster, one honest stopping point.

### Signs a task is too large — split it

- Spans more than one independent file cluster or subsystem.
- Has more than one independent verification cluster.
- Mixes foundation work and feature work in one checkbox.
- Contains more than one obvious mergeable stopping point.
- Requires the agent to hold many unrelated policy rules in working memory.
- Likely to trigger broad search, broad refactor, and broad validation in the same iteration.

### Signs a task is too small — merge it

- Touches the same small file cluster as its neighbor.
- Shares the same main verification command as its neighbor.
- The first half does not produce a meaningful checkpoint on its own.
- Splitting only creates bookkeeping churn.
- Exists only so the next checkbox can finish it.
- Its only proof is "the next task worked."

### Two sizing profiles

Pick one explicitly before you start writing tasks.

**Medium profile** — use when the loop reloads the full artifact pack cleanly, the model is strong, and the repo area is familiar:

- one dominant outcome, one dominant risk
- one main code or data surface
- one main verification cluster
- roughly 2–5 primary files in one area
- 1–2 focused verification commands or selectors
- 3–7 `Done when` bullets

**Lightweight profile** — use when you expect smaller models, heavy per-iteration context reload, broad/unfamiliar repo area, or want more loop checkpoints:

- one dominant outcome, one dominant verification cluster
- one subsystem or tightly related file cluster
- one clean stopping point that would still be reviewable if the loop stopped there
- roughly 1–3 primary files (sometimes 4 if same route or subsystem)
- ideally 1 focused verification command or selector (occasionally 2)
- 2–5 `Done when` bullets

### Split / merge test

Before finalizing a checkbox, ask:

1. If the loop stopped halfway through this item, would the repo be in a clean, reviewable state?
2. Would I know exactly which verification command proves this half is done?
3. Does this checkbox have one dominant risk, or several unrelated ones?

Interpretation:

- If answers 1 and 2 are "yes," there is a valid split point.
- If answer 3 is "several," the task is probably too large.
- If none of the halves would be meaningful on their own, the task is already about right.

### Can you triple the task count?

Yes, sometimes — when the extra checkboxes come from real checkpoints, not mechanical crumbs.

Good reasons the count grows: a previous checkbox actually contained 2–3 independent verification clusters; a checkbox mixed contract freezing with feature work; a smaller model means medium tasks are no longer comfortable in one session; you want explicit clean stop points for long-running loops.

Bad reasons: turning one coherent change into a sequence of file chores; splitting edits that share the same verifier and stopping point; separate tasks for imports, renames, or tiny mechanical follow-through; doc-only subtasks that do not freeze an independent contract.

---

## Worked examples: good vs. bad tasks

### Example 1: too large vs. split

**Too large** — mixes three independent contracts in one checkbox:

```markdown
- [ ] Freeze the bootstrap contract in code, tests, and docs
```

**Better** — three tasks, each with its own verifier and stop point:

```markdown
- [ ] **Freeze Atmosphere CSS ownership**
  - Scope: `src/styles/atmosphere/*`, `tailwind.config.*`
  - Change: Atmosphere is the sole owner of the listed tokens; Harbor no longer redefines them.
  - Done when:
    - `rg "atm-color-" src/styles/harbor` returns no matches
    - `npx tsc --noEmit` exits 0
  - Stop and hand off if: a required token is owned by both systems and the design does not say which wins.

- [ ] **Freeze Harbor registration and TSX integration**
  - Scope: `src/components/harbor-bootstrap.tsx`, `src/types/harbor.d.ts`
  - Change: Harbor components are registered once at boot and typed for TSX usage.
  - Done when:
    - `rg "registerHarbor" src` returns exactly one call site
    - `npm test -- harbor-bootstrap` passes
  - Stop and hand off if: more than one registration site is required by a consumer.

- [ ] **Freeze contributor docs for the chosen authoring model**
  - Scope: `docs/contributing/components.md`
  - Change: Docs describe the frozen Atmosphere+Harbor model and link to the two tasks above.
  - Done when:
    - Doc file exists and lists both ownership rules
    - `npm run lint:docs` exits 0
  - Stop and hand off if: docs would need to describe a policy not yet settled in `design.md`.
```

### Example 2: too small vs. merged

**Too small** — two chores with no standalone checkpoint:

```markdown
- [ ] Add `import { formatDate } from './date'` to `ReleaseCard.tsx`
- [ ] Use `formatDate` in the `ReleaseCard` publish timestamp
```

**Better** — one task with a real outcome and verifier:

```markdown
- [ ] **Format ReleaseCard publish timestamp via the shared `formatDate` helper**
  - Scope: `src/components/ReleaseCard.tsx`
  - Change: ReleaseCard renders timestamps through the shared helper instead of inline formatting.
  - Done when:
    - `rg "toLocaleDateString" src/components/ReleaseCard.tsx` returns no matches
    - `npm test -- ReleaseCard` passes
  - Stop and hand off if: `formatDate` does not cover a required locale used by fixtures.
```

### Example 3: soft verbs vs. observable "done"

**Bad** — vague verbs, no verifier:

```markdown
- [ ] Ensure support for tenant-scoped promotion
```

**Better** — outcome, verifier, and stop condition are explicit:

```markdown
- [ ] **Refuse promotion when a staged tenant version has missing required rows**
  - Scope: `src/ingestion/promote.py`, `tests/unit/test_promote.py`
  - Change: `promote` exits non-zero and leaves the active version unchanged when required staged rows are missing.
  - Done when:
    - New test `test_promote_refuses_missing_rows` passes
    - `pytest tests/unit/test_promote.py` exits 0
    - Active version in the fixture DB is unchanged after the failed promote
  - Stop and hand off if: the set of "required rows" is not defined in `design.md`.
```

---

## Quality gates and baselines

The single most common quality failure in observed Ralph runs: a task has a `Done when: npm test exits 0` bullet, the test fails, and the loop marks the task complete anyway with a rationalization note explaining why the failure is "unrelated" or "pre-existing."

The rule:

**If a `Done when` check fails, the task is not done. The loop must stop and report the failure rather than reclassify the gate as inapplicable.**

The only legitimate exception is a check that the task itself explicitly categorizes as a known pre-existing failure — and that categorization must be made by the author at task-writing time, not by the agent at execution time.

### "Pre-existing" requires a before-baseline

"Pre-existing and unrelated" is only valid if there is documented evidence that the check was already failing *before this task's code changes ran*. Without a before-run, any test failure could equally be a regression introduced by this task.

A common failure mode:

1. Task A adds code. Its `Done when` list only says `npx tsc --noEmit exits 0`. The loop runs `tsc`, notes it is blocked by pre-existing errors, documents that, and moves on. `npm test` is never run.
2. Task B's `Done when` list says `npm test exits 0`. The loop runs `npm test` for the first time. It fails.
3. The loop classifies the failure as "pre-existing" because it "looks unrelated," even though no one verified the test suite was clean before Task A.

### Always include a pre-flight baseline task

When a chain of tasks collectively produces a feature and any task in the chain requires a quality gate to be clean, the first task in the chain should be a dedicated pre-flight that:

- Runs every gate later tasks require.
- Records the exact outputs (file paths, exit codes, failing test names).
- Documents any gates already failing and why.
- Names the baseline file so later tasks can reference it when distinguishing regressions.

Template:

```markdown
- [ ] **Pre-flight: record quality gate baselines for this change**
  - Scope: no code edits
  - Change: Capture the current state of all gates later tasks require.
  - Done when:
    - `.ralph/baselines/<change>-tsc.txt` exists with full `npx tsc --noEmit` output
    - `.ralph/baselines/<change>-test.txt` exists with full `npm test` output
    - `.ralph/baselines/<change>-readme.md` lists which gates passed, which failed, and for failing gates the exact failing identifiers
  - Stop and hand off if: any gate behavior is nondeterministic across two consecutive runs (flaky baseline is not a baseline).
```

### Name known-broken vs. required-clean validators

A subtler failure: the loop correctly learns to document and continue when `npx tsc --noEmit` fails due to known pre-existing repo errors. Then it applies the same permissive reasoning to `npm test`, which was supposed to be clean.

Loop instructions (prompt or wrapper) must explicitly list both categories:

- **Known-broken validators**: named by command or pattern. Loop may document failures and continue **only for these**.
- **Required-clean validators**: named explicitly. Failures are hard blockers with no exception, regardless of how the failure looks.

If only one list is named, the loop will generalize permissive behavior across all gates.

### Screenshots and large binary assets

Visual verification tasks that use Chrome DevTools MCP or Figma MCP screenshots can exceed provider context limits when the images are read back into working context. In observed runs this caused `failed to parse request` errors mid-iteration, forcing compaction and restart from a summary. Compaction discards intermediate state and can cause the loop to misclassify prior task completion.

Rules for visual tasks:

- Save screenshots to a repo-local file path; record the path in task notes.
- Do not re-read screenshot files into loop context after capture.
- For Chrome DevTools screenshots, use `filePath` to save and only record the path.
- Scope Figma MCP calls narrowly: use `excludeScreenshot: true` for structural inspection.
- If a task requires both a code change and a visual verification, split them: one task for the code change (verified by `tsc`/`npm test`), one for the visual check (verified by screenshot path capture and manual or scripted comparison).

---

## Human handoffs and operator-only work

Stage rollout validation, production-only checks, approvals, privileged access — these are not autonomous loop tasks.

Rules:

- Keep them documented in the artifact pack.
- Put them in a dedicated `Human Handoff` or `Operator Handoff` section of `tasks.md` or in `proposal.md`.
- Keep them **outside the checkbox path the loop consumes**. If your loop reads `- [ ]` items, operator items must not use that marker, or must live under a heading the loop instructions tell the agent to skip.
- Do not rely on "we discussed this in chat." The handoff must live in a durable file.

If the loop cannot honestly complete an item without a human or a protected environment, it should not be a normal task.

---

## The surrounding artifact package

A task list does not stand alone. Ralph reloads a package of artifacts each iteration. Each file answers a different question:

| Question | File | What it contains |
| -------- | ---- | ---------------- |
| Why are we doing this? | `proposal.md` | Problem, value, scope, non-goals, rollout boundaries, operator impact |
| What must be true when we are done? | `specs/**/spec.md` | Required behaviors, failure cases, scenarios, first-rollout vs. deferred |
| How should the system behave internally? | `design.md` | Algorithms, config shapes, failure semantics, compatibility, retention math, handoff flow |
| What is the next safe increment? | `tasks.md` | Ordered checkboxes using the task template above |
| How should the loop operate? | Loop prompt / wrapper | Reload rules, one-task-per-iteration, validator categories, stop conditions |

Authoring rules:

- **Resolve or explicitly defer policy before writing tasks.** Phrases like "may be shared or tenant-specific," "one option is," or "could support later" are fine while exploring; they are blockers once the loop starts. Resolve algorithms, fallback behavior, retention math, config shape, failure taxonomy, and compatibility-window behavior in `design.md`.
- **Specs must be deterministic.** If two good implementers could read the spec and make materially different choices, the spec is not loop-safe yet.
- **If a dedicated coverage artifact exists** (such as a `figma-route-map.md`), route and shared-surface tasks should reuse it as the durable source of truth instead of rediscovering coverage each iteration.
- **Run with full OpenSpec context when available.** Repo guidance favors `./scripts/ralph-run.sh tasks <change>` over raw `tasks.md` mode because `opsx-apply` reloads proposal, design, specs, and tasks each iteration. If you run raw `prd.json` or raw `tasks.md` mode, push more detail down into each item because the companion docs will not be reloaded.

### Loop-prompt / wrapper instructions

At minimum, the loop prompt must tell the agent to:

- Read `proposal.md`, `design.md`, `specs/**`, and `tasks.md` at the start of every iteration.
- Inspect prior iteration state before starting new work.
- Implement exactly one task per iteration.
- Run the exact validators relevant to that task.
- Mark progress **only** after verification succeeds.
- Stop and request help on ambiguity, contradictions, missing dependencies, or unresolved failures.
- Not invent new requirements or silently redefine "done."
- Preserve human handoff items as handoff items.

Additional critical rules to state explicitly:

- A `Done when` check failure is a hard blocker. Do not reclassify a failing gate as "pre-existing" or "unrelated" unless the task itself documents that pre-existing failure with explicit before-run evidence.
- Distinguish known-broken validators (document and continue) from required-clean validators (hard stop). Name both categories. Do not generalize permissive behavior from one to the other.
- Before writing any code in a task requiring quality gates to pass, run those gates and record the baseline. A failure seen after code changes but not in the baseline is a regression and a hard stop.
- Do not read large binary assets back into working context after capturing them. Save to disk, record the path, move on.
- Use portable shell constructs. In zsh, `status` is read-only; use `$?` directly rather than `status=$?`.

---

## `prd.json` specifics

The local JSON template is intentionally minimal:

```json
{
  "features": [
    {
      "category": "functional",
      "description": "Description of the feature requirement",
      "steps": ["Step 1 to verify", "Step 2 to verify"],
      "passes": false
    }
  ]
}
```

Because the schema is small, most of the real quality comes from how `description` and `steps` are written.

Rules:

1. **Treat `description` and `steps` as immutable truth.** The loop updates only `passes: false -> true`. If the requirement is wrong, a human edits it deliberately.
2. **Each feature is a behavior slice, not a file chore.** "Tenant-scoped promotion refuses to activate when required staged rows are missing," not "edit `promote.py`."
3. **Write `steps` as verification steps.** Observable, ordered, testable. Answer: how to observe the behavior, what to run, what to compare, what must be true for `passes` to become `true`.
4. **Each feature fits in one session.** If it needs multiple unrelated edits, multiple policy decisions, and several different verification modes, split it.
5. **Encode quality gates in `steps` or the loop prompt.** The schema does not carry them separately.
6. **Prefer end-to-end verification over code-only.** Unit tests passing does not prove the feature works end-to-end. For UI or workflow changes, include steps that simulate a real user path or a realistic system check.
7. **Manual/operator items go elsewhere.** Do not put stage validation or approvals into the autonomous JSON list unless clearly marked and excluded from execution.
8. **Order by dependency.** Schema and primitives first, then behavior, then integration, then docs. Do not make the agent infer the graph.
9. **Do not encode unresolved design choices as feature items.** "Decide whether cleanup is shared or tenant-specific" is a design question, not an implementation feature.
10. **Keep JSON concise; move rationale to companion docs.** JSON carries execution truth; motivation, scope, architecture, and handoffs live in `proposal.md` and `design.md`.

Good local `prd.json` item:

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

Why this works: outcome-based description, deterministic steps, explicit negative behavior, includes verification, no hidden product decision.

---

## Authoring checklist

Before calling an OpenSpec change "Ralph-friendly," confirm all of these:

### Artifact package

- [ ] `proposal.md` states scope, non-goals, and first-rollout boundaries.
- [ ] `design.md` does not leave core policy choices unresolved.
- [ ] Specs are specific enough that two implementers would not make materially different choices.
- [ ] Human/operator work is documented outside the autonomous checkbox path.
- [ ] The artifacts on disk contain all critical guidance that a fresh session needs.

### Task shape

- [ ] Each task uses the [task template](#quick-reference-the-task-template) (outcome title, scope, change, `Done when`, stop condition).
- [ ] Each task is atomic in the semantic sense, not merely tiny.
- [ ] Each task has one dominant outcome and one dominant verification cluster.
- [ ] Each task size matches the smallest model/harness expected to run it.
- [ ] No checkbox contains two obvious mergeable checkpoints that could be verified independently.
- [ ] If using a lightweight profile, the higher task count comes from real checkpoints rather than file-chore fragmentation.
- [ ] No task has been split so far that it loses its own meaningful verifier or clean stopping point.
- [ ] Each task has an explicit, runnable verification target.

### Ordering and dependencies

- [ ] Tasks are ordered contract → data → surface → shared wiring → final gates.
- [ ] No task depends on stage/prod/manual access unless it is explicitly a handoff item.
- [ ] Any task chain that requires `npm test` or browser tests to pass in a later task includes a pre-flight quality gate task at the start that records baseline output.

### Quality gates

- [ ] No task's `Done when` requires a gate to pass without the loop instructions making clear that gate failure is a hard stop.
- [ ] The loop instructions name known-broken validators (document and continue) and required-clean validators (hard stop), and forbid generalizing between them.
- [ ] Visual verification tasks save outputs to file paths and do not re-read large binary content back into loop context.
- [ ] Tasks requiring both a code change and a visual screenshot comparison are split into two tasks if combining them would risk context overflow.

### `prd.json` (if used)

- [ ] The loop is instructed to modify only `passes`.
- [ ] `description` and `steps` are outcome-based and deterministic.
- [ ] Manual/operator items are excluded from the autonomous list.

### Anti-patterns to avoid

- Vague verbs (`ensure`, `support`, `validate`) with no observable output.
- Asking the loop to decide policy mid-implementation.
- Mixing implementation, rollout, and manual validation in one checkbox.
- Splitting one migration or tightly related refactor into tiny loop iterations with no independent verification point.
- Hiding critical instructions only in chat history.
- Letting the agent rewrite feature definitions instead of only updating status.
- Declaring done from unit tests alone when the real behavior is end-to-end.
- Leaving "maybe this, maybe that" wording in design or proposal once implementation is about to start.
- Marking a task complete when a `Done when` check failed, with a rationalization note explaining why the failure "does not count."
- Classifying a failing quality gate as "pre-existing" without a documented before-baseline.
- Running `tsc` during code-writing tasks but not `npm test`, then running `npm test` for the first time in a later task and treating its failure as pre-existing.
- Generalizing the permissive "document and continue" pattern from a known-broken validator to validators that should be clean.
- Reading large binary assets back into working context after capture.
- Using reserved or read-only zsh variable names like `status`.

---

## Background and rationale

This section preserves the reasoning behind the rules above. If the quick-reference sections answer your authoring question, you can skip it.

### Why Ralph loops depend on artifacts, not chat

Ralph loops work because each iteration starts fresh, re-reads the prompt and repo state, and uses objective backpressure (tests, typechecks, render checks, browser checks). The loop is only as good as the artifacts it reloads every time.

The most important principle:

**Ralph does not want the smallest textual tasks. Ralph wants the largest coherent task that is still unambiguous, objectively verifiable, and comfortably completable in one agent session.**

Task size is harness-relative: with a strong model and disciplined full-artifact reload, medium tasks are often best; with a smaller model, noisy tool output, or heavy context reload, the same task may be too large. The correct unit is the largest coherent slice that still fits the actual context budget of the loop you plan to run.

### Lessons from prior Ralph-loop reviews

The `tenant-scoped-content-versioning` example and subsequent reviews produced the concrete rules in this guide. Key findings:

1. **Medium atomic tasks beat both vague tasks and micro-tasks.** The worst plans combined tiny mechanical subtasks with broad ambiguous ones. Better: merge obvious same-file mechanical work, split only tasks that still hide policy or control-flow decisions.

2. **Human handoffs must be documented but not executed by the loop.** Stage rollout validation, signoff, and production-only checks belong in a dedicated handoff section, outside the checkbox path the loop consumes.

3. **Unresolved policy questions become loop churn.** Phrases like "reuse the current staged version for the same release cycle," "validate critical failures," or "may be shared or tenant-specific" are acceptable in human planning but bad for a Ralph loop. A fresh-session agent will treat them as missing decisions and thrash.

4. **Every wide task needs explicit "done when" signals.** Verbs like `ensure`, `validate`, `keep`, or `support` are too soft on their own.

5. **Full OpenSpec context is better than raw task-file mode.** Repo guidance favors `./scripts/ralph-run.sh tasks <change>` over raw `tasks.md` mode because `opsx-apply` reloads proposal, design, specs, and tasks. A task list can be shorter when the design/specs fully resolve tricky decisions, but only if the loop actually reloads those artifacts each iteration.

6. **"Done when" gates are hard stops, not soft guidelines.** The most common single-task quality failure is a loop marking a task complete after a `Done when` check failed, with a rationalization note. The gate is self-authorizing; the loop decides the gate does not apply, bypasses it, and moves on, recording a completion claim the stated verifier never confirmed.

7. **"Pre-existing" is a claim that requires a before-baseline, not a judgment call.** In the absence of a before-baseline, any test failure during a task could equally be a regression. Baselines must exist in writing before code changes land.

8. **Permissive reasoning for a known-broken validator bleeds to all validators.** A loop told "document tsc failures and continue" will generalize that to `npm test`, browser tests, or any other gate. Fix: name both known-broken and required-clean validators explicitly.

9. **Establish baselines before the first code-writing task in a chain.** Otherwise the loop has no clean before-state and cannot reliably distinguish its own regressions from pre-existing issues.

10. **Large binary assets in tool responses cause context overflow and loop restarts.** Screenshots read back into context can exceed provider limits, force compaction, and discard intermediate state — including prior task completion status.

### What "Ralph-friendly" means in practice

A Ralph-friendly spec or task set has these properties:

1. One loop item equals one coherent slice of behavior.
2. "Done" is frozen up front and not negotiated mid-run.
3. Verification is explicit and runnable.
4. The agent is not asked to choose product or rollout policy.
5. Human-only checks are durable but excluded from autonomous execution.
6. Repeated failure patterns are corrected by editing the artifact, not by hoping the next session "remembers."
7. The loop can stop honestly with a blocker rather than improvise.

### Bottom line

The best Ralph-friendly OpenSpec proposal is not the most detailed artifact in the abstract. It is the artifact set that leaves the loop with the fewest judgment calls.

If a fresh-session agent can read the artifacts, pick one coherent increment, verify it objectively, stop honestly on blockers, and leave the repo in a clean state — the proposal is Ralph-friendly.

---

## Source notes

Durable repo-local sources used:

- `scripts/RALPHY-OPENSPEC-RUNNING.md`
- `scripts/templates/features-template.json`
- `scripts/templates/prd-template.md`
- `scripts/ralph-run.sh`
- `hidden/RALPH-WIGGUM-OPENSPEC.md`
- `hidden/RALPH-WIGGUM-CURSOR.md`

Prior internal Ralph-loop review conversations also informed this note.

External references consulted:

- Anthropic, "Effective harnesses for long-running agents" — `https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents`
- Anthropic, "Harness design for long-running application development" — `https://www.anthropic.com/engineering/harness-design-long-running-apps/`
- Claude docs, "Claude 4 best practices" → "Multi-context window workflows" — `https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices#multi-context-window-workflows`
- Geoffrey Huntley, "Ralph Wiggum as a software engineer" — `https://ghuntley.com/ralph/`
- Geoffrey Huntley, "everything is a ralph loop" — `https://ghuntley.com/loop/`
- Ralph TUI docs: `create-prd` and `convert` — `https://ralph-tui.com/docs/cli/create-prd`, `https://ralph-tui.com/docs/cli/convert`

