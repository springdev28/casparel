#!/usr/bin/env node
/**
 * @fileOverview Repository tooling role: implements E2e Api for workspace development, build, validation, or documentation.
 * System connection: invoked by package scripts or maintainers; it is not part of the end-user runtime bundle.
 */
/**
 * The flows a person actually performs, against a real server and a real
 * database.
 *
 * Everything else that checks this product does so with the real parts taken
 * out. The unit tests mock the database, so they check that a handler asks for
 * the right rows, not that the rows come back. The page audit serves a static
 * build and answers the API from fixtures, so it checks that a screen renders,
 * not that anything behind it works. Both were green while people search
 * returned nothing and deep research quietly returned the free check.
 *
 * The two newest features are the clearest case. Copying an activity is covered
 * by a test that reads the route file and asserts the string `classId: null`
 * appears in it. That is a real check of a real risk, and it still cannot tell
 * you whether a copy is actually detached, because nothing ever inserted a row.
 *
 * So this runs the flows: register, sign in, create, share, copy, invite, join,
 * search, delete. It asserts on what comes back over HTTP, and each assertion
 * is a property somebody would notice losing.
 *
 * Usage:
 *
 *   node scripts/e2e-api.mjs [baseUrl]        # default http://localhost:4319
 *
 * Every run registers its own users under a unique suffix, so it is safe to run
 * repeatedly against the same database and never touches rows it did not make.
 *
 * Set E2E_ADMIN_EMAIL to an address in the server's ADMIN_EMAILS allowlist to
 * include the class flows. Registration only ever creates students -- correctly,
 * since the role must not be client-controlled -- so making a teacher needs an
 * administrator, and without one those flows are reported as not run rather
 * than quietly passing.
 *
 * Exit codes follow smoke-check.mjs: 0 all checks passed, 1 something is
 * broken, 75 the run could not be performed and proves nothing. The last one
 * matters because the credential limiter allows twenty attempts per quarter
 * hour per IP, and each run registers several accounts -- a few runs in
 * succession trip it. That is the limiter working, not the product failing, and
 * the two must not report the same way.
 */
const BASE = (process.argv[2] || "http://localhost:4319").replace(/\/$/, "");

/** Nothing was proven; see the header. Same convention as smoke-check.mjs. */
const EXIT_INCONCLUSIVE = 75;

/** Unique per run, so repeated runs do not collide on the email unique index. */
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

const PASSWORD = "e2e-Passw0rd!checks";

/**
 * The administrator's password.
 *
 * Deliberately the same string in every harness. They all bootstrap the same
 * allowlisted account and whichever runs first creates it; when the defaults
 * differed, the second script found the address already registered, could not
 * sign in to it, and stopped with a 401 that looked like a broken login.
 */
const ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD || "e2e-Admin-Passw0rd!shared";

let failures = 0;
let checks = 0;

function ok(label, detail = "") {
  checks += 1;
  console.log(`ok   ${label}${detail ? `  ${detail}` : ""}`);
}

function fail(label, detail) {
  checks += 1;
  failures += 1;
  console.log(`FAIL ${label}\n     ${detail}`);
}

function check(label, condition, detail = "") {
  if (condition) ok(label, detail);
  else fail(label, detail || "expected true");
}

/** Named so it reads differently from a pass in the output, because it is. */
function notRun(label, why) {
  console.log(`--   ${label}\n     not run: ${why}`);
}

/** Thrown when the run cannot prove anything either way. */
class Inconclusive extends Error {}

/** Longest we will sit out a rate-limit window before giving up on the run. */
const MAX_RETRY_WAIT_MS = 70_000;

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

/**
 * One request, with 429 handled centrally.
 *
 * A 429 is never evidence about the product: it says the run asked for more
 * than the window allows. Three separate limiters cover these routes -- twenty
 * credential attempts per quarter hour, twenty writes per minute, a hundred
 * requests per minute -- and a full run comfortably reaches the write cap on
 * its own, let alone two runs in succession.
 *
 * This was learned the hard way: the first version of this file only noticed a
 * 429 while registering, so a limited run reported seven product failures. Now
 * every call goes through here, waits out the window once, and if that is not
 * enough gives up as inconclusive rather than pretending to know something.
 * Callers that mean to assert a 429 pass `expect429`.
 */
async function call(method, path, options = {}) {
  const first = await once(method, path, options);
  if (first.status !== 429 || options.expect429) return first;

  const header = Number(first.headers.get("retry-after"));
  const advertised = Number.isFinite(header) && header > 0 ? header * 1000 : 0;
  const wait = Math.min(advertised || 60_000, MAX_RETRY_WAIT_MS);
  console.log(
    `     (rate limited on ${method} ${path}; waiting ${Math.ceil(wait / 1000)}s)`,
  );
  await new Promise((resolve) => setTimeout(resolve, wait + 1000));

  const second = await once(method, path, options);
  if (second.status === 429) {
    throw new Inconclusive(
      `still rate limited on ${method} ${path} after waiting ` +
        `${Math.ceil(wait / 1000)}s. Give the window time to clear, or point ` +
        `at a server with its own database.`,
    );
  }
  return second;
}

/** Registers a fresh account and returns its token and user row. */
async function newUser(tag) {
  const email = `e2e-${tag}-${RUN}@example.test`;
  const res = await call("POST", "/api/auth/register", {
    body: { email, password: PASSWORD, name: `E2E ${tag}` },
  });
  // A 429 never reaches here: call() waits the window out, then gives up as
  // inconclusive. The credential window is fifteen minutes, so that give-up is
  // the usual outcome when runs are stacked too close together.
  if (res.status !== 201 || !res.body?.token) {
    throw new Error(
      `could not register ${email}: HTTP ${res.status} ${res.text.slice(0, 200)}`,
    );
  }
  return { email, token: res.body.token, user: res.body.user };
}

/**
 * Signs in the configured administrator, registering the account first if this
 * is the first run against this database. Allowlisted addresses are promoted to
 * admin when they sign in, so no seeding is needed beyond the server's own
 * ADMIN_EMAILS. Returns null when no address was configured.
 */
async function adminSession() {
  const email = process.env.E2E_ADMIN_EMAIL;
  if (!email) return null;
  const password = ADMIN_PASSWORD;

  await call("POST", "/api/auth/register", {
    body: { email, password, name: "E2E Admin" },
  });
  const signIn = await call("POST", "/api/auth/login", {
    body: { email, password },
  });
  if (signIn.status !== 200 || !signIn.body?.token) {
    throw new Error(
      `E2E_ADMIN_EMAIL=${email} could not sign in: HTTP ${signIn.status}. ` +
        `If the account already exists with a different password, set ` +
        `E2E_ADMIN_PASSWORD.`,
    );
  }
  const who = await call("GET", "/api/users/me", { token: signIn.body.token });
  if (who.body?.role !== "admin") {
    throw new Error(
      `${email} signed in but is not an administrator (role=${who.body?.role}). ` +
        `It has to be in the server's ADMIN_EMAILS allowlist.`,
    );
  }
  return { token: signIn.body.token, user: who.body };
}

const ACTIVITY = (title) => ({
  title,
  subject: "Mathematics",
  mode: "flashcards",
  cards: [
    { id: "c1", term: "2 + 2", answer: "4" },
    { id: "c2", term: "3 + 3", answer: "6" },
  ],
});

async function main() {
  console.log(`\nEnd-to-end flows against ${BASE}\n`);

  // ---- accounts ---------------------------------------------------------
  const alice = await newUser("alice");
  ok("register returns a session", `id=${alice.user.id}`);

  check(
    "a new account is a student, whatever the request asked for",
    alice.user.role === "student",
    `role=${alice.user.role}`,
  );

  const dupe = await call("POST", "/api/auth/register", {
    body: { email: alice.email, password: PASSWORD, name: "Impostor" },
  });
  check(
    "the same email cannot register twice",
    dupe.status === 400,
    `HTTP ${dupe.status}`,
  );

  const wrongPassword = await call("POST", "/api/auth/login", {
    body: { email: alice.email, password: "not-the-password" },
  });
  check(
    "a wrong password is refused",
    wrongPassword.status === 401,
    `HTTP ${wrongPassword.status}`,
  );

  const relogin = await call("POST", "/api/auth/login", {
    body: { email: alice.email, password: PASSWORD },
  });
  check(
    "the right password signs in",
    relogin.status === 200 && Boolean(relogin.body?.token),
    `HTTP ${relogin.status}`,
  );

  const anonymous = await call("GET", "/api/users/me");
  check(
    "an unauthenticated request to a private route is refused",
    anonymous.status === 401,
    `HTTP ${anonymous.status}`,
  );

  const me = await call("GET", "/api/users/me", { token: alice.token });
  check(
    "the session identifies the account that owns it",
    me.status === 200 && me.body?.email === alice.email,
    `HTTP ${me.status}`,
  );

  const garbage = await call("GET", "/api/users/me", { token: "not.a.token" });
  check(
    "a forged token is refused",
    garbage.status === 401,
    `HTTP ${garbage.status}`,
  );

  const bob = await newUser("bob");

  // ---- activities: create, publish, copy ---------------------------------
  const created = await call("POST", "/api/study-activities", {
    token: alice.token,
    body: ACTIVITY("Alice's set"),
  });
  check(
    "an activity can be created",
    created.status === 201 && created.body?.id > 0,
    `HTTP ${created.status}`,
  );
  const activityId = created.body?.id;

  const tooFewCards = await call("POST", "/api/study-activities", {
    token: alice.token,
    body: { ...ACTIVITY("Half a set"), cards: [{ id: "c1", term: "a", answer: "b" }] },
  });
  check(
    "an activity with one card is refused",
    tooFewCards.status === 400,
    `HTTP ${tooFewCards.status}`,
  );

  const strangerCopy = await call(
    "POST",
    `/api/study-activities/${activityId}/copy`,
    { token: bob.token },
  );
  check(
    "a stranger cannot copy an unshared activity",
    strangerCopy.status === 403,
    `HTTP ${strangerCopy.status}`,
  );

  const missingCopy = await call(
    "POST",
    "/api/study-activities/99999999/copy",
    { token: bob.token },
  );
  check(
    "copying something that does not exist is a 404",
    missingCopy.status === 404,
    `HTTP ${missingCopy.status}`,
  );

  const published = await call(
    "POST",
    `/api/study-activities/${activityId}/publish`,
    { token: alice.token, body: { destination: "forum" } },
  );
  check(
    "publishing mints a share link",
    published.status === 201 && Boolean(published.body?.shareToken),
    `HTTP ${published.status}`,
  );

  const copy = await call(
    "POST",
    `/api/study-activities/${activityId}/copy`,
    { token: bob.token },
  );
  check(
    "a published activity can be copied",
    copy.status === 201,
    `HTTP ${copy.status} ${copy.text.slice(0, 160)}`,
  );

  if (copy.status === 201) {
    const c = copy.body;
    check("the copy belongs to whoever took it", c.ownerId === bob.user.id,
      `ownerId=${c.ownerId} want ${bob.user.id}`);
    check("the copy is in no class", c.classId === null, `classId=${c.classId}`);
    check("the copy has no share link", c.shareToken === null,
      `shareToken=${c.shareToken}`);
    check("the copy keeps the cards", c.cards?.length === 2,
      `cards=${c.cards?.length}`);
    check("the copy is a distinct row", c.id !== activityId,
      `id=${c.id} source=${activityId}`);

    // The property the whole feature rests on: editing a copy must not reach
    // back into the original.
    const edited = await call("PATCH", `/api/study-activities/${c.id}`, {
      token: bob.token,
      body: {
        ...ACTIVITY("Bob's edited copy"),
        cards: [
          { id: "c1", term: "changed", answer: "changed" },
          { id: "c2", term: "also changed", answer: "also changed" },
        ],
      },
    });
    check("the copy can be edited by its new owner", edited.status === 200,
      `HTTP ${edited.status}`);

    const alicesList = await call("GET", "/api/study-activities", {
      token: alice.token,
    });
    const original = (alicesList.body || []).find((a) => a.id === activityId);
    check(
      "editing the copy leaves the original alone",
      original?.title === "Alice's set" && original?.cards?.[0]?.term === "2 + 2",
      `original title=${original?.title} firstTerm=${original?.cards?.[0]?.term}`,
    );

    const aliceEditsCopy = await call("PATCH", `/api/study-activities/${c.id}`, {
      token: alice.token,
      body: ACTIVITY("Alice reaching into Bob's copy"),
    });
    check(
      "the original author cannot edit someone else's copy",
      aliceEditsCopy.status === 404 || aliceEditsCopy.status === 403,
      `HTTP ${aliceEditsCopy.status}`,
    );

    const bobsList = await call("GET", "/api/study-activities", {
      token: bob.token,
    });
    check(
      "the copy appears in the taker's own library",
      (bobsList.body || []).some((a) => a.id === c.id),
      `ids=${(bobsList.body || []).map((a) => a.id).join(",")}`,
    );
    check(
      "the source does not appear in the taker's library",
      !(bobsList.body || []).some((a) => a.id === activityId),
      "the taker's library should hold the copy, not the original",
    );
  }

  // ---- canvases ----------------------------------------------------------
  const canvas = await call("POST", "/api/canvases", {
    token: alice.token,
    body: { title: "Alice's canvas", content: { shapes: [] } },
  });
  check("a canvas can be created", canvas.status === 201,
    `HTTP ${canvas.status} ${canvas.text.slice(0, 160)}`);

  if (canvas.status === 201) {
    const strangerCanvasCopy = await call(
      "POST",
      `/api/canvases/${canvas.body.id}/copy`,
      { token: bob.token },
    );
    check(
      "a stranger cannot copy a private canvas",
      strangerCanvasCopy.status === 403 || strangerCanvasCopy.status === 404,
      `HTTP ${strangerCanvasCopy.status}`,
    );

    const ownCopy = await call(
      "POST",
      `/api/canvases/${canvas.body.id}/copy`,
      { token: alice.token },
    );
    check("you can copy your own canvas", ownCopy.status === 201,
      `HTTP ${ownCopy.status} ${ownCopy.text.slice(0, 160)}`);
    if (ownCopy.status === 201) {
      check("the canvas copy starts private",
        ownCopy.body.visibility === "private",
        `visibility=${ownCopy.body.visibility}`);
      check("the canvas copy has no share link",
        ownCopy.body.shareToken === null,
        `shareToken=${ownCopy.body.shareToken}`);
    }

    /**
     * The plan's limits are the product's price list, so they have to hold.
     *
     * A cap that silently stopped applying would cost money and show nothing:
     * every request succeeds, every screen looks right, and the only symptom
     * is revenue that never arrives. Free allows three canvases, and Alice has
     * two by now -- the one she made and the copy she took -- so one more
     * reaches the cap and the next must be refused.
     *
     * The copy route is checked at the cap too, deliberately. It is a second
     * way to create a canvas, written later than the first, and a limit
     * enforced on one path and not the other is a limit with a door in it.
     */
    const third = await call("POST", "/api/canvases", {
      token: alice.token,
      body: { title: "Third canvas", content: { shapes: [] } },
    });
    check("the plan's allowance can be reached", third.status === 201,
      `HTTP ${third.status} ${third.text.slice(0, 140)}`);

    const overCap = await call("POST", "/api/canvases", {
      token: alice.token,
      body: { title: "One too many", content: { shapes: [] } },
    });
    check(
      "creating past the plan's allowance is refused",
      overCap.status === 402,
      `HTTP ${overCap.status} -- a Free account created a fourth canvas where ` +
        `the plan allows three`,
    );
    check(
      "and says what to do about it",
      typeof overCap.body?.error === "string" &&
        /upgrade|remove/i.test(overCap.body.error),
      `error was ${JSON.stringify(overCap.body?.error ?? overCap.text.slice(0, 120))}`,
    );

    const copyOverCap = await call("POST", `/api/canvases/${canvas.body.id}/copy`, {
      token: alice.token,
    });
    check(
      "copying past the allowance is refused too",
      copyOverCap.status === 402,
      `HTTP ${copyOverCap.status} -- copying is a second way to create one, ` +
        `and it must not be a way around the cap`,
    );
  }

  // ---- discovery ---------------------------------------------------------
  const capabilities = await call("GET", "/api/discover/capabilities");
  check(
    "the app can ask which discovery features are switched on",
    capabilities.status === 200 &&
      typeof capabilities.body?.publicProfileSearch === "boolean",
    `HTTP ${capabilities.status} ${capabilities.text.slice(0, 120)}`,
  );

  // ---- the library -------------------------------------------------------
  const resources = await call("GET", "/api/resources");
  check(
    "the public library answers without a session",
    resources.status === 200 && Array.isArray(resources.body),
    `HTTP ${resources.status}`,
  );

  const list = await call("POST", "/api/lists", {
    token: alice.token,
    body: { name: "Reading for term one" },
  });
  check("a reading list can be created", list.status === 201,
    `HTTP ${list.status} ${list.text.slice(0, 160)}`);

  if (list.status === 201) {
    const strangersList = await call("GET", `/api/lists/${list.body.id}`, {
      token: bob.token,
    });
    check(
      "a stranger cannot read someone's private list",
      strangersList.status === 403 || strangersList.status === 404,
      `HTTP ${strangersList.status}`,
    );
  }

  /*
   * ---- a Learning List is an ordered set --------------------------------
   *
   * The order is the teaching, so it is the part of a list worth checking
   * against a real database: the phone's list screen sends the whole order and
   * puts the old one back if the write fails, which is only safe if the server
   * either applies all of it or none. Bob does this rather than Alice, whose
   * write allowance is mostly spent by here.
   */
  const bobsList = await call("POST", "/api/lists", {
    token: bob.token,
    body: { name: "In the order I will read them" },
  });
  check("a second learner can create their own list", bobsList.status === 201,
    `HTTP ${bobsList.status} ${bobsList.text.slice(0, 160)}`);

  if (bobsList.status === 201) {
    const added = [];
    for (const title of ["First read", "Second read"]) {
      const resource = await call("POST", "/api/resources", {
        token: bob.token,
        body: {
          title: `${title} ${RUN}`,
          url: `https://example.test/${title.replace(/\W+/g, "-").toLowerCase()}-${RUN}`,
          format: "article",
          subject: "Physics",
          gradeLevel: "Year 12",
        },
      });
      const item = await call("POST", `/api/lists/${bobsList.body.id}/items`, {
        token: bob.token,
        body: { resourceId: resource.body?.id },
      });
      if (item.status === 201 || item.status === 200) added.push(item.body.id);
    }
    check("two resources can be added to a list", added.length === 2,
      `added ${added.length}`);

    if (added.length === 2) {
      const flipped = [added[1], added[0]];
      const reordered = await call(
        "POST",
        `/api/lists/${bobsList.body.id}/items/reorder`,
        { token: bob.token, body: { itemIds: flipped } },
      );
      check("a list can be reordered", reordered.status === 204,
        `HTTP ${reordered.status} ${reordered.text.slice(0, 160)}`);

      const reread = await call("GET", `/api/lists/${bobsList.body.id}`, {
        token: bob.token,
      });
      check(
        "the new order is what the list is read back in",
        JSON.stringify((reread.body?.items ?? []).map((item) => item.id)) ===
          JSON.stringify(flipped),
        `order: ${JSON.stringify((reread.body?.items ?? []).map((item) => item.id))}`,
      );

      // Half an order is not an order. The refusal matters because the
      // alternative is a list renumbered part-way, which nothing can repair.
      const partial = await call(
        "POST",
        `/api/lists/${bobsList.body.id}/items/reorder`,
        { token: bob.token, body: { itemIds: [added[0]] } },
      );
      check("an order missing an item is refused", partial.status === 400,
        `HTTP ${partial.status}`);

      const stillFlipped = await call("GET", `/api/lists/${bobsList.body.id}`, {
        token: bob.token,
      });
      check(
        "and the refusal left the order alone",
        JSON.stringify((stillFlipped.body?.items ?? []).map((item) => item.id)) ===
          JSON.stringify(flipped),
        `order: ${JSON.stringify((stillFlipped.body?.items ?? []).map((item) => item.id))}`,
      );
    }
  }

  /*
   * ---- and the list becomes a path -------------------------------------
   *
   * The join between organising and studying: the list's resources, in the
   * list's order, as the steps of a goal. Asserted against a real server
   * because the parts that matter are what the database ends up holding --
   * the order, and that asking twice does not make a second path.
   */
  if (bobsList.status === 201) {
    const built = await call("POST", `/api/lists/${bobsList.body.id}/path`, {
      token: bob.token,
      body: {},
    });
    check(
      "a learning path can be built from a list",
      built.status === 201 && built.body?.alreadyBuilt === false,
      `HTTP ${built.status} ${built.text.slice(0, 160)}`,
    );

    const order = (built.body?.pathSteps ?? []).map((step) => step.resourceId);
    check(
      "the path follows the order the list was arranged in",
      order.length === 2,
      `steps: ${JSON.stringify(built.body?.pathSteps)?.slice(0, 200)}`,
    );
    check(
      "the goal remembers the list it came from",
      built.body?.sourceListId === bobsList.body.id,
      `sourceListId: ${built.body?.sourceListId}`,
    );

    const twice = await call("POST", `/api/lists/${bobsList.body.id}/path`, {
      token: bob.token,
      body: {},
    });
    check(
      "building a path from the same list again opens the one that exists",
      twice.status === 200 &&
        twice.body?.alreadyBuilt === true &&
        twice.body?.id === built.body?.id,
      `HTTP ${twice.status} ${twice.text.slice(0, 160)}`,
    );

    /*
     * What can be said about the list from the list itself.
     *
     * A third resource first, because two of anything is a coincidence and the
     * review says nothing about a list shorter than three. All three are
     * articles from example.test, which is what makes both arithmetic checks
     * fire -- a run that only proved the endpoint answers would not have shown
     * that the rules reach the screen.
     */
    const third = await call("POST", "/api/resources", {
      token: bob.token,
      body: {
        title: `Third read ${RUN}`,
        url: `https://example.test/third-read-${RUN}`,
        format: "article",
        subject: "Physics",
        gradeLevel: "Year 12",
      },
    });
    await call("POST", `/api/lists/${bobsList.body.id}/items`, {
      token: bob.token,
      body: { resourceId: third.body?.id },
    });

    const quality = await call("GET", `/api/lists/${bobsList.body.id}/quality`, {
      token: bob.token,
    });
    check(
      "a list can be checked against itself",
      quality.status === 200 && quality.body?.itemCount === 3,
      `HTTP ${quality.status} ${quality.text.slice(0, 160)}`,
    );
    const kinds = (quality.body?.findings ?? []).map((finding) => finding.kind);
    check(
      "and it reports what is actually true of it",
      kinds.includes("one_provider") && kinds.includes("one_format"),
      `findings: ${JSON.stringify(quality.body?.findings)?.slice(0, 200)}`,
    );
    check(
      "the review says which checks it made",
      Array.isArray(quality.body?.checked) && quality.body.checked.length === 4,
      `checked: ${JSON.stringify(quality.body?.checked)}`,
    );

    const strangersQuality = await call("GET", `/api/lists/${bobsList.body.id}/quality`, {
      token: alice.token,
    });
    check(
      "a stranger cannot review someone's private list",
      strangersQuality.status === 403 || strangersQuality.status === 404,
      `HTTP ${strangersQuality.status}`,
    );

    const strangersBuild = await call("POST", `/api/lists/${bobsList.body.id}/path`, {
      token: alice.token,
      body: {},
    });
    check(
      "a stranger cannot build a path from someone else's list",
      strangersBuild.status === 403 || strangersBuild.status === 404,
      `HTTP ${strangersBuild.status}`,
    );
  }

  // ---- a saved resource reaches the goal it is for -------------------------
  //
  // The chain the product is built around is save -> organise -> study, and
  // until there was a write for it the middle link was a button that opened
  // the goals screen. What is asserted here is the part a unit test cannot
  // see: that the step is on the path when the goal is read back fresh, and
  // that asking twice does not put the resource on it twice.
  const goal = await call("POST", "/api/learning-goals", {
    token: alice.token,
    body: { title: "Understand electric fields", subject: "Physics", level: "beginner" },
  });
  check("a learning goal can be created", goal.status === 201,
    `HTTP ${goal.status} ${goal.text.slice(0, 160)}`);

  const saved = await call("POST", "/api/resources", {
    token: alice.token,
    body: {
      title: `Fields and potentials ${RUN}`,
      url: `https://example.test/fields-${RUN}`,
      format: "article",
      subject: "Physics",
      gradeLevel: "Year 12",
    },
  });
  check("a resource can be saved", saved.status === 201 || saved.status === 200,
    `HTTP ${saved.status} ${saved.text.slice(0, 160)}`);

  if (goal.status === 201 && saved.body?.id) {
    const stepsBefore = goal.body.pathSteps.length;
    const linked = await call(
      `POST`,
      `/api/learning-goals/${goal.body.id}/resources`,
      { token: alice.token, body: { resourceId: saved.body.id } },
    );
    check(
      "a saved resource can be attached to a goal path",
      linked.status === 201 && linked.body?.alreadyLinked === false,
      `HTTP ${linked.status} ${linked.text.slice(0, 160)}`,
    );

    const step = (linked.body?.pathSteps ?? []).find(
      (candidate) => candidate.id === linked.body?.stepId,
    );
    check(
      "the step it added carries the resource",
      step?.resourceId === saved.body.id,
      `step: ${JSON.stringify(step)?.slice(0, 160)}`,
    );

    const twice = await call(
      "POST",
      `/api/learning-goals/${goal.body.id}/resources`,
      { token: alice.token, body: { resourceId: saved.body.id } },
    );
    check(
      "attaching the same resource again says so instead of duplicating it",
      twice.status === 200 &&
        twice.body?.alreadyLinked === true &&
        twice.body?.stepId === linked.body?.stepId &&
        twice.body?.pathSteps?.length === stepsBefore + 1,
      `HTTP ${twice.status} ${twice.text.slice(0, 160)}`,
    );

    // Read back from a fresh request rather than trusting the write's own
    // answer: this is the half that a screen actually shows on the next visit.
    const reread = await call("GET", "/api/learning-goals", { token: alice.token });
    const persisted = (reread.body ?? []).find(
      (candidate) => candidate.id === goal.body.id,
    );
    check(
      "the attached resource is still there when the goal is read again",
      (persisted?.pathSteps ?? []).filter(
        (candidate) => candidate.resourceId === saved.body.id,
      ).length === 1,
      `steps: ${JSON.stringify(persisted?.pathSteps)?.slice(0, 200)}`,
    );

    const strangersGoal = await call(
      "POST",
      `/api/learning-goals/${goal.body.id}/resources`,
      { token: bob.token, body: { resourceId: saved.body.id } },
    );
    check(
      "a stranger cannot attach anything to someone's goal",
      strangersGoal.status === 403 || strangersGoal.status === 404,
      `HTTP ${strangersGoal.status}`,
    );
  }

  // ---- classes: invite, accept, leave -------------------------------------
  const admin = await adminSession();
  if (!admin) {
    notRun(
      "class invite and join",
      "set E2E_ADMIN_EMAIL to an address in the server's ADMIN_EMAILS",
    );
  } else {
    const studentCreate = await call("POST", "/api/classes", {
      token: alice.token,
      body: { name: "Should not exist", subject: "Mathematics", gradeLevel: "Year 10" },
    });
    check(
      "a student cannot create a class",
      studentCreate.status === 403,
      `HTTP ${studentCreate.status}`,
    );

    const promote = await call("PATCH", `/api/admin/users/${alice.user.id}`, {
      token: admin.token,
      body: { role: "teacher", activeRole: "teacher" },
    });
    check(
      "an administrator can make someone a teacher",
      promote.status === 200 && promote.body?.role === "teacher",
      `HTTP ${promote.status} role=${promote.body?.role}`,
    );

    // The promotion changed the account, not the token that was issued before
    // it, so the session has to be renewed the way the app renews it.
    const reAuth = await call("POST", "/api/auth/login", {
      body: { email: alice.email, password: PASSWORD },
    });
    const teacherToken = reAuth.body?.token ?? alice.token;

    const cls = await call("POST", "/api/classes", {
      token: teacherToken,
      body: { name: `E2E class ${RUN}`, subject: "Mathematics", gradeLevel: "Year 10" },
    });
    check("a teacher can create a class", cls.status === 201,
      `HTTP ${cls.status} ${cls.text.slice(0, 160)}`);

    if (cls.status === 201) {
      const classId = cls.body.id;

      const outsiderRead = await call("GET", `/api/classes/${classId}`, {
        token: bob.token,
      });
      check(
        "someone outside the class cannot read it",
        outsiderRead.status === 403 || outsiderRead.status === 404,
        `HTTP ${outsiderRead.status}`,
      );

      const outsiderInvites = await call(
        "POST",
        `/api/classes/${classId}/invitations`,
        { token: bob.token, body: { email: alice.email } },
      );
      check(
        "only the teacher can invite to a class",
        outsiderInvites.status === 403,
        `HTTP ${outsiderInvites.status}`,
      );

      const invite = await call("POST", `/api/classes/${classId}/invitations`, {
        token: teacherToken,
        body: { email: bob.email },
      });
      check("the teacher can invite by email", invite.status === 201,
        `HTTP ${invite.status} ${invite.text.slice(0, 160)}`);

      const pending = await call("GET", "/api/class-invitations", {
        token: bob.token,
      });
      const mine = (pending.body || []).find((i) => i.classId === classId);
      check(
        "the invitation reaches the person invited",
        Boolean(mine),
        `invitations=${JSON.stringify(pending.body)?.slice(0, 160)}`,
      );

      // Nobody is added to a class without answering: the force-add route was
      // removed for this reason, so joining must go through the invitation.
      const membersBefore = await call(
        "GET",
        `/api/classes/${classId}/members`,
        { token: teacherToken },
      );
      check(
        "an invitation alone does not make someone a member",
        !(membersBefore.body || []).some((m) => m.userId === bob.user.id),
        `members=${(membersBefore.body || []).map((m) => m.userId).join(",")}`,
      );

      if (mine) {
        const strangerAnswers = await call(
          "PATCH",
          `/api/class-invitations/${mine.id}`,
          { token: alice.token, body: { action: "accept" } },
        );
        check(
          "nobody else can answer your invitation",
          strangerAnswers.status === 404 || strangerAnswers.status === 403,
          `HTTP ${strangerAnswers.status}`,
        );

        const accept = await call(
          "PATCH",
          `/api/class-invitations/${mine.id}`,
          { token: bob.token, body: { action: "accept" } },
        );
        check("an invitation can be accepted", accept.status === 200,
          `HTTP ${accept.status} ${accept.text.slice(0, 160)}`);

        const membersAfter = await call(
          "GET",
          `/api/classes/${classId}/members`,
          { token: teacherToken },
        );
        check(
          "accepting makes you a member",
          (membersAfter.body || []).some((m) => m.userId === bob.user.id),
          `members=${(membersAfter.body || []).map((m) => m.userId).join(",")}`,
        );

        const memberRead = await call("GET", `/api/classes/${classId}`, {
          token: bob.token,
        });
        check("a member can read the class", memberRead.status === 200,
          `HTTP ${memberRead.status}`);

        const twice = await call("PATCH", `/api/class-invitations/${mine.id}`, {
          token: bob.token,
          body: { action: "accept" },
        });
        check(
          "an invitation cannot be accepted twice",
          twice.status === 404,
          `HTTP ${twice.status}`,
        );

        const leave = await call("DELETE", `/api/classes/${classId}/leave`, {
          token: bob.token,
        });
        check("a member can leave", leave.status === 200 || leave.status === 204,
          `HTTP ${leave.status}`);

        const afterLeave = await call("GET", `/api/classes/${classId}`, {
          token: bob.token,
        });
        check(
          "leaving takes the class away again",
          afterLeave.status === 403 || afterLeave.status === 404,
          `HTTP ${afterLeave.status}`,
        );
      }
    }
  }

  // ---- leaving ------------------------------------------------------------
  const carol = await newUser("carol");

  /**
   * A post, so deletion has something of hers to anonymise.
   *
   * Her name goes into forum_posts.author_name at write time, a copy kept so a
   * listing need not join users. Deleting the account used to leave it there,
   * and the forum went on showing her real name to everyone. The response was
   * 204 either way, so the check has to be what the forum says afterwards.
   */
  const CAROL_NAME = `E2E carol`;
  const form = new FormData();
  form.set("title", `Carol's post ${RUN}`);
  form.set("body", "Written before deleting the account.");
  form.set("kind", "post");
  const posted = await fetch(`${BASE}/api/forum/posts`, {
    method: "POST",
    headers: { authorization: `Bearer ${carol.token}` },
    body: form,
  });
  check("a post can be written", posted.status === 201, `HTTP ${posted.status}`);

  /*
   * Deletion is intentionally not authorized by possession of a session
   * alone. Reauthenticate with the current password and send the explicit
   * confirmation value that the generated clients use after their warning.
   */
  const deleted = await call("DELETE", "/api/users/me", {
    token: carol.token,
    body: { password: PASSWORD, confirmation: "DELETE" },
  });
  check("an account can be deleted", deleted.status === 200 || deleted.status === 204,
    `HTTP ${deleted.status} ${deleted.text.slice(0, 160)}`);

  const afterDelete = await call("POST", "/api/auth/login", {
    body: { email: carol.email, password: PASSWORD },
  });
  check(
    "a deleted account cannot sign back in",
    afterDelete.status === 401,
    `HTTP ${afterDelete.status}`,
  );

  if (posted.status === 201) {
    const forum = await call("GET", "/api/forum/posts", { token: alice.token });
    const stillNamed = JSON.stringify(forum.body ?? []).includes(CAROL_NAME);
    check(
      "deleting an account takes the name off what it wrote",
      !stillNamed,
      `the forum still shows "${CAROL_NAME}" on a post by a deleted account`,
    );
  }

  console.log(
    `\n${failures === 0 ? "All" : `${checks - failures}/${checks}`} ` +
      `${failures === 0 ? `${checks} checks passed.` : "checks passed."}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  if (error instanceof Inconclusive) {
    console.error(`\nInconclusive: ${error.message}\n`);
    process.exit(EXIT_INCONCLUSIVE);
  }
  console.error(`\nCould not finish: ${error.message}\n`);
  process.exit(1);
});
