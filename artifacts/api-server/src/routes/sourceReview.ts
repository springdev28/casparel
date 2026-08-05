import {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, resourcesTable, sourceReviewCacheTable } from "@workspace/db";
import {
  GetResourceSourceReviewParams,
  GetResourceSourceReviewQueryParams,
  GetResourceSourceReviewResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { consumeAiQuota, recordAiUsage } from "../lib/aiCostControls";

const router: IRouter = Router();
const QUICK_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const DEEP_CACHE_MS = 90 * 24 * 60 * 60 * 1000;
const activeDeepUsers = new Set<number>();
const activeReviews = new Set<string>();

function canonicalResourceUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["fbclid", "gclid", "si"].includes(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase();
    while (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

async function cacheReview(
  canonicalUrl: string,
  mode: "quick" | "deep",
  report: unknown,
) {
  if (process.env.NODE_ENV === "test") return;
  const timestamp = new Date();
  const expiresAt = new Date(
    timestamp.getTime() + (mode === "deep" ? DEEP_CACHE_MS : QUICK_CACHE_MS),
  ).toISOString();
  const updatedAt = timestamp.toISOString();
  await db
    .insert(sourceReviewCacheTable)
    .values({ canonicalUrl, mode, report, expiresAt, updatedAt })
    .onConflictDoUpdate({
      target: [
        sourceReviewCacheTable.canonicalUrl,
        sourceReviewCacheTable.mode,
      ],
      set: { report, expiresAt, updatedAt },
    });
}

function requireAccountForDeep(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const query = GetResourceSourceReviewQueryParams.safeParse(req.query);
  if (
    process.env.NODE_ENV !== "test" &&
    query.success &&
    query.data.mode === "deep"
  ) {
    requireAuth(req, res, next);
    return;
  }
  next();
}

// GET /resources/:id/source-review — public (no auth required)
router.get(
  "/resources/:id/source-review",
  requireAccountForDeep,
  async (req, res): Promise<void> => {
    const params = GetResourceSourceReviewParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const query = GetResourceSourceReviewQueryParams.safeParse(req.query);
    if (!query.success) {
      res
        .status(400)
        .json({ error: "Invalid mode — must be 'quick' or 'deep'" });
      return;
    }
    const mode = query.data.mode;

    const [resource] = await db
      .select()
      .from(resourcesTable)
      .where(eq(resourcesTable.id, params.data.id));

    if (!resource) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    const { title, url } = resource;
    const canonicalUrl = canonicalResourceUrl(url);
    const reviewKey = mode + ":" + canonicalUrl;
    const now = new Date().toISOString();
    const cached =
      process.env.NODE_ENV === "test"
        ? undefined
        : (
            await db
              .select()
              .from(sourceReviewCacheTable)
              .where(
                and(
                  eq(sourceReviewCacheTable.canonicalUrl, canonicalUrl),
                  eq(sourceReviewCacheTable.mode, mode),
                  gt(sourceReviewCacheTable.expiresAt, now),
                ),
              )
              .limit(1)
          )[0];
    if (cached) {
      const report = GetResourceSourceReviewResponse.safeParse(cached.report);
      if (report.success) {
        res.setHeader("X-Source-Review-Cache", "HIT");
        res.json(report.data);
        return;
      }
    }

    let deepUserId: number | null = null;
    if (mode === "deep" && process.env.NODE_ENV !== "test") {
      deepUserId = (req as AuthenticatedRequest).userId;
      if (activeDeepUsers.has(deepUserId) || activeReviews.has(reviewKey)) {
        res.status(429).json({
          error:
            "A deep research request is already running. Please wait for it to finish.",
        });
        return;
      }
      if ((req as AuthenticatedRequest).accountRole !== "admin") {
        const daily = await consumeAiQuota(
          "deep-user-day",
          String(deepUserId),
          24 * 60 * 60 * 1000,
          2,
        );
        if (!daily.allowed) {
          res.setHeader("Retry-After", daily.retryAfter);
          res.status(429).json({
            error: "Daily deep research limit reached.",
            retryAfter: daily.retryAfter,
          });
          return;
        }
        const monthly = await consumeAiQuota(
          "deep-user-month",
          String(deepUserId),
          30 * 24 * 60 * 60 * 1000,
          2,
        );
        if (!monthly.allowed) {
          res.setHeader("Retry-After", monthly.retryAfter);
          res.status(429).json({
            error: "Monthly deep research limit reached.",
            retryAfter: monthly.retryAfter,
          });
          return;
        }
        const globalDaily = await consumeAiQuota(
          "deep-global-day",
          "all",
          24 * 60 * 60 * 1000,
          200,
        );
        if (!globalDaily.allowed) {
          res.setHeader("Retry-After", globalDaily.retryAfter);
          res.status(429).json({
            error: "Today’s deep research budget has been reached.",
            retryAfter: globalDaily.retryAfter,
          });
          return;
        }
      }
      activeDeepUsers.add(deepUserId);
      activeReviews.add(reviewKey);
    }

    const basePrompt = `You are a research assistant helping students evaluate the credibility and background of an educational resource.

Resource title: "${title}"
Resource URL: ${url}

Please provide a structured JSON response with the following fields:
- sourceName: The name of the organisation, channel, institution, or individual who created/hosts this resource
- sourceType: One of: "university", "nonprofit", "government", "news-outlet", "youtube-channel", "individual", "publisher", "company", "open-courseware", "other"
- description: A 1-2 sentence description of the source
- founded: Year or approximate period the source was founded (or null if unknown)
- headquarters: City/country of the source (or null if unknown/not applicable)
- trustLevel: "high" if the source is a well-known accredited institution, government body, or established educational org; "medium" if reputable but less formal; "low" if unknown, unverified, or potentially biased; "unknown" if you cannot determine
- trustReason: A brief one-sentence explanation of the trust level rating
- summary: For quick mode, 2-3 sentences. For deep mode, a substantial 5-8 sentence executive assessment that synthesizes the evidence without repeating the sections below.
- reputationAnalysis: Deep mode only; 2-4 paragraphs on expertise, institutional standing, editorial practices, independence, funding or incentives, track record, and notable controversies. Null in quick mode.
- audienceSentiment: Deep mode only; 1-3 paragraphs describing recurring praise, criticism, and the size/limits of the public sample. Null in quick mode.
- contentQuality: Deep mode only; 1-3 paragraphs assessing accuracy, pedagogy, sourcing, accessibility, depth, and fit for learners. Null in quick mode.
- currencyAssessment: Deep mode only; 1-2 paragraphs assessing whether the material is current, stale, or timeless, with dates and cited evidence where available. Null in quick mode.
- strengths: Deep mode only; 3-5 specific evidence-backed strengths. Empty in quick mode.
- concerns: Deep mode only; 2-4 specific caveats, weaknesses, disputed points, or risks. Empty in quick mode.
- limitations: Deep mode only; 2-5 explicit research limitations, including unavailable comments, small samples, inaccessible pages, or uncertain identity matching. Empty in quick mode.
- researchScope: Deep mode only; a concise account of which source categories were searched and the approximate evidence coverage. Null in quick mode.
- links: Array of { label, url } objects — up to 5 relevant links (e.g. About page, Wikipedia, official site)
- mentions: In deep mode return 4-8 distinct evidence items when available: { summary, url, sourceType, sentiment }. Each summary should be 2-4 sentences, identify the publisher or community, include relevant dates, distinguish fact from opinion, and explain why the evidence matters. Each summary must clearly attribute what people or a named site say. Use only URLs actually found during research. For quick mode return an empty array.

Respond ONLY with valid JSON matching this structure, no markdown or extra text.`;

    const quickPrompt = `${basePrompt}

Use only your training knowledge — do not search the web. Provide your best assessment based on what you already know about this URL and domain.`;

    const deepPrompt = `${basePrompt}

Conduct a multi-angle investigation of both the publisher/creator and this specific resource. Search the live web broadly, using several targeted queries and triangulating important claims across independent sources. Gather public discussion from forums, Reddit, review sites, social posts, external articles, and—when the resource is a YouTube video or channel—publicly indexed viewer comments or discussions about its videos. Distinguish direct comments from third-party reporting, summarize overall sentiment without overstating a small sample, identify claims that the source is current or outdated, and attach the exact supporting URL to every mention. Never invent a quote, comment, consensus, or URL. If comments are unavailable, say so in limitations rather than guessing. Prefer primary or authoritative sources for factual claims, but include public discussion to assess reception. Treat popularity and credibility as separate questions. Look for both confirming and disconfirming evidence, compare publication dates, flag conflicts between sources, and avoid duplicated mentions from the same underlying story. The final report should be nuanced, detailed, useful to a student deciding whether and how to rely on the resource, and normally 700-1,000 words when enough evidence exists.`;

    try {
      let textOutput = "";
      if (mode === "deep") {
        const response = await openai.responses.create({
          model: "gpt-4o",
          max_output_tokens: 2500,
          text: {
            format: {
              type: "json_schema",
              name: "source_review",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: [
                  "sourceName",
                  "sourceType",
                  "description",
                  "founded",
                  "headquarters",
                  "trustLevel",
                  "trustReason",
                  "summary",
                  "reputationAnalysis",
                  "audienceSentiment",
                  "contentQuality",
                  "currencyAssessment",
                  "researchScope",
                  "strengths",
                  "concerns",
                  "limitations",
                  "links",
                  "mentions",
                ],
                properties: {
                  sourceName: { type: "string" },
                  sourceType: {
                    type: "string",
                    enum: [
                      "university",
                      "nonprofit",
                      "government",
                      "news-outlet",
                      "youtube-channel",
                      "individual",
                      "publisher",
                      "company",
                      "open-courseware",
                      "other",
                    ],
                  },
                  description: { type: ["string", "null"] },
                  founded: { type: ["string", "null"] },
                  headquarters: { type: ["string", "null"] },
                  trustLevel: {
                    type: "string",
                    enum: ["high", "medium", "low", "unknown"],
                  },
                  trustReason: { type: ["string", "null"] },
                  summary: { type: "string" },
                  reputationAnalysis: { type: ["string", "null"] },
                  audienceSentiment: { type: ["string", "null"] },
                  contentQuality: { type: ["string", "null"] },
                  currencyAssessment: { type: ["string", "null"] },
                  researchScope: { type: ["string", "null"] },
                  strengths: { type: "array", items: { type: "string" } },
                  concerns: { type: "array", items: { type: "string" } },
                  limitations: { type: "array", items: { type: "string" } },
                  links: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["label", "url"],
                      properties: {
                        label: { type: "string" },
                        url: { type: "string" },
                      },
                    },
                  },
                  mentions: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["summary", "url", "sourceType", "sentiment"],
                      properties: {
                        summary: { type: "string" },
                        url: { type: "string" },
                        sourceType: {
                          type: "string",
                          enum: [
                            "forum",
                            "comments",
                            "review",
                            "article",
                            "social",
                            "official",
                            "other",
                          ],
                        },
                        sentiment: {
                          type: "string",
                          enum: ["positive", "mixed", "negative", "neutral"],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          tools: [{ type: "web_search_preview", search_context_size: "high" }],
          input: deepPrompt,
        });
        textOutput = response.output_text ?? "";
        await recordAiUsage("deep-research", deepUserId);
      } else {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: quickPrompt,
            },
          ],
        });
        textOutput = response.choices[0]?.message?.content ?? "";
        await recordAiUsage("quick-review", deepUserId);
      }

      // Strip markdown code fences if present
      const withoutFences = textOutput
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const objectStart = withoutFences.indexOf("{");
      const objectEnd = withoutFences.lastIndexOf("}");
      const cleaned =
        objectStart >= 0 && objectEnd > objectStart
          ? withoutFences.slice(objectStart, objectEnd + 1)
          : withoutFences;

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        res.status(502).json({ error: "AI returned unparseable response" });
        return;
      }

      const validated = GetResourceSourceReviewResponse.safeParse({
        ...(parsed as object),
        mode,
      });
      if (!validated.success) {
        res
          .status(502)
          .json({ error: "AI returned a response that failed validation" });
        return;
      }

      await cacheReview(canonicalUrl, mode, validated.data);
      res.setHeader("X-Source-Review-Cache", "MISS");
      res.json(validated.data);
    } catch (err) {
      console.error("Source review AI error:", err);
      res.status(502).json({ error: "Failed to fetch source review" });
    } finally {
      if (deepUserId !== null) activeDeepUsers.delete(deepUserId);
      activeReviews.delete(reviewKey);
    }
  },
);

export default router;
