/**
 * @fileOverview Verification role: exercises Limiter Keys.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * A rate limiter keyed on an address must key on the allocation, not the
 * address.
 *
 * The custom key generators here read `req.ip` straight. For IPv4 that is a
 * caller; for IPv6 it is one of the billions of addresses a single subscriber
 * is routinely handed, so a client that walks its own prefix gets a fresh
 * empty bucket whenever it wants one. The limiters stay on, report no error,
 * and stop limiting -- and only for callers with IPv6, which is the half of
 * the internet least likely to be the one testing this.
 *
 * express-rate-limit does say so: it prints an ERR_ERL_KEY_GEN_IPV6 validation
 * warning at startup for every limiter whose key generator looks like it
 * forgot. All three of ours printed one, into a log nobody reads at boot.
 *
 * So it is asserted here instead. Both halves matter: that every key site
 * normalises, and that none interpolates a bare `req.ip` again.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ipKeyGenerator } from "express-rate-limit";

const limiters = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "limiters.ts"),
  "utf8",
);

describe("rate limiter keys", () => {
  it("reads the file it is about", () => {
    expect(limiters).toContain("export const globalLimiter");
  });

  it("never keys on a bare request address", () => {
    const offences = limiters
      .split("\n")
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      // A line that interpolates an address is fine when it is the same line
      // that normalises it.
      .filter(
        ({ line }) =>
          /`[^`]*\$\{[^}]*\bip\b/.test(line) && !line.includes("ipKeyGenerator"),
      )
      .map(({ line, number }) => `limiters.ts:${number} ${line}`);
    expect(
      offences,
      "an address goes through addressKey, which collapses IPv6 to its allocation",
    ).toEqual([]);
  });

  it("normalises the address at every key site", () => {
    // Both fallbacks: the per-account key for anonymous callers, and the
    // per-email credential key for a request that sent no email. Counted
    // rather than merely present, so adding a third site without the helper
    // is caught -- the library's own check would not catch it either, since
    // it only looks at whether the text appears somewhere in the function.
    expect(
      limiters.match(/ipKeyGenerator\(req\.ip\)/g)?.length ?? 0,
      "every key generator that falls back to an address must normalise it",
    ).toBe(2);
  });

  it("collapses two addresses in one allocation to one key", () => {
    // The property the whole fix depends on, checked against the real helper
    // rather than assumed from its name.
    expect(ipKeyGenerator("2001:db8:abcd:1234::1")).toBe(
      ipKeyGenerator("2001:db8:abcd:1234::dead:beef"),
    );
    expect(ipKeyGenerator("2001:db8:abcd:1234::1")).not.toBe(
      ipKeyGenerator("2001:db8:ffff:1234::1"),
    );
    // and leaves IPv4 alone, which is already one address per caller.
    expect(ipKeyGenerator("203.0.113.9")).toBe("203.0.113.9");
  });
});
