# Casparel

Casparel is a learning workspace for students and teachers: discover and evaluate educational resources, organise study goals and schedules, collaborate in classes, and keep evidence of progress. It ships as a React web app, an Expo mobile app, and an Electron desktop shell backed by an Express/Postgres API.

The current distribution decision is intentionally asymmetric: **casparel.com remains the universal web client; Windows and macOS are distributed as direct downloads from the Casparel website; Android is the priority store release through Google Play; iOS store distribution is deferred until explicitly re-prioritized.** Desktop app stores are optional rather than release dependencies.

Mobile subscriptions use RevenueCat. Free mobile users may receive one clearly separated **Sponsored learning resource** native placement on the dashboard, served by AdMob and tracked through RevenueCat Ads when enabled. Paid entitlements are ad-free. Sponsorship is never an input to Casparel search ranking, credibility analysis, Learning Lists/Paths, teacher recommendations, or any trust signal.

Start with the [product handbook](docs/product-handbook.md). The [distribution and monetization architecture](docs/distribution-monetization.md) is the canonical reference for web/desktop/Google Play distribution, subscriptions, sponsored content, trust boundaries and external release configuration. The [release runbook](docs/release-runbook.md) covers build and release mechanics. The [2026 audit report](docs/audit-report-2026-08-15.md) records the current quality baseline, and the [Shipaton readiness review](docs/shipaton-2026-readiness.md) covers competition eligibility, win strategy, and roadmap.

## Local development

Requirements: Node 20–24, pnpm 11, and PostgreSQL.

```bash
pnpm install --frozen-lockfile
cp artifacts/api-server/.env.example artifacts/api-server/.env
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/app run dev
```

The API defaults to port 5000 locally; the web app runs on port 23863 and proxies `/api` to `API_URL`. Do not hardcode either value. See [AGENTS.md](AGENTS.md) before changing generated API files, database schema, ports, authentication, distribution or monetization behavior.

## Release checks

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server exec vitest run
pnpm --filter @workspace/mobile run check:release
pnpm --filter @workspace/app run build
node artifacts/app/scripts/audit-pages.mjs
node artifacts/app/scripts/audit-session.mjs
pnpm --filter @workspace/desktop run smoke
```

Use `pnpm run loadtest:smoke` for a read-only smoke profile. Higher-load profiles belong on staging unless production load is explicitly authorised.

For the sponsored mobile surface, release verification additionally includes RevenueCat sandbox purchase/restore behavior, paid-user ad suppression, AdMob test-versus-production inventory, clear sponsorship disclosure, privacy/content controls, Google Play's contains-ads declaration, and proof that ad state cannot alter organic resource ranking or credibility output.

## Documentation

- [Product and engineering handbook](docs/product-handbook.md)
- [Distribution and monetization architecture](docs/distribution-monetization.md)
- [Release runbook: mobile and direct-download desktop](docs/release-runbook.md)
- [Subscription tiers roadmap](docs/subscription-tiers-roadmap.md)
- [Audit, testing, and performance report](docs/audit-report-2026-08-15.md)
- [Shipaton 2026 readiness and roadmap](docs/shipaton-2026-readiness.md)
- [Submission copy and asset checklist](docs/shipaton-2026-submission.md)
- [Verification design](docs/verification-design.md)

License: MIT.
