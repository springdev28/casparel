# Casparel — Agent Instructions

These instructions apply to every AI agent (Codex, Copilot, etc.) that modifies this repository.
Read this file before making any change. Violating these rules is the most common cause of app crashes.

---

## Monorepo layout

```
artifacts/
  api-server/   Express 5 API — runs on PORT (default 8080 in Replit, 5000 locally)
  app/          React + Vite web app — runs on PORT 23863, proxies /api → API server
  mobile/       Expo React Native app (iOS + Android)
  desktop/      Electron shell around the hosted web app
  schoolar-edu/ Shared design-system (component library, tokens)
lib/
  api-spec/     Single source of truth: openapi.yaml
  api-client-react/  Generated React Query hooks (do NOT hand-edit)
  api-zod/      Generated Zod schemas          (do NOT hand-edit)
  db/           Drizzle ORM schema + migrations
scripts/
  run-schoolar.sh  Starts the web app only (not the API — that has its own process)
```

---

## Services and ports

| Service | Port | How it starts |
|---------|------|---------------|
| API server | 8080 (Replit) / 5000 (local) | `pnpm --filter @workspace/api-server run dev` |
| Web app | 23863 | `pnpm --filter @workspace/app run dev` |
| Design system | 20495 | `pnpm --filter @workspace/edu-ds run dev` |
| Mobile (Expo) | 18115 | `pnpm --filter @workspace/mobile run dev` |
| Desktop (Electron) | n/a, own window | `pnpm --filter @workspace/desktop run dev` |

The web app Vite config proxies `/api/*` to `API_URL` (defaults to `http://127.0.0.1:8080`).
**Never hardcode a port number anywhere.** Always read `process.env.PORT` / `process.env.API_URL`.

---

## Rules — read before touching anything

### 1. Never edit generated files
The following are auto-generated from `lib/api-spec/openapi.yaml`.
Edit the spec, then run codegen — never edit these by hand:
- `lib/api-client-react/src/generated/`
- `lib/api-zod/src/generated/`

To regenerate after changing the OpenAPI spec:
```bash
pnpm --filter @workspace/api-spec run codegen
```

### 2. Database schema changes require a migration file
Never use `drizzle push` or `ALTER TABLE` directly.
Every schema change must go through Drizzle migrations:

```bash
# 1. Edit lib/db/src/schema/<table>.ts
# 2. Generate the migration
pnpm --filter @workspace/db run generate
# 3. Inspect the new file in lib/db/migrations/ — add IF NOT EXISTS guards for safety
# 4. Commit both the schema change and the migration file together
```

The API server runs `runMigrations()` on every startup. If the migration file is missing,
the schema change will silently not apply and queries against the new columns will crash.

### 3. The `run-schoolar.sh` script starts the web app only
`scripts/run-schoolar.sh` is used by the `dev:full` npm script. It must:
- Set env vars with `export VAR=value` **before** the `exec` line — never inline them on the `exec` line (that is not portable bash and causes `exec: VAR=value: not found`)
- **Not** start the API server — that runs as a separate process

Correct pattern:
```bash
export PORT="${PORT:-23863}"
export API_URL="${API_URL:-http://127.0.0.1:8080}"
exec pnpm --filter @workspace/app run dev
```

### 4. Never start two copies of the same service
The API server and web app each have a dedicated process in Replit.
Do not modify `.replit`, `artifact.toml`, or workflow commands to start multiple services
inside one process — this causes port conflicts and crashes on restart.

### 5. Authentication token key is `schoolar_token`
`localStorage.getItem('schoolar_token')` is the auth token key throughout the frontend
and the Expo mobile app. Do not rename it or add a second key.

### 6. Import `zod` as `zod/v4` in generated/lib code
The workspace uses `zod@3` with the `/v4` compat export.
All imports in generated files use `from 'zod/v4'`, not `from 'zod'`.

### 7. Drizzle timestamp columns need `mode: "string"`, and a name ending in `At`
```ts
// Correct
createdAt: timestamp("created_at").defaultNow().notNull().$$config({ mode: "string" })
// Wrong — returns a Date object, breaks Zod string schemas at runtime
createdAt: timestamp("created_at").defaultNow().notNull()
```

`mode: "string"` keeps the text Postgres wrote, and that text is not ISO 8601:
`2026-08-28 15:46:13.702493+00`. V8 parses it, **Hermes does not** — the Expo
app reads it as `Invalid Date`. `app.ts` repairs every timestamp on the way out
(`lib/contractDates.ts`), and it finds them by name: the column has to end in
`At` or `Time`. A test fails if a new one does not, so read its message rather
than working around it.

The other half of the same trap: a field the contract declares `format: date`
is generated as `zod.coerce.date()`, so parsing a response through the schema
turns `2026-12-01` into a `Date` and `res.json` writes a full timestamp. Route
handlers that return such a field put it back with `dateOnly()`. Both defects
have shipped: one made every schedule block invisible on every phone, the other
showed an empty date in the goal editor for a goal that had one.

### 8. Platform icons are generated, not drawn

`artifacts/mobile/assets/images/icon-source.png` is the drawing. Every shipped
icon comes from it:

```bash
node artifacts/mobile/scripts/build-icons.mjs
```

Do not hand-edit `icon.png`, `adaptive-icon.png`, `splash-icon.png` or
`artifacts/desktop/build/icon.png`. CI re-runs the generator with `--check` and
fails if they no longer match. Each platform needs a different shape and the
differences are not cosmetic: iOS rejects an app icon with an alpha channel,
Android crops anything outside the middle 66%, and desktop needs transparent
corners rather than white ones.

### 9. Store configuration has invariants, and they are checked

```bash
pnpm --filter @workspace/mobile run check:release
```

Runs on every pull request. It fails on the things that otherwise surface twenty
minutes into an EAS build or at store upload: a permission the app never uses,
an icon with an alpha channel, a build profile that would produce an
uninstallable `.aab` for internal testing, an `EXPO_PUBLIC_*` value the bundle
would inline as undefined. Read the message before working around it.

Build numbers come from EAS (`appVersionSource: "remote"`), so never add
`ios.buildNumber` or `android.versionCode` back to `app.json`.

### 10. API routes must be registered in openapi.yaml before codegen
When adding a new API endpoint:
1. Add the route to `lib/api-spec/openapi.yaml`
2. Run `pnpm --filter @workspace/api-spec run codegen`
3. Add the Express handler in `artifacts/api-server/src/routes/`
4. Register the router in `artifacts/api-server/src/routes/index.ts`

---

## Common crash causes and fixes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `exec: PORT=XXXX: not found` | Inline env on `exec` in a shell script | Use `export VAR=value` before `exec` |
| `EADDRINUSE: address already in use` | Stale process still holding the port | `lsof -ti :PORT \| xargs kill -9` |
| `column "X" does not exist` after merge | Schema migration wasn't in the commit | Add migration file and redeploy |
| Login/register returns 500 after a merge | New DB columns missing (migration skipped) | Check `lib/db/migrations/` includes the change |
| Generated hook `useXxx` is `undefined` at runtime | Codegen not run after OpenAPI change | `pnpm --filter @workspace/api-spec run codegen` |
| Vite `Failed to resolve import "@workspace/edu-ds/..."` | Workspace symlink broken | `pnpm install` from repo root |
| "Deep research is unavailable right now" / AI discovery failing | AI provider unreachable, wrong key, or no credit | `GET /api/healthz` → `ai` (see below) |

---

## Is the AI provider working?

`GET /api/healthz` answers, without costing anything:

```json
"ai": { "state": "failing", "checkedAt": "…", "lastOperation": "deep source review", "error": "502: Connection error." }
```

`state` is `ok`, `failing`, or `unknown` — the last meaning no AI call has
been made in the past fifteen minutes, so the server genuinely does not know.
It records the outcome of the calls the product already makes rather than
probing, so it reflects what users are actually getting.

A failing provider never changes the status code. The catalog, classes,
schedules, lists and the quick source check all work without AI, and taking
the server out of rotation for an optional feature turns a degraded product
into no product.

This exists because deep research broke in production and the only signal was
a screenshot from a user. When `state` is `failing`, check
`AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY` on the
deployed server, and the `Source review AI error:` lines in its log.

---

## Before committing

Run these checks to avoid breaking the app:

```bash
# Type-check everything
pnpm run typecheck

# The unit tests. They mock the database, so they check what a handler asks
# for, not what comes back.
pnpm --filter @workspace/api-server exec vitest run

# Verify the API server builds
pnpm --filter @workspace/api-server run build

# If you changed openapi.yaml, regenerate and rebuild libs
pnpm --filter @workspace/api-spec run codegen

# If you touched anything under artifacts/mobile
pnpm --filter @workspace/mobile run check:release

# If you touched artifacts/desktop/src
pnpm --filter @workspace/desktop run smoke
```

Read the exit code of each on its own. Piping into `tail` or `grep` reports
the exit code of *that* command, which has hidden a red suite before.

If typecheck passes and the API server builds, the app will start.

Shipping the native apps is a separate matter from making them run: see the
[release runbook](docs/release-runbook.md).

## Checking it against a real server

The checks above all take the real parts out: the unit tests mock the
database, and the page audit answers the API from fixtures. Both have been
green while a feature was broken. Four checks run against a real server and a
real Postgres instead, and CI runs all of them on every push.

Stand one up (the web app must be built **first** — the server's build copies
the Vite output beside its own entry point):

```bash
createdb casparel_dev_e2e
pnpm --filter @workspace/app run build
pnpm --filter @workspace/api-server run build

cd artifacts/api-server
DATABASE_URL=postgres://…/casparel_dev_e2e PORT=4319 NODE_ENV=production \
  SESSION_SECRET=at-least-thirty-two-bytes-long-please \
  APP_URL=http://localhost:4319 SITE_URL=http://localhost:4319 \
  ALLOWED_ORIGINS=http://localhost:4319 \
  AI_INTEGRATIONS_OPENAI_BASE_URL=http://localhost:9/v1 \
  AI_INTEGRATIONS_OPENAI_API_KEY=unused \
  ADMIN_EMAILS=e2e-admin@example.test \
  node ./dist/index.mjs
```

Then, from the repository root:

```bash
# The app driven in a real browser: register through the form, write, and
# check the page that lists it shows it.
node artifacts/app/scripts/audit-live-ui.mjs http://localhost:4319

# The flows: sign in, create, publish, copy, invite, accept, leave, delete.
E2E_ADMIN_EMAIL=e2e-admin@example.test node scripts/e2e-api.mjs http://localhost:4319

# Whether one account can reach another's work. Every answer that is not a
# refusal is a finding.
node scripts/e2e-authorization.mjs http://localhost:4319

# Whether sharing with a class stops when membership does.
E2E_ADMIN_EMAIL=e2e-admin@example.test node scripts/e2e-class-access.mjs http://localhost:4319
```

`E2E_ADMIN_EMAIL` must be in the server's `ADMIN_EMAILS`: registration only
ever creates students, so making a teacher needs an administrator. Allowlisted
addresses are promoted when they sign in, so no seeding is needed.

Exit codes: **0** all checks passed, **1** something is broken, **75** the run
could not be performed and proves nothing — a rate-limit window, usually from
running them twice in quick succession. Do not read 75 as a pass or a failure.

The database tests skip unless pointed at a throwaway database, which they
empty:

```bash
VERIFY_DATABASE_URL=postgres://…/throwaway \
  pnpm --filter @workspace/api-server exec vitest run
```

Any new `*.db.test.ts` must call `useExclusiveDatabase()` from
`src/dbTestLock.ts`, or it will race the others; there is a test that checks
this and names the file that forgot.
