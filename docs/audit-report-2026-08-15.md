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
| Desktop compile and real-window smoke |                  Pass | six navigation/failure/deep-link/protocol cases      |
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

Risks: newer domains bypass the OpenAPI source of truth; deep limits have both day and 30-day windows and need clearer product analytics; RevenueCat's real sandbox/store lifecycle is not externally verified; runtime health under concurrency is unknown. Persistent webhook receipts, duplicate rejection and transfer reconciliation are implemented in the repository.

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
17. Preserved supported native deep-link intent through login/onboarding and added plural shared-link aliases.
18. Made native session restoration atomic and centralized protected-request 401 cleanup.
19. Added a bounded stale-web-chunk recovery path that cannot trap a tab in a reload loop.
20. Hardened the Electron origin/protocol/offline boundary and expanded its real-window smoke suite to six cases.
21. Added durable RevenueCat event idempotency and authoritative source/destination reconciliation for transfers.
22. Replaced passive web/mobile onboarding slides with resumable real-task handoffs; Skip/replay are explicit and activation completes only after a server-confirmed resource save.

## Platform-shell continuation — 22 August 2026

This continuation applies section 6.18 of the full beta audit specification. “Pass” below means the named repository behavior was executed here; it does not convert a simulator or automated check into a physical-device/store claim.

| ID | Result | Evidence and remaining boundary |
| --- | --- | --- |
| PLAT-001 | Automated coverage present | The core activation suite includes a fresh learner at 390 px plus horizontal-overflow assertions. Its safety/configuration validation and the current production build pass; a fixture-backed browser execution remains the stronger pre-release check. |
| PLAT-002 | Code-hardened; device gate open | Clean launch accepts only a matching secure token/profile pair, rolls back partial writes, and clears private query state on protected 401s. A signed clean install and login on physical iOS/Android are still required. |
| PLAT-003 | Pass for stated native scope | Native screens provide dashboard, resources/details/source review, classes/details, schedule, profile and billing. Goals, canvases, lists, messaging, forum, activities, admin and open-catalog AI remain explicitly web-only. |
| PLAT-004 | Pass | Unsupported lists/discovery/priority claims were removed from onboarding/paywall copy; product documentation names the narrower native scope. |
| PLAT-005 | Pass | Three navigation-intent tests cover allowlisted native routes, plural resource/class aliases, and rejection of auth/web-only/external-looking paths. The root layout resumes valid intent after login/onboarding. |
| PLAT-006 | Pass | Three unit tests prove one stale Vite chunk reload, no second reload loop, and safe fallback when session storage is unavailable; the production web build passes. |
| PLAT-007 | Pass | The real Electron window opens an approved HTTPS link through the browser handoff and blocks `file:`; same-origin pinning, credential rejection, disabled webviews and frame-origin permissions remain in the main process. |
| PLAT-008 | Pass | Real-window smoke distinguishes embedded failure (app stays intact) from main-frame outage (truthful local error page). The offline page escapes error text and applies a restrictive CSP. |
| PLAT-009 | Not verified | Automated labels/roles and typechecks cannot prove VoiceOver, TalkBack, Dynamic Type/font scaling, reduced motion or switch/keyboard usability. Record physical-device passes before any store accessibility claim. |

## Search-quality benchmark continuation — 22 August 2026

Section 7 is now executable and auditable, but its current product verdict is **BLOCKED-EXTERNAL**, not pass. This worktree has no local/staging API process or database configuration, and the attempted 36-query run produced only connection failures. The runner now distinguishes that condition from `FAIL-CONFIRMED`; no search-quality claim or ranking change was made from missing evidence.

Repository evidence completed in this continuation:

- all 36 specified starting queries live in one tested corpus with expected intent and critical-query markers;
- objective top-10 gates measure result count, intent, provider diversity/concentration, learn-intent reference concentration, critical archive results and 70% meaningful-preview coverage;
- aggregate evidence records same-provider top-5/top-10 maxima, archive/container top-5 count, no-result rate, median provider diversity and mean preview coverage;
- the generated CSV is spreadsheet-formula-safe and retains the four human rubric dimensions for every result;
- the offline evaluator rejects missing, duplicate, unknown or out-of-range rows, calculates useful Precision@5, requires at least 0.80, and rejects obviously irrelevant critical top-three results;
- 9 focused benchmark-tool tests pass without a network or database; the full API regression suite passes 43 files / 318 tests.

Required next evidence: run the harness against a seeded staging or production-snapshot API, preserve the JSON/Markdown/CSV artifacts, have reviewers score all 360 results, run the offline evaluator, and add unseen holdout queries before the final release freeze. Production should not be used casually because normal discovery can populate remote-catalog caches or invoke an enabled AI fallback.

```text
Issue: SEARCH-003 / SEARCH-022 / section-7 release gate
Before: the runner emitted an unvalidated blank review sheet and treated unavailable infrastructure as a ranking failure.
Code change: benchmark-search.mjs plus search-benchmark-lib.mjs centralize the corpus, objective metrics, statuses, CSV validation and human gate.
Automated regression: search-benchmark-lib.test.mjs (9 passing tests).
Browser verification: BLOCKED-EXTERNAL (no configured local/staging API).
Persistence after reload: NA
Wrong-user authorization: NA
Mobile-width verification: NA
Console errors: 0
Unexpected API errors: 0; 36 expected connection failures from the deliberately unconfigured target.
Benchmark delta: NA until a complete captured baseline and human review exist.
```

## Remaining findings and priorities

| Priority | Finding                                                        | Required action                                                                                          |
| -------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| P0       | No verified iOS/Android release candidate in stores            | Configure EAS/store credentials, build, install on physical devices, complete store review               |
| P0       | RevenueCat products/offerings/webhook not proven in production | Test sandbox purchase, renewal, restore, cancellation, expiry and account mapping                        |
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
