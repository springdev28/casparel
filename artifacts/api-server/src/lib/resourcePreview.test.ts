/**
 * @fileOverview Verification role: exercises Resource Preview.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import {
  extractHtmlResourcePreview,
  isMeaningfulResourcePreview,
  normalizeResourcePreview,
  resourcePreviewCoverage,
} from "./resourcePreview";

describe("resource preview normalization", () => {
  it("extracts Open Graph metadata regardless of attribute order", () => {
    const preview = extractHtmlResourcePreview(
      `
        <html><head>
          <meta content="A useful lesson" property="og:title">
          <meta property="og:description" content="A visual lesson with worked examples for learning derivatives.">
          <meta content="Example University" property="og:site_name">
          <meta name="author" content="Ada Lovelace">
          <meta property="article:published_time" content="2025-04-03">
          <meta content="/cover.jpg" property="og:image">
          <link href="/icon.svg" rel="shortcut icon">
        </head></html>
      `,
      "https://learn.example.edu/courses/calculus",
      "2026-08-22T08:00:00.000Z",
    );

    expect(preview).toMatchObject({
      previewTitle: "A useful lesson",
      previewPublisher: "Example University",
      previewAuthor: "Ada Lovelace",
      previewImageUrl: "https://learn.example.edu/cover.jpg",
      previewFaviconUrl: "https://learn.example.edu/icon.svg",
      previewPublishedAt: "2025-04-03T00:00:00.000Z",
      previewSource: "opengraph",
      previewCheckedAt: "2026-08-22T08:00:00.000Z",
      previewMeaningful: true,
    });
  });

  it("falls back to document metadata without pretending it is Open Graph", () => {
    const preview = extractHtmlResourcePreview(
      `<title>Vectors &amp; motion</title><meta name="description" content="A concise lesson about vectors, forces, and motion.">`,
      "https://example.org/lesson",
    );

    expect(preview.previewTitle).toBe("Vectors & motion");
    expect(preview.previewSource).toBe("extracted");
    expect(preview.previewImageUrl).toBeNull();
  });

  it("rejects unsafe image and favicon schemes", () => {
    const preview = extractHtmlResourcePreview(
      `<meta property="og:image" content="javascript:alert(1)"><link rel="icon" href="data:image/svg+xml,bad">`,
      "https://example.org/lesson",
    );

    expect(preview.previewImageUrl).toBeNull();
    expect(preview.previewFaviconUrl).toBeNull();
    expect(
      normalizeResourcePreview({
        imageUrl: "javascript:alert(1)",
        faviconUrl: "data:image/svg+xml,bad",
      }),
    ).toMatchObject({
      previewImageUrl: null,
      previewFaviconUrl: null,
    });
  });

  it("accepts a publisher plus substantive snippet as a meaningful fallback", () => {
    expect(
      isMeaningfulResourcePreview({
        previewImageUrl: null,
        previewDescription:
          "Worked examples explain every step in the chain rule.",
        previewAuthor: null,
        previewPublisher: "Example University",
      }),
    ).toBe(true);
  });

  it("does not count a generic type tile as a meaningful preview", () => {
    const preview = normalizeResourcePreview({
      title: "PDF",
      description: "Document",
      publisher: null,
      source: "none",
    });

    expect(preview.previewMeaningful).toBe(false);
  });

  it("reports meaningful coverage as a ratio", () => {
    expect(
      resourcePreviewCoverage([
        { previewMeaningful: true },
        { previewMeaningful: false },
        { previewMeaningful: true },
        {},
      ]),
    ).toBe(0.5);
  });
});
