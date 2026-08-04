import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, resourcesTable } from "@workspace/db";
import {
  GetResourceSourceReviewParams,
  GetResourceSourceReviewQueryParams,
  GetResourceSourceReviewResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

// GET /resources/:id/source-review — public (no auth required)
router.get("/resources/:id/source-review", async (req, res): Promise<void> => {
  const params = GetResourceSourceReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const query = GetResourceSourceReviewQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid mode — must be 'quick' or 'deep'" });
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
- summary: 2-3 sentences summarising who the source is, what they publish, and why (or why not) they are considered credible for educational content
- links: Array of { label, url } objects — up to 3 relevant links (e.g. About page, Wikipedia, official site)

Respond ONLY with valid JSON matching this structure, no markdown or extra text.`;

  const quickPrompt = `${basePrompt}

Use only your training knowledge — do not search the web. Provide your best assessment based on what you already know about this URL and domain.`;

  const deepPrompt = `${basePrompt}

Reason carefully and thoroughly about the publisher/uploader/creator behind this URL. Draw on everything you know from your training data about this organisation, institution, channel, or individual — their history, reputation, funding, editorial standards, and any known controversies or endorsements. Provide your most detailed credibility assessment even when direct information is limited, by reasoning from the domain, URL patterns, and related entities you do know.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: mode === "deep" ? deepPrompt : quickPrompt }],
    });

    // Extract text output from the response
    const textOutput = response.choices[0]?.message?.content ?? "";

    // Strip markdown code fences if present
    const cleaned = textOutput.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      res.status(502).json({ error: "AI returned unparseable response" });
      return;
    }

    const validated = GetResourceSourceReviewResponse.safeParse({ ...(parsed as object), mode });
    if (!validated.success) {
      // Return the raw parsed data with fallback defaults if validation fails
      res.json(
        GetResourceSourceReviewResponse.parse({
          sourceName: (parsed as Record<string, unknown>).sourceName ?? "Unknown",
          sourceType: (parsed as Record<string, unknown>).sourceType ?? "other",
          description: (parsed as Record<string, unknown>).description ?? null,
          founded: null,
          headquarters: null,
          trustLevel: "unknown",
          trustReason: null,
          summary: String((parsed as Record<string, unknown>).summary ?? "No summary available."),
          links: [],
          mode,
        })
      );
      return;
    }

    res.json(validated.data);
  } catch (err) {
    console.error("Source review AI error:", err);
    res.status(502).json({ error: "Failed to fetch source review" });
  }
});

export default router;
