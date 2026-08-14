import { lookup } from "node:dns/promises";

/**
 * Explains *why* the database could not be reached, when the reason is one a
 * connection timeout hides.
 *
 * "Connection terminated due to connection timeout" is what node-postgres says
 * whether the database is down, the credentials are wrong, or the host simply
 * has no route. That last case is the one worth naming, because it looks
 * identical to an outage and is not one: Supabase's direct database host
 * (db.<ref>.supabase.co) publishes only an AAAA record, so a server without
 * IPv6 egress cannot open a socket to it at all. Hosts that had IPv6 can also
 * lose it, at which point a service that ran for months stops dead with a
 * timeout and nothing pointing at the cause.
 *
 * The pooler host (<region>.pooler.supabase.com) is IPv4-reachable and is the
 * supported answer. Session mode, port 5432, is the one to use here: the
 * migration runner takes a session-scoped `pg_advisory_lock`, which transaction
 * mode on port 6543 cannot hold across statements.
 */

export interface ReachabilityHint {
  /** True when the host resolves to IPv6 only. */
  ipv6Only: boolean;
  /** A sentence to log next to the connection error, or null. */
  message: string | null;
}

function hostFrom(connectionString: string): string | null {
  try {
    return new URL(connectionString).hostname || null;
  } catch {
    return null;
  }
}

async function resolves(host: string, family: 4 | 6): Promise<boolean> {
  try {
    await lookup(host, { family });
    return true;
  } catch {
    return false;
  }
}

/**
 * Look at the configured database host and report anything that explains a
 * connection failure better than the timeout does. Never throws: this runs on
 * an error path, and a diagnostic that fails must not replace the real error.
 */
export async function explainUnreachableDatabase(
  connectionString: string | undefined,
): Promise<ReachabilityHint> {
  const none: ReachabilityHint = { ipv6Only: false, message: null };
  if (!connectionString) return none;

  const host = hostFrom(connectionString.trim());
  if (!host) return none;

  const [hasIpv4, hasIpv6] = await Promise.all([
    resolves(host, 4),
    resolves(host, 6),
  ]);
  if (hasIpv4 || !hasIpv6) return none;

  const poolerHint = host.endsWith(".supabase.co")
    ? " Use the Supabase session pooler instead: Project Settings then Database" +
      " then Connection string then Session pooler, which is IPv4-reachable." +
      " Session mode (port 5432), not transaction mode (6543), because the" +
      " migration runner holds a session-scoped advisory lock."
    : "";

  return {
    ipv6Only: true,
    message:
      `The database host ${host} resolves to IPv6 only, and this server has no` +
      ` IPv6 route, so every connection attempt times out regardless of whether` +
      ` the database is healthy.${poolerHint}`,
  };
}
