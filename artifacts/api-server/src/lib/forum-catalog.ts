export const FORUM_POST_TAGS = new Set([
  "fun",
  "activity",
  "canvas",
  "material",
  "idea",
  "thought",
  "criticism",
  "fun-fact",
  "advice",
  "tactics",
  "question",
  "discussion",
]);

const CATALOG_POST_TAGS = new Set(["material", "activity", "canvas"]);

export function normalizeForumPostTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.toLocaleLowerCase("en-US")))]
    .filter((tag) => FORUM_POST_TAGS.has(tag));
}

export function shouldCatalogForumFile(tags: string[], classId: number | null) {
  return classId === null && tags.some((tag) => CATALOG_POST_TAGS.has(tag));
}

export function inferForumMaterialType(tags: string[], mimeType: string | null) {
  if (tags.includes("activity") || tags.includes("canvas")) return "activity" as const;
  if (mimeType?.startsWith("video/")) return "video" as const;
  if (mimeType?.startsWith("image/")) return "infographic" as const;
  return "notes" as const;
}
