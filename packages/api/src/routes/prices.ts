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
} from "@receipt-rewind/shared";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePriceCatalogCsv, parsePublicPriceHtml } from "@receipt-rewind/parser/text";
import { db } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { checkForAlerts, ensureWarehouse } from "../lib/alerts.js";
import { asDateString, daysAgoIso } from "../lib/dates.js";
import { repoRoot } from "../lib/paths.js";

async function importPriceContent(
  userId: string,
  input: {
    format?: "csv" | "html";
    content: string;
    warehouseId?: number;
    observedDate?: string;
  }
) {
  const today = new Date().toISOString().slice(0, 10);
  const format =
    input.format || (/<article|<table|<tr/i.test(input.content) ? "html" : "csv");
  const defaults = {
    warehouseId: input.warehouseId ?? null,
    observedDate: input.observedDate || today,
  };
  const catalog =
    format === "html"
      ? parsePublicPriceHtml(input.content, defaults)
      : parsePriceCatalogCsv(input.content, defaults);

  let imported = 0;
  let alertsCreated = 0;
  let skipped = 0;

  for (const price of catalog) {
    // Alerts here are for warehouse receipts. Online prices (a saved costco.com
    // page) and per-pound prices never count against a warehouse purchase.
    if (price.channel === "online" || price.unit === "lb") {
      skipped++;
      continue;
    }
    // A warehouse price needs its own warehouse number. A blank never matches.
    const warehouseId = price.warehouseId ?? input.warehouseId ?? null;
    if (!warehouseId) {
      skipped++;
      continue;
    }
    const observedDate = price.observedDate || defaults.observedDate || today;
    await ensureWarehouse(warehouseId);
    await db
      .insert(items)
      .values({
        id: price.itemNumber,
        description: price.description || null,
        firstSeen: observedDate,
        lastSeen: observedDate,
      })
      .onConflictDoNothing();

    await db.insert(priceObservations).values({
      itemId: price.itemNumber,
      warehouseId,
      price: price.price.toString(),
      observedDate,
      source: format === "html" ? "public_page" : "catalog_import",
      reportedBy: userId,
      verified: true,
    });
    imported++;
    alertsCreated += await checkForAlerts(price.itemNumber, warehouseId, price.price);
  }

  return { imported, alertsCreated, skipped };
}

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
          eligibleUntil: asDateString(row.alert.eligibleUntil),
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
        purchaseDate: asDateString(result.receipt.receiptDate),
        deadline: asDateString(result.alert.eligibleUntil),
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
            description: `Item #${result.item.itemId}, "${result.item.descriptionRaw}". Purchased on ${asDateString(result.receipt.receiptDate)} for $${result.alert.originalPrice}. Current price: $${result.alert.newPrice}.`,
            actionType: "info",
          },
          {
            stepNumber: 2,
            title: "Visit the Returns counter",
            description: `Go to the Returns counter at ${result.warehouse?.name ?? "the Costco warehouse"} (#${result.receipt.warehouseId}), where you bought it. Bring your membership card. Costco can look the purchase up from the card. This app does not contact Costco.`,
            actionType: "visit",
          },
          {
            stepNumber: 3,
            title: "Costco decides",
            description: `Ask for a price match on item #${result.item.itemId}, purchased on ${asDateString(result.receipt.receiptDate)}, to the current price of $${result.alert.newPrice}. Costco decides every request. Costco.com orders use the Request a Price Match form on Costco's help site instead.`,
            actionType: "info",
          },
          {
            stepNumber: 4,
            title: "Possible price match",
            description: `$${result.alert.originalPrice} - $${result.alert.newPrice} = $${result.alert.savings} per unit × ${quantity} = $${savings.toFixed(2)} possible price match. Costco decides every claim.`,
            actionType: "info",
          },
          {
            stepNumber: 5,
            title: "Deadline",
            description: `Ask by ${asDateString(result.alert.eligibleUntil)} (${daysRemaining} days remaining). Claiming a couple of days before the deadline leaves room if the counter is busy.`,
            actionType: "info",
          },
        ],
      };

      reply.send({ success: true, data: guide });
    }
  );

  app.post(
    "/api/prices/import",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const body = request.body as {
        format?: "csv" | "html";
        content?: string;
        warehouseId?: number;
        observedDate?: string;
      };

      if (!body?.content || !body.content.trim()) {
        return reply.status(400).send({ success: false, error: "content is required" });
      }

      const result = await importPriceContent(userId, {
        format: body.format,
        content: body.content,
        warehouseId: body.warehouseId,
        observedDate: body.observedDate,
      });
      reply.send({ success: true, data: result });
    }
  );

  app.post(
    "/api/prices/sample",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const csv = readFileSync(join(repoRoot(), "fixtures/public-prices.csv"), "utf8");
      const observedDate = daysAgoIso(1);
      const shifted = csv
        .split(/\r?\n/)
        .map((line, index) => {
          if (index === 0 || !line.trim()) return line;
          const cells = line.split(",");
          if (cells.length >= 5) cells[4] = observedDate;
          return cells.join(",");
        })
        .join("\n");

      const result = await importPriceContent(userId, {
        format: "csv",
        content: shifted,
        observedDate,
      });
      reply.send({ success: true, data: result });
    }
  );
}
