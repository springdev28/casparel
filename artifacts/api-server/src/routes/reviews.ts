import { Router, type IRouter } from "express";
import { contentLimiter } from "../lib/limiters";
import { eq, and } from "drizzle-orm";
import { db, reviewsTable, usersTable } from "@workspace/db";
import {
  ListResourceReviewsParams,
  ListResourceReviewsResponse,
  CreateResourceReviewParams,
  CreateResourceReviewBody,
  CreateResourceReviewResponse,
  DeleteResourceReviewParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { isReviewOwner } from "../lib/authz";

const router: IRouter = Router();

// GET /resources/:id/reviews — public
router.get("/resources/:id/reviews", async (req, res): Promise<void> => {
  const params = ListResourceReviewsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.resourceId, params.data.id));
  const reviews = await Promise.all(
    rows.map(async (r) => {
      const [user] = await db
        .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, avatarUrl: usersTable.avatarUrl, bio: usersTable.bio, subjects: usersTable.subjects, gradeOrDept: usersTable.gradeOrDept })
        .from(usersTable)
        .where(eq(usersTable.id, r.userId));
      return { ...r, user };
    }),
  );
  res.json(ListResourceReviewsResponse.parse(reviews));
});

// POST /resources/:id/reviews — any authenticated user
router.post("/resources/:id/reviews", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = CreateResourceReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateResourceReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [review] = await db
    .insert(reviewsTable)
    .values({ ...parsed.data, resourceId: params.data.id, userId })
    .returning();
  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, avatarUrl: usersTable.avatarUrl, bio: usersTable.bio, subjects: usersTable.subjects, gradeOrDept: usersTable.gradeOrDept })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  res.status(201).json(CreateResourceReviewResponse.parse({ ...review, user }));
});

// DELETE /resources/:id/reviews/:reviewId — reviewer only
router.delete("/resources/:id/reviews/:reviewId", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = DeleteResourceReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isReviewOwner(params.data.reviewId, userId))) {
    res.status(403).json({ error: "Only the reviewer can delete this review" });
    return;
  }
  await db
    .delete(reviewsTable)
    .where(
      and(
        eq(reviewsTable.id, params.data.reviewId),
        eq(reviewsTable.resourceId, params.data.id),
      ),
    );
  res.sendStatus(204);
});

export default router;
