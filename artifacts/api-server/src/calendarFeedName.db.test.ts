/**
 * @fileOverview Verification role: exercises Calendar Feed Name.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The calendar somebody subscribes to is called Casparel, and stays the
 * calendar they already subscribed to.
 *
 * `X-WR-CALNAME` is the name a feed gets in the subscriber's own app. It said
 * "…'s Schooler Schedule", so anybody who added the feed in Apple Calendar,
 * Outlook or Google had a calendar in their sidebar under a name this product
 * has not used for a while. A feed is the one surface a rename cannot reach on
 * its own: it lives on their device until they resubscribe, and nobody
 * resubscribes to a calendar that is working.
 *
 * The other half matters more and pulls the other way. A calendar app matches
 * events by UID, so changing the UID scheme would not rename anything -- it
 * would make every event look new, and anybody already subscribed would get a
 * second copy of their entire schedule next to the first. So the UIDs keep
 * their old `schooler-block-…` spelling deliberately, and this pins them, in a
 * place where the next person to grep for the old name finds out why before
 * they tidy it away.
 *
 * Real database, real router, real bytes: an .ics is text with escaping rules
 * of its own, and the only way to know a calendar app can read it is to look
 * at what actually goes over the wire.
 *
 *   VERIFY_DATABASE_URL=postgres://…/throwaway \
 *     pnpm --filter @workspace/api-server exec vitest run
 */
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { useExclusiveDatabase } from "./dbTestLock.js";

const url = process.env.VERIFY_DATABASE_URL;

useExclusiveDatabase();

describe.skipIf(!url)("the calendar feed", () => {
  it("names itself Casparel, keeps its event ids, and escapes what it must", async () => {
    process.env.DATABASE_URL = url;
    const { db, usersTable } = await import("@workspace/db");
    const { default: calendarRouter } = await import("./routes/calendar.js");
    const { default: scheduleRouter } = await import("./routes/schedule.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [user] = await db
      .insert(usersTable)
      .values({
        email: `ical-${stamp}@example.test`,
        passwordHash: "x",
        name: "Ada Lovelace",
        role: "student",
      })
      .returning();
    const token = issueToken(user.id, user.role, user.activeRole);

    const app = express();
    app.use(express.json());
    app.use("/api", calendarRouter);
    app.use("/api", scheduleRouter);
    const auth = { Authorization: `Bearer ${token}` };

    /*
     * A title with every character iCalendar gives meaning to.
     *
     * Semicolons and commas separate parameters and values, and a backslash
     * escapes; unescaped, any of them truncates the event or breaks the file
     * for the whole calendar rather than for one entry.
     */
    const awkward = "Revision; with, punctuation\\ and more";
    const created = await request(app)
      .post("/api/schedule")
      .set(auth)
      .send({
        title: awkward,
        date: "2026-08-19",
        startTime: "09:00",
        endTime: "10:30",
        notes: "First line\nSecond line",
      });
    expect(created.status, created.text.slice(0, 200)).toBe(201);

    const status = await request(app).get("/api/calendar/status").set(auth);
    expect(status.status).toBe(200);
    const feed = await request(app).get(`/api/calendar/${status.body.icalSecret}/feed.ics`);
    expect(feed.status).toBe(200);
    expect(feed.headers["content-type"]).toMatch(/text\/calendar/);

    const ics = feed.text;
    expect(ics.startsWith("BEGIN:VCALENDAR"), "not an iCalendar file at all").toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);

    // The name in somebody else's sidebar.
    expect(ics).toMatch(/X-WR-CALNAME:Ada Lovelace's Casparel Schedule/);
    expect(ics, "the old brand is in the feed").not.toMatch(/Schooler Schedule/);
    expect(ics).toMatch(/PRODID:-\/\/Casparel\/\/Casparel Calendar\/\/EN/);
    expect(feed.headers["content-disposition"]).toMatch(/casparel\.ics/);

    /*
     * And the id stays as it was. Not an oversight: renaming this duplicates
     * the schedule of everybody already subscribed. If it ever has to change,
     * it needs a migration for subscribers, not a find-and-replace.
     */
    expect(ics, "changing this duplicates every subscriber's events").toMatch(
      /UID:schooler-block-\d+@schooler/,
    );

    // Escaping, on the line that carries it.
    const summary = ics.split(/\r?\n/).find((line) => line.startsWith("SUMMARY:"));
    expect(summary).toBe("SUMMARY:Revision\\; with\\, punctuation\\\\ and more");
    const description = ics.split(/\r?\n/).find((line) => line.startsWith("DESCRIPTION:"));
    expect(description, "a raw newline ends the property early").toBe(
      "DESCRIPTION:First line\\nSecond line",
    );
  });
});
