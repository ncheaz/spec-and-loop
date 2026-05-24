
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
6. No `- [ ]` checkbox in a numbered implementer section requires human-in-browser verification, a deployed-URL check, screen-reader judgement, design-review approval, or any other operator-only evidence. Such items either (a) get an automated verifier (Playwright / Puppeteer / Chrome DevTools MCP / `axe-core` / `lighthouse` headless), or (b) move to a dedicated `## Manual verification (operator-only, post-loop)` section that uses `- [op]` markers instead of `- [ ]`. `ralph-run` does not iterate on the operator-only section. Tagging a task `[manual]` and keeping it in the loop is forbidden — every `[manual]` checkbox is, by construction, a guaranteed mid-loop `BLOCKED_HANDOFF`. See the **Human-loop boundary** section in `OPENSPEC-RALPH-BP.md` for the full rule and refactor examples.
7. No two pending tasks claim ownership of the same file/route/symbol; no task's `Stop and hand off if:` would trigger on the normal completion of a later task.

Remediate every finding by editing `tasks.md` directly, then re-run `openspec validate <change>` before starting the loop. If you cannot remediate a finding (it requires a product/policy decision), surface it to the user instead of starting the loop.
