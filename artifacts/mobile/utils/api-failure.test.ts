/**
 * A failed request says what the server said, unless the server said JSON.
 *
 * Several mobile screens guessed instead of reading the answer. Creating a
 * study session replied "Failed to create session. Check the meeting URL and
 * try again." to every failure -- including the one where an invitee's privacy
 * preference refused the invite, which leaves somebody retyping a URL that was
 * never wrong.
 *
 * The exception matters as much as the rule. Some routes pass a Zod error
 * through untouched, and `ZodError.message` is a JSON array of issue objects.
 * Printing that at a person is worse than any fallback.
 */
import { describe, expect, it } from "vitest";
import { describeApiFailure } from "./api-failure";

const FALLBACK = "Could not create the session. Please try again.";
const apiError = (status: number, error?: string) => ({
  status,
  data: error ? { error } : null,
});

describe("describing a failed request", () => {
  it("says what the server said", () => {
    expect(
      describeApiFailure(
        apiError(403, "One or more invitees are not available to invite"),
        FALLBACK,
      ),
    ).toBe("One or more invitees are not available to invite");
  });

  it("never prints a serialised Zod error at a person", () => {
    // What `res.status(400).json({ error: parsed.error.message })` actually
    // sends: a JSON array of issue objects.
    const zod = JSON.stringify(
      [{ expected: "number", code: "invalid_type", path: ["id"], message: "Invalid input" }],
      null,
      2,
    );
    expect(describeApiFailure(apiError(400, zod), FALLBACK)).toBe(FALLBACK);
  });

  it("rejects a server string that is too long to be a message", () => {
    expect(describeApiFailure(apiError(400, "x".repeat(400)), FALLBACK)).toBe(FALLBACK);
  });

  it("rejects a multi-line dump", () => {
    expect(
      describeApiFailure(apiError(500, "Error: boom\n  at thing (file.ts:1:1)"), FALLBACK),
    ).not.toContain("at thing");
  });

  it("blames the connection only when nothing answered", () => {
    expect(describeApiFailure(new Error("Network request failed"), FALLBACK)).toMatch(
      /connection/i,
    );
    // A 400 did answer, so it is not a connection problem.
    expect(describeApiFailure(apiError(400), FALLBACK)).toBe(FALLBACK);
  });

  it("does not blame the caller for our own outage", () => {
    const message = describeApiFailure(apiError(503), FALLBACK);
    expect(message).not.toBe(FALLBACK);
    expect(message).toMatch(/trouble/i);
  });

  it("prefers the server's sentence over the generic outage line", () => {
    expect(
      describeApiFailure(apiError(503, "Scheduled maintenance until 09:00 UTC."), FALLBACK),
    ).toBe("Scheduled maintenance until 09:00 UTC.");
  });
});
