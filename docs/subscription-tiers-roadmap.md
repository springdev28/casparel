# Casparel subscription roadmap

Written: 15 August 2026. Shipaton deadline: 30 September 2026.

This roadmap follows the change that made Casparel's tiers about stored data as well as AI usage. It is deliberately ordered by what blocks revenue, not by what is most interesting to build.

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

Verified locally: `pnpm run typecheck` clean across all six workspaces, `vitest run` 203/203 passing (19 new), web production build succeeds, OpenAPI regenerated with no drift.

## Phase 1 — before any of this can be sold (target: by 22 August)

These are correctness problems in the paid path. Every one of them can take money and give nothing back, so they gate store submission.

1. **Pro is sold as uncapped but is capped.** `AI_DEEP_DAILY_GLOBAL_LIMIT` (default 20/day) still applies to every non-admin account including Pro. Four Pro subscribers running five reports each exhaust the platform for the day and the fifth is refused. Either raise and meter the global budget per paying account, or stop using the word uncapped. This is a consumer-protection issue once real money is involved, not a tuning question.
2. **Paying users can be told they have not paid.** `use-plan.ts` derives the tier from a label that falls back to `"Free"` whenever `/users/me/usage` has not answered, and callers gate on `aiEnabled` without checking `pending`. A Plus subscriber clicking Deep Research during load, or permanently if that endpoint errors, is told they need Plus. The hook's own comment warns against exactly this. The capacity work adds more surfaces that read the same fallback, so this now misreports the workspace allowances too.
3. **Tier is inferred from product-name substrings.** `tierForPackage()` decides Plus vs Pro by looking for `"plus"` in the package, product identifier and title, defaulting everything else to Pro. A product named "Casparel Pro Plus Annual" resolves to Plus and sells the wrong thing. Map RevenueCat identifiers explicitly.
4. **Webhook idempotency and `TRANSFER` reconciliation** (open since the August audit). Repeated delivery is normal in RevenueCat, and a store-account transfer can leave the previous Casparel account holding an entitlement it no longer owns. Key on event ID; reconcile subscriber state for both aliases.
5. **The deletion copy is wrong.** Terms and Privacy say deletion "removes your account and the content tied to it". `DELETE /users/me` anonymises the row and bans it; contributions survive, unlinked. The earlier wording described this accurately and was replaced with something shorter and false. This feeds the App Store privacy and Play Data Safety forms, so it blocks submission independently of anything above.

Exit gate: a sandbox purchase of each product grants exactly the tier it names, survives a webhook replay, and a subscriber whose usage endpoint is failing still gets the features they paid for.

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
- uploaded images, which are bytes rather than rows and need a storage budget rather than a count.

Uploads matter most: they are the only capacity where one user can cost meaningfully more than another without creating many rows at all. Until there is a byte budget, image-heavy accounts are mispriced in a way row counts cannot see.

Sequencing note: nothing in this phase should displace Phase 1 or the store gates. The competition roadmap's own advice was not to spend the remaining runway on new features until the release gates are green, and that still applies to this work.

## Phase 5 — make the tiers reflect real cost (post-Shipaton)

- Attribute actual storage per account — table bytes plus index and upload bytes — and compare it against what each tier pays. Row counts are a proxy for cost; measure the thing itself and correct the proxy.
- Publish a cost per activated learner and per active class, and re-derive the tier boundaries from it rather than from intuition.
- Revisit whether classes should be priced per seat rather than per class. Teacher-led distribution is the stated 3–6 month growth path, and a per-class limit prices a 12-student class the same as a 95-student one.
- Consider an institution tier only once a school has actually asked, and only after the per-account cost basis exists to price it.

## Open questions

- Should a teacher's roster limit be consumed by co-teachers as well as students? Currently every member counts equally.
- When a Pro teacher downgrades to Plus with a 150-member class, the class stays intact and no member can be added. Is that the right outcome, or should the roster be frozen but re-openable for replacements?
- Free is one class of 30. That fits a single small class but not a typical secondary timetable. If the intended free user is a student rather than a teacher, the teacher-facing free tier may need to be a trial rather than a permanent plan.
