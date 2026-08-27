import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

const { createModeration } = vi.hoisted(() => ({
  createModeration: vi.fn(),
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    moderations: { create: createModeration },
  },
}));

vi.mock("../lib/aiHealth", () => ({
  throughAi: vi.fn((_operation: string, call: () => unknown) => call()),
}));

vi.mock("@workspace/db", () => ({
  db: {},
  directConversationsTable: {},
  directMessagesTable: {},
  userBlocksTable: {},
  userPreferencesTable: {},
  usersTable: {},
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("../lib/limiters", () => ({
  contentLimiter: vi.fn(),
}));

import { requireSafeDirectMessage } from "./directMessages";

function response() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { res: { status } as unknown as Response, status, json };
}

describe("direct-message proactive moderation", () => {
  beforeEach(() => {
    createModeration.mockReset();
  });

  it("allows a message after the safety check passes", async () => {
    createModeration.mockResolvedValue({ results: [{ flagged: false }] });
    const next = vi.fn() as NextFunction;
    const { res, status } = response();

    await requireSafeDirectMessage(
      { body: { body: "Could you share the homework notes?" } } as Request,
      res,
      next,
    );

    expect(createModeration).toHaveBeenCalledWith({
      model: "omni-moderation-latest",
      input: "Could you share the homework notes?",
    });
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("rejects a flagged message before the route handler runs", async () => {
    createModeration.mockResolvedValue({ results: [{ flagged: true }] });
    const next = vi.fn() as NextFunction;
    const { res, status, json } = response();

    await requireSafeDirectMessage(
      { body: { body: "unsafe text" } } as Request,
      res,
      next,
    );

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: "MESSAGE_UNSAFE" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("fails closed when moderation is unavailable", async () => {
    createModeration.mockRejectedValue(new Error("provider unavailable"));
    const next = vi.fn() as NextFunction;
    const { res, status, json } = response();

    await requireSafeDirectMessage(
      { body: { body: "Hello" } } as Request,
      res,
      next,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "MESSAGE_MODERATION_UNAVAILABLE" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("leaves empty-body validation to the route schema", async () => {
    const next = vi.fn() as NextFunction;
    const { res, status } = response();

    await requireSafeDirectMessage({ body: {} } as Request, res, next);

    expect(createModeration).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });
});
