/**
 * @fileOverview Verification role: exercises Resource Columns.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it, vi } from "vitest";

const { columns } = vi.hoisted(() => ({
  columns: {
    id: { name: "id" },
    title: { name: "title" },
    url: { name: "url" },
    description: { name: "description" },
    format: { name: "format" },
    subject: { name: "subject" },
    gradeLevel: { name: "grade_level" },
    thumbnailUrl: { name: "thumbnail_url" },
    workspaceRole: { name: "workspace_role" },
    submittedById: { name: "submitted_by_id" },
    createdAt: { name: "created_at" },
    verificationStatus: { name: "verification_status" },
    verificationNote: { name: "verification_note" },
  },
}));

vi.mock("@workspace/db", () => ({ resourcesTable: columns }));
vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join("?"),
    values,
  }),
}));

import {
  publicResourceColumns,
  resourceColumnsForViewer,
} from "./resourceColumns";

describe("resource response columns", () => {
  it("never includes moderation notes in the baseline public projection", () => {
    expect(publicResourceColumns).not.toHaveProperty("verificationNote");
  });

  it("exposes moderation notes directly only to administrators", () => {
    expect(resourceColumnsForViewer(1, true).verificationNote).toBe(
      columns.verificationNote,
    );
  });

  it("uses a submitter-only case expression for signed-in viewers", () => {
    const note = resourceColumnsForViewer(42, false)
      .verificationNote as unknown as { text: string; values: unknown[] };
    expect(note.text).toContain("case when");
    expect(note.values).toEqual([
      columns.submittedById,
      42,
      columns.verificationNote,
    ]);
  });

  it("selects a constant null note for anonymous viewers", () => {
    const note = resourceColumnsForViewer(null, false)
      .verificationNote as unknown as { text: string; values: unknown[] };
    expect(note.text).toContain("null::text");
    expect(note.values).toEqual([]);
  });
});
