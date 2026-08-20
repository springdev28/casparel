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

/*
 * Free rather than unlimited on purpose: it renders the usage meters and the
 * upgrade CTA, which is strictly more surface to check than the one-line
 * "unlimited" state.
 *
 * `tier` and `capacity` are required and were both missing, so every meter the
 * capacity block drives rendered from undefined -- on the settings page, the
 * plan card and the upgrade prompts.
 */
const USAGE = {
  plan: "Free",
  tier: "free",
  unlimited: false,
  aiSearch: { used: 1, limit: 3, window: "day" },
  deepResearch: { used: 2, limit: 2, window: "month" },
  capacity: {
    classesOwned: { used: 1, limit: 1 },
    classMembers: { used: 0, limit: 30 },
    studyActivities: { used: 6, limit: 25 },
    resourceLists: { used: 2, limit: 5 },
    learningGoals: { used: 3, limit: 10 },
    canvases: { used: 1, limit: 3 },
  },
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
  // Brand extremes. `primary` is the one colour a user picks that the
  // navigation cannot adapt to -- it keeps a fixed near-black surface -- so
  // these sweep the brand to each end of the lightness axis while holding the
  // canvas/surface polarity of the two palettes above. Both resolve
  // `--primary-foreground` to near-black, which is what put invisible text on
  // the sidebar; both also push `--primary-text` to the far end of its walk.
  brandLight: {
    background: "#f4f6fb",
    surface: "#ffffff",
    primary: "#ffe066",
    accent: "#fffbeb",
  },
  brandDark: {
    background: "#0f1117",
    surface: "#1a1e2a",
    primary: "#f9fafb",
    accent: "#e5e7eb",
  },
};

const PREFERENCES = {
  userId: 1,
  language: "en",
  interfaceColors: null,
  /**
   * Off, while a real new account gets "net".
   *
   * Deliberate, and worth knowing the cost of. The ambient effect is a WebGL
   * canvas gated on requestIdleCallback; running it across 59 renders would
   * make this audit slow and its screenshots depend on which frame of an
   * animation was caught. So these renders check layout, colour and copy on a
   * still page, which is what they are good at.
   *
   * The cost is that no render here has ever been of the page people are
   * actually served, and it hid a real defect: body copy over the effect
   * measured 3.47:1 against its backdrop, under the 4.5:1 WCAG AA asks for,
   * for as long as this fixture has existed. That belongs to audit-live-ui.mjs
   * now, which drives a real account against a real server with the real
   * default and measures the contrast from the painted pixels.
   *
   * If that ever stops being true, this line is the reason a whole class of
   * defect is invisible.
   */
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
  /*
   * `format`, from the enum, and not `type: "book"`. The API has no `type` and
   * no "book": the column is a not-null enum of article/video/pdf/podcast/
   * interactive/other. So every render of the library and the detail page was
   * of a resource with no format at all, which is the field the type icon, the
   * filter chip and the card label all read.
   *
   * `submittedById` was null and the column is not-null. `language` and
   * `source` were invented -- the server returns neither.
   */
  format: "pdf",
  subject: "Mathematics",
  gradeLevel: "Undergraduate",
  thumbnailUrl: null,
  verificationStatus: "verified",
  verificationNote: null,
  submittedById: 2,
  // The names the API actually returns. These read averageRating/ratingCount,
  // which nothing consumes, so every render had no rating at all and the
  // resource card printed "NaN% evidence score" -- reported by the translation
  // audit as an untranslated string, which is the only reason anyone saw it.
  avgRating: 4.5,
  reviewCount: 12,
  createdAt: "2026-02-11T09:00:00.000Z",
};

/** The admin user table returns more columns than the public User schema. */
const ADMIN_USER_ROW = {
  ...USER,
  teacherVerified: true,
  bannedAt: null,
  bannedReason: null,
};

/*
 * A goal with every field the contract marks required.
 *
 * `subject`, `level` and `updatedAt` were missing, and all three are required
 * in openapi.yaml. The goals page renders subject and level as badges, so
 * every audit read that card with two empty 22px pills on it and passed --
 * the page was never rendered as a reader would see it.
 */
const LEARNING_GOAL = {
  id: 7,
  userId: 1,
  title: "Master Full-Stack Development",
  subject: "Web development",
  level: "intermediate",
  description: "Work through the fundamentals, then build something real.",
  targetDate: "2026-12-01",
  status: "active",
  progress: 25,
  /*
   * `query` and `completed`, which is what the contract says a step is. These
   * read `done`, so the app -- which reads `completed` -- saw two unfinished
   * steps and printed "0 of 2" beside a step that was finished.
   */
  pathSteps: [
    { id: "s1", title: "HTML and CSS", query: "html css fundamentals", completed: true },
    { id: "s2", title: "TypeScript", query: "typescript for beginners", completed: false },
  ],
  createdAt: "2026-03-02T09:00:00.000Z",
  updatedAt: "2026-04-11T09:00:00.000Z",
};

/*
 * A class with a roster on it.
 *
 * `members` is required and was absent, so the class detail page was audited
 * with its member list, its roles and its seating all rendering from nothing,
 * beside a header claiming 24 members.
 */
const CLASS = {
  id: 31,
  name: "Physics A-level",
  subject: "Physics",
  gradeLevel: "Year 12",
  description: "Mechanics and waves, Tuesdays and Thursdays.",
  teacherId: 1,
  memberCount: 24,
  createdAt: "2026-01-14T09:00:00.000Z",
  members: [
    {
      userId: 1,
      classId: 31,
      role: "teacher",
      customRole: null,
      joinedAt: "2026-01-14T09:00:00.000Z",
      user: {
        id: 1,
        name: "Audit Account",
        role: "teacher",
        websiteUrl: null,
        avatarUrl: null,
        bio: "Checking that every surface renders.",
        subjects: ["Mathematics", "Physics"],
        gradeOrDept: "Year 12",
      },
    },
    {
      userId: 2,
      classId: 31,
      role: "student",
      customRole: null,
      joinedAt: "2026-01-20T09:00:00.000Z",
      user: {
        id: 2,
        name: "Ada Karahan",
        role: "student",
        websiteUrl: null,
        avatarUrl: null,
        bio: "Second year, mostly mechanics.",
        subjects: ["Physics"],
        gradeOrDept: "Year 12",
      },
    },
  ],
};

const RESOURCE_LIST = {
  id: 44,
  name: "Revision reading",
  description: "Everything worth a second pass before the mock.",
  ownerId: 1,
  classId: null,
  itemCount: 6,
  createdAt: "2026-04-02T09:00:00.000Z",
};

/**
 * The list detail page's own answer, which carries its items.
 *
 * /api/lists returns the card without them; the detail page asks for the list
 * by id and renders what is inside it. Both pages exist and only the card was
 * ever audited.
 */
const RESOURCE_LIST_DETAIL = {
  ...RESOURCE_LIST,
  items: [
    {
      id: 501,
      listId: 44,
      resourceId: 101,
      note: "Chapters 1 to 3 cover everything on the mock.",
      addedAt: "2026-04-03T09:00:00.000Z",
      position: 0,
      resource: RESOURCE,
    },
  ],
};

/**
 * Somebody else's public profile, and the library they chose to show.
 *
 * Not the audit account: the page renders differently for your own profile,
 * and the version worth checking is the one you see of a stranger -- block,
 * report, recommend, and a library filtered by their visibility settings.
 */
const OTHER_PROFILE = {
  id: 2,
  name: "Ada Karahan",
  role: "student",
  websiteUrl: null,
  avatarUrl: null,
  bio: "Second year, mostly mechanics.",
  subjects: ["Physics"],
  gradeOrDept: "Year 12",
};

const OTHER_LIBRARY = { resources: [RESOURCE], lists: [RESOURCE_LIST] };

/**
 * A canvas, so the canvases page is audited with a canvas on it.
 *
 * Without one the list rendered its empty state and every audit passed on a
 * page with a heading and a button -- no title, no owner, no relative date,
 * no share menu. The page had never been audited at all: all four lists named
 * `/canvas`, which is not a route, so the catch-all redirected them to
 * `/resources` and they read that page twice.
 */
const CANVAS = {
  id: 12,
  title: "Photosynthesis map",
  description: "Light reactions on the left, Calvin cycle on the right.",
  ownerId: 1,
  classId: null,
  visibility: "private",
  classAccess: "view",
  shareToken: null,
  document: { nodes: [], edges: [] },
  version: 3,
  createdAt: "2026-04-02T09:00:00.000Z",
  updatedAt: "2026-04-09T16:20:00.000Z",
  owner: { id: 1, name: "Audit Student" },
  class: null,
  collaboratorCount: 2,
  permissions: { canView: true, canEdit: true, canManage: true, role: "owner" },
};

/**
 * A block on a day the grid is actually showing.
 *
 * The schedule renders one week at a time, so a fixed date would fall outside
 * it on all but seven days a year and the audit would render the empty grid
 * almost always -- which is the state it was rendering before this existed.
 */
function todayInTheGrid() {
  const day = new Date();
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

const SCHEDULE_BLOCK = {
  id: 88,
  userId: 1,
  title: "Integration by parts",
  date: todayInTheGrid(),
  startTime: "09:00",
  endTime: "10:30",
  resourceId: null,
  listId: null,
  classId: null,
  notes: "Past paper Q4 to Q7",
  createdAt: "2026-08-01T09:00:00.000Z",
};

const STUDY_ACTIVITY = {
  id: 12,
  ownerId: 1,
  workspaceRole: "student",
  classId: null,
  title: "Photosynthesis vocabulary",
  subject: "Biology",
  mode: "flashcards",
  shareToken: null,
  cards: [
    { id: "c1", term: "Chlorophyll", answer: "The pigment that absorbs light energy." },
    { id: "c2", term: "Stomata", answer: "Pores that let gases in and out of a leaf." },
  ],
  createdAt: "2026-05-06T09:00:00.000Z",
  updatedAt: "2026-06-18T09:00:00.000Z",
};

const GOAL_TEMPLATE = {
  id: 5,
  creatorId: 9,
  creatorName: "Ada Karahan",
  sourceGoalId: 21,
  title: "First year of A-level physics",
  subject: "Physics",
  description: "The order I wish I had worked through it in.",
  level: "beginner",
  pathSteps: [
    { id: "t1", title: "Vectors and scalars", query: "vectors scalars", completed: false },
    { id: "t2", title: "Kinematics", query: "kinematics", completed: false },
  ],
  useCount: 34,
  createdAt: "2026-04-20T09:00:00.000Z",
};

/**
 * A conversation, as the route returns it: the row plus the other person,
 * the last message and an unread count, all assembled server-side.
 */
const CONVERSATION = {
  id: 3,
  firstUserId: 1,
  secondUserId: 9,
  requestedById: 9,
  status: "accepted",
  createdAt: "2026-07-02T09:00:00.000Z",
  updatedAt: "2026-08-11T09:00:00.000Z",
  other: { id: 9, name: "Ada Karahan", role: "student", avatarUrl: null },
  lastMessage: {
    id: 77,
    conversationId: 3,
    senderId: 9,
    body: "Sent you the past paper I mentioned.",
    readAt: null,
    createdAt: "2026-08-11T09:00:00.000Z",
  },
  unreadCount: 1,
  incomingRequest: false,
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
  // The detail page: its own strings are a large share of the product, and
  // without a fixture the audit renders an error page and reports nothing.
  "/api/resources/101": RESOURCE,
  "/api/resources/101/reviews": [],
  /*
   * The detail page's workflow strip. Without it the unfixtured default -- an
   * empty array -- reached `workflow?.steps[key]`, which is truthy with no
   * `steps` on it, and the page rendered its error boundary. That is why the
   * detail page had been left out of the translation audit, so its strings,
   * and the source-review panel that is this product's headline feature, were
   * never read in any language.
   */
  "/api/workflow/resources/101": {
    resourceId: 101,
    steps: {
      reviewed: true,
      saved: true,
      activityCreated: false,
      classShared: false,
      assignmentCreated: false,
    },
    assignmentRequired: false,
    nextAction: "create_activity",
    activity: null,
    classShare: null,
  },
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
  "/api/classes": [CLASS],
  "/api/classes/31": CLASS,
  /*
   * The class workspace's own tabs, now that each one has an address.
   *
   * Without these the assignments tab renders "nothing assigned" and the
   * classroom designer renders an empty room, which is a page rendering
   * correctly and telling nobody anything.
   */
  /*
   * A teacher's completion figures. Without these the assignments tab renders
   * for a teacher with no export button, no class summary and no per-row
   * percentage -- three surfaces that only a teacher ever sees, and the ones
   * the tab exists for.
   */
  "/api/classes/31/analytics": {
    studentCount: 24,
    assignments: [
      { id: 91, title: "Read chapter 4 before Thursday", completions: 9, completionRate: 38 },
    ],
  },
  "/api/classes/31/join-code": { joinCode: "PHY-4821" },
  "/api/classes/31/invitations": [],
  "/api/classes/31/resource-recommendations": [],
  "/api/classes/31/resources-list": { id: 77, name: "Physics A-level shared list", items: [] },
  "/api/classes/31/assignments": [
    {
      id: 91,
      classId: 31,
      title: "Read chapter 4 before Thursday",
      instructions: "Focus on the worked examples at the end.",
      resourceId: 101,
      activityId: null,
      dueAt: "2026-09-04T16:00:00.000Z",
      createdAt: "2026-08-28T09:00:00.000Z",
      resourceTitle: RESOURCE.title,
      resourceUrl: RESOURCE.url,
      activityTitle: null,
      completedAt: null,
      completed: false,
    },
  ],
  "/api/classes/31/seating-chart": {
    classId: 31,
    rows: 4,
    columns: 5,
    layoutMode: "grid",
    desks: [
      {
        id: "d1",
        kind: "desk",
        shape: "rectangle",
        // Percentages of the room, not pixels: x and y cap at 100 and a desk
        // at 60. Written in pixels first, and the contract said so.
        x: 20,
        y: 25,
        width: 22,
        height: 12,
        rotation: 0,
        capacity: 2,
        label: "Front left",
        text: null,
      },
    ],
    students: [
      {
        userId: 2,
        name: "Ada Karahan",
        avatarUrl: null,
        gradeOrDept: "Year 12",
        teacherNote: null,
        customRole: null,
        seatRow: 1,
        seatColumn: 1,
        seatDeskId: "d1",
        seatPosition: 0,
      },
    ],
  },
  "/api/lists": [RESOURCE_LIST],
  "/api/lists/44": RESOURCE_LIST_DETAIL,
  // The generated client builds these as /api/users/{id}, .../library and
  // .../safety; the page opens all three at once.
  "/api/users/2": OTHER_PROFILE,
  "/api/users/2/library": OTHER_LIBRARY,
  "/api/users/2/safety": { blocked: false },
  "/api/canvases": [CANVAS],
  "/api/canvases/12": CANVAS,
  "/api/class-invitations": [],
  "/api/google-classroom/status": { connected: false, configured: false },
  "/api/lists/shared": [],
  "/api/schedule": [SCHEDULE_BLOCK],
  "/api/study-sessions": [],
  "/api/forum/access": { canPost: true, canModerate: true },
  // Both on, so the AI search controls render and get audited. They are off by
  // default on a server with no keys, which is the state that was rendering.
  "/api/discover/capabilities": { publicProfileSearch: true, resourceSearch: true },
  "/api/forum/materials": [],
  "/api/forum/posts": [],
  "/api/study-activities": [STUDY_ACTIVITY],
  "/api/learning-goal-templates": [GOAL_TEMPLATE],
  "/api/direct-messages/conversations": [CONVERSATION],
  // Opening the list selects the first thread, so the thread itself needs a
  // fixture too or the reading pane renders nothing.
  "/api/direct-messages/conversations/3": {
    ...CONVERSATION,
    messages: [
      {
        id: 76,
        conversationId: 3,
        senderId: 1,
        body: "Did you get anywhere with question 7?",
        readAt: "2026-08-11T08:50:00.000Z",
        createdAt: "2026-08-10T18:20:00.000Z",
      },
      CONVERSATION.lastMessage,
    ],
  },
  "/api/classes/31/student-goals": [],
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
  /**
   * The account's language, which the shell applies over whatever the device
   * chose -- so a render that wants a language has to say so here.
   *
   * This fixture answered "en" unconditionally. The translation audit sets the
   * language in localStorage and then signs in, and AppShell, reading this,
   * put every signed-in render straight back into English. So the audit
   * reported the whole signed-in product as untranslated in all five
   * languages, hundreds of phantom gaps at once, and could not have seen a
   * real one.
   */
  const language = options.language ?? PREFERENCES.language;
  /**
   * The account's role, which decides which half of the product renders.
   *
   * This fixture is an admin, and admins are shown different panels: the plans
   * page swaps the "your current plan" line for a note that administrators are
   * uncapped, and settings swaps the whole allowance panel. So every audit
   * render was of the surface almost nobody sees, and the panels every student
   * and teacher opens were never rendered by anything -- which is how a
   * settings screen full of untranslated English survived a translation audit
   * reporting zero gaps.
   */
  const role = options.role ?? USER.role;
  const user = { ...USER, role, activeRole: options.activeRole ?? (role === "admin" ? USER.activeRole : role) };

  // A signed-out render still needs the API answered. Without this the
  // static server that serves the build replies to /api/* with index.html,
  // the first response fails to parse as JSON, and the page renders its error
  // boundary -- so the public /resources page was audited as an error screen
  // rather than as itself, and the strings reported for it were the error
  // page's.
  /*
   * A last chance to rewrite what the fixtures answer, for an audit that
   * needs the same product with different data in it.
   *
   * It lives here rather than in a second `context.route` in the caller
   * because Playwright's handlers do not compose: the newest runs first and
   * `route.fetch()` bypasses the rest, so a wrapper reaches the static file
   * server rather than the fixture table and every page renders its error
   * boundary. One table, one handler, one hook.
   */
  const transformBody = options.transformBody ?? ((body) => body);

  if (options.signedOut) {
    await routeFixtures(context, { language, colors, unfixtured, user, transformBody });
    return unfixtured;
  }

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

  await routeFixtures(context, { language, colors, unfixtured, user, transformBody });

  return unfixtured;
}

/** Answer every /api/* call from the fixture table. */
async function routeFixtures(context, { language, colors, unfixtured, user, transformBody }) {
  await context.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const body =
      pathname === "/api/users/me/preferences"
        ? { ...PREFERENCES, language, interfaceColors: colors }
        : pathname === "/api/users/me"
          ? user
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
      body: JSON.stringify(transformBody(body, pathname)),
    });
  });
}
