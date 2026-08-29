#!/usr/bin/env node
/**
 * @fileOverview Repository tooling role: implements E2e Read Sweep for workspace development, build, validation, or documentation.
 * System connection: invoked by package scripts or maintainers; it is not part of the end-user runtime bundle.
 */
/**
 * Every readable endpoint in the contract, asked for once, by one account.
 *
 * The other harnesses are written flow by flow: register, save, organise,
 * study. That is the right shape for checking that a feature works, and it
 * leaves whatever nobody wrote a flow for completely unasked. A handler whose
 * response no longer matches its own schema answers 500 -- the response is
 * parsed before it is sent -- and a handler that forgets a null check does the
 * same. Neither shows up anywhere until somebody opens that screen.
 *
 * So this reads openapi.yaml, takes every GET in it, fills the parameters from
 * rows this run creates, and asks for all of them. The bar is deliberately low
 * and absolute: **no endpoint may answer 5xx**. A 200 is good, a 403 or a 404
 * is a fine answer to a question this account has no business asking, and a
 * 500 is the server saying it broke.
 *
 * Reading the contract rather than a list kept here is the point. A list would
 * be exactly as stale as the flows it was meant to backstop, and a new
 * endpoint would join this sweep by being added to the contract, which it has
 * to be anyway.
 *
 *   node scripts/e2e-read-sweep.mjs [baseUrl]
 *
 * Exit 0 nothing broke, 1 something answered 5xx, 75 the run could not be
 * performed and proves nothing.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.argv[2] || "http://localhost:4319").replace(/\/$/, "");
const EXIT_INCONCLUSIVE = 75;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "sweep-Passw0rd!checks";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");

class Inconclusive extends Error {}

let checks = 0;
const broken = [];

function report(route, status, detail = "") {
  checks += 1;
  if (status >= 500) {
    broken.push(`${route} -> ${status} ${detail}`);
    console.log(`FAIL ${route.padEnd(52)} -> ${status}  ${detail}`);
  } else {
    console.log(`ok   ${route.padEnd(52)} -> ${status}`);
  }
}

async function call(method, path, { token, body } = {}) {
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

/** Every GET path the contract declares, read line by line. */
function readablePaths() {
  const found = [];
  let inPaths = false;
  let path = null;
  for (const line of readFileSync(
    resolve(repository, "lib/api-spec/openapi.yaml"),
    "utf8",
  ).split("\n")) {
    if (/^paths:/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths && /^[a-z]/.test(line)) inPaths = false;
    if (!inPaths) continue;
    const isPath = line.match(/^ {2}(\/\S*):\s*$/);
    if (isPath) {
      path = isPath[1];
      continue;
    }
    if (/^ {4}get:\s*$/.test(line) && path) found.push(path);
  }
  return found;
}

/**
 * Endpoints this run deliberately does not ask for, each with the reason.
 *
 * All three kinds are about something outside this server: an OAuth handshake
 * that ends at Google, a token only the person who was given it holds, and a
 * proxy for a third-party page. Asking would measure somebody else's service.
 */
const SKIP = new Map([
  ["/auth/google", "starts an OAuth redirect to Google rather than answering"],
  ["/auth/google/callback", "the far side of a Google redirect, with a code this run does not have"],
  ["/calendar/google/connect", "starts an OAuth redirect to Google rather than answering"],
  ["/calendar/google/callback", "the far side of a Google redirect"],
  ["/google-classroom/courses", "reads Google's API with a token no account here has connected"],
  ["/google-classroom/courses/{courseId}/students", "reads Google's API with a token no account here has connected"],
  ["/resources/oembed", "fetches a third-party page, so a failure would be their outage rather than ours"],
]);

async function main() {
  const email = `sweep-${RUN}@example.test`;
  const registered = await call("POST", "/api/auth/register", {
    body: { email, password: PASSWORD, name: "Read Sweep" },
  });
  if (registered.status === 429) {
    throw new Inconclusive(
      "rate limited while registering; the sweep proves nothing. Give the " +
        "credential window time to clear.",
    );
  }
  if (registered.status !== 201 || !registered.body?.token) {
    throw new Inconclusive(
      `could not register: HTTP ${registered.status} ${registered.text.slice(0, 160)}`,
    );
  }
  const token = registered.body.token;
  const userId = registered.body.user.id;

  /*
   * One of everything this account can own, so a parameterised path is asked
   * about a real row. Without them every {id} would be a 404 and the sweep
   * would prove only that the router matches -- the handler body, which is
   * where a schema mismatch lives, would never run.
   */
  const made = {};
  const create = async (key, path, body) => {
    const res = await call("POST", path, { token, body });
    if (res.status < 300 && res.body?.id) made[key] = res.body.id;
    else console.log(`--   could not create ${key}: HTTP ${res.status}`);
  };

  await create("goal", "/api/learning-goals", {
    title: `Sweep goal ${RUN}`,
    subject: "Mathematics",
    level: "beginner",
  });
  await create("list", "/api/lists", { name: `Sweep list ${RUN}` });
  await create("resource", "/api/resources", {
    title: `Sweep resource ${RUN}`,
    url: `https://example.test/sweep-${RUN}`,
    format: "article",
    subject: "Mathematics",
    gradeLevel: "Year 12",
  });
  await create("canvas", "/api/canvases", {
    title: `Sweep canvas ${RUN}`,
    content: { shapes: [] },
  });
  // Two cards, not one: a set of one is refused, which is a rule about study
  // sets rather than about this sweep.
  await create("activity", "/api/study-activities", {
    title: `Sweep set ${RUN}`,
    subject: "Mathematics",
    mode: "flashcards",
    cards: [
      { id: "a", term: "1", answer: "2" },
      { id: "b", term: "3", answer: "4" },
    ],
  });
  await create("block", "/api/schedule", {
    title: `Sweep block ${RUN}`,
    date: "2026-09-01",
    startTime: "09:00",
    endTime: "10:00",
  });
  // A study session is a meeting, so it needs somewhere to meet.
  await create("session", "/api/study-sessions", {
    title: `Sweep session ${RUN}`,
    startsAt: "2026-09-01T09:00:00.000Z",
    durationMinutes: 30,
    meetingUrl: "https://meet.example.org/sweep",
  });

  if (made.list && made.resource) {
    await call("POST", `/api/lists/${made.list}/items`, {
      token,
      body: { resourceId: made.resource },
    });
    /*
     * And a goal built from that list, so the drift read has a source list to
     * compare against. Without one it answers "this goal was not built from a
     * list" before touching the comparison, which is the part worth running.
     */
    const built = await call("POST", `/api/lists/${made.list}/path`, {
      token,
      body: {},
    });
    if (built.status < 300 && built.body?.id) made.goal = built.body.id;
  }

  /*
   * A row in each listing that can be given one, which is the difference
   * between asking a question and getting an answer worth reading.
   *
   * A listing that returns `[]` parses its item schema zero times, so an item
   * shape that no longer matches the contract sails through -- measured, by
   * breaking one deliberately and watching an empty sweep pass. Rows are what
   * make this sweep about the handler rather than about the router.
   */
  if (made.goal) {
    const goals = await call("GET", "/api/learning-goals", { token });
    const step = goals.body?.find((one) => one.id === made.goal)?.pathSteps?.[0];
    if (step) {
      await call(
        "POST",
        `/api/learning-goals/${made.goal}/steps/${step.id}/completion`,
        {
          token,
          body: { completed: true, understanding: 4, confidence: 3, reflection: "Swept" },
        },
      );
    }
  }
  if (made.resource) {
    await call("POST", `/api/resources/${made.resource}/reviews`, {
      token,
      body: { rating: 4, comment: `Swept ${RUN}` },
    });
  }
  await create("post", "/api/forum/posts", {
    title: `Sweep post ${RUN}`,
    body: "Written so the forum listings have something in them.",
  });

  /*
   * A second account, because one endpoint is about somebody else by design:
   * "have I blocked this person" refuses your own id, so asking it about
   * yourself measures the guard and never the handler.
   */
  const other = await call("POST", "/api/auth/register", {
    body: {
      email: `sweep-other-${RUN}@example.test`,
      password: PASSWORD,
      name: "Read Sweep Other",
    },
  });
  const otherId = other.status === 201 ? other.body?.user?.id : undefined;
  if (!otherId) console.log("--   could not register a second account for /users/{id}/safety");
  const goalRead = made.goal
    ? await call("GET", "/api/learning-goals", { token })
    : null;
  const stepId =
    goalRead?.body?.find((one) => one.id === made.goal)?.pathSteps?.[0]?.id ?? "foundations";

  /**
   * What each parameter is filled with.
   *
   * A path whose parameter has no entry is asked with a value that will not
   * exist, which is still worth doing: "not found" has to be an answer rather
   * than a crash, and a handler that reads a row before checking whether it
   * found one fails exactly there.
   */
  const values = {
    id: (path) =>
      path.endsWith("/safety") ? (otherId ?? 999999)
      : path.startsWith("/learning-goals") ? made.goal
      : path.startsWith("/lists") ? made.list
      : path.startsWith("/canvases") ? made.canvas
      : path.startsWith("/study-activities") ? made.activity
      : path.startsWith("/study-sessions") ? made.session
      : path.startsWith("/schedule") ? made.block
      : path.startsWith("/resources") ? made.resource
      : path.startsWith("/users") ? userId
      : 999999,
    stepId: () => stepId,
    classId: () => 999999,
    courseId: () => "999999",
    itemId: () => 999999,
    reviewId: () => 999999,
    token: () => "no-such-share-token",
    targetType: () => "post",
  };

  console.log("");
  for (const path of readablePaths()) {
    const why = SKIP.get(path);
    if (why) {
      console.log(`--   ${path.padEnd(52)} not asked: ${why}`);
      continue;
    }
    const filled = path.replace(/\{([^}]+)\}/g, (_, name) =>
      String((values[name] ?? (() => 999999))(path)),
    );
    const res = await call("GET", `/api${filled}`, { token });
    if (res.status === 429) {
      throw new Inconclusive(
        `rate limited part-way through at ${filled}; the sweep is incomplete ` +
          "and proves nothing about what it did not reach.",
      );
    }
    report(
      `GET ${filled}`,
      res.status,
      res.status >= 500 ? res.text.replace(/\s+/g, " ").slice(0, 200) : "",
    );
  }

  console.log("");
  if (broken.length) {
    console.error(`${broken.length} of ${checks} readable endpoints answered 5xx:\n`);
    for (const one of broken) console.error(`  - ${one}`);
    process.exit(1);
  }
  console.log(
    `${checks} readable endpoints asked for by one signed-in account, and ` +
      `none of them broke.`,
  );
}

main().catch((error) => {
  if (error instanceof Inconclusive) {
    console.error(`inconclusive: ${error.message}`);
    process.exit(EXIT_INCONCLUSIVE);
  }
  console.error(error);
  process.exit(1);
});
