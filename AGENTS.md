# Schoolar — Agent Instructions

These instructions apply to every AI agent (Codex, Copilot, etc.) that modifies this repository.
Read this file before making any change. Violating these rules is the most common cause of app crashes.

---

## Monorepo layout

```
artifacts/
  api-server/   Express 5 API — runs on PORT (default 8080 in Replit, 5000 locally)
  app/          React + Vite web app — runs on PORT 23863, proxies /api → API server
  mobile/       Expo React Native app
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

### 7. Drizzle timestamp columns need `mode: "string"`
```ts
// Correct
createdAt: timestamp("created_at").defaultNow().notNull().$$config({ mode: "string" })
// Wrong — returns a Date object, breaks Zod string schemas at runtime
createdAt: timestamp("created_at").defaultNow().notNull()
```

### 8. API routes must be registered in openapi.yaml before codegen
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

---

## Before committing

Run these checks to avoid breaking the app:

```bash
# Type-check everything
pnpm run typecheck

# Verify the API server builds
pnpm --filter @workspace/api-server run build

# If you changed openapi.yaml, regenerate and rebuild libs
pnpm --filter @workspace/api-spec run codegen
```

If typecheck passes and the API server builds, the app will start.
