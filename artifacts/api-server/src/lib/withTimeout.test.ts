/**
 * @fileOverview Verification role: exercises With Timeout.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it, vi } from "vitest";
import { withTimeout } from "./withTimeout";

describe("withTimeout", () => {
  it("passes a resolved value straight through", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1_000, "work")).resolves.toBe(
      "ok",
    );
  });

  it("propagates a rejection rather than masking it as a timeout", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 1_000, "work"),
    ).rejects.toThrow("boom");
  });

  it("rejects when the work never settles", async () => {
    // The regression this guards: startup awaited a promise that could hang
    // forever (a blocking advisory lock), so app.listen was never reached and
    // the host served 503 indefinitely. A hang must become a catchable error.
    vi.useFakeTimers();
    try {
      const never = new Promise<string>(() => {});
      const raced = withTimeout(never, 30_000, "Database setup");
      const assertion = expect(raced).rejects.toThrow(
        "Database setup did not finish within 30000ms",
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears its timer so a fast success cannot hold the process open", async () => {
    vi.useFakeTimers();
    try {
      await withTimeout(Promise.resolve(1), 60_000, "work");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
