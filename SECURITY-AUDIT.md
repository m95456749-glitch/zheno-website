# ZHINO — Security / External Connection Audit

**Date:** 2026-09-08 · **Scope:** full repository (source, build output, config, workflows, packages, deployed site) · **Type:** audit + cleanup — no functional changes.

## Verdict

ZHINO is an **independent website**. No Arena dependency, no `arena.site` reference, no
injected Arena UI, no analytics, no tracking, no advertising, no third-party widgets,
and no unwanted iframes exist anywhere in the project files or the shipped build.

## What was audited

- Every file in the repository (53 tracked files), `package.json` + all 202 entries of
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

---

# Addendum — Phase 9: Persian cloud voice (`zhino-voice`)

**Date:** 2026-09-18 · **Scope:** the new Text-to-Speech path only. The verdict above is
unchanged: still no Arena dependency, no analytics, no tracking, no advertising, no
third-party widgets, no iframes.

## What changed, in one line

Reading an answer aloud used to be a purely in-browser operation. It can now also send
**the assistant's answer text** to our own Supabase Edge Function, which returns an audio
file. This is the first deliberate outbound call in the voice path, so it is classified
here in full.

## New connection

| # | Connection | Where | Classification | Kept? |
|---|------------|-------|----------------|-------|
| 8 | `POST <VITE_SUPABASE_URL>/functions/v1/zhino-voice` (override: `VITE_VOICE_API_URL`) | `src/services/assistant/voice.ts` | **Legitimate, first-party, opt-in** — our own Edge Function, same Supabase project as the rest of the site. Dormant unless Supabase is configured: with no project URL the browser makes **zero** voice requests (test C6). | ✅ Yes |

The browser never contacts a speech provider. Azure is called **server-side only**, from
inside the Edge Function.

```
browser ──► our Edge Function (zhino-voice) ──► Azure AI Speech
        ◄── audio/mpeg                      ◄── audio/mpeg
```

## Credential handling

- `AZURE_SPEECH_KEY` lives **only** in Supabase Secrets. It is not in the repository, not
  in `.env.example`, not in any workflow, and not in the build.
- Verified against the built bundle: `AZURE_SPEECH_KEY`, `Ocp-Apim-Subscription-Key`,
  `speech.microsoft.com` and `cognitiveservices` each appear **0 times** in
  `dist/index.html`.
- `npm run verify:supabase` fails the build if the browser-side voice layer ever gains a
  provider credential, hardcodes a third-party host, or stops routing through
  `zhino-voice`.
- The function reads its key via `Deno.env.get` only, never echoes it, and never uses a
  `service_role` key.

## Data sent

| Sent | Not sent |
|---|---|
| The assistant's **answer text** (already shown on screen) | The customer's question |
| | Name, address, phone, e-mail |
| | Cart contents, order history |
| | Any cookie, device or advertising identifier |

Enforced by test C2 (the customer's question must never appear in a voice request) and by
the fact that only rendered assistant text is ever passed to the player.

## Function-side controls

| Control | Value / behaviour |
|---|---|
| Origin allow-list | `TTS_ALLOWED_ORIGINS` / `ALLOWED_ORIGINS` → `403` for unknown origins |
| Max text length | 1200 characters → `413`/`400` |
| Max body size | 8000 bytes → `413` |
| Rate limit | 40 requests / 5 minutes per IP → `429` |
| Upstream timeout | 20s (voice-list probe 8s) |
| Unconfigured | `501` + `not_configured`, never a stack trace |
| Upstream failure | `502` with **no upstream detail** forwarded to the client |
| SSML injection | Input is XML-escaped; every `name="…"` in the generated SSML must equal the configured Persian voice (smoke section 39b asserts this at attribute level) |
| Database | **None.** Unlike `zhino-assistant`, this function touches no table and holds no DB client. |

## Storage and retention

- Generated audio is held **in browser memory only** (a `Map`, max 12 entries) so that
  replaying an answer costs no extra quota. It is never written to Supabase Storage,
  never to `localStorage`, never to disk, and it is discarded when the page is left.
- Object URLs are revoked when replaced or on unmount — no blob leaks.
- No new database table, column, bucket or RLS policy was introduced by this phase.

## Availability / failure behaviour

A failure of the voice service degrades quietly and never blocks the chat: cloud → device
speech engine → the same short honest message as before (tests C5 and C6). The answer
itself is always rendered as text regardless.

## Verification (addendum)

`npm run typecheck` ✅ · `npm run verify:data` ✅ · `npm run verify:supabase` ✅
(includes the new voice checks) · `npm run build` ✅ + bundle secret-scan ✅ ·
`npm run smoke` ✅ (includes section 39b — 32 checks that execute the real function
against a mocked `Deno`/network, covering the rate limit, CORS preflight, origin
allow-list, malformed input, upstream timeout, empty audio and the text cap) · `npm run test:voice-android` ✅ (S1–S5) ·
`npm run test:voice-cloud` ✅ (C1–C7)
