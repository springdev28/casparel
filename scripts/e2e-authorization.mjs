#!/usr/bin/env node
/**
 * Whether one account can reach another account's work.
 *
 * This is the failure that matters most and shows least. A handler that
 * forgets to compare the row's owner against the caller looks completely
 * normal: it returns 200, the shape is right, the page renders. Nothing is
 * red. The only way to see it is to ask a second account for the first
 * account's rows and find out that it gets them.
 *
 * So: Ana creates one of everything, Ben asks for all of it, and every answer
 * that is not a refusal is a finding. Ben is an ordinary signed-in account with
 * no relationship to Ana -- not a classmate, not invited, nothing shared.
 *
 * Reads, writes and deletes are all tried, because they fail independently:
 * a list whose GET checks the owner and whose DELETE does not is a real and
 * ordinary mistake, and only asking for both finds it.
 *
 *   node scripts/e2e-authorization.mjs [baseUrl]
 *
 * Exit 0 nothing reachable, 1 something is, 75 the run could not be performed.
 */
const BASE = (process.argv[2] || "http://localhost:4319").replace(/\/$/, "");
const EXIT_INCONCLUSIVE = 75;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "authz-Passw0rd!checks";

/** Anything at or above this is a refusal. Below it, Ben got through. */
const REFUSALS = new Set([401, 403, 404]);

let findings = 0;
let checks = 0;

class Inconclusive extends Error {}

async function once(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, text, headers: res.headers };
}

/** As in the other harnesses: a 429 says nothing about authorization. */
async function call(method, path, options = {}) {
  const first = await once(method, path, options);
  if (first.status !== 429) return first;
  const header = Number(first.headers.get("retry-after"));
  const wait = Math.min((Number.isFinite(header) && header > 0 ? header : 60) * 1000, 70_000);
  console.log(`     (rate limited on ${method} ${path}; waiting ${Math.ceil(wait / 1000)}s)`);
  await new Promise((resolve) => setTimeout(resolve, wait + 1000));
  const second = await once(method, path, options);
  if (second.status === 429) {
    throw new Inconclusive(`still rate limited on ${method} ${path}`);
  }
  return second;
}

async function newUser(tag) {
  const email = `authz-${tag}-${RUN}@example.test`;
  const res = await call("POST", "/api/auth/register", {
    body: { email, password: PASSWORD, name: `Authz ${tag}` },
  });
  if (res.status !== 201 || !res.body?.token) {
    throw new Error(`could not register ${email}: HTTP ${res.status} ${res.text.slice(0, 160)}`);
  }
  return { email, token: res.body.token, user: res.body.user };
}

function report(label, method, path, status, detail = "") {
  checks += 1;
  if (REFUSALS.has(status)) {
    console.log(`ok   ${label.padEnd(34)} ${method} ${path} -> ${status}`);
    return;
  }
  findings += 1;
  console.log(
    `FINDING ${label}\n     ${method} ${path} answered ${status} to an unrelated account${detail ? `\n     ${detail}` : ""}`,
  );
}

async function main() {
  console.log(`\nCan a stranger reach your work? ${BASE}\n`);

  const ana = await newUser("ana");
  const ben = await newUser("ben");
  console.log(`Ana is user ${ana.user.id}, Ben is user ${ben.user.id}. Ben has no relationship to Ana.\n`);

  /** Everything Ana makes, as [label, createdId, paths to try]. */
  const owned = [];

  async function create(label, path, body, paths) {
    const res = await call("POST", path, { token: ana.token, body });
    if (res.status !== 201 && res.status !== 200) {
      console.log(`--   ${label.padEnd(34)} not created (HTTP ${res.status} ${res.text.slice(0, 90)})`);
      return;
    }
    const id = res.body?.id;
    if (!id) {
      console.log(`--   ${label.padEnd(34)} created but returned no id`);
      return;
    }
    owned.push({ label, id, paths: paths(id) });
  }

  await create(
    "learning goal",
    "/api/learning-goals",
    { title: "Ana's goal", subject: "Mathematics", level: "beginner" },
    (id) => [
      ["GET", `/api/learning-goals/${id}`],
      ["PATCH", `/api/learning-goals/${id}`, { title: "Ben was here", subject: "Mathematics", level: "beginner" }],
      ["DELETE", `/api/learning-goals/${id}`],
    ],
  );

  await create(
    "reading list",
    "/api/lists",
    { name: "Ana's list" },
    (id) => [
      ["GET", `/api/lists/${id}`],
      ["PATCH", `/api/lists/${id}`, { name: "Ben was here" }],
      ["DELETE", `/api/lists/${id}`],
    ],
  );

  await create(
    "canvas",
    "/api/canvases",
    { title: "Ana's canvas", content: { shapes: [] } },
    (id) => [
      ["GET", `/api/canvases/${id}`],
      ["PATCH", `/api/canvases/${id}`, { title: "Ben was here" }],
      ["DELETE", `/api/canvases/${id}`],
    ],
  );

  await create(
    "study activity",
    "/api/study-activities",
    {
      title: "Ana's set",
      subject: "Mathematics",
      mode: "flashcards",
      cards: [
        { id: "a", term: "1", answer: "2" },
        { id: "b", term: "3", answer: "4" },
      ],
    },
    (id) => [
      ["PATCH", `/api/study-activities/${id}`, {
        title: "Ben was here",
        subject: "Mathematics",
        mode: "flashcards",
        cards: [
          { id: "a", term: "x", answer: "y" },
          { id: "b", term: "z", answer: "w" },
        ],
      }],
      ["DELETE", `/api/study-activities/${id}`],
    ],
  );

  await create(
    "schedule block",
    "/api/schedule",
    {
      title: "Ana's revision",
      date: "2026-09-01",
      startTime: "09:00",
      endTime: "10:00",
    },
    (id) => [
      ["PATCH", `/api/schedule/${id}`, { title: "Ben was here" }],
      ["DELETE", `/api/schedule/${id}`],
    ],
  );

  await create(
    "study session",
    "/api/study-sessions",
    {
      title: "Ana's session",
      startsAt: "2026-09-01T09:00:00.000Z",
      durationMinutes: 30,
      meetingUrl: "https://meet.example.org/ana",
    },
    (id) => [
      ["GET", `/api/study-sessions/${id}`],
      ["PATCH", `/api/study-sessions/${id}`, { title: "Ben was here" }],
      ["DELETE", `/api/study-sessions/${id}`],
    ],
  );

  console.log("");
  for (const { label, paths } of owned) {
    for (const [method, path, body] of paths) {
      const res = await call(method, path, { token: ben.token, body });
      report(
        label,
        method,
        path,
        res.status,
        res.status < 400 ? `body: ${res.text.slice(0, 200)}` : "",
      );
    }
  }

  // Administration is the other way in: a route that forgets requireAdmin
  // hands an ordinary account the whole user table.
  console.log("");
  for (const [method, path, body] of [
    ["GET", "/api/admin/users"],
    ["GET", "/api/admin/overview"],
    ["GET", "/api/admin/resources/review-queue"],
    ["PATCH", `/api/admin/users/${ana.user.id}`, { role: "admin" }],
  ]) {
    const res = await call(method, path, { token: ben.token, body });
    report("administration", method, path, res.status,
      res.status < 400 ? `body: ${res.text.slice(0, 160)}` : "");
  }

  /**
   * A private conversation is private to two people.
   *
   * Worth asking separately from the rows above. Those are reached by an id
   * that belongs to somebody; a conversation is reached by an id that belongs
   * to a *pair*, and "am I one of the two?" is a different question from "is
   * this mine?" -- easy to answer with a lookup that finds the conversation
   * and forgets to say whose it is.
   */
  console.log("");
  const cara = await newUser("cara");
  const conversation = await call("POST", "/api/direct-messages/conversations", {
    token: ana.token,
    body: { userId: ben.user.id, body: "Something meant for one person." },
  });

  if (conversation.status !== 201 && conversation.status !== 200) {
    console.log(
      `--   private conversation\n     not run: could not start one (HTTP ${conversation.status} ${conversation.text.slice(0, 120)})`,
    );
  } else {
    const conversationId = conversation.body?.id ?? conversation.body?.conversation?.id;
    checks += 1;
    if (!conversationId) {
      findings += 1;
      console.log("FINDING private conversation\n     started but returned no id to check");
    } else {
      console.log(`ok   ${"a conversation can be started".padEnd(34)} id=${conversationId}`);

      const read = await call(
        "GET",
        `/api/direct-messages/conversations/${conversationId}`,
        { token: cara.token },
      );
      report("someone else's conversation", "GET",
        `/api/direct-messages/conversations/${conversationId}`, read.status,
        read.status < 400 ? `body: ${read.text.slice(0, 200)}` : "");

      const write = await call(
        "POST",
        `/api/direct-messages/conversations/${conversationId}/messages`,
        { token: cara.token, body: { body: "Butting in." } },
      );
      report("posting into it", "POST",
        `/api/direct-messages/conversations/${conversationId}/messages`, write.status,
        write.status < 400 ? `body: ${write.text.slice(0, 200)}` : "");

      // The other half: the two people in it must still be able to use it.
      const asParticipant = await call(
        "GET",
        `/api/direct-messages/conversations/${conversationId}`,
        { token: ben.token },
      );
      checks += 1;
      if (asParticipant.status === 200) {
        console.log(`ok   ${"the person written to can read it".padEnd(34)} GET -> 200`);
      } else {
        findings += 1;
        console.log(
          `FINDING private conversation\n     the recipient cannot read their own conversation (HTTP ${asParticipant.status})`,
        );
      }
    }
  }

  // And the accounts themselves.
  console.log("");
  const profile = await call("GET", `/api/users/${ana.user.id}`, { token: ben.token });
  checks += 1;
  if (profile.status < 400 && profile.body?.email) {
    findings += 1;
    console.log(
      `FINDING profile\n     GET /api/users/${ana.user.id} gave an unrelated account Ana's email address\n     body: ${profile.text.slice(0, 200)}`,
    );
  } else {
    console.log(
      `ok   ${"profile hides the address".padEnd(34)} GET /api/users/:id -> ${profile.status}${profile.body?.email ? " (with email!)" : ""}`,
    );
  }

  console.log(
    findings === 0
      ? `\nNothing of Ana's was reachable. ${checks} attempts, all refused.\n`
      : `\n${findings} of ${checks} attempts got through.\n`,
  );
  process.exit(findings === 0 ? 0 : 1);
}

main().catch((error) => {
  if (error instanceof Inconclusive) {
    console.error(`\nInconclusive: ${error.message}\n`);
    process.exit(EXIT_INCONCLUSIVE);
  }
  console.error(`\nCould not finish: ${error.message}\n`);
  process.exit(1);
});
