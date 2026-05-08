## Why

The `/docs` route in `uxep-site` has two converging defects that together break the developer-facing documentation experience:

1. **Information architecture is incoherent** (per `hidden/pages/docs/SPEC-IA.md`, ACOE-31400). The sidebar surfaces 10+ stub, placeholder, or wrong-audience pages (`troubleshooting.mdx` literally contains "PLACEHOLDER"; `developers/using-harbor-and-atmosphere.mdx` documents uxep-site's own internal conventions instead of Atmosphere consumer guidance). CDSI content is buried three levels deep under `atmosphere/getting-started/cdsi/` while a stub `cdsi/overview.mdx` squats at the top level. Heading scale uses Atmosphere's display tokens (`atm-typography-d1` = 96px H1) instead of heading tokens (~36px H1), making every docs page look like a marketing landing band.
2. **Nextra content theming is overridden wholesale** (per `hidden/pages/docs/SPEC.md`). `src/components/docs-mdx.tsx` spreads the entire UXEP override map on top of Nextra's defaults, replacing every base Markdown element (`h1`–`h6`, `p`, `a`, `ul`, `ol`, `li`, `code`, `pre`, `blockquote`, `table*`, `Callout`, `Tabs`, `wrapper`) with Atmosphere-styled UXEP primitives. The result is a content surface that does not match the visual target at `https://atmosphere.cisco.com/docs` — wrong sizing, wrong callout styling, wrong tabs, wrong code blocks, wrong padding.

The two problems are entangled: TASK-03 of SPEC-IA fixes the heading scale by editing `headingStyles` in `docs-mdx-primitives.tsx`, but SPEC.md will make those overrides irrelevant on `/docs` (Nextra defaults take over). Doing IA first then theme avoids landing TASK-03 only to immediately have its effect bypassed; the heading-scale fix still matters for non-docs MDX consumers (`/resources`, `/onboarding/*`) that share `docs-mdx-shared.tsx` via `src/lib/mdx.tsx`.

## What Changes

This change implements `SPEC-IA.md` first (IA cleanup + CDSI relocation + heading scale + sidebar hygiene + StorybookEmbed verification deferred), then `SPEC.md` (restore Nextra defaults on the docs content surface), as a single coherent capability evolution.

**Phase A — IA remediation (SPEC-IA TASK-01 → TASK-05):**

- **BREAKING (URLs)** Delete 10 stub/placeholder/wrong-audience MDX pages: `index.mdx`, `atmosphere/overview.mdx`, `atmosphere/tokens-and-theming.mdx`, `cdsi/overview.mdx`, `developers/using-harbor-and-atmosphere.mdx`, `troubleshooting.mdx`, `atmosphere/getting-started/index.mdx`, `atmosphere/getting-started/installation-and-access.mdx`, `support.mdx`, `atmosphere/foundations/guides/content.mdx`. Delete the empty `developers/` directory and its `_meta.js`.
- Update four `_meta.js` files (root, `atmosphere/`, `atmosphere/getting-started/`, `atmosphere/foundations/guides/`) to remove deleted entries; replace root `support` entry with `{ title: "Support", href: "/support" }` href object so the sidebar deep-links to the canonical `/support` page.
- Remove `release-notes` from the root `_meta.js` sidebar entry, but **leave all 14 files in `content/docs/release-notes/` untouched** — they are the data source for `src/lib/docs-release-notes.ts` powering `/solutions/atmosphere/releases/[slug]`. Files become orphaned but routable.
- `git mv` the three real CDSI files (`index.mdx`, `setup-installation.mdx`, `faq.mdx`) from the nested CDSI source directory under `content/docs/atmosphere/getting-started/` to top-level `content/docs/cdsi/`. Delete the now-empty source directory. Replace `content/docs/cdsi/_meta.js` with the correct two-entry shape (`setup-installation`, `faq`) — `index.mdx` is auto-detected via `asIndexPage: true` frontmatter.
- Audit and update internal links pointing to the legacy nested CDSI route so they target `/docs/cdsi/*` across `content/docs/**/*.mdx`, `src/**/*.{ts,tsx}`, `openspec/**/*.md`.
- Fix `headingStyles` in `src/components/docs-mdx-primitives.tsx`: replace `atm-typography-d1`/`atm-typography-d4` (display scale, 64–96px) with `atm-typography-h1`/`atm-typography-h2`/`.../h6` (heading scale, ~36/30/24/...px). Preserve all `atm-mb-*`/`atm-mt-*` spacing utilities and `atm-text-content-primary-default` color tokens. This change still benefits non-docs MDX consumers (`/resources`, `/onboarding/*`) that use `getContentMDXComponents` directly via `src/lib/mdx.tsx`.

**Phase B — Nextra content-surface restoration (SPEC.md):**

- Rewrite `src/components/docs-mdx.tsx` so it spreads `getThemeComponents()` from `nextra-theme-docs` and only cherry-picks **three** named UXEP shortcodes (`Button`, `DocsEcosystemLinks`, `StorybookEmbed`) on top, then a final `...components` pass-through for caller overrides. This eliminates the wholesale `...sharedComponents` spread and the nested `DocsTemplateBody` wrapper. After this change, every base Markdown element on `/docs` is rendered by Nextra's defaults with `x:*` Tailwind 4 prefixed classes (resolved by the already-loaded `style-prefixed.css`).
- Update assertions in `src/app/docs/docs-theme.browser.test.tsx` to invert class checks (e.g., `expect(heading?.className).not.toContain("atm-typography-d1")`), remove `DocsTabs`/`.uxep-docs-tabs`/`hbr-tab-panel` queries, remove `.uxep-shared-article-template` expectations, and remove specific computed-style assertions (`paddingTop`, `lineHeight`) that pinned `DocsPre`/`DocsTabs` styling. Re-snapshot the five macOS visual snapshots after assertion updates.
- Do **not** modify `docs-mdx-shared.tsx`, `docs-mdx-primitives.tsx`, `mdx-components.tsx`, `theme.config.tsx`, `src/app/docs/layout.tsx`, `src/app/layout.tsx`, `globals.css`, or any non-docs MDX consumer. The Inter font on `/docs` stays — it is intentional UXEP brand parity with the surrounding shell, and is an accepted delta from `atmosphere.cisco.com/docs`.

**Phase C — Deferred (SPEC-IA TASK-06):**

- Live end-to-end verification of `<StorybookEmbed>` (iframe + `request-code` postMessage round-trip + code snippet) across local, preview, staging, and production environments. May involve env-var wiring, CSP `frame-src`/`connect-src` updates, `ALLOWED_ORIGINS` extension, and/or a coordinated Storybook-side fix to add the `request-code` handler. Per user direction, this is deferred to the **last** task block in implementation order. `hideCode={true}` remains prohibited as a workaround per OQ-3.

## Capabilities

### New Capabilities

None — this change refines an existing capability rather than introducing a new one.

### Modified Capabilities

- `docs-experience`: This capability's requirements change in three ways. (1) Information architecture: the sidebar shape, route taxonomy, and CDSI placement are all redefined. (2) Heading scale: docs MDX heading typography requirement changes from display tokens to heading tokens. (3) Content theming surface: the requirement shifts from "Atmosphere-styled MDX primitives override Nextra defaults on `/docs`" to "Nextra defaults own the `/docs` content surface, with only three named UXEP shortcodes (`Button`, `DocsEcosystemLinks`, `StorybookEmbed`) overlaid." Non-docs MDX consumers (`/resources`, `/onboarding/*`) retain Atmosphere styling via the unchanged `getContentMDXComponents` export.
- `security-response-headers`: The CSP `frame-src` directive widens from "exactly one origin (`https://www.cisco.com`)" to two origins (adds `https://wwwin-github.cisco.com`) so the deployed Atmosphere Storybook iframe used by `<StorybookEmbed>` in `/docs` MDX can load. The clickjacking posture is unchanged: `frame-ancestors 'none'` and `X-Frame-Options: DENY` continue to refuse all third-party framing of this site, including by the Storybook host. The `StorybookEmbed` component independently enforces an `ALLOWED_ORIGINS` allow-list before accepting any postMessage from the iframe, so the postMessage trust boundary is not loosened.

## Impact

**Code:**

- 10 MDX files deleted from `content/docs/**`
- 3 MDX files moved within `content/docs/**` (CDSI relocation, `git mv` to preserve history)
- 4 `_meta.js` files edited; 1 `_meta.js` file deleted (`developers/_meta.js`); 1 `_meta.js` file replaced (`cdsi/_meta.js`)
- 1 source file edited for heading scale: `src/components/docs-mdx-primitives.tsx` (single export, `headingStyles`)
- 1 source file rewritten: `src/components/docs-mdx.tsx` (function body of `getDocsMDXComponents`)
- 1 test file updated: `src/app/docs/docs-theme.browser.test.tsx` (assertion inversions + snapshot regen)
- Internal-link sweep across `content/docs/**/*.mdx`, `src/**/*.{ts,tsx,md}`, `openspec/**/*.md` for the legacy nested CDSI route → `/docs/cdsi`

**URLs (BREAKING — must 404 after this change):**

- `/docs/atmosphere/overview`, `/docs/atmosphere/tokens-and-theming`, `/docs/cdsi/overview` (replaced by new `/docs/cdsi`), `/docs/developers/using-harbor-and-atmosphere`, `/docs/troubleshooting`, `/docs/support` (replaced by sidebar deep-link to `/support`), `/docs/atmosphere/getting-started` (index removed), `/docs/atmosphere/getting-started/installation-and-access`, the legacy nested CDSI route family (moved to `/docs/cdsi/*`), `/docs/atmosphere/foundations/guides/content`. No redirects added — out of scope per SPEC-IA §8.

**URLs (must continue to return 200):**

- `/docs/cdsi`, `/docs/cdsi/setup-installation`, `/docs/cdsi/faq` (new top-level CDSI section)
- All 42 `/docs/atmosphere/components/*` pages
- All `/docs/atmosphere/foundations/styles/*`, `foundations/expression/*`, `foundations/guides/accessibility`, `patterns/*`, `templates/*`, `data-visualization/*`
- All `/docs/atmosphere/getting-started/for-designers/*`, `for-developers/*`
- `/solutions/atmosphere/releases/v4-0-0` and other release-notes-driven pages (data source preserved)
- `/resources/*`, `/onboarding/*` (use the unchanged `getContentMDXComponents` via `src/lib/mdx.tsx`)

**Visual:**

- Headings on `/docs` shrink from display scale (96/64/...px) to heading scale (36/30/24/...px) — matches `atmosphere.cisco.com/docs`.
- `/docs` content surface (paragraphs, links, lists, code blocks, tables, callouts, tabs) restyles from Atmosphere `atm-*` classes to Nextra `x:*` defaults. Font remains Inter (intentional UXEP delta).
- Sidebar collapses from a noisy, multi-stub tree to three top-level entries: **Atmosphere**, **CDSI**, **Support** (deep-linked to `/support`).
- Non-docs MDX surfaces (`/resources`, `/onboarding`) gain the heading-scale fix; otherwise unchanged.

**Tests:**

- `src/components/StorybookEmbed.test.tsx` (47 tests) — unchanged; component is preserved.
- `src/app/docs/docs-route.test.tsx` — unchanged per SPEC.md analysis.
- `src/app/docs/docs-theme.browser.test.tsx` — assertions updated; visual snapshots regenerated via `pnpm test:update-snapshots`.

**Dependencies / packages:** None. Tailwind stays at v3, `@atmosphere/tailwind` stays on its current major, `nextra-theme-docs` is unchanged, `style-prefixed.css` remains the docs stylesheet (do not switch to `style.css`).

**Out of scope (explicit non-goals):**

- No new docs content (no framework guides, v4 migration guide, or new token reference pages).
- No Tailwind v4 upgrade.
- No `nextra-theme-docs` upgrade.
- No redirects from deleted URLs (consider a fast-follow if 404s prove disruptive).
- No font replacement on `/docs` — Inter stays.
- No changes to `content/docs/release-notes/*` files; no changes to `src/lib/docs-release-notes.ts`.
- StorybookEmbed live-environment verification (TASK-06) is **deferred to the final task block** per user direction; the component code, registration, and unit tests are preserved as-is.
