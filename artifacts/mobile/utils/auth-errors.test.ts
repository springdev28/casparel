/**
 * A failed sign-in says what failed.
 *
 * The login screen ignored the error and always said "Invalid email or
 * password." A class on one school connection shares an address, so a pupil
 * whose classmates had just tripped the credential limiter was told their
 * password was wrong -- and the sensible next step for them is to reset a
 * password that was never wrong. The same sentence appeared for a dropped
 * connection and for a server error.
 *
 * These are the cases that were being flattened, kept apart.
 */
import { describe, expect, it } from "vitest";
import { describeAuthFailure } from "./auth-errors";

const apiError = (status: number, error?: string) => ({
  status,
  data: error ? { error } : null,
  // The generated client builds this for logs; it must never reach a person.
  message: `HTTP ${status}: ${error ?? "…"}`,
});

describe("describing a failed sign-in", () => {
  it("says the credentials are wrong only when they are", () => {
    expect(describeAuthFailure(apiError(401), "login")).toMatch(/Invalid email or password/);
  });

  it("does not blame the password for a rate limit", () => {
    const message = describeAuthFailure(apiError(429), "login");
    expect(message).not.toMatch(/password/i);
    expect(message).toMatch(/too many/i);
  });

  it("prefers the server's own sentence, which knows the wait", () => {
    // The server sends "Please wait 15 minutes", which the client cannot know.
    expect(
      describeAuthFailure(
        apiError(429, "Too many sign-in attempts. Please wait 15 minutes and try again."),
        "login",
      ),
    ).toBe("Too many sign-in attempts. Please wait 15 minutes and try again.");
  });

  it("does not blame the password for a dead connection", () => {
    const message = describeAuthFailure(new Error("Network request failed"), "login");
    expect(message).not.toMatch(/password/i);
    expect(message).toMatch(/connection/i);
  });

  it("does not blame the password for our own outage", () => {
    const message = describeAuthFailure(apiError(503), "login");
    expect(message).not.toMatch(/password/i);
    expect(message).toMatch(/trouble/i);
  });

  it("explains a banned account in the server's words", () => {
    expect(
      describeAuthFailure(apiError(403, "This account has been suspended."), "login"),
    ).toBe("This account has been suspended.");
  });

  it("never shows the client's log line", () => {
    for (const status of [400, 401, 403, 429, 500, 503]) {
      for (const action of ["login", "register"] as const) {
        expect(describeAuthFailure(apiError(status), action)).not.toMatch(/^HTTP /);
      }
    }
  });
});

describe("describing a failed sign-up", () => {
  it("points a duplicate email at signing in", () => {
    for (const status of [400, 409]) {
      expect(describeAuthFailure(apiError(status), "register")).toMatch(
        /already has a Casparel account/,
      );
    }
  });

  it("does not call a short password a duplicate email", () => {
    // Both arrive as 400. The server now says which, so the guess must not
    // paint over it.
    expect(
      describeAuthFailure(
        apiError(400, "Password must be at least 8 characters."),
        "register",
      ),
    ).toBe("Password must be at least 8 characters.");
  });

  it("still names a duplicate email in words the screen can act on", () => {
    // The server's own "Email already in use" is terse and gives no next
    // step; this is the one case where the screen knows better.
    expect(describeAuthFailure(apiError(400, "Email already in use"), "register")).toMatch(
      /already has a Casparel account/,
    );
  });

  it("does not tell a new user their password is wrong", () => {
    // They do not have one yet; this is the register screen.
    expect(describeAuthFailure(apiError(401), "register")).not.toMatch(/password/i);
  });
});
