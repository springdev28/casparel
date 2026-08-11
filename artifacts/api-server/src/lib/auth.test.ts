import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decodeToken,
  hashPassword,
  verifyPassword,
} from "./auth";

function signTestToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
) {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.SESSION_SECRET!)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function validPayload() {
  const now = Date.now();
  return {
    userId: 1,
    role: "student",
    accountRole: "student",
    iat: now,
    exp: now + 60_000,
  };
}

describe("auth primitives", () => {
  it("rejects malformed stored password hashes without throwing", async () => {
    await expect(verifyPassword("Password1!", "corrupt-value")).resolves.toBe(false);
  });

  it("accepts valid password hashes", async () => {
    const stored = await hashPassword("Password1!");
    await expect(verifyPassword("Password1!", stored)).resolves.toBe(true);
    await expect(verifyPassword("WrongPassword1!", stored)).resolves.toBe(false);
  });

  it("rejects unsupported algorithms and invalid claims", () => {
    const payload = validPayload();
    expect(decodeToken(signTestToken({ alg: "none" }, payload))).toBeNull();
    expect(
      decodeToken(signTestToken({ alg: "HS256" }, { ...payload, userId: "1" })),
    ).toBeNull();
  });

  it("keeps existing HS256 tokens without a typ header valid", () => {
    const token = signTestToken({ alg: "HS256" }, validPayload());
    expect(decodeToken(token)?.userId).toBe(1);
  });
});
