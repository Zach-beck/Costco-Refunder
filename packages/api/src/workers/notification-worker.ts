import { Worker } from "bullmq";
import { eq, and } from "drizzle-orm";
import {
  priceAlerts,
  receiptItems,
  receipts,
  users,
  pushSubscriptions,
  warehouses,
} from "@costco-refunder/shared";
import { redis } from "../lib/redis.js";
import { db } from "../lib/db.js";

// Conditional imports — these may not be configured in all environments
let webpush: typeof import("web-push") | null = null;
let resend: any = null;

try {
  webpush = await import("web-push");
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@costco-refunder.app",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }
} catch {}

try {
  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import("resend");
    resend = new Resend(process.env.RESEND_API_KEY);
  }
} catch {}

interface NotificationJob {
  alertId: string;
  userId: string;
}

export const notificationWorker = new Worker<NotificationJob>(
  "notifications",
  async (job) => {
    const { alertId, userId } = job.data;

    // Fetch alert details
    const [result] = await db
      .select({
        alert: priceAlerts,
        item: receiptItems,
        receipt: receipts,
        user: users,
        warehouse: warehouses,
      })
      .from(priceAlerts)
      .innerJoin(receiptItems, eq(priceAlerts.receiptItemId, receiptItems.id))
      .innerJoin(receipts, eq(receiptItems.receiptId, receipts.id))
      .innerJoin(users, eq(priceAlerts.userId, users.id))
      .leftJoin(warehouses, eq(receipts.warehouseId, warehouses.id))
      .where(eq(priceAlerts.id, alertId))
      .limit(1);

    if (!result) return;

    const { alert, item, user, warehouse } = result;
    const prefs = user.notificationPrefs as { email: boolean; push: boolean };

    const title = `Price drop on ${item.descriptionRaw}!`;
    const body = `${item.descriptionRaw} dropped from $${alert.originalPrice} to $${alert.newPrice} at ${warehouse?.name ?? "Costco"}. Save $${alert.savings}!`;

    // Send push notification
    if (prefs.push && webpush) {
      const subscriptions = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify({
              title,
              body,
              data: { alertId, url: `/alerts/${alertId}` },
            })
          );
        } catch (err: any) {
          // Remove invalid subscriptions (410 Gone)
          if (err.statusCode === 410) {
            await db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.id, sub.id));
          }
        }
      }
    }

    // Send email notification
    if (prefs.email && resend && user.email) {
      try {
        await resend.emails.send({
          from: process.env.FROM_EMAIL || "alerts@costco-refunder.app",
          to: user.email,
          subject: title,
          html: buildEmailHtml({
            itemDescription: item.descriptionRaw ?? "",
            originalPrice: alert.originalPrice,
            newPrice: alert.newPrice,
            savings: alert.savings,
            warehouseName: warehouse?.name ?? "Costco",
            eligibleUntil: alert.eligibleUntil,
            alertId,
          }),
        });
      } catch (err) {
        console.error("Failed to send email:", err);
      }
    }

    // Mark alert as notified
    await db
      .update(priceAlerts)
      .set({ status: "notified", notifiedAt: new Date() })
      .where(eq(priceAlerts.id, alertId));
  },
  {
    connection: redis,
    concurrency: 5,
  }
);

function buildEmailHtml(data: {
  itemDescription: string;
  originalPrice: string;
  newPrice: string;
  savings: string;
  warehouseName: string;
  eligibleUntil: string;
  alertId: string;
}): string {
  const webUrl = process.env.WEB_URL || "http://localhost:5173";

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a1a;">Price Drop Alert</h2>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <h3 style="margin: 0 0 8px; color: #166534;">${data.itemDescription}</h3>
        <p style="margin: 0; font-size: 18px;">
          <span style="text-decoration: line-through; color: #666;">$${data.originalPrice}</span>
          &rarr;
          <strong style="color: #166534;">$${data.newPrice}</strong>
        </p>
        <p style="margin: 8px 0 0; color: #166534; font-weight: bold;">
          You save: $${data.savings}
        </p>
      </div>
      <p><strong>Location:</strong> ${data.warehouseName}</p>
      <p><strong>Claim by:</strong> ${data.eligibleUntil}</p>
      <div style="margin: 24px 0;">
        <a href="${webUrl}/alerts/${data.alertId}"
           style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
          View Refund Instructions
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #6b7280; font-size: 12px;">
        You're receiving this because you uploaded a receipt with this item to Costco Refunder.
        <a href="${webUrl}/settings">Manage notification preferences</a>
      </p>
    </div>
  `;
}

notificationWorker.on("failed", (job, err) => {
  console.error(`Notification failed for job ${job?.id}:`, err.message);
});
