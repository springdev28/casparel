/**
 * @fileOverview API role: accepts browser support requests and exposes the encrypted queue to administrators.
 * System connection: implements the support operations declared in the OpenAPI contract.
 */
import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, supportRequestsTable } from "@workspace/db";
import {
  CreateSupportRequestBody,
  CreateSupportRequestResponse,
  GetSupportRequestsResponse,
  UpdateSupportRequestBody,
  UpdateSupportRequestParams,
  UpdateSupportRequestResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";
import { contentLimiter } from "../lib/limiters";
import { validationMessage } from "../lib/validationMessage";
import { decryptSupportValue, encryptSupportValue } from "../lib/supportEncryption";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function publicSupportRequest(row: typeof supportRequestsTable.$inferSelect) {
  return {
    id: row.id,
    category: row.category,
    email: decryptSupportValue("email", row.emailEncrypted),
    subject: decryptSupportValue("subject", row.subjectEncrypted),
    message: decryptSupportValue("message", row.messageEncrypted),
    device: row.deviceEncrypted ? decryptSupportValue("device", row.deviceEncrypted) : null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.post("/support/requests", contentLimiter, async (req, res): Promise<void> => {
  const parsed = CreateSupportRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }

  const { email, category, subject, message, device } = parsed.data;
  try {
    const [created] = await db
      .insert(supportRequestsTable)
      .values({
        category,
        emailEncrypted: encryptSupportValue("email", email.trim().toLowerCase()),
        subjectEncrypted: encryptSupportValue("subject", subject.trim()),
        messageEncrypted: encryptSupportValue("message", message.trim()),
        deviceEncrypted: device?.trim() ? encryptSupportValue("device", device.trim()) : null,
      })
      .returning({
        id: supportRequestsTable.id,
        status: supportRequestsTable.status,
        createdAt: supportRequestsTable.createdAt,
      });
    res.status(201).json(CreateSupportRequestResponse.parse(created));
  } catch (error) {
    logger.error({ err: error }, "Support request could not be stored");
    res.status(503).json({ error: "Support requests are temporarily unavailable. Please try again." });
  }
});

router.get("/admin/support-requests", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(supportRequestsTable)
      .orderBy(desc(supportRequestsTable.createdAt))
      .limit(200);
    res.json(GetSupportRequestsResponse.parse(rows.map(publicSupportRequest)));
  } catch (error) {
    logger.error({ err: error }, "Support requests could not be read");
    res.status(500).json({ error: "Support requests could not be loaded" });
  }
});

router.patch("/admin/support-requests/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateSupportRequestParams.safeParse({ id: Number(req.params.id) });
  const body = UpdateSupportRequestBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: validationMessage(params.success ? body.error : params.error) });
    return;
  }

  const [updated] = await db
    .update(supportRequestsTable)
    .set({ status: body.data.status, updatedAt: new Date().toISOString() })
    .where(eq(supportRequestsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Support request not found" });
    return;
  }
  res.json(UpdateSupportRequestResponse.parse(publicSupportRequest(updated)));
});

export default router;
