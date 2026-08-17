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


describe("arXiv", () => {
  const arxiv = source("arxiv");
  // Trimmed from a real Atom response. Flat elements, two links, no CDATA —
  // exactly the shape the hand-rolled reader is scoped to.
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/1107.0191v1</id>
    <title>Energy conversion in Purple Bacteria Photosynthesis</title>
    <published>2011-07-01T10:54:23Z</published>
    <link href="https://arxiv.org/abs/1107.0191v1" rel="alternate" type="text/html"/>
    <link href="https://arxiv.org/pdf/1107.0191v1" rel="related" type="application/pdf" title="pdf"/>
    <summary>The study of how photosynthetic organisms convert light offers
    insight into nature&apos;s evolutionary process.</summary>
    <author><name>F. Fassioli</name></author>
    <author><name>A. Olaya-Castro</name></author>
    <category term="physics.bio-ph" scheme="http://arxiv.org/schemas/atom"/>
    <category term="q-bio.BM" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

  it("reads an Atom entry without an XML parser", () => {
    const [row] = arxiv.parse(feed);
    expect(row.title).toBe("Energy conversion in Purple Bacteria Photosynthesis");
    // The abstract page, not the pdf: it carries the abstract and every format.
    expect(row.url).toBe("https://arxiv.org/abs/1107.0191v1");
    expect(row.author).toBe("F. Fassioli, A. Olaya-Castro");
    expect(row.publishedAt).toBe("2011-01-01T00:00:00.000Z");
    // Entities are decoded, not left as escapes for a reader to see.
    expect(row.description).toContain("nature's evolutionary process");
  });

  it("turns an arXiv category code into a subject the catalog uses", () => {
    // "physics.bio-ph" names a field, but not in a word anyone searches for.
    expect(arxiv.parse(feed)[0].subject).toBe("Physics");
  });

  it("is told to read text, since it does not answer in JSON", () => {
    expect(arxiv.responseType).toBe("text");
  });

  it("drops an entry it cannot read rather than half-parsing it", () => {
    expect(arxiv.parse("<feed><entry><title>No link at all</title></entry></feed>")).toEqual(
      [],
    );
    expect(arxiv.parse("not xml")).toEqual([]);
  });

  it("pages by result offset, which is what arXiv accepts", () => {
    const url = arxiv.endpoint("photosynthesis", 50, 25);
    expect(url.searchParams.get("start")).toBe("50");
    expect(url.searchParams.get("search_query")).toBe("all:photosynthesis");
  });
});

describe("OpenAlex", () => {
  const openalex = source("openalex");
  const body = {
    results: [
      {
        id: "https://openalex.org/W2741809807",
        display_name: "The state of OA: a large-scale analysis",
        publication_year: 2018,
        language: "en",
        type: "article",
        best_oa_location: {
          landing_page_url: "https://peerj.com/articles/4375/",
          license: "cc-by",
        },
        authorships: [{ author: { display_name: "Heather Piwowar" } }],
        concepts: [{ display_name: "Computer science" }],
      },
    ],
  };

  it("links to the open copy and records its licence", () => {
    const [row] = openalex.parse(body);
    expect(row.url).toBe("https://peerj.com/articles/4375/");
    expect(row.license).toBe("cc-by");
    expect(row.subject).toBe("Computer Science");
    expect(row.publishedAt).toBe("2018-01-01T00:00:00.000Z");
  });

  it("only ever asks for open access works", () => {
    // Without this it would fill an open catalog with paywalls, which is the
    // reason Crossref is not a source at all.
    expect(openalex.endpoint("x", 0, 25).searchParams.get("filter")).toBe(
      "is_oa:true",
    );
  });

  it("describes the record rather than inventing prose it does not have", () => {
    // OpenAlex often may not redistribute an abstract.
    expect(openalex.parse(body)[0].description).toBe("An open access article.");
  });
});

describe("Project Gutenberg", () => {
  const gutenberg = source("gutenberg");
  const body = {
    results: [
      {
        id: 27761,
        title: "Hamlet",
        authors: [{ name: "Shakespeare, William" }],
        subjects: ["Denmark -- Drama", "Revenge -- Drama"],
        bookshelves: ["Browsing: Literature"],
        languages: ["en"],
        formats: { "image/jpeg": "https://www.gutenberg.org/cache/epub/27761/pg27761.cover.medium.jpg" },
      },
    ],
  };

  it("links to the book's own page and keeps its cover", () => {
    const [row] = gutenberg.parse(body);
    expect(row.url).toBe("https://www.gutenberg.org/ebooks/27761");
    expect(row.author).toBe("Shakespeare, William");
    expect(row.thumbnailUrl).toContain("pg27761.cover");
  });

  it("reads a subject out of a Library of Congress string", () => {
    // "Denmark -- Drama" is a cataloguer's string; only the half before the
    // dashes is a subject anyone would search for.
    expect(gutenberg.parse(body)[0].subject).toBe("Literature");
  });

  it("is filed as a primary text, which is what it is", () => {
    expect(gutenberg.material).toBe("primary");
  });
});

describe("Internet Archive", () => {
  const ia = source("internet-archive");
  const body = {
    response: {
      docs: [
        {
          identifier: "photosynthesisin00rabi",
          title: "Photosynthesis and related processes",
          creator: "Rabinowitch, Eugene",
          year: "1945",
          subject: ["Photosynthesis", "Plant physiology"],
          description: "A survey of the photochemistry of green plants.",
          language: "eng",
        },
      ],
    },
  };

  it("links to the item page", () => {
    const [row] = ia.parse(body);
    expect(row.url).toBe("https://archive.org/details/photosynthesisin00rabi");
    expect(row.subject).toBe("Biology");
    expect(row.language).toBe("en");
    expect(row.publishedAt).toBe("1945-01-01T00:00:00.000Z");
  });

  it("asks only for texts, and not for the lending collection", () => {
    // A book with a waiting list is a paywall with extra steps, and this catalog
    // promises that the link opens the thing.
    const asked = ia.endpoint("photosynthesis", 0, 25).searchParams.get("q") ?? "";
    expect(asked).toContain("mediatype:texts");
    expect(asked).toContain("-collection:inlibrary");
  });
});

describe("YouTube", () => {
  const youtube = source("youtube");
  const body = {
    items: [
      {
        id: { videoId: "sQK3Yr4Sc_k" },
        snippet: {
          title: "Photosynthesis: Crash Course Biology",
          description: "Hank explains the extremely complex series of reactions.",
          channelTitle: "CrashCourse",
          publishedAt: "2012-03-19T21:00:00Z",
          thumbnails: { high: { url: "https://i.ytimg.com/vi/sQK3Yr4Sc_k/hq.jpg" } },
        },
      },
    ],
  };

  it("reads a video into something a reader can watch", () => {
    const [row] = youtube.parse(body);
    expect(row.url).toBe("https://www.youtube.com/watch?v=sQK3Yr4Sc_k");
    expect(row.author).toBe("CrashCourse");
    expect(row.format).toBe("video");
    expect(row.thumbnailUrl).toContain("i.ytimg.com");
  });

  it("does not guess a subject from a video's title", () => {
    // Guessing is how the catalog poisoned itself: a wrong subject is what a
    // later search matches on.
    expect(youtube.parse(body)[0].subject).toBeNull();
  });

  it("is skipped entirely when no key is configured", () => {
    // An unconfigured source is not an outage, and asking without a key would
    // burn a cooldown on every search.
    const key = process.env.YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_API_KEY;
    expect(youtube.available?.()).toBe(false);
    process.env.YOUTUBE_API_KEY = "test-key-not-real";
    expect(youtube.available?.()).toBe(true);
    if (key === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = key;
  });

  it("asks only for embeddable videos of a useful length", () => {
    process.env.YOUTUBE_API_KEY = "test-key-not-real";
    const url = youtube.endpoint("photosynthesis", 0, 25);
    expect(url.searchParams.get("videoEmbeddable")).toBe("true");
    expect(url.searchParams.get("safeSearch")).toBe("strict");
    delete process.env.YOUTUBE_API_KEY;
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
      expect([
        "book",
        "course",
        "reference",
        "paper",
        "primary",
        "video",
      ]).toContain(candidate.material);
    }
  });

  it("returns nothing rather than throwing on a body it did not expect", () => {
    for (const candidate of OPEN_SOURCES)
      for (const body of [null, undefined, {}, [], "", 0, { results: "no" }])
        expect(candidate.parse(body)).toEqual([]);
  });
});
