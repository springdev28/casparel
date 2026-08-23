/**
 * @fileOverview Verification role: exercises Mobile Class Invitations.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * A pupil can answer a class invitation on the phone.
 *
 * The mobile Classes tab was read-only. It listed the classes you were already
 * in, and its empty state said "Classes you join or create will appear here" --
 * while offering no way to join one or create one. So a pupil invited to a
 * class could not accept on mobile at all.
 *
 * The server made that worse by writing "Accept or decline it from
 * notifications" into the activity feed, which the app shows on its home
 * screen. Mobile has no notifications surface, so the instruction pointed at a
 * screen that does not exist on the platform the reader was holding.
 *
 * This reads the screen as text because the mobile package has no renderer,
 * and it lives here rather than in the mobile suite because a React Native
 * package has no Node types -- giving it them to read a file would put
 * `process` and `Buffer` in scope for app code that runs on a phone, where
 * neither exists. The other mobile tests cover pure functions and stay there.
 *
 * It is deliberately about the things whose absence made the flow impossible:
 * the query, the mutation, and both answers.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(
  resolve(here, "../../../mobile/app/(tabs)/classes.tsx"),
  "utf8",
);
const classesRoute = readFileSync(
  resolve(here, "../routes/classes.ts"),
  "utf8",
);

describe("the mobile classes screen", () => {
  it("reads the file it is about", () => {
    expect(screen).toContain("export default function ClassesScreen");
  });

  it("asks for the invitations the reader has", () => {
    // The call, not merely the name: an import left behind after the call is
    // deleted would satisfy a substring check while the screen asks for
    // nothing.
    expect(screen).toMatch(/useListMyClassInvitations\(\)/);
    // Only pending ones: an answered invitation is not an invitation.
    expect(screen).toMatch(/invitation\.status === 'pending'/);
  });

  it("offers both answers, not just the welcoming one", () => {
    expect(screen).toMatch(/useRespondToClassInvitation\(\)/);
    expect(screen).toMatch(/respond\.mutateAsync\(/);
    expect(screen).toContain("Join class");
    expect(screen).toContain("Decline");
  });

  it("refreshes the class list after an answer", () => {
    // Accepting adds a class; leaving the list stale shows a pupil a screen
    // that says they are in nothing, moments after they joined.
    expect(screen).toContain("getListClassesQueryKey()");
    expect(screen).toContain("getListMyClassInvitationsQueryKey()");
  });

  it("says why a refusal happened rather than guessing", () => {
    expect(screen).toContain("describeApiFailure");
  });

  it("does not keep the empty state under a pending invitation", () => {
    // "No classes yet" beneath an invitation card reads as a broken screen.
    expect(screen).toMatch(/pending\.length \? null : \(/);
  });
});

describe("the invitation notice", () => {
  it("does not send a phone to a screen that only the web app has", () => {
    expect(
      classesRoute.includes("Accept or decline it from notifications"),
      "mobile has no notifications surface; name no surface at all",
    ).toBe(false);
  });

  it("records what happened rather than telling you to do it", () => {
    /*
     * The activity log is permanent. An instruction in it stays on the
     * dashboard after it has been carried out -- "Accept or decline it in the
     * app" sat above a Classes count of 1, a to-do that could never be ticked
     * off. Accepting lives on the invitation card, which disappears when
     * answered.
     */
    // Only what the route actually sends: the comment above the fix quotes
    // the old sentence, and quoting it is not sending it.
    const messages = [...classesRoute.matchAll(/message:\s*`([^`]*)`/g)].map((m) => m[1]);
    expect(messages.filter((line) => /Accept or decline it/.test(line))).toEqual([]);
    expect(messages.some((line) => line.startsWith("You were invited to join "))).toBe(true);
  });
});
