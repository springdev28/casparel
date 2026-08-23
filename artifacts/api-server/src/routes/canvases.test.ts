/**
 * @fileOverview Verification role: exercises the Canvas API contract, public privacy boundary, and collaboration invariants.
 * System connection: protects the generated OpenAPI schemas shared by the Express route and web client from drifting apart.
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
      delete: vi.fn(),
    },
    canvasCollaboratorsTable: table("canvas_collaborators"),
    canvasesTable: table("canvases"),
    classesTable: table("classes"),
    classMembersTable: table("class_members"),
    forumMaterialsTable: table("forum_materials"),
    forumPostsTable: table("forum_posts"),
    usersTable: table("users"),
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (
    req: {
      userId?: number;
      userRole?: string;
      accountRole?: string;
    },
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
import canvasesRouter from "./canvases";

const canvas = {
  id: 17,
  title: "Cell biology map",
  description: "Connect organelles to their functions.",
  ownerId: 42,
  classId: null,
  visibility: "link",
  classAccess: "view",
  shareToken: "a".repeat(32),
  document: {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  version: 3,
  createdAt: "2026-08-21T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:00.000Z",
};

let insertedValues: Record<string, unknown> | null = null;
let updateRows: Array<Record<string, unknown>> = [canvas];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", canvasesRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  insertedValues = null;
  updateRows = [canvas];

  vi.mocked(db.select).mockImplementation(
    (selection?: Record<string, unknown>) => {
      let source = "";
      const rows = () => {
        if (source === "canvases") return [canvas];
        if (source === "users") {
          return selection && "email" in selection
            ? []
            : [{ id: canvas.ownerId, name: "Aylin Student" }];
        }
        if (source === "canvas_collaborators") {
          return selection && "collaboratorCount" in selection
            ? [{ collaboratorCount: 0 }]
            : [];
        }
        return [];
      };
      const chain = {
        from: vi.fn().mockImplementation((table: { _name?: string }) => {
          source = table._name ?? "";
          return chain;
        }),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        then: (
          resolve: (value: Array<Record<string, unknown>>) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(rows()).then(resolve, reject),
      };
      return chain as unknown as ReturnType<typeof db.select>;
    },
  );

  vi.mocked(db.insert).mockImplementation(() => {
    const chain = {
      values: vi.fn().mockImplementation((values: Record<string, unknown>) => {
        insertedValues = values;
        return chain;
      }),
      returning: vi.fn().mockImplementation(() =>
        Promise.resolve([
          {
            ...canvas,
            visibility: "private",
            shareToken: null,
            version: 1,
            ...insertedValues,
          },
        ]),
      ),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    return chain as unknown as ReturnType<typeof db.insert>;
  });

  vi.mocked(db.update).mockImplementation(() => {
    const chain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockImplementation(() => Promise.resolve(updateRows)),
    };
    return chain as unknown as ReturnType<typeof db.update>;
  });
});

describe("canvas contract", () => {
  it("returns visible canvases through the generated response schema", async () => {
    const response = await request(buildApp()).get("/api/canvases");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: canvas.id,
        title: canvas.title,
        shareToken: canvas.shareToken,
        collaboratorCount: 0,
      }),
    ]);
  });

  it("rejects a malformed public token before querying the database", async () => {
    const response = await request(buildApp()).get(
      "/api/canvases/shared/short!",
    );

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("omits the secret share token from the public response", async () => {
    const response = await request(buildApp()).get(
      `/api/canvases/shared/${canvas.shareToken}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: canvas.id,
      title: canvas.title,
      permissions: { canView: true, canEdit: false, role: "viewer" },
    });
    expect(response.body).not.toHaveProperty("shareToken");
  });

  it("creates and normalizes a valid personal canvas", async () => {
    const response = await request(buildApp())
      .post("/api/canvases")
      .send({ title: "  Exam connections  ", description: "  Week one  " });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      title: "Exam connections",
      description: "Week one",
      ownerId: 42,
      visibility: "private",
    });
    expect(insertedValues).toMatchObject({
      title: "Exam connections",
      description: "Week one",
      ownerId: 42,
      classId: null,
      classAccess: "view",
    });
  });

  it("rejects a blank normalized title before writing", async () => {
    const response = await request(buildApp())
      .post("/api/canvases")
      .send({ title: "   " });

    expect(response.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("requires an expected version for document saves", async () => {
    const response = await request(buildApp())
      .patch(`/api/canvases/${canvas.id}`)
      .send({ document: canvas.document });

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns the current contracted canvas after a stale version conflict", async () => {
    updateRows = [];

    const response = await request(buildApp())
      .patch(`/api/canvases/${canvas.id}`)
      .send({ document: canvas.document, expectedVersion: 2 });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: "This canvas changed in another session",
      current: { id: canvas.id, version: canvas.version },
    });
  });

  it("rejects an unsupported publish destination before reading canvas data", async () => {
    const response = await request(buildApp())
      .post(`/api/canvases/${canvas.id}/publish`)
      .send({ destination: "private-message" });

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("does not add the canvas owner as a named collaborator", async () => {
    const response = await request(buildApp())
      .put(`/api/canvases/${canvas.id}/collaborators/${canvas.ownerId}`)
      .send({ role: "editor" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("The owner is already an editor");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["get", "/api/canvases/not-a-number"],
    ["delete", "/api/canvases/0"],
    ["get", "/api/canvases/0/collaborators"],
  ] as const)("rejects an invalid ID for %s %s", async (method, path) => {
    const agent = request(buildApp());
    const response = method === "delete"
      ? await agent.delete(path)
      : await agent.get(path);

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });
});
