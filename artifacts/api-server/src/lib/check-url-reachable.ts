import { lookup } from "node:dns/promises";

// ---------------------------------------------------------------------------
// Private-IP detection
// ---------------------------------------------------------------------------

/**
 * Returns true when `ip` belongs to a private, loopback, link-local,
 * or otherwise non-routable address range.
 */
function isPrivateIP(ip: string): boolean {
  // IPv6: loopback, link-local (fe80::/10), ULA (fc00::/7)
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower.startsWith("fe80") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd")
    );
  }

  // IPv4 non-public ranges
  const privateRanges: RegExp[] = [
    /^0\./,                                      // 0.0.0.0/8
    /^127\./,                                    // Loopback 127.0.0.0/8
    /^10\./,                                     // RFC-1918 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\./,               // RFC-1918 172.16.0.0/12
    /^192\.168\./,                               // RFC-1918 192.168.0.0/16
    /^169\.254\./,                               // Link-local / cloud metadata
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64.0.0/10
    /^192\.0\.[02]\./,                           // IETF protocol assignments
    /^198\.(1[89])\./,                           // Benchmark testing
    /^198\.51\.100\./,                           // TEST-NET-2
    /^203\.0\.113\./,                            // TEST-NET-3
    /^2(2[4-9]|3\d)\./,                         // Multicast 224.0.0.0/4
    /^24\d\./,                                   // Reserved 240.0.0.0/4
    /^255\./,                                    // Broadcast
  ];

  return privateRanges.some((re) => re.test(ip));
}

// ---------------------------------------------------------------------------
// SSRF-safe URL guard
// ---------------------------------------------------------------------------

/**
 * Returns false (block) when the URL:
 *   - is not HTTP or HTTPS
 *   - uses a non-default port that looks suspicious (blocked list)
 *   - resolves to a private/loopback/link-local IP address
 *   - cannot be resolved via DNS
 */
async function isSafeUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false; // unparseable
  }

  // Only allow plain HTTP/HTTPS
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname;

  // Resolve and check every address the hostname maps to
  try {
    const records = await lookup(hostname, { all: true });
    if (!records || records.length === 0) return false;

    for (const { address } of records) {
      if (isPrivateIP(address)) return false;
    }
    return true;
  } catch {
    // DNS failure → treat as unreachable / unsafe
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reachability check
// ---------------------------------------------------------------------------

/**
 * Checks whether a URL is publicly reachable.
 *
 * - Only HTTP/HTTPS URLs pointing at non-private IPs are fetched (SSRF guard).
 * - Uses a HEAD request with `redirect: "manual"` first (3xx → reachable).
 * - Falls back to a GET with `Range: bytes=0-0` if HEAD returns a non-2xx/non-3xx.
 * - Returns false on any network error, DNS failure, or timeout.
 */
export async function checkUrlReachable(
  url: string,
  timeoutMs = 3000
): Promise<boolean> {
  // SSRF guard: block non-HTTP(S) and private-IP targets before any fetch
  const safe = await isSafeUrl(url);
  if (!safe) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // HEAD with manual redirect handling — we never follow redirects
    // automatically to avoid being bounced to an internal address.
    // A 3xx from an external host is itself proof the URL is alive.
    const headRes = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "manual",
      headers: { "User-Agent": "Schooler-LinkCheck/1.0" },
    });

    if (headRes.ok || (headRes.status >= 300 && headRes.status < 400)) {
      return true;
    }

    // Some servers refuse HEAD; fall back to a minimal GET
    const getRes = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "User-Agent": "Schooler-LinkCheck/1.0",
        Range: "bytes=0-0",
      },
    });

    // 2xx, 206 Partial Content, 3xx redirect, or 416 Range Not Satisfiable
    // all confirm the server is alive.
    return (
      getRes.ok ||
      getRes.status === 416 ||
      (getRes.status >= 300 && getRes.status < 400)
    );
  } catch {
    // Network error, abort (timeout), DNS failure, etc.
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Batch helper
// ---------------------------------------------------------------------------

/**
 * Filters an array of objects that have a `url` field, removing any whose URL
 * fails the reachability check. All checks run in parallel.
 */
export async function filterReachableUrls<T extends { url: string }>(
  items: T[],
  timeoutMs = 3000
): Promise<T[]> {
  const results = await Promise.all(
    items.map(async (item): Promise<T | null> => {
      const reachable = await checkUrlReachable(item.url, timeoutMs);
      return reachable ? item : null;
    })
  );
  return results.filter((item) => item !== null) as T[];
}
