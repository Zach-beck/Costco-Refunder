import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { receipts } from "@costco-refunder/shared";
import { redis } from "../lib/redis.js";
import { db } from "../lib/db.js";
import { processReceiptImageJob } from "../lib/process-image.js";

interface ParseReceiptJob {
  receiptId: string;
  imageKey: string;
  userId: string;
}

export const receiptWorker = new Worker<ParseReceiptJob>(
  "receipt-processing",
  async (job) => {
    const { receiptId, imageKey, userId } = job.data;

    await db
      .update(receipts)
      .set({ parseStatus: "processing" })
      .where(eq(receipts.id, receiptId));

    try {
      const result = await processReceiptImageJob(receiptId, imageKey, userId);
      return {
        itemCount: result.itemCount,
        confidence: 1,
        alertsCreated: result.alertsCreated,
      };
    } catch (error) {
      await db
        .update(receipts)
        .set({ parseStatus: "failed" })
        .where(eq(receipts.id, receiptId));
      throw error;
    }
  },
  {
    connection: redis as never,
    concurrency: 2,
  }
);

receiptWorker.on("failed", (job, err) => {
  console.error(`Receipt parsing failed for job ${job?.id}:`, err.message);
});

receiptWorker.on("completed", (job, result) => {
  console.log(
    `Receipt parsed: ${result.itemCount} items, alerts: ${result.alertsCreated}`
  );
});
