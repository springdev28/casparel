/**
 * @fileOverview Backend domain role: centralizes Auth logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
/**
 * Auth helpers, password hashing (scrypt) and JWT-style signed tokens
 * using only Node built-ins so no extra packages are needed.
 */
import crypto from "node:crypto";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable must be set");
}
const SECRET = process.env.SESSION_SECRET;
if (Buffer.byteLength(SECRET, "utf8") < 32) {
  throw new Error("SESSION_SECRET must be at least 32 bytes long");
}

// ── Password hashing ─────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err);
      else resolve(`${salt}:${derived.toString("hex")}`);
    });
  });
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const match = /^([0-9a-f]{32}):([0-9a-f]{128})$/i.exec(stored);
  if (!match) return false;

  return new Promise((resolve, reject) => {
    const [, salt, hash] = match;
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err);
      else {
        const expected = Buffer.from(hash, "hex");
        resolve(
          expected.length === derived.length &&
            crypto.timingSafeEqual(expected, derived),
        );
      }
    });
  });
}

// ── Token signing/verification ───────────────────────────────────────────────

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface TokenPayload {
  userId: number;
  role: string;
  accountRole: string;
  iat: number;
  exp: number;
}

const VALID_ROLES = new Set(["student", "teacher", "admin"]);

function isTokenPayload(value: unknown): value is TokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<TokenPayload>;
  return (
    Number.isSafeInteger(payload.userId) &&
    Number(payload.userId) > 0 &&
    typeof payload.role === "string" &&
    VALID_ROLES.has(payload.role) &&
    typeof payload.accountRole === "string" &&
    VALID_ROLES.has(payload.accountRole) &&
    Number.isSafeInteger(payload.iat) &&
    Number.isSafeInteger(payload.exp) &&
    Number(payload.exp) > Number(payload.iat) &&
    Number(payload.iat) <= Date.now() + 5 * 60 * 1000 &&
    Number(payload.exp) <= Number(payload.iat) + TOKEN_TTL_MS
  );
}

function sign(payload: TokenPayload): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verify(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const parsedHeader = JSON.parse(
      Buffer.from(header, "base64url").toString(),
    ) as { alg?: unknown; typ?: unknown };
    if (
      parsedHeader.alg !== "HS256" ||
      (parsedHeader.typ !== undefined && parsedHeader.typ !== "JWT")
    ) {
      return null;
    }
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");
    const suppliedSignature = Buffer.from(sig);
    const expectedSignature = Buffer.from(expected);
    if (
      suppliedSignature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(suppliedSignature, expectedSignature)
    ) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!isTokenPayload(payload) || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function issueToken(
  userId: number,
  accountRole: string,
  activeRole?: string,
): string {
  const now = Date.now();
  // Administrator is an account permission, never a workspace. Historical
  // rows briefly stored activeRole=admin; tokens must still expose only the
  // student/teacher view selected by the product contract.
  const role = activeRole === "teacher"
    ? "teacher"
    : activeRole === "student"
      ? "student"
      : accountRole === "teacher"
        ? "teacher"
        : "student";
  return sign({ userId, role, accountRole, iat: now, exp: now + TOKEN_TTL_MS });
}

export function decodeToken(token: string): TokenPayload | null {
  return verify(token);
}
