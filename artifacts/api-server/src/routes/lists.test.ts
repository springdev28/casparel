/**
 * @fileOverview Verification role: exercises Lists.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Integration tests for the reading-list routes.
 *
 * All DB access is fully mocked, no real database required.
 * The tests cover:
 *
 *  • DELETE /lists/:id/items/:itemId, idempotent single removal
 *  • DELETE /lists/:id/items/:itemId, concurrent removal race condition:
 *      two simultaneous requests for the same item both return 204
 *  • POST /lists/:id/learning-goal, ordered and idempotent list conversion
 */

import { describe, it, vi, beforeEach, expect } from "vitest";
import request from "supertest";
import express from "express";

// ── DB mock ───────────────────────────────────────────────────────────────────
// Must be declared before any import that transitively loads @workspace/db.

// Controls whether isListOwner resolves to true (owner row present or not).
let mockListOwnerRow: Record<string, unknown> | null = { id: 1, ownerId: 99 };
// Track how many times the delete .where() was called.
let deleteCallCount = 0;
let mockLearningPathItems: Array<Record<string, unknown>> | null = null;
let mockExistingLearningGoal: Record<string, unknown> | null = null;
let insertedLearningGoal: Record<string, unknown> | null = null;
let lastUpdatedValues: Record<string, unknown> | null = null;
let mockInsertedListItem: Record<string, unknown> | null = null;
let mockExistingSavedListItem: Record<string, unknown> | null = null;
let mockSavedResource: Record<string, unknown> | null = null;
let mockResourceMemberships: Array<Record<string, unknown>> = [];

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
    resourceListsTable: stub("resource_lists"),
    listItemsTable: stub("list_items"),
    resourcesTable: stub("resources"),
    reviewsTable: stub("reviews"),
    classesTable: stub("classes"),
    classMembersTable: stub("class_members"),
    scheduleBlocksTable: stub("schedule_blocks"),
    usersTable: stub("users"),
    learningGoalsTable: stub("learning_goals"),
  };
});

// ── Import subjects AFTER mock declarations ───────────────────────────────────
import { db } from "@workspace/db";
import listsRouter from "./lists.js";
import { issueToken } from "../lib/auth.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal Express app wrapping the lists router at /api */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", listsRouter);
  return app;
}

/** Bearer token for a teacher with the given userId */
function ownerToken(userId: number) {
  return `Bearer ${issueToken(userId, "teacher")}`;
}

// ── Wire up db mock behaviour before each test ────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockListOwnerRow = { id: 1, ownerId: 99 };
  deleteCallCount = 0;
  mockLearningPathItems = null;
  mockExistingLearningGoal = null;
  insertedLearningGoal = null;
  lastUpdatedValues = null;
  mockInsertedListItem = null;
  mockExistingSavedListItem = null;
  mockSavedResource = null;
  mockResourceMemberships = [];

  // select: drives isListOwner (queries resource_lists) and other authz helpers.
  vi.mocked(db.select).mockImplementation((selection?: Record<string, unknown>) => {
    let tableName = "";
    let joinedResources = false;
    const selectionKeys = Object.keys(selection ?? {});
    const chain = {
      from: vi.fn().mockImplementation((table: { _name: string }) => {
        tableName = table._name;
        return chain;
      }),
      innerJoin: vi.fn().mockImplementation(() => {
        joinedResources = true;
        return chain;
      }),
      where: vi.fn().mockImplementation(() => {
        if (tableName === "users") {
          return Promise.resolve([{ id: 99, role: "teacher", activeRole: "teacher", bannedAt: null }]);
        }
        if (tableName === "list_items") {
          if (selectionKeys.includes("listItemId")) return chain;
          if (selectionKeys.includes("maxPos")) {
            return Promise.resolve([{ maxPos: mockExistingSavedListItem ? 0 : null }]);
          }
          if (mockExistingSavedListItem) {
            return Promise.resolve([mockExistingSavedListItem]);
          }
          if (mockLearningPathItems !== null) {
            if (joinedResources) return chain;
            return Promise.resolve([{ count: mockLearningPathItems.length }]);
          }
          // isListItemOwner queries list_items first to get the parent listId
          // Always return a row (ownership is determined by the resource_lists check below)
          return Promise.resolve([{ id: 7, listId: 1 }]);
        }
        if (tableName === "resource_lists") {
          return Promise.resolve(mockListOwnerRow ? [mockListOwnerRow] : []);
        }
        if (tableName === "learning_goals") {
          return Promise.resolve(mockExistingLearningGoal ? [mockExistingLearningGoal] : []);
        }
        if (tableName === "resources") {
          return Promise.resolve(mockSavedResource ? [mockSavedResource] : []);
        }
        if (tableName === "reviews") {
          return Promise.resolve([{ avg: 0, count: 0 }]);
        }
        return Promise.resolve([]);
      }),
      orderBy: vi.fn().mockImplementation(() =>
        Promise.resolve(
          selectionKeys.includes("listItemId")
            ? mockResourceMemberships
            : mockLearningPathItems ?? [],
        ),
      ),
    };
    return chain as unknown as ReturnType<typeof db.select>;
  });

  // delete: unconditional, resolves immediately, tracks call count.
  vi.mocked(db.delete).mockImplementation(() => {
    const chain = {
      where: vi.fn().mockImplementation(() => {
        deleteCallCount += 1;
        return Promise.resolve(undefined);
      }),
    };
    return chain as unknown as ReturnType<typeof db.delete>;
  });

  // update / insert not used by the remove-item route; stubs satisfy TypeScript.
  vi.mocked(db.update).mockImplementation(() => {
    const chain = {
      set: vi.fn().mockImplementation((values: Record<string, unknown>) => {
        lastUpdatedValues = values;
        return chain;
      }),
      where: vi.fn().mockImplementation(() => chain),
      returning: vi.fn().mockImplementation(() =>
        Promise.resolve([
          { shareToken: lastUpdatedValues?.shareToken ?? null },
        ]),
      ),
    };
    return chain as unknown as ReturnType<typeof db.update>;
  });

  vi.mocked(db.insert).mockImplementation((table: unknown) => {
    const isLearningGoal = (table as { _name?: string })._name === "learning_goals";
    const isListItem = (table as { _name?: string })._name === "list_items";
    const chain = {
      values: vi.fn().mockImplementation((values: Record<string, unknown>) => {
        if (isLearningGoal) insertedLearningGoal = values;
        return chain;
      }),
      onConflictDoNothing: vi.fn().mockImplementation(() => chain),
      returning: vi.fn().mockImplementation(() => {
        if (isListItem) {
          return Promise.resolve(mockInsertedListItem ? [mockInsertedListItem] : []);
        }
        if (!isLearningGoal) return Promise.resolve([{ id: 1 }]);
        return Promise.resolve([{
          id: 501,
          ...insertedLearningGoal,
          targetDate: null,
          status: "active",
          createdAt: "2026-08-22T10:00:00.000Z",
          updatedAt: "2026-08-22T10:00:00.000Z",
        }]);
      }),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    return chain as unknown as ReturnType<typeof db.insert>;
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/resources/:resourceId/list-memberships
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/resources/:resourceId/list-memberships", () => {
  it("returns only the caller's current matching list items", async () => {
    mockResourceMemberships = [
      {
        listId: 4,
        listName: "Mechanics essentials",
        listItemId: 31,
        note: "Review before the quiz",
        addedAt: "2026-08-23T10:00:00.000Z",
      },
    ];

    const res = await request(buildApp())
      .get("/api/resources/12/list-memberships")
      .set("Authorization", ownerToken(99));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockResourceMemberships);
  });

  it("returns an honest empty collection when the resource is not in a current list", async () => {
    const res = await request(buildApp())
      .get("/api/resources/12/list-memberships")
      .set("Authorization", ownerToken(99));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("rejects malformed resource ids before querying memberships", async () => {
    const res = await request(buildApp())
      .get("/api/resources/not-a-number/list-memberships")
      .set("Authorization", ownerToken(99));

    expect(res.status).toBe(400);
  });

  it("requires authentication before exposing list membership", async () => {
    const res = await request(buildApp()).get("/api/resources/12/list-memberships");

    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/lists/:id/items
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/lists/:id/items", () => {
  const OWNER_ID = 99;
  const LIST_ID = 1;
  const RESOURCE_ID = 12;
  const addedAt = "2026-08-23T10:00:00.000Z";

  beforeEach(() => {
    mockSavedResource = {
      id: RESOURCE_ID,
      title: "Motion foundations",
      url: "https://example.test/motion",
      description: "A direct introduction to motion.",
      format: "video",
      subject: "Physics",
      gradeLevel: "Year 12",
      thumbnailUrl: null,
      submittedById: OWNER_ID,
      createdAt: "2026-08-20T10:00:00.000Z",
      verificationStatus: "verified",
      verificationNote: null,
    };
  });

  it("creates the first durable list item", async () => {
    mockInsertedListItem = {
      id: 31,
      listId: LIST_ID,
      resourceId: RESOURCE_ID,
      note: null,
      position: 0,
      addedAt,
    };

    const res = await request(buildApp())
      .post(`/api/lists/${LIST_ID}/items`)
      .set("Authorization", ownerToken(OWNER_ID))
      .send({ resourceId: RESOURCE_ID });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 31,
      listId: LIST_ID,
      resourceId: RESOURCE_ID,
      resource: { id: RESOURCE_ID, title: "Motion foundations" },
    });
  });

  it("returns the existing item when the same save is retried", async () => {
    mockExistingSavedListItem = {
      id: 31,
      listId: LIST_ID,
      resourceId: RESOURCE_ID,
      note: null,
      position: 0,
      addedAt,
    };

    const res = await request(buildApp())
      .post(`/api/lists/${LIST_ID}/items`)
      .set("Authorization", ownerToken(OWNER_ID))
      .send({ resourceId: RESOURCE_ID });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(31);
    expect(res.body.resourceId).toBe(RESOURCE_ID);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/lists/:id/items/:itemId
// ══════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/lists/:id/items/:itemId", () => {
  const OWNER_ID = 99;
  const LIST_ID = 1;
  const ITEM_ID = 7;

  it("returns 204 when the item exists and the caller owns the list", async () => {
    const res = await request(buildApp())
      .delete(`/api/lists/${LIST_ID}/items/${ITEM_ID}`)
      .set("Authorization", ownerToken(OWNER_ID));

    expect(res.status).toBe(204);
    expect(deleteCallCount).toBe(1);
  });

  it("returns 204 (idempotent) when the item was already removed", async () => {
    // db.delete affects 0 rows, the route does not check row count, so still 204.
    const res = await request(buildApp())
      .delete(`/api/lists/${LIST_ID}/items/${ITEM_ID}`)
      .set("Authorization", ownerToken(OWNER_ID));

    expect(res.status).toBe(204);
  });

  it("returns 403 when the caller does not own the list", async () => {
    mockListOwnerRow = null; // isListOwner returns false

    const res = await request(buildApp())
      .delete(`/api/lists/${LIST_ID}/items/${ITEM_ID}`)
      .set("Authorization", ownerToken(OWNER_ID));

    expect(res.status).toBe(403);
    expect(deleteCallCount).toBe(0);
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const res = await request(buildApp()).delete(
      `/api/lists/${LIST_ID}/items/${ITEM_ID}`,
    );

    expect(res.status).toBe(401);
    expect(deleteCallCount).toBe(0);
  });

  // ── Race-condition test ──────────────────────────────────────────────────────

  it("both concurrent DELETE requests return 204 (race condition, idempotent delete)", async () => {
    // Fire two simultaneous requests for the same item without awaiting either.
    // This simulates two browser tabs or sessions racing to remove the same item.
    const app = buildApp();

    const [res1, res2] = await Promise.all([
      request(app)
        .delete(`/api/lists/${LIST_ID}/items/${ITEM_ID}`)
        .set("Authorization", ownerToken(OWNER_ID)),
      request(app)
        .delete(`/api/lists/${LIST_ID}/items/${ITEM_ID}`)
        .set("Authorization", ownerToken(OWNER_ID)),
    ]);

    // Both requests must succeed, the second must not receive a 4xx even
    // though the item was (conceptually) already gone after the first.
    expect(res1.status).toBe(204);
    expect(res2.status).toBe(204);

    // Both requests reached the DB delete call.
    expect(deleteCallCount).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/lists/:id/learning-goal
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/lists/:id/learning-goal", () => {
  const OWNER_ID = 99;
  const LIST_ID = 1;

  beforeEach(() => {
    mockListOwnerRow = {
      id: LIST_ID,
      ownerId: OWNER_ID,
      workspaceRole: "teacher",
      classId: null,
      name: "AP Mechanics essentials",
      description: null,
      createdAt: "2026-08-22T09:00:00.000Z",
    };
  });

  it("creates ordered, resource-linked path steps", async () => {
    mockLearningPathItems = [
      { resourceId: 12, title: "Motion foundations", subject: "Physics", format: "video" },
      { resourceId: 7, title: "Newton practice", subject: "Physics", format: "interactive" },
      { resourceId: 30, title: "Mechanics reference", subject: "Mathematics", format: "pdf" },
    ];

    const res = await request(buildApp())
      .post(`/api/lists/${LIST_ID}/learning-goal`)
      .set("Authorization", ownerToken(OWNER_ID));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 501,
      sourceListId: LIST_ID,
      title: "AP Mechanics essentials",
      subject: "Physics",
      status: "active",
    });
    expect(res.body.pathSteps).toEqual([
      expect.objectContaining({ title: "Motion foundations", resourceId: 12, completed: false }),
      expect.objectContaining({ title: "Newton practice", resourceId: 7, completed: false }),
      expect.objectContaining({ title: "Mechanics reference", resourceId: 30, completed: false }),
    ]);
    expect(insertedLearningGoal).toMatchObject({
      userId: OWNER_ID,
      workspaceRole: "teacher",
      sourceListId: LIST_ID,
      preferredFormats: ["video", "interactive", "pdf"],
    });
  });

  it("returns the existing goal on repeat without inserting another row", async () => {
    mockLearningPathItems = [{ resourceId: 12, title: "Motion", subject: "Physics", format: "video" }];
    mockExistingLearningGoal = {
      id: 410,
      userId: OWNER_ID,
      sourceListId: LIST_ID,
      title: "AP Mechanics essentials",
      subject: "Physics",
      description: "Already created",
      level: "beginner",
      preferredFormats: ["video"],
      targetDate: null,
      status: "active",
      pathSteps: [{ id: "step-1", title: "Motion", query: "Physics Motion", completed: false, resourceId: 12 }],
      createdAt: "2026-08-22T10:00:00.000Z",
      updatedAt: "2026-08-22T10:00:00.000Z",
    };

    const res = await request(buildApp())
      .post(`/api/lists/${LIST_ID}/learning-goal`)
      .set("Authorization", ownerToken(OWNER_ID));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(410);
    expect(insertedLearningGoal).toBeNull();
  });

  it("rejects an empty list", async () => {
    mockLearningPathItems = [];

    const res = await request(buildApp())
      .post(`/api/lists/${LIST_ID}/learning-goal`)
      .set("Authorization", ownerToken(OWNER_ID));

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Add at least one resource");
    expect(insertedLearningGoal).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Public list share links
// ══════════════════════════════════════════════════════════════════════════════

describe("public resource-list sharing", () => {
  const OWNER_ID = 99;
  const LIST_ID = 1;
  const TOKEN = "4e2ea10a-b2f4-4fe3-81a1-e3751aec46a8";

  beforeEach(() => {
    mockListOwnerRow = {
      id: LIST_ID,
      ownerId: OWNER_ID,
      workspaceRole: "teacher",
      classId: null,
      shareToken: TOKEN,
      name: "Public mechanics path",
      description: "A safe public sequence",
      createdAt: "2026-08-22T09:00:00.000Z",
    };
    mockLearningPathItems = [
      {
        resourceId: 12,
        position: 0,
        id: 12,
        title: "Motion foundations",
        url: "https://example.test/motion",
        description: "A direct introduction to motion.",
        format: "video",
        subject: "Physics",
        gradeLevel: "Year 12",
        thumbnailUrl: null,
        avgRating: 4.5,
        reviewCount: 8,
        createdAt: "2026-08-21T09:00:00.000Z",
        note: "private teacher note",
        verificationNote: "private moderator note",
      },
    ];
  });

  it("opens a tokenized list without authentication and omits private fields", async () => {
    const res = await request(buildApp()).get(`/api/lists/public/${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "Public mechanics path",
      itemCount: 1,
      items: [
        {
          resourceId: 12,
          position: 0,
          resource: { id: 12, title: "Motion foundations" },
        },
      ],
    });
    expect(res.body).not.toHaveProperty("ownerId");
    expect(res.body.items[0]).not.toHaveProperty("note");
    expect(res.body.items[0].resource).not.toHaveProperty("verificationNote");
  });

  it("returns 404 for a revoked or unknown token", async () => {
    mockListOwnerRow = null;
    const res = await request(buildApp()).get(`/api/lists/public/${TOKEN}`);
    expect(res.status).toBe(404);
  });

  it("creates a random public token when the owner has no active link", async () => {
    mockListOwnerRow = { ...mockListOwnerRow!, shareToken: null };
    const res = await request(buildApp())
      .post(`/api/lists/${LIST_ID}/public-share`)
      .set("Authorization", ownerToken(OWNER_ID));

    expect(res.status).toBe(201);
    expect(res.body.shareToken).toMatch(/^[a-f0-9-]{36}$/);
    expect(lastUpdatedValues?.shareToken).toBe(res.body.shareToken);
  });

  it("returns the existing token without rotating a distributed link", async () => {
    const res = await request(buildApp())
      .post(`/api/lists/${LIST_ID}/public-share`)
      .set("Authorization", ownerToken(OWNER_ID));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ shareToken: TOKEN });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("revokes the token idempotently as the owner", async () => {
    const res = await request(buildApp())
      .delete(`/api/lists/${LIST_ID}/public-share`)
      .set("Authorization", ownerToken(OWNER_ID));

    expect(res.status).toBe(204);
    expect(lastUpdatedValues).toEqual({ shareToken: null });
  });
});
