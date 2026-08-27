import { afterEach, describe, expect, it } from "vitest";
import { decryptSupportValue, encryptSupportValue } from "./supportEncryption";

const originalDataKey = process.env.DATA_ENCRYPTION_KEY;
const originalSessionSecret = process.env.SESSION_SECRET;

afterEach(() => {
  if (originalDataKey === undefined) delete process.env.DATA_ENCRYPTION_KEY;
  else process.env.DATA_ENCRYPTION_KEY = originalDataKey;
  if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSessionSecret;
});

describe("support request encryption", () => {
  it("round-trips values without storing plaintext", () => {
    process.env.DATA_ENCRYPTION_KEY = "test-only-key-that-is-at-least-thirty-two-bytes";
    const encrypted = encryptSupportValue("email", "learner@example.com");
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain("learner@example.com");
    expect(decryptSupportValue("email", encrypted)).toBe("learner@example.com");
  });

  it("binds ciphertext to its field and rejects tampering", () => {
    process.env.DATA_ENCRYPTION_KEY = "test-only-key-that-is-at-least-thirty-two-bytes";
    const encrypted = encryptSupportValue("email", "learner@example.com");
    expect(() => decryptSupportValue("message", encrypted)).toThrow();
    expect(() => decryptSupportValue("email", `${encrypted}x`)).toThrow();
  });

  it("refuses to encrypt when no sufficiently strong key is configured", () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    process.env.SESSION_SECRET = "short";
    expect(() => encryptSupportValue("email", "learner@example.com")).toThrow(/at least 32/);
  });
});
