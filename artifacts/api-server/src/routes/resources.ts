import { Router, type IRouter } from "express";
import { eq, ne, sql, ilike, and, or, notInArray } from "drizzle-orm";
import {
  db,
  resourcesTable,
  reviewsTable,
  usersTable,
  learningGoalsTable,
  activityLogTable,
  catalogResourcesTable,
} from "@workspace/db";
import { publicResourceColumns } from "../lib/resourceColumns";
import {
  resourceVisibilityCondition,
  visibilityForRequest,
} from "../lib/resourceVisibility";
import {
  ListResourcesResponse,
  ListResourcesQueryParams,
  CreateResourceBody,
  CreateResourceResponse,
  ListFeaturedResourcesResponse,
  GetResourceRecommendationsResponse,
  GetResourceParams,
  GetResourceResponse,
  UpdateResourceParams,
  UpdateResourceBody,
  UpdateResourceResponse,
  DeleteResourceParams,
  DiscoverResourcesQueryParams,
  DiscoverResourcesResponse,
  PrefetchResourceMetadataBody,
} from "@workspace/api-zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { isResourceOwner } from "../lib/authz";
import { openai } from "@workspace/integrations-openai-ai-server";
import { contentLimiter, discoverLimiter } from "../lib/limiters";
import {
  fetchPublicText,
  filterReachableUrls,
} from "../lib/check-url-reachable";
import { isAdminRequest } from "../lib/adminAccess";
import {
  consumeAiQuota,
  paidRetryAllowed,
  recordAiUsage,
} from "../lib/aiCostControls";
import {
  canonicalCatalogUrl,
  searchCatalog,
  searchOpenLibraryAndStore,
  searchWikibooksAndStore,
  type SourceCredibility,
} from "../lib/catalog";
import { meaningfulSearchTerms } from "../lib/searchTerms";

const router: IRouter = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

async function resourceWithRating(id: number) {
  const [r] = await db
    .select(publicResourceColumns)
    .from(resourcesTable)
    .where(eq(resourcesTable.id, id));
  if (!r) return null;
  const [stats] = await db
    .select({
      avg: sql<number>`coalesce(avg(rating), 0)`,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.resourceId, id));
  return {
    ...r,
    avgRating: Math.round(Number(stats.avg) * 10) / 10,
    reviewCount: stats.count,
  };
}

function canonicalResourceUrl(raw: string) {
  try {
    return canonicalCatalogUrl(raw).toLocaleLowerCase();
  } catch {
    return raw.trim().replace(/\/$/, "").toLocaleLowerCase();
  }
}

/**
 * Decide a new submission's verification state at insert time.
 *
 * Two things auto-clear, so the review queue drains at the source instead of
 * growing with every submission:
 *  • the URL is already in the vetted catalog (this covers "Add to library" on
 *    discover results, which is the highest-volume submission path), and
 *  • the submitter is an admin or a verified account.
 *
 * Everything else starts "unverified". Host provenance (.edu/.gov) is
 * deliberately NOT a trust signal here — personal pages under those domains are
 * trivially obtainable.
 */
async function classifySubmission(
  url: string,
  userId: number,
  accountRole: string,
): Promise<{
  verificationStatus: "unverified" | "verified";
  verificationSource: "catalog" | "trusted-submitter" | null;
}> {
  const [inCatalog] = await db
    .select({ id: catalogResourcesTable.id })
    .from(catalogResourcesTable)
    .where(eq(catalogResourcesTable.canonicalUrl, canonicalResourceUrl(url)))
    .limit(1);
  if (inCatalog) {
    return { verificationStatus: "verified", verificationSource: "catalog" };
  }

  if (accountRole === "admin") {
    return { verificationStatus: "verified", verificationSource: "trusted-submitter" };
  }
  const [submitter] = await db
    .select({ teacherVerified: usersTable.teacherVerified })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (submitter?.teacherVerified === true) {
    return { verificationStatus: "verified", verificationSource: "trusted-submitter" };
  }

  return { verificationStatus: "unverified", verificationSource: null };
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 160)
    : undefined;
}

function queryBoolean(value: unknown): boolean | undefined {
  return value === "true" ? true : value === "false" ? false : undefined;
}

function boundedInteger(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : undefined;
}

async function topRatedResources(limit = 12, viewerId: number | null = null) {
  // all resources ordered by avg rating descending
  const rows = await db
    .select({
      id: resourcesTable.id,
      avg: sql<number>`coalesce((select avg(rating) from reviews where resource_id = resources.id), 0)`,
    })
    .from(resourcesTable)
    // Featured lists are a recommendation; never surface unreviewed sources
    // there, even to the author.
    .where(resourceVisibilityCondition(viewerId, false))
    .orderBy(
      sql`coalesce((select avg(rating) from reviews where resource_id = resources.id), 0) desc`,
    )
    .limit(limit);
  const results = await Promise.all(rows.map((r) => resourceWithRating(r.id)));
  return results.filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );
}

// ── GET /resources — public ───────────────────────────────────────────────────

router.get("/resources", async (req, res): Promise<void> => {
  const params = ListResourcesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const {
    q,
    format,
    subject,
    gradeLevel,
    sortBy,
    minRating,
    limit = 12,
    offset = 0,
  } = params.data;
  const sourceFilter = queryString(req.query.source);
  const exactPhrase = queryString(req.query.exactPhrase);
  const excludedWords = queryString(req.query.exclude);
  const dateAdded = queryString(req.query.dateAdded);
  const librarySort = queryString(req.query.librarySort);
  const hasThumbnail = queryBoolean(req.query.hasThumbnail);
  const minReviews = boundedInteger(req.query.minReviews, 0, 10000);
  const searchTerm = q?.trim().replace(/\s+/g, " ");
  const conditions = [];
  // Hide unverified/rejected submissions from everyone except their author and
  // admins. Both query branches below build from this same array.
  const visibility = visibilityForRequest(req);
  if (visibility) conditions.push(visibility);
  // Lets an author narrow to their own gated submissions. Combined with the
  // visibility condition above, asking for someone else's pending items simply
  // returns nothing rather than leaking them.
  const verification = queryString(req.query.verification);
  if (verification === "pending" || verification === "rejected") {
    conditions.push(
      eq(
        resourcesTable.verificationStatus,
        verification === "pending" ? "unverified" : "rejected",
      ),
    );
  }
  if (searchTerm) {
    const tokens = meaningfulSearchTerms(searchTerm);
    conditions.push(
      or(
        ...tokens.map((token) => {
          const pattern = "%" + token + "%";
          return or(
            ilike(resourcesTable.title, pattern),
            ilike(resourcesTable.description, pattern),
            ilike(resourcesTable.subject, pattern),
            ilike(resourcesTable.gradeLevel, pattern),
            ilike(resourcesTable.url, pattern),
          )!;
        }),
      )!,
    );
  }
  if (format)
    conditions.push(
      eq(
        resourcesTable.format,
        format as
          "article" | "video" | "pdf" | "podcast" | "interactive" | "other",
      ),
    );
  if (subject) conditions.push(ilike(resourcesTable.subject, `%${subject}%`));
  if (gradeLevel) conditions.push(eq(resourcesTable.gradeLevel, gradeLevel));
  if (sourceFilter)
    conditions.push(ilike(resourcesTable.url, `%${sourceFilter}%`));
  if (exactPhrase) {
    const pattern = `%${exactPhrase}%`;
    conditions.push(
      or(
        ilike(resourcesTable.title, pattern),
        ilike(resourcesTable.description, pattern),
        ilike(resourcesTable.subject, pattern),
      )!,
    );
  }
  if (excludedWords) {
    const tokens = excludedWords
      .split(/[\s,]+/)
      .filter(Boolean)
      .slice(0, 8);
    for (const token of tokens) {
      const pattern = `%${token}%`;
      conditions.push(
        sql`not (
          ${resourcesTable.title} ilike ${pattern}
          or coalesce(${resourcesTable.description}, '') ilike ${pattern}
          or ${resourcesTable.subject} ilike ${pattern}
        )`,
      );
    }
  }
  if (hasThumbnail === true)
    conditions.push(
      sql`${resourcesTable.thumbnailUrl} is not null and trim(${resourcesTable.thumbnailUrl}) <> ''`,
    );
  if (hasThumbnail === false)
    conditions.push(
      sql`${resourcesTable.thumbnailUrl} is null or trim(${resourcesTable.thumbnailUrl}) = ''`,
    );
  if (dateAdded === "day")
    conditions.push(
      sql`${resourcesTable.createdAt} >= now() - interval '1 day'`,
    );
  if (dateAdded === "week")
    conditions.push(
      sql`${resourcesTable.createdAt} >= now() - interval '7 days'`,
    );
  if (dateAdded === "month")
    conditions.push(
      sql`${resourcesTable.createdAt} >= now() - interval '30 days'`,
    );
  if (dateAdded === "year")
    conditions.push(
      sql`${resourcesTable.createdAt} >= now() - interval '1 year'`,
    );

  const avgRating = sql<number>`round(coalesce(avg(${reviewsTable.rating}), 0)::numeric, 1)::float`;
  const reviewCount = sql<number>`cast(count(${reviewsTable.id}) as int)`;
  const relevance = searchTerm
    ? sql`case
        when lower(${resourcesTable.title}) = lower(${searchTerm}) then 0
        when lower(${resourcesTable.title}) like lower(${searchTerm}) || chr(37) then 1
        when ${resourcesTable.title} ilike ${`%${searchTerm}%`} then 2
        when ${resourcesTable.subject} ilike ${`%${searchTerm}%`} then 3
        when ${resourcesTable.description} ilike ${`%${searchTerm}%`} then 4
        else 5
      end`
    : sql`0`;
  const orderExpr =
    librarySort === "oldest"
      ? sql`${resourcesTable.createdAt} asc`
      : librarySort === "title_asc"
        ? sql`lower(${resourcesTable.title}) asc`
        : librarySort === "title_desc"
          ? sql`lower(${resourcesTable.title}) desc`
          : sortBy === "most_reviewed"
            ? sql`${reviewCount} desc`
            : sortBy === "top_rated"
              ? sql`${avgRating} desc`
              : searchTerm
                ? sql`${relevance}, ${avgRating} desc, ${reviewCount} desc, ${resourcesTable.createdAt} desc`
                : sql`${resourcesTable.createdAt} desc`;

  const requiresAggregateScan =
    sortBy === "most_reviewed" ||
    sortBy === "top_rated" ||
    Boolean(minRating) ||
    minReviews !== undefined;

  if (!requiresAggregateScan) {
    const selectedAvgRating = sql<number>`round(coalesce((select avg(rating) from reviews where resource_id = ${resourcesTable.id}), 0)::numeric, 1)::float`;
    const selectedReviewCount = sql<number>`cast((select count(*) from reviews where resource_id = ${resourcesTable.id}) as int)`;
    const fastOrderExpr =
      librarySort === "oldest"
        ? sql`${resourcesTable.createdAt} asc`
        : librarySort === "title_asc"
          ? sql`lower(${resourcesTable.title}) asc`
          : librarySort === "title_desc"
            ? sql`lower(${resourcesTable.title}) desc`
            : searchTerm
              ? sql`${relevance}, ${resourcesTable.createdAt} desc`
              : sql`${resourcesTable.createdAt} desc`;

    // Limit the resource rows before calculating their review summaries. The
    // common newest/relevance paths should not aggregate the whole catalog.
    const rows = await db
      .select({
        id: resourcesTable.id,
        title: resourcesTable.title,
        url: resourcesTable.url,
        description: resourcesTable.description,
        format: resourcesTable.format,
        subject: resourcesTable.subject,
        gradeLevel: resourcesTable.gradeLevel,
        thumbnailUrl: resourcesTable.thumbnailUrl,
        submittedById: resourcesTable.submittedById,
        createdAt: resourcesTable.createdAt,
        avgRating: selectedAvgRating,
        reviewCount: selectedReviewCount,
      })
      .from(resourcesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(fastOrderExpr)
      .limit(limit)
      .offset(offset);

    res.json(ListResourcesResponse.parse(rows));
    return;
  }

  // Return resources and review aggregates in one query. This avoids the old
  // two-query-per-result pattern and keeps response time flat as pages grow.
  const rows = await db
    .select({
      id: resourcesTable.id,
      title: resourcesTable.title,
      url: resourcesTable.url,
      description: resourcesTable.description,
      format: resourcesTable.format,
      subject: resourcesTable.subject,
      gradeLevel: resourcesTable.gradeLevel,
      thumbnailUrl: resourcesTable.thumbnailUrl,
      submittedById: resourcesTable.submittedById,
      createdAt: resourcesTable.createdAt,
      avgRating,
      reviewCount,
    })
    .from(resourcesTable)
    .leftJoin(reviewsTable, eq(reviewsTable.resourceId, resourcesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(resourcesTable.id)
    .having(
      minRating || minReviews !== undefined
        ? and(
            ...(minRating ? [sql`${avgRating} >= ${minRating}`] : []),
            ...(minReviews !== undefined
              ? [sql`${reviewCount} >= ${minReviews}`]
              : []),
          )
        : undefined,
    )
    .orderBy(orderExpr)
    .limit(limit)
    .offset(offset);

  res.json(ListResourcesResponse.parse(rows));
});
// ── GET /resources/featured — public ─────────────────────────────────────────
// NOTE: must stay above /resources/:id

router.get("/resources/featured", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      resourceId: reviewsTable.resourceId,
      avg: sql<number>`coalesce(avg(rating), 0)`,
    })
    .from(reviewsTable)
    .groupBy(reviewsTable.resourceId)
    .orderBy(sql`avg(rating) desc`)
    .limit(10);

  const resources = await Promise.all(
    rows.map((r) => resourceWithRating(r.resourceId)),
  );
  res.json(ListFeaturedResourcesResponse.parse(resources.filter(Boolean)));
});

// ── GET /resources/recommendations — public (personalised if auth header present) ──
// NOTE: must stay above /resources/:id

router.get("/resources/recommendations", async (req, res): Promise<void> => {
  // Try to read userId from auth header (optional — don't reject if missing)
  let userId: number | null = null;
  try {
    const { decodeToken } = await import("../lib/auth");
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      const payload = decodeToken(auth.slice(7));
      if (payload) userId = payload.userId;
    }
  } catch {
    // no-op — treat as unauthenticated
  }

  if (!userId) {
    // Resources in the DB are already validated when added — no live URL
    // reachability check needed here (those checks time out in the sandbox
    // and would silently empty the recommendations list).
    const results = await topRatedResources(12);
    res.json(GetResourceRecommendationsResponse.parse(results));
    return;
  }

  // Get resources the user has already reviewed
  const reviewedRows = await db
    .select({ resourceId: reviewsTable.resourceId })
    .from(reviewsTable)
    .where(eq(reviewsTable.userId, userId));
  const reviewedIds = reviewedRows.map((r) => r.resourceId);

  // Find their preferred subjects from review history
  const subjectStats = await db
    .select({
      subject: resourcesTable.subject,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(reviewsTable)
    .innerJoin(resourcesTable, eq(reviewsTable.resourceId, resourcesTable.id))
    .where(eq(reviewsTable.userId, userId))
    .groupBy(resourcesTable.subject)
    .orderBy(sql`count(*) desc`)
    .limit(4);

  const [profile] = await db
    .select({ bio: usersTable.bio, subjects: usersTable.subjects })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const stopWords = new Set([
    "about",
    "after",
    "also",
    "been",
    "from",
    "have",
    "into",
    "learning",
    "like",
    "that",
    "their",
    "they",
    "this",
    "with",
    "your",
  ]);
  const bioTerms =
    (profile?.bio ?? "")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}+#.-]{3,}/gu)
      ?.filter((term) => !stopWords.has(term))
      .slice(0, 10) ?? [];
  const interestTerms = [
    ...new Set(
      [
        ...(profile?.subjects ?? []),
        ...subjectStats.map((item) => item.subject),
        ...bioTerms,
      ]
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  ];

  let candidates: number[] = [];

  if (interestTerms.length > 0) {
    const interestMatch = or(
      ...interestTerms.map((term) =>
        or(
          ilike(resourcesTable.subject, `%${term}%`),
          ilike(resourcesTable.title, `%${term}%`),
          ilike(resourcesTable.description, `%${term}%`),
        )!,
      ),
    )!;
    // A user's submitted resources are their library. Recommendations should
    // always point to something new rather than back into that library.
    const conditions = [
      interestMatch,
      ne(resourcesTable.submittedById, userId),
      // Recommendations are other people's resources by definition, so the
      // author exception never applies here — verified only.
      eq(resourcesTable.verificationStatus, "verified"),
    ];
    if (reviewedIds.length > 0)
      conditions.push(notInArray(resourcesTable.id, reviewedIds));

    const rows = await db
      .select({ id: resourcesTable.id })
      .from(resourcesTable)
      .where(and(...conditions))
      .orderBy(
        sql`coalesce((select avg(rating) from reviews where resource_id = resources.id), 0) desc`,
      )
      .limit(24);

    candidates = rows.map((row) => row.id);
  }

  // Pad with top-rated resources if not enough personalised results
  if (candidates.length < 6) {
    const exclude = [...reviewedIds, ...candidates];
    const conditions = [
      ne(resourcesTable.submittedById, userId),
      eq(resourcesTable.verificationStatus, "verified"),
    ];
    if (exclude.length > 0)
      conditions.push(notInArray(resourcesTable.id, exclude));
    const extra = await db
      .select({ id: resourcesTable.id })
      .from(resourcesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        sql`coalesce((select avg(rating) from reviews where resource_id = resources.id), 0) desc`,
      )
      .limit(12 - candidates.length);
    candidates = [...candidates, ...extra.map((r) => r.id)];
  }

  const results = (
    await Promise.all(candidates.map((id) => resourceWithRating(id)))
  ).filter((item): item is NonNullable<typeof item> => item !== null);
  res.json(GetResourceRecommendationsResponse.parse(results.slice(0, 12)));
});

// ── POST /resources/:id/recommend — authenticated ────────────────────────────

router.post(
  "/resources/:id/recommend",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const auth = req as AuthenticatedRequest;
    const resourceId = Number(req.params.id);
    const recipientId = Number(req.body?.recipientId);
    const note =
      typeof req.body?.note === "string"
        ? req.body.note.trim().slice(0, 500)
        : "";

    if (
      !Number.isInteger(resourceId) ||
      resourceId <= 0 ||
      !Number.isInteger(recipientId) ||
      recipientId <= 0
    ) {
      res
        .status(400)
        .json({ error: "A valid resource and recipient are required" });
      return;
    }
    if (recipientId === auth.userId) {
      res.status(400).json({
        error: "Choose another person to receive this recommendation",
      });
      return;
    }

    const [[resource], [sender], [recipient]] = await Promise.all([
      db
        .select({ id: resourcesTable.id, title: resourcesTable.title })
        .from(resourcesTable)
        .where(eq(resourcesTable.id, resourceId)),
      db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, auth.userId)),
      db
        .select({
          id: usersTable.id,
          activeRole: usersTable.activeRole,
          bannedAt: usersTable.bannedAt,
        })
        .from(usersTable)
        .where(eq(usersTable.id, recipientId)),
    ]);

    if (!resource) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }
    if (!sender || !recipient || recipient.bannedAt) {
      res.status(404).json({ error: "Recipient not found" });
      return;
    }

    const message =
      sender.name +
      ' recommended "' +
      resource.title +
      '" to you.' +
      (note ? " Message: " + note : "");

    await db.insert(activityLogTable).values({
      userId: recipient.id,
      type: "resource",
      workspaceRole: recipient.activeRole === "teacher" ? "teacher" : "student",
      message,
    });

    res.status(201).json({ sent: true });
  },
);

// ── GET /resources/discover — public, stored open-catalog search ─────────────
// NOTE: must stay above /resources/:id

/** Extract and validate resource items from a raw AI text response. */
function parseDiscoverOutput(
  textOutput: string,
): ReturnType<typeof DiscoverResourcesResponse.parse> {
  const cleaned = textOutput
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  const items = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { resources?: unknown }).resources)
      ? (parsed as { resources: unknown[] }).resources
      : [];
  const validated = DiscoverResourcesResponse.safeParse(items);
  if (validated.success) return validated.data;

  // Salvage valid items individually
  return items
    .map((item: unknown) => {
      const r = DiscoverResourcesResponse.element.safeParse(item);
      return r.success ? r.data : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

/** Call the AI and return validated resource items. */
async function callDiscoverAI(
  prompt: string,
  maxItems = 8,
  userId: number | null = null,
): Promise<ReturnType<typeof DiscoverResourcesResponse.parse>> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 55000);
  try {
    const response = await openai.responses.create(
      {
        model: "gpt-5-nano",
        max_output_tokens:
          maxItems >= 18
            ? 3200
            : maxItems >= 16
              ? 2800
              : maxItems >= 12
                ? 2200
                : 1400,
        tools: [{ type: "web_search", search_context_size: "low" }],
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: "educational_resources",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["resources"],
              properties: {
                resources: {
                  type: "array",
                  minItems: 1,
                  maxItems,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "title",
                      "url",
                      "description",
                      "format",
                      "source",
                      "thumbnailUrl",
                      "subject",
                      "gradeLevel",
                    ],
                    properties: {
                      title: { type: "string" },
                      url: { type: "string" },
                      description: { type: "string" },
                      format: {
                        type: "string",
                        enum: [
                          "article",
                          "video",
                          "pdf",
                          "podcast",
                          "interactive",
                          "other",
                        ],
                      },
                      source: { type: "string" },
                      thumbnailUrl: { type: ["string", "null"] },
                      subject: { type: ["string", "null"] },
                      gradeLevel: { type: ["string", "null"] },
                    },
                  },
                },
              },
            },
          },
        },
        input: prompt,
      },
      { signal: ac.signal },
    );
    await recordAiUsage("search", userId);
    const textOutput =
      response.output_text ??
      response.output
        .flatMap((item) => (item.type === "message" ? item.content : []))
        .filter((item) => item.type === "output_text")
        .map((item) => item.text)
        .join("");
    return parseDiscoverOutput(textOutput);
  } finally {
    clearTimeout(timer);
  }
}

const DISCOVER_MIN_RESULTS = 3;
const DISCOVER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const discoverCache = new Map<
  string,
  {
    expiresAt: number;
    items: ReturnType<typeof DiscoverResourcesResponse.parse>;
  }
>();

function isDirectSourceUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      return (
        parts[0]?.startsWith("@") ||
        ["channel", "c", "user"].includes(parts[0] ?? "")
      );
    }
    if (host.endsWith("wikipedia.org")) return false;
    if (/\.(html?|pdf|docx?)$/i.test(url.pathname)) return false;
    return parts.length <= 2;
  } catch {
    return false;
  }
}

export function isDirectPeopleProfileUrl(rawUrl: string): boolean {
  if (/\s|%20/i.test(rawUrl)) return false;
  try {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    const first = parts[0]?.toLowerCase() ?? "";
    if (
      [
        "search",
        "arama",
        "ara",
        "explore",
        "topics",
        "publications",
        "news",
      ].includes(first)
    )
      return false;
    if (/\.(pdf|docx?|pptx?|xlsx?)$/i.test(url.pathname)) return false;

    if (host === "linkedin.com") return first === "in" && parts.length === 2;
    if (host === "youtube.com")
      return (
        parts.length >= 1 &&
        (parts[0].startsWith("@") || ["channel", "c", "user"].includes(first))
      );
    if (
      [
        "x.com",
        "twitter.com",
        "instagram.com",
        "tiktok.com",
        "github.com",
      ].includes(host)
    ) {
      return (
        parts.length === 1 && !["search", "explore", "topics"].includes(first)
      );
    }
    if (host === "scholar.google.com" || host.startsWith("scholar.google.")) {
      return url.pathname === "/citations" && !!url.searchParams.get("user");
    }
    if (host === "orcid.org")
      return (
        parts.length === 1 && /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(parts[0])
      );
    if (host === "researchgate.net")
      return first === "profile" && parts.length >= 2;
    if (host === "semanticscholar.org")
      return first === "author" && parts.length >= 2;

    const academicHost =
      host.endsWith(".edu") ||
      host.includes(".edu.") ||
      host.endsWith(".ac.uk") ||
      host.includes(".ac.");
    if (!academicHost || parts.length === 0) return false;
    const pathSegments = parts.map((part) => part.toLowerCase());
    if (
      pathSegments.some((part) =>
        /^(search|arama|haber|news|duyuru|announcement|publication|yayin|article|makale|award|press|event)/i.test(
          part,
        ),
      )
    )
      return false;
    if (
      pathSegments.some((part) =>
        /(^|[-_])(awards?|press|events?)([-_]|$)/i.test(part),
      )
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

function addProvenance<
  T extends { url: string; sourceCredibility?: SourceCredibility },
>(item: T, linkChecked: boolean) {
  const { sourceCredibility, ...publicItem } = item;
  try {
    const url = new URL(item.url);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const institutional =
      host.endsWith(".edu") ||
      host.includes(".edu.") ||
      host.includes(".ac.") ||
      host.endsWith(".gov") ||
      host.includes(".gov.");
    const establishedHosts = [
      "khanacademy.org",
      "wikipedia.org",
      "youtube.com",
      "ted.com",
      "coursera.org",
      "edx.org",
      "openstax.org",
      "orcid.org",
      "researchgate.net",
      "semanticscholar.org",
    ];
    const established = establishedHosts.some(
      (known) => host === known || host.endsWith(`.${known}`),
    );
    const provenanceLevel =
      sourceCredibility === "academic" ||
      sourceCredibility === "institutional" ||
      institutional
        ? ("institutional" as const)
        : sourceCredibility === "established" || established
          ? ("established" as const)
          : ("independent" as const);
    const provenanceSignals = [
      sourceCredibility === "academic"
        ? "Academic, scholarly, or editorially reviewed source"
        : sourceCredibility === "institutional"
          ? "Government, library, museum, or public institution"
          : sourceCredibility === "established"
            ? "Established educational publisher or platform"
            : sourceCredibility === "independent"
              ? "Independently published source reviewed for this catalogue"
              : institutional
                ? "Academic or government domain"
                : established
                  ? "Established publishing platform"
                  : "Independent website",
      url.protocol === "https:"
        ? "Encrypted HTTPS link"
        : "Unencrypted HTTP link",
      linkChecked
        ? "Link responded during this search"
        : "Link was not availability-checked",
    ];
    return {
      ...publicItem,
      provenanceLevel,
      provenanceSignals,
      linkChecked,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      ...publicItem,
      provenanceLevel: "unknown" as const,
      provenanceSignals: ["Domain could not be classified"],
      linkChecked: false,
      checkedAt: new Date().toISOString(),
    };
  }
}

router.get(
  "/resources/discover",
  discoverLimiter,
  async (req, res): Promise<void> => {
    const params = DiscoverResourcesQueryParams.safeParse(req.query);
    if (!params.success) {
      res.status(400).json({ error: "Missing query parameter: q" });
      return;
    }

    const {
      q,
      format,
      subject,
      gradeLevel,
      language = "en",
      page = 1,
      resultType = "content",
    } = params.data;
    const exactPhrase = queryString(req.query.exactPhrase);
    const excludedWords = queryString(req.query.exclude);
    const sourceFilter = queryString(req.query.source);
    const freshness = queryString(req.query.freshness);
    const difficulty = queryString(req.query.difficulty);
    const accessType = queryString(req.query.accessType);
    const license = queryString(req.query.license);
    const contentLength = queryString(req.query.contentLength);
    const sourceQuality = queryString(req.query.sourceQuality);
    const captions = queryBoolean(req.query.captions);
    const transcript = queryBoolean(req.query.transcript);
    let discoverUserId: number | null = null;
    try {
      const { decodeToken } = await import("../lib/auth");
      const auth = req.headers.authorization;
      if (auth?.startsWith("Bearer "))
        discoverUserId = decodeToken(auth.slice(7))?.userId ?? null;
    } catch {
      // Public discovery remains available without authentication.
    }
    const savedRows = discoverUserId
      ? await db
          .select({ url: resourcesTable.url })
          .from(resourcesTable)
          .where(eq(resourcesTable.submittedById, discoverUserId))
      : [];
    const savedUrlKeys = new Set(
      savedRows.map((row) => canonicalResourceUrl(row.url)),
    );
    const isUnsavedResult = (item: { url: string }) =>
      !savedUrlKeys.has(canonicalResourceUrl(item.url));

    const catalogOptions = {
      query: q,
      format,
      subject,
      gradeLevel,
      language,
      page,
      limit: resultType === "people" ? 18 : resultType === "source" ? 12 : 16,
      resultType,
      exactPhrase,
      excludedWords,
      source: sourceFilter,
      freshness,
      accessType,
      license,
      sourceQuality,
    } as const;
    let catalogItems = await searchCatalog(catalogOptions);
    const remoteCatalogMatchesCredibility =
      !sourceQuality || sourceQuality === "established";
    if (
      resultType === "content" &&
      page === 1 &&
      catalogItems.length < 8 &&
      remoteCatalogMatchesCredibility
    ) {
      await searchOpenLibraryAndStore(catalogOptions);
      await searchWikibooksAndStore(catalogOptions);
      catalogItems = await searchCatalog(catalogOptions);
    }
    const availableCatalogItems = catalogItems
      .filter(isUnsavedResult)
      .map((item) => addProvenance(item, true));
    const aiFallbackEnabled =
      resultType === "people"
        ? process.env.AI_PUBLIC_PROFILE_SEARCH_ENABLED === "true"
        : process.env.AI_RESOURCE_SEARCH_ENABLED === "true";
    if (availableCatalogItems.length > 0 || !aiFallbackEnabled) {
      res.setHeader("X-Search-Provider", "stored-catalog");
      res.setHeader("X-Search-Cache", "DATABASE");
      res.json(availableCatalogItems);
      return;
    }

    // Paid discovery is an explicit opt-in fallback; normal catalog searches
    // do not consume a user's AI allowance.
    if (!isAdminRequest(req)) {
      const configuredLimit = (value: string | undefined, fallback: number) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0
          ? Math.floor(parsed)
          : fallback;
      };
      const userBudget = await consumeAiQuota(
        "discover-ai-user-day",
        discoverUserId ? `user:${discoverUserId}` : `ip:${req.ip ?? "unknown"}`,
        24 * 60 * 60 * 1000,
        configuredLimit(process.env.AI_SEARCH_DAILY_USER_LIMIT, 3),
      );
      if (!userBudget.allowed) {
        res.setHeader("Retry-After", userBudget.retryAfter);
        res.status(429).json({
          error: "Daily AI search limit reached.",
          retryAfter: userBudget.retryAfter,
        });
        return;
      }
      const globalBudget = await consumeAiQuota(
        "discover-ai-global-day",
        "all",
        24 * 60 * 60 * 1000,
        configuredLimit(process.env.AI_SEARCH_DAILY_LIMIT, 20),
      );
      if (!globalBudget.allowed) {
        res.setHeader("Retry-After", globalBudget.retryAfter);
        res.status(429).json({
          error: "Daily AI search budget reached.",
          retryAfter: globalBudget.retryAfter,
        });
        return;
      }
    }

    const exactPersonSearch =
      resultType === "people" &&
      q.trim().toLowerCase().startsWith("exact-person:");
    const effectiveQuery = exactPersonSearch
      ? q.trim().slice("exact-person:".length).trim()
      : q;
    const cacheKey = JSON.stringify({
      q: q.trim().toLowerCase(),
      format,
      subject: subject?.trim().toLowerCase(),
      gradeLevel,
      language,
      page,
      resultType,
      exactPhrase,
      excludedWords,
      sourceFilter,
      freshness,
      difficulty,
      accessType,
      license,
      contentLength,
      sourceQuality,
      captions,
      transcript,
      userId: discoverUserId,
    });
    if (process.env.NODE_ENV !== "test") {
      const cached = discoverCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.setHeader("X-Search-Cache", "HIT");
        res.json(cached.items.filter(isUnsavedResult));
        return;
      }
      if (cached) discoverCache.delete(cacheKey);
    }

    const languageNames: Record<string, string> = {
      en: "English",
      es: "Spanish",
      fr: "French",
      de: "German",
      pt: "Portuguese",
      tr: "Turkish",
    };
    const languageHint =
      language === "any"
        ? ""
        : ` Return results whose content is available in ${languageNames[language] ?? "English"}, and write titles and descriptions in that language.`;
    const formatHint = format ? ` Focus on ${format} resources.` : "";
    const subjectHint = subject ? ` Subject area: ${subject}.` : "";
    const gradeHint = gradeLevel
      ? ` Target audience: ${gradeLevel} students.`
      : "";
    const pageHint =
      page > 1
        ? ` Find a DIFFERENT set of resources from what you would normally return first — skip the most obvious results and surface less commonly known but equally high-quality alternatives.`
        : "";
    const extendedFilterHints = [
      exactPhrase
        ? `The page title or content must contain the exact phrase "${exactPhrase}".`
        : "",
      excludedWords
        ? `Exclude results about any of these terms: ${excludedWords}.`
        : "",
      sourceFilter
        ? `Only use results from this website, publisher, creator, or domain: ${sourceFilter}.`
        : "",
      freshness === "week"
        ? "Prefer resources published or updated within the past week."
        : freshness === "month"
          ? "Prefer resources published or updated within the past month."
          : freshness === "year"
            ? "Only return resources published or updated within the past year."
            : freshness === "three_years"
              ? "Only return resources published or updated within the past three years."
              : "",
      difficulty && difficulty !== "any"
        ? `The learning difficulty must be ${difficulty}.`
        : "",
      accessType === "free"
        ? "Only return resources that can be used without payment or a subscription."
        : accessType === "no_account"
          ? "Only return resources that can be opened without creating an account."
          : accessType === "open"
            ? "Prefer open-access resources."
            : "",
      license === "reusable"
        ? "Only return resources with an open, Creative Commons, or public-domain reuse license."
        : license === "known"
          ? "Only return resources whose license or usage rights are clearly stated."
          : "",
      contentLength === "short"
        ? "Prefer resources requiring at most 15 minutes."
        : contentLength === "medium"
          ? "Prefer resources requiring about 15 to 45 minutes."
          : contentLength === "long"
            ? "Prefer substantial resources requiring more than 45 minutes."
            : "",
      sourceQuality === "academic"
        ? "Only return scholarly, peer-reviewed, university-press, or academically edited sources. Clearly disclose preprints."
        : sourceQuality === "institutional"
          ? "Only return government, university, library, museum, or public-institution sources."
          : sourceQuality === "established"
            ? "Only return well-established educational publishers and learning platforms."
            : sourceQuality === "independent"
              ? "Only return reputable independent educational creators with transparent authorship, HTTPS, and no unsafe downloads."
              : "",
      captions === true
        ? "For video or audio, captions must be available."
        : "",
      transcript === true
        ? "For video or audio, a transcript must be available."
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    const requestedCount = exactPersonSearch
      ? 8
      : resultType === "people"
        ? 18
        : resultType === "source"
          ? 12
          : 16;

    const buildPrompt = (excludeUrls: string[] = [], platformPass = false) => {
      const exclusionNote =
        excludeUrls.length > 0
          ? `\nDo NOT include any of these URLs (they are unreachable):\n${excludeUrls.map((u) => `- ${u}`).join("\n")}`
          : "";
      const platformSearchRules =
        exactPersonSearch && platformPass
          ? `This is the platform-coverage pass. Run targeted searches for the exact name and affiliation using site:linkedin.com/in, site:scholar.google.com/citations, site:orcid.org, site:researchgate.net/profile, site:github.com, and the official institution domain. Prioritize a direct LinkedIn profile when one is publicly indexed. Return only links confidently belonging to the same person.`
          : "";
      const sourceRules =
        resultType === "source"
          ? "Return ONLY official publisher or institution landing pages and direct creator channel pages. Never return an individual article, lesson, course, video, episode, PDF, Wikipedia article, search page, category page, or playlist. For YouTube use a handle URL or /channel/... URL, never /watch or /playlist."
          : resultType === "people"
            ? "Return ONLY direct public profiles of real students, researchers, educators, or subject professionals. Include official university faculty pages, Google Scholar, ORCID, ResearchGate, Semantic Scholar, LinkedIn, YouTube, X, Instagram, TikTok, or GitHub. Each URL must open that person profile, not a post, video, search page, company, school, topic, or hashtag. Do not guess handles or invent profiles."
            : "Recommend specific lessons, articles, videos, documents, episodes, or interactive activities rather than generic homepages.";
      const kind =
        resultType === "source"
          ? "sources and channels"
          : resultType === "people"
            ? "people and verified public profiles"
            : "resources";
      const preferenceRules =
        resultType === "people"
          ? exactPersonSearch
            ? "Return profiles belonging ONLY to this exact person and affiliation. Never broaden to related people or namesakes. "
            : "For broad subject, interest, department, or profession searches, return one best identity URL per distinct person and maximize distinct relevant people; do not spend the first response listing many links for one person. Search specifically for the exact person name first. When a university or country is present, prioritize the official university faculty profile, then Google Scholar or ORCID, then established social profiles. Preserve Turkish characters and also try their ASCII equivalents only as a fallback. Prefer established public-facing educators, researchers, science communicators, and subject professionals when private student profiles cannot be verified."
          : resultType === "source"
            ? "Prefer official organisations, universities, nonprofits, and established educator channels."
            : "Prefer Khan Academy, MIT OpenCourseWare, Wikipedia, TED-Ed, and CrashCourse when relevant.";
      return `Suggest up to ${requestedCount} high-quality educational ${kind} for: "${effectiveQuery}"${subjectHint}${gradeHint}${languageHint}${resultType === "content" ? formatHint : ""}${pageHint}

Search the web and recommend reputable, publicly accessible results. Treat the complete query as an exact name or title first: search for the exact phrase and rank an exact matching person, profile, resource title, website, or channel first when it exists. Only broaden to related matches after exact matches. Use the full result allowance and return ${requestedCount} distinct results whenever enough credible matches exist. ${extendedFilterHints} ${sourceRules} Return a JSON object with a single "resources" array. Each item: title, url, description (1 sentence), format ("article"|"video"|"pdf"|"podcast"|"interactive"|"other"), source, thumbnailUrl (null or YouTube hqdefault URL), subject, gradeLevel.
Rules: use only exact canonical URLs found in the current web-search results; never invent or reconstruct a URL path; the page title and content must match the recommendation; ${preferenceRules} ${platformSearchRules} No search-result pages or paywalls; Match the required response schema exactly; no markdown.${exclusionNote}`;
    };

    try {
      // ── First AI call ────────────────────────────────────────────────────────
      const rawFirstBatch = await callDiscoverAI(
        buildPrompt(),
        requestedCount,
        discoverUserId,
      );
      const firstBatch =
        resultType === "source"
          ? rawFirstBatch.filter(
              (item) => isDirectSourceUrl(item.url) && isUnsavedResult(item),
            )
          : resultType === "people"
            ? rawFirstBatch.filter((item) => isDirectPeopleProfileUrl(item.url))
            : rawFirstBatch;

      if (firstBatch.length === 0 && resultType === "content") {
        res.status(502).json({ error: "AI returned invalid resource data" });
        return;
      }

      // Validate all result URLs in parallel with a short timeout. Thumbnail URLs
      // are left to the browser so they cannot hold up otherwise useful results.
      const reachable =
        resultType === "people"
          ? firstBatch
          : await filterReachableUrls(firstBatch, 2000);

      const minimumResults =
        resultType === "people"
          ? 12
          : resultType === "source"
            ? 6
            : Math.max(DISCOVER_MIN_RESULTS, 8);
      if (!exactPersonSearch && reachable.length >= minimumResults) {
        if (process.env.NODE_ENV !== "test")
          discoverCache.set(cacheKey, {
            expiresAt: Date.now() + DISCOVER_CACHE_TTL_MS,
            items: reachable.map((item) =>
              addProvenance(item, resultType !== "people"),
            ),
          });
        res.setHeader("X-Search-Cache", "MISS");
        res.json(
          reachable.map((item) => addProvenance(item, resultType !== "people")),
        );
        return;
      }

      // ── Too few live results — retry once, excluding known-dead URLs ──────────
      const reachableSet = new Set(reachable.map((r) => r.url));
      const deadUrls = firstBatch
        .filter((item) => !reachableSet.has(item.url))
        .map((item) => item.url);

      if (!paidRetryAllowed()) {
        if (reachable.length > 0) {
          res.setHeader("X-Search-Cache", "MISS");
          res.json(
            reachable.map((item) =>
              addProvenance(item, resultType !== "people"),
            ),
          );
        } else if (resultType === "people") {
          throw new Error("No valid public profiles returned");
        } else {
          res
            .status(502)
            .json({ error: "No reachable results found. Please try again." });
        }
        return;
      }

      console.warn(
        `Discover: ${deadUrls.length} dead URL(s) on first pass; re-invoking AI.`,
      );

      const rawSecondBatch = await callDiscoverAI(
        buildPrompt(deadUrls, exactPersonSearch),
        requestedCount,
        discoverUserId,
      );
      const secondBatch =
        resultType === "source"
          ? rawSecondBatch.filter(
              (item) => isDirectSourceUrl(item.url) && isUnsavedResult(item),
            )
          : resultType === "people"
            ? rawSecondBatch.filter((item) =>
                isDirectPeopleProfileUrl(item.url),
              )
            : rawSecondBatch;
      const reachableSecond =
        resultType === "people"
          ? secondBatch
          : await filterReachableUrls(secondBatch, 2000);

      // Merge survivors from both batches, deduplicated by URL
      const merged = [...reachable];
      for (const item of reachableSecond) {
        if (!reachableSet.has(item.url)) {
          merged.push(item);
          reachableSet.add(item.url);
        }
      }

      if (merged.length === 0) {
        if (resultType === "people") {
          throw new Error("No valid public profiles returned");
        }
        res
          .status(502)
          .json({ error: "No reachable results found. Please try again." });
        return;
      }

      if (process.env.NODE_ENV !== "test")
        discoverCache.set(cacheKey, {
          expiresAt: Date.now() + DISCOVER_CACHE_TTL_MS,
          items: merged.map((item) =>
            addProvenance(item, resultType !== "people"),
          ),
        });
      res.setHeader("X-Search-Cache", "MISS");
      res.json(
        merged.map((item) => addProvenance(item, resultType !== "people")),
      );
    } catch (err) {
      console.error("Discover AI error:", err);

      // Keep recently cached results usable during an upstream billing or
      // availability incident, even after their normal freshness window.
      const stale = discoverCache.get(cacheKey);
      if (stale?.items.length) {
        res.setHeader("X-Search-Cache", "STALE");
        res.json(stale.items);
        return;
      }

      const upstreamStatus =
        typeof err === "object" && err !== null && "status" in err
          ? Number((err as { status?: unknown }).status)
          : null;
      const upstreamMessage = err instanceof Error ? err.message : String(err);
      if (
        upstreamStatus === 429 &&
        /no credits remaining|billing/i.test(upstreamMessage)
      ) {
        res.status(503).json({
          error:
            "Web search is temporarily unavailable because the AI service has no credits.",
          code: "AI_CREDITS_EXHAUSTED",
        });
        return;
      }

      res.status(502).json({ error: "Search failed. Please try again." });
    }
  },
);

// ── POST /resources/prefetch — public ────────────────────────────────────────
// Must stay above /resources/:id

router.post(
  "/resources/prefetch",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = PrefetchResourceMetadataBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid 'url' field" });
      return;
    }

    const { url } = parsed.data;

    // Validate that it's a valid absolute http(s) URL
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        res.status(400).json({ error: "URL must use http or https protocol" });
        return;
      }
    } catch {
      res
        .status(400)
        .json({ error: "Invalid URL — must be an absolute http/https URL" });
      return;
    }

    // ── 1. Detect format heuristically from the URL ──────────────────────────
    function detectFormat(
      u: string,
    ): "video" | "pdf" | "podcast" | "article" | "interactive" | "other" {
      try {
        const parsed = new URL(u);
        const hostname = parsed.hostname.replace(/^www\./, "");
        if (
          [
            "youtube.com",
            "youtu.be",
            "vimeo.com",
            "loom.com",
            "wistia.com",
          ].includes(hostname)
        )
          return "video";
        if (parsed.pathname.toLowerCase().endsWith(".pdf")) return "pdf";
        if (
          [
            "podcasts.apple.com",
            "open.spotify.com",
            "soundcloud.com",
            "anchor.fm",
            "buzzsprout.com",
          ].includes(hostname)
        )
          return "podcast";
        if (
          [
            "kahoot.com",
            "quizlet.com",
            "desmos.com",
            "phet.colorado.edu",
            "scratch.mit.edu",
          ].includes(hostname)
        )
          return "interactive";
      } catch {
        /* ignore */
      }
      return "article";
    }

    // ── 2. Extract YouTube video ID for thumbnail ────────────────────────────
    function getYouTubeId(u: string): string | null {
      try {
        const p = new URL(u);
        if (p.hostname === "youtu.be") return p.pathname.slice(1).split("?")[0];
        if (p.hostname.includes("youtube.com")) {
          const v = p.searchParams.get("v");
          if (v) return v;
          const m = p.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
          if (m) return m[1];
        }
      } catch {
        /* ignore */
      }
      return null;
    }

    const heuristicFormat = detectFormat(url);
    const ytId = getYouTubeId(url);
    const ytThumbnail = ytId
      ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
      : null;

    // ── 3. Read publisher metadata directly — no AI credits ─────────────────
    const decodeEntities = (value: string) =>
      value
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/\s+/g, " ")
        .trim();
    const metaContent = (html: string, key: string) => {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(
          `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
          "i",
        ),
        new RegExp(
          `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
          "i",
        ),
      ];
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) return decodeEntities(match[1]);
      }
      return "";
    };
    try {
      if (ytId) {
        const oembed = new URL("https://www.youtube.com/oembed");
        oembed.searchParams.set("url", url);
        oembed.searchParams.set("format", "json");
        const response = await fetch(oembed, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          const metadata = (await response.json()) as {
            title?: unknown;
            author_name?: unknown;
            thumbnail_url?: unknown;
          };
          const author =
            typeof metadata.author_name === "string"
              ? metadata.author_name.trim()
              : "";
          res.json({
            title:
              typeof metadata.title === "string"
                ? metadata.title.trim().slice(0, 160)
                : "",
            description: author ? `Video by ${author}.` : "",
            format: "video",
            thumbnailUrl:
              typeof metadata.thumbnail_url === "string"
                ? metadata.thumbnail_url
                : ytThumbnail,
          });
          return;
        }
      }
      if (heuristicFormat === "pdf") {
        const fileName = decodeURIComponent(
          new URL(url).pathname.split("/").pop() ?? "",
        )
          .replace(/\.pdf$/i, "")
          .replace(/[-_]+/g, " ");
        res.json({
          title: fileName.slice(0, 160),
          description: "",
          format: "pdf",
          thumbnailUrl: null,
        });
        return;
      }
      const page = await fetchPublicText(url);
      const titleMatch = page.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = decodeEntities(
        metaContent(page.text, "og:title") || titleMatch?.[1] || "",
      ).slice(0, 160);
      const description = decodeEntities(
        metaContent(page.text, "og:description") ||
          metaContent(page.text, "description"),
      ).slice(0, 300);
      const rawImage = metaContent(page.text, "og:image");
      let thumbnailUrl = ytThumbnail;
      if (rawImage) {
        try {
          const candidate = new URL(rawImage, page.url);
          thumbnailUrl = ["http:", "https:"].includes(candidate.protocol)
            ? candidate.toString()
            : ytThumbnail;
        } catch {
          /* keep heuristic */
        }
      }
      res.json({ title, description, format: heuristicFormat, thumbnailUrl });
    } catch (err) {
      console.warn("Resource metadata prefetch failed:", err);
      res.json({
        title: "",
        description: "",
        format: heuristicFormat,
        thumbnailUrl: ytThumbnail,
      });
    }
  },
);

// ── POST /resources ───────────────────────────────────────────────────────────

router.post(
  "/resources",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole, accountRole } = req as AuthenticatedRequest;
    const parsed = CreateResourceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    // Verification is always computed server-side — it is absent from
    // CreateResourceBody, so a client can never assert its own status.
    const verification = await classifySubmission(parsed.data.url, userId, accountRole);
    const [resource] = await db
      .insert(resourcesTable)
      .values({
        ...parsed.data,
        submittedById: userId,
        workspaceRole: userRole as "student" | "teacher",
        ...verification,
      })
      .returning();
    res.status(201).json(
      CreateResourceResponse.parse({
        ...resource,
        avgRating: 0,
        reviewCount: 0,
      }),
    );
  },
);

// ── GET /resources/oembed — server-side OEmbed proxy (must stay above /:id) ──
// Avoids browser CORS failures when resolving Vimeo / Loom thumbnail URLs.

const OEMBED_TIMEOUT_MS = 4000;
const OEMBED_ALLOWED_HOSTS: Record<string, string> = {
  "vimeo.com": "https://vimeo.com/api/oembed.json?url=",
  "www.vimeo.com": "https://vimeo.com/api/oembed.json?url=",
  "loom.com": "https://www.loom.com/v1/oembed?url=",
  "www.loom.com": "https://www.loom.com/v1/oembed?url=",
  "share.loom.com": "https://www.loom.com/v1/oembed?url=",
};

async function fetchOembedThumbnail(oembedUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const res = await fetch(oembedUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Casparel-OEmbed/1.0" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { thumbnail_url?: string };
    return data.thumbnail_url ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

router.get("/resources/oembed", async (req, res): Promise<void> => {
  const rawUrl = req.query.url as string | undefined;
  if (!rawUrl) {
    res.status(400).json({ error: "Missing url query parameter" });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "Invalid url" });
    return;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    res.status(400).json({ error: "Only http/https URLs are supported" });
    return;
  }

  // Strict allowlist — only known OEmbed providers, exact hostname match
  const oembedBase = OEMBED_ALLOWED_HOSTS[parsed.hostname];
  if (!oembedBase) {
    res.json({ thumbnailUrl: null });
    return;
  }

  const thumb = await fetchOembedThumbnail(
    `${oembedBase}${encodeURIComponent(rawUrl)}`,
  );
  res.json({ thumbnailUrl: thumb });
});

// ── GET /resources/:id ────────────────────────────────────────────────────────

router.get("/resources/:id", async (req, res): Promise<void> => {
  const params = GetResourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const resource = await resourceWithRating(params.data.id);
  if (!resource) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  res.json(GetResourceResponse.parse(resource));
});

// ── PATCH /resources/:id ──────────────────────────────────────────────────────

router.patch("/resources/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UpdateResourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isResourceOwner(params.data.id, userId))) {
    res
      .status(403)
      .json({ error: "Only the submitter can update this resource" });
    return;
  }
  const parsed = UpdateResourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [resource] = await db
    .update(resourcesTable)
    .set(parsed.data)
    .where(eq(resourcesTable.id, params.data.id))
    .returning();
  if (!resource) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  const withRating = await resourceWithRating(resource.id);
  res.json(UpdateResourceResponse.parse(withRating));
});

// ── DELETE /resources/:id ─────────────────────────────────────────────────────

router.delete(
  "/resources/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const params = DeleteResourceParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // Owner-only deletion. Teacher bypass is intentionally removed: because any
    // account can now switch to the teacher role via PATCH /users/me/role, a
    // teacher-may-delete-any-resource rule would let any user delete others'
    // resources after a trivial role switch. A separate, explicitly reviewed
    // moderation feature should be added if admins need that capability.
    if (!(await isResourceOwner(params.data.id, userId))) {
      res
        .status(403)
        .json({ error: "Only the submitter can delete this resource" });
      return;
    }
    await db
      .delete(resourcesTable)
      .where(eq(resourcesTable.id, params.data.id));
    res.sendStatus(204);
  },
);

export default router;
