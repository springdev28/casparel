# Casparel — Shipaton 2026 Submission Kit

Ready-to-paste copy for the app stores and Devpost, plus a demo shot list.
Companion to [`shipaton-2026-roadmap.md`](./shipaton-2026-roadmap.md). Fill the
`‹bracketed›` placeholders before submitting.

---

## 1. App identity

| Field | Value |
|---|---|
| App name | **Casparel** |
| Subtitle (iOS, ≤30 chars) | Learn. Organize. Study. |
| Short description (Play, ≤80 chars) | Vetted open-education resources, classes, schedules, and AI research. |
| Category | Education |
| Bundle / package id | `com.casparel.app` |
| Support URL | `‹https://casparel.app/support›` |
| Marketing URL | `‹https://casparel.app›` |
| Privacy policy URL | `‹https://casparel.app/privacy›` |

> The store icon must be 1024×1024 (no alpha, no rounded corners — the store
> rounds it). Source: `assets/images/icon.png`.

---

## 2. App Store / Play full description

> Casparel is where students and teachers find trustworthy learning materials —
> and stay organized while they study.
>
> **Discover open education.** Browse a vetted catalog drawn from Open Library,
> Wikibooks, and other open sources. Every resource is free to open.
>
> **Organize everything.** Join classes, build reading lists, plan your schedule,
> and run study sessions with RSVPs — with an iCal feed and Google Calendar sync
> so your plan lives where you already work.
>
> **Research with AI.** Not sure whether a source is credible? Casparel's AI
> Source Research evaluates who's behind any resource and how much to trust it —
> a quick check anytime, or deep, live-web research on demand.
>
> **Casparel Premium.** Upgrade for unlimited AI source research and discovery.
> The core library always stays free — Premium funds keeping it open.
>
> Built by students, for students.

**Promotional text (iOS, ≤170 chars):** New: AI Source Research evaluates any
resource's credibility, and Casparel Premium unlocks unlimited AI research and
discovery.

**Keywords (iOS, ≤100 chars):** study,learning,education,open textbooks,library,
classes,schedule,research,students,AI

**What's New (first release):** First public release of Casparel — discover open
education, organize your studies, and research sources with AI. Introducing
Casparel Premium.

---

## 3. Screenshots

Required size: **1179×2556** (6.7" iPhone). Capture 5–6, each with a one-line
caption overlay.

| # | Screen | Caption |
|---|---|---|
| 1 | Dashboard | Your studies, organized. |
| 2 | Resources list | A vetted, free open-education library. |
| 3 | Resource detail → AI Source Research report | Know who's behind any source. |
| 4 | Paywall | Go unlimited with Premium. |
| 5 | Schedule / study sessions | Plan classes and study time. |
| 6 | Profile → Plan card | Track your usage; upgrade anytime. |

Tips: use a signed-in demo account with realistic data; show the AI report in a
resolved (not loading) state; capture the paywall with the plans loaded.

---

## 4. Devpost submission

**Tagline (≤200 chars):** A free, vetted open-education platform for students and
teachers — organize your studies and research any source with AI, with Premium
for unlimited research.

**What it does.** Casparel helps students and teachers discover trustworthy,
free learning materials and stay organized: a vetted open-education catalog,
classes, reading lists, schedules, study sessions, a forum, and DMs. Its AI
Source Research evaluates any resource's credibility — quick checks for everyone,
and unlimited deep, live-web research for Premium subscribers.

**How we built it.** A pnpm monorepo with three surfaces sharing one OpenAPI
contract: an Expo / React Native app (the Shipaton vehicle), a React 19 + Vite
web app, and an Express + Drizzle + Postgres API. Monetization is RevenueCat:
the `react-native-purchases` SDK drives a custom paywall and a `premium`
entitlement, reconciled server-side via a RevenueCat webhook that lifts AI usage
limits. A shared `edu-ds` design system (Radix + tokens) keeps every surface
consistent.

**Challenges.** Shipping a brand-new, monetized store build from a mature
codebase; designing an honest paywall (keep the library free, sell convenience);
and enforcing entitlements server-side without breaking the existing usage model.

**What's next.** Store launch and a real acquisition push (campus communities),
richer premium tooling, and growth toward the Build & Grow track.

**Categories targeted:** RevenueCat Peace Prize (social good) · Design Award ·
Next Gen (students) · HAMM (monetization) · #BuildInPublic. See the roadmap for
the fit rationale.

**Judge access:** ‹promo code or free-trial instructions — configure an Offer
Code / a RevenueCat-granted entitlement so judges can unlock Premium at no cost›.

**Links:** Store URL ‹…› · Repo ‹…› · Demo video ‹…›

---

## 5. Demo video shot list (≤2:00)

Keep it on-device; show a real purchase.

| Time | Shot | Say |
|---|---|---|
| 0:00–0:12 | Cold open: onboarding welcome → dashboard | "Casparel — where students find trustworthy learning materials and stay organized." |
| 0:12–0:35 | Resources list → open a resource | "A free, vetted open-education library." |
| 0:35–0:55 | Tap **Quick check** → AI Source Research report | "AI tells you who's behind a source and whether to trust it." |
| 0:55–1:15 | Tap **Deep research** as a free user → paywall opens | "Deep, live-web research is our Premium feature." |
| 1:15–1:35 | Purchase on the paywall (sandbox) → success | "One tap unlocks unlimited AI research — powered by RevenueCat." |
| 1:35–1:50 | Re-run deep research (now unlimited) + Profile → Plan shows Premium | "Now it's unlimited, and enforced server-side." |
| 1:50–2:00 | Close on schedule / study sessions | "Learn, organize, study. Casparel." |

---

## 6. Pre-submit checklist

- [ ] App publicly live on the store (≥1 week before Sep 30 deadline)
- [ ] RevenueCat products + `premium` entitlement + offering live and mapped
- [ ] `REVENUECAT_WEBHOOK_AUTH` set in server env and RevenueCat dashboard
- [ ] Judge promo code / free trial verified end-to-end
- [ ] Icon (1024²) + 6 screenshots (1179×2556) uploaded
- [ ] Privacy policy + support URLs live
- [ ] ≤2-min demo recorded showing an on-device purchase
- [ ] Devpost entry filled for every targeted category
- [ ] Submit before **Sep 30, 2026, 11:45 pm PT**
