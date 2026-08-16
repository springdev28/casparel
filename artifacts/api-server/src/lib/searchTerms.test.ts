import { describe, expect, it } from "vitest";
import { meaningfulSearchTerms, wordStartPattern } from "./searchTerms";

describe("meaningfulSearchTerms", () => {
  it("turns a goal title into flexible library terms", () => {
    expect(meaningfulSearchTerms("Master Full-Stack Development")).toEqual([
      "Full",
      "Stack",
      "Development",
    ]);
  });

  it("deduplicates terms and ignores generic goal verbs", () => {
    expect(meaningfulSearchTerms("Learn algebra and master algebra")).toEqual([
      "algebra",
    ]);
  });
});

describe("wordStartPattern", () => {
  it("anchors the term to the start of a word", () => {
    // Postgres `\m`. Without it the pattern is a bare substring, and the two
    // letters of "AP" match "roadmAP" — which is how an AP Physics search
    // returned a full-stack web development roadmap.
    expect(wordStartPattern("AP")).toBe("\\mAP");
  });

  it("escapes punctuation so a query cannot be a broken regex", () => {
    // meaningfulSearchTerms falls back to the raw query when nothing survives
    // tokenising, so "C++" reaches this unsplit. Unescaped it is not a valid
    // regular expression and Postgres rejects the whole query.
    expect(wordStartPattern("C++")).toBe("\\mC\\+\\+");
    expect(wordStartPattern("A(B)")).toBe("\\mA\\(B\\)");
  });
});
