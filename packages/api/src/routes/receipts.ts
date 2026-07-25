import type { FastifyInstance } from "fastify";
import { eq, and, gte, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  receipts,
  receiptItems,
  items,
  priceObservations,
  ADJUSTMENT_WINDOW_DAYS,
} from "@costco-refunder/shared";
import { db } from "../lib/db.js";
import { getUploadUrl, getDownloadUrl } from "../lib/s3.js";
import { requireAuth } from "../lib/auth.js";
import { receiptQueue } from "../workers/queues.js";

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

      // Queue the receipt for OCR + parsing
      await receiptQueue.add("parse-receipt", {
        receiptId: receipt.id,
        imageKey,
        userId,
      });

      reply.status(201).send({ success: true, data: receipt });
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
        data: { ...receipt, items: parsedItems },
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

      reply.send({ success: true, data: userReceipts });
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
      const { itemId } = request.params as { itemId: string };

      await db
        .update(receiptItems)
        .set({ trackingActive: false })
        .where(eq(receiptItems.id, itemId));

      reply.send({ success: true });
    }
  );
}
