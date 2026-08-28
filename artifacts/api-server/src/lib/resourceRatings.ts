/**
 * @fileOverview Backend domain role: centralizes Resource Ratings logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { db, resourcesTable, reviewsTable } from "@workspace/db";
import { publicResourceColumns } from "./resourceColumns";

/** One resource with its rating summary, as every client expects to read it. */
export async function resourceWithRating(id: number) {
  const [row] = await db
    .select(publicResourceColumns)
    .from(resourcesTable)
    .where(eq(resourcesTable.id, id));
  if (!row) return null;
  const [stats] = await db
    .select({
      avg: sql<number>`coalesce(avg(rating), 0)`,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.resourceId, id));
  return {
    ...row,
    avgRating: Math.round(Number(stats.avg) * 10) / 10,
    reviewCount: stats.count,
  };
}

/**
 * The same shape, for a list of ids, in two queries.
 *
 * The callers used to run `Promise.all(ids.map(resourceWithRating))`, which is
 * one query for the row plus one for its rating summary, per resource: 25
 * round trips for a 12-item list. The database is a long way from the app
 * server, so round trips dominate these endpoints, and the pool is only ten
 * connections wide, so the fan-out also queues behind itself under load.
 *
 * Order follows `ids`, since callers have already ranked them.
 */
export async function resourcesWithRatings(ids: number[]) {
  if (ids.length === 0) return [];

  const [rows, stats] = await Promise.all([
    db
      .select(publicResourceColumns)
      .from(resourcesTable)
      .where(inArray(resourcesTable.id, ids)),
    db
      .select({
        resourceId: reviewsTable.resourceId,
        avg: sql<number>`coalesce(avg(rating), 0)`,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(reviewsTable)
      .where(inArray(reviewsTable.resourceId, ids))
      .groupBy(reviewsTable.resourceId),
  ]);

  const byId = new Map(rows.map((row) => [row.id, row]));
  const ratingById = new Map(stats.map((stat) => [stat.resourceId, stat]));

  return ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    const rating = ratingById.get(id);
    return [
      {
        ...row,
        avgRating: Math.round(Number(rating?.avg ?? 0) * 10) / 10,
        reviewCount: rating?.count ?? 0,
      },
    ];
  });
}
