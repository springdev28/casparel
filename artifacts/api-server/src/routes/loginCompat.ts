import { Router, type IRouter } from "express";
import { LoginBody, LoginResponse } from "@workspace/api-zod";
import { pool, runMigrations } from "@workspace/db";
import { issueToken, verifyPassword } from "../lib/auth";
import { logger } from "../lib/logger";

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
};

function databaseErrorCode(err: unknown): string {
  const error = err as DatabaseError;
  const message = error?.message?.toLowerCase() ?? "";

  switch (error?.code) {
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
      return "DATABASE_NETWORK";
    default:
      if (
        message.includes("certificate") ||
        message.includes("self-signed") ||
        message.includes("ssl")
      ) {
        return "DATABASE_TLS";
      }
      return "DATABASE_QUERY";
  }
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
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  let row: LegacyUserRow | undefined;

  try {
    row = await findUserWithSchemaRecovery(email);
  } catch (err) {
    const code = databaseErrorCode(err);
    logger.error({ err, code }, "Login database query failed");
    res.status(503).json({
      error: "Database unavailable",
      code,
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

    const user = toApiUser(row);
    const token = issueToken(user.id, user.role, user.activeRole);
    res.json(LoginResponse.parse({ user, token }));
  } catch (err) {
    logger.error({ err }, "Login credential verification failed");
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
