# Loxiro

**Search, without the noise.** A mobile-first, installable search companion with direct downloads and on-device smart tools.

**Live app:** https://loxiro-preview.vercel.app/
**Original concept & plan:** https://loxiro-preview.vercel.app/plan.html

## Unified search (v0.4 — free-source expansion)

Normal searches produce **one combined feed**, not an engine picker. The server selects relevant sources, searches them in parallel, filters irrelevant specialist matches, deduplicates URLs, fuses ranks with modest query-intent priors, and diversifies domains (DOI registrant prefixes count separately). Top ten unique links show source attribution. “Best” is a relevance heuristic, not a truth guarantee.

**12 keyless integrations:** Wikipedia, Wikidata, DuckDuckGo Instant Answers, Crossref, OpenAlex, Europe PMC, Open Library, Internet Archive, Hacker News, Stack Overflow, GitHub repository search, and Apple iTunes. Specialists run only when the query matches their subject; unrelated sources stay idle. This is a researched, curated set, **not every free API on the internet**. These sources are not complete web-search indexes, and their free metadata does not mean every linked article, book, or media item is free to access.

| Optional full-web integration | Server-only variable | Documented free allowance / setup |
|---|---|---|
| Tavily | `TAVILY_API_KEY` | 1,000 credits/month; basic search uses 1 credit; free account required |
| Google via SerpApi | `SERPAPI_API_KEY` | 250 searches/month; free account required |
| Google via Zenserp | `ZENSERP_API_KEY` | 50 searches/month; free account required |
| Google via Serper (legacy) | `SERPER_API_KEY` | Trial/paid; additionally requires `LOXIRO_ALLOW_PAID_PROVIDERS=1` |
| Brave Search (legacy) | `BRAVE_SEARCH_API_KEY` | Recurring $5 credit with paid-overage-capable pricing; additionally requires `LOXIRO_ALLOW_PAID_PROVIDERS=1` |

Plans change; verify current limits before signing up. No accounts, payments, or API keys are provisioned by Loxiro. No paid provider is enabled by default. Providing a key does **not** prove its account is on a free plan; use a free plan, disable auto-upgrades/overages where available, and set provider-side hard limits. Loxiro's in-memory protection does not enforce a monthly billing cap.

To connect a free-tier web API, add its server-only variable in **Vercel → loxiro-preview → Settings → Environment Variables (Production)** and redeploy. Never use a `VITE_` prefix or commit actual credentials. Without a responding full-web integration, the app explicitly labels coverage as limited. Bing and Perplexity are not aggregation adapters; explicit bangs still navigate externally.

The query planner selects at most **8 sources/search**. Each upstream HTTP request has a **4.2-second deadline** and bounded body size. Successful results (including empty responses) have a **60-second memory-cache TTL**, shared in-flight queries are coalesced, and failures do not discard other sources. Per-source pacing, HTTP Retry-After, GitHub rate resets, Stack Exchange backoff, quota exhaustion, and a two-failure circuit breaker reduce quota waste. Multiple vendors relaying the same Google index count as one ranking vote while retaining attribution.

For local development run `npm run dev:api` in a second terminal. Optional secrets go in ignored `.env.local` (see `.env.example`). The backend uses Node 22+ and same-origin `/api/search`.

**Scale limitation:** cache, cooldown, circuit breaker and 12-searches/minute/IP limiter apply per warm server instance. They are not global quotas. Configure distributed rate limiting / a platform firewall and provider-side spending controls before public high-volume use. Open Library is intended for low-volume human-facing discovery, not a bulk or high-traffic commercial backend. Provider terms, identification recommendations, and documentation are cataloged in [docs/SEARCH_PROVIDERS.md](docs/SEARCH_PROVIDERS.md).

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

Unified searches call a serverless aggregation endpoint; queries are shared with its connected providers, which have their own privacy policies. HTTP responses are private/no-store. Public result snippets are cached only in server memory with a 60-second TTL and hashed query keys; nothing is written to disk as search history. Hosting-provider request logs may include queries. There is no analytics, account system, or AI model inference. “Smart” means deterministic on-device tools and routing, not generated AI answers.

Download speed depends on your network and source server. No acceleration guarantee. In-app sources must allow CORS; blocked or very large sources can be opened directly in your browser. Transfers are limited to **200 MB per file**, buffered in memory, and require the app to stay open. There is no resumable/background-transfer claim. Interrupted transfers become cancelled after reload. Browser downloads remain on disk when local app data is cleared.

Data is stored in versioned `localStorage` keys (`loxiro:v2:*`). Browser storage can be cleared or unavailable; keep an exported backup of important saved links. Export is supported; importing backups is not yet implemented.

## Development

```sh
npm ci
npm run dev             # Vite, 0.0.0.0:5173
npm run dev:api         # Second terminal: search backend on port 8787
npm run typecheck
npm test                # unit/hook/backend tests
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
server/search.mjs             HTTP boundary and unified aggregation
server/providers.mjs          17 API adapters (12 keyless, 3 free-key, 2 paid opt-ins)
server/planner.mjs            Relevant source routing and fan-out cap
server/runtime.mjs            Bounded TTL cache, in-flight dedup, pacing/cooldowns
server/transport.mjs          Bounded JSON transport, deadline, retry hints
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

### Website destinations (v0.4.1)

The combined feed now **leads with an available website match**, not an encyclopedia page. Website/reference badges and counts make the distinction visible. Wikipedia and Wikidata record pages are supporting references: at most two enter the diversity pass before other available website destinations; reference-only searches are still displayed honestly rather than filled with made-up URLs.

For named organizations, products and people, the Wikidata adapter also batches a lookup of [P856 website statements](https://www.wikidata.org/wiki/Property:P856) and returns direct website links. Preferred statements win over normal statements; deprecated/ended statements and unsafe/local addresses are excluded. These are **crowdsourced directory listings, not independently verified official sites or general-web crawling**. If enrichment fails, the original reference results survive. No guessed domains or static popular-site seed list is used. The enrichment adds at most one HTTP request: the planner still caps source adapters at eight (up to nine upstream requests with this enrichment); each fetch has its own 4.2-second deadline.

The app shows a clear **“Enable broader website search”** setup panel when no full-web service is connected. Add one of `TAVILY_API_KEY`, `SERPAPI_API_KEY`, or `ZENSERP_API_KEY` in the linked secure environment settings and redeploy; never paste keys into chat. The directory feature does not remove that requirement for general-web queries. No connection is silently created and no billing is enabled.
