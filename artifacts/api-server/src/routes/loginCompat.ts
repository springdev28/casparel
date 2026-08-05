import { Router, type IRouter } from "express";
import { LoginBody, LoginResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
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

function toApiUser(row: LegacyUserRow) {
  const role = row.role === "admin" ? "admin" : row.role === "teacher" ? "teacher" : "student";
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

  try {
    const result = await pool.query<LegacyUserRow>(
      `SELECT id, email, password_hash, name, role, avatar_url, created_at
         FROM users
        WHERE email = $1
        LIMIT 1`,
      [email],
    );
    const row = result.rows[0];

    if (!row) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const user = toApiUser(row);
    const token = issueToken(user.id, user.role, user.activeRole);
    res.json(LoginResponse.parse({ user, token }));
  } catch (err) {
    logger.error({ err }, "Login failed");
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
