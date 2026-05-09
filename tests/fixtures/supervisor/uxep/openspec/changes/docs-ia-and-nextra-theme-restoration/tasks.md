# Tasks: docs-ia-and-nextra-theme-restoration

Implementation order is fixed: **Phase A (IA) → Phase B (Nextra theme) → Phase C (StorybookEmbed live verification, deferred per user direction)**. Each task is self-contained with a single outcome, a narrow scope, observable Done-when conditions, and an explicit Stop-and-hand-off clause.

## 1. Phase A — IA: file deletions

- [x] **1.1 Delete the 10 stub/placeholder/wrong-audience MDX files**
  - Scope: `content/docs/index.mdx`, `content/docs/atmosphere/overview.mdx`, `content/docs/atmosphere/tokens-and-theming.mdx`, `content/docs/cdsi/overview.mdx`, `content/docs/developers/using-harbor-and-atmosphere.mdx`, `content/docs/troubleshooting.mdx`, `content/docs/atmosphere/getting-started/index.mdx`, `content/docs/atmosphere/getting-started/installation-and-access.mdx`, `content/docs/support.mdx`, `content/docs/atmosphere/foundations/guides/content.mdx`
  - Change: Each of the 10 files no longer exists in the working tree.
  - Done when:
    - `ls content/docs/index.mdx content/docs/troubleshooting.mdx content/docs/support.mdx content/docs/atmosphere/overview.mdx content/docs/atmosphere/tokens-and-theming.mdx content/docs/cdsi/overview.mdx content/docs/developers/using-harbor-and-atmosphere.mdx content/docs/atmosphere/getting-started/index.mdx content/docs/atmosphere/getting-started/installation-and-access.mdx content/docs/atmosphere/foundations/guides/content.mdx 2>&1 | grep -c "No such file"` returns `10`.
    - `content/docs/cdsi/` still exists (only `overview.mdx` was deleted; `_meta.js` and any other files remain).
    - `content/docs/release-notes/` and all 14 of its MDX files still exist on disk unchanged (not in scope of this task).
  - Stop and hand off if:
    - Any of the 10 listed files is not present at the expected path before deletion (the file was already removed by an earlier change, or the path is wrong).
    - Any non-listed file is deleted in the same task.

- [x] **1.2 Delete the empty `developers/` directory and its `_meta.js`**
  - Scope: `content/docs/developers/_meta.js`, `content/docs/developers/`
  - Change: The `developers/` directory and its `_meta.js` no longer exist.
  - Done when:
    - `test -d content/docs/developers` returns non-zero (directory absent).
    - `git status --short content/docs/developers` shows only the deleted `_meta.js` path, or no output if the directory was already absent before this change.
  - Stop and hand off if:
    - `content/docs/developers/` contains files other than `_meta.js` after task 1.1 (someone added new content to the dir between branches).

## 2. Phase A — IA: `_meta.js` updates

- [x] **2.1 Rewrite root `content/docs/_meta.js` to the three-entry shape**
  - Scope: `content/docs/_meta.js`
  - Change: Root `_meta.js` exports exactly three keys — `atmosphere: "Atmosphere"`, `cdsi: "CDSI"`, `support: { title: "Support", href: "/support" }` — in that order. No `index`, `developers`, `release-notes`, or `troubleshooting` keys remain.
  - Done when:
    - `content/docs/_meta.js` exports only the `atmosphere`, `cdsi`, and `support` entries from the target in design D3.
    - `rg "index|developers|release-notes|troubleshooting" content/docs/_meta.js` returns no matches.
    - `rg "href: \"/support\"" content/docs/_meta.js` returns one match.
  - Stop and hand off if:
    - The file cannot be reduced to the target three-entry shape because new root docs entries were added by another branch; stop and ask whether those entries should remain.

- [x] **2.2 Update `content/docs/atmosphere/_meta.js` to remove deleted entries**
  - Scope: `content/docs/atmosphere/_meta.js`
  - Change: The `atmosphere` section's `_meta.js` no longer references `overview` or `tokens-and-theming`; remaining keys (`getting-started`, `foundations`, `components`, `patterns`, `templates`, `data-visualization`) keep their existing labels and order.
  - Done when:
    - `grep -E "overview|tokens-and-theming" content/docs/atmosphere/_meta.js` returns no matches.
    - The file's exported object preserves the order of remaining keys as in the current source (verify with `git diff content/docs/atmosphere/_meta.js`).
  - Stop and hand off if:
    - The current `content/docs/atmosphere/_meta.js` already lacks one of the entries to remove (signals a merge has partially landed; reconcile before proceeding).

- [x] **2.3 Update `content/docs/atmosphere/getting-started/_meta.js` to remove `installation-and-access` and `cdsi`**
  - Scope: `content/docs/atmosphere/getting-started/_meta.js`
  - Change: `_meta.js` for getting-started exports only `for-designers` and `for-developers` (in that order), each with their existing labels.
  - Done when:
    - `grep -E "installation-and-access|cdsi" content/docs/atmosphere/getting-started/_meta.js` returns no matches.
    - `rg "for-designers|for-developers" content/docs/atmosphere/getting-started/_meta.js` returns two matches.
  - Stop and hand off if:
    - The file references entries beyond `for-designers` and `for-developers` that were not in the deletion list (signals an upstream change that needs reconciliation).

- [x] **2.4 Update `content/docs/atmosphere/foundations/guides/_meta.js` to remove `content`**
  - Scope: `content/docs/atmosphere/foundations/guides/_meta.js`
  - Change: `_meta.js` exports only `accessibility: "Accessibility"`.
  - Done when:
    - `grep "content" content/docs/atmosphere/foundations/guides/_meta.js` returns no match for the `content` key (the word may appear elsewhere; verify with the file diff).
    - `rg "accessibility" content/docs/atmosphere/foundations/guides/_meta.js` returns one match.
  - Stop and hand off if:
    - The file references guide entries beyond `accessibility` and `content` (other entries are out of scope and must not be removed here).

## 3. Phase A — IA: heading scale fix

- [x] **3.1 Replace display tokens with heading tokens in `headingStyles`**
  - Scope: `src/components/docs-mdx-primitives.tsx` — only the `headingStyles` named export
  - Change: `headingStyles` maps each `h1`–`h6` key to the matching `atm-typography-h1`–`atm-typography-h6` token (per design D5), preserving all `atm-mb-*`/`atm-mt-*` spacing utilities and using `atm-text-content-primary-default` color on every entry. The previous `h6` composite (`atm-typography-body atm-small atm-font-700 atm-uppercase atm-tracking-wide atm-text-content-secondary-default`) is replaced by a single `atm-typography-h6` token.
  - Done when:
    - `grep -E "atm-typography-d[1-4]" src/components/docs-mdx-primitives.tsx` returns no matches.
    - `grep -E "atm-typography-h[1-6]" src/components/docs-mdx-primitives.tsx` returns 6 matches inside the `headingStyles` export.
    - `pnpm tsc --noEmit` passes with no new errors.
  - Stop and hand off if:
    - Any other export, function, or import in `docs-mdx-primitives.tsx` has been changed (this task is strictly limited to `headingStyles`).
    - `pnpm tsc --noEmit` introduces a new type error caused by the token rename (likely indicates the project's Tailwind safelist or a `headingStyles` consumer needs adjustment).

## 4. Phase A — IA: CDSI relocation

- [x] **4.1 `git mv` the three real CDSI files into the top-level `content/docs/cdsi/` directory**
  - Scope: the nested CDSI source files under `content/docs/atmosphere/getting-started/` (`index.mdx`, `setup-installation.mdx`, `faq.mdx`) → `content/docs/cdsi/index.mdx`, `setup-installation.mdx`, `faq.mdx`
  - Change: The three files exist at the new path; the move is recorded as a rename (history preserved) in the commit; no file content is edited in the same commit.
  - Done when:
    - The move is performed with `git mv`, and `git diff --find-renames --summary -- content/docs/atmosphere/getting-started/ content/docs/cdsi` reports the three CDSI MDX files as renames with no content edits.
    - `rg "asIndexPage: true|Cisco Design System Intelligence" content/docs/cdsi/index.mdx` confirms the destination contains the real CDSI overview content, not the deleted stub.
    - `test -f content/docs/cdsi/setup-installation.mdx && test -f content/docs/cdsi/faq.mdx` succeeds.
    - The nested CDSI source directory no longer contains `index.mdx`, `setup-installation.mdx`, or `faq.mdx`.
  - Stop and hand off if:
    - `content/docs/cdsi/overview.mdx` still exists at this point (task 1.1 deletion did not stage). Stop and complete 1.1 first.
    - The destination `content/docs/cdsi/index.mdx` already exists from a previous incomplete attempt and would conflict with the move (clean up and retry).

- [x] **4.2 Replace `content/docs/cdsi/_meta.js` with the two-entry shape**
  - Scope: `content/docs/cdsi/_meta.js`
  - Change: `cdsi/_meta.js` exports `{ "setup-installation": "Setup and Installation", faq: "FAQ" }` in that order, with no `index` key (Nextra auto-detects `index.mdx` via `asIndexPage: true` frontmatter).
  - Done when:
    - `grep -E "setup-installation|faq" content/docs/cdsi/_meta.js` returns 2 matches and `grep "index" content/docs/cdsi/_meta.js` returns no match for the `index` key.
    - File-shape verification only — the rendered-sidebar check is performed in 4.5 (after 4.3 removes the stale source `_meta.js` so Nextra can compile `/docs`).
  - Stop and hand off if:
    - The exported object is not the literal `{ "setup-installation": "Setup and Installation", faq: "FAQ" }` in that order (re-edit; do not work around).

- [x] **4.3 Delete the now-empty nested CDSI source directory and its stale `_meta.js`**
  - Scope: the nested CDSI source directory's `_meta.js` plus that directory itself
  - Change: The source CDSI directory and its `_meta.js` no longer exist.
  - Done when:
    - `test -d "content/docs/atmosphere/getting-started"/cdsi` returns non-zero.
    - The legacy nested CDSI route returns 404 on `pnpm dev`.
  - Stop and hand off if:
    - The directory still contains files after task 4.1 ran (the move was incomplete; reconcile before deleting).

- [x] **4.4 Sweep internal links: legacy nested CDSI route → `/docs/cdsi`**
  - Scope: `content/docs/**/*.mdx`, `src/**/*.{ts,tsx,md}`, `openspec/**/*.md`
  - Change: Every hardcoded reference to the old nested CDSI route is replaced with the new top-level path. No reference to that exact legacy route string remains in the repo (excluding archived OpenSpec changes and excluding `hidden/pages/docs/SPEC-IA.md` itself, which documents the migration).
  - Done when:
    - `rg -l "/docs/atmosphere/getting-started/" --glob "content/docs/**/*.mdx" --glob "src/**/*.{ts,tsx,md}" --glob "openspec/changes/**/*.md" | rg "cdsi"` returns no files (archived changes and `hidden/` are intentionally excluded from this check).
    - On `pnpm dev`, navigating from any in-docs cross-link that previously pointed to the nested CDSI route now lands on `/docs/cdsi` or a deeper CDSI page.
  - Stop and hand off if:
    - A reference appears inside dynamic string composition (e.g., template-literal route construction) that cannot be safely replaced with a search-and-replace. Halt and document the dynamic site for manual review.

- [x] **4.5 Verify IA route and sidebar behavior once** (moved from 2.5; runs after 4.1–4.4 so `/docs` compiles)
  - Scope: dev-server URL probing — no source changes
  - Change: Verifies that tasks 1.1–2.4 and 4.1–4.4 took effect end-to-end with a single dev-server pass.
  - Done when:
    - With `pnpm dev` running, the top-level sidebar entries are exactly **Atmosphere**, **CDSI**, and **Support**; clicking **Support** navigates to `/support` rather than `/docs/support`.
    - The Atmosphere sidebar no longer shows **Overview** or **Tokens and Theming**; Atmosphere → Getting Started shows only **For Designers** and **For Developers**; Atmosphere → Foundations → Guides shows only **Accessibility**.
    - The CDSI sidebar group lists in order: the index page (label from `index.mdx` frontmatter `title`), **Setup and Installation**, **FAQ** (deferred from 4.2 verification).
    - With `pnpm dev` running, the following URLs return 404: `/docs/atmosphere/overview`, `/docs/atmosphere/tokens-and-theming`, `/docs/cdsi/overview`, `/docs/developers/using-harbor-and-atmosphere`, `/docs/troubleshooting`, `/docs/support`, `/docs/atmosphere/getting-started`, `/docs/atmosphere/getting-started/installation-and-access`, `/docs/atmosphere/foundations/guides/content`.
    - The following URLs return 200: `/docs/atmosphere/getting-started/for-developers/installation`, `/docs/atmosphere/getting-started/for-developers/tailwind`, `/docs/atmosphere/getting-started/for-developers/dark-theme`, `/docs/atmosphere/getting-started/for-developers/customization`, `/docs/atmosphere/getting-started/for-designers`, `/docs/atmosphere/foundations/styles/design-tokens`, `/docs/atmosphere/foundations/styles/colors`, `/docs/atmosphere/foundations/guides/accessibility`, `/docs/atmosphere/components/accordion`, `/docs/atmosphere/components/button`, `/docs/atmosphere/patterns/forms`, `/solutions/atmosphere/releases/v4-0-0`.
    - The behavior of `/docs` itself (Nextra-default first-child resolution vs 404) is observed and documented in the PR description.
  - Stop and hand off if:
    - Any URL in the "must 404" list returns 200 after 1.1–2.4 and 4.1–4.4 are done (signals an `_meta.js` edit was missed or a file deletion did not stage).
    - Any URL in the "must 200" list returns 404 (signals an unrelated regression that must be fixed before proceeding).
    - The installed `nextra-theme-docs` version does not honor the `{ title, href }` object syntax for `_meta.js` entries (the Support link 404s or renders incorrectly). Stop and document the observed behavior; do not work around with a redirect or with `support: "Support"`.

## 5. Phase B — Nextra content-surface restoration

- [x] **5.1 Rewrite `getDocsMDXComponents` to spread Nextra defaults plus three named shortcodes**
  - Scope: `src/components/docs-mdx.tsx` — the body of the `getDocsMDXComponents` function only
  - Change: `getDocsMDXComponents` calls `getThemeComponents()` from `nextra-theme-docs`, then `getContentMDXComponents()`, and returns `{ ...themeComponents, Button: sharedComponents.Button, DocsEcosystemLinks: sharedComponents.DocsEcosystemLinks, StorybookEmbed: sharedComponents.StorybookEmbed, ...components }`. The previous wholesale `...sharedComponents` spread and the nested `DocsTemplateBody` wrapper are eliminated. The `React` import is removed if unused.
  - Done when:
    - `src/components/docs-mdx.tsx` matches design D4's "exact new shape" — the return object contains the Nextra theme spread, the three named shortcodes, and the trailing `...components`.
    - `grep -E "DocsTemplateBody|SharedWrapper|sharedComponents\.wrapper" src/components/docs-mdx.tsx` returns no matches.
    - `pnpm tsc --noEmit` passes with no new errors.
  - Stop and hand off if:
    - `docs-mdx-shared.tsx`, `docs-mdx-primitives.tsx`, `mdx-components.tsx`, or `theme.config.tsx` requires modification to make the `getDocsMDXComponents` rewrite type-check (design D4 prohibits these edits).
    - A `<Callout>` or `<Tabs>` invocation in `content/docs/**/*.mdx` uses a non-standard prop that Nextra's defaults reject (R4). Stop and surface the invocation; do not work around by re-adding `DocsCallout`/`DocsTabs`.

- [x] **5.2 Update assertions in `docs-theme.browser.test.tsx`**
  - Scope: `src/app/docs/docs-theme.browser.test.tsx` — only the assertions listed in design D6 / SPEC.md "Test Updates"
  - Change: Class-presence assertions are inverted (`toContain("atm-typography-d1")` → `not.toContain("atm-typography-d1")`, etc.) for `h1`, `blockquote`, `pre`, `table`. Selectors and assertions for `.uxep-docs-tabs`, `hbr-tab-panel[name="harbor"|"themes"]`, `[aria-label="Docs info callout"]`, and `paddingTop`/`lineHeight` computed-style checks are removed. Assertions for `<Button>` (Harbor `hbr-button[aria-label="Docs Harbor action"]`, `variant="fill"`, `sentiment="interact"`), `.uxep-docs-shell`, `.uxep-docs-content`, `<DocsEcosystemLinks>`, the heading-text `getByRole`/`getByText` checks, and the `"docs theme sync follows the shared app theme owner"` test are preserved unchanged.
  - Done when:
    - `grep -E "uxep-docs-tabs|hbr-tab-panel|Docs info callout" src/app/docs/docs-theme.browser.test.tsx` returns no matches.
    - `grep -E "atm-typography-d1|atm-border-l-4|atm-font-mono|atm-min-w-full" src/app/docs/docs-theme.browser.test.tsx` returns matches only inside `.not.toContain(...)` expressions.
  - Stop and hand off if:
    - A test the design D6 listed as "remains valid and must not change" begins failing after 5.1+5.2 (signals 5.1 broke a contract that should not have been touched).

- [x] **5.2.1 Repair latent IA references that block snapshot regeneration**
  - Scope: Three files only — `src/app/docs/docs-theme.browser.test.tsx`, `src/app/docs/docs-route.test.tsx`, and `src/lib/docs.ts`. No other production source, no other tests, no `content/docs/**` edits. **This task is explicitly authorized to fully rewrite `docs-route.test.tsx` and to update the `requiredDocsRoutes` constant in `docs.ts`** — the iteration-25 hand-off correctly flagged that the prior 5.2.1 scope was too narrow, and this revision broadens it to cover the entire post-IA cleanup. There is no further "stop on additional stale references" clause inside the three allowed files.
  - Change: Surfaced by iter-21 BLOCKED_HANDOFF on `5.3` and refined by iter-25 BLOCKED_HANDOFF on the prior `5.2.1`. The post-IA, post-5.1 worktree leaves three files internally inconsistent with the new `content/docs/**` tree and the new `getDocsMDXComponents` shape:
    1. `src/app/docs/docs-theme.browser.test.tsx` lines 196–204 still render `<Tabs.Tab>...</Tabs.Tab>`. After `5.1` rewrote `getDocsMDXComponents` to spread Nextra defaults instead of the old `sharedComponents` map, the imported `Tabs` no longer exposes a `.Tab` static and the suite throws `TypeError: Cannot read properties of undefined (reading 'Tab')` at render time. Remove the `data-testid="docs-tabs-fixture"` `<div>` and its `<Tabs>...</Tabs>` children entirely, and remove any assertion that targets that fixture (consistent with `5.2`, which already removed the `.uxep-docs-tabs` / `hbr-tab-panel` selectors).
    2. `src/lib/docs.ts` lines 4–15 still export a `requiredDocsRoutes` constant that lists six routes whose underlying MDX was deleted by `1.1` (`/docs/atmosphere/overview`, `/docs/atmosphere/tokens-and-theming`, `/docs/developers/using-harbor-and-atmosphere`, `/docs/cdsi/overview`, `/docs/support`, `/docs/troubleshooting`) plus `/docs/atmosphere/getting-started/installation-and-access` (deleted by `1.1`). Update `requiredDocsRoutes` to reflect the actual post-IA frozen set: `/docs`, `/docs/atmosphere/getting-started/for-designers`, `/docs/atmosphere/getting-started/for-developers`, `/docs/cdsi`, `/docs/cdsi/setup-installation`, `/docs/cdsi/faq`. Do not change `getDocsContentRoot`, `walkDocsDirectory`, `listDocsPageSegments`, `toDocsRoute`, or `toDocsImportPath` — only the constant. (`/docs/release-notes` stays out of `requiredDocsRoutes`; the release-notes content lives under `/solutions/atmosphere/releases/[slug]` and the docs sidebar suppression for it is handled separately.)
    3. `src/app/docs/docs-route.test.tsx` is a pre-IA contract test. Rewrite it end-to-end so its three concerns (route inventory, `_meta.js` shape, MDX-components shape) match the post-IA / post-5.1 reality:
       - Remove the two stale `?raw` imports of deleted MDX (`installation-and-access.mdx`, `tokens-and-theming.mdx`) and remove the `tokensDoc` / `installationDoc` content assertions that depend on them. Drop the `seeded docs fixtures include code-block and callout-or-tab patterns` test entirely if its only fixtures came from those two deleted files.
       - Rewrite `discoveredRoutes` (lines 17–48) to list only the routes whose MDX still exists on disk: `/docs`, plus the live Atmosphere subtree (`getting-started/for-designers`, `getting-started/for-developers`, `getting-started/for-developers/installation`, `getting-started/for-developers/tailwind`, `getting-started/for-developers/dark-theme`, `getting-started/for-developers/customization`, `foundations/styles/design-tokens`, `foundations/styles/colors`, `foundations/guides/accessibility`, `components/accordion`, `components/button`, `patterns/forms`, plus any other live MDX you find under `content/docs/atmosphere/**`), the live CDSI subtree (`cdsi`, `cdsi/setup-installation`, `cdsi/faq`), and the live `release-notes` subtree if `requiredDocsRoutes` is asserted as a subset (it should not be, after the change above). Use `listDocsPageSegments()` from `src/lib/docs.ts` as the source of truth — the test should assert `discoveredRoutes` covers `requiredDocsRoutes` and that every entry of `requiredDocsRoutes` corresponds to a real MDX file under `content/docs/**`.
       - Rewrite the `docs metadata hierarchy files exist for the UXEP IA` test (lines 87–122) so each `expect(Object.keys(*Meta)).toEqual([...])` matches the actual current `_meta.js`: `rootMeta` keys = `["atmosphere", "cdsi", "support"]`, `gettingStartedMeta` keys = `["for-designers", "for-developers"]`, `atmosphereMeta` keys = the actual six remaining keys after `2.2` (read the file, do not guess). Leave `templatesMeta` and `dataVisualizationMeta` assertions intact if they still match the on-disk `_meta.js`; remove them if the underlying meta files were deleted.
       - Rewrite the `docs MDX uses the shared primitive registry without adding a second content boundary` test (lines 129–144) so its assertions match the post-5.1 `getDocsMDXComponents` shape (the new return spreads `getThemeComponents()` from `nextra-theme-docs`, includes the three named shortcodes `Button`, `DocsEcosystemLinks`, `StorybookEmbed`, and trailing `...components`). Drop every assertion that referenced the deleted `DocsCallout`, `DocsTabs`, `DocsPre`, `DocsTable`, `DocsTableBody`, `DocsTableRow`, `DocsTemplateBody`, the `wrapper: options?.wrapper ?? DocsTemplateBody` line, the `from "./content-primitives"` import, and the `uxep-docs-content` / `DocsContentWrapper` strings. Add positive assertions that the new shape is present (e.g., `expect(docsMdxSource).toContain("getThemeComponents")` and `expect(docsMdxSource).toContain('from "nextra-theme-docs"')`).
       - Preserve the `docsLayoutSource` and `themeConfigSource` `not.toContain` assertions (lines 70–80) — those are already correct contracts from `5.1` cleanup.
  - Done when:
    - `grep -nE "Tabs\\.Tab|installation-and-access|tokens-and-theming|atmosphere/overview|developers/using-harbor-and-atmosphere|cdsi/overview|^\\s*\\\"troubleshooting\\\"|^\\s*\\\"support\\\"" src/app/docs/docs-theme.browser.test.tsx src/app/docs/docs-route.test.tsx src/lib/docs.ts` returns no matches.
    - `grep -nE "DocsCallout|DocsTabs|DocsPre|DocsTable|DocsTableBody|DocsTableRow|DocsTemplateBody|DocsContentWrapper|content-primitives" src/app/docs/docs-route.test.tsx` returns no matches.
    - `pnpm exec vitest --config vitest.node.config.ts --run src/app/docs/docs-route.test.tsx` exits 0.
    - `pnpm tsc --noEmit` passes with no new errors anywhere in the repo.
    - All other browser/node test files in the repo are untouched (`git diff --name-only` for this task lists exactly the three allowed files).
  - Stop and hand off if:
    - Updating `src/lib/docs.ts`'s `requiredDocsRoutes` constant breaks an unrelated import site outside the three allowed files (signals the constant has wider consumers than the IA change accounted for; the operator must decide whether to broaden again or split).
    - The accordion failures noted in the iter-21 handoff (`src/app/routes.browser.test.tsx:1066-1068` and `src/components/components.browser.test.tsx:757-759`, `aria-expanded` assertions) appear to share a root cause with the IA cleanup. They are presumed unrelated and out of scope; if investigation says otherwise, emit BLOCKED_HANDOFF and let the operator file a separate change rather than expanding this task.

- [x] **5.2.2 Restore docs MDX component completeness and isolate node-only test from the browser config**
  - Scope: Three files — `src/components/docs-mdx.tsx` (production), `src/app/docs/docs-route.test.tsx` (test), and `vitest.config.ts` (config). No other production source, no `content/docs/**` edits, no other test edits. **This task is explicitly authorized to widen `getDocsMDXComponents` past the three named shortcodes and to move `docs-route.test.tsx` out of the browser test config.**
  - Change: Surfaced by iter-28 BLOCKED_HANDOFF on `5.3`. Two genuine bugs in the post-`5.1`/post-`5.2.1` worktree block snapshot regeneration (and would also break live `/docs/*` rendering at runtime, not just tests):
    1. **`src/components/docs-mdx.tsx` returns an incomplete component map.** Task `5.1` rewrote `getDocsMDXComponents` to spread `getThemeComponents()` from `nextra-theme-docs` and add three named shortcodes (`Button`, `DocsEcosystemLinks`, `StorybookEmbed`). But Nextra's `useMDXComponents()` only exports HTML primitives plus `wrapper` and `img` (verified against `node_modules/.pnpm/nextra-theme-docs@4.6.1*/node_modules/nextra-theme-docs/dist/mdx-components/index.d.mts`) — it does **not** export `Callout` or `Tabs`. The `Callout` and `Tabs` components used throughout `content/docs/**/*.mdx` (e.g., `content/docs/atmosphere/components/accordion.mdx`, `content/docs/atmosphere/templates/ui-shell.mdx`, ~25+ files via `rg "<Callout|<Tabs" content/docs/`) come from `nextra/components`, not from the theme. After `5.1`, those MDX pages render `undefined` for `Callout`/`Tabs` and React throws `Element type is invalid ... got: undefined` — the exact symptom seen in `docs-theme.browser.test.tsx`. Fix: in `src/components/docs-mdx.tsx`, add an import `import { Callout, Tabs } from "nextra/components";` and include both in the returned `mdxComponents` object alongside the existing three shortcodes. Order: spread `themeComponents` first, then add the five named entries (`Callout`, `Tabs`, `Button`, `DocsEcosystemLinks`, `StorybookEmbed`), then spread `...components` overrides last. Do not change `getContentMDXComponents` in `src/components/docs-mdx-shared.tsx` (that path is owned by non-docs MDX consumers like `/resources` and `/onboarding`).
    2. **`src/app/docs/docs-route.test.tsx` runs in the browser environment but uses a Node-only API.** `vitest.config.ts:28` explicitly lists `src/app/docs/docs-route.test.tsx` in the browser config's `include` array. The test calls `listDocsPageSegments()` from `src/lib/docs.ts:16`, which imports `node:path` for filesystem traversal. In the browser environment, `node:path` is externalized by Vite and the import throws `Module "node:path" has been externalized for browser compatibility`. Fix: remove the explicit `"src/app/docs/docs-route.test.tsx"` entry from `vitest.config.ts`'s `test.include` array (line 28). The file does not end in `.browser.test.tsx`, so it will then be picked up only by `vitest.node.config.ts` (which already excludes only `*.browser.test.{ts,tsx}` and includes everything else under `src/`). Do not edit `docs-route.test.tsx` itself; do not edit `src/lib/docs.ts`.
  - Done when:
    - `src/components/docs-mdx.tsx` imports `Callout` and `Tabs` from `nextra/components` and includes both in the returned `mdxComponents` map (verifiable: `rg "from \"nextra/components\"" src/components/docs-mdx.tsx` returns 1 match, and `rg "Callout|Tabs" src/components/docs-mdx.tsx` returns at least 4 matches — one import, one usage of each).
    - `vitest.config.ts`'s `test.include` array no longer contains `"src/app/docs/docs-route.test.tsx"` (verifiable: `rg "docs-route.test.tsx" vitest.config.ts` returns no matches).
    - `pnpm exec vitest --config vitest.node.config.ts --run src/app/docs/docs-route.test.tsx` exits 0 (the test now runs in node and `listDocsPageSegments()` works).
    - `pnpm exec vitest --run src/app/docs/docs-theme.browser.test.tsx` no longer throws `Element type is invalid ... got: undefined` for `Callout` or `Tabs`. **Snapshot/screenshot mismatches (e.g., `docs-shell-boundary.darwin.png`) are explicitly NOT a 5.2.2 failure** — those are owned by `5.3` and will be regenerated there. Verify by reading the failure output: if the only remaining failures are `Snapshot ... mismatched` lines, treat 5.2.2 as done and proceed to `5.3`.
    - `pnpm tsc --noEmit` passes with no new errors anywhere in the repo.
    - `git diff --name-only` for this task lists exactly three files: `src/components/docs-mdx.tsx`, `vitest.config.ts`, and `openspec/changes/docs-ia-and-nextra-theme-restoration/tasks.md` (the checkbox flip).
  - Stop and hand off if:
    - `nextra/components` does not export `Callout` or `Tabs` in the installed version (verifiable: `rg "^export.*\b(Callout|Tabs)\b" node_modules/.pnpm/nextra@*/node_modules/nextra/dist/client/components/`). That signals an upstream version mismatch and the operator must decide whether to upgrade Nextra or implement local replacements.
    - Removing `docs-route.test.tsx` from `vitest.config.ts` causes a different test file to start failing under `vitest.config.ts` (i.e., the explicit include was masking a real ordering or aliasing requirement). In that case, emit BLOCKED_HANDOFF and let the operator decide between renaming the test to `docs-route.node.test.tsx` and adding it to the node-config explicitly, or finding the masked failure.
    - Adding `Callout`/`Tabs` to the returned map causes a TypeScript error in any consumer of `getDocsMDXComponents` (signals the cast at `docs-mdx.tsx:18-21` is too narrow). Update the cast minimally to satisfy the consumer; do not refactor consumer code.

- [x] **5.3 Regenerate visual snapshots and review the diff**
  - Scope: Snapshot files (`*.snap`) and screenshot directories (`__screenshots__/`) emitted by **all four** snapshot-emitting test files in this repo: `src/app/docs/docs-theme.browser.test.tsx` (the primary target), plus `src/components/components.browser.test.tsx`, `src/components/site-chrome.browser.test.tsx`, and `src/app/routes.browser.test.tsx` (collateral regen because `pnpm test:update-snapshots` regenerates everything in one pass — verified via `rg "toMatchFileSnapshot|toMatchSnapshot|toMatchScreenshot|toMatchInlineSnapshot" src/`). No production source changes; no test-source changes (those are owned by `5.1`/`5.2`/`5.2.1`).
  - Change: Run `pnpm test:update-snapshots` once, commit the regenerated snapshot/screenshot files, and review the docs-theme diffs to confirm Nextra-default styling. Collateral diffs in non-docs test files are accepted as long as they are limited to snapshot/screenshot artifacts (no test-source edits).
  - Done when:
    - `pnpm test:update-snapshots` runs to completion (non-zero exit is OK if it is **only** caused by the pre-existing accordion failures listed in the next bullet — those tests do not block snapshot regen because vitest still writes the new snapshot files before asserting).
    - `git diff --stat` shows updated `.snap` files and `__screenshots__/*.png` files. At minimum, `src/app/docs/__snapshots__/docs-theme.browser.test.tsx.snap` and `src/app/docs/__screenshots__/docs-theme.browser.test.tsx/*.png` are present in the diff.
    - `pnpm exec vitest --config vitest.node.config.ts --run src/app/docs/` passes green end-to-end (the docs subset only — full-suite green is not required by this task).
    - For the docs-theme snapshot diff specifically: the rendered output shows Nextra-default styling on headings, code blocks, tables, and callouts (no `atm-*`-driven sizing or padding inside docs MDX content elements).
  - Pre-existing unrelated failures (do **not** treat as 5.3 regressions, do **not** stop on these):
    - `src/app/routes.browser.test.tsx:1066-1068` — FAQ-accordion `aria-expanded` assertion (documented in iter-21 BLOCKED_HANDOFF).
    - `src/components/components.browser.test.tsx:757-759`, `:789-790`, `:797` — same FAQ-accordion family of `aria-expanded` assertions.
    - These are owned by a separate, future change and are explicitly out of scope here.
  - Stop and hand off if:
    - The docs-theme snapshot diff (`src/app/docs/__snapshots__/docs-theme.browser.test.tsx.snap` or its `__screenshots__/` PNGs) shows Atmosphere classes (`atm-*`, `hbr-tab-panel`, `uxep-docs-*`) appearing on docs MDX **content** elements (h1/h2/h3, p, ul, blockquote, pre, table, Callout). That signals a regression in `5.1`.
    - A snapshot diff appears in a non-docs test file (`components.browser.test.tsx.snap`, `site-chrome.browser.test.tsx.snap`, `routes.browser.test.tsx.snap`, or their `__screenshots__/`) that visibly changes Harbor component colors, shell chrome layout, or non-docs page structure (i.e., the diff is **not** just a benign re-render byte-shift). That signals 5.1 leaked outside the docs surface.
    - `pnpm test:update-snapshots` exits non-zero for any reason **other** than the pre-existing FAQ-accordion failures listed above.

- [x] **5.4.0 Hide orphaned `release-notes` directory from the `/docs` sidebar**
  - Scope: `content/docs/_meta.js`. Do NOT delete `content/docs/release-notes/**` — those MDX files plus `content/docs/release-notes/_meta.js` are the source-of-truth consumed by `src/lib/docs-release-notes.ts` for the canonical `/solutions/atmosphere/releases/[slug]` route.
  - Change: Surfaced by iter-32 BLOCKED_HANDOFF on task `5.4`. Even though the root `_meta.js` lists only `atmosphere`, `cdsi`, and `support`, Nextra still auto-discovers `content/docs/release-notes/` (which has its own `_meta.js`) and surfaces it as a top-level `Release Notes` sidebar entry. This violates SPEC-IA §6 "Sidebar shape", which requires exactly three top-level entries. Fix: add an explicit `"release-notes"` entry to root `_meta.js` with `type: "page"` and `display: "hidden"` so Nextra knows about the directory but excludes it from sidebar/nav rendering. Per Nextra 4 docs (https://nextra.site/docs/file-conventions/meta-file) and shuding/nextra issue #4395, `display: "hidden"` requires `type: "page"` to actually suppress the entry.
  - Done when:
    - `content/docs/_meta.js` exports four keys in this exact order: `atmosphere`, `cdsi`, `support`, `"release-notes"`. The `"release-notes"` entry is `{ type: "page", display: "hidden" }`. The other three entries are unchanged from task `2.1`.
    - `rg "display: \"hidden\"" content/docs/_meta.js` returns one match.
    - With `pnpm dev` running on `localhost:3000`, a browser probe at `/docs/atmosphere/components/accordion` returns a sidebar (`aside a[href]`) whose top-level entries are exactly Atmosphere, CDSI, and Support — no `Release Notes` group, no `/docs/release-notes/*` hrefs in the sidebar DOM.
    - `curl -sI http://127.0.0.1:3000/solutions/atmosphere/releases/v4-0-0 | head -1` still reports `HTTP/1.1 200 OK` (the canonical release-notes consumer is unaffected).
    - `pnpm exec vitest --config vitest.node.config.ts --run src/lib/docs-release-notes.test.ts` passes green (the consumer of `content/docs/release-notes/_meta.js` still works).
    - `pnpm tsc --noEmit` passes with no new errors.
  - Stop and hand off if:
    - Adding `display: "hidden"` to a `type: "page"` entry still leaves `Release Notes` in the rendered sidebar (Nextra version mismatch with referenced docs/issue) — emit BLOCKED_HANDOFF naming the installed `nextra` version from `package.json`.
    - Hiding the entry breaks `src/lib/docs-release-notes.ts` (e.g., `getDocsReleaseNoteBySlug` fails to import a release-notes MDX page) — emit BLOCKED_HANDOFF rather than working around it, since that means `display: "hidden"` is also suppressing `importPage` resolution and a different mechanism is required.
    - The route probes for `/docs/atmosphere/components/accordion` or `/solutions/atmosphere/releases/v4-0-0` start returning non-200 — emit BLOCKED_HANDOFF; the fix is incorrect.

- [x] **5.4.1 Repoint non-docs CDSI CTAs from the deleted `/docs/cdsi/overview` route to `/docs/cdsi`**
  - Scope: Four runtime files only — `src/data/onboarding.ts`, `src/components/content-route-pages.tsx`, `src/components/route-pages.tsx`, `src/data/products.ts`. Do NOT edit `src/lib/search-shared.ts` or `src/components/site-chrome.browser.test.tsx`; the search-index fallback contains a broader stale-IA inventory (9 deleted routes) that belongs to a separate cleanup change and is not user-visible on `/resources`, `/onboarding`, or `/solutions`.
  - Change: Surfaced by iter-33 BLOCKED_HANDOFF on task `5.4`. After Phase A IA deletions, four non-docs surfaces still author `href: "/docs/cdsi/overview"` as a "Browse CDSI docs" / "CDSI overview" / "Explore CDSI guidance" CTA, but task `1.1` deleted `content/docs/cdsi/overview.mdx` and SPEC-IA §6 requires `/docs/cdsi/overview` to return HTTP 404. The live `/onboarding/cdsi-tenant` page consequently exposes a CTA that lands on a required-404 route — a user-visible regression beyond the heading-shrinkage tolerance in `5.4`. Replace each `"/docs/cdsi/overview"` literal with `"/docs/cdsi"` (the live CDSI section index, verified 200): one occurrence in `src/data/onboarding.ts:653`, one in `src/components/content-route-pages.tsx:1043`, one in `src/components/route-pages.tsx:2198`, and two in `src/data/products.ts:331,344`. No other behavior changes.
  - Done when:
    - `rg "/docs/cdsi/overview" src/data/onboarding.ts src/components/content-route-pages.tsx src/components/route-pages.tsx src/data/products.ts` returns no matches.
    - `rg "/docs/cdsi" src/data/onboarding.ts src/components/content-route-pages.tsx src/components/route-pages.tsx src/data/products.ts` returns at least 5 matches (one per replaced site), all with the value `"/docs/cdsi"` and not the deleted `/overview` suffix.
    - With `pnpm dev` running on `localhost:3000`, `curl -s http://127.0.0.1:3000/onboarding/cdsi-tenant | grep -c "/docs/cdsi/overview"` returns `0`.
    - `curl -sI http://127.0.0.1:3000/docs/cdsi/overview | head -1` still reports `HTTP/1.1 404 Not Found` (the SPEC-IA §6 contract is preserved).
    - `curl -sI http://127.0.0.1:3000/docs/cdsi | head -1` reports `HTTP/1.1 200 OK` (the new destination is live).
    - `pnpm tsc --noEmit` passes with no new errors.
  - Stop and hand off if:
    - Any of the four named files has more than the listed occurrences (signals a mid-air change that needs reconciliation).
    - `/docs/cdsi` starts returning non-200 (signals `4.1`/`4.2` regression and the destination is wrong).
    - `src/lib/search-shared.ts` or `src/components/site-chrome.browser.test.tsx` need editing to make the four runtime files pass type-check or render tests (signals scope creep into the broader stale-IA search-index cleanup, which is a separate change).

- [x] **5.4 Verify the full `/docs` content surface against the SPEC-IA Verification Checklist**
  - Scope: `pnpm dev` URL probing and `pnpm build` — no source changes. The reference checklist is `hidden/pages/docs/SPEC-IA.md` §6 "Verification Checklist (Post-Implementation)" — there is no separate `SPEC.md` file in this repo (this task previously referenced one in error). The StorybookEmbed subsection of §6 is **excluded** from this task; it is owned by tasks `6.1`–`6.3`.
  - Change: Confirms tasks `5.1`–`5.3` (plus prior IA work in `1.x`–`4.x`) satisfy the SPEC-IA verification checklist for sidebar shape, route 200/404 behavior, heading scale, and body font.
  - Done when each of the following passes manually against `pnpm dev` on `localhost:3000` and a fresh `pnpm build`:
    - **Sidebar shape (SPEC-IA §6 "Sidebar shape"):** Top-level entries are exactly Atmosphere, CDSI, Support; Support links to `/support`; Atmosphere expands to Getting Started, Foundations, Components, Patterns, Templates, Data Visualization (no Overview, no Tokens and Theming); Getting Started expands to For Designers, For Developers (no CDSI, no Installation and Access); CDSI expands to its index page, Setup and Installation, FAQ.
    - **Routes that must 404 (SPEC-IA §6 "URLs that must 404"):** `/docs/atmosphere/overview`, `/docs/atmosphere/tokens-and-theming`, `/docs/cdsi/overview`, `/docs/developers/using-harbor-and-atmosphere`, `/docs/troubleshooting`, `/docs/support`, `/docs/atmosphere/getting-started`, `/docs/atmosphere/getting-started/installation-and-access`, `/docs/atmosphere/getting-started/cdsi`, `/docs/atmosphere/foundations/guides/content` all return HTTP 404.
    - **Routes that must return 200 (SPEC-IA §6 "URLs that must still return 200"):** every URL in that subsection returns HTTP 200 and renders inside the Nextra theme shell.
    - **Heading scale (SPEC-IA §6 "Heading scale"):** at `/docs/atmosphere/components/accordion`, the H1 "Accordion" computed `font-size` in DevTools is ≤ 40px (not 96px); H2 < H1; H3 < H2.
    - **Docs MDX components render correctly:** at `/docs/atmosphere/components/accordion` (which uses `<Tabs items={['Design', 'Code']}>`, `<Tabs.Tab>`, `<StorybookEmbed>`, and `<Button>` per current MDX), the `<Callout>` renders with Nextra's default background (no `atm-*` wrapper class), the `<Tabs>` block renders with Nextra's default tab markup (no `hbr-tab-panel`, no `.uxep-docs-tabs` selector), and `<Button>`, `<StorybookEmbed>`, `<DocsEcosystemLinks>` still render on pages that use them. Note: the StorybookEmbed iframe load + Code-tab round-trip are explicitly **out of scope** here and are verified by tasks `6.1`–`6.3`; for `5.4`, only the presence of the `<StorybookEmbed>` rendered host element is required.
    - **Body font (SPEC-IA §6 "Body font"):** `/docs` pages render in Inter (no work was done to swap to the Nextra system stack).
    - **Non-docs surfaces:** `/resources/<any-existing-slug>` and `/onboarding/<any-existing-slug>` are visually unchanged except for shrunken headings (heading-scale fix from `3.1` takes effect on these pages).
    - `pnpm build` succeeds with all routes prerendering. Operator captures the `pnpm build` summary in the task log.
    - The `/docs` root behavior is documented (200 with landing if `7.1` already ran; 404 with Next.js fallback otherwise — both are accepted here per SPEC-IA §6 "/docs itself", which calls this non-deterministic).
  - Stop and hand off if:
    - Any sidebar-shape, 404-list, or 200-list item fails — earlier IA tasks (`1.x`–`4.x`) did not deliver the contract; emit BLOCKED_HANDOFF naming the failing URL or sidebar entry.
    - Heading scale or `<Callout>` / `<Tabs>` styling check fails — earlier theming tasks (`3.1` or `5.1`) did not deliver; emit BLOCKED_HANDOFF naming the page and computed style observed.
    - `pnpm build` fails for a reason that is not obviously upstream of this change (missing env var, network access, etc.) — emit BLOCKED_HANDOFF with the build error rather than guessing.
    - Any non-docs surface (`/resources`, `/onboarding`, `/solutions`) shows a visual regression beyond the heading-scale shrinkage — that signals `3.1` leaked outside its scope.

## 6. Phase C — StorybookEmbed live verification (deferred per user direction)

This phase lands **last**, after Phases A and B are merged. Per OQ-3, `hideCode={true}` is **not** an acceptable workaround at any point during this phase.

- [x] **6.0.2 Widen CSP `frame-src` to allow the deployed Atmosphere Storybook origin** (operator-authored after iter-36 BLOCKED_HANDOFF on `6.1`)
  - Scope: `src/middleware.ts` only (CSP header builder + its doc comment), plus the matching delta spec at `openspec/changes/docs-ia-and-nextra-theme-restoration/specs/security-response-headers/spec.md` and a `security-response-headers` entry in the change `proposal.md`'s Modified Capabilities. No other source, test, or content is touched.
  - Change: Adds `https://wwwin-github.cisco.com` to the `frame-src` directive (joining the existing `https://www.cisco.com` for Cisco CTM consent-sync) so the Storybook iframe loaded by `<StorybookEmbed>` in `/docs` MDX is no longer blocked by CSP. Without this, the Code-tab round-trip on `/docs/atmosphere/components/{accordion,button,card}` and one data-viz page never reaches the `request-code` postMessage step — the iframe is rejected first. This unblocks `6.1` (local-dev) and is the local portion of the work that `6.2` would otherwise have to land all at once across local + preview + staging + prod.
  - Done when:
    - `rg "frame-src https://www.cisco.com https://wwwin-github.cisco.com" src/middleware.ts` returns 1 match.
    - `pnpm tsc --noEmit` passes with no new errors.
    - `pnpm vitest run src/middleware.test.ts` passes (existing `frame-src` substring assertion remains valid).
    - `openspec validate docs-ia-and-nextra-theme-restoration --strict` reports the change as valid (delta spec parses; proposal lists `security-response-headers` under Modified Capabilities).
    - With `pnpm dev` running, a browser load of `/docs/atmosphere/components/accordion` shows the Storybook iframe loading (no `Framing 'https://wwwin-github.cisco.com/' violates the following Content Security Policy directive` console error). Whether the Code tab itself produces a snippet is the responsibility of `6.1`, not this task.
  - Stop and hand off if:
    - Security review rejects widening `frame-src` to a second origin (then revert and pursue option 2 from the iter-36 hand-off — set `NEXT_PUBLIC_STORYBOOK_URL` to a CSP-allow-listed origin instead).
    - Any non-docs page begins logging new CSP violations after the edit (signals an unexpected coupling between the doc comment edit and runtime behavior — implausible, but the task is small enough that a revert is cheap).

- [x] **6.0.1 Strip `hideCode` from all `<StorybookEmbed>` invocations under `content/docs/**`** (operator-authored after iter-35 BLOCKED_HANDOFF on `6.1`)
  - Scope: four MDX files under `content/docs/atmosphere/foundations/**` only — no theme, component, or test source touched. Files: `styles/spacing.mdx`, `styles/shadow.mdx`, `styles/colors.mdx`, `expression/motion.mdx`.
  - Change: Removes the `hideCode` prop from every `<StorybookEmbed>` in those files (22 occurrences across 4 files) so the Code tab is enabled site-wide, satisfying OQ-3 and the `6.1` precondition `rg "hideCode" content/docs/` returning zero matches. No other props are altered.
  - Done when:
    - `rg "hideCode" content/docs/` returns 0 matches.
    - `pnpm tsc --noEmit` passes with no new errors.
    - The four MDX files still parse (well-formed JSX self-closing tags, no orphaned attribute lines).
  - Stop and hand off if:
    - Removing `hideCode` from any specific file is later determined to be intentionally required by product (then re-add per a documented exception and update `6.1`'s spec to allow-list that file).

- [ ] **6.0.3 Restore `<Tabs>` interactivity on `/docs` MDX pages** (operator-authored after iter-37 BLOCKED_HANDOFF on `6.1`; precondition repair so `6.1` becomes verifiable)
  - Scope: `src/components/docs-mdx.tsx` (the `Tabs` entry exposed to MDX) and, only if needed to satisfy the verifier, `mdx-components.tsx` and `src/app/docs/[[...mdxPath]]/page.tsx` (resolution of the components map). No `content/docs/**` edits, no Storybook-side or env-config edits. Targeted unit/browser tests already exist; this task fixes the runtime, not the tests.
  - Change: After Phase B's `getDocsMDXComponents` rewrite (`5.1`), the top-level `<Tabs items={['Design', 'Code']}>` wrapper rendered on `/docs/atmosphere/components/{accordion,button,card}` and at least one `/docs/atmosphere/data-visualization/<page>` no longer activates on click — clicking the `Code` tab leaves `aria-selected="true"` on `Design` and `aria-selected="false"` on `Code`, with the Code panel staying `hidden`. Iter-37's hand-off probe confirmed this against the running dev server (see `.ralph/HANDOFF.md`). Root-cause and ship the minimum repair so the outer `<Tabs>` instance toggles its selected index in response to a real user click. Acceptable repair shapes (pick the smallest that proves the fix; do not adopt more than one):
    1. Replace the `Tabs: Tabs` entry in `getDocsMDXComponents` with a re-export that goes directly through Nextra's client entry (`nextra/components/tabs/index.client.js`-equivalent) instead of the server wrapper from `nextra/components`, if dev-build inlining of the server wrapper is what is breaking the client boundary.
    2. Hoist the MDX components map resolution above the React-Server-Components boundary by computing it inside a `"use client"` shim re-exported from `mdx-components.tsx`, if the current layout is freezing the map at build-time and silently dropping the client `Tabs` reference.
    3. Restore the Atmosphere-styled `Tabs` shim that Phase B removed, if and only if the Nextra default `Tabs` cannot be restored to interactivity on `/docs` without a regression visible in `5.4`'s VRT baseline (treat this as a fallback — the design-time intent is Nextra defaults).
  - Done when:
    - With `pnpm dev` running, on `http://127.0.0.1:3000/docs/atmosphere/components/accordion`, a real DOM click on the `Code` tab button changes its `aria-selected` from `false` to `true` and reveals a `[role=tabpanel]` whose `hidden` attribute is `false` and that contains an `iframe[title^="Storybook:"]`. Verify with the same probe shape iter-37 used (`page.getByRole("tab", { name: "Code", exact: true }).first().click()` then read `aria-selected`).
    - The same is true on `http://127.0.0.1:3000/docs/atmosphere/components/button` and `http://127.0.0.1:3000/docs/atmosphere/components/card`.
    - The same is true on at least one live `http://127.0.0.1:3000/docs/atmosphere/data-visualization/<page>` (use `pnpm exec rg -l "<StorybookEmbed" content/docs/atmosphere/data-visualization` to pick the first match; do not hardcode `bar-chart` if it is not on disk).
    - `pnpm exec vitest --config vitest.node.config.ts --run src/components/docs-mdx.test` passes (or, if no such file exists, the nearest existing test that asserts `getDocsMDXComponents` exposes a working `Tabs` entry — name it explicitly when running). If the only existing coverage for the components map is in `docs-theme.browser.test.tsx`, run that file directly with `pnpm exec vitest --config vitest.browser.config.ts --run src/components/docs-theme.browser.test.tsx`.
    - `pnpm tsc --noEmit` passes with no new errors.
    - The repair does not regress any of `5.4`'s SPEC-IA Verification checks: top-level sidebar still has exactly `Atmosphere`, `CDSI`, `Support`; `/docs/atmosphere/overview`, `/docs/atmosphere/tokens-and-theming`, `/docs/cdsi/overview`, `/docs/developers/using-harbor-and-atmosphere`, `/docs/troubleshooting`, `/docs/support`, `/docs/atmosphere/getting-started`, `/docs/atmosphere/getting-started/installation-and-access`, `/docs/atmosphere/foundations/guides/content` still return 404; `/docs/cdsi`, `/docs/cdsi/setup-installation`, `/docs/cdsi/faq` still return 200.
    - `rg "hideCode" content/docs/` still returns 0 matches (`6.0.1` invariant unchanged).
    - `rg "frame-src https://www.cisco.com https://wwwin-github.cisco.com" src/middleware.ts` still returns 1 match (`6.0.2` invariant unchanged).
  - Stop and hand off if:
    - Diagnosis shows the failure is not in the `<Tabs>` wiring at all but in a broader client-runtime defect (for example, no `<button>` anywhere under `/docs` receives React event handlers after hydration, or `__reactContainer$` is present on the root but no descendant has `__reactProps$` after a 6s settle). In that case, file the broader hydration defect explicitly in the hand-off note (cite the probe output) and do **not** ship a `<Tabs>`-only patch — escalate so the operator can authorize a wider task that reverts a Phase B change or upgrades a dependency.
    - The repair would require editing any file outside the listed Scope (for example, `theme.config.tsx`, `src/app/docs/layout.tsx`, `src/components/docs-mdx-shared.tsx`, `src/components/docs-mdx-primitives.tsx`, `globals.css`, or any `content/docs/**` MDX). Per design.md "Constraints" and "Non-Goals" those files are off-limits in this change; emit `BLOCKED_HANDOFF` with the proposed file list so the operator can decide whether to widen the change scope or open a follow-up.
    - Repair option 3 (restoring an Atmosphere-styled `Tabs` shim) becomes necessary. That contradicts Phase B's "Goals" bullet "tabs … renders with Nextra defaults" and warrants an explicit operator decision rather than a silent revert of the Phase B intent.

<!-- - [ ] **6.1 Local-dev verification of the StorybookEmbed Code tab**
  - Scope: `pnpm dev` against the current branch — no source changes expected
  - Change: Confirms the `<StorybookEmbed>` integration round-trip (iframe load + `request-code` postMessage + Shiki-highlighted snippet + Copy button) works end-to-end at `localhost:3000` against the configured `NEXT_PUBLIC_STORYBOOK_URL`.
  - Done when:
    - At `/docs/atmosphere/components/accordion`, clicking the **Code** tab produces a Storybook iframe and a code snippet with a working Copy button within 10 seconds.
    - The same is true at `/docs/atmosphere/components/button`, `/docs/atmosphere/components/card`, and at one `/docs/atmosphere/data-visualization/<page>`.
    - Browser console shows no `"Storybook did not respond within 10s"` error, no CSP/CORS violations, no allow-list rejections.
    - `rg "hideCode" content/docs/` returns no matches in any `<StorybookEmbed>` invocation.
  - Stop and hand off if:
    - The local Storybook at `NEXT_PUBLIC_STORYBOOK_URL` does not implement the `request-code` postMessage handler (the iframe loads but the snippet never appears and a 10s timeout fires). File a Storybook-side ticket per design "Migration Plan" PR-4 coordination, then halt this phase until that ticket lands. -->

<!-- - [ ] **6.2 Live preview / staging / production verification**
  - Scope: deployed environments — preview/PR URL, staging URL, production URL
  - Change: Confirms the Code-tab integration works in every environment the site is deployed to. May require `NEXT_PUBLIC_STORYBOOK_URL` env wiring per environment, CSP `frame-src`/`connect-src` updates, or `ALLOWED_ORIGINS` extensions in `src/components/StorybookEmbed.tsx`.
  - Done when:
    - On a preview/PR deploy URL: the Code tab on `/docs/atmosphere/components/accordion`, `/button`, `/card`, and one data-viz page renders iframe + code snippet + Copy button within 10 seconds with no console errors.
    - Same verification passes on staging.
    - Same verification passes on production.
    - No mixed-content warnings in any environment (`NEXT_PUBLIC_STORYBOOK_URL` is HTTPS in all non-local environments).
    - The resolved Storybook origin per environment is in the `ALLOWED_ORIGINS` allow-list in `StorybookEmbed.tsx`.
  - Stop and hand off if:
    - A CSP violation requires changes outside `src/components/StorybookEmbed.tsx` and the project's CSP source (e.g., a third-party WAF rule) — escalate to platform owners.
    - Production verification reveals a defect that local-dev (6.1) missed (e.g., CDN caching of an older Storybook build) — open a focused bug rather than hot-fixing in this task. -->

<!-- - [ ] **6.3 (Recommended) Add an E2E smoke test for the Code tab against a deployed URL**
  - Scope: New Playwright/Vitest-browser test in `src/app/docs/` or the project's existing E2E harness
  - Change: A smoke test loads `/docs/atmosphere/components/accordion`, clicks the Code tab, asserts the Storybook iframe element is present, asserts a code snippet (`<pre>` or `.shiki-wrapper`) appears within 15 seconds, and asserts no console error matching `/Storybook did not respond/`.
  - Done when:
    - The smoke test exists in the repo and is wired into the project's E2E test runner.
    - The smoke test passes against a deployed preview URL.
    - The smoke test fails when `NEXT_PUBLIC_STORYBOOK_URL` is intentionally pointed at an unreachable origin (verifies the test is not a tautology).
  - Stop and hand off if:
    - The project's existing E2E harness cannot target an externally deployed URL (e.g., it only runs in Docker against `localhost`) — document the gap as a follow-up, mark this task as cancelled, and ship 6.1 + 6.2 as the closure for the deferred TASK-06. -->

## 7. Phase D — `/docs` root landing (UX polish; runs last; does not gate any test)

- [ ] **7.1 Resolve `/docs` root behavior to a non-404 landing**
  - Scope: `content/docs/index.mdx` (new file). Do not edit `next.config.ts` or `theme.config.tsx` in this task.
  - Change: Surfaced by post-`4.5` operator inspection. Task `4.5` accepted "404 vs first-child resolution" as documented behavior, but live verification confirms `GET http://127.0.0.1:3000/docs` returns HTTP 404 with a blank Next.js error fallback (no themed page, no body content, `data-next-error-message="NEXT_HTTP_ERROR_FALLBACK;404"` in the DOM). Add a minimal landing MDX at `content/docs/index.mdx` whose only job is to introduce the three top-level docs sections (Atmosphere, CDSI, Support) and link to a representative entry inside each. Keep it short — frontmatter `title` plus a one-paragraph intro plus three `<DocsEcosystemLinks>`-style or plain-link list items. Do not duplicate copy from the marketing home page, and do not add navigation/redirect logic in this task. This task is intentionally last because it does not block any test or any other task; it is purely a user-visible landing fix.
  - Done when:
    - `content/docs/index.mdx` exists with a frontmatter `title` and a body that names all three sections.
    - With `pnpm dev` running, `curl -sI http://127.0.0.1:3000/docs | head -1` reports `HTTP/1.1 200 OK`.
    - In a browser at `/docs`, the page renders inside the Nextra theme shell with the same sidebar contract as task `4.5` (top-level entries: Atmosphere, CDSI, Support; Support links to `/support`).
    - `pnpm tsc --noEmit` passes with no new errors.
    - The "must 404" list in task `4.5` is unchanged: `/docs/atmosphere/overview`, `/docs/atmosphere/tokens-and-theming`, `/docs/cdsi/overview`, `/docs/developers/using-harbor-and-atmosphere`, `/docs/troubleshooting`, `/docs/support`, `/docs/atmosphere/getting-started`, `/docs/atmosphere/getting-started/installation-and-access`, `/docs/atmosphere/foundations/guides/content` still return 404.
  - Stop and hand off if:
    - Adding `content/docs/index.mdx` causes any URL in task `4.5`'s "must 404" list to start returning 200 (signals Nextra's index resolution is rewriting the IA in unexpected ways).
    - The new index page renders but the top-level sidebar gains a fourth entry or loses Atmosphere/CDSI/Support (signals a `_meta.js` regression that belongs to `2.1`, not this task).
    - The Nextra theme refuses to render an `index.mdx` at the docs root and a redirect-based solution is required instead (then this task is wrong; emit BLOCKED_HANDOFF and let the operator decide whether to swap to a `next.config.ts` redirect, which is a different task).
