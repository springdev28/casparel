import { Router, type IRouter } from "express";
import { eq, sql, ilike, and, inArray, notInArray } from "drizzle-orm";
import { db, resourcesTable, reviewsTable } from "@workspace/db";
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
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { isResourceOwner } from "../lib/authz";
import { openai } from "@workspace/integrations-openai-ai-server";
import { contentLimiter } from "../lib/limiters";

const router: IRouter = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

async function resourceWithRating(id: number) {
  const [r] = await db.select().from(resourcesTable).where(eq(resourcesTable.id, id));
  if (!r) return null;
  const [stats] = await db
    .select({
      avg: sql<number>`coalesce(avg(rating), 0)`,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.resourceId, id));
  return { ...r, avgRating: Math.round(Number(stats.avg) * 10) / 10, reviewCount: stats.count };
}

async function topRatedResources(limit = 12) {
  // all resources ordered by avg rating descending
  const rows = await db
    .select({
      id: resourcesTable.id,
      avg: sql<number>`coalesce((select avg(rating) from reviews where resource_id = resources.id), 0)`,
    })
    .from(resourcesTable)
    .orderBy(sql`coalesce((select avg(rating) from reviews where resource_id = resources.id), 0) desc`)
    .limit(limit);
  const results = await Promise.all(rows.map((r) => resourceWithRating(r.id)));
  return results.filter(Boolean);
}

// ── GET /resources — public ───────────────────────────────────────────────────

router.get("/resources", async (req, res): Promise<void> => {
  const params = ListResourcesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { q, format, subject, gradeLevel } = params.data;
  const conditions = [];
  if (q) conditions.push(ilike(resourcesTable.title, `%${q}%`));
  if (format) conditions.push(eq(resourcesTable.format, format as "article" | "video" | "pdf" | "podcast" | "interactive" | "other"));
  if (subject) conditions.push(eq(resourcesTable.subject, subject));
  if (gradeLevel) conditions.push(eq(resourcesTable.gradeLevel, gradeLevel));

  const rows =
    conditions.length > 0
      ? await db.select().from(resourcesTable).where(and(...conditions))
      : await db.select().from(resourcesTable);

  const resources = await Promise.all(rows.map((r) => resourceWithRating(r.id)));
  res.json(ListResourcesResponse.parse(resources.filter(Boolean)));
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

  const resources = await Promise.all(rows.map((r) => resourceWithRating(r.resourceId)));
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
    // Not logged in → return top-rated resources
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
    .select({ subject: resourcesTable.subject, count: sql<number>`cast(count(*) as int)` })
    .from(reviewsTable)
    .innerJoin(resourcesTable, eq(reviewsTable.resourceId, resourcesTable.id))
    .where(eq(reviewsTable.userId, userId))
    .groupBy(resourcesTable.subject)
    .orderBy(sql`count(*) desc`)
    .limit(4);

  const topSubjects = subjectStats.map((s) => s.subject);

  let candidates: number[] = [];

  if (topSubjects.length > 0) {
    // Resources in preferred subjects not yet reviewed by this user
    const conditions = [inArray(resourcesTable.subject, topSubjects)];
    if (reviewedIds.length > 0) conditions.push(notInArray(resourcesTable.id, reviewedIds));

    const rows = await db
      .select({ id: resourcesTable.id })
      .from(resourcesTable)
      .where(and(...conditions))
      .orderBy(sql`coalesce((select avg(rating) from reviews where resource_id = resources.id), 0) desc`)
      .limit(12);

    candidates = rows.map((r) => r.id);
  }

  // Pad with top-rated resources if not enough personalised results
  if (candidates.length < 6) {
    const exclude = [...reviewedIds, ...candidates];
    const conditions = exclude.length > 0
      ? [notInArray(resourcesTable.id, exclude)]
      : [];
    const extra = await db
      .select({ id: resourcesTable.id })
      .from(resourcesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`coalesce((select avg(rating) from reviews where resource_id = resources.id), 0) desc`)
      .limit(12 - candidates.length);
    candidates = [...candidates, ...extra.map((r) => r.id)];
  }

  const results = await Promise.all(candidates.map((id) => resourceWithRating(id)));
  res.json(GetResourceRecommendationsResponse.parse(results.filter(Boolean)));
});

// ── GET /resources/discover — public, AI web search ──────────────────────────
// NOTE: must stay above /resources/:id

router.get("/resources/discover", async (req, res): Promise<void> => {
  const params = DiscoverResourcesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Missing query parameter: q" });
    return;
  }

  const { q, format, subject, gradeLevel } = params.data;

  const formatHint = format ? ` Focus on ${format} resources.` : "";
  const subjectHint = subject ? ` Subject area: ${subject}.` : "";
  const gradeHint = gradeLevel ? ` Target audience: ${gradeLevel} students.` : "";

  const prompt = `You are an educational research assistant. Search the web and find 8–12 high-quality educational resources matching this query: "${q}"${subjectHint}${gradeHint}${formatHint}

Return ONLY a JSON array. Each element must have these fields:
- title: string — full title of the resource
- url: string — direct URL to the resource
- description: string — 1–2 sentence description of what the resource covers
- format: one of "article" | "video" | "pdf" | "podcast" | "interactive" | "other"
- source: string — name of the website/publisher/channel (e.g. "Khan Academy", "MIT OpenCourseWare", "YouTube")
- thumbnailUrl: string or null — YouTube thumbnails follow https://img.youtube.com/vi/{videoId}/hqdefault.jpg
- subject: string or null — academic subject
- gradeLevel: string or null — target grade level if apparent

Rules:
- Only include real, publicly accessible URLs
- Prefer reputable educational sources: Khan Academy, Coursera, MIT OCW, Wikipedia, TED-Ed, CrashCourse, universities, governments
- Include a diverse mix of formats unless a specific format was requested
- No paywalled content
- Return ONLY the JSON array, no markdown fences, no extra text`;

  try {
    const response = await openai.responses.create({
      model: "gpt-4o",
      tools: [{ type: "web_search_preview" }],
      input: prompt,
    });

    const textOutput = response.output
      .filter((b) => b.type === "message")
      .flatMap((b) =>
        (b as { type: string; content: Array<{ type: string; text?: string }> }).content
          .filter((c) => c.type === "output_text" && c.text)
          .map((c) => c.text as string)
      )
      .join("");

    const cleaned = textOutput
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      res.status(502).json({ error: "AI returned unparseable response" });
      return;
    }

    const validated = DiscoverResourcesResponse.safeParse(parsed);
    if (!validated.success) {
      const items = Array.isArray(parsed) ? parsed : [];
      const salvaged = items
        .map((item) => {
          const r = DiscoverResourcesResponse.element.safeParse(item);
          return r.success ? r.data : null;
        })
        .filter(Boolean);

      if (salvaged.length === 0) {
        res.status(502).json({ error: "AI returned invalid resource data" });
        return;
      }
      res.json(salvaged);
      return;
    }

    res.json(validated.data);
  } catch (err) {
    console.error("Discover AI error:", err);
    res.status(502).json({ error: "Search failed. Please try again." });
  }
});

// ── POST /resources ───────────────────────────────────────────────────────────

router.post("/resources", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = CreateResourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [resource] = await db
    .insert(resourcesTable)
    .values({ ...parsed.data, submittedById: userId })
    .returning();
  res.status(201).json(
    CreateResourceResponse.parse({ ...resource, avgRating: 0, reviewCount: 0 }),
  );
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
    res.status(403).json({ error: "Only the submitter can update this resource" });
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

router.delete("/resources/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = DeleteResourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isResourceOwner(params.data.id, userId))) {
    res.status(403).json({ error: "Only the submitter can delete this resource" });
    return;
  }
  await db.delete(resourcesTable).where(eq(resourcesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
