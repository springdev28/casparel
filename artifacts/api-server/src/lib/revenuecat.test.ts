import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSubscriberPlan, planFromSubscriber } from "./revenuecat";

const now = Date.parse("2026-09-06T00:00:00Z");
const future = "2026-10-06T00:00:00Z";
const past = "2026-08-06T00:00:00Z";
const payload = (entitlements: unknown) => ({ subscriber: { entitlements } });
afterEach(() => vi.unstubAllGlobals());

describe("authoritative purchase verification", () => {
  it("selects the strongest active plan with its own expiry", () => {
    expect(
      planFromSubscriber(
        payload({
          plus: { expires_date: "2027-01-01T00:00:00Z" },
          pro: { expires_date: future },
        }),
        now,
      ),
    ).toEqual({ plan: "pro", planExpiresAt: "2026-10-06T00:00:00.000Z" });
  });
  it("retains grace-period and lifetime access but excludes expired entitlements", () => {
    expect(
      planFromSubscriber(
        payload({ pro: { expires_date: past }, plus: { expires_date: null } }),
        now,
      ),
    ).toEqual({ plan: "plus", planExpiresAt: null });
    expect(
      planFromSubscriber(
        payload({
          pro: { expires_date: past, grace_period_expires_date: future },
        }),
        now,
      ).plan,
    ).toBe("pro");
    expect(
      planFromSubscriber(payload({ pro: { expires_date: past } }), now).plan,
    ).toBe("free");
  });
  it("never grants a school licence or guesses access from unknown products", () => {
    expect(
      planFromSubscriber(
        payload({
          institutional: { expires_date: null },
          unknown: { expires_date: null },
        }),
        now,
      ).plan,
    ).toBe("free");
  });
  it("rejects malformed responses instead of silently granting lifetime access or revoking a plan", () => {
    for (const body of [
      {},
      payload(null),
      payload({ pro: {} }),
      payload({ pro: { expires_date: "bad" } }),
    ]) {
      expect(() => planFromSubscriber(body, now)).toThrow();
    }
  });
  it("requests only the specified account with server authorization and rejects outages", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetch);
    await expect(fetchSubscriberPlan(42, "server-key")).rejects.toThrow("503");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.revenuecat.com/v1/subscribers/42",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer server-key",
          Accept: "application/json",
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
