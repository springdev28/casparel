/**
 * @fileOverview Verification role: exercises Search Terms.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import {
  broadenedQueries,
  meaningfulSearchTerms,
  topicalSearchTerms,
  wordStartPattern,
} from "./searchTerms";

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
    expect(wordStartPattern("physic")).toBe("\\mphysic");
  });

  it("requires a short term to be the whole word", () => {
    // A word-start match alone was not enough for two letters: "AP" still
    // opened "Apps" and "APIs", so an AP Physics search returned GeoGebra Math
    // Apps and a React course. `\M` closes the word.
    expect(wordStartPattern("AP")).toBe("\\mAP\\M");
    expect(wordStartPattern("ML")).toBe("\\mML\\M");
    // Three letters is enough to mean something as a prefix: "bio" should
    // still find "biology".
    expect(wordStartPattern("bio")).toBe("\\mbio");
  });

  it("escapes punctuation so a query cannot be a broken regex", () => {
    // meaningfulSearchTerms falls back to the raw query when nothing survives
    // tokenising, so "C++" reaches this unsplit. Unescaped it is not a valid
    // regular expression and Postgres rejects the whole query.
    expect(wordStartPattern("C++")).toBe("\\mC\\+\\+");
    expect(wordStartPattern("A(B)")).toBe("\\mA\\(B\\)");
  });
});

describe("broadenedQueries", () => {
  it("widens a course name to its topics, then to each one", () => {
    // Providers were only ever asked for the exact phrase, so after someone
    // searched this the catalog held fourteen works and a later search for
    // plain "physics mechanics" found the same fourteen and nothing more.
    expect(broadenedQueries("AP Physics C: Electricity and Mechanics")).toEqual([
      "Physics Electricity Mechanics",
      "Physics",
      "Electricity",
    ]);
  });

  it("never repeats the query it is widening", () => {
    // Asking a provider the same thing again is a wasted request.
    expect(broadenedQueries("photosynthesis")).toEqual([]);
    expect(broadenedQueries("linear algebra")).toEqual(["linear", "algebra"]);
  });

  it("has nothing to widen when no word carries a topic", () => {
    expect(broadenedQueries("AP")).toEqual([]);
    expect(broadenedQueries("")).toEqual([]);
  });

  it("stays within the limit it is given", () => {
    expect(
      broadenedQueries("photosynthesis chlorophyll chloroplast stroma", 2),
    ).toHaveLength(2);
  });

  it("never asks a provider for a packaging word on its own", () => {
    // This is where the t-shirt videos came from. The ladder took a physics
    // query that had run dry and asked YouTube for plain "tutorial", which is
    // a question about heat presses, screen printing and Illustrator, and the
    // answers were stored in the catalog as though they were physics.
    const widened = broadenedQueries("kinematics projectile motion tutorial");
    expect(widened).not.toContain("tutorial");
    expect(widened[0]).toBe("kinematics projectile motion");
  });

  it("has nothing to widen when the query is all packaging", () => {
    expect(broadenedQueries("practice problems worksheet")).toEqual([]);
  });
});

describe("topicalSearchTerms", () => {
  it("keeps the words that name a subject", () => {
    expect(
      topicalSearchTerms(["kinematics", "projectile", "motion", "tutorial"]),
    ).toEqual(["kinematics", "projectile", "motion"]);
  });

  it("drops abbreviations, which are too short to be a topic", () => {
    expect(topicalSearchTerms(["AP", "Physics"])).toEqual(["Physics"]);
  });

  it("is empty when nothing in the query names a subject", () => {
    // Not a failure: "past papers" is a real search, and the caller falls back
    // to judging it on the whole query rather than matching nothing.
    expect(topicalSearchTerms(["practice", "problems"])).toEqual([]);
  });

  it("matches packaging words whatever their case", () => {
    expect(topicalSearchTerms(["Calculus", "PDF", "Notes"])).toEqual([
      "Calculus",
    ]);
  });
});
