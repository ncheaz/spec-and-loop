## Context

Two specs converge on the same `/docs` surface and must be implemented together to avoid wasted work and visible regressions:

1. **`hidden/pages/docs/SPEC-IA.md`** (ACOE-31400) — clean up the `/docs` information architecture: delete 10 stub/placeholder/wrong-audience MDX files, fix four `_meta.js` files, move CDSI to a top-level section, fix the heading scale (display tokens → heading tokens), delink release-notes from the sidebar (without deleting the files — they power `/solutions/atmosphere/releases/[slug]`), and verify `<StorybookEmbed>` works end-to-end across all deployed environments.
2. **`hidden/pages/docs/SPEC.md`** — restore Nextra's default theming on the `/docs` content surface (headings, paragraphs, lists, links, code blocks, tables, callouts, tabs) by rewriting one function (`getDocsMDXComponents` in `src/components/docs-mdx.tsx`) so it stops spreading the entire UXEP override map on top of Nextra defaults.

**Current-state defects (verified in source):**

- `content/docs/_meta.js` exposes a stub root index, an internal-conventions `developers` directory, a redundant `support` page that just redirects to `/support`, a "PLACEHOLDER" `troubleshooting.mdx`, and the noisy `release-notes` sidebar entry.
- `content/docs/cdsi/overview.mdx` is a 15-line placeholder while the **real** CDSI content originally sat three levels deep under `content/docs/atmosphere/getting-started/`.
- `src/components/docs-mdx-primitives.tsx::headingStyles` maps `h1`→`atm-typography-d1` (96px display token), `h2`→`atm-typography-d4` (~64px), and `h4`/`h5`→`atm-typography-h6` (off-by-one and reuse). H6 is a multi-class composite (`atm-typography-body atm-small atm-font-700 atm-uppercase ...`) inconsistent with the rest of the scale.
- `src/components/docs-mdx.tsx::getDocsMDXComponents` does `{ ...themeComponents, ...sharedComponents, wrapper: nested }`. `sharedComponents` overrides every base Markdown element (`h1`–`h6`, `p`, `a`, `ul`, `ol`, `li`, `code`, `pre`, `blockquote`, `table*`, `Callout`, `Tabs`, `wrapper`) with Atmosphere-styled UXEP primitives. The nested `wrapper` places `DocsTemplateBody` (class `uxep-shared-article-template atm-grid atm-gap-6`) inside Nextra's wrapper.

**Constraints:**

- `style-prefixed.css` is the docs stylesheet (Tailwind 4 `x:*` prefixed; safe to coexist with the host's TW3 build). Do not switch to `style.css`. `nextra-theme-docs` and `@atmosphere/tailwind` versions are pinned. Tailwind stays at v3.
- `src/lib/mdx.tsx` imports `getContentMDXComponents` from `docs-mdx-shared.tsx` for non-docs MDX surfaces (`/resources/[slug]`, `/onboarding/[slug]`). These intentionally use Atmosphere styling and **must not regress**. Therefore `docs-mdx-shared.tsx` is not modified.
- `content/docs/release-notes/*` (14 files) is the data source for `src/lib/docs-release-notes.ts` powering `/solutions/atmosphere/releases/[slug]`. Do not move, rename, or delete these files. Delinking from the sidebar is purely a `_meta.js` edit.
- `<StorybookEmbed>` is fully implemented and unit-tested (47 tests in `StorybookEmbed.test.tsx`); only live-environment integration verification is outstanding, and per user direction it is **deferred to the final task block**.
- `/docs` font remains Inter (UXEP brand parity) — an intentional, accepted delta from `atmosphere.cisco.com/docs`.

**Stakeholders:** Front-end team (owns the implementation), UXEP product (owns IA decisions — already resolved in SPEC-IA §2 OQ-1..OQ-4), Storybook/atmosphere-dev team (only relevant if the deferred TASK-06 reveals a missing `request-code` postMessage handler).

## Goals / Non-Goals

**Goals:**

- `/docs` sidebar exposes exactly three top-level entries: **Atmosphere**, **CDSI**, **Support** (deep-linked to `/support`).
- All 10 stub/placeholder/wrong-audience MDX files are deleted; their references are gone from `_meta.js` files; their URLs return 404.
- CDSI is a first-class top-level docs section at `/docs/cdsi`, with its three real pages (`index`, `setup-installation`, `faq`) moved via `git mv` to preserve history. The legacy nested CDSI route 404s.
- All hardcoded internal links to the legacy nested CDSI route are updated to `/docs/cdsi/*`.
- Heading scale on `/docs` (and on every other surface that consumes `headingStyles`) is the heading scale, not the display scale. H1 ≤ 40px computed.
- `/docs` content surface (headings, paragraphs, lists, links, code, blockquotes, tables, callouts, tabs) renders with Nextra defaults — `x:*` prefixed Tailwind 4 classes — with no `atm-*` utilities applied to base Markdown elements.
- Three named UXEP shortcodes still render in docs MDX: `<Button>` (Harbor-backed), `<DocsEcosystemLinks>`, `<StorybookEmbed>`.
- The UXEP shell (header, footer, search) and the existing Nextra chrome (sidebar, TOC, breadcrumb, pagination) are unchanged on `/docs`.
- Non-docs MDX surfaces (`/resources/[slug]`, `/onboarding/[slug]`) are visually unchanged on every element except headings (which get the heading-scale fix as a beneficial side effect of editing the shared `headingStyles` export).
- `pnpm exec vitest --config vitest.node.config.ts --run` passes; visual snapshots are regenerated and reviewed; `pnpm build` succeeds with all routes prerendering.
- StorybookEmbed live-environment verification (TASK-06) lands as the **final** task block in implementation order, after both phases above are merged.

**Non-Goals:**

- No new docs content (no framework guides, v4 migration guide, corner-radius reference page).
- No Tailwind v4 migration; no `nextra-theme-docs` upgrade; no `@atmosphere/tailwind` upgrade.
- No swap to `style.css` (must stay on `style-prefixed.css`).
- No changes to `mdx-components.tsx`, `theme.config.tsx`, `src/app/docs/layout.tsx`, `src/app/layout.tsx`, `src/components/docs-mdx-shared.tsx`, `src/components/docs-mdx-primitives.tsx` body (only the `headingStyles` export changes), `src/lib/mdx.tsx`, `globals.css`.
- No content changes to `content/docs/release-notes/**`; no changes to `src/lib/docs-release-notes.ts`.
- No redirects from deleted URLs (consider as fast-follow if 404s prove disruptive).
- No font swap on `/docs` — Inter is intentional.
- No new `<StorybookEmbed>` features. The deferred TASK-06 is verification + (if needed) env wiring + (if needed) a coordinated Storybook-side fix; component code is preserved.

## Decisions

### D1 — Order of operations: IA first (Phase A), then theme restoration (Phase B), then deferred Storybook verification (Phase C).

**Rationale:** SPEC-IA TASK-03 (heading scale) edits `headingStyles` in `docs-mdx-primitives.tsx`. SPEC.md will make those overrides irrelevant for `/docs` (Nextra defaults take over). However, `headingStyles` still flows through `docs-mdx-shared.tsx::getContentMDXComponents`, which `src/lib/mdx.tsx` consumes for `/resources` and `/onboarding`. Doing IA first delivers the heading-scale fix everywhere it matters; doing theme restoration second avoids any visible regression on `/docs` from the heading-scale change (because Nextra owns the headings on `/docs` after Phase B). Phase C (deferred) does not depend on either — but per user direction we land it last so it does not block IA + theme value.

**Alternative considered:** Phase B → A. Rejected because the heading-scale fix would land first but would be dead code on `/docs` if Phase A is delayed; if we ever revert Phase B, the heading-scale fix would still be needed and would have to be re-derived.

### D2 — CDSI moves via `git mv`, not file copy + delete.

**Rationale:** Preserves git history for blame/log on the three real CDSI pages. The destination directory is empty after Phase A TASK-01 deletes the stub `cdsi/overview.mdx`, and `getting-started/_meta.js` no longer lists `cdsi` after Phase A TASK-02, so there is no double-listing or merge conflict at move time. The existing `cdsi/_meta.js` (a stub from when the directory only held a placeholder) is overwritten with the correct two-entry shape; `index.mdx` carries `asIndexPage: true` frontmatter and Nextra auto-detects it without needing an `index` key in `_meta.js`.

**Alternative considered:** Move to a new dir name like `cdsi-docs/`. Rejected — the URL `/docs/cdsi` is the desired user-facing path per OQ-2, and it is what the Atmosphere/UXEP product team has committed to.

### D3 — Sidebar uses Nextra `_meta.js` href object syntax for the Support entry.

**Rationale:** The existing `support.mdx` is a redundant stub that just tells the user to go to `/support`. Per SPEC-IA OQ-1/§4 TASK-02, replace `support: "Support"` with `support: { title: "Support", href: "/support" }` so the sidebar deep-links directly to the canonical Support page. This avoids forking content (`/docs/support` vs `/support`) and removes a click. We rely on the installed `nextra-theme-docs` honoring this `_meta.js` API; verification step is in tasks.

**Alternative considered:** Add a server-side redirect from `/docs/support` → `/support`. Rejected — adds a moving part for no UX benefit over a sidebar deep-link, and SPEC-IA §8 explicitly excludes redirects.

### D4 — Phase B is a single-file rewrite of `getDocsMDXComponents`. Phase B does **not** modify `docs-mdx-shared.tsx`.

**Rationale:** `docs-mdx-shared.tsx::getContentMDXComponents` is also imported by `src/lib/mdx.tsx` for non-docs Markdown rendering (`resources/[slug]`, `onboarding/[slug]`). Those surfaces intentionally use Atmosphere styling. The merge happens at the docs entry point in `docs-mdx.tsx::getDocsMDXComponents`. Surgically rewriting only that function is the minimum change that achieves Nextra-default theming on `/docs` without affecting other MDX consumers.

**The exact new shape** (from SPEC.md):

```tsx
import { useMDXComponents as getThemeComponents } from "nextra-theme-docs";
import {
  getContentMDXComponents,
  type DocsMDXOverrideMap,
} from "./docs-mdx-shared";

export function getDocsMDXComponents(components?: DocsMDXOverrideMap) {
  const themeComponents = getThemeComponents();
  const sharedComponents = getContentMDXComponents();

  return {
    ...themeComponents,
    Button: sharedComponents.Button,
    DocsEcosystemLinks: sharedComponents.DocsEcosystemLinks,
    StorybookEmbed: sharedComponents.StorybookEmbed,
    ...components,
  };
}
```

This: (1) lets Nextra defaults own all base Markdown elements (`h1`–`h6`, `p`, `a`, `ul`, `ol`, `li`, `code`, `pre`, `blockquote`, `table*`, `Callout`, `Tabs`, `wrapper`); (2) keeps the three named UXEP shortcodes that docs MDX explicitly invokes (`<Button>`, `<DocsEcosystemLinks>`, `<StorybookEmbed>`); (3) preserves the `DocsMDXOverrideMap` caller-override contract; (4) eliminates the nested `DocsTemplateBody` wrapper so Nextra's article wrapper (`x:w-full x:min-w-0 x:break-words x:px-4 x:pt-4 x:md:px-12`) takes over.

**Alternative considered:** Add a feature flag or `theme="atmosphere"` prop on individual MDX files. Rejected — this is binary (we want Nextra defaults everywhere on `/docs`), adding configuration for no use case. Also rejected: deleting `docs-mdx-shared.tsx`/`docs-mdx-primitives.tsx` — they are still consumed by `src/lib/mdx.tsx`.

### D5 — Heading scale fix touches only the `headingStyles` export.

**Rationale:** The fix is a token-substitution in a single map. Replacing the entire file or any other export risks scope creep. Specific replacements (verbatim from SPEC-IA TASK-03):

- `h1`: `atm-typography-d1` → `atm-typography-h1`
- `h2`: `atm-typography-d4` → `atm-typography-h2`
- `h3`: `atm-typography-h2` → `atm-typography-h3` (off-by-one fix)
- `h4`: `atm-typography-h6` → `atm-typography-h4` (off-by-two fix)
- `h5`: `atm-typography-h6` → `atm-typography-h5` (token reuse fix)
- `h6`: `atm-typography-body atm-small atm-font-700 atm-uppercase atm-tracking-wide` (composite) → `atm-typography-h6` (single token, consistent with the rest)
- All `atm-text-content-primary-default` color tokens preserved.
- All `atm-mb-*`/`atm-mt-*` spacing utilities preserved exactly.
- The `atm-text-content-secondary-default` color used only on `h6`'s previous composite is dropped; `h6` now uses primary like the rest of the scale (consistent with the heading-token model).

### D6 — Test assertion strategy: invert class checks rather than delete tests.

**Rationale:** `src/app/docs/docs-theme.browser.test.tsx` exists to guard the `/docs` MDX rendering contract. After Phase B, the contract changes: `/docs` is supposed to NOT have `atm-*` classes on base Markdown elements. So the existing assertions (`toContain("atm-typography-d1")`, `toContain("atm-border-l-4")`, ...) become inverted (`not.toContain(...)`), preserving the regression protection. Selectors that referenced `DocsTabs`/`DocsCallout`-specific markup (`.uxep-docs-tabs`, `hbr-tab-panel[name=...]`, `[aria-label="Docs info callout"]`) are removed — they tested implementation that is no longer in the path. Computed-style assertions on `paddingTop`/`lineHeight` for `DocsPre`/`DocsTabs` are also removed (they tested specific Atmosphere padding tokens that no longer apply).

Visual snapshots will all change. Regenerate via `pnpm test:update-snapshots` and review the diff to confirm Nextra-default styling is captured.

**Alternative considered:** Delete the entire test file and rely on `docs-route.test.tsx` + manual QA. Rejected — losing the assertion-level regression net is too costly when the inversions are mechanical.

### D7 — StorybookEmbed live verification is deferred but **bounded** by the same definition-of-done criteria.

**Rationale:** Per user direction, TASK-06 lands last. But the criteria for "done" do not soften — `hideCode={true}` is still prohibited as a workaround (per OQ-3); the iframe + `request-code` postMessage round-trip + code snippet must work in local dev, preview, staging, and production. If the live Storybook deployment is missing the `request-code` handler, that is a Storybook-side blocker that gets a coordinated ticket (ACOE-31400 cannot close on `hideCode`). The deferral affects **scheduling**, not **scope**.

## Risks / Trade-offs

**[R1] Deleting 10 MDX files breaks any external links to those URLs (analytics referrers, bookmarked docs, Slack/Confluence shares).**
→ Mitigation: SPEC-IA §8 explicitly de-scopes redirects; PR-1 description must list the deleted URLs so downstream teams can update references. If post-launch analytics show meaningful 404 traffic on the deleted URLs, add redirects as a fast-follow change. Acceptance: empty 404 traffic is the hopeful baseline; non-empty is acceptable trade-off given the IA cleanup value.

**[R2] Nextra `_meta.js` `{ title, href }` syntax may not resolve correctly in the installed `nextra-theme-docs` version, causing the Support entry to mis-render or 404.**
→ Mitigation: Verify on the dev server before merging Phase A; if the rendered link is wrong, downgrade to `support: "Support"` plus a separate redirect route. The verification is in `tasks.md` Done-when for the relevant task.

**[R3] CDSI move via `git mv` may fail to preserve history if the move is squashed in a manner that defeats git's rename detection (e.g., simultaneous large content edits in the move commit).**
→ Mitigation: Move files in a dedicated commit with no content edits. If MDX content needs to be touched in the same PR, do that in a follow-up commit. CI/PR review should confirm history preservation via `git log --follow content/docs/cdsi/index.mdx`.

**[R4] After Phase B, `<Callout>`/`<Tabs>` in docs MDX may use UXEP-specific props that Nextra's defaults don't support.**
→ Mitigation: SPEC.md verified that all current usages use the standard Nextra `<Callout type="info|warning|error">` and `<Tabs items={[...]}>` APIs. Run a grep across `content/docs/**/*.mdx` for non-standard props before merging Phase B. If a non-standard prop is found, either update the MDX to use the standard prop or reconsider the Phase B scope for that one element only.

**[R5] Nextra's article wrapper width (`x:w-full x:min-w-0 x:break-words x:px-4 x:pt-4 x:md:px-12`) may differ visibly from `DocsTemplateBody`'s `uxep-shared-article-template atm-grid atm-gap-6`, causing a noticeable layout shift on `/docs` after Phase B.**
→ Mitigation: SPEC.md §"Why the layout files stay untouched" verified the Nextra layout geometry is already pixel-identical to the legacy site at `atmosphere.cisco.com/docs` with `DocsContentFrame` present and the `hasShellSlots` guard inactive. Visual side-by-side check before/after is in tasks.md verification.

**[R6] The visual-snapshot regeneration may include unrelated diffs (e.g., font hinting, sub-pixel rounding) that obscure the intended changes during PR review.**
→ Mitigation: Snapshots run in Docker per the project's testing convention, which standardizes the rendering environment. The reviewer's job is to confirm the visible diffs match Nextra-default styling on the affected elements; minor render-environment noise is acceptable.

**[R7] Deferring TASK-06 means live `/docs/atmosphere/components/*` pages may have a non-functional Code tab on production until that final task ships.**
→ Mitigation: Per user direction, this is the accepted trade-off. The Code tab is currently in the same partially-working state and the IA + theme cleanup is independently valuable. TASK-06 is bounded by the same "no `hideCode={true}`" constraint when it does ship. Document the current Code-tab state in PR-1 description so launch readiness is explicit.

**[R8] Internal-link sweep for the legacy nested CDSI route → `/docs/cdsi` may miss links in dynamic strings or templated routes.**
→ Mitigation: Search across `.mdx`, `.tsx`, `.ts`, `.md` files using `rg`. Pay attention to `src/lib/page-contracts/` and `openspec/` per SPEC-IA TASK-05. After PR-2 merges, do a follow-up grep to confirm zero hits remain.

**[R9] The `headingStyles` change affects non-docs MDX surfaces (`/resources/*`, `/onboarding/*`) by shrinking their headings from display scale to heading scale.**
→ This is a **beneficial** side effect, not a regression — the display-scale H1 (96px) was always wrong for inline article body content; Atmosphere's design system reserves display tokens for hero/marketing bands. If the non-docs surfaces have been visually depending on the larger size, that dependency is itself a defect. Verify on `/resources/[any-slug]` and `/onboarding/[any-slug]` after Phase A; no expected user-visible regression.

## Migration Plan

**Rollout:**

1. **PR-1: Phase A — IA cleanup + heading scale.** Commits in order:
   - C1: file deletions (TASK-01) — 10 MDX files + `developers/_meta.js` + `developers/` directory.
   - C2: `_meta.js` updates (TASK-02 + TASK-04 inline) — root, atmosphere, atmosphere/getting-started, atmosphere/foundations/guides.
   - C3: heading-scale fix (TASK-03) — `src/components/docs-mdx-primitives.tsx::headingStyles`.
   - Verify on the dev server: sidebar shape, deleted URLs 404, kept URLs 200, H1 ≤ 40px on a sample component page, Inter font intact, non-docs MDX surfaces visually unchanged except for shrunken headings.
2. **PR-2: Phase A continued — CDSI move.** Single commit (TASK-05): `git mv` three CDSI files; replace `content/docs/cdsi/_meta.js`; delete the nested CDSI source directory under `content/docs/atmosphere/getting-started/`; sweep internal links across `content/docs/**`, `src/**`, `openspec/**`. Depends on PR-1 merged.
3. **PR-3: Phase B — Nextra theme restoration.** Commits in order:
   - C1: rewrite `src/components/docs-mdx.tsx::getDocsMDXComponents` per D4 above.
   - C2: update assertions in `src/app/docs/docs-theme.browser.test.tsx` per D6.
   - C3: regenerate visual snapshots via `pnpm test:update-snapshots`.
   - Verify on the dev server: H1 36px on `/docs`, Nextra `x:*` classes on base elements, no `atm-*` on base elements, three named shortcodes still render, Inter font intact, UXEP shell + Nextra chrome unchanged, non-docs surfaces unchanged.
4. **PR-4: Phase C — StorybookEmbed live verification (deferred).** Per SPEC-IA TASK-06: local + preview + staging + production verification, possibly env wiring, possibly CSP `frame-src`/`connect-src` updates, possibly `ALLOWED_ORIGINS` extension, possibly a coordinated Storybook-side fix. Optional Playwright smoke test against a preview URL.

**Rollback strategy:**

- PR-1: revert is purely file restoration + `_meta.js` revert + a single export revert. Low risk.
- PR-2: revert is a `git mv` in the opposite direction + a `_meta.js` re-write. Low risk (history preserved both ways).
- PR-3: revert restores the previous `getDocsMDXComponents` body and previous test assertions and previous snapshots. Low risk; isolated to two files.
- PR-4: revert depends on what shipped — env-var revert, CSP revert, allow-list revert. None should require a Storybook-side rollback (the Storybook fix, if needed, is additive).

**Coordination:**

- PR-2 must not merge before PR-1.
- PR-3 may merge in parallel with PR-1 or PR-2 (they touch disjoint files), but it is conceptually cleaner to land Phase A fully before Phase B so reviewers can isolate the visual changes.
- PR-4 lands last per user direction. If the Storybook-side fix is required, file the Storybook ticket as soon as it is identified (probably during local-dev verification in PR-4) so it can be coordinated and ready before PR-4 merges.

## Open Questions

None. SPEC-IA §2 resolved OQ-1..OQ-4 and that is binding per the document. SPEC.md's "Decision Log" §"Decision Log" resolves the analogous theme questions (style-prefixed.css stays, layout files stay, font remains Inter, Tailwind 3 stays). The only outstanding unknown — whether the live Storybook deployment implements the `request-code` handler — is a verification step in TASK-06 (Phase C), not a decision blocking implementation.
