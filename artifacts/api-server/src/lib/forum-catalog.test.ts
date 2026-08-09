import { describe, expect, it } from "vitest";
import {
  inferForumMaterialType,
  normalizeForumPostTags,
  shouldCatalogForumFile,
} from "./forum-catalog";

describe("forum catalog tagging", () => {
  it("keeps supported tags and normalizes their case", () => {
    expect(normalizeForumPostTags(["Fun", "MATERIAL", "unknown", "fun"])).toEqual([
      "fun",
      "material",
    ]);
  });

  it("catalogs global material tags but not social-only tags", () => {
    expect(shouldCatalogForumFile(["material", "fun"], null)).toBe(true);
    expect(shouldCatalogForumFile(["activity"], null)).toBe(true);
    expect(shouldCatalogForumFile(["canvas"], null)).toBe(true);
    expect(shouldCatalogForumFile(["fun"], null)).toBe(false);
  });

  it("does not expose class-only files through the public catalog", () => {
    expect(shouldCatalogForumFile(["material"], 12)).toBe(false);
  });

  it("infers a catalog material type from the tag or file", () => {
    expect(inferForumMaterialType(["canvas"], "image/png")).toBe("activity");
    expect(inferForumMaterialType(["material"], "video/mp4")).toBe("video");
    expect(inferForumMaterialType(["material"], "image/png")).toBe("infographic");
    expect(inferForumMaterialType(["material"], "application/pdf")).toBe("notes");
  });
});
