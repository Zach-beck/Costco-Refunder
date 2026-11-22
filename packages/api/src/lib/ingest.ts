import { eq } from "drizzle-orm";
import {
  ADJUSTMENT_WINDOW_DAYS,
  items,
  priceObservations,
  receiptItems,
  receipts,
} from "@costco-refunder/shared";
import {
  addDaysIso,
  checkItemEligibility,
  parseReceiptText,
  redactReceiptText,
} from "@costco-refunder/parser/text";
import type { ParsedReceipt } from "@costco-refunder/shared";
import { refreshAlertsForItem, ensureWarehouse } from "./alerts.js";
import { db } from "./db.js";

export async function persistParsedReceipt(input: {
  userId: string;
  parsed: ParsedReceipt;
  imageKey: string;
  receiptId?: string;
  warehouseIdOverride?: number | null;
  receiptDateOverride?: string | null;
}): Promise<{
  receiptId: string;
  itemCount: number;
  eligibleCount: number;
  alertsCreated: number;
}> {
  const parsed = input.parsed;
  const receiptDate =
    input.receiptDateOverride ||
    parsed.receiptDate ||
    new Date().toISOString().slice(0, 10);
  const warehouseId = input.warehouseIdOverride ?? parsed.warehouseId ?? null;
  const adjustmentWindowEnd = addDaysIso(receiptDate, ADJUSTMENT_WINDOW_DAYS);
  const rawText = redactReceiptText(parsed.rawText);

  if (warehouseId) await ensureWarehouse(warehouseId);

  const values = {
    warehouseId,
    receiptDate,
    imageUrl: input.imageKey,
    subtotal: parsed.subtotal?.toString() ?? null,
    tax: parsed.tax?.toString() ?? null,
    total: parsed.total?.toString() ?? null,
    parseStatus: "complete" as const,
    parseConfidence: parsed.overallConfidence,
    rawOcrText: rawText,
    adjustmentWindowEnd,
  };

  let receiptId = input.receiptId;
  if (receiptId) {
    await db.update(receipts).set(values).where(eq(receipts.id, receiptId));
    await db.delete(receiptItems).where(eq(receiptItems.receiptId, receiptId));
  } else {
    const [created] = await db
      .insert(receipts)
      .values({
        userId: input.userId,
        ...values,
      })
      .returning();
    receiptId = created.id;
  }

  let eligibleCount = 0;
  const seenItems = new Set<number>();

  for (const item of parsed.items) {
    const eligibility = checkItemEligibility(item, receiptDate);
    if (eligibility.isEligible) eligibleCount++;

    await db
      .insert(items)
      .values({
        id: item.itemNumber,
        description: item.description,
        firstSeen: receiptDate,
        lastSeen: receiptDate,
      })
      .onConflictDoNothing();

    await db.insert(receiptItems).values({
      receiptId,
      itemId: item.itemNumber,
      descriptionRaw: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
      totalPrice: item.totalPrice.toString(),
      isTaxable: item.isTaxable,
      ocrConfidence: item.confidence,
      isEligible: eligibility.isEligible,
      trackingActive: eligibility.isEligible,
    });

    if (eligibility.isEligible && warehouseId) {
      await db.insert(priceObservations).values({
        itemId: item.itemNumber,
        warehouseId,
        price: item.unitPrice.toString(),
        observedDate: receiptDate,
        source: "receipt_upload",
        reportedBy: input.userId,
        verified: false,
      });
      seenItems.add(item.itemNumber);
    }
  }

  let alertsCreated = 0;
  if (warehouseId) {
    for (const itemId of seenItems) {
      alertsCreated += await refreshAlertsForItem(itemId, warehouseId);
    }
  }

  return {
    receiptId,
    itemCount: parsed.items.length,
    eligibleCount,
    alertsCreated,
  };
}

export async function ingestReceiptText(input: {
  userId: string;
  text: string;
  imageKey?: string;
  warehouseId?: number | null;
  receiptDate?: string | null;
}) {
  const parsed = parseReceiptText(input.text);
  return persistParsedReceipt({
    userId: input.userId,
    parsed,
    imageKey: input.imageKey || "text:pasted",
    warehouseIdOverride: input.warehouseId,
    receiptDateOverride: input.receiptDate,
  });
}
