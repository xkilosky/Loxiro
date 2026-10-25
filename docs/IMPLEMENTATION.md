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

# v0.3 — Unified search

User change: replace provider picking with one merged, ranked result feed.

- The browser now calls same-origin `GET /api/search?q=…`. A Vercel Node function searches the configured providers concurrently with independent 5.5-second timeouts; one failure does not discard the others.
- Providers: Google via Serper (`SERPER_API_KEY`), Brave (`BRAVE_SEARCH_API_KEY`), Wikipedia, and DuckDuckGo Instant Answers. The last two are **knowledge sources, not complete web-search indexes**. Bing and Perplexity are not aggregation adapters; their explicit bang shortcuts remain external links.
- No API keys are embedded in the client. Missing keys produce `not_configured`, network/provider errors produce `unavailable`, and empty successful responses are distinct. No fixture results are shipped in the app.
- Ranking uses reciprocal rank fusion (one vote per provider), a bounded text-match boost, and a domain-diversity pass. The top ten unique URLs are displayed with their contributing sources and a ranking explanation. It is a heuristic, not an objective quality/accuracy guarantee.
- Canonicalization removes fragments and known tracking parameters and normalizes scheme, www, and trailing slashes, while preserving meaningful parameters. It deduplicates equivalent URLs; it does not detect every mirrored or semantically equivalent article.
- The server does not persist queries or log provider diagnostics. Response caching is disabled. Queries are necessarily shared with participating providers and may be present in hosting-provider request logs.
- The API validates query size (200 characters), limits results, and applies a bounded in-memory IP rate limit (12 searches/minute per warm instance). This is **not a distributed billing-abuse defense**: configure a durable/shared rate limiter or platform firewall and API spending limits before opening paid providers at scale.
- Local development/production preview needs `npm run dev:api` in addition to the Vite server. Vite proxies relative `/api` requests to port 8787; the browser never calls localhost directly.
- 17 new backend tests cover canonicalization, consensus ranking, deduplication, domain diversity, failed/unconfigured providers, API response normalization, validation, and secret exclusion. 59 total unit/hook/backend tests pass. Browser smoke now checks the unified feed, attribution, limited coverage, save/persistence, results-screen axe checks, responsive overflow, and offline tools. Browser API responses are mocked, not proof that paid providers are connected.

# v0.4 — Free-source expansion (supersedes v0.3 provider/cache details)

- Registry: 12 keyless sources, 3 optional recurring free-key web integrations, 2 explicitly opt-in paid/credit-capable legacy integrations. Full catalog, terms and limits: [SEARCH_PROVIDERS.md](SEARCH_PROVIDERS.md).
- Query-topic routing selects at most 8 APIs, runs them concurrently, and does not contact skipped providers. The output stays one deduplicated top-ten feed with attribution. Google relay vendors cannot multiply ranking votes.
- New transport/runtime modules implement 4.2-second fetch deadlines, 1.5 MB bodies, 60-second memory-only result TTL, bounded 160-entry cache, in-flight coalescing, per-source pacing, Retry-After/GitHub reset/Stack Exchange backoff handling, and a two-failure cooldown circuit. These are per warm instance, **not** distributed quotas or billing protection.
- API/UI distinguish skipped, unconfigured, explicitly disabled, unavailable, quota/cooldown, empty success, and cached success. Privacy text now explains short-lived in-memory snippets; HTTP no-store and no disk-persisted search history remain.
- Tavily uses basic search with no automatic credit escalation or generated answer. SerpApi/Zenserp return Google organic results only. No accounts or billing changes are made. Credentials are not acquired or client-exposed.
- Tests cover all 17 response shapes, routing, fan-out, secret exclusion, paid opt-in, cache expiry/eviction/coalescing, cooldown/recovery, filtering, malformed/oversized data and same-index vote dedup. Browser tests mock statuses/results deliberately, not source availability.

## v0.4 validation

- 103 unit/hook/backend tests pass, plus TypeScript checking, production build, staged serverless-module import, and `git diff --check`.
- Chromium smoke passes unified feed/attribution, free-key/cached/cooldown statuses, save/persistence, Spaces, tools, real sample download, themes, results/Home/Settings axe checks, 360/390/768/1440 px overflow checks, runtime errors, service-worker/offline reload and offline calculation. API data is explicitly mocked in this browser suite.
- Initial production checks returned real Wikipedia, Wikidata, Crossref, OpenAlex, Europe PMC, Stack Overflow, Internet Archive and Apple catalog data. DOI agreement between Europe PMC and OpenAlex produced a merged result with both source labels. DDG failed, Open Library timed out, and GitHub reported an upstream rate limit; these did not discard working sources. This is a spot check, not an uptime promise. Keyed web adapters remain unconfigured and cannot be live-verified without the user's credentials.
- Live relevance review led to medium-specific Apple/Archive requests, lower catalog/community ranking priors, no HN fan-out for biomedical-only research, and DOI registrant-prefix diversity rather than treating every scholarly publisher as one domain. Three regressions cover those refinements.

- Final live rechecks confirmed medium-scoped music results, a scholarly feed with merged DOI attribution, and successful GitHub repository retrieval after its earlier quota reset. Open Library still timed out and DDG remained unavailable. Repository searches now remove standalone routing words (e.g. “GitHub repository”) while preserving native search qualifiers such as `repo:owner/name`.

# v0.4.1 — Website destinations in the combined feed

User correction: searches must include actual websites, not only Wikipedia.

- The latest environment inspection still found no configured search keys. Do not claim general-web search is connected.
- The Wikidata adapter now returns direct P856-listed website destinations as well as record references, with one batched claims lookup. Deprecated/ended listings and unsafe/local addresses are excluded; preferred statements suppress normal ones. Directory entries are attributed and explicitly **not independently verified**, not invented sites or a replacement for a web index.
- The best available website leads the unified feed. Wikipedia/Wikidata references share a two-item diversity allowance before backfill; missing website candidates never trigger fabricated links. All results are still one combined feed, not engine selection.
- Website/reference labels and counts are visible. When general web search lacks credentials, an expandable setup panel links to secure environment settings and documents supported server-only free-tier keys. Configured outages are distinguished from missing setup.
- 115 tests pass, including 12 new website extraction, safety, current/preferred statement handling, enrichment/failure fallback, ordering, reference balance, and coverage regressions. TypeScript, build, staged module import and browser/axe/responsive/offline checks are required before deployment. Browser fixtures now include a direct website and verify its first position, badges and setup panel.
