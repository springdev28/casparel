/**
 * Signing in correctly must not use up the allowance for signing in.
 *
 * The credential limiter counted every attempt against the caller's address,
 * twenty per quarter hour. This product is sold to schools, where thirty
 * students share one classroom connection, so a class arriving at nine o'clock
 * spent the whole allowance on *successful* sign-ins and the last ten were
 * turned away -- told they had made too many sign-in attempts, on their first.
 *
 * The fix has to keep the guard the limiter exists for, which is why this file
 * asserts both halves. A password guesser produces nothing but failures and
 * still meets a wall quickly; a classroom produces almost none and meets
 * nothing. Those two cases look identical to a per-address count of all
 * requests, and that was the actual defect.
 *
 * The per-account limiter is the other half. An address cannot distinguish
 * thirty people mistyping once from one person guessing thirty times, so the
 * bound that matters is counted against the account being attempted -- which
 * also means one pupil fumbling their password cannot lock out the rest of
 * the room.
 *
 * Run against the real limiter middleware with the in-memory store, so what is
 * checked is the configuration that ships rather than a restatement of it.
 */
import { beforeAll, describe, expect, it } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const PASSWORD = "correct-horse-battery-staple";

let app: Express;

beforeAll(async () => {
  // Chosen before the limiters are imported: buildRateLimitStore reads this at
  // module scope and would otherwise reach for Postgres.
  process.env.RATE_LIMIT_STORE = "memory";
  const { authLimiter, authAccountLimiter } = await import("./limiters");

  app = express();
  app.use(express.json());
  // Mounted on the path and in the same order as app.ts.
  app.use("/auth/login", authLimiter, authAccountLimiter);
  app.post("/auth/login", (req, res) => {
    if (req.body?.password === PASSWORD) res.status(200).json({ ok: true });
    else res.status(401).json({ error: "Invalid credentials" });
  });
});

const signIn = (email: string, password: string) =>
  request(app).post("/auth/login").send({ email, password });

describe("a classroom is not a brute-force attack", () => {
  it("lets thirty people sign in from one address", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      const res = await signIn(`pupil${i}@school.test`, PASSWORD);
      codes.push(res.status);
    }
    const refused = codes.filter((code) => code !== 200);
    expect(
      refused,
      "a class sharing one connection was locked out by signing in correctly",
    ).toEqual([]);
  });

  it("lets someone in after they mistype a few times", async () => {
    const email = "fumbler@school.test";
    for (let i = 0; i < 5; i += 1) await signIn(email, `wrong-${i}`);
    await expect(
      signIn(email, PASSWORD).then((r) => r.status),
    ).resolves.toBe(200);
  });

  it("does not let one person's mistakes lock out the next person", async () => {
    const victim = "classmate@school.test";
    for (let i = 0; i < 9; i += 1) await signIn("noisy@school.test", `wrong-${i}`);
    await expect(signIn(victim, PASSWORD).then((r) => r.status)).resolves.toBe(200);
  });
});

describe("guessing one account still meets a wall", () => {
  it("refuses after ten failures against the same address", async () => {
    const email = "target@school.test";
    let firstRefusal: number | null = null;
    for (let attempt = 1; attempt <= 14; attempt += 1) {
      const res = await signIn(email, `guess-${attempt}`);
      if (res.status === 429 && firstRefusal === null) firstRefusal = attempt;
    }
    expect(
      firstRefusal,
      "password guessing against one account was never refused",
    ).not.toBeNull();
    // Tighter than the twenty it used to take, and counted per account rather
    // than per address, so more connections do not buy more attempts.
    expect(firstRefusal).toBeLessThanOrEqual(11);
  });

  it("says which limit was reached", async () => {
    const email = "target2@school.test";
    let body: unknown = null;
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const res = await signIn(email, `guess-${attempt}`);
      if (res.status === 429) {
        body = res.body;
        break;
      }
    }
    expect(body).toMatchObject({ error: expect.stringContaining("this account") });
  });
});
