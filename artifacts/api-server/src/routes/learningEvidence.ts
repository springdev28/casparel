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
  learningGoalsTable,
} from "@workspace/db";
import {
  CreateLearningEvidenceBody,
  CreateLearningEvidenceResponse,
  GetLearningSignalsResponse,
  ListLearningEvidenceResponse,
} from "@workspace/api-zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";

const router: IRouter = Router();

function matchesEvidenceIdentity(
  evidence: {
    learningGoalId: number | null;
    pathStepId: string | null;
    concept: string;
  },
  input: {
    learningGoalId?: number | null;
    pathStepId?: string | null;
    concept: string;
  },
) {
  return evidence.learningGoalId === (input.learningGoalId ?? null) &&
    evidence.pathStepId === (input.pathStepId ?? null) &&
    evidence.concept === input.concept;
}

router.get(
  "/learning-evidence",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const evidence = await db
      .select()
      .from(learningEvidenceTable)
      .where(eq(learningEvidenceTable.userId, userId))
      .orderBy(desc(learningEvidenceTable.createdAt));
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
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (body.data.pathStepId && !body.data.learningGoalId) {
      res.status(400).json({ error: "A path step requires a learning goal" });
      return;
    }
    if (body.data.learningGoalId !== null && body.data.learningGoalId !== undefined) {
      const [ownedGoal] = await db
        .select({ id: learningGoalsTable.id, pathSteps: learningGoalsTable.pathSteps })
        .from(learningGoalsTable)
        .where(
          and(
            eq(learningGoalsTable.id, body.data.learningGoalId),
            eq(learningGoalsTable.userId, userId),
          ),
        );
      if (!ownedGoal) {
        res.status(403).json({ error: "Learning goal access required" });
        return;
      }
      if (
        body.data.pathStepId &&
        !ownedGoal.pathSteps.some((step) => step.id === body.data.pathStepId)
      ) {
        res.status(400).json({ error: "Learning path step not found" });
        return;
      }
    }
    if (body.data.clientSubmissionId) {
      const [existing] = await db
        .select()
        .from(learningEvidenceTable)
        .where(
          and(
            eq(learningEvidenceTable.userId, userId),
            eq(learningEvidenceTable.clientSubmissionId, body.data.clientSubmissionId),
          ),
        );
      if (existing) {
        if (!matchesEvidenceIdentity(existing, body.data)) {
          res.status(409).json({ error: "Submission key already belongs to different evidence" });
          return;
        }
        res.json(CreateLearningEvidenceResponse.parse(existing));
        return;
      }
    }
    const [evidence] = await db
      .insert(learningEvidenceTable)
      .values({
        ...body.data,
        userId,
        resourceId: body.data.resourceId ?? null,
        learningGoalId: body.data.learningGoalId ?? null,
        pathStepId: body.data.pathStepId ?? null,
        studyDurationSeconds: body.data.studyDurationSeconds ?? null,
        clientSubmissionId: body.data.clientSubmissionId ?? null,
        reflection: body.data.reflection ?? null,
        misconception: body.data.misconception ?? null,
      })
      .onConflictDoNothing({
        target: [learningEvidenceTable.userId, learningEvidenceTable.clientSubmissionId],
      })
      .returning();
    if (evidence) {
      res.status(201).json(CreateLearningEvidenceResponse.parse(evidence));
      return;
    }

    // A concurrent retry can win after the initial lookup. Read the canonical
    // record so both callers receive the same evidence instead of a false error.
    if (!body.data.clientSubmissionId) {
      res.status(409).json({ error: "Evidence could not be recorded; please retry" });
      return;
    }
    const [concurrentEvidence] = await db
      .select()
      .from(learningEvidenceTable)
      .where(
        and(
          eq(learningEvidenceTable.userId, userId),
          eq(learningEvidenceTable.clientSubmissionId, body.data.clientSubmissionId),
        ),
      );
    if (concurrentEvidence) {
      if (!matchesEvidenceIdentity(concurrentEvidence, body.data)) {
        res.status(409).json({ error: "Submission key already belongs to different evidence" });
        return;
      }
      res.json(CreateLearningEvidenceResponse.parse(concurrentEvidence));
      return;
    }
    res.status(409).json({ error: "Evidence could not be recorded; retry with the same submission" });
  },
);

router.get(
  "/learning-signals",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, educatorEnabled } = req as AuthenticatedRequest;
    if (!educatorEnabled) {
      res.status(403).json({ error: "Educator capability is required" });
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
