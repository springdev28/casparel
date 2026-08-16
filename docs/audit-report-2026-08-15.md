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

Verified against a real Postgres rather than by inspection: `artifacts/api-server/src/searchRelevance.db.test.ts` seeds the roadmap alongside two physics resources and asserts it does not come back. It skips without `VERIFY_DATABASE_URL`, since CI has no database.

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
