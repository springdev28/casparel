/**
 * @fileOverview Verification role: exercises Resource Share Link.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import {
  requestsQuickReview,
  requestsSaveAfterAuth,
  resourceQuickReviewPath,
  resourceQuickReviewUrl,
  resourceSaveIntentPath,
} from "./resource-share-link";

describe("public resource review links", () => {
  it("builds a public quick-review URL for root and sub-path deployments", () => {
    expect(resourceQuickReviewPath(42)).toBe("/resources/42?review=quick");
    expect(resourceQuickReviewUrl("https://beta.example", "/", 42)).toBe(
      "https://beta.example/resources/42?review=quick",
    );
    expect(
      resourceQuickReviewUrl("https://beta.example", "/school/", 42),
    ).toBe("https://beta.example/school/resources/42?review=quick");
  });

  it("rejects invalid resource ids", () => {
    expect(resourceQuickReviewPath(0)).toBeNull();
    expect(resourceSaveIntentPath(Number.NaN)).toBeNull();
    expect(resourceQuickReviewUrl("https://beta.example", "/", -1)).toBeNull();
  });

  it("recognizes only explicit review and save intents", () => {
    expect(requestsQuickReview("review=quick")).toBe(true);
    expect(requestsQuickReview("review=deep")).toBe(false);
    expect(requestsSaveAfterAuth("intent=save&review=quick")).toBe(true);
    expect(requestsSaveAfterAuth("intent=review")).toBe(false);
  });
});
