/**
 * Reading a source's language off its address, and what happens when it does
 * not say.
 *
 * The case that prompted this: the landing hero offered an English reader
 * "İspanyolca" from tr.wikibooks.org under a heading about researching
 * sources for them. Real source, correct provenance verdict, wrong language,
 * and nothing on the card admitting it.
 */
import { describe, expect, it } from "vitest";
import { languageOfSourceUrl, languageRank } from "./sourceLanguage";

describe("the language of a source", () => {
  it("reads the wikimedia language subdomain", () => {
    const cases: Array<[string, string]> = [
      ["https://tr.wikibooks.org/wiki/İspanyolca", "tr"],
      ["https://es.wikipedia.org/wiki/Ciencia", "es"],
      ["https://en.wikiversity.org/wiki/Physics", "en"],
      ["https://fr.wikisource.org/wiki/Accueil", "fr"],
      ["https://de.wiktionary.org/wiki/Haus", "de"],
      // Simple English is English, not a language called "simple".
      ["https://simple.wikipedia.org/wiki/Atom", "en"],
    ];
    for (const [url, expected] of cases) {
      expect(languageOfSourceUrl(url), url).toBe(expected);
    }
  });

  it("knows the sources that publish in one language", () => {
    expect(languageOfSourceUrl("https://openstax.org/books/calculus-volume-1")).toBe("en");
    expect(languageOfSourceUrl("https://www.gutenberg.org/ebooks/1342")).toBe("en");
  });

  it("reads a country-code domain for the languages this product ships", () => {
    expect(languageOfSourceUrl("https://ornek.com.tr/ders")).toBe("tr");
    expect(languageOfSourceUrl("https://exemple.fr/cours")).toBe("fr");
  });

  it("says nothing rather than guessing English", () => {
    /*
     * The half that matters. An English-speaking product that treats silence
     * as English decides every unmarked source in the world is English, and
     * then ranks a genuinely English source no higher than a Turkish one it
     * failed to read.
     */
    const unknown = [
      "https://example.com/course",
      "https://medium.com/@someone/post",
      // A two-letter subdomain on a site that does not use the convention:
      // this might be a language or might be a customer called "en".
      "https://en.example.com/page",
      // A ccTLD that is not a language signal: .co is Colombia, .io is nobody.
      "https://example.co/page",
      "https://example.io/page",
      "not a url at all",
      "",
    ];
    for (const url of unknown) {
      expect(languageOfSourceUrl(url), url).toBeNull();
    }
  });
});

describe("ranking a source for a reader", () => {
  it("puts a match first, an unknown next, and a mismatch last", () => {
    expect(languageRank("en", "en")).toBe(0);
    expect(languageRank(null, "en")).toBe(1);
    expect(languageRank("tr", "en")).toBe(2);
  });

  it("orders a mixed shelf the way it should be read", () => {
    const shelf = [
      { url: "https://tr.wikibooks.org/wiki/C++", title: "C++ (tr)" },
      { url: "https://example.com/anything", title: "unmarked" },
      { url: "https://openstax.org/books/x", title: "OpenStax (en)" },
    ];
    const ordered = [...shelf].sort(
      (a, b) =>
        languageRank(languageOfSourceUrl(a.url), "en") -
        languageRank(languageOfSourceUrl(b.url), "en"),
    );
    expect(ordered.map((entry) => entry.title)).toEqual([
      "OpenStax (en)",
      "unmarked",
      "C++ (tr)",
    ]);
  });

  it("still ranks a Turkish reader's own sources first", () => {
    // The same rule, the other way round: this is not "prefer English".
    expect(languageRank(languageOfSourceUrl("https://tr.wikibooks.org/wiki/C++"), "tr")).toBe(0);
    expect(languageRank(languageOfSourceUrl("https://openstax.org/books/x"), "tr")).toBe(2);
  });
});
