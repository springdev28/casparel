/**
 * Records whether database migrations actually applied at startup.
 *
 * Startup deliberately keeps serving when migrations fail (see index.ts) so a
 * transient database problem does not take the whole app down. The cost is that
 * a failed migration is otherwise invisible: the server looks healthy while the
 * schema is behind the code, and any query touching a not-yet-created column
 * fails, which reads as unrelated, scattered breakage in the UI.
 *
 * This module makes that state observable instead of guessable.
 */

export type SchemaState = "pending" | "ready" | "failed";

interface SchemaHealth {
  state: SchemaState;
  error: string | null;
  /** A plain-language cause when we can work one out, e.g. no route to host. */
  hint: string | null;
  checkedAt: string | null;
}

const health: SchemaHealth = {
  state: "pending",
  error: null,
  hint: null,
  checkedAt: null,
};

export function markSchemaReady(): void {
  health.state = "ready";
  health.error = null;
  health.hint = null;
  health.checkedAt = new Date().toISOString();
}

export function markSchemaFailed(error: unknown, hint: string | null = null): void {
  health.state = "failed";
  health.error = error instanceof Error ? error.message : String(error);
  // Surfaced through GET /healthz because the server logs are the one thing
  // you cannot get at from a browser when the site is down.
  health.hint = hint;
  health.checkedAt = new Date().toISOString();
}

export function getSchemaHealth(): Readonly<SchemaHealth> {
  return health;
}
