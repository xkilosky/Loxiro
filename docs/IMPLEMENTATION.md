# Loxiro implementation — v0.2

Built with the user's three requested pillars: fast search, direct downloads, and smart browser technology. The application is a PWA search companion, consistent with the mobile-first/no-backend direction.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 42 tests passed (calculator, conversion, engine routing, URL safety, download streaming/failures/concurrency/interruption).
- `npm run build`: passed; JS ~93 KB gzip, CSS ~9.5 KB gzip, one self-hosted Latin variable-font file. These are build sizes, not a speed benchmark.
- Chromium browser smoke: search/engine switching, save and persistence, collection creation, four smart tools, real same-origin streamed download, theme persistence, all screens at 360/390/768/1440 px with no horizontal overflow, no runtime exceptions.
- Production service worker: installed, controlled the page, served offline reload; offline calculation passed.
- axe WCAG A/AA automation: no detected violations on Home, Smart, Spaces, Downloads, Settings in light/dark. Other combinations and a full assistive-technology audit remain untested.
- Knowledge rendering tests mock Wikipedia for repeatability. Real Wikipedia fetch failures have an explicit designed fallback. Access to third-party providers is subject to browser/network/provider policy.
- Lighthouse thresholds from the original plan have not been measured; no claim of those targets being achieved.

## Scope notes

- No fake speedup, simulated download progress, or invented engine results.
- Download transfer progress uses actual stream bytes, maximum 200 MB per file, 1–4 concurrent requests. CORS restrictions and memory/background limitations are surfaced in the UI.
- Local calculator is a restricted recursive-descent parser, not JavaScript eval.
- “Smart” is deterministic intent detection and local tools. AI answer searches can open Perplexity externally; no LLM is running in the app.
- App installation depends on browser support and HTTPS. Native app stores, tab rendering, extension support, accounts, synchronization, and backup import remain future work.
