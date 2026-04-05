import { Router } from "express";
import { db, documentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

function formatDocument(d: typeof documentsTable.$inferSelect) {
  return {
    id: d.id,
    title: d.title,
    description: d.description ?? null,
    filename: d.filename,
    objectPath: d.objectPath,
    contentType: d.contentType,
    fileSize: d.fileSize ?? null,
    isCurrent: d.isCurrent,
    effectiveDate: d.effectiveDate ?? null,
    expirationDate: d.expirationDate ?? null,
    notes: d.notes ?? null,
    uploadedAt: d.uploadedAt.toISOString(),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

router.get("/", async (_req, res) => {
  const docs = await db
    .select()
    .from(documentsTable)
    .orderBy(desc(documentsTable.uploadedAt));
  res.json(docs.map(formatDocument));
});

router.post("/", async (req, res) => {
  const { title, description, filename, objectPath, contentType, fileSize, isCurrent, effectiveDate, expirationDate, notes } = req.body;

  if (!title || !filename || !objectPath || !contentType) {
    res.status(400).json({ error: "Missing required fields: title, filename, objectPath, contentType" });
    return;
  }

  if (isCurrent) {
    await db.update(documentsTable).set({ isCurrent: false, updatedAt: new Date() });
  }

  const [doc] = await db
    .insert(documentsTable)
    .values({
      title,
      description: description ?? null,
      filename,
      objectPath,
      contentType,
      fileSize: fileSize ?? null,
      isCurrent: isCurrent ?? true,
      effectiveDate: effectiveDate ?? null,
      expirationDate: expirationDate ?? null,
      notes: notes ?? null,
    })
    .returning();

  res.status(201).json(formatDocument(doc));
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatDocument(doc));
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { title, description, isCurrent, effectiveDate, expirationDate, notes } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (isCurrent !== undefined) updates.isCurrent = isCurrent;
  if (effectiveDate !== undefined) updates.effectiveDate = effectiveDate;
  if (expirationDate !== undefined) updates.expirationDate = expirationDate;
  if (notes !== undefined) updates.notes = notes;

  const [doc] = await db.update(documentsTable).set(updates).where(eq(documentsTable.id, id)).returning();
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatDocument(doc));
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  await db.delete(documentsTable).where(eq(documentsTable.id, id));
  res.status(204).end();
});

export default router;
