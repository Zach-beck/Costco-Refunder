import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { users, pushSubscriptions, NotificationPrefsSchema } from "@costco-refunder/shared";
import { db } from "../lib/db.js";
import { redis } from "../lib/redis.js";
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

  // Password reset request
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
      return reply.send({ success: true, message: "If that email exists, a reset link has been sent." });
    }

    const { nanoid } = await import("nanoid");
    const token = nanoid(32);

    // Store token in Redis with 1-hour TTL
    await redis.set(`reset:${token}`, user.id, "EX", 3600);

    const resetUrl = `${process.env.WEB_URL || "http://localhost:5173"}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    if (process.env.NODE_ENV !== "production" || !process.env.RESEND_API_KEY) {
      console.log(`\n[PASSWORD RESET] Link for ${email}:\n  ${resetUrl}\n`);
    } else {
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

  // Consume reset token and set new password
  app.post("/api/auth/reset-password", async (request, reply) => {
    const { token, email, newPassword } = request.body as {
      token: string;
      email: string;
      newPassword: string;
    };

    if (!token || !email || !newPassword) {
      return reply.status(400).send({ success: false, error: "Missing required fields" });
    }

    if (newPassword.length < 8) {
      return reply.status(400).send({ success: false, error: "Password must be at least 8 characters" });
    }

    // Verify token from Redis
    const userId = await redis.get(`reset:${token}`);
    if (!userId) {
      return reply.status(400).send({ success: false, error: "Invalid or expired reset token" });
    }

    // Verify email matches the user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.email !== email.toLowerCase()) {
      return reply.status(400).send({ success: false, error: "Invalid reset request" });
    }

    // Update password
    const newHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, userId));

    // Invalidate the token
    await redis.del(`reset:${token}`);

    reply.send({ success: true });
  });
}
