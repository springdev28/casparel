/**
 * What language a source is written in, read off its address.
 *
 * The landing hero showed an English reader "İspanyolca" and "Android
 * Programlama" from tr.wikibooks.org, under a heading offering to research
 * sources for them. The sources were real and the provenance verdicts were
 * right; they were just in a language that reader does not read, presented
 * with nothing to say so.
 *
 * The `resources` table has no language column -- the vetted catalogue has
 * one, user submissions do not -- so this reads the address instead. That is
 * not a general-purpose language detector and does not try to be: it knows
 * the shape used by the source families this product actually deals in, and
 * says nothing when it does not know.
 *
 * Saying nothing is the important half. A host with no language marker is
 * `null`, not `"en"`, because guessing English from silence is how an
 * English-speaking product decides everything unmarked is English. `null`
 * means "not established", and the caller ranks it between a match and a
 * known mismatch rather than treating it as either.
 */

/**
 * Wikimedia and friends put the language in the subdomain: tr.wikibooks.org,
 * es.wikipedia.org, en.wikiversity.org. The pattern is theirs, not ours, so
 * it is matched against the sites known to use it rather than applied to
 * every two-letter subdomain on the web -- `en.example.com` might be an
 * English site or might be a customer called "en".
 */
const LANGUAGE_SUBDOMAIN_SITES = new Set([
  "wikipedia.org",
  "wikibooks.org",
  "wikiversity.org",
  "wikisource.org",
  "wikiquote.org",
  "wiktionary.org",
  "wikinews.org",
  "wikivoyage.org",
]);

/**
 * Sources that publish in one language whatever their address says.
 *
 * Only hosts whose output really is monolingual belong here. A site that
 * publishes in several and marks the language in the path is better served by
 * `null` than by a confident wrong answer.
 */
const MONOLINGUAL_HOSTS: Record<string, string> = {
  "openstax.org": "en",
  "oercommons.org": "en",
  "gutenberg.org": "en",
  "arxiv.org": "en",
  "khanacademy.org": "en",
  "ocw.mit.edu": "en",
  "bbc.co.uk": "en",
  "loc.gov": "en",
  "nasa.gov": "en",
  "nih.gov": "en",
};

/** A country-code TLD that is a reliable signal of the language. */
const LANGUAGE_TLDS: Record<string, string> = {
  tr: "tr",
  es: "es",
  fr: "fr",
  pt: "pt",
  de: "de",
};

/**
 * The language of a source, or null when the address does not say.
 *
 * @param url the source's address, as stored
 * @returns a two-letter code, or null when nothing reliable can be read
 */
export function languageOfSourceUrl(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (!host) return null;

  const monolingual = MONOLINGUAL_HOSTS[host];
  if (monolingual) return monolingual;

  const parts = host.split(".");
  if (parts.length >= 3) {
    const site = parts.slice(1).join(".");
    // `simple.wikipedia.org` is Simple English, which is English.
    if (LANGUAGE_SUBDOMAIN_SITES.has(site)) {
      const marker = parts[0];
      if (marker === "simple") return "en";
      if (/^[a-z]{2}$/.test(marker)) return marker;
      return null;
    }
  }

  // A ccTLD, for the handful this product ships languages for. Deliberately
  // not a general rule: .co is Colombia, not a language, and .io is nobody's.
  const tld = parts[parts.length - 1];
  return LANGUAGE_TLDS[tld] ?? null;
}

/**
 * How well a source suits this reader: 0 best.
 *
 * A match first, then anything whose language is not established, then a
 * known mismatch. The unknown tier sits in the middle on purpose -- a source
 * this cannot read the language of is not evidence against it, and a young
 * library made mostly of unmarked sources should not be pushed below a
 * handful of confident mismatches.
 */
export function languageRank(
  sourceLanguage: string | null,
  readerLanguage: string,
): 0 | 1 | 2 {
  if (sourceLanguage === null) return 1;
  return sourceLanguage === readerLanguage ? 0 : 2;
}
