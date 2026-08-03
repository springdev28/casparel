/**
 * Unit tests for GET /resources/:id/source-review
 *
 * The OpenAI client and DB are fully mocked. Tests assert:
 *  - Quick mode: openai.responses.create is called WITHOUT the web_search_preview tool
 *  - Deep mode:  openai.responses.create is called WITH the web_search_preview tool
 *  - Default (no mode param) behaves like quick
 *  - Response body always includes the resolved `mode` field
 *  - 404 when the resource does not exist
 *  - 400 on an invalid mode value
 */

import { describe, it, vi, beforeEach, expect } from "vitest";
import request from "supertest";
import express from "express";

// ── DB mock ────────────────────────────────────────────────────────────────────

let mockResource: Record<string, unknown> | null = {
  id: 42,
  title: "Khan Academy — Calculus",
  url: "https://www.khanacademy.org/math/calculus-1",
};

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  const db = {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
  };
  return {
    db,
    resourcesTable: stub("resources"),
    listItemsTable: stub("list_items"),
    resourceListsTable: stub("resource_lists"),
    reviewsTable: stub("reviews"),
    classesTable: stub("classes"),
    classMembersTable: stub("class_members"),
    scheduleBlocksTable: stub("schedule_blocks"),
  };
});

// ── OpenAI mock ────────────────────────────────────────────────────────────────

/** Capture the last call args so tests can inspect them. */
let lastCreateCall: Record<string, unknown> | null = null;

const mockResponsePayload = {
  sourceName: "Khan Academy",
  sourceType: "nonprofit",
  description: "Free educational content for everyone.",
  founded: "2008",
  headquarters: "Mountain View, CA",
  trustLevel: "high",
  trustReason: "Well-known accredited non-profit educational platform.",
  summary: "Khan Academy is a non-profit providing free education.",
  links: [{ label: "About", url: "https://www.khanacademy.org/about" }],
};

vi.mock("@workspace/integrations-openai-ai-server", () => {
  const openai = {
    responses: {
      create: vi.fn(),
    },
  };
  return { openai };
});

// ── Subjects (imported AFTER mock declarations) ────────────────────────────────

import { db } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import sourceReviewRouter from "./sourceReview.js";

// ── App factory ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", sourceReviewRouter);
  return app;
}

/** Build a fake OpenAI response wrapping the given JSON payload. */
function fakeOpenAIResponse(payload: Record<string, unknown>) {
  return {
    output: [
      {
        type: "message",
        content: [
          // annotations is required by ResponseOutputText; an empty array satisfies the type
          { type: "output_text" as const, text: JSON.stringify(payload), annotations: [] },
        ],
      },
    ],
  } as unknown as Awaited<ReturnType<typeof openai.responses.create>>;
}

// ── beforeEach ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  lastCreateCall = null;
  mockResource = {
    id: 42,
    title: "Khan Academy — Calculus",
    url: "https://www.khanacademy.org/math/calculus-1",
  };

  // db.select → returns the resource row (or empty array when null)
  vi.mocked(db.select).mockImplementation(() => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() =>
        Promise.resolve(mockResource ? [mockResource] : []),
      ),
    };
    return chain as unknown as ReturnType<typeof db.select>;
  });

  // openai.responses.create → capture args, return a valid payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (openai.responses.create as any).mockImplementation(
    async (args: Record<string, unknown>) => {
      lastCreateCall = args;
      return fakeOpenAIResponse(mockResponsePayload);
    },
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// Mode contract — the core invariant
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/resources/:id/source-review — mode contract", () => {
  it("quick mode: does NOT attach the web_search_preview tool", async () => {
    const res = await request(buildApp()).get(
      "/api/resources/42/source-review?mode=quick",
    );

    expect(res.status).toBe(200);
    expect(lastCreateCall).not.toBeNull();
    // tools must be absent (undefined or empty) for Quick mode
    expect(lastCreateCall!.tools).toBeUndefined();
  });

  it("deep mode: attaches the web_search_preview tool", async () => {
    const res = await request(buildApp()).get(
      "/api/resources/42/source-review?mode=deep",
    );

    expect(res.status).toBe(200);
    expect(lastCreateCall).not.toBeNull();
    const tools = lastCreateCall!.tools as Array<{ type: string }>;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.some((t) => t.type === "web_search_preview")).toBe(true);
  });

  it("default (no mode param) behaves like quick — no web_search_preview tool", async () => {
    const res = await request(buildApp()).get("/api/resources/42/source-review");

    expect(res.status).toBe(200);
    expect(lastCreateCall!.tools).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Response shape — mode field is always present
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/resources/:id/source-review — response shape", () => {
  it("includes mode: 'quick' in the response body for quick mode", async () => {
    const res = await request(buildApp()).get(
      "/api/resources/42/source-review?mode=quick",
    );

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("quick");
  });

  it("includes mode: 'deep' in the response body for deep mode", async () => {
    const res = await request(buildApp()).get(
      "/api/resources/42/source-review?mode=deep",
    );

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("deep");
  });

  it("includes mode: 'quick' in the response body when mode is omitted", async () => {
    const res = await request(buildApp()).get("/api/resources/42/source-review");

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("quick");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Edge cases
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/resources/:id/source-review — edge cases", () => {
  it("returns 404 when the resource does not exist", async () => {
    mockResource = null;

    const res = await request(buildApp()).get("/api/resources/99/source-review");

    expect(res.status).toBe(404);
    expect(openai.responses.create).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid :id path param", async () => {
    const res = await request(buildApp()).get(
      "/api/resources/not-a-number/source-review",
    );

    expect(res.status).toBe(400);
    expect(openai.responses.create).not.toHaveBeenCalled();
  });

  it("returns 400 when an invalid mode value is supplied", async () => {
    const res = await request(buildApp()).get(
      "/api/resources/42/source-review?mode=turbo",
    );

    expect(res.status).toBe(400);
    expect(openai.responses.create).not.toHaveBeenCalled();
  });

  it("returns 502 when OpenAI returns unparseable JSON", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (openai.responses.create as any).mockResolvedValueOnce({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "not json at all", annotations: [] }],
        },
      ],
    });

    const res = await request(buildApp()).get(
      "/api/resources/42/source-review?mode=quick",
    );

    expect(res.status).toBe(502);
  });
});
