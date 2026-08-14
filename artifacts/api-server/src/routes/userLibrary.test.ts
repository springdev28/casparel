/**
 * Regression guard for GET /users/:id/library.
 *
 * The handler passes its rows straight to GetUserLibraryResponse.parse(). That
 * schema requires aggregates (avgRating/reviewCount on resources, itemCount on
 * lists) which raw table rows do not carry, so selecting bare rows made the
 * endpoint throw on its own response — a 500 for every viewer.
 *
 * These assertions pin that contract so a future bare .select() fails here
 * rather than in production.
 */
import { describe, it, expect } from "vitest";
import { GetUserLibraryResponse } from "@workspace/api-zod";

const rawResourceRow = {
  id: 1,
  title: "Intro to Algebra",
  url: "https://example.org/algebra",
  description: null,
  format: "article" as const,
  subject: "Mathematics",
  gradeLevel: "10th Grade",
  thumbnailUrl: null,
  workspaceRole: "student" as const,
  submittedById: 7,
  createdAt: new Date().toISOString(),
};

const rawListRow = {
  id: 3,
  name: "Revision",
  description: null,
  ownerId: 7,
  classId: null,
  workspaceRole: "student" as const,
  createdAt: new Date().toISOString(),
};

describe("GetUserLibraryResponse", () => {
  it("rejects raw resource rows that carry no rating aggregates", () => {
    const result = GetUserLibraryResponse.safeParse({
      resources: [rawResourceRow],
      lists: [{ ...rawListRow, itemCount: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects raw list rows that carry no itemCount", () => {
    const result = GetUserLibraryResponse.safeParse({
      resources: [{ ...rawResourceRow, avgRating: 0, reviewCount: 0 }],
      lists: [rawListRow],
    });
    expect(result.success).toBe(false);
  });

  it("accepts rows once the aggregates the handler computes are present", () => {
    const result = GetUserLibraryResponse.safeParse({
      resources: [{ ...rawResourceRow, avgRating: 4.5, reviewCount: 2 }],
      lists: [{ ...rawListRow, itemCount: 4 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts the verification fields the resource projection now returns", () => {
    const result = GetUserLibraryResponse.safeParse({
      resources: [
        {
          ...rawResourceRow,
          avgRating: 0,
          reviewCount: 0,
          verificationStatus: "unverified",
          verificationNote: null,
        },
      ],
      lists: [],
    });
    expect(result.success).toBe(true);
  });
});
