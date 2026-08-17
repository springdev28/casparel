/**
 * Reading what the open-access sources actually send.
 *
 * The payloads below are trimmed from real responses. A parser is the one place
 * where being wrong is silent: a bad field mapping does not throw, it stores a
 * row with a plausible-looking title and a link to nothing, and the catalog is
 * poisoned for every later search.
 */
import { describe, expect, it } from "vitest";
import { OPEN_SOURCES, openSourceIsExcluded, subjectFromTerms } from "./openSources";

const source = (kind: string) =>
  OPEN_SOURCES.find((candidate) => candidate.kind === kind)!;

describe("Directory of Open Access Books", () => {
  const doab = source("doab");
  const body = [
    {
      uuid: "fc827318-9a46-4ffe-b481-df0e5aef195f",
      name: "Artificial Photosynthesis",
      handle: "20.500.12854/65613",
      metadata: [
        { key: "dc.title", value: "Artificial Photosynthesis" },
        {
          key: "dc.description.abstract",
          value: "Photosynthesis is one of the most important reactions on Earth.",
        },
        { key: "dc.contributor.editor", value: "Mahdi Najafpour, Mohammad" },
        { key: "dc.date.issued", value: "2012" },
        { key: "dc.language", value: "English" },
        {
          key: "dc.subject.classification",
          value: "thema EDItEUR::P Mathematics and Science::PST Botany and plant sciences",
        },
      ],
    },
  ];

  it("reads a book into something a reader can open", () => {
    const [row] = doab.parse(body);
    expect(row.title).toBe("Artificial Photosynthesis");
    expect(row.url).toBe(
      "https://directory.doabooks.org/handle/20.500.12854/65613",
    );
    expect(row.description).toContain("most important reactions");
    expect(row.author).toBe("Mahdi Najafpour, Mohammad");
    expect(row.publishedAt).toBe("2012-01-01T00:00:00.000Z");
    expect(row.language).toBe("en");
  });

  it("translates a librarian's classification into a subject the catalog uses", () => {
    // Storing "thema EDItEUR::P Mathematics and Science::PST Botany" verbatim
    // gives the catalog a second vocabulary that nobody searches in.
    expect(doab.parse(body)[0].subject).toBe("Biology");
  });

  it("drops a record with no title or no handle rather than inventing one", () => {
    expect(
      doab.parse([
        { uuid: "x", handle: "1/2", metadata: [{ key: "dc.type", value: "book" }] },
        { uuid: "y", metadata: [{ key: "dc.title", value: "No handle here" }] },
      ]),
    ).toEqual([]);
  });

  it("asks for a bounded window", () => {
    const url = doab.endpoint("photosynthesis", 20, 20);
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("query")).toBe("photosynthesis");
  });
});

describe("Directory of Open Access Journals", () => {
  const doaj = source("doaj");
  const body = {
    results: [
      {
        bibjson: {
          title: "Photosynthesis and Rubisco kinetics in spring wheat",
          year: "2006",
          abstract: "The crucial role of plant photosynthesis has been emphasized.",
          author: [{ name: "Lubomir Natr" }],
          journal: { title: "Kvasny prumysl", language: ["CS", "EN"] },
          keywords: ["sustainable development", "plant physiology"],
          identifier: [
            { id: "0023-5830", type: "pissn" },
            { id: "10.18832/kp2006025", type: "doi" },
          ],
          link: [
            { type: "fulltext", url: "https://kvasnyprumysl.cz/en/artkey/kpr.php" },
          ],
        },
      },
    ],
  };

  it("prefers the full text link over the DOI", () => {
    // The point of an open-access catalog is that the link opens the thing.
    expect(doaj.parse(body)[0].url).toBe(
      "https://kvasnyprumysl.cz/en/artkey/kpr.php",
    );
  });

  it("falls back to the DOI when there is no full text link", () => {
    const withoutLink = {
      results: [
        {
          bibjson: {
            ...body.results[0].bibjson,
            link: [],
          },
        },
      ],
    };
    expect(doaj.parse(withoutLink)[0].url).toBe(
      "https://doi.org/10.18832/kp2006025",
    );
  });

  it("drops an article with no way to reach it", () => {
    expect(
      doaj.parse({
        results: [{ bibjson: { title: "Unreachable", link: [], identifier: [] } }],
      }),
    ).toEqual([]);
  });

  it("pages by page number, which is what DOAJ accepts", () => {
    expect(doaj.endpoint("photosynthesis", 0, 30).searchParams.get("page")).toBe(
      null,
    );
    expect(doaj.endpoint("photosynthesis", 60, 30).searchParams.get("page")).toBe(
      "3",
    );
  });
});

describe("Europe PMC", () => {
  const epmc = source("europepmc");
  const body = {
    resultList: {
      result: [
        {
          id: "42341120",
          pmcid: "PMC1234567",
          doi: "10.1126/sciadv.aef5234",
          title: "An OsGLK1/2 feedback module regulates rice photosynthesis.",
          abstractText: "GOLDEN2-LIKE proteins are central regulators.",
          authorString: "Liu X, Liu K, Xu S.",
          pubYear: "2026",
          language: "eng",
          isOpenAccess: "Y",
          meshHeadingList: {
            meshHeading: [{ descriptorName: "Photosynthesis" }],
          },
        },
      ],
    },
  };

  it("links to the readable copy, not the publisher's paywall", () => {
    expect(epmc.parse(body)[0].url).toBe(
      "https://europepmc.org/article/PMC/PMC1234567",
    );
  });

  it("drops the trailing full stop the record carries in its title", () => {
    expect(epmc.parse(body)[0].title).toBe(
      "An OsGLK1/2 feedback module regulates rice photosynthesis",
    );
  });

  it("only ever asks for open access records", () => {
    // Without this the source would fill an open catalog with paywalls.
    expect(epmc.endpoint("photosynthesis", 0, 30).searchParams.get("query")).toBe(
      "photosynthesis AND OPEN_ACCESS:Y",
    );
  });

  it("files a life sciences record under Biology when nothing more precise is given", () => {
    const noMesh = {
      resultList: { result: [{ ...body.resultList.result[0], meshHeadingList: {} }] },
    };
    expect(epmc.parse(noMesh)[0].subject).toBe("Biology");
  });
});

describe("subjectFromTerms", () => {
  it("takes a subject the catalog already knows over a near miss", () => {
    expect(subjectFromTerms(["Physics"])).toBe("Physics");
    expect(subjectFromTerms(["Botany & plant sciences"])).toBe("Biology");
    expect(subjectFromTerms(["Fermentation industries. Beverages."])).toBeNull();
  });

  it("says nothing rather than guessing", () => {
    // A wrong subject is worse than none: it is what a later search matches on.
    expect(subjectFromTerms([])).toBeNull();
    expect(subjectFromTerms(["TP500-660", "LCC"])).toBeNull();
  });
});

describe("openSourceIsExcluded", () => {
  it("skips a source the reader named, by name, domain or short kind", () => {
    for (const needle of ["doaj", "DOAJ", "doaj.org", "Open Access Journals"])
      expect(openSourceIsExcluded(source("doaj"), needle)).toBe(true);
  });

  it("keeps the sources the reader did not name", () => {
    expect(openSourceIsExcluded(source("doab"), "doaj")).toBe(false);
    expect(openSourceIsExcluded(source("europepmc"), "doaj")).toBe(false);
  });

  it("keeps everything when nothing is excluded", () => {
    for (const value of [undefined, "", "  "])
      for (const candidate of OPEN_SOURCES)
        expect(openSourceIsExcluded(candidate, value)).toBe(false);
  });
});

describe("every source", () => {
  it("declares what it is and asks over https", () => {
    for (const candidate of OPEN_SOURCES) {
      expect(candidate.provider.length).toBeGreaterThan(2);
      expect(candidate.endpoint("algebra", 0, candidate.pageSize).protocol).toBe(
        "https:",
      );
      // The material is what the reader's filter matches on, so a source without
      // one is invisible to a filtered search.
      expect(["book", "course", "reference", "paper", "primary"]).toContain(
        candidate.material,
      );
    }
  });

  it("returns nothing rather than throwing on a body it did not expect", () => {
    for (const candidate of OPEN_SOURCES)
      for (const body of [null, undefined, {}, [], "", 0, { results: "no" }])
        expect(candidate.parse(body)).toEqual([]);
  });
});
