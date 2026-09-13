# ZHINO — Security / External Connection Audit

**Date:** 2026-09-12 · **Scope:** full repository (source, build output, config, workflows, packages, deployed site) · **Type:** audit + cleanup — no functional changes.

## Verdict

ZHINO is an **independent website**. No Arena dependency, no `arena.site` reference, no
injected Arena UI, no analytics, no tracking, no advertising, no third-party widgets,
and no unwanted iframes exist anywhere in the project files or the shipped build.

## What was audited

- Every file in the repository (113 tracked files), `package.json` + all package-lock entries of
  `package-lock.json`, the built `dist/` output, `.github/workflows/deploy.yml`,
  `index.html`, all CSS `url()` references, and the live deployment.
- Full-text search for: `arena`, `arena.site`, iframe/embed/object creation, tracking &
  analytics (gtag, GA, GTM, sendBeacon, hotjar, mixpanel, sentry, …), advertising
  (adsbygoogle, doubleclick, ad networks), telemetry, webhooks, obfuscated/encoded URLs
  (`eval`, `atob`, hex escapes), protocol-relative URLs, service workers,
  `window.open`/`postMessage`/`EventSource`, dynamic `import()`.
- Runtime audit in a real browser against the production build: every network request
  logged across all user flows (home, products, deep links, add-to-cart, cart, checkout,
  recipes, about, contact), with `fetch`/`XMLHttpRequest`/`WebSocket`/`sendBeacon`/
  dynamic `script`/`iframe` creation monkey-patched to detect hidden usage.

## External connections — complete classification

| # | Connection | Where | Classification | Kept? |
|---|------------|-------|----------------|-------|
| 1 | `fonts.googleapis.com` (CSS) + `fonts.gstatic.com` (woff2) | `index.html` (Vazirmatn + Marcellus) | **Legitimate, required** — the site's official typography; degrades gracefully to system fonts if unreachable. Not tracking, not advertising. | ✅ Yes |
| 2 | `registry.npmjs.org` | `package-lock.json` (202 packages, all resolved from npmjs.org only) | **Legitimate** — build-time dependency install only; nothing ships to the browser from npm. | ✅ Yes |
| 3 | Official GitHub Actions (`actions/checkout@v4`, `setup-node@v4`, `configure-pages@v5`, `upload-pages-artifact@v3`, `deploy-pages@v5`) | `.github/workflows/deploy.yml` | **Legitimate** — CI/CD for GitHub Pages, official GitHub-maintained actions. | ✅ Yes |
| 4 | `fetch()` calls in `src/services/api.ts` (`/orders/initiate`, `/orders/{id}/verify`, `/orders/{id}`) | checkout service layer | **Dormant by design** — destination is `${VITE_API_BASE_URL}`, which is empty by default (`.env.example`), so every function short-circuits *before* any network call. This is the documented future-backend integration point; no third-party destination is hardcoded. | ✅ Yes |
| 5 | `http://localhost` in `scripts/smoke.mjs` | test harness (jsdom) | **Test-only** — never included in the shipped bundle. | ✅ Yes |
| 6 | `http://www.w3.org/2000/svg` etc. | inline SVGs / React runtime | **Not connections** — XML namespace identifiers, never fetched. | n/a |
| 7 | `https://react.dev/errors/…`, `reactrouter.com`, `github.com/ungap/…` | minified React/React-Router error strings inside `dist/` | **Not connections** — documentation URLs embedded in library error messages; only shown in a developer console. | n/a |

**Removed during this audit:** the only Arena artifact found — a local
`.git/hooks/commit-msg` hook that appended an `arena-agent` co-author trailer to commit
messages. It lived only in the local `.git` directory (never pushed, never cloned, never
deployed, zero effect on the website) and was deleted. **No project file required any
change.**

## Runtime network audit (production build, all flows)

- First page load makes exactly **5 requests**: the document, 2 same-origin images
  (`/images/hero-bg.jpg`, `/images/hero-dish.jpg`), and the Google Fonts stylesheet.
- Across every user flow the browser contacted **2 hosts**: the site's own origin and
  `fonts.googleapis.com` (plus `fonts.gstatic.com` for the font files on the open
  internet). Nothing else.
- **Zero** runtime `fetch`/`XMLHttpRequest`/`WebSocket`/`sendBeacon` calls and **zero**
  dynamically injected `<script>`/`<iframe>`/`<img>`/`<link>` elements.
- No console errors.

## False positives (investigated and cleared)

- The byte sequence `e2b` inside `public/images/hero-bg.jpg` — random compressed-binary
  coincidence, not a reference. Image unaltered.
- The string `iframe` inside `dist/` — React DOM's internal element/event tables and a
  Tailwind preflight selector; the app creates no iframes.
- `http://localhost` inside `dist/` — a URL-parser constant in React Router internals,
  never requested.
- `opencollective.com` / `github.com/sponsors` URLs in `package-lock.json` — npm funding
  metadata for open-source dependencies; never contacted by the app.

## Verification

`npm ci` ✅ · `npm run build` ✅ (single-file `dist/index.html` + byte-identical
`404.html` + `.nojekyll` + local images) · `npm run verify:data` ✅ ·
`npm run smoke` ✅ (62 checks) · GitHub Pages base path `/zheno-website/` and
deep-link 404 fallback re-verified against a Pages-fidelity server ✅ · live deployment
checked — no injected content ✅

## Supabase backend preparation addendum — 2026-09-12

The optional production data connection is now isolated under `src/services/supabase/`.
The browser reads only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; no service-role
key or database password is present in the repository. With those variables empty (the
repository default), the Supabase client is not created and the existing runtime network
behavior above remains unchanged.

When configured, Supabase Auth is used for admin login and PostgreSQL RLS checks the
immutable JWT `app_metadata.role === "admin"`. Catalog/content/settings/recipe reads
are public only where their migration policies allow them; orders/customer data has no
public read policy. Guest checkout calls the validated `create_order` RPC, which derives
prices/shipping from the database and decrements inventory atomically. Admin stock
writes use `set_inventory_stock` / `adjust_inventory` RPCs. The complete schema and
policies are in `supabase/migrations/20260912000000_initial_schema.sql`.
