/**
 * @fileOverview Verification role: exercises Contract Dates.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * What the two repairs at the response boundary must and must not touch.
 *
 * Both exist because the value between a correct route and a correct schema
 * was wrong, and both have a blast radius worth pinning down: one runs on
 * every string in every response this server sends.
 *
 * The Hermes numbers quoted in contractDates.ts were measured against the real
 * engine (hermes-engine-cli 0.12, the same parser the Expo app ships):
 *
 *   new Date("2026-08-28 15:46:13.702493+00")  ->  Invalid Date
 *   new Date("2026-08-28T15:46:13.702Z")       ->  2026-08-28T15:46:13.702Z
 *
 * That cannot run here -- this suite is Node, and Node's V8 parses both -- so
 * what is checked here is the half that keeps it fixed: that the server sends
 * the second shape and never the first.
 */
import { describe, expect, it } from "vitest";
import { dateOnly, isoTimestamps } from "./contractDates";

describe("dateOnly", () => {
  it("turns the Date a response schema coerced back into the day it was", () => {
    expect(dateOnly(new Date("2026-12-01T00:00:00.000Z"))).toBe("2026-12-01");
  });

  it("leaves a date that is already a plain date alone", () => {
    expect(dateOnly("2026-12-01")).toBe("2026-12-01");
  });

  it("passes null and undefined through as themselves", () => {
    expect(dateOnly(null)).toBeNull();
    expect(dateOnly(undefined)).toBeUndefined();
  });
});

describe("isoTimestamps", () => {
  it("rewrites what Postgres wrote into what every engine can parse", () => {
    expect(isoTimestamps("createdAt", "2026-08-28 15:46:13.702493+00")).toBe(
      "2026-08-28T15:46:13.702Z",
    );
    expect(isoTimestamps("startsAt", "2026-09-01 09:00:00+00")).toBe(
      "2026-09-01T09:00:00.000Z",
    );
  });

  it("reads an offset-less timestamp as UTC, which is how they are written", () => {
    expect(isoTimestamps("readAt", "2026-09-01 09:00:00")).toBe(
      "2026-09-01T09:00:00.000Z",
    );
  });

  it("leaves an ISO string exactly as it is", () => {
    expect(isoTimestamps("createdAt", "2026-08-28T15:46:13.702Z")).toBe(
      "2026-08-28T15:46:13.702Z",
    );
  });

  /*
   * The half that matters more than the rewrite. This runs against every
   * string in every response, so what it declines to touch is the promise.
   */
  it("leaves a calendar date alone, because a date is not a moment", () => {
    expect(isoTimestamps("targetDate", "2026-12-01")).toBe("2026-12-01");
    expect(isoTimestamps("date", "2026-09-01")).toBe("2026-09-01");
  });

  it("leaves a clock time alone, though the key ends the same way", () => {
    expect(isoTimestamps("startTime", "09:00")).toBe("09:00");
    expect(isoTimestamps("endTime", "10:00")).toBe("10:00");
  });

  it("leaves a learner's own words alone, whatever is in them", () => {
    const note = "Revise before 2026-08-28 15:46:13+00, then check the answers";
    expect(isoTimestamps("body", note)).toBe(note);
    expect(isoTimestamps("title", "2026-08-28 15:46:13+00")).toBe(
      "2026-08-28 15:46:13+00",
    );
  });

  it("leaves anything that is not a string alone", () => {
    expect(isoTimestamps("createdAt", null)).toBeNull();
    expect(isoTimestamps("count", 3)).toBe(3);
    expect(isoTimestamps("items", ["2026-08-28 15:46:13+00"])).toEqual([
      "2026-08-28 15:46:13+00",
    ]);
  });

  it("hands back anything shaped like a timestamp but impossible", () => {
    // A month of 99 parses to NaN; sending the original beats sending "null".
    expect(isoTimestamps("createdAt", "2026-99-99 15:46:13+00")).toBe(
      "2026-99-99 15:46:13+00",
    );
  });
});
