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
- Verifier commands use the narrowest runnable command that proves the scoped change. Prefer a named test file, spec pattern, package script, or static check over a full-suite command.
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

## Surgical validation

Task validators must be surgical and efficient so the loop spends tokens on implementation signal, not unrelated test noise.

- Start every task with the cheapest verifier that proves the task's stated scope: direct unit test file, targeted node/browser spec, exact lint/typecheck command for touched files if available, schema validator, or focused `rg` assertion.
- Verify command routing before writing it into `tasks.md`. If `npm test -- <pattern>` or similar still runs unrelated suites in that repo, write the direct runner command instead (for example, `pnpm exec vitest --config <config> --run <test-file>`).
- Use broad gates (`npm test`, `pnpm typecheck`, `make all`, browser/e2e suites) only when the task owns repo-wide integration behavior, when they are recorded as pre-flight baselines, or in a final integrated quality-gate task.
- If a broad gate is still required for a narrow task, pair it with explicit baseline classification: `` `<gate command>` exits 0, or failures match the pre-flight baseline with no new failures in this task's scope ``.
- Prefer one focused verifier per task. Add a second verifier only when it proves a different artifact class, such as a schema validator plus one targeted unit test.

## Quality gates

- A failing `Done when` check means the task is NOT done. No rationalization.
- "Pre-existing" requires a before-baseline. Without one, any failure could be a regression.
- First task in a chain that needs clean gates must be a pre-flight baseline that records gate output.
- Explicitly distinguish known-broken validators (document and continue) from required-clean validators (hard stop). If only one is named, the loop generalizes permissively.
- If a pre-flight baseline records a failing gate, later tasks MUST NOT require only a strict clean result for that same gate unless the task is intentionally responsible for fixing that baseline failure. Use one of these explicit forms:
  - Baseline classification: `` `<gate command>` exits 0, or failures match the pre-flight baseline with no new failures in this task's scope ``
  - Authorized cleanup: `` `<gate command>` exits 0 after fixing the named baseline failures in `<path/one.ts>` and `<path/two.ts>` ``
  - Hard blocker: `` `<gate command>` exits 0; baseline failures are not allowed for this task ``
- When strict clean-gate text conflicts with a failing pre-flight baseline and no classification/cleanup rule is written, `ralph-run` will warn the agent to stop with `BLOCKED_HANDOFF` instead of spending iterations on unauthorized cleanup.
- When a task refers to a pre-flight baseline, or follows a completed pre-flight baseline task, but the matching `.ralph/baselines/<change>-<gate>.txt` artifact is missing, `ralph-run` will warn the agent to stop with `BLOCKED_HANDOFF` instead of treating undocumented failures as known.
- A pre-flight baseline task must produce runner-recognizable artifacts, not just human-readable logs: baseline files must live under the change-local `.ralph/baselines/` directory that `ralph-run` reads, their filenames must identify the gate (`typecheck`, `lint`, `test`, etc.), and every captured gate file must end with a literal `EXIT=<integer>` line.
- If a later task is allowed to repair baseline artifact compatibility, say so explicitly. Its `Scope:` must name the change-local `.ralph/baselines/` directory and its `Done when:` bullets must require the missing or malformed baseline files to be restored with parseable `EXIT=<integer>` footers. Without that authorization, baseline artifact repair remains an operator handoff, not product implementation work.
- Authorized cleanup is intentionally narrow: the named files must be backticked, the cleanup is limited to compiler/lint-only fixes, and `ralph-run` gives the agent one repair attempt for those files on that task. If the gate still fails after that attempt, the next prompt tells the agent to hand off instead of retrying.

Pre-flight template:
```markdown
- [ ] **Pre-flight: record quality gate baselines**
  - Scope: no code edits; writes only under `.ralph/baselines/`
  - Change: Capture current state of all gates later tasks require.
  - Done when:
    - `.ralph/baselines/<gate>.txt` or `.ralph/baselines/<change>-<gate>.txt` exists for each gate with full output
    - every captured gate file ends with a literal `EXIT=<integer>` line
    - `.ralph/baselines/<change>-readme.md` lists passing/failing gates, exit codes, and exact failing identifiers
  - Stop and hand off if: any gate is nondeterministic across two runs, or any captured baseline file is missing the `EXIT=<integer>` final line after retrying the capture command.
```

Baseline artifact compatibility repair template:
```markdown
- [ ] **Repair pre-flight baseline artifact compatibility**
  - Scope: `.ralph/baselines/`, `tasks.md`
  - Change: Restore or regenerate baseline artifacts so `ralph-run` can classify later quality-gate failures.
  - Done when:
    - change-local `.ralph/baselines/<gate>.txt` files exist for every gate referenced by later baseline-classified tasks
    - every restored gate file ends with a literal `EXIT=<integer>` line
    - the baseline readme records the source of any restored artifact and the exit code for each gate
  - Stop and hand off if:
    - the original gate output is missing, the original exit code cannot be recovered, or restoring the artifact would require rerunning a nondeterministic gate.
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
- Repo-wide or slow validators for a narrow task when a focused verifier exists (`npm test`, `make all`, full browser/e2e suites)
- Ambiguous package-manager forwarding such as `npm test -- event-schema` unless confirmed to execute only the intended test scope

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
    - `npm exec vitest --run src/components/harbor-bootstrap.test.tsx` exits 0
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
    - `npm exec vitest --run src/components/ReleaseCard.test.tsx` exits 0
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
