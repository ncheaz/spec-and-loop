# Ralph-Friendly Task Authoring Rules

You are writing `tasks.md` for an OpenSpec change that will be executed by `ralph-run` in a fresh-session loop. Every iteration re-reads this file plus proposal.md, design.md, and specs. The loop implements one task per iteration, runs verification, and marks progress only on success.

When an iteration emits `BLOCKED_HANDOFF`, the runner may now invoke the supervisor loop before surfacing the handoff to a human. That makes the implementer's structured blocker note load-bearing: it must describe the real scope conflict or missing precondition precisely enough for either a human or the supervisor to patch `tasks.md` without guessing.

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
- A pre-flight baseline task must produce runner-recognizable artifacts, not just human-readable logs: baseline files must live under the change-local `.ralph/baselines/` directory that `ralph-run` reads, their filenames must identify the gate (`typecheck`, `lint`, `test`, etc.), and every captured gate file must end with a literal `EXIT=<integer>` line. The runner discovers baselines in three supported layouts:
  - flat unprefixed: `.ralph/baselines/<gate>.txt`
  - flat prefixed: `.ralph/baselines/<change>-<gate>.txt`
  - nested: `.ralph/baselines/<change>/<gate>.txt` (one level of subdirectory; useful when a single change emits many gate files and authors want to group them under a slug folder)
- If a later task is allowed to repair baseline artifact compatibility, say so explicitly. Its `Scope:` must name the change-local `.ralph/baselines/` directory and its `Done when:` bullets must require the missing or malformed baseline files to be restored with parseable `EXIT=<integer>` footers. Without that authorization, baseline artifact repair remains an operator handoff, not product implementation work.
- Authorized cleanup is intentionally narrow: the named files must be backticked, the cleanup is limited to compiler/lint-only fixes, and `ralph-run` gives the agent one repair attempt for those files on that task. If the gate still fails after that attempt, the next prompt tells the agent to hand off instead of retrying.

Pre-flight template:
```markdown
- [ ] **Pre-flight: record quality gate baselines**
  - Scope: no code edits; writes only under `.ralph/baselines/`
  - Change: Capture current state of all gates later tasks require.
  - Done when:
    - one of `.ralph/baselines/<gate>.txt`, `.ralph/baselines/<change>-<gate>.txt`, or `.ralph/baselines/<change>/<gate>.txt` exists for each gate with full output
    - every captured gate file ends with a literal `EXIT=<integer>` line
    - `.ralph/baselines/<change>-readme.md` (flat layout) or `.ralph/baselines/<change>/readme.md` (nested layout) lists passing/failing gates, exit codes, and exact failing identifiers
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
- **Manual / human-in-the-loop steps as `- [ ]` checkboxes inside the implementer task list.** See [Human-loop boundary](#human-loop-boundary-no-manual-steps-mid-loop). Every `[manual]`-tagged checkbox is, by construction, a guaranteed mid-loop `BLOCKED_HANDOFF`. The runner cannot drive Chrome/DevTools/eyeballs, so the iteration is wasted: the agent reads the task, immediately stops, and the operator now has to context-switch into the loop instead of receiving a single batched verification list at the end.
- File chores (separate tasks for imports, renames, tiny follow-through)
- Tasks whose only proof is "the next task worked"
- `Done when` that only checks unit tests when real behavior is end-to-end
- Visual verification without splitting from code changes (context overflow risk)
- "Maybe this, maybe that" wording in tasks or specs once loop starts
- Repo-wide or slow validators for a narrow task when a focused verifier exists (`npm test`, `make all`, full browser/e2e suites)
- Ambiguous package-manager forwarding such as `npm test -- event-schema` unless confirmed to execute only the intended test scope

## Human-loop boundary (no manual steps mid-loop)

`ralph-run` drives **only** what an agent in a fresh session can execute non-interactively: shell commands, file edits, test runners, static analyzers, scripted browsers (e.g. Playwright, Puppeteer, Chrome DevTools MCP). Anything that needs a human in front of a real browser, eyes on a deployed URL, a touch device, an authenticated SSO session, screen-reader judgement, or design-review approval is **operator work**, not loop work.

Operator work MUST NOT live as `- [ ]` checkboxes interleaved with implementer tasks. Three reasons:

1. **Every interleaved manual step is a guaranteed `BLOCKED_HANDOFF`.** The agent reads the task, sees a stop-condition it cannot satisfy, and emits a hand-off. Iteration cost: 1 prompt + 1 supervisor attempt + 1 operator round-trip, for zero implementation progress.
2. **Loop momentum dies on context switches.** Each hand-off forces the operator to leave whatever they were doing, drive Chrome themselves, capture evidence files at exact paths, and resume the loop. A single change with five `[manual]` checkboxes burns five context switches the operator did not budget for.
3. **Manual evidence is rarely on the critical path of the implementation.** It almost always belongs *after* the code, types, tests, and build are green — i.e. as a post-loop acceptance pass the operator runs once, against a finished change, with a single batched checklist.

### Placement rules

- **Implementer tasks** (`## 1. …`, `## 2. …`, etc.) contain ONLY checkboxes whose verifiers an agent can run from `bash` / `pnpm` / `npx` / `rg` / a scripted browser. No `[manual]` markers. No "operator opens Chrome" stop conditions.
- **Operator verification** lives in a dedicated, post-loop section titled exactly `## Manual verification (operator-only, post-loop)`. Items in this section are NOT `- [ ]` checkboxes — use `- [op]` markers, plain bullets, or a numbered list. `ralph-run` does not iterate on this section. The final integration gate (last implementer task) references this section as a downstream operator step, not as a loop-step dependency.
- **Mixed tasks are forbidden.** A task that does code + manual verification in one checkbox is split: the code half stays in the implementer list with an automated verifier; the manual half moves to the operator-only section.

### When you think you need a manual step, try these first

Before adding ANY operator-only item, exhaust automation:

| Manual step you are tempted to write | Automate it as |
|---|---|
| "Operator opens `/some-route` in Chrome and reads computed style of `<h1>`" | Boot the prod/dev server in the loop; drive it with Playwright, Puppeteer, or the Chrome DevTools MCP; assert `getComputedStyle()` programmatically; emit a JSON evidence file and a screenshot to a fixed path. |
| "Operator confirms there are no console errors on `/foo`" | Same headless probe; assert `page.on('console')` collected zero `error`-level messages. |
| "Operator visually confirms the layout looks correct" | Snapshot test (`vitest --run --update` for first-run baseline; subsequent diffs are automated). |
| "Operator deploys to staging and clicks through the flow" | Move to the post-loop operator section. Staging deploys are a release pipeline concern, not an implementer-loop concern. |
| "Operator checks accessibility with screen reader / contrast tooling" | Run `axe-core` / `pa11y` / `lighthouse` headless; assert score thresholds. Move qualitative judgement (e.g. "is this announcement clear?") to the post-loop section. |
| "Operator approves design fidelity against Figma" | Move to post-loop. Design-review approval is operator work by definition. |

If — after honest effort — automation is genuinely impossible for an item, that item belongs in the post-loop operator section. It does not get promoted back into the checkbox list with a `[manual]` tag.

### Section template

```markdown
## 7. Final integration gate

- [ ] **7.1 Final integration gate: all pre-flight gates pass or match baseline**
  - Scope: full repository; no code edits in this task
  - Done when: `<gate commands>` exit 0 or match the pre-flight baseline.
  - Stop and hand off if: any new failure identifier appears.

## Manual verification (operator-only, post-loop)

> Run after the loop completes and all implementer checkboxes are checked.
> `ralph-run` does NOT iterate on this section. These items exist to give the
> operator a single batched acceptance pass against the finished change.

- [op] **Production-served `/docs` H1 paints at the Nextra default scale**
  - URL: `http://localhost:<port>/docs/atmosphere/components/accordion` (after `pnpm start`)
  - DevTools snippet:
    ```js
    (() => {
      const h1 = document.querySelector('article h1');
      const cs = getComputedStyle(h1);
      return { fontSize: cs.fontSize, fontWeight: cs.fontWeight, marginTop: cs.marginTop };
    })()
    ```
  - Expected: `{ fontSize: "36px", fontWeight: "700", marginTop: "8px" }`
  - Save evidence: `<change>/.ralph/baselines/<change>-prod-h1.txt` and `.png`
- [op] **Visual regression sweep on representative non-`/docs` routes**
  - Routes: `/`, `/solutions/cdsi`, `/solutions/atmosphere`, …
  - Method: `pnpm start`, viewport screenshot per route, side-by-side compare against `<change>/.ralph/baselines/<change>-sweep-<slug>.png`.
```

### Refactor example: BAD vs. GOOD

**BAD — manual step interleaved in implementer list (every loop pass on this task hands off):**

```markdown
## 4. Implementation — production-build cascade verification

- [ ] **4.1 Verify cascade-layer wrapper survives `next build`**
  - Scope: read-only inspection of `.next/static/css/**`
  - Done when: `rg '@layer\s+atm-base' .next/static/css/` reports ≥1 match
  - Stop and hand off if: pattern not found

- [ ] **4.2 [manual] Verify `/docs` H1 computed style against `next start`**
  - Scope: manual verification against `pnpm start`
  - Done when: operator captures `<change>-prod-h1.txt` and `.png` showing fontSize=36px
  - Stop and hand off if: manual verification required — emit BLOCKED_HANDOFF
```

**GOOD — automate it, or move it to the post-loop operator section:**

```markdown
## 4. Implementation — production-build cascade verification

- [ ] **4.1 Verify cascade-layer wrapper survives `next build`**
  - Scope: read-only inspection of `.next/static/css/**`
  - Done when: `rg '@layer\s+atm-base' .next/static/css/` reports ≥1 match
  - Stop and hand off if: pattern not found

- [ ] **4.2 Verify `/docs` H1 computed style via headless probe of `next start`**
  - Scope: `scripts/probe-prod-h1.mjs` (new); writes evidence under `<change>/.ralph/baselines/`
  - Change: A node script boots `next start` on a free port, drives Playwright/Puppeteer
    to load `/docs/atmosphere/components/accordion`, reads `getComputedStyle()` on
    `article h1`, asserts the three values, writes a labeled `.txt` and a viewport
    screenshot, and tears the server down.
  - Done when:
    - `node scripts/probe-prod-h1.mjs` exits 0
    - `<change>/.ralph/baselines/<change>-prod-h1.txt` exists with labeled lines
      `fontSize: "36px"`, `fontWeight: "700"`, `marginTop: "8px"`
    - `<change>/.ralph/baselines/<change>-prod-h1.png` exists
  - Stop and hand off if:
    - `next start` cannot bind a free port in 30s
    - the headless browser cannot resolve `nextra-theme-docs/style-prefixed.css`
```

Or — when automation is genuinely not feasible (e.g. SSO-gated environments, real device testing):

```markdown
## Manual verification (operator-only, post-loop)

- [op] **`/docs` H1 paints at 36px / 700 / 8px on a real Chrome window**
  - Steps, snippet, expected values, evidence paths — see template above.
```

### Pre-existing `[manual]` checkboxes

If a `tasks.md` predating this rule still has `[manual]` checkboxes, the pre-scan (rule #6 below) will flag them. Remediate by either (a) automating the step into a real implementer task with a programmatic verifier, or (b) moving it to the post-loop operator section. Do not start the loop until every implementer checkbox is loop-executable.

## Pre-loop scope-handoff pre-scan

Before handing `tasks.md` to `ralph-run`, audit every pending `- [ ]` checkbox for the seven failure modes that most commonly cause `BLOCKED_HANDOFF` mid-loop. Each one is cheap to spot statically and expensive to discover after the loop has burned an iteration plus an auto-resolve attempt on it.

For every pending task, verify in this order:

1. **Referenced files exist.** Every path in `Scope:`, `Done when:`, and `Stop and hand off if:` resolves with `ls` or `git ls-files`. Dangling references (`SPEC.md` when only `SPEC-IA.md` exists, line ranges that drifted after a prior task, deleted fixtures) cause the agent to either hand off or hallucinate.
2. **Referenced sections exist.** `### Acceptance Criteria items 1–9` must point to a real numbered list in a real document. Heading references must match the actual heading text (case-sensitive `rg "^## <heading>$" <file>`).
3. **Verifier scope matches scope statement.** If `Scope:` names one file but `Done when:` runs a command that touches more (`pnpm test:update-snapshots` regenerates snapshots for *all* test files, not just one), either broaden `Scope:` to match the verifier's reach or replace the verifier with a narrower one (`vitest --run <single-test-file>`).
4. **Pre-existing failures are classified.** If the verifier is a multi-file gate and the repo has known unrelated failures, they must be enumerated in a "Pre-existing unrelated failures" sub-section with file:line references and an explicit "do not stop on these" clause. See [Quality gates](#quality-gates).
5. **Stop-conditions are objective.** Phrases like "diffs that cannot be explained" or "behavior looks wrong" are subjective and the agent will either over-trigger or under-trigger. Replace with grep-able evidence: "snapshot diff contains `atm-*` class on a docs MDX content element," "`hbr-tab-panel` appears in the rendered DOM."
6. **Manual-only steps are NOT in the implementer checkbox list.** Per [Human-loop boundary](#human-loop-boundary-no-manual-steps-mid-loop), every `- [ ]` checkbox must be loop-executable: a verifier the agent can run from `bash` / `pnpm` / `npx` / `rg` / a scripted browser, with no human required. Concretely, fail this check if any pending checkbox:
   - has a `[manual]` (or equivalent) marker in its title, OR
   - has a `Stop and hand off if:` clause containing "manual verification required", "operator captures", "human-in-browser", "eyes on", or any equivalent phrasing whose literal effect is a guaranteed `BLOCKED_HANDOFF` on first encounter, OR
   - has a `Done when:` clause whose evidence files can only come from a real human's browser session (DevTools paste, screen-reader transcript, deployed-staging URL screenshot, design-review sign-off).

   Remediate by EITHER (a) replacing the task with a programmatic verifier — boot a server, drive Playwright/Puppeteer/Chrome DevTools MCP, assert `getComputedStyle()` / DOM state / network state in code; OR (b) moving the item out of the numbered implementer sections into a `## Manual verification (operator-only, post-loop)` section using `- [op]` markers (or plain bullets) instead of `- [ ]`. `ralph-run` does not iterate on the operator-only section. See the [Refactor example](#refactor-example-bad-vs-good) for the exact transformation.

   This rule is stricter than the previous "tag manual tasks with `[manual]`" guidance: tagging a task `[manual]` does not authorize keeping it in the loop. The marker exists only for static analysis to catch leftover items that escaped placement; the placement itself is the real fix.
7. **Cross-task scope conflicts are absent.** If task N writes a file that task N-1 already finished, or task N's `Stop and hand off if:` would trigger on the normal completion of task N+1, reorder or merge them. Read tasks in execution order and confirm no two tasks claim ownership of the same file/route/symbol.

If any check fails, edit `tasks.md` before starting the loop. The cost of a static edit is a few seconds; the cost of discovering the same issue at iteration 21 is a `BLOCKED_HANDOFF`, a dirty worktree, and a context-poisoned restart.

This pre-scan is mandatory before `ralph-run` on a freshly authored or freshly edited `tasks.md`. After remediation, re-run `openspec validate <change>` to confirm the change still validates.

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
- Human/operator work is outside the `- [ ]` checkbox path — see [Human-loop boundary](#human-loop-boundary-no-manual-steps-mid-loop). Operator items go under `## Manual verification (operator-only, post-loop)` with `- [op]` markers, NOT in numbered implementer sections.

If any of these are unresolved, stop and fix the artifact before writing tasks.

## prd.json rules (if used)

- `description` and `steps` are immutable; loop updates only `passes`
- Each feature = one behavior slice, not a file chore
- `steps` are verification steps: observable, ordered, testable
- Each feature fits in one session; split if it needs multiple unrelated edits
- Order by dependency; do not make the agent infer the graph
- No unresolved design choices as feature items
