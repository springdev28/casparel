import { describe, expect, it } from "vitest";
import {
  discoveryCoverageInstructions,
  filterDiscoveryLanguage,
} from "./discoveryCoverage";

describe("discoveryCoverageInstructions", () => {
  it("covers documents, archives, tools and public social platforms without a closed list", () => {
    const prompt = discoveryCoverageInstructions(1);
    expect(prompt).toContain("class and lecture notes");
    expect(prompt).toContain("worksheets");
    expect(prompt).toContain("Reddit");
    expect(prompt).toContain("Instagram");
    expect(prompt).toContain("X/Twitter");
    expect(prompt).toContain("LinkedIn");
    expect(prompt).toContain("Bluesky");
    expect(prompt).toContain("Mastodon");
    expect(prompt).toContain("any other publicly indexed social");
    expect(prompt).toContain("platform-specific site: searches");
    expect(prompt).toContain("site:github.com");
    expect(prompt).toContain("site:archive.org");
  });
});

describe("filterDiscoveryLanguage", () => {
  it("keeps only the selected or multilingual content", () => {
    const items = [
      { title: "English", language: "en" },
      { title: "Turkish", language: "tr" },
      { title: "Unknown", language: null },
      { title: "Both", language: "multilingual" },
    ];
    expect(filterDiscoveryLanguage(items, "en")).toEqual([
      items[0],
      items[3],
    ]);
  });
});
