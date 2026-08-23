/**
 * @fileOverview Verification role: exercises Public List Link.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import { publicListPath, publicListUrl } from "./public-list-link";

describe("public list links", () => {
  const token = "4e2ea10a-b2f4-4fe3-81a1-e3751aec46a8";

  it("builds root and sub-path deployment links", () => {
    expect(publicListPath(token)).toBe(`/lists/shared/${token}`);
    expect(publicListUrl("https://beta.example", "/", token)).toBe(
      `https://beta.example/lists/shared/${token}`,
    );
    expect(publicListUrl("https://beta.example", "/school/", token)).toBe(
      `https://beta.example/school/lists/shared/${token}`,
    );
  });

  it.each(["", "short", "token/with/slash", "token with spaces"])(
    "rejects an invalid share token: %s",
    (value) => expect(publicListPath(value)).toBeNull(),
  );
});
