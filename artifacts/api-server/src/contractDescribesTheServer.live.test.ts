/**
 * @fileOverview Verification role: exercises Contract Describes The Server.Live.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The catalogue describes what the server actually sends.
 *
 * openapi.yaml is hand-written and everything downstream is generated from it:
 * the React hooks the web app calls, the zod schemas, the types. So a schema
 * that is subtly wrong is not caught by anything -- the client compiles
 * against the mistake, and the mistake only surfaces as a field that is
 * undefined at runtime on somebody's screen.
 *
 * auditFixturesMatchTheContract.test.ts holds the audit fixtures against these
 * same schemas, which catches a fixture drifting from the contract. It cannot
 * catch the contract drifting from the server, because the fixture is
 * hand-written too: two hand-written things agreeing about a third is not
 * evidence about the third.
 *
 * This asks the server. It registers a throwaway account, does the work, and
 * parses each real response with the generated schema. It is how the
 * study-activities section was checked when it was written -- seven endpoints
 * that had been served since the feature shipped and described nowhere, so the
 * generated clients could not reach them and the phone app simply did not have
 * the feature.
 *
 * CI runs a server for the flow scripts already; this needs the same one:
 *
 *   VERIFY_LIVE_URL=http://localhost:4319 \
 *     pnpm --filter @workspace/api-server exec vitest run
 *
 * It writes: an account, one study activity, and one catalogue entry when it
 * publishes. Point it at a throwaway server, never at production.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CreateLearningGoalResponse,
  CreateStudyActivityResponse,
  HealthCheckResponse,
  GetSharedStudyActivityResponse,
  ListLearningGoalsResponse,
  ListStudyActivitiesResponse,
  PublishStudyActivityResponse,
  UpdateLearningGoalResponse,
} from "@workspace/api-zod";

const BASE = process.env.VERIFY_LIVE_URL;
const live = BASE ? describe : describe.skip;

/** One request, returning the status and the parsed body. */
async function call(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body =
    response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, body };
}

/**
 * The fields the contract calls a plain date, read from the contract.
 *
 * A schema saying `format: date` is turned by orval into `zod.coerce.date()`,
 * so parsing a response through it replaces "2026-12-01" with a Date and
 * res.json writes "2026-12-01T00:00:00.000Z". mustMatch cannot see that --
 * coerce accepts both -- so the server can satisfy every schema check here
 * while sending an instant where the contract promised a day.
 *
 * That is not a hypothetical failure mode: it shipped twice. It made every
 * schedule block invisible on every phone, and it left the web app's goal
 * editor showing an empty date field for a goal that had one.
 *
 * Read from openapi.yaml rather than listed here, so a seventh date field is
 * covered by this the day it is added rather than the day somebody remembers
 * this file.
 */
const contractPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../lib/api-spec/openapi.yaml",
);
const contract = readFileSync(contractPath, "utf8");

const contractLines = contract.split("\n");

/** Every `format: date` in the file — the declarations to account for. */
const dateDeclarations = contractLines
  .map((line, number) => ({ line, number: number + 1 }))
  .filter(({ line }) => /\bformat:\s*date\b(?!-)/.test(line));

/**
 * The ones written inline on a property, which is how all six response fields
 * are written: `targetDate: { type: [...], format: date }`.
 */
const inlineProperties = dateDeclarations.filter(({ line }) =>
  /^\s*(\w+):\s*\{[^}]*\bformat:\s*date\b(?!-)/.test(line),
);

/**
 * And the ones on a query or path parameter, which are inputs. `weekStart` on
 * GET /schedule is one: nothing the server sends carries it, so it is out of
 * scope here rather than unguarded.
 */
const parameterDeclarations = dateDeclarations.filter(
  ({ line, number }) =>
    !inlineProperties.some((property) => property.number === number) &&
    contractLines
      .slice(Math.max(0, number - 9), number - 1)
      .some((earlier) => /^\s*in:\s*(query|path|header)\s*$/.test(earlier)),
);

/** A date-only field is known by its name, wherever it turns up in a body. */
const DATE_ONLY_FIELDS = new Set(
  inlineProperties.map(({ line }) => /^\s*(\w+):/.exec(line)![1]),
);

/**
 * Anything neither bucket claims — a property written across several lines,
 * say. The scan would miss it silently, and this would stop being a guard for
 * that field while still reporting a clean run.
 */
const unaccountedDates = dateDeclarations.filter(
  ({ number }) =>
    !inlineProperties.some((property) => property.number === number) &&
    !parameterDeclarations.some((parameter) => parameter.number === number),
);

/** YYYY-MM-DD and nothing else: no time, no zone, no T. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The text Postgres writes for a timestamp, which is not ISO 8601.
 *
 * Hermes -- the engine the Expo app runs on -- reads "2026-08-28 15:46:13+00"
 * as Invalid Date, so any of these reaching a client is a date the phone
 * cannot draw. V8 parses them, which is exactly why this needs checking here
 * rather than being noticed by anyone using the web app.
 */
const POSTGRES_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:?\d{2})?)?$/;

/**
 * Walk a response and hold its dates to what a client can actually read.
 *
 * Two rules. A field the contract calls a date must be a date: null and absent
 * are both fine, an instant is not. And nothing anywhere may be the raw text
 * Postgres wrote, whatever it is called.
 */
function datesAreReadable(value: unknown, what: string, path = ""): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => datesAreReadable(item, what, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (typeof child === "string") {
      if (DATE_ONLY_FIELDS.has(key)) {
        expect(
          child,
          `${what}: ${here} is declared "format: date" in openapi.yaml, so a ` +
            `client reading it as a calendar day gets an instant instead -- and ` +
            `an instant formatted west of Greenwich is the day before`,
        ).toMatch(DATE_ONLY);
      }
      expect(
        POSTGRES_TIMESTAMP.test(child),
        `${what}: ${here} is the text Postgres wrote (${child}), not ISO 8601. ` +
          `Hermes reads that as Invalid Date, so it is a date the phone app ` +
          `cannot draw at all`,
      ).toBe(false);
    }
    datesAreReadable(child, what, here);
  }
}

/** What the failure should say: the path, not just "expected object". */
function mustMatch(
  schema: { safeParse: (value: unknown) => { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  value: unknown,
  what: string,
) {
  const result = schema.safeParse(value);
  const complaints = result.success
    ? []
    : (result.error?.issues ?? []).map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      );
  expect(
    complaints,
    `${what} is not the shape openapi.yaml describes, so every generated ` +
      `client is typed against something the server does not send`,
  ).toEqual([]);
  // Checked on the raw body, before any schema has coerced it: the parsed
  // value is a Date either way, so only what came off the wire can answer this.
  datesAreReadable(value, what);
}

live("what the server sends for health", () => {
  it("answers /healthz in the shape the contract describes", async () => {
    /*
     * The endpoint anybody reads when they want to know whether production is
     * working, and the one the contract described least: `status` and nothing
     * else, while the server sent a schema block and an AI block alongside it.
     * Somebody looking at `ai.state: "unknown"` on casparel.com had no
     * documented way to find out which kind of unknown it was.
     *
     * No /api prefix: this one is mounted at the root as well, because a load
     * balancer's health check is not an API client.
     */
    const response = await fetch(`${BASE}/api/healthz`);
    const body = await response.json();
    // 503 is a legitimate answer here -- a failed migration -- and the body is
    // the same shape either way, which is the point of checking it.
    expect([200, 503]).toContain(response.status);
    mustMatch(HealthCheckResponse, body, "GET /healthz");
  });
});

live("what the server sends for study activities", () => {
  let token = "";
  let activityId = 0;
  let shareToken: string | null = null;

  beforeAll(async () => {
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const registered = await call("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Contract Check",
        email: `contract-${stamp}@example.test`,
        password: "correct-horse-8",
      }),
    });
    token = (registered.body as { token?: string })?.token ?? "";
    expect(token, "could not register an account to check with").toBeTruthy();
  }, 30000);

  it("creates one", async () => {
    const created = await call(
      "/study-activities",
      {
        method: "POST",
        body: JSON.stringify({
          title: "Contract check set",
          subject: "Mathematics",
          mode: "flashcards",
          cards: [
            { id: "c1", term: "derivative", answer: "rate of change" },
            { id: "c2", term: "integral", answer: "area under a curve" },
          ],
        }),
      },
      token,
    );
    expect(created.status).toBe(201);
    mustMatch(CreateStudyActivityResponse, created.body, "POST /study-activities");
    activityId = (created.body as { id: number }).id;
  });

  it("lists them", async () => {
    const listed = await call("/study-activities", {}, token);
    expect(listed.status).toBe(200);
    mustMatch(ListStudyActivitiesResponse, listed.body, "GET /study-activities");
    expect((listed.body as unknown[]).length).toBeGreaterThan(0);
  });

  it("publishes one", async () => {
    const published = await call(
      `/study-activities/${activityId}/publish`,
      { method: "POST", body: JSON.stringify({ destination: "catalog" }) },
      token,
    );
    expect(published.status).toBe(201);
    mustMatch(
      PublishStudyActivityResponse,
      published.body,
      "POST /study-activities/{id}/publish",
    );
    shareToken = (published.body as { shareToken: string }).shareToken;
  });

  it("serves a published one to somebody with no account", async () => {
    // No token on purpose: this is the endpoint a shared link opens, and it
    // has to work for a person who has never signed in.
    const shared = await call(`/study-activities/shared/${shareToken}`);
    expect(shared.status).toBe(200);
    mustMatch(
      GetSharedStudyActivityResponse,
      shared.body,
      "GET /study-activities/shared/{token}",
    );
  });
});

live("what the contract calls a date", () => {
  it("knows about every date field in the file", () => {
    expect(
      unaccountedDates.map(({ number, line }) => `line ${number}: ${line.trim()}`),
      "openapi.yaml declares a `format: date` this test's scan did not " +
        "recognise as either a response property or a request parameter — " +
        "probably written across several lines. Teach the scan about it " +
        "rather than leaving the field unguarded.",
    ).toEqual([]);
    // The two fields that have ever had this defect, so an accidental empty
    // set reads as a failure rather than as a clean run.
    expect([...DATE_ONLY_FIELDS].sort()).toEqual(["date", "targetDate"]);
  });
});

live("what the server sends for learning goals", () => {
  let token = "";
  let goalId = 0;

  beforeAll(async () => {
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const registered = await call("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Goal Contract",
        email: `goal-contract-${stamp}@example.test`,
        password: "correct-horse-8",
      }),
    });
    token = (registered.body as { token?: string })?.token ?? "";
    expect(token, "could not register an account to check with").toBeTruthy();
  }, 30000);

  it("creates one with a target date", async () => {
    const created = await call(
      "/learning-goals",
      {
        method: "POST",
        body: JSON.stringify({
          title: "Understand electric fields",
          subject: "Physics",
          level: "beginner",
          targetDate: "2026-12-01",
        }),
      },
      token,
    );
    expect(created.status).toBe(201);
    mustMatch(CreateLearningGoalResponse, created.body, "POST /learning-goals");
    expect((created.body as { targetDate: string }).targetDate).toBe("2026-12-01");
    goalId = (created.body as { id: number }).id;
  });

  it("lists them", async () => {
    const listed = await call("/learning-goals", {}, token);
    expect(listed.status).toBe(200);
    mustMatch(ListLearningGoalsResponse, listed.body, "GET /learning-goals");
  });

  it("keeps the target date across an edit", async () => {
    // Without this, a failure to create reads here as a 404 on the edit, which
    // sends the next person looking at the wrong endpoint.
    expect(goalId, "no goal was created, so there is nothing to edit").toBeGreaterThan(0);
    const edited = await call(
      `/learning-goals/${goalId}`,
      { method: "PATCH", body: JSON.stringify({ title: "Understand fields" }) },
      token,
    );
    expect(edited.status).toBe(200);
    mustMatch(UpdateLearningGoalResponse, edited.body, "PATCH /learning-goals/{id}");
    expect((edited.body as { targetDate: string }).targetDate).toBe("2026-12-01");
  });
});
