# Ralph-Friendly Task Authoring Rules

You are writing `tasks.md` for an OpenSpec change that will be executed by `ralph-run` in a fresh-session loop. Every iteration re-reads this file plus proposal.md, design.md, and specs. The loop implements one task per iteration, runs verification, and marks progress only on success.

## Task template

Every `- [ ]` checkbox must follow this shape:

```markdown
- [ ] **<short imperative outcome>**
  - Scope: <1 subsystem or file cluster; name the primary files>
  - Change: <what becomes true after this task>
  - Done when:
    - <observable change tied to code/data/doc>
    - <verifier command with expected result>
  - Stop and hand off if:
    - <concrete blocker or ambiguity condition>
```

Enforced rules:
- Title is one outcome, not a list. If you need "and" twice, split.
- Scope names files so the loop does not hunt.
- `Done when` bullets are observable or runnable. No soft verbs (`ensure`, `support`, `validate`, `keep`) without attached evidence.
- `Stop and hand off if` gives the loop written permission to halt.

## Ordering

1. Pre-flight baseline (if any later task needs a clean gate)
2. Freeze shared contracts (types, interfaces, boundaries)
3. Freeze typed data, config, schemas
4. One user-facing surface per task
5. Wire shared emitters and cross-links
6. Final integrated quality gates (hard stop allowed)

Do not make the agent infer dependencies. Order checkboxes in execution order. Mark independent tasks explicitly.

## Sizing and splitting

For each candidate task, count:
- V = independent verification clusters
- S = independent subsystems or file clusters
- C = clean stopping points (repo stays reviewable)
- P = unresolved policy questions

Rules:
- P > 0 → stop. Fix design.md first.
- V, S, or C > 1 → split. Target subtasks = max(V, C).
- Stop splitting when a child has no standalone verifier.

**Medium profile** (strong model, familiar repo): 1 outcome, 2–5 files, 1–2 verifiers, 3–7 `Done when` bullets.
**Lightweight profile** (smaller model, unfamiliar repo): 1 outcome, 1–3 files, 1 verifier, 2–5 `Done when` bullets.

Split test: if the loop stopped halfway, would the repo be clean and reviewable? If yes and there's a verifier for each half, split. If no half is meaningful alone, don't split.

## Quality gates

- A failing `Done when` check means the task is NOT done. No rationalization.
- "Pre-existing" requires a before-baseline. Without one, any failure could be a regression.
- First task in a chain that needs clean gates must be a pre-flight baseline that records gate output.
- Explicitly distinguish known-broken validators (document and continue) from required-clean validators (hard stop). If only one is named, the loop generalizes permissively.

Pre-flight template:
```markdown
- [ ] **Pre-flight: record quality gate baselines**
  - Scope: no code edits
  - Change: Capture current state of all gates later tasks require.
  - Done when:
    - `.ralph/baselines/<change>-<gate>.txt` exists for each gate with full output
    - `.ralph/baselines/<change>-readme.md` lists passing/failing gates and exact failing identifiers
  - Stop and hand off if: any gate is nondeterministic across two runs.
```

## Anti-patterns (do not do these)

- Soft verbs without observables (`ensure X`, `support Y`, `validate Z`)
- Unresolved policy as tasks ("decide whether X or Y")
- Mixing implementation + rollout + manual validation in one checkbox
- File chores (separate tasks for imports, renames, tiny follow-through)
- Tasks whose only proof is "the next task worked"
- `Done when` that only checks unit tests when real behavior is end-to-end
- Visual verification without splitting from code changes (context overflow risk)
- "Maybe this, maybe that" wording in tasks or specs once loop starts

## Examples

**Bad** — vague, no verifier:
```markdown
- [ ] Ensure support for tenant-scoped promotion
```

**Good** — outcome, verifier, stop condition:
```markdown
- [ ] **Refuse promotion when staged tenant has missing required rows**
  - Scope: `src/ingestion/promote.py`, `tests/unit/test_promote.py`
  - Change: `promote` exits non-zero and leaves active version unchanged when required rows are missing.
  - Done when:
    - New test `test_promote_refuses_missing_rows` passes
    - `pytest tests/unit/test_promote.py` exits 0
  - Stop and hand off if: "required rows" not defined in design.md.
```

**Bad** — too large, three contracts in one:
```markdown
- [ ] Freeze the bootstrap contract in code, tests, and docs
```

**Good** — split into one task per contract:
```markdown
- [ ] **Freeze Atmosphere CSS ownership**
  - Scope: `src/styles/atmosphere/*`, `tailwind.config.*`
  - Change: Atmosphere is sole owner of listed tokens; Harbor no longer redefines them.
  - Done when:
    - `rg "atm-color-" src/styles/harbor` returns no matches
    - `npx tsc --noEmit` exits 0
  - Stop and hand off if: a token is owned by both systems and design does not resolve.

- [ ] **Freeze Harbor registration and TSX integration**
  - Scope: `src/components/harbor-bootstrap.tsx`, `src/types/harbor.d.ts`
  - Change: Harbor components registered once at boot, typed for TSX.
  - Done when:
    - `rg "registerHarbor" src` returns exactly one call site
    - `npm test -- harbor-bootstrap` passes
  - Stop and hand off if: more than one registration site is required.
```

**Bad** — too small, file chores:
```markdown
- [ ] Add `import { formatDate } from './date'` to `ReleaseCard.tsx`
- [ ] Use `formatDate` in the `ReleaseCard` publish timestamp
```

**Good** — merged into one coherent outcome:
```markdown
- [ ] **Format ReleaseCard timestamp via shared `formatDate` helper**
  - Scope: `src/components/ReleaseCard.tsx`
  - Change: ReleaseCard renders timestamps through the shared helper.
  - Done when:
    - `rg "toLocaleDateString" src/components/ReleaseCard.tsx` returns no matches
    - `npm test -- ReleaseCard` passes
  - Stop and hand off if: `formatDate` does not cover a required locale.
```

## Artifact requirements

Before writing tasks, confirm:
- `proposal.md` has scope, non-goals, rollout boundaries
- `design.md` resolves all policy (no "may be X or Y")
- Specs are deterministic (two implementers would make the same choices)
- Human/operator work is outside the `- [ ]` checkbox path

If any of these are unresolved, stop and fix the artifact before writing tasks.

## prd.json rules (if used)

- `description` and `steps` are immutable; loop updates only `passes`
- Each feature = one behavior slice, not a file chore
- `steps` are verification steps: observable, ordered, testable
- Each feature fits in one session; split if it needs multiple unrelated edits
- Order by dependency; do not make the agent infer the graph
- No unresolved design choices as feature items
