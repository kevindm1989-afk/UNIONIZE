import { Router, type IRouter } from "express";
import healthRouter from "./health";
import membersRouter from "./members";
import grievancesRouter from "./grievances";
import announcementsRouter from "./announcements";
import dashboardRouter from "./dashboard";
import storageRouter from "./storage";
import documentsRouter from "./documents";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/members", membersRouter);
router.use("/grievances", grievancesRouter);
router.use("/announcements", announcementsRouter);
router.use("/dashboard", dashboardRouter);
router.use(storageRouter);
router.use("/documents", documentsRouter);

export default router;
