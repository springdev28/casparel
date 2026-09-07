import { describe, expect, it } from "vitest";
import { brandHomePath } from "./brand-navigation";

describe("brandHomePath", () => {
  it("opens the website home page from a normal browser", () => {
    expect(brandHomePath(false)).toBe("/");
  });

  it("addresses home so the installed app can open its native home screen", () => {
    expect(brandHomePath(true)).toBe("/");
  });
});
