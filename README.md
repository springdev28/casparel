# Casparel

Casparel is a learning workspace for students and teachers: discover and evaluate educational resources, organise study goals and schedules, collaborate in classes, and keep evidence of progress. It ships as a React web app, an Expo mobile app, and an Electron desktop shell backed by an Express/Postgres API.

Start with the [product handbook](docs/product-handbook.md). The [2026 audit report](docs/audit-report-2026-08-15.md) records the current quality baseline, and the separate [Shipaton readiness review](docs/shipaton-2026-readiness.md) covers competition eligibility, win strategy, and roadmap.

## Local development

Requirements: Node 20–24, pnpm 11, and PostgreSQL.

```bash
pnpm install --frozen-lockfile
cp artifacts/api-server/.env.example artifacts/api-server/.env
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/app run dev
```

The API defaults to port 5000 locally; the web app runs on port 23863 and proxies `/api` to `API_URL`. Do not hardcode either value. See [AGENTS.md](AGENTS.md) before changing generated API files, database schema, ports, or authentication.

## Release checks

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server exec vitest run
pnpm --filter @workspace/app run build
node artifacts/app/scripts/audit-pages.mjs
node artifacts/app/scripts/audit-session.mjs
```

Use `pnpm run loadtest:smoke` for a read-only smoke profile. Higher-load profiles belong on staging unless production load is explicitly authorised.

## Documentation

- [Product and engineering handbook](docs/product-handbook.md)
- [Audit, testing, and performance report](docs/audit-report-2026-08-15.md)
- [Shipaton 2026 readiness and roadmap](docs/shipaton-2026-readiness.md)
- [Submission copy and asset checklist](docs/shipaton-2026-submission.md)
- [Verification design](docs/verification-design.md)

License: MIT.
