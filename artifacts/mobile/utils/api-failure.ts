/**
 * What a failed request should say to a person.
 *
 * Several screens guessed. Creating a study session answered every failure
 * with "Failed to create session. Check the meeting URL and try again." --
 * including the one where an invitee's privacy preference refused the invite,
 * which leaves somebody retyping a URL that was never wrong.
 *
 * The server almost always sends a sentence. Preferring it is right, with one
 * exception worth spelling out: some routes pass a Zod error straight through,
 * and `ZodError.message` is a JSON array of issue objects. Showing that to a
 * person is worse than any fallback, so a server "sentence" is only used when
 * it actually reads like one.
 */

type ApiFailure = {
  status?: number;
  data?: { error?: string } | null;
};

/**
 * True when the server's string is prose rather than a serialised error.
 *
 * Cheap and deliberate: a leading bracket or brace means JSON, a newline means
 * a dump of some kind, and anything past a couple of hundred characters is not
 * a message for a dialog.
 */
function readsLikeASentence(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > 200) return false;
  if (/^[[{]/.test(text)) return false;
  if (text.includes("\n")) return false;
  return /[a-z]/i.test(text);
}

export function describeApiFailure(error: unknown, fallback: string): string {
  const failure = error as ApiFailure | null;
  const status = failure?.status;

  // No status means no answer arrived: aeroplane mode, a dead tunnel, a train.
  if (status === undefined) {
    return "Could not reach Casparel. Check your connection and try again.";
  }

  const sentence = failure?.data?.error;
  if (typeof sentence === "string" && readsLikeASentence(sentence)) {
    return sentence.trim();
  }

  if (status >= 500) {
    return "Casparel is having trouble right now. Please try again shortly.";
  }
  return fallback;
}
