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

  // select: drives isListOwner (queries resource_lists) and other authz helpers.
  vi.mocked(db.select).mockImplementation(() => {
    let tableName = "";
    const chain = {
      from: vi.fn().mockImplementation((table: { _name: string }) => {
        tableName = table._name;
        return chain;
      }),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        if (tableName === "users") {
          return Promise.resolve([{ id: 99, role: "teacher", activeRole: "teacher", bannedAt: null }]);
        }
        if (tableName === "list_items") {
          // isListItemOwner queries list_items first to get the parent listId
          // Always return a row (ownership is determined by the resource_lists check below)
          return Promise.resolve([{ id: 7, listId: 1 }]);
        }
        if (tableName === "resource_lists") {
          return Promise.resolve(mockListOwnerRow ? [mockListOwnerRow] : []);
        }
        return Promise.resolve([]);
      }),
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
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    return chain as unknown as ReturnType<typeof db.update>;
  });

  vi.mocked(db.insert).mockImplementation(() => {
    const chain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    };
    return chain as unknown as ReturnType<typeof db.insert>;
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
