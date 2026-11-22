import { and, eq, gte } from "drizzle-orm";
import {
  ADJUSTMENT_WINDOW_DAYS,
  priceAlerts,
  priceObservations,
  receiptItems,
  receipts,
  warehouses,
} from "@costco-refunder/shared";
import { daysAgoIso } from "./dates.js";
import { db } from "./db.js";

export async function ensureWarehouse(id: number): Promise<void> {
  await db
    .insert(warehouses)
    .values({ id, name: `Warehouse #${id}` })
    .onConflictDoNothing();
}

export async function checkForAlerts(
  itemId: number,
  warehouseId: number,
  newPrice: number
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const trackedByUsers = await db
    .select({
      receiptItem: receiptItems,
      receipt: receipts,
    })
    .from(receiptItems)
    .innerJoin(receipts, eq(receiptItems.receiptId, receipts.id))
    .where(
      and(
        eq(receiptItems.itemId, itemId),
        eq(receiptItems.trackingActive, true),
        eq(receiptItems.isEligible, true),
        gte(receipts.adjustmentWindowEnd, today),
        eq(receipts.warehouseId, warehouseId)
      )
    );

  let created = 0;

  for (const { receiptItem, receipt } of trackedByUsers) {
    const originalPrice = parseFloat(receiptItem.unitPrice);
    if (newPrice >= originalPrice) continue;

    const [existing] = await db
      .select()
      .from(priceAlerts)
      .where(
        and(
          eq(priceAlerts.receiptItemId, receiptItem.id),
          eq(priceAlerts.status, "pending")
        )
      )
      .limit(1);

    if (existing) {
      if (newPrice < parseFloat(existing.newPrice)) {
        await db
          .update(priceAlerts)
          .set({
            newPrice: newPrice.toString(),
            savings: (originalPrice - newPrice).toString(),
          })
          .where(eq(priceAlerts.id, existing.id));
      }
      continue;
    }

    await db.insert(priceAlerts).values({
      userId: receipt.userId,
      receiptItemId: receiptItem.id,
      originalPrice: originalPrice.toString(),
      newPrice: newPrice.toString(),
      savings: (originalPrice - newPrice).toString(),
      eligibleUntil: receipt.adjustmentWindowEnd!,
    });
    created++;
  }

  return created;
}

export async function refreshAlertsForItem(
  itemId: number,
  warehouseId: number
): Promise<number> {
  const since = daysAgoIso(ADJUSTMENT_WINDOW_DAYS);
  const observations = await db
    .select()
    .from(priceObservations)
    .where(
      and(
        eq(priceObservations.itemId, itemId),
        eq(priceObservations.warehouseId, warehouseId),
        gte(priceObservations.observedDate, since)
      )
    );

  if (observations.length === 0) return 0;
  const lowest = Math.min(...observations.map((row) => parseFloat(row.price)));
  return checkForAlerts(itemId, warehouseId, lowest);
}
