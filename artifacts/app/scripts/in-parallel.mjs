/**
 * Run a list of jobs a few at a time, in order.
 *
 * The browser audits each render every page, in every language, at every
 * width, and each render is an independent browser context against a static
 * file server. There is nothing to serialise them for -- and they were
 * serialised, because a nested `for` loop is the obvious way to express "every
 * page in every language" and it happens to also mean "one at a time". The
 * translation audit spent seven minutes and fifty seconds on 384 renders that
 * way, and two minutes and forty-two seconds on the same 384 after this.
 *
 * Two properties matter, and both are the reason this is a helper rather than
 * a `Promise.all` at each call site:
 *
 *   - Results come back in the order the jobs were given, whatever order they
 *     finished in. An audit's report is assembled from them afterwards, and a
 *     report whose lines reshuffle between runs is a report nobody can diff.
 *   - The list is walked by a fixed number of workers rather than started all
 *     at once. Four hundred browser contexts at once is not faster, it is a
 *     machine thrashing.
 *
 * A job that throws rejects the whole run, which is deliberate: an audit that
 * quietly skips a page reports the coverage of a page it never opened. Catch
 * inside the job and return a marker when "this one could not be looked at" is
 * a result worth keeping.
 */

/**
 * How many jobs run at once.
 *
 * Four, for a two-core CI runner. Each render spends most of its life waiting
 * on network-idle and a paint rather than burning processor, so a handful in
 * flight keeps the machine busy without making them fight over it.
 */
export const DEFAULT_CONCURRENCY = Number(process.env.AUDIT_CONCURRENCY ?? 4);

/**
 * @template T, R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} work
 * @param {number} [limit]
 * @returns {Promise<R[]>} one result per item, in the items' own order
 */
export async function inParallel(items, work, limit = DEFAULT_CONCURRENCY) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
  );
  return results;
}
