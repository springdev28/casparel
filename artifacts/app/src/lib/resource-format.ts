/**
 * @fileOverview Web domain role: centralizes Resource Format state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
/**
 * The name a reader sees for a resource's format.
 *
 * The format is a database enum -- article, video, pdf, podcast, interactive,
 * other -- and eight places rendered it directly with a `capitalize` class over
 * the top. That has two problems and only one of them is visible in English:
 * "pdf" becomes "Pdf", which is not how anybody writes it; and a word made by
 * styling a stored value is not a string the translation bridge can match, so
 * every one of those eight badges was English in all five languages.
 *
 * It went unseen because the audit fixture called the field `type` and set it
 * to "book" -- a name and a value the API has never had -- so the badge
 * rendered empty in every audit. Correcting the fixture against the contract
 * is what made the enum show up.
 *
 * An unknown format falls back to itself rather than to "Other": a format this
 * table has not heard of is better shown than silently relabelled.
 */
const FORMAT_NAMES: Record<string, string> = {
  article: "Article",
  video: "Video",
  pdf: "PDF",
  podcast: "Podcast",
  interactive: "Interactive",
  other: "Other",
};

export function formatName(format: string | null | undefined): string {
  if (!format) return "";
  return FORMAT_NAMES[format] ?? format;
}
