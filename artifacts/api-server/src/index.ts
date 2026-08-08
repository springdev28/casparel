import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db";
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

async function prepareDatabase() {
  logger.info("Running database migrations...");
  await runMigrations();
  logger.info("Migrations complete");

  const catalogItems = await ensureCuratedCatalog();
  logger.info({ catalogItems }, "Open education catalog ready");

  if (process.env.RATE_LIMIT_STORE !== "memory") {
    logger.info("Initialising persistent rate-limit store...");
    await initRateLimitStore();
    logger.info("Rate-limit store ready");
  }
}

function main() {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });

  void prepareDatabase().catch((err) => {
    logger.error({ err }, "Database setup failed");
    if (process.env.REQUIRE_DATABASE_READY === "true") {
      process.exit(1);
    }
  });
}

main();
