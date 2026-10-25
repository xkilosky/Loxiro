# Loxiro

**Search, without the noise.** A mobile-first, installable search companion with direct downloads and on-device smart tools.

**Live app:** https://loxiro-preview.vercel.app/
**Original concept & plan:** https://loxiro-preview.vercel.app/plan.html

## Unified search (v0.3)

Normal searches now produce **one combined feed**, not an engine picker. Loxiro queries available sources concurrently, canonicalizes/deduplicates links, fuses source rankings, promotes cross-source agreement, and diversifies domains. Each result shows its sources; disconnected and failed providers are visible. Top ten unique matches are shown. “Best” is a transparent relevance heuristic, not a truth guarantee.

Server-side adapters:

| Source | Setup | Coverage |
|---|---|---|
| Google via Serper | `SERPER_API_KEY` | Full-web search results via Serper |
| Brave Search | `BRAVE_SEARCH_API_KEY` | Full-web search results |
| Wikipedia | No key | Encyclopedia knowledge |
| DuckDuckGo Instant Answers | No key | Instant answers / related topics, **not full web results** |

To enable full-web fusion, add the two server-only variables in **Vercel → loxiro-preview → Settings → Environment Variables (Production)**, then redeploy. Never use a `VITE_` prefix or commit actual credentials. Without them, Loxiro explicitly labels its limited knowledge-source coverage. Bing and Perplexity are not aggregation adapters; explicit bang shortcuts can still open external destinations.

For local development run `npm run dev:api` in a second terminal. Optional secrets can be placed in ignored `.env.local` (see `.env.example`). The backend uses Node 22+ and a same-origin `/api/search` route.

Production deployments need a durable rate limiter / platform firewall and provider spending limits before enabling paid APIs at scale. The supplied per-instance in-memory rate limiter is basic burst protection, not a distributed abuse defense.

## Other features

- **Fast search:** one search/address field, local suggestions and history, keyboard navigation, and a unified result feed. Explicit bang shortcuts can open specialized destinations.
- **Real source attribution:** results are obtained server-side from responding sources after submitting a query. No fabricated or demo results.
- **Smart routing:** recognizes URLs, questions, code queries, calculations, colors, conversions, and bang shortcuts (`!yt`, `!w`, `!gh`, `!so`, and more).
- **Smart tools:** safe arithmetic parser (no eval), unit conversion, HEX/RGB/HSL color studio, text counts/transforms/export. They work offline.
- **Downloads:** streamed direct-file downloads, received bytes, actual transfer speed, concurrency control (1–4), cancel/retry, persisted transfer history. Includes a same-origin sample file to try.
- **Spaces:** create colored collections, save links, filter, delete, and copy. Deleting a space moves its links to Reading list.
- **Settings:** light/dark/system theme, reduced motion, recent-history toggle, new-tab preference, JSON data export, clear data.
- **PWA:** manifest, generated icons, offline app shell, browser installation instructions and native install prompt where supported.
- Responsive desktop sidebar and mobile bottom navigation; keyboard shortcuts, focus-trapped dialogs, accessible status messages, reduced-motion support.

## Important boundaries

This is a **web search companion**, not a new Chromium rendering engine. It does not render arbitrary sites internally, install browser extensions, or change your device's default browser.

Unified searches call a serverless aggregation endpoint; queries are shared with its connected providers, which have their own privacy policies. Server responses are not cached and the app does not persist query history on the server. Hosting-provider request logs may include queries. There is no analytics, account system, or AI model inference. “Smart” means deterministic on-device tools and routing, not generated AI answers.

Download speed depends on your network and source server. No acceleration guarantee. In-app sources must allow CORS; blocked or very large sources can be opened directly in your browser. Transfers are limited to **200 MB per file**, buffered in memory, and require the app to stay open. There is no resumable/background-transfer claim. Interrupted transfers become cancelled after reload. Browser downloads remain on disk when local app data is cleared.

Data is stored in versioned `localStorage` keys (`loxiro:v2:*`). Browser storage can be cleared or unavailable; keep an exported backup of important saved links. Export is supported; importing backups is not yet implemented.

## Development

```sh
npm ci
npm run dev             # Vite, 0.0.0.0:5173
npm run dev:api         # Second terminal: search backend on port 8787
npm run typecheck
npm test                # 59 unit/hook/backend tests
npm run build           # dist/, service worker, Vercel output
npm run preview         # production preview, 0.0.0.0:4173
```

### Browser checks

In a second terminal, with `npm run preview` running:

```sh
npx playwright install chromium
npm run test:browser
```

Optionally set `LOXIRO_BASE_URL` (default `http://localhost:4173`) or `CHROMIUM_EXECUTABLE_PATH` for an existing Chromium binary. Browser smoke tests use a **mock unified-search API response** for repeatable rendering tests; live third-party search quality/availability is not simulated as a verified result.

The smoke suite checks unified search → attribution → save, reload persistence, creating a space, all four tools, a real streamed same-origin file download, theme persistence, automated accessibility on Home/Settings, responsive overflow (360/390/768/1440), runtime exceptions, service worker installation, offline reload, and offline calculation.

Additional manual automation during development checked all five main screens in both themes with axe WCAG A/AA rules (no detected violations). This is not a complete accessibility audit. Lighthouse performance scores have not been measured.

## Stack & structure

React 19 · TypeScript · Vite 6 · Node serverless aggregation · Lucide · locally bundled Inter variable font · CSS variable design system · Vitest · Testing Library · Playwright + axe.

```
src/App.tsx                   Screens, routing, app state, UI
src/styles/app.css            Responsive design system and both themes
src/data/                     Engines, bangs, suggestions
src/lib/smart.ts              Safe parser, conversions, color/intent logic
src/lib/storage.ts            Persistence, URL checks, file helpers
src/hooks/useDownloads.ts     Streaming download queue
server/search.mjs             Provider adapters and HTTP aggregation endpoint
server/rank.mjs               Canonical URLs, deduplication, rank fusion
scripts/build-sw.mjs          Versioned offline app shell
scripts/stage-output.mjs      Vercel Build Output API v3
scripts/browser-smoke.mjs     Reproducible end-to-end smoke checks
public/plan.html              Original standalone planning preview
public/manifest.webmanifest   PWA metadata
```

## Deployment

The existing `loxiro-preview` Vercel project serves the app and search function. `npm run build` emits both generic `dist/` files and `.vercel/output/static/`. Optional server-only API credentials enable the full-web providers (see above). All production assets and font files are self-hosted. External requests happen on explicit search/navigation/download actions, not when loading Home. The app contains a serverless backend for search; no database is used.

The sandbox's raw `*.e2b.app` URL may require platform traffic authentication. Prefer the stable Vercel app link above.

## Planning archive

- [Original project plan](docs/PROJECT_PLAN.md) — historical planning draft, not the current feature status.
- [Editable concept board](docs/assets/loxiro-concept.svg)
- [Concept PNG](docs/assets/loxiro-concept.png)

The initial plan proposed demo results. The implementation now uses **server-side unified search with honest source coverage**. Spaces are implemented rather than left as a teaser.
