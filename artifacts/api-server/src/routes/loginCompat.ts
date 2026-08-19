import { Router, type IRouter } from "express";
import { LoginBody, LoginResponse } from "@workspace/api-zod";
import { pool, runMigrations } from "@workspace/db";
import { issueToken, verifyPassword } from "../lib/auth";
import { isAllowlistedAdminEmail } from "../lib/adminAccess";
import { logger } from "../lib/logger";
import { validationMessage } from "../lib/validationMessage";

const router: IRouter = Router();

type LegacyUserRow = {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: "student" | "teacher" | "admin";
  avatar_url: string | null;
  created_at: string | Date;
};

type DatabaseError = Error & {
  code?: string;
  cause?: unknown;
  errors?: unknown[];
};

type DatabaseDiagnostic = {
  code: string;
  message: string;
};

function collectDatabaseErrors(err: unknown): DatabaseError[] {
  const collected: DatabaseError[] = [];
  const pending: unknown[] = [err];
  const seen = new Set<unknown>();

  while (pending.length > 0 && collected.length < 8) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || seen.has(current)) {
      continue;
    }

    seen.add(current);
    const error = current as DatabaseError;
    collected.push(error);

    if (error.cause) pending.push(error.cause);
    if (Array.isArray(error.errors)) pending.push(...error.errors);
  }

  return collected;
}

function sanitizeDatabaseMessage(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[database-url-redacted]")
    .replace(/user\s+"[^"]+"/gi, 'user "[redacted]"')
    .replace(/password\s*=\s*\S+/gi, "password=[redacted]")
    .slice(0, 500);
}

function databaseDiagnostics(err: unknown): DatabaseDiagnostic[] {
  return collectDatabaseErrors(err).map((error) => ({
    code: error.code ?? error.name ?? "UNKNOWN",
    message: sanitizeDatabaseMessage(error.message ?? "Unknown database error"),
  }));
}

function databaseErrorCode(err: unknown): string {
  const errors = collectDatabaseErrors(err);
  const messages = errors.map((error) => error.message?.toLowerCase() ?? "");

  for (const error of errors) {
    switch (error.code) {
      case "28P01":
        return "DATABASE_CREDENTIALS";
      case "3D000":
        return "DATABASE_NAME";
      case "42P01":
        return "DATABASE_SCHEMA";
      case "42501":
        return "DATABASE_PERMISSIONS";
      case "ENOTFOUND":
      case "EAI_AGAIN":
        return "DATABASE_HOST";
      case "ECONNREFUSED":
      case "ECONNRESET":
      case "ETIMEDOUT":
      case "ENETUNREACH":
        return "DATABASE_NETWORK";
    }
  }

  if (
    messages.some(
      (message) =>
        message.includes("certificate") ||
        message.includes("self-signed") ||
        message.includes("ssl"),
    )
  ) {
    return "DATABASE_TLS";
  }

  if (
    messages.some(
      (message) =>
        message.includes("timeout") ||
        message.includes("timed out") ||
        message.includes("connection terminated"),
    )
  ) {
    return "DATABASE_NETWORK";
  }

  return "DATABASE_QUERY";
}

async function findUser(email: string): Promise<LegacyUserRow | undefined> {
  const result = await pool.query<LegacyUserRow>(
    `SELECT id, email, password_hash, name, role, avatar_url, created_at
       FROM public.users
      WHERE email = $1
      LIMIT 1`,
    [email],
  );
  return result.rows[0];
}

async function findUserWithSchemaRecovery(
  email: string,
): Promise<LegacyUserRow | undefined> {
  try {
    return await findUser(email);
  } catch (err) {
    if ((err as DatabaseError)?.code !== "42P01") {
      throw err;
    }

    logger.warn("Users table is missing; retrying database migrations");
    await runMigrations();
    return findUser(email);
  }
}

function toApiUser(row: LegacyUserRow) {
  const role =
    row.role === "admin"
      ? "admin"
      : row.role === "teacher"
        ? "teacher"
        : "student";
  const activeRole = role === "teacher" ? "teacher" : "student";

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role,
    activeRole,
    avatarUrl: row.avatar_url,
    bio: null,
    subjects: null,
    gradeOrDept: null,
    timezone: null,
    websiteUrl: null,
    profileVisibility: "classmates" as const,
    libraryVisibility: "classmates" as const,
    showBio: true,
    showSubjects: true,
    showGradeOrDept: true,
    showWebsite: true,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  };
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }

  const { email, password } = parsed.data;
  let row: LegacyUserRow | undefined;

  try {
    row = await findUserWithSchemaRecovery(email);
  } catch (err) {
    const code = databaseErrorCode(err);
    const diagnostics = databaseDiagnostics(err);
    logger.error({ err, code }, "Login database query failed");
    console.error(
      "Login database query failed",
      JSON.stringify({ code, diagnostics }),
    );
    res.status(503).json({
      error: "Database unavailable",
      code,
      details: diagnostics.map((diagnostic) => diagnostic.code),
    });
    return;
  }

  if (!row) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  try {
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    if (row.role !== "admin" && isAllowlistedAdminEmail(row.email)) {
      await pool.query(
        `UPDATE public.users SET role = 'admin' WHERE id = $1`,
        [row.id],
      );
      row = { ...row, role: "admin" };
    }

    const user = toApiUser(row);
    const token = issueToken(user.id, user.role, user.activeRole);
    res.json(LoginResponse.parse({ user, token }));
  } catch (err) {
    logger.error({ err }, "Login credential verification failed");
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
