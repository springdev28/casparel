/**
 * A class of pupils is not one caller, however it looks from outside.
 *
 * Both limiters here counted per address, and a school shares one. Writing was
 * capped at twenty a minute, so thirty students accepting a class invitation
 * and making their first activity was sixty writes from a single address and
 * most of the room was told it was submitting too quickly. Reading was worse:
 * a signed-in page costs about ten API requests, measured in a browser, so a
 * hundred a minute gave a whole class ten page loads between them. Thirty
 * pupils opening the app at the start of a lesson exceeded it threefold --
 * with per-address counting, two hundred of those three hundred reads are
 * refused.
 *
 * What these limits exist for is one caller misbehaving, and a caller is an
 * account: one account writing a hundred things a minute, or asking a hundred
 * times, is the behaviour worth stopping. Counting per account stops it and
 * leaves the room alone. Anonymous traffic still counts per address, which is
 * where a flood with no account to name comes from.
 *
 * Every relaxation is paired with the limit it must not remove, because a
 * limiter that stopped limiting would pass the classroom tests too.
 *
 * Run against the real middleware with the in-memory store, so what is checked
 * is the configuration that ships.
 */
import { beforeAll, describe, expect, it } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

let app: Express;
let tokenFor: (userId: number) => string;

beforeAll(async () => {
  process.env.RATE_LIMIT_STORE = "memory";
  // The limiter keys off a real token, so one has to be signable here.
  process.env.SESSION_SECRET ||= "content-limiter-test-secret-long-enough";
  const { contentLimiter, globalLimiter } = await import("./limiters");
  const { issueToken } = await import("./auth");
  tokenFor = (userId) => issueToken(userId, "student", "student");

  app = express();
  app.use(express.json());
  app.post("/things", contentLimiter, (_req, res) => {
    res.status(201).json({ ok: true });
  });
  // The global limiter covers reading, which is most of what the app does.
  app.get("/pages", globalLimiter, (_req, res) => {
    res.status(200).json({ ok: true });
  });
});

const write = (token?: string) => {
  const req = request(app).post("/things").send({});
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
};

describe("a classroom writing is not an abuser writing", () => {
  it("serves twenty-five pupils writing once each from one address", async () => {
    const codes: number[] = [];
    for (let pupil = 1; pupil <= 25; pupil += 1) {
      const res = await write(tokenFor(pupil));
      codes.push(res.status);
    }
    expect(
      codes.filter((code) => code !== 201).length,
      "pupils sharing a school connection were refused for each other's writes",
    ).toBe(0);
  });

  it("still stops one account writing far too fast", async () => {
    const token = tokenFor(9_001);
    let firstRefusal: number | null = null;
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      const res = await write(token);
      if (res.status === 429 && firstRefusal === null) firstRefusal = attempt;
    }
    expect(
      firstRefusal,
      "one account could write without limit, so nothing is stopping spam",
    ).not.toBeNull();
    expect(firstRefusal).toBeLessThanOrEqual(21);
  });

  it("counts an unauthenticated caller by address rather than not at all", async () => {
    // Otherwise sending no token would be a way to opt out of the limit.
    let refused = false;
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      const res = await write();
      if (res.status === 429) {
        refused = true;
        break;
      }
    }
    expect(refused, "a caller with no token was never limited").toBe(true);
  });
});

describe("a classroom reading is not a flood", () => {
  const read = (token: string) =>
    request(app).get("/pages").set("Authorization", `Bearer ${token}`);

  it("serves a class of thirty loading a page each from one address", async () => {
    // A signed-in page costs about ten API requests, measured in a browser,
    // so thirty pupils opening the app is three hundred requests from one
    // school connection. Counted per address at a hundred a minute, the room
    // exceeded the limit three times over just by arriving.
    const codes: number[] = [];
    for (let pupil = 100; pupil < 130; pupil += 1) {
      for (let request = 0; request < 10; request += 1) {
        const res = await read(tokenFor(pupil));
        codes.push(res.status);
      }
    }
    expect(
      codes.filter((code) => code !== 200).length,
      "pupils sharing a school connection were refused for each other's reading",
    ).toBe(0);
  });

  it("still stops one account asking far too often", async () => {
    const token = tokenFor(9_002);
    let refused = false;
    for (let attempt = 1; attempt <= 130; attempt += 1) {
      const res = await read(token);
      if (res.status === 429) {
        refused = true;
        break;
      }
    }
    expect(refused, "one account could read without limit").toBe(true);
  });
});
