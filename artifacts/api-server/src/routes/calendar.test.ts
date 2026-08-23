/**
 * @fileOverview Verification role: exercises Calendar settings status, ownership, capability validation, and iCal URL rotation.
 * System connection: protects the generated Calendar contract and ensures a leaked subscription link can be revoked without exposing another account's secret.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = "";
  process.env.GOOGLE_CLIENT_SECRET = "";
  process.env.SESSION_SECRET = "calendar-test-secret";
});

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
    calendarTokensTable: table("calendar_tokens"),
    scheduleBlocksTable: table("schedule_blocks"),
    studySessionsTable: table("study_sessions"),
    studySessionParticipantsTable: table("study_session_participants"),
    usersTable: table("users"),
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (
    req: { headers: { authorization?: string }; userId?: number },
    res: { status: (code: number) => { json: (body: unknown) => void } },
    next: () => void,
  ) => {
    if (!req.headers.authorization?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    req.userId = 42;
    next();
  },
}));

import { db } from "@workspace/db";
import calendarRouter from "./calendar";

const INITIAL_SECRET = "11111111-1111-4111-8111-111111111111";
let currentSecret = INITIAL_SECRET;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", calendarRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSecret = INITIAL_SECRET;

  vi.mocked(db.select).mockImplementation(() => {
    let tableName = "";
    const chain = {
      from: vi.fn().mockImplementation((table: { _name?: string }) => {
        tableName = table._name ?? "";
        return chain;
      }),
      where: vi.fn().mockReturnThis(),
      then: (
        resolve: (rows: Array<Record<string, unknown>>) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(
        tableName === "calendar_tokens"
          ? [{ icalSecret: currentSecret }]
          : [],
      ).then(resolve, reject),
    };
    return chain as unknown as ReturnType<typeof db.select>;
  });

  vi.mocked(db.insert).mockImplementation(() => {
    let inserted: Record<string, unknown> = {};
    const chain = {
      values: vi.fn().mockImplementation((values: Record<string, unknown>) => {
        inserted = values;
        return chain;
      }),
      onConflictDoUpdate: vi.fn().mockImplementation(
        ({ set }: { set: Record<string, unknown> }) => {
          currentSecret = String(set.icalSecret ?? inserted.icalSecret);
          return Promise.resolve();
        },
      ),
    };
    return chain as unknown as ReturnType<typeof db.insert>;
  });
});

describe("calendar settings contract", () => {
  const authorization = { Authorization: "Bearer calendar-test" };

  it("reports unavailable Google Calendar truthfully without returning an iCal secret", async () => {
    const response = await request(buildApp())
      .get("/api/calendar/status")
      .set(authorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      googleConnected: false,
      googleConfigured: false,
    });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("returns only the authenticated account's capability URL without caching", async () => {
    const response = await request(buildApp())
      .get("/api/calendar/ical-url")
      .set(authorization);

    expect(response.status).toBe(200);
    expect(response.body.url).toContain(
      `/api/calendar/${INITIAL_SECRET}/feed.ics`,
    );
    expect(Object.keys(response.body)).toEqual(["url"]);
    expect(response.body).not.toHaveProperty("icalSecret");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("requires authentication before disclosing the subscription URL", async () => {
    const response = await request(buildApp()).get("/api/calendar/ical-url");

    expect(response.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rotates the capability so the previous secret is no longer stored", async () => {
    const response = await request(buildApp())
      .post("/api/calendar/ical-url/rotate")
      .set(authorization);

    expect(response.status).toBe(200);
    const rotatedSecret = response.body.url.split("/calendar/")[1].split("/")[0];
    expect(rotatedSecret).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(rotatedSecret).not.toBe(INITIAL_SECRET);
    expect(currentSecret).toBe(rotatedSecret);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("rejects a malformed public capability before querying account data", async () => {
    const response = await request(buildApp()).get(
      "/api/calendar/not-a-secret/feed.ics",
    );

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });
});
