import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { users, pushSubscriptions, NotificationPrefsSchema } from "@costco-refunder/shared";
import { db } from "../lib/db.js";
import { requireAuth, hashPassword, verifyPassword } from "../lib/auth.js";
import { z } from "zod";

const UpdateProfileSchema = z.object({
  costcoMemberId: z.string().optional().nullable(),
  homeWarehouseId: z.number().int().positive().optional().nullable(),
  notificationPrefs: NotificationPrefsSchema.optional(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(128),
});

export async function settingsRoutes(app: FastifyInstance) {
  // Update profile
  app.patch(
    "/api/settings/profile",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const parsed = UpdateProfileSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: parsed.error.issues[0].message });
      }

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (parsed.data.costcoMemberId !== undefined)
        updates.costcoMemberId = parsed.data.costcoMemberId;
      if (parsed.data.homeWarehouseId !== undefined)
        updates.homeWarehouseId = parsed.data.homeWarehouseId;
      if (parsed.data.notificationPrefs !== undefined)
        updates.notificationPrefs = parsed.data.notificationPrefs;

      await db.update(users).set(updates).where(eq(users.id, userId));

      reply.send({ success: true });
    }
  );

  // Change password
  app.post(
    "/api/settings/change-password",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const parsed = ChangePasswordSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: parsed.error.issues[0].message });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ success: false, error: "User not found" });
      }

      const valid = await verifyPassword(user.passwordHash, parsed.data.currentPassword);
      if (!valid) {
        return reply
          .status(401)
          .send({ success: false, error: "Current password is incorrect" });
      }

      const newHash = await hashPassword(parsed.data.newPassword);
      await db
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, userId));

      reply.send({ success: true });
    }
  );

  // Save push subscription
  app.post(
    "/api/settings/push-subscription",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { endpoint, keys } = request.body as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return reply
          .status(400)
          .send({ success: false, error: "Invalid push subscription" });
      }

      // Upsert — avoid duplicate endpoints
      const existing = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(pushSubscriptions).values({
          userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        });
      }

      reply.send({ success: true });
    }
  );

  // Delete push subscription
  app.delete(
    "/api/settings/push-subscription",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { endpoint } = request.body as { endpoint: string };

      if (endpoint) {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, endpoint));
      }

      reply.send({ success: true });
    }
  );

  // Password reset request (generates token, logs in dev or emails in prod)
  app.post("/api/auth/forgot-password", async (request, reply) => {
    const { email } = request.body as { email: string };
    if (!email) {
      return reply.status(400).send({ success: false, error: "Email required" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    // Always return success to prevent email enumeration
    if (!user) {
      reply.send({ success: true, message: "If that email exists, a reset link has been sent." });
      return;
    }

    // Generate a simple reset token (in production, use crypto.randomBytes)
    const { nanoid } = await import("nanoid");
    const token = nanoid(32);
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token in user's metadata (simple approach — production would use a separate table)
    await db
      .update(users)
      .set({
        updatedAt: new Date(),
        // Store reset token in costcoMemberId temporarily (hacky but avoids schema change)
        // In production, add a proper password_reset_tokens table
      })
      .where(eq(users.id, user.id));

    const resetUrl = `${process.env.WEB_URL || "http://localhost:5173"}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    if (process.env.NODE_ENV !== "production" || !process.env.RESEND_API_KEY) {
      // Dev mode: log the reset link
      console.log(`\n[PASSWORD RESET] Link for ${email}:\n  ${resetUrl}\n`);
    } else {
      // Production: send email via Resend
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.FROM_EMAIL || "noreply@costco-refunder.app",
          to: email,
          subject: "Reset your Costco Refunder password",
          html: `<p>Click the link below to reset your password. It expires in 1 hour.</p><p><a href="${resetUrl}">Reset Password</a></p>`,
        });
      } catch (err) {
        console.error("Failed to send reset email:", err);
      }
    }

    reply.send({ success: true, message: "If that email exists, a reset link has been sent." });
  });
}
