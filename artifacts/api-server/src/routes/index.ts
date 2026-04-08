import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import membersRouter from "./members";
import grievancesRouter from "./grievances";
import announcementsRouter from "./announcements";
import dashboardRouter from "./dashboard";
import storageRouter from "./storage";
import documentsRouter from "./documents";
import authRouter from "./auth";
import anthropicRouter from "./anthropic/index";
import settingsRouter from "./settings";
import auditLogsRouter from "./audit-logs";
import grievanceNotesRouter from "./grievance-notes";
import memberPortalRouter from "./member-portal";
import meetingsRouter from "./meetings";
import pushRouter, { initVapid } from "./push";
import journalRouter from "./journal";
import grievanceTemplatesRouter from "./grievance-templates";
import justCauseRouter from "./just-cause";
import communicationsRouter from "./communications";
import disciplineRouter from "./discipline";
import statsRouter from "./stats";
import coverageRouter from "./coverage";
import pollsRouter from "./polls";
import onboardingRouter from "./onboarding";
import cbaInfoRouter from "./cba-info";
import accessRequestsRouter from "./access-requests";
import { requirePermission } from "../lib/permissions";

// Init VAPID keys after the DB startup chain completes
setTimeout(() => initVapid().catch(() => {}), 5000);

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
// access-requests: public POST (rate-limited) + admin GET/PATCH/DELETE (internal auth check)
router.use("/access-requests", accessRequestsRouter);

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

router.use(requireAuth);

router.use("/member-portal", memberPortalRouter);
router.use("/members", requirePermission("members.view"), membersRouter);
router.use("/grievances", requirePermission("grievances.view"), grievancesRouter);
router.use("/announcements", requirePermission("bulletins.view"), announcementsRouter);
router.use("/dashboard", dashboardRouter);
router.use(requirePermission("documents.view"), storageRouter);
router.use("/documents", requirePermission("documents.view"), documentsRouter);
router.use("/anthropic", anthropicRouter);
router.use("/settings", requirePermission("members.edit"), settingsRouter);
router.use("/audit-logs", requirePermission("members.edit"), auditLogsRouter);
router.use("/meetings", requirePermission("meetings.view"), meetingsRouter);
router.use("/push", pushRouter);
router.use("/grievances/:grievanceId/notes", requirePermission("grievances.view"), grievanceNotesRouter);

// Advanced steward features
router.use("/grievances/:grievanceId/journal", journalRouter);
router.use("/grievances/:grievanceId/just-cause", justCauseRouter);
router.use("/grievances/:grievanceId/communications", communicationsRouter);
router.use("/grievance-templates", grievanceTemplatesRouter);
router.use("/members/:memberId/discipline", disciplineRouter);
router.use("/members/:memberId/onboarding", onboardingRouter);
router.use("/stats", statsRouter);
router.use("/coverage", coverageRouter);
router.use("/polls", pollsRouter);
router.use("/cba-info", cbaInfoRouter);

export default router;
