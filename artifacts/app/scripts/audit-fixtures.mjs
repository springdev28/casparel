/**
 * A signed-in session for the page audit, without a server.
 *
 * The audit serves a static build, so authenticated pages had no way to render
 * and the checks only ever covered the three public pages. Every regression
 * that actually reached casparel.com was on a signed-in page: the sidebar going
 * blank, the plan badge reading Free for an admin, "More filters" invisible in
 * dark mode. Those are exactly the renders worth checking.
 *
 * So: seed the token the app reads, and answer the handful of endpoints the
 * authenticated shell calls with fixtures that match the OpenAPI schemas. This
 * is a rendering harness, not an API mock. It is deliberately literal, and an
 * endpoint that appears without a fixture is reported rather than quietly
 * defaulted, so this list stays honest as the app grows.
 */

const base64url = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

/**
 * The token the client stores. Never verified here: the app only decodes it for
 * a display fallback, and every request it would authenticate is fulfilled from
 * the fixtures below.
 */
export function sessionToken({ role = "teacher", accountRole = "admin" } = {}) {
  const header = base64url({ alg: "HS256", typ: "JWT" });
  const payload = base64url({
    userId: 1,
    role,
    accountRole,
    exp: Math.floor(Date.now() / 1000) + 86_400,
  });
  return `${header}.${payload}.audit`;
}

const USER = {
  id: 1,
  email: "audit@casparel.com",
  name: "Audit Account",
  role: "admin",
  activeRole: "teacher",
  avatarUrl: null,
  bio: "Checking that every surface renders.",
  subjects: ["Mathematics", "Physics"],
  gradeOrDept: "Year 12",
  timezone: "Europe/Istanbul",
  websiteUrl: null,
  profileVisibility: "classmates",
  libraryVisibility: "classmates",
  showBio: true,
  showSubjects: true,
  showGradeOrDept: true,
  showWebsite: false,
  createdAt: "2026-01-05T09:00:00.000Z",
};

// Free rather than unlimited on purpose: it renders the usage meters and the
// upgrade CTA, which is strictly more surface to check than the one-line
// "unlimited" state.
const USAGE = {
  plan: "Free",
  unlimited: false,
  aiSearch: { used: 1, limit: 3, window: "day" },
  deepResearch: { used: 2, limit: 2, window: "day" },
};

const PREFERENCES = {
  userId: 1,
  language: "en",
  interfaceColors: null,
  ambientStyle: "off",
  ambientIntensity: 0.5,
  readNotificationIds: [],
  dashboardGoalIds: {},
  continueStudying: {},
  pendingCheckIns: {},
  searchHistory: [],
  resourceSearchState: null,
  allowMessageRequests: true,
  tutorialSeen: true,
  updatedAt: "2026-08-01T09:00:00.000Z",
};

const RESOURCE = {
  id: 101,
  title: "Linear Algebra Done Right",
  description:
    "A standard undergraduate text, openly licensed and maintained by its author.",
  url: "https://example.org/linear-algebra",
  type: "book",
  subject: "Mathematics",
  gradeLevel: "Undergraduate",
  language: "en",
  source: "Open Library",
  verificationStatus: "verified",
  verificationNote: null,
  submittedById: null,
  averageRating: 4.5,
  ratingCount: 12,
  createdAt: "2026-02-11T09:00:00.000Z",
};

const LEARNING_GOAL = {
  id: 7,
  userId: 1,
  title: "Master Full-Stack Development",
  description: "Work through the fundamentals, then build something real.",
  targetDate: "2026-12-01",
  status: "active",
  progress: 25,
  pathSteps: [
    { id: "s1", title: "HTML and CSS", done: true },
    { id: "s2", title: "TypeScript", done: false },
  ],
  createdAt: "2026-03-02T09:00:00.000Z",
};

/**
 * Exact-path fixtures. Keys are pathnames; values are the JSON body.
 * Ordered roughly as the app requests them.
 */
export const FIXTURES = {
  "/api/users/me": USER,
  "/api/users/me/usage": USAGE,
  "/api/users/me/preferences": PREFERENCES,
  "/api/users/me/access": {
    banned: false,
    bannedAt: null,
    bannedReason: null,
    adminContact: "support@casparel.com",
  },
  "/api/resources": [RESOURCE],
  "/api/learning-goals": [LEARNING_GOAL],
  "/api/learning-evidence": [],
  "/api/assignments/today": [],
  "/api/workflow/continue": [],
  "/api/calendar/status": {
    googleConnected: false,
    googleConfigured: false,
    icalSecret: "audit-ical-secret",
  },
  "/api/activity/recent": [],
  "/api/classes": [],
  "/api/lists": [],
  "/api/class-invitations": [],
  "/api/google-classroom/status": { connected: false, configured: false },
  "/api/learning-signals": {
    evidenceCount: 0,
    learnerCount: 0,
    averageUnderstanding: 0,
    signals: [],
  },
};

/**
 * Install the fixtures on a Playwright context.
 *
 * Returns the set of API paths that were requested without a fixture. Those are
 * answered with an empty body so the render can continue, and reported by the
 * caller: a silent default would let coverage rot without anyone noticing.
 */
export async function installSession(context, options = {}) {
  const unfixtured = new Set();

  await context.addInitScript((token) => {
    localStorage.setItem("schoolar_token", token);
  }, sessionToken(options));

  await context.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const body = FIXTURES[pathname];

    if (body === undefined) {
      unfixtured.add(pathname);
      // An array is the safer guess: most unmapped endpoints are collections,
      // and the components that read them tolerate an empty one.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  return unfixtured;
}
