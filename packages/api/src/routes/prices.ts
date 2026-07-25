import type { FastifyInstance } from "fastify";
import { eq, and, desc, gte } from "drizzle-orm";
import {
  priceObservations,
  priceAlerts,
  receiptItems,
  receipts,
  items,
  warehouses,
  ManualPriceEntrySchema,
} from "@costco-refunder/shared";
import { db } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";

export async function priceRoutes(app: FastifyInstance) {
  // Submit a manual price observation ("I spotted a lower price")
  app.post(
    "/api/prices/report",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const parsed = ManualPriceEntrySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: parsed.error.issues[0].message });
      }

      const { itemId, warehouseId, price, observedDate } = parsed.data;

      // Ensure item exists
      const [existingItem] = await db
        .select()
        .from(items)
        .where(eq(items.id, itemId))
        .limit(1);

      if (!existingItem) {
        return reply
          .status(404)
          .send({ success: false, error: "Item not found. Upload a receipt containing this item first." });
      }

      const [observation] = await db
        .insert(priceObservations)
        .values({
          itemId,
          warehouseId,
          price: price.toString(),
          observedDate,
          source: "manual_entry",
          reportedBy: userId,
        })
        .returning();

      // Check if this creates any alerts for other users
      await checkForAlerts(itemId, warehouseId, price);

      reply.status(201).send({ success: true, data: observation });
    }
  );

  // Get price history for an item
  app.get(
    "/api/prices/:itemId/history",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { itemId } = request.params as { itemId: string };
      const { warehouseId, days = "90" } = request.query as {
        warehouseId?: string;
        days?: string;
      };

      const since = new Date();
      since.setDate(since.getDate() - parseInt(days));

      let query = db
        .select()
        .from(priceObservations)
        .where(
          and(
            eq(priceObservations.itemId, parseInt(itemId)),
            gte(priceObservations.observedDate, since.toISOString().split("T")[0])
          )
        )
        .orderBy(desc(priceObservations.observedDate));

      const observations = await query;

      reply.send({ success: true, data: observations });
    }
  );

  // Get user's price alerts
  app.get(
    "/api/alerts",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { status = "pending" } = request.query as { status?: string };

      const alerts = await db
        .select({
          alert: priceAlerts,
          item: receiptItems,
          warehouse: warehouses,
        })
        .from(priceAlerts)
        .innerJoin(receiptItems, eq(priceAlerts.receiptItemId, receiptItems.id))
        .innerJoin(receipts, eq(receiptItems.receiptId, receipts.id))
        .leftJoin(warehouses, eq(receipts.warehouseId, warehouses.id))
        .where(
          and(
            eq(priceAlerts.userId, userId),
            eq(priceAlerts.status, status as any)
          )
        )
        .orderBy(desc(priceAlerts.createdAt));

      const formatted = alerts.map((row) => {
        const now = new Date();
        const eligible = new Date(row.alert.eligibleUntil);
        const daysRemaining = Math.max(
          0,
          Math.ceil((eligible.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        );

        return {
          id: row.alert.id,
          itemDescription: row.item.descriptionRaw,
          itemNumber: row.item.itemId,
          originalPrice: parseFloat(row.alert.originalPrice),
          newPrice: parseFloat(row.alert.newPrice),
          savings: parseFloat(row.alert.savings),
          eligibleUntil: row.alert.eligibleUntil,
          daysRemaining,
          status: row.alert.status,
          warehouseName: row.warehouse?.name ?? "Unknown",
        };
      });

      reply.send({ success: true, data: formatted });
    }
  );

  // Mark alert as claimed
  app.patch(
    "/api/alerts/:id/claim",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { id } = request.params as { id: string };

      const [alert] = await db
        .select()
        .from(priceAlerts)
        .where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)))
        .limit(1);

      if (!alert) {
        return reply
          .status(404)
          .send({ success: false, error: "Alert not found" });
      }

      await db
        .update(priceAlerts)
        .set({ status: "claimed", claimedAt: new Date() })
        .where(eq(priceAlerts.id, id));

      reply.send({ success: true });
    }
  );

  // Dismiss alert
  app.patch(
    "/api/alerts/:id/dismiss",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { id } = request.params as { id: string };

      await db
        .update(priceAlerts)
        .set({ status: "dismissed" })
        .where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)));

      reply.send({ success: true });
    }
  );

  // Get reimbursement guide for an alert
  app.get(
    "/api/alerts/:id/guide",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { id } = request.params as { id: string };

      const [result] = await db
        .select({
          alert: priceAlerts,
          item: receiptItems,
          receipt: receipts,
          warehouse: warehouses,
        })
        .from(priceAlerts)
        .innerJoin(receiptItems, eq(priceAlerts.receiptItemId, receiptItems.id))
        .innerJoin(receipts, eq(receiptItems.receiptId, receipts.id))
        .leftJoin(warehouses, eq(receipts.warehouseId, warehouses.id))
        .where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)))
        .limit(1);

      if (!result) {
        return reply
          .status(404)
          .send({ success: false, error: "Alert not found" });
      }

      const now = new Date();
      const eligible = new Date(result.alert.eligibleUntil);
      const daysRemaining = Math.max(
        0,
        Math.ceil((eligible.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );

      const quantity = result.item.quantity ?? 1;
      const savings = parseFloat(result.alert.savings) * quantity;

      const guide = {
        itemDescription: result.item.descriptionRaw,
        itemNumber: result.item.itemId,
        purchaseDate: result.receipt.receiptDate,
        deadline: result.alert.eligibleUntil,
        daysRemaining,
        originalPrice: parseFloat(result.alert.originalPrice),
        newPrice: parseFloat(result.alert.newPrice),
        expectedRefund: savings,
        quantity,
        warehouseName: result.warehouse?.name ?? "Unknown",
        warehouseId: result.receipt.warehouseId,
        steps: [
          {
            stepNumber: 1,
            title: "Gather your info",
            description: `Item #${result.item.itemId} — "${result.item.descriptionRaw}". Purchased on ${result.receipt.receiptDate} for $${result.alert.originalPrice}. Current price: $${result.alert.newPrice}.`,
            actionType: "info",
          },
          {
            stepNumber: 2,
            title: "Visit the Membership Counter",
            description: `Go to ${result.warehouse?.name ?? "your Costco warehouse"} and visit the Membership/Returns counter. Bring your Costco membership card. No receipt needed — they can look it up by membership number.`,
            actionType: "visit",
          },
          {
            stepNumber: 3,
            title: "Or call Costco",
            description: `Call 1-800-774-2678. Reference item #${result.item.itemId}, purchased on ${result.receipt.receiptDate}. Request a price adjustment to the current price of $${result.alert.newPrice}.`,
            actionType: "call",
          },
          {
            stepNumber: 4,
            title: "Expected refund",
            description: `$${result.alert.originalPrice} - $${result.alert.newPrice} = $${result.alert.savings} per unit × ${quantity} = $${savings.toFixed(2)} total refund to your original payment method.`,
            actionType: "info",
          },
          {
            stepNumber: 5,
            title: "Deadline",
            description: `You must request this adjustment by ${result.alert.eligibleUntil} (${daysRemaining} days remaining). We recommend claiming at least 2 days before the deadline.`,
            actionType: "info",
          },
        ],
      };

      reply.send({ success: true, data: guide });
    }
  );
}

// ─── Internal helper: check if new price observation triggers alerts ─────────

async function checkForAlerts(
  itemId: number,
  warehouseId: number,
  newPrice: number
) {
  const today = new Date().toISOString().split("T")[0];

  // Find all users tracking this item at this warehouse within their window
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

  for (const { receiptItem, receipt } of trackedByUsers) {
    const originalPrice = parseFloat(receiptItem.unitPrice);
    if (newPrice >= originalPrice) continue;

    // Check if alert already exists
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
      // Update if new price is even lower
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

    // Create new alert
    await db.insert(priceAlerts).values({
      userId: receipt.userId,
      receiptItemId: receiptItem.id,
      originalPrice: originalPrice.toString(),
      newPrice: newPrice.toString(),
      savings: (originalPrice - newPrice).toString(),
      eligibleUntil: receipt.adjustmentWindowEnd!,
    });
  }
}
