import type { Store, Options, ClientRateLimitInfo } from "express-rate-limit";
import { pool } from "@workspace/db";

/**
 * PostgreSQL-backed store for express-rate-limit.
 *
 * Uses the shared `pool` already exported by @workspace/db — no extra
 * connection needed.  The table is created (if absent) by calling
 * `initRateLimitStore()` once at server startup, before any request is served.
 *
 * Each limiter must be given a unique `prefix` so that the global, auth, and
 * content limiters maintain independent counters per IP even though they all
 * write to the same table.  The DB primary key is `${prefix}:${clientKey}`.
 *
 * Set RATE_LIMIT_STORE=memory to skip this store and use the default
 * in-memory store (useful when DATABASE_URL is not available).
 */

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS rate_limit_hits (
    key        TEXT        NOT NULL,
    hits       INTEGER     NOT NULL DEFAULT 0,
    reset_time TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (key)
  );
  CREATE INDEX IF NOT EXISTS rate_limit_hits_reset_time_idx
    ON rate_limit_hits (reset_time);
`;

/** Call once at startup (after runMigrations). */
export async function initRateLimitStore(): Promise<void> {
  await pool.query(CREATE_TABLE_SQL);
}

export class PostgresRateLimitStore implements Store {
  /**
   * Unique namespace for this limiter instance.
   * The stored key is `${limiterPrefix}:${clientKey}` so different limiters
   * never share counters even when they receive traffic from the same IP.
   * Named `limiterPrefix` (not `prefix`) to avoid shadowing the optional
   * public `prefix` property declared on the express-rate-limit Store interface.
   */
  private readonly limiterPrefix: string;

  /**
   * Window length in milliseconds.  Populated by express-rate-limit via
   * `init()` before the first request; safe to default to 0 here because
   * express-rate-limit guarantees `init` runs before `increment`.
   */
  private windowMs: number = 0;

  constructor(prefix: string) {
    this.limiterPrefix = prefix;
  }

  // express-rate-limit calls init() with the full options object
  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private scopedKey(key: string): string {
    return `${this.limiterPrefix}:${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const scopedKey = this.scopedKey(key);
    const windowMs = this.windowMs;

    const result = await pool.query<{ hits: number; reset_time: Date }>(
      `
      INSERT INTO rate_limit_hits (key, hits, reset_time)
      VALUES ($1, 1, NOW() + ($2 || ' milliseconds')::interval)
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE
          WHEN rate_limit_hits.reset_time <= NOW() THEN 1
          ELSE rate_limit_hits.hits + 1
        END,
        reset_time = CASE
          WHEN rate_limit_hits.reset_time <= NOW() THEN NOW() + ($2 || ' milliseconds')::interval
          ELSE rate_limit_hits.reset_time
        END
      RETURNING hits, reset_time
      `,
      [scopedKey, String(windowMs)],
    );

    const row = result.rows[0];
    return {
      totalHits: row.hits,
      resetTime: row.reset_time,
    };
  }

  async decrement(key: string): Promise<void> {
    await pool.query(
      `UPDATE rate_limit_hits
          SET hits = GREATEST(0, hits - 1)
        WHERE key = $1 AND reset_time > NOW()`,
      [this.scopedKey(key)],
    );
  }

  async resetKey(key: string): Promise<void> {
    await pool.query(`DELETE FROM rate_limit_hits WHERE key = $1`, [
      this.scopedKey(key),
    ]);
  }

  async resetAll(): Promise<void> {
    // Only clear rows belonging to this limiter's namespace.
    await pool.query(`DELETE FROM rate_limit_hits WHERE key LIKE $1`, [
      `${this.limiterPrefix}:%`,
    ]);
  }
}

/**
 * Returns either a new PostgresRateLimitStore (namespaced by `prefix`) or
 * undefined so express-rate-limit falls back to its default MemoryStore.
 *
 * Every limiter must pass a distinct `prefix` string so their per-IP counters
 * stay independent in the shared `rate_limit_hits` table.
 */
export function buildRateLimitStore(
  prefix: string,
): PostgresRateLimitStore | undefined {
  if (process.env.RATE_LIMIT_STORE === "memory") {
    return undefined;
  }
  return new PostgresRateLimitStore(prefix);
}
