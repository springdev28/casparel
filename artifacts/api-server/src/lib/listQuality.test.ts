/**
 * @fileOverview Verification role: exercises List Quality.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * What the list review says, and — more importantly — what it declines to say.
 *
 * This is advice on the screen where somebody decides what to study, so a
 * finding that is merely plausible is worse than no finding at all: it sends a
 * learner to remove something they meant to keep. Every rule here is arithmetic
 * over rows the app already holds, and the thresholds are the interesting part,
 * so they are pinned from both sides — the case that must be reported and the
 * neighbouring case that must not.
 */
import { describe, expect, it } from "vitest";
import { reviewList, type ListQualityItem } from "./listQuality";

function item(partial: Partial<ListQualityItem> & { resourceId: number }): ListQualityItem {
  return {
    title: `Resource ${partial.resourceId}`,
    url: `https://example.org/${partial.resourceId}`,
    format: "article",
    gradeLevel: "Year 12",
    ...partial,
  };
}

const kinds = (items: ListQualityItem[]) =>
  reviewList(items).findings.map((finding) => finding.kind);

describe("reviewList", () => {
  it("says nothing about a list too short to judge", () => {
    expect(
      kinds([
        item({ resourceId: 1, url: "https://en.wikipedia.org/a" }),
        item({ resourceId: 2, url: "https://en.wikipedia.org/b" }),
      ]),
    ).toEqual([]);
  });

  it("reports a list almost all from one site", () => {
    const findings = reviewList([
      item({ resourceId: 1, url: "https://en.wikipedia.org/a" }),
      item({ resourceId: 2, url: "https://de.wikipedia.org/b" }),
      item({ resourceId: 3, url: "https://en.wikipedia.org/c" }),
      item({ resourceId: 4, url: "https://khanacademy.org/d", format: "video" }),
    ]).findings;
    expect(findings).toContainEqual({
      kind: "one_provider",
      provider: "wikipedia.org",
      count: 3,
    });
  });

  it("leaves a mixed list alone", () => {
    expect(
      kinds([
        item({ resourceId: 1, url: "https://en.wikipedia.org/a" }),
        item({ resourceId: 2, url: "https://khanacademy.org/b", format: "video" }),
        item({ resourceId: 3, url: "https://openstax.org/c", format: "pdf" }),
      ]),
    ).toEqual([]);
  });

  it("reports a list that is entirely one format, and only when it is", () => {
    const same = reviewList([
      item({ resourceId: 1, url: "https://a.org/1" }),
      item({ resourceId: 2, url: "https://b.org/2" }),
      item({ resourceId: 3, url: "https://c.org/3" }),
    ]).findings;
    expect(same).toContainEqual({ kind: "one_format", format: "article", count: 3 });

    const mixed = kinds([
      item({ resourceId: 1, url: "https://a.org/1" }),
      item({ resourceId: 2, url: "https://b.org/2" }),
      item({ resourceId: 3, url: "https://c.org/3", format: "video" }),
    ]);
    expect(mixed).not.toContain("one_format");
  });

  it("reports the same link written two ways, however the rows are titled", () => {
    const findings = reviewList([
      item({ resourceId: 1, url: "https://example.org/notes" }),
      item({
        resourceId: 2,
        title: "A different name for it",
        url: "https://WWW.Example.org/notes/?utm_source=class#section",
      }),
      item({ resourceId: 3, url: "https://elsewhere.org/other" }),
    ]).findings;
    expect(findings).toContainEqual({ kind: "duplicate_link", resourceIds: [1, 2] });
  });

  it("does not call two different pages on one site a duplicate", () => {
    expect(
      kinds([
        item({ resourceId: 1, url: "https://example.org/one" }),
        item({ resourceId: 2, url: "https://example.org/two" }),
        item({ resourceId: 3, url: "https://example.org/three" }),
      ]).filter((kind) => kind === "duplicate_link"),
    ).toEqual([]);
  });

  it("names the item aimed at another level, when the rest agree", () => {
    const findings = reviewList([
      item({ resourceId: 1, url: "https://a.org/1" }),
      item({ resourceId: 2, url: "https://b.org/2" }),
      item({ resourceId: 3, url: "https://c.org/3", gradeLevel: "Undergraduate" }),
    ]).findings;
    expect(findings).toContainEqual({
      kind: "level_mismatch",
      resourceIds: [3],
      level: "Undergraduate",
      majority: "Year 12",
    });
  });

  it("says nothing when a list is evenly split between two levels", () => {
    // A list built across a transition is a choice, not a mistake.
    expect(
      kinds([
        item({ resourceId: 1, url: "https://a.org/1" }),
        item({ resourceId: 2, url: "https://b.org/2", gradeLevel: "Undergraduate" }),
        item({ resourceId: 3, url: "https://c.org/3", format: "video" }),
        item({ resourceId: 4, url: "https://d.org/4", gradeLevel: "Undergraduate", format: "pdf" }),
      ]).filter((kind) => kind === "level_mismatch"),
    ).toEqual([]);
  });

  it("always says which checks it made, so a screen can name them", () => {
    const review = reviewList([]);
    expect(review.itemCount).toBe(0);
    expect(review.findings).toEqual([]);
    expect(review.checked).toEqual([
      "one_provider",
      "one_format",
      "duplicate_link",
      "level_mismatch",
    ]);
  });
});
