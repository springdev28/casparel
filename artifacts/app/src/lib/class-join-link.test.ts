/**
 * @fileOverview Verification role: exercises Class Join Link.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import {
  classJoinPath,
  classJoinUrl,
  normalizeClassJoinCode,
} from "./class-join-link";

describe("class join links", () => {
  it("normalizes a valid join code", () => {
    expect(normalizeClassJoinCode(" a1b2c3d4 ")).toBe("A1B2C3D4");
    expect(classJoinPath("a1b2c3d4")).toBe("/classes?join=A1B2C3D4");
  });

  it.each(["", "ABC", "A1B2-C3D4", "G1B2C3D4", "A1B2C3D45"])(
    "rejects an invalid join code: %s",
    (code) => {
      expect(normalizeClassJoinCode(code)).toBeNull();
      expect(classJoinPath(code)).toBeNull();
    },
  );

  it("builds root and sub-path deployment URLs", () => {
    expect(classJoinUrl("https://beta.casparel.test", "/", "A1B2C3D4")).toBe(
      "https://beta.casparel.test/classes?join=A1B2C3D4",
    );
    expect(
      classJoinUrl(
        "https://beta.casparel.test",
        "/school/",
        "A1B2C3D4",
      ),
    ).toBe("https://beta.casparel.test/school/classes?join=A1B2C3D4");
  });
});
