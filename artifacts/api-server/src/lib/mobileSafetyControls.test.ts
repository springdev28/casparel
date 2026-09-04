/**
 * Store declarations are about the app a reviewer can actually use.
 *
 * Three of these controls used to be asserted against native screens: report
 * and block on the conversation screen, the message-request switch and
 * permanent deletion on the profile tab. Those screens were deleted once the
 * phone began showing the website to a signed-in person, so asserting on them
 * would now be asserting about files nobody ships.
 *
 * The obligations did not move with them, though. A reviewer holding the
 * phone still has to be able to report someone, refuse strangers, and delete
 * the account -- Apple requires that last one of any app that offers sign-up
 * -- so each check now reads the web surface the WebView actually renders.
 * Registration stays native, and so does its assertion.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(here, path), "utf8");
// What the signed-in phone shows, which is the website in a WebView.
const conversation = read("../../../app/src/pages/UserProfilePage.tsx");
const settings = read("../../../app/src/pages/SettingsPage.tsx");
const deletion = read("../../../app/src/components/AccountActionDialog.tsx");
// Still native: registration happens before the workspace is reachable.
const registration = read("../../../mobile/app/register.tsx");
const terms = read("../../../app/src/pages/LegalPage.tsx");

describe("mobile user-safety controls", () => {
  it("lets a person privately report and block someone they are talking to", () => {
    expect(conversation).toMatch(/useReportUser\(\)/);
    expect(conversation).toMatch(/reportUser\.mutateAsync\(/);
    expect(conversation).toMatch(/useBlockUser\(\)/);
    expect(conversation).toMatch(/blockUser\.mutateAsync\(/);
    expect(conversation).toContain("Report privately");
    expect(conversation).toContain("Block user");
  });

  it("lets a phone user refuse unsolicited message requests", () => {
    expect(settings).toMatch(/useUserPreferences\(/);
    expect(settings).toMatch(/useUpdateUserPreferences\(\)/);
    expect(settings).toContain("allowMessageRequests: checked");
  });

  it("requires the UGC terms before registration", () => {
    expect(registration).toContain("acceptedTerms");
    expect(registration).toContain("disabled={!acceptedTerms}");
    // The links derive from the configured origin (casparel.com in
    // production) so a staging build opens its own deployment's documents.
    expect(registration).toContain("`${apiOrigin}/terms`");
    expect(registration).toContain("`${apiOrigin}/privacy`");
  });

  it("lets an account created on the phone start permanent deletion on the phone", () => {
    expect(deletion).toMatch(/useDeleteMe\(\)/);
    expect(deletion).toMatch(/deleteAccount\.mutateAsync\(/);
    expect(deletion).toContain("Delete account permanently");
    // The warning first, then the current password: deletion is never one tap.
    expect(deletion).toContain('type="password"');
  });

  it("publishes explicit rules for objectionable content and enforcement", () => {
    expect(terms).toContain("sexually");
    expect(terms).toContain("nudity outside a legitimate");
    expect(terms).toContain("uncensored real-world violence");
    expect(terms).toContain("direct messages");
    expect(terms).toContain("proactively screen content");
  });
});
