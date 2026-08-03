import { Router, type IRouter } from "express";
import {
  DiscoverResourcesQueryParams,
  DiscoverResourcesResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

// GET /resources/discover — public, searches the internet via AI
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

  const prompt = `You are an educational research assistant. Search the web and find 8–12 high-quality educational resources matching this query: "${q}"${subjectHint}${gradeHint}${formatHint}

Return ONLY a JSON array. Each element must have these fields:
- title: string — full title of the resource
- url: string — direct URL to the resource
- description: string — 1–2 sentence description of what the resource covers
- format: one of "article" | "video" | "pdf" | "podcast" | "interactive" | "other"
- source: string — name of the website/publisher/channel (e.g. "Khan Academy", "MIT OpenCourseWare", "YouTube")
- thumbnailUrl: string or null — a thumbnail/image URL if available (YouTube thumbnails follow the pattern https://img.youtube.com/vi/{videoId}/hqdefault.jpg)
- subject: string or null — academic subject
- gradeLevel: string or null — target grade level if apparent (e.g. "9th Grade", "College", "K-8")

Rules:
- Only include real, publicly accessible URLs that actually exist
- Prefer reputable educational sources: Khan Academy, Coursera, MIT OCW, Wikipedia, TED-Ed, CrashCourse, government/university sites, well-known publishers
- Include a diverse mix of formats unless a specific format was requested
- No paywalled content
- Return ONLY the JSON array, no markdown, no extra text`;

  try {
    const response = await openai.responses.create({
      model: "gpt-5.6-terra",
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
      // Try to salvage whatever parsed correctly by filtering per-item
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

export default router;
