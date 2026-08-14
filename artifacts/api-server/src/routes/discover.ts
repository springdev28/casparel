import { Router, type IRouter } from "express";
import {
  DiscoverResourcesQueryParams,
  DiscoverResourcesResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { filterReachableUrls } from "../lib/check-url-reachable";

const router: IRouter = Router();

type DiscoverList = ReturnType<(typeof DiscoverResourcesResponse)["parse"]>;
type DiscoverItem = DiscoverList[number];


const MIN_VALID_RESULTS = 3;

/** Parse a raw AI text output into an array of unknown items. */
function parseAIOutput(textOutput: string): unknown[] {
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

  return Array.isArray(parsed) ? parsed : [];
}

/** Validate raw items against the Zod schema, salvaging per-item successes. */
function validateItems(items: unknown[]): DiscoverList {
  const validated = DiscoverResourcesResponse.safeParse(items);
  if (validated.success) return validated.data;

  return items
    .map((item: unknown) => {
      const r = DiscoverResourcesResponse.element.safeParse(item);
      return r.success ? r.data : null;
    })
    .filter((x): x is DiscoverItem => x !== null);
}

/** Call the AI and return validated resource items, or an empty array on failure. */
async function fetchFromAI(prompt: string): Promise<DiscoverList> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
  });

  const textOutput = response.choices[0]?.message?.content ?? "";

  const rawItems = parseAIOutput(textOutput);
  if (rawItems.length === 0) return [];
  return validateItems(rawItems);
}

// GET /resources/discover, public, searches the internet via AI
router.get("/resources/discover", async (req, res): Promise<void> => {
  const params = DiscoverResourcesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Missing or invalid query parameters" });
    return;
  }

  const { q, format, subject, gradeLevel } = params.data;

  const formatHint = format ? ` Focus on ${format} resources.` : "";
  const subjectHint = subject ? ` Subject area: ${subject}.` : "";
  const gradeHint = gradeLevel ? ` Target audience: ${gradeLevel} students.` : "";

  const buildPrompt = (excludeUrls: string[] = []) => {
    const exclusionNote =
      excludeUrls.length > 0
        ? `\n\nDo NOT include any of these URLs (they were unreachable):\n${excludeUrls.map((u) => `- ${u}`).join("\n")}`
        : "";

    return `You are an educational research assistant. Using your training knowledge, suggest 8–12 high-quality educational resources matching this query: "${q}"${subjectHint}${gradeHint}${formatHint}

Return ONLY a JSON array. Each element must have these fields:
- title: string, full title of the resource
- url: string, direct URL to the resource
- description: string, 1–2 sentence description of what the resource covers
- format: one of "article" | "video" | "pdf" | "podcast" | "interactive" | "other"
- source: string, name of the website/publisher/channel (e.g. "Khan Academy", "MIT OpenCourseWare", "YouTube")
- thumbnailUrl: string or null, a thumbnail/image URL if available (YouTube thumbnails follow the pattern https://img.youtube.com/vi/{videoId}/hqdefault.jpg)
- subject: string or null, academic subject
- gradeLevel: string or null, target grade level if apparent (e.g. "9th Grade", "College", "K-8")

Rules:
- Only include real, publicly accessible URLs that actually exist
- Prefer reputable educational sources: Khan Academy, Coursera, MIT OCW, Wikipedia, TED-Ed, CrashCourse, government/university sites, well-known publishers
- Include a diverse mix of formats unless a specific format was requested
- No paywalled content
- Return ONLY the JSON array, no markdown, no extra text${exclusionNote}`;
  };

  try {
    // First AI call
    const firstBatch = await fetchFromAI(buildPrompt());

    if (firstBatch.length === 0) {
      res.status(502).json({ error: "AI returned invalid resource data" });
      return;
    }

    // Reachability check, parallel with 3-second timeout per URL
    const reachable = await filterReachableUrls(firstBatch);

    if (reachable.length >= MIN_VALID_RESULTS) {
      res.json(reachable);
      return;
    }

    // Too many dead links, request a fresh batch excluding known-dead URLs
    const reachableUrls = new Set(reachable.map((r) => r.url));
    const deadUrls = firstBatch
      .filter((item) => !reachableUrls.has(item.url))
      .map((item) => item.url);

    console.warn(
      `Discover: ${deadUrls.length} dead URL(s) found, re-invoking AI to fill up.`
    );

    const secondBatch = await fetchFromAI(buildPrompt(deadUrls));
    const reachableSecond = await filterReachableUrls(secondBatch);

    // Merge: keep first-batch survivors + second-batch survivors (deduplicated by URL)
    const merged: DiscoverList = [...reachable];
    for (const item of reachableSecond) {
      if (!reachableUrls.has(item.url)) {
        merged.push(item);
        reachableUrls.add(item.url);
      }
    }

    if (merged.length === 0) {
      res
        .status(502)
        .json({ error: "No reachable results found. Please try again." });
      return;
    }

    res.json(merged);
  } catch (err) {
    console.error("Discover AI error:", err);
    res.status(502).json({ error: "Search failed. Please try again." });
  }
});

export default router;
