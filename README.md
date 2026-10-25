# Loxiro

**Search, without the noise.** A mobile-first, installable search companion with direct downloads and on-device smart tools.

**Live app:** https://loxiro-preview.vercel.app/
**Original concept & plan:** https://loxiro-preview.vercel.app/plan.html

## What works

- **Fast search:** one search/address field, local suggestions and history, keyboard navigation, engine switching with query preservation. Google, Bing, DuckDuckGo, Brave, Perplexity, plus eight specialized destinations.
- **Real knowledge cards:** public Wikipedia summaries fetched after submitting a query. Full web results open directly at the selected engine. There are no fabricated or demo engine results.
- **Smart routing:** recognizes URLs, questions, code queries, calculations, colors, conversions, and bang shortcuts (`!yt`, `!w`, `!gh`, `!so`, and more).
- **Smart tools:** safe arithmetic parser (no eval), unit conversion, HEX/RGB/HSL color studio, text counts/transforms/export. They work offline.
- **Downloads:** streamed direct-file downloads, received bytes, actual transfer speed, concurrency control (1–4), cancel/retry, persisted transfer history. Includes a same-origin sample file to try.
- **Spaces:** create colored collections, save links, filter, delete, and copy. Deleting a space moves its links to Reading list.
- **Settings:** light/dark/system theme, reduced motion, default engine, recent-history toggle, new-tab preference, JSON data export, clear data.
- **PWA:** manifest, generated icons, offline app shell, browser installation instructions and native install prompt where supported.
- Responsive desktop sidebar and mobile bottom navigation; keyboard shortcuts, focus-trapped dialogs, accessible status messages, reduced-motion support.

## Important boundaries

This is a **web search companion**, not a new Chromium rendering engine. It does not render arbitrary sites internally, install browser extensions, or change your device's default browser.

Search engines open their own live result pages. The app uses Wikipedia's public CORS endpoint for in-app knowledge cards. Providers have their own privacy policies. There is no backend, analytics, account system, paid search API, or AI model inference. “Smart” means deterministic on-device tools and routing, not generated AI answers.

Download speed depends on your network and source server. No acceleration guarantee. In-app sources must allow CORS; blocked or very large sources can be opened directly in your browser. Transfers are limited to **200 MB per file**, buffered in memory, and require the app to stay open. There is no resumable/background-transfer claim. Interrupted transfers become cancelled after reload. Browser downloads remain on disk when local app data is cleared.

Data is stored in versioned `localStorage` keys (`loxiro:v2:*`). Browser storage can be cleared or unavailable; keep an exported backup of important saved links. Export is supported; importing backups is not yet implemented.

## Development

```sh
npm ci
npm run dev             # Vite, 0.0.0.0:5173
npm run typecheck
npm test                # 42 unit/hook tests
npm run build           # dist/, service worker, Vercel output
npm run preview         # production preview, 0.0.0.0:4173
```

### Browser checks

In a second terminal, with `npm run preview` running:

```sh
npx playwright install chromium
npm run test:browser
```

Optionally set `LOXIRO_BASE_URL` (default `http://localhost:4173`) or `CHROMIUM_EXECUTABLE_PATH` for an existing Chromium binary. Browser smoke tests use a **mock Wikipedia response** for repeatable rendering tests; live third-party search quality/availability is not simulated as a verified result.

The smoke suite checks search → engine switch → save, reload persistence, creating a space, all four tools, a real streamed same-origin file download, theme persistence, automated accessibility on Home/Settings, responsive overflow (360/390/768/1440), runtime exceptions, service worker installation, offline reload, and offline calculation.

Additional manual automation during development checked all five main screens in both themes with axe WCAG A/AA rules (no detected violations). This is not a complete accessibility audit. Lighthouse performance scores have not been measured.

## Stack & structure

React 19 · TypeScript · Vite 6 · Lucide · locally bundled Inter variable font · CSS variable design system · Vitest · Testing Library · Playwright + axe.

```
src/App.tsx                   Screens, routing, app state, UI
src/styles/app.css            Responsive design system and both themes
src/data/                     Engines, bangs, suggestions
src/lib/smart.ts              Safe parser, conversions, color/intent logic
src/lib/storage.ts            Persistence, URL checks, file helpers
src/hooks/useDownloads.ts     Streaming download queue
scripts/build-sw.mjs          Versioned offline app shell
scripts/stage-output.mjs      Vercel Build Output API v3
scripts/browser-smoke.mjs     Reproducible end-to-end smoke checks
public/plan.html              Original standalone planning preview
public/manifest.webmanifest   PWA metadata
```

## Deployment

The existing `loxiro-preview` Vercel project serves the app. `npm run build` emits both generic `dist/` files and `.vercel/output/static/`. No environment variables or secrets are needed. All production assets and font files are self-hosted. External requests happen on explicit search/navigation/download actions, not when loading Home.

The sandbox's raw `*.e2b.app` URL may require platform traffic authentication. Prefer the stable Vercel app link above.

## Planning archive

- [Original project plan](docs/PROJECT_PLAN.md) — historical planning draft, not the current feature status.
- [Editable concept board](docs/assets/loxiro-concept.svg)
- [Concept PNG](docs/assets/loxiro-concept.png)

The initial plan proposed demo results. The implementation instead uses **real Wikipedia knowledge summaries + honest external engine links**. Spaces are implemented rather than left as a teaser.
