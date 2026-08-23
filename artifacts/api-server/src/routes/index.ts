/**
 * @fileOverview API role: implements the Index HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import classesRouter from "./classes";
import resourcesRouter from "./resources";
import reviewsRouter from "./reviews";
import listsRouter from "./lists";
import scheduleRouter from "./schedule";
import studySessionsRouter from "./studySessions";
import dashboardRouter from "./dashboard";
import sourceReviewRouter from "./sourceReview";
import googleClassroomRouter from "./googleClassroom";
import calendarRouter from "./calendar";
import learningGoalsRouter from "./learningGoals";
import learningEvidenceRouter from "./learningEvidence";
import adminRouter from "./admin";
import forumRouter from "./forum";
import studyActivitiesRouter from "./studyActivities";
import learningWorkflowRouter from "./learningWorkflow";
import canvasesRouter from "./canvases";
import directMessagesRouter from "./directMessages";
import webhooksRouter from "./webhooks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(classesRouter);
router.use(resourcesRouter);
router.use(reviewsRouter);
router.use(listsRouter);
router.use(scheduleRouter);
router.use(studySessionsRouter);
router.use(dashboardRouter);
router.use(sourceReviewRouter);
router.use(googleClassroomRouter);
router.use(calendarRouter);
router.use(learningGoalsRouter);
router.use(learningEvidenceRouter);
router.use(adminRouter);
router.use(forumRouter);
router.use(studyActivitiesRouter);
router.use(learningWorkflowRouter);
router.use(canvasesRouter);
router.use(directMessagesRouter);
router.use(webhooksRouter);

export default router;
