#!/usr/bin/env node
/**
 * @fileOverview Repository tooling role: implements E2e Class Access for workspace development, build, validation, or documentation.
 * System connection: invoked by package scripts or maintainers; it is not part of the end-user runtime bundle.
 */
/**
 * What sharing with a class gives away, and for how long.
 *
 * The other authorization check asks whether a stranger can reach private
 * work. This asks the harder question: when work is deliberately shared with a
 * class, does access follow membership -- and, in particular, does it stop.
 *
 * Access that never ends is the ordinary way this is got wrong. A handler that
 * checks "is this shared with a class?" and forgets "are you still in it?"
 * behaves perfectly for as long as everyone stays put. It only misbehaves for
 * someone who has left or been removed, which is exactly the person whose
 * access you meant to end, and is the case nobody clicks through by hand.
 *
 * So each shared thing is checked four times, against four people: the member
 * (must see it), the outsider (must not), the person who left, and the person
 * the teacher removed (must not, any more).
 *
 *   E2E_ADMIN_EMAIL=... node scripts/e2e-class-access.mjs [baseUrl]
 *
 * Needs an administrator, because registration only creates students and a
 * class needs a teacher. Exit 0 correct, 1 something leaks, 75 could not run.
 */
const BASE = (process.argv[2] || "http://localhost:4319").replace(/\/$/, "");
const EXIT_INCONCLUSIVE = 75;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "class-Passw0rd!checks";

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

class Inconclusive extends Error {}

/**
 * One check, and the two different things there are to say about it.
 *
 * `detail` is a fact -- an HTTP code, an id -- and is true whichever way the
 * check went, so it prints either way. `whenFailed` is an explanation of the
 * failure and is only true when there is one.
 *
 * They were one parameter, and five call sites had written the explanation
 * into it. A passing run therefore printed `ok   leaving the class takes the
 * shared canvas away  someone who left the class can still open the canvas
 * shared with it (HTTP 403)` -- a line that says the opposite of what
 * happened, under a tick. A reader either believes it or learns to skip the
 * text after "ok", and the second is worse.
 */
function check(label, condition, detail = "", whenFailed = "") {
  checks += 1;
  if (condition) {
    console.log(`ok   ${label}${detail ? `  ${detail}` : ""}`);
  } else {
    failures += 1;
    const said = [whenFailed, detail].filter(Boolean).join(" — ");
    console.log(`FAIL ${label}\n     ${said || "expected true"}`);
  }
}

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

async function call(method, path, options = {}) {
  const first = await once(method, path, options);
  if (first.status !== 429) return first;
  const header = Number(first.headers.get("retry-after"));
  const wait = Math.min((Number.isFinite(header) && header > 0 ? header : 60) * 1000, 70_000);
  console.log(`     (rate limited on ${method} ${path}; waiting ${Math.ceil(wait / 1000)}s)`);
  await new Promise((resolve) => setTimeout(resolve, wait + 1000));
  const second = await once(method, path, options);
  if (second.status === 429) throw new Inconclusive(`still rate limited on ${method} ${path}`);
  return second;
}

async function newUser(tag) {
  const email = `class-${tag}-${RUN}@example.test`;
  const res = await call("POST", "/api/auth/register", {
    body: { email, password: PASSWORD, name: `Class ${tag}` },
  });
  if (res.status !== 201 || !res.body?.token) {
    throw new Error(`could not register ${email}: HTTP ${res.status} ${res.text.slice(0, 160)}`);
  }
  return { email, token: res.body.token, user: res.body.user };
}

async function signIn(email) {
  const res = await call("POST", "/api/auth/login", { body: { email, password: PASSWORD } });
  if (res.status !== 200) throw new Error(`could not sign in ${email}: HTTP ${res.status}`);
  return res.body.token;
}

/** Invite someone and have them accept, returning once they are a member. */
async function joinClass(teacherToken, classId, person) {
  const invite = await call("POST", `/api/classes/${classId}/invitations`, {
    token: teacherToken,
    body: { email: person.email },
  });
  if (invite.status !== 201) {
    throw new Error(`could not invite ${person.email}: HTTP ${invite.status} ${invite.text.slice(0, 140)}`);
  }
  const pending = await call("GET", "/api/class-invitations", { token: person.token });
  const mine = (pending.body || []).find((i) => i.classId === classId);
  if (!mine) throw new Error(`no invitation reached ${person.email}`);
  const accept = await call("PATCH", `/api/class-invitations/${mine.id}`, {
    token: person.token,
    body: { action: "accept" },
  });
  if (accept.status !== 200) {
    throw new Error(`could not accept for ${person.email}: HTTP ${accept.status}`);
  }
}

async function main() {
  console.log(`\nWhat a class shares, and when it stops sharing it. ${BASE}\n`);

  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  if (!adminEmail) {
    throw new Inconclusive(
      "set E2E_ADMIN_EMAIL to an address in the server's ADMIN_EMAILS: a class " +
        "needs a teacher, and registration only ever creates students.",
    );
  }
  await call("POST", "/api/auth/register", {
    body: { email: adminEmail, password: ADMIN_PASSWORD, name: "Class Admin" },
  });
  const adminSignIn = await call("POST", "/api/auth/login", {
    body: { email: adminEmail, password: ADMIN_PASSWORD },
  });
  if (adminSignIn.status !== 200) {
    throw new Error(`E2E_ADMIN_EMAIL=${adminEmail} could not sign in: HTTP ${adminSignIn.status}`);
  }
  const adminToken = adminSignIn.body.token;

  const teacher = await newUser("teacher");
  const member = await newUser("member");
  const leaver = await newUser("leaver");
  const removed = await newUser("removed");
  const outsider = await newUser("outsider");

  const promote = await call("PATCH", `/api/admin/users/${teacher.user.id}`, {
    token: adminToken,
    body: { role: "teacher", activeRole: "teacher" },
  });
  if (promote.status !== 200) {
    throw new Error(`could not make a teacher: HTTP ${promote.status} ${promote.text.slice(0, 160)}`);
  }
  const teacherToken = await signIn(teacher.email);

  const cls = await call("POST", "/api/classes", {
    token: teacherToken,
    body: { name: `Class ${RUN}`, subject: "Mathematics", gradeLevel: "Year 10" },
  });
  if (cls.status !== 201) {
    throw new Error(`could not create a class: HTTP ${cls.status} ${cls.text.slice(0, 160)}`);
  }
  const classId = cls.body.id;

  for (const person of [member, leaver, removed]) {
    await joinClass(teacherToken, classId, person);
  }
  console.log(`Class ${classId}: teacher, a member, someone who will leave, someone who will be removed, and an outsider.\n`);

  // The thing being shared. Visibility "class" is the deliberate act of
  // sharing; without it a class canvas stays the teacher's own.
  const canvas = await call("POST", "/api/canvases", {
    token: teacherToken,
    body: {
      title: `Shared canvas ${RUN}`,
      content: { shapes: [] },
      classId,
      visibility: "class",
    },
  });
  check("a teacher can share a canvas with the class", canvas.status === 201,
    `HTTP ${canvas.status} ${canvas.text.slice(0, 160)}`);
  if (canvas.status !== 201) {
    console.log("\nNothing shared, so nothing to check.\n");
    process.exit(1);
  }
  const canvasId = canvas.body.id;

  const seeCanvas = async (token) =>
    (await call("GET", `/api/canvases/${canvasId}`, { token })).status;

  check("a class member can open it", (await seeCanvas(member.token)) === 200,
    `member got ${await seeCanvas(member.token)}`);
  check("someone outside the class cannot",
    [403, 404].includes(await seeCanvas(outsider.token)),
    `outsider got ${await seeCanvas(outsider.token)}`);

  // The part that only breaks for the person you meant it to break for.
  const leave = await call("DELETE", `/api/classes/${classId}/leave`, { token: leaver.token });
  check("someone can leave the class", [200, 204].includes(leave.status), `HTTP ${leave.status}`);
  const afterLeaving = await seeCanvas(leaver.token);
  check(
    "leaving the class takes the shared canvas away",
    [403, 404].includes(afterLeaving),
    `HTTP ${afterLeaving}`,
    "someone who left the class can still open the canvas shared with it",
  );

  const remove = await call(
    "DELETE",
    `/api/classes/${classId}/members/${removed.user.id}`,
    { token: teacherToken },
  );
  check("a teacher can remove a member", [200, 204].includes(remove.status), `HTTP ${remove.status}`);
  const afterRemoval = await seeCanvas(removed.token);
  check(
    "being removed takes the shared canvas away",
    [403, 404].includes(afterRemoval),
    `HTTP ${afterRemoval}`,
    "a removed member can still open the canvas shared with the class",
  );

  check("the remaining member still has it", (await seeCanvas(member.token)) === 200,
    "",
    "removing one person must not cut off everybody else");

  // The class roster itself is worth the same question.
  const rosterAfterLeaving = await call(`GET`, `/api/classes/${classId}/members`, {
    token: leaver.token,
  });
  check(
    "someone who left cannot read the roster",
    [403, 404].includes(rosterAfterLeaving.status),
    `HTTP ${rosterAfterLeaving.status}`,
  );

  /**
   * The same question of the other two things a class shares.
   *
   * Canvases, activities and lists reach their answer through three separate
   * pieces of code -- accessForCanvas, the classId branch of the activity
   * listing, and canReadList -- so agreeing on canvases says nothing about the
   * others. Three implementations of one rule is three chances to write it
   * differently, and the one that gets it wrong is the one nobody checked.
   */
  const classActivity = await call("POST", "/api/study-activities", {
    token: teacherToken,
    body: {
      title: `Class set ${RUN}`,
      subject: "Mathematics",
      mode: "flashcards",
      classId,
      cards: [
        { id: "a", term: "1", answer: "2" },
        { id: "b", term: "3", answer: "4" },
      ],
    },
  });
  check("a teacher can share an activity with the class", classActivity.status === 201,
    `HTTP ${classActivity.status} ${classActivity.text.slice(0, 140)}`);

  if (classActivity.status === 201) {
    const listFor = async (token) =>
      call("GET", `/api/study-activities?classId=${classId}`, { token });

    const asMember = await listFor(member.token);
    check(
      "a class member sees the shared activity",
      asMember.status === 200 &&
        (asMember.body || []).some((a) => a.id === classActivity.body.id),
      `HTTP ${asMember.status}, ids ${(asMember.body || []).map((a) => a.id).join(",")}`,
    );

    for (const [who, person] of [
      ["someone who left", leaver],
      ["a removed member", removed],
      ["an outsider", outsider],
    ]) {
      const res = await listFor(person.token);
      const leaked =
        res.status === 200 &&
        (res.body || []).some((a) => a.id === classActivity.body.id);
      check(
        `${who} cannot see the class's activities`,
        !leaked,
        `HTTP ${res.status}`,
      "it still lists the activity shared with a class they are not in",
      );
    }
  }

  // The list every class gets on creation, rather than one made here: POST
  // /lists takes no classId, so this is the only class-scoped list there is.
  const classLists = await call("GET", `/api/classes/${classId}/shared-lists`, {
    token: teacherToken,
  });
  const sharedList = (classLists.body || [])[0];
  if (!sharedList?.id) {
    console.log(`--   the class's shared list\n     not run: none found (HTTP ${classLists.status})`);
  } else {
    const readAs = async (token) =>
      (await call("GET", `/api/lists/${sharedList.id}`, { token })).status;

    check("a class member can open the class list", (await readAs(member.token)) === 200,
      `member got ${await readAs(member.token)}`);

    for (const [who, person] of [
      ["someone who left", leaver],
      ["a removed member", removed],
      ["an outsider", outsider],
    ]) {
      const status = await readAs(person.token);
      check(
        `${who} cannot open the class list`,
        [403, 404].includes(status),
        `HTTP ${status}`,
      );
    }
  }

  /**
   * Deleting a class must not delete other people's work.
   *
   * study_activities.class_id and canvases.class_id are ON DELETE CASCADE, so
   * removing the class took everything shared with it -- including what a
   * student made and shared. A pupil who built a revision set for their class
   * lost it when the teacher tidied up at the end of term: their work, deleted
   * by somebody else's action, silently.
   *
   * Sharing is not surrendering. The check is that the pupil still has it.
   */
  const pupilSet = await call("POST", "/api/study-activities", {
    token: member.token,
    body: {
      title: `A pupil's own set ${RUN}`,
      subject: "Mathematics",
      mode: "flashcards",
      classId,
      cards: [
        { id: "a", term: "1", answer: "2" },
        { id: "b", term: "3", answer: "4" },
      ],
    },
  });
  check("a pupil can share their own work with the class", pupilSet.status === 201,
    `HTTP ${pupilSet.status} ${pupilSet.text.slice(0, 140)}`);

  if (pupilSet.status === 201) {
    const closed = await call("DELETE", `/api/classes/${classId}`, { token: teacherToken });
    check("the teacher can delete the class", [200, 204].includes(closed.status),
      `HTTP ${closed.status}`);

    // Back in their own library, where it started: no classId, so it shows in
    // the default listing rather than under a class that no longer exists.
    const mine = await call("GET", "/api/study-activities", { token: member.token });
    check(
      "deleting the class leaves the pupil their own work",
      mine.status === 200 && (mine.body || []).some((a) => a.id === pupilSet.body.id),
      `HTTP ${mine.status}, ids ${(mine.body || []).map((a) => a.id).join(",") || "none"}`,
      "the pupil's set was destroyed when someone else deleted the class",
    );
  }

  console.log(
    failures === 0
      ? `\nAll ${checks} class-access checks passed.\n`
      : `\n${checks - failures}/${checks} class-access checks passed.\n`,
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
