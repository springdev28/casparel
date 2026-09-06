import { describe, expect, it } from "vitest";
import { brandHomePath } from "./brand-navigation";

describe("brandHomePath", () => {
  it("opens the website home page from a normal browser", () => {
    expect(brandHomePath(false)).toBe("/");
  });

  it("keeps the installed app inside its dashboard", () => {
    expect(brandHomePath(true)).toBe("/dashboard");
  });
});
