import { Worker } from "bullmq";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import {
  receiptItems,
  receipts,
  priceObservations,
  priceAlerts,
  PRICE_FRESHNESS_DAYS,
  MIN_OBSERVATIONS_FOR_ALERT,
} from "@costco-refunder/shared";
import { redis } from "../lib/redis.js";
import { db } from "../lib/db.js";
import { notificationQueue } from "./queues.js";

interface PriceCheckJob {
  type: "scheduled-check";
}

export const priceCheckerWorker = new Worker<PriceCheckJob>(
  "price-checking",
  async (job) => {
    const today = new Date().toISOString().split("T")[0];
    const freshnessDate = new Date();
    freshnessDate.setDate(freshnessDate.getDate() - PRICE_FRESHNESS_DAYS);
    const freshnessDateStr = freshnessDate.toISOString().split("T")[0];

    // Find all actively tracked items within their adjustment window
    const trackedItems = await db
      .select({
        receiptItem: receiptItems,
        receipt: receipts,
      })
      .from(receiptItems)
      .innerJoin(receipts, eq(receiptItems.receiptId, receipts.id))
      .where(
        and(
          eq(receiptItems.trackingActive, true),
          eq(receiptItems.isEligible, true),
          gte(receipts.adjustmentWindowEnd, today)
        )
      );

    let alertsCreated = 0;

    for (const { receiptItem, receipt } of trackedItems) {
      if (!receiptItem.itemId || !receipt.warehouseId) continue;

      const originalPrice = parseFloat(receiptItem.unitPrice);

      // Get recent price observations for this item at this warehouse
      const recentObservations = await db
        .select()
        .from(priceObservations)
        .where(
          and(
            eq(priceObservations.itemId, receiptItem.itemId),
            eq(priceObservations.warehouseId, receipt.warehouseId),
            gte(priceObservations.observedDate, freshnessDateStr)
          )
        )
        .orderBy(desc(priceObservations.observedDate));

      if (recentObservations.length === 0) continue;

      // Find the lowest observed price
      const lowestPrice = Math.min(
        ...recentObservations.map((o) => parseFloat(o.price))
      );

      if (lowestPrice >= originalPrice) continue;

      // Check confidence: need MIN_OBSERVATIONS_FOR_ALERT independent sources
      const lowPriceObservations = recentObservations.filter(
        (o) => parseFloat(o.price) <= lowestPrice + 0.01
      );

      const uniqueReporters = new Set(
        lowPriceObservations.map((o) => o.reportedBy)
      );

      // Single verified observation OR multiple independent reporters
      const isConfident =
        lowPriceObservations.some((o) => o.verified) ||
        uniqueReporters.size >= MIN_OBSERVATIONS_FOR_ALERT;

      if (!isConfident) continue;

      // Check if alert already exists
      const [existingAlert] = await db
        .select()
        .from(priceAlerts)
        .where(
          and(
            eq(priceAlerts.receiptItemId, receiptItem.id),
            eq(priceAlerts.status, "pending")
          )
        )
        .limit(1);

      if (existingAlert) {
        // Update if new price is lower
        if (lowestPrice < parseFloat(existingAlert.newPrice)) {
          await db
            .update(priceAlerts)
            .set({
              newPrice: lowestPrice.toString(),
              savings: (originalPrice - lowestPrice).toString(),
            })
            .where(eq(priceAlerts.id, existingAlert.id));
        }
        continue;
      }

      // Create new alert
      const [alert] = await db
        .insert(priceAlerts)
        .values({
          userId: receipt.userId,
          receiptItemId: receiptItem.id,
          originalPrice: originalPrice.toString(),
          newPrice: lowestPrice.toString(),
          savings: (originalPrice - lowestPrice).toString(),
          observationId: lowPriceObservations[0].id,
          eligibleUntil: receipt.adjustmentWindowEnd!,
          status: "pending",
        })
        .returning();

      alertsCreated++;

      // Queue notification
      await notificationQueue.add("send-alert", {
        alertId: alert.id,
        userId: receipt.userId,
      });
    }

    return { checked: trackedItems.length, alertsCreated };
  },
  {
    connection: redis,
    concurrency: 1,
  }
);

priceCheckerWorker.on("completed", (job, result) => {
  console.log(
    `Price check complete: ${result.checked} items checked, ${result.alertsCreated} alerts created`
  );
});

priceCheckerWorker.on("failed", (job, err) => {
  console.error("Price check failed:", err.message);
});
