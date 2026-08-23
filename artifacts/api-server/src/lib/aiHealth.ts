/**
 * @fileOverview Backend domain role: centralizes Ai Health logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
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
  /**
   * Which kind of `unknown`, since there are two and they are different news:
   * nothing has been attempted since this process started, or a result was
   * recorded and has aged out.
   */
  reason?: "never-attempted" | "last-result-expired";
  checkedAt: string | null;
  lastOperation?: string;
  /** What the aged-out result said, for the `last-result-expired` case. */
  lastState?: "ok" | "failing";
  error?: string;
};

export function aiHealth(now = Date.now()): AiHealth {
  /*
   * "unknown" covers two situations that need different answers, so it says
   * which.
   *
   * Nothing has been attempted since this process started -- a quiet server,
   * or a feature nobody has reached -- and a result that has aged out are both
   * "we do not know", and they are not the same news. Production reported
   * `state: "unknown", checkedAt: null` and the only way to tell those apart
   * was to notice that checkedAt was null, work out what that implied, and
   * trust the implication. That is a two-step inference at the moment somebody
   * is trying to find out whether the product's headline feature is broken.
   *
   * `reason` is additive: `state` keeps its three values, so nothing reading
   * it needs to change.
   */
  if (!last) {
    return { state: "unknown", reason: "never-attempted", checkedAt: null };
  }
  if (now - last.at > FRESH_FOR_MS) {
    return {
      state: "unknown",
      reason: "last-result-expired",
      checkedAt: isoAt(last.at),
      // What it was, the last time anybody knew. A provider that was failing
      // an hour ago is a different starting point from one that was fine.
      lastOperation: last.operation,
      lastState: last.ok ? "ok" : "failing",
    };
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
