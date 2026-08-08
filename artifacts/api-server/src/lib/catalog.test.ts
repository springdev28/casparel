import { describe, expect, it } from "vitest";
import { canonicalCatalogUrl } from "./catalog";

describe("canonicalCatalogUrl", () => {
  it("removes tracking data while preserving meaningful parameters", () => {
    expect(
      canonicalCatalogUrl(
        "https://www.example.org/course/?unit=2&utm_source=test#lesson",
      ),
    ).toBe("https://example.org/course?unit=2");
  });
});
