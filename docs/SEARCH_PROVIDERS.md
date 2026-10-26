# Search provider catalog — updated 2026-10-25

A curated integration list, not an exhaustive list of all free services. Primary documentation was checked; fixture tests validate normalization, not service uptime. Availability, account terms, quotas and free plans can change. Never bypass authentication, scrape result pages without authorization, or rotate public instances to evade limits.

## Keyless sources enabled automatically when relevant

| Source | Scope / official reference | Local pacing and caveats |
|---|---|---|
| Wikipedia | [Action API](https://www.mediawiki.org/wiki/API:Search) | Encyclopedia, not full web; English; 250 ms minimum start interval |
| Wikidata | [wbsearchentities](https://www.wikidata.org/w/api.php?action=help&modules=wbsearchentities) | Entity labels/descriptions, English; 500 ms interval |
| DuckDuckGo | [Instant Answers](https://duckduckgo.com/api) | **Not** its full SERP; 1 second interval; may be unavailable |
| Wikipedia-linked sources | [External links API](https://www.mediawiki.org/wiki/API:Extlinks) | Up to 3 article contexts, 50 links inspected per article (one bounded API response), at most 2 retained/article and 6 total. Selected government/academic/publisher domains only; no crawling or headline invention. Wikipedia-derived, not independent corroboration; 500 ms local interval. |
| MDN Web Docs | [Public search endpoint](https://developer.mozilla.org/api/v1/search?q=fetch&locale=en-US), [MDN source](https://github.com/mdn/yari) | English web-development documentation and attributed summaries; 1 second local interval; public endpoint, not a contracted search API/SLA. |
| ClinicalTrials.gov | [API v2](https://clinicaltrials.gov/data-api/api) | Clinical study registry records, not peer-reviewed findings or treatment recommendations; 1 second local interval; title/summary/status/conditions requested, no patient-level data. |
| Crossref | [REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) | Scholarly metadata/DOIs, not necessarily free full text; 1 second interval; optional real mailto contact |
| OpenAlex | [Authentication](https://help.openalex.org/api/authentication/) | Basic/casual keyless searches supported by current docs; optional free key raises budget; 1 second interval |
| Europe PMC | [REST API](https://europepmc.org/RestfulWebService) | Biomedical/life-science literature; 1 second interval; not medical advice |
| Open Library | [Usage guidelines](https://openlibrary.org/developers/api), [Search](https://openlibrary.org/dev/docs/api/search) | Default 1 request/second; 1.1 second local interval; cache. Human-facing low-volume discovery only; no bulk/high-traffic commercial use. Real contact identification recommended. |
| Internet Archive | [Advanced search API](https://archive.org/advancedsearch.php), [developer portal](https://archive.org/developers/search.html) | Catalog/media/archive discovery; 1.1 second interval; linked access/licensing varies |
| Hacker News / Algolia | [Search API](https://hn.algolia.com/api) | Community stories and discussion, **not** a general news index; 500 ms interval; no HTML highlights rendered |
| Stack Overflow / Stack Exchange | [Advanced search](https://api.stackexchange.com/docs/advanced-search), [Throttle](https://api.stackexchange.com/docs/throttle) | Programming Q&A; 1.1 second interval; identical query cached for 60 seconds; honors per-method backoff and quota exhaustion |
| GitHub | [Repository search](https://docs.github.com/en/rest/search/search#search-repositories) | **Public repositories only**, not code search. Keyless search limit 10/minute; 6.5 second interval; honors exhausted quota/reset |
| Apple iTunes | [Search API](https://performance-partners.apple.com/search-api) | Music/podcasts/film/store catalog, US storefront, approximately 20 requests/minute; 3.1 second interval. Text and store links only; no artwork/preview reuse. Purchases may cost money. |

Pacing is best-effort **per warm server instance**, not an assertion of a provider's universal quota. Providers and shared hosting IPs can impose lower limits. `PROVIDER_CONTACT_EMAIL` must be a real operator-supplied contact, not an invented address. Default User-Agent identifies the project's GitHub URL. No external network calls are made simply by loading Home.

## Optional recurring free-tier web APIs

- **Tavily:** [credits](https://docs.tavily.com/documentation/api-credits), [endpoint](https://docs.tavily.com/documentation/api-reference/endpoint/search). 1,000 free credits/month documented; Loxiro explicitly sets basic depth, no auto parameters, no generated answer, no raw page content. `TAVILY_API_KEY`.
- **SerpApi:** [pricing](https://serpapi.com/pricing), [Google endpoint](https://serpapi.com/search-api). 250 free searches/month and 50/hour documented. `SERPAPI_API_KEY`. Local start interval 73 seconds stays below 50/hour on one instance. Google-backed organic links only, not AI overviews.
- **Zenserp:** [pricing](https://zenserp.com/), [authentication/endpoints](https://app.zenserp.com/documentation). 50 free searches/month documented. `ZENSERP_API_KEY` sent as an HTTPS header. Google organic links only, not answer engines.

All three require the user's own account and key. They are implemented and fixture-tested but **cannot be live-tested without credentials**. No free-key service is described as active merely because an adapter exists. Free quotas are finite; account type and provider-side usage limits control possible charges. No signup, card entry, subscription change or automatic fallback purchase is performed.

Legacy Serper trial/paid and [Brave's monthly credit with paid usage](https://api-dashboard.search.brave.com/app/plans) are retained but require **both** a key and `LOXIRO_ALLOW_PAID_PROVIDERS=1`. They are not advertised as unlimited free sources.

## Selection, quality and transparency

The deterministic primarily English-keyword planner (with basic Spanish topic support) uses relevant subjects (research, health, programming, books, archives, media, technology), plus general knowledge sources. It is a heuristic and can miss intent, especially other languages. Maximum 8 selected adapters/search (Wikidata can make one additional enrichment request); unused sources return `skipped` without receiving the query. Missing keys, disabled paid services, empty successful responses, failures and cooldowns are distinct in the API/UI. Cached answers are labeled. Snippets are plain text, never injected HTML.

Specialist matches must overlap at least 40% of substantive whole-word query tokens, then all candidates enter reciprocal-rank fusion, URL deduplication, stronger title/snippet relevance, intent priors, and domain diversity (DOI registrant prefixes distinguish scholarly publishers). DOI URLs let Crossref/OpenAlex/Europe PMC agree on the same work. Google relay vendors count as **one engine-family vote**; Wikipedia/Wikidata/article discovery share one Wikimedia vote, not three independent confirmations. Source attribution does not certify accuracy, safety, availability or free access. No LLM invents answers or results.

The transport has 4.2-second deadlines and a 1.5 MB response cap. A bounded 160-entry cache with 60-second TTL, in-flight deduplication, provider pacing and backoff protect each warm instance. Two network failures open a 60-second circuit. Retry-After dates/seconds and GitHub reset times are honored (up to one day). Stack Exchange backoff is respected even on a successful response. Nothing retries paid API calls automatically. HTTP responses remain `private, no-store`; caches are not sent to the service worker. Public result snippets are briefly held in memory under hashed keys, never written as search history. Hosting and sources can log URLs/queries. At scale, deploy distributed protection; no monthly spending cap is promised by this code.

Sources intentionally not added include unauthenticated HTML scraping of Google/Bing/DDG, randomly selected public SearXNG servers, and huge catalogs of unrelated APIs that would add latency/noise rather than relevance. arXiv literature is discoverable through the scholarly indexes; no separate XML adapter is claimed. Transient promotional trial credits are not presented as recurring free plans.

Live-check refinements: media APIs are scoped to music/podcast/film as requested; archive book/music searches target title or creator and the matching media type, avoiding incidental description credits. HN is not queried just because a biomedical query says “research”. Wikidata catalog records have a lower ranking prior than direct pages. DOI registrant prefixes, rather than the shared resolver alone, group scholarly-domain diversity. These heuristics are tested, not accuracy guarantees.

## v0.4.1: direct websites, not only reference records

Wikidata entity-search results are now enriched with one batched `wbgetentities` claims request for up to six entity IDs. [P856](https://www.wikidata.org/wiki/Property:P856) lists current **or former** official websites, so the extractor excludes deprecated statements, end-time/end-cause qualifiers, unsafe schemes/credentials, reference destinations and literal local/reserved addresses. Valid preferred statements suppress normal statements. At most two distinct listed addresses per entity are retained. Listings may still be outdated, inaccurate, redirected or compromised: do not treat this metadata as ownership/safety verification. No target page is fetched or its content invented.

Both listed URLs and other specialist/general-web links are classified as website destinations; Wikipedia/Wikidata record URLs are supporting references. The strongest available website leads the feed. An aggregate two-reference diversity allowance prevents Wikipedia plus Wikidata from filling the first pass; as of the research-quality update, references never backfill beyond two even if other sources fail. All existing source attribution, vote deduplication and canonicalization remain. API counts distinguish actual website destinations from references, and `webSearchConfigured` distinguishes absent credentials from an enabled service outage. Directory enrichment never clears `limitedWebCoverage` on its own.

There are now fifteen keyless adapters, including Wikimedia-derived discovery; this is not fifteen independent indexes or a new keyless full-web engine. The eight-source cap means up to nine HTTP requests when the Wikidata adapter enriches entities. Each fetch has a 4.2-second deadline; the two sequential Wikidata requests can take up to about 8.4 seconds before network overhead. Its fallback retains successful reference results if enrichment fails. Full-web adapters remain server-key-dependent.

## Research-quality update (2026-10-25)

Science/environment/economics/education topics activate scholarly catalogs without requiring explicit “research” intent. MDN and clinical records join matching programming/health searches. Natural-question/request scaffolding is stripped for specialist metadata searches, while general-web adapters retain the original query. Whole-word matching, basic inflection/diacritic normalization and bilingual stopwords replace substring filtering. These are heuristics, not multilingual semantic search. External linked-source discovery describes the parent article and shows a clickable article trail; it neither fetches that destination nor claims the link is live, current or accurate. Each discovered domain receives no extra independent Wikimedia vote.

Frontend badges distinguish content categories rather than calling every destination simply a website. Counts show distinct destination hostnames; DOI publishers still share the doi.org hostname in that displayed count. No peer-review, full-text-access, ownership, freshness or accuracy badge is inferred from a URL or catalog entry.
