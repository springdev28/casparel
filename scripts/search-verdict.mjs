#!/usr/bin/env node
/**
 * @fileOverview Repository tooling role: implements Search Verdict for workspace development, build, validation, or documentation.
 * System connection: invoked by package scripts or maintainers; it is not part of the end-user runtime bundle.
 */
/**
 * Asks whether a search's results are actually answers.
 *
 * Counting results is not measuring a search. "Cold war" returned fifteen
 * videos and every one of them was about the Punic Wars — correctly filed
 * under History, matching the word "war", and answering a question nobody
 * asked. A count says fifteen. So does a count of fifteen good ones.
 *
 * The obvious next metric — how many words of the query each result matched —
 * is worse than nothing, because it is only half the rule the server applies.
 * A row earns its place by matching two words of the question *or* by matching
 * one word the catalog barely uses. Judging on word count alone reported
 * eleven perfectly good answers to "quantum entanglement" as failures, and I
 * called two working filters broken on the strength of it.
 *
 * So every result lands in one of three buckets, and only the last is a fault:
 *
 *   strong   matched two or more words of the question
 *   rare     matched one word, and the catalog barely uses that word
 *   weak     matched one word, and it was an ordinary one
 *
 * Two things keep this honest, both learned the hard way:
 *
 *   • Coverage is computed in SQL by the same expression the server uses —
 *     title or subject worth two, description, provider or author worth one —
 *     against the very rows the endpoint returned. A second implementation of
 *     the matching would drift from the first, and drift is what produced the
 *     wrong answer above.
 *   • Rarity uses the real document frequencies and the server's own two
 *     tests: four times rarer than the query's commonest word, or under two
 *     per cent of the catalog outright.
 *
 * Usage:
 *   DATABASE_URL=postgres://… node scripts/search-verdict.mjs "cold war" [subject] [material]
 *   node scripts/search-verdict.mjs "cold war"        (prints the SQL instead)
 *
 * Exit codes:
 *   0   every result is an answer, or the search honestly returned none.
 *   1   at least one result matched only an ordinary word.
 */

const RARITY_GAP = 4;
const RARE_SHARE = 0.02;
const BASE_URL = process.env.SEARCH_BASE_URL ?? "https://casparel.com";

/** Words that carry no topic, mirroring the server's own two lists. */
const STOP_WORDS = new Set(
  "a an and be become for in learn master of on study the to understand with".split(" "),
);
const PACKAGING = new Set(
  `advanced answer answers basic basics beginner beginners best book books chapter class classes
   complete course courses crash curriculum definition doc docs download easy ebook example examples
   exercise exercises explained explanation free guide guides help how intro introduction lecture
   lectures lesson lessons meaning note notes online overview part pdf playlist ppt practice problem
   problems quick quiz quizzes revision simple slides solution solutions step steps summary syllabus
   textbook textbooks tips tricks tutorial tutorials video videos what when where which who why
   worksheet worksheets`.split(/\s+/),
);

function topicalTerms(query) {
  return query
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.has(word.toLowerCase()))
    .filter((word) => word.length >= 3 && !PACKAGING.has(word.toLowerCase()));
}

async function fetchResults(query, subject, material) {
  const url = new URL("/api/resources/discover", BASE_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("language", "en");
  url.searchParams.set("resultType", "content");
  if (subject) url.searchParams.set("subject", subject);
  if (material) url.searchParams.set("material", material);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`discover returned ${response.status}`);
  return await response.json();
}

/**
 * One statement that does the whole judgement.
 *
 * The terms and the row ids go in as arrays rather than being pasted into the
 * SQL one at a time, so the shape of the query does not change with the shape
 * of the question and there is nothing to escape.
 */
const VERDICT_SQL = `
with input as (select $1::text[] as terms, $2::int[] as ids),
tot as (select count(*)::int as n from catalog_resources),
df as (
  select u.term,
    (select count(*)::int from catalog_resources x
      where x.title ~* ('\\m' || u.term) or x.subject ~* ('\\m' || u.term)
        or coalesce(x.description, '') ~* ('\\m' || u.term)
        or x.provider ~* ('\\m' || u.term)
        or coalesce(x.author, '') ~* ('\\m' || u.term)) as freq
  from input i cross join lateral unnest(i.terms) as u(term)
),
hits as (
  select r.id, r.title, u.term,
    (r.title ~* ('\\m' || u.term) or r.subject ~* ('\\m' || u.term)
     or coalesce(r.description, '') ~* ('\\m' || u.term)
     or r.provider ~* ('\\m' || u.term)
     or coalesce(r.author, '') ~* ('\\m' || u.term)) as matched
  from input i
  cross join lateral unnest(i.terms) as u(term)
  join catalog_resources r on r.id = any(i.ids)
)
select h.title,
  count(*) filter (where h.matched) as coverage,
  bool_or(h.matched and (
    d.freq * ${RARITY_GAP} <= (select max(freq) from df)
    or d.freq <= greatest(1, (select n from tot) * ${RARE_SHARE})
  )) as rare_hit
from hits h join df d on d.term = h.term
group by h.id, h.title
order by coverage desc, h.title`;

async function main() {
  const [query, subject, material] = process.argv.slice(2);
  if (!query) {
    console.error('usage: search-verdict.mjs "some query" [subject] [material]');
    process.exit(2);
  }
  const terms = topicalTerms(query);
  if (!terms.length) {
    console.error(`no topic words in ${JSON.stringify(query)} — nothing to judge`);
    process.exit(2);
  }

  const results = await fetchResults(query, subject, material);
  const ids = results.map((row) => row.catalogId).filter(Boolean);
  const label = [query, subject, material].filter(Boolean).join(" · ");
  if (!ids.length) {
    // Not a fault on its own: a question the catalog cannot answer honestly
    // returns nothing, and the top-up goes and fetches something.
    console.log(`${label}: no results`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.log(`-- ${label}\n-- terms: ${terms.join(", ")}\n-- ids: ${ids.join(", ")}`);
    console.log(VERDICT_SQL);
    return;
  }

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  let rows;
  try {
    await client.connect();
    ({ rows } = await client.query(VERDICT_SQL, [terms, ids]));
  } catch (error) {
    // A tool for telling good results from bad should not fail by stack trace.
    console.error(`could not read the catalog: ${error.message}`);
    process.exit(2);
  } finally {
    await client.end().catch(() => {});
  }

  // Judging fewer rows than were returned means the database being asked is
  // not the one that answered the search — a local fixture against the live
  // site, most likely. Reporting "no faults" there is the same silent success
  // this tool exists to stop: the first run of it said 0/0/0 and meant
  // "nothing was measured", which reads exactly like "nothing was wrong".
  if (rows.length !== ids.length) {
    console.error(
      `judged ${rows.length} of ${ids.length} results: the database at ` +
        `DATABASE_URL does not hold the rows ${BASE_URL} returned. ` +
        `Point both at the same system.`,
    );
    process.exit(2);
  }

  const strong = rows.filter((r) => Number(r.coverage) >= 2);
  const rare = rows.filter((r) => Number(r.coverage) < 2 && r.rare_hit);
  const weak = rows.filter((r) => Number(r.coverage) < 2 && !r.rare_hit);

  console.log(`${label}`);
  console.log(`  terms   ${terms.join(", ")}`);
  console.log(`  strong  ${strong.length}   (matched two or more words)`);
  console.log(`  rare    ${rare.length}   (matched one word the catalog barely uses)`);
  console.log(`  weak    ${weak.length}   (matched one ordinary word)`);
  for (const row of weak) console.log(`    weak: ${row.title}`);
  if (weak.length) process.exitCode = 1;
}

await main();
