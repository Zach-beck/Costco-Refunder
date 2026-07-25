import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { parseReceiptImage } from "@costco-refunder/parser";
import {
  receipts,
  receiptItems,
  items,
  priceObservations,
} from "@costco-refunder/shared";
import { redis } from "../lib/redis.js";
import { db } from "../lib/db.js";
import { getObject } from "../lib/s3.js";

interface ParseReceiptJob {
  receiptId: string;
  imageKey: string;
  userId: string;
}

export const receiptWorker = new Worker<ParseReceiptJob>(
  "receipt-processing",
  async (job) => {
    const { receiptId, imageKey, userId } = job.data;

    // Mark as processing
    await db
      .update(receipts)
      .set({ parseStatus: "processing" })
      .where(eq(receipts.id, receiptId));

    try {
      // Download image from S3
      const imageBuffer = await getObject(imageKey);

      // Run the full parsing pipeline
      const parsed = await parseReceiptImage(imageBuffer);

      // Update receipt with parsed metadata
      const updates: Record<string, any> = {
        parseStatus: "complete",
        parseConfidence: parsed.overallConfidence,
        rawOcrText: parsed.rawText,
      };

      if (parsed.warehouseId) updates.warehouseId = parsed.warehouseId;
      if (parsed.receiptDate) updates.receiptDate = parsed.receiptDate;
      if (parsed.subtotal) updates.subtotal = parsed.subtotal.toString();
      if (parsed.tax) updates.tax = parsed.tax.toString();
      if (parsed.total) updates.total = parsed.total.toString();

      // Recalculate adjustment window if we got a date from parsing
      if (parsed.receiptDate) {
        const adjEnd = new Date(parsed.receiptDate);
        adjEnd.setDate(adjEnd.getDate() + 30);
        updates.adjustmentWindowEnd = adjEnd.toISOString().split("T")[0];
      }

      await db.update(receipts).set(updates).where(eq(receipts.id, receiptId));

      // Insert parsed items
      for (const item of parsed.items) {
        // Upsert into canonical items registry
        await db
          .insert(items)
          .values({
            id: item.itemNumber,
            description: item.description,
            firstSeen: parsed.receiptDate ?? new Date().toISOString().split("T")[0],
            lastSeen: parsed.receiptDate ?? new Date().toISOString().split("T")[0],
          })
          .onConflictDoNothing();

        // Insert receipt line item
        await db.insert(receiptItems).values({
          receiptId,
          itemId: item.itemNumber,
          descriptionRaw: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString(),
          totalPrice: item.totalPrice.toString(),
          isTaxable: item.isTaxable,
          ocrConfidence: item.confidence,
          isEligible: true,
          trackingActive: true,
        });

        // Record price observation (crowdsource contribution)
        if (parsed.warehouseId && parsed.receiptDate) {
          await db
            .insert(priceObservations)
            .values({
              itemId: item.itemNumber,
              warehouseId: parsed.warehouseId,
              price: item.unitPrice.toString(),
              observedDate: parsed.receiptDate,
              source: "receipt_upload",
              reportedBy: userId,
            })
            .onConflictDoNothing();
        }
      }

      return { itemCount: parsed.items.length, confidence: parsed.overallConfidence };
    } catch (error) {
      await db
        .update(receipts)
        .set({ parseStatus: "failed" })
        .where(eq(receipts.id, receiptId));

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

receiptWorker.on("failed", (job, err) => {
  console.error(`Receipt parsing failed for job ${job?.id}:`, err.message);
});

receiptWorker.on("completed", (job, result) => {
  console.log(
    `Receipt parsed: ${result.itemCount} items, confidence: ${(result.confidence * 100).toFixed(1)}%`
  );
});
