/**
 * Unit tests for GET /resources/:id/source-review
 *
 * The OpenAI client and DB are fully mocked. Tests assert:
 *  - Quick mode: no OpenAI API is called
 *  - Deep mode: openai.responses.create is called with web search and a detailed prompt
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
  title: "Khan Academy, Calculus",
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
    responses: { create: vi.fn() },
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  };
  return { openai };
});

vi.mock("../lib/aiCostControls", () => ({
  consumeAiQuota: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 10,
    retryAfter: 60,
  }),
  recordAiUsage: vi.fn(),
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.userId = 7;
    req.accountRole = "student";
    next();
  },
}));

vi.mock("../lib/entitlements", () => ({
  getAccountEntitlements: vi.fn().mockResolvedValue({
    tier: "pro",
    label: "Pro",
    unlimitedAi: true,
    features: {
      "ai-discovery": true,
      "deep-research": true,
      "seating-planner": true,
    },
  }),
}));

// ── Subjects (imported AFTER mock declarations) ────────────────────────────────

import { db } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getAccountEntitlements } from "../lib/entitlements";
import sourceReviewRouter from "./sourceReview.js";

// ── App factory ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", sourceReviewRouter);
  return app;
}

/** Build a fake Chat Completions response wrapping the given JSON payload. */
function fakeOpenAIResponse(payload: Record<string, unknown>) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify(payload),
        },
      },
    ],
  } as unknown as Awaited<ReturnType<typeof openai.chat.completions.create>>;
}

// ── beforeEach ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  lastCreateCall = null;
  mockResource = {
    id: 42,
    title: "Khan Academy, Calculus",
    url: "https://www.khanacademy.org/math/calculus-1",
  };

  // db.select → returns the resource row (or empty array when null)
  vi.mocked(db.select).mockImplementation(() => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockResource ? [mockResource] : []),
        ),
    };
    return chain as unknown as ReturnType<typeof db.select>;
  });

  // openai.chat.completions.create → capture args, return a valid payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (openai.chat.completions.create as any).mockImplementation(
    async (args: Record<string, unknown>) => {
      lastCreateCall = args;
      return fakeOpenAIResponse(mockResponsePayload);
    },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (openai.responses.create as any).mockImplementation(
    async (args: Record<string, unknown>) => {
      lastCreateCall = args;
      return { output_text: JSON.stringify(mockResponsePayload) };
    },
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// Mode contract, the core invariant
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/resources/:id/source-review, mode contract", () => {
  it("quick mode: uses the free provenance registry without OpenAI", async () => {
    const res = await request(buildApp()).get(
      "/api/resources/42/source-review?mode=quick",
    );

    expect(res.status).toBe(200);
    expect(lastCreateCall).toBeNull();
    expect(openai.responses.create).not.toHaveBeenCalled();
    expect(res.headers["x-source-review-provider"]).toBe("schoolar-registry");
  });

  it("deep mode: uses Responses API with web search and a detailed prompt", async () => {
    const res = await request(buildApp()).get(
      "/api/resources/42/source-review?mode=deep",
    );

    expect(res.status).toBe(200);
    expect(openai.responses.create).toHaveBeenCalledOnce();
    const args = vi.mocked(openai.responses.create).mock.calls[0][0] as {
      input: string;
      tools?: unknown[];
    };
    expect(args.input).toContain("multi-angle investigation");
    expect(args.tools).toBeDefined();
  });

  it("rejects Free accounts before running deep AI research", async () => {
    vi.mocked(getAccountEntitlements).mockResolvedValueOnce({
      tier: "free",
      label: "Free",
      unlimitedAi: false,
      features: {
        "ai-discovery": false,
        "deep-research": false,
        "seating-planner": false,
      },
    });
    const res = await request(buildApp()).get(
      "/api/resources/42/source-review?mode=deep",
    );

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      code: "SUBSCRIPTION_REQUIRED",
      requiredPlan: "plus",
    });
    expect(openai.responses.create).not.toHaveBeenCalled();
  });

  it("default (no mode param) behaves like quick without OpenAI", async () => {
    const res = await request(buildApp()).get(
      "/api/resources/42/source-review",
    );

    expect(res.status).toBe(200);
    expect(lastCreateCall).toBeNull();
    expect(openai.responses.create).not.toHaveBeenCalled();
  });

  it("reviews an unsaved OpenStax source without OpenAI", async () => {
    const res = await request(buildApp()).get("/api/source-review").query({
      mode: "quick",
      title: "Calculus Volume 1 (OpenStax)",
      url: "https://openstax.org/details/books/calculus-volume-1",
      subject: "Mathematics",
      gradeLevel: "Higher education",
      format: "pdf",
    });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("quick");
    expect(res.body.sourceName).toBe("OpenStax");
    expect(res.headers["x-source-review-provider"]).toBe("schoolar-registry");
    expect(openai.responses.create).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Response shape, mode field is always present
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/resources/:id/source-review, response shape", () => {
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
    const res = await request(buildApp()).get(
      "/api/resources/42/source-review",
    );

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("quick");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Edge cases
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/resources/:id/source-review, edge cases", () => {
  it("returns 404 when the resource does not exist", async () => {
    mockResource = null;

    const res = await request(buildApp()).get(
      "/api/resources/99/source-review",
    );

    expect(res.status).toBe(404);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid :id path param", async () => {
    const res = await request(buildApp()).get(
      "/api/resources/not-a-number/source-review",
    );

    expect(res.status).toBe(400);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it("returns 400 when an invalid mode value is supplied", async () => {
    const res = await request(buildApp()).get(
      "/api/resources/42/source-review?mode=turbo",
    );

    expect(res.status).toBe(400);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it("falls back to the free registry when deep research is unparseable", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (openai.responses.create as any).mockResolvedValueOnce({
      output_text: "not json at all",
    });

    const res = await request(buildApp()).get(
      "/api/resources/42/source-review?mode=deep",
    );

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("quick");
    expect(res.headers["x-source-review-fallback"]).toBe(
      "schoolar-registry",
    );
  });
});
