// Load a .env file (if present) before any other module initializes. Several
// imports below — notably @workspace/db — read process.env at import time and
// throw when DATABASE_URL is missing, so this MUST stay the first import.
// dotenv never overrides variables the host already injected, so it is a safe
// no-op in environments (Replit, a correctly-configured Passenger app) that
// provide env vars directly; it only fills the gap when they are supplied via
// a .env file at the app root instead.
import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { pool, runMigrations } from "@workspace/db";
import { initRateLimitStore } from "./lib/rateLimitStore";
import { ensureCuratedCatalog } from "./lib/catalog";

// Replit runs the API as a dedicated service on 8080. Local development keeps
// the conventional 5000 fallback. This must match the web app proxy defaults
// or every /api request is sent to an unused port and surfaces as a 502.
const rawPort =
  process.env["PORT"] ?? (process.env["REPL_ID"] ? "8080" : "5000");

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

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
    await prepareDatabaseSchema();
  } catch (err) {
    logger.error({ err }, "Database setup failed");
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
}

void main();
