import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  receipts,
  receiptItems,
  items,
  priceObservations,
  ADJUSTMENT_WINDOW_DAYS,
} from "@costco-refunder/shared";
import { db } from "../lib/db.js";
import { getUploadUrl, getDownloadUrl, putObject, readLocalObject } from "../lib/s3.js";
import { requireAuth } from "../lib/auth.js";
import { isLocalMode } from "../lib/mode.js";
import { ingestReceiptText } from "../lib/ingest.js";
import { processReceiptImageJob } from "../lib/process-image.js";
import { asDateString, daysAgoIso, isoToMdy } from "../lib/dates.js";
import { repoRoot } from "../lib/paths.js";

export async function receiptRoutes(app: FastifyInstance) {
  // Get presigned upload URL
  app.post(
    "/api/receipts/upload-url",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const key = `receipts/${userId}/${nanoid()}.png`;
      const uploadUrl = await getUploadUrl(key);

      reply.send({
        success: true,
        data: { uploadUrl, imageKey: key },
      });
    }
  );

  // Create receipt and queue for parsing
  app.post(
    "/api/receipts",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { imageKey, receiptDate, warehouseId } = request.body as {
        imageKey: string;
        receiptDate?: string;
        warehouseId?: number;
      };

      if (!imageKey) {
        return reply
          .status(400)
          .send({ success: false, error: "imageKey is required" });
      }

      const adjustmentEnd = new Date();
      if (receiptDate) {
        adjustmentEnd.setTime(new Date(receiptDate).getTime());
      }
      adjustmentEnd.setDate(adjustmentEnd.getDate() + ADJUSTMENT_WINDOW_DAYS);

      const [receipt] = await db
        .insert(receipts)
        .values({
          userId,
          warehouseId: warehouseId ?? null,
          receiptDate: receiptDate || new Date().toISOString().split("T")[0],
          imageUrl: imageKey,
          parseStatus: "pending",
          adjustmentWindowEnd: adjustmentEnd.toISOString().split("T")[0],
        })
        .returning();

      if (isLocalMode()) {
        try {
          await processReceiptImageJob(receipt.id, imageKey, userId);
        } catch (error) {
          await db
            .update(receipts)
            .set({ parseStatus: "failed" })
            .where(eq(receipts.id, receipt.id));
          request.log.error(error);
        }
      } else {
        const { receiptQueue } = await import("../workers/queues.js");
        await receiptQueue.add("parse-receipt", {
          receiptId: receipt.id,
          imageKey,
          userId,
        });
      }

      const [stored] = await db
        .select()
        .from(receipts)
        .where(eq(receipts.id, receipt.id))
        .limit(1);

      reply.status(201).send({ success: true, data: presentReceipt(stored ?? receipt) });
    }
  );

  // Get receipt status and parsed items
  app.get(
    "/api/receipts/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { id } = request.params as { id: string };

      const [receipt] = await db
        .select()
        .from(receipts)
        .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
        .limit(1);

      if (!receipt) {
        return reply
          .status(404)
          .send({ success: false, error: "Receipt not found" });
      }

      const parsedItems = await db
        .select()
        .from(receiptItems)
        .where(eq(receiptItems.receiptId, id));

      reply.send({
        success: true,
        data: { ...presentReceipt(receipt), items: parsedItems },
      });
    }
  );

  // List user's receipts
  app.get(
    "/api/receipts",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { page = "1", limit = "20" } = request.query as {
        page?: string;
        limit?: string;
      };

      const offset = (parseInt(page) - 1) * parseInt(limit);

      const userReceipts = await db
        .select()
        .from(receipts)
        .where(eq(receipts.userId, userId))
        .orderBy(desc(receipts.createdAt))
        .limit(parseInt(limit))
        .offset(offset);

      reply.send({
        success: true,
        data: userReceipts.map((row) => presentReceipt(row)),
      });
    }
  );

  // Update parsed items (user corrections)
  app.patch(
    "/api/receipts/:id/items",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { id } = request.params as { id: string };
      const { corrections } = request.body as {
        corrections: Array<{
          itemId: string;
          itemNumber?: number;
          description?: string;
          unitPrice?: number;
          quantity?: number;
          trackingActive?: boolean;
        }>;
      };

      // Verify ownership
      const [receipt] = await db
        .select()
        .from(receipts)
        .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
        .limit(1);

      if (!receipt) {
        return reply
          .status(404)
          .send({ success: false, error: "Receipt not found" });
      }

      for (const correction of corrections) {
        const updates: Record<string, any> = {};
        if (correction.itemNumber !== undefined)
          updates.itemId = correction.itemNumber;
        if (correction.description !== undefined)
          updates.descriptionRaw = correction.description;
        if (correction.unitPrice !== undefined)
          updates.unitPrice = correction.unitPrice.toString();
        if (correction.quantity !== undefined)
          updates.quantity = correction.quantity;
        if (correction.trackingActive !== undefined)
          updates.trackingActive = correction.trackingActive;

        if (Object.keys(updates).length > 0) {
          await db
            .update(receiptItems)
            .set(updates)
            .where(eq(receiptItems.id, correction.itemId));
        }

        // Upsert into items table and create price observation
        if (correction.itemNumber && receipt.warehouseId) {
          await db
            .insert(items)
            .values({
              id: correction.itemNumber,
              description: correction.description,
              firstSeen: receipt.receiptDate,
              lastSeen: receipt.receiptDate,
            })
            .onConflictDoNothing();

          await db
            .insert(priceObservations)
            .values({
              itemId: correction.itemNumber,
              warehouseId: receipt.warehouseId,
              price: (correction.unitPrice ?? 0).toString(),
              observedDate: receipt.receiptDate,
              source: "receipt_upload",
              reportedBy: userId,
            })
            .onConflictDoNothing();
        }
      }

      reply.send({ success: true });
    }
  );

  // Confirm receipt parsing (finalize and start tracking)
  app.post(
    "/api/receipts/:id/confirm",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { id } = request.params as { id: string };

      const [receipt] = await db
        .select()
        .from(receipts)
        .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
        .limit(1);

      if (!receipt) {
        return reply
          .status(404)
          .send({ success: false, error: "Receipt not found" });
      }

      // Get all tracked items and create price observations
      const trackedItems = await db
        .select()
        .from(receiptItems)
        .where(
          and(
            eq(receiptItems.receiptId, id),
            eq(receiptItems.trackingActive, true)
          )
        );

      for (const item of trackedItems) {
        if (item.itemId && receipt.warehouseId) {
          // Ensure item exists in canonical registry
          await db
            .insert(items)
            .values({
              id: item.itemId,
              description: item.descriptionRaw,
              firstSeen: receipt.receiptDate,
              lastSeen: receipt.receiptDate,
            })
            .onConflictDoNothing();

          // Record price observation
          await db
            .insert(priceObservations)
            .values({
              itemId: item.itemId,
              warehouseId: receipt.warehouseId,
              price: item.unitPrice,
              observedDate: receipt.receiptDate,
              source: "receipt_upload",
              reportedBy: userId,
            })
            .onConflictDoNothing();
        }
      }

      await db
        .update(receipts)
        .set({ parseStatus: "complete" })
        .where(eq(receipts.id, id));

      reply.send({
        success: true,
        data: { trackedItemCount: trackedItems.length },
      });
    }
  );

  // Get presigned URL to view the original receipt image
  app.get(
    "/api/receipts/:id/image",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { id } = request.params as { id: string };

      const [receipt] = await db
        .select()
        .from(receipts)
        .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
        .limit(1);

      if (!receipt) {
        return reply
          .status(404)
          .send({ success: false, error: "Receipt not found" });
      }

      if (receipt.imageUrl.startsWith("text:")) {
        return reply
          .status(404)
          .send({ success: false, error: "This receipt was pasted as text and has no photo." });
      }

      const imageUrl = await getDownloadUrl(receipt.imageUrl);
      reply.send({ success: true, data: { imageUrl } });
    }
  );

  // Delete a receipt and all its items
  app.delete(
    "/api/receipts/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { id } = request.params as { id: string };

      const [receipt] = await db
        .select()
        .from(receipts)
        .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
        .limit(1);

      if (!receipt) {
        return reply
          .status(404)
          .send({ success: false, error: "Receipt not found" });
      }

      // Cascade delete handles receipt_items via FK
      await db.delete(receipts).where(eq(receipts.id, id));
      reply.send({ success: true });
    }
  );

  // Stop tracking a specific item
  app.patch(
    "/api/receipts/items/:itemId/stop-tracking",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { itemId } = request.params as { itemId: string };

      // Verify ownership
      const [item] = await db
        .select({ id: receiptItems.id })
        .from(receiptItems)
        .innerJoin(receipts, eq(receiptItems.receiptId, receipts.id))
        .where(and(eq(receiptItems.id, itemId), eq(receipts.userId, userId)))
        .limit(1);

      if (!item) {
        return reply.status(404).send({ success: false, error: "Item not found" });
      }

      await db
        .update(receiptItems)
        .set({ trackingActive: false })
        .where(eq(receiptItems.id, itemId));

      reply.send({ success: true });
    }
  );

  app.post(
    "/api/receipts/text",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const body = request.body as {
        text?: string;
        warehouseId?: number;
        receiptDate?: string;
      };
      if (!body?.text || !body.text.trim()) {
        return reply.status(400).send({ success: false, error: "text is required" });
      }
      const result = await ingestReceiptText({
        userId,
        text: body.text,
        warehouseId: body.warehouseId,
        receiptDate: body.receiptDate,
      });
      reply.status(201).send({ success: true, data: result });
    }
  );

  app.post(
    "/api/receipts/sample",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const purchaseDate = daysAgoIso(10);
      const text = readFileSync(join(repoRoot(), "fixtures/sample-receipt.txt"), "utf8").replace(
        /\d{1,2}\/\d{1,2}\/\d{2,4}/,
        isoToMdy(purchaseDate)
      );
      const result = await ingestReceiptText({
        userId,
        text,
        imageKey: "text:sample",
        receiptDate: purchaseDate,
      });
      reply.status(201).send({ success: true, data: result });
    }
  );

  app.put(
    "/api/local-uploads",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!isLocalMode()) {
        return reply.status(404).send({ success: false, error: "Not found" });
      }
      const key = (request.query as { key?: string }).key;
      if (!key || !Buffer.isBuffer(request.body)) {
        return reply.status(400).send({ success: false, error: "Upload key and body are required" });
      }
      await putObject(key, request.body as Buffer);
      reply.send({ success: true });
    }
  );

  app.get(
    "/api/local-files",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const key = (request.query as { key?: string }).key;
      if (!key || key.startsWith("text:")) {
        return reply.status(404).send({ success: false, error: "No image for this receipt" });
      }
      try {
        const body = readLocalObject(key);
        const type = key.endsWith(".png")
          ? "image/png"
          : key.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg";
        reply.header("content-type", type).send(body);
      } catch {
        reply.status(404).send({ success: false, error: "File not found" });
      }
    }
  );
}

function presentReceipt<T extends { receiptDate: unknown; adjustmentWindowEnd: unknown }>(
  row: T
) {
  return {
    ...row,
    receiptDate: asDateString(row.receiptDate),
    adjustmentWindowEnd: asDateString(row.adjustmentWindowEnd),
  };
}
