import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, resourcesTable } from "@workspace/db";
import {
  GetResourceSourceReviewParams,
  GetResourceSourceReviewResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// GET /resources/:id/source-review — authenticated
router.get("/resources/:id/source-review", requireAuth, async (req, res): Promise<void> => {
  const params = GetResourceSourceReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [resource] = await db
    .select()
    .from(resourcesTable)
    .where(eq(resourcesTable.id, params.data.id));

  if (!resource) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }

  const { title, url } = resource;

  const prompt = `You are a research assistant helping students evaluate the credibility and background of an educational resource.

Resource title: "${title}"
Resource URL: ${url}

Please research the publisher/uploader/creator behind this URL and provide a structured JSON response with the following fields:
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

  try {
    const response = await openai.responses.create({
      model: "gpt-4o",
      tools: [{ type: "web_search_preview" }],
      input: prompt,
    });

    // Extract text output from the response
    const textOutput = response.output
      .filter((b) => b.type === "message")
      .flatMap((b) =>
        (b as { type: string; content: Array<{ type: string; text?: string }> }).content
          .filter((c) => c.type === "output_text" && c.text)
          .map((c) => c.text as string)
      )
      .join("");

    // Strip markdown code fences if present
    const cleaned = textOutput.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      res.status(502).json({ error: "AI returned unparseable response" });
      return;
    }

    const validated = GetResourceSourceReviewResponse.safeParse(parsed);
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
