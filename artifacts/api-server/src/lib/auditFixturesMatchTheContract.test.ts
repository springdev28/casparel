/**
 * @fileOverview Verification role: exercises Audit Fixtures Match The Contract.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The audit fixtures are the shapes the contract says they are.
 *
 * audit-fixtures.mjs opens by saying what it is for: "answer the handful of
 * endpoints the authenticated shell calls with fixtures that match the OpenAPI
 * schemas". That is the right instruction, and nothing was making it true.
 *
 * Five browser audits render the signed-in product against those fixtures --
 * every page, six languages, two widths. Whatever the fixture leaves out, the
 * page renders without, and every audit passes on the version of the page
 * nobody will ever see. The learning goal is what showed this: `subject`,
 * `level` and `updatedAt` were all missing and all three are required, so the
 * goal card was audited with two empty 22px pills where its badges belong.
 * Its path steps carried `done` where the contract says `completed`, so the
 * progress line read "0 of 2" beside a step that was finished.
 *
 * That is the same failure as an audit pointed at a route the router does not
 * serve: a clean report about something that is not the product. This is the
 * other half of it. auditsCoverTheSamePages.test.ts checks that the audits
 * open the right pages; this checks that what those pages are given is real.
 *
 * Validated against the generated zod schemas rather than a hand-written idea
 * of each shape, so the two cannot drift: they come from the same openapi.yaml
 * the server is built against.
 *
 * One row was wrong rather than one fixture: `/api/users/me/access` is served
 * by routes/auth.ts and appears nowhere in openapi.yaml, so holding it against
 * GetUserSafetyStatusResponse -- which describes a different endpoint --
 * reported a correct fixture as broken. It is unchecked now, and named as
 * such, which is the accurate thing to say about an endpoint with no contract.
 *
 * A fixture with no schema here is reported, not failed. Several endpoints the
 * app calls are not in the catalogue at all -- canvases and the forum among
 * them -- and a fixture for one of those has nothing to be checked against.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod/v4";
import * as contract from "@workspace/api-zod";

// The objects themselves, not the source as text: they go straight to the
// schemas below. Typed by audit-fixtures.d.ts, since the module is plain JS.
const { FIXTURES } = await import("../../../app/scripts/audit-fixtures.mjs");

/**
 * Which schema answers each fixture.
 *
 * Written out rather than derived from the path: the generated names come from
 * operation ids, and guessing "/api/users/me/usage" into "GetMyUsageResponse"
 * would be a second thing to keep right. A name that stops existing fails the
 * "found its schemas" check below rather than silently checking nothing.
 */
const SCHEMA_FOR: Record<string, string> = {
  "/api/users/me": "GetMeResponse",
  "/api/users/me/usage": "GetMyUsageResponse",
  "/api/users/me/preferences": "GetMyPreferencesResponse",
  "/api/resources": "ListResourcesResponse",
  "/api/resources/101": "GetResourceResponse",
  "/api/resources/101/source-review": "GetResourceSourceReviewResponse",
  "/api/learning-goals": "ListLearningGoalsResponse",
  "/api/calendar/status": "GetCalendarStatusResponse",
  "/api/activity/recent": "GetRecentActivityResponse",
  "/api/classes": "ListClassesResponse",
  "/api/classes/31": "GetClassResponse",
  "/api/classes/31/seating-chart": "GetSeatingChartResponse",
  "/api/classes/31/student-goals": "ListClassStudentGoalsResponse",
  "/api/lists": "ListResourceListsResponse",
  "/api/class-invitations": "ListClassInvitationsResponse",
  "/api/google-classroom/status": "GetGCStatusResponse",
  "/api/schedule": "ListScheduleBlocksResponse",
  "/api/study-sessions": "ListStudySessionsResponse",
  "/api/study-activities": "ListStudyActivitiesResponse",
  "/api/discover/capabilities": "GetDiscoverCapabilitiesResponse",
  "/api/learning-signals": "GetLearningSignalsResponse",
  "/api/admin/overview": "GetAdminOverviewResponse",
};

const schemas = contract as unknown as Record<string, ZodType | undefined>;

/** The fixtures this file has a schema for, and can therefore check. */
const checkable = Object.keys(SCHEMA_FOR).filter((path) => path in FIXTURES);

describe("the audit fixtures", () => {
  it("found the fixtures and the schemas to check them against", () => {
    /*
     * Both halves. An empty FIXTURES -- a renamed export, a moved file --
     * would make every case below vacuous, and so would a schema table whose
     * names no longer exist after a regeneration.
     */
    expect(Object.keys(FIXTURES).length, "audit-fixtures.mjs").toBeGreaterThanOrEqual(20);
    const missing = Object.entries(SCHEMA_FOR)
      .filter(([, name]) => !schemas[name])
      .map(([path, name]) => `${path} -> ${name}`);
    expect(
      missing,
      "these schema names are not exported by @workspace/api-zod any more, so " +
        "those fixtures are going unchecked",
    ).toEqual([]);
    expect(checkable.length, "nothing left to check").toBeGreaterThanOrEqual(15);
  });

  it.each(checkable.map((path) => [path] as const))(
    "answers %s with what the contract describes",
    (path) => {
      const schema = schemas[SCHEMA_FOR[path]]!;
      const result = schema.safeParse(FIXTURES[path]);
      const complaints = result.success
        ? []
        : result.error.issues.map(
            (issue) =>
              `${issue.path.join(".") || "(root)"}: ${issue.message}`,
          );
      expect(
        complaints,
        `the fixture for ${path} is not the shape ${SCHEMA_FOR[path]} ` +
          `describes, so every audit renders that page with a field the real ` +
          `server would have sent`,
      ).toEqual([]);
    },
  );

  it("says which fixtures nothing here can check", () => {
    /*
     * Not a failure. Canvases, the forum, direct messages and the workflow
     * strip are all absent from openapi.yaml -- the same gap that keeps them
     * off the phone -- so there is no schema to hold their fixtures against.
     * Naming them keeps the difference between "checked and correct" and "not
     * checked" visible from the output.
     */
    const unchecked = Object.keys(FIXTURES).filter((path) => !(path in SCHEMA_FOR));
    if (unchecked.length) {
      console.warn(
        `No contract schema for ${unchecked.length} fixture(s): ` +
          `${unchecked.join(", ")}. Either the endpoint is missing from ` +
          `openapi.yaml, or it needs a row in SCHEMA_FOR.`,
      );
    }
    expect(Array.isArray(unchecked)).toBe(true);
  });
});
