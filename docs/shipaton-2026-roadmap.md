# Casparel → RevenueCat Shipaton 2026 — Ship Roadmap

**Status:** In progress · **Owner:** Bahar Yüksel · **Last updated:** 2026-08-14

This roadmap turns the [Casparel at Shipaton 2026 strategy brief](https://claude.ai/code/artifact/694e1e4a-7925-4000-81ce-8a09e918d091)
into an ordered, trackable plan. It is the single source of truth for what ships, in what order, and why.

---

## 0. The bet in one paragraph

Casparel is a mature, multi-surface education platform (Expo mobile · React/Vite web · Express/Drizzle/Postgres API).
Its feature depth already maps onto **four to five Shipaton prize categories**. But Shipaton has two hard,
non-negotiable gates that Casparel does **not** clear today:

1. **RevenueCat SDK + a real paywall** — no monetization exists in the repo.
2. **A brand-new app, publicly live on a store within Aug 1 – Sep 30 2026** — the mobile app runs in Expo dev only.

Everything else is polish. The roadmap front-loads these two gates so every downstream category becomes reachable.

### Hard deadlines

| Milestone | Date |
|---|---|
| Ship window opens | Aug 1 2026 |
| Target: publicly live on a store | **≤ Sep 10 2026** (≥ 1 week of buffer before judging) |
| Devpost submission deadline | **Sep 30 2026, 11:45 pm PT** |

---

## 1. The two gates (must clear — everything depends on these)

### Gate A — Monetization via RevenueCat  ⚙️ *code, in progress*

The single non-negotiable requirement: the RevenueCat SDK must power at least one in-app purchase (or ads via
RevenueCat Ads), and at least one real feature must sit behind a paywall.

**What the codebase gives us for free:** the API already models plans and usage.
`GET /users/me/usage` returns `plan`, `unlimited`, and daily caps for **AI search (3/day)** and **deep research (2/day)**.
Today the only "unlimited" plan is `Administrator`. That is the natural thing to sell: a **Premium** entitlement that
lifts those AI limits. The paywall story writes itself — "unlimited AI deep-research and source discovery."

- [x] Add `react-native-purchases` to the mobile app
- [x] `PurchasesProvider` context: initialize RevenueCat, expose `isPremium`, offerings, `purchase()`, `restore()`
- [x] `premium` entitlement + a single `usePremium()` hook as the app-wide gate
- [x] Paywall screen (`app/paywall.tsx`) built from the `edu-ds` native components
- [x] Gate a real feature behind it (unlimited AI deep research / source discovery) + "Upgrade" CTA in Profile
- [ ] **[dashboard]** Create the RevenueCat project; add iOS + Android apps; set the public SDK keys as
      `EXPO_PUBLIC_RC_IOS_KEY` / `EXPO_PUBLIC_RC_ANDROID_KEY`
- [ ] **[dashboard]** Configure a `premium` entitlement, an offering, and products
      (monthly + annual) in App Store Connect / Play Console and map them in RevenueCat
- [x] **[stretch]** Reconcile entitlement server-side: RevenueCat webhook → `users.plan` column → `/users/me/usage`
      reports `Premium` and lifts the AI rate-limit caps for genuine enforcement (see §5)
- [ ] **[dashboard]** Point the RevenueCat webhook at `POST /api/webhooks/revenuecat` and set the shared secret
      `REVENUECAT_WEBHOOK_AUTH` (same value in the dashboard's Authorization header and the server env)

### Gate B — Live on a store  📦 *accounts + build*

- [ ] **[dashboard]** Confirm the **"brand-new"** clause: the mobile app must have **no prior public store release**
      before Aug 1 2026 (a web app on Replit/Hostinger is fine — verify the *mobile* app specifically)
- [x] Add `eas.json` (build + submit profiles) and finalize `app.json` store metadata + RevenueCat plugin
- [ ] **[accounts]** Apple Developer Program ($99/yr) and/or Google Play Console ($25 one-time)
- [ ] **[build]** `eas build` for iOS + Android with signing credentials
- [ ] **[build]** `eas submit`; budget for review cycles (iOS 1–3 days typical)
- [ ] Store listing: 1024×1024 icon, 1179×2556 screenshots, description, privacy policy URL
- [ ] Judge access: a promo code or free trial that unlocks Premium

> **Legend:** `[dashboard]`, `[accounts]`, `[build]` require credentials/services outside this repo and must be done
> by the maker. Unmarked items are code and are handled in-repo.

---

## 2. Timeline (mirrors the strategy brief)

### Phase 1 · Now → ~Aug 24 — Monetize & harden
- [x] Wire RevenueCat entitlements into the mobile app
- [x] Choose the paywall: unlimited AI deep-research + source discovery, keep the catalog free
- [x] Design paywall + upgrade entry with `edu-ds`
- [ ] Confirm no prior public store release of the mobile app

### Phase 2 · ~Aug 25 → Sep 10 — Submit & get live *(critical)*
- [ ] Build & submit to App Store / Google Play; budget for review
- [ ] Store listing assets (icon, screenshots, description)
- [ ] Begin `#BuildInPublic` posts — the Schoolar → Casparel → shipped story
- [ ] Judge promo code / free trial for Premium

### Phase 3 · Sep 10 → Sep 23 — Grow & sharpen
- [ ] Drive real installs — students, teachers, campus communities
- [ ] Record the ≤ 2-min demo showing the app + a purchase on device
- [ ] Polish social-good and design narratives for target categories

### Phase 4 · Sep 23 → Sep 30 — Submit on Devpost
- [ ] Finalize the Devpost entry against every targeted category
- [ ] Verify the live store URL + judge access end-to-end
- [ ] Submit early — before Sep 30, 11:45 pm PT

---

## 3. Prize categories we're playing for

| Category | Fit | Angle |
|---|---|---|
| RevenueCat Peace Prize (social good) | **Strong** | Free, vetted open-education catalog; monetize convenience, not access |
| RevenueCat Design Award | **Strong** | `edu-ds` design system + rebrand; invest polish in paywall & onboarding |
| Next Gen Award (students only) | **Strong** | On-theme, well-engineered; no paid dev account needed if maker is a student |
| HAMM Award (monetization) | Buildable | Layered premium: AI credits, sync, unlimited lists/sessions |
| Productivity influencer | Buildable | "Study organizer" framing — lists, schedule, calendar sync |
| #BuildInPublic | Buildable | Rebrand-and-launch narrative — **start posting now** |
| Grand Prize (Build & Grow) | Stretch | Needs early ship + real acquisition push |

---

## 4. What's already built (leverage, don't rebuild)

- **Three surfaces:** Expo/React Native mobile, React 19 + Vite web, Express + Drizzle + Postgres (OpenAPI-first, typed hooks).
- **Learning depth:** open-education catalog (Open Library, Wikibooks), reading lists, classes, schedules, study sessions w/ RSVP, forum, DMs, guided learning workflow.
- **AI & integrations:** cost-gated OpenAI deep-research & discovery, Google Calendar/Classroom sync, iCal feed — the premium-tier candidates.
- **Design system:** `edu-ds` (Radix + shadcn + tokens) with native RN components; completed rebrand.
- **Engineering discipline:** migration-only DB, strict typecheck gates, k6 load tests, real coverage.

---

## 5. Server-side entitlement reconciliation ✅ *implemented*

Client-side gating via the RevenueCat entitlement satisfies the Shipaton requirement. For genuine enforcement of the
AI limits, the entitlement is now reconciled server-side:

1. ✅ `users.plan` (default `free`) + `users.plan_expires_at` added via Drizzle migration `0043_daily_naoko.sql`
   (guarded with `IF NOT EXISTS`).
2. ✅ `POST /api/webhooks/revenuecat` (`routes/webhooks.ts`) — shared-secret auth via `REVENUECAT_WEBHOOK_AUTH`,
   flips `users.plan` on grant events (purchase/renewal/uncancellation/…) and clears it on `EXPIRATION`.
3. ✅ `lib/entitlements.ts#isPremiumAccount` is the single source of truth. `/users/me/usage` reports `Premium`
   and null (unlimited) caps; deep-research per-user limits and the AI-search daily limiter are bypassed for premium.
   A global daily deep-research budget stays as a cost safety net for all non-admin accounts.
4. The `AccountUsage` response shape is unchanged (`plan: string`, `unlimited: boolean`, nullable limits), so **no
   OpenAPI codegen was required**. The webhook is server-to-server and intentionally not in the client spec.

**Remaining (dashboard):** configure the webhook URL + `REVENUECAT_WEBHOOK_AUTH` secret in RevenueCat, and set the
same value in the server environment.

---

## 6. Working agreements

- Develop on `claude/casparel-shipaton-2026-roadmap-6ypjhy`.
- Respect `AGENTS.md`: never edit generated files, DB changes go through migrations, never hardcode ports,
  auth token key stays `schoolar_token`.
- `pnpm run typecheck` must pass before every commit.
- RevenueCat public SDK keys are safe to ship in the client; keep secret (v2) API keys server-side only.

---

## 7. Sources

- [RevenueCat Shipaton 2026 announcement](https://www.revenuecat.com/blog/company/announcing-shipaton-2026)
- [Devpost rules](https://revenuecat-shipaton-2026.devpost.com/)
- [shipaton.com](https://www.shipaton.com/)
- [Prep guide](https://revenuecat.github.io/codelabs/shipaton-2026-prep.html)
</content>
</invoke>
