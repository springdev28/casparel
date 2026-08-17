/**
 * What a copy must and must not carry over.
 *
 * These are the properties the feature exists for, and each one is a way the
 * implementation could look right and be wrong:
 *
 *  • the copy belongs to whoever took it, not the person who made the original,
 *  • it carries no classId, so it is not silently shared back into the class it
 *    came from,
 *  • it carries no shareToken, so the original owner's link cannot reach it,
 *  • its content is copied by value, so neither side can change the other.
 *
 * The routes are covered through the shape of what they insert rather than
 * through the network, because the risk here is in the values chosen, not in
 * the plumbing: a single missing `classId: null` would hand a private copy back
 * to a whole class without erroring.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const routes = resolve(dirname(fileURLToPath(import.meta.url)), "../routes");

function copyHandler(file: string, marker: string): string {
  const source = readFileSync(resolve(routes, file), "utf8");
  const start = source.indexOf(marker);
  expect(start, `${marker} is gone from ${file}`).toBeGreaterThan(-1);
  // Up to the end of the route registration that follows it.
  const end = source.indexOf("\n);", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

const activityCopy = copyHandler(
  "studyActivities.ts",
  '"/study-activities/:id/copy"',
);
const canvasCopy = copyHandler("canvases.ts", '"/canvases/:id/copy"');

describe.each([
  ["activity", activityCopy],
  ["canvas", canvasCopy],
])("%s copy", (_name, handler) => {
  it("gives the copy to the caller", () => {
    expect(handler).toContain("ownerId: userId");
  });

  it("does not carry the source's class", () => {
    expect(handler).toContain("classId: null");
  });

  it("does not carry the source's share link", () => {
    expect(handler).toContain("shareToken: null");
  });

  it("requires a session", () => {
    expect(handler).toContain("requireAuth");
  });

  it("counts against the plan like anything else you create", () => {
    expect(handler).toContain("ensureAccountCapacity");
  });

  it("refuses when the caller cannot see the source", () => {
    expect(handler).toMatch(/res\.status\(403\)/);
  });

  it("answers 404 for a source that does not exist", () => {
    expect(handler).toMatch(/res\.status\(404\)/);
  });
});

describe("canvas copy specifically", () => {
  it("starts private rather than inheriting the source's visibility", () => {
    expect(canvasCopy).toContain('visibility: "private"');
    expect(canvasCopy).not.toContain("visibility: source.visibility");
  });

  it("reuses the file's own access rules rather than inventing looser ones", () => {
    expect(canvasCopy).toContain("accessForCanvas");
    expect(canvasCopy).toContain("canView");
  });
});

describe("activity copy specifically", () => {
  it("copies the cards by value, not a reference to the source row", () => {
    expect(activityCopy).toContain("cards: source.cards");
  });

  it("lands in the workspace the caller is acting in", () => {
    expect(activityCopy).toContain("activeWorkspaceRole");
  });
});
