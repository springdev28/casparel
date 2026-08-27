/**
 * Store declarations are about the Android app a reviewer can actually use.
 * Keep the mobile controls that make Casparel's UGC answers true from quietly
 * becoming web-only again.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(here, path), "utf8");
const conversation = read("../../../mobile/app/messages/[id].tsx");
const profile = read("../../../mobile/app/(tabs)/profile.tsx");
const registration = read("../../../mobile/app/register.tsx");
const terms = read("../../../app/src/pages/LegalPage.tsx");

describe("mobile user-safety controls", () => {
  it("lets a person privately report and block someone from a conversation", () => {
    expect(conversation).toMatch(/useReportUser\(\)/);
    expect(conversation).toMatch(/reportUser\.mutateAsync\(/);
    expect(conversation).toMatch(/useBlockUser\(\)/);
    expect(conversation).toMatch(/blockUser\.mutateAsync\(/);
    expect(conversation).toContain("Report privately");
    expect(conversation).toContain("Block user");
  });

  it("lets a phone user refuse unsolicited message requests", () => {
    expect(profile).toMatch(/useGetMyPreferences\(\)/);
    expect(profile).toMatch(/useUpdateMyPreferences\(\)/);
    expect(profile).toContain("allowMessageRequests: value");
  });

  it("requires the UGC terms before registration", () => {
    expect(registration).toContain("acceptedTerms");
    expect(registration).toContain("disabled={!acceptedTerms}");
    expect(registration).toContain("https://casparel.com/terms");
    expect(registration).toContain("https://casparel.com/privacy");
  });

  it("publishes explicit rules for objectionable content and enforcement", () => {
    expect(terms).toContain("sexually");
    expect(terms).toContain("nudity outside a legitimate");
    expect(terms).toContain("uncensored real-world violence");
    expect(terms).toContain("direct messages");
    expect(terms).toContain("proactively screen content");
  });
});
