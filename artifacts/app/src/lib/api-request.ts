/**
 * A fetch that carries the session.
 *
 * Most of the app talks to the API through the generated React Query hooks,
 * which attach the token for you. The handful of places that call `fetch`
 * directly have to remember, and forgetting is silent: the request is
 * well-formed, the server answers 401 politely, and the screen shows an error
 * that reads like the server is having trouble rather than like the client
 * never said who it was.
 *
 * That is exactly how the community study paths on the goals page came to have
 * never worked -- loading, sharing and cloning all called bare `fetch`, all
 * three routes require a session, and all three answered 401 to everybody.
 *
 * So there is one helper, and hand-written calls use it. It exists separately
 * from class-api's classRequest, which is the same thing under a name that
 * only makes sense for one feature; that now delegates here.
 */
export async function authedRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${localStorage.getItem("schoolar_token")}`,
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // The server's own sentence when it sent one: it knows what went wrong
    // and the caller usually does not.
    throw new Error(
      (payload as { error?: string }).error ?? `Request failed (${response.status})`,
    );
  }
  return payload as T;
}
