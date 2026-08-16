# Casparel Shipaton 2026 readiness review

Assessment date: 15 August 2026

Official deadline: 30 September 2026, 11:45 PM PDT (1 October, 09:45 in Istanbul)

This competition review is separate from the product handbook and technical audit. Rules can change; re-check the [official rules](https://revenuecat-shipaton-2026.devpost.com/rules) and [RevenueCat preparation guide](https://revenuecat.github.io/codelabs/shipaton-2026-prep.html) before submission.

## Verdict

Casparel is a credible product, but it is not currently Shipaton-submission-ready. Its strongest assets are a working public product, an unusually complete education workflow, a real mobile codebase, RevenueCat integration code, and a defensible “trust before study” story. Its largest blockers are proof: no verified store-published mobile binary, no demonstrated purchase lifecycle, no revenue/retention evidence, no two-minute demo, and no completed submission asset pack.

Current readiness score: **54/100**.

| Dimension                     | Score | Why                                                                    |
| ----------------------------- | ----: | ---------------------------------------------------------------------- |
| Product value/differentiation |    76 | Coherent discovery → credibility → study → evidence loop               |
| Engineering quality           |    72 | Strong web/API checks; mobile/store and contract debt remain           |
| Mobile/store eligibility      |    30 | Code exists, but publishable reviewed binaries are not proven          |
| RevenueCat depth              |    48 | Entitlement/paywall/webhook exist; lifecycle/transfer evidence missing |
| Design and accessibility      |    66 | Consistent system and browser audit; native/manual validation missing  |
| Traction/revenue evidence     |    18 | No verified conversion, retention or revenue metrics in scope          |
| Submission/story/assets       |    35 | Draft copy exists; demo, screenshots, icon and proof pack incomplete   |

The score is a prioritisation tool, not an official judging model.

## Eligibility gates

The official rules require a qualifying iOS/iPadOS/macOS/Android app that integrates RevenueCat and is fully published by the deadline. A public demo video must be under two minutes; submission materials include a 1179×2556 screenshot without a device frame and a 1024×1024 icon. If the app is paid or gated, judges need a free trial or promo access. The app must be accessible in the United States.

The Next Gen category is the stated store-publication exception, but it carries its own conditions, including a public open-source repository and appropriate license. Casparel is currently a private repository, so it cannot rely on that exception without intentionally making the project public and satisfying every other Next Gen condition.

### Gate checklist

| Gate                                  | Status             | Proof required                                                            |
| ------------------------------------- | ------------------ | ------------------------------------------------------------------------- |
| Qualifying native platform            | Partial            | Installable signed iOS/Android build                                      |
| RevenueCat integrated                 | Partial            | Dashboard offering + sandbox transaction + entitlement evidence           |
| Fully published by deadline           | Blocked/unverified | Public US store listing and downloadable build                            |
| App usable by judges                  | Partial            | Clean reviewer account, trial/promo where required, stable production API |
| Demo under two minutes                | Not started        | Public unlisted/visible YouTube or Vimeo URL                              |
| Required screenshot/icon              | Not complete       | Exact exported assets with no device frame                                |
| Submission text and category evidence | Draft              | Final answers, links and claims backed by screenshots/metrics             |
| Next Gen fallback                     | Not eligible as-is | Public repo plus all category-specific eligibility conditions             |

## Chances of winning

No entrant count, judge distribution or base rate is available, so any percentage is judgment rather than statistics.

- **If submitted today:** effectively below 1%, because a missing store/publication gate can make the entry ineligible.
- **If only the minimum gates are completed:** roughly 1–3% for an overall/category prize. Casparel would be functional but would still lack differentiated evidence and traction.
- **If the recommended plan lands:** approximately 5–10% for a well-matched category award, assuming a polished native experience, verified RevenueCat lifecycle, strong demo and real user/revenue evidence.
- **Grand Prize:** below 2% without material revenue growth. The rules describe a revenue-based shortlist and then consider growth; a good feature set alone is not enough.

These ranges should be read as decision bands. The goal is to move from “possibly ineligible” to “judge can understand, install, pay, trust and remember it in two minutes.”

## Category strategy

### Best primary fit: Design

Casparel can compete on coherent information hierarchy, trust communication and cross-platform consistency. The opportunity is not visual decoration; it is making a complex credibility report understandable to a student in seconds. To be competitive:

- make the source-review reveal the visual centre of the app;
- show evidence, limitations and confidence without fear-based scoring;
- finish native accessibility and micro-interaction polish;
- use screenshots that tell one continuous journey;
- remove every claim that is not visible in the submitted binary.

Fit today: medium. Fit after the release plan: medium-high.

### Strong conditional fit: Replit Idea to Income

This category is promising only if Casparel can prove it was built/published using the required Replit workflow and complete the category's public-post requirements. The official rules call for three public social posts and evidence around launch/growth/revenue momentum. The repository and historic Replit configuration support the story, but proof must be assembled.

Fit today: medium, evidence-dependent. Fit with public build log and first paid conversions: high.

### Secondary narrative: Peace

The most authentic angle is information literacy: helping students examine provenance, incentives, limitations and currency before trusting educational content. That can reduce misinformation and improve constructive learning. Do not overclaim direct peace impact; provide a specific user story and show why the intervention is feasible.

Fit today: medium-low. It becomes credible only with research showing students make better trust decisions.

### Weak fit: HAMM

HAMM rewards strong paywall/pricing/conversion craft and diverse revenue streams. Casparel currently has a single Premium subscription and no verified conversion evidence. A clean paywall is necessary but unlikely to be category-winning on its own.

Fit today: low.

### Weak fit: Productivity Influencer

The category language is oriented toward Apple power users who save, organise and retrieve reusable text, files, documents and images. Casparel is an education workflow, not an influencer productivity utility. Do not distort the roadmap to chase this category.

Fit today: poor.

### Conditional options

Build in Public can work if the founder commits to a consistent, evidence-rich public build narrative rather than three last-minute promotional posts. Next Gen should be considered only if the entrant independently meets its age/project conditions and is comfortable making the repository public.

## Winning story

Recommended one-sentence pitch:

> Casparel helps students move from “I found a resource” to “I know why to trust it, what its limits are, and what to do next.”

The two-minute demo should follow one learner and one question:

1. **0:00–0:12 — Problem:** search results are abundant; confidence is not.
2. **0:12–0:35 — Discover:** find a resource and show provenance.
3. **0:35–1:05 — Evaluate:** run deep source research; highlight citations, concerns and limitations.
4. **1:05–1:25 — Act:** save it to a goal and schedule the next study step.
5. **1:25–1:42 — Teacher value:** recommend/assign it and see learning evidence.
6. **1:42–1:52 — Business:** show the honest Premium boundary and successful entitlement.
7. **1:52–2:00 — Outcome:** informed learning, not another AI answer box.

Do not spend demo time listing every page. The repository's breadth is proof of execution; the story must be memorable.

## 46-day critical roadmap

### 15–21 August: make a release candidate possible

- Merge the audit fixes and require green CI.
- Create/verify EAS project, Apple/Google identifiers, signing and store accounts.
- Configure RevenueCat products, entitlement, offering, packages, public SDK keys and webhook secret.
- ~~Add persistent webhook event idempotency and correct transfer reconciliation.~~ Done in code on 16 August, see the [audit follow-up](audit-report-2026-08-15.md#follow-up-16-august-2026). Still to be proven against real RevenueCat deliveries during the sandbox matrix below.
- Produce internal iOS and Android builds; install on physical phones.
- Freeze product truth: exact free allowance, Premium benefit and privacy disclosures.

Exit gate: a new reviewer can install, log in, restore and see the same entitlement on server and client.

### 22–31 August: prove the critical journeys

- Execute purchase, cancellation, renewal, billing issue, expiry, restore and account-transfer tests in sandbox.
- Run VoiceOver/TalkBack, Dynamic Type, reduced-motion, keyboard and poor-network passes.
- Recruit five students and five teachers for task-based sessions.
- Fix only the top comprehension/conversion failures.
- Move the first newer API domain into OpenAPI and establish a repeatable migration pattern.
- Add privacy-conscious crash/error and funnel measurement.

Exit gate: no P0/P1 defect in onboarding, source research, purchase/restore, or account access.

### 1–10 September: submit stores and collect evidence

- Submit the stable build early to both stores; budget for rejection/remediation.
- Prepare reviewer notes, demo account, privacy nutrition/data-safety forms and support URLs.
- Start a public build log if entering Replit/Build in Public.
- Instrument and capture activation: registered → first resource → first source review → first goal/save → paywall → trial/purchase.
- Obtain explicit, consented user quotes and before/after trust-comprehension evidence.

Exit gate: at least one store approved, the other actively in review with no known policy blocker; evidence pack growing daily.

### 11–20 September: sharpen category proof

- Lock the primary category and one honest secondary category.
- Produce the screenshot story, icon, landing copy and 110–150 second rough demo.
- Show real metrics: activation, D1/D7 return, deep-report completion, paywall view→purchase, first revenue.
- Tune onboarding/paywall from measured drop-off, not aesthetic preference.
- Complete required public posts with useful build lessons and transparent metrics.

Exit gate: every judging claim has a URL, screenshot, metric, transaction or user quote behind it.

### 21–26 September: submission candidate

- Record and edit the final demo; keep it below two minutes.
- Export exact required screenshot/icon dimensions.
- Complete Devpost fields and category-specific answers.
- Test every public link in a signed-out/incognito session and from the US if possible.
- Run clean-install iOS/Android test, production smoke, CI and backup reviewer-account test.

Exit gate: someone unfamiliar with Casparel can install, understand and verify it using only the submission.

### 27–30 September: freeze

- No new features after 27 September.
- Ship only release-blocking fixes with full regression checks.
- Re-check official rules and store availability.
- Submit at least 24 hours early; retain the final video/assets/answers offline.
- Verify the live submission after save and after logout.

## Evidence dashboard

Track daily:

| Funnel/quality metric | Definition                                                  | Target direction |
| --------------------- | ----------------------------------------------------------- | ---------------- |
| Activation            | New users completing first source review in 24h             | Up               |
| Trust comprehension   | Users correctly explaining two strengths and one limitation | Up               |
| Time to value         | Registration to useful report                               | Down             |
| Save-to-goal rate     | Reviewed resources connected to a goal                      | Up               |
| D1 / D7 return        | Activated users returning                                   | Up               |
| Paywall conversion    | Unique paywall viewers purchasing/trialling                 | Up               |
| Restore success       | Valid prior purchases restored                              | 100%             |
| Crash-free sessions   | Native sessions without fatal error                         | >99.5% target    |
| Research failure rate | Deep requests ending in timeout/error/limit ambiguity       | Down             |
| Support response      | Time to resolve judge/user access issue                     | Down             |

Do not invent numbers for the submission. A small real cohort with clear definitions is stronger than an unsupported large claim.

## Post-Shipaton product roadmap

### 0–3 months: reliability and learning loop

- Finish OpenAPI coverage by domain and add interaction tests around Resources/Class/Admin.
- Make subscription reconciliation authoritative and observable.
- Improve source-review evaluation with human-rated accuracy, calibration and citation validity.
- Add goal-linked mobile actions instead of broad feature parity.
- Establish product SLOs, cost per activated learner and teacher/student retention cohorts.

### 3–6 months: teacher-led distribution

- Pilot with small classes/schools and build consent/admin controls for real deployment.
- Create teacher-curated credibility rubrics and class-level research assignments.
- Add collaborative evidence review and feedback loops.
- Test institution-sponsored Premium while keeping the core library open.

### 6–12 months: durable differentiation

- Build a provenance/evidence graph across resources, claims and curricula.
- Offer standards/curriculum alignment where data quality supports it.
- Add privacy-preserving institution analytics and export/interoperability.
- Expand languages and accessibility with local educators.
- Evaluate B2B school licensing only after student value and safety are proven.

## Final recommendation

Enter only if the store and transaction gates can be completed by early September. Choose Design as the product-quality target and Replit Idea to Income only when the required Replit/public-growth evidence is real. Optimise for one unforgettable credibility-to-action journey, not feature count. The highest-return work now is release proof, user evidence and narrative discipline.
