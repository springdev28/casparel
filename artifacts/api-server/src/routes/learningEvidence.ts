/**
 * @fileOverview API role: implements the Learning Evidence HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  classesTable,
  classMembersTable,
  learningEvidenceTable,
} from "@workspace/db";
import {
  CreateLearningEvidenceBody,
  CreateLearningEvidenceResponse,
  GetLearningSignalsResponse,
  ListLearningEvidenceQueryParams,
  ListLearningEvidenceResponse,
} from "@workspace/api-zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";
import { validationMessage } from "../lib/validationMessage";

const router: IRouter = Router();

router.get(
  "/learning-evidence",
  requireAuth,
  /**
   * The learner's own check-ins, newest first, bounded.
   *
   * This is the one listing here that grows without end. Goals, lists,
   * canvases and study sets are all capped by a plan, so their listings are
   * bounded by something a person cannot exceed; evidence is written once per
   * step somebody finishes, forever, and nothing was limiting it. The phone's
   * goal screen read every row a learner had ever recorded in order to draw
   * "checked in" beside three steps, over whatever connection they were on.
   *
   * So: a goal filter for the caller that wants one goal's marks, and a
   * ceiling for the caller that wants the recent picture. Both defaults keep
   * the old behaviour for a learner who has not been here a year.
   */
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const query = ListLearningEvidenceQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: validationMessage(query.error) });
      return;
    }
    const evidence = await db
      .select()
      .from(learningEvidenceTable)
      .where(
        and(
          eq(learningEvidenceTable.userId, userId),
          ...(query.data.goalId === undefined
            ? []
            : [eq(learningEvidenceTable.learningGoalId, query.data.goalId)]),
        ),
      )
      .orderBy(desc(learningEvidenceTable.createdAt))
      .limit(query.data.limit);
    res.json(ListLearningEvidenceResponse.parse(evidence));
  },
);

router.post(
  "/learning-evidence",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const body = CreateLearningEvidenceBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: validationMessage(body.error) });
      return;
    }
    const [evidence] = await db
      .insert(learningEvidenceTable)
      .values({
        ...body.data,
        userId,
        resourceId: body.data.resourceId ?? null,
        learningGoalId: body.data.learningGoalId ?? null,
        reflection: body.data.reflection ?? null,
        misconception: body.data.misconception ?? null,
      })
      .returning();
    res.status(201).json(CreateLearningEvidenceResponse.parse(evidence));
  },
);

router.get(
  "/learning-signals",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    if (userRole !== "teacher") {
      res.status(403).json({ error: "Teacher role required" });
      return;
    }
    const teacherClasses = await db
      .select({ id: classesTable.id })
      .from(classesTable)
      .where(eq(classesTable.teacherId, userId));
    const classIds = teacherClasses.map((item) => item.id);
    if (!classIds.length) {
      res.json(
        GetLearningSignalsResponse.parse({
          evidenceCount: 0,
          learnerCount: 0,
          averageUnderstanding: 0,
          signals: [],
        }),
      );
      return;
    }
    const members = await db
      .select({ userId: classMembersTable.userId })
      .from(classMembersTable)
      .where(inArray(classMembersTable.classId, classIds));
    const learnerIds = [
      ...new Set(
        members.map((item) => item.userId).filter((id) => id !== userId),
      ),
    ];
    if (!learnerIds.length) {
      res.json(
        GetLearningSignalsResponse.parse({
          evidenceCount: 0,
          learnerCount: 0,
          averageUnderstanding: 0,
          signals: [],
        }),
      );
      return;
    }
    const evidence = await db
      .select()
      .from(learningEvidenceTable)
      .where(inArray(learningEvidenceTable.userId, learnerIds));
    const byConcept = new Map<string, typeof evidence>();
    for (const item of evidence)
      byConcept.set(item.concept, [
        ...(byConcept.get(item.concept) ?? []),
        item,
      ]);
    const signals = [...byConcept.entries()]
      .map(([concept, items]) => {
        const misconceptionCounts = new Map<string, number>();
        for (const item of items)
          if (item.misconception)
            misconceptionCounts.set(
              item.misconception,
              (misconceptionCounts.get(item.misconception) ?? 0) + 1,
            );
        const commonMisconception =
          [...misconceptionCounts.entries()].sort(
            (a, b) => b[1] - a[1],
          )[0]?.[0] ?? null;
        return {
          concept,
          learnerCount: new Set(items.map((item) => item.userId)).size,
          averageUnderstanding: Number(
            (
              items.reduce((sum, item) => sum + item.understanding, 0) /
              items.length
            ).toFixed(1),
          ),
          stalledCount: new Set(
            items
              .filter((item) => item.understanding <= 1)
              .map((item) => item.userId),
          ).size,
          commonMisconception,
        };
      })
      .sort((a, b) => a.averageUnderstanding - b.averageUnderstanding);
    const averageUnderstanding = evidence.length
      ? Number(
          (
            evidence.reduce((sum, item) => sum + item.understanding, 0) /
            evidence.length
          ).toFixed(1),
        )
      : 0;
    res.json(
      GetLearningSignalsResponse.parse({
        evidenceCount: evidence.length,
        learnerCount: new Set(evidence.map((item) => item.userId)).size,
        averageUnderstanding,
        signals,
      }),
    );
  },
);

export default router;
