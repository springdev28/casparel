/**
 * The AI provider's health, as observed from the calls the product makes.
 *
 * Deep research broke in production and the only signal anybody had was a
 * screenshot from a user. /healthz reported the database schema and nothing
 * else, so a wrong key, an expired one, or an unreachable base URL looked
 * exactly like a healthy server.
 *
 * Unlike most of the guards here this tests behaviour rather than source text,
 * because there is behaviour to test: what it reports before anything has
 * happened, what it does with a stale observation, and that it never lets a
 * secret out through a field that is served over HTTP.
 */
import { afterEach, describe, expect, it } from "vitest";
import { aiHealth, resetAiHealth, throughAi } from "./aiHealth";

afterEach(() => resetAiHealth());

describe("AI health", () => {
  it("knows nothing before any call, and says so", () => {
    // "ok" here would be a guess presented as a fact: a server that has served
    // no AI request has no evidence either way.
    expect(aiHealth()).toEqual({
      state: "unknown",
      reason: "never-attempted",
      checkedAt: null,
    });
  });

  it("reports ok after a call succeeds", async () => {
    await expect(throughAi("discovery", async () => "result")).resolves.toBe(
      "result",
    );
    const health = aiHealth();
    expect(health.state).toBe("ok");
    expect(health.lastOperation).toBe("discovery");
    expect(health.error).toBeUndefined();
    expect(Date.parse(health.checkedAt ?? "")).not.toBeNaN();
  });

  it("reports the failure, and which call it was", async () => {
    const failure = Object.assign(new Error("Connection error."), { status: 502 });
    await expect(
      throughAi("deep source review", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure); // rethrown unchanged: callers own their own errors

    const health = aiHealth();
    expect(health.state).toBe("failing");
    expect(health.lastOperation).toBe("deep source review");
    expect(health.error).toBe("502: Connection error.");
  });

  it("forgets an observation once it is too old to describe now", async () => {
    await throughAi("discovery", async () => "result");
    const health = aiHealth(Date.now() + 16 * 60 * 1000);
    expect(health.state).toBe("unknown");
    /*
     * "Nothing recent" and "nothing ever" are different answers, and this used
     * to say which only through `checkedAt` being non-null -- a two-step
     * inference at the moment somebody is trying to find out whether the
     * headline feature is broken. Production actually reported the other case,
     * and reading it took exactly that inference.
     */
    expect(health.reason).toBe("last-result-expired");
    expect(health.checkedAt).not.toBeNull();
    // And what it was when anybody last knew: a provider that was failing an
    // hour ago is a different starting point from one that was fine.
    expect(health.lastState).toBe("ok");
    expect(health.lastOperation).toBe("discovery");
  });

  it("never lets a key out through the error field", async () => {
    await expect(
      throughAi("discovery", async () => {
        throw new Error(
          "401 Incorrect API key provided: sk-proj-AAAABBBBCCCCDDDDEEEE. Check your key.",
        );
      }),
    ).rejects.toThrow();
    const { error } = aiHealth();
    expect(error).toContain("[redacted]");
    expect(error).not.toContain("sk-proj-AAAABBBBCCCCDDDDEEEE");
  });

  it("keeps a long provider message readable", async () => {
    await expect(
      throughAi("discovery", async () => {
        throw new Error("x".repeat(1000));
      }),
    ).rejects.toThrow();
    expect((aiHealth().error ?? "").length).toBeLessThanOrEqual(200);
  });
});
