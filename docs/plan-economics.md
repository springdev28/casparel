# Casparel plan economics

This document is the operator-readable projection of the machine-tested values in `lib/plan-economics`. It prices maximum permitted usage, not average usage. All figures are USD and all margins are after the assumed payment-channel fee. Provider prices carry a further 20% safety multiplier.

## Final plans

| Plan | Monthly | Annual | Effective annual month | Annual discount | AI Discovery / 30d | Deep Research / 30d | Storage | Raw worst-case COGS | Stress COGS | Net monthly revenue | Worst-case gross profit | Monthly margin | Annual margin |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Plus | $9.99 | $107.99 | $9.00 | 9.92% | 15 | 3 | 1 GB | $1.1265 | $1.3518 | $8.3916 | $7.0398 | 83.89% | 82.12% |
| Pro | $19.99 | $215.99 | $18.00 | 9.96% | 29 | 10 | 2 GB | $2.6477 | $3.1772 | $16.7916 | $13.6144 | 81.08% | 78.99% |
| Institutional Starter | Quote | Quote | N/A | N/A | 250 shared | 55 shared | 10 GB shared | $17.3700 | $20.8440 | $72.7500 at range floor | $51.9060 | 71.35% | 71.35% at range floor |

Free is deliberately subsidized but finite: 3 discovery searches, 1 deep report, and 100 MB per rolling 30 days, with a daily ceiling of one of each.

Other important row limits remain enforced from the same catalog: Free/Plus/Pro own 1/5/20 classes with 30/100/300 members per class, and every plan retains finite activity, list, goal, and canvas counts. Institutional Starter retains the existing high row limits but applies AI and storage at contract level. Account role does not change any limit.

## Safe price thresholds

These are the minimum monthly prices at full quota after the 20% cost buffer and channel fees. They are not recommended retail prices.

| Plan | 50% margin | 60% margin | 70% margin | Final monthly |
|---|---:|---:|---:|---:|
| Plus | $3.22 | $4.02 | $5.36 | $9.99 |
| Pro | $7.56 | $9.46 | $12.61 | $19.99 |
| Institutional Starter | $42.98 | $53.72 | $71.63 | Quote at $2.50–$3.00 per seat/month |

## Old versus new AI quotas

| Plan | Old discovery/day | New discovery day / 30d | Old deep day / 30d | New deep day / 30d |
|---|---:|---:|---:|---:|
| Free | 2 | 1 / 3 | 2 / 2 | 1 / 1 |
| Plus | 20 | 3 / 15 | 5 / 50 | 1 / 3 |
| Pro | 60 | 6 / 29 | 15 / 150 | 2 / 10 |
| Institutional | 120 per seat | 25/day and 250/30d shared | 30/day and 300/30d per seat | 6/day and 55/30d shared |

## Why each quota was chosen

- Plus and Pro are the only self-serve paid tiers and apply identically to students and teachers. Their existing prices and quotas are unchanged by the role consolidation.
- Institutional Starter has a 30-seat minimum and one shared pool. No combination of seat activity can multiply the contract into 30 independent maximum AI bills. The public range is $2.50–$3.00 per seat/month, billed annually, but the actual contract is always quoted. The cost model uses the bottom of that range as its conservative revenue floor; it is not a fixed public price. Larger schools receive a separately priced add-on or Growth/Enterprise quote; they do not inherit an implicit unlimited pool.

## Hard request bounds

AI Discovery uses `gpt-5-nano`, at most 8,000 Casparel-supplied prompt characters, 3,200 generated/reasoning tokens, one low-context web-search call, a 30-second timeout, one concurrent request per account, daily and rolling-30-day account counters, and default service-wide emergency ceilings of 200/day and 3,000/30 days. Because the Responses API does not expose a maximum-input-token switch for built-in search context, economics charge every request for the model's full 400,000-token context window. Production retries remain disabled unless an operator explicitly enables them. Identical normalized queries share a 24-hour cache across users and a cache hit consumes no AI allowance.

Deep Research uses `gpt-5-mini`, at most 16,000 Casparel-supplied prompt characters, 4,500 generated/reasoning tokens, one medium-context web-search call, a 60-second timeout, one concurrent request per account and canonical URL, daily and rolling-30-day account counters, and default service-wide emergency ceilings of 100/day and 1,000/30 days. Economics likewise charge the full 400,000-token model context. Canonical URL results remain cached for 90 days and cache hits consume no quota.

Forum factual checking no longer launches a paid web-search agent. The OpenAI moderation endpoint still checks safety; factual disputes use the existing report and human-review flow. The repository contains image/audio integration libraries, but no product route imports their generation, speech, transcription, or realtime functions, so they contribute zero current plan COGS and must not be enabled without adding bounds and economics first.

Uploads remain individually capped (2 MB avatar, 25 MB material, 10 MB post, and 140 KB per activity image / 700 KB per activity), and now also pass a total byte-budget check before storage. Stored base64 length is charged as physically persisted, including its encoding overhead. Institutional storage is shared across all licensed seats.

## Provider pricing assumptions

- GPT-5 mini: $0.25 per million input tokens and $2.00 per million output tokens.
- GPT-5 nano: $0.05 per million input tokens and $0.40 per million output tokens.
- OpenAI web search: $10 per 1,000 calls ($0.01 each); search-content tokens are billed at model rates and are covered by charging the full 400,000-token context window.
- OpenAI moderation: $0 under the current provider rate card; message and forum safety checks therefore remain enabled but are still rate-limited for abuse control.
- Storage marginal cost: $0.25 per GB-month. This intentionally exceeds commodity object-storage rates because current uploads live as database/base64 data and consume backup capacity too.
- Google Play automatically renewing subscription fee: 15%.
- RevenueCat: 1% of tracked revenue after its free monthly threshold. The model charges 1% from the first dollar for safety.
- Institutional invoice/payment processing: 3%.
- Other variable account cost: $0.05/month self-serve and $0.50/month per Institutional Starter contract.
- Safety multiplier: 1.20. Target worst-case gross margin: 70%.

The Google Classroom and Calendar APIs do not have a per-call fee in this model. YouTube Data API usage is quota-based rather than per-call billed; code already reserves 200 of 10,000 daily units, charges 100 units per search and one per enrichment, and stores results in the catalog. Open catalog sources are free/public but bounded by provider timeouts and the catalog size ceiling. No paid transactional email provider is wired into the repository. Hosting/database base plans are fixed overhead until a provider tier threshold is crossed; the conservative storage rate models their meaningful marginal component.

## RevenueCat configuration contract

The RevenueCat dashboard is managed manually and is already configured. Application code must not create or mutate it. The `default` offering contains these four custom package mappings:

| Custom package | Product ID | Entitlement | Period | USD reference price |
|---|---|---|---|---:|
| `plus_monthly` | `casparel_plus_monthly` | `plus` | Monthly | $9.99 |
| `plus_yearly` | `casparel_plus_yearly` | `plus` | Annual | $107.99 |
| `pro_monthly` | `casparel_pro_monthly` | `pro` | Monthly | $19.99 |
| `pro_yearly` | `casparel_pro_yearly` | `pro` | Annual | $215.99 |

Institutional is not a store product. Advertise “Starting from $2.50–$3.00 per seat/month, billed annually,” require a 30-seat minimum, and direct schools to contact Casparel for a quote. Do not publish a fixed annual total or a fixed added-seat price. Growth and Enterprise contracts must explicitly state their larger shared search, deep-report, and storage add-ons before backend configuration; “custom” never means unlimited.

## Existing subscriber migration

Database migration 0052 rewrites `student-plus` and `teacher-plus` to `plus`, and rewrites `student-pro`, `teacher-pro`, and `premium` to `pro`. The server also accepts those historical identifiers during rolling deployment and collapses them to the generic tier, preventing loss of paid access. RevenueCat itself grants only `plus` and `pro`; restoration, cancellation, and webhook replay remain compatible.

## Production data still needed

The model needs future replacement with measured token input/output by feature, actual web-search tool-call counts, Play region/fee mix, RevenueCat tracked-revenue tier, annual-versus-monthly mix, real storage/backup/egress cost, cache hit rate, and support burden by plan. Those measurements may justify larger quotas or lower prices later; they must not be used to weaken the maximum-cost guard before enough data exists.
