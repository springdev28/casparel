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
import {
  CreateStudyActivityResponse,
  HealthCheckResponse,
  GetSharedStudyActivityResponse,
  ListStudyActivitiesResponse,
  PublishStudyActivityResponse,
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
