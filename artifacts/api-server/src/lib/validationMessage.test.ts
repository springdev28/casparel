/**
 * A bad request is answered with a sentence.
 *
 * Sixty-five routes replied with `parsed.error.message`, which is
 * `JSON.stringify(issues)` -- registration answered a short password with two
 * hundred characters of escaped JSON. Both clients treat an unreadable server
 * string as no string, so every reader got a generic fallback while the server
 * knew exactly which field was wrong.
 *
 * These use real Zod output rather than hand-written issue objects, so a Zod
 * upgrade that changes the shape fails here instead of quietly turning every
 * message back into "The request is not valid."
 */
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { validationMessage } from "./validationMessage";

/** The error a route actually holds when safeParse fails. */
function failureOf(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  expect(result.success, "this input was supposed to fail").toBe(false);
  return result.success ? null : result.error;
}

describe("describing a validation failure", () => {
  it("says a password is too short, with the length", () => {
    const schema = z.object({ password: z.string().min(8) });
    expect(validationMessage(failureOf(schema, { password: "x" }))).toBe(
      "Password must be at least 8 characters.",
    );
  });

  it("calls an empty required field required, not too small", () => {
    const schema = z.object({ name: z.string().min(1) });
    expect(validationMessage(failureOf(schema, { name: "" }))).toBe(
      "Name is required.",
    );
  });

  it("calls a missing field required", () => {
    const schema = z.object({ title: z.string() });
    expect(validationMessage(failureOf(schema, {}))).toBe("Title is required.");
  });

  it("names an email as an email", () => {
    const schema = z.object({ email: z.email() });
    expect(validationMessage(failureOf(schema, { email: "nope" }))).toBe(
      "Enter a valid email address.",
    );
  });

  it("humanises a camelCase field", () => {
    const schema = z.object({ gradeLevel: z.string().min(1) });
    expect(validationMessage(failureOf(schema, { gradeLevel: "" }))).toBe(
      "Grade level is required.",
    );
  });

  it("reports a maximum in the same terms", () => {
    const schema = z.object({ title: z.string().max(5) });
    expect(validationMessage(failureOf(schema, { title: "far too long" }))).toBe(
      "Title must be 5 characters or fewer.",
    );
  });

  it("describes the first few problems and counts the rest", () => {
    const schema = z.object({
      a: z.string().min(1),
      b: z.string().min(1),
      c: z.string().min(1),
      d: z.string().min(1),
    });
    const message = validationMessage(
      failureOf(schema, { a: "", b: "", c: "", d: "" }),
    );
    expect(message).toContain("A is required.");
    expect(message).toContain("C is required.");
    expect(message).toContain("(1 more.)");
  });

  it("never returns JSON, whatever the schema", () => {
    const schema = z.object({
      email: z.email(),
      password: z.string().min(8),
      name: z.string().min(1),
    });
    const message = validationMessage(
      failureOf(schema, { email: "nope", password: "x", name: "" }),
    );
    expect(message).not.toContain("{");
    expect(message).not.toContain("[");
    expect(message).not.toContain("\n");
    expect(message.length).toBeLessThan(200);
  });

  it("falls back rather than inventing detail it does not have", () => {
    expect(validationMessage(null)).toBe("The request is not valid.");
    expect(validationMessage(new Error("boom"))).toBe("The request is not valid.");
    expect(validationMessage({ issues: [] }, "Invalid class")).toBe("Invalid class");
  });

  it("keeps a caller's own fallback for an id it parses itself", () => {
    // Several routes pass a specific fallback: "Invalid canvas ID" reads
    // better than anything derivable from a coerced-number failure.
    const schema = z.object({ id: z.coerce.number().int().positive() });
    const message = validationMessage(failureOf(schema, { id: "abc" }), "Invalid canvas ID");
    expect(message).not.toContain("[");
    expect(message.length).toBeLessThan(120);
  });
});
