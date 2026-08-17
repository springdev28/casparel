import { describe, expect, it } from "vitest";
import { canonicalResultUrl, dedupeResults, isSameWork } from "./resultDedupe";

const work = (title: string, url: string, description = "A real description of the work.") => ({
  title,
  url,
  description,
  thumbnailUrl: null as string | null,
});

describe("canonicalResultUrl", () => {
  it("treats the same link written differently as one link", () => {
    expect(canonicalResultUrl("https://WWW.Example.org/Book/")).toBe(
      canonicalResultUrl("https://example.org/Book"),
    );
    expect(canonicalResultUrl("https://example.org/a?utm_source=x#top")).toBe(
      "https://example.org/a",
    );
  });

  it("does not throw on something that is not a URL", () => {
    expect(canonicalResultUrl("not a url")).toBe("not a url");
  });
});

describe("isSameWork", () => {
  it("matches on the link whatever the titles say", () => {
    expect(
      isSameWork(
        work("Calculus", "https://en.wikibooks.org/wiki/Calculus"),
        work("Calculus (book)", "https://en.wikibooks.org/wiki/Calculus/"),
      ),
    ).toBe(true);
  });

  it("matches the same title reached by two links on one site", () => {
    expect(
      isSameWork(
        work("Classical Mechanics", "https://en.wikibooks.org/wiki/Classical_Mechanics"),
        work(
          "Classical Mechanics",
          "https://en.wikibooks.org/wiki/Classical_Mechanics?action=raw",
        ),
      ),
    ).toBe(true);
  });

  it("does not treat a longer title that contains a shorter one as the same", () => {
    // Similarity is measured against the longer title. Against the shorter,
    // every subset scores a perfect match, and one broad article swallowed
    // every specific one on the same site.
    for (const [a, b] of [
      ["Linear algebra", "Numerical linear algebra"],
      ["Linear algebra", "Kernel (linear algebra)"],
      ["AP Physics", "AP Physics 1"],
    ]) {
      expect(
        isSameWork(
          work(a, `https://en.wikipedia.org/wiki/${a.replace(/ /g, "_")}`),
          work(b, `https://en.wikipedia.org/wiki/${b.replace(/ /g, "_")}`),
        ),
      ).toBe(false);
    }
  });

  it("keeps the same title from two different sites apart", () => {
    // The Wikipedia article about the exam and the Wikiversity course are two
    // different things that happen to share a name.
    expect(
      isSameWork(
        work("AP Physics", "https://en.wikipedia.org/wiki/AP_Physics"),
        work("AP Physics", "https://en.wikiversity.org/wiki/AP_Physics"),
      ),
    ).toBe(false);
  });

  it("keeps genuinely different works on one site apart", () => {
    expect(
      isSameWork(
        work("General Astronomy", "https://en.wikibooks.org/wiki/General_Astronomy"),
        work("Nanotechnology", "https://en.wikibooks.org/wiki/Nanotechnology"),
      ),
    ).toBe(false);
  });

  it("keeps courses apart when only the number tells them apart", () => {
    // The single character is the whole distinction. Treating it as noise
    // makes these the same three words, and one of two real courses vanishes.
    expect(
      isSameWork(
        work("AP Physics 1", "https://en.wikipedia.org/wiki/AP_Physics_1"),
        work("AP Physics B", "https://en.wikipedia.org/wiki/AP_Physics_B"),
      ),
    ).toBe(false);
    expect(
      isSameWork(
        work(
          "AP Physics C: Mechanics",
          "https://en.wikipedia.org/wiki/AP_Physics_C:_Mechanics",
        ),
        work(
          "AP Physics C: Electricity and Magnetism",
          "https://en.wikipedia.org/wiki/AP_Physics_C:_Electricity_and_Magnetism",
        ),
      ),
    ).toBe(false);
  });
});

describe("dedupeResults", () => {
  it("returns one card per work, in the order given", () => {
    const results = dedupeResults([
      work("Calculus", "https://en.wikibooks.org/wiki/Calculus"),
      work("Physics", "https://en.wikibooks.org/wiki/Physics"),
      work("Calculus", "https://en.wikibooks.org/wiki/Calculus/"),
    ]);
    expect(results.map((r) => r.title)).toEqual(["Calculus", "Physics"]);
  });

  it("keeps the fuller of two duplicates", () => {
    // The importer's placeholder means it found nothing to say, so a real
    // description wins even though it arrived second.
    const placeholder = work(
      "Calculus",
      "https://en.wikibooks.org/wiki/Calculus",
      "An open educational work from en.wikibooks.org.",
    );
    const described = work(
      "Calculus",
      "https://en.wikibooks.org/wiki/Calculus/",
      "A complete calculus course covering limits, derivatives and integrals.",
    );
    expect(dedupeResults([placeholder, described])[0].description).toBe(
      described.description,
    );
    // And the other way round: order must not decide it.
    expect(dedupeResults([described, placeholder])[0].description).toBe(
      described.description,
    );
  });

  it("leaves a list with nothing to collapse untouched", () => {
    const items = [
      work("A", "https://a.example.org/1"),
      work("B", "https://b.example.org/2"),
    ];
    expect(dedupeResults(items)).toHaveLength(2);
  });
});
