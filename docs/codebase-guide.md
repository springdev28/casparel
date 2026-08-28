# Casparel codebase guide

Last verified: 23 August 2026

This guide explains how the repository works as a system. Read it before the generated [source file index](source-file-index.md): this document provides the mental model; the index tells you the role and connections of every individual file.

## 1. The system in one pass

Casparel is one product with four user-facing surfaces and one shared backend:

```text
Browser (React/Vite) ─┐
Expo mobile ──────────┼─ HTTPS /api ─> Express routes ─> domain helpers ─> Drizzle/Postgres
Electron desktop ─────┤                         │                  │
Public share links ───┘                         ├─ OpenAI/catalog providers
                                                ├─ Google Classroom
                                                └─ RevenueCat webhooks
```

The browser is the canonical, complete client. The Electron application is intentionally a controlled shell around that web client. Expo provides a smaller native experience that uses the same account and API. Public resource/list routes expose deliberately limited data without authentication.

The important architectural rule is that product behavior belongs on the server or in a shared domain helper, not separately in each client. Clients decide presentation and local interaction state; the API decides identity, authorization, quotas, persistence, trust, and external integration behavior.

## 2. Repository boundaries

| Area | Responsibility | Connects to |
| --- | --- | --- |
| `artifacts/api-server` | Express 5 API, auth, business rules, integrations, webhooks | OpenAPI/Zod contracts, Drizzle DB, external providers |
| `artifacts/app` | Full React/Vite browser product | Generated React Query client, shared design system, public/protected API |
| `artifacts/mobile` | Expo Router native client | Same API, secure token storage, RevenueCat purchases |
| `artifacts/desktop` | Thin Electron shell | Canonical configured web origin and OS deep links |
| `artifacts/schoolar-edu` | Shared web design system and preview gallery | Imported by `artifacts/app` as `@workspace/edu-ds` |
| `lib/api-spec` | OpenAPI source of truth | Generates the React Query and Zod packages |
| `lib/api-client-react` | Generated client hooks/types | Used by the web app; never hand-edited |
| `lib/api-zod` | Generated runtime schemas/types | Used by the API; never hand-edited |
| `lib/db` | Drizzle connection, migrations, and schema | Used by every persistent API domain |
| `lib/integrations-*` | Reusable OpenAI client/server adapters | Keeps provider mechanics outside product screens/routes |
| `scripts` | Build, workspace, document, and validation tooling | Called from root/package scripts and CI |
| `load-tests` | Guarded k6 smoke/load profiles | Targets explicit deployed environments |

## 3. A request from click to database

For a typical signed-in web action:

1. `artifacts/app/src/main.tsx` creates the React root and global providers.
2. `artifacts/app/src/App.tsx` selects a lazy route and a public or authenticated shell.
3. The page calls a generated hook from `@workspace/api-client-react`, or a small hand-written adapter for an API area not yet generated.
4. The client attaches `localStorage.schoolar_token`. This legacy key is a compatibility contract and must not be renamed.
5. `artifacts/api-server/src/app.ts` receives the request and forwards `/api` to the router registry.
6. `routes/index.ts` dispatches to the domain router. `requireAuth` decodes the token and establishes the server-trusted identity; authorization helpers then check account/workspace roles and ownership.
7. The route validates input with generated Zod or a local schema, invokes reusable domain logic, and queries a table exported from `@workspace/db`.
8. The route shapes and validates its response. React Query caches it and invalidates related keys after a mutation.

Never trust a user ID, role, entitlement, verification state, ranking, or price supplied by a client. The server must derive those values from the authenticated principal and persistent state.

## 4. Contract and code generation flow

`lib/api-spec/openapi.yaml` is the contract source of truth:

```text
openapi.yaml
   ├─ codegen ─> lib/api-client-react/src/generated/* ─> web hooks and request types
   └─ codegen ─> lib/api-zod/src/generated/* ─────────> API request/response validation
```

To add an endpoint, update OpenAPI first, run `pnpm --filter @workspace/api-spec run codegen`, implement/register the Express route, and add coverage. Generated folders carry machine-generated comments but are intentionally excluded from the hand-written comment pass because regeneration replaces them.

`apiContractCoverage.test.ts` is a migration guard: legacy undocumented operations are explicitly baselined, while newly registered routes must not silently increase contract drift.

## 5. Authentication, roles, and authorization

Authentication answers “which account is this?” Authorization answers “may this account perform this action here?” Keep them separate.

- `lib/auth.ts` hashes passwords and signs/verifies tokens.
- `middlewares/requireAuth.ts` converts a token into a trusted `AuthenticatedRequest`.
- `lib/authz.ts` resolves account role, active workspace role, class membership, teacher verification, and ownership rules.
- `middlewares/requireAdmin.ts` and `lib/adminAccess.ts` protect administrative surfaces.
- `routes/auth.ts` owns registration, login, profile/role changes, and public user views.

The same user can work in student and teacher contexts. A workspace role affects the current UI and scoped notifications; it must not grant an account-level privilege by itself. Role transitions that invalidate teacher trust must clear the relevant verification state server-side.

### Administrator control flow

The browser's `AdminPage.tsx` and `ResourceReviewQueue.tsx` use generated admin hooks for sensitive operations. Each request crosses the same chain:

```text
admin dialog/table
  -> generated OpenAPI client
  -> requireAuth (live account + ban state)
  -> requireAdmin (platform authority)
  -> generated Zod validation
  -> Drizzle transaction/query
```

Administrator authority (`users.role === "admin"`) is deliberately separate from `activeRole`, which can only be `student` or `teacher`. Account search/filtering is executed by the server with bounded pagination, so the UI never needs to download the full user table. Bans persist their reason on the account and take effect for already-issued tokens because `requireAuth` reloads the user row on every protected request.

Plan overrides write `users.plan` and an `adminAuditLogs` row in one transaction. The audit row retains the actor ID, target ID, reason, and before/after state even if an account is later deleted. Entitlement helpers then derive features from that server-side plan; the client does not decide paid access.

Resource moderation is a state transition (`unverified` → `verified` or `rejected`). Public resource queries use `resourceVisibilityCondition`, so approval becomes public without copying data elsewhere, while pending/rejected content remains visible only to its submitter and administrators. Pending totals come from the database rather than the currently loaded page.

## 6. Learning-resource workflow

The core product path spans several domains:

```text
discover/search
  -> preview/provenance
  -> save resource
  -> source review/credibility
  -> add to list or learning goal
  -> schedule/study activity
  -> record learning evidence
  -> dashboard/analytics next action
```

- `routes/discover.ts`, `lib/catalog.ts`, `lib/searchRanking.ts`, and `lib/searchTerms.ts` find and rank candidates.
- `lib/resourcePreview.ts` resolves safe preview metadata and uses `resourcePreviewCache` to avoid repeated network work.
- `routes/resources.ts` persists the learner's library and public resource views.
- `lib/sourceProvenance.ts`, `routes/sourceReview.ts`, and `sourceReviewCache` explain source trust without allowing AI or host suffixes to auto-grant authority.
- `routes/lists.ts` and `resourceLists` organize resources. Public list endpoints expose a privacy-filtered projection.
- The list-membership read under `/resources/:resourceId/list-memberships` reports live current saves for the authenticated workspace; it is intentionally different from historical workflow-event completion.
- `routes/learningGoals.ts`, `routes/learningWorkflow.ts`, and `lib/workflowState.ts` turn organization into an actionable learning path.
- `routes/studyActivities.ts`, `routes/schedule.ts`, and `routes/studySessions.ts` provide time-based execution.
- `routes/learningEvidence.ts` stores proof/reflection attached to completed learning work.
- Mobile path steps use a local absolute-timestamp focus clock and persist its durable outcome through `learningEvidence` (`pathStepId`, elapsed seconds, and an idempotent submission key). This remains separate from meeting-based collaborative sessions.
- `lib/workflowAnalytics.ts` and `workflowEvents` compute privacy-conscious activation and reliability signals for the admin overview.

Ranking, credibility, sponsorship, and teacher recommendation are separate concepts. The updated Drive plan proposes mobile advertising, but no sponsored placement may alter organic ranking, source review, lists/paths, or teacher judgment.

### Search-quality evidence

`api-server/scripts/benchmark-search.mjs` executes the audit specification's 36-query English/Turkish/robustness corpus against a configured API and captures the top 10 exactly as returned. The reusable `search-benchmark-lib.mjs` owns the fixed corpus and release thresholds so the runner and tests cannot drift: 10 results, at least 3 providers, at most 4 results from one provider, no more than one reference in a learning-intent top 5, 70% meaningful previews, and the expected inferred intent. Reports also retain same-provider counts for top 5/top 10, archive/container count, no-result rate, median provider diversity, and preview coverage.

Automated metadata cannot decide whether a result actually teaches the requested topic. Each run therefore creates `search-human-review.csv` with the section-7 rubric. A reviewer scores topical relevance, pedagogical usefulness, directness, and trust/transparency for every top-10 result. The offline review command validates all 360 rows and calculates aggregate useful Precision@5; incomplete or out-of-range sheets cannot pass, the threshold is 0.80, and a critical AP query fails if an obviously irrelevant result appears in its top three.

Use a seeded staging/snapshot API rather than an unreviewed production target because a normal discovery request may populate remote-catalog caches or invoke an enabled AI fallback. A transport/configuration failure is `BLOCKED-EXTERNAL`, a captured result-set gate failure is `FAIL-CONFIRMED`, and only complete automated plus human evidence supports a search-quality release claim.

## 7. Classes, communication, and collaboration

- `routes/classes.ts` owns classes, memberships, invitations, resources, recommendations, assignments, and seating state.
- `routes/googleClassroom.ts` maps Casparel classes to Google Classroom while keeping provider tokens server-side.
- `routes/directMessages.ts` owns request/accept/decline/block-aware private conversations.
- `routes/forum.ts` owns broader community discussions and moderation.
- `routes/canvases.ts` owns collaborative visual-learning canvases.
- `routes/calendar.ts` and `routes/schedule.ts` bridge learning work into time-based views.

Every collaboration query must filter by the authenticated participant or class membership. A sequential numeric ID is never authorization.

## 8. Persistence and migrations

Each file in `lib/db/src/schema` defines one domain's tables, relations, constraints, and indexes. `schema/index.ts` is the public schema barrel used by API modules. Timestamp columns use string mode so runtime values match generated Zod string schemas.

`lib/db/src/migrate.ts` applies ordered SQL files at API startup. Schema changes require both the TypeScript schema change and a migration. Old migrations and Drizzle snapshots are historical artifacts: changing them after deployment can invalidate environment history, so this documentation pass catalogs them but does not add comments inside them.

## 9. Client state and failure behavior

React Query owns remote server state. Local hooks/helpers own ephemeral UI state, URL construction, preferences, and derived truth. Pages should distinguish:

- loading: the result is not known yet;
- empty: the request succeeded and there are zero items;
- error: the request failed and retry/recovery should be visible;
- stale/refetching: cached data exists while a refresh runs.

Web collection pages use `lib/collection-load-state.ts` to classify the first three outcomes and `components/LoadFailure.tsx` for persistent retry UI. Native screens use `components/ErrorState.tsx`. Embedded selectors follow the same rule: a failed people, resource, list, class, roster, or course lookup may not fall through to a zero-result message. When cached data exists, it stays usable beneath a refresh warning.

`AppErrorBoundary` catches render crashes. `client-telemetry.ts` captures privacy-conscious errors and Web Vitals, while `product-analytics.ts` sends allowlisted product events. The API accepts only bounded, allowlisted context through `routes/analytics.ts`; it is not a general log-ingestion endpoint.

Deep links and public links live in small tested helpers (`auth-redirect`, `class-join-link`, `resource-share-link`, `public-list-link`, and the native `navigation-intent`) so route encoding, allowlists, and open-redirect defenses are not duplicated across pages. The browser also listens for Vite's `vite:preloadError`: when a deployment replaces a hashed lazy chunk while an older tab is open, `chunk-recovery.ts` reloads once per tab session. If the refreshed deployment is still unhealthy, the normal React error boundary appears instead of an infinite reload loop or blank page.

## 10. Mobile shell, sessions, and purchases

Expo Router owns the native screen graph. `app/_layout.tsx` deliberately sits above the auth, onboarding, and purchases providers so it can select the next screen from shared state. A clean launch restores a session only when secure storage contains both the `schoolar_token` token and a minimally valid cached profile; partial or corrupt pairs are removed. Every generated request passes through the hand-written `lib/api-client-react/src/custom-fetch.ts` transport. On an authenticated 401, the mobile `AuthProvider` clears secure credentials and React Query's private cache, after which the root layout returns the user to login. Login and registration 401s are excluded so a mistyped password cannot erase an otherwise valid session.

Incoming native links are treated as intent, not as arbitrary redirect URLs. `utils/navigation-intent.ts` allowlists only implemented native screens, translates shared web aliases such as `/resources/42` to `/resource/42`, and rejects web-only or malformed paths. The root layout holds that intent while login or first-run onboarding temporarily owns the router, then resumes the requested resource, class, schedule, or other supported screen. This keeps native links useful without advertising or attempting to route into web-only goals, canvases, lists, messaging, forum, activities, or admin features.

Tutorials are activation handoffs rather than simulated product shells. Web and mobile each validate a three-step local draft containing only the current step and a bounded learning need, teach the Find → Verify → Save → Organize → Study → Prove loop, and then transfer the need into the real Resources state. Skip clears the draft, Profile/Settings can reopen the guide, and the mobile root distinguishes an intentional replay from a deferred external route. Opening Search is not completion: mobile consumes a one-time first-run marker only after `SaveResourceSheet` receives a server-confirmed list save, matching the web activation boundary.

`mobile/contexts/PurchasesContext.tsx` and `mobile/utils/revenuecat.ts` wrap the RevenueCat client SDK. They load offerings, purchase/restore products, identify the signed-in customer, and expose entitlement state to screens such as the paywall. Purchase and restore remain disabled until RevenueCat has accepted the authenticated numeric Casparel user ID; this prevents a store transaction from being stranded on an anonymous SDK alias. Unknown remotely configured products are hidden instead of being guessed as Pro.

`lib/plan-economics` is the commercial source of truth shared by API, web, and mobile. It owns prices, day/month AI quotas, storage bytes, stable store product IDs, provider-price assumptions, hard request ceilings, and worst-case margin math. The API entitlements and request builders consume it directly; clients render its values but still trust the server for enforcement. `planEconomics.test.ts` makes a quota or provider-price increase fail CI when either monthly or annual worst-case margin drops below 70%. `storageCapacity.ts` adds byte accounting over avatars, activity images, canvases, forum materials, and post attachments without removing row limits. Admin overview exposes current-month estimated AI cost by feature/plan/user, cache savings, storage, revenue, margin, and emergency-budget status without provider credentials.

The client entitlement is a presentation hint, not the final authority for API access. After a native transaction, the client calls the authenticated `POST /users/me/entitlements/reconcile` contract. `routes/billing.ts` fetches Customer Info with the server-only RevenueCat key and writes only `plan` and `planExpiresAt`, so immediate access does not depend on webhook timing and a subscription cannot alter a role or workspace. `routes/webhooks.ts`, `lib/revenuecat.ts`, and `revenuecatWebhookEvents` remain the durable lifecycle path: they persist event IDs, reject duplicates, retain access through cancellation until expiry, and reconcile transfer aliases so retries or out-of-order delivery do not grant twice or leave stale ownership.

The new Drive documents describe AdMob/RevenueCat Ads as planned work on an unmerged draft branch. This worktree should therefore describe the advertising surface as roadmap state until its code, external configuration, real-device tests, and store disclosures are all verified.

## 11. Desktop boundary

The desktop app deliberately does not fork the React product or database. `desktop/src/main.ts` validates `CASPAREL_URL` as an HTTP(S) origin without embedded credentials, creates a sandboxed window with no Node bridge or webviews, and restricts in-app navigation and OS deep links to that origin. Approved HTTP(S) destinations open in the system browser; file, script, credential-bearing, malformed, and other unsafe targets remain inert. Frame-specific permission checks prevent third-party embeds from inheriting the trusted top-level origin.

Desktop availability is equally explicit: an embedded-resource failure leaves the application intact, while a main-frame outage shows a constrained local “Cannot reach Casparel” page. The local page escapes Chromium error text and has a restrictive CSP; it does not pretend the web-backed product is available offline. The real-window smoke suite covers both outage cases, hostile redirects, cold-start deep links, approved browser handoff, and unsafe-protocol blocking. Signing, notarization, updater metadata, and hosted installers are release concerns rather than proof that the product is already distributed.

## 12. How source comments are maintained

Authored source files contain a short `@fileOverview` comment explaining their role and connection to the rest of the system. Complex code should additionally explain:

- why a security or privacy boundary exists;
- why an ordering/idempotency/cache decision is required;
- what invariant a non-obvious transformation preserves;
- what external contract or failure mode constrains the code.

Comments should not translate obvious syntax into English. A comment that says “increment the counter” above `counter += 1` adds noise; a comment that explains why a webhook counter must be updated in the same transaction preserves knowledge.

Run:

```bash
node scripts/document-source-files.mjs --write --index
node scripts/document-source-files.mjs
```

The first command adds missing file overviews and regenerates the complete file index. The second is a read-only coverage check suitable for CI. Generated contracts/design-token modules, migrations/snapshots, JSON, assets, archives, and lockfiles are covered by the index rather than modified.

## 13. Verification and safe change order

For normal code changes:

1. Read `AGENTS.md` and the relevant file overview/domain section.
2. If the API contract changes, edit OpenAPI and regenerate before writing clients.
3. If persistence changes, edit the Drizzle schema and generate/inspect a guarded migration.
4. Keep authorization and validation server-side; keep clients responsible for presentation.
5. Add focused tests for the invariant, then run package tests/typecheck/build in proportion to risk.
6. Regenerate the source index when files are added or removed.

The external release gates remain separate: live production verification, store review, signed installers, physical-device accessibility, RevenueCat sandbox lifecycle, advertising configuration, and moderated student/teacher research cannot be proven by repository tests alone.
