import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db";
import { initRateLimitStore } from "./lib/rateLimitStore";

const rawPort = process.env["PORT"] ?? "5000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  logger.info("Running database migrations…");
  await runMigrations();
  logger.info("Migrations complete");

  if (process.env.RATE_LIMIT_STORE !== "memory") {
    logger.info("Initialising persistent rate-limit store…");
    await initRateLimitStore();
    logger.info("Rate-limit store ready");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Startup failed");
  process.exit(1);
});
