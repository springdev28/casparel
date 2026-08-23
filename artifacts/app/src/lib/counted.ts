/**
 * @fileOverview Web domain role: centralizes Counted state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
/**
 * "5 items" as one string, so the translation bridge can see it.
 *
 * The obvious JSX for a count is `{n} item{n !== 1 ? "s" : ""}`, and React
 * turns that into three DOM text nodes: the number, " item", and "s". The
 * bridge matches whole trimmed nodes, so what it is offered is " item" and
 * "s" -- neither of which is a phrase any dictionary could hold, and neither
 * of which reaches the plural rules in `ui-translations`, which were written
 * for exactly this and had been waiting for a node shaped "5 items" that JSX
 * never produced.
 *
 * So a reader of any of the five languages saw "5 items", "3 members" and
 * "12 reviews" in English on pages that were otherwise fully translated,
 * while `COUNTED` sat there with the Spanish, French, German, Portuguese and
 * Turkish forms already written.
 *
 * Composing the string in JavaScript makes it one text node, which is the
 * only shape the bridge can act on. English plurals are still spelled here
 * rather than guessed -- "s" is wrong for "party" and for "person" -- and the
 * other languages come from the rules, which know that Turkish does not
 * pluralise after a number at all.
 */
export function counted(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
