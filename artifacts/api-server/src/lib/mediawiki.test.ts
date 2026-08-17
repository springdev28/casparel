import { describe, expect, it } from "vitest";
import {
  isWorkTitle,
  subjectFromCategories,
  wikiSearchQuery,
  workTitle,
} from "./mediawiki";

describe("workTitle", () => {
  it("rolls a chapter up to the book it belongs to", () => {
    // A search for physics returns "FHSST Physics/Electrostatics/Charge", not
    // the book. Storing the chapter is what filled a page with pieces of one
    // title.
    expect(workTitle("FHSST Physics/Electrostatics/Charge", true)).toBe(
      "FHSST Physics",
    );
    expect(workTitle("Acoustics/Print version", true)).toBe("Acoustics");
    expect(
      workTitle(
        "History of wireless telegraphy/Topical/Biographies/Notes",
        true,
      ),
    ).toBe("History of wireless telegraphy");
  });

  it("leaves an article's own slashes alone", () => {
    // Wikipedia titles are not hierarchical: rolling up would turn the
    // AC/DC article into "AC".
    expect(workTitle("AC/DC", false)).toBe("AC/DC");
  });

  it("keeps a work that is already the root", () => {
    expect(workTitle("AP Physics C", true)).toBe("AP Physics C");
  });
});

describe("isWorkTitle", () => {
  it("rejects the wiki's own index and navigation pages", () => {
    // Wikibooks keeps shelves in the main namespace, so a search returns
    // "Shelf:Physics" — a list of links, not something to study.
    expect(isWorkTitle("Shelf:Physics")).toBe(false);
    expect(isWorkTitle("Department:Mathematics")).toBe(false);
    expect(isWorkTitle("Category:Physics")).toBe(false);
    expect(isWorkTitle("Wikibooks:Policy")).toBe(false);
    expect(isWorkTitle("List of physicists")).toBe(false);
    expect(isWorkTitle("Mercury (disambiguation)")).toBe(false);
  });

  it("accepts an ordinary work", () => {
    expect(isWorkTitle("AP Physics C")).toBe(true);
    expect(isWorkTitle("General Astronomy")).toBe(true);
  });
});

describe("subjectFromCategories", () => {
  it("takes the subject from the work's own shelf", () => {
    expect(
      subjectFromCategories(["Category:Book:AP Physics C", "Category:Shelf:Physics"]),
    ).toBe("Physics");
    expect(subjectFromCategories(["Category:Shelf:Astronomy"])).toBe("Astronomy");
  });

  it("sees through nested prefixes and shelf wording", () => {
    // Categories arrive fully prefixed and can nest: "Category:Book:...".
    expect(
      subjectFromCategories(["Category:Shelf:Physics study guides"]),
    ).toBe("Physics");
    expect(subjectFromCategories(["Category:Shelf:Mathematics (books)"])).toBe(
      "Mathematics",
    );
  });

  it("skips shelves that name a programme rather than a field", () => {
    expect(
      subjectFromCategories([
        "Category:Shelf:Advanced Placement",
        "Category:Shelf:Physics",
      ]),
    ).toBe("Physics");
  });

  it("returns nothing rather than a category that is not a subject", () => {
    // Wikipedia's categories are written for editors. Taking the first
    // available filed the Advanced Placement article under "1955
    // establishments in the United States", and a wrong subject is worse than
    // none — a later search matches on it.
    expect(
      subjectFromCategories([
        "Category:1955 establishments in the United States",
        "Category:Educational organizations",
      ]),
    ).toBe(null);
    expect(subjectFromCategories(["Category:2021 establishments in Florida"])).toBe(
      null,
    );
    expect(subjectFromCategories([])).toBe(null);
  });
});

describe("wikiSearchQuery", () => {
  it("sends the query's meaningful words", () => {
    expect(wikiSearchQuery("AP Physics C: Electricity and Mechanics")).toBe(
      "AP Physics Electricity Mechanics",
    );
  });

  it("adds the subject filter when the reader set one", () => {
    expect(wikiSearchQuery("waves", "Physics")).toBe("waves Physics");
  });
});
