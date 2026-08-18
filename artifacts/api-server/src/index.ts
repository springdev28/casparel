// Load a .env file (if present) before any other module initializes. Several
// imports below, notably @workspace/db, read process.env at import time and
// throw when a required variable is missing, so this MUST stay the first
// import. The loader searches cwd and the directories around the bundle, so it
// works regardless of the host's working directory. See load-env.ts.
import "./load-env";
import app from "./app";
import { logger } from "./lib/logger";
import { pool, runMigrations } from "@workspace/db";
import { initRateLimitStore } from "./lib/rateLimitStore";
import {
  ensureCuratedCatalog,
  refreshStoredVideoSubjects,
} from "./lib/catalog";
import { markSchemaFailed, markSchemaReady } from "./lib/schemaHealth";
import { explainUnreachableDatabase } from "./lib/dbReachability";
import { withTimeout } from "./lib/withTimeout";

// Replit runs the API as a dedicated service on 8080. Local development keeps
// the conventional 5000 fallback. This must match the web app proxy defaults
// or every /api request is sent to an unused port and surfaces as a 502.
const rawPort =
  process.env["PORT"] ?? (process.env["REPL_ID"] ? "8080" : "5000");

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Ceiling on everything that has to happen before the HTTP port opens.
 *
 * Passenger and most process managers decide an app failed to spawn if it does
 * not listen within about 90 seconds, and until it listens every request is
 * answered with a 503 that no retry clears. So startup must be bounded by
 * something shorter than that, and the bound has to cover the whole sequence:
 * the migration lock, the migrations themselves, the DNS/TLS handshake to a
 * remote database, and the rate-limit store. Any one of them can hang rather
 * than fail, and a hang is not something the try/catch below can see.
 */
const SCHEMA_PREP_TIMEOUT_MS = 60_000;

async function prepareDatabaseSchema() {
  logger.info("Running database migrations...");
  await runMigrations();
  logger.info("Migrations complete");

  // Keep one application-pool connection warm so the first user request does
  // not pay the remote database TLS and connection-establishment cost.
  await pool.query("select 1");
  logger.info("Database connection pool ready");

  if (process.env.RATE_LIMIT_STORE !== "memory") {
    logger.info("Initialising persistent rate-limit store...");
    await initRateLimitStore();
    logger.info("Rate-limit store ready");
  }
}

async function main() {
  try {
    await withTimeout(
      prepareDatabaseSchema(),
      SCHEMA_PREP_TIMEOUT_MS,
      "Database setup",
    );
    markSchemaReady();
  } catch (err) {
    // We keep serving so a transient database problem does not take the app
    // down, but the schema is now potentially behind the code: any query
    // touching a column the migration would have added will fail, which shows
    // up as scattered, unrelated-looking breakage in the UI. Record it so
    // GET /healthz can report it instead of it being invisible.
    // A connection timeout reads the same whether the database is down or
    // simply has no route from this server. Name the difference when we can.
    const hint = await explainUnreachableDatabase(process.env.DATABASE_URL);
    markSchemaFailed(err, hint.message);
    logger.error(
      { err },
      "Database setup FAILED - serving with a possibly stale schema. Check GET /healthz.",
    );
    if (hint.message) logger.error(hint.message);
    if (process.env.REQUIRE_DATABASE_READY === "true") process.exit(1);
  }

  const server = app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 100;
  server.on("error", (err) => {
    logger.error({ err }, "HTTP server error");
    process.exit(1);
  });

  void ensureCuratedCatalog()
    .then((catalogItems) => {
      logger.info({ catalogItems }, "Open education catalog ready");
    })
    .catch((err) => {
      logger.error({ err }, "Open education catalog setup failed");
    });

  // Videos are classified as they are imported, so improving that classifier
  // leaves everything already stored as it was — and a video is only imported
  // again when a search runs thin, which a well-answered question never does.
  // Fifty at a time, oldest first, is enough to work through the catalog
  // steadily at one unit of the daily YouTube allowance per pass.
  const refreshEvery = Number(process.env.VIDEO_REFRESH_INTERVAL_MS) || 300_000;
  const refresh = setInterval(() => {
    void refreshStoredVideoSubjects()
      .then((corrected) => {
        if (corrected) logger.info({ corrected }, "Video subjects corrected");
      })
      .catch((err) => {
        logger.error({ err }, "Video subject refresh failed");
      });
  }, refreshEvery);
  // Nothing here is worth keeping the process alive for.
  refresh.unref();
}

void main();
