import { describe, expect, it } from "vitest";
import {
  canonicalDiscoveryUrl,
  discoveryCoverageInstructions,
  filterRankAndDedupeDiscovery,
  inferDiscoveryMaterialType,
  inferDiscoverySourceCategory,
  type DiscoveryCandidate,
} from "./discoverySearch";

const item = (
  overrides: Partial<DiscoveryCandidate> = {},
): DiscoveryCandidate => ({
  title: "Algebra learning resource",
  url: "https://example.org/algebra",
  description: "Worked algebra examples for students.",
  format: "article",
  source: "Example",
  ...overrides,
});

describe("discoveryCoverageInstructions", () => {
  it("always includes broad public social, document, archive, and tool lanes", () => {
    const prompt = discoveryCoverageInstructions(1);
    expect(prompt).toContain("class and lecture notes");
    expect(prompt).toContain("worksheets");
    expect(prompt).toContain("Reddit");
    expect(prompt).toContain("Instagram");
    expect(prompt).toContain("X/Twitter");
    expect(prompt).toContain("LinkedIn");
    expect(prompt).toContain("Bluesky");
    expect(prompt).toContain("Mastodon");
    expect(prompt).toContain("other publicly indexed social");
    expect(prompt).toContain("platform-specific site: searches");
    expect(prompt).toContain("site:github.com");
    expect(prompt).toContain("site:archive.org");
  });
});

describe("discovery classification", () => {
  it("classifies public social notes and worksheets without query hints", () => {
    const redditNotes = item({
      title: "My organic chemistry class notes",
      url: "https://www.reddit.com/r/chemistry/comments/abc123/my_notes/",
      source: "Reddit",
    });
    const worksheet = item({
      title: "Quadratic equations worksheet",
      url: "https://teacher.example.org/quadratics.pdf",
      format: "pdf",
    });
    const linkedInNotes = item({
      title: "Economics lecture notes",
      url: "https://www.linkedin.com/posts/teacher/economics-notes-123",
      source: "LinkedIn",
    });
    const instagramLesson = item({
      title: "Geometry lesson carousel",
      url: "https://www.instagram.com/p/example/",
      source: "Instagram",
    });
    expect(inferDiscoverySourceCategory(redditNotes)).toBe("community");
    expect(inferDiscoverySourceCategory(linkedInNotes)).toBe("community");
    expect(inferDiscoverySourceCategory(instagramLesson)).toBe("creator");
    expect(inferDiscoveryMaterialType(redditNotes)).toBe("class-notes");
    expect(inferDiscoveryMaterialType(worksheet)).toBe("worksheet");
  });
});

describe("filterRankAndDedupeDiscovery", () => {
  it("enforces material, source-category, access, caption, and transcript filters", () => {
    const matching = item({
      title: "Calculus worksheet video",
      url: "https://reddit.com/r/calculus/comments/123/worksheet",
      format: "video",
      materialType: "worksheet",
      sourceCategory: "community",
      accessType: "open",
      captionsAvailable: true,
      transcriptAvailable: true,
    });
    const wrongSource = item({
      url: "https://university.edu/calculus-worksheet",
      format: "video",
      materialType: "worksheet",
      sourceCategory: "academic",
      accessType: "open",
      captionsAvailable: true,
      transcriptAvailable: true,
    });
    expect(
      filterRankAndDedupeDiscovery([wrongSource, matching], {
        query: "calculus",
        format: "video",
        materialType: "worksheet",
        sourceCategory: "community",
        accessType: "no_account",
        captions: true,
        transcript: true,
      }),
    ).toEqual([expect.objectContaining({ url: matching.url })]);
  });

  it("canonicalizes tracking variants and keeps one copy", () => {
    const first = item({
      url: "https://www.reddit.com/r/math/comments/abc/notes/?utm_source=test",
    });
    const duplicate = item({
      url: "https://old.reddit.com/r/math/comments/abc/notes",
    });
    expect(canonicalDiscoveryUrl(first.url)).toBe(
      canonicalDiscoveryUrl(duplicate.url),
    );
    expect(
      filterRankAndDedupeDiscovery([first, duplicate], { query: "math" }),
    ).toHaveLength(1);
  });

  it("strictly excludes unknown and mismatched languages", () => {
    const english = item({ language: "en" });
    const multilingual = item({
      url: "https://example.org/multilingual-algebra",
      language: "multilingual",
    });
    const turkish = item({
      url: "https://tr.wikibooks.org/wiki/Cebir",
      language: "tr",
    });
    const unknown = item({
      url: "https://example.org/unknown-language",
      language: null,
    });

    const results = filterRankAndDedupeDiscovery(
      [turkish, unknown, multilingual, english],
      { query: "algebra", language: "en" },
    );
    expect(results).toHaveLength(2);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ language: "en" }),
        expect.objectContaining({ language: "multilingual" }),
      ]),
    );
  });
});
