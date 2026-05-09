
## Ralph Wiggum Compliance

This project follows the Ralph Wiggum method for iterative OpenSpec development.

Before generating any OpenSpec artifacts, you MUST:
- Read `openspec/OPENSPEC-RALPH-BP.md` (Ralph Wiggum authoring guide)
- Verify proposals against the Ralph authoring checklist
- Ensure tasks use the task template with objective done-when conditions
- Ensure each task uses the narrowest verifier that proves its scope; use broad gates only with baseline classification or final integration tasks
- Include explicit stop-and-hand-off conditions in every task

Before handing `tasks.md` to `ralph-run` (whether you just authored it or just edited it), you MUST run the **Pre-loop scope-handoff pre-scan** from `openspec/OPENSPEC-RALPH-BP.md` against every pending `- [ ]` task. For each pending task, statically verify:

1. Every file path in `Scope:` / `Done when:` / `Stop and hand off if:` resolves on disk (`ls`, `git ls-files`).
2. Every referenced section/heading exists in its named document with the exact heading text (`rg "^## <heading>$" <file>`).
3. The verifier's actual reach matches the `Scope:` statement; broaden scope or narrow the verifier when they disagree.
4. Multi-file gates that may hit pre-existing failures enumerate them in a "Pre-existing unrelated failures" sub-section with file:line references and a "do not stop on these" clause.
5. `Stop and hand off if:` conditions are objective (grep-able evidence, exact class/selector names) — never subjective ("looks wrong", "cannot be explained").
6. Any task requiring human-in-browser verification, deployed-URL checks, or visual judgment is tagged `[manual]` in its title with an explicit "manual verification required — emit BLOCKED_HANDOFF with verification template" stop condition.
7. No two pending tasks claim ownership of the same file/route/symbol; no task's `Stop and hand off if:` would trigger on the normal completion of a later task.

Remediate every finding by editing `tasks.md` directly, then re-run `openspec validate <change>` before starting the loop. If you cannot remediate a finding (it requires a product/policy decision), surface it to the user instead of starting the loop.
