/**
 * Whether the AI provider is answering, from the calls the product already
 * makes.
 *
 * Deep research broke in production and the only signal anybody had was a
 * screenshot from a user: a red line in a dialog. `/healthz` reported the
 * database schema and nothing else, so a wrong key, an expired one or an
 * unreachable base URL looked exactly like a healthy server. The failure is
 * logged, but a log line nobody is tailing is not a signal.
 *
 * This records the outcome of the calls that happen anyway rather than probing
 * on its own. A probe would cost money on every health check, and it would
 * answer a question nobody asked -- "could a request succeed just now?" --
 * instead of the one that matters, which is whether the requests people are
 * actually making are working.
 *
 * A failing provider does not make the server unhealthy. The catalog, classes,
 * schedules, lists and the quick source check all work without it, so this is
 * reported beside the status rather than folded into it: taking the app out of
 * rotation because an optional feature is down would turn a degraded product
 * into no product.
 */

/** How long a recorded outcome still describes the present. */
const FRESH_FOR_MS = 15 * 60 * 1000;

type Outcome = {
  ok: boolean;
  at: number;
  operation: string;
  detail?: string;
};

let last: Outcome | null = null;

/**
 * An error a maker can act on, with nothing in it that should not be logged.
 *
 * Provider errors carry a status and a message; the message can quote request
 * details, so it is truncated and anything shaped like a key is removed. The
 * key is not supposed to appear in an error at all -- this is here because
 * "not supposed to" is not a guarantee, and this string is served over HTTP.
 */
function describe(error: unknown): string {
  const status = (error as { status?: unknown } | null)?.status;
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const safe = raw
    .replace(/\b(sk|rk|pk)-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  if (typeof status === "number") return safe ? `${status}: ${safe}` : String(status);
  return safe || "unknown error";
}

/**
 * Run an AI call and remember how it went.
 *
 * Rethrows unchanged: every caller already handles its own failure, and this
 * must not become a second place where the reason for one is decided.
 */
export async function throughAi<T>(
  operation: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    const value = await run();
    last = { ok: true, at: Date.now(), operation };
    return value;
  } catch (error) {
    last = { ok: false, at: Date.now(), operation, detail: describe(error) };
    throw error;
  }
}

export type AiHealth = {
  /**
   * `unknown` is honest and common: a server that has served no AI request
   * since it started knows nothing about the provider, and saying "ok" there
   * would be a guess presented as a fact.
   */
  state: "ok" | "failing" | "unknown";
  checkedAt: string | null;
  lastOperation?: string;
  error?: string;
};

export function aiHealth(now = Date.now()): AiHealth {
  if (!last || now - last.at > FRESH_FOR_MS) {
    return { state: "unknown", checkedAt: last ? isoAt(last.at) : null };
  }
  return {
    state: last.ok ? "ok" : "failing",
    checkedAt: isoAt(last.at),
    lastOperation: last.operation,
    ...(last.ok ? {} : { error: last.detail }),
  };
}

function isoAt(at: number): string {
  return new Date(at).toISOString();
}

/** Test seam: forget what was recorded. */
export function resetAiHealth(): void {
  last = null;
}
