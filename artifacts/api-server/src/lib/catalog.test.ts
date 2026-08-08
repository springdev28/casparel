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

  it("collapses OpenStax chapters to the complete book", () => {
    expect(
      canonicalCatalogUrl(
        "https://openstax.org/books/calculus-volume-1/pages/1-2-domain-and-range",
      ),
    ).toBe("https://openstax.org/details/books/calculus-volume-1");
  });

  it("collapses course sections and Wikibooks chapters to whole works", () => {
    expect(
      canonicalCatalogUrl(
        "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/pages/syllabus/",
      ),
    ).toBe("https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010");
    expect(
      canonicalCatalogUrl(
        "https://en.wikibooks.org/wiki/Linear_Algebra/Vectors#Basis",
      ),
    ).toBe("https://en.wikibooks.org/wiki/Linear_Algebra");
  });
});
