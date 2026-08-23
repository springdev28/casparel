/**
 * @fileOverview Web domain role: centralizes Api Error state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
/**
 * One way to read what actually went wrong from a failed API call.
 *
 * The generated client throws an ApiError carrying the HTTP status and the
 * parsed response body, and it also builds a `message` for logs that starts
 * with "HTTP 400 Bad Request: ...". That message is useful in a console and
 * wrong in a toast, but `err.message` is the easiest thing to reach for, so
 * pages ended up rendering the log string to users.
 *
 * Call sites were each inventing their own cast, and getting it wrong in
 * different ways. LoginPage read `err.response.data.error`, an axios shape the
 * client never produces: `.response` is the raw Fetch Response and the parsed
 * body is on `.data`, so that lookup was always undefined and it silently fell
 * back to the HTTP-prefixed message it was trying to avoid.
 *
 * Do not fix this in lib/api-client-react - it is generated, and the prefixing
 * is correct for its purpose. The bug is in what the UI chooses to display.
 */
export interface ApiErrorInfo {
  /** HTTP status, when the failure came from a response at all. */
  status?: number;
  /** The server's `error` string, verbatim and unlocalized. */
  error?: string;
  /** Seconds to wait, sent by the rate limiter. */
  retryAfter?: number;
  /** True when the request never reached the server (offline, DNS, CORS). */
  offline: boolean;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function getApiError(err: unknown): ApiErrorInfo {
  const candidate = err as {
    status?: unknown;
    data?: unknown;
    name?: unknown;
  } | null;

  const status = readNumber(candidate?.status);
  const body = (candidate?.data ?? null) as {
    error?: unknown;
    retryAfter?: unknown;
  } | null;

  return {
    status,
    error: typeof body?.error === "string" ? body.error : undefined,
    retryAfter: readNumber(body?.retryAfter),
    // No status means no response: the fetch itself failed. Worth telling the
    // user apart from a server rejection, because the action to take differs.
    offline: status === undefined,
  };
}

/**
 * Turn a failed API call into a sentence the user can act on.
 *
 * `getApiError` says what happened; this says what to put on screen. Pages
 * were reaching for `err.message`, which the generated client formats for logs
 * as "HTTP 400 Bad Request: <body>" - and several routes put a raw Zod issue
 * array in that body, so a rejected submission rendered a JSON blob inside a
 * toast.
 *
 * The server's `error` string is deliberately not returned. It is unlocalized
 * English written for API consumers, and on 400 it may be machine output, so
 * echoing it is what produced the problem in the first place. `fallback` is
 * the calling page's own sentence for "this particular action failed", read
 * whenever the status is not one there are better words for.
 */
export function describeApiError(err: unknown, fallback: string): string {
  const { status, retryAfter, offline } = getApiError(err);
  if (offline) {
    return "You appear to be offline. Check your connection and try again.";
  }
  if (status === 401) {
    return "Your session has expired. Sign in again to continue.";
  }
  if (status === 403) {
    return "You do not have permission to do that.";
  }
  if (status === 404) {
    return "That item no longer exists. Refresh the page to see the latest.";
  }
  if (status === 429) {
    return retryAfter
      ? `Too many requests. Try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`
      : "Too many requests. Wait a moment and try again.";
  }
  if (status !== undefined && status >= 500) {
    return "Something went wrong on our side. Try again in a moment.";
  }
  return fallback;
}
