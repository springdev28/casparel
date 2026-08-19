import {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { and, eq, gt, sql } from "drizzle-orm";
import {
  db,
  resourcesTable,
  reviewsTable,
  sourceReviewCacheTable,
} from "@workspace/db";
import {
  GetResourceSourceReviewParams,
  GetResourceSourceReviewQueryParams,
  GetResourceSourceReviewResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { throughAi } from "../lib/aiHealth";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { consumeAiQuota, recordAiUsage } from "../lib/aiCostControls";
import { getAccountEntitlements } from "../lib/entitlements";
import { buildFreeQuickReview } from "../lib/sourceProvenance";
import { logger } from "../lib/logger";
import {
  optionalWorkflowUserId,
  recordWorkflowEvent,
} from "../lib/workflowAnalytics";

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

type ResourceProfileInput = Record<string, unknown>;

function profileText(input: ResourceProfileInput, key: string) {
  const value = input[key];
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 300)
    : null;
}

function resourceProfile(
  raw: unknown,
  resource: {
    url: string;
    subject: string;
    gradeLevel: string;
    format: string;
    thumbnailUrl: string | null;
    createdAt: string;
  },
  sourceName: string,
  stats: { avgRating: number; reviewCount: number },
) {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as ResourceProfileInput)
      : {};
  let sourceDomain: string | null = null;
  try {
    sourceDomain = new URL(resource.url).hostname.replace(/^www\./, "");
  } catch {
    // Keep the domain unavailable for malformed legacy URLs.
  }
  const keywords = Array.isArray(input.keywords)
    ? input.keywords
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  return {
    provider: profileText(input, "provider") ?? sourceName,
    author: profileText(input, "author"),
    sourceDomain,
    uploadTime: profileText(input, "uploadTime"),
    lastEdited: profileText(input, "lastEdited"),
    addedToSchoolar: resource.createdAt,
    subject: profileText(input, "subject") ?? resource.subject,
    gradeLevel: profileText(input, "gradeLevel") ?? resource.gradeLevel,
    format: profileText(input, "format") ?? resource.format,
    language: profileText(input, "language"),
    difficulty: profileText(input, "difficulty"),
    accessType: profileText(input, "accessType"),
    license: profileText(input, "license"),
    duration: profileText(input, "duration"),
    readingTime: profileText(input, "readingTime"),
    captions: typeof input.captions === "boolean" ? input.captions : null,
    transcript: typeof input.transcript === "boolean" ? input.transcript : null,
    audience: profileText(input, "audience"),
    keywords,
    hasThumbnail: Boolean(resource.thumbnailUrl),
    avgRating: stats.avgRating,
    reviewCount: stats.reviewCount,
  };
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
  if (query.success && query.data.mode === "deep") {
    requireAuth(req, res, next);
    return;
  }
  next();
}

/**
 * What to show when a deep run does not come back usable.
 *
 * It falls back to the registry check, which is right: something has to be on
 * screen. What was wrong is that buildFreeQuickReview stamps mode "quick", so
 * a failed deep run rendered with a "Quick" badge and read as though the user
 * had asked for the cheap check - the allowance was spent, the report was
 * missing, and nothing on screen said deep research had been attempted at all.
 *
 * The mode stays "deep" so the badge tells the truth, and the first limitation
 * says plainly what happened.
 */
function deepResearchFallback(
  resource: Parameters<typeof buildFreeQuickReview>[0],
  stats: Parameters<typeof buildFreeQuickReview>[1],
) {
  return {
    ...buildFreeQuickReview(resource, stats),
    mode: "deep" as const,
    limitations: [
      "Deep research did not return a complete report this time, so the maintained registry check is shown instead.",
      "This did not use up a deep research allowance beyond the attempt itself; try again, and tell us if it keeps happening.",
      "Registry checks do not inspect the full resource or current public discussion.",
    ],
  };
}

// GET /resources/:id/source-review or /source-review, quick is public; deep requires auth.
router.get(
  ["/resources/:id/source-review", "/source-review"],
  requireAccountForDeep,
  async (req, res): Promise<void> => {
    const query = GetResourceSourceReviewQueryParams.safeParse(req.query);
    if (!query.success) {
      res
        .status(400)
        .json({ error: "Invalid mode, must be 'quick' or 'deep'" });
      return;
    }
    const mode = query.data.mode;

    const hasResourceId = typeof req.params.id === "string";
    let resource: {
      id: number | null;
      title: string;
      url: string;
      subject: string;
      gradeLevel: string;
      format: string;
      thumbnailUrl: string | null;
      createdAt: string;
    };
    if (hasResourceId) {
      const params = GetResourceSourceReviewParams.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
      }
      const [savedResource] = await db
        .select()
        .from(resourcesTable)
        .where(eq(resourcesTable.id, params.data.id));
      if (!savedResource) {
        res.status(404).json({ error: "Resource not found" });
        return;
      }
      resource = savedResource;
    } else {
      const title =
        typeof req.query.title === "string" ? req.query.title.trim() : "";
      const url = typeof req.query.url === "string" ? req.query.url.trim() : "";
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        res.status(400).json({ error: "A valid source URL is required" });
        return;
      }
      if (
        !title ||
        title.length > 300 ||
        !["http:", "https:"].includes(parsedUrl.protocol)
      ) {
        res
          .status(400)
          .json({ error: "A title and HTTP or HTTPS source URL are required" });
        return;
      }
      resource = {
        id: null,
        title,
        url: parsedUrl.toString(),
        subject:
          typeof req.query.subject === "string"
            ? req.query.subject.slice(0, 120)
            : "Not specified",
        gradeLevel:
          typeof req.query.gradeLevel === "string"
            ? req.query.gradeLevel.slice(0, 80)
            : "Not specified",
        format:
          typeof req.query.format === "string"
            ? req.query.format.slice(0, 40)
            : "other",
        thumbnailUrl: null,
        createdAt: new Date().toISOString(),
      };
    }

    let stats = { avgRating: 0, reviewCount: 0 };
    if (resource.id !== null) {
      const [reviewStats] = await db
        .select({
          avgRating: sql<number>`round(coalesce(avg(${reviewsTable.rating}), 0)::numeric, 1)::float`,
          reviewCount: sql<number>`cast(count(${reviewsTable.id}) as int)`,
        })
        .from(reviewsTable)
        .where(eq(reviewsTable.resourceId, resource.id));
      stats = reviewStats ?? stats;
    }

    const { title, url } = resource;
    const recordReview = async () => {
      const userId = optionalWorkflowUserId(req);
      if (!userId || resource.id === null) return;
      await recordWorkflowEvent({
        userId,
        event: "resource_reviewed",
        resourceId: resource.id,
        context: { mode },
      });
    };
    const canonicalUrl = canonicalResourceUrl(url);
    const reviewKey = mode + ":" + canonicalUrl;
    // Every tier may run deep research; the tiers differ in allowance. Free's
    // allowance is a deliberate taste — large enough to see what a cited deep
    // report is, far too small to live on. Only administrators are uncapped:
    // uncapped is an operational property, not something money can buy.
    let deepUserId: number | null = null;
    let deepIsAdmin = false;
    let deepRates: { deepPerDay: number; deepPerMonth: number } | null = null;
    if (mode === "deep") {
      deepUserId = (req as AuthenticatedRequest).userId;
      deepIsAdmin = (req as AuthenticatedRequest).accountRole === "admin";
      if (!deepIsAdmin) {
        deepRates = (await getAccountEntitlements(deepUserId)).ai;
      }
    }
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
      const cachedProfile =
        cached.report &&
        typeof cached.report === "object" &&
        "resourceProfile" in cached.report
          ? (cached.report as { resourceProfile?: unknown }).resourceProfile
          : undefined;
      if (
        report.success &&
        cachedProfile &&
        typeof cachedProfile === "object"
      ) {
        res.setHeader("X-Source-Review-Cache", "HIT");
        await recordReview();
        res.json({
          ...report.data,
          resourceProfile: resourceProfile(
            cachedProfile,
            resource,
            report.data.sourceName,
            stats,
          ),
        });
        return;
      }
    }

    if (mode === "quick") {
      const responseData = buildFreeQuickReview(resource, stats);
      await cacheReview(canonicalUrl, mode, responseData);
      res.setHeader("X-Source-Review-Cache", "MISS");
      res.setHeader("X-Source-Review-Provider", "schoolar-registry");
      await recordReview();
      res.json(responseData);
      return;
    }

    if (mode === "deep" && deepUserId !== null) {
      if (activeDeepUsers.has(deepUserId) || activeReviews.has(reviewKey)) {
        res.status(429).json({
          error:
            "A deep research request is already running. Please wait for it to finish.",
        });
        return;
      }
      // Per-account caps come from the tier table; only admins skip them.
      // The global cost-safety budget below applies to every non-admin too.
      if (deepRates) {
        const daily = await consumeAiQuota(
          "deep-user-day",
          String(deepUserId),
          24 * 60 * 60 * 1000,
          deepRates.deepPerDay,
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
          deepRates.deepPerMonth,
        );
        if (!monthly.allowed) {
          res.setHeader("Retry-After", monthly.retryAfter);
          res.status(429).json({
            error: "Monthly deep research limit reached.",
            retryAfter: monthly.retryAfter,
          });
          return;
        }
      }
      // The global daily budget remains a cost safety net for every non-admin
      // account, including premium.
      if (!deepIsAdmin) {
        const globalDaily = await consumeAiQuota(
          "deep-global-day",
          "all",
          24 * 60 * 60 * 1000,
          // Service-wide safety net, raised with the tier model: Pro-level
          // accounts alone can legitimately run 15-25 reports a day.
          Number(process.env.AI_DEEP_DAILY_GLOBAL_LIMIT) > 0
            ? Math.floor(Number(process.env.AI_DEEP_DAILY_GLOBAL_LIMIT))
            : 100,
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
- resourceProfile: An object describing this specific resource, not just its publisher. It must contain provider, author, uploadTime, lastEdited, subject, gradeLevel, format, language, difficulty, accessType, license, duration, readingTime, captions, transcript, audience, and keywords. Use null when a fact is unavailable; never invent a date, license, duration, caption, or transcript status. difficulty should be "beginner", "intermediate", "advanced", or "mixed" when known. accessType should explain whether it is free, paid, subscription-based, or requires an account. keywords should contain up to 10 concise topics.
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
- links: Array of { label, url } objects, up to 5 relevant links (e.g. About page, Wikipedia, official site)
- mentions: In deep mode return 4-8 distinct evidence items when available: { summary, url, sourceType, sentiment }. Each summary should be 2-4 sentences, identify the publisher or community, include relevant dates, distinguish fact from opinion, and explain why the evidence matters. Each summary must clearly attribute what people or a named site say. Use only URLs actually found during research. For quick mode return an empty array.

Respond ONLY with valid JSON matching this structure, no markdown or extra text.`;

    const deepPrompt = `${basePrompt}

Conduct a multi-angle investigation of both the publisher/creator and this specific resource. Search the live web broadly, using several targeted queries and triangulating important claims across independent sources. Gather public discussion from forums, Reddit, review sites, social posts, external articles, and, when the resource is a YouTube video or channel, publicly indexed viewer comments or discussions about its videos. Distinguish direct comments from third-party reporting, summarize overall sentiment without overstating a small sample, identify claims that the source is current or outdated, and attach the exact supporting URL to every mention. Never invent a quote, comment, consensus, or URL. If comments are unavailable, say so in limitations rather than guessing. Prefer primary or authoritative sources for factual claims, but include public discussion to assess reception. Treat popularity and credibility as separate questions. Look for both confirming and disconfirming evidence, compare publication dates, flag conflicts between sources, and avoid duplicated mentions from the same underlying story. The final report should be nuanced, detailed, useful to a student deciding whether and how to rely on the resource, and normally 700-1,000 words when enough evidence exists.`;

    try {
      let textOutput = "";
      const response = await throughAi("deep source review", () =>
        openai.responses.create({
        model: "gpt-5-mini",
        // The prompt asks for a nuanced 700-1000 word report AND a structured
        // object with fifteen required fields, including arrays of mentions
        // that each carry a URL. 1800 tokens could not hold both: the model
        // ran out mid-object, JSON.parse threw, and the catch below quietly
        // served the free registry check instead - which is why deep research
        // kept coming back looking exactly like a quick one.
        max_output_tokens: 6000,
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
                "resourceProfile",
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
                resourceProfile: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "provider",
                    "author",
                    "uploadTime",
                    "lastEdited",
                    "subject",
                    "gradeLevel",
                    "format",
                    "language",
                    "difficulty",
                    "accessType",
                    "license",
                    "duration",
                    "readingTime",
                    "captions",
                    "transcript",
                    "audience",
                    "keywords",
                  ],
                  properties: {
                    provider: { type: ["string", "null"] },
                    author: { type: ["string", "null"] },
                    uploadTime: { type: ["string", "null"] },
                    lastEdited: { type: ["string", "null"] },
                    subject: { type: ["string", "null"] },
                    gradeLevel: { type: ["string", "null"] },
                    format: { type: ["string", "null"] },
                    language: { type: ["string", "null"] },
                    difficulty: { type: ["string", "null"] },
                    accessType: { type: ["string", "null"] },
                    license: { type: ["string", "null"] },
                    duration: { type: ["string", "null"] },
                    readingTime: { type: ["string", "null"] },
                    captions: { type: ["boolean", "null"] },
                    transcript: { type: ["boolean", "null"] },
                    audience: { type: ["string", "null"] },
                    keywords: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
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
        // Deep research is the paid, live-web path; it was configured at the
        // cheapest setting on every axis while being asked to triangulate
        // across independent sources. Low context returns too little of each
        // page to compare claims against.
        tools: [{ type: "web_search", search_context_size: "medium" }],
        reasoning: { effort: "medium" },
        input: deepPrompt,
        }),
      );
      textOutput = response.output_text ?? "";
      await recordAiUsage("deep-research", deepUserId);

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
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
      } catch {
        // Say why. Truncation is the likely cause and it is silent otherwise:
        // the response simply stops mid-object and the parse throws.
        logger.warn(
          {
            resourceId: resource.id,
            status: (response as { status?: string }).status,
            incomplete: (response as { incomplete_details?: unknown })
              .incomplete_details,
            outputChars: textOutput.length,
          },
          "Deep research response did not parse; serving the registry check",
        );
        res.setHeader("X-Source-Review-Fallback", "schoolar-registry");
        await recordReview();
        res.json(deepResearchFallback(resource, stats));
        return;
      }

      const validated = GetResourceSourceReviewResponse.safeParse({
        ...(parsed as object),
        mode,
      });
      if (!validated.success) {
        res.setHeader("X-Source-Review-Fallback", "schoolar-registry");
        await recordReview();
        res.json(deepResearchFallback(resource, stats));
        return;
      }

      const rawProfile =
        parsed && typeof parsed === "object" && "resourceProfile" in parsed
          ? (parsed as { resourceProfile?: unknown }).resourceProfile
          : undefined;
      const responseData = {
        ...validated.data,
        resourceProfile: resourceProfile(
          rawProfile,
          resource,
          validated.data.sourceName,
          stats,
        ),
      };
      await cacheReview(canonicalUrl, mode, responseData);
      res.setHeader("X-Source-Review-Cache", "MISS");
      await recordReview();
      res.json(responseData);
    } catch (err) {
      console.error("Source review AI error:", err);
      /*
       * A sentence for a reader, because the client shows this one.
       *
       * It said "Failed to fetch source review", which is a log line. Deep
       * research is the only thing that failed here -- the quick check reads
       * the maintained registry and needs none of this -- and saying so is
       * what lets somebody get their answer instead of giving up.
       */
      res.status(502).json({
        error:
          "Deep research is unavailable right now. The free source check still works.",
      });
    } finally {
      if (deepUserId !== null) activeDeepUsers.delete(deepUserId);
      activeReviews.delete(reviewKey);
    }
  },
);

export default router;
