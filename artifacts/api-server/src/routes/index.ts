import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import classesRouter from "./classes";
import resourcesRouter from "./resources";
import reviewsRouter from "./reviews";
import listsRouter from "./lists";
import scheduleRouter from "./schedule";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(classesRouter);
router.use(resourcesRouter);
router.use(reviewsRouter);
router.use(listsRouter);
router.use(scheduleRouter);
router.use(dashboardRouter);

export default router;
