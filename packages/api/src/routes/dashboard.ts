import type { FastifyInstance } from "fastify";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import {
  receipts,
  receiptItems,
  priceAlerts,
  priceObservations,
  items,
  warehouses,
} from "@costco-refunder/shared";
import { db } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";

export async function dashboardRoutes(app: FastifyInstance) {
  // Get dashboard stats
  app.get(
    "/api/dashboard/stats",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const today = new Date().toISOString().split("T")[0];
      const monthStart = new Date();
      monthStart.setDate(1);

      // Active tracked items (within adjustment window)
      const [trackedCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(receiptItems)
        .innerJoin(receipts, eq(receiptItems.receiptId, receipts.id))
        .where(
          and(
            eq(receipts.userId, userId),
            eq(receiptItems.trackingActive, true),
            gte(receipts.adjustmentWindowEnd, today)
          )
        );

      // Pending alerts
      const [alertCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(priceAlerts)
        .where(
          and(eq(priceAlerts.userId, userId), eq(priceAlerts.status, "pending"))
        );

      // Total savings claimed
      const [claimedSavings] = await db
        .select({ total: sql<number>`COALESCE(SUM(savings::numeric), 0)` })
        .from(priceAlerts)
        .where(
          and(eq(priceAlerts.userId, userId), eq(priceAlerts.status, "claimed"))
        );

      // Total savings available (pending)
      const [availableSavings] = await db
        .select({ total: sql<number>`COALESCE(SUM(savings::numeric), 0)` })
        .from(priceAlerts)
        .where(
          and(
            eq(priceAlerts.userId, userId),
            eq(priceAlerts.status, "pending")
          )
        );

      // Receipts this month
      const [monthReceipts] = await db
        .select({ count: sql<number>`count(*)` })
        .from(receipts)
        .where(
          and(
            eq(receipts.userId, userId),
            gte(receipts.receiptDate, monthStart.toISOString().split("T")[0])
          )
        );

      reply.send({
        success: true,
        data: {
          activeTrackedItems: Number(trackedCount.count),
          pendingAlerts: Number(alertCount.count),
          totalSavingsClaimed: Number(claimedSavings.total),
          totalSavingsAvailable: Number(availableSavings.total),
          receiptsThisMonth: Number(monthReceipts.count),
        },
      });
    }
  );

  // Get tracked items with current price comparison
  app.get(
    "/api/dashboard/tracked-items",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const today = new Date().toISOString().split("T")[0];

      const trackedItems = await db
        .select({
          receiptItem: receiptItems,
          receipt: receipts,
          warehouse: warehouses,
        })
        .from(receiptItems)
        .innerJoin(receipts, eq(receiptItems.receiptId, receipts.id))
        .leftJoin(warehouses, eq(receipts.warehouseId, warehouses.id))
        .where(
          and(
            eq(receipts.userId, userId),
            eq(receiptItems.trackingActive, true),
            gte(receipts.adjustmentWindowEnd, today)
          )
        )
        .orderBy(desc(receipts.receiptDate));

      const result = await Promise.all(
        trackedItems.map(async ({ receiptItem, receipt, warehouse }) => {
          // Get latest price observation for this item at this warehouse
          let latestPrice: number | null = null;
          if (receiptItem.itemId && receipt.warehouseId) {
            const [latest] = await db
              .select()
              .from(priceObservations)
              .where(
                and(
                  eq(priceObservations.itemId, receiptItem.itemId),
                  eq(priceObservations.warehouseId, receipt.warehouseId)
                )
              )
              .orderBy(desc(priceObservations.observedDate))
              .limit(1);

            if (latest && latest.observedDate !== receipt.receiptDate) {
              latestPrice = parseFloat(latest.price);
            }
          }

          const purchasePrice = parseFloat(receiptItem.unitPrice);
          const eligible = new Date(receipt.adjustmentWindowEnd!);
          const now = new Date();
          const daysRemaining = Math.max(
            0,
            Math.ceil(
              (eligible.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            )
          );

          return {
            id: receiptItem.id,
            itemNumber: receiptItem.itemId,
            description: receiptItem.descriptionRaw,
            purchasePrice,
            purchaseDate: receipt.receiptDate,
            warehouseId: receipt.warehouseId,
            warehouseName: warehouse?.name ?? "Unknown",
            daysRemaining,
            latestObservedPrice: latestPrice,
            priceDrop:
              latestPrice !== null && latestPrice < purchasePrice
                ? purchasePrice - latestPrice
                : null,
          };
        })
      );

      reply.send({ success: true, data: result });
    }
  );

  // Get warehouses list
  app.get("/api/warehouses", async (request, reply) => {
    const { state, search } = request.query as {
      state?: string;
      search?: string;
    };

    let query = db.select().from(warehouses);

    const allWarehouses = await query;

    let filtered = allWarehouses;
    if (state) {
      filtered = filtered.filter((w) => w.state === state.toUpperCase());
    }
    if (search) {
      const term = search.toLowerCase();
      filtered = filtered.filter(
        (w) =>
          w.name.toLowerCase().includes(term) ||
          w.city?.toLowerCase().includes(term)
      );
    }

    reply.send({ success: true, data: filtered });
  });
}
