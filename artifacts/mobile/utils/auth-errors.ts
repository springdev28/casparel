/**
 * Turning a failed sign-in or sign-up into a sentence a person can act on.
 *
 * The login screen used to ignore the error entirely and always say "Invalid
 * email or password." A class on one school connection shares an address, so a
 * pupil whose classmates had just tripped the credential limiter was told
 * their password was wrong -- and the sensible next step for them is to reset
 * a password that was never wrong. A dropped connection said the same thing.
 *
 * The register screen already read the status. Both now read it here, so the
 * rule lives in one place and can be tested: the screens are React components
 * and this is not.
 *
 * The generated API client builds its message for logs -- "HTTP 401
 * Unauthorized: ..." -- so the status is what to read, never that string. When
 * the server sent a sentence of its own it is preferred, because the server
 * knows things the client does not, such as how many minutes are left on a
 * lockout.
 */

export type AuthAction = "login" | "register";

type ApiFailure = {
  status?: number;
  data?: { error?: string } | null;
};

function serverSentence(error: unknown): string | null {
  const detail = (error as ApiFailure | null)?.data?.error;
  return typeof detail === "string" && detail.trim() ? detail.trim() : null;
}

type Translate = (key: string) => string;

/**
 * The translator is passed in rather than pulled from a hook, so this stays a
 * plain function the login and register screens can both call from a catch
 * block. The default is identity, so a caller that has no translator to hand
 * gets English rather than a crash -- but every caller in the app passes one.
 *
 * These sentences were English in all six languages until the check that
 * holds the phone's strings against its dictionaries stopped reading `.tsx`
 * only. Sign-in failure is the first thing a new account can hit, and it was
 * the least translated screen in the product.
 */
export function describeAuthFailure(
  error: unknown,
  action: AuthAction,
  t: Translate = (key) => key,
): string {
  const status = (error as ApiFailure | null)?.status;

  // No status at all means the request never got an answer: a phone on a train,
  // aeroplane mode, or the server unreachable. Everything else here is a reply.
  if (status === undefined) {
    return t("Could not reach Casparel. Check your connection and try again.");
  }
  if (status === 429) {
    return (
      serverSentence(error) ??
      t("Too many attempts. Please wait a few minutes and try again.")
    );
  }
  if (status === 403) {
    return (
      serverSentence(error) ??
      t("This account cannot sign in. Contact support@casparel.com.")
    );
  }
  if (action === "register" && (status === 400 || status === 409)) {
    /*
     * A 400 here is not always a duplicate email.
     *
     * It is also every validation failure -- a short password, a missing
     * name. The server used to answer those with a JSON dump, so treating
     * every 400 as "that email is taken" was merely the least-bad guess;
     * now it says "Password must be at least 8 characters." and repeating
     * the guess over the top of it would be a step backwards.
     */
    const sentence = serverSentence(error);
    if (sentence && !/already in use/i.test(sentence)) return sentence;
    return t("That email already has a Casparel account. Try signing in instead.");
  }
  if (action === "login" && (status === 401 || status === 400)) {
    return t("Invalid email or password. Please try again.");
  }
  if (status >= 500) {
    // Their credentials are not the problem, and telling them so sends them
    // to reset a password that works.
    return t("Casparel is having trouble right now. Please try again shortly.");
  }
  return action === "login"
    ? t("Could not sign you in just now. Please try again.")
    : t("Could not create your account. Please try again.");
}
