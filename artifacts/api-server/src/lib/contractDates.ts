/**
 * @fileOverview Backend domain role: centralizes Contract Dates logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
/**
 * A calendar date on the wire is a calendar date, not an instant.
 *
 * Six fields in openapi.yaml are declared `format: date`: a schedule block's
 * `date` and a learning goal's `targetDate`. orval turns that declaration into
 * `zod.coerce.date()`, so parsing a row through the generated response schema
 * replaces the database's "2026-08-19" with a JS Date -- and `res.json` then
 * writes it as "2026-08-19T00:00:00.000Z". The server breaks its own contract
 * on the way out, and it does it in the response schema, which is the last
 * place anybody looks.
 *
 * This is not theoretical. It made every schedule block invisible on every
 * phone: the mobile schedule believed the contract and compared `date` to a
 * YYYY-MM-DD string, a comparison that could never be true. The same defect
 * was still live on learning goals, where the web app's edit dialog binds
 * `targetDate` to an `<input type="date">` -- a browser renders a value that
 * is not YYYY-MM-DD as an empty field, so a learner opening Edit on a goal due
 * in December was shown no date at all, and clearing that field is one tap.
 *
 * A date-only string also cannot be turned into an instant without inventing a
 * timezone, which is the other half of the damage: "2026-12-01" read in
 * UTC-05:00 as an instant is the 30th of November.
 *
 * The generated schemas are not ours to edit, so the shape is restored here,
 * once, at the boundary where a response is written.
 */

/** YYYY-MM-DD, from whichever of the two shapes the parse produced. */
export function dateOnly(value: Date | string): string;
export function dateOnly(value: Date | string | null): string | null;
export function dateOnly(value: Date | string | null | undefined): string | null | undefined;
export function dateOnly(
  value: Date | string | null | undefined,
): string | null | undefined {
  if (value === null || value === undefined) return value;
  // toISOString is UTC, and a Date parsed from "2026-12-01" is midnight UTC,
  // so this returns the day it started as rather than the day before it.
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

/**
 * The same, for a row whose date field the response schema has just coerced.
 * Named for what it restores rather than for what it does to the object.
 */
export function withDateOnly<Key extends string, Row extends Record<Key, Date | string>>(
  row: Row,
  key: Key,
): Row & Record<Key, string> {
  return { ...row, [key]: dateOnly(row[key]) } as Row & Record<Key, string>;
}

/**
 * A Postgres timestamp as it arrives from the driver, and nothing else.
 *
 * "2026-08-28 15:46:13.702493+00": a space where ISO 8601 has a T, microseconds
 * where JavaScript has milliseconds, and an offset written +00 rather than
 * +00:00 or Z. Anchored, so a string that merely contains one is left alone.
 */
const POSTGRES_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:?\d{2})?)?$/;

/** A field carrying a moment in time, by the naming this codebase uses. */
const MOMENT_KEY = /(At|Time)$/;

/**
 * Every timestamp this server sends is ISO 8601.
 *
 * The rows come out of Drizzle as the text Postgres wrote, because
 * drizzle-orm's node-postgres session overrides the driver's TIMESTAMP and
 * TIMESTAMPTZ parsers with the identity function so that `mode: "string"`
 * columns keep their string. That text is not ISO 8601, and res.json passed it
 * straight through: `createdAt: "2026-08-28 15:46:13.702493+00"`.
 *
 * V8 accepts that. Hermes -- the engine the Expo app actually runs on -- does
 * not, and this was measured rather than assumed:
 *
 *   new Date("2026-08-28 15:46:13.702493+00")  ->  Invalid Date
 *   new Date("2026-08-28T15:46:13.702Z")       ->  2026-08-28T15:46:13.702Z
 *
 * So every date the phone drew from an API timestamp was "Invalid Date": the
 * date on a review, the start and end of a study session. The web app was fine
 * throughout, which is why the shape of this went unnoticed -- the same reason
 * the schedule-block date defect above lived as long as it did.
 *
 * Fixed here, at the one place every response is written, rather than in forty
 * handlers. Both halves have to match for a value to be rewritten: a key that
 * names a moment, and text that is exactly a Postgres timestamp. A learner's
 * own words are never under such a key, and an ISO string carries a T and so
 * cannot match either.
 */
export function isoTimestamps(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (!MOMENT_KEY.test(key) || !POSTGRES_TIMESTAMP.test(value)) return value;
  // A bare timestamp with no offset is Postgres's `timestamp without time
  // zone`, which this schema only uses where the value was written as UTC.
  const parsed = new Date(/[+-]\d{2}/.test(value.slice(10)) ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}
