import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";
import { asyncHandler } from "../lib/asyncHandler";

const router: IRouter = Router();

router.get("/healthz", asyncHandler(async (_req, res) => {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    res.json(HealthCheckResponse.parse({ status: "ok" }));
  } finally {
    client.release();
  }
}));

export default router;
