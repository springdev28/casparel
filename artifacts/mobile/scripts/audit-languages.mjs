#!/usr/bin/env node
/**
 * @fileOverview Verification role: exercises Audit Languages behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every screen of the phone app, in every language, rendered.
 *
 * `mobileSpeaksItsLanguages.test.ts` reads the source and answers "is every
 * string wrapped and is every wrapped string translated". That is the cheap
 * half and it runs in a third of a second. It cannot answer the half that
 * matters to somebody holding the phone: does the screen still come up.
 *
 * Wrapping 252 strings touched twenty-five files by hand and by script, and
 * the ways that goes wrong are not type errors. A hook added inside a
 * destructuring parameter list rather than after it. A `t()` dropped into a
 * string literal, so `'✓ Accepted'` became `'✓ {t('Accept')}ed'`. Both
 * happened here. One was caught by the compiler; the other was caught because
 * something was rendered and looked at.
 *
 * So this loads each route in each language against a stubbed server, and
 * fails if a screen renders the error boundary, renders nothing, or leaves a
 * control with no name for a screen reader to read. Both have
 * fired here for real: the profile screen went to its error boundary in all
 * six languages, and the cause was a crash this file's stub provoked and the
 * product then had to survive.
 *
 * It also compares the languages against each other, which is a weak backstop
 * and is worth saying so. Measured: replacing the classes screen's translator
 * with a passthrough did not fail this, because the tab bar underneath was
 * still translated and the two renders still differed. It only catches a
 * screen where nothing at all is translated. The source check
 * (mobileSpeaksItsLanguages.test.ts) is what catches one missed string; this
 * is what catches a screen that no longer comes up.
 *
 * The accessible-name half rides along because the pages are already rendered
 * and it is the same question in a different sense: a control nobody can name
 * is as unusable as a screen that will not come up. It found the login and
 * sign-up fields nameless -- the shared Input drew its label as a <Text>
 * beside the field, which pairs them for the eye and not at all for VoiceOver,
 * so every field in every form in this app was an unnamed text box -- and the
 * role switch, the control that moves you between the student and teacher
 * halves of the product, announcing as "switch, off".
 *
 * Contrast is not checked here either, and that one took a measurement to
 * settle. Rendering all eight screens in both colour schemes and computing
 * WCAG ratios reported fourteen failures, and every one was an artefact: the
 * paywall and onboarding heroes are white text on a LinearGradient, and a
 * walker looking for a solid backgroundColor skips straight past a gradient to
 * the page behind it and reports white-on-white. The rest were Feather icon
 * glyphs, which are private-use codepoints rather than words. Nothing real.
 * The palettes are covered by session-palette.test.ts and the scheme by
 * mobileFollowsTheScheme.test.ts; the web's audit-pages.mjs learned to read
 * gradient stops off the back of this.
 *
 * What it does not check, having looked: whether the translated text fits the
 * box drawn for it. That is a real class -- the web app had nine of them, one
 * visible as "Desactivadc" in a toolbar -- and measuring every screen here in
 * English, German, Turkish and Spanish found none. React Native lays out with
 * flexbox and wraps by default, so the fixed widths that catch a web app are
 * mostly not here. Recorded so the next person does not repeat the search;
 * artifacts/app/scripts/audit-text-fits.mjs is the check for the side where it
 * does bite.
 *
 * The stub is deliberately thin -- empty collections and a plain profile --
 * because the question here is whether the screens survive translation, not
 * whether they show the right data. audit-screens.mjs drives the real server
 * for that, and needs one.
 *
 *   pnpm --filter @workspace/mobile exec expo export --platform web \
 *     --output-dir .expo/web-export
 *   node scripts/audit-languages.mjs
 *
 * Exit codes: 0 every screen rendered in every language, 1 something is
 * broken, 75 the run could not look (no export, no browser).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR =
  process.env.MOBILE_WEB_EXPORT || path.join(HERE, "..", ".expo", "web-export");
const PORT = Number(process.env.MOBILE_LANG_PORT ?? 4328);
const APP_ORIGIN = "https://casparel.com";

const LANGUAGES = (process.env.MOBILE_LANGS ?? "en,tr").split(",");

/**
 * Each route, and the session it needs to actually be that route.
 *
 * "new" matters: an account that has finished onboarding is sent from
 * /onboarding to the dashboard, which is right, and which meant this list
 * asked for the welcome screen and got the dashboard twice. The state is part
 * of the address.
 */
const SCREENS = [
  { path: "/login", session: "out" },
  { path: "/register", session: "out" },
  { path: "/onboarding", session: "new" },
  // The tabs group is served at the root, not at "/(tabs)".
  { path: "/", session: "in" },
  { path: "/(tabs)/resources", session: "in" },
  { path: "/(tabs)/schedule", session: "in" },
  { path: "/(tabs)/classes", session: "in" },
  { path: "/(tabs)/profile", session: "in" },
  { path: "/paywall", session: "in" },
  // The flashcard player, with the set below standing in for a real one. Every
  // other screen here renders a list; this one renders a single card, and the
  // strings on it -- Term, Answer, Tap to turn over -- exist nowhere else.
  { path: "/study/7", session: "in" },
  // Messages, which is reached from the dashboard header rather than a tab, so
  // no other entry here renders it. Its empty state and its section headings
  // exist nowhere else.
  { path: "/messages", session: "in" },
  /*
   * Goals, also reached from the dashboard rather than a tab.
   *
   * The list and the detail are both here because they say different things:
   * the list carries the status word and the empty state, the detail carries
   * the level, the step hints and "Every step is done." The detail is also
   * the only screen in the app with a checkbox, and its two labels -- mark as
   * done, mark as not done -- exist nowhere else.
   */
  { path: "/goals", session: "in" },
  { path: "/goals/11", session: "in" },
  /*
   * The same screen with its editing mode open. A mode nobody has tapped into
   * renders none of its controls, so every string and every accessible name
   * behind one is unchecked by a run that only loads pages -- and the four
   * that arrange a path are exactly the sort a screen reader has to be able
   * to tell apart. Clicked by testID rather than by name, because the name is
   * translated and finding it would need the answer this is checking.
   */
  { path: "/goals/11", session: "in", open: [{ testId: "edit-steps" }], as: "/goals/11 (editing)" },
  /*
   * And the check-in sheet, which is where a learner records what they can now
   * do -- the write the whole of §8 exists for. Its three answers and its
   * completion screen are a table of English translated where they are
   * rendered, so the source scan sees the strings and nothing had ever drawn
   * them. Opened by tapping an unfinished step, whose label is its own title:
   * data from the stub, identical in every language.
   */
  {
    path: "/goals/11",
    session: "in",
    open: [{ label: "Try the practice set" }],
    as: "/goals/11 (checking in)",
  },
  /*
   * Learning Lists, reached from the resources tab.
   *
   * Both, for the same reason as goals: the index carries the count and the
   * empty state, and the detail carries the position, the reorder controls and
   * the two things a screen reader has to be able to name -- move up and move
   * down, which exist nowhere else in the app.
   */
  { path: "/lists", session: "in" },
  { path: "/lists/11", session: "in" },
  /*
   * The review before a path exists. The specification is explicit that
   * generated work is not activated on somebody's behalf, so this sheet is
   * the moment they decide -- and every word on it, including the two that
   * name the decision, had never been rendered.
   */
  {
    path: "/lists/11",
    session: "in",
    open: [{ testId: "build-path" }],
    as: "/lists/11 (path preview)",
  },
  /*
   * The three screens reached by tapping a row, which is why the list above
   * looked complete without them: every tab was on it, and nothing that a tab
   * leads to was.
   *
   * A conversation is where somebody reads and writes; a class is a roster
   * and a seating chart; a catalogue entry carries the reviews, the rating
   * and the control that puts it in a library. None had been drawn by
   * anything, in either language, in any state.
   */
  { path: "/messages/81", session: "in" },
  { path: "/class/31", session: "in" },
  { path: "/resource/101", session: "in" },
  /*
   * The same page with a source review run on it.
   *
   * Every word of the report -- the trust badge, the strengths, the concerns,
   * the limitations, the mentions -- is behind a button, so a run that only
   * loads pages draws none of it. The badge was `Level + " trust"` glued
   * together in English until something rendered it.
   */
  {
    path: "/resource/101",
    session: "in",
    open: [{ testId: "run-quick-review" }],
    as: "/resource/101 (source review)",
  },
  /*
   * And the screen for an address that is not a screen. `/+not-found` is not
   * a route -- files prefixed with `+` are not served at their own name --
   * so asking for it is the same thing a mistyped deep link does.
   */
  { path: "/+not-found", session: "in", as: "/+not-found (an address that is not a screen)" },
];

const MIME = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};

class Inconclusive extends Error {}

/** What the stubbed server answers, by path suffix. Everything else is []. */
/** Endpoints no branch of stubbedBody answered, reported at the end. */
const unstubbed = new Set();

function stubbedBody(pathname) {
  if (pathname.endsWith("/users/me")) {
    return {
      id: 1,
      email: "audit@casparel.test",
      name: "Audit Account",
      role: "student",
      activeRole: "student",
      plan: "free",
      /*
       * Two, not none. An empty list draws the prompt to add one and never
       * the chips, and the chips are what the profile is mostly made of --
       * including the row that says the profile is complete, which is gated
       * on this being non-empty.
       */
      subjects: ["Mathematics", "Biology"],
      bio: null,
      avatarUrl: null,
      gradeOrDept: null,
      timezone: null,
      websiteUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  }
  if (pathname.endsWith("/users/me/preferences")) return { language: null };
  if (pathname.endsWith("/calendar/status")) {
    return { googleConnected: false, googleConfigured: false, icalSecret: "x" };
  }
  if (pathname.endsWith("/calendar/ical-url")) return { url: `${APP_ORIGIN}/feed.ics` };
  if (pathname.endsWith("/usage")) {
    // The real shape. `[]` is truthy, so a lazy stub here is not a neutral
    // one: it walked the profile screen straight into its error boundary.
    const allowance = { used: 0, limit: 10, window: "day" };
    return {
      plan: "Free",
      tier: "free",
      unlimited: false,
      aiSearch: allowance,
      deepResearch: { ...allowance, window: "month" },
      capacity: {
        classesOwned: { used: 0, limit: 1 },
        classMembers: { used: 0, limit: 30 },
        studyActivities: { used: 0, limit: 25 },
        resourceLists: { used: 0, limit: 5 },
        learningGoals: { used: 0, limit: 10 },
        canvases: { used: 0, limit: 3 },
      },
    };
  }
  if (pathname.includes("/dashboard")) {
    return { resourceCount: 0, reviewCount: 0, classCount: 0, upcomingCount: 0 };
  }
  if (pathname.endsWith("/learning-goals")) {
    /*
     * One goal, part-way through, with a level and a status.
     *
     * Part-way matters: a path with every step done, or none, renders only
     * one of the two step states, and the tick and the strike-through are
     * half of what this screen is.
     */
    return [
      {
        id: 11,
        userId: 1,
        title: "Audit goal",
        subject: "Mathematics",
        description: "Standing in for a real goal.",
        level: "intermediate",
        preferredFormats: null,
        targetDate: null,
        status: "active",
        // Built from a list, so the provenance link on the goal screen renders
        // and this audit reads the name it offers a screen reader.
        sourceListId: 11,
        pathSteps: [
          { id: "s1", title: "Read the chapter", query: "chapter", completed: true },
          { id: "s2", title: "Try the practice set", query: "practice", completed: false },
          /*
           * A step attached from a save. It is the only one that draws the
           * "saved resource" label and the control that opens it, and both
           * are strings and an accessible name this audit is here to read.
           */
          {
            id: "s3",
            title: "Linear Algebra Done Right",
            query: "Mathematics Linear Algebra Done Right",
            completed: false,
            resourceId: 101,
          },
        ],
        createdAt: "2026-03-02T09:00:00.000Z",
        updatedAt: "2026-03-02T09:00:00.000Z",
      },
    ];
  }
  /*
   * One Learning List, with three resources in it, because the detail screen
   * is about order: the first row cannot move up, the last cannot move down,
   * and only a middle row renders both controls enabled.
   */
  if (/\/lists\/\d+$/.test(pathname)) {
    const resource = (id, title, format) => ({
      id,
      title,
      url: `https://example.org/${id}`,
      description: null,
      format,
      subject: "Mathematics",
      gradeLevel: "Undergraduate",
      thumbnailUrl: null,
      submittedById: 1,
      avgRating: 4.5,
      reviewCount: 3,
      createdAt: "2026-03-02T09:00:00.000Z",
      verificationStatus: "verified",
      verificationNote: null,
    });
    return {
      id: 11,
      name: "Audit list",
      description: "Standing in for a real Learning List.",
      ownerId: 1,
      classId: null,
      itemCount: 3,
      createdAt: "2026-03-02T09:00:00.000Z",
      items: [
        {
          id: 1,
          listId: 11,
          resourceId: 101,
          note: null,
          addedAt: "2026-03-02T09:00:00.000Z",
          position: 0,
          // Labelled, so the row renders the chip rather than "No role".
          role: "explanation",
          resource: resource(101, "Linear Algebra Done Right", "pdf"),
        },
        {
          id: 2,
          listId: 11,
          resourceId: 102,
          note: null,
          addedAt: "2026-03-03T09:00:00.000Z",
          position: 1,
          resource: resource(102, "Essence of Linear Algebra", "video"),
        },
        {
          id: 3,
          listId: 11,
          resourceId: 103,
          note: null,
          addedAt: "2026-03-04T09:00:00.000Z",
          position: 2,
          resource: resource(103, "Practice problems", "article"),
        },
      ],
    };
  }
  /*
   * The list review, which the list screen asks for only when the reader
   * presses. Two findings so both the sentence and the count are rendered.
   */
  if (/\/lists\/\d+\/quality$/.test(pathname)) {
    return {
      itemCount: 3,
      checked: ["one_provider", "one_format", "duplicate_link", "level_mismatch"],
      findings: [
        { kind: "one_provider", provider: "example.org", count: 3 },
        { kind: "one_format", format: "article", count: 3 },
      ],
    };
  }
  /*
   * ---- the tabs that had only ever been rendered empty -------------------
   *
   * Nine endpoints fell through to the empty-array default, which meant five
   * screens -- classes, schedule, the library, messages and the dashboard's
   * own panels -- had only ever been drawn with nothing in them. Every string
   * that appears beside a class card, a schedule block, a resource or an
   * assignment was unrendered and therefore unchecked, in both languages.
   *
   * Shapes follow the contract, because a stub that does not is a screen
   * rendered against something the server never sends.
   */
  if (pathname.endsWith("/classes")) {
    return [
      {
        id: 21,
        name: "Audit class",
        subject: "Mathematics",
        gradeLevel: "Year 10",
        teacherId: 2,
        teacherName: "Audit Teacher",
        description: "Standing in for a real class.",
        joinCode: "AUDIT1",
        memberCount: 3,
        createdAt: "2026-03-02T09:00:00.000Z",
      },
    ];
  }
  if (pathname.endsWith("/class-invitations")) {
    return [
      {
        id: 31,
        classId: 21,
        className: "Audit class",
        subject: "Mathematics",
        teacherName: "Audit Teacher",
        status: "pending",
        createdAt: "2026-03-02T09:00:00.000Z",
      },
    ];
  }
  if (pathname.endsWith("/schedule")) {
    return [
      {
        id: 41,
        userId: 1,
        title: "Revise electric fields",
        date: "2026-03-02",
        startTime: "09:00",
        endTime: "10:00",
        notes: "Standing in for a real block.",
        classId: null,
        resourceListId: null,
        createdAt: "2026-03-02T09:00:00.000Z",
      },
    ];
  }
  if (pathname.endsWith("/study-sessions")) {
    return [
      {
        id: 51,
        organizerId: 1,
        organizerName: "Audit Account",
        title: "Audit study session",
        description: "Standing in for a real session.",
        startsAt: "2026-03-02T09:00:00.000Z",
        durationMinutes: 30,
        meetingUrl: "https://meet.example.org/audit",
        classId: null,
        participantCount: 2,
        createdAt: "2026-03-02T09:00:00.000Z",
      },
    ];
  }
  if (pathname.endsWith("/assignments/today")) {
    return [
      {
        id: 61,
        classId: 21,
        className: "Audit class",
        title: "Finish the practice set",
        instructions: "Standing in for a real assignment.",
        dueAt: "2026-03-03T09:00:00.000Z",
        completed: false,
      },
    ];
  }
  if (pathname.endsWith("/activity/recent")) {
    return [
      {
        id: 71,
        userId: 1,
        type: "class",
        workspaceRole: "student",
        message: "Your teacher updated your goal.",
        createdAt: "2026-03-02T09:00:00.000Z",
      },
    ];
  }
  /*
   * A conversation, in the shape the contract actually describes.
   *
   * The first attempt at this stub invented one -- otherUserName, a
   * lastMessage that was a string -- and the screen went straight to its error
   * boundary, which is what a stub that does not follow the contract buys you:
   * a failure that says nothing about the product. `other` is a participant
   * and `lastMessage` is a whole message.
   */
  /*
   * One conversation and its messages, which is the screen a person actually
   * reads. Two senders, because the bubble on the left and the bubble on the
   * right are drawn by different branches, and two days, because the day
   * heading between them is drawn by a third.
   */
  if (/\/direct-messages\/conversations\/\d+$/.test(pathname)) {
    return {
      id: 81,
      firstUserId: 1,
      secondUserId: 2,
      requestedById: 2,
      status: "accepted",
      createdAt: "2026-03-01T09:00:00.000Z",
      updatedAt: "2026-03-02T09:00:00.000Z",
      other: { id: 2, name: "Audit Teacher", role: "teacher", avatarUrl: null },
      lastMessage: {
        id: 92,
        conversationId: 81,
        senderId: 1,
        body: "Standing in for a reply.",
        isAdminMessage: false,
        createdAt: "2026-03-02T09:05:00.000Z",
      },
      unreadCount: 0,
      incomingRequest: false,
      messages: [
        {
          id: 91,
          conversationId: 81,
          senderId: 2,
          body: "Standing in for a real message.",
          isAdminMessage: false,
          createdAt: "2026-03-01T09:00:00.000Z",
        },
        {
          id: 92,
          conversationId: 81,
          senderId: 1,
          body: "Standing in for a reply.",
          isAdminMessage: false,
          createdAt: "2026-03-02T09:05:00.000Z",
        },
      ],
    };
  }

  // A class and the people in it: a teacher and a student, so both role
  // labels are drawn, and a seat so the seating chart is not empty.
  if (/\/classes\/\d+$/.test(pathname)) {
    return {
      id: 31,
      name: "Audit Class",
      subject: "Mathematics",
      gradeLevel: "Undergraduate",
      description: "Standing in for a real class.",
      seatingRows: 2,
      seatingColumns: 3,
      teacherId: 2,
      memberCount: 2,
      createdAt: "2026-03-02T09:00:00.000Z",
      members: [
        {
          userId: 2,
          classId: 31,
          role: "teacher",
          customRole: null,
          joinedAt: "2026-03-02T09:00:00.000Z",
          user: { id: 2, name: "Audit Teacher", role: "teacher", avatarUrl: null },
        },
        {
          userId: 1,
          classId: 31,
          role: "student",
          customRole: null,
          joinedAt: "2026-03-02T09:00:00.000Z",
          user: { id: 1, name: "Audit Learner", role: "student", avatarUrl: null },
        },
      ],
      mySeat: { row: 0, column: 1 },
    };
  }

  // The reviews under a catalogue entry. One with a comment and one without,
  // because a rating with nothing written under it is its own row.
  // What a quick source check reports back. Every field is optional except
  // five, and each optional one draws its own block, so they are all here.
  if (/\/resources\/\d+\/source-review$/.test(pathname)) {
    return {
      sourceName: "example.org",
      sourceType: "University press",
      description: "Standing in for a real publisher description.",
      founded: "1913",
      headquarters: "Cambridge",
      trustLevel: "high",
      trustReason: "A named academic publisher with an editorial process.",
      summary: "Peer-reviewed and openly licensed, with the errata published.",
      reputationAnalysis: "Widely cited in undergraduate reading lists.",
      audienceSentiment: "Readers describe the proofs as unusually readable.",
      contentQuality: "Consistent notation and worked examples throughout.",
      currencyAssessment: "Fourth edition, last revised two years ago.",
      researchScope: "Checked against three independent catalogues.",
      strengths: ["Proofs are written out in full", "Errata are published"],
      concerns: ["Assumes a first course in matrices"],
      limitations: ["Only the English edition was checked"],
      links: [{ label: "Publisher page", url: "https://example.org/about" }],
      mentions: [
        {
          summary: "Named on a university reading list.",
          url: "https://example.org/list",
          sourceType: "official",
          sentiment: "positive",
        },
        {
          summary: "A reader found the third chapter heavy going.",
          url: "https://example.org/thread",
          sourceType: "forum",
          sentiment: "mixed",
        },
      ],
      mode: "quick",
    };
  }

  if (/\/resources\/\d+\/reviews$/.test(pathname)) {
    return [
      {
        id: 71,
        resourceId: 101,
        userId: 2,
        rating: 5,
        comment: "Standing in for a real review.",
        createdAt: "2026-03-02T09:00:00.000Z",
        user: { id: 2, name: "Audit Teacher", role: "teacher", avatarUrl: null },
      },
      {
        id: 72,
        resourceId: 101,
        userId: 1,
        rating: 3,
        comment: null,
        createdAt: "2026-03-01T09:00:00.000Z",
        user: { id: 1, name: "Audit Learner", role: "student", avatarUrl: null },
      },
    ];
  }

  if (/\/resources\/\d+$/.test(pathname)) {
    return {
      id: 101,
      title: "Linear Algebra Done Right",
      url: "https://example.org/101",
      description: "Standing in for a real catalogue entry.",
      format: "pdf",
      subject: "Mathematics",
      gradeLevel: "Undergraduate",
      thumbnailUrl: null,
      submittedById: 1,
      avgRating: 4.5,
      reviewCount: 3,
      createdAt: "2026-03-02T09:00:00.000Z",
      verificationStatus: "verified",
      verificationNote: null,
    };
  }

  if (pathname.endsWith("/direct-messages/conversations")) {
    return [
      {
        id: 81,
        firstUserId: 1,
        secondUserId: 2,
        requestedById: 2,
        status: "accepted",
        createdAt: "2026-03-02T09:00:00.000Z",
        updatedAt: "2026-03-02T09:00:00.000Z",
        other: { id: 2, name: "Audit Teacher", role: "teacher", avatarUrl: null },
        lastMessage: {
          id: 91,
          conversationId: 81,
          senderId: 2,
          body: "Standing in for a real message.",
          isAdminMessage: false,
          createdAt: "2026-03-02T09:00:00.000Z",
        },
        unreadCount: 1,
        incomingRequest: false,
      },
    ];
  }
  /*
   * The library, and one account's own saved resources. Both answer with the
   * same card so the resources tab draws a real one in each of its halves.
   */
  if (pathname.endsWith("/resources") || pathname.endsWith("/library")) {
    return [
      {
        id: 101,
        title: "Linear Algebra Done Right",
        url: "https://example.org/101",
        description: "Standing in for a real catalogue entry.",
        format: "pdf",
        subject: "Mathematics",
        gradeLevel: "Undergraduate",
        thumbnailUrl: null,
        submittedById: 1,
        avgRating: 4.5,
        reviewCount: 3,
        createdAt: "2026-03-02T09:00:00.000Z",
        verificationStatus: "verified",
        verificationNote: null,
      },
    ];
  }
  if (pathname.endsWith("/lists")) {
    return [
      {
        id: 11,
        name: "Audit list",
        description: "Standing in for a real Learning List.",
        ownerId: 1,
        classId: null,
        itemCount: 3,
        createdAt: "2026-03-02T09:00:00.000Z",
      },
    ];
  }
  /*
   * A check-in against the audit goal's first step, so the goal screen renders
   * the "checked in" mark as well as the plain step.
   */
  /*
   * The audit goal's list has moved on by one, so the goal screen draws the
   * card that says so and the button that would bring it forward.
   */
  if (pathname.endsWith("/list-drift")) {
    return {
      listId: 11,
      listName: "Audit list",
      added: [
        {
          id: 102,
          title: "Added after the path was built",
          url: "https://example.org/102",
          description: null,
          format: "article",
          subject: "Mathematics",
          gradeLevel: "Undergraduate",
          thumbnailUrl: null,
          submittedById: 1,
          avgRating: 0,
          reviewCount: 0,
          createdAt: "2026-03-02T09:00:00.000Z",
          verificationStatus: "verified",
          verificationNote: null,
        },
      ],
    };
  }
  /*
   * What to do with the audit goal's next step. An article, so reading, with
   * the learner's own study set offered beside it -- which renders both
   * buttons the goal screen can show.
   */
  if (/\/steps\/[^/]+\/activity$/.test(pathname)) {
    return {
      kind: "read",
      because: "format",
      query: null,
      resource: {
        id: 101,
        title: "Linear Algebra Done Right",
        url: "https://example.org/101",
        description: null,
        format: "pdf",
        subject: "Mathematics",
        gradeLevel: "Undergraduate",
        thumbnailUrl: null,
        submittedById: 1,
        avgRating: 4.5,
        reviewCount: 3,
        createdAt: "2026-03-02T09:00:00.000Z",
        verificationStatus: "verified",
        verificationNote: null,
      },
      recallActivity: { id: 7, title: "Audit set", mode: "flashcards" },
    };
  }
  if (pathname.endsWith("/learning-evidence")) {
    return [
      {
        id: 1,
        userId: 1,
        resourceId: null,
        learningGoalId: 11,
        pathStepId: "s1",
        concept: "Read the chapter",
        confidence: 3,
        understanding: 4,
        reflection: "I can",
        misconception: null,
        createdAt: "2026-03-02T09:00:00.000Z",
      },
    ];
  }
  if (pathname.endsWith("/study-activities")) {
    // Two cards, because the player's controls differ on the first and the
    // last: one card would render both as disabled and check neither.
    return [
      {
        id: 7,
        ownerId: 1,
        workspaceRole: "student",
        classId: null,
        title: "Audit study set",
        subject: "Mathematics",
        mode: "flashcards",
        shareToken: null,
        cards: [
          { id: "a", term: "derivative", answer: "rate of change" },
          { id: "b", term: "integral", answer: "area under a curve" },
        ],
        createdAt: "2026-03-02T09:00:00.000Z",
        updatedAt: "2026-03-02T09:00:00.000Z",
      },
    ];
  }
  /*
   * Nothing matched. An empty array is the safer guess -- most of what this
   * app reads is a collection -- and its cost is that the screen reading it
   * renders a shape the contract never produces while the run reports that
   * the screen came up. Recorded rather than swallowed: a stub the audit
   * cannot answer is a screen the audit cannot check.
   */
  unstubbed.add(pathname);
  return [];
}

/**
 * Controls a reader can reach but a screen reader cannot name.
 *
 * aria-hidden and tabindex="-1" are skipped: react-native-web renders hidden
 * companions beside some controls, and reporting those is noise.
 */
const NAMELESS = `(() => {
  const CONTROLS =
    'button, a[href], [role="button"], [role="link"], [role="switch"], ' +
    '[role="tab"], [role="checkbox"], input:not([type="hidden"]), select, textarea';
  const out = [];
  for (const element of document.querySelectorAll(CONTROLS)) {
    if (!element.getClientRects().length) continue;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (element.closest('[aria-hidden="true"]')) continue;
    if (element.getAttribute('tabindex') === '-1') continue;
    const named =
      (element.getAttribute('aria-label') || '').trim() ||
      element.getAttribute('aria-labelledby') ||
      (element.getAttribute('title') || '').trim() ||
      (element.textContent || '').trim() ||
      element.closest('label');
    if (!named) {
      out.push(
        element.tagName.toLowerCase() +
          (element.getAttribute('role') ? '[role=' + element.getAttribute('role') + ']' : '') +
          (element.type ? '[' + element.type + ']' : ''),
      );
    }
  }
  return out;
})()`;

/**
 * What is on screen, including what is inside the form fields.
 *
 * `innerText` alone stops at the edge of an <input>: a screen whose content is
 * a column of text boxes reads as a column of blank lines, and the goal
 * screen's editing mode -- four fields and nothing else -- looked empty to a
 * run that was passing it. A placeholder and a value are both words somebody
 * reads, and both are things a translation can miss.
 */
const VISIBLE_TEXT = `(() => {
  const parts = [document.body.innerText];
  for (const field of document.querySelectorAll("input, textarea")) {
    if (field.placeholder) parts.push(field.placeholder);
    if (field.value) parts.push(field.value);
  }
  return parts.join("\\n");
})()`;

async function main() {
  if (!fs.existsSync(path.join(EXPORT_DIR, "index.html"))) {
    throw new Inconclusive(
      `no web export at ${EXPORT_DIR}. Build one with:\n` +
        `  pnpm --filter @workspace/mobile exec expo export --platform web ` +
        `--output-dir .expo/web-export`,
    );
  }

  /*
   * playwright-core is deliberately not a dependency of any package here --
   * it is a tool, not something a bundle needs -- so CI installs it out of
   * tree and links it into artifacts/app. audit-screens.mjs looks in the same
   * two places for the same reason.
   */
  let chromium;
  let launchOptions;
  try {
    try {
      ({ chromium } = await import("playwright-core"));
    } catch {
      const beside = path.join(HERE, "..", "..", "app", "node_modules", "playwright-core");
      if (!fs.existsSync(beside)) throw new Error("playwright-core is not installed");
      // By path it arrives as CommonJS, so the named exports sit on `default`.
      const loaded = await import(new URL(`file://${beside}/index.js`).href);
      chromium = (loaded.chromium ? loaded : loaded.default).chromium;
    }
    ({ launchOptions } = await import("../../app/scripts/chromium.mjs"));
  } catch (error) {
    throw new Inconclusive(`no browser available: ${String(error)}`);
  }

  const server = http
    .createServer((req, res) => {
      const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
      let file = path.join(EXPORT_DIR, url);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(EXPORT_DIR, "index.html");
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
      });
      res.end(fs.readFileSync(file));
    })
    .listen(PORT, "127.0.0.1");

  const browser = await chromium.launch(launchOptions());
  const failures = [];
  /** route -> language -> the words on screen, to compare languages. */
  const seen = new Map();
  let rendered = 0;

  for (const language of LANGUAGES) {
    for (const screen of SCREENS) {
      const context = await browser.newContext({
        viewport: { width: 393, height: 852 },
      });
      await context.addInitScript(
        ({ lang, session }) => {
          localStorage.setItem("casparel_language", lang);
          if (session === "out") return;
          localStorage.setItem("schoolar_token", "audit-session");
          // 'true', not '1': OnboardingContext compares against the word, and
          // anything else means "not onboarded yet" -- which sent every
          // signed-in route to the onboarding screen and had this audit
          // reporting seven screens after rendering one, seven times.
          if (session === "in") localStorage.setItem("casparel_onboarded", "true");
        },
        { lang: language, session: screen.session },
      );
      // The app hardcodes its origin, so the requests are caught here.
      await context.route(`${APP_ORIGIN}/**`, (route) => {
        const { pathname } = new URL(route.request().url());
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(stubbedBody(pathname)),
        });
      });

      const page = await context.newPage();
      const crashes = [];
      page.on("pageerror", (error) => crashes.push(String(error)));

      const where = `${screen.as ?? screen.path} [${language}]`;
      try {
        await page.goto(`http://127.0.0.1:${PORT}${screen.path}`, {
          waitUntil: "networkidle",
          timeout: 45000,
        });
        await page.waitForTimeout(600);
        for (const step of screen.open ?? []) {
          /*
           * By id where there is one, and otherwise by a label that is data
           * rather than copy -- a step's own title, which the stub supplies
           * and no dictionary translates. Never by a translated name: finding
           * it would need the answer this run is checking.
           */
          const control = step.testId
            ? page.locator(`[data-testid="${step.testId}"]`)
            : page.getByLabel(step.label, { exact: false }).first();
          await control.click({ timeout: 10000 });
          await page.waitForTimeout(500);
        }
        const text = (await page.evaluate(VISIBLE_TEXT)).trim();
        rendered += 1;

        if (!text) {
          failures.push(`${where}: rendered nothing`);
        } else if (/Something went wrong|Please reload the app/i.test(text)) {
          // The error boundary. Which is exactly what a hook called in the
          // wrong place produces.
          failures.push(`${where}: error boundary — ${text.slice(0, 120)}`);
        } else {
          const key = screen.as ?? screen.path;
          const byLanguage = seen.get(key) ?? new Map();
          byLanguage.set(language, text);
          seen.set(key, byLanguage);
        }
        for (const crash of crashes) failures.push(`${where}: ${crash.slice(0, 160)}`);
        // Once per route, not once per language: a nameless control is the
        // same control in every language, and one copy per language is noise.
        if (language === LANGUAGES[0]) {
          for (const control of await page.evaluate(NAMELESS)) {
            failures.push(`${screen.as ?? screen.path}: no accessible name: ${control}`);
          }
        }
        console.log(`  ok   ${where}  (${text.split("\n").length} lines)`);
      } catch (error) {
        failures.push(`${where}: ${String(error).slice(0, 160)}`);
        console.error(`  FAIL ${where}`);
      }
      await context.close();
    }
  }

  await browser.close();
  server.close();

  /*
   * Nine routes that all render the same thing is one route rendered nine
   * times, and that is what this was doing until the onboarding flag was
   * written the way the app reads it. Distinct screens are the premise every
   * other assertion here rests on, so it is checked rather than assumed.
   */
  const englishRenders = new Map();
  for (const [route, byLanguage] of seen) {
    const english = byLanguage.get("en");
    if (english) englishRenders.set(route, english);
  }
  const byContent = new Map();
  for (const [route, text] of englishRenders) {
    byContent.set(text, (byContent.get(text) ?? []).concat(route));
  }
  for (const routes of byContent.values()) {
    if (routes.length > 1) {
      failures.push(
        `these routes rendered the same screen, so only one of them was ` +
          `really checked: ${routes.join(", ")}`,
      );
    }
  }

  /*
   * A screen that reads the same in English and in Turkish is a screen no
   * translator reached at all. A weak signal, kept because it costs nothing
   * and the case it catches is total: anything short of that -- one component
   * losing its translator, one string left English -- still differs here,
   * because the tab bar alone is enough to tell the two renders apart.
   */
  for (const [route, byLanguage] of seen) {
    const english = byLanguage.get("en");
    if (!english) continue;
    for (const [language, text] of byLanguage) {
      if (language === "en") continue;
      if (text === english) {
        failures.push(`${route} [${language}]: identical to the English render`);
      }
    }
  }

  if (rendered === 0) throw new Inconclusive("no screen rendered; this run checked nothing");

  if (unstubbed.size) {
    failures.push(
      `no stub for ${[...unstubbed].sort().join(", ")} — answered empty, so ` +
        `whatever reads it was not checked. Add a branch to stubbedBody.`,
    );
  }

  if (failures.length) {
    console.error(`\n${failures.length} problem(s):`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(
    `\n${rendered} screen renders across ${LANGUAGES.length} languages, ` +
      `all in the language asked for.`,
  );
}

try {
  await main();
} catch (error) {
  if (error instanceof Inconclusive) {
    console.error(`Inconclusive: ${error.message}`);
    process.exit(75);
  }
  throw error;
}
