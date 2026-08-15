# Casparel subscription roadmap

Written: 15 August 2026, revised the same day after the role-specific tiers landed. Shipaton deadline: 30 September 2026.

This roadmap follows two changes: the one that made Casparel's tiers about stored data as well as AI usage, and the one that specialised the tiers by role (Student/Teacher Plus and Pro), gave Free a small AI taste, and made every paid allowance finite — uncapped is now an admin property only. It is deliberately ordered by what blocks revenue, not by what is most interesting to build.

## Revision note (same day)

- The tier set is now seven: `free`, generic `plus`/`pro` (kept, still honoured), `student-plus`, `student-pro`, `teacher-plus`, `teacher-pro`. Roles never mix: a role-specific plan resolves to Free while the account's role does not match, purchases are never rewritten, and the paywall only sells packages for the buyer's role.
- Free's "no AI" decision was reversed into a taste: 2 discovery searches/day and a flat 2 deep reports per rolling 30 days (first worded "1/day, 2/30 days", corrected after the owner flagged it as reading like a maths error).
- Phase 1's first item (Pro sold as uncapped but globally capped) is **resolved by product definition**: nothing is sold as uncapped any more. The global budgets remain as operational guards, raised to defaults that clear paying demand (discovery 200/day, deep 100/day).
- Phase 1's third item (`tierForPackage` substring mapping) is improved — role words are recognised, `pro` beats `plus` in ambiguous names — but explicit dashboard-identifier mapping remains the real fix before launch.
- New consequence to own: **legacy `premium` buyers were sold "unlimited deep research" and now resolve to finite Pro caps.** The caps are large (15/day, 150/30 days), but store copy and any renewal messaging must be corrected before the next release, and a goodwill path (e.g. grandfathered higher caps) should be decided consciously rather than discovered by a complaint.

## What changed

Tiers previously differed only in AI: Free had none, Plus had allowances, Pro was uncapped. That priced the part of the product that stops costing money when a user goes quiet, and left the part that never stops costing money — rows, indexes, backups — completely unpriced. An abandoned free account holding forty classes and a thousand activities cost the same to run as an empty one.

Each tier now also carries a capacity budget:

| Capacity            | Free | Plus | Pro      |
| ------------------- | ---: | ---: | -------- |
| Classes owned       |    1 |    5 | uncapped |
| Members per class   |   30 |  100 | uncapped |
| Study activities    |   25 |  250 | uncapped |
| Resource lists      |    5 |   50 | uncapped |
| Learning goals      |   10 |  100 | uncapped |
| Canvases            |    3 |   30 | uncapped |

The rules that make this safe to sell:

- **Nothing is ever deleted or hidden when a plan shrinks.** An over-limit account keeps everything and simply cannot add more of that kind until it is back under. Destroying a teacher's roster because a card expired would be a far worse failure than refusing the next insert.
- **Rosters are charged to the teacher who owns the class**, never to the student joining it. A free student joining a Pro teacher's class is never blocked by their own plan.
- **Limits live in one table** (`CAPACITY_BY_TIER`) that the enforcement helper, the usage endpoint and the tests all read, so a limit shown to a user and a limit applied by the server cannot drift apart.
- **Refusals carry data, not just prose**: `402` with `code`, `capacity`, `limit`, `used` and `requiredPlan`, and `requiredPlan` names the cheapest plan that would actually fit the request.

Verified locally at first writing: typecheck clean, 203/203 tests, web build green. After the role-tier revision: typecheck clean, 218/218 tests, web build and the full 51-render browser audit green.

## The two named experiences

The tier model has to speak for the product's flagship experiences by name, not only in table rows. Two were missing from the first two revisions of this document.

### The seating arrangement suite

Four pieces, placed individually. Manual Classroom Designer (grid and custom desks), student seating-change suggestions to the teacher, and per-student private notes are on **every plan** — they are the collaborative core, and the notes are valuable even if the planner is never run. The **explainable seating planner** is the Teacher Pro feature (generic Pro keeps it for legacy holders; admins always have it).

Corrected in this revision: the planner was being sold as "AI seating-plan suggestions" — including in copy written yesterday — but the implementation is **deterministic**: pattern rules over the teacher's notes (front/back needs, keep-apart/keep-together relationships) and a seat-scoring loop, with no model call anywhere. That is the same truth-in-labeling failure the August audit existed to catch, one release away from an App Store listing. All copy (402 body, web editor, Terms) now says rule-based and explainable, never AI. Two consequences worth writing down:

- Being deterministic is why it is feature-gated but **not metered**: it costs nearly nothing to run, so there is no allowance to spend and no admin-only bypass to design.
- If it is ever rebuilt on a model (free-text priorities interpreted by an LLM is the obvious upgrade), it must join `AI_RATES_BY_TIER`, get a quota, and only then may the copy say AI.

### The personal assistant

What exists today is the **adaptive dashboard**: goal path steps, confidence check-ins, evidence capture, and a ratings-based resource-effectiveness heuristic that recommends the next action. It makes no model calls and is deliberately **free on every tier** — it is the activation loop the readiness review's evidence dashboard measures, and paywalling the surface that teaches users why Casparel matters would starve every paid tier of buyers. Its check-ins write learning-evidence rows, which are not yet capacity-metered (added to Phase 4).

A **model-backed personal assistant** — chat over your own goals, schedule, evidence and saved resources, answering "what should I do next and why" with citations into the library — is the strongest candidate flagship for the Student ladder, and the honest place for it is this roadmap, not the feature list:

- **Placement if built:** taste on Free (a handful of turns/day), a real daily allowance on Student Plus, the headline allowance on Student Pro; it joins `AI_RATES_BY_TIER` like every other AI surface, because uncapped remains admin-only.
- **Safety before tiers:** the audience includes minors. It needs the same posture as source review — cite, hedge, show limitations, never present itself as an authority — plus moderation on both sides of the conversation, before any pricing question matters.
- **Sequencing:** after the store gates. It is exactly the "broad new feature" the August audit warned against spending the remaining runway on. Nothing in the product may describe it as existing until it does.

## Phase 1 — before any of this can be sold (target: by 22 August)

These are correctness problems in the paid path. Every one of them can take money and give nothing back, so they gate store submission.

1. ~~Pro is sold as uncapped but is capped.~~ **Resolved** — no plan is sold as uncapped; global budgets raised and documented as operational guards. Remaining follow-up: correct legacy-premium store copy (see revision note).
2. ~~Paying users can be told they have not paid.~~ **Mostly resolved** — the client no longer pre-blocks any AI feature on plan (every tier has an allowance; the server answers 429 when it is spent), and the tier now arrives as machine-readable data in `/users/me/usage` instead of being parsed from a label. Residual cosmetic issue: sidebar meters read "Not included" for a moment while usage is loading. Watch it; do not let a future gate read those pending zeros.
3. **Tier is still inferred from product-name substrings** (now role-aware, `pro` beats `plus`, but still a heuristic). Map RevenueCat product identifiers to plans explicitly in the dashboard offering metadata before launch; with seven plans the cost of a wrong guess is now a wrong *product*, not just a wrong size.
4. **Webhook idempotency and `TRANSFER` reconciliation** (open since the August audit). Repeated delivery is normal in RevenueCat, and a store-account transfer can leave the previous Casparel account holding an entitlement it no longer owns. Key on event ID; reconcile subscriber state for both aliases.
5. **The deletion copy is wrong.** Terms and Privacy say deletion "removes your account and the content tied to it". `DELETE /users/me` anonymises the row and bans it; contributions survive, unlinked. The earlier wording described this accurately and was replaced with something shorter and false. This feeds the App Store privacy and Play Data Safety forms, so it blocks submission independently of anything above.

Exit gate: a sandbox purchase of each product grants exactly the tier it names, survives a webhook replay, and a subscriber whose usage endpoint is failing still gets the features they paid for.

### Where users actually see and buy these plans

Plans are now buyable from everywhere, by owner decision (15 August): **mobile** through the RevenueCat native paywall (Apple/Google billing), and **web** by card on `/plans` through RevenueCat Web Billing — the SDK is integrated, role-filters packages like mobile, runs RevenueCat's hosted Stripe-backed checkout, refreshes the account plan via the existing webhook, and shows a Manage billing link for web subscribers. The code path is complete and degrades safely to comparison-plus-instructions when unconfigured. What it still needs to take real money, all dashboard-side: a RevenueCat **Web Billing app** connected to Stripe, web products/offerings for the six paid plans, and `VITE_REVENUECAT_WEB_API_KEY` set at build time. That work joins Phase 1 item 3 (explicit product↔plan mapping) and the sandbox purchase matrix in item 4 — which now must include a web card purchase, cancellation from the customer portal, and a webhook replay. The iOS app deliberately does not link to web checkout (Apple anti-steering); the web page may advertise itself freely.

## Phase 2 — find out whether these numbers are right (23 August – 6 September)

The limits above are a hypothesis. They were chosen for plausibility, not from data, and shipping them as though they were measured would repeat the mistake the August audit was written to catch.

- Log every `PLAN_LIMIT_REACHED` with capacity, tier and account age. The distribution answers the only question that matters: which limit binds first, and does it bind on real work or on a trial account clicking around?
- Measure current usage percentiles per capacity across existing accounts before defending a single number. If the median teacher already owns three classes, a Free limit of one is a wall, not a nudge.
- Instrument the funnel the limits create: limit hit → plan screen opened → purchase. A limit that is never hit prices nothing; a limit hit constantly by people who never upgrade is just attrition.
- Separate the two upgrade reasons in analytics. "I ran out of AI" and "I ran out of room" are different products being sold to different people, and the mix should decide which one the paywall leads with.

Exit gate: each limit is either supported by a usage distribution or deliberately changed, and the decision is written down.

## Phase 3 — the downgrade experience (7–14 September)

Enforcement currently refuses the next write. That is correct and safe, but it is not yet kind, and the first cancellation will expose it.

- Show remaining capacity before the wall, not at it. A meter at 4/5 lists is a fair warning; a 402 on the fifth is a surprise.
- Give over-limit accounts a way back under: a review screen listing what they own, oldest and least-used first, with archive or delete in place. Today the only remedy is hunting for things to delete across six different pages.
- Decide and document a grandfathering policy for accounts that predate the limits. They currently keep everything and hit the wall on their next creation, which is defensible but must be stated in the Terms rather than discovered.
- Add an export path so "you are over the limit" is never the same as "your work is trapped".

## Phase 4 — the capacities not yet covered (15–26 September, or after submission)

The enforced set covers the six largest owned-row tables. It is not everything that writes rows:

- forum posts and comments, direct messages and conversations;
- list items, schedule blocks, study sessions and canvas objects;
- learning-evidence rows, including the adaptive dashboard's confidence check-ins — the personal assistant's own data trail is currently uncapped;
- uploaded images, which are bytes rather than rows and need a storage budget rather than a count.

Uploads matter most: they are the only capacity where one user can cost meaningfully more than another without creating many rows at all. Until there is a byte budget, image-heavy accounts are mispriced in a way row counts cannot see.

Sequencing note: nothing in this phase should displace Phase 1 or the store gates. The competition roadmap's own advice was not to spend the remaining runway on new features until the release gates are green, and that still applies to this work.

## Phase 5 — make the tiers reflect real cost (post-Shipaton)

- Attribute actual storage per account — table bytes plus index and upload bytes — and compare it against what each tier pays. Row counts are a proxy for cost; measure the thing itself and correct the proxy.
- Publish a cost per activated learner and per active class, and re-derive the tier boundaries from it rather than from intuition.
- Revisit whether classes should be priced per seat rather than per class. Teacher-led distribution is the stated 3–6 month growth path, and a per-class limit prices a 12-student class the same as a 95-student one.
- Consider an institution tier only once a school has actually asked, and only after the per-account cost basis exists to price it.

## Open questions (updated)

- The role-specific capacity numbers are as much a hypothesis as the first table was; Phase 2's instrumentation now needs a `tier` dimension so student and teacher demand can be read separately.
- When a teacher on `teacher-pro` self-switches to student (losing verification, per the role-switch route), their plan resolves to Free until they switch back. That is the strict reading of "roles do not mix" and is reversible, but the switch screen should warn about it.

## Earlier open questions

- Should a teacher's roster limit be consumed by co-teachers as well as students? Currently every member counts equally.
- When a Pro teacher downgrades to Plus with a 150-member class, the class stays intact and no member can be added. Is that the right outcome, or should the roster be frozen but re-openable for replacements?
- Free is one class of 30. That fits a single small class but not a typical secondary timetable. If the intended free user is a student rather than a teacher, the teacher-facing free tier may need to be a trial rather than a permanent plan.
