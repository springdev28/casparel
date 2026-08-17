# Casparel product audit — 15 August 2026

## Executive assessment

Casparel's web/API foundation is materially stronger than a typical hackathon prototype: production is reachable, the API test suite passes, the web app builds, authentication failure paths are exercised, and a broad browser matrix is automated. The product has a coherent education workflow and unusually deep teacher/resource functionality.

The audit found and corrected release-impacting gaps rather than only producing a report:

- the Expo app was absent from the pnpm workspace, lockfile and effective CI typecheck;
- all Expo runtime libraries were classified as development-only dependencies;
- mobile's free plan was sent directly to the paywall even though the API grants a free deep-research allowance;
- mobile premium copy advertised native AI discovery and priority performance that the app does not provide;
- the public Resources page promised starter resources but rendered no initial results;
- public search cards offered a remove action on resources the signed-in user did not own;
- the usage endpoint ignored the monthly deep counter and could offer a request the server would reject;
- the production load-test guard recognised only the old Hostinger hostname, not `casparel.com`;
- the server environment example contained an unused AI flag and stale `.app` origins;
- the browser audit omitted the signed-out Resources page.

These issues are fixed on the audit branch. Store distribution, RevenueCat dashboard state, moderated human testing and sustained-load capacity remain unverified and must not be described as complete.

## Scope and method

The review covered:

- repository structure, workspace boundaries and lockfile;
- web, mobile, desktop and shared design system;
- API routes, tests, OpenAPI/generated clients and Postgres/Drizzle model;
- authentication, authorization, quotas and RevenueCat entitlement flow;
- production landing and public Resources experience;
- CI, builds, page/session audits, load-test safety and deployment workflows;
- accessibility heuristics, product truthfulness, documentation and Shipaton requirements.

Evidence came from code inspection, compilation, unit/integration tests, deterministic signed-in browser fixtures, live signed-out browser review, production API requests, production k6 smoke measurements and official competition documentation.

No real account was created, no purchase was made, no external message was sent, and no destructive load was applied. “User testing” below means task-based expert review and automated synthetic journeys; there were no recruited participants.

## Verification results

| Check                                 |                Result | Evidence                                            |
| ------------------------------------- | --------------------: | --------------------------------------------------- |
| API tests                             |                  Pass | 23 files, 173 tests                                 |
| Web TypeScript                        |                  Pass | `@workspace/app` typecheck                          |
| Mobile TypeScript                     |                  Pass | first resolved workspace run completed cleanly      |
| Expo public configuration             |                  Pass | Casparel slug/scheme, IDs and production origin     |
| Web production build                  |                  Pass | 2,734 modules transformed                           |
| Browser page matrix, baseline         |                  Pass | 33/33 renders before adding public Resources        |
| Browser page matrix, post-change      |                  Pass | 39/39 renders, including public Resources/Support   |
| Session journey audit                 |                  Pass | valid → dashboard; expired/server-401 → login       |
| Production smoke, five iterations     |                  Pass | 20/20 HTTP checks, 0% failures                      |
| Live landing console/runtime          |                  Pass | no observed console warnings or errors              |
| Live public Resources API             |                  Pass | six resources returned by top-rated query           |
| Desktop compile and real-window smoke |                  Pass | four navigation/failure/deep-link cases             |
| Production dependency audit           |               Partial | 3 high fixed; 2 `image-size` findings remain        |
| Native device build and store install |          Not verified | EAS/store credentials and binaries required         |
| Moderated usability                   |               Not run | participant research required                       |
| Concurrent capacity                   | Not run in production | staging-only public/authenticated k6 profiles exist |

The isolated post-change API rerun passed all 173 tests. If a later result disagrees with this report, CI is authoritative.

## Performance

### Production HTTP smoke

Command:

```bash
BASE_URL=https://casparel.com SMOKE_ITERATIONS=5 pnpm run loadtest:smoke
```

One virtual user executed five sequential read-only journeys (20 requests total): health, Resources HTML, latest library items, and a catalog search.

| Metric              | Average |    p95 | Maximum |      Threshold |
| ------------------- | ------: | -----: | ------: | -------------: |
| All HTTP requests   |  151 ms | 224 ms |  284 ms |              — |
| Health              |  174 ms | 272 ms |  284 ms |   p95 < 750 ms |
| Resources page HTML |  143 ms | 188 ms |  197 ms | p95 < 1,500 ms |
| Latest catalog      |  145 ms | 191 ms |  204 ms | p95 < 5,000 ms |
| Catalog search      |  144 ms | 202 ms |  214 ms | p95 < 5,000 ms |

All 20 checks returned HTTP 200. This is a latency/availability sample, not a capacity claim: it has one VU, warm-path effects, no browser rendering time and no authenticated writes. Run the 10→50 VU public and 5→30 VU authenticated profiles against production-like staging with database/CPU telemetry before claiming scale.

### Web bundle

The production build emitted about 3.7 MB of public assets. Notable JavaScript chunks:

| Chunk        |        Raw |     Gzip | Interpretation                       |
| ------------ | ---------: | -------: | ------------------------------------ |
| Entry        |    72.5 kB |  24.8 kB | Healthy application entry            |
| React vendor |   185.8 kB |  58.6 kB | Expected framework cost              |
| Radix vendor |   148.0 kB |  45.9 kB | Shared accessible primitives         |
| Canvas page  |   203.6 kB |  65.9 kB | Feature-specific, should remain lazy |
| Three.js     |   617.4 kB | 157.0 kB | Heavy but route/effect isolated      |
| p5           | 1,129.2 kB | 331.0 kB | Largest lazy dependency              |

Vite correctly warns about chunks over 500 kB. The p5/Three chunks are intentionally separated and are not evidence that first load downloads all of them. Add route-level Web Vitals/RUM before deciding whether to remove them; preserve lazy boundaries and set a regression budget.

## Task-based user review

| Task                                              | Evidence/result                | Finding                                                                                          |
| ------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Understand the product from landing               | Live desktop DOM/visual review | Clear audience, benefits and primary browse/login actions; no runtime errors                     |
| Browse resources without an account               | Live review + API              | Previously empty despite available data; fixed with initial top-rated library cards              |
| Clear a resource query with assistive tech        | Code/a11y audit                | Icon-only clear button lacked a name; fixed with an explicit label                               |
| Recover from expired session                      | Automated session journey      | Pass: token is cleared and login shown                                                           |
| View signed-in core pages in dark/light/mobile    | Fixture browser matrix         | Pass across dashboard, profile, resources, catalog, settings and admin                           |
| Remove a personally submitted resource            | Code/authorization review      | Search UI previously exposed Remove for any signed-in user; fixed to owner only                  |
| Try deep research on free mobile plan             | API/client contract review     | Client incorrectly hard-gated all free users; fixed to consume the free allowance before paywall |
| Understand Premium value                          | Paywall heuristic review       | Unsupported discovery/priority claims removed; benefit now matches deep research                 |
| Select/restore a mobile plan with a screen reader | Native accessibility review    | Labels, roles and selected state added; physical VoiceOver/TalkBack pass remains required        |
| Teacher/admin end-to-end work                     | Render and code review         | Major views render; no live class creation/moderation workflow was executed                      |

### Human research still needed

Recruit at least five students and five teachers, ideally including one keyboard-only and one screen-reader participant. Give tasks, not tours:

1. Find a credible resource for a real topic and explain why it is trustworthy.
2. Save it, cite it and connect it to a goal.
3. Schedule a study activity and find it again the next day.
4. Join/manage a class and understand what is private versus shared.
5. Compare quick versus deep source research and explain the Premium limit.

Measure task completion, time, misclicks, comprehension, confidence and unaided recall. Record the top three breakdowns by audience and run one iteration before submission filming.

## Component assessment

### Web

Strengths: broad functional coverage, consistent design system, good route-level lazy loading, public resource value, role-specific workflows, dark/light support, deterministic browser fixtures.

Risks: breadth increases navigation and QA cost; route-specific SEO is limited by the static SPA shell; the most complex pages (Resources, Admin, Canvas, Class detail) are large and need focused interaction tests, not render-only checks.

### Mobile

Strengths: focused tab structure, shared tokens/API client, secure platform storage abstraction, RevenueCat adapter, restore path, source-review value.

Risks: no verified native build/store install; reduced feature parity; purchase configuration is external; manual accessibility/device testing outstanding. The workspace/package correction now makes compiler drift visible in CI.

### API and database

Strengths: meaningful automated suite, authorization middleware, rate/cost controls, typed core contract, migration-on-startup safeguards, visibility/verification logic, health diagnostics.

Risks: newer domains bypass the OpenAPI source of truth; deep limits have both day and 30-day windows and need clearer product analytics; no verified persistent webhook idempotency/transfer reconciliation; runtime health under concurrency is unknown.

### Desktop

Strengths: intentionally thin, controlled navigation/deep links, compilation and real Electron smoke coverage.

Risks: it depends on web availability and is not an offline experience; release signing/notarisation and updater behaviour were not exercised in this audit.

### Operations and documentation

Strengths: strong CI intent, deploy smoke, environment preflight, migration guidance, safety-conscious load scripts.

Risks: no connected product analytics/error-monitoring evidence was found; old Schoolar identifiers remain internally; prior Shipaton documents overstated native readiness and included stale domains.

## Fixed findings

1. Added `artifacts/mobile` to the workspace and lockfile.
2. Added `lib/api-spec` to the workspace so the required codegen command resolves.
3. Separated Expo runtime dependencies from build/type-only dependencies.
4. Corrected Expo slug and scheme from `schooler` to `casparel`.
5. Removed the now-redundant CI mobile `npx` workaround; root typecheck owns it.
6. Let free mobile users consume the server's deep allowance before showing the paywall.
7. Reconciled client usage with the effective day/month deep limit.
8. Replaced unsupported paywall claims and improved native accessibility semantics.
9. Added initial public library content and its signed-out browser audit coverage.
10. Restricted web Remove actions to the submitting user.
11. Corrected environment feature flags, budgets and production origins.
12. Protected `casparel.com` from accidental non-smoke k6 profiles and added a bounded multi-iteration smoke option.
13. Made the Electron smoke runner portable across Linux, macOS and Windows executable layouts.
14. Added a public Support page and corrected the mobile production Router origin.
15. Added a repository README, full product handbook, dated audit, and separate competition review.
16. Raised transitive PostCSS and nanoid security floors, clearing three high-severity advisories.

## Remaining findings and priorities

| Priority | Finding                                                        | Required action                                                                                          |
| -------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| P0       | No verified iOS/Android release candidate in stores            | Configure EAS/store credentials, build, install on physical devices, complete store review               |
| P0       | RevenueCat products/offerings/webhook not proven in production | Test sandbox purchase, renewal, restore, cancellation, expiry and account mapping                        |
| P1       | RevenueCat transfer events are not reconciled authoritatively  | Use event ID idempotency and subscriber-state reconciliation for source/destination aliases              |
| P1       | Expo/Metro resolves vulnerable `image-size`                    | Upgrade when patched 2.0.3+ is published; avoid untrusted ICNS/JXL/HEIF build input meanwhile             |
| P1       | Newer API routes are outside OpenAPI                           | Add paths/schemas in bounded domain batches, regenerate clients, remove duplicate manual types           |
| P1       | No moderated student/teacher evidence                          | Run the research plan and fix top failures before demo recording                                         |
| P1       | No measured client Web Vitals or crash/error funnel            | Add privacy-conscious RUM/error reporting and define SLOs                                                |
| P1       | Manual native accessibility is incomplete                      | VoiceOver, TalkBack, Dynamic Type, reduced motion and keyboard/switch-control passes                     |
| P2       | SPA metadata is generic across routes                          | Add prerender/SSR or route-aware metadata with crawl validation                                          |
| P2       | Large specialist chunks                                        | Add route performance budgets; optimise only from measured impact                                        |
| P2       | Internal Schoolar naming remains                               | Migrate internal metric/script/event names only with compatibility tests; do not rename `schoolar_token` |

## Release recommendation

Web/API: suitable for continued production use with normal monitoring; merge the audited fixes after CI.

Mobile/Shipaton: not yet submission-ready. Treat the native build, RevenueCat transaction matrix, store publication and human usability pass as release gates. Do not spend the remaining runway adding broad new features until those gates are green.

## Follow-up, 16 August 2026

Work done against the list above since the report was written. The report itself is left as it was on 15 August; this section records what has moved.

### Resource search paging

"Search more resources" fetched a further page and, on a catalog that had run out, changed nothing on screen. Three separate causes, all now fixed and covered by tests:

- **Paging was not over a total order.** `searchCatalog` ordered by relevance then `last_synced_at`, and catalog rows are upserted in batches that share a sync timestamp. Ties were left for Postgres to break however it liked, so page 2 could return rows page 1 had already shown, and the client deduplicated them away to nothing. The order now ends in the row id, which is unique and stable.
- **Later pages started past the end.** Page 2 of a six-row result read from row 16. The offset is now resolved against the number of matching rows, so a later page resumes exactly where the catalog ended.
- **Only page 1 could reach the open providers.** The Open Library and Wikibooks top-up was gated on `page === 1`, and asked both providers for their first results every time. It now runs for any thin page and reads the window matching the requested page, capped at page 8 so a client-controlled page number cannot drive deep upstream paging.

Source-mode paging had a fourth fault: it read `limit * 4` rows to collapse into one card per provider but offset by the card count, so a second page of sources was almost all repeats. It now offsets by the window it reads.

The UI no longer offers an action that does nothing. A page that adds no new results ends the list with a plain sentence, results already on screen survive a failed later page instead of being replaced by the error, and a search with no results says so rather than rendering an empty section. Paging state is reset through one function, so a new search always restores the button — resetting the results while leaving the exhausted flag set was hiding it on searches that had not run yet, including a re-search of the same words with different filters.

### Search relevance

A search for "AP Physics C: Electricity and Mechanics" returned a full-stack web development roadmap, in both the library list and the open catalog. The query is split into words, the words are OR-ed, and each was tested as `column ILIKE '%word%'` — a substring match that does not respect word edges. "AP" matches inside "roadm**ap**", and one accidental hit out of four words was enough to return the row.

Both paths now match at word starts (`column ~* '\mword'`), which still matches prefixes: "physic" finds "Physics", "algebra" finds "Pre-Algebra". Catalog results are additionally ordered by how many of the query's words a row matches, so a row matching one of four can still appear but never above a row matching three. Terms are regex-escaped, because `meaningfulSearchTerms` falls back to the raw query when nothing survives tokenising and an unescaped "C++" is not a valid regular expression.

Anchoring to word starts was not enough on its own. Run against the live site afterwards, the same search still returned GeoGebra Math **Ap**ps and a React course teaching **AP**Is: two letters carry almost no meaning as a prefix. Terms of two characters or fewer now have to match a whole word (`\mAP\M`), which keeps "AP Physics" and drops the rest. Longer terms keep prefix matching, since "bio" finding "biology" is the point.

Verified against a real Postgres rather than by inspection: `artifacts/api-server/src/searchRelevance.db.test.ts` seeds the roadmap alongside two physics resources and asserts it does not come back. It skips without `VERIFY_DATABASE_URL`, since CI has no database.

### The catalog was recording the question, not the answer

Follow-up on the above, after the fix reached production and the same search still returned a Florida high school, the history of wireless telegraphy in Australia, and books on acoustics and nanotechnology.

The remote importers stored each imported work under `meaningfulSearchTerms(query)[0]` — the searcher's own first word. Every book imported while someone searched "AP Physics C" was filed as subject **"AP"**, and the upsert rewrote that subject on every later import. So the catalog learned to answer future "AP …" searches with whatever had been imported during an earlier one. Six of the sixteen rows the live site returned had `subject = "AP"`. Their descriptions were the placeholder "A complete open educational book from en.wikibooks.org", because only a root page's extract was ever kept and the search generator returns chapters.

Both are now fixed at the source, and the rows already written were purged in migration `0049` — the catalog is a cache of public sources, nothing references it, and saved resources live in a different table.

- **Subjects come from the work.** A second request asks the wiki what the page actually is, and the subject is read from its own `Shelf:`/category list, accepted only when it names a subject the catalog already knows. A wiki's categories are written for editors, so taking the first available filed the Advanced Placement article under "1955 establishments in the United States". No match now means no subject rather than a wrong one — a wrong subject is what a later search matches on.
- **Descriptions come from the work.** The same request fetches the intro extract, so a card says what the book is about instead of repeating its host.
- **Chapters roll up to the book.** "FHSST Physics/Electrostatics/Charge" and "Acoustics/Print version" are stored as the works they belong to, and shelves, indexes and disambiguation pages are dropped — the wiki flags the last of those itself.

### Relevance is scored, not counted

Word-start matching removed the accidental substring hits, but every match still counted the same. A query word in the title or subject says the work *is about* that; the same word in a description says only that it came up — which is how one physics search returned a physicist's biography, a high school and the history of nuclear power.

Each query word now scores 2 in the title or subject, 1 in the description, provider or author. A row needs 2 to appear at all: one word in the title, or two mentioned anywhere. At least one word of real length must be among them, so "AP" alone never qualifies a result. Results are ordered by that score, so a work matching three words outranks one matching two.

Measured against a real catalog, "AP Physics C: Electricity and Mechanics" goes from 16 results — six of them unrelated — to 13, all of them AP physics or physics resources, with the two matching AP Physics C courses first.

### Reach and paging

- **Three wikis instead of one.** Wikibooks, Wikiversity and Wikipedia share one importer, run in parallel, and each is asked for 20 works per page rather than 8.
- **Strictness belongs to the query, not the page.** Relaxing an over-strict search per page made page three re-read page two: page one matched strictly and stopped, later pages found none, relaxed, and each read the same loose rows from an offset measured against the strict set. It is now decided once, by counting, for every page of a query.
- **An empty page means the search is spent.** The app stops offering "Search more resources" on an empty page, so an empty page must be the truth. One quiet provider window is not proof, and stopping there stranded results a window further on. The remaining windows are read together, so proving exhaustion costs about one extra round rather than one per window.
- **One card per work, in the API.** Deduplication used to live only in the web client, so the mobile app and the API saw the raw list. Similarity is measured against the longer title: measured against the shorter, every subset scored a perfect match, and "Linear algebra" swallowed "Numerical linear algebra" and "Kernel (linear algebra)" — a first page of sixteen collapsed to four.

- **"Search more" widens the search.** Providers were only ever asked for the exact phrase typed, so the catalog stayed as narrow as the first search that built it: after someone looked for "AP Physics C: Electricity and Mechanics" the catalog held fourteen works, and a later search for plain "physics mechanics" found the same fourteen and nothing else — it never imported, because its page was not thin. A page that has run out now also asks for the topic words together and then each on its own. A course name is a narrow phrase; the subjects inside it are not. Whatever that finds still has to earn its place against the reader's real query, so reaching wider cannot make the results looser.

A cold "linear algebra" search now returns 16, 16 and 16 across three pages, where the same search previously returned four. The AP Physics search returns 13, then 16, then 16 — Newton's laws, University Physics, quantum mechanics, A-level and IB Physics, Electromagnetism, Electricity — 40 distinct works where the button previously produced nothing at all.

### The page was losing results the API had sent

Two client-side faults, both invisible to every check that existed. The API returned sixteen results and the page rendered three; clicking "Search more resources" threw the results already on screen two thousand pixels down the page.

- **The web client had its own deduplication, with the containment bug still in it.** Fixing similarity in the API left the browser measuring overlap against the *shorter* title, where containment scores as a perfect match: every "AP Physics *something*" collapsed into "AP Physics". It also discarded single letters while keeping single digits, so "AP Physics C" and "AP Physics B" became the same two words. And a separate escape hatch merged any two titles sharing two words when either mentioned a course — enough to fold "Khan Academy Algebra Course" into "Khan Academy Geometry Course". The client now measures against the longer title, keeps single characters, and has no escape hatch, matching the API exactly.
- **Loading placeholders stood in for results that were already there.** A full screen of skeletons rendered above the grid whenever a page was loading — including a *further* page, when the reader was looking at results. They now appear under the results, where the new ones will land, and the button is replaced rather than duplicated.

`artifacts/app/scripts/audit-search-results.mjs` drives the search in a real browser and covers both: it counts the cards a page of sixteen produces, and measures the results' position against their own heading while a further page loads. Restoring either fault fails it — the first as "15 of 16 cards", the second as "gap 36px then 512px". It runs in CI and before every deploy, alongside the page and session audits.

### Discover input validation

`q` is a coerced string, so a request with no query arrived at the handler as the literal `"undefined"` and a blank one as `""`. Both parsed cleanly and were searched in full: a catalog query, two calls out to the open providers, and — with nothing stored to match — a spent AI allowance, for a query nobody typed. The handler now rejects a missing or blank `q` before any of that.

### Duplicate route declaration

`routes/discover.ts` declared `GET /resources/discover`, the same path as `routes/resources.ts`, and was never mounted — so the rate limiter, the AI quota and every fix lived in one file while a stale copy calling `gpt-4o` sat beside it. This is the `/auth/login` defect in a second place. The dead file is deleted, and `app.routing.test.ts` now walks the mounted app and fails on any path declared twice, with the one documented compat exception listed by name.

### Findings closed

| Was | Now |
| --- | --- |
| P1 RevenueCat transfer events are not reconciled authoritatively | Closed in code. Events are claimed by provider event id in a new `webhook_events` table before the plan is written, so a re-delivery is acknowledged without re-applying; a failed write releases the claim so the provider's retry still lands. `TRANSFER` used to be dropped entirely — it carries no `app_user_id` — and now moves the stored plan and expiry from the source accounts to the destination and drops the source to free, without unentitling an account that appears on both sides. Still unproven against real RevenueCat traffic; that remains part of the P0 above. |
| P1 Newer API routes are outside OpenAPI | Advanced discovery is done: `exactPhrase`, `exclude`, `source`, `freshness`, `sourceQuality`, `difficulty`, `accessType`, `license`, `contentLength`, `captions` and `transcript` were accepted at runtime but absent from the spec, so no client type or schema covered them. They are in `openapi.yaml` now and the clients are regenerated, which typed six filter values in the web app that were plain strings before. Other domains are unchanged. |

Everything else in the table above still stands.

## Follow-up, 17 August 2026

Reported: "Still so few results, even with the search for more." Measured on the live site before the work below, over three pages: `photosynthesis` returned 10, then 2, then 0; `mitosis` 16, then 1, then 0. Three independent causes.

### The relevance bar was backwards for short queries

A row had to score two points to be a result at all. Against a four-word query that is a third of the query and rightly permissive. Against a one-word query it is the *maximum* score, so it demanded the word appear in the title or the subject and nothing else would do — and the works actually about the topic were in the catalog, unreachable. Every one of the twelve results the live site had for `photosynthesis` had the word in its title; chlorophyll, the Calvin cycle and the photosystems were stored and could not be returned.

The bar now belongs to the query rather than being a constant: when the whole query is one word of real length, a work that mentions it is an answer. A lone abbreviation stays strict, because "AP" appearing somewhere is not a topic — that is what answered an AP Physics search with a Florida high school.

### Paging was positional, over a set that grows while it is read

This endpoint stores works as it finds them, so the result set is bigger on page two than it was on page one, and a work stored during page two can rank on page one. Everything below it shifts down — back into a window page one already showed. Measured against the live wikis on a cold catalog, a third of every "search more" page was results the reader already had. Measured against the same catalog once it had stopped growing: none of it was. Positional paging is correct over a stable set and cannot be over this one.

Results now carry a `cursor` — where the row sits in the ranking, as fixed-width sortable text — and the `catalogId` they came from. Asking for more sends back the largest of each, and the read is everything after that place in the ranking *or* stored since. Both halves are necessary: the cursor alone buries the late arrivals for good, and each page came back thinner than the one before it (`shakespeare` fell from 38 distinct results to 32); the `sinceId` alone cannot say where the reader stopped. Together they guarantee that a page repeats nothing and loses nothing.

The client sends the *largest* cursor it holds, not the last one: the server spreads sources across a page and the client then dedupes and hides results, so the final card is not the furthest into the ranking. The audit fixtures deliberately rank out of order to hold that.

### The route's rate limit was rationing reading

`discoverLimiter` allowed five requests a minute, set when the endpoint called OpenAI on every request. It no longer does — the stored catalog answers first and the AI is a fallback reached only when the catalog has nothing. Five had stopped guarding an expensive call and become a cap on reading: search once, press "Search more resources" four times, and the fifth press was refused with "you can run up to 5 AI web searches per minute" about a request that never went near an AI. The browsing cap is thirty; the AI's own five-a-minute allowance is now taken at the AI call, where it counts only requests that make one.

Measured after all three, over four pages against the live site: `photosynthesis` 64 distinct results with no repeats (was 12), `mitosis` 57 (was 17).

### Every page claimed to be the home page

Search Console had four pages indexed, one reported as a redirect and three as "discovered — currently not indexed". The cause is in the HTML: the app renders client-side, so one shell was served for every address, and that shell contains `<link rel="canonical" href="https://casparel.com/">`. A canonical tag is not a hint but a declaration that this page *is* that other page, so `/resources` — the page the product is about — told Google it was a duplicate of the front page, as did `/terms`, `/privacy` and both auth routes.

The shell is now filled in per route before it is sent: its own title, description, canonical, Open Graph and Twitter tags, and its own `<h1>` for a reader without JavaScript. The route list lives in the frontend build (`scripts/generate-seo.mjs` writes `_seo/routes.json` beside the sitemap it is derived from) so the sitemap and the pages it points at cannot disagree, and a bundle predating the file gets the old behaviour instead of an error. Both spellings of a path are served rather than redirected, because a redirect is itself an "excluded" verdict. The two auth routes are served with real titles but marked `noindex` and dropped from the sitemap: a sign-in form has nothing to rank, and asking for it to be indexed spends crawl budget to be told no.

`app.crawlable.test.ts` drives the production branch of `app.ts` against the real shell and the real metadata file, so the failure mode — HTTP 200, a perfectly good page, and only the part a search engine reads is wrong — is covered by something that fails.

### One shared definition of a duplicate work

The rule for when two results are the same work existed twice, in the API and in the browser, and the copies had drifted. `lib/resource-identity` is now the only copy, imported by both.

### Also in this pass

- No single source takes a whole page. Wikipedia has an article on everything, so it won every slot and sixteen results read as the same thing over and over.
- An exclude-source filter, on the library listing and the open catalog alike, matched against the provider name, the link and the provider site so "Wikipedia" and "wikipedia.org" both work.
- A recent search replays its filters, not only its words. The account-synced copy needed the field adding to the preferences schema as well, or zod stripped it on the way through.
- The two database-backed test files are one file. Vitest runs separate files in parallel workers and each truncated the other's fixtures mid-run, which is why the paging suite reported that "physics mechanics" had two results.

### Seven live sources, and a filter to choose between them

Reported: "Everything Google can show, casparel must show", after a search with Wikipedia excluded returned nothing.

The catalog had four live sources and all four were MediaWiki. Wikipedia was 58% of the stored rows, so excluding it removed most of every page — and because the exclusion was applied when *reading* the catalog rather than when importing, the round's whole budget went on fetching rows that were then filtered away. A reader who excluded it got five results and a "Search more" button that vanished.

Three sources are added, all genuinely open access, so a link a reader follows opens the thing rather than a paywall:

- **Directory of Open Access Books** — academic books, free in full. The closest thing to a textbook shelf.
- **Directory of Open Access Journals** — peer-reviewed articles in fully open journals.
- **Europe PMC**, restricted to `OPEN_ACCESS:Y` — life sciences and medicine, where the wikis are thinnest on anything current.

Plus **Wikisource** as a fourth wiki, for the speeches, treaties and literature a history question wants to read rather than read about. Crossref is deliberately absent despite dwarfing all of these: it indexes everything, most of it paywalled.

They share one importer. Pacing, the cooldown after a failure, collapsing concurrent identical requests, the size cap and the sync record were already written twice; a source now says only how to ask and how to read the answer.

Measured on a cold catalog, one query's first window: 206 rows across seven providers.

Because the catalog now holds five kinds of thing, a **material** filter chooses between them — books, courses, reference, peer-reviewed papers, primary texts. It is not only a filter on the read: a source that cannot produce the material asked for is not imported either, the same waste the exclusion fix removed. Measured on "photosynthesis": any → 15 mixed, book → 14 books, paper → 16 papers, course → 2, primary → 0. The last is correct rather than broken: Wikisource holds no primary text that genuinely matches, and returning seventeen unrelated volumes of *Popular Science Monthly* would be the older defect all over again.

Three things had to get faster to afford seven sources. A thin page now keeps reading windows until it is full instead of stopping after one round; windows went from twenty works to fifty, which is the most the MediaWiki API returns in one request; the gap between requests to one host went from 1100ms to 350ms, since requests to a host are serialised and that gap was the floor on an import. A provider that fails now rests for a minute, so an outage costs its timeout once rather than on every round of every search.

Cold first page, Wikipedia excluded: was 5 results and no way to continue; now 16, 16, 16, 16 at 4.5s for the first page and about 40ms for the rest.

### Still open

- **arXiv and OpenAlex** are written up but not built: arXiv returns Atom XML rather than JSON, and OpenAlex could not be verified from the build sandbox (the egress proxy meters it). Both are key-free and worth adding.
- **DPLA, Europeana, OER Commons, LibreTexts and YouTube** all need an API key or a different protocol. They are the next real step up in breadth and need credentials to proceed.
- **The catalog's size cap** is 50,000 rows by default (`CATALOG_MAX_ITEMS`, up to 250,000). Seven sources fill that far faster than four; at roughly 1.5KB a row, 250,000 rows is under half a gigabyte, so the cap is a deliberate choice rather than a storage limit.
- **Page one is Wikipedia-heavy** even at a share of two per source, because the balance reorders the window rather than choosing it. Fetching a source-diverse window needs per-source quotas in the SQL.

### Per-source quotas, in the SQL rather than after it

Page one still leaned on the largest source: eleven Wikipedia articles out of fifteen for "photosynthesis", with books, courses and papers waiting behind them. Balancing the response could not fix that, and it is worth being precise about why. Relevance chose the *window* — sixteen rows — before anything was rearranged, so the other sources were never fetched. Reordering sixteen Wikipedia articles produces sixteen Wikipedia articles in a different order.

The interleaving is now part of the ordering. Each row carries a band: its source's two best answers are band 0, the next two band 1, and so on, from `row_number() over (partition by provider order by score desc, relevance asc, id asc)`. The page orders by band first, so a source's third answer waits behind everyone's first and second, and the window itself is diverse.

The band had to be reconciled with the cursor, because ordering and paging have to agree. The cursor gained a leading two-digit band field, and the band is computed *before* the cursor predicate is applied — so it means "this row's place in the whole ranking" rather than "its place among what is left", and a cursor issued for an earlier page still names the same place. A three-field cursor, written before the band existed, is refused rather than reinterpreted: read as a banded cursor it would name a different place in a different order, which is the defect the cursor was introduced to remove. A refused cursor falls back to positional paging for that one request.

Response-level balancing still runs, but only for results that carry no cursor — the AI fallback. Applying it to catalog rows would undo an order chosen with the whole result set in view.

Measured on a cold catalog, four pages:

| | before | after |
| --- | --- | --- |
| "photosynthesis", page 1 | Wikipedia ×11 of 15 | Wikipedia ×4, DOAJ ×4, Europe PMC ×4, Wikiversity ×2, DOAB ×1 |
| "photosynthesis", 4 pages | — | 61 sent, 61 distinct, 0% repeats |
| "AP Physics C…" excluding Wikipedia | 5 results, then nothing | six sources per page; 63 sent, 63 distinct, 0% repeats |

The diversity did not cost paging accuracy, which was the thing worth checking: a banded order over a growing set could have reintroduced the repeats the cursor was built to remove, and measured across four cold-catalog pages it did not.

### Filters that were asking the wrong question

Reported: "some filters aren't even complete, like you cannot select more than one type of resource like pdf and video".

The panel was single-select throughout. That is not a missing convenience, it changes the question: a reader who wants something to watch *or* read had to search twice and compare two pages by hand, and there was no way at all to ask for two subjects. Every filter was audited and split into two kinds — alternatives, which should take several answers, and ladders, which should not.

Now accepting more than one value, as a comma-separated list on the wire: **format**, **subject**, **grade level**, **material** and **source credibility**. One value behaves exactly as it did. Deliberately left single: access, licence, freshness, date added, minimum rating and minimum reviews are all "at least this much" rather than alternatives, and language, result type and the sort orders are single by nature.

The list filters are validated rather than filtered. An unknown `format` or `material` value is a 400 with the allowed values, not a search that quietly ignores the filter and hands back everything — the same class of silent wrongness as the rest of this report.

Five filters are new, all of them backed by data the catalog already stores rather than guessed:

- **Published between**, two years. A work with no recorded publication date is excluded rather than assumed recent.
- **Author or contributor**, matched against the stored author.
- **Exclude subjects**, a list. Distinct from excluded *words*, which match anywhere: this one is about how a work is filed.
- **Topic must be in the title** — requires the strong-field score on every substantive query word, so the topic is what the work is about rather than something it mentions. The inverse of the widened one-word bar, and the reader can now choose between them.
- **Preview image** on the open catalog, not only the saved library.

One reusable `MultiSelectFilter` component carries all five multi-value filters — a popover of checkboxes whose value is the same comma-separated string the search sends, the history stores and the URL would carry, so there is nowhere for an array and a string to disagree.

Two things worth recording from the implementation. `ResourceFormat` was `InsertCatalogResource["format"]`, and because the column has a database default that type includes `undefined` — which quietly put `undefined` into every list of formats; it is `NonNullable<…>` now. And `filterValues` initially lived in `catalog.ts`, which the route tests mock wholesale, so every request 500'd in tests while typechecking cleanly; it belongs in `searchTerms.ts` with the other query-string helpers.

The browser audit covers the headline case directly: it ticks pdf and video, checks the trigger reads "2 formats", and checks the request carries `format=pdf,video`.
