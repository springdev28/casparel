/**
 * @fileOverview Verification role: exercises Workflow Analytics.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const insertValues = vi.fn();

vi.mock("@workspace/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: insertValues })),
    select: vi.fn(),
  },
  workflowEventsTable: {
    id: {},
    userId: {},
    event: {},
    resourceId: {},
    createdAt: {},
  },
}));

vi.mock("./logger", () => ({ logger: { warn: vi.fn() } }));

import { logger } from "./logger";
import { recordWorkflowEvent } from "./workflowAnalytics";

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = "development";
  insertValues.mockResolvedValue(undefined);
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("workflow analytics", () => {
  it("bounds context keys and string values before storage", async () => {
    await recordWorkflowEvent({
      userId: 7,
      event: "search_submitted",
      context: Object.fromEntries([
        ["surface", "resource_search"],
        ["long", "x".repeat(200)],
        ...Array.from({ length: 20 }, (_, index) => [`key${index}`, index]),
      ]),
    });

    const stored = insertValues.mock.calls[0][0];
    expect(Object.keys(stored.context)).toHaveLength(16);
    expect(stored.context.long).toHaveLength(120);
  });

  it("does not break product flows when analytics storage fails", async () => {
    insertValues.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      recordWorkflowEvent({ userId: 7, event: "resource_saved" }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "resource_saved", userId: 7 }),
      "Workflow analytics write failed",
    );
  });
});
