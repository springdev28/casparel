# Resource & User Verification, Design

> Produced by a multi-agent design pass (4 codebase-mapping agents, 3 independent
> proposals, 3 scoring lenses, 1 synthesis). All three lenses independently ranked
> **Trusted Contributor** first (9 / 8.5 / 9).
> Companion to [`shipaton-2026-roadmap.md`](./shipaton-2026-roadmap.md).


## 1. Recommendation

Ship **Trusted Contributor**: one status column on `resourcesTable` following the forum `moderationStatus` convention with the default inverted to `unverified`, and reuse `users.teacherVerified` as the account-verified flag that makes a submitter's uploads auto-clear. The lever is **verifying people, not links**, a verified submitter's resources publish immediately, so the admin queue drains at the source instead of growing linearly with submissions. Graft three cheap ideas from the other proposals: a **catalog-URL match auto-verifies** (defuses the `handleAddWeb` bulk-save vector, which is the real volume source), a nullable **`verification_source`** column so grandfathered rows stay identifiable, and a **bulk-approve** admin endpoint so the queue is a queue and not a backlog.

---

## 2. How users get verified

### Signals and who grants them

| Tier | How granted | Stored as |
|---|---|---|
| **Admin** | `accountRole === "admin"` (existing, incl. the allowlist auto-promotion at `requireAuth.ts:74-81`) | `users.role`, resolved at read time, never stored as a verification value |
| **Verified account** | **Admin-manual only.** `PATCH /admin/users/:id/teacher-verification` | `users.teacherVerified = true` + `verified_at` + `verified_by_id` |
| **Requested** | **Automatic (self-serve).** `POST /users/me/verification-request` | `users.verification_requested_at = now()`, a queue signal, grants nothing |
| **Unverified** | Default for every new account | `teacherVerified = false` |

**Nothing is automatic except the request.** There is deliberately no domain-based or email-based auto-grant: the repo has no email verification and no mailer dependency (`artifacts/api-server/package.json` has no nodemailer/resend/sendgrid), so anyone can register as `someone@harvard.edu` today. Domain trust without proven email control is theatre and would be a security regression. If email verification lands later, an institution-domain rung becomes a clean follow-up.

### What "verified" buys a user

1. **Their submissions publish immediately**, `POST /resources` stamps `verified` instead of `unverified`, so no review queue, no pending badge, no delay. This is the entire payoff and it must be stated in the UI copy, or nobody requests verification.
2. A **verified badge** on their public profile (once `PublicUser.teacherVerified` is exposed, see §5).
3. **No new privileges.** Verified users do *not* gain forum approval rights: `forum.ts:437` gates on `user.role !== "teacher" || !user.teacherVerified`, so a verified *student* satisfies only half the condition. Verification grants publishing trust, not moderation power.

### Naming honesty

`users.teacher_verified` is reinterpreted as **account-verified**, so a verified student row reads `teacher_verified = true`. This is deliberate debt: renaming touches `forum.ts:437`, `adminUserSelection` (`admin.ts:373-395`), and AdminPage's hand-maintained `AdminUser` type (`AdminPage.tsx:54-77`) for zero user-visible gain. **Leave a comment at the column definition in `lib/db/src/schema/users.ts:27`**, not only in the PR description.

### Three fixes to the existing verification route (all mandatory)

`PATCH /admin/users/:id/teacher-verification` (`artifacts/api-server/src/routes/admin.ts:855-876`) keeps its path, `AdminPage.tsx:381-399` already calls it, with three defects fixed:

- **Real zod body parse.** Today `req.body?.verified === true` means any malformed body silently *un*verifies. Replace with `z.object({ verified: z.boolean() }).strict()` → 400 on bad input.
- **404 when no row matched.** Today it `res.json(undefined)`.
- **Relax the role gate at `admin.ts:864`** from `target.role !== "teacher"` → 400, to `target.role === "admin"` → 400 ("Admin accounts are trusted implicitly"). This is what lets students be verified, and it fixes the collision where an allowlist-auto-promoted admin (`requireAuth.ts:74-81` writes `role: "admin"`) can never satisfy `role === "teacher"` and is permanently un-verifiable.
- `.set({ teacherVerified, verifiedAt: verified ? now : null, verifiedById: verified ? auth.userId : null })`.

### The self-nomination hole, hard prerequisite, not a follow-up

`PATCH /users/me/role` (`artifacts/api-server/src/routes/auth.ts:481-507`) lets **any non-admin set both `role` and `activeRole` to `"teacher"`** with zero checks and leaves `teacherVerified` untouched. Add to the non-admin branch of the `.set()` at `auth.ts:495-499`:

```ts
teacherVerified: false, verifiedAt: null, verifiedById: null,
```

**This line must ship in the same PR as the auto-verify rule.** Without it, the entire trust model is bypassable in one request: self-promote to teacher, get verified, flip back, keep verification forever. If it cannot land, drop the trusted-submitter rule until it does.

---

## 3. How content gets verified

### Scope

`resourcesTable` only. `catalogResourcesTable` gets **no column**: it is written exclusively by `upsertCatalogResources()` (`artifacts/api-server/src/lib/catalog.ts:905`, insert at `:918`) from three provider syncs that all hardcode `metadata.credibility: "established"`. No user input reaches it. "Uploaded to the catalog" by a user always means `POST /resources` → `resourcesTable`, which has exactly **one** runtime insert path (`artifacts/api-server/src/routes/resources.ts:1570`) plus dev seed (`lib/seed.ts:56`, `:69`).

### Status values (forum column shape, inverted default)

```
verification_status : "unverified" | "verified" | "rejected"   NOT NULL, default "unverified"
verification_source : "catalog" | "trusted-submitter" | "reviewer" | "legacy" | NULL
verification_note   : text NULL
```

Plain `text` + `$type<...>`, **not** a pgEnum, matching `forumMaterialsTable.moderationStatus` (`lib/db/src/schema/forum.ts:43-47`). No `CREATE TYPE`, no `ALTER TYPE ... ADD VALUE` hazard, values extensible in code alone.

### What happens on submit (`resources.ts:1558-1591`)

The status is **computed server-side** and is never accepted from the client, it is absent from `ResourceInput`, so `...parsed.data` cannot carry it. Insert the explicit value rather than relying on the column default, so the source is always recorded:

```ts
// 1. catalog match, one lookup, already uniquely indexed on canonical_url
const canonical = canonicalResourceUrl(parsed.data.url);           // resources.ts:78-84
const [inCatalog] = await db.select({ id: catalogResourcesTable.id })
  .from(catalogResourcesTable)
  .where(eq(catalogResourcesTable.canonicalUrl, canonical)).limit(1);

// 2. trusted submitter
const [submitter] = await db.select({ teacherVerified: usersTable.teacherVerified })
  .from(usersTable).where(eq(usersTable.id, userId));
const trusted = accountRole === "admin" || submitter?.teacherVerified === true;

const verification = inCatalog
  ? { verificationStatus: "verified", verificationSource: "catalog" }
  : trusted
    ? { verificationStatus: "verified", verificationSource: "trusted-submitter" }
    : { verificationStatus: "unverified", verificationSource: null };
```

`accountRole` is already on `AuthenticatedRequest`. The catalog rule matters because **`handleAddWeb`** (`artifacts/app/src/pages/ResourcesPage.tsx:1750`, the "Add to library" button on discover results) is the highest-volume producer, and its results come from `searchCatalog` over `catalogResourcesTable`, so most of them auto-clear and never reach a human.

**Explicitly not auto-verifying on host provenance or AI.** `withProvenance()` (`resources.ts:818-891`) classifies `.edu`/`.gov`/`.ac` as institutional, but personal faculty and student pages under `.edu` are trivially obtainable, that rule is an open door dressed as a trust signal. And `moderateForumText` (`forum.ts:154-207`) swallows all errors and returns `flagged: false`, so an AI-gated auto-verify becomes auto-verify-everything during an OpenAI outage. **Both signals are surfaced in the admin queue as decision aids, never as gates.**

### Treatment in listings, hide on discovery, label in context

Add a shared helper (new file `artifacts/api-server/src/lib/resourceVisibility.ts`), shaped exactly like `visibleStatus()` at `forum.ts:209-213`:

```ts
export function verificationCondition(viewerId: number | null, isAdmin: boolean) {
  if (isAdmin) return undefined;
  const ok = eq(resourcesTable.verificationStatus, "verified");
  return viewerId ? or(ok, eq(resourcesTable.submittedById, viewerId))! : ok;
}
```

**HIDDEN (discovery surfaces only, 4 sites):**

| Site | File / line |
|---|---|
| `GET /resources` | push into the shared `conditions` array at `resources.ts:~147`, covers **both** the fast branch (`:261`) and the aggregate branch (`:302`) |
| `topRatedResources()` | `resources.ts:100`, backs `/resources/featured` **and** unauthenticated `/resources/recommendations` |
| `/resources/recommendations` personalised branch | candidate query `~:460` and top-up query `~:475` |
| dashboard `resourceCount` | `artifacts/api-server/src/routes/dashboard.ts:30-32`, or the stat stops matching the visible library |

`GET /resources` has **no auth** today, so it needs the inline optional `decodeToken` block already used at `resources.ts:365-374` and `:922`, plus `isAdminRequest()` from `lib/adminAccess.ts`.

**The owner exception is what kills the submit-then-vanish bug.** `POST /resources` returns 201, `ResourcesPage.tsx:1737` toasts success, `getListResourcesQueryKey()` invalidates, without `or(..., eq(submittedById, viewerId))` the row disappears one tick after the success toast. It also keeps `savedLibraryUrls` (`ResourcesPage.tsx:1291-1305`) complete, so discover stops re-offering resources the user already saved.

**LABELLED, never hidden:** `GET /resources/:id` (`resources.ts:1652`), `lists.ts:54/:97`, `classes.ts:875`, `GET /users/:id/library` (`auth.ts:963`), canvas nodes, schedule attachments. A resource is a pointer to an already-public URL, not hosted content; hiding it breaks share links, bookmarks, and curation users already did, the fastest way to make this feature read as a regression.

**One exception:** `rejected` resources 404 for non-owner/non-admin on `GET /resources/:id`, mirroring the single-item guard at `forum.ts:811`.

---

## 4. Exact schema changes

### `lib/db/src/schema/resources.ts`

```ts
verificationStatus: text("verification_status")
  .$type<"unverified" | "verified" | "rejected">().notNull().default("unverified"),
verificationSource: text("verification_source")
  .$type<"catalog" | "trusted-submitter" | "reviewer" | "legacy">(),
verificationNote: text("verification_note"),
verifiedById: integer("verified_by_id").references(() => usersTable.id, { onDelete: "set null" }),
verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "string" }),
```

Add to the existing index array (`resources.ts:45-59`, alongside `resources_created_at_idx` and the three trgm gin indexes):

```ts
index("resources_verification_status_idx").on(table.verificationStatus, table.createdAt),
index("resources_verified_by_idx").on(table.verifiedById),   // per the 0041_index_foreign_keys precedent
```

### `lib/db/src/schema/users.ts`

```ts
verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "string" }),
verifiedById: integer("verified_by_id")
  .references((): AnyPgColumn => usersTable.id, { onDelete: "set null" }),
verificationRequestedAt: timestamp("verification_requested_at", { withTimezone: true, mode: "string" }),
```

`teacherVerified` (`users.ts:27`) is **unchanged**, no rename, no second boolean.

> **Gotcha:** the self-referencing FK needs the explicit `AnyPgColumn` return-type annotation or TypeScript hits a circularity error. There is currently **zero** `AnyPgColumn` usage anywhere in `lib/db/src/schema`, so import it from `drizzle-orm/pg-core`.

### `lib/db/migrations/0044_resource_verification.sql`

Hand-written per AGENTS.md, **never `drizzle push`, and do not author this with `drizzle-kit generate`.** Statements joined by `--> statement-breakpoint`, matching the shape of `0043_daily_naoko.sql`.

```sql
ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "verification_status" text DEFAULT 'verified' NOT NULL;--> statement-breakpoint
ALTER TABLE "resources" ALTER COLUMN "verification_status" SET DEFAULT 'unverified';--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "verification_source" text DEFAULT 'legacy';--> statement-breakpoint
ALTER TABLE "resources" ALTER COLUMN "verification_source" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "verification_note" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "verified_by_id" integer REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resources_verification_status_idx" ON "resources" ("verification_status", "created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resources_verified_by_idx" ON "resources" ("verified_by_id");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verified_by_id" integer REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verification_requested_at" timestamp with time zone;
```

### Why this backfill approach

The `ADD COLUMN … DEFAULT 'verified'` → `ALTER COLUMN … SET DEFAULT 'unverified'` pair is the key move:

- **No `UPDATE` sweep.** On PG11+, `ADD COLUMN` with a non-volatile default is metadata-only (stored in `pg_attribute.missingval`), no table rewrite, no sustained `ACCESS EXCLUSIVE` lock. Every pre-existing row reads `verified` without a single row being written.
- **Idempotent.** Re-running the migration cannot mass-verify a populated queue: `ADD COLUMN IF NOT EXISTS` is a no-op and `SET DEFAULT` is idempotent.
- **Deploy-day behaviour is byte-identical to today.** Nothing disappears, nothing is queued, no user-visible event. Exactly what you want when a store build is in review.
- The same trick on `verification_source` marks every grandfathered row `'legacy'`, so a retroactive sweep can later find precisely the rows that were never reviewed, the one thing the pure-minimal version could not do.

**Explicit product decision to sign off on:** grandfathering means the feature constrains **nothing already in the library**. Any junk accumulated via `handleAddWeb` before deploy is trusted. The alternative, leaving existing rows unverified, empties the public library and the dashboard count the moment the read filter ships, and opens the queue with the entire table in it. Recommended: grandfather, and sweep `verification_source = 'legacy'` later via the bulk endpoint if it matters.

### `artifacts/api-server/src/lib/seed.ts`

Set `verificationStatus: "verified", verificationSource: "legacy"` on the inserts at `:56` and `:69`, and set the seeded teacher's `teacherVerified: true`. Seed rows are inserted **after** the migration runs, so they land `unverified` and a fresh dev DB boots with an empty library.

---

## 5. Exact API changes

### `lib/api-spec/openapi.yaml`, all additive, none breaking

| Location | Change |
|---|---|
| `Resource` (2680-2711) | add to **`properties` only, NOT `required`**: `verificationStatus: { type: string, enum: [unverified, verified, rejected] }`, `verificationNote: { type: ["string","null"] }` |
| `GET /resources` params (908-957) | add optional `status: { type: string, enum: [verified, unverified, rejected, all] }` |
| `User` (2031-2062), `PublicUser` (2066-2078) | add `teacherVerified: { type: boolean }`, **optional**, then add the column to the explicit selections in `auth.ts` backing getMe and the public profile |
| `POST /users/me/verification-request` | new, user-facing → belongs in the generated client |

**Do NOT touch `ResourceInput` (2713) or `ResourcePatch` (2729).** `PATCH /resources/:id` (`resources.ts:1668-1697`) does `.set(parsed.data)` with the whole validated body gated only by `isResourceOwner`, a field there is a privilege escalation letting submitters self-verify.

**Why `properties` and not `required`:** handlers `.parse()` their own **outgoing** responses (`ListResourcesResponse.parse` at `resources.ts:298`, `:337`; `CreateResourceResponse.parse` at `:1578`; `GetResourceResponse.parse` at `:1663`). A required field turns any producer that misses it into a production 500. Optional degrades to a missing badge. Promote to `required` in a deliberate follow-up once every producer is confirmed.

One `Resource` edit fans out to ~10 operations via the 9 `$ref` sites plus `ListItem.resource` (2900), `UserLibrary.resources` (2121) and `ClassResourceRecommendation.resource` (3024).

### Server-side projection edits (easy to half-do)

`GET /resources` has **two** hand-written explicit column lists, the fast path at `resources.ts:~277-291` and the aggregate path at `~305-317`. **Both** must gain `verificationStatus: resourcesTable.verificationStatus` (and `verificationNote`). Missing one returns `undefined` on one branch only, and the branch is chosen by `sortBy`/`minRating`/`minReviews` params, a nasty intermittent bug. The three copies of `resourceWithRating()` (`resources.ts:58`, `lists.ts:30`, `classes.ts:46`) use bare `select()` and pick the column up automatically once the spec exposes it.

Also add `status: resourcesTable.verificationStatus` to the admin per-user resources projection at `admin.ts:645-658`, **free win**, see §6.

### New / modified endpoints

| Endpoint | Auth | Specced? | Notes |
|---|---|---|---|
| `PATCH /admin/resources/:id/verification` | `requireAdmin` | No | zod `.strict()` `{ status: "verified"\|"rejected"\|"unverified", note?: string(≤1000) }`. Rejection **requires** a non-empty note. Sets the five columns with `verificationSource: "reviewer"`, `verifiedById: req.userId`, `verifiedAt: now`. `.returning()`, 404 if no row. Re-decision allowed (an admin can reverse a mistake), unlike `classes.ts:1061-1087` which 404s unless still pending. |
| `POST /admin/resources/verification/bulk` | `requireAdmin` | No | `{ ids: number[] (max 100), status, note? }`. ~30 lines and the difference between a queue and a backlog. |
| `GET /admin/resources/review-queue` | `requireAdmin` | No | `?q=&submitterId=&sort=oldest\|newest&limit≤50&offset`. Default **oldest** (FIFO is fair and matches "waiting N days"). Returns per item: the resource + `waitingDays`; submitter `{id, name, email, role, teacherVerified}`; `provenance {level, signals[]}` from `withProvenance()` computed in-app for the returned page; **already-cached** `sourceReview {trustLevel, trustReason}` read from `sourceReviewCacheTable` only, **no live AI call, no quota spend on queue load**; `duplicateUrlCount` via one `SELECT lower(url), count(*) … WHERE lower(url) = ANY($1) GROUP BY 1` over the page's URLs. |
| `PATCH /admin/users/:id/teacher-verification` | `requireAdmin` | No (existing) | **Modified**, zod parse, 404, relaxed role gate, stamps `verifiedAt`/`verifiedById`. See §2. |
| `POST /users/me/verification-request` | `requireAuth` + `contentLimiter` | **Yes** | Sets `verification_requested_at = now()`, no-op if already verified, 204. |
| `PATCH /users/me/role` | existing |, | **Modified**, clears `teacherVerified`/`verifiedAt`/`verifiedById` in the non-admin branch. Security-critical. |
| `POST /resources` | existing |, | **Modified**, the catalog/trusted-submitter branch above. |

Admin routes stay **un-specced**, consumed through `AdminPage`'s hand-rolled `adminRequest()` (`AdminPage.tsx:168-186`). This matches the real code, only `/admin/overview` (openapi.yaml:310) of 11 admin routes is specced, and keeps AdminPage on one data-access idiom. It nominally conflicts with AGENTS.md rule 8; if a reviewer objects, speccing `PATCH /admin/resources/:id/verification` is ~20 extra lines and yields a generated hook. **Pick one, do not leave generated hooks and the hand-maintained `AdminUser` type both alive.**

Add `verificationRequestedAt`, `verifiedAt`, `verifiedById` to `adminUserSelection` (`admin.ts:373-395`) so they flow into `GET /admin/users` for free.

### Is anything breaking for existing clients?

**No.** Every spec change is additive and optional. `lib/api-client-react/src/custom-fetch.ts` parses JSON and casts (`as T`), there is no runtime validation client-side, so an added field cannot break web or mobile. No consumer *constructs* a `Resource` literal (48 files import from `@workspace/api-client-react`; all only read), so a new field causes no TS errors either. The only behavioural change is the read filter, which lands in its own PR (§7).

**Codegen:** exactly one run of `pnpm --filter @workspace/api-spec run codegen`. Never orval directly, the npm script also seds `from 'zod'` → `from 'zod/v4'`, strips the `export * from './generated/types'` line from `lib/api-zod/src/index.ts`, and ends with `pnpm -w run typecheck:libs`. Commit the regenerated `lib/api-client-react/src/generated/**` and `lib/api-zod/src/generated/**`; never hand-edit them (`clean: true` wipes both dirs).

---

## 6. UI touchpoints

### Admin queue, `artifacts/app/src/pages/AdminPage.tsx`

The page has **no page-level tabs** (the `Tabs` at `:657-662` are inside the manage-account dialog), so add a sibling `<Card>` in the main scroll, after the account-management Card (closes at `:630`) and before the plan/usage Cards at `:808`. Segmented control: **Resources | User verification**.

Queue row: thumbnail; title linking to the raw URL (`target="_blank" rel="noopener noreferrer"`); submitter chip (name, role, verified state, their pending/rejected counts); "waiting N days"; provenance chip; cached trust level when present; duplicate-count warning; a checkbox column with an **"Approve selected"** bar. Actions: Approve, Reject (opens a note dialog, the Reject button stays disabled until a note is typed, since the API requires one), Open source.

Visual template: the admin moderation tab at `ForumPage.tsx:1824-1880` (report Cards + status Badge + action buttons shown only while pending).

Data layer: clone `setTeacherVerification` (`AdminPage.tsx:381-399`) verbatim into `setResourceVerification`, the house idiom is `setBusyUserId(id)` → `adminRequest(...)` → local list splice / `applyUpdatedUser` → `toast({title})` → `finally setBusyUserId(null)`.

Also at `AdminPage.tsx`: drop the `user.role === "teacher"` condition on the verify button at `:585-590` and relabel to "Verify user" / "Remove verification"; add `verificationRequestedAt`/`verifiedAt`/`verifiedById` to the local `AdminUser` type (`:54-77`) and surface a "Requested verification" marker on the row.

**Free win:** `AdminPage.tsx:748` already renders `{item.status || item.moderationStatus}` as a capitalised outline Badge, and `AdminWorkItem` (`:90-91`) already carries both fields. Aliasing `verification_status` as `status` in the admin resources projection (`admin.ts:645-658`) makes every user's resources render a verification pill in the drawer with **zero UI code**.

### The badge users see

New `artifacts/app/src/components/VerificationBadge.tsx`, generalised from the existing `ProvenanceBadge` at `ResourcesPage.tsx:316-345` (rounded-full bordered chip, `ShieldCheck`, expandable reason).

- `unverified` → amber **"Pending review"**
- `rejected` → red **"Not approved"** + the `verificationNote` shown **to the owner and admins only**
- `verified` → **render nothing.** Once the read filter is on, nearly everything visible is verified; a green tick on every card is pure noise. Absence is the signal.

Showing `verificationNote` on the owner's own card and detail page is how a rejected submitter learns the reason and the appeal path (`docs/notification-events.md` line 17) **without writing to `activity_log`**, which is what keeps this design clear of the `activity_type` enum and dashboard role-filter traps entirely.

| File | Where |
|---|---|
| `ResourcesPage.tsx` | `LibraryCard` (defined `:481`, prop type `:487-499`), badge next to `FormatBadge` (`:412`). One edit covers all three render sites (`:2716`, `:2767`, `:2815`). |
| `ResourcesPage.tsx` | success toasts at `:1737` ("Resource submitted!") and `:1775` ("Saved to library!"), branch on the `verificationStatus` now returned by the 201 so verified submitters keep the immediate-success wording, and everyone else sees "Submitted, pending review". Without this the badge appears unexplained and reads as an error. |
| `ResourcesPage.tsx` | add a **"Pending review (n)"** filter chip to the Library view, backed by `status=unverified`. |
| `ResourcesPage.tsx:1276-1305` | `libraryCatalogParams` / `savedLibraryUrls` must keep returning the user's own unverified rows, or previously-saved-but-pending items reappear as "new" web results and users are prompted to re-save duplicates. The owner exception in `verificationCondition` handles this, verify it. |
| `ResourceDetailPage.tsx` | banner near the format/subject badges at `:1082-1090` (the file already imports `ShieldCheck` and has `TRUST_META`/`Badge` at `:288-291`, `:470`). **Gate the outbound "Open resource" click behind an explicit confirm while unverified**, that click is the actual harm vector, not the listing. |
| `artifacts/mobile/app/(tabs)/resources.tsx` | `ResourceCard` badge row at `:149-152`. Mobile has no discover/catalog UI, so it renders **only** user-submitted rows, most exposed surface, do not skip. |
| `artifacts/mobile/app/resource/[id].tsx` | badges at `:164-167`. |
| Optional, later | Settings "Request verification" button hitting `POST /users/me/verification-request`; verified checkmark on `UserProfilePage.tsx` from `PublicUser.teacherVerified`. |

**Not needed:** `ListDetailPage`, `ClassDetailPage`, `CanvasPage`, `SchedulePage`, `GoalsPage`, `AdaptiveDashboardPage`. These are badge-only surfaces; the field flows through the generated types and can gain a pill in a follow-up without blocking anything.

---

## 7. Phased implementation plan

### PR 1, *smallest safe first PR: submitted resources default to unverified*

**Zero user-visible change. No read filtering. No UI. No spec change. No codegen.**

1. `lib/db/src/schema/resources.ts`, five columns + two indexes.
2. `lib/db/src/schema/users.ts`, three nullable columns (`AnyPgColumn` on the self-FK).
3. `lib/db/migrations/0044_resource_verification.sql`, exactly as in §4, grandfathering via the DDL default trick.
4. `resources.ts:1570`, the catalog-match / trusted-submitter branch on `POST /resources`.
5. `auth.ts:495-499`, clear `teacherVerified`/`verifiedAt`/`verifiedById` on non-admin role change. **Hard gate: this must not lag step 4.**
6. `lib/seed.ts:56/:69`, explicit `verified`/`legacy`.
7. `admin.ts:855-876`, zod parse, 404, relaxed role gate, audit stamps.

Deployable on its own: existing rows all read `verified`, nothing is filtered anywhere, the app behaves exactly as today. New submissions quietly accumulate a status. **~2-3 hours.**

### PR 2, admin queue (still no user-visible change)

`GET /admin/resources/review-queue`, `PATCH /admin/resources/:id/verification`, `POST /admin/resources/verification/bulk`, the `status` alias in the `admin.ts:645-658` projection, and the AdminPage Card. Un-specced, `adminRequest`. Admins can now drain the queue **before** anything is hidden from anyone. **~3-4 hours.**

### PR 3, spec + badges (contract change, still no filtering)

openapi.yaml edits (§5), one codegen run, both explicit column lists in `GET /resources`, `VerificationBadge`, the two web pages, two mobile files, the toast copy. Users can now *see* pending state on their own submissions. **~3-4 hours; budget for red-then-fix-forward on the codegen step.**

### PR 4, flip the read filter (the only behaviour change)

`resourceVisibility.ts` + the optional-token decode, applied to the four hide sites in §3, plus the `status` query param and the "Pending review" chip. **Land this only after the queue has been drained in production.** ~2 hours.

### PR 5, optional, post-deadline

`POST /users/me/verification-request` + Settings card, `teacherVerified` on `PublicUser` + profile checkmark.

**Total for PRs 1-4: roughly one focused day.** Cuttable if the window tightens: the reviewer-trail columns on `resources` (status + note alone satisfy the requirement), the bulk endpoint, the mobile badges, all of PR 5.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **The DDL grandfather trick assumes PG11+.** On PG10 or earlier, `ADD COLUMN` with a default is a full-table rewrite under `ACCESS EXCLUSIVE`. | Confirm the server version before deploy. Any supported Postgres is fine. |
| **`auth.ts:495` role reset omitted** → the whole model is a one-request bypass (self-promote → get verified → flip back → keep verification). | Hard ordering constraint: ships in PR 1 with the auto-verify rule, or the trusted-submitter rule is dropped until it lands. |
| **Only one of the two explicit column lists in `GET /resources` gets updated** (`~277-291` and `~305-317`). | The branch is chosen by `sortBy`/`minRating`/`minReviews`, so the bug is intermittent. Grep for both, and test with `?sortBy=top_rated` explicitly. |
| **Optional (not `required`) spec fields fail silently**, a missed producer returns `undefined` instead of 500. | Deliberate: `Resource.required` already contains `avgRating`/`reviewCount`, which `GET /users/:id/library` (`auth.ts:963-998`) violates today by passing raw rows to `.parse()`. Promote to `required` only as a follow-up after both column lists are confirmed. |
| **Pre-existing `GET /users/:id/library` break will be misattributed to this change.** | Confirm its current behaviour *before* touching `auth.ts`. It is already throwing; it is not yours. |
| **Grandfathering trusts everything already in the library, permanently.** | `verification_source = 'legacy'` marks exactly those rows, so a retroactive sweep via the bulk endpoint is possible later. State this to the user as a product decision, not a migration footnote. |
| **A compromised verified account publishes straight to the public library.** | Admins can flip any resource back to `unverified` via the new PATCH, and revoke user verification. Accept for v1. |
| **Queue backlog with one reviewer.** | Three mechanisms: catalog-match auto-clear (kills the `handleAddWeb` volume), verifying submitters (drains at the source), bulk approve (max 100 ids). Add `pendingResourceReviews` to the admin overview *later*, note `AdminOverview.required` (openapi.yaml:2236-2250) is enforced by `.parse()` on a hand-built object, so the handler must change in the same commit. |
| **`teacher_verified` reinterpreted as account-verified will confuse the next reader.** | Verified safe today (`forum.ts:437` gates on `role === "teacher" && teacherVerified`, so no privilege leaks), but **any future reader that checks `teacherVerified` alone silently grants teacher powers to verified students.** Leave a comment at `users.ts:27`. |
| **Unverified content still reaches a class roster** via the teacher-approved recommendation path (`classes.ts:1061-1087` → `listItemsTable`). | Conscious sign-off. Hiding instead would gut curated lists. The narrow fix, if it matters, is a check in the recommendation-approve handler, not a global filter. |
| **`GET /resources` gains a third copy of the ad-hoc `decodeToken` idiom** (`:365-374`, `:922`). | Extract `optionalAuth` alongside `resourceVisibility.ts` if the window allows; otherwise accept and note it. |
| **Three copies of `resourceWithRating`** (`resources.ts:58`, `lists.ts:30`, `classes.ts:46`) with no shared import. | This design deliberately does not consolidate them, badge-don't-hide means all three want identical unfiltered behaviour. **The moment anyone adds filtering to one, consolidate.** |
| **Latent trap for any future notification work.** | If a verification notification is ever added via `activity_log`: `activityTypeEnum` (`lib/db/src/schema/activityLog.ts`) has no `account` value while `GetRecentActivityResponse.parse()` runs on outgoing rows at `dashboard.ts:90` → 500 for exactly the notified user; and `dashboard.ts:86` filters `eq(workspaceRole, userRole)` with no `"shared"` fallback (unlike lists at `:37`), so shared-role rows are written and never delivered. Adding `account` to a pgEnum also needs its own standalone migration, and note `lib/db/src/migrate.ts:57-77` carries a bespoke pre-migration step for exactly this reason. **This design avoids all of it by not touching `activity_log`.** |
| **Still unfixed, out of scope:** no URL validation on `POST /resources` (`z.string().min(1)`, while `/resources/prefetch` does proper `new URL()` + protocol checks at `:1364-1382`), and no dedupe (no unique index on `resources.url`). | The queue will receive junk and duplicate URLs; `duplicateUrlCount` flags them for the reviewer. A stored `canonical_url` column + unique index is the real fix, separate PR. |
| **Do not re-add the teacher-delete bypass** on `DELETE /resources/:id` while building moderation. | The comment at `resources.ts:1710-1714` explicitly warns against it. `rejected` is the moderation lever admins get instead. |