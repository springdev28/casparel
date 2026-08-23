/**
 * @fileOverview Backend domain role: centralizes With Timeout logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
/**
 * Turn a hang into an error.
 *
 * Startup awaits several things that can stop making progress without ever
 * rejecting: a Postgres advisory lock held by another process, a TCP or TLS
 * handshake to a database that accepts the connection and then goes quiet, a
 * migration blocked behind someone else's transaction. A promise that never
 * settles is invisible to try/catch, so the usual "keep serving if the database
 * is unhappy" recovery path simply never runs.
 *
 * That is not hypothetical here: it took casparel.com down. Migrations were
 * awaited before app.listen, one boot blocked forever on the blocking variant
 * of pg_advisory_lock, the HTTP port was therefore never opened, and Passenger
 * answered every request with a 503 that no retry and no restart cleared.
 *
 * Racing against a deadline makes the failure legible and recoverable.
 */
export function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} did not finish within ${ms}ms`)),
      ms,
    );
  });
  // The timer is always cleared, including on the happy path, so a short-lived
  // process is not held open by a pending timeout.
  return Promise.race([work, expiry]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}
