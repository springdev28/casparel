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
    // MILLISECONDS, matching what the server issues: lib/auth.ts signs
    // `exp: Date.now() + TOKEN_TTL_MS`. This is not a standard JWT `exp`, and
    // the seconds value used here previously read as long expired to
    // readSessionClaims(), which compares against Date.now().
    exp: Date.now() + 86_400_000,
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

/**
 * Signed-in pages do not follow prefers-color-scheme: the app paints them from
 * the account's saved interface colours. So that, not the OS setting, is the
 * axis the audit has to vary, and it is why a dark-mode contrast bug on
 * /resources could reach production while the audit stayed green.
 */
export const PALETTES = {
  light: {
    background: "#f4f6fb",
    surface: "#ffffff",
    primary: "#163a8a",
    accent: "#dbeafe",
  },
  dark: {
    background: "#0f1117",
    surface: "#1a1e2a",
    primary: "#1e3a8a",
    accent: "#1e293b",
  },
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

/** The admin user table returns more columns than the public User schema. */
const ADMIN_USER_ROW = {
  ...USER,
  teacherVerified: true,
  bannedAt: null,
  bannedReason: null,
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
  "/api/lists/shared": [],
  "/api/schedule": [],
  "/api/study-sessions": [],
  "/api/forum/access": { canPost: true, canModerate: true },
  "/api/forum/materials": [],
  "/api/forum/posts": [],
  "/api/admin/users": [ADMIN_USER_ROW],
  "/api/admin/resources/review-queue": [
    {
      ...RESOURCE,
      id: 202,
      title: "Community submission awaiting review",
      verificationStatus: "unverified",
      verificationNote: null,
      submittedById: 1,
    },
  ],
  // Shape mirrors the AdminOverview schema exactly; the numbers are made up but
  // non-zero so the counters and tables actually render something to check.
  "/api/admin/overview": {
    users: 128,
    students: 96,
    teachers: 30,
    admins: 2,
    goals: 41,
    resources: 512,
    cachedResearchReports: 64,
    plan: {
      name: "Administrator",
      status: "active",
      aiSearchLimit: null,
      deepResearchDailyLimit: null,
    },
    usage: {
      aiSearchesToday: 12,
      deepResearchToday: 4,
      totalAiRequests: 830,
      estimatedCostUsd: 4.21,
      byFeature: {
        search: { total: 500, month: 120, estimatedCostUsd: 1.2 },
        "quick-review": { total: 200, month: 60, estimatedCostUsd: 0.9 },
        "deep-research": { total: 90, month: 20, estimatedCostUsd: 1.8 },
        metadata: { total: 40, month: 10, estimatedCostUsd: 0.31 },
      },
      byUser: [],
    },
    workflow: {
      funnel: {
        viewed: 400,
        reviewed: 210,
        saved: 150,
        activityCreated: 80,
        classShared: 40,
        assignmentCreated: 25,
        completedJourneys: 18,
        viewToReviewRate: 0.53,
        reviewToSaveRate: 0.71,
        saveToActivityRate: 0.53,
        activityToClassRate: 0.5,
        classToAssignmentRate: 0.63,
      },
      engagement: {
        activeUsers7d: 34,
        activeUsers30d: 88,
        weeklyActiveClasses: 6,
        avgMinutesToFirstActivity: 12.5,
        inviteAcceptanceRate: 0.68,
        assignmentCompletionRate: 0.74,
        remixRate: 0.21,
        teacherApprovalRate: 0.92,
        reportsPerThousand: 1.4,
        estimatedStoredMb: 240,
      },
    },
  },
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
  const colors = PALETTES[options.palette ?? "light"] ?? PALETTES.light;

  await context.addInitScript(
    ({ token, colors: seededColors }) => {
      localStorage.setItem("schoolar_token", token);
      // The app reads this before /users/me lands, to avoid a flash of the
      // default palette. Seeding it is what makes the palette take effect.
      localStorage.setItem(
        "schoolar_interface_colors:last",
        JSON.stringify(seededColors),
      );
    },
    { token: sessionToken(options), colors },
  );

  await context.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const body =
      pathname === "/api/users/me/preferences"
        ? { ...PREFERENCES, interfaceColors: colors }
        : FIXTURES[pathname];

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
