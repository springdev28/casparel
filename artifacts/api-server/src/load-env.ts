/**
 * @fileOverview API support role: configures or operates the Load Env part of the backend package.
 * System connection: participates in the API package's development, build, validation, or deployment lifecycle.
 */
// Loads a .env file before anything else in the process initializes.
//
// The server reads process.env directly and several modules (@workspace/db,
// auth, the OpenAI integration) throw at import time when a required variable
// is missing. On hosts that inject env vars for us (Replit, a correctly-bound
// Passenger app) this is a no-op, dotenv never overrides variables that are
// already set. It only matters when the platform's injection is unavailable
// (e.g. after a domain rename detaches the deployment's env binding), in which
// case an operator can drop a .env next to the app and the server reads it.
//
// This file is imported for its side effect as the FIRST import in index.ts,
// so it runs before the guarded modules. It must not import anything from the
// app itself.
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Search, in order, the working directory and every directory from the bundle
// up to the app root. Passenger's working directory is not guaranteed to be the
// app root, so we do not rely on cwd alone. The first .env found wins.
const bundleDir = dirname(fileURLToPath(import.meta.url));
const candidates = [
  process.cwd(),
  bundleDir,
  resolve(bundleDir, ".."),
  resolve(bundleDir, "..", ".."),
  resolve(bundleDir, "..", "..", ".."),
  resolve(bundleDir, "..", "..", "..", ".."),
];

for (const dir of candidates) {
  const candidate = resolve(dir, ".env");
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}

/**
 * Fail with the full list of missing variables, not the first one.
 *
 * Several modules guard their own configuration by throwing from module scope
 * (lib/integrations-openai-ai-server does this for both of its variables, and
 * @workspace/db for DATABASE_URL). Because those throws happen during the
 * import graph, the process dies before index.ts runs: no HTTP server, no
 * /healthz, and a log line naming exactly one variable. Fixing it, restarting,
 * and discovering the next one is a slow way to learn what a deploy needs.
 *
 * This runs first and reports everything that is missing in one message.
 */
const REQUIRED_ENV = [
  ["DATABASE_URL", "Postgres connection string"],
  ["SESSION_SECRET", "signs session tokens; a long random string"],
  ["AI_INTEGRATIONS_OPENAI_BASE_URL", "OpenAI-compatible API base URL"],
  ["AI_INTEGRATIONS_OPENAI_API_KEY", "OpenAI-compatible API key"],
] as const;

const missing = REQUIRED_ENV.filter(([name]) => !process.env[name]?.trim());
if (missing.length > 0) {
  const lines = missing.map(([name, why]) => `  - ${name}  (${why})`);
  throw new Error(
    `Cannot start: ${missing.length} required environment variable(s) missing.\n` +
      `${lines.join("\n")}\n` +
      `See artifacts/api-server/.env.example. A .env placed next to the app is picked up automatically.`,
  );
}
