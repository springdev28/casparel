/**
 * @fileOverview Verification role: exercises Direct Messages.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("@workspace/db", () => {
  const table = (name: string) =>
    new Proxy(
      { _name: name },
      {
        get(target, property) {
          if (property in target) return target[property as keyof typeof target];
          return { table: name, column: String(property) };
        },
      },
    );
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    },
    directConversationsTable: table("direct_conversations"),
    directMessagesTable: table("direct_messages"),
    userBlocksTable: table("user_blocks"),
    userPreferencesTable: table("user_preferences"),
    usersTable: table("users"),
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (
    req: { userId?: number; userRole?: string; accountRole?: string },
    _res: unknown,
    next: () => void,
  ) => {
    req.userId = 42;
    req.userRole = "student";
    req.accountRole = "student";
    next();
  },
}));

vi.mock("../lib/limiters", () => ({
  contentLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { db } from "@workspace/db";
import directMessagesRouter from "./directMessages";

const conversation = {
  id: 7,
  firstUserId: 42,
  secondUserId: 84,
  requestedById: 42,
  status: "accepted",
  createdAt: "2026-08-20T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:00.000Z",
};

const message = {
  id: 9,
  conversationId: 7,
  senderId: 84,
  body: "Hello",
  isAdminMessage: false,
  readAt: null,
  createdAt: "2026-08-22T10:00:00.000Z",
};

let conversationRows = [conversation];
let allowMessageRequests = true;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", directMessagesRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  conversationRows = [conversation];
  allowMessageRequests = true;
  vi.mocked(db.select).mockImplementation((fields?: Record<string, unknown>) => {
    let tableName = "";
    const keys = Object.keys(fields ?? {});
    const rows = () => {
      if (tableName === "direct_conversations") return conversationRows;
      if (tableName === "users") {
        return [{ id: 84, name: "Learner", role: "student", avatarUrl: null }];
      }
      if (tableName === "direct_messages" && keys.includes("count")) {
        return [{ count: 1 }];
      }
      if (tableName === "direct_messages") return [message];
      if (tableName === "user_preferences") return [{ allowMessageRequests }];
      return [];
    };
    const chain = {
      from: vi.fn().mockImplementation((table: { _name: string }) => {
        tableName = table._name;
        return chain;
      }),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: (
        resolve: (value: Array<Record<string, unknown>>) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(rows()).then(resolve, reject),
    };
    return chain as unknown as ReturnType<typeof db.select>;
  });
});

describe("direct message contract", () => {
  it("returns the generated conversation response shape", async () => {
    const response = await request(buildApp()).get(
      "/api/direct-messages/conversations",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        ...conversation,
        other: { id: 84, name: "Learner", role: "student", avatarUrl: null },
        lastMessage: message,
        unreadCount: 1,
        incomingRequest: false,
      },
    ]);
  });

  it("rejects starting a conversation with the current account", async () => {
    const response = await request(buildApp())
      .post("/api/direct-messages/conversations")
      .send({ userId: 42 });

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only initial message", async () => {
    const response = await request(buildApp())
      .post("/api/direct-messages/conversations")
      .send({ userId: 84, body: "   " });

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only message before reading the conversation", async () => {
    const response = await request(buildApp())
      .post("/api/direct-messages/conversations/7/messages")
      .send({ body: "   " });

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects an invalid conversation id before querying the database", async () => {
    const response = await request(buildApp()).get(
      "/api/direct-messages/conversations/not-a-number",
    );

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("enforces a recipient's disabled message-request preference", async () => {
    conversationRows = [];
    allowMessageRequests = false;

    const response = await request(buildApp())
      .post("/api/direct-messages/conversations")
      .send({ userId: 84 });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/not accepting message requests/i);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
