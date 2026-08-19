/**
 * Casparel can say who published the things Casparel recommends.
 *
 * The quick source check answers from a maintained registry of publishers.
 * The catalogue searches DOAB, DOAJ, Europe PMC, arXiv, OpenAlex, Project
 * Gutenberg, the Internet Archive and four Wikimedia projects -- and exactly
 * one of them, Open Library, was in that registry.
 *
 * So the product recommended a book from Project Gutenberg and then told the
 * reader "this domain is not yet in Casparel's maintained source registry ...
 * verify its author, publication date, evidence and usage rights before
 * relying on it". About Project Gutenberg. The trust claim failing on the
 * product's own shelf, on the free tier, which is where most people meet it.
 *
 * Nothing could have caught it. Both halves work perfectly: the catalogue
 * returns results, the checker returns a well-formed verdict, and "unknown" is
 * a legitimate verdict for a domain nobody has assessed. Only holding the two
 * lists against each other shows that they disagree.
 *
 * This is that comparison. Adding a search provider without saying who they
 * are now fails here rather than quietly producing a shrug on every result it
 * returns.
 */
import { describe, expect, it } from "vitest";
import { buildFreeQuickReview } from "./sourceProvenance";
import { OPEN_SOURCES } from "./openSources";
import { MEDIAWIKI_SITES } from "./mediawiki";

/**
 * Providers the registry deliberately does not rate, and why.
 *
 * A platform is not a publisher. Rating youtube.com would be rating every
 * uploader on it at once, and "unknown, check it yourself" is the true answer
 * for a video. Left here rather than in the registry so the exemption is a
 * decision somebody wrote down.
 */
const DELIBERATELY_UNRATED = new Set(["youtube.com"]);

function review(url: string) {
  return buildFreeQuickReview(
    {
      title: "A resource",
      url,
      subject: "Physics",
      gradeLevel: "Year 12",
      format: "article",
      thumbnailUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    { avgRating: 0, reviewCount: 0 },
  );
}

/** The domain a result from this provider actually sits on. */
function providerDomain(providerUrl: string): string {
  return new URL(providerUrl).hostname.toLowerCase().replace(/^www\./, "");
}

const providers: Array<{ label: string; domain: string }> = OPEN_SOURCES.map((source) => ({
  label: String(source.kind),
  domain: providerDomain(source.providerUrl),
})).concat(
  // The Wikimedia sites are per-language hosts -- en.wikibooks.org and the
  // rest -- which is also the case the registry's suffix matching has to
  // handle, so they are tested at a real language subdomain.
  MEDIAWIKI_SITES.map((site) => ({
    label: String(site.sourceKind),
    domain: site.host.replace("{lang}", "en"),
  })),
);

describe("every source the catalogue searches", () => {
  it("is a set the test can actually see", () => {
    // If either list ever stopped being enumerable this file would pass by
    // checking nothing, which is the failure it exists to prevent.
    expect(providers.length).toBeGreaterThanOrEqual(10);
  });

  it.each(providers.filter((p) => !DELIBERATELY_UNRATED.has(p.domain)))(
    "is one Casparel can name: $label ($domain)",
    ({ domain }) => {
      const verdict = review(`https://${domain}/some/work`);
      expect(
        verdict.trustLevel,
        `the catalogue returns results from ${domain} and the quick check ` +
          `cannot say who they are; add them to sourceProvenance.ts, or to ` +
          `DELIBERATELY_UNRATED with a reason`,
      ).not.toBe("unknown");
      expect(verdict.description, `${domain} has no description`).toBeTruthy();
      expect(verdict.sourceName, `${domain} falls back to its bare hostname`).not.toBe(domain);
    },
  );

  it("still says so plainly for a domain nobody has assessed", () => {
    // The other half: the shrug has to survive for domains that deserve it,
    // or this whole feature becomes a rubber stamp.
    const verdict = review("https://some-blog-nobody-has-heard-of.example/post");
    expect(verdict.trustLevel).toBe("unknown");
    expect(verdict.summary).toMatch(/verify its author/i);
  });

  it("leaves a platform unrated on purpose", () => {
    // Named so that "youtube is unknown" reads as a decision rather than an
    // oversight the next person quietly fixes.
    expect(review("https://www.youtube.com/watch?v=abc").trustLevel).toBe("unknown");
  });
});
